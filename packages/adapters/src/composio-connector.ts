import { randomBytes } from "node:crypto";
import type {
  AdapterContext,
  ConnectorCall,
  ConnectorEvent,
  ConnectorProvider,
  ConnectorTool,
} from "@meshbot/adapter-kit";
import type { Prisma, PrismaClient } from "@meshbot/db";
import {
  AuthorizationServerMismatchError,
  Client,
  InsufficientScopeError,
  IssuerMismatchError,
  type OAuthClientMetadata,
  type OAuthClientProvider,
  type OAuthDiscoveryState,
  OAuthError,
  SdkHttpError,
  type StoredOAuthClientInformation,
  type StoredOAuthTokens,
  StreamableHTTPClientTransport,
  UnauthorizedError,
} from "@modelcontextprotocol/client";
import { DestinationEmulator } from "./destination-emulator.js";
import type { EncryptedSecretStore } from "./secrets.js";

const COMPOSIO_MCP_URL = new URL("https://connect.composio.dev/mcp");
const COMPOSIO_PROVIDER = "composio";
const COMPOSIO_SECRET_KIND = "composio-mcp-oauth";
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

export const COMPOSIO_META_TOOLS = [
  "COMPOSIO_SEARCH_TOOLS",
  "COMPOSIO_GET_TOOL_SCHEMAS",
  "COMPOSIO_MULTI_EXECUTE_TOOL",
  "COMPOSIO_MANAGE_CONNECTIONS",
  "COMPOSIO_WAIT_FOR_CONNECTIONS",
  "COMPOSIO_REMOTE_WORKBENCH",
  "COMPOSIO_REMOTE_BASH_TOOL",
] as const;
const COMPOSIO_META_TOOL_SET = new Set<string>(COMPOSIO_META_TOOLS);

