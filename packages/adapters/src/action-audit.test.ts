import { createMemoryAuditStore, recordAuditEvent } from "@meshbot/gateway";
import { describe, expect, it } from "vitest";
import { createPrismaAuditStore } from "./action-audit.js";

describe("prisma audit store", () => {
  it("writes a redacted decision row", async () => {
    const created: unknown[] = [];
    const store = createPrismaAuditStore({
      actionAudit: {
        create: async ({ data }: { data: unknown }) => {
          created.push(data);
        },
      },
    } as never);

    await recordAuditEvent(
      store,
      {
        eventType: "computer.action_allowed",
        workspaceId: "ws_1",
        botId: "bot_1",
        actorId: "user_1",
        toolName: "shell",
        targetType: "computer",
        decision: {
          allowed: true,
          mode: "enforce",
          matched: "true",
          source: "allow",
          forward: true,
        },
        payload: { command: "echo sk-secret", password: "nope" },
      },
      ["sk-secret"],
    );

    expect(created).toEqual([
      expect.objectContaining({
        workspaceId: "ws_1",
        toolName: "shell",
        eventType: "computer.action_allowed",
        payload: { command: "echo [redacted]", password: "[REDACTED]" },
      }),
    ]);
    expect(createMemoryAuditStore().events).toEqual([]);
  });
});
