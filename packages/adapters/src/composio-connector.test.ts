import type { AdapterContext, ConnectorEvent } from "@meshbot/adapter-kit";
import { describe, expect, it } from "vitest";
import {
  asConnectorTools,
  COMPOSIO_META_TOOLS,
  type ComposioConnectionRecord,
  ComposioConnector,
  type ComposioMcpSessionFactory,
  type ComposioOAuthBundle,
  type ComposioOAuthStore,
  parseComposioOAuthBundle,
  sanitizeComposioError,
} from "./composio-connector.js";

const context: AdapterContext = {
  operationId: "operation-1",
  traceId: "trace-1",
  workspaceId: "workspace-1",
  userId: "user-1",
  signal: new AbortController().signal,
};

class MemoryOAuthStore implements ComposioOAuthStore {
  row: ComposioConnectionRecord | undefined;
  bundle: ComposioOAuthBundle | undefined;
  failed = 0;
  claims = 0;
  degraded = 0;
  readError = false;

  async current(scope: AdapterContext) {
    if (this.row?.workspaceId !== scope.workspaceId || this.row.userId !== scope.userId) {
      return undefined;
    }
    return this.row;
  }

  async reset(scope: AdapterContext, state: string, stateExpiresAt: string) {
    this.row = {
      id: "connection-1",
      workspaceId: scope.workspaceId,
      userId: scope.userId,
      provider: "composio",
      displayName: "Composio",
      status: "pending",
      secretId: "secret-1",
      providerRef: state,
      metadata: { stateExpiresAt },
      createdAt: new Date("2026-08-13T00:00:00.000Z"),
      updatedAt: new Date("2026-08-13T00:00:00.000Z"),
    };
    this.bundle = {
      version: 1,
      workspaceId: scope.workspaceId,
      userId: scope.userId,
    };
    return this.row;
  }

  async pending(state: string) {
    return this.row?.status === "pending" && this.row.providerRef === state ? this.row : undefined;
  }

  async claim(row: ComposioConnectionRecord, state: string) {
    if (
      this.row?.id !== row.id ||
      this.row.status !== "pending" ||
      this.row.secretId !== row.secretId ||
      this.row.providerRef !== state
    ) {
      return false;
    }
    this.claims += 1;
    this.row = { ...this.row, providerRef: null };
    return true;
  }

  async readBundle() {
    if (this.readError) throw new Error("encrypted bundle is corrupt");
    if (!this.bundle) throw new Error("bundle missing");
    return this.bundle;
  }

  async writeBundle(_row: ComposioConnectionRecord, bundle: ComposioOAuthBundle) {
    this.bundle = bundle;
  }

  async markConnected() {
    if (!this.row) throw new Error("row missing");
    this.row = { ...this.row, status: "connected", providerRef: null, metadata: {} };
  }

  async markDegraded(row: ComposioConnectionRecord) {
    if (
      this.row?.id === row.id &&
      this.row.status === row.status &&
      this.row.secretId === row.secretId &&
      this.row.providerRef === row.providerRef
    ) {
      this.degraded += 1;
      this.row = { ...this.row, status: "error" };
    }
  }

  async markFailed() {
    if (!this.row) return;
    this.failed += 1;
    this.bundle = undefined;
    this.row = {
      ...this.row,
      status: "error",
      secretId: null,
      providerRef: null,
      metadata: {},
    };
  }

  async revoke(connectionId: string, scope: AdapterContext) {
    if (
      this.row?.id === connectionId &&
      this.row.workspaceId === scope.workspaceId &&
      this.row.userId === scope.userId
    ) {
      this.bundle = undefined;
      this.row = { ...this.row, status: "revoked", secretId: null };
    }
  }
}

