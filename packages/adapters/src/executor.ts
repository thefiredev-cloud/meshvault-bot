import {
  type AdapterContext,
  type AgentHomeStore,
  type AgentRuntime,
  type ComputerRef,
  type ConnectorProvider,
  isOwnerApprovalRequired,
  type MemoryStore,
  type NotificationMessage,
  type NotificationProvider,
  type OwnerApprovalRequired,
  type SandboxProvider,
  type WakeupDriver,
} from "@meshbot/adapter-kit";
import type { Actor, MessageBlock, RunStatus } from "@meshbot/contracts";
import {
  assertTransition,
  canAcquireRunLease,
  containsSecret,
  limitCommandOutput,
  nextCronDate,
  nextFence,
  ownerApprovalCheckpoint,
  parseOwnerApprovalCheckpoint,
  RUN_LEASE_DURATION_MS,
  RUN_LEASE_HEARTBEAT_MS,
  redactSecrets,
  SANDBOX_COMMAND_MAX_OUTPUT_BYTES,
  SANDBOX_COMMAND_TIMEOUT_MS,
  shouldYieldToOwnerApproval,
} from "@meshbot/core";
import {
  appendEvent,
  appendEventInTransaction,
  appendMessageInTransaction,
  type Prisma,
  type PrismaClient,
} from "@meshbot/db";
import { builtinAgentTools } from "./builtin-tools.js";
import { deleteSpawnedBot, spawnBot } from "./child-bots.js";
import { collectLogIds } from "./composio-connector.js";
import { scheduleComputerSleep } from "./computer-idle.js";
import { provisionComputer } from "./computer-provision.js";
import {
  hasAmbientPiProviderAuth,
  isKnownPiModel,
  type PiModelSelection,
  requireKnownPiModel,
} from "./pi-models.js";
import { parseModelSecret, resolveModelApiKey, secretValuesToRedact } from "./pi-oauth.js";
import {
  finalizeRunCancellation,
  lockBotRunLane,
  quiesceRunOperations,
  runMutationPermit,
} from "./run-cancellation.js";
import { inferScript } from "./scripted-runtime.js";
import type { EncryptedSecretStore } from "./secrets.js";

export interface ExecutorDeps {
  prisma: PrismaClient;
  runtime: AgentRuntime;
  sandbox: SandboxProvider;
  memory: MemoryStore;
  home: AgentHomeStore;
  connector?: ConnectorProvider;
  secrets: string[];
  secretStore?: EncryptedSecretStore;
  deploymentModelKey?: string;
  dataDir?: string;
  notifications?: NotificationProvider;
  wakeup?: WakeupDriver;
}

type StoredModelSelection = {
  modelProvider: string | null;
  modelId: string | null;
};

const OWNER_APPROVAL_TOOLS = new Set([
  "shell",
  "delete_bot",
  "destination.write",
  "COMPOSIO_MULTI_EXECUTE_TOOL",
  "COMPOSIO_MANAGE_CONNECTIONS",
  "COMPOSIO_REMOTE_WORKBENCH",
  "COMPOSIO_REMOTE_BASH_TOOL",
]);

const OWNER_APPROVAL_ACTIONS = [
  { id: "approve", label: "Approve" },
  { id: "deny", label: "Deny" },
];
const MAX_APPROVED_SHELL_COMMAND_CHARS = 800;
const MAX_APPROVED_SHELL_CWD_CHARS = 200;
const SANDBOX_SHELL_PATH =
  "/opt/homebrew/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin";
const APPROVAL_CONTROL = /[\p{Cc}\p{Cf}]/u;

function containsApprovalControl(value: string): boolean {
  return APPROVAL_CONTROL.test(value);
}

export function requiresOwnerApproval(name: string): boolean {
  return OWNER_APPROVAL_TOOLS.has(name);
}

export function approvalRequestError(
  name: string,
  args: Record<string, unknown>,
  runSecrets: string[] = [],
): string | undefined {
  if (name !== "shell") return undefined;
  const command = String(args.command ?? args.cmd ?? "");
  if (!command.trim()) return "shell command is required";
  if (command.includes("\0")) return "shell command cannot contain a NUL byte";
  if (containsApprovalControl(command)) {
    return "shell command cannot contain control or bidirectional formatting characters";
  }
  if (
    command.length > MAX_APPROVED_SHELL_COMMAND_CHARS ||
    redactSecrets(command, runSecrets).length > MAX_APPROVED_SHELL_COMMAND_CHARS
  ) {
    return `shell command exceeds the ${MAX_APPROVED_SHELL_COMMAND_CHARS}-character approval display; split it into smaller commands`;
  }
  if (args.cwd !== undefined) {
    const cwd = String(args.cwd);
    if (containsApprovalControl(cwd)) {
      return "shell working directory cannot contain control or bidirectional formatting characters";
    }
    if (
      cwd.length > MAX_APPROVED_SHELL_CWD_CHARS ||
      redactSecrets(cwd, runSecrets).length > MAX_APPROVED_SHELL_CWD_CHARS
    ) {
      return `shell working directory exceeds the ${MAX_APPROVED_SHELL_CWD_CHARS}-character approval display`;
    }
  }
  return undefined;
}

export function sandboxShellArgv(command: string): string[] {
  return [
    "/usr/bin/env",
    "-u",
    "BASH_ENV",
    "-u",
    "ENV",
    `PATH=${SANDBOX_SHELL_PATH}`,
    "/bin/bash",
    "--noprofile",
    "--norc",
    "-c",
    command,
  ];
}

export function sandboxCommandResult(stdout: string, stderr: string, code: number | undefined) {
  if (code === 0) return { stdout, stderr, code };
  const exitCode = code ?? 1;
  return {
    stdout,
    stderr,
    code: exitCode,
    error:
      code === undefined ? "command returned no exit status" : `command exited with code ${code}`,
  };
}

export async function recallAgentMemory(
  memory: MemoryStore,
  botId: string,
  query: string,
  context: AdapterContext,
) {
  const boundedQuery = query.trim().slice(0, 500);
  if (!boundedQuery) return [];
  const [botResults, userResults] = await Promise.all([
    memory.search({ query: boundedQuery, scope: "bot", botId, limit: 5 }, context),
    memory.search({ query: boundedQuery, scope: "user", limit: 5 }, context),
  ]);
  return [
    ...botResults.slice(0, 5).map((result) => ({ scope: "bot" as const, ...result })),
    ...userResults.slice(0, 5).map((result) => ({ scope: "user" as const, ...result })),
  ];
}

export function resolveBotModelSelection(
  run: StoredModelSelection,
  bot: StoredModelSelection,
  workspaceDefault: { provider: string; defaultModel: string | null } | null,
  deploymentDefault: { defaultModelProvider: string | null; defaultModelId: string | null } | null,
  isKnown: (candidate: PiModelSelection) => boolean = isKnownPiModel,
): PiModelSelection {
  const pairs = [
    { source: "resumed run", provider: run.modelProvider, id: run.modelId },
    { source: "bot", provider: bot.modelProvider, id: bot.modelId },
    {
      source: "workspace default",
      provider: workspaceDefault?.provider,
      id: workspaceDefault?.defaultModel,
    },
    {
      source: "deployment default",
      provider: deploymentDefault?.defaultModelProvider,
      id: deploymentDefault?.defaultModelId,
    },
  ];
  for (const pair of pairs) {
    const hasProvider = Boolean(pair.provider);
    const hasModel = Boolean(pair.id);
    if (hasProvider !== hasModel) {
      throw new Error(`Incomplete ${pair.source} model selection`);
    }
    if (pair.provider && pair.id) {
      return requireKnownPiModel({ provider: pair.provider, id: pair.id }, isKnown);
    }
  }
  return requireKnownPiModel({ provider: "scripted", id: "scripted" }, isKnown);
}

