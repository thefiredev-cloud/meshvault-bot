import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import type {
  AdapterContext,
  AgentHomeStore,
  ComputerRef,
  MutationPermit,
  SandboxProvider,
} from "@meshbot/adapter-kit";
import { RUN_LEASE_DURATION_MS, RUN_LEASE_HEARTBEAT_MS } from "@meshbot/core";
import type { PrismaClient } from "@meshbot/db";
import { resolveAgentHomePath } from "./home.js";
import { lockBotRunLane } from "./run-cancellation.js";

type ProvisionDeps = {
  prisma: PrismaClient;
  sandbox: SandboxProvider;
  home: AgentHomeStore;
  dataDir?: string;
};

export async function provisionComputer(
  deps: ProvisionDeps,
  botId: string,
  context: AdapterContext,
  controlHolder: "bot" | "none",
): Promise<ComputerRef> {
  const bootToken = randomUUID();
  const reserved = await deps.prisma.$transaction(async (tx) => {
    await lockBotRunLane(tx, botId);
    const computer = await tx.computer.findUniqueOrThrow({ where: { botId } });
    if (computer.bootToken) throw new Error("computer boot is already in progress");

    let permit = context.mutationPermit;
    if (permit?.purpose === "run") {
      const run = await tx.run.findFirst({
        where: {
          id: permit.runId,
          botId,
          status: "running",
          leaseFence: permit.runLeaseFence,
          leaseExpiresAt: { gt: new Date() },
        },
        select: { id: true },
      });
      if (!run || computer.operationFence !== permit.operationFence) {
        throw new Error("run mutation permit is stale");
      }
    } else {
      const active = await tx.run.count({
        where: {
          botId,
          status: { in: ["leased", "running", "cancelling", "waiting_input", "waiting_takeover"] },
        },
      });
      if (active > 0) throw new Error("computer is owned by an active run");
      const fenced = await tx.computer.update({
        where: { botId },
        data: { operationFence: { increment: 1 } },
        select: { operationFence: true },
      });
      permit = {
        purpose: "lifecycle",
        operationFence: fenced.operationFence,
        bootToken,
      };
    }

    await tx.computer.update({
      where: { botId },
      data: { bootToken, state: "booting" },
    });
    return {
      providerRef: computer.providerRef ?? undefined,
      permit: permit as MutationPermit,
    };
  });

  const bootContext: AdapterContext = {
    ...context,
    botId,
    mutationPermit:
      reserved.permit.purpose === "lifecycle" ? { ...reserved.permit, bootToken } : reserved.permit,
    signal: AbortSignal.any([
      context.signal,
      AbortSignal.timeout(RUN_LEASE_DURATION_MS - RUN_LEASE_HEARTBEAT_MS),
    ]),
  };
  const homePath = resolveAgentHomePath(deps.home, botId, deps.dataDir ?? "./data");
  let ref: ComputerRef;
  try {
    if (reserved.permit.purpose === "lifecycle") {
      await deps.sandbox.quiesce(botId, bootContext);
    }
    await mkdir(homePath, { recursive: true });
    ref = await deps.sandbox.provision(
      { botId, homePath, providerRef: reserved.providerRef },
      bootContext,
    );
  } catch (error) {
    await clearBootReservation(deps.prisma, botId, bootToken, "error");
    throw error;
  }

  const committed = await deps.prisma.$transaction(async (tx) => {
    const bot = await lockBotRunLane(tx, botId, { allowDeleting: true, allowMissing: true });
    if (!bot) return "missing" as const;
    const computer = await tx.computer.findUniqueOrThrow({ where: { botId } });
    if (computer.bootToken !== bootToken) return "stale" as const;

    let valid = !bot.deletingAt && computer.operationFence === reserved.permit.operationFence;
    if (valid && reserved.permit.purpose === "run") {
      valid = Boolean(
        await tx.run.findFirst({
          where: {
            id: reserved.permit.runId,
            botId,
            status: "running",
            leaseFence: reserved.permit.runLeaseFence,
            leaseExpiresAt: { gt: new Date() },
          },
          select: { id: true },
        }),
      );
    }
    if (valid) {
      await tx.computer.update({
        where: { botId },
        data: {
          bootToken: null,
          providerRef: ref.providerRef,
          kind: ref.kind,
          state: "running",
          controlHolder,
        },
      });
      return { state: "committed" as const };
    }
    await tx.computer.update({
      where: { botId },
      data: {
        providerRef: ref.providerRef,
        kind: ref.kind,
        state: "stopping",
        controlHolder: "none",
      },
    });
    return {
      state: "stale" as const,
      operationFence: computer.operationFence,
    };
  });
  if (committed === "missing") {
    throw new Error("bot disappeared while its computer was booting");
  }
  if (committed === "stale") {
    throw new Error("computer boot reservation changed before completion");
  }
  if (committed.state === "stale") {
    const cleanupContext: AdapterContext = {
      ...context,
      operationId: `boot-cleanup:${bootToken}`,
      traceId: `boot-cleanup:${bootToken}`,
      botId,
      runId: undefined,
      signal: AbortSignal.timeout(RUN_LEASE_HEARTBEAT_MS * 3),
      mutationPermit: {
        purpose: "lifecycle",
        operationFence: committed.operationFence,
        bootToken,
      },
    };
    await deps.sandbox.quiesce(botId, cleanupContext);
    const cleared = await deps.prisma.computer.updateMany({
      where: {
        botId,
        bootToken,
        operationFence: committed.operationFence,
        providerRef: ref.providerRef,
      },
      data: { bootToken: null, state: "stopped" },
    });
    if (cleared.count !== 1) {
      throw new Error("late computer boot cleanup lost its mutation permit");
    }
    throw new Error("computer boot lost its mutation permit");
  }
  return ref;
}

async function clearBootReservation(
  prisma: PrismaClient,
  botId: string,
  bootToken: string,
  state: string,
) {
  await prisma.computer.updateMany({
    where: { botId, bootToken },
    data: { bootToken: null, state },
  });
}
