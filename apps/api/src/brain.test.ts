import { describe, expect, it } from "vitest";
import { BRAIN_EDGE_LIMIT, BRAIN_NODE_LIMIT, brainFailure, normalizeBrainGraph } from "./brain.js";

describe("brain graph boundary", () => {
  it("keeps the most connected nodes, normalizes tags, and bounds the browser payload", () => {
    const nodes = Array.from({ length: BRAIN_NODE_LIMIT + 2 }, (_, index) => ({
      id: `note-${index}.md`,
      tags: index === 0 ? ["root", 7] : [],
      mtime: index,
    }));
    const edges = Array.from({ length: BRAIN_EDGE_LIMIT + 2 }, (_, index) => ({
      from: "note-0.md",
      to: `note-${(index % BRAIN_NODE_LIMIT) + 1}.md`,
    }));

    const graph = normalizeBrainGraph({ nodes, edges });

    expect(graph.available).toBe(true);
    if (!graph.available) return;
    expect(graph.nodes).toHaveLength(BRAIN_NODE_LIMIT);
    expect(graph.edges.length).toBeLessThanOrEqual(BRAIN_EDGE_LIMIT);
    expect(graph.nodes[0]).toMatchObject({ id: "note-0.md", tags: ["root"] });
    expect(graph.totalNodes).toBe(BRAIN_NODE_LIMIT + 2);
    expect(graph.truncated).toBe(true);
    expect(graph.updatedAt).toBe(new Date((BRAIN_NODE_LIMIT + 1) * 1_000).toISOString());
  });

  it("does not report malformed or identity-failed data as an empty vault", () => {
    expect(brainFailure(Object.assign(new Error("failed"), { code: "NODE_PIN_MISMATCH" }))).toEqual(
      {
        available: false,
        reason: "identity-mismatch",
      },
    );
    expect(() => normalizeBrainGraph({ nodes: "wrong", edges: [] })).toThrow();
  });
});