const connectionSelect = {
  id: true,
  workspaceId: true,
  userId: true,
  provider: true,
  displayName: true,
  status: true,
  secretId: true,
  providerRef: true,
  metadata: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ConnectionSelect;

export type ComposioConnectionRecord = Prisma.ConnectionGetPayload<{
  select: typeof connectionSelect;
}>;

export type ComposioOAuthBundle = {
  version: 1;
  userId: string;
  workspaceId: string;
  clientInformation?: StoredOAuthClientInformation;
  tokens?: StoredOAuthTokens;
  codeVerifier?: string;
  discoveryState?: OAuthDiscoveryState;
};

export interface ComposioOAuthStore {
  current(context: AdapterContext): Promise<ComposioConnectionRecord | undefined>;
  reset(
    context: AdapterContext,
    state: string,
    stateExpiresAt: string,
  ): Promise<ComposioConnectionRecord>;
  pending(state: string): Promise<ComposioConnectionRecord | undefined>;
  claim(row: ComposioConnectionRecord, state: string): Promise<boolean>;
  readBundle(row: ComposioConnectionRecord): Promise<ComposioOAuthBundle>;
  writeBundle(row: ComposioConnectionRecord, bundle: ComposioOAuthBundle): Promise<void>;
  markConnected(row: ComposioConnectionRecord): Promise<void>;
  markDegraded(row: ComposioConnectionRecord): Promise<void>;
  markFailed(row: ComposioConnectionRecord): Promise<void>;
  revoke(connectionId: string, context: AdapterContext): Promise<void>;
}

export type ComposioMcpSession = {
  connect(): Promise<void>;
  finishAuth(params: URLSearchParams): Promise<void>;
  listTools(): Promise<{ tools: unknown[] }>;
  callTool(name: string, args: Record<string, unknown>): Promise<unknown>;
  close(): Promise<void>;
};

export type ComposioMcpSessionFactory = (
  provider: OAuthClientProvider,
  mode: "begin" | "callback" | "runtime",
) => ComposioMcpSession;

export class PrismaComposioOAuthStore implements ComposioOAuthStore {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly secrets: EncryptedSecretStore,
  ) {}

  async current(context: AdapterContext): Promise<ComposioConnectionRecord | undefined> {
    return (
      (await this.prisma.connection.findFirst({
        where: {
          workspaceId: context.workspaceId,
          userId: context.userId,
          provider: COMPOSIO_PROVIDER,
        },
        orderBy: { updatedAt: "desc" },
        select: connectionSelect,
      })) ?? undefined
    );
  }

  async reset(
    context: AdapterContext,
    state: string,
    stateExpiresAt: string,
  ): Promise<ComposioConnectionRecord> {
    const existing = await this.current(context);
    const bundle: ComposioOAuthBundle = {
      version: 1,
      userId: context.userId,
      workspaceId: context.workspaceId,
    };
    const encrypted = await this.secrets.put(JSON.stringify(bundle), context);
    return this.prisma.$transaction(async (tx) => {
      if (existing?.secretId) {
        await tx.secret.deleteMany({
          where: {
            id: existing.secretId,
            userId: context.userId,
            workspaceId: context.workspaceId,
          },
        });
      }
      const secret = await tx.secret.create({
        data: {
          id: encrypted.id,
          userId: context.userId,
          workspaceId: context.workspaceId,
          kind: COMPOSIO_SECRET_KIND,
          ciphertext: encrypted.ciphertext,
        },
      });
      if (existing) {
        return tx.connection.update({
          where: { id: existing.id },
          data: {
            displayName: "Composio",
            status: "pending",
            secretId: secret.id,
            providerRef: state,
            metadata: { stateExpiresAt },
          },
          select: connectionSelect,
        });
      }
      return tx.connection.create({
        data: {
          workspaceId: context.workspaceId,
          userId: context.userId,
          provider: COMPOSIO_PROVIDER,
          displayName: "Composio",
          status: "pending",
          secretId: secret.id,
          providerRef: state,
          metadata: { stateExpiresAt },
        },
        select: connectionSelect,
      });
    });
  }

  async pending(state: string): Promise<ComposioConnectionRecord | undefined> {
    return (
      (await this.prisma.connection.findFirst({
        where: { provider: COMPOSIO_PROVIDER, providerRef: state, status: "pending" },
        orderBy: { updatedAt: "desc" },
        select: connectionSelect,
      })) ?? undefined
    );
  }

  async claim(row: ComposioConnectionRecord, state: string): Promise<boolean> {
    const updated = await this.prisma.connection.updateMany({
      where: {
        id: row.id,
        workspaceId: row.workspaceId,
        userId: row.userId,
        provider: COMPOSIO_PROVIDER,
        status: "pending",
        secretId: row.secretId,
        providerRef: state,
      },
      data: { providerRef: null },
    });
    return updated.count === 1;
  }

  async readBundle(row: ComposioConnectionRecord): Promise<ComposioOAuthBundle> {
    if (!row.secretId) throw new ComposioCredentialError();
    const secret = await this.prisma.secret.findFirst({
      where: {
        id: row.secretId,
        userId: row.userId,
        workspaceId: row.workspaceId,
        kind: COMPOSIO_SECRET_KIND,
      },
    });
    if (!secret) throw new ComposioCredentialError();
    return parseComposioOAuthBundle(this.secrets.load(secret.ciphertext), row);
  }

  async writeBundle(row: ComposioConnectionRecord, bundle: ComposioOAuthBundle): Promise<void> {
    if (!row.secretId) throw new ComposioCredentialError();
    const context = adapterContext(row, "composio.oauth.persist");
    const encrypted = await this.secrets.put(JSON.stringify(bundle), context);
    const updated = await this.prisma.secret.updateMany({
      where: {
        id: row.secretId,
        userId: row.userId,
        workspaceId: row.workspaceId,
        kind: COMPOSIO_SECRET_KIND,
      },
      data: { ciphertext: encrypted.ciphertext },
    });
    if (updated.count !== 1) throw new ComposioCredentialError();
  }

  async markConnected(row: ComposioConnectionRecord): Promise<void> {
    const updated = await this.prisma.connection.updateMany({
      where: {
        id: row.id,
        workspaceId: row.workspaceId,
        userId: row.userId,
        provider: COMPOSIO_PROVIDER,
        status: "pending",
        secretId: row.secretId,
        providerRef: row.providerRef,
      },
      data: { status: "connected", providerRef: null, metadata: {} },
    });
    if (updated.count !== 1) throw new ComposioCredentialError();
  }

  async markDegraded(row: ComposioConnectionRecord): Promise<void> {
    await this.prisma.connection.updateMany({
      where: {
        id: row.id,
        workspaceId: row.workspaceId,
        userId: row.userId,
        provider: COMPOSIO_PROVIDER,
        status: row.status,
        secretId: row.secretId,
        providerRef: row.providerRef,
      },
      data: { status: "error" },
    });
  }

  async markFailed(row: ComposioConnectionRecord): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.connection.updateMany({
        where: {
          id: row.id,
          workspaceId: row.workspaceId,
          userId: row.userId,
          provider: COMPOSIO_PROVIDER,
          status: row.status,
          secretId: row.secretId,
          providerRef: row.providerRef,
        },
        data: {
          status: "error",
          secretId: null,
          providerRef: null,
          metadata: {},
        },
      });
      if (updated.count === 1 && row.secretId) {
        await tx.secret.deleteMany({
          where: { id: row.secretId, userId: row.userId, workspaceId: row.workspaceId },
        });
      }
    });
  }

  async revoke(connectionId: string, context: AdapterContext): Promise<void> {
    const row = await this.prisma.connection.findFirst({
      where: {
        id: connectionId,
        workspaceId: context.workspaceId,
        userId: context.userId,
        provider: COMPOSIO_PROVIDER,
      },
      select: connectionSelect,
    });
    if (!row) return;
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.connection.updateMany({
        where: {
          id: row.id,
          workspaceId: row.workspaceId,
          userId: row.userId,
          provider: COMPOSIO_PROVIDER,
          status: row.status,
          secretId: row.secretId,
          providerRef: row.providerRef,
        },
        data: {
          status: "revoked",
          secretId: null,
          providerRef: null,
          metadata: {},
        },
      });
      if (updated.count === 1 && row.secretId) {
        await tx.secret.deleteMany({
          where: { id: row.secretId, userId: row.userId, workspaceId: row.workspaceId },
        });
      }
    });
  }
}

