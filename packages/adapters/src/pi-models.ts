import { type AuthContext, defaultProviderAuthContext } from "@earendil-works/pi-ai";
import { registerGateway } from "./pi-gateway.js";
import { DEVICE_CODE_PROVIDERS, DEVICE_CODE_SIGN_IN, isDeviceCodeProvider } from "./pi-oauth.js";
import { piModels } from "./pi-registry.js";

// Modified by FireDev LLC dba MeshVault on 2026-08-13.

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

export type PiModelSelection = { provider: string; id: string };

export function isKnownPiModel(selection: PiModelSelection): boolean {
  if (selection.provider === "scripted" && selection.id === "scripted") return true;
  const models = piModels();
  registerGateway(models);
  return Boolean(models.getModel(selection.provider, selection.id));
}

export function requireKnownPiModel(
  selection: PiModelSelection,
  isKnown: (candidate: PiModelSelection) => boolean = isKnownPiModel,
): PiModelSelection {
  if (!isKnown(selection)) {
    throw new Error(`Unknown model ${selection.provider}/${selection.id}`);
  }
  return selection;
}

export async function hasAmbientPiProviderAuth(
  providerId: string,
  context: AuthContext = defaultProviderAuthContext(),
): Promise<boolean> {
  if (providerId === "scripted") return true;
  const models = piModels();
  registerGateway(models);
  const provider = models.getProvider(providerId);
  if (!provider?.auth.apiKey) return false;
  const resolved = await provider.auth.apiKey.resolve({
    ctx: context,
    signal: new AbortController().signal,
  });
  return Boolean(resolved);
}

function buildPiCatalog(): PiCatalogEntry[] {
  const models = piModels();
  registerGateway(models);
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

const PREFERRED_PROVIDERS = ["qwen", "meshbot-gateway", "openrouter"];

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
    return "Uses your Qwen / DashScope API key (QWEN_API_KEY or DASHSCOPE_API_KEY). Mesh Bot does not pay for model usage.";
  }
  if (providerId === "meshbot-gateway") {
    return "Uses the deployment owner's OpenAI-compatible local gateway. Mesh Bot does not pay for model usage.";
  }
  const device = DEVICE_CODE_PROVIDERS[providerId];
  if (device) return device.billing;
  if (opts.oauth && !opts.apiKey) {
    return `${name} subscription login is not in the Mesh Bot UI yet. Skip if this deployment already has credentials.`;
  }
  if (opts.apiKey) {
    return `Uses your ${name} API key. Mesh Bot does not pay for model usage.`;
  }
  return `Uses your ${name} key. Mesh Bot does not pay for model usage.`;
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
