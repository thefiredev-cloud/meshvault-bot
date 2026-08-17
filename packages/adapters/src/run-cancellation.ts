import type { AdapterContext, MutationPermit, SandboxProvider } from "@meshbot/adapter-kit";
import { RUN_LEASE_HEARTBEAT_MS } from "@meshbot/core";
import { appendEventInTransaction, type Prisma, type PrismaClient } from "@meshbot/db";

export const RUN_LANE_STATUSES = [
  "queued",
  "leased",
  "running",
  "cancelling",
  "waiting_input",
  "waiting_takeover",
] as const;

export type RunCancellation = {
  id: string;
  taskId: string;
  workspaceId: string;
  userId: string;
  threadId: string;
  botId: string;
  state: "cancelled" | "cancelling";
  operationFence?: number;
};

type FenceDeps = { prisma: PrismaClient; sandbox: SandboxProvider };

export async function lockBotRunLane(
  tx: Prisma.TransactionClient,
  botId: string,
  options: { allowDeleting?: boolean; allowMissing?: boolean } = {},
) {
  const [bot] = await tx.$queryRaw<Array<{ id: string; deletingAt: Date | null }>>`
    SELECT "id", "deletingAt" FROM "bots" WHERE "id" = ${botId} FOR UPDATE
  `;
  if (!bot) {
    if (options.allowMissing) return null;
    throw new Error("bot is unavailable");
  }
  if (bot.deletingAt && !options.allowDeleting) throw new Error("bot is being deleted");
  return bot;
}

export async function cancelBotRuns(
  tx: Prisma.TransactionClient,
  botId: string,
  options: { statuses?: readonly string[]; exceptRunId?: string } = {},
): Promise<RunCancellation[]> {
  const candidates = await tx.run.findMany({
    where: {
      botId,
      status: { in: [...(options.statuses ?? RUN_LANE_STATUSES)] },
      ...(options.exceptRunId ? { id: { not: options.exceptRunId } } : {}),
    },
    select: { id: true },
  });
  const allowedStatuses = new Set(options.statuses ?? RUN_LANE_STATUSES);
  const cancelled: RunCancellation[] = [];
  for (const candidate of candidates) {
    await tx.$queryRaw`SELECT "id" FROM "runs" WHERE "id" = ${candidate.id} FOR UPDATE`;
    const run = await tx.run.findUnique({
      where: { id: candidate.id },
      select: {
        id: true,
        taskId: true,
        workspaceId: true,
        userId: true,
        threadId: true,
        botId: true,
        status: true,
      },
    });
    if (!run || !allowedStatuses.has(run.status) || run.id === options.exceptRunId) continue;
    const needsAcknowledgement = run.status !== "queued";
    const state = needsAcknowledgement ? "cancelling" : "cancelled";
    const changed = await tx.run.updateMany({
      where: { id: run.id, status: run.status },
      data: {
        status: state,
        completedAt: needsAcknowledgement ? null : new Date(),
      },
    });
    if (changed.count !== 1) continue;
    await tx.task.updateMany({
      where: { id: run.taskId, status: { notIn: ["completed", "cancelled"] } },
      data: { status: state },
    });
    await tx.attempt.updateMany({
      where: { runId: run.id, status: { in: ["running", "cancelling"] } },
      data: {
        status: state,
        finishedAt: needsAcknowledgement ? null : new Date(),
      },
    });
    await settleCancelledEffects(tx, run.id);
    if (!needsAcknowledgement) await recordCancellationEvent(tx, run);
    cancelled.push({ ...run, state });
  }
  if (cancelled.some((run) => run.state === "cancelling")) {
    const computer = await tx.computer.update({
      where: { botId },
      data: { operationFence: { increment: 1 } },
      select: { operationFence: true },
    });
    for (const run of cancelled) {
      if (run.state === "cancelling") run.operationFence = computer.operationFence;
    }
  }
  return cancelled;
}

