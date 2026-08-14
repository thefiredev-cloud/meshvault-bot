import type { WakeupDriver } from "@meshbot/adapter-kit";
import type { PrismaClient } from "@meshbot/db";

const RECOVERY_BATCH_SIZE = 100;

export async function enqueueQueuedRuns(
  prisma: Pick<PrismaClient, "run">,
  wakeup: Pick<WakeupDriver, "enqueue">,
) {
  const runs = await prisma.run.findMany({
    where: { status: "queued" },
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
