const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Fix react-native-svg resolution on web
// The package has a .web.ts entry but Metro doesn't find it automatically.
const SVG_WEB = path.resolve(
  __dirname,
  'node_modules/react-native-svg/src/ReactNativeSVG.web.ts'
);

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && moduleName === 'react-native-svg') {
    return { filePath: SVG_WEB, type: 'sourceFile' };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
