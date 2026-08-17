import type { WakeupDriver } from "@meshbot/adapter-kit";
import type { PrismaClient } from "@meshbot/db";

const RECOVERY_BATCH_SIZE = 100;

export async function enqueueQueuedRuns(
  prisma: Pick<PrismaClient, "run">,
  wakeup: Pick<WakeupDriver, "enqueue">,
) {
  const now = new Date();
  const runs = await prisma.run.findMany({
    where: {
      OR: [
        { status: "queued" },
        { status: { in: ["leased", "running"] }, leaseExpiresAt: { lte: now } },
        { status: "cancelling", leaseExpiresAt: { lte: now } },
      ],
    },
    select: { id: true },
    orderBy: { createdAt: "asc" },
    take: RECOVERY_BATCH_SIZE,
  });
  for (const run of runs) {
    await wakeup.enqueue({
      name: "run.continue",
      payload: { runId: run.id },
      jobKey: `run.continue:${run.id}`,
    });
  }
  return runs.length;
}
