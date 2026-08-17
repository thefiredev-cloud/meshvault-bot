import { describe, expect, it, vi } from "vitest";
import { BotMutationGate } from "./bot-mutation-gate.js";
import {
  authorizeMutation,
  MutationPermitError,
  PERMIT_HEADERS,
  readMutationPermit,
  validateMutationPermit,
} from "./mutation-permit.js";

const currentRun = {
  providerRef: "container-1",
  operationFence: 7,
  bootToken: "boot-1",
  controlHolder: "user",
  controlLeaseId: "control-1",
  deletingAt: null,
  runId: "run-1",
  runStatus: "running",
  runLeaseFence: 4,
  runLeaseActive: true,
};

describe("mutation permits", () => {
  it("parses one exact permit shape and rejects missing or mixed headers", () => {
    const runHeaders = new Map<string, string>([
      [PERMIT_HEADERS.purpose, "run"],
      [PERMIT_HEADERS.operationFence, "7"],
      [PERMIT_HEADERS.runId, "run-1"],
      [PERMIT_HEADERS.runLeaseFence, "4"],
    ]);
    expect(readMutationPermit((name) => runHeaders.get(name))).toEqual({
      purpose: "run",
      operationFence: 7,
      runId: "run-1",
      runLeaseFence: 4,
    });
    expect(() => readMutationPermit(() => undefined)).toThrow(MutationPermitError);
    runHeaders.set(PERMIT_HEADERS.operationFence, "0");
    expect(() => readMutationPermit((name) => runHeaders.get(name))).toThrow(MutationPermitError);
    runHeaders.set(PERMIT_HEADERS.operationFence, "7");
    runHeaders.set(PERMIT_HEADERS.controlLeaseId, "mixed-authority");
    expect(() => readMutationPermit((name) => runHeaders.get(name))).toThrow(MutationPermitError);
  });

  it("accepts only the authoritative live run fence and status", () => {
    const authorization = {
      workspaceId: "workspace-1",
      botId: "bot-1",
      permit: {
        purpose: "run" as const,
        operationFence: 7,
        runId: "run-1",
        runLeaseFence: 4,
      },
      allowedPurposes: ["run" as const],
      expectedProviderRef: "container-1",
      allowedRunStatuses: ["running"],
    };
    expect(() => validateMutationPermit(currentRun, authorization)).not.toThrow();
    expect(() =>
      validateMutationPermit({ ...currentRun, operationFence: 8 }, authorization),
    ).toThrow(MutationPermitError);
    expect(() =>
      validateMutationPermit({ ...currentRun, runLeaseActive: false }, authorization),
    ).toThrow(MutationPermitError);
    expect(() =>
      validateMutationPermit({ ...currentRun, runStatus: "leased" }, authorization),
    ).toThrow(MutationPermitError);
    expect(() =>
      validateMutationPermit(
        { ...currentRun, runStatus: "leased" },
        { ...authorization, allowedRunStatuses: ["leased"] },
      ),
    ).not.toThrow();
  });

  it("checks control ownership and exact lifecycle boot tokens", () => {
    expect(() =>
      validateMutationPermit(currentRun, {
        workspaceId: "workspace-1",
        botId: "bot-1",
        permit: { purpose: "control", operationFence: 7, controlLeaseId: "control-1" },
        allowedPurposes: ["control"],
      }),
    ).not.toThrow();
    expect(() =>
      validateMutationPermit(
        { ...currentRun, controlHolder: "bot" },
        {
          workspaceId: "workspace-1",
          botId: "bot-1",
          permit: { purpose: "control", operationFence: 7, controlLeaseId: "control-1" },
          allowedPurposes: ["control"],
        },
      ),
    ).toThrow(MutationPermitError);
    expect(() =>
      validateMutationPermit(
        { ...currentRun, deletingAt: new Date() },
        {
          workspaceId: "workspace-1",
          botId: "bot-1",
          permit: { purpose: "lifecycle", operationFence: 7 },
          allowedPurposes: ["lifecycle"],
          allowDeleting: true,
        },
      ),
    ).not.toThrow();
    expect(() =>
      validateMutationPermit(currentRun, {
        workspaceId: "workspace-1",
        botId: "bot-1",
        permit: { purpose: "lifecycle", operationFence: 7, bootToken: "stale" },
        allowedPurposes: ["lifecycle"],
        requireLifecycleBootToken: true,
      }),
    ).toThrow(MutationPermitError);
    expect(() =>
      validateMutationPermit(
        { ...currentRun, deletingAt: new Date() },
        {
          workspaceId: "workspace-1",
          botId: "bot-1",
          permit: { purpose: "lifecycle", operationFence: 7, bootToken: "boot-1" },
          allowedPurposes: ["lifecycle"],
          requireLifecycleBootToken: true,
          allowDeleting: false,
        },
      ),
    ).toThrow(MutationPermitError);
  });

  it("uses one parameterized database snapshot for authorization", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [currentRun] });
    await authorizeMutation(
      { query },
      {
        workspaceId: "workspace-1",
        botId: "bot-1",
        permit: {
          purpose: "run",
          operationFence: 7,
          runId: "run-1",
          runLeaseFence: 4,
        },
        allowedPurposes: ["run"],
        allowedRunStatuses: ["running"],
      },
    );
    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0]?.[1]).toEqual(["workspace-1", "bot-1", "run-1"]);
    expect(query.mock.calls[0]?.[0]).toMatch(/JOIN "bots"/);
  });
});

describe("bot mutation gate", () => {
  it("does not let a later mutation cross a quiescence turn", async () => {
    const gate = new BotMutationGate();
    const order: string[] = [];
    let releaseFirst: () => void = () => undefined;
    const first = gate.run("bot-1", async () => {
      order.push("first:start");
      await new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });
      order.push("first:end");
    });
    const barrier = gate.run("bot-1", async () => order.push("barrier"));
    const later = gate.run("bot-1", async () => order.push("later"));
    await Promise.resolve();
    expect(order).toEqual(["first:start"]);
    releaseFirst();
    await Promise.all([first, barrier, later]);
    expect(order).toEqual(["first:start", "first:end", "barrier", "later"]);
  });
});
