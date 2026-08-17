import { rm } from "node:fs/promises";
import type { AdapterContext, AgentHomeStore, SandboxProvider } from "@meshbot/adapter-kit";
import type { Actor } from "@meshbot/contracts";
import { RUN_LEASE_HEARTBEAT_MS } from "@meshbot/core";
import { createRepos, type PrismaClient } from "@meshbot/db";
import { resolveAgentHomePath } from "./home.js";
import {
  cancelBotRuns,
  finalizeRunCancellation,
  lockBotRunLane,
  RUN_LANE_STATUSES,
  waitForBotQuiescence,
} from "./run-cancellation.js";

type BotDestroyDeps = {
  prisma: PrismaClient;
  sandbox: SandboxProvider;
  home: AgentHomeStore;
  dataDir?: string;
  abortRun?: (runId: string) => Promise<void>;
};

export function confirmSpawnedBotName(confirmName: string, botName: string) {
  if (confirmName !== botName) {
    return {
      ok: false as const,
      error:
        "confirm_name must exactly match the bot's name. Refusing to delete. This is permanent — double-check before retrying.",
    };
  }
  return { ok: true as const };
}

export async function spawnBot(
  deps: {
    prisma: PrismaClient;
    wakeup?: {
      enqueue: (job: { name: string; payload: Record<string, unknown> }) => Promise<void>;
    };
  },
  input: {
    spawnedBy: {
      id: string;
      name: string;
      workspaceId: string;
      userId: string;
    };
    runId: string;
    name: string;
    title?: string;
    instructions?: string;
    prompt?: string;
  },
) {
  const name = input.name.trim();
  if (!name) return { error: "Bot name is required." };

  const actor: Actor = {
    userId: input.spawnedBy.userId,
    workspaceId: input.spawnedBy.workspaceId,
    email: "",
    isDeploymentOwner: false,
  };
  const prompt = (input.prompt ?? "").trim();
  const created = await createRepos(deps.prisma).createBot(actor, {
    name,
    title: (input.title ?? "").trim(),
    description: "",
    instructions: (input.instructions ?? "").trim(),
    notifyOnFinish: true,
    parentBotId: input.spawnedBy.id,
    initial: {
      creatorName: input.spawnedBy.name,
      sourceRunId: input.runId,
      prompt,
    },
  });
  if (created.initialRunId) {
    await deps.wakeup?.enqueue({
      name: "run.continue",
      payload: { runId: created.initialRunId },
    });
  }

  return {
    ok: true as const,
    botId: created.id,
    name: created.name,
    title: created.title,
    threadId: created.threadId,
  };
}

export async function deleteSpawnedBot(
  deps: BotDestroyDeps,
  input: {
    spawnedByBotId: string;
    userId: string;
    workspaceId: string;
    confirmName: string;
    botId?: string;
  },
  context: AdapterContext,
) {
  const confirmName = input.confirmName.trim();
  if (!confirmName) {
    return { error: "confirm_name is required. Refusing to delete." };
  }

  const spawned = await deps.prisma.bot.findMany({
    where: {
      parentBotId: input.spawnedByBotId,
      userId: input.userId,
      workspaceId: input.workspaceId,
    },
  });
  const matches = input.botId
    ? spawned.filter((bot) => bot.id === input.botId)
    : spawned.filter((bot) => bot.name === confirmName);

  if (input.botId && matches.length === 0) {
    return { error: "That bot was not created by this bot. Refusing to delete." };
  }
  if (!input.botId && matches.length === 0) {
    return { error: `This bot did not create a bot named "${confirmName}". Refusing to delete.` };
  }
  if (!input.botId && matches.length > 1) {
    return {
      error: `More than one bot is named "${confirmName}". Pass bot_id as well as confirm_name.`,
    };
  }

  const target = matches[0]!;
  const confirmed = confirmSpawnedBotName(confirmName, target.name);
  if (!confirmed.ok) return confirmed;
  if (target.id === input.spawnedByBotId) {
    return { error: "A bot cannot delete itself with delete_bot." };
  }

  await destroyBot(deps, target.id, context);
  return { ok: true as const, botId: target.id, name: target.name };
}

export async function destroyBot(deps: BotDestroyDeps, botId: string, context: AdapterContext) {
  const deletion = await deps.prisma.$transaction(async (tx) => {
    const locked = await lockBotRunLane(tx, botId, {
      allowDeleting: true,
      allowMissing: true,
    });
    if (!locked) return null;
    if (!locked.deletingAt) {
      await tx.bot.update({ where: { id: botId }, data: { deletingAt: new Date() } });
    }
    const requested = await cancelBotRuns(tx, botId);
    const computer = await tx.computer.update({
      where: { botId },
      data: { operationFence: { increment: 1 }, state: "stopping" },
      select: { operationFence: true },
    });
    for (const run of requested) {
      if (run.state === "cancelling") run.operationFence = computer.operationFence;
    }
    return { requested, operationFence: computer.operationFence };
  });
  if (!deletion) return;
  for (const run of deletion.requested) {
    if (deps.abortRun) await deps.abortRun(run.id).catch(() => undefined);
    if (run.state === "cancelling") {
      await finalizeRunCancellation(deps, run.id, {
        operationFence: deletion.operationFence,
      });
    }
  }
  await waitForBotQuiescence(deps.prisma, botId, RUN_LEASE_HEARTBEAT_MS * 3, context.signal);
  const bot = await deps.prisma.$transaction(async (tx) => {
    const locked = await lockBotRunLane(tx, botId, {
      allowDeleting: true,
      allowMissing: true,
    });
    if (!locked) return null;
    const live = await tx.run.count({
      where: { botId, status: { in: [...RUN_LANE_STATUSES] } },
    });
    if (live > 0) throw new Error("bot started running again before deletion");
    return tx.bot.findUnique({
      where: { id: botId },
      include: { computer: true },
    });
  });
  if (!bot) return;
  const cleanupFence = bot.computer?.operationFence ?? deletion.operationFence;
  const cleanupProviderRef = bot.computer?.providerRef ?? null;
  const cleanupContext: AdapterContext = {
    ...context,
    operationId: "destroy.cleanup",
    traceId: "destroy.cleanup",
    botId,
    runId: undefined,
    signal: AbortSignal.any([context.signal, AbortSignal.timeout(RUN_LEASE_HEARTBEAT_MS * 3)]),
    mutationPermit: {
      purpose: "lifecycle",
      operationFence: cleanupFence,
    },
  };
  if (bot.computer?.providerRef) {
    await deps.sandbox.destroy(
      {
        id: bot.computer.providerRef,
        botId,
        kind: bot.computer.kind as never,
        providerRef: bot.computer.providerRef,
      },
      cleanupContext,
    );
  }
  await deps.prisma.$transaction(async (tx) => {
    const locked = await lockBotRunLane(tx, botId, {
      allowDeleting: true,
      allowMissing: true,
    });
    if (!locked) return;
    const computer = await tx.computer.findUniqueOrThrow({ where: { botId } });
    if (
      computer.operationFence !== cleanupFence ||
      computer.providerRef !== cleanupProviderRef ||
      computer.bootToken
    ) {
      throw new Error("bot cleanup ownership changed before deletion");
    }
    await tx.bot.delete({ where: { id: botId } });
  });
  await rm(resolveAgentHomePath(deps.home, botId, deps.dataDir ?? "./data"), {
    recursive: true,
    force: true,
  });
}
