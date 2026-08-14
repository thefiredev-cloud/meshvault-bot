export const MESHVAULT_ORIGIN = "https://meshvault.ai";
export const SKILL_PACK_OFFER_ID = "meshvault-skill-pack-starter";
export const SKILL_PACK_PRICE_USD = 49;
export const MESHVAULT_CONTACT_EMAIL = "contact@meshvault.ai";
export const INSTALL_LEAD_PATH = "/api/install-lead";

const CHECKOUT_HOSTS = new Set(["buy.stripe.com", "checkout.stripe.com"]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME_MAX = 120;
const COMPANY_MAX = 160;
const NOTES_MAX = 2000;

export type FetchLike = (
  input: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

export class CommerceError extends Error {
  readonly code: string;
  readonly contact?: string;

  constructor(code: string, message: string, contact?: string) {
    super(message);
    this.name = "CommerceError";
    this.code = code;
    this.contact = contact;
  }
}

export function skillPackCheckoutUrl(offerId = SKILL_PACK_OFFER_ID): string {
  return `${MESHVAULT_ORIGIN}/api/create-checkout?offer=${encodeURIComponent(offerId)}`;
}

export function foundingInstallLeadUrl(): string {
  return `${MESHVAULT_ORIGIN}${INSTALL_LEAD_PATH}`;
}

export function isAllowedCheckoutUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && CHECKOUT_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

export function isUnreadableCommerceFailure(error: unknown): boolean {
  return error instanceof TypeError;
}

export type CheckoutSession = {
  brand: string;
  kind: "payment_link" | "checkout_session";
  url: string;
  offer: string;
  sessionId?: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function parseCheckoutResponse(body: unknown): CheckoutSession {
  const record = asRecord(body);
  if (!record) {
    throw new CommerceError("invalid_response", "Checkout did not return a JSON object.");
  }
  const error = readString(record, "error");
  if (error) {
    throw new CommerceError(
      error,
      readString(record, "message") ?? `Checkout failed (${error}). No charge was attempted.`,
      readString(record, "contact"),
    );
  }
  const kind = readString(record, "kind");
  const url = readString(record, "url");
  const offer = readString(record, "offer");
  if ((kind !== "payment_link" && kind !== "checkout_session") || !url || !offer) {
    throw new CommerceError("invalid_response", "Checkout response was missing a usable url.");
  }
  if (!isAllowedCheckoutUrl(url)) {
    throw new CommerceError(
      "invalid_checkout_url",
      "Checkout returned a destination that is not an approved Stripe host.",
    );
  }
  return {
    brand: readString(record, "brand") ?? "MeshVault",
    kind,
    url,
    offer,
    sessionId: readString(record, "sessionId"),
  };
}

export async function createSkillPackCheckout(
  fetchImpl: FetchLike,
  offerId = SKILL_PACK_OFFER_ID,
): Promise<CheckoutSession> {
  let body: unknown;
  try {
    const response = await fetchImpl(skillPackCheckoutUrl(offerId), {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: "{}",
    });
    body = await response.json();
  } catch (error) {
    if (error instanceof CommerceError) throw error;
    throw error instanceof TypeError
      ? error
      : new CommerceError("network_error", "Could not reach checkout. No charge was attempted.");
  }
  return parseCheckoutResponse(body);
}

export async function startSkillPackCheckout(
  openUrl: (url: string) => void,
  fetchImpl: FetchLike,
  offerId = SKILL_PACK_OFFER_ID,
): Promise<{ opened: "checkout" | "checkout-api" }> {
  try {
    const session = await createSkillPackCheckout(fetchImpl, offerId);
    openUrl(session.url);
    return { opened: "checkout" };
  } catch (error) {
    if (isUnreadableCommerceFailure(error)) {
      openUrl(skillPackCheckoutUrl(offerId));
      return { opened: "checkout-api" };
    }
    throw error;
  }
}

export type FoundingInstallLeadInput = {
  name: string;
  email: string;
  company?: string;
  notes?: string;
};

export type FoundingInstallLead = {
  name: string;
  email: string;
  company: string;
  notes: string;
};

function cleanField(value: string | undefined, max: number): string {
  return (value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

export function normalizeFoundingInstallLead(input: FoundingInstallLeadInput): FoundingInstallLead {
  return {
    name: cleanField(input.name, NAME_MAX),
    email: cleanField(input.email, 254).toLowerCase(),
    company: cleanField(input.company, COMPANY_MAX),
    notes: cleanField(input.notes, NOTES_MAX),
  };
}

export function validateFoundingInstallLead(
  input: FoundingInstallLeadInput,
): { ok: true; lead: FoundingInstallLead } | { ok: false; error: string } {
  const lead = normalizeFoundingInstallLead(input);
  if (!lead.name) return { ok: false, error: "Name is required." };
  if (!lead.email || !EMAIL_RE.test(lead.email))
    return { ok: false, error: "A real email is required." };
  return { ok: true, lead };
}

export function foundingInstallMailto(input: FoundingInstallLeadInput): string {
  const lead = normalizeFoundingInstallLead(input);
  const subject = encodeURIComponent(
    lead.name ? `Founding install lead: ${lead.name}` : "Founding install lead",
  );
  const body = encodeURIComponent(
    [
      "Founding / managed install lead from Mesh Bot",
      "",
      `Name: ${lead.name || "(not given)"}`,
      `Email: ${lead.email || "(not given)"}`,
      `Company: ${lead.company || "(not given)"}`,
      "",
      "Notes:",
      lead.notes || "(none)",
    ].join("\n"),
  );
  return `mailto:${MESHVAULT_CONTACT_EMAIL}?subject=${subject}&body=${body}`;
}

export type FoundingInstallLeadResult =
  | { status: "submitted"; inbox: string }
  | { status: "contact"; inbox: string; message: string };

export async function submitFoundingInstallLead(
  input: FoundingInstallLeadInput,
  fetchImpl: FetchLike,
): Promise<FoundingInstallLeadResult> {
  const parsed = validateFoundingInstallLead(input);
  if (!parsed.ok) throw new CommerceError("invalid_lead", parsed.error, MESHVAULT_CONTACT_EMAIL);

  let body: unknown;
  try {
    const response = await fetchImpl(foundingInstallLeadUrl(), {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(parsed.lead),
    });
    body = await response.json();
  } catch (error) {
    if (isUnreadableCommerceFailure(error)) {
      return {
        status: "contact",
        inbox: MESHVAULT_CONTACT_EMAIL,
        message: "The form could not send from this origin. Email contact@meshvault.ai instead.",
      };
    }
    throw new CommerceError("network_error", "Could not submit the lead.", MESHVAULT_CONTACT_EMAIL);
  }

  const record = asRecord(body);
  if (!record) {
    throw new CommerceError(
      "invalid_response",
      "Lead response was not JSON.",
      MESHVAULT_CONTACT_EMAIL,
    );
  }
  const error = readString(record, "error");
  const inbox = readString(record, "contact") ?? MESHVAULT_CONTACT_EMAIL;
  if (error === "mailer_not_configured" || error === "mailer_error") {
    return {
      status: "contact",
      inbox,
      message:
        readString(record, "message") ??
        "The form could not send. Email contact@meshvault.ai and a person will reply.",
    };
  }
  if (error) {
    throw new CommerceError(
      error,
      readString(record, "message") ?? "The lead was not sent.",
      inbox,
    );
  }
  if (record.ok !== true) {
    throw new CommerceError("invalid_response", "Lead response was missing ok: true.", inbox);
  }
  return { status: "submitted", inbox: readString(record, "inbox") ?? inbox };
}
