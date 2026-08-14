import { describe, expect, it } from "vitest";
import { piModels, qwenProvider, sparkGx10Provider } from "./pi-registry.js";

describe("MeshVault Pi providers", () => {
  it("registers Qwen as a DashScope / OpenAI-compatible provider", () => {
    const qwen = qwenProvider();
    expect(qwen.id).toBe("qwen");
    expect(qwen.baseUrl).toMatch(/compatible-mode\/v1/);
    expect(qwen.getModels().some((model) => model.id === "qwen-plus")).toBe(true);
    expect(piModels().getProvider("qwen")?.id).toBe("qwen");
    expect(piModels().getProvider("openrouter")?.id).toBe("openrouter");
  });

  it("registers Spark+GX10 DeepSeek V4 Flash as a local OpenAI-compatible plane", () => {
    const spark = sparkGx10Provider();
    expect(spark.id).toBe("spark-gx10");
    expect(spark.getModels().map((model) => model.id)).toContain("deepseek-v4-flash");
  });
});
