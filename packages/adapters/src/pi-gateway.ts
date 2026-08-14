// Modified by FireDev LLC dba MeshVault on 2026-08-14.
//
// Mesh Bot fleet gateway provider. The site promises "point a bot at Claude,
// GPT, Grok, or a local model"; this is the local-model lane. Any
// OpenAI-completions-compatible endpoint works: LiteLLM, Ollama, LM Studio,
// vLLM. Configured by env so a deployment owner never pastes a key into a
// browser to use their own cluster:
//
//   MESHBOT_GATEWAY_URL     base URL, e.g. http://127.0.0.1:4000
//   MESHBOT_GATEWAY_KEY     API key (LITELLM_MASTER_KEY also accepted)
//   MESHBOT_GATEWAY_MODELS  comma-separated model ids the endpoint serves
//
// Unset URL means unconfigured: nothing registers, nothing shows in the
// catalog, and no code path can stream to a half-configured endpoint.

import { createProvider, envApiKeyAuth, type MutableModels } from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";

export const GATEWAY_PROVIDER_ID = "meshbot-gateway";

export type GatewayConfig = {
  baseUrl: string;
  modelIds: string[];
};

export function gatewayConfigFromEnv(
  source: Record<string, string | undefined> = process.env,
): GatewayConfig | null {
  const baseUrl = source.MESHBOT_GATEWAY_URL?.trim().replace(/\/+$/, "");
  if (!baseUrl) return null;
  const modelIds = (source.MESHBOT_GATEWAY_MODELS ?? "local-deepseek-flash")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  if (modelIds.length === 0) return null;
  return { baseUrl, modelIds };
}

export function gatewayProvider(config: GatewayConfig) {
  const apiKeyAuth = envApiKeyAuth("Mesh Bot gateway key", [
    "MESHBOT_GATEWAY_KEY",
    "LITELLM_MASTER_KEY",
  ]);
  return createProvider({
    id: GATEWAY_PROVIDER_ID,
    name: "Mesh Bot Gateway",
    baseUrl: config.baseUrl,
    auth: {
      apiKey: {
        ...apiKeyAuth,
        resolve: async (input) =>
          (await apiKeyAuth.resolve(input)) ?? {
            auth: {},
            source: "configured Mesh Bot gateway",
          },
      },
    },
    models: config.modelIds.map((id) => ({
      id,
      name: id,
      api: "openai-completions",
      provider: GATEWAY_PROVIDER_ID,
      baseUrl: config.baseUrl,
      reasoning: false,
      input: ["text" as const],
      // Owned endpoint: the meter reads zero on purpose, there is no bill.
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 128_000,
      maxTokens: 8_192,
    })),
    api: openAICompletionsApi(),
  });
}

/** Registers the gateway on a Models registry when configured. Returns the
 *  config in use so callers can log it, or null when unconfigured. */
export function registerGateway(
  models: MutableModels,
  source: Record<string, string | undefined> = process.env,
): GatewayConfig | null {
  const config = gatewayConfigFromEnv(source);
  if (!config) return null;
  models.setProvider(gatewayProvider(config));
  return config;
}
