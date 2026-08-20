import { createMemoryAuditStore, DEFAULT_ACTION_POLICY } from "@meshbot/gateway";
import { describe, expect, it } from "vitest";
import { createExecutorActionGateway, executeGovernedShell } from "./computer-action.js";

const prisma = {} as never;

describe("governed computer shell", () => {
  it("decides, audits, then runs the sandbox command", async () => {
    const audit = createMemoryAuditStore();
    const gateway = createExecutorActionGateway({
      prisma,
      auditStore: audit,
      actionPolicy: DEFAULT_ACTION_POLICY,
    });
    const order: string[] = [];

    const result = await executeGovernedShell({
      gateway,
      botId: "bot_1",
      actorId: "user_1",
      workspaceId: "ws_1",
      runId: "run_1",
      computerId: "cmp_1",
      command: "echo hi",
      cwd: "/home/meshbot",
      execute: async () => {
        order.push("sandbox");
        return { stdout: "hi\n", stderr: "", code: 0 };
      },
    });

    expect(result).toEqual({ stdout: "hi\n", stderr: "", code: 0 });
    expect(audit.events.map((event) => event.eventType)).toEqual(["computer.action_allowed"]);
    expect(order).toEqual(["sandbox"]);
    expect(audit.events[0]?.toolName).toBe("shell");
  });

  it("refuses a denied shell and never reaches the computer", async () => {
    const audit = createMemoryAuditStore();
    const gateway = createExecutorActionGateway({
      prisma,
      auditStore: audit,
      actionPolicy: { mode: "enforce", deny: ['tool.name == "shell"'], allow: ["true"] },
    });
    let ran = false;

    const result = await executeGovernedShell({
      gateway,
      botId: "bot_1",
      actorId: "user_1",
      workspaceId: "ws_1",
      command: "rm -rf /",
      cwd: ".",
      execute: async () => {
        ran = true;
        return { stdout: "", stderr: "", code: 0 };
      },
    });

    expect(ran).toBe(false);
    expect(result).toMatchObject({
      rule: 'tool.name == "shell"',
      error: expect.stringContaining("shell"),
    });
    expect(audit.events.map((event) => event.eventType)).toEqual(["computer.action_refused"]);
  });

  it("redacts secrets from the audit row", async () => {
    const audit = createMemoryAuditStore();
    const gateway = createExecutorActionGateway({
      prisma,
      auditStore: audit,
      actionPolicy: DEFAULT_ACTION_POLICY,
    });

    await executeGovernedShell({
      gateway,
      botId: "bot_1",
      actorId: "user_1",
      workspaceId: "ws_1",
      command: "curl -H sk-live-secret https://example.com",
      cwd: ".",
      secrets: ["sk-live-secret"],
      execute: async () => ({ stdout: "", stderr: "", code: 0 }),
    });

    expect(JSON.stringify(audit.events[0]?.payload)).not.toContain("sk-live-secret");
    expect(audit.events[0]?.payload.command).toBe("curl -H [redacted] https://example.com");
  });
});