export async function requireBotModelAccess(
  selection: PiModelSelection,
  options: {
    scriptedRuntime: boolean;
    credentialPresent: boolean;
    apiKey?: string;
    hasAmbientAuth?: (providerId: string) => Promise<boolean>;
  },
): Promise<void> {
  if (options.scriptedRuntime) return;
  if (selection.provider === "scripted") {
    throw new Error("Choose a model before running the production model runtime");
  }
  if (options.apiKey?.trim()) return;
  const hasAmbientAuth = options.credentialPresent
    ? false
    : await (options.hasAmbientAuth ?? hasAmbientPiProviderAuth)(selection.provider);
  if (!hasAmbientAuth) {
    throw new Error(
      `No workspace credential or configured provider authentication for ${selection.provider}`,
    );
  }
}

export function createRunExecutor(deps: ExecutorDeps) {
  const activeRunControllers = new Map<
    string,
    { fence: number; controller: AbortController; settled: Promise<void> }
  >();
  const abortRun = async (runId: string) => {
    const active = activeRunControllers.get(runId);
    active?.controller.abort();
    try {
      await deps.runtime.abort(runId);
    } finally {
      await active?.settled;
    }
  };

  return {
    abortRun,

    async wakeRoutine(routineId: string, workerId: string) {
      const run = await deps.prisma.$transaction(async (tx) => {
        const routine = await tx.routine.findUnique({ where: { id: routineId } });
        if (!routine?.active) return null;
        const locked = await lockBotRunLane(tx, routine.botId, {
          allowDeleting: true,
          allowMissing: true,
        });
        if (!locked || locked.deletingAt) return null;
        const bot = await tx.bot.findUnique({
          where: { id: routine.botId },
          include: { thread: true },
        });
        if (!bot?.thread) return null;
        const task = await tx.task.create({
          data: {
            workspaceId: routine.workspaceId,
            botId: bot.id,
            threadId: bot.thread.id,
            userId: routine.userId,
            prompt: routine.prompt,
            status: "queued",
          },
        });
        const created = await tx.run.create({
          data: {
            workspaceId: routine.workspaceId,
            botId: bot.id,
            threadId: bot.thread.id,
            taskId: task.id,
            userId: routine.userId,
            status: "queued",
            trigger: "routine",
          },
        });
        const now = new Date();
        await tx.routine.update({
          where: { id: routine.id },
          data: {
            lastRunAt: now,
            nextRunAt: nextCronDate(routine.cron, now, routine.timezone),
          },
        });
        return created;
      });
      if (!run) return;
      await this.continueRun(run.id, workerId);
    },

    async continueRun(runId: string, workerId: string) {
      const runRef = await deps.prisma.run.findUnique({
        where: { id: runId },
        select: { botId: true, status: true },
      });
      if (!runRef) return;
      if (["completed", "failed", "cancelled"].includes(runRef.status)) return;
      if (runRef.status === "cancelling") {
        await finalizeRunCancellation(deps, runId, { expiredAt: new Date() });
        await wakeNextQueuedRun(deps, runRef.botId);
        return;
      }
      const leaseStartedAt = new Date();
      const claim = await deps.prisma.$transaction(async (tx) => {
        await lockBotRunLane(tx, runRef.botId);
        const run = await tx.run.findUnique({ where: { id: runId } });
        if (!run || ["completed", "failed", "cancelled"].includes(run.status)) return null;
        const approvalCheckpoint = parseOwnerApprovalCheckpoint(run.checkpoint);
        if (run.status === "waiting_input" && approvalCheckpoint && !approvalCheckpoint.decision) {
          return null;
        }
        if (!canAcquireRunLease(run.status as RunStatus, run.leaseExpiresAt, leaseStartedAt)) {
          return null;
        }
        const currentComputer = await tx.computer.findUnique({ where: { botId: run.botId } });
        if (!currentComputer || currentComputer.bootToken) return null;
        const occupied = await tx.run.findFirst({
          where: {
            botId: run.botId,
            id: { not: run.id },
            status: {
              in: ["leased", "running", "cancelling", "waiting_input", "waiting_takeover"],
            },
          },
          select: { id: true },
        });
        if (occupied) return null;

        const fence = nextFence(run.leaseFence);
        const leased = await tx.run.updateMany({
          where: {
            id: runId,
            status: run.status,
            leaseFence: run.leaseFence,
            ...(run.status === "leased" || run.status === "running"
              ? { leaseExpiresAt: { lte: leaseStartedAt } }
              : {}),
          },
          data: {
            status: "leased",
            leaseOwner: workerId,
            leaseFence: fence,
            leaseExpiresAt: new Date(leaseStartedAt.getTime() + RUN_LEASE_DURATION_MS),
          },
        });
        if (leased.count !== 1) return null;
        const computer = await tx.computer.update({
          where: { botId: run.botId },
          data: { operationFence: { increment: 1 }, state: "stopping" },
          select: { operationFence: true },
        });
        return {
          run,
          fence,
          operationFence: computer.operationFence,
          approvalCheckpoint,
          resumeFromTakeover: run.status === "waiting_takeover" || run.checkpoint === "takeover",
        };
      });
      if (!claim) return;
      const { run, fence, operationFence, approvalCheckpoint, resumeFromTakeover } = claim;
      const runController = new AbortController();
      const bot = await deps.prisma.bot.findUniqueOrThrow({ where: { id: run.botId } });
      const mutationPermit = runMutationPermit(operationFence, runId, fence);
      const fenceContext: AdapterContext = {
        operationId: `claim:${runId}`,
        traceId: runId,
        workspaceId: run.workspaceId,
        userId: run.userId,
        botId: run.botId,
        runId,
        signal: runController.signal,
        mutationPermit,
      };
      await deps.sandbox.quiesce(run.botId, fenceContext);
      const activated = await deps.prisma.$transaction(async (tx) => {
        await lockBotRunLane(tx, run.botId);
        const computer = await tx.computer.findUnique({ where: { botId: run.botId } });
        if (computer?.operationFence !== operationFence) return false;
        assertTransition("leased", "running");
        const running = await tx.run.updateMany({
          where: {
            id: runId,
            status: "leased",
            leaseOwner: workerId,
            leaseFence: fence,
            leaseExpiresAt: { gt: new Date() },
          },
          data: { status: "running", startedAt: run.startedAt ?? new Date() },
        });
        if (running.count !== 1) return false;
        await tx.computer.update({
          where: { botId: run.botId },
          data: { state: "stopped", controlHolder: "none" },
        });
        await tx.attempt.create({ data: { runId, fence, status: "running" } });
        return true;
      });
      if (!activated) return;
      let settleRun!: () => void;
      const settled = new Promise<void>((resolve) => {
        settleRun = resolve;
      });
      const registered = activeRunControllers.get(runId);
      if (registered && registered.fence >= fence) {
        runController.abort();
        settleRun();
        return;
      }
      registered?.controller.abort();
      activeRunControllers.set(runId, { fence, controller: runController, settled });
      const stopLeaseMonitor = await startRunLeaseMonitor(
        deps,
        runId,
        workerId,
        fence,
        runController,
      );
      if (!stopLeaseMonitor) {
        if (activeRunControllers.get(runId)?.controller === runController) {
          activeRunControllers.delete(runId);
        }
        await finalizeRunCancellation(deps, runId, {
          leaseOwner: workerId,
          leaseFence: fence,
        });
        await wakeNextQueuedRun(deps, run.botId);
        settleRun();
        return;
      }

      try {
        const thread = await deps.prisma.thread.findUniqueOrThrow({ where: { id: run.threadId } });
        const messages = await deps.prisma.message.findMany({
          where: { threadId: thread.id },
          orderBy: { seq: "asc" },
        });
        const task = await deps.prisma.task.findUniqueOrThrow({ where: { id: run.taskId } });
        const actor: Actor = {
          userId: run.userId,
          workspaceId: run.workspaceId,
          email: "",
          isDeploymentOwner: false,
        };
        const connectedPlugins = await deps.prisma.connection.findMany({
          where: { userId: run.userId, workspaceId: run.workspaceId, status: "connected" },
          select: { provider: true, displayName: true },
        });
        const context = {
          operationId: runId,
          traceId: runId,
          workspaceId: run.workspaceId,
          userId: run.userId,
          botId: bot.id,
          runId,
          signal: runController.signal,
          connectedProviders: connectedPlugins.map((row) => row.provider),
          mutationPermit,
        };

        const modelAccess = await (async () => {
          try {
            await appendEvent(deps.prisma, {
              workspaceId: run.workspaceId,
              threadId: thread.id,
              botId: bot.id,
              type: "run.started",
              runId,
              payload: { trigger: run.trigger },
            });
            const workspaceDefault = await deps.prisma.userModelCredential.findFirst({
              where: { userId: run.userId, workspaceId: run.workspaceId, isDefault: true },
            });
            const settings = await deps.prisma.deploymentSettings.findUnique({
              where: { id: "default" },
            });
            const selection = resolveBotModelSelection(run, bot, workspaceDefault, settings);
            const credential =
              workspaceDefault?.provider === selection.provider
                ? workspaceDefault
                : await deps.prisma.userModelCredential.findFirst({
                    where: {
                      userId: run.userId,
                      workspaceId: run.workspaceId,
                      provider: selection.provider,
                    },
                  });
            await deps.prisma.run.update({
              where: { id: runId },
              data: { modelProvider: selection.provider, modelId: selection.id },
            });
            const resolved = await resolveModelKey(deps, run.userId, run.workspaceId, credential);
            const apiKey = resolved.apiKey;
            const scripted = deps.runtime.describe().capabilities.scripted;
            await requireBotModelAccess(selection, {
              scriptedRuntime: scripted,
              credentialPresent: Boolean(credential),
              apiKey,
            });
            return {
              selection,
              apiKey,
              scripted,
              runSecrets: [...deps.secrets, ...resolved.redact],
            };
          } catch (error) {
            await failRun(deps, run, bot, workerId, fence, error);
            return null;
          }
        })();
        if (!modelAccess) return;
        const { selection, apiKey, scripted, runSecrets } = modelAccess;
        const discovered = deps.connector ? await deps.connector.discoverTools(context) : [];
        const tools = [
          ...builtinAgentTools,
          ...discovered.filter((tool) => !builtinAgentTools.some((b) => b.name === tool.name)),
        ];
        const history = messages.map((m) => ({
          role: (m.role === "user" ? "user" : m.role === "system" ? "system" : "assistant") as
            | "user"
            | "assistant"
            | "system",
          content: blocksToText(m.blocks as MessageBlock[]),
        }));
        if (!(await currentRunLease(deps, runId, workerId, fence, operationFence))) return;
        const computer = await ensureComputer(deps, bot.id, context);
        if (
          runController.signal.aborted ||
          !(await currentRunLease(deps, runId, workerId, fence, operationFence))
        ) {
          return;
        }

        let assembled = "";
        let lastProgressAt = 0;
        const script = scripted
          ? approvalCheckpoint?.decision
            ? [
                {
                  assistant:
                    approvalCheckpoint.decision === "approve"
                      ? "The approved action finished."
                      : "The action was denied and was not run.",
                  complete: true,
                },
              ]
            : inferScript(task.prompt, resumeFromTakeover ? "takeover" : undefined)
          : undefined;

        const executeTool = async (
          name: string,
          args: Record<string, unknown>,
          executionId: string,
        ) => {
          if (
            runController.signal.aborted ||
            !(await currentRunLease(deps, runId, workerId, fence, operationFence))
          ) {
            return { error: "run is no longer active", executionId };
          }
          if (name === "write_file") {
            const filePath = String(args.path ?? "notes/result.txt");
            const content = String(args.content ?? "");
            await deps.home.writeFile(bot.id, filePath, content, context);
            return { ok: true, path: filePath };
          }
          if (name === "shell") {
            const command = String(args.command ?? args.cmd ?? "");
            const cwd = String(args.cwd ?? (computer.kind === "desktop" ? "." : "/home/meshbot"));
            return runSandboxCommand(
              deps.sandbox,
              computer,
              sandboxShellArgv(command),
              cwd,
              context,
            );
          }
          if (name === "remember") {
            await deps.memory.commit(
              {
                scope: "bot",
                botId: bot.id,
                path: String(args.path ?? "MEMORY.md"),
                content: String(args.content ?? ""),
                sourceRunId: runId,
                sourceThreadId: thread.id,
              },
              context,
            );
            return { ok: true };
          }
          if (name === "recall_memory") {
            const query = String(args.query ?? "").trim();
            if (!query) return { ok: false, error: "query is required" };
            return {
              ok: true,
              results: await recallAgentMemory(deps.memory, bot.id, query, context),
            };
          }
          if (name === "request_takeover") return { ok: true };
          if (name === "run_subagent") {
            return {
              ok: true,
              result: String(args.task ?? "done."),
            };
          }
          if (name === "spawn_bot") {
            const spawned = await spawnBot(deps, {
              spawnedBy: {
                id: bot.id,
                name: bot.name,
                workspaceId: bot.workspaceId,
                userId: run.userId,
              },
              runId,
              name: String(args.name ?? ""),
              title: args.title ? String(args.title) : undefined,
              instructions: args.instructions ? String(args.instructions) : undefined,
              prompt: args.prompt ? String(args.prompt) : undefined,
            });
            if ("error" in spawned) return spawned;
            await publishMessage(deps, actor, thread.id, bot.id, runId, "bot", [
              {
                kind: "child_bot",
                botId: spawned.botId,
                name: spawned.name,
                title: spawned.title,
                status: "created",
              },
            ]);
            await appendEvent(deps.prisma, {
              workspaceId: run.workspaceId,
              threadId: thread.id,
              botId: bot.id,
              runId: run.id,
              type: "bot.spawned",
              payload: { childBotId: spawned.botId, name: spawned.name },
            });
            return spawned;
          }
          if (name === "delete_bot") {
            const removed = await deleteSpawnedBot(
              { ...deps, abortRun },
              {
                spawnedByBotId: bot.id,
                userId: run.userId,
                workspaceId: run.workspaceId,
                confirmName: String(args.confirm_name ?? args.confirmName ?? ""),
                botId: args.bot_id
                  ? String(args.bot_id)
                  : args.botId
                    ? String(args.botId)
                    : undefined,
              },
              context,
            );
            if ("error" in removed) return removed;
            await publishMessage(deps, actor, thread.id, bot.id, runId, "bot", [
              {
                kind: "child_bot",
                botId: removed.botId,
                name: removed.name,
                status: "deleted",
              },
            ]);
            await appendEvent(deps.prisma, {
              workspaceId: run.workspaceId,
              threadId: thread.id,
              botId: bot.id,
              runId: run.id,
              type: "bot.deleted",
              payload: { childBotId: removed.botId, name: removed.name },
            });
            return removed;
          }
          if (deps.connector) {
            let result: unknown = { error: `unknown tool ${name}` };
            for await (const event of deps.connector.execute(
              { tool: name, args, executionId },
              context,
            )) {
              if (event.type === "result") {
                result = event.data;
                const logIds = collectLogIds(event.data);
                for (const logId of logIds) {
                  await appendEvent(deps.prisma, {
                    workspaceId: run.workspaceId,
                    threadId: thread.id,
                    botId: bot.id,
                    runId: run.id,
                    type: "effect.recorded",
                    payload: { tool: name, logId },
                  });
                }
              }
              if (event.type === "error") result = { error: event.message };
            }
            return result;
          }
          return { error: `unknown tool ${name}` };
        };
        const executeWithEffect = withEffectLifecycle(
          deps,
          run,
          { owner: workerId, fence, operationFence },
          executeTool,
        );
        const applyTool = withOwnerApproval(
          deps,
          run,
          { name: bot.name, notifyOnFinish: bot.notifyOnFinish },
          runSecrets,
          approvalCheckpoint,
          { owner: workerId, fence, operationFence },
          runController.signal,
          executeWithEffect,
        );

        const pluginLine =
          connectedPlugins.length > 0
            ? `Connected plugins: ${connectedPlugins.map((row) => `${row.displayName} (${row.provider})`).join(", ")}. Use those plugin tools when the user asks about those apps.`
            : "No plugins are connected yet.";

        const approvalInstruction = approvalCheckpoint?.decision
          ? await resumeOwnerApproval(
              deps,
              run,
              approvalCheckpoint,
              runSecrets,
              { owner: workerId, fence, operationFence },
              executeTool,
            )
          : "";
        for await (const event of deps.runtime.run(
          {
            botId: bot.id,
            threadId: thread.id,
            runId,
            prompt: task.prompt,
            instructions: [
              bot.instructions || `${bot.name}: ${bot.title}\n${bot.description}`,
              "You have a persistent computer. Use write_file to save files into your home (they appear in Files). Use shell to run commands in that computer. Use remember for durable facts. Use request_takeover when the user must type on the screen. Use destination.write only for connected destination records.",
              "A bot and a subagent are different. Never use both for the same request.",
              "spawn_bot creates a lasting regular bot (own chat, computer, memory) that appears in the user's bot list. If the user asked to create a bot, call spawn_bot once and stop. Do not run_subagent to demo it.",
              "run_subagent is a short helper inside this turn only. It is not a bot, has no thread, and does not show in the list. Use it for parallel work you will summarize here.",
              "delete_bot permanently destroys a bot this bot created, and only that bot. Only delete when the user asked or that bot is finished and unused. confirm_name must exactly match its name.",
              pluginLine,
              approvalInstruction,
              "Never print API keys, access tokens, or secret values. Prefer tools over claiming you already did the work.",
            ]
              .filter(Boolean)
              .join("\n\n"),
            history,
            tools,
            model: {
              provider: selection.provider,
              id: selection.id,
              apiKey,
            },
            resumeFromCheckpoint: resumeFromTakeover ? "takeover" : undefined,
            script,
            executeTool: scripted ? undefined : applyTool,
          },
          context,
        )) {
          const still = await deps.prisma.run.findUnique({ where: { id: runId } });
          if (
            runController.signal.aborted ||
            still?.status !== "running" ||
            still.leaseOwner !== workerId ||
            still.leaseFence !== fence ||
            !still.leaseExpiresAt ||
            still.leaseExpiresAt.getTime() <= Date.now() ||
            shouldYieldToOwnerApproval(run.checkpoint, still.checkpoint)
          ) {
            return;
          }

          if (event.type === "text") {
            assembled += event.text;
            const now = Date.now();
            if (!scripted && assembled.trim() && now - lastProgressAt >= 80) {
              lastProgressAt = now;
              await appendEvent(deps.prisma, {
                workspaceId: run.workspaceId,
                threadId: thread.id,
                botId: bot.id,
                type: "thread.progress",
                runId,
                payload: { text: assembled, streaming: true },
              });
            }
          } else if (event.type === "progress") {
            await appendEvent(deps.prisma, {
              workspaceId: run.workspaceId,
              threadId: thread.id,
              botId: bot.id,
              type: "thread.progress",
              runId,
              payload: { text: event.text },
            });
          } else if (event.type === "ask") {
            if (
              !(await quiesceRunOperations(deps, run, {
                leaseOwner: workerId,
                leaseFence: fence,
              }))
            ) {
              return;
            }
            const blocks: MessageBlock[] = [
              { kind: "ask", text: event.text, detail: event.detail },
            ];
            const waiting = await deps.prisma.$transaction(async (tx) => {
              const changed = await tx.run.updateMany({
                where: {
                  id: runId,
                  status: "running",
                  leaseOwner: workerId,
                  leaseFence: fence,
                  leaseExpiresAt: { gt: new Date() },
                },
                data: { status: "waiting_input", checkpoint: null },
              });
              if (changed.count !== 1) return false;
              await publishMessageInTransaction(
                tx,
                run.workspaceId,
                thread.id,
                bot.id,
                runId,
                "bot",
                blocks,
              );
              return true;
            });
            if (!waiting) return;
            if (await runHasStatus(deps.prisma, runId, "waiting_input")) {
              await notifyRun(
                deps,
                run,
                {
                  kind: "help",
                  title: `${bot.name} needs an answer`,
                  body: event.text,
                  botId: bot.id,
                  threadId: thread.id,
                },
                runController.signal,
              );
            }
            return;
          } else if (event.type === "takeover") {
            const waiting = await deps.prisma.$transaction(async (tx) => {
              const changed = await tx.run.updateMany({
                where: {
                  id: runId,
                  status: "running",
                  leaseOwner: workerId,
                  leaseFence: fence,
                  leaseExpiresAt: { gt: new Date() },
                },
                data: { status: "waiting_takeover", checkpoint: "takeover" },
              });
              if (changed.count !== 1) return false;
              await tx.computer.updateMany({
                where: { botId: bot.id },
                data: { state: "running", controlHolder: "none", controlRunId: null },
              });
              if (assembled.trim()) {
                await publishMessageInTransaction(
                  tx,
                  run.workspaceId,
                  thread.id,
                  bot.id,
                  runId,
                  "bot",
                  [{ kind: "text", text: assembled }],
                );
              }
              await publishMessageInTransaction(
                tx,
                run.workspaceId,
                thread.id,
                bot.id,
                runId,
                "bot",
                [{ kind: "computer", state: "Ready", text: event.reason }],
              );
              await appendEventInTransaction(tx, {
                workspaceId: run.workspaceId,
                threadId: thread.id,
                botId: bot.id,
                type: "computer.takeover.requested",
                runId,
                payload: { reason: event.reason },
              });
              return true;
            });
            if (!waiting) return;
            if (await runHasStatus(deps.prisma, runId, "waiting_takeover")) {
              await notifyRun(
                deps,
                run,
                {
                  kind: "takeover",
                  title: `${bot.name} needs you on the screen`,
                  body: event.reason,
                  botId: bot.id,
                  threadId: thread.id,
                },
                runController.signal,
              );
            }
            return;
          } else if (event.type === "tool") {
            if (scripted) {
              const result = await applyTool(event.name, event.args, event.executionId);
              if (isOwnerApprovalRequired(result)) return;
            }
          } else if (event.type === "subagent") {
            await appendEvent(deps.prisma, {
              workspaceId: run.workspaceId,
              threadId: thread.id,
              botId: bot.id,
              type: "thread.subagent",
              runId,
              payload: {
                agentId: event.agentId,
                name: event.name,
                task: event.task,
                status: event.status,
                progress: event.progress,
                result: event.result,
              },
            });
            if (event.status === "completed" || event.status === "failed") {
              await publishMessage(deps, actor, thread.id, bot.id, runId, "bot", [
                {
                  kind: "subagent",
                  agentId: event.agentId,
                  name: event.name,
                  task: event.task,
                  status: event.status,
                  progress: event.progress,
                  result: event.result,
                },
              ]);
            }
          } else if (event.type === "usage") {
            const actualModel = requireKnownPiModel({
              provider: event.provider,
              id: event.model,
            });
            if (event.provider !== "scripted" || selection.provider === "scripted") {
              await deps.prisma.run.update({
                where: { id: runId },
                data: { modelProvider: actualModel.provider, modelId: actualModel.id },
              });
            }
            await deps.prisma.usageRecord.create({
              data: {
                workspaceId: run.workspaceId,
                botId: bot.id,
                userId: run.userId,
                runId,
                provider: actualModel.provider,
                model: actualModel.id,
                inputTokens: event.inputTokens,
                outputTokens: event.outputTokens,
              },
            });
          } else if (event.type === "done") {
            assembled = assembled || event.text || assembled;
          }
        }

        const afterRuntime = await deps.prisma.run.findUnique({ where: { id: runId } });
        if (
          runController.signal.aborted ||
          afterRuntime?.status !== "running" ||
          afterRuntime.leaseOwner !== workerId ||
          afterRuntime.leaseFence !== fence ||
          !afterRuntime.leaseExpiresAt ||
          afterRuntime.leaseExpiresAt.getTime() <= Date.now() ||
          shouldYieldToOwnerApproval(run.checkpoint, afterRuntime.checkpoint)
        ) {
          return;
        }

        for (const turn of script ?? []) {
          for (const file of turn.files ?? []) {
            if (!(await currentRunLease(deps, runId, workerId, fence, operationFence))) return;
            await deps.home.writeFile(bot.id, file.path, file.content, context);
          }
          for (const mem of turn.memory ?? []) {
            if (!(await currentRunLease(deps, runId, workerId, fence, operationFence))) return;
            await deps.memory.commit(
              {
                scope: mem.scope,
                botId: mem.scope === "bot" ? bot.id : undefined,
                path: mem.path,
                content: mem.content,
                sourceRunId: runId,
                sourceThreadId: thread.id,
              },
              context,
            );
            await appendEvent(deps.prisma, {
              workspaceId: run.workspaceId,
              threadId: thread.id,
              botId: bot.id,
              type: "memory.revised",
              runId,
              payload: { path: mem.path, scope: mem.scope },
            });
          }
        }

        const text = redactSecrets(assembled || "done.", runSecrets);
        if (containsSecret(text, runSecrets)) {
          throw new Error("refusing to persist a secret in the thread");
        }
        const blocks: MessageBlock[] = [{ kind: "text", text }];
        const completion = await deps.prisma.$transaction(async (tx) => {
          const completed = await tx.run.updateMany({
            where: {
              id: runId,
              status: "running",
              leaseOwner: workerId,
              leaseFence: fence,
              leaseExpiresAt: { gt: new Date() },
            },
            data: { status: "completed", checkpoint: null, completedAt: new Date() },
          });
          if (completed.count !== 1) return null;
          await tx.computer.update({
            where: { botId: bot.id },
            data: { operationFence: { increment: 1 } },
          });

          const message = await appendMessageInTransaction(tx, {
            workspaceId: run.workspaceId,
            threadId: thread.id,
            botId: bot.id,
            role: "bot",
            runId,
            blocks,
          });
          await tx.task.update({
            where: { id: run.taskId },
            data: { status: "completed" },
          });
          await appendEventInTransaction(tx, {
            workspaceId: run.workspaceId,
            threadId: thread.id,
            botId: bot.id,
            type: "run.completed",
            runId,
            payload: {},
          });
          return message;
        });
        if (!completion) return;
        await deps.prisma.bot.update({ where: { id: bot.id }, data: { updatedAt: new Date() } });
        if (bot.notifyOnFinish) {
          await notifyRun(deps, run, {
            kind: "completion",
            title: `${bot.name} finished`,
            body: text.slice(0, 180),
            botId: bot.id,
            threadId: thread.id,
          });
        }
      } catch (error) {
        await failRun(deps, run, bot, workerId, fence, error);
      } finally {
        await stopLeaseMonitor();
        try {
          await finalizeRunCancellation(deps, runId, {
            leaseOwner: workerId,
            leaseFence: fence,
          });
        } finally {
          if (activeRunControllers.get(runId)?.controller === runController) {
            activeRunControllers.delete(runId);
          }
          await wakeNextQueuedRun(deps, run.botId);
          settleRun();
        }
      }
    },
  };
}

