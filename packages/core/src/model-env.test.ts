import { describe, expect, it } from "vitest";
import {
  DEFAULT_QWEN_BASE_URL,
  DEFAULT_QWEN_MODEL,
  defaultPiModel,
  defaultPiProvider,
  fallbackApiKey,
  hasDeploymentModelKey,
  qwenApiKey,
  qwenBaseUrl,
} from "./model-env.js";

describe("model env", () => {
  it("prefers QWEN_API_KEY then DASHSCOPE_API_KEY", () => {
    expect(qwenApiKey({ QWEN_API_KEY: "qwen-key", DASHSCOPE_API_KEY: "dash-key" })).toBe(
      "qwen-key",
    );
    expect(qwenApiKey({ DASHSCOPE_API_KEY: "dash-key" })).toBe("dash-key");
    expect(qwenApiKey({})).toBeUndefined();
  });

  it("uses DashScope international as the default Qwen-compatible base URL", () => {
    expect(qwenBaseUrl({})).toBe(DEFAULT_QWEN_BASE_URL);
    expect(qwenBaseUrl({ QWEN_BASE_URL: "http://127.0.0.1:11434/v1" })).toBe(
      "http://127.0.0.1:11434/v1",
    );
    expect(
      qwenBaseUrl({ DASHSCOPE_BASE_URL: "https://dashscope.aliyuncs.com/compatible-mode/v1" }),
    ).toBe("https://dashscope.aliyuncs.com/compatible-mode/v1");
  });

  it("defaults the product model path to Qwen", () => {
    expect(defaultPiProvider({})).toBe("qwen");
    expect(defaultPiModel({})).toBe(DEFAULT_QWEN_MODEL);
    expect(DEFAULT_QWEN_MODEL).toBe("qwen3.8-max");
  });

  it("keeps an explicit OpenRouter default", () => {
    const env = { PI_DEFAULT_PROVIDER: "openrouter" };
    expect(defaultPiProvider(env)).toBe("openrouter");
    expect(defaultPiModel(env)).toBe("deepseek/deepseek-v4-flash-0731");
  });

  it("resolves BYO keys the same way OpenRouter is wired", () => {
    expect(fallbackApiKey("qwen", { QWEN_API_KEY: "q" })).toBe("q");
    expect(fallbackApiKey("openrouter", { OPENROUTER_API_KEY: "or" })).toBe("or");
    expect(fallbackApiKey("meshvault-gateway", { MESHVAULT_GATEWAY_KEY: "gw" })).toBe("gw");
    expect(fallbackApiKey("meshvault-gateway", { MESHBOT_GATEWAY_KEY: "legacy" })).toBe(
      "legacy",
    );
    expect(fallbackApiKey("anthropic", { QWEN_API_KEY: "must-not-leak" })).toBeUndefined();
    expect(hasDeploymentModelKey({ OPENROUTER_API_KEY: "or" })).toBe(true);
    expect(hasDeploymentModelKey({ DASHSCOPE_API_KEY: "d" })).toBe(true);
    expect(hasDeploymentModelKey({ MESHVAULT_GATEWAY_URL: "http://127.0.0.1:4000" })).toBe(true);
    expect(hasDeploymentModelKey({})).toBe(false);
  });

  it("requires an explicit model for providers without a product default", () => {
    expect(() => defaultPiModel({ PI_DEFAULT_PROVIDER: "anthropic" })).toThrow(
      /PI_DEFAULT_MODEL is required/,
    );
  });
});
