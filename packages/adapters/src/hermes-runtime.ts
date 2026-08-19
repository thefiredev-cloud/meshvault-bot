import { existsSync } from "node:fs";
import path from "node:path";
import type {
  AdapterContext,
  AgentRunRequest,
  AgentRuntime,
  AgentRuntimeEvent,
} from "@meshbot/adapter-kit";
import { BOT_CHAT_TITLE, HERMES_VENDOR_DIR, HERMES_VERSION } from "@meshbot/contracts";
import { PiAgentRuntime } from "./pi-runtime.js";

const running = new Map<string, AbortController>();

export function hermesVendorRoot(from = process.cwd()): string {
  let dir = from;
  for (let i = 0; i < 8; i += 1) {
    const candidate = path.join(dir, HERMES_VENDOR_DIR);
    if (existsSync(path.join(candidate, "LICENSE"))) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.resolve(from, HERMES_VENDOR_DIR);
}

export function hermesChatArgv(input: {
  profile: string;
  prompt: string;
  conversation?: string;
}): string[] {
  return [
    "hermes",
    "-p",
    input.profile,
    "chat",
    "--in",
    "~",
    "-c",
    input.conversation ?? BOT_CHAT_TITLE,
    "-Q",
    "-q",
    input.prompt,
  ];
}

/**
 * Mesh Bot spine: Hermes Agent + Bot Mode.
 * Live model tokens still use the MeshVault Qwen / DeepSeek / gateway catalog
 * (the existing Pi client) so we never invent Nous Portal keys.
 */
export class HermesAgentRuntime implements AgentRuntime {
  private readonly models = new PiAgentRuntime();

  describe() {
    return {
      id: "hermes",
      contractVersion: "1",
      adapterVersion: HERMES_VERSION,
      capabilities: { streaming: true, compaction: true, tools: true, scripted: false },
    };
  }

  async abort(runId: string): Promise<void> {
    running.get(runId)?.abort();
    await this.models.abort(runId);
  }

  async *run(request: AgentRunRequest, context: AdapterContext): AsyncIterable<AgentRuntimeEvent> {
    const controller = new AbortController();
    running.set(request.runId, controller);
    try {
      yield* this.models.run(request, {
        ...context,
        signal: context.signal ?? controller.signal,
      });
    } finally {
      running.delete(request.runId);
    }
  }
}
