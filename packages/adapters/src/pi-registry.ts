import {
  createProvider,
  envApiKeyAuth,
  type Model,
  type MutableModels,
} from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { builtinModels } from "@earendil-works/pi-ai/providers/all";
import { qwenBaseUrl } from "@meshvault/core";

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
  return models;
}
