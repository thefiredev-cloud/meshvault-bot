import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  HERMES_ATTRIBUTION,
  HERMES_BOT_MODE_PLUGIN,
  HERMES_COMMIT,
  HERMES_LICENSE,
  HERMES_RELEASE_TAG,
  HERMES_UPSTREAM,
  HERMES_VENDOR_DIR,
  HERMES_VERSION,
  SELF_EVOLUTION_VENDOR_DIR,
} from "./hermes.js";

describe("Hermes vendor pin", () => {
  it("locks v0.20.4 and MIT attribution", () => {
    expect(HERMES_VERSION).toBe("0.20.4");
    expect(HERMES_RELEASE_TAG).toBe("v2026.8.18");
    expect(HERMES_COMMIT).toBe("e624e9fde561e1add9388384012b295fde669ade");
    expect(HERMES_LICENSE).toBe("MIT");
    expect(HERMES_UPSTREAM).toBe("https://github.com/NousResearch/hermes-agent");
    expect(HERMES_ATTRIBUTION).toContain("Nous Research");
    expect(HERMES_ATTRIBUTION).toContain("Bot Mode");
  });

  it("keeps the vendored LICENSE and Bot Mode plugin", () => {
    const license = readFileSync(path.resolve(HERMES_VENDOR_DIR, "LICENSE"), "utf8");
    expect(license).toContain("MIT License");
    expect(license).toContain("Nous Research");
    const pyproject = readFileSync(path.resolve(HERMES_VENDOR_DIR, "pyproject.toml"), "utf8");
    expect(pyproject).toContain('version = "0.20.4"');
    const plugin = readFileSync(path.resolve(HERMES_BOT_MODE_PLUGIN, "plugin.js"), "utf8");
    expect(plugin).toContain("Message from");
    expect(plugin).toContain("Bot Chat");
  });

  it("keeps MIT skill-improve sources and excludes Darwinian code", () => {
    const notice = readFileSync(path.resolve(SELF_EVOLUTION_VENDOR_DIR, "NOTICE"), "utf8");
    expect(notice).toContain("MIT");
    expect(notice).toContain("Darwinian");
    const evolve = readFileSync(
      path.resolve(SELF_EVOLUTION_VENDOR_DIR, "evolution/skills/evolve_skill.py"),
      "utf8",
    );
    expect(evolve).toContain("evolve");
    expect(evolve).not.toContain("darwinian_evolver");
  });
});
