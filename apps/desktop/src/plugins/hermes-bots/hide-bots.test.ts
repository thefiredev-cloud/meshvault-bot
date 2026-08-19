import { describe, expect, it } from "vitest";
import { fallbackSelectionAfterHide, isBotHidden, mergeServerMeta } from "./core.js";

describe("hide bots", () => {
  it("hidden bots are filtered out; remote-source rows of the same name stay visible", () => {
    const meta = { ghost: { hidden: true } };
    const roster = [
      { name: "default" },
      { name: "ghost" },
      { name: "ghost", remoteSource: true, connectionId: "mini" },
    ];
    const visible = roster.filter((bot) => !isBotHidden(bot, meta));
    expect(visible.map((bot) => `${bot.remoteSource ? "r:" : ""}${bot.name}`)).toEqual([
      "default",
      "r:ghost",
    ]);
  });

  it("server false beats stale local true", () => {
    const { next } = mergeServerMeta({ ghost: { hidden: true, title: "Ghost" } }, [
      { name: "ghost", ui_meta: { "hermes-bots": { hidden: false, title: "Ghost" } } },
    ]);
    expect(next.ghost?.hidden).toBe(false);
  });

  it("a hide done elsewhere lands via mergeServerMeta", () => {
    const { next, changed } = mergeServerMeta({ ghost: { title: "Ghost" } }, [
      { name: "ghost", ui_meta: { "hermes-bots": { hidden: true, title: "Ghost" } } },
    ]);
    expect(changed).toBe(true);
    expect(next.ghost?.hidden).toBe(true);
  });

  it("hiding the selected bot falls back to the first visible bot", () => {
    expect(
      fallbackSelectionAfterHide(
        "ghost",
        "ghost",
        [{ name: "ghost" }, { name: "scribe" }, { name: "default" }],
        {
          ghost: { hidden: true },
        },
      ),
    ).toBe("scribe");
  });

  it("falls back to default when nothing else is visible", () => {
    expect(
      fallbackSelectionAfterHide("ghost", "ghost", [{ name: "ghost" }], {
        ghost: { hidden: true },
      }),
    ).toBe("default");
  });

  it("hiding default with nothing else visible keeps the selection", () => {
    expect(
      fallbackSelectionAfterHide("default", "default", [{ name: "default" }], {
        default: { hidden: true },
      }),
    ).toBe("default");
  });

  it("hiding an unselected bot never moves the selection", () => {
    expect(
      fallbackSelectionAfterHide("ghost", "scribe", [{ name: "ghost" }, { name: "scribe" }], {
        ghost: { hidden: true },
      }),
    ).toBe("scribe");
  });
});
