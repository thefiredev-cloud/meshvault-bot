import { describe, expect, it } from "vitest";
import { appContract, BrainGraphSchema, CreateBotInput, ProductEventType } from "./index.js";

describe("contracts", () => {
  it("parses bot create input", () => {
    const parsed = CreateBotInput.parse({ name: "Chief" });
    expect(parsed.title).toBe("");
    expect(parsed.notifyOnFinish).toBe(true);
  });

  it("exposes the product rpc surface", () => {
    expect(appContract.models.beginOAuth).toBeTruthy();
    expect(appContract.models.completeOAuth).toBeTruthy();
    expect(appContract.bots.create).toBeTruthy();
    expect(appContract.bots.remove).toBeTruthy();
    expect(appContract.threads.subscribe).toBeTruthy();
    expect(appContract.notifications.registerPush).toBeTruthy();
    expect(appContract.brain.graph).toBeTruthy();
    expect(ProductEventType.options).toContain("thread.message.created");
    expect(ProductEventType.options).toContain("thread.subagent");
    expect(ProductEventType.options).toContain("bot.spawned");
  });

  it("keeps unavailable graph state distinct from an empty vault", () => {
    expect(BrainGraphSchema.parse({ available: false, reason: "not-configured" })).toEqual({
      available: false,
      reason: "not-configured",
    });
    expect(
      BrainGraphSchema.parse({
        available: true,
        nodes: [],
        edges: [],
        totalNodes: 0,
        totalEdges: 0,
        truncated: false,
        updatedAt: null,
      }).available,
    ).toBe(true);
  });
});
