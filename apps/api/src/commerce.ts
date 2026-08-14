const STRIPE_CHECKOUT_HOSTS = new Set(["buy.stripe.com", "checkout.stripe.com"]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME_MAX = 120;
const COMPANY_MAX = 160;
const NOTES_MAX = 2000;
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60_000;

export const MESHVAULT_BRAND = {
  name: "MeshVault",
  domain: "meshvault.ai",
  supportEmail: "contact@meshvault.ai",
  statementDescriptorSuffix: "SKILLS",
  productDescription:
    "Editable MeshVault agent skills, memory templates, runbooks, and routing recipes.",
} as const;

export const INSTALL_LEAD = {
  brand: "MeshVault",
  inbox: "contact@meshvault.ai",
  from: "MeshVault <contact@meshvault.ai>",
} as const;

export const STARTER_PACK_OFFER = {
  id: "meshvault-skill-pack-starter",
  name: "Agent Skills Starter Pack",
  description:
    "One-time MeshVault pack with five agent skills, five memory templates, four runbooks, three routing recipes, and four worked examples. Digital delivery by email after payment.",
  amountCents: 4900,
  currency: "usd",
} as const;

export type CommerceOffer = {
  id: string;
  name: string;
  description?: string;
  amountCents: number;
  currency?: string;
  stripePriceId?: string;
};

export type CommerceDeps = {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
};

type RateWindow = { count: number; resetAt: number };

const rateWindows = new Map<string, RateWindow>();

export function resetCommerceRateLimit() {
  rateWindows.clear();
}

export function isStripeCheckoutUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && STRIPE_CHECKOUT_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

export function assertStripeCheckoutUrl(value: unknown): string {
  if (!isStripeCheckoutUrl(value)) {
    throw new Error("checkout URL must use an approved Stripe HTTPS host");
  }
  return value;
}

export function cleanField(value: unknown, max: number) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

export function normalizeLead(raw: unknown) {
  const body = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    name: cleanField(body.name, NAME_MAX),
    email: cleanField(body.email, 254).toLowerCase(),
    company: cleanField(body.company, COMPANY_MAX),
    notes: cleanField(body.notes, NOTES_MAX),
    website: cleanField(body.website, 200),
  };
}

export function validateLead(lead: ReturnType<typeof normalizeLead>) {
  if (lead.website) return null;
  if (!lead.name) return "name is required";
  if (!lead.email || !EMAIL_RE.test(lead.email)) return "a real email is required";
  return null;
}

export function buildLeadEmail(lead: {
  name: string;
  email: string;
  company: string;
  notes: string;
}) {
  const lines = [
    "Founding / managed install lead from meshvault.ai",
    "",
    `Name: ${lead.name}`,
    `Email: ${lead.email}`,
    `Company: ${lead.company || "(not given)"}`,
    "",
    "Notes:",
    lead.notes || "(none)",
    "",
    "Reply to this message to reach the person who submitted the form.",
  ];
  return {
    from: INSTALL_LEAD.from,
    to: [INSTALL_LEAD.inbox],
    reply_to: lead.email,
    subject: `Founding install lead: ${lead.name}`,
    text: lines.join("\n"),
  };
}

export function buildCheckoutSessionParams(
  offer: CommerceOffer,
  opts: { origin?: string; successPath?: string; cancelPath?: string } = {},
) {
  if (!offer.id || !offer.name) throw new Error("offer requires id and name");
  if (typeof offer.amountCents !== "number" || offer.amountCents < 50) {
    throw new Error("offer.amountCents must be >= 50");
  }
  const origin = (opts.origin || "https://meshvault.ai").replace(/\/$/, "");
  const successPath = opts.successPath || "/skills/?paid=1";
  const cancelPath = opts.cancelPath || "/skills/?canceled=1";
  const currency = (offer.currency || "usd").toLowerCase();
  return {
    mode: "payment",
    success_url: `${origin}${successPath}${successPath.includes("?") ? "&" : "?"}session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}${cancelPath}`,
    billing_address_collection: "auto",
    metadata: {
      brand: MESHVAULT_BRAND.name,
      domain: MESHVAULT_BRAND.domain,
      offer_id: offer.id,
      product: "meshvault-skills",
    },
    payment_intent_data: {
      description: `${MESHVAULT_BRAND.name}: ${offer.name}`,
      statement_descriptor_suffix: MESHVAULT_BRAND.statementDescriptorSuffix,
      metadata: { brand: MESHVAULT_BRAND.name, offer_id: offer.id },
    },
    line_items: offer.stripePriceId
      ? [{ price: offer.stripePriceId, quantity: 1 }]
      : [
          {
            quantity: 1,
            price_data: {
              currency,
              unit_amount: offer.amountCents,
              product_data: {
                name: `${MESHVAULT_BRAND.name} - ${offer.name}`,
                description: offer.description || MESHVAULT_BRAND.productDescription,
                metadata: { brand: MESHVAULT_BRAND.name, offer_id: offer.id },
              },
            },
          },
        ],
  };
}

