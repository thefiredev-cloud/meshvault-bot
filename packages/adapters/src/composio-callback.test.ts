import { describe, expect, it } from "vitest";
import { resolveComposioCallbackUrl } from "./composio-callback.js";

describe("resolveComposioCallbackUrl", () => {
  it("allows HTTPS and development loopback but rejects insecure startup URLs", () => {
    expect(resolveComposioCallbackUrl("https://app.example.com/base", "production")).toBe(
      "https://app.example.com/api/connections/composio/callback",
    );
    expect(resolveComposioCallbackUrl("http://127.0.0.1:3100", "development")).toBe(
      "http://127.0.0.1:3100/api/connections/composio/callback",
    );
    expect(resolveComposioCallbackUrl("http://[::1]:3100", "test")).toBe(
      "http://[::1]:3100/api/connections/composio/callback",
    );
    expect(() => resolveComposioCallbackUrl("http://100.64.0.10:3100", "development")).toThrow(
      "API_URL must use HTTPS",
    );
    expect(() => resolveComposioCallbackUrl("http://localhost:3100", "production")).toThrow(
      "API_URL must use HTTPS",
    );
  });
});
