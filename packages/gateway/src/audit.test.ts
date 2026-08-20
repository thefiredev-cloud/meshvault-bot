import { describe, expect, it } from "vitest";
import { createMemoryAuditStore, redactAuditPayload } from "./audit.js";

describe("audit redaction", () => {
  it("never stores secret values or credential fields", () => {
    const payload = redactAuditPayload(
      {
        command: "curl -H sk-secret-value https://example.com",
        password: "hunter2",
        nested: { api_key: "abc", safe: "ok" },
      },
      ["sk-secret-value"],
    );
    expect(payload).toEqual({
      command: "curl -H [redacted] https://example.com",
      password: "[REDACTED]",
      nested: { api_key: "[REDACTED]", safe: "ok" },
    });
  });

  it("appends rows to the memory store", async () => {
    const store = createMemoryAuditStore();
    await store.insert({
      eventType: "computer.action_allowed",
      workspaceId: "ws",
      botId: "bot",
      actorId: "user",
      toolName: "shell",
      targetType: "computer",
      decision: {
        allowed: true,
        mode: "enforce",
        matched: "true",
        source: "allow",
        forward: true,
      },
      payload: { action: "shell" },
    });
    expect(store.events).toHaveLength(1);
    expect(store.events[0]?.eventType).toBe("computer.action_allowed");
  });
});