export class PersistentComposioOAuthProvider implements OAuthClientProvider {
  private authorizationUrl: URL | undefined;

  constructor(
    private bundle: ComposioOAuthBundle,
    private readonly persist: (bundle: ComposioOAuthBundle) => Promise<void>,
    private readonly callbackUrl: string,
    private readonly oauthState?: string,
    private readonly interactive = false,
  ) {}

  get redirectUrl(): string {
    return this.callbackUrl;
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: "Mesh Bot",
      redirect_uris: [this.callbackUrl],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope: "openid profile email offline_access",
    };
  }

  state(): string {
    return this.oauthState ?? "";
  }

  clientInformation(): StoredOAuthClientInformation | undefined {
    return this.bundle.clientInformation;
  }

  async saveClientInformation(clientInformation: StoredOAuthClientInformation): Promise<void> {
    await this.save({ ...this.bundle, clientInformation });
  }

  tokens(): StoredOAuthTokens | undefined {
    return this.bundle.tokens;
  }

  async saveTokens(tokens: StoredOAuthTokens): Promise<void> {
    await this.save({ ...this.bundle, tokens });
  }

  redirectToAuthorization(authorizationUrl: URL): void {
    if (!this.interactive) throw new ComposioReconnectRequiredError();
    if (authorizationUrl.protocol !== "https:") throw new ComposioCredentialError();
    this.authorizationUrl = authorizationUrl;
  }

  async saveCodeVerifier(codeVerifier: string): Promise<void> {
    await this.save({ ...this.bundle, codeVerifier });
  }

  codeVerifier(): string {
    if (!this.bundle.codeVerifier) throw new ComposioCredentialError();
    return this.bundle.codeVerifier;
  }

  async saveDiscoveryState(discoveryState: OAuthDiscoveryState): Promise<void> {
    await this.save({ ...this.bundle, discoveryState });
  }

  discoveryState(): OAuthDiscoveryState | undefined {
    return this.bundle.discoveryState;
  }

  async invalidateCredentials(
    scope: "all" | "client" | "tokens" | "verifier" | "discovery",
  ): Promise<void> {
    const next = { ...this.bundle };
    if (scope === "all" || scope === "client") delete next.clientInformation;
    if (scope === "all" || scope === "tokens") delete next.tokens;
    if (scope === "all" || scope === "verifier") delete next.codeVerifier;
    if (scope === "all" || scope === "discovery") delete next.discoveryState;
    await this.save(next);
  }

  takeAuthorizationUrl(): string | undefined {
    return this.authorizationUrl?.toString();
  }

  private async save(bundle: ComposioOAuthBundle): Promise<void> {
    await this.persist(bundle);
    this.bundle = bundle;
  }
}

