import type { PolicyDecision } from "./policy.js";

export const GATEWAY_AUDIT_EVENTS = [
  "computer.action_allowed",
  "computer.action_refused",
  "computer.action_failed",
  "computer.help_requested",
  "computer.control_taken",
  "computer.control_released",
] as const;

export type GatewayAuditEventType = (typeof GATEWAY_AUDIT_EVENTS)[number];

export type GatewayAuditEvent = {
  eventType: GatewayAuditEventType;
  workspaceId: string;
  botId: string;
  actorId: string;
  runId?: string;
  computerId?: string;
  toolName: string;
  targetType: string;
  targetId?: string;
  decision: Pick<PolicyDecision, "allowed" | "mode" | "matched" | "source" | "forward">;
  payload: Record<string, unknown>;
};

export type AuditStore = {
  insert: (event: GatewayAuditEvent) => Promise<void>;
};

const SENSITIVE_KEYS = new Set([
  "access_token",
  "accesstoken",
  "api_key",
  "apikey",
  "authorization",
  "client_secret",
  "clientsecret",
  "content",
  "credential",
  "credentials",
  "encrypted_value",
  "encryptedvalue",
  "id_token",
  "idtoken",
  "password",
  "refresh_token",
  "refreshtoken",
  "secret",
  "secrets",
  "token",
  "tokens",
  "tool_arguments",
  "tool_result",
]);

function normalizedKey(key: string) {
  return key.replaceAll(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

function isSensitiveKey(key: string) {
  return SENSITIVE_KEYS.has(key.toLowerCase()) || SENSITIVE_KEYS.has(normalizedKey(key));
}

export function redactAuditPayload(value: unknown, secrets: string[] = []): unknown {
  if (typeof value === "string") {
    return secrets.reduce((text, secret) => {
      if (!secret) return text;
      return text.split(secret).join("[redacted]");
    }, value);
  }
  if (Array.isArray(value)) return value.map((item) => redactAuditPayload(item, secrets));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [
      key,
      isSensitiveKey(key) ? "[REDACTED]" : redactAuditPayload(nested, secrets),
    ]),
  );
}

export async function recordAuditEvent(
  store: AuditStore,
  event: GatewayAuditEvent,
  secrets: string[] = [],
) {
  await store.insert({
    ...event,
    payload: redactAuditPayload(event.payload, secrets) as Record<string, unknown>,
  });
}

export function createMemoryAuditStore(): AuditStore & { events: GatewayAuditEvent[] } {
  const events: GatewayAuditEvent[] = [];
  return {
    events,
    async insert(event) {
      events.push(event);
    },
  };
}
