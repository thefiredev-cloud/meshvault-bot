import type { MobileMessage, MobileSnapshot } from "./api";

export function ownerApprovalForMessage(
  message: MobileMessage,
  run: MobileSnapshot["run"],
  inFlightRunId: string | null,
) {
  const ask = message.blocks.find((block) => block.kind === "ask");
  if (!ask?.actions?.length) return null;
  const runId = message.runId;
  const active = Boolean(runId && run?.id === runId && run.status === "waiting_input");
  const pending = Boolean(runId && inFlightRunId === runId);
  return {
    ask,
    runId,
    actions: ask.actions,
    disabled: !active || pending,
    pending,
  };
}
