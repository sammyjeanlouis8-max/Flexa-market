---
name: Flexa build discipline before GitHub push
description: Rules for verifying FlexaMusic / marketplace changes before pushing to GitHub (which triggers DigitalOcean auto-deploy)
---

## The rule
Always run `cd artifacts/marketplace && npx vite build --config vite.config.ts` locally and confirm `✓ built in` before pushing FlexaMusic.tsx (or any marketplace file) to GitHub. Do not push if the build errors out.

**Why:** DigitalOcean auto-deploys on every push to main. A broken build or a Rollup TDZ crash takes down flexamarket.com immediately for all users — there is no staging gate between push and production.

**How to apply:**
1. Make the edit(s).
2. Run `cd artifacts/marketplace && npx vite build --config vite.config.ts 2>&1 | tail -8`.
3. Confirm the last line is `✓ built in …s` with no errors above it (chunk-size warnings are acceptable).
4. Only then run the GitHub push script.

## TDZ pitfall in FlexaMusic.tsx
`const playNext = useCallback(...)` is declared late in the component body. Any `useEffect(..., [playNext])` or other expression that references `playNext` **must** appear AFTER the `const playNext = ...` line, not before. Rollup's production optimizer exposes the Temporal Dead Zone and crashes the bundle with `ReferenceError: Cannot access 'X' before initialization` — `X` being a minified variable name.

**General rule:** In long React component files, always declare `useCallback` / `useMemo` values before any `useEffect` that lists them in its dependency array.

## Double-fragment nesting crash
Wrapping the entire non-loading JSX in `{loading ? null : (<>...</>)}` inside an outer `<>...</>` introduced a circular reference in Rollup's chunk graph, also causing `Cannot access 'O' before initialization`. Keep the early-return pattern for loading states; just include `<audio ref={audioRef} />` in both the loading and non-loading return paths so the ref is always populated.