export class ComposioConnector implements ConnectorProvider {
  private readonly locks = new Map<string, Promise<void>>();
  private readonly sessionFactory: ComposioMcpSessionFactory;
  private readonly now: () => number;
  private readonly stateFactory: () => string;

  constructor(
    private readonly store: ComposioOAuthStore,
    private readonly callbackUrl: string,
    opts?: {
      sessionFactory?: ComposioMcpSessionFactory;
      now?: () => number;
      stateFactory?: () => string;
    },
  ) {
    this.sessionFactory = opts?.sessionFactory ?? createComposioMcpSession;
    this.now = opts?.now ?? Date.now;
    this.stateFactory = opts?.stateFactory ?? (() => randomBytes(32).toString("base64url"));
  }

  describe() {
    return {
      id: COMPOSIO_PROVIDER,
      contractVersion: "1",
      adapterVersion: "0.1.0",
      capabilities: { discover: true, oauth: true, secretsBrokered: true },
    };
  }

  async catalog(context: AdapterContext) {
    const row = await this.store.current(context);
    return [
      {
        slug: COMPOSIO_PROVIDER,
        name: "Composio",
        logo: null,
        connected: row?.status === "connected",
        noAuth: false,
      },
    ];
  }

  async begin(
    context: AdapterContext,
  ): Promise<{ connectionId: string; authorizationUrl: string }> {
    // ponytail: one durable API serializes first-connect creation; add a unique
    // (workspaceId, userId, provider) constraint before running API replicas.
    return this.withLock(context, async () => {
      const state = this.stateFactory();
      const row = await this.store.reset(
        context,
        state,
        new Date(this.now() + OAUTH_STATE_TTL_MS).toISOString(),
      );
      let session: ComposioMcpSession | undefined;
      try {
        const bundle = await this.store.readBundle(row);
        const provider = this.provider(row, bundle, state, true);
        session = this.sessionFactory(provider, "begin");
        await session.connect().catch((error: unknown) => {
          if (!provider.takeAuthorizationUrl()) throw error;
        });
        const authorizationUrl = provider.takeAuthorizationUrl();
        if (!authorizationUrl) throw new ComposioCredentialError();
        return { connectionId: row.id, authorizationUrl };
      } catch (error) {
        await this.store.markFailed(row);
        throw error;
      } finally {
        await session?.close().catch(() => undefined);
      }
    });
  }