function fakeSessionFactory(
  callbacks: URLSearchParams[],
  sessions: Array<"begin" | "callback" | "runtime"> = [],
): ComposioMcpSessionFactory {
  return (provider, mode) => {
    sessions.push(mode);
    return {
      async connect() {
        if (mode !== "begin") return;
        if (!provider.saveClientInformation) throw new Error("OAuth client storage missing");
        await provider.saveClientInformation({ client_id: "meshvault-test-client" });
        await provider.saveCodeVerifier("test-pkce-verifier");
        const state = await provider.state?.();
        await provider.redirectToAuthorization(
          new URL(`https://login.composio.dev/authorize?state=${encodeURIComponent(state ?? "")}`),
        );
      },
      async finishAuth(params) {
        callbacks.push(new URLSearchParams(params));
        await provider.saveTokens({
          access_token: "access-secret",
          refresh_token: "refresh-secret",
          token_type: "bearer",
        });
      },
      async listTools() {
        return {
          tools: COMPOSIO_META_TOOLS.map((name) => ({
            name,
            description: name,
            inputSchema: { type: "object", properties: {} },
          })),
        };
      },
      async callTool(name, args) {
        return { content: [{ type: "text", text: JSON.stringify({ name, args }) }] };
      },
      async close() {},
    };
  };
}

