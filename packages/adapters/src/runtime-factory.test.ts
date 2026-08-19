import { describe, expect, it } from "vitest";
import { createAgentRuntime } from "./runtime-factory.js";

describe("createAgentRuntime", () => {
  it("defaults to the Hermes spine", () => {
    expect(createAgentRuntime().describe().id).toBe("hermes");
    expect(createAgentRuntime("hermes").describe().id).toBe("hermes");
  });

  it("keeps Pi and scripted as explicit lanes", () => {
    expect(createAgentRuntime("pi").describe().id).toBe("pi");
    expect(createAgentRuntime("scripted").describe().id).toBe("scripted");
  });
});
