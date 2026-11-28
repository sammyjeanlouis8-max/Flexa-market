"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const test = require("node:test");

test("shared native photo picker uses expo-image-picker + manipulator, not HTML inputs", () => {
  const picker = read("lib/nativePhotoPicker.ts");
  const field = read("components/media/NativePhotoField.tsx");
  assert.match(picker, /expo-image-picker/);
  assert.match(picker, /expo-image-manipulator/);
  assert.match(picker, /launchImageLibraryAsync|pickFromGallery/);
  assert.match(picker, /launchCameraAsync|captureFromCamera/);
  assert.match(picker, /presentPhotoSourceMenu/);
  assert.match(picker, /Platform\.OS === ["']ios["']/);
  assert.match(picker, /SaveFormat\.JPEG|manipulateAsync/);
  assert.equal(/input\s+type=["']file["']|<input\b/.test(picker), false);
  assert.equal(/input\s+type=["']file["']|<input\b/.test(field), false);
  assert.match(field, /Choose from Gallery|nativePhoto_gallery/);
  assert.match(field, /Take Photo|nativePhoto_camera/);
  assert.match(field, /uploadPickedPhoto|progress|Retry|nativePhoto_retry/);
});

test("restaurant owner forms wire NativePhotoField for dishes, logo, cover", () => {
  const dishes = read("app/restaurant/owner/dishes.tsx");
  const settings = read("app/restaurant/owner/settings.tsx");
  const add = read("app/restaurant/add.tsx");
  for (const src of [dishes, settings, add]) {
    assert.match(src, /NativePhotoField/);
    assert.equal(/from\s+["']react-native-webview["']|<\s*WebView\b/.test(src), false);
  }
  assert.match(dishes, /restaurant-dish-photos|Food photos|restaurant_foodPhotos/);
  assert.match(dishes, /isHttpsImageUrl/);
  assert.match(dishes, /foodImageRequired|photoError|showError/);
  assert.match(settings, /restaurant-settings-logo|restaurant_logo/);
  assert.match(settings, /restaurant-settings-cover|restaurant_cover/);
  assert.match(add, /restaurant-add-logo|restaurant-add-cover/);
});

test("beauty owner forms wire NativePhotoField for services, portfolio, logo, cover, staff", () => {
  const services = read("app/beauty/center-services.tsx");
  const portfolio = read("app/beauty/center-portfolio.tsx");
  const onboarding = read("app/beauty/onboarding.tsx");
  const staff = read("app/beauty/center-staff.tsx");
  const center = read("app/beauty/center.tsx");
  for (const src of [services, portfolio, onboarding, staff]) {
    assert.match(src, /NativePhotoField/);
  }
  assert.match(services, /beauty-service-photo|serviceImageRequired|isHttpsImageUrl/);
  assert.match(portfolio, /beauty-portfolio|portfolioImageRequired|mediaUrl/);
  assert.match(onboarding, /beauty-onboarding-logo|beauty-onboarding-cover/);
  assert.match(center, /center-portfolio/);
});

test("i18n includes nativePhoto and beauty portfolio keys in en/ht/fr/es", () => {
  const source = read("i18n/nativeScreens.ts");
  for (const key of [
    "nativePhoto_add",
    "nativePhoto_gallery",
    "nativePhoto_camera",
    "nativePhoto_required",
    "beauty_portfolio",
    "beauty_serviceImageRequired",
    "restaurant_foodImageRequired",
  ]) {
    const matches = source.match(new RegExp(`${key}\\s*:`, "g")) || [];
    assert.ok(matches.length >= 4, `${key} should appear in en/ht/fr/es (found ${matches.length})`);
  }
});

test("mobile package depends on expo-image-manipulator for compression", () => {
  const pkg = JSON.parse(read("package.json"));
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  assert.ok(deps["expo-image-picker"]);
  assert.ok(deps["expo-image-manipulator"]);
});

test("iOS/Android photo permissions mention Restaurant and Beauty; Android blocks READ_MEDIA", () => {
  const app = JSON.parse(read("app.json"));
  const ios = app.expo.ios.infoPlist;
  assert.match(ios.NSCameraUsageDescription, /Restaurant|Beauty/);
  assert.match(ios.NSPhotoLibraryUsageDescription, /Restaurant|Beauty/);
  const blocked = app.expo.android.blockedPermissions || [];
  assert.ok(blocked.includes("android.permission.READ_MEDIA_IMAGES"));
  assert.ok((app.expo.android.permissions || []).includes("android.permission.CAMERA"));
});
