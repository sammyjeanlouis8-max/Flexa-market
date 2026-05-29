---
name: Mobile build pnpm-exec project-root bug
description: Why build.js must call the expo binary directly AND pass projectRoot as explicit <dir> arg
---

## Rule
`artifacts/mobile/scripts/build.js` must spawn Expo CLI with the project directory as an explicit
positional argument AND use the direct binary path:

```javascript
const expoBin = path.join(projectRoot, "node_modules", ".bin", "expo");
spawn(expoBin, ["start", projectRoot, "--no-dev", "--minify", "--localhost"], { cwd: projectRoot });
```

Never use `pnpm exec expo start` (no explicit dir arg) in this script.

**Why (two compounding bugs):**

1. `pnpm exec expo` in a monorepo can silently shift Metro's project root to the workspace root
   instead of `artifacts/mobile`. Using the direct binary path (`node_modules/.bin/expo`) ensures
   the correct binary runs without pnpm exec interference.

2. Expo SDK 54 CLI performs monorepo detection: when no `<dir>` argument is given, it walks up the
   directory tree, finds `pnpm-workspace.yaml` at `/home/runner/workspace/`, and sets Metro's
   project root to the workspace root. This causes Metro to search for `expo-router/entry` in
   `/home/runner/workspace/node_modules/expo-router` which does not exist under pnpm's node-linker
   layout (only in `artifacts/mobile/node_modules/expo-router`), producing an HTTP 404 on the
   bundle URL. Passing `projectRoot` explicitly as the first positional arg (`expo start <dir>`)
   overrides this detection.

**Symptom:** Build logs show `[Metro Build Error] HTTP 404` for the bundle URL, and the error JSON
shows `"originModulePath": "/home/runner/workspace/."` (workspace root) instead of
`".../artifacts/mobile/."`.

**How to verify the fix:** Run `node scripts/build.js` locally (with a free port 8081); the Metro
log must say `Starting project at /home/runner/workspace/artifacts/mobile`.

**How to apply:** Any time the build script needs to start Metro/Expo, use the absolute binary path
and always pass `projectRoot` as the first positional argument.
