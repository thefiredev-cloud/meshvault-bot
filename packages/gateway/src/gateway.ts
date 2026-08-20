/**
 * The only path a Bot action may take: resolve the target, decide policy,
 * write the audit row, then act or refuse and name the rule.
 *
 * Architecture from CopilotKit/openbot (MIT). MeshVault-owned implementation.
 * Do not reverse-engineer Grok Bot. Do not require CopilotKit cloud license.
 */

import { type AuditStore, recordAuditEvent } from "./audit.js";
import {
  type ActionPolicy,
  evaluateActionPolicy,
  type PolicyContext,
  type PolicyDecision,
  TAKE_THE_WHEEL_RULE,
  takeTheWheelDecision,
} from "./policy.js";

export class ActionRefusedError extends Error {
  readonly rule: string | null;

  constructor(reason: string, rule: string | null) {
    super(reason);
    this.name = "ActionRefusedError";
    this.rule = rule;
  }
}

export type ActionSnapshotElement = {
  ref: string;
  role: string;
  name: string;
  type?: string;
};

export type ActionSubject = {
  ref?: string;
  filePath?: string;
  targetUrl?: string;
  key?: string;
  command?: string;
  cwd?: string;
};

export type GovernRequest<T> = {
  toolName: string;
  botId: string;
  actorId: string;
  workspaceId: string;
  runId?: string;
  computerId?: string;
  controlHolder?: string;
  intent?: PolicyContext["intent"];
  subject?: ActionSubject;
  secrets?: string[];
  run: () => Promise<T>;
};

export type ActionGatewayOptions = {
  auditStore: AuditStore;
  policy: () => ActionPolicy | undefined;
  resolveElement?: (
    computerId: string | undefined,
    ref: string,
  ) => ActionSnapshotElement | undefined;
};

export function createActionGateway(options: ActionGatewayOptions) {
  return {
    async act<T>(request: GovernRequest<T>): Promise<T> {
      const subject = request.subject ?? {};
      const element =
        subject.ref && options.resolveElement
          ? options.resolveElement(request.computerId, subject.ref)
          : undefined;
      const pageUrl = subject.targetUrl ?? "";
      const context: PolicyContext = {
        tool: { name: request.toolName },
        bot: { id: request.botId },
        actor: { id: request.actorId },
        page: { url: pageUrl, host: hostOf(pageUrl) },
        repeat: { count: 1 },
        control: { holder: request.controlHolder ?? "bot" },
        ...(request.intent ? { intent: request.intent } : {}),
        ...(subject.key ? { key: subject.key } : {}),
        ...(element ? { element } : {}),
        ...(subject.filePath ? { file: describeFile(subject.filePath) } : {}),
      };

      const decision =
        request.controlHolder === "user"
          ? takeTheWheelDecision()
          : evaluateActionPolicy(options.policy(), context);

      await writeDecision(options.auditStore, request, subject, element, pageUrl, decision);

      if (!decision.forward) {
        throw new ActionRefusedError(decision.reason, decision.matched);
      }

      try {
        return await request.run();
      } catch (error) {
        await writeDecision(
          options.auditStore,
          request,
          subject,
          element,
          pageUrl,
          decision,
          error instanceof Error ? error.message : "The action failed.",
        );
        throw error;
      }
    },
  };
}

export type ActionGateway = ReturnType<typeof createActionGateway>;

async function writeDecision(
  store: AuditStore,
  request: GovernRequest<unknown>,
  subject: ActionSubject,
  element: ActionSnapshotElement | undefined,
  pageUrl: string,
  decision: PolicyDecision,
  failure?: string,
) {
  const eventType = failure
    ? "computer.action_failed"
    : decision.allowed
      ? "computer.action_allowed"
      : "computer.action_refused";
  await recordAuditEvent(
    store,
    {
      eventType,
      workspaceId: request.workspaceId,
      botId: request.botId,
      actorId: request.actorId,
      runId: request.runId,
      computerId: request.computerId,
      toolName: request.toolName,
      targetType: "computer",
      targetId: request.computerId,
      decision: {
        allowed: decision.allowed,
        mode: decision.mode,
        matched: decision.matched,
        source: decision.source,
        forward: decision.forward,
      },
      payload: {
        action: request.toolName,
        bot: request.botId,
        actor: request.actorId,
        page: pageUrl || undefined,
        ref: subject.ref ?? null,
        ...(subject.key ? { key: subject.key } : {}),
        ...(subject.filePath ? { file: subject.filePath } : {}),
        ...(subject.command ? { command: subject.command } : {}),
        ...(subject.cwd ? { cwd: subject.cwd } : {}),
        ...(element
          ? { element: { role: element.role, name: element.name, type: element.type } }
          : {}),
        ...(failure ? { failure } : {}),
        ...(decision.matched === TAKE_THE_WHEEL_RULE ? { control: "user" } : {}),
        decision: {
          allowed: decision.allowed,
          mode: decision.mode,
          source: decision.source,
          rule: decision.matched,
          carriedOut: decision.forward,
        },
      },
    },
    request.secrets,
  );
}

function describeFile(path: string): { path: string; name: string; extension: string } {
  const name = path.split(/[\\/]/).pop() ?? path;
  const dot = name.lastIndexOf(".");
  return {
    path,
    name,
    extension: dot > 0 ? name.slice(dot + 1).toLowerCase() : "",
  };
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}
