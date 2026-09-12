"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  assertInstalledDependencies,
  baseVersion,
} = require("../scripts/dependency-check");

test("Android blocks broad storage and battery permissions", () => {
  const app = require("../app.json");
  const blocked = new Set(app.expo.android.blockedPermissions);
  for (const permission of [
    "android.permission.READ_MEDIA_IMAGES",
    "android.permission.READ_MEDIA_VIDEO",
    "android.permission.READ_EXTERNAL_STORAGE",
    "android.permission.WRITE_EXTERNAL_STORAGE",
    "android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS",
  ]) {
    assert.equal(blocked.has(permission), true);
    assert.equal(app.expo.android.permissions.includes(permission), false);
  }
});

test("background upload module supplies the Android version required by Expo", () => {
  const gradle = fs.readFileSync(
    path.join(__dirname, "../modules/flexa-background-upload/android/build.gradle"),
    "utf8",
  );
  assert.match(gradle, /defaultConfig\s*\{[\s\S]*versionName\s+['"]1\.0\.0['"]/);
});

test("background upload worker uses the HttpURLConnection streaming method", () => {
  const worker = fs.readFileSync(
    path.join(
      __dirname,
      "../modules/flexa-background-upload/android/src/main/java/expo/modules/flexabackgroundupload/FlexaUploadWorker.kt",
    ),
    "utf8",
  );
  assert.match(worker, /setFixedLengthStreamingMode\(count\)/);
  assert.doesNotMatch(worker, /^\s*fixedLengthStreamingMode\(count\)/m);
});

test("dependency check accepts exact lock versions and never repairs files", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "flexa-deps-"));
  const projectDir = path.join(root, "artifacts", "mobile");
  const lockPath = path.join(root, "node_modules", ".pnpm", "lock.yaml");
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  fs.mkdirSync(path.join(projectDir, "node_modules", "real-package"), { recursive: true });
  fs.writeFileSync(
    lockPath,
    "lockfileVersion: '9.0'\nimporters:\n  artifacts/mobile:\n    dependencies:\n      real-package:\n        specifier: ^1.0.0\n        version: 1.0.0(peer@2.0.0)\n",
  );
  const manifest = path.join(projectDir, "node_modules", "real-package", "package.json");
  fs.writeFileSync(manifest, '{"name":"real-package","version":"1.0.0"}');

  assert.equal(baseVersion("1.0.0(peer@2.0.0)"), "1.0.0");
  assert.doesNotThrow(() =>
    assertInstalledDependencies({ projectDir, lockPath, packageNames: ["real-package"] }),
  );
  assert.equal(fs.readFileSync(manifest, "utf8"), '{"name":"real-package","version":"1.0.0"}');

  fs.rmSync(path.dirname(manifest), { recursive: true });
  assert.throws(
    () => assertInstalledDependencies({ projectDir, lockPath, packageNames: ["real-package"] }),
    /Refusing to create stubs or overwrite packages/,
  );
  assert.equal(fs.existsSync(path.dirname(manifest)), false);
  fs.rmSync(root, { recursive: true, force: true });
});