import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CommercePanel } from "./CommerceOverlay.js";

describe("commerce panel", () => {
  it("offers the $49 skills pack and a founding-install lead without claiming released clients", () => {
    const html = renderToStaticMarkup(<CommercePanel />);
    expect(html).toContain("Buy the $49 pack");
    expect(html).toContain("Request a founding install");
    expect(html).toContain("Apache-2.0");
    expect(html).toContain("self-hosted");
    expect(html).toMatch(/in development and are not released/);
    expect(html).not.toMatch(/App Store|Mac App Store|TestFlight/);
  });
});
