import type { PrismaClient } from "@meshbot/db";
import {
  type ActionGateway,
  type ActionPolicy,
  ActionRefusedError,
  type AuditStore,
  createActionGateway,
  loadActionPolicy,
} from "@meshbot/gateway";
import { createPrismaAuditStore } from "./action-audit.js";

export type ShellResult = { stdout: string; stderr: string; code: number };
export type RefusedAction = { error: string; rule: string | null };

export function createExecutorActionGateway(options: {
  prisma: PrismaClient;
  auditStore?: AuditStore;
  actionPolicy?: ActionPolicy | (() => ActionPolicy);
}): ActionGateway {
  const policy = options.actionPolicy;
  return createActionGateway({
    auditStore: options.auditStore ?? createPrismaAuditStore(options.prisma),
    policy: () => (typeof policy === "function" ? policy() : (policy ?? loadActionPolicy())),
  });
}

export async function executeGovernedShell(options: {
  gateway: ActionGateway;
  botId: string;
  actorId: string;
  workspaceId: string;
  runId?: string;
  computerId?: string;
  controlHolder?: string;
  command: string;
  cwd: string;
  secrets?: string[];
  execute: () => Promise<ShellResult>;
}): Promise<ShellResult | RefusedAction> {
  try {
    return await options.gateway.act({
      toolName: "shell",
      botId: options.botId,
      actorId: options.actorId,
      workspaceId: options.workspaceId,
      runId: options.runId,
      computerId: options.computerId,
      controlHolder: options.controlHolder,
      intent: "write",
      secrets: options.secrets,
      subject: { command: options.command, cwd: options.cwd },
      run: options.execute,
    });
  } catch (error) {
    if (error instanceof ActionRefusedError) {
      return { error: error.message, rule: error.rule };
    }
    throw error;
  }
}
