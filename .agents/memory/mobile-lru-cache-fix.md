---
name: Mobile lru-cache + OTA bundling fix
description: lru-cache version conflict breaks eas update Metro bundling; fix requires root-level pinning
---

## Rule
`lru-cache@5.1.1` must be a direct dependency in both:
1. Root `package.json` — so pnpm hoists a symlink at `node_modules/lru-cache`
2. `artifacts/mobile/package.json` — belt-and-suspenders

## Why
`@babel/helper-compilation-targets@7.28.6` declares `lru-cache@^5.1.1` as a peer/dep and does `var _lruCache = require("lru-cache"); new _lruCache({})`. With pnpm strict hoisting, if no root-level dep pins lru-cache, no symlink is created at `node_modules/lru-cache` and babel throws `Cannot find module 'lru-cache'` or `_lruCache is not a constructor` (if a v10+ version is hoisted instead).

## How to apply
Any time `eas update` fails with `_lruCache is not a constructor` or `LRUCache is not a constructor`:
- Check `node_modules/lru-cache` symlink exists and points to v5.x
- If missing, add `"lru-cache": "5.1.1"` to root `package.json` dependencies
- Run `CI=true pnpm install --no-frozen-lockfile`
- Verify with: `node -e "require('@babel/helper-compilation-targets'); console.log('ok')"`
