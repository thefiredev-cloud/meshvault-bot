// Prepares the Electron main-process build. Node instead of `cp` so the build
// runs the same on Windows, macOS and Linux.
//
// `sync`: copies the brand constants out of @meshbot/contracts into
// src/brand.ts (gitignored). The contracts package exports TypeScript source
// for bundlers; Electron's Node loads dist/main.js unbundled, so a runtime
// import of @meshbot/contracts fails with ERR_MODULE_NOT_FOUND. Only the two
// brand strings are needed at runtime; the copy keeps contracts as the one
// source of truth.
//
// `static`: copies the renderer pages next to the compiled main process.
import { copyFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const mode = process.argv[2];

if (mode === "sync") {
  copyFileSync(
    path.join(root, "..", "..", "packages", "contracts", "src", "brand.ts"),
    path.join(root, "src", "brand.ts"),
  );
} else if (mode === "static") {
  const out = path.join(root, "dist");
  mkdirSync(out, { recursive: true });
  for (const file of ["preload.cjs", "connect.html", "connect.js", "bots.html", "bots.js"]) {
    copyFileSync(path.join(root, "src", file), path.join(out, file));
  }
} else {
  console.error("usage: node scripts/copy-static.mjs sync|static");
  process.exit(2);
}
