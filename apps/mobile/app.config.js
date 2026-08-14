const { readIosReleaseConfig } = require("./scripts/check-ios-release.cjs");

module.exports = ({ config }) => {
  if (process.env.MESHBOT_RELEASE_PROFILE !== "production") return config;

  const release = readIosReleaseConfig();
  return {
    ...config,
    owner: release.owner,
    ios: {
      ...config.ios,
      bundleIdentifier: release.bundleIdentifier,
      buildNumber: release.buildNumber,
    },
    extra: {
      ...config.extra,
      eas: { ...config.extra?.eas, projectId: release.projectId },
    },
  };
};
