import type { BrainGraph, BrainNode } from "@rakazo/contracts";
import { Button } from "@rakazo/ui-web";
import { BrainCircuit, Rotate3D } from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { rpc } from "../lib/rpc";

const ForceGraph3D = lazy(() => import("react-force-graph-3d"));

const failureCopy: Record<Extract<BrainGraph, { available: false }>["reason"], string> = {
  "not-configured":
    "This deployment is not connected to the Windows vault yet. Pair the runtime before loading Brain.",
  unreachable:
    "The Windows vault could not be reached. Its saved graph was not replaced with sample data.",
  unauthorized:
    "The Windows vault rejected this credential. Pair the runtime again before loading Brain.",
  "identity-mismatch":
    "The Windows node certificate did not match its pinned identity. Brain stays closed until the node is paired again.",
  "invalid-response": "The Windows vault returned a graph MeshVault could not safely read.",
};

export function BrainOverlay({ onClose }: { onClose: () => void }) {
  const [graph, setGraph] = useState<BrainGraph | null>(null);
  const [requestError, setRequestError] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  async function load() {
    setRequestError(false);
    setGraph(null);
    try {
      setGraph(await rpc.brain.graph());
    } catch {
      setRequestError(true);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    element.showModal();
    closeButton.current?.focus();
    return () => {
      if (element.open) element.close();
      previousFocus?.focus();
    };
  }, []);

  function close() {
    if (dialog.current?.open) dialog.current.close();
    onClose();
  }

  const selected =
    graph?.available && selectedId
      ? (graph.nodes.find((node) => node.id === selectedId) ?? null)
      : null;

  return (
    <dialog
      ref={dialog}
      aria-labelledby="brain-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      className="fixed inset-0 m-0 h-full max-h-none w-full max-w-none flex-col bg-[#070708] p-0 text-[#E8E8EA] open:flex"
    >
      <header className="flex min-h-[72px] items-center justify-between gap-4 border-b border-[#202024] px-5 sm:px-7">
        <div className="flex min-w-0 items-center gap-3.5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-[#2A2A30] bg-[#121215] text-[#A8B5FF]">
            <BrainCircuit size={20} strokeWidth={1.7} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h1 id="brain-title" className="truncate text-[18px] font-medium tracking-[-0.01em]">
              Brain
            </h1>
            <p className="truncate text-[12.5px] text-[#7E7E86]">
              {graph?.available
                ? `${graph.totalNodes.toLocaleString()} notes · ${graph.totalEdges.toLocaleString()} links`
                : "Windows vault graph"}
            </p>
          </div>
        </div>
        <button
          ref={closeButton}
          type="button"
          aria-label="Close Brain"
          onClick={close}
          className="grid h-10 w-10 place-items-center rounded-full text-[19px] text-[#8B8B92] hover:bg-[#17171A] hover:text-[#ECECEE]"
        >
          ✕
        </button>
      </header>

      <div className="relative min-h-0 flex-1">
        {graph?.available && graph.nodes.length > 0 ? (
          <BrainCanvas graph={graph} selectedId={selectedId} onSelect={setSelectedId} />
        ) : (
          <BrainState graph={graph} requestError={requestError} onRetry={() => void load()} />
        )}

        {graph?.available && graph.nodes.length > 0 ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 bg-gradient-to-t from-[rgba(7,7,8,.92)] to-transparent p-4 pt-16 sm:p-6 sm:pt-20">
            <div className="pointer-events-auto min-w-0 max-w-[520px] rounded-2xl border border-[#25252B] bg-[rgba(15,15,18,.88)] px-4 py-3 backdrop-blur-xl">
              <label className="sr-only" htmlFor="brain-node-select">
                Select a Brain note
              </label>
              <select
                id="brain-node-select"
                value={selectedId ?? ""}
                onChange={(event) => setSelectedId(event.target.value || null)}
                className="mb-2 max-w-full rounded-lg border border-[#303038] bg-[#151519] px-2.5 py-1.5 text-[12px] text-[#D8D8DC]"
              >
                <option value="">Select a note</option>
                {graph.nodes.map((node) => (
                  <option key={node.id} value={node.id}>
                    {node.id}
                  </option>
                ))}
              </select>
              {selected ? (
                <SelectedNode node={selected} />
              ) : (
                <GraphHint truncated={graph.truncated} />
              )}
            </div>
            <span className="hidden items-center gap-2 rounded-full border border-[#25252B] bg-[rgba(15,15,18,.8)] px-3 py-2 text-[12px] text-[#84848C] backdrop-blur-xl sm:flex">
              <Rotate3D size={14} aria-hidden="true" /> Drag to orbit · scroll to zoom
            </span>
          </div>
        ) : null}
      </div>
    </dialog>
  );
}

