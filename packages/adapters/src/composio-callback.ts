const COMPOSIO_CALLBACK_PATH = "/api/connections/composio/callback";

export function resolveComposioCallbackUrl(
  apiUrl: string,
  environment: string | undefined,
): string {
  let base: URL;
  try {
    base = new URL(apiUrl);
  } catch {
    throw new Error("API_URL must be a valid URL for Composio OAuth.");
  }

  if (base.protocol === "https:") return new URL(COMPOSIO_CALLBACK_PATH, base).toString();

  const hostname = base.hostname.replace(/^\[|\]$/g, "");
  const loopback = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  const localEnvironment =
    environment === undefined || environment === "development" || environment === "test";
  if (base.protocol === "http:" && loopback && localEnvironment) {
    return new URL(COMPOSIO_CALLBACK_PATH, base).toString();
  }

  throw new Error(
    "API_URL must use HTTPS for Composio OAuth; HTTP is allowed only for loopback development.",
  );
}