  async completeCallback(params: URLSearchParams): Promise<void> {
    const state = params.get("state");
    if (!state) throw new InvalidComposioCallbackError();
    const candidate = await this.store.pending(state);
    if (!candidate) throw new InvalidComposioCallbackError();
    await this.withLock(adapterContext(candidate, "composio.oauth.callback"), async () => {
      const row = await this.store.pending(state);
      if (!row || !stateIsCurrent(row.metadata, this.now())) {
        throw new InvalidComposioCallbackError();
      }
      if (!(await this.store.claim(row, state))) throw new InvalidComposioCallbackError();
      const claimed = { ...row, providerRef: null };
      let session: ComposioMcpSession | undefined;
      try {
        const bundle = await this.store.readBundle(claimed);
        const provider = this.provider(claimed, bundle, undefined, false);
        session = this.sessionFactory(provider, "callback");
        await session.finishAuth(params);
        await provider.invalidateCredentials("verifier");
        await session.connect();
        const tools = asConnectorTools((await session.listTools()).tools);
        const names = new Set(tools.map((tool) => tool.name));
        if (COMPOSIO_META_TOOLS.some((name) => !names.has(name))) {
          throw new Error("Composio MCP tool set is incomplete");
        }
        await this.store.markConnected(claimed);
      } catch (error) {
        await this.store.markFailed(claimed);
        throw error;
      } finally {
        await session?.close().catch(() => undefined);
      }
    });
  }

  async discoverTools(context: AdapterContext): Promise<ConnectorTool[]> {
    if (!context.connectedProviders?.includes(COMPOSIO_PROVIDER)) return [];
    return this.withLock(context, async () => {
      const { row, session } = await this.runtimeSession(context);
      try {
        await session.connect();
        return asConnectorTools((await session.listTools()).tools);
      } catch (error) {
        if (isComposioAuthenticationFailure(error)) await this.store.markFailed(row);
        throw error;
      } finally {
        await session.close().catch(() => undefined);
      }
    });
  }

  async *execute(call: ConnectorCall, context: AdapterContext): AsyncIterable<ConnectorEvent> {
    if (!COMPOSIO_META_TOOL_SET.has(call.tool)) {
      yield { type: "error", message: "Composio tool is unavailable." };
      return;
    }
    if (!context.connectedProviders?.includes(COMPOSIO_PROVIDER)) {
      yield { type: "error", message: "Composio is not connected." };
      return;
    }
    try {
      const result = await this.withLock(context, async () => {
        const { row, session } = await this.runtimeSession(context);
        try {
          await session.connect();
          return await session.callTool(call.tool, call.args ?? {});
        } catch (error) {
          if (isComposioAuthenticationFailure(error)) await this.store.markFailed(row);
          throw error;
        } finally {
          await session.close().catch(() => undefined);
        }
      });
      if (isErrorToolResult(result)) {
        yield { type: "error", message: sanitizeComposioError(toolResultText(result)) };
        return;
      }
      yield { type: "result", data: sanitizePayload(result) };
    } catch (error) {
      yield {
        type: "error",
        message: isComposioAuthenticationFailure(error)
          ? "Composio sign-in expired. Reconnect Composio in Plugins."
          : sanitizeComposioError(error),
      };
    }
  }

  revoke(connectionId: string, context: AdapterContext): Promise<void> {
    return this.withLock(context, () => this.store.revoke(connectionId, context));
  }

  private provider(
    row: ComposioConnectionRecord,
    bundle: ComposioOAuthBundle,
    state?: string,
    interactive = false,
  ) {
    return new PersistentComposioOAuthProvider(
      bundle,
      (next) => this.store.writeBundle(row, next),
      this.callbackUrl,
      state,
      interactive,
    );
  }

  private async runtimeSession(context: AdapterContext) {
    const row = await this.store.current(context);
    if (row?.status !== "connected") throw new ComposioCredentialError();
    let bundle: ComposioOAuthBundle;
    try {
      bundle = await this.store.readBundle(row);
    } catch {
      await this.store.markDegraded(row);
      throw new ComposioReconnectRequiredError();
    }
    const provider = this.provider(row, bundle);
    return { row, session: this.sessionFactory(provider, "runtime") };
  }