async function failRun(
  deps: ExecutorDeps,
  run: {
    id: string;
    workspaceId: string;
    userId: string;
    botId: string;
    threadId: string;
  },
  bot: { id: string; name: string; notifyOnFinish: boolean },
  workerId: string,
  fence: number,
  error: unknown,
) {
  const message = error instanceof Error ? error.message : String(error);
  const failed = await deps.prisma.$transaction(async (tx) => {
    const changed = await tx.run.updateMany({
      where: {
        id: run.id,
        status: "running",
        leaseOwner: workerId,
        leaseFence: fence,
        leaseExpiresAt: { gt: new Date() },
      },
      data: { status: "failed", error: message, completedAt: new Date() },
    });
    if (changed.count !== 1) return false;
    await tx.computer.update({
      where: { botId: bot.id },
      data: { operationFence: { increment: 1 } },
    });
    await appendEventInTransaction(tx, {
      workspaceId: run.workspaceId,
      threadId: run.threadId,
      botId: bot.id,
      type: "run.failed",
      runId: run.id,
      payload: { error: message },
    });
    return true;
  });
  if (!failed) return;
  if (bot.notifyOnFinish) {
    await notifyRun(deps, run, {
      kind: "failure",
      title: `${bot.name} failed`,
      body: message.slice(0, 180),
      botId: bot.id,
      threadId: run.threadId,
    });
  }
}

