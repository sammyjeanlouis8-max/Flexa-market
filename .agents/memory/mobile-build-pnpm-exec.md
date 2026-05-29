---
name: Mobile build pnpm-exec project-root bug
description: Why build.js must call the expo binary directly instead of pnpm exec expo
---

## Rule
`artifacts/mobile/scripts/build.js` must spawn the Expo CLI via the direct binary path:
```javascript
const expoBin = path.join(projectRoot, "node_modules", ".bin", "expo");
spawn(expoBin, ["start", "--no-dev", "--minify", "--localhost"], { cwd: projectRoot });
```
Never use `pnpm exec expo start` in this script.

**Why:** In a pnpm monorepo, `pnpm exec` can silently shift Metro's project root to the workspace root (`/home/runner/workspace`) instead of `artifacts/mobile`. Metro then searches for `expo-router/entry` under `/home/runner/workspace/node_modules/` which doesn't exist in pnpm's node-linker layout, causing HTTP 404 on the bundle URL. Symptom in build logs: `originModulePath: "/home/runner/workspace/."` and `UnableToResolveError` for `./node_modules/expo-router/entry`.

**How to apply:** Any time the build script needs to start Metro/Expo, use the absolute path to the binary. Verify the fix by running `node scripts/build.js` locally and confirming the Metro log says `Starting project at /home/runner/workspace/artifacts/mobile`.