  private async withLock<T>(context: AdapterContext, run: () => Promise<T>): Promise<T> {
    const key = `${context.workspaceId}:${context.userId}`;
    const previous = this.locks.get(key) ?? Promise.resolve();
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.then(() => gate);
    this.locks.set(key, tail);
    await previous;
    try {
      return await run();
    } finally {
      release();
      if (this.locks.get(key) === tail) this.locks.delete(key);
    }
  }
}

export class CompositeConnector implements ConnectorProvider {
  constructor(
    readonly destination: DestinationEmulator,
    readonly composio: ComposioConnector,
  ) {}

  describe() {
    return this.composio.describe();
  }

  async discoverTools(context: AdapterContext): Promise<ConnectorTool[]> {
    const dest = await this.destination.discoverTools(context);
    try {
      const extra = await this.composio.discoverTools(context);
      const destNames = new Set(dest.map((tool) => tool.name));
      return [...dest, ...extra.filter((tool) => !destNames.has(tool.name))];
    } catch {
      return dest;
    }
  }

  async *execute(call: ConnectorCall, context: AdapterContext): AsyncIterable<ConnectorEvent> {
    if (call.tool === "destination.write") {
      yield* this.destination.execute(call, context);
      return;
    }
    yield* this.composio.execute(call, context);
  }
}

export function createConnectorStack(opts: {
  prisma: PrismaClient;
  secrets: EncryptedSecretStore;
  callbackUrl: string;
  sessionFactory?: ComposioMcpSessionFactory;
}) {
  const destination = new DestinationEmulator();
  const store = new PrismaComposioOAuthStore(opts.prisma, opts.secrets);
  const composio = new ComposioConnector(store, opts.callbackUrl, {
    sessionFactory: opts.sessionFactory,
  });
  return {
    destination,
    composio,
    connector: new CompositeConnector(destination, composio),
  };
}

export function asConnectorTools(input: unknown): ConnectorTool[] {
  if (!Array.isArray(input)) return [];
  const tools: ConnectorTool[] = [];
  for (const item of input) {
    if (!isRecord(item) || typeof item.name !== "string" || !item.name) continue;
    if (!COMPOSIO_META_TOOL_SET.has(item.name)) continue;
    tools.push({
      name: item.name,
      description: typeof item.description === "string" ? item.description : item.name,
      inputSchema: asObject(item.inputSchema) ?? { type: "object", properties: {} },
    });
  }
  return tools;
}

export function collectLogIds(value: unknown): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  const walk = (node: unknown) => {
    if (!isRecord(node)) {
      if (Array.isArray(node)) for (const item of node) walk(item);
      return;
    }
    for (const [key, nested] of Object.entries(node)) {
      if (
        (key === "logId" || key === "log_id") &&
        typeof nested === "string" &&
        nested &&
        !seen.has(nested)
      ) {
        seen.add(nested);
        ids.push(nested);
      } else {
        walk(nested);
      }
    }
  };
  walk(value);
  return ids;
}

export function parseComposioOAuthBundle(
  plaintext: string,
  expected: Pick<ComposioConnectionRecord, "userId" | "workspaceId">,
): ComposioOAuthBundle {
  const raw = JSON.parse(plaintext) as unknown;
  if (!isRecord(raw) || raw.version !== 1) throw new ComposioCredentialError();
  if (raw.userId !== expected.userId || raw.workspaceId !== expected.workspaceId) {
    throw new ComposioCredentialError();
  }
  if (
    raw.clientInformation !== undefined &&
    (!isRecord(raw.clientInformation) || typeof raw.clientInformation.client_id !== "string")
  ) {
    throw new ComposioCredentialError();
  }
  if (
    raw.tokens !== undefined &&
    (!isRecord(raw.tokens) || typeof raw.tokens.access_token !== "string")
  ) {
    throw new ComposioCredentialError();
  }
  if (raw.codeVerifier !== undefined && typeof raw.codeVerifier !== "string") {
    throw new ComposioCredentialError();
  }
  if (
    raw.discoveryState !== undefined &&
    (!isRecord(raw.discoveryState) || typeof raw.discoveryState.authorizationServerUrl !== "string")
  ) {
    throw new ComposioCredentialError();
  }
  return raw as ComposioOAuthBundle;
}