async function notifyRun(
  deps: ExecutorDeps,
  run: { workspaceId: string; userId: string; botId: string; threadId: string },
  message: NotificationMessage,
  signal = new AbortController().signal,
) {
  if (!deps.notifications) return;
  await deps.notifications
    .send(message, {
      operationId: "notify",
      traceId: run.botId,
      workspaceId: run.workspaceId,
      userId: run.userId,
      botId: run.botId,
      signal,
    })
    .catch(() => undefined);
}

async function publishMessage(
  deps: ExecutorDeps,
  _actor: Actor,
  threadId: string,
  botId: string,
  runId: string,
  role: "user" | "bot" | "system",
  blocks: MessageBlock[],
) {
  return deps.prisma.$transaction(async (tx) => {
    const thread = await tx.thread.findUniqueOrThrow({ where: { id: threadId } });
    return publishMessageInTransaction(
      tx,
      thread.workspaceId,
      threadId,
      botId,
      runId,
      role,
      blocks,
    );
  });
}

async function publishMessageInTransaction(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  threadId: string,
  botId: string,
  runId: string,
  role: "user" | "bot" | "system",
  blocks: MessageBlock[],
) {
  return appendMessageInTransaction(tx, {
    workspaceId,
    threadId,
    botId,
    runId,
    role,
    blocks,
  });
}

