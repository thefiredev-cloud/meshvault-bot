import type { AdapterContext, MutationPermit } from "@meshbot/adapter-kit";

type MutationPurpose = MutationPermit["purpose"];

export class SandboxMutationFence {
  private readonly highestByBot = new Map<string, number>();

  accept(
    botId: string,
    context: AdapterContext,
    purposes: readonly MutationPurpose[],
    controlLeaseId?: string,
  ): MutationPermit {
    if (!botId || (context.botId && context.botId !== botId)) {
      throw new Error("sandbox mutation permit bot mismatch");
    }
    const permit = context.mutationPermit;
    if (
      !permit ||
      !Number.isSafeInteger(permit.operationFence) ||
      permit.operationFence < 1 ||
      !purposes.includes(permit.purpose)
    ) {
      throw new Error("sandbox mutation permit is missing or invalid");
    }
    if (permit.purpose === "run") {
      if (
        !permit.runId ||
        context.runId !== permit.runId ||
        !Number.isSafeInteger(permit.runLeaseFence) ||
        permit.runLeaseFence < 1
      ) {
        throw new Error("sandbox run mutation permit is invalid");
      }
    } else if (permit.purpose === "control") {
      if (!permit.controlLeaseId || permit.controlLeaseId !== controlLeaseId) {
        throw new Error("sandbox control mutation permit is invalid");
      }
    } else if (permit.bootToken !== undefined && !permit.bootToken) {
      throw new Error("sandbox lifecycle mutation permit is invalid");
    }
    const highest = this.highestByBot.get(botId) ?? 0;
    if (permit.operationFence < highest) {
      throw new Error("sandbox mutation permit is stale");
    }
    this.highestByBot.set(botId, permit.operationFence);
    return permit;
  }
}
