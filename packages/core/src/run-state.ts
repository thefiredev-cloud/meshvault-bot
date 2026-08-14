import type { RunStatus } from "@meshbot/contracts";

const ACTIVE: RunStatus[] = ["queued", "leased", "running", "waiting_input", "waiting_takeover"];
const TERMINAL: RunStatus[] = ["completed", "failed", "cancelled"];

const allowed: Record<RunStatus, RunStatus[]> = {
  queued: ["leased", "cancelled"],
  leased: ["running", "queued", "cancelled"],
  running: ["waiting_input", "waiting_takeover", "completed", "failed", "cancelled", "leased"],
  waiting_input: ["queued", "cancelled"],
  waiting_takeover: ["queued", "cancelled"],
  completed: [],
  failed: ["queued"],
  cancelled: [],
};

export function canTransition(from: RunStatus, to: RunStatus): boolean {
  return allowed[from]?.includes(to) ?? false;
}

export function assertTransition(from: RunStatus, to: RunStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Illegal run transition ${from} -> ${to}`);
  }
}

export function isActive(status: RunStatus): boolean {
  return ACTIVE.includes(status);
}

export function isTerminal(status: RunStatus): boolean {
  return TERMINAL.includes(status);
}

export function nextFence(current: number): number {
  return current + 1;
}

export function canAcquireRunLease(
  status: RunStatus,
  leaseExpiresAt: Date | null,
  now: Date,
): boolean {
  if (status === "queued") return true;
  if (status !== "leased" && status !== "running") return false;
  return Boolean(leaseExpiresAt && leaseExpiresAt.getTime() <= now.getTime());
}

export type OwnerApprovalDecision = "approve" | "deny";

export function isOwnerApprovalDecision(value: string): value is OwnerApprovalDecision {
  return value === "approve" || value === "deny";
}

export function ownerApprovalCheckpoint(
  effectId: string,
  decision?: OwnerApprovalDecision,
): string {
  return `approval:${effectId}${decision ? `:${decision}` : ""}`;
}

export function parseOwnerApprovalCheckpoint(checkpoint: string | null | undefined): {
  effectId: string;
  decision?: OwnerApprovalDecision;
} | null {
  if (!checkpoint) return null;
  const [kind, effectId, rawDecision, extra] = checkpoint.split(":");
  if (kind !== "approval" || !effectId || extra !== undefined) return null;
  if (rawDecision === undefined) return { effectId };
  if (!isOwnerApprovalDecision(rawDecision)) return null;
  return { effectId, decision: rawDecision };
}

export function shouldYieldToOwnerApproval(
  startedCheckpoint: string | null | undefined,
  currentCheckpoint: string | null | undefined,
): boolean {
  const current = parseOwnerApprovalCheckpoint(currentCheckpoint);
  if (!current) return false;
  const started = parseOwnerApprovalCheckpoint(startedCheckpoint);
  return !started || started.effectId !== current.effectId || started.decision !== current.decision;
}