async function runHasStatus(prisma: PrismaClient, runId: string, status: RunStatus) {
  return (
    (await prisma.run.count({
      where: { id: runId, status },
    })) === 1
  );
}

type ApprovalRun = {
  id: string;
  workspaceId: string;
  userId: string;
  botId: string;
  threadId: string;
};

type RunLease = { owner: string; fence: number; operationFence: number };

function withOwnerApproval(
  deps: ExecutorDeps,
  run: ApprovalRun,
  bot: { name: string; notifyOnFinish: boolean },
  runSecrets: string[],
  checkpoint: { effectId: string; decision?: "approve" | "deny" } | null,
  lease: RunLease,
  signal: AbortSignal,
  execute: (name: string, args: Record<string, unknown>, executionId: string) => Promise<unknown>,
) {
  return async (name: string, args: Record<string, unknown>, executionId: string) => {
    const inputError = approvalRequestError(name, args, runSecrets);
    if (inputError) return { error: inputError, executionId };
    if (!requiresOwnerApproval(name)) return execute(name, args, executionId);

    const existing = await deps.prisma.externalEffect.findUnique({
      where: { idempotencyKey: executionId },
    });
    if (existing) {
      if (
        existing.runId !== run.id ||
        existing.workspaceId !== run.workspaceId ||
        existing.kind !== name
      ) {
        return { error: "effect identity does not match this run", executionId };
      }
      if (existing.status === "awaiting_approval") {
        return ownerApprovalRequired(existing.id);
      }
      if (existing.status === "denied") {
        return { error: "owner denied this action", executionId };
      }
      if (existing.status === "completed") return existing.result ?? { duplicate: true };
      return {
        error: "protected effect outcome is not safely dispatchable; review before retrying",
        executionId,
      };
    }

    if (checkpoint?.decision) {
      return {
        error:
          "the owner decision covers only the stored action; start a new request for another protected action",
        executionId,
      };
    }

    return requestOwnerApproval(deps, run, bot, runSecrets, lease, signal, name, args, executionId);
  };
}

