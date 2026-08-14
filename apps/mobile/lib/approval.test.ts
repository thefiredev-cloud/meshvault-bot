import { describe, expect, it, vi } from "vitest";
import { applyMobileThreadEvent, type MobileMessage, type MobileSnapshot } from "./api.js";
import { ownerApprovalForMessage } from "./approval.js";

vi.mock("expo-secure-store", () => ({
  deleteItemAsync: vi.fn(),
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
}));

const supplied = [
  { id: "ship", label: "Ship now" },
  { id: "hold", label: "Hold" },
];
const message: MobileMessage = {
  id: "message-1",
  role: "bot",
  runId: "run-1",
  blocks: [
    {
      kind: "ask",
      text: "Publish the release?",
      detail: "Target: production",
      actions: supplied,
    },
  ],
};

describe("mobile owner approval", () => {
  it("preserves detail and supplied actions for the exact waiting run", () => {
    const approval = ownerApprovalForMessage(
      message,
      { id: "run-1", status: "waiting_input" },
      null,
    );
    expect(approval?.ask.detail).toBe("Target: production");
    expect(approval?.actions).toEqual(supplied);
    expect(approval?.runId).toBe("run-1");
    expect(approval?.disabled).toBe(false);
  });

  it("disables stale and in-flight actions", () => {
    expect(
      ownerApprovalForMessage(message, { id: "run-2", status: "waiting_input" }, null)?.disabled,
    ).toBe(true);
    expect(
      ownerApprovalForMessage(message, { id: "run-1", status: "queued" }, null)?.disabled,
    ).toBe(true);
    expect(
      ownerApprovalForMessage(message, { id: "run-1", status: "waiting_input" }, "run-1")?.disabled,
    ).toBe(true);
  });

  it("leaves actionless asks as generic messages", () => {
    const run = { id: "run-1", status: "waiting_input" };
    expect(
      ownerApprovalForMessage(
        { ...message, blocks: [{ kind: "ask", text: "Continue?" }] },
        run,
        null,
      ),
    ).toBeNull();
    expect(
      ownerApprovalForMessage(
        { ...message, blocks: [{ kind: "ask", text: "Continue?", actions: [] }] },
        run,
        null,
      ),
    ).toBeNull();
  });

  it("keeps ask detail, actions, and run id from a live thread event", () => {
    const snapshot: MobileSnapshot = {
      botId: "bot-1",
      threadId: "thread-1",
      cursor: 0,
      messages: [],
      run: { id: "run-1", status: "waiting_input" },
      computer: { state: "running", controlHolder: "bot", screenAvailable: true },
    };
    const next = applyMobileThreadEvent(snapshot, {
      id: "event-1",
      type: "thread.message.created",
      runId: "run-1",
      payload: {
        messageId: "message-1",
        role: "bot",
        blocks: message.blocks,
      },
    });
    expect(next?.messages[0]).toMatchObject({
      id: "message-1",
      runId: "run-1",
      blocks: [
        {
          kind: "ask",
          detail: "Target: production",
          actions: supplied,
        },
      ],
    });
  });
});
