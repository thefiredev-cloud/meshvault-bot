import type { SandboxProvider, WakeupDriver } from "@meshbot/adapter-kit";
import { RUN_LEASE_HEARTBEAT_MS } from "@meshbot/core";
import type { PrismaClient } from "@meshbot/db";
import { appendEventInTransaction } from "@meshbot/db";
import { lockBotRunLane } from "./run-cancellation.js";

export const DEFAULT_SANDBOX_IDLE_MS = 10 * 60 * 1000;

const ACTIVE_RUN = [
  "queued",
  "leased",
  "running",
  "waiting_input",
  "waiting_takeover",
  "cancelling",
] as const;

export function sandboxIdleMs(): number {
  const raw = Number(process.env.SANDBOX_IDLE_MS ?? DEFAULT_SANDBOX_IDLE_MS);
  return Number.isFinite(raw) && raw >= 30_000 ? raw : DEFAULT_SANDBOX_IDLE_MS;
}

export function scheduleComputerSleep(wakeup: WakeupDriver | undefined, botId: string): void {
  if (!wakeup || !botId) return;
  void wakeup.enqueue({
    name: "computer.sleep",
    payload: { botId },
    runAt: new Date(Date.now() + sandboxIdleMs()),
    jobKey: `computer.sleep:${botId}`,
  });
}

export async function touchRunningComputer(
  deps: { sandbox: SandboxProvider; wakeup?: WakeupDriver },
  computer: { botId: string; providerRef: string; kind: string },
): Promise<void> {
  scheduleComputerSleep(deps.wakeup, computer.botId);
  const sandbox = deps.sandbox as SandboxProvider & {
    keepAlive?: (ref: {
      id: string;
      botId: string;
      kind: "docker" | "e2b" | "desktop" | "fake";
      providerRef: string;
    }) => Promise<void>;
  };
  await sandbox.keepAlive?.({
    id: computer.providerRef,
    botId: computer.botId,
    kind: computer.kind as "docker" | "e2b" | "desktop" | "fake",
    providerRef: computer.providerRef,
  });
}

export async function sleepComputerIfIdle(
  deps: { prisma: PrismaClient; sandbox: SandboxProvider; wakeup?: WakeupDriver },
  botId: string,
): Promise<void> {
  const reservation = await deps.prisma.$transaction(async (tx) => {
    const bot = await lockBotRunLane(tx, botId, { allowDeleting: true, allowMissing: true });
    if (!bot || bot.deletingAt) return null;
    const computer = await tx.computer.findUnique({ where: { botId } });
    if (!computer?.providerRef || computer.state !== "running" || computer.bootToken) return null;
    const active = await tx.run.findFirst({
      where: { botId, status: { in: [...ACTIVE_RUN] } },
      select: { id: true },
    });
    if (active) return "active" as const;
    return tx.computer.update({
      where: { botId },
      data: {
        operationFence: { increment: 1 },
        state: "stopping",
        controlHolder: "none",
        controlLeaseId: null,
        controlRunId: null,
      },
      select: { workspaceId: true, userId: true, operationFence: true },
    });
  });
  if (reservation === "active") {
    scheduleComputerSleep(deps.wakeup, botId);
    return;
  }
  if (!reservation) return;
  const ctx = {
    operationId: "computer.sleep",
    traceId: "computer.sleep",
    workspaceId: reservation.workspaceId,
    userId: reservation.userId,
    botId,
    signal: AbortSignal.timeout(RUN_LEASE_HEARTBEAT_MS * 3),
    mutationPermit: {
      purpose: "lifecycle" as const,
      operationFence: reservation.operationFence,
    },
  };
  await deps.sandbox.quiesce(botId, ctx);
  await deps.prisma.$transaction(async (tx) => {
    await lockBotRunLane(tx, botId, { allowDeleting: true, allowMissing: true });
    const changed = await tx.computer.updateMany({
      where: { botId, operationFence: reservation.operationFence },
      data: { state: "suspended" },
    });
    if (changed.count !== 1) return;
    const bot = await tx.bot.findUnique({ where: { id: botId }, include: { thread: true } });
    if (bot?.thread) {
      await appendEventInTransaction(tx, {
        workspaceId: reservation.workspaceId,
        threadId: bot.thread.id,
        botId,
        type: "computer.status",
        payload: { status: "suspended" },
      });
    }
  });
}
