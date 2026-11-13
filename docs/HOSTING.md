# Flexa Market hosting

**DigitalOcean App Platform is the only hosting target** for the website and API (`flexamarket.com`).

## Deploy path

- Workflow: `.github/workflows/deploy.yml` (`Deploy to DigitalOcean`)
- Triggers: push/merge to `main`, or manual `workflow_dispatch`
- App ID: `4a94f9b4-6ede-453e-9e8c-f1439d3ade6d` (override with repo variable `DO_APP_ID`)
- Secret: `DO_API_TOKEN` (Actions)

## Vercel

Do **not** reconnect Vercel. There is no `vercel.json` and no Vercel workflow in this repo.

If GitHub still shows status contexts like:

- `Vercel – flexa-market-api-server-fihd`
- `Vercel – flexa-market-api-server-g97n`
- `Vercel – flexa-market-api-server-2jmn`

those come from the **Vercel GitHub App** (account/org installation) posting Commit Statuses on push/PR — not from Actions in this repository. They fail with “Account is blocked” and are not part of DigitalOcean deploy.

### Owner action required (cannot be done by the CI token)

1. GitHub → `sammyjeanlouis8-max/Flexa-market` → **Settings → Integrations / GitHub Apps**
2. Open **Vercel** → **Configure** → remove **only** the Flexa Market repository (or uninstall Vercel from this repo)
3. Optionally delete the three blocked Vercel projects named above in the Vercel dashboard
4. Confirm branch protection / rulesets do **not** require any `Vercel – *` status (Settings → Branches / Rules)

After disconnect, a new PR commit must show **no** Vercel status contexts.
