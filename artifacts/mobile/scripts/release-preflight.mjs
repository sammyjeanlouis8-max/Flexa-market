import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const mobileDir = path.resolve(scriptDir, "..");
const workspaceDir = path.resolve(mobileDir, "../..");

const [appJsonText, easJsonText, appSource, workspacePackageText] = await Promise.all([
  readFile(path.join(mobileDir, "app.json"), "utf8"),
  readFile(path.join(mobileDir, "eas.json"), "utf8"),
  readFile(path.join(mobileDir, "App.tsx"), "utf8"),
  readFile(path.join(workspaceDir, "package.json"), "utf8"),
]);

const appConfig = JSON.parse(appJsonText).expo;
const easConfig = JSON.parse(easJsonText);
const workspacePackage = JSON.parse(workspacePackageText);
const failures = [];
const blockedAndroidPermissions = new Set(
  appConfig.android?.blockedPermissions ?? [],
);

function requireCondition(condition, message) {
  if (!condition) failures.push(message);
}

requireCondition(
  appConfig.ios?.bundleIdentifier === "com.flexamarket.mobile",
  "iOS bundle identifier must remain com.flexamarket.mobile.",
);
requireCondition(
  /^\d+$/.test(appConfig.ios?.buildNumber ?? "") &&
    Number(appConfig.ios.buildNumber) >= 4,
  "iOS build number must be an integer at least 4.",
);
requireCondition(
  appConfig.ios?.entitlements?.["aps-environment"] === "production",
  "Production APNs entitlement is missing.",
);
requireCondition(
  appConfig.ios?.infoPlist?.ITSAppUsesNonExemptEncryption === false,
  "Apple encryption compliance declaration must remain false.",
);
requireCondition(
  appConfig.updates?.enabled === false,
  "OTA updates must remain disabled for this WebView release strategy.",
);
requireCondition(
  easConfig.build?.production?.env?.EXPO_PUBLIC_DOMAIN === "flexamarket.com",
  "Production builds must target flexamarket.com.",
);
requireCondition(
  easConfig.build?.production?.ios?.credentialsSource === "remote",
  "iOS production signing must use remote Expo credentials.",
);
requireCondition(
  easConfig.build?.production?.autoIncrement === true,
  "Production build-number auto-increment must remain enabled.",
);
requireCondition(
  appConfig.android?.package === "com.flexa.market",
  "Android package must remain com.flexa.market.",
);
requireCondition(
  Number.isInteger(appConfig.android?.versionCode) &&
    appConfig.android.versionCode >= 39,
  "Android versionCode must be an integer at least 39.",
);
for (const permission of [
  "android.permission.READ_MEDIA_IMAGES",
  "android.permission.READ_MEDIA_VIDEO",
  "android.permission.READ_EXTERNAL_STORAGE",
  "android.permission.WRITE_EXTERNAL_STORAGE",
]) {
  requireCondition(
    blockedAndroidPermissions.has(permission) &&
      !appConfig.android?.permissions?.includes(permission),
    `Android broad media permission must remain blocked: ${permission}.`,
  );
}
const buildProperties = appConfig.plugins?.find(
  (plugin) =>
    Array.isArray(plugin) && plugin[0] === "expo-build-properties",
)?.[1]?.android;
requireCondition(
  buildProperties?.compileSdkVersion === 36 &&
    buildProperties?.targetSdkVersion === 36,
  "Android compileSdkVersion and targetSdkVersion must both be 36.",
);
requireCondition(
  easConfig.build?.production?.android?.buildType === "app-bundle",
  "Android production builds must create an app bundle.",
);
requireCondition(
  appSource.includes("We&apos;re getting the marketplace ready for you"),
  "English startup title is missing.",
);
requireCondition(
  appSource.includes(
    "This may take a few seconds if your connection is slow.",
  ),
  "English startup connection message is missing.",
);
requireCondition(
  !appSource.includes("N ap prepare mache a pou ou") &&
    !appSource.includes("Sa ka pran kèk segonn"),
  "Creole startup copy is still present in App.tsx.",
);
requireCondition(
  !workspacePackage.dependencies?.expo &&
    !workspacePackage.devDependencies?.expo,
  "Expo must only be declared by the mobile package; a workspace-root Expo dependency creates duplicate native modules.",
);

if (failures.length > 0) {
  console.error("Mobile release preflight failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Mobile release preflight passed.");
console.log(`iOS build number: ${appConfig.ios.buildNumber}`);
console.log(`Bundle identifier: ${appConfig.ios.bundleIdentifier}`);
console.log(`Android version code: ${appConfig.android.versionCode}`);
console.log(`Android package: ${appConfig.android.package}`);
console.log(
  `Production domain: ${easConfig.build.production.env.EXPO_PUBLIC_DOMAIN}`,
);