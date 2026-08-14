export const DEFAULT_QWEN_BASE_URL = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";
export const DEFAULT_QWEN_MODEL = "qwen-plus";
export const DEFAULT_OPENROUTER_MODEL = "deepseek/deepseek-v4-flash-0731";

function firstSet(source: NodeJS.ProcessEnv, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = source[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

export function qwenApiKey(source: NodeJS.ProcessEnv = process.env): string | undefined {
  return firstSet(source, ["QWEN_API_KEY", "DASHSCOPE_API_KEY"]);
}

export function qwenBaseUrl(source: NodeJS.ProcessEnv = process.env): string {
  return firstSet(source, ["QWEN_BASE_URL", "DASHSCOPE_BASE_URL"]) ?? DEFAULT_QWEN_BASE_URL;
}

export function openRouterApiKey(source: NodeJS.ProcessEnv = process.env): string | undefined {
  return firstSet(source, ["OPENROUTER_API_KEY"]);
}

export function meshbotGatewayApiKey(source: NodeJS.ProcessEnv = process.env): string | undefined {
  return firstSet(source, ["MESHBOT_GATEWAY_KEY", "LITELLM_MASTER_KEY"]);
}

export function defaultPiProvider(source: NodeJS.ProcessEnv = process.env): string {
  const explicit = firstSet(source, ["PI_DEFAULT_PROVIDER"]);
  if (explicit) return explicit;
  return "qwen";
}

export function defaultPiModel(source: NodeJS.ProcessEnv = process.env): string {
  const explicit = firstSet(source, ["PI_DEFAULT_MODEL"]);
  if (explicit) return explicit;
  const provider = defaultPiProvider(source);
  if (provider === "qwen") return DEFAULT_QWEN_MODEL;
  if (provider === "openrouter") return DEFAULT_OPENROUTER_MODEL;
  throw new Error(`PI_DEFAULT_MODEL is required for provider ${provider}`);
}

export function fallbackApiKey(
  provider: string,
  source: NodeJS.ProcessEnv = process.env,
): string | undefined {
  if (provider === "qwen") return qwenApiKey(source);
  if (provider === "openrouter") return openRouterApiKey(source);
  if (provider === "meshbot-gateway") return meshbotGatewayApiKey(source);
  return undefined;
}

export function deploymentModelKey(source: NodeJS.ProcessEnv = process.env): string | undefined {
  return fallbackApiKey(defaultPiProvider(source), source);
}

export function modelSecretsToRedact(source: NodeJS.ProcessEnv = process.env): string[] {
  return [qwenApiKey(source), openRouterApiKey(source), meshbotGatewayApiKey(source)].filter(
    (value): value is string => Boolean(value),
  );
}

export function hasDeploymentModelKey(source: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(
    qwenApiKey(source) ||
      openRouterApiKey(source) ||
      meshbotGatewayApiKey(source) ||
      firstSet(source, ["MESHBOT_GATEWAY_URL"]),
  );
}
