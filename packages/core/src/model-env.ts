export const DEFAULT_QWEN_BASE_URL = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";
export const DEFAULT_SPARK_GX10_BASE_URL = "http://127.0.0.1:8000/v1";
export const DEFAULT_QWEN_MODEL = "qwen-plus";
export const DEFAULT_OPENROUTER_MODEL = "deepseek/deepseek-v4-flash-0731";
export const DEFAULT_SPARK_GX10_MODEL = "deepseek-v4-flash";

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

export function sparkGx10BaseUrl(source: NodeJS.ProcessEnv = process.env): string {
  return firstSet(source, ["SPARK_GX10_BASE_URL"]) ?? DEFAULT_SPARK_GX10_BASE_URL;
}

export function sparkGx10Configured(source: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(firstSet(source, ["SPARK_GX10_BASE_URL"]));
}

export function sparkGx10ApiKey(source: NodeJS.ProcessEnv = process.env): string | undefined {
  return firstSet(source, ["SPARK_GX10_API_KEY"]);
}

export function defaultPiProvider(source: NodeJS.ProcessEnv = process.env): string {
  const explicit = firstSet(source, ["PI_DEFAULT_PROVIDER"]);
  if (explicit) return explicit;
  if (sparkGx10Configured(source)) return "spark-gx10";
  return "qwen";
}

export function defaultPiModel(source: NodeJS.ProcessEnv = process.env): string {
  const explicit = firstSet(source, ["PI_DEFAULT_MODEL"]);
  if (explicit) return explicit;
  const provider = defaultPiProvider(source);
  if (provider === "spark-gx10") return DEFAULT_SPARK_GX10_MODEL;
  if (provider === "openrouter") return DEFAULT_OPENROUTER_MODEL;
  return DEFAULT_QWEN_MODEL;
}

export function fallbackApiKey(
  provider: string,
  source: NodeJS.ProcessEnv = process.env,
): string | undefined {
  if (provider === "qwen") return qwenApiKey(source);
  if (provider === "openrouter") return openRouterApiKey(source);
  if (provider === "spark-gx10") return sparkGx10ApiKey(source) ?? "local";
  return qwenApiKey(source) ?? openRouterApiKey(source) ?? sparkGx10ApiKey(source);
}

export function deploymentModelKey(source: NodeJS.ProcessEnv = process.env): string | undefined {
  return fallbackApiKey(defaultPiProvider(source), source);
}

export function modelSecretsToRedact(source: NodeJS.ProcessEnv = process.env): string[] {
  return [
    qwenApiKey(source),
    openRouterApiKey(source),
    sparkGx10ApiKey(source),
    source.COMPOSIO_API_KEY,
  ].filter((value): value is string => Boolean(value));
}

export function hasDeploymentModelKey(source: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(qwenApiKey(source) || openRouterApiKey(source) || sparkGx10Configured(source));
}
