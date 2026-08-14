import {
  DEVICE_CODE_PROVIDERS,
  DEVICE_CODE_SIGN_IN,
  isDeviceCodeProvider,
} from "./pi-oauth.js";
import { piModels } from "./pi-registry.js";

export type PiCatalogAuth = "api-key" | "oauth" | "both";
export type PiCatalogSignIn = typeof DEVICE_CODE_SIGN_IN;

export type PiCatalogEntry = {
  provider: string;
  providerName: string;
  id: string;
  label: string;
  billing: string;
  auth: PiCatalogAuth;
  oauthLabel?: string;
  subscription: boolean;
  signIn?: PiCatalogSignIn;
};

export function listPiCatalog(): PiCatalogEntry[] {
  cachedCatalog ??= buildPiCatalog();
  return cachedCatalog;
}

let cachedCatalog: PiCatalogEntry[] | undefined;

function buildPiCatalog(): PiCatalogEntry[] {
  const models = piModels();
  const entries: PiCatalogEntry[] = [];
  const providers = [...models.getProviders()].sort(byPreferredProvider);
  for (const provider of providers) {
    const apiKey = Boolean(provider.auth.apiKey);
    const oauth = Boolean(provider.auth.oauth);
    const auth: PiCatalogAuth = apiKey && oauth ? "both" : oauth ? "oauth" : "api-key";
    const device = DEVICE_CODE_PROVIDERS[provider.id];
    const oauthLabel =
      device?.loginLabel ?? provider.auth.oauth?.loginLabel ?? provider.auth.oauth?.name;
    const subscription = Boolean(provider.auth.oauth?.isSubscription);
    const signIn = isDeviceCodeProvider(provider.id) ? DEVICE_CODE_SIGN_IN : undefined;
    const billing = catalogBilling(provider.id, provider.name, {
      apiKey,
      oauth,
    });
    for (const model of provider.getModels()) {
      entries.push({
        provider: provider.id,
        providerName: provider.name,
        id: model.id,
        label: model.name || model.id,
        billing,
        auth,
        oauthLabel,
        subscription,
        signIn,
      });
    }
  }
  return entries;
}

const PREFERRED_PROVIDERS = ["qwen", "spark-gx10", "openrouter"];

function byPreferredProvider(a: { id: string }, b: { id: string }) {
  const ai = PREFERRED_PROVIDERS.indexOf(a.id);
  const bi = PREFERRED_PROVIDERS.indexOf(b.id);
  if (ai === -1 && bi === -1) return 0;
  if (ai === -1) return 1;
  if (bi === -1) return -1;
  return ai - bi;
}

function catalogBilling(
  providerId: string,
  name: string,
  opts: { apiKey: boolean; oauth: boolean },
) {
  if (providerId === "qwen") {
    return "Uses your Qwen / DashScope API key (QWEN_API_KEY or DASHSCOPE_API_KEY). MeshVault does not pay for model usage.";
  }
  if (providerId === "spark-gx10") {
    return "Local Spark+GX10 inference plane (DeepSeek V4 Flash). Set SPARK_GX10_BASE_URL when the box is up. MeshVault does not pay for model usage.";
  }
  const device = DEVICE_CODE_PROVIDERS[providerId];
  if (device) return device.billing;
  if (opts.oauth && !opts.apiKey) {
    return `${name} subscription login is not in the MeshVault UI yet. Skip if this deployment already has credentials.`;
  }
  if (opts.apiKey) {
    return `Uses your ${name} API key. MeshVault does not pay for model usage.`;
  }
  return `Uses your ${name} key. MeshVault does not pay for model usage.`;
}

export const scriptedCatalogEntry: PiCatalogEntry = {
  provider: "scripted",
  providerName: "Scripted",
  id: "scripted",
  label: "Scripted runtime (local verification)",
  billing: "No model charges. Deterministic fixture for tests.",
  auth: "api-key",
  subscription: false,
};
