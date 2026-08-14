import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildLeadEmail,
  createStripeCheckoutSession,
  handleCreateCheckout,
  handleInstallLead,
  INSTALL_LEAD,
  normalizeLead,
  resetCommerceRateLimit,
  STARTER_PACK_OFFER,
  validateLead,
} from "./commerce.js";

const appSource = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "app.ts"),
  "utf8",
);

const checkoutUrl = "https://checkout.stripe.com/c/pay/cs_test_returned";

beforeEach(() => {
  resetCommerceRateLimit();
});

describe("install-lead validation and mail body", () => {
  it("requires name and a real email, and treats website as a honeypot", () => {
    expect(validateLead(normalizeLead({ name: "Ada", email: "ada@example.com" }))).toBeNull();
    expect(validateLead(normalizeLead({ name: "", email: "ada@example.com" }))).toMatch(/name/);
    expect(validateLead(normalizeLead({ name: "Ada", email: "not-an-email" }))).toMatch(/email/);
    expect(
      normalizeLead({ name: "Bot", email: "bot@example.com", website: "https://spam.example" })
        .website.length,
    ).toBeGreaterThan(0);
  });

  it("addresses the real MeshVault inbox and sets reply-to to the lead", () => {
    const email = buildLeadEmail({
      name: "Ada Lovelace",
      email: "ada@example.com",
      company: "Analytical Engines",
      notes: "Want a founding install",
    });
    expect(email.from).toBe("MeshVault <contact@meshvault.ai>");
    expect(email.to).toEqual(["contact@meshvault.ai"]);
    expect(email.reply_to).toBe("ada@example.com");
    expect(email.subject).toMatch(/Ada Lovelace/);
    expect(email.text).toMatch(/Analytical Engines/);
    expect(INSTALL_LEAD.inbox).toBe("contact@meshvault.ai");
  });
});

describe("POST /api/install-lead", () => {
  it("emails contact@meshvault.ai and does not invent an inbox", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://api.resend.com/emails");
      const body = JSON.parse(String(init?.body));
      expect(body.to).toEqual(["contact@meshvault.ai"]);
      expect(body.reply_to).toBe("ada@example.com");
      return Response.json({ id: "re_test_msg_1" });
    });

    const res = await handleInstallLead(
      new Request("http://127.0.0.1:3100/api/install-lead", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Ada Lovelace",
          email: "ada@example.com",
          company: "Analytical Engines",
          notes: "Founding install",
        }),
      }),
      { env: { RESEND_API_KEY: "re_test_dry_run_key" }, fetchImpl },
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      inbox: "contact@meshvault.ai",
      emailId: "re_test_msg_1",
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("returns 503 with the real inbox when Resend is not configured", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("must not call Resend");
    });
    const res = await handleInstallLead(
      new Request("http://127.0.0.1:3100/api/install-lead", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Ada", email: "ada@example.com" }),
      }),
      { env: {}, fetchImpl },
    );
    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toMatchObject({
      error: "mailer_not_configured",
      contact: "contact@meshvault.ai",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects a missing email and swallows honeypot submissions", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ id: "should_not_send" }));
    const deps = { env: { RESEND_API_KEY: "re_test_dry_run_key" }, fetchImpl };

    const bad = await handleInstallLead(
      new Request("http://127.0.0.1:3100/api/install-lead", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Ada" }),
      }),
      deps,
    );
    expect(bad.status).toBe(400);
    await expect(bad.json()).resolves.toMatchObject({ error: "invalid_lead" });

    const bait = await handleInstallLead(
      new Request("http://127.0.0.1:3100/api/install-lead", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Bot",
          email: "bot@example.com",
          website: "https://spam.example",
        }),
      }),
      deps,
    );
    expect(bait.status).toBe(200);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("API mounts the commerce routes", () => {
  it("registers create-checkout and install-lead on the Hono app", () => {
    expect(appSource).toContain('app.all("/api/create-checkout"');
    expect(appSource).toContain('app.all("/api/install-lead"');
    expect(appSource).toContain("handleCreateCheckout");
    expect(appSource).toContain("handleInstallLead");
  });
});

describe("POST /api/create-checkout", () => {
  it("returns the Stripe session url and never reconstructs one from a session id", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://api.stripe.com/v1/checkout/sessions");
      expect(init?.method).toBe("POST");
      const headers = init?.headers as { Authorization?: string } | undefined;
      expect(headers?.Authorization).toMatch(/^Bearer sk_test_/);
      expect(String(init?.body)).toContain("mode=payment");
      return Response.json({
        id: "cs_test_should_not_be_used_to_build_a_url",
        url: checkoutUrl,
      });
    });

    const res = await handleCreateCheckout(
      new Request(`http://127.0.0.1:3100/api/create-checkout?offer=${STARTER_PACK_OFFER.id}`, {
        method: "POST",
      }),
      { env: { STRIPE_SECRET_KEY: "sk_test_mock_not_a_real_key" }, fetchImpl },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { url: string; sessionId: string; offer: string };
    expect(body.url).toBe(checkoutUrl);
    expect(body.sessionId).toBe("cs_test_should_not_be_used_to_build_a_url");
    expect(body.offer).toBe(STARTER_PACK_OFFER.id);
    expect(body.url).not.toContain(body.sessionId.replace("cs_test_", ""));
  });

  it("returns 503 when Stripe is not configured and does not invent a URL", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("must not call Stripe");
    });
    const res = await handleCreateCheckout(
      new Request(`http://127.0.0.1:3100/api/create-checkout?offer=${STARTER_PACK_OFFER.id}`, {
        method: "POST",
      }),
      { env: {}, fetchImpl },
    );
    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toMatchObject({
      error: "stripe_not_configured",
      contact: "contact@meshvault.ai",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects an invalid payment-link override instead of reconstructing checkout", async () => {
    const res = await handleCreateCheckout(
      new Request(`http://127.0.0.1:3100/api/create-checkout?offer=${STARTER_PACK_OFFER.id}`, {
        method: "POST",
      }),
      {
        env: { MESHVAULT_SKILLS_PAYMENT_LINK: "https://example.com/pay" },
        fetchImpl: vi.fn(),
      },
    );
    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toMatchObject({ error: "stripe_not_configured" });
  });
});

describe("createStripeCheckoutSession", () => {
  it("POSTs to Stripe and returns the session url, not a reconstructed host", async () => {
    const session = await createStripeCheckoutSession(STARTER_PACK_OFFER, {
      secret: "sk_test_mock_not_a_real_key",
      origin: "https://meshvault.ai",
      fetchImpl: async (input, init) => {
        expect(String(input)).toBe("https://api.stripe.com/v1/checkout/sessions");
        expect(init?.method).toBe("POST");
        return Response.json({
          id: "cs_test_mock_session",
          url: "https://checkout.stripe.com/c/pay/cs_test_mock_session",
        });
      },
    });
    expect(session.sessionId).toBe("cs_test_mock_session");
    expect(session.url).toBe("https://checkout.stripe.com/c/pay/cs_test_mock_session");
  });

  it("throws stripe_error when Stripe rejects the request", async () => {
    await expect(
      createStripeCheckoutSession(STARTER_PACK_OFFER, {
        secret: "sk_test_mock_not_a_real_key",
        fetchImpl: async () =>
          new Response(JSON.stringify({ error: { code: "api_key_expired" } }), { status: 401 }),
      }),
    ).rejects.toMatchObject({ name: "stripe_error" });
  });
});
