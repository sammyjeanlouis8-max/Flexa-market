---
name: Flexa Market deploy & debug
description: How the Flexa Market marketplace is edited, deployed, and reliably inspected
---

# Flexa Market (Haitian marketplace)

- GitHub repo `sammyjeanlouis8-max/Flexa-market`, hosted on Digital Ocean with **auto-deploy from `main`**.
- The marketplace is **NOT a local artifact** in this workspace (only `api-server` + `mockup-sandbox` are local). Edit marketplace files via the **GitHub Contents API** using `GITHUB_TOKEN` (never print its value). For large files: write `{message,content(base64),sha,branch:'main'}` to a temp JSON and `curl -X PUT --data @file` (inline base64 hits "Argument list too long").
- The user communicates **only in Haitian Creole** — always respond in Haitian Creole.

## Verifying a deploy / reading the real browser state
- **Why:** the Replit `external_url` screenshot tool shows a false centered orange spinner for this app (it captures before the SPA finishes; the app holds long-lived connections so network never goes idle). That spinner is a **tooling artifact, not a real bug**.
- **How to apply:** install Nix `chromium` via `installSystemDependencies(["chromium"])`, then run puppeteer with `executablePath` pointing at the Nix chromium binary (puppeteer's bundled chrome fails: missing `libglib-2.0.so.0`). Load the live URL with `waitUntil:'networkidle2'` + a few seconds, then read `document.body.innerText` and listen for `pageerror`/`console.error`. This gives ground truth without deploy waits.
- Deploy lag on DO is real but variable: ~3–12 min per push (not permanently stuck). Confirm a deploy landed by polling `https://flexamarket.com/` for the `assets/index-<hash>.js` filename changing.

## Build characteristics
- Build is `vite build` with **no typecheck**, so broken TS still builds and ships. Validate edits compile locally first with the repo's esbuild binary (pass the `.tsx` directly + `--jsx=automatic`).
- `__BUILD_ID__` cache-buster + chunk-error auto-reload live in `main.tsx`. **Never call `window.location.reload()` during React render** — it caused an infinite reload loop; do reloads inside `useEffect`/event handlers instead.