async function requestOwnerApproval(
  deps: ExecutorDeps,
  run: ApprovalRun,
  bot: { name: string; notifyOnFinish: boolean },
  runSecrets: string[],
  lease: RunLease,
  signal: AbortSignal,
  name: string,
  args: Record<string, unknown>,
  executionId: string,
): Promise<OwnerApprovalRequired | { error: string; executionId: string }> {
  const blocks: MessageBlock[] = [
    {
      kind: "ask",
      text: `Approve ${approvalActionName(name)}?`,
      detail: approvalActionDetail(name, args, runSecrets),
      actions: OWNER_APPROVAL_ACTIONS,
    },
  ];

  try {
    if (
      !(await quiesceRunOperations(deps, run, {
        leaseOwner: lease.owner,
        leaseFence: lease.fence,
      }))
    ) {
      return { error: "run is no longer waiting for this action", executionId };
    }
    const outcome = await deps.prisma.$transaction(async (tx) => {
      const current = await tx.run.findFirst({
        where: {
          id: run.id,
          workspaceId: run.workspaceId,
          userId: run.userId,
          botId: run.botId,
          threadId: run.threadId,
          status: "running",
          leaseOwner: lease.owner,
          leaseFence: lease.fence,
          leaseExpiresAt: { gt: new Date() },
        },
        select: { id: true },
      });
      if (!current) return { state: "stale" as const };

      const pending = await tx.externalEffect.findFirst({
        where: { runId: run.id, workspaceId: run.workspaceId, status: "awaiting_approval" },
        select: { id: true },
      });
      if (pending) return { state: "existing" as const, effectId: pending.id };

      const effect = await tx.externalEffect.create({
        data: {
          workspaceId: run.workspaceId,
          runId: run.id,
          kind: name,
          idempotencyKey: executionId,
          status: "awaiting_approval",
          request: args as never,
        },
      });
      const waiting = await tx.run.updateMany({
        where: {
          id: run.id,
          workspaceId: run.workspaceId,
          userId: run.userId,
          botId: run.botId,
          threadId: run.threadId,
          status: "running",
          leaseOwner: lease.owner,
          leaseFence: lease.fence,
          leaseExpiresAt: { gt: new Date() },
        },
        data: { status: "waiting_input", checkpoint: ownerApprovalCheckpoint(effect.id) },
      });
      if (waiting.count !== 1) throw new Error("approval run changed before it could pause");

      const message = await appendMessageInTransaction(tx, {
        workspaceId: run.workspaceId,
        threadId: run.threadId,
        botId: run.botId,
        role: "bot",
        runId: run.id,
        blocks,
      });
      return { state: "created" as const, effectId: effect.id, messageId: message.id };
    });

    if (outcome.state === "stale") {
      return { error: "run is no longer waiting for this action", executionId };
    }
    if (outcome.state === "created") {
      if (!signal.aborted && (await runHasStatus(deps.prisma, run.id, "waiting_input"))) {
        await notifyRun(
          deps,
          run,
          {
            kind: "help",
            title: `${bot.name} needs approval`,
            body: blocks[0]?.kind === "ask" ? blocks[0].text : "Approval needed",
            botId: run.botId,
            threadId: run.threadId,
          },
          signal,
        );
      }
    }
    return ownerApprovalRequired(outcome.effectId);
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
    const pending = await deps.prisma.externalEffect.findFirst({
      where: { runId: run.id, workspaceId: run.workspaceId, status: "awaiting_approval" },
      select: { id: true },
    });
    if (!pending) throw error;
    return ownerApprovalRequired(pending.id);
  }
}

async function resumeOwnerApproval(
  deps: ExecutorDeps,
  run: ApprovalRun,
  checkpoint: { effectId: string; decision?: "approve" | "deny" },
  runSecrets: string[],
  lease: RunLease,
  execute: (name: string, args: Record<string, unknown>, executionId: string) => Promise<unknown>,
): Promise<string> {
  const effect = await deps.prisma.externalEffect.findFirst({
    where: {
      id: checkpoint.effectId,
      runId: run.id,
      workspaceId: run.workspaceId,
    },
  });
  if (!effect || !checkpoint.decision) throw new Error("approval checkpoint is not valid");

  if (checkpoint.decision === "deny") {
    if (effect.status !== "denied") throw new Error("denied approval is no longer pending");
    return `The owner denied ${effect.kind}. It was not dispatched. Do not retry it unless the owner explicitly asks for a new action. Continue the original task or explain the limit.`;
  }

  if (effect.status === "completed") {
    return approvedEffectInstruction(effect.kind, effect.id);
  }
  if (effect.status !== "approved") {
    await deps.prisma.externalEffect.updateMany({
      where: { id: effect.id, status: { in: ["failed", "intended"] } },
      data: { status: "ambiguous" },
    });
    throw new Error("approved action outcome is ambiguous; review before retrying");
  }

  const storedRequest = jsonObject(effect.request);
  const inputError = approvalRequestError(effect.kind, storedRequest, runSecrets);
  if (inputError) {
    const rejected = await deps.prisma.externalEffect.updateMany({
      where: {
        id: effect.id,
        runId: run.id,
        workspaceId: run.workspaceId,
        status: "approved",
      },
      data: { status: "failed", result: { error: inputError } },
    });
    if (rejected.count === 1) throw new Error(`approved action is no longer valid: ${inputError}`);
    throw new Error("approved action changed before validation");
  }

  const claimState = await deps.prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "runs" WHERE "id" = ${run.id} FOR UPDATE`;
    const current = await tx.run.findFirst({
      where: {
        id: run.id,
        workspaceId: run.workspaceId,
        status: "running",
        leaseOwner: lease.owner,
        leaseFence: lease.fence,
        leaseExpiresAt: { gt: new Date() },
      },
      select: { id: true },
    });
    if (!current) {
      await tx.externalEffect.updateMany({
        where: { id: effect.id, status: "approved" },
        data: {
          status: "failed",
          result: { error: "run stopped before approved action dispatch" },
        },
      });
      return "stale" as const;
    }
    const claimed = await tx.externalEffect.updateMany({
      where: {
        id: effect.id,
        runId: run.id,
        workspaceId: run.workspaceId,
        status: "approved",
      },
      data: { status: "intended" },
    });
    return claimed.count === 1 ? ("claimed" as const) : ("changed" as const);
  });
  if (claimState === "stale") throw new Error("approved action was stopped before dispatch");
  if (claimState !== "claimed") {
    const current = await deps.prisma.externalEffect.findUnique({ where: { id: effect.id } });
    if (current?.status === "completed") return approvedEffectInstruction(effect.kind, effect.id);
    throw new Error("approved action outcome is ambiguous; review before retrying");
  }

  let result: unknown;
  try {
    result = await execute(effect.kind, storedRequest, effect.idempotencyKey);
  } catch (error) {
    await markProtectedEffectAmbiguous(deps, effect.id, error);
    throw new Error(
      `approved action outcome is ambiguous: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const error = effectError(result);
  if (error) {
    await markProtectedEffectAmbiguous(deps, effect.id, error);
    throw new Error(`approved action outcome is ambiguous: ${error}`);
  }

  try {
    await settleApprovedEffect(deps, run, effect.id, effect.kind, result);
  } catch (error) {
    await markProtectedEffectAmbiguous(deps, effect.id, error);
    throw error;
  }
  return approvedEffectInstruction(effect.kind, effect.id);
}

async function currentRunLease(
  deps: ExecutorDeps,
  runId: string,
  owner: string,
  fence: number,
  operationFence: number,
): Promise<boolean> {
  const current = await deps.prisma.run.findFirst({
    where: {
      id: runId,
      status: "running",
      leaseOwner: owner,
      leaseFence: fence,
      leaseExpiresAt: { gt: new Date() },
      bot: { computer: { operationFence } },
    },
    select: { id: true },
  });
  return Boolean(current);
}

async function wakeNextQueuedRun(deps: ExecutorDeps, botId: string) {
  if (!deps.wakeup) return;
  const occupied = await deps.prisma.run.findFirst({
    where: {
      botId,
      status: { in: ["leased", "running", "cancelling", "waiting_input", "waiting_takeover"] },
    },
    select: { id: true },
  });
  if (occupied) return;
  const next = await deps.prisma.run.findFirst({
    where: { botId, status: "queued" },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true },
  });
  if (!next) return;
  await deps.wakeup.enqueue({
    name: "run.continue",
    payload: { runId: next.id },
    jobKey: `run.continue:${next.id}`,
  });
}

