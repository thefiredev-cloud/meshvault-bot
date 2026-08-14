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

describe("Mesh Bot product name", () => {
  it.each(productSurfaces)("uses Mesh Bot on %s", (file) => {
    const source = readFileSync(path.resolve(file), "utf8");
    expect(source).not.toMatch(/\b(?:Rakazo|Razko|MeshVault Bot)\b/i);
    expect(source).not.toMatch(/\bMeshVault\b/);
  });

  it("uses the current mobile origin scheme", () => {
    const source = ["apps/mobile/lib/api.ts", "apps/mobile/lib/endpoint.ts"]
      .map((file) => readFileSync(path.resolve(file), "utf8"))
      .join("\n");
    expect(source).toContain('origin: "meshbot://"');
    expect(source).not.toContain('origin: "meshvault://"');
  });
});