function BrainCanvas({
  graph,
  selectedId,
  onSelect,
}: {
  graph: Extract<BrainGraph, { available: true }>;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const data = useMemo(() => ({ nodes: graph.nodes, links: graph.edges }), [graph]);

  useEffect(() => {
    if (!host.current) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(host.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={host}
      role="img"
      className="h-full w-full"
      aria-label="3D visualization of the vault graph"
    >
      {size.width > 0 && size.height > 0 ? (
        <Suspense fallback={<GraphLoading />}>
          <ForceGraph3D
            width={size.width}
            height={size.height}
            graphData={data}
            nodeId="id"
            linkSource="from"
            linkTarget="to"
            backgroundColor="#070708"
            showNavInfo={false}
            nodeRelSize={4}
            nodeVal={2.4}
            nodeOpacity={0.92}
            nodeResolution={12}
            nodeLabel={() => ""}
            nodeColor={(node) => (String(node.id) === selectedId ? "#F4F5FF" : "#778CFF")}
            linkColor={() => "#3D456F"}
            linkOpacity={0.32}
            linkWidth={0.45}
            cooldownTicks={90}
            onNodeClick={(node) => onSelect(String(node.id))}
          />
        </Suspense>
      ) : (
        <GraphLoading />
      )}
    </div>
  );
}

function BrainState({
  graph,
  requestError,
  onRetry,
}: {
  graph: BrainGraph | null;
  requestError: boolean;
  onRetry: () => void;
}) {
  const loading = !graph && !requestError;
  const empty = graph?.available && graph.nodes.length === 0;
  const detail = requestError
    ? "The Brain request failed before a graph response arrived."
    : graph && !graph.available
      ? failureCopy[graph.reason]
      : empty
        ? "The Windows vault is connected and contains no Markdown notes yet."
        : "Reading the Windows vault graph…";

  return (
    <div className="grid h-full place-items-center px-6 text-center">
      <div className="max-w-[480px]">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-[20px] border border-[#25252B] bg-[#111114] text-[#778CFF]">
          <BrainCircuit size={25} strokeWidth={1.5} aria-hidden="true" />
        </span>
        <h2 className="mt-5 text-[20px] font-medium text-[#ECECEE]">
          {loading ? "Loading Brain" : empty ? "Brain is empty" : "Brain unavailable"}
        </h2>
        <p className="mt-2 text-[14px] leading-6 text-[#85858D]">{detail}</p>
        {!loading ? (
          <Button type="button" variant="outline" size="sm" className="mt-5" onClick={onRetry}>
            Try again
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function GraphLoading() {
  return (
    <div className="grid h-full place-items-center text-[13px] text-[#777780]">Drawing graph…</div>
  );
}

function GraphHint({ truncated }: { truncated: boolean }) {
  return (
    <p className="text-[13px] leading-5 text-[#9A9AA2]">
      Select a note or click a node to inspect it.
      {truncated ? " The view is bounded to keep 3D navigation smooth." : ""}
    </p>
  );
}

function SelectedNode({ node }: { node: BrainNode }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[14px] font-medium text-[#F0F0F2]">{node.id}</p>
      <p className="mt-1 truncate text-[12px] text-[#808089]">
        {node.tags.length > 0 ? node.tags.join(" · ") : "No tags"}
      </p>
    </div>
  );
}
