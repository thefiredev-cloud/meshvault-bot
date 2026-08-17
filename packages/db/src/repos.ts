import { type Actor, BOT_COLORS, type Bot } from "@meshbot/contracts";
import type { PrismaClient } from "./client.js";
import { IsolationError } from "./scope.js";

function mapBot(
  bot: {
    id: string;
    workspaceId: string;
    name: string;
    title: string;
    description: string;
    instructions: string;
    color: string;
    notifyOnFinish: boolean;
    modelProvider: string | null;
    modelId: string | null;
    parentBotId: string | null;
    createdAt: Date;
    updatedAt: Date;
    thread: { id: string } | null;
  },
  preview = "",
  status = "idle",
): Bot {
  if (!bot.thread) {
    throw new IsolationError("Bot is missing its thread");
  }
  return {
    id: bot.id,
    workspaceId: bot.workspaceId,
    name: bot.name,
    title: bot.title,
    description: bot.description,
    instructions: bot.instructions,
    color: bot.color,
    notifyOnFinish: bot.notifyOnFinish,
    modelProvider: bot.modelProvider,
    modelId: bot.modelId,
    parentBotId: bot.parentBotId,
    threadId: bot.thread.id,
    preview,
    status,
    createdAt: bot.createdAt.toISOString(),
    updatedAt: bot.updatedAt.toISOString(),
  };
}

export function createRepos(prisma: PrismaClient) {
  return {
    async listBots(actor: Actor): Promise<Bot[]> {
      const bots = await prisma.bot.findMany({
        where: { workspaceId: actor.workspaceId, userId: actor.userId },
        include: { thread: true },
        orderBy: { updatedAt: "desc" },
      });
      const previews = await Promise.all(
        bots.map(async (bot) => {
          if (bot.deletingAt) return { preview: "Cleanup pending", status: "deleting" };
          if (!bot.thread) return { preview: "", status: "idle" };
          const last = await prisma.message.findFirst({
            where: { threadId: bot.thread.id },
            orderBy: { seq: "desc" },
          });
          const run = await prisma.run.findFirst({
            where: {
              botId: bot.id,
              status: {
                in: [
                  "running",
                  "queued",
                  "leased",
                  "cancelling",
                  "waiting_input",
                  "waiting_takeover",
                ],
              },
            },
            orderBy: { createdAt: "desc" },
          });
          let preview = "";
          if (last) {
            const blocks = last.blocks as Array<{ kind?: string; text?: string }>;
            preview = blocks.find((b) => b.text)?.text ?? "";
          }
          return { preview, status: run?.status ?? "idle" };
        }),
      );
      return bots.map((bot, i) => mapBot(bot, previews[i]?.preview, previews[i]?.status));
    },

    async getBot(actor: Actor, botId: string) {
      const bot = await prisma.bot.findFirst({
        where: { id: botId, workspaceId: actor.workspaceId, userId: actor.userId },
        include: { thread: true, computer: true },
      });
      if (!bot) throw new IsolationError();
      return bot;
    },

    async createBot(
      actor: Actor,
      input: {
        name: string;
        title: string;
        description: string;
        instructions: string;
        notifyOnFinish: boolean;
        color?: string;
        modelProvider?: string | null;
        modelId?: string | null;
        parentBotId?: string | null;
        initial?: {
          creatorName: string;
          sourceRunId: string;
          prompt: string;
        };
      },
    ): Promise<Bot & { initialRunId?: string }> {
      const count = await prisma.bot.count({
        where: { workspaceId: actor.workspaceId, userId: actor.userId },
      });
      const color = input.color ?? BOT_COLORS[count % BOT_COLORS.length] ?? BOT_COLORS[0];
      const settings = await prisma.deploymentSettings.findUnique({ where: { id: "default" } });
      const envKind = process.env.SANDBOX_PROVIDER ?? "docker";
      const kind =
        envKind === "docker" && settings?.computerHost === "this-mac" ? "desktop" : envKind;
      const result = await prisma.$transaction(async (tx) => {
        if (input.parentBotId) {
          const [parent] = await tx.$queryRaw<
            Array<{
              id: string;
              workspaceId: string;
              userId: string;
              deletingAt: Date | null;
            }>
          >`SELECT "id", "workspaceId", "userId", "deletingAt"
            FROM "bots" WHERE "id" = ${input.parentBotId} FOR UPDATE`;
          if (
            !parent ||
            parent.workspaceId !== actor.workspaceId ||
            parent.userId !== actor.userId ||
            parent.deletingAt
          ) {
            throw new IsolationError();
          }
        } else if (input.initial) {
          throw new IsolationError("Spawned bots require a parent");
        }
        const created = await tx.bot.create({
          data: {
            workspaceId: actor.workspaceId,
            userId: actor.userId,
            name: input.name,
            title: input.title,
            description: input.description,
            instructions: input.instructions,
            notifyOnFinish: input.notifyOnFinish,
            color,
            modelProvider: input.modelProvider ?? null,
            modelId: input.modelId ?? null,
            parentBotId: input.parentBotId ?? null,
          },
        });
        const thread = await tx.thread.create({
          data: {
            workspaceId: actor.workspaceId,
            botId: created.id,
            userId: actor.userId,
          },
        });
        await tx.computer.create({
          data: {
            workspaceId: actor.workspaceId,
            botId: created.id,
            userId: actor.userId,
            kind,
            state: "stopped",
          },
        });
        await tx.agentHome.create({
          data: {
            workspaceId: actor.workspaceId,
            botId: created.id,
            userId: actor.userId,
          },
        });
        await tx.browserProfile.create({
          data: {
            workspaceId: actor.workspaceId,
            botId: created.id,
            userId: actor.userId,
          },
        });
        await tx.memoryDocument.create({
          data: {
            workspaceId: actor.workspaceId,
            userId: actor.userId,
            botId: created.id,
            scope: "bot",
            path: "MEMORY.md",
            content: `# ${input.name}\n\n`,
          },
        });
        let initialRunId: string | undefined;
        if (input.initial) {
          await tx.message.create({
            data: {
              threadId: thread.id,
              seq: 0,
              role: "system",
              blocks: [{ kind: "meta", text: `Created by ${input.initial.creatorName}` }],
              runId: input.initial.sourceRunId,
            },
          });
          if (input.initial.prompt) {
            await tx.message.create({
              data: {
                threadId: thread.id,
                seq: 1,
                role: "user",
                blocks: [{ kind: "text", text: input.initial.prompt }],
                runId: input.initial.sourceRunId,
              },
            });
            const task = await tx.task.create({
              data: {
                workspaceId: actor.workspaceId,
                botId: created.id,
                threadId: thread.id,
                userId: actor.userId,
                prompt: input.initial.prompt,
                status: "queued",
              },
            });
            const run = await tx.run.create({
              data: {
                workspaceId: actor.workspaceId,
                botId: created.id,
                threadId: thread.id,
                taskId: task.id,
                userId: actor.userId,
                status: "queued",
                trigger: "spawn",
              },
            });
            initialRunId = run.id;
          }
        }
        const bot = await tx.bot.findFirstOrThrow({
          where: { id: created.id },
          include: { thread: true },
        });
        return { bot, initialRunId };
      });
      const bot = mapBot(result.bot);
      return result.initialRunId ? { ...bot, initialRunId: result.initialRunId } : bot;
    },
  };
}
