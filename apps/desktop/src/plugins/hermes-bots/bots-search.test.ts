import { describe, expect, it } from "vitest";
import { filterBots } from "./core.js";

const roster = [
  { name: "agency-audio-designer", title: "Audio Designer" },
  { name: "agency-ai-engineer", title: "AI Engineer" },
  { name: "default" },
];
const meta = {
  "agency-audio-designer": { title: "Sound Studio" },
  default: {},
};

describe("bot search", () => {
  it("matches visible display names case-insensitively", () => {
    expect(filterBots(roster, meta, "SOUND").map((bot) => bot.name)).toEqual([
      "agency-audio-designer",
    ]);
  });

  it("matches profile handles and preserves roster order", () => {
    expect(filterBots(roster, meta, "agency-").map((bot) => bot.name)).toEqual([
      "agency-audio-designer",
      "agency-ai-engineer",
    ]);
    expect(filterBots(roster, meta, "@hermes").map((bot) => bot.name)).toEqual(["default"]);
    expect(filterBots(roster, meta, "default").map((bot) => bot.name)).toEqual(["default"]);
  });

  it("blank bot search returns the existing roster reference", () => {
    expect(filterBots(roster, meta, " ")).toBe(roster);
  });
});
