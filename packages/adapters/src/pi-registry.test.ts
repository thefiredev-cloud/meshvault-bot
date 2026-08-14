import { describe, expect, it } from "vitest";
import { piModels, qwenProvider } from "./pi-registry.js";

describe("MeshVault Pi providers", () => {
  it("registers Qwen as a DashScope / OpenAI-compatible provider", () => {
    const qwen = qwenProvider();
    expect(qwen.id).toBe("qwen");
    expect(qwen.baseUrl).toMatch(/compatible-mode\/v1/);
    expect(qwen.getModels().some((model) => model.id === "qwen-plus")).toBe(true);
    expect(piModels().getProvider("qwen")?.id).toBe("qwen");
    expect(piModels().getProvider("openrouter")?.id).toBe("openrouter");
  });
});
