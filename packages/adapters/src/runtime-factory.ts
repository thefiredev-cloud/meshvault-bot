import type { AgentRuntime } from "@meshbot/adapter-kit";
import { HermesAgentRuntime } from "./hermes-runtime.js";
import { PiAgentRuntime } from "./pi-runtime.js";
import { ScriptedAgentRuntime } from "./scripted-runtime.js";

export function createAgentRuntime(kind = "hermes"): AgentRuntime {
  if (kind === "scripted") return new ScriptedAgentRuntime();
  if (kind === "pi") return new PiAgentRuntime();
  return new HermesAgentRuntime();
}