export function flattenStripeParams(
  obj: Record<string, unknown>,
  params: URLSearchParams,
  prefix = "",
) {
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}[${key}]` : key;
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        if (item && typeof item === "object") {
          flattenStripeParams(item as Record<string, unknown>, params, `${path}[${index}]`);
        } else {
          params.append(`${path}[${index}]`, String(item));
        }
      });
    } else if (typeof value === "object") {
      flattenStripeParams(value as Record<string, unknown>, params, path);
    } else if (typeof value === "boolean") {
      params.append(path, value ? "true" : "false");
    } else {
      params.append(path, String(value));
    }
  }
}

export async function createStripeCheckoutSession(
  offer: CommerceOffer,
  opts: {
    origin?: string;
    secret?: string;
    fetchImpl?: typeof fetch;
    env?: NodeJS.ProcessEnv;
  } = {},
) {
  const env = opts.env ?? process.env;
  const secret = (opts.secret || env.STRIPE_SECRET_KEY || "").trim();
  if (!secret) {
    const err = new Error("stripe_not_configured");
    err.name = "stripe_not_configured";
    throw err;
  }
  const origin = (opts.origin || env.MESHVAULT_CHECKOUT_ORIGIN || "https://meshvault.ai").replace(
    /\/$/,
    "",
  );
  const body = new URLSearchParams();
  flattenStripeParams(buildCheckoutSessionParams(offer, { origin }), body);
  const fetchImpl = opts.fetchImpl ?? fetch;
  const stripeRes = await fetchImpl("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const data = (await stripeRes.json()) as { url?: string; id?: string };
  if (!stripeRes.ok) {
    const err = new Error("stripe_error");
    err.name = "stripe_error";
    throw err;
  }
  if (!data.url) {
    const err = new Error("missing_checkout_url");
    err.name = "missing_checkout_url";
    throw err;
  }
  return { url: assertStripeCheckoutUrl(data.url), sessionId: data.id };
}

export async function sendViaResend(
  email: ReturnType<typeof buildLeadEmail>,
  opts: { env?: NodeJS.ProcessEnv; fetchImpl?: typeof fetch } = {},
) {
  const env = opts.env ?? process.env;
  const apiKey = (env.RESEND_API_KEY || "").trim();
  if (!apiKey) throw new Error("resend_not_configured");
  const fetchImpl = opts.fetchImpl ?? fetch;
  const res = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(email),
  });
  const data = (await res.json().catch(() => ({}))) as { id?: string; name?: string };
  if (!res.ok) throw new Error(`resend_error:${data.name || res.status}`);
  return data.id || "resend_ok";
}

export async function handleCreateCheckout(
  request: Request,
  deps: CommerceDeps = {},
): Promise<Response> {
  const env = deps.env ?? process.env;
  if (request.method === "OPTIONS") return new Response(null, { status: 204 });
  if (request.method === "HEAD") return emptyOk();
  if (request.method !== "GET" && request.method !== "POST") {
    return json(405, { error: "method_not_allowed" });
  }

  const limited = consumeRateLimit(`checkout:${clientKey(request)}`);
  if (!limited.allowed) {
    return json(
      429,
      {
        error: "rate_limited",
        brand: MESHVAULT_BRAND.name,
        message: "Too many checkout attempts. No charge was attempted. Try again shortly.",
        retryAfterSeconds: limited.retryAfterSeconds,
      },
      { "retry-after": String(limited.retryAfterSeconds) },
    );
  }

  const url = new URL(request.url);
  const offerId = url.searchParams.get("offer") || STARTER_PACK_OFFER.id;
  if (offerId !== STARTER_PACK_OFFER.id) {
    return json(404, { error: "unknown_offer", brand: MESHVAULT_BRAND.name });
  }

  const envLink = (env.MESHVAULT_SKILLS_PAYMENT_LINK || "").trim();
  if (envLink) {
    try {
      return checkoutResponse(request, url, {
        brand: MESHVAULT_BRAND.name,
        kind: "payment_link",
        url: envLink,
        offer: STARTER_PACK_OFFER.id,
      });
    } catch {
      return json(503, {
        error: "stripe_not_configured",
        brand: MESHVAULT_BRAND.name,
        message: "The configured checkout destination is invalid. No charge was attempted.",
        contact: MESHVAULT_BRAND.supportEmail,
      });
    }
  }

  const secret = (env.STRIPE_SECRET_KEY || "").trim();
  if (!secret) {
    return json(503, {
      error: "stripe_not_configured",
      brand: MESHVAULT_BRAND.name,
      message: "Checkout is not configured for this offer. No charge was attempted.",
      contact: MESHVAULT_BRAND.supportEmail,
    });
  }

  try {
    const session = await createStripeCheckoutSession(STARTER_PACK_OFFER, {
      env,
      secret,
      fetchImpl: deps.fetchImpl,
    });
    return checkoutResponse(request, url, {
      brand: MESHVAULT_BRAND.name,
      kind: "checkout_session",
      url: session.url,
      sessionId: session.sessionId,
      offer: STARTER_PACK_OFFER.id,
    });
  } catch (err) {
    const code = err instanceof Error ? err.name : "";
    if (code === "stripe_error") {
      return json(502, {
        error: "stripe_error",
        brand: MESHVAULT_BRAND.name,
        message: "Stripe could not create checkout. No charge was attempted.",
      });
    }
    if (code === "missing_checkout_url") {
      return json(502, { error: "missing_checkout_url", brand: MESHVAULT_BRAND.name });
    }
    return json(500, {
      error: "server_error",
      brand: MESHVAULT_BRAND.name,
      message: "Checkout could not start. No charge was attempted.",
    });
  }
}

export async function handleInstallLead(
  request: Request,
  deps: CommerceDeps = {},
): Promise<Response> {
  if (request.method === "OPTIONS") return new Response(null, { status: 204 });
  if (request.method === "HEAD") return emptyOk();
  if (request.method !== "POST") return json(405, { error: "method_not_allowed" });

  const limited = consumeRateLimit(`lead:${clientKey(request)}`);
  if (!limited.allowed) {
    return json(
      429,
      {
        error: "rate_limited",
        brand: INSTALL_LEAD.brand,
        message: "Too many form attempts. Email contact@meshvault.ai instead.",
        contact: INSTALL_LEAD.inbox,
        retryAfterSeconds: limited.retryAfterSeconds,
      },
      { "retry-after": String(limited.retryAfterSeconds) },
    );
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json(400, {
      error: "invalid_json",
      brand: INSTALL_LEAD.brand,
      message: "The form body was not readable JSON. No email was sent.",
      contact: INSTALL_LEAD.inbox,
    });
  }

  const lead = normalizeLead(raw);
  if (lead.website) {
    return json(200, { ok: true, brand: INSTALL_LEAD.brand });
  }

  if (validateLead(lead)) {
    return json(400, {
      error: "invalid_lead",
      brand: INSTALL_LEAD.brand,
      message: "Name and a real email are required. No email was sent.",
      contact: INSTALL_LEAD.inbox,
    });
  }

  try {
    const emailId = await sendViaResend(buildLeadEmail(lead), deps);
    return json(200, {
      ok: true,
      brand: INSTALL_LEAD.brand,
      inbox: INSTALL_LEAD.inbox,
      emailId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    if (message === "resend_not_configured") {
      return json(503, {
        error: "mailer_not_configured",
        brand: INSTALL_LEAD.brand,
        message: "The form could not send. Email contact@meshvault.ai and a person will reply.",
        contact: INSTALL_LEAD.inbox,
      });
    }
    return json(502, {
      error: "mailer_error",
      brand: INSTALL_LEAD.brand,
      message: "The form could not send. Email contact@meshvault.ai. No fake inbox was used.",
      contact: INSTALL_LEAD.inbox,
    });
  }
}

function checkoutResponse(
  request: Request,
  requestUrl: URL,
  entry: { brand: string; kind: string; url: string; offer: string; sessionId?: string },
): Response {
  const checkoutUrl = assertStripeCheckoutUrl(entry.url);
  if (request.method === "GET" && requestUrl.searchParams.get("redirect") !== "0") {
    return new Response(null, {
      status: 303,
      headers: { location: checkoutUrl, "cache-control": "no-store" },
    });
  }
  return json(200, { ...entry, url: checkoutUrl });
}

function json(
  status: number,
  body: Record<string, unknown>,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extraHeaders,
    },
  });
}

function emptyOk(): Response {
  return new Response(null, {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function clientKey(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

function consumeRateLimit(key: string) {
  const now = Date.now();
  const current = rateWindows.get(key);
  if (!current || current.resetAt <= now) {
    rateWindows.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  if (current.count >= RATE_LIMIT) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    };
  }
  current.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}
