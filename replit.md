# Flexa Market — Dev Environment

Klon lokal GitHub repo `sammyjeanlouis8-max/Flexa-market` pou teste chanjman anvan voye sou sit live.

## Sèvis ki ap kouri

| Sèvis | Pò | URL lokal |
|---|---|---|
| Marketplace (React/Vite) | 5173 | `/` — preview pane |
| API Server (Express) | 8080 | `/api/...` |

## Kòmand itil

```bash
# Voye schema DB lokal
pnpm --filter @workspace/db run push

# Typecheck tout pakèt
pnpm run typecheck

# Build API server (si nesesè)
pnpm --filter @workspace/api-server run build
```

## Kijan travay la mache

1. **Fè chanjman** nan `artifacts/marketplace/src/` oswa `artifacts/api-server/src/`
2. Marketplace **rechaje otomatikman** (Vite HMR) — pa bezwen restart
3. API server **bezwen restart** apre chanjman — klike "Restart" sou workflow `artifacts/api-server: API Server`
4. **Teste lokalment** nan preview pane
5. **Push sou GitHub** lè w satisfè — `git add . && git commit -m "..." && git push github main`
6. GitHub Actions **deploy otomatikman** sou DigitalOcean

## Sekrè ki manke (fonksyon ki pa disponib lokal)

| Sekrè | Efè si manke |
|---|---|
| `STRIPE_SECRET_KEY` | Rechaj kat pa travay |
| `STRIPE_PUBLISHABLE_KEY` | Paj checkout pa chaje |
| `RESEND_API_KEY` | Imèl OTP pa voye |

Sekrè ki **deja konfigire**: `SESSION_SECRET`, `GITHUB_TOKEN`, `DATABASE_URL` (Replit PostgreSQL)

## Push sou GitHub

```bash
git add artifacts/ lib/ scripts/
git commit -m "feat: deskripsyon chanjman"
git push github main
```

## Stack

- pnpm workspaces, Node.js 24, TypeScript
- Frontend: React + Vite + Tailwind CSS
- Backend: Express 5 + Drizzle ORM + PostgreSQL
- Deploy: GitHub Actions → DigitalOcean App Platform

## User preferences

- Travay an Kreyòl ayisyen
- Teste lokal anvan push sou production
