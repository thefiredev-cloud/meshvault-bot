-- CreateTable
CREATE TABLE "action_audits" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "runId" TEXT,
    "computerId" TEXT,
    "eventType" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "decision" JSONB NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "action_audits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "action_audits_workspaceId_createdAt_idx" ON "action_audits"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "action_audits_botId_createdAt_idx" ON "action_audits"("botId", "createdAt");

-- AddForeignKey
ALTER TABLE "action_audits" ADD CONSTRAINT "action_audits_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
