import { describe, expect, it } from "vitest";
import { listPiCatalog, scriptedCatalogEntry } from "./pi-models.js";

describe("Pi model catalog", () => {
  it("lists real Pi providers instead of a two-option dropdown", () => {
    const catalog = listPiCatalog();
    const providers = new Set(catalog.map((entry) => entry.provider));
    expect(catalog.length).toBeGreaterThan(20);
    expect(providers.has("openrouter")).toBe(true);
    expect(providers.has("qwen")).toBe(true);
    expect(providers.has("spark-gx10")).toBe(true);
    const qwen = catalog.find((entry) => entry.provider === "qwen" && entry.id === "qwen-plus");
    expect(qwen?.label).toMatch(/Qwen/i);
    expect(qwen?.billing).toMatch(/DashScope/);
    expect(providers.size).toBeGreaterThan(5);
    expect(
      catalog.some(
        (entry) => entry.auth === "oauth" || entry.auth === "both" || entry.subscription,
      ),
    ).toBe(true);
    const chatgpt = catalog.find((entry) => entry.provider === "openai-codex");
    expect(chatgpt?.signIn).toBe("device-code");
    expect(chatgpt?.billing).toMatch(/ChatGPT Plus or Pro/);
    const copilot = catalog.find((entry) => entry.provider === "github-copilot");
    expect(copilot?.signIn).toBe("device-code");
    const grok = catalog.find((entry) => entry.provider === "xai");
    expect(grok?.signIn).toBe("device-code");
    expect(scriptedCatalogEntry.provider).toBe("scripted");
  });
});
