import { describe, expect, it } from "vitest";
import { PiAgentRuntime, runScopedToolExecutionId } from "./pi-runtime.js";

describe("Pi agent runtime", () => {
  it("scopes model tool call ids to one run", () => {
    expect(runScopedToolExecutionId("run-a", "call-1", "destination.write")).toBe("run-a:call-1");
    expect(runScopedToolExecutionId("run-b", "call-1", "destination.write")).toBe("run-b:call-1");
    expect(runScopedToolExecutionId("run-a", undefined, "destination.write")).toBe(
      "run-a:destination.write",
    );
  });

  it.each([
    ["openrouter", "not-a-real-model-xyz"],
    ["not-a-provider", "qwen-plus"],
    ["openrouter", "qwen-plus"],
  ])("rejects the exact unknown provider/model pair %s/%s", async (provider, id) => {
    const runtime = new PiAgentRuntime();
    const events: string[] = [];
    for await (const event of runtime.run(
      {
        botId: "b",
        threadId: "t",
        runId: `r-${provider}-${id}`,
        prompt: "hi",
        instructions: "test",
        history: [],
        tools: [],
        model: { provider, id },
      },
      {
        operationId: "1",
        traceId: "1",
        workspaceId: "w",
        userId: "u",
        signal: new AbortController().signal,
      },
    )) {
      if (event.type === "text") events.push(event.text);
    }
    expect(events.join(" ")).toContain(`Unknown model ${provider}/${id}`);
  });
});