async function startRunLeaseMonitor(
  deps: ExecutorDeps,
  runId: string,
  owner: string,
  fence: number,
  controller: AbortController,
): Promise<(() => Promise<void>) | undefined> {
  const renew = async () => {
    const now = new Date();
    const renewed = await deps.prisma.run.updateMany({
      where: {
        id: runId,
        status: "running",
        leaseOwner: owner,
        leaseFence: fence,
        leaseExpiresAt: { gt: now },
      },
      data: { leaseExpiresAt: new Date(now.getTime() + RUN_LEASE_DURATION_MS) },
    });
    if (renewed.count !== 1) controller.abort();
    return renewed.count === 1;
  };

  if (!(await renew())) return undefined;
  let stopped = false;
  let pending: Promise<void> | undefined;
  const timer = setInterval(() => {
    if (stopped || pending) return;
    pending = renew()
      .then(() => undefined)
      .catch(() => controller.abort())
      .finally(() => {
        pending = undefined;
      });
  }, RUN_LEASE_HEARTBEAT_MS);
  timer.unref();

  return async () => {
    stopped = true;
    clearInterval(timer);
    await pending;
  };
}

function approvedEffectInstruction(kind: string, effectId: string): string {
  return `The owner approved ${kind}. The exact stored action was dispatched successfully and evidence ${effectId} was saved in this thread. Do not repeat it. Continue the original task.`;
}

async function markProtectedEffectAmbiguous(deps: ExecutorDeps, effectId: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  await deps.prisma.externalEffect.updateMany({
    where: { id: effectId, status: "intended" },
    data: { status: "ambiguous", result: { error: message.slice(0, 500) } },
  });
}

async function settleApprovedEffect(
  deps: ExecutorDeps,
  run: ApprovalRun,
  effectId: string,
  kind: string,
  result: unknown,
): Promise<{ id: string }> {
  const blocks: MessageBlock[] = [
    { kind: "meta", text: `Approved ${kind} finished. Evidence: ${effectId}.` },
  ];
  return deps.prisma.$transaction(async (tx) => {
    const completed = await tx.externalEffect.updateMany({
      where: {
        id: effectId,
        runId: run.id,
        workspaceId: run.workspaceId,
        status: "intended",
      },
      data: { status: "completed", result: result as never },
    });
    if (completed.count !== 1) throw new Error("approved action could not be settled safely");

    return appendMessageInTransaction(tx, {
      workspaceId: run.workspaceId,
      threadId: run.threadId,
      botId: run.botId,
      role: "bot",
      runId: run.id,
      blocks,
    });
  });
}

function ownerApprovalRequired(effectId: string): OwnerApprovalRequired {
  return { kind: "owner_approval_required", effectId };
}

function approvalActionName(name: string): string {
  if (name === "shell") return "running this command";
  if (name === "delete_bot") return "deleting this bot";
  if (name === "destination.write") return "writing to the connected destination";
  return `running ${name}`;
}

export function approvalActionDetail(
  name: string,
  args: Record<string, unknown>,
  runSecrets: string[],
): string {
  const tool = `Tool: ${name}`;
  if (name === "shell") {
    const command = redactSecrets(String(args.command ?? args.cmd ?? ""), runSecrets);
    const cwd = redactSecrets(String(args.cwd ?? "default"), runSecrets);
    return boundedApprovalDetail([tool, `Command: ${command}`, `Working directory: ${cwd}`]);
  }
  if (name === "delete_bot") {
    const target = approvalPreview(
      args.confirm_name ?? args.confirmName ?? args.bot_id ?? args.botId ?? "requested bot",
      runSecrets,
      200,
    );
    return `${tool}\nTarget: ${target}`;
  }
  if (name === "destination.write") {
    const collection = approvalPreview(args.collection ?? "destination", runSecrets, 200);
    return `${tool}\nCollection: ${collection}\nContent values are hidden.`;
  }
  if (name === "COMPOSIO_MULTI_EXECUTE_TOOL") {
    const batch = composioBatch(args);
    const names = batch
      .map((item) => item.tool_slug ?? item.tool_name ?? item.tool ?? item.name)
      .filter((value): value is string => typeof value === "string" && Boolean(value));
    const targets = approvalTargets(args, runSecrets);
    return boundedApprovalDetail([
      tool,
      `Batch size: ${batch.length || "unknown"}`,
      `Tools: ${names.length ? names.map((value) => approvalPreview(value, runSecrets, 120)).join(", ") : "not provided"}`,
      targets ? `Targets: ${targets}` : "Targets: not provided",
    ]);
  }
  if (name === "COMPOSIO_REMOTE_BASH_TOOL" || name === "COMPOSIO_REMOTE_WORKBENCH") {
    const command =
      args.command ??
      args.cmd ??
      args.script ??
      args.code_to_execute ??
      args.code ??
      "not provided";
    const targets = approvalTargets(args, runSecrets);
    return boundedApprovalDetail([
      tool,
      `Command: ${approvalPreview(command, runSecrets, 800)}`,
      targets ? `Target: ${targets}` : "Target: not provided",
    ]);
  }
  if (name === "COMPOSIO_MANAGE_CONNECTIONS") {
    const action = args.action ?? args.operation ?? args.intent ?? "not provided";
    const targets = approvalTargets(args, runSecrets);
    return boundedApprovalDetail([
      tool,
      `Action: ${approvalPreview(action, runSecrets, 200)}`,
      targets ? `Target: ${targets}` : "Target: not provided",
    ]);
  }
  const fields = Object.keys(args)
    .slice(0, 12)
    .map((key) => key.slice(0, 80))
    .join(", ");
  return `${tool}\nArgument fields: ${fields || "none"}\nArgument values are hidden.`;
}

function approvalPreview(value: unknown, runSecrets: string[], limit: number): string {
  const raw = typeof value === "string" ? value : JSON.stringify(value);
  const redacted = redactSecrets(raw ?? String(value), runSecrets);
  if (redacted.length <= limit) return redacted;
  const tail = Math.min(120, Math.floor(limit / 3));
  const head = limit - tail;
  return `${redacted.slice(0, head)}…[${redacted.length - limit} chars omitted]…${redacted.slice(-tail)}`;
}

function boundedApprovalDetail(lines: string[]): string {
  return lines.join("\n").slice(0, 1_200);
}

function composioBatch(args: Record<string, unknown>): Record<string, unknown>[] {
  const candidate = args.tools ?? args.tool_calls ?? args.calls ?? args.actions;
  return Array.isArray(candidate) ? candidate.map(jsonObject) : [];
}

function approvalTargets(value: unknown, runSecrets: string[]): string {
  const safeKeys = new Set([
    "recipient",
    "recipients",
    "to",
    "target",
    "targets",
    "destination",
    "destinations",
    "channel",
    "channels",
    "email",
    "collection",
    "toolkit",
    "toolkits",
    "app",
    "apps",
    "provider",
    "providers",
  ]);
  const found: string[] = [];
  const visit = (node: unknown, depth: number) => {
    if (depth > 4 || found.length >= 6 || !node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item, depth + 1);
      return;
    }
    for (const [key, nested] of Object.entries(node)) {
      if (found.length >= 6) break;
      if (
        safeKeys.has(key.toLowerCase()) &&
        (typeof nested !== "object" ||
          nested === null ||
          (Array.isArray(nested) && nested.every((item) => typeof item !== "object")))
      ) {
        found.push(`${key}=${approvalPreview(nested, runSecrets, 160)}`);
      } else {
        visit(nested, depth + 1);
      }
    }
  };
  visit(value, 0);
  return found.join(", ");
}

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
}

