import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MESHVAULT_SELL as CONTRACT_SELL } from "@meshbot/contracts";
import { describe, expect, it } from "vitest";
import { MESHVAULT_SELL } from "./sell.js";

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir, "../../..");

const LOCKED =
  "MeshVault is the model plus the application plus compute. That is the company, the offer, and the message.";

function read(rel: string) {
  return readFileSync(path.join(root, rel), "utf8");
}

describe("locked MeshVault sell on Expo iOS surfaces", () => {
  it("keeps the exact company offer and message", () => {
    expect(MESHVAULT_SELL).toBe(LOCKED);
    expect(MESHVAULT_SELL).toBe(CONTRACT_SELL);
    expect(MESHVAULT_SELL).toContain("the model plus the application plus compute");
  });

  it("shows the sell on founding, commerce, and existing mobile checkout surfaces", () => {
    for (const file of [
      "apps/mobile/app/founding.tsx",
      "apps/mobile/app/commerce.tsx",
      "apps/mobile/app/index.tsx",
    ]) {
      const source = read(file);
      expect(source).toContain("MESHVAULT_SELL");
      expect(source).toContain('from "../lib/sell"');
    }
    expect(read("apps/mobile/app/founding.tsx")).toMatch(/\{MESHVAULT_SELL\}/);
    expect(read("apps/mobile/app/commerce.tsx")).toMatch(/styles\.footer/);
  });

  it("does not pitch MeshVault as only a model, only an app, or only compute", () => {
    const sources = [
      "apps/mobile/lib/sell.ts",
      "apps/mobile/app/founding.tsx",
      "apps/mobile/app/commerce.tsx",
      "apps/mobile/app/index.tsx",
    ]
      .map(read)
      .join("\n");
    expect(sources).not.toMatch(/only a model/i);
    expect(sources).not.toMatch(/only an app/i);
    expect(sources).not.toMatch(/only compute/i);
    expect(sources).not.toMatch(/\bRakazo\b/i);
    expect(sources).not.toMatch(/apps\.apple\.com|itms-beta|EXPO_PUBLIC_|EAS_PROJECT/i);
  });
});
