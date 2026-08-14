import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  normalizeServerOrigin,
  readSavedServerOrigin,
  resolveStartupOrigin,
  saveServerOrigin,
} from "./server-origin.js";

describe("desktop server selection", () => {
  it("validates, persists, and resolves the selected origin", async () => {
    expect(normalizeServerOrigin(" https://bot.example.test/ ")).toBe("https://bot.example.test");
    expect(normalizeServerOrigin("http://127.4.3.2:5173")).toBe("http://127.4.3.2:5173");
    expect(() => normalizeServerOrigin("http://bot.example.test")).toThrow("HTTPS is required");
    expect(() => normalizeServerOrigin("https://bot.example.test/login")).toThrow("without a path");

    const directory = await mkdtemp(path.join(os.tmpdir(), "meshbot-desktop-"));
    const file = path.join(directory, "server.json");
    try {
      await saveServerOrigin(file, "https://saved.example.test/");
      const saved = await readSavedServerOrigin(file);
      expect(saved).toBe("https://saved.example.test");
      expect(
        resolveStartupOrigin({
          override: "https://override.example.test",
          saved,
          packaged: true,
        }),
      ).toBe("https://override.example.test");
      expect(resolveStartupOrigin({ packaged: true })).toBeUndefined();
      expect(resolveStartupOrigin({ packaged: false })).toBe("http://127.0.0.1:5173");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
