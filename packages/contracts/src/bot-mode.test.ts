import { describe, expect, it } from "vitest";
import {
  botDisplayName,
  botHandle,
  botIdentitySummary,
  duplicateBotCreateInput,
  filterRoster,
  nextDuplicateBotName,
  parseBotIdentityDraft,
  parseBotIdentityUpdate,
  parseHiddenBotIds,
  parseRoutineDraft,
  rosterForDisplay,
  routineOwnerError,
  routinePresetCron,
  slugifyBotName,
  toggleHiddenBotId,
} from "./bot-mode.js";

describe("bot identity", () => {
  it("derives a handle and prefers a title as the display name", () => {
    expect(slugifyBotName("Inbox Triage")).toBe("inbox-triage");
    expect(botHandle("Inbox Triage")).toBe("@inbox-triage");
    expect(botDisplayName({ name: "inbox_triage", title: "Inbox Zero" })).toBe("Inbox Zero");
    expect(botDisplayName({ name: "seo-bot", title: "" })).toBe("seo bot");
    expect(
      botIdentitySummary({
        name: "Chief",
        title: "Ops",
        description: "Runs the week",
        instructions: "",
      }),
    ).toBe("Chief — Ops — Runs the week");
  });

  it("validates identity against existing bot contracts", () => {
    expect(
      parseBotIdentityDraft({ name: "", title: "", description: "", instructions: "" }).success,
    ).toBe(false);
    const created = parseBotIdentityDraft({
      name: " Chief ",
      title: "Ops",
      description: "Runs the week",
      instructions: "Be brief.",
    });
    expect(created.success).toBe(true);
    if (created.success) {
      expect(created.data).toMatchObject({
        name: "Chief",
        title: "Ops",
        instructions: "Be brief.",
      });
    }
    const updated = parseBotIdentityUpdate("bot_1", {
      name: "Chief",
      title: "Ops",
      description: "Runs the week",
      instructions: "Be brief.",
      modelProvider: "qwen",
      modelId: "qwen-plus",
    });
    expect(updated.success).toBe(true);
    if (updated.success) {
      expect(updated.data).toMatchObject({
        botId: "bot_1",
        modelProvider: "qwen",
        modelId: "qwen-plus",
      });
    }
  });

  it("duplicates identity without copying chat and truncates the base name", () => {
    expect(nextDuplicateBotName("Chief", ["Chief"])).toBe("Chief-2");
    expect(nextDuplicateBotName("Chief", ["Chief", "Chief-2"])).toBe("Chief-3");
    expect(nextDuplicateBotName("x".repeat(80), [])?.length).toBe(80);
    const copied = duplicateBotCreateInput(
      {
        name: "Chief",
        title: "Ops",
        description: "Runs the week",
        instructions: "Be brief.",
        color: "#9B5CF6",
        modelProvider: "qwen",
        modelId: "qwen-plus",
      },
      ["Chief"],
    );
    expect(copied).toMatchObject({
      ok: true,
      input: {
        name: "Chief-2",
        title: "Ops (copy)",
        description: "Runs the week",
        instructions: "Be brief.",
        modelProvider: "qwen",
        modelId: "qwen-plus",
      },
    });
  });
});

describe("bot roster", () => {
  const bots = [
    { id: "seo", name: "SEO Bot", title: "Improves SEO", preview: "tracking-pixel page" },
    { id: "inbox", name: "Inbox Triage", title: "Inbox Zero", preview: "draft replies" },
  ];

  it("matches display name, handle, or preview without re-ranking", () => {
    expect(filterRoster(bots, "  ").map((bot) => bot.id)).toEqual(["seo", "inbox"]);
    expect(filterRoster(bots, "@inbox-triage").map((bot) => bot.id)).toEqual(["inbox"]);
    expect(filterRoster(bots, "PIXEL").map((bot) => bot.id)).toEqual(["seo"]);
    expect(filterRoster(bots, "zero").map((bot) => bot.id)).toEqual(["inbox"]);
  });

  it("hides bots locally without dropping them from the taken-name set", () => {
    expect(parseHiddenBotIds(null)).toEqual([]);
    expect(parseHiddenBotIds('["seo","seo","inbox"]')).toEqual(["seo", "inbox"]);
    expect(parseHiddenBotIds("{")).toEqual([]);
    expect(toggleHiddenBotId(["seo"], "inbox")).toEqual({
      hiddenIds: ["seo", "inbox"],
      hidden: true,
    });
    expect(toggleHiddenBotId(["seo", "inbox"], "inbox")).toEqual({
      hiddenIds: ["seo"],
      hidden: false,
    });
    expect(rosterForDisplay(bots, ["seo"], false).map((bot) => bot.id)).toEqual(["inbox"]);
    expect(rosterForDisplay(bots, ["seo"], true).map((bot) => bot.id)).toEqual(["seo", "inbox"]);
    expect(
      nextDuplicateBotName(
        "SEO Bot",
        bots.map((bot) => bot.name),
      ),
    ).toBe("SEO Bot-2");
  });
});

describe("routines", () => {
  it("binds a routine to the selected bot and rejects empty or NUL input", () => {
    expect(routineOwnerError("bot_1", "bot_1")).toBeNull();
    expect(routineOwnerError("bot_1", "bot_2")).toBe("This routine belongs to another bot.");
    expect(
      parseRoutineDraft({ botId: "bot_1", name: "", prompt: "Check in.", cron: "0 9 * * *" }).ok,
    ).toBe(false);
    expect(
      parseRoutineDraft({
        botId: "bot_1",
        name: "Morning\0",
        prompt: "Check in.",
        cron: "0 9 * * *",
      }).error,
    ).toMatch(/NUL/);
    const parsed = parseRoutineDraft({
      botId: "bot_1",
      name: " Morning ",
      prompt: " Check inbox ",
      cron: routinePresetCron("daily"),
    });
    expect(parsed).toMatchObject({
      ok: true,
      input: {
        botId: "bot_1",
        name: "Morning",
        prompt: "Check inbox",
        cron: "0 9 * * *",
        timezone: "UTC",
        active: false,
      },
    });
  });
});