export function sanitizeComposioError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return redactConnectorText(message);
}

function createComposioMcpSession(
  provider: OAuthClientProvider,
  mode: "begin" | "callback" | "runtime",
): ComposioMcpSession {
  const client = new Client({ name: "meshbot", version: "0.1.0" });
  const transport = new StreamableHTTPClientTransport(COMPOSIO_MCP_URL, {
    authProvider: provider,
    onInsufficientScope: mode === "runtime" ? "throw" : "reauthorize",
  });
  return {
    connect: () => client.connect(transport),
    finishAuth: (params) => transport.finishAuth(params),
    listTools: async () => client.listTools(),
    callTool: (name, args) => client.callTool({ name, arguments: args }),
    close: () => client.close(),
  };
}

function adapterContext(row: ComposioConnectionRecord, operationId: string): AdapterContext {
  return {
    operationId,
    traceId: operationId,
    workspaceId: row.workspaceId,
    userId: row.userId,
    signal: new AbortController().signal,
  };
}

function stateIsCurrent(metadata: Prisma.JsonValue, now: number): boolean {
  if (!isRecord(metadata) || typeof metadata.stateExpiresAt !== "string") return false;
  const expiresAt = Date.parse(metadata.stateExpiresAt);
  return Number.isFinite(expiresAt) && now < expiresAt;
}

function isComposioAuthenticationFailure(error: unknown): boolean {
  return (
    error instanceof ComposioCredentialError ||
    error instanceof ComposioReconnectRequiredError ||
    error instanceof UnauthorizedError ||
    error instanceof OAuthError ||
    error instanceof AuthorizationServerMismatchError ||
    error instanceof IssuerMismatchError ||
    error instanceof InsufficientScopeError ||
    (error instanceof SdkHttpError && (error.status === 401 || error.status === 403))
  );
}

function isErrorToolResult(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && value.isError === true;
}

function toolResultText(result: Record<string, unknown>): string {
  if (!Array.isArray(result.content)) return "Composio could not complete that action.";
  const text = result.content
    .filter((item): item is Record<string, unknown> => isRecord(item))
    .map((item) => (typeof item.text === "string" ? item.text : ""))
    .filter(Boolean)
    .join("\n");
  return text || "Composio could not complete that action.";
}

function sanitizePayload(data: unknown): unknown {
  try {
    return JSON.parse(redactConnectorText(JSON.stringify(data)));
  } catch {
    return { ok: true };
  }
}

function redactConnectorText(value: string): string {
  return value
    .replace(/COMPOSIO_API_KEY[=:]?\s*\S+/gi, "COMPOSIO_API_KEY=[redacted]")
    .replace(
      /("(?:access_token|refresh_token|client_secret|id_token|code_verifier)"\s*:\s*")[^"]+("\s*)/gi,
      "$1[redacted]$2",
    )
    .replace(/ak_[A-Za-z0-9]+/g, "[redacted]")
    .replace(/ck_[A-Za-z0-9]+/g, "[redacted]")
    .replace(/sk-or-v1-[A-Za-z0-9]+/g, "[redacted]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]");
}

function asObject(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

class InvalidComposioCallbackError extends Error {
  constructor() {
    super("Invalid or expired Composio callback");
  }
}

class ComposioCredentialError extends Error {
  constructor() {
    super("Composio credentials are unavailable");
  }
}

class ComposioReconnectRequiredError extends Error {
  constructor() {
    super("Composio sign-in is required");
  }
}
