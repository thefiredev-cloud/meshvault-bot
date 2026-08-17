import type { AdapterContext } from "@meshbot/adapter-kit";
import { describe, expect, it, vi } from "vitest";
import { MarkdownMemoryStore } from "./index.js";

const runContext: AdapterContext = {
  operationId: "run-1",
  traceId: "run-1",
  workspaceId: "workspace-1",
  userId: "user-1",
  botId: "bot-1",
  runId: "run-1",
  signal: new AbortController().signal,
  mutationPermit: {
    purpose: "run",
    operationFence: 7,
    runId: "run-1",
    runLeaseFence: 11,
  },
};

function prismaFixture(validPermit = true) {
  const order: string[] = [];
  const query = vi.fn(async () => {
    order.push("fence");
    return validPermit ? [{ id: "run-1" }] : [];
  });
  const createDocument = vi.fn(async () => {
    order.push("document");
    return { id: "memory-1", path: "MEMORY.md", revision: 1, content: "remember" };
  });
  const createRevision = vi.fn(async () => {
    order.push("revision");
    return {};
  });
  const tx = {
    $queryRaw: query,
    memoryDocument: {
      findFirst: vi.fn(async () => null),
      create: createDocument,
      update: vi.fn(),
    },
    memoryRevision: { create: createRevision },
  };
  const transaction = vi.fn(async (run: (value: typeof tx) => Promise<unknown>) => run(tx));
  return {
    order,
    query,
    createDocument,
    transaction,
    prisma: { $transaction: transaction },
  };
}

describe("memory store contract shape", () => {
  it("declares markdown portability", () => {
    const store = new MarkdownMemoryStore({} as never);
    expect(store.describe().capabilities.markdownPortable).toBe(true);
  });

  it("locks the exact run and computer fence before committing run memory", async () => {
    const fixture = prismaFixture();
    const store = new MarkdownMemoryStore(fixture.prisma as never);

    await store.commit(
      {
        scope: "bot",
        botId: "bot-1",
        path: "MEMORY.md",
        content: "remember",
        sourceRunId: "run-1",
      },
      runContext,
    );

    expect(fixture.order).toEqual(["fence", "document", "revision"]);
    expect(fixture.query).toHaveBeenCalledWith(
      expect.anything(),
      "run-1",
      "workspace-1",
      "user-1",
      "bot-1",
      11,
      7,
    );
  });

  it("rejects missing or stale run permits before memory changes", async () => {
    const missing = prismaFixture();
    const missingStore = new MarkdownMemoryStore(missing.prisma as never);
    await expect(
      missingStore.commit(
        {
          scope: "bot",
          botId: "bot-1",
          path: "MEMORY.md",
          content: "blocked",
          sourceRunId: "run-1",
        },
        { ...runContext, mutationPermit: undefined },
      ),
    ).rejects.toThrow(/permit/i);
    expect(missing.transaction).not.toHaveBeenCalled();

    const stale = prismaFixture(false);
    const staleStore = new MarkdownMemoryStore(stale.prisma as never);
    await expect(
      staleStore.commit(
        {
          scope: "bot",
          botId: "bot-1",
          path: "MEMORY.md",
          content: "blocked",
          sourceRunId: "run-1",
        },
        runContext,
      ),
    ).rejects.toThrow(/no longer valid/i);
    expect(stale.createDocument).not.toHaveBeenCalled();
  });
});
