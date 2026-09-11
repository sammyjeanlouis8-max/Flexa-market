"use strict";

const fs = require("fs");
const path = require("path");

function baseVersion(resolution) {
  return typeof resolution === "string" ? resolution.split("(")[0] : "";
}

function readImporterVersions(lockPath, importerName) {
  const lines = fs.readFileSync(lockPath, "utf8").split(/\r?\n/);
  const importerHeader = `  ${importerName}:`;
  const start = lines.findIndex((line) => line === importerHeader);
  if (start < 0) throw new Error(`pnpm lockfile has no ${importerName} importer`);

  const versions = {};
  let section = "";
  let packageName = "";
  for (let index = start + 1; index < lines.length; index++) {
    const line = lines[index];
    if (/^  \S/.test(line)) break;
    const sectionMatch = line.match(/^    (dependencies|devDependencies):$/);
    if (sectionMatch) {
      section = sectionMatch[1];
      packageName = "";
      continue;
    }
    if (!section) continue;
    const packageMatch = line.match(/^      (.+):$/);
    if (packageMatch) {
      packageName = packageMatch[1].replace(/^['"]|['"]$/g, "");
      continue;
    }
    const versionMatch = line.match(/^        version: (.+)$/);
    if (packageName && versionMatch) {
      const resolution = versionMatch[1].replace(/^['"]|['"]$/g, "");
      versions[packageName] = baseVersion(resolution);
    }
  }
  return versions;
}

function assertInstalledDependencies({
  projectDir,
  lockPath,
  importerName = "artifacts/mobile",
  packageNames = ["expo", "typescript"],
}) {
  const expected = readImporterVersions(lockPath, importerName);
  const failures = [];

  for (const name of packageNames) {
    const expectedVersion = expected[name];
    if (!expectedVersion) {
      failures.push(`${name}: no exact resolution in lockfile importer`);
      continue;
    }
    const manifestPath = path.join(projectDir, "node_modules", name, "package.json");
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      if (manifest.name !== name || manifest.version !== expectedVersion) {
        failures.push(
          `${name}: expected ${expectedVersion}, found ${manifest.name || "unnamed"}@${manifest.version || "unknown"}`,
        );
      }
      const requiredFile =
        name === "expo"
          ? path.join(path.dirname(manifestPath), "bundledNativeModules.json")
          : name === "typescript"
            ? path.join(path.dirname(manifestPath), "lib", "typescript.js")
            : null;
      if (requiredFile && !fs.existsSync(requiredFile)) {
        failures.push(`${name}: package is hollow (missing ${path.basename(requiredFile)})`);
      }
    } catch (error) {
      failures.push(`${name}: ${error.code === "ENOENT" ? "missing" : error.message}`);
    }
  }

  if (failures.length) {
    throw new Error(
      "Critical dependency installation is incomplete or differs from node_modules/.pnpm/lock.yaml. " +
        "Refusing to create stubs or overwrite packages:\n- " +
        failures.join("\n- "),
    );
  }
}

module.exports = { assertInstalledDependencies, baseVersion, readImporterVersions };