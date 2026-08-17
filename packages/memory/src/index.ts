import type {
  AdapterContext,
  MemoryCommitRequest,
  MemoryExportRequest,
  MemoryReadRequest,
  MemoryRevision,
  MemorySearchRequest,
  MemorySearchResult,
  MemorySnapshot,
  MemoryStore,
  PortableFile,
} from "@meshbot/adapter-kit";
import type { Prisma, PrismaClient } from "@meshbot/db";

export class MarkdownMemoryStore implements MemoryStore {
  constructor(private readonly prisma: PrismaClient) {}

  describe() {
    return {
      id: "markdown",
      contractVersion: "1",
      adapterVersion: "0.1.0",
      capabilities: { search: true, revisions: true, markdownPortable: true },
    };
  }

  async read(request: MemoryReadRequest, context: AdapterContext): Promise<MemorySnapshot> {
    const documents = await this.prisma.memoryDocument.findMany({
      where: {
        workspaceId: context.workspaceId,
        userId: context.userId,
        scope: request.scope,
        ...(request.botId ? { botId: request.botId } : {}),
        ...(request.path ? { path: request.path } : {}),
      },
    });
    return {
      documents: documents.map((doc) => ({
        id: doc.id,
        path: doc.path,
        content: doc.content,
        revision: doc.revision,
      })),
    };
  }

  async search(
    request: MemorySearchRequest,
    context: AdapterContext,
  ): Promise<MemorySearchResult[]> {
    const query = request.query.trim().slice(0, 500);
    if (!query) return [];
    const limit = request.limit ? Math.min(50, Math.max(1, Math.floor(request.limit))) : undefined;
    const documents = await this.prisma.memoryDocument.findMany({
      where: {
        workspaceId: context.workspaceId,
        userId: context.userId,
        ...(request.scope === "all" ? {} : { scope: request.scope }),
        ...(request.botId ? { botId: request.botId } : {}),
        OR: [
          { content: { contains: query, mode: "insensitive" } },
          { path: { contains: query, mode: "insensitive" } },
        ],
      },
      ...(limit ? { take: limit } : {}),
      orderBy: { updatedAt: "desc" },
    });
    const q = query.toLowerCase();
    return documents.map((doc) => ({
      path: doc.path,
      snippet: snippet(doc.content, q),
      score: 1,
    }));
  }

  async commit(request: MemoryCommitRequest, context: AdapterContext): Promise<MemoryRevision> {
    const permit = runMutationPermit(context, request.sourceRunId);
    return this.prisma.$transaction(async (tx) => {
      if (permit) await validateRunMutation(tx, context, permit);
      return commitDocument(tx, request, context);
    });
  }

  async *exportMarkdown(
    request: MemoryExportRequest,
    context: AdapterContext,
  ): AsyncIterable<PortableFile> {
    const snapshot = await this.read(
      { scope: request.scope === "all" ? "user" : request.scope, botId: request.botId },
      context,
    );
    for (const doc of snapshot.documents) {
      yield { path: doc.path, content: new TextEncoder().encode(doc.content) };
    }
  }

  async importMarkdown(
    files: AsyncIterable<PortableFile>,
    context: AdapterContext,
  ): Promise<MemoryRevision> {
    const permit = runMutationPermit(context);
    return this.prisma.$transaction(async (tx) => {
      if (permit) await validateRunMutation(tx, context, permit);
      let last: MemoryRevision | undefined;
      for await (const file of files) {
        last = await commitDocument(
          tx,
          {
            scope: "user",
            path: file.path,
            content: new TextDecoder().decode(file.content),
          },
          context,
        );
      }
      if (!last) throw new Error("No memory files to import");
      return last;
    });
  }
}

type RunPermit = Extract<NonNullable<AdapterContext["mutationPermit"]>, { purpose: "run" }>;

function runMutationPermit(context: AdapterContext, sourceRunId?: string): RunPermit | undefined {
  const permit = context.mutationPermit;
  if (sourceRunId && (permit?.purpose !== "run" || permit.runId !== sourceRunId)) {
    throw new Error("A matching run mutation permit is required");
  }
  if (context.runId && permit?.purpose !== "run") {
    throw new Error("A run mutation permit is required");
  }
  if (permit?.purpose !== "run") return undefined;
  if (context.runId !== permit.runId || !context.botId) {
    throw new Error("Run mutation permit does not match the adapter context");
  }
  return permit;
}

async function validateRunMutation(
  tx: Prisma.TransactionClient,
  context: AdapterContext,
  permit: RunPermit,
) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT r."id"
    FROM "runs" r
    JOIN "computers" c ON c."botId" = r."botId"
    WHERE r."id" = ${permit.runId}
      AND r."workspaceId" = ${context.workspaceId}
      AND r."userId" = ${context.userId}
      AND r."botId" = ${context.botId}
      AND r."status" = 'running'
      AND r."leaseFence" = ${permit.runLeaseFence}
      AND r."leaseExpiresAt" > CURRENT_TIMESTAMP
      AND c."operationFence" = ${permit.operationFence}
    FOR UPDATE OF r, c
  `;
  if (rows.length !== 1) throw new Error("Run mutation permit is no longer valid");
}

async function commitDocument(
  tx: Prisma.TransactionClient,
  request: MemoryCommitRequest,
  context: AdapterContext,
): Promise<MemoryRevision> {
  const existing = await tx.memoryDocument.findFirst({
    where: {
      workspaceId: context.workspaceId,
      userId: context.userId,
      scope: request.scope,
      botId: request.botId ?? null,
      path: request.path,
    },
  });
  const doc = existing
    ? await tx.memoryDocument.update({
        where: { id: existing.id },
        data: { content: request.content, revision: existing.revision + 1 },
      })
    : await tx.memoryDocument.create({
        data: {
          workspaceId: context.workspaceId,
          userId: context.userId,
          botId: request.botId,
          scope: request.scope,
          path: request.path,
          content: request.content,
        },
      });
  await tx.memoryRevision.create({
    data: {
      documentId: doc.id,
      revision: doc.revision,
      content: request.content,
      sourceRunId: request.sourceRunId,
      sourceThreadId: request.sourceThreadId,
    },
  });
  return { id: doc.id, path: doc.path, revision: doc.revision, content: doc.content };
}

function snippet(content: string, q: string): string {
  const idx = content.toLowerCase().indexOf(q);
  if (idx < 0) return content.slice(0, 140);
  return content.slice(Math.max(0, idx - 40), idx + q.length + 80);
}
