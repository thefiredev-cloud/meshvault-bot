import type { PrismaClient } from "@meshbot/db";
import { describe, expect, it, vi } from "vitest";
import { enqueueQueuedRuns } from "./queued-runs.js";

describe("queued run recovery", () => {
  it("enqueues a committed queued run with a deterministic job key", async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: "run-committed" }]);
    const enqueue = vi.fn().mockResolvedValue(undefined);

    await enqueueQueuedRuns({ run: { findMany } } as unknown as Pick<PrismaClient, "run">, {
      enqueue,
    });

    expect(findMany).toHaveBeenCalledWith({
      where: { status: "queued" },
      select: { id: true },
      orderBy: { createdAt: "asc" },
      take: 100,
    });
    expect(enqueue).toHaveBeenCalledWith({
      name: "run.continue",
      payload: { runId: "run-committed" },
      jobKey: "run.continue:run-committed",
    });
  });
});
