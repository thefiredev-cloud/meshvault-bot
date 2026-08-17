import { describe, expect, it } from "vitest";
import { blockedAuthPaths, ownerBootstrapId } from "./index.js";

describe("auth policy", () => {
  it("blocks invitation and org-creation paths in version 1", () => {
    expect(blockedAuthPaths.some((p) => p.includes("invite"))).toBe(true);
    expect(blockedAuthPaths.some((p) => p.includes("create"))).toBe(true);
  });

  it("normalizes owner bootstrap reservations without storing an email", () => {
    expect(ownerBootstrapId(" Owner@Example.com ")).toBe(ownerBootstrapId("owner@example.com"));
    expect(ownerBootstrapId("owner@example.com")).not.toContain("owner@example.com");
  });
});
