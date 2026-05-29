const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Watch the entire workspace root so Metro can resolve bundle paths that are
// relative to the workspace (e.g. artifacts/mobile/node_modules/expo-router/entry).
// The blockList below prevents .local/ from ever being crawled or bundled.
config.watchFolders = [workspaceRoot];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// Belt-and-suspenders: block .local from ever being resolved/bundled.
config.resolver.blockList = [
  /\/\.local\/.*/,
];

// Early error capture polyfill — runs before ANY app module so module-init
// errors are stored in globalThis.__earlyErrors and rendered on-screen.
config.serializer = config.serializer || {};
const _getPolyfills = config.serializer.getPolyfills;
config.serializer.getPolyfills = (ctx) => {
  const base = _getPolyfills ? _getPolyfills(ctx) : [];
  return [
    ...base,
    path.resolve(projectRoot, "polyfills/early-error-capture.js"),
  ];
};

module.exports = config;
