// Expo merges app.json into this input. Keep release metadata in app.json.
module.exports = ({ config }) => {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY?.trim();
  const iosApiKey = process.env.GOOGLE_MAPS_IOS_API_KEY?.trim();

  if (process.env.EAS_BUILD_PLATFORM === "android" && !apiKey) {
    throw new Error(
      "Set GOOGLE_MAPS_API_KEY in the EAS build environment before building Android."
    );
  }

  if (process.env.EAS_BUILD_PLATFORM === "ios" && !iosApiKey) {
    throw new Error(
      "Set GOOGLE_MAPS_IOS_API_KEY in the EAS build environment before building iOS."
    );
  }

  return {
    ...config,
    ios: iosApiKey ? {
      ...config.ios,
      config: { ...config.ios?.config, googleMapsApiKey: iosApiKey },
    } : config.ios,
    android: apiKey ? {
      ...config.android,
      config: {
        ...config.android?.config,
        googleMaps: {
          ...config.android?.config?.googleMaps,
          apiKey,
        },
      },
    } : config.android,
  };
};
