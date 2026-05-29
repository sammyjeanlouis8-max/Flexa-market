---
name: Mobile build Metro project-root and bundle URL bugs
description: Three compounding issues that cause the mobile production build to 404 on expo-router/entry.bundle
---

## Rule
`artifacts/mobile/scripts/build.js` must:
1. Use the direct expo binary (not `pnpm exec expo`)
2. Pass `projectRoot` as explicit `<dir>` positional arg to `expo start`
3. Build the bundle URL relative to **workspaceRoot**, not projectRoot

```javascript
const expoBin = path.join(projectRoot, "node_modules", ".bin", "expo");
spawn(expoBin, ["start", projectRoot, "--no-dev", "--minify", "--localhost"], { cwd: projectRoot });

// In downloadBundle():
const entryPath = path.resolve(projectRoot, "node_modules", "expo-router", "entry");
const bundlePath = path.relative(workspaceRoot, entryPath);
// => "artifacts/mobile/node_modules/expo-router/entry"
// URL => http://localhost:8081/artifacts/mobile/node_modules/expo-router/entry.bundle
```

**Why (three compounding bugs):**

**Bug 1 — pnpm exec CWD interference:** `pnpm exec expo` in a monorepo can silently shift
Metro's project root to the workspace root. Fix: use the direct binary path.

**Bug 2 — Expo SDK 54 monorepo detection:** When no `<dir>` argument is given to `expo start`,
Expo CLI walks up the tree, finds `pnpm-workspace.yaml`, and treats the workspace root as the
project root for Metro. Fix: pass `projectRoot` explicitly as the first positional arg.

**Bug 3 — Metro URL resolution root (the key bug):** Metro's effective URL-resolution root is
the **common ancestor** of `projectRoot` and all `watchFolders`. Because `metro.config.js` sets
`watchFolders: [workspaceRoot]` and projectRoot = `artifacts/mobile`, the common ancestor is
`workspaceRoot`. Metro therefore interprets every bundle URL path as relative to workspaceRoot.
- `node_modules/expo-router/entry` → looks for `workspaceRoot/node_modules/expo-router/entry` → NOT FOUND (pnpm doesn't hoist it there)
- `artifacts/mobile/node_modules/expo-router/entry` → looks for `workspaceRoot/artifacts/mobile/node_modules/expo-router/entry` → pnpm symlink EXISTS → follows to `.pnpm` store → FOUND ✅

Fix: `path.relative(workspaceRoot, entryPath)` instead of `path.relative(projectRoot, entryPath)`.

**Symptom:** Build logs show `[Metro Build Error] HTTP 404` and error JSON has
`"originModulePath": "/home/runner/workspace/."` despite Metro logging
`Starting project at .../artifacts/mobile`.

**How to verify:** Run `node -e "require('expo-router/entry', {paths:['/home/runner/workspace/artifacts/mobile']})"` — should resolve to the real `.pnpm` store path. The `entry.js` file is accessible via the symlink `artifacts/mobile/node_modules/expo-router → ../../../node_modules/.pnpm/expo-router@.../node_modules/expo-router`.
