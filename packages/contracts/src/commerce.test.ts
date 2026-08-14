import { describe, expect, it, vi } from "vitest";
import {
  CommerceError,
  createSkillPackCheckout,
  foundingInstallMailto,
  isAllowedCheckoutUrl,
  MESHVAULT_CONTACT_EMAIL,
  parseCheckoutResponse,
  SKILL_PACK_OFFER_ID,
  skillPackCheckoutUrl,
  startSkillPackCheckout,
  submitFoundingInstallLead,
  validateFoundingInstallLead,
} from "./commerce.js";

const stripeUrl = "https://buy.stripe.com/3cI28k0Jf2fn4ZC0L12go0o";

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

describe("skill pack checkout", () => {
  it("builds the official POST URL and never embeds a Stripe host", () => {
    expect(skillPackCheckoutUrl()).toBe(
      `https://meshvault.ai/api/create-checkout?offer=${SKILL_PACK_OFFER_ID}`,
    );
    expect(skillPackCheckoutUrl()).not.toContain("stripe.com");
  });

  it("accepts only HTTPS Stripe checkout hosts", () => {
    expect(isAllowedCheckoutUrl(stripeUrl)).toBe(true);
    expect(isAllowedCheckoutUrl("https://checkout.stripe.com/c/pay/cs_live_x")).toBe(true);
    expect(isAllowedCheckoutUrl("http://buy.stripe.com/x")).toBe(false);
    expect(isAllowedCheckoutUrl("https://evil.example/pay")).toBe(false);
  });

  it("reads url from a payment_link response", () => {
    expect(
      parseCheckoutResponse({
        brand: "MeshVault",
        kind: "payment_link",
        url: stripeUrl,
        offer: SKILL_PACK_OFFER_ID,
      }),
    ).toEqual({
      brand: "MeshVault",
      kind: "payment_link",
      url: stripeUrl,
      offer: SKILL_PACK_OFFER_ID,
      sessionId: undefined,
    });
  });

  it("rejects missing, non-Stripe, or error payloads", () => {
    expect(() => parseCheckoutResponse({ error: "unknown_offer" })).toThrow(CommerceError);
    expect(() =>
      parseCheckoutResponse({ kind: "payment_link", url: "https://example.com/pay", offer: "x" }),
    ).toThrow(/approved Stripe host/);
    expect(() => parseCheckoutResponse({ kind: "payment_link", offer: "x" })).toThrow(
      /missing a usable url/,
    );
  });

  it("POSTs the offer and opens the returned url", async () => {
    const fetchImpl = vi.fn(async (input: string, init?: { method?: string }) => {
      expect(input).toBe(skillPackCheckoutUrl());
      expect(init?.method).toBe("POST");
      return jsonResponse({
        brand: "MeshVault",
        kind: "payment_link",
        url: stripeUrl,
        offer: SKILL_PACK_OFFER_ID,
      });
    });
    const opened: string[] = [];
    await expect(createSkillPackCheckout(fetchImpl)).resolves.toMatchObject({ url: stripeUrl });
    await expect(startSkillPackCheckout((url) => opened.push(url), fetchImpl)).resolves.toEqual({
      opened: "checkout",
    });
    expect(opened).toEqual([stripeUrl]);
  });

  it("falls back to the official checkout API when the POST body cannot be read", async () => {
    const opened: string[] = [];
    const result = await startSkillPackCheckout(
      (url) => opened.push(url),
      async () => {
        throw new TypeError("Failed to fetch");
      },
    );
    expect(result).toEqual({ opened: "checkout-api" });
    expect(opened).toEqual([skillPackCheckoutUrl()]);
    expect(opened[0]).not.toContain("stripe.com");
  });
});

describe("founding install lead", () => {
  it("requires a name and a real email", () => {
    expect(validateFoundingInstallLead({ name: "", email: "ada@example.com" }).ok).toBe(false);
    expect(validateFoundingInstallLead({ name: "Ada", email: "not-an-email" }).ok).toBe(false);
    expect(
      validateFoundingInstallLead({ name: " Ada Lovelace ", email: "Ada@Example.com" }),
    ).toEqual({
      ok: true,
      lead: { name: "Ada Lovelace", email: "ada@example.com", company: "", notes: "" },
    });
  });

  it("submits name, email, company, and notes without a honeypot field", async () => {
    const fetchImpl = vi.fn(async (_input: string, init?: { body?: string }) => {
      expect(JSON.parse(init?.body ?? "{}")).toEqual({
        name: "Ada Lovelace",
        email: "ada@example.com",
        company: "Analytical Engines",
        notes: "Windows-owned runtime",
      });
      expect(init?.body).not.toContain("website");
      return jsonResponse({ ok: true, brand: "MeshVault", inbox: MESHVAULT_CONTACT_EMAIL });
    });
    await expect(
      submitFoundingInstallLead(
        {
          name: "Ada Lovelace",
          email: "ada@example.com",
          company: "Analytical Engines",
          notes: "Windows-owned runtime",
        },
        fetchImpl,
      ),
    ).resolves.toEqual({ status: "submitted", inbox: MESHVAULT_CONTACT_EMAIL });
  });

  it("returns the contact inbox when the mailer is down or the browser cannot read the response", async () => {
    await expect(
      submitFoundingInstallLead({ name: "Ada", email: "ada@example.com" }, async () =>
        jsonResponse({
          error: "mailer_not_configured",
          message: "Email contact@meshvault.ai",
          contact: MESHVAULT_CONTACT_EMAIL,
        }),
      ),
    ).resolves.toMatchObject({ status: "contact", inbox: MESHVAULT_CONTACT_EMAIL });

    await expect(
      submitFoundingInstallLead({ name: "Ada", email: "ada@example.com" }, async () => {
        throw new TypeError("Failed to fetch");
      }),
    ).resolves.toMatchObject({ status: "contact", inbox: MESHVAULT_CONTACT_EMAIL });
  });

  it("builds a mailto fallback that names the founding-install inbox", () => {
    const href = foundingInstallMailto({ name: "Ada", email: "ada@example.com", notes: "DGX" });
    expect(href.startsWith(`mailto:${MESHVAULT_CONTACT_EMAIL}?`)).toBe(true);
    expect(decodeURIComponent(href)).toContain("Founding install lead: Ada");
    expect(decodeURIComponent(href)).toContain("DGX");
  });
});
