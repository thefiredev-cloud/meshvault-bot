import { describe, expect, it } from "vitest";
import { createMemoryAuditStore } from "./audit.js";
import { ActionRefusedError, createActionGateway } from "./gateway.js";
import { DEFAULT_ACTION_POLICY, TAKE_THE_WHEEL_RULE } from "./policy.js";

describe("action gateway", () => {
  it("writes an audit row before acting", async () => {
    const audit = createMemoryAuditStore();
    const order: string[] = [];
    const gateway = createActionGateway({
      auditStore: {
        async insert(event) {
          order.push(`audit:${event.eventType}`);
          await audit.insert(event);
        },
      },
      policy: () => DEFAULT_ACTION_POLICY,
    });

    const result = await gateway.act({
      toolName: "shell",
      botId: "bot_1",
      actorId: "user_1",
      workspaceId: "ws_1",
      computerId: "cmp_1",
      intent: "write",
      subject: { command: "echo hi", cwd: "." },
      run: async () => {
        order.push("act");
        return { code: 0 };
      },
    });

    expect(result).toEqual({ code: 0 });
    expect(order).toEqual(["audit:computer.action_allowed", "act"]);
    expect(audit.events[0]?.payload.command).toBe("echo hi");
    expect(audit.events[0]?.decision.matched).toBe("true");
  });

  it("refuses and names the rule without acting", async () => {
    const audit = createMemoryAuditStore();
    let acted = false;
    const gateway = createActionGateway({
      auditStore: audit,
      policy: () => ({ mode: "enforce", deny: ['tool.name == "shell"'], allow: ["true"] }),
    });

    await expect(
      gateway.act({
        toolName: "shell",
        botId: "bot_1",
        actorId: "user_1",
        workspaceId: "ws_1",
        run: async () => {
          acted = true;
          return { ok: true };
        },
      }),
    ).rejects.toMatchObject({
      name: "ActionRefusedError",
      rule: 'tool.name == "shell"',
    });
    expect(acted).toBe(false);
    expect(audit.events.map((event) => event.eventType)).toEqual(["computer.action_refused"]);
  });

  it("refuses bot actions while a person has the wheel", async () => {
    const audit = createMemoryAuditStore();
    let acted = false;
    const gateway = createActionGateway({
      auditStore: audit,
      policy: () => DEFAULT_ACTION_POLICY,
    });

    await expect(
      gateway.act({
        toolName: "shell",
        botId: "bot_1",
        actorId: "user_1",
        workspaceId: "ws_1",
        controlHolder: "user",
        run: async () => {
          acted = true;
          return { ok: true };
        },
      }),
    ).rejects.toBeInstanceOf(ActionRefusedError);
    expect(acted).toBe(false);
    expect(audit.events[0]?.decision.matched).toBe(TAKE_THE_WHEEL_RULE);
    expect(audit.events[0]?.eventType).toBe("computer.action_refused");
  });

  it("resolves the target from the server-held snapshot, not the caller label", async () => {
    const audit = createMemoryAuditStore();
    const gateway = createActionGateway({
      auditStore: audit,
      policy: () => ({
        mode: "enforce",
        deny: ['contains(element.name, "Submit")'],
        allow: ["true"],
      }),
      resolveElement: () => ({ ref: "e13", role: "button", name: "Submit order" }),
    });

    await expect(
      gateway.act({
        toolName: "computer_click",
        botId: "bot_1",
        actorId: "user_1",
        workspaceId: "ws_1",
        computerId: "cmp_1",
        subject: { ref: "e13" },
        run: async () => ({ ok: true }),
      }),
    ).rejects.toMatchObject({ rule: 'contains(element.name, "Submit")' });
  });

  it("writes a failed row when a permitted action does not happen", async () => {
    const audit = createMemoryAuditStore();
    const gateway = createActionGateway({
      auditStore: audit,
      policy: () => DEFAULT_ACTION_POLICY,
    });

    await expect(
      gateway.act({
        toolName: "shell",
        botId: "bot_1",
        actorId: "user_1",
        workspaceId: "ws_1",
        run: async () => {
          throw new Error("sandbox down");
        },
      }),
    ).rejects.toThrow(/sandbox down/);
    expect(audit.events.map((event) => event.eventType)).toEqual([
      "computer.action_allowed",
      "computer.action_failed",
    ]);
    expect(audit.events[1]?.payload.failure).toBe("sandbox down");
  });

  it("does not act when the audit row cannot be written", async () => {
    let acted = false;
    const gateway = createActionGateway({
      auditStore: {
        async insert() {
          throw new Error("audit store down");
        },
      },
      policy: () => DEFAULT_ACTION_POLICY,
    });

    await expect(
      gateway.act({
        toolName: "shell",
        botId: "bot_1",
        actorId: "user_1",
        workspaceId: "ws_1",
        run: async () => {
          acted = true;
          return { ok: true };
        },
      }),
    ).rejects.toThrow(/audit store down/);
    expect(acted).toBe(false);
  });
});
