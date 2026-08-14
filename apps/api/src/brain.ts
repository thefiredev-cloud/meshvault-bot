import type { BrainGraph } from "@meshbot/contracts";
import * as z from "zod";

const RawGraphSchema = z.object({
  nodes: z.array(
    z.object({
      id: z.string().min(1).max(4096),
      tags: z.unknown(),
      mtime: z.number().finite(),
    }),
  ),
  edges: z.array(
    z.object({
      from: z.string().min(1).max(4096),
      to: z.string().min(1).max(4096),
    }),
  ),
});

// ponytail: these are browser-rendering ceilings; move the bound into the node
// query only if real vault size makes transferring the full graph measurable.
export const BRAIN_NODE_LIMIT = 1_500;
export const BRAIN_EDGE_LIMIT = 5_000;

export function normalizeBrainGraph(input: unknown): BrainGraph {
  const raw = RawGraphSchema.parse(input);
  const byId = new Map(raw.nodes.map((node) => [node.id, node]));
  const degree = new Map<string, number>();
  const validEdges = raw.edges.filter((edge) => {
    if (!byId.has(edge.from) || !byId.has(edge.to) || edge.from === edge.to) return false;
    degree.set(edge.from, (degree.get(edge.from) ?? 0) + 1);
    degree.set(edge.to, (degree.get(edge.to) ?? 0) + 1);
    return true;
  });
  const selected = [...byId.values()]
    .sort(
      (left, right) =>
        (degree.get(right.id) ?? 0) - (degree.get(left.id) ?? 0) ||
        right.mtime - left.mtime ||
        left.id.localeCompare(right.id),
    )
    .slice(0, BRAIN_NODE_LIMIT);
  const selectedIds = new Set(selected.map((node) => node.id));
  const edges = validEdges
    .filter((edge) => selectedIds.has(edge.from) && selectedIds.has(edge.to))
    .slice(0, BRAIN_EDGE_LIMIT);
  const latest = raw.nodes.reduce((value, node) => Math.max(value, node.mtime), 0);

  return {
    available: true,
    nodes: selected.map((node) => ({
      id: node.id,
      tags: Array.isArray(node.tags)
        ? node.tags
            .filter((tag): tag is string => typeof tag === "string")
            .slice(0, 24)
            .map((tag) => tag.slice(0, 128))
        : [],
      mtime: node.mtime,
    })),
    edges,
    totalNodes: byId.size,
    totalEdges: validEdges.length,
    truncated: selected.length < byId.size || edges.length < validEdges.length,
    updatedAt: latest > 0 ? new Date(latest * 1_000).toISOString() : null,
  };
}

export function brainFailure(error: unknown): BrainGraph {
  if (error instanceof z.ZodError || error instanceof RangeError) {
    return { available: false, reason: "invalid-response" };
  }
  const code = (error as { code?: unknown } | null)?.code;
  if (code === "NODE_UNAUTHORIZED") return { available: false, reason: "unauthorized" };
  if (code === "NODE_PIN_MISMATCH") return { available: false, reason: "identity-mismatch" };
  return { available: false, reason: "unreachable" };
}
