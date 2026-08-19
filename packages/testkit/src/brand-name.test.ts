import { readFileSync } from "node:fs";
import path from "node:path";
import { MESHVAULT_SELL } from "@meshbot/contracts";
import { describe, expect, it } from "vitest";

const leftoverPitch =
  /AI teammates you actually own|Private bots on computers you control|Open-source Grok Bot alternative|Open source alternative to Grok Bot/i;

const sellSurfaces = [
  "README.md",
  "PRODUCT.md",
  "docs/self-host.md",
  "apps/www/src/site.ts",
  "apps/www/src/pages/index.astro",
  "apps/www/src/layouts/BaseLayout.astro",
  "apps/www/public/site.webmanifest",
  "apps/web/index.html",
  "apps/web/public/site.webmanifest",
  "apps/web/src/pages/Welcome.tsx",
  "apps/web/src/pages/Auth.tsx",
  "apps/web/src/pages/Onboarding.tsx",
  "apps/web/src/pages/CommerceOverlay.tsx",
  "apps/web/src/pages/Shell.tsx",
  "apps/desktop/src/connect.html",
  "apps/desktop/src/main.ts",
  "apps/mobile/app/sign-in.tsx",
  "apps/mobile/app/founding.tsx",
  "apps/mobile/app/commerce.tsx",
  "apps/mobile/app/index.tsx",
  "packages/contracts/src/brand.ts",
];

const nameSurfaces = [
  ".github/ISSUE_TEMPLATE/bug.yml",
  ".github/ISSUE_TEMPLATE/self-host.yml",
  "apps/www/src/components/Logo.astro",
  "apps/desktop/package.json",
  "apps/mobile/app.json",
  "apps/mobile/app/_layout.tsx",
  "packages/ui-web/src/bot-avatar.tsx",
  "packages/auth/src/index.ts",
];

describe("MeshVault sell", () => {
  it("locks the exact company offer", () => {
    expect(MESHVAULT_SELL).toBe(
      "MeshVault is the model plus the application plus compute. That is the company, the offer, and the message. We sell all three as one product.",
    );
  });

  it.each(sellSurfaces)("states the MeshVault sell on %s", (file) => {
    const source = readFileSync(path.resolve(file), "utf8");
    expect(source.includes(MESHVAULT_SELL) || source.includes("MESHVAULT_SELL")).toBe(true);
    expect(source).not.toMatch(leftoverPitch);
    expect(source).not.toMatch(/\b(?:Rakazo|Razko)\b/);
  });

  it.each(nameSurfaces)("uses MeshVault on %s", (file) => {
    const source = readFileSync(path.resolve(file), "utf8");
    expect(source).toMatch(/\bMeshVault\b/);
    expect(source).not.toMatch(/\b(?:Rakazo|Razko|MeshVault Bot)\b/i);
  });

  it("uses the current mobile origin scheme", () => {
    const source = ["apps/mobile/lib/api.ts", "apps/mobile/lib/endpoint.ts"]
      .map((file) => readFileSync(path.resolve(file), "utf8"))
      .join("\n");
    expect(source).toContain('origin: "meshbot://"');
    expect(source).not.toContain('origin: "meshvault://"');
  });
});
