import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const productSurfaces = [
  ".github/ISSUE_TEMPLATE/bug.yml",
  ".github/ISSUE_TEMPLATE/self-host.yml",
  "CHANGELOG.md",
  "apps/api/src/index.ts",
  "apps/mobile/lib/api.ts",
  "apps/mobile/lib/endpoint.ts",
  "apps/web/src/pages/Brain.tsx",
  "apps/www/src/components/Logo.astro",
];

// Brand decision (owner, 2026-08-14): the product ships under the MeshVault
// name. The retired "Mesh Bot" brand and pre-rebrand names stay out of
// product surfaces.
describe("MeshVault product name", () => {
  it.each(productSurfaces)("uses MeshVault on %s", (file) => {
    const source = readFileSync(path.resolve(file), "utf8");
    expect(source).not.toMatch(/\b(?:Rakazo|Razko|MeshVault Bot)\b/i);
    expect(source).not.toMatch(/\bMesh\s?Bot(?:'s|s)?\b/i);
    expect(source).not.toMatch(/meshbot/i);
  });

  it("uses the current mobile origin scheme", () => {
    const source = ["apps/mobile/lib/api.ts", "apps/mobile/lib/endpoint.ts"]
      .map((file) => readFileSync(path.resolve(file), "utf8"))
      .join("\n");
    expect(source).toContain('origin: "meshvault://"');
    expect(source).not.toContain('origin: "meshbot://"');
  });
});
