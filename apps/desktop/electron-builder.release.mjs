import { readFileSync } from "node:fs";

const packageJson = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
const release = structuredClone(packageJson.build);

release.forceCodeSigning = true;
delete release.mac.identity;
release.mac.hardenedRuntime = true;
release.mac.notarize = true;

export default release;
