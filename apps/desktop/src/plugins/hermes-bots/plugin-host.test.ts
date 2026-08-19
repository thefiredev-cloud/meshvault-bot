import { describe, expect, it } from "vitest";
import { activateBundledPlugins, createPluginStorage } from "../../plugin-host.js";
import hermesBotsPlugin from "./plugin.js";
import { HERMES_BOTS_ID } from "./types.js";

describe("Hermes Bot Mode plugin contract", () => {
  it("exports the hermes-bots plugin and registers on a MeshVault host", () => {
    expect(hermesBotsPlugin.id).toBe(HERMES_BOTS_ID);
    expect(typeof hermesBotsPlugin.register).toBe("function");

    const storage = createPluginStorage();
    const [record] = activateBundledPlugins({ [HERMES_BOTS_ID]: storage });
    expect(record?.id).toBe("hermes-bots");
    expect(record?.status).toBe("loaded");
    expect(record?.contributions.map((row) => row.id)).toEqual([
      "hermes-bots:roster",
      "hermes-bots:routines",
    ]);
  });
});