describe("personal Composio MCP OAuth", () => {
  it("persists OAuth material, validates callback state, and exposes seven meta-tools", async () => {
    const store = new MemoryOAuthStore();
    const callbacks: URLSearchParams[] = [];
    const sessions: Array<"begin" | "callback" | "runtime"> = [];
    const connector = new ComposioConnector(store, "https://meshvault.test/callback", {
      now: () => Date.parse("2026-08-13T00:00:00.000Z"),
      stateFactory: () => "fixed-state",
      sessionFactory: fakeSessionFactory(callbacks, sessions),
    });

    const started = await connector.begin(context);
    expect(started).toEqual({
      connectionId: "connection-1",
      authorizationUrl: "https://login.composio.dev/authorize?state=fixed-state",
    });
    expect(store.bundle).toMatchObject({
      clientInformation: { client_id: "meshvault-test-client" },
      codeVerifier: "test-pkce-verifier",
      userId: context.userId,
      workspaceId: context.workspaceId,
    });

    await expect(
      connector.completeCallback(new URLSearchParams({ code: "bad", state: "wrong-state" })),
    ).rejects.toThrow("Invalid or expired Composio callback");
    expect(callbacks).toHaveLength(0);
    expect(store.row?.status).toBe("pending");

    const callbackParams = new URLSearchParams({
      code: "authorization-code",
      state: "fixed-state",
    });
    const completed = await Promise.allSettled([
      connector.completeCallback(callbackParams),
      connector.completeCallback(callbackParams),
    ]);
    expect(completed.map((result) => result.status).sort()).toEqual(["fulfilled", "rejected"]);
    expect(callbacks[0]?.get("code")).toBe("authorization-code");
    expect(callbacks).toHaveLength(1);
    expect(store.claims).toBe(1);
    expect(store.failed).toBe(0);
    expect(store.row?.status).toBe("connected");
    expect(store.bundle?.tokens).toMatchObject({ access_token: "access-secret" });
    expect(store.bundle?.codeVerifier).toBeUndefined();

    const tools = await connector.discoverTools({
      ...context,
      connectedProviders: ["composio"],
    });
    expect(tools.map((tool) => tool.name)).toEqual(COMPOSIO_META_TOOLS);

    const events: ConnectorEvent[] = [];
    for await (const event of connector.execute(
      {
        tool: "COMPOSIO_SEARCH_TOOLS",
        args: { query: "calendar" },
        executionId: "execution-1",
      },
      { ...context, connectedProviders: ["composio"] },
    )) {
      events.push(event);
    }
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe("result");

    const sessionsBeforeRejectedTool = sessions.length;
    const rejected: ConnectorEvent[] = [];
    for await (const event of connector.execute(
      { tool: "COMPOSIO_FUTURE_TOOL", args: {}, executionId: "execution-2" },
      { ...context, connectedProviders: ["composio"] },
    )) {
      rejected.push(event);
    }
    expect(rejected).toEqual([{ type: "error", message: "Composio tool is unavailable." }]);
    expect(sessions).toHaveLength(sessionsBeforeRejectedTool);

    await expect(connector.completeCallback(callbackParams)).rejects.toThrow(
      "Invalid or expired Composio callback",
    );
    expect(store.row?.status).toBe("connected");
    expect(store.bundle?.tokens).toMatchObject({ access_token: "access-secret" });

    await connector.revoke("connection-1", context);
    expect(store.row?.status).toBe("revoked");
    expect(store.bundle).toBeUndefined();
  });

  it("rejects an expired callback before using OAuth or MCP", async () => {
    let now = Date.parse("2026-08-13T00:00:00.000Z");
    const store = new MemoryOAuthStore();
    const callbacks: URLSearchParams[] = [];
    const connector = new ComposioConnector(store, "https://meshvault.test/callback", {
      now: () => now,
      stateFactory: () => "fixed-state",
      sessionFactory: fakeSessionFactory(callbacks),
    });
    await connector.begin(context);
    now += 10 * 60 * 1000;

    await expect(
      connector.completeCallback(new URLSearchParams({ code: "late", state: "fixed-state" })),
    ).rejects.toThrow("Invalid or expired Composio callback");
    expect(callbacks).toHaveLength(0);
    expect(store.claims).toBe(0);
    expect(store.row?.status).toBe("pending");
  });

  it("rejects an encrypted bundle copied across users", () => {
    const plaintext = JSON.stringify({
      version: 1,
      userId: "user-1",
      workspaceId: "workspace-1",
      tokens: { access_token: "secret", token_type: "bearer" },
    });
    expect(() =>
      parseComposioOAuthBundle(plaintext, {
        userId: "user-2",
        workspaceId: "workspace-1",
      }),
    ).toThrow("Composio credentials are unavailable");
  });

  it("preserves a corrupt encrypted bundle while requiring reconnect", async () => {
    const store = new MemoryOAuthStore();
    store.row = {
      id: "connection-1",
      workspaceId: context.workspaceId,
      userId: context.userId,
      provider: "composio",
      displayName: "Composio",
      status: "connected",
      secretId: "secret-1",
      providerRef: null,
      metadata: {},
      createdAt: new Date("2026-08-13T00:00:00.000Z"),
      updatedAt: new Date("2026-08-13T00:00:00.000Z"),
    };
    const encryptedBundle: ComposioOAuthBundle = {
      version: 1,
      workspaceId: context.workspaceId,
      userId: context.userId,
      tokens: { access_token: "unreadable-ciphertext", token_type: "bearer" },
    };
    store.bundle = encryptedBundle;
    store.readError = true;
    const sessions: Array<"begin" | "callback" | "runtime"> = [];
    const connector = new ComposioConnector(store, "https://meshvault.test/callback", {
      sessionFactory: fakeSessionFactory([], sessions),
    });

    const events: ConnectorEvent[] = [];
    for await (const event of connector.execute(
      { tool: "COMPOSIO_SEARCH_TOOLS", args: {}, executionId: "execution-corrupt" },
      { ...context, connectedProviders: ["composio"] },
    )) {
      events.push(event);
    }

    expect(events).toEqual([
      { type: "error", message: "Composio sign-in expired. Reconnect Composio in Plugins." },
    ]);
    expect(store.row?.status).toBe("error");
    expect(store.row?.secretId).toBe("secret-1");
    expect(store.bundle).toBe(encryptedBundle);
    expect(store.degraded).toBe(1);
    expect(store.failed).toBe(0);
    expect(sessions).toHaveLength(0);
  });
});

describe("Composio tool mapping and redaction", () => {
  it("maps MCP tools", () => {
    const tools = asConnectorTools([
      {
        name: "COMPOSIO_SEARCH_TOOLS",
        description: "Search tools",
        inputSchema: { type: "object", properties: { query: { type: "string" } } },
      },
      {
        name: "COMPOSIO_FUTURE_TOOL",
        description: "A future server tool",
        inputSchema: { type: "object", properties: {} },
      },
    ]);
    expect(tools[0]).toMatchObject({
      name: "COMPOSIO_SEARCH_TOOLS",
      inputSchema: { properties: { query: { type: "string" } } },
    });
  });

  it("redacts project keys, OAuth tokens, and bearer headers", () => {
    const sanitized = sanitizeComposioError(
      'COMPOSIO_API_KEY=ak_shouldnotleak {"access_token":"oauth-secret"} Bearer bearer-secret',
    );
    expect(sanitized).not.toContain("ak_shouldnotleak");
    expect(sanitized).not.toContain("oauth-secret");
    expect(sanitized).not.toContain("bearer-secret");
  });
});
