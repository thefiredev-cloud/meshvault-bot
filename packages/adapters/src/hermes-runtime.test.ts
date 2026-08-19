import { existsSync } from "node:fs";
import path from "node:path";
import { BOT_CHAT_TITLE, HERMES_VERSION } from "@meshbot/contracts";
import { describe, expect, it } from "vitest";
import { HermesAgentRuntime, hermesChatArgv, hermesVendorRoot } from "./hermes-runtime.js";

describe("Hermes runtime spine", () => {
  it("identifies as hermes and keeps the vendored tree", () => {
    const runtime = new HermesAgentRuntime();
    expect(runtime.describe()).toMatchObject({
      id: "hermes",
      adapterVersion: HERMES_VERSION,
      capabilities: { streaming: true, tools: true, scripted: false },
    });
    const vendor = hermesVendorRoot();
    expect(existsSync(path.join(vendor, "LICENSE"))).toBe(true);
    expect(existsSync(path.join(vendor, "apps/desktop/src/plugins/hermes-bots/plugin.js"))).toBe(
      true,
    );
  });

  it("builds the Bot Mode CLI handoff argv", () => {
    expect(
      hermesChatArgv({
        profile: "scout",
        prompt: "Message from 🤖 Chief (@chief): look at this",
      }),
    ).toEqual([
      "hermes",
      "-p",
      "scout",
      "chat",
      "--in",
      "~",
      "-c",
      BOT_CHAT_TITLE,
      "-Q",
      "-q",
      "Message from 🤖 Chief (@chief): look at this",
    ]);
  });
});
