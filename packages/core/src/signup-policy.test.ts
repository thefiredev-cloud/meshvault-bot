import { describe, expect, it } from "vitest";
import { emailAllowed, parseAllowlist, signupsOpen } from "./signup-policy.js";

describe("signup policy", () => {
  it("denies every email when the list is empty", () => {
    expect(emailAllowed("a@x.com", [])).toBe(false);
  });

  it("matches exact addresses and domains case-insensitively", () => {
    const list = parseAllowlist("You@Example.com,@company.com");
    expect(emailAllowed("you@example.com", list)).toBe(true);
    expect(emailAllowed("dev@company.com", list)).toBe(true);
    expect(emailAllowed("other@x.com", list)).toBe(false);
  });

  it("honors SIGNUPS_ENABLED", () => {
    expect(signupsOpen(undefined)).toBe(false);
    expect(signupsOpen("true")).toBe(true);
    expect(signupsOpen("1")).toBe(true);
    expect(signupsOpen("false")).toBe(false);
    expect(signupsOpen("0")).toBe(false);
    expect(signupsOpen("yes")).toBe(false);
    expect(signupsOpen("fasle")).toBe(false);
    expect(signupsOpen("")).toBe(false);
  });
});
