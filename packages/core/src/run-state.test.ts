import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  assertTransition,
  canAcquireRunLease,
  canTransition,
  ownerApprovalCheckpoint,
  parseOwnerApprovalCheckpoint,
  shouldYieldToOwnerApproval,
} from "./run-state.js";

describe("run state machine", () => {
  it("requires owner-held waits to queue before leasing", () => {
    expect(canTransition("waiting_takeover", "leased")).toBe(false);
    expect(canTransition("waiting_takeover", "running")).toBe(false);
    expect(canTransition("waiting_input", "leased")).toBe(false);
    expect(canTransition("waiting_input", "queued")).toBe(true);
  });

  it("rejects rewriting a completed run", () => {
    expect(() => assertTransition("completed", "running")).toThrow(/illegal/i);
  });

  it("never leaves a terminal state except failed retry", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("completed" as const, "cancelled" as const),
        fc.constantFrom(
          "queued" as const,
          "leased" as const,
          "running" as const,
          "waiting_input" as const,
          "completed" as const,
        ),
        (from, to) => {
          expect(canTransition(from, to)).toBe(false);
        },
      ),
    );
  });

  it("round-trips only exact owner approval checkpoints", () => {
    expect(parseOwnerApprovalCheckpoint(ownerApprovalCheckpoint("effect-1"))).toEqual({
      effectId: "effect-1",
    });
    expect(parseOwnerApprovalCheckpoint(ownerApprovalCheckpoint("effect-1", "approve"))).toEqual({
      effectId: "effect-1",
      decision: "approve",
    });
    expect(parseOwnerApprovalCheckpoint("approval:effect-1:edit")).toBeNull();
    expect(parseOwnerApprovalCheckpoint("approval:effect-1:approve:extra")).toBeNull();
  });

  it("rejects active leases and latches a newer approval checkpoint", () => {
    const now = new Date("2026-08-14T12:00:00.000Z");
    expect(canAcquireRunLease("running", new Date(now.getTime() + 1), now)).toBe(false);
    expect(canAcquireRunLease("running", now, now)).toBe(true);
    expect(canAcquireRunLease("queued", new Date(now.getTime() + 1), now)).toBe(true);
    expect(canAcquireRunLease("waiting_input", null, now)).toBe(false);
    expect(canAcquireRunLease("waiting_takeover", null, now)).toBe(false);

    expect(shouldYieldToOwnerApproval(null, ownerApprovalCheckpoint("effect-1"))).toBe(true);
    expect(
      shouldYieldToOwnerApproval(
        ownerApprovalCheckpoint("effect-1", "approve"),
        ownerApprovalCheckpoint("effect-1", "approve"),
      ),
    ).toBe(false);
  });
});
