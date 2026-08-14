import assert from "node:assert/strict";
import releaseConfig from "../electron-builder.release.mjs";

const REQUIRED = [
  "CSC_LINK",
  "CSC_KEY_PASSWORD",
  "APPLE_API_KEY",
  "APPLE_API_KEY_ID",
  "APPLE_API_ISSUER",
];

function missingFields(env) {
  return REQUIRED.filter((name) => !env[name]?.trim());
}

function check(env) {
  const missing = missingFields(env);
  if (missing.length > 0) {
    throw new Error(`Missing macOS release environment variables: ${missing.join(", ")}`);
  }
}

if (process.argv.includes("--self-test")) {
  assert.deepEqual(missingFields({}), REQUIRED);
  assert.throws(
    () => check({ CSC_LINK: "certificate" }),
    new Error(
      "Missing macOS release environment variables: CSC_KEY_PASSWORD, APPLE_API_KEY, APPLE_API_KEY_ID, APPLE_API_ISSUER",
    ),
  );
  assert.doesNotThrow(() => check(Object.fromEntries(REQUIRED.map((name) => [name, "fixture"]))));
  assert.equal(releaseConfig.forceCodeSigning, true);
  assert.equal(releaseConfig.mac.identity, undefined);
  assert.equal(releaseConfig.mac.hardenedRuntime, true);
  assert.equal(releaseConfig.mac.notarize, true);
  console.log("macOS release self-check passed (7 assertions).");
} else {
  try {
    check(process.env);
    console.log("macOS release preflight passed.");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
