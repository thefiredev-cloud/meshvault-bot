import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MESHVAULT_SELL } from "./sell.js";

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir, "../../..");

const LOCKED =
  "MeshVault sells the model plus the application plus compute as one product. That is the company, the offer, and the message.";

function read(rel: string) {
  return readFileSync(path.join(root, rel), "utf8");
}

describe("locked MeshVault sell on Expo iOS surfaces", () => {
  it("keeps the exact company offer and message", () => {
    expect(MESHVAULT_SELL).toBe(LOCKED);
    expect(MESHVAULT_SELL).toContain("the model plus the application plus compute");
    expect(MESHVAULT_SELL).toContain("one product");
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

  it("does not put the locked sell on Electron, desktop, or www", () => {
    const offMobile = [
      "apps/desktop/src/connect.html",
      "apps/web/src/pages/CommerceOverlay.tsx",
      "apps/www/src/pages/index.astro",
      "apps/www/src/components/Footer.astro",
    ]
      .map(read)
      .join("\n");
    expect(offMobile).not.toContain(LOCKED);
    expect(offMobile).not.toContain("MESHVAULT_SELL");
  });
});