export async function finalizeRunCancellation(
  deps: FenceDeps,
  runId: string,
  guard:
    | { leaseOwner: string; leaseFence: number }
    | { expiredAt: Date }
    | { operationFence: number },
): Promise<boolean> {
  const pending = await deps.prisma.run.findUnique({
    where: { id: runId },
    include: { bot: { include: { computer: true } } },
  });
  if (pending?.status !== "cancelling") return false;
  const operationFence =
    "operationFence" in guard ? guard.operationFence : pending.bot.computer?.operationFence;
  if (operationFence === undefined) throw new Error("computer fence is unavailable");
  if (pending.bot.computer?.operationFence !== operationFence) return false;
  await deps.sandbox.quiesce(
    pending.botId,
    lifecycleContext(pending, operationFence, pending.bot.computer.bootToken ?? undefined),
  );

  const cancelled = await deps.prisma.$transaction(async (tx) => {
    await lockBotRunLane(tx, pending.botId, { allowDeleting: true });
    const run = await tx.run.findUnique({ where: { id: runId } });
    if (run?.status !== "cancelling") return null;
    const computer = await tx.computer.findUnique({ where: { botId: run.botId } });
    if (computer?.operationFence !== operationFence) return null;
    const changed = await tx.run.updateMany({
      where: {
        id: run.id,
        status: "cancelling",
        ...("leaseOwner" in guard
          ? { leaseOwner: guard.leaseOwner, leaseFence: guard.leaseFence }
          : "expiredAt" in guard
            ? { leaseExpiresAt: { lte: guard.expiredAt } }
            : {}),
      },
      data: { status: "cancelled", completedAt: new Date() },
    });
    if (changed.count !== 1) return null;
    await tx.task.updateMany({
      where: { id: run.taskId, status: { notIn: ["completed", "cancelled"] } },
      data: { status: "cancelled" },
    });
    await tx.attempt.updateMany({
      where: { runId: run.id, status: { in: ["running", "cancelling"] } },
      data: { status: "cancelled", finishedAt: new Date() },
    });
    await settleCancelledEffects(tx, run.id);
    await tx.computer.updateMany({
      where: { botId: run.botId, operationFence },
      data: {
        state: "stopped",
        controlHolder: "none",
        controlLeaseId: null,
        controlRunId: null,
      },
    });
    await recordCancellationEvent(tx, run);
    return run;
  });
  return Boolean(cancelled);
}

export async function waitForBotQuiescence(
  prisma: PrismaClient,
  botId: string,
  timeoutMs: number,
  signal?: AbortSignal,
) {
  const deadline = Date.now() + timeoutMs;
  while (!signal?.aborted && Date.now() < deadline) {
    const [live, computer] = await Promise.all([
      prisma.run.count({
        where: { botId, status: { in: ["leased", "running", "cancelling"] } },
      }),
      prisma.computer.findUnique({ where: { botId }, select: { bootToken: true } }),
    ]);
    if (live === 0 && !computer?.bootToken) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("bot did not stop before the deletion safety timeout");
}

export async function quiesceRunOperations(
  deps: FenceDeps,
  run: {
    id: string;
    botId: string;
    workspaceId: string;
    userId: string;
  },
  guard: { leaseOwner: string; leaseFence: number },
): Promise<number | null> {
  const operationFence = await deps.prisma.$transaction(async (tx) => {
    await lockBotRunLane(tx, run.botId, { allowDeleting: true });
    const current = await tx.run.findFirst({
      where: {
        id: run.id,
        botId: run.botId,
        status: "running",
        leaseOwner: guard.leaseOwner,
        leaseFence: guard.leaseFence,
        leaseExpiresAt: { gt: new Date() },
      },
      select: { id: true },
    });
    if (!current) return null;
    const computer = await tx.computer.update({
      where: { botId: run.botId },
      data: { operationFence: { increment: 1 } },
      select: { operationFence: true, bootToken: true },
    });
    return computer;
  });
  if (!operationFence) return null;
  await deps.sandbox.quiesce(
    run.botId,
    lifecycleContext(run, operationFence.operationFence, operationFence.bootToken ?? undefined),
  );
  await deps.prisma.computer.updateMany({
    where: { botId: run.botId, operationFence: operationFence.operationFence },
    data: {
      state: "stopped",
      controlHolder: "none",
      controlLeaseId: null,
      controlRunId: null,
    },
  });
  return operationFence.operationFence;
}

export function runMutationPermit(
  operationFence: number,
  runId: string,
  runLeaseFence: number,
): MutationPermit {
  return { purpose: "run", operationFence, runId, runLeaseFence };
}

function lifecycleContext(
  row: { id: string; botId: string; workspaceId: string; userId: string },
  operationFence: number,
  bootToken?: string,
): AdapterContext {
  return {
    operationId: `quiesce:${row.id}`,
    traceId: `quiesce:${row.id}`,
    workspaceId: row.workspaceId,
    userId: row.userId,
    botId: row.botId,
    runId: row.id,
    signal: AbortSignal.timeout(RUN_LEASE_HEARTBEAT_MS * 3),
    mutationPermit: { purpose: "lifecycle", operationFence, bootToken },
  };
}

async function settleCancelledEffects(tx: Prisma.TransactionClient, runId: string) {
  await tx.externalEffect.updateMany({
    where: { runId, status: { in: ["awaiting_approval", "approved"] } },
    data: { status: "failed", result: { error: "run cancelled before dispatch" } },
  });
  await tx.externalEffect.updateMany({
    where: { runId, status: "intended" },
    data: {
      status: "ambiguous",
      result: { error: "run cancelled after dispatch may have started" },
    },
  });
}

async function recordCancellationEvent(
  tx: Prisma.TransactionClient,
  run: { id: string; workspaceId: string; threadId: string; botId: string },
) {
  await appendEventInTransaction(tx, {
    workspaceId: run.workspaceId,
    threadId: run.threadId,
    botId: run.botId,
    type: "run.cancelled",
    runId: run.id,
    payload: {},
  });
}
