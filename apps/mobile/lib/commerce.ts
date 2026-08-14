export const STARTER_PACK_OFFER = "meshvault-skill-pack-starter";
export const STARTER_PACK_CHECKOUT = `/api/create-checkout?offer=${STARTER_PACK_OFFER}`;
export const INSTALL_LEAD_PATH = "/api/install-lead";
export const INSTALL_INBOX = "contact@meshvault.ai";

const STRIPE_CHECKOUT_HOSTS = new Set(["buy.stripe.com", "checkout.stripe.com"]);

export type InstallLead = {
  name: string;
  email: string;
  company?: string;
  notes?: string;
  website?: string;
};

export function isStripeCheckoutUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && STRIPE_CHECKOUT_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

export function checkoutRequestUrl(apiBase: string) {
  const endpoint = new URL(STARTER_PACK_CHECKOUT, `${apiBase.replace(/\/$/, "")}/`);
  endpoint.searchParams.set("redirect", "0");
  return endpoint;
}

export function checkoutErrorMessage(status: number, data: { error?: string }) {
  if (data.error === "stripe_not_configured" || status === 503) {
    return "Secure checkout is not configured on this environment. No charge was attempted.";
  }
  return "Checkout could not start. No charge was attempted.";
}

export function leadErrorMessage(status: number, data: { error?: string }) {
  if (data.error === "mailer_not_configured" || status === 503) {
    return "The form could not send. Email contact@meshvault.ai and a person will reply.";
  }
  if (data.error === "invalid_lead" || status === 400) {
    return "Name and a real email are required. No message was sent.";
  }
  if (data.error === "rate_limited" || status === 429) {
    return "Too many attempts. Email contact@meshvault.ai instead.";
  }
  return "The form could not send. Email contact@meshvault.ai. No fake inbox was used.";
}

export async function startCheckout(
  apiBase: string,
  opts: {
    fetchImpl?: typeof fetch;
    openUrl?: (url: string) => void | Promise<void>;
  } = {},
) {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const openUrl = opts.openUrl;
  const response = await fetchImpl(checkoutRequestUrl(apiBase), {
    method: "POST",
    headers: { Accept: "application/json", origin: "meshbot://" },
  });
  const data = (await response.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!response.ok) {
    throw new Error(checkoutErrorMessage(response.status, data));
  }
  if (!isStripeCheckoutUrl(data.url)) {
    throw new Error("Checkout returned an invalid destination. No charge was attempted.");
  }
  if (openUrl) await openUrl(data.url);
  return data.url;
}

export async function submitInstallLead(
  apiBase: string,
  lead: InstallLead,
  opts: { fetchImpl?: typeof fetch } = {},
) {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const response = await fetchImpl(`${apiBase.replace(/\/$/, "")}${INSTALL_LEAD_PATH}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      origin: "meshbot://",
    },
    body: JSON.stringify(lead),
  });
  const data = (await response.json().catch(() => ({}))) as { error?: string; contact?: string };
  if (!response.ok) {
    throw new Error(leadErrorMessage(response.status, data));
  }
  return { ok: true as const };
}
