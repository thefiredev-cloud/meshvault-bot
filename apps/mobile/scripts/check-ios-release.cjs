const RELEASE_FIELDS = {
  MESHVAULT_IOS_BUNDLE_IDENTIFIER: "bundleIdentifier",
  MESHVAULT_IOS_BUILD_NUMBER: "buildNumber",
  MESHVAULT_EXPO_OWNER: "owner",
  MESHVAULT_EXPO_PROJECT_ID: "projectId",
};

function readIosReleaseConfig(env = process.env) {
  const missing = Object.keys(RELEASE_FIELDS).filter((name) => !env[name]?.trim());
  if (missing.length) {
    throw new Error(`Missing iOS release configuration: ${missing.join(", ")}`);
  }

  const values = Object.fromEntries(
    Object.entries(RELEASE_FIELDS).map(([name, field]) => [field, env[name].trim()]),
  );
  const invalid = [];
  if (
    !/^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*(?:\.[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*)+$/.test(
      values.bundleIdentifier,
    )
  ) {
    invalid.push("MESHVAULT_IOS_BUNDLE_IDENTIFIER must be a reverse-DNS identifier.");
  }
  if (!/^[1-9]\d*$/.test(values.buildNumber)) {
    invalid.push("MESHVAULT_IOS_BUILD_NUMBER must be a positive decimal integer.");
  }
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      values.projectId,
    )
  ) {
    invalid.push("MESHVAULT_EXPO_PROJECT_ID must be a UUID.");
  }
  if (invalid.length) throw new Error(`Invalid iOS release configuration:\n${invalid.join("\n")}`);

  return values;
}

if (require.main === module) {
  try {
    readIosReleaseConfig();
    console.log("iOS release configuration is complete.");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { readIosReleaseConfig };
