import {
  defaultPiModel,
  defaultPiProvider,
  openRouterApiKey,
  qwenApiKey,
  resolveAuthSecret,
  deploymentModelKey as resolveDeploymentModelKey,
  resolveEncryptionKey,
  resolveSupervisorToken,
} from "@meshbot/core";

export interface AppEnv {
  nodeEnv: string;
  databaseUrl: string;
  authSecret: string;
  authUrl: string;
  webOrigin: string;
  apiUrl: string;
  signupsEnabled: string | undefined;
  signupAllowlist: string | undefined;
  encryptionKey: string;
  dataDir: string;
  sandboxSupervisorUrl: string;
  sandboxSupervisorToken: string;
  sandboxProvider: string;
  agentRuntime: string;
  openRouterKey: string | undefined;
  qwenKey: string | undefined;
  deploymentModelKey: string | undefined;
  e2bApiKey: string | undefined;
  defaultProvider: string;
  defaultModel: string;
  wakeupDriver: string;
  port: number;
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
  const authSecret = resolveAuthSecret(source);
  const qwenKey = qwenApiKey(source);
  const openRouterKey = openRouterApiKey(source);
  return {
    nodeEnv: source.NODE_ENV ?? "development",
    databaseUrl: required(source, "DATABASE_URL"),
    authSecret,
    authUrl: source.BETTER_AUTH_URL ?? source.WEB_ORIGIN ?? "http://127.0.0.1:5173",
    webOrigin: source.WEB_ORIGIN ?? "http://127.0.0.1:5173",
    apiUrl: source.API_URL ?? "http://127.0.0.1:3100",
    signupsEnabled: source.SIGNUPS_ENABLED,
    signupAllowlist: source.SIGNUP_ALLOWLIST,
    encryptionKey: resolveEncryptionKey(source),
    dataDir: source.DATA_DIR ?? "./data",
    sandboxSupervisorUrl: source.SANDBOX_SUPERVISOR_URL ?? "http://127.0.0.1:7091",
    sandboxSupervisorToken: resolveSupervisorToken(source),
    sandboxProvider: source.SANDBOX_PROVIDER ?? "docker",
    agentRuntime: source.AGENT_RUNTIME ?? "pi",
    openRouterKey,
    qwenKey,
    deploymentModelKey: resolveDeploymentModelKey(source),
    e2bApiKey: source.E2B_API_KEY,
    defaultProvider: defaultPiProvider(source),
    defaultModel: defaultPiModel(source),
    wakeupDriver: source.WAKEUP_DRIVER ?? "graphile",
    port: Number(source.API_PORT ?? 3100),
  };
}

function required(source: NodeJS.ProcessEnv, key: string): string {
  const value = source[key];
  if (!value) throw new Error(`Missing ${key}`);
  return value;
}
