import { createProvider, envApiKeyAuth, type Model, type MutableModels } from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { builtinModels } from "@earendil-works/pi-ai/providers/all";
import { qwenBaseUrl, sparkGx10BaseUrl } from "@rakazo/core";

const QWEN_COMPAT = {
  thinkingFormat: "qwen" as const,
  supportsDeveloperRole: false,
  supportsStore: false,
  supportsReasoningEffort: false,
};

function qwenModel(
  id: string,
  name: string,
  opts: { contextWindow: number; maxTokens: number; reasoning?: boolean; image?: boolean },
): Model<"openai-completions"> {
  const baseUrl = qwenBaseUrl();
  return {
    id,
    name,
    api: "openai-completions",
    provider: "qwen",
    baseUrl,
    reasoning: opts.reasoning ?? false,
    input: opts.image ? ["text", "image"] : ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: opts.contextWindow,
    maxTokens: opts.maxTokens,
    compat: QWEN_COMPAT,
  };
}

function sparkModel(
  id: string,
  name: string,
  baseUrl: string,
): Model<"openai-completions"> {
  return {
    id,
    name,
    api: "openai-completions",
    provider: "spark-gx10",
    baseUrl,
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 1_000_000,
    maxTokens: 384_000,
    compat: {
      thinkingFormat: "deepseek",
      supportsDeveloperRole: false,
      supportsStore: false,
      supportsReasoningEffort: true,
    },
  };
}

export function qwenProvider() {
  const baseUrl = qwenBaseUrl();
  return createProvider({
    id: "qwen",
    name: "Qwen",
    baseUrl,
    auth: {
      apiKey: envApiKeyAuth("Qwen / DashScope API key", ["QWEN_API_KEY", "DASHSCOPE_API_KEY"]),
    },
    models: [
      qwenModel("qwen-plus", "Qwen Plus", { contextWindow: 131_072, maxTokens: 16_384 }),
      qwenModel("qwen-flash", "Qwen Flash", { contextWindow: 131_072, maxTokens: 16_384 }),
      qwenModel("qwen-max", "Qwen Max", { contextWindow: 131_072, maxTokens: 16_384 }),
      qwenModel("qwen3-coder-plus", "Qwen3 Coder Plus", {
        contextWindow: 131_072,
        maxTokens: 16_384,
      }),
    ].map((model) => ({ ...model, baseUrl })),
    api: openAICompletionsApi(),
  });
}

export function sparkGx10Provider() {
  const baseUrl = sparkGx10BaseUrl();
  return createProvider({
    id: "spark-gx10",
    name: "Spark+GX10",
    baseUrl,
    auth: {
      apiKey: envApiKeyAuth("Spark+GX10 API key", ["SPARK_GX10_API_KEY"]),
    },
    models: [
      sparkModel("deepseek-v4-flash", "DeepSeek V4 Flash", baseUrl),
      sparkModel("deepseek-v4-flash-0731", "DeepSeek V4 Flash 0731", baseUrl),
    ],
    api: openAICompletionsApi(),
  });
}

let cached: MutableModels | undefined;

export function piModels(): MutableModels {
  cached ??= buildPiModels();
  return cached;
}

export function resetPiModels(): void {
  cached = undefined;
}

function buildPiModels(): MutableModels {
  const models = builtinModels();
  models.setProvider(qwenProvider());
  models.setProvider(sparkGx10Provider());
  return models;
}
