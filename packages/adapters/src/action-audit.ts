import type { Prisma, PrismaClient } from "@meshbot/db";
import type { AuditStore, GatewayAuditEvent } from "@meshbot/gateway";

export function createPrismaAuditStore(prisma: PrismaClient): AuditStore {
  return {
    async insert(event: GatewayAuditEvent) {
      await prisma.actionAudit.create({
        data: {
          workspaceId: event.workspaceId,
          botId: event.botId,
          actorId: event.actorId,
          runId: event.runId,
          computerId: event.computerId,
          eventType: event.eventType,
          toolName: event.toolName,
          targetType: event.targetType,
          targetId: event.targetId,
          decision: event.decision as Prisma.InputJsonValue,
          payload: event.payload as Prisma.InputJsonValue,
        },
      });
    },
  };
}
