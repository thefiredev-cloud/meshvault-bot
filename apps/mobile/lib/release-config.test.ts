import { createRequire } from "node:module";
import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const configure = require("../app.config.js") as (input: {
  config: Record<string, unknown>;
}) => Record<string, unknown>;
const baseConfig = require("../app.json").expo as Record<string, unknown>;
const releaseKeys = [
  "MESHBOT_RELEASE_PROFILE",
  "MESHBOT_IOS_BUNDLE_IDENTIFIER",
  "MESHBOT_IOS_BUILD_NUMBER",
  "MESHBOT_EXPO_OWNER",
  "MESHBOT_EXPO_PROJECT_ID",
] as const;
const before = Object.fromEntries(releaseKeys.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of releaseKeys) {
    const value = before[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("iOS release config", () => {
  it("keeps development config unchanged", () => {
    delete process.env.MESHBOT_RELEASE_PROFILE;
    expect(configure({ config: baseConfig })).toBe(baseConfig);
  });

  it("reports each malformed production field", () => {
    Object.assign(process.env, {
      MESHBOT_RELEASE_PROFILE: "production",
      MESHBOT_IOS_BUNDLE_IDENTIFIER: "meshbot",
      MESHBOT_IOS_BUILD_NUMBER: "0",
      MESHBOT_EXPO_OWNER: "fixture-owner",
      MESHBOT_EXPO_PROJECT_ID: "not-a-uuid",
    });
    expect(() => configure({ config: baseConfig })).toThrow(
      "Invalid iOS release configuration:\nMESHBOT_IOS_BUNDLE_IDENTIFIER must be a reverse-DNS identifier.\nMESHBOT_IOS_BUILD_NUMBER must be a positive decimal integer.\nMESHBOT_EXPO_PROJECT_ID must be a UUID.",
    );
  });

  it("reports every missing production field", () => {
    process.env.MESHBOT_RELEASE_PROFILE = "production";
    for (const key of releaseKeys.slice(1)) delete process.env[key];
    process.env.MESHBOT_EXPO_OWNER = "   ";
    expect(() => configure({ config: {} })).toThrow(
      "Missing iOS release configuration: MESHBOT_IOS_BUNDLE_IDENTIFIER, MESHBOT_IOS_BUILD_NUMBER, MESHBOT_EXPO_OWNER, MESHBOT_EXPO_PROJECT_ID",
    );
  });

  it("maps owner-supplied production identity into Expo config", () => {
    Object.assign(process.env, {
      MESHBOT_RELEASE_PROFILE: "production",
      MESHBOT_IOS_BUNDLE_IDENTIFIER: "invalid.example.meshbot",
      MESHBOT_IOS_BUILD_NUMBER: "7",
      MESHBOT_EXPO_OWNER: "fixture-owner",
      MESHBOT_EXPO_PROJECT_ID: "00000000-0000-4000-8000-000000000000",
    });

    expect(configure({ config: baseConfig })).toMatchObject({
      name: baseConfig.name,
      slug: baseConfig.slug,
      scheme: baseConfig.scheme,
      version: baseConfig.version,
      plugins: baseConfig.plugins,
      owner: "fixture-owner",
      ios: {
        supportsTablet: true,
        infoPlist: (baseConfig.ios as Record<string, unknown>).infoPlist,
        bundleIdentifier: "invalid.example.meshbot",
        buildNumber: "7",
      },
      extra: { eas: { projectId: "00000000-0000-4000-8000-000000000000" } },
    });
  });
});
