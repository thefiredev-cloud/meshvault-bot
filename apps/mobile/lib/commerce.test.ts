import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  checkoutErrorMessage,
  checkoutRequestUrl,
  INSTALL_INBOX,
  INSTALL_LEAD_PATH,
  isStripeCheckoutUrl,
  leadErrorMessage,
  STARTER_PACK_CHECKOUT,
  STARTER_PACK_OFFER,
  startCheckout,
  submitInstallLead,
} from "./commerce.js";

const dir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.join(dir, "../app");
const returned = "https://checkout.stripe.com/c/pay/cs_test_returned";

function screen(name: string) {
  return readFileSync(path.join(appDir, name), "utf8");
}

function mobileAppSources() {
  return [
    "_layout.tsx",
    "index.tsx",
    "sign-in.tsx",
    "founding.tsx",
    "commerce.tsx",
    "new.tsx",
    "thread.tsx",
    "computer.tsx",
  ]
    .map(screen)
    .join("\n");
}

describe("founding screen is a visible pre-release path", () => {
  it("sign-in and inbox expose the founding route", () => {
    const signIn = screen("sign-in.tsx");
    const inbox = screen("index.tsx");
    const layout = screen("_layout.tsx");
    expect(signIn).toContain('"/founding"');
    expect(signIn).toContain("Pre-release and founding install");
    expect(inbox).toContain('"/founding"');
    expect(inbox).toContain("Founding install");
    expect(layout).toContain('name="founding"');
  });

  it("posts the lead form and Buy control to the API origin", () => {
    const founding = screen("founding.tsx");
    expect(founding).toContain("Buy the $49 pack");
    expect(founding).toContain("Request a founding install");
    expect(founding).toContain("startCheckout");
    expect(founding).toContain("submitInstallLead");
    expect(founding).toContain("currentApiBase");
    expect(founding).toContain("Linking.openURL");
    expect(founding).toMatch(/name/i);
    expect(founding).toMatch(/email/i);
    expect(founding).toMatch(/company/i);
    expect(founding).toMatch(/notes/i);
    expect(founding).toContain(INSTALL_INBOX);
    expect(founding).toMatch(/iOS is pre-release/);
    expect(founding).toMatch(/no App Store or TestFlight download yet/);
  });

  it("does not add, enable, or label an App Store / TestFlight download control", () => {
    const sources = mobileAppSources();
    expect(screen("founding.tsx")).toMatch(/no App Store or TestFlight download yet/);
    expect(sources).not.toMatch(/Download on iPhone/i);
    expect(sources).not.toMatch(/Download on the App Store/i);
    expect(sources).not.toMatch(/apps\.apple\.com/i);
    expect(sources).not.toMatch(/itms-beta/i);
    expect(sources).not.toMatch(/accessibilityLabel=["'][^"']*(Download|App Store|TestFlight)/);
    expect(sources).not.toMatch(/href=["'][^"']*(apps\.apple\.com|testflight)/i);
  });
});

describe("Buy-button client POSTs to create-checkout and opens the returned url", () => {
  it("builds a POST JSON request and never reconstructs a Stripe URL", () => {
    const url = checkoutRequestUrl("http://127.0.0.1:3100");
    expect(url.pathname).toBe("/api/create-checkout");
    expect(url.searchParams.get("offer")).toBe(STARTER_PACK_OFFER);
    expect(url.searchParams.get("redirect")).toBe("0");
    expect(STARTER_PACK_CHECKOUT).toBe(`/api/create-checkout?offer=${STARTER_PACK_OFFER}`);
    expect(isStripeCheckoutUrl("https://checkout.stripe.com/c/pay/cs_test_abc")).toBe(true);
    expect(isStripeCheckoutUrl("https://buy.stripe.com/test_abc")).toBe(true);
    expect(isStripeCheckoutUrl("https://evil.example.com/cs_test_abc")).toBe(false);
    expect(isStripeCheckoutUrl("https://meshvault.ai/api/create-checkout")).toBe(false);
  });

  it("opens the API url and refuses to invent one from a session id", async () => {
    const opened: string[] = [];
    const url = await startCheckout("http://127.0.0.1:3100", {
      fetchImpl: async (input, init) => {
        expect(init?.method).toBe("POST");
        expect(String(input)).toContain("redirect=0");
        expect(String(input)).toContain(`offer=${STARTER_PACK_OFFER}`);
        return Response.json({
          brand: "MeshVault",
          kind: "checkout_session",
          url: returned,
          sessionId: "cs_test_should_not_be_used_to_build_a_url",
          offer: STARTER_PACK_OFFER,
        });
      },
      openUrl: (href) => {
        opened.push(href);
      },
    });
    expect(url).toBe(returned);
    expect(opened).toEqual([returned]);
  });

  it("fails closed when the API omits url or returns a non-Stripe host", async () => {
    await expect(
      startCheckout("http://127.0.0.1:3100", {
        fetchImpl: async () =>
          Response.json({ sessionId: "cs_test_abc", offer: STARTER_PACK_OFFER }),
        openUrl: () => {
          throw new Error("must not open");
        },
      }),
    ).rejects.toThrow(/invalid destination/);

    await expect(
      startCheckout("http://127.0.0.1:3100", {
        fetchImpl: async () => Response.json({ url: "https://example.com/pay" }),
        openUrl: () => {
          throw new Error("must not open");
        },
      }),
    ).rejects.toThrow(/invalid destination/);
  });

  it("surfaces stripe_not_configured without claiming a charge", () => {
    expect(checkoutErrorMessage(503, { error: "stripe_not_configured" })).toMatch(
      /No charge was attempted/,
    );
  });
});

describe("install-lead form client", () => {
  it("POSTs JSON to /api/install-lead and reports a missing mailer honestly", async () => {
    const calls: { input: string; init?: RequestInit }[] = [];
    const result = await submitInstallLead(
      "http://127.0.0.1:3100",
      { name: "Ada", email: "ada@example.com", company: "AE", notes: "hi" },
      {
        fetchImpl: async (input, init) => {
          calls.push({ input: String(input), init });
          return Response.json({ ok: true, inbox: INSTALL_INBOX });
        },
      },
    );
    expect(result.ok).toBe(true);
    expect(calls[0]?.input).toBe(`http://127.0.0.1:3100${INSTALL_LEAD_PATH}`);
    expect(calls[0]?.init?.method).toBe("POST");
    expect(JSON.parse(String(calls[0]?.init?.body)).email).toBe("ada@example.com");
    expect(leadErrorMessage(503, { error: "mailer_not_configured" })).toMatch(
      /contact@meshvault\.ai/,
    );
  });

  it("does not treat a 503 as a sent lead", async () => {
    await expect(
      submitInstallLead(
        "http://127.0.0.1:3100",
        { name: "Ada", email: "ada@example.com" },
        {
          fetchImpl: async () =>
            new Response(
              JSON.stringify({
                error: "mailer_not_configured",
                contact: INSTALL_INBOX,
              }),
              { status: 503 },
            ),
        },
      ),
    ).rejects.toThrow(/contact@meshvault\.ai/);
  });
});
