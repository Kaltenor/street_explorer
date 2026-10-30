const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "@expo/vector-icons/Ionicons") {
    return { type: "sourceFile", filePath: path.join(__dirname, "src/components/AppIcon.ts") };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
