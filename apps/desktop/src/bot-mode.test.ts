import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createBotModeRuntime } from "./bot-mode.js";

describe("desktop Bot Mode runtime", () => {
  it("creates a bot, opens its canonical chat, and persists the pin", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "meshbot-bot-mode-"));
    const file = path.join(directory, "bot-mode.json");
    try {
      const runtime = createBotModeRuntime(file);
      const created = await runtime.createBot({ name: "ops", title: "Ops" });
      expect(created.roster.map((bot) => bot.name)).toEqual(["default", "ops"]);
      expect(created.plugin?.id).toBe("hermes-bots");

      const opened = await runtime.openChat("ops");
      expect(opened.selectedBot).toBe("ops");
      expect(opened.roster.find((bot) => bot.name === "ops")?.chat).toMatch(/^chat-/);

      const sent = await runtime.sendMessage("summarize inbox");
      expect(sent.messages.some((row) => row.text === "summarize inbox")).toBe(true);

      const reloaded = createBotModeRuntime(file);
      const snapshot = await reloaded.load();
      expect(snapshot.roster.find((bot) => bot.name === "ops")?.title).toBe("Ops");
      expect(snapshot.roster.find((bot) => bot.name === "ops")?.chat).toBe(
        opened.roster.find((bot) => bot.name === "ops")?.chat,
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("hides a selected bot and falls back to the next visible row", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "meshbot-bot-mode-"));
    const file = path.join(directory, "bot-mode.json");
    try {
      const runtime = createBotModeRuntime(file);
      await runtime.createBot({ name: "ghost" });
      const hidden = await runtime.hideBot("ghost", true);
      expect(hidden.selectedBot).toBe("default");
      expect(hidden.roster.some((bot) => bot.name === "ghost")).toBe(false);
      expect(hidden.hiddenCount).toBe(1);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
