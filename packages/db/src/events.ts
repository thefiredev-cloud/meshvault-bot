import type { ProductEvent } from "@meshbot/contracts";
import type { Notification, Pool, PoolClient } from "pg";
import type { Prisma, PrismaClient } from "./client.js";

export type AppendEventInput = {
  workspaceId: string;
  threadId: string;
  botId: string;
  type: ProductEvent["type"];
  payload: Record<string, unknown>;
  runId?: string;
};

export type AppendMessageInput = {
  workspaceId: string;
  threadId: string;
  botId: string;
  role: "user" | "bot" | "system";
  blocks: unknown;
  runId?: string;
};

export async function appendEvent(
  prisma: PrismaClient,
  input: AppendEventInput,
): Promise<ProductEvent> {
  const event = await prisma.$transaction((tx) => appendEventInTransaction(tx, input));
  return {
    id: event.id,
    workspaceId: event.workspaceId,
    threadId: event.threadId,
    botId: event.botId,
    seq: event.seq,
    type: event.type as ProductEvent["type"],
    runId: event.runId ?? undefined,
    createdAt: event.createdAt.toISOString(),
    payload: event.payload as Record<string, unknown>,
  };
}

export async function appendEventInTransaction(
  tx: Prisma.TransactionClient,
  input: AppendEventInput,
) {
  await tx.$queryRaw`SELECT "id" FROM "threads" WHERE "id" = ${input.threadId} FOR UPDATE`;
  const last = await tx.event.findFirst({
    where: { threadId: input.threadId },
    orderBy: { seq: "desc" },
    select: { seq: true },
  });
  const event = await tx.event.create({
    data: {
      workspaceId: input.workspaceId,
      threadId: input.threadId,
      botId: input.botId,
      seq: (last?.seq ?? -1) + 1,
      type: input.type,
      payload: input.payload as Prisma.InputJsonValue,
      runId: input.runId,
    },
  });
  await tx.$executeRaw`SELECT pg_notify('meshbot_events', ${JSON.stringify({
    workspaceId: event.workspaceId,
    threadId: event.threadId,
    botId: event.botId,
    seq: event.seq,
  })})`;
  return event;
}

export async function appendMessageInTransaction(
  tx: Prisma.TransactionClient,
  input: AppendMessageInput,
) {
  await tx.$queryRaw`SELECT "id" FROM "threads" WHERE "id" = ${input.threadId} FOR UPDATE`;
  const last = await tx.message.findFirst({
    where: { threadId: input.threadId },
    orderBy: { seq: "desc" },
    select: { seq: true },
  });
  const message = await tx.message.create({
    data: {
      threadId: input.threadId,
      seq: (last?.seq ?? -1) + 1,
      role: input.role,
      blocks: input.blocks as Prisma.InputJsonValue,
      runId: input.runId,
    },
  });
  await appendEventInTransaction(tx, {
    workspaceId: input.workspaceId,
    threadId: input.threadId,
    botId: input.botId,
    type: "thread.message.created",
    runId: input.runId,
    payload: { messageId: message.id, role: input.role, blocks: input.blocks },
  });
  return message;
}

export async function eventsAfter(prisma: PrismaClient, threadId: string, cursor: number) {
  return prisma.event.findMany({
    where: { threadId, seq: { gt: cursor } },
    orderBy: { seq: "asc" },
  });
}

export async function* followThreadEvents(
  prisma: PrismaClient,
  threadId: string,
  cursor: number,
  pool?: Pool,
  signal?: AbortSignal,
): AsyncGenerator<Awaited<ReturnType<typeof eventsAfter>>[number]> {
  let seq = cursor;
  const client = pool ? await pool.connect() : undefined;
  try {
    if (client) await client.query("LISTEN meshbot_events");
    while (!signal?.aborted) {
      const events = await eventsAfter(prisma, threadId, seq);
      for (const event of events) {
        seq = event.seq;
        yield event;
      }
      if (signal?.aborted) break;
      if (client) await waitForThreadNotify(client, threadId, 15_000, signal);
      else await sleep(400, signal);
    }
  } finally {
    if (client) {
      await client.query("UNLISTEN meshbot_events").catch(() => undefined);
      client.release();
    }
  }
}

function waitForThreadNotify(
  client: PoolClient,
  threadId: string,
  ms: number,
  signal?: AbortSignal,
) {
  return new Promise<void>((resolve) => {
    const onNotify = (msg: Notification) => {
      if (msg.channel !== "meshbot_events") return;
      try {
        const data = JSON.parse(msg.payload ?? "{}") as { threadId?: string };
        if (data.threadId === threadId) {
          cleanup();
          resolve();
        }
      } catch {
        // ignore malformed payloads
      }
    };
    const onAbort = () => {
      cleanup();
      resolve();
    };
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    const cleanup = () => {
      clearTimeout(timer);
      client.off("notification", onNotify);
      signal?.removeEventListener("abort", onAbort);
    };
    client.on("notification", onNotify);
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) onAbort();
  });
}

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) onAbort();
  });
}