async function recordEffect(
  deps: ExecutorDeps,
  run: { id: string; workspaceId: string },
  kind: string,
  executionId: string,
  request: Record<string, unknown>,
) {
  const existing = await deps.prisma.externalEffect.findUnique({
    where: { idempotencyKey: executionId },
  });
  if (existing) {
    if (
      existing.runId !== run.id ||
      existing.workspaceId !== run.workspaceId ||
      existing.kind !== kind
    ) {
      return { duplicate: false, ambiguous: true, blocked: undefined, effect: existing };
    }
    await appendEvent(deps.prisma, {
      workspaceId: run.workspaceId,
      threadId: (await deps.prisma.run.findUniqueOrThrow({ where: { id: run.id } })).threadId,
      botId: (await deps.prisma.run.findUniqueOrThrow({ where: { id: run.id } })).botId,
      type: "effect.reconciled",
      runId: run.id,
      payload: { executionId, kind },
    });
    if (existing.status === "completed") {
      return { duplicate: true, ambiguous: false, blocked: undefined, effect: existing };
    }
    if (existing.status === "awaiting_approval" || existing.status === "denied") {
      return {
        duplicate: false,
        ambiguous: false,
        blocked: existing.status,
        effect: existing,
      };
    }
    if (existing.status !== "failed" || requiresOwnerApproval(existing.kind)) {
      const effect =
        existing.status === "ambiguous"
          ? existing
          : await deps.prisma.externalEffect.update({
              where: { id: existing.id },
              data: { status: "ambiguous" },
            });
      return { duplicate: false, ambiguous: true, blocked: undefined, effect };
    }
    const transitioned = await deps.prisma.externalEffect.updateMany({
      where: { id: existing.id, status: existing.status },
      data: { status: "intended" },
    });
    if (transitioned.count !== 1) {
      const effect = await deps.prisma.externalEffect.findUniqueOrThrow({
        where: { id: existing.id },
      });
      return {
        duplicate: effect.status === "completed",
        ambiguous: effect.status !== "completed",
        blocked: undefined,
        effect,
      };
    }
    const effect = await deps.prisma.externalEffect.findUniqueOrThrow({
      where: { id: existing.id },
    });
    return { duplicate: false, ambiguous: false, blocked: undefined, effect };
  }
  const effect = await deps.prisma.externalEffect.create({
    data: {
      workspaceId: run.workspaceId,
      runId: run.id,
      kind,
      idempotencyKey: executionId,
      status: "intended",
      request: request as never,
    },
  });
  return { duplicate: false, ambiguous: false, blocked: undefined, effect };
}

async function completeEffect(deps: ExecutorDeps, effectId: string, result: unknown) {
  const completed = await deps.prisma.externalEffect.updateMany({
    where: { id: effectId, status: "intended" },
    data: { status: "completed", result: result as never },
  });
  if (completed.count !== 1) throw new Error("effect changed before completion");
}

async function failEffect(deps: ExecutorDeps, effectId: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  await deps.prisma.externalEffect.updateMany({
    where: { id: effectId, status: "intended" },
    data: { status: "failed", result: { error: message } },
  });
}

function withEffectLifecycle(
  deps: ExecutorDeps,
  run: { id: string; workspaceId: string },
  lease: RunLease,
  execute: (name: string, args: Record<string, unknown>, executionId: string) => Promise<unknown>,
) {
  return async (name: string, args: Record<string, unknown>, executionId: string) => {
    if (!(await currentRunLease(deps, run.id, lease.owner, lease.fence, lease.operationFence))) {
      return { error: "run is no longer active", executionId };
    }
    const applied = await recordEffect(deps, run, name, executionId, args);
    if (applied.blocked) {
      return {
        error:
          applied.blocked === "denied"
            ? "owner denied this action"
            : "owner approval is still required",
        executionId,
      };
    }
    if (applied.ambiguous) {
      return { error: "effect outcome is ambiguous; review before retrying", executionId };
    }
    if (applied.duplicate) return applied.effect.result ?? { duplicate: true };
    let result: unknown;
    try {
      result = await execute(
        applied.effect.kind,
        jsonObject(applied.effect.request),
        applied.effect.idempotencyKey,
      );
    } catch (error) {
      if (requiresOwnerApproval(applied.effect.kind)) {
        await markProtectedEffectAmbiguous(deps, applied.effect.id, error);
      } else {
        await failEffect(deps, applied.effect.id, error);
      }
      throw error;
    }
    const error = effectError(result);
    if (error) {
      if (requiresOwnerApproval(applied.effect.kind)) {
        await markProtectedEffectAmbiguous(deps, applied.effect.id, error);
      } else {
        await failEffect(deps, applied.effect.id, error);
      }
    } else await completeEffect(deps, applied.effect.id, result);
    return result;
  };
}

function effectError(result: unknown): string | undefined {
  if (!result || typeof result !== "object" || !("error" in result)) return undefined;
  return String((result as { error: unknown }).error || "tool returned an error");
}

async function ensureComputer(
  deps: ExecutorDeps,
  botId: string,
  context: AdapterContext,
): Promise<ComputerRef> {
  const ref = await provisionComputer(deps, botId, context, "bot");
  scheduleComputerSleep(deps.wakeup, botId);
  return ref;
}

async function runSandboxCommand(
  sandbox: SandboxProvider,
  computer: ComputerRef,
  argv: string[],
  cwd: string,
  context: AdapterContext,
) {
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  let outputBytes = 0;
  let outputExceeded = false;
  let code: number | undefined;
  const commandController = new AbortController();
  const signal = AbortSignal.any([context.signal, commandController.signal]);
  const append = (target: Buffer[], value: string) => {
    const buffer = Buffer.from(value);
    const remaining = SANDBOX_COMMAND_MAX_OUTPUT_BYTES - outputBytes;
    if (remaining > 0) target.push(buffer.subarray(0, remaining));
    outputBytes += Math.min(remaining, buffer.length);
    outputExceeded ||= buffer.length > remaining;
  };
  for await (const event of sandbox.execute(
    computer,
    {
      argv,
      cwd,
      timeoutMs: SANDBOX_COMMAND_TIMEOUT_MS,
      maxOutputBytes: SANDBOX_COMMAND_MAX_OUTPUT_BYTES,
    },
    { ...context, signal },
  )) {
    if (event.type === "stdout") append(stdout, event.data);
    if (event.type === "stderr") append(stderr, event.data);
    if (event.type === "exit") code = event.code;
    if (outputExceeded) {
      commandController.abort("command output limit exceeded");
      break;
    }
  }
  const output = limitCommandOutput(
    Buffer.concat(stdout).toString("utf8"),
    Buffer.concat(stderr).toString("utf8"),
    SANDBOX_COMMAND_MAX_OUTPUT_BYTES,
    outputExceeded ? "command output limit exceeded" : "",
  );
  return sandboxCommandResult(output.stdout, output.stderr, outputExceeded ? 1 : code);
}

async function resolveModelKey(
  deps: ExecutorDeps,
  userId: string,
  workspaceId: string,
  credential: { secretId: string; provider: string } | null,
): Promise<{ apiKey?: string; redact: string[] }> {
  if (!credential) return { redact: [] };
  if (!deps.secretStore) throw new Error("Model credential storage is unavailable");
  const row = await deps.prisma.secret.findFirst({
    where: { id: credential.secretId, userId, workspaceId },
  });
  if (!row) throw new Error(`Model credential for ${credential.provider} is unavailable`);
  const plaintext = deps.secretStore.load(row.ciphertext);
  const parsed = parseModelSecret(plaintext);
  const apiKey = await resolveModelApiKey(plaintext, credential.provider, {
    persist: async (next) => {
      const stored = await deps.secretStore!.put(next, {
        operationId: "cred",
        traceId: "cred-refresh",
        workspaceId,
        userId,
        signal: new AbortController().signal,
      });
      await deps.prisma.secret.update({
        where: { id: row.id },
        data: { ciphertext: stored.ciphertext },
      });
    },
  });
  return { apiKey, redact: [...secretValuesToRedact(parsed), apiKey] };
}

function blocksToText(blocks: MessageBlock[]): string {
  return blocks
    .map((block) => {
      if ("text" in block && block.text) return block.text;
      return JSON.stringify(block);
    })
    .join("\n");
}
