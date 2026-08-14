import type { ThreadMessage } from "@meshvault/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { approvalAnswerInput, MessageView } from "./Shell.js";

const message: ThreadMessage = {
  id: "message-1",
  threadId: "thread-1",
  seq: 1,
  role: "bot",
  blocks: [
    {
      kind: "ask",
      text: "Choose what happens next.",
      actions: [
        { id: "send", label: "Approve send" },
        { id: "edit", label: "Review draft" },
      ],
    },
  ],
  runId: "run-42",
  createdAt: "2026-08-14T00:00:00.000Z",
};

describe("inline approval actions", () => {
  it("renders supplied actions and disables them when the exact run is not waiting", () => {
    const render = (canAnswer: boolean) =>
      renderToStaticMarkup(
        <MessageView
          message={message}
          canAnswer={canAnswer}
          onAnswer={async () => undefined}
          onOpenBot={() => undefined}
        />,
      );

    expect(render(true)).toContain("Approve send");
    expect(render(true)).toContain("Review draft");
    expect(render(true)).not.toContain("Send it");
    expect(render(false)).toContain('disabled=""');
  });

  it("builds the answer from the supplied action id and exact message run", () => {
    expect(approvalAnswerInput("bot-1", message.runId, "edit")).toEqual({
      botId: "bot-1",
      runId: "run-42",
      answer: "edit",
    });
    expect(approvalAnswerInput("bot-1", undefined, "edit")).toBeNull();
  });
});
