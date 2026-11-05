# Flexa AI — Existing Infrastructure Audit

**Date:** 2026-11-05  
**Scope:** FlexaBot and related AI integrations in Flexa Market  
**Constraint:** No new AI provider accounts, no billing changes, credentials stay server-side.

---

## Executive summary

Flexa Market already runs a **multi-provider AI stack**. The primary workhorse is **Anthropic Claude Haiku** (`claude-haiku-4-5`) via `@anthropic-ai/sdk`, with optional **Groq** (`llama-3.1-8b-instant`) as FlexaBot backup and **OpenAI** (`gpt-5-nano`) for listing moderation. Credentials use managed `AI_INTEGRATIONS_*` env vars (plus optional `ANTHROPIC_API_KEY` / `GROQ_API_KEY`).

**All six Flexa AI capability areas can reuse the existing Anthropic integration without a new paid account**, as long as production already has Anthropic keys provisioned. No Gemini/new-vendor onboarding is required.

---

## 1. Provider and models in use

| Feature | Provider | Model |
|---|---|---|
| FlexaBot (primary) | Anthropic | `claude-haiku-4-5` |
| FlexaBot (backup) | Groq | `llama-3.1-8b-instant` |
| Chat / push translation | Anthropic | `claude-haiku-4-5` |
| Visual search | Anthropic Vision | `claude-haiku-4-5` |
| Driver vehicle photo verify | Anthropic Vision | `claude-haiku-4-5` |
| CalcAI API | Anthropic | `claude-haiku-4-5` |
| AI Guardian activity monitor | Anthropic | `claude-haiku-4-5` |
| Wallet fraud analyze | Anthropic | `claude-opus-4-5` (highest cost) |
| Listing moderation | OpenAI | `gpt-5-nano` (+ rule fallback) |

Packages: `@anthropic-ai/sdk`, `openai`. Groq is raw HTTP (no SDK).

---

## 2. API integration status

**Yes — integrations already exist.** Clients are constructed per-file today (not yet centralized before this work):

- `artifacts/api-server/src/routes/chatbot.ts`
- `artifacts/api-server/src/routes/translation.ts`
- `artifacts/api-server/src/routes/visual-search.ts`
- `artifacts/api-server/src/routes/vehicle-verify.ts`
- `artifacts/api-server/src/routes/calculator.ts`
- `artifacts/api-server/src/routes/walletMonitor.ts`
- `artifacts/api-server/src/lib/ai-guardian.ts`
- `artifacts/api-server/src/lib/pushTranslate.ts`
- `artifacts/api-server/src/lib/moderation.ts` (OpenAI)

---

## 3. Credential configuration (names only)

| Env var | Purpose |
|---|---|
| `AI_INTEGRATIONS_ANTHROPIC_BASE_URL` | Anthropic/proxy base URL |
| `AI_INTEGRATIONS_ANTHROPIC_API_KEY` | Anthropic API key |
| `ANTHROPIC_API_KEY` | Alternate key (chatbot only, historically) |
| `AI_INTEGRATIONS_OPENAI_BASE_URL` | OpenAI/proxy base URL |
| `AI_INTEGRATIONS_OPENAI_API_KEY` | OpenAI API key |
| `GROQ_API_KEY` | Optional FlexaBot backup |

Secrets are read only on the server. There was no `.env.example` documenting AI vars; this initiative documents them and centralizes access in `lib/flexaAi.ts`.

**Do not commit key values. Do not expose them to the client.**

---

## 4. Capabilities already supported

| Capability | Status |
|---|---|
| Customer support chatbot (FlexaBot) | Live — `/api/chatbot/message` |
| Listing moderation | Live — rules + OpenAI |
| Message translation + cache | Live — `/api/messages/:id/translate` |
| Push notification translation | Live |
| Visual product search | Live |
| Vehicle photo verification | Live |
| CalcAI (backend) | Live API; frontend calculator is local math |
| AI Guardian security jobs | Live (admin) |
| Wallet AI analyze | Live (super admin, Opus) |
| Product description generation | **Missing → added via Flexa AI service** |
| Booster recommendations (LLM) | **Missing → added via Flexa AI service** |
| Seller analytics narratives | **Missing → added via Flexa AI service** |
| General admin assistant | **Missing → added via Flexa AI service** |

---

## 5. Reuse across features

**Yes.** One Anthropic client (Haiku by default) can power support, descriptions, translation helpers, boost tips, seller insights, and admin Q&A.

This work introduces:

- `artifacts/api-server/src/lib/flexaAi.ts` — shared client, models, `completeText` / `completeChat`
- `artifacts/api-server/src/lib/flexaAiUsage.ts` — authz-aware daily quotas + usage log
- `artifacts/api-server/src/routes/flexaAi.ts` — capability endpoints

FlexaBot (`/api/chatbot/*`) remains intact; it can optionally share the same Anthropic client helper without changing product behavior.

---

## 6. Usage, rate limits, and cost posture

**Existing controls**

- Global API limiter (~120 req/min)
- Calculator AI: 30/min
- Chatbot: ≤40 messages/request, ≤4000 chars, `max_tokens: 1024`, timeouts
- Translation DB cache (avoids repeat spend)
- Admin translation kill-switch
- Wallet analyze uses Opus (expensive) and is super-admin only

**Gaps before this work:** no shared daily per-user AI budget, no capability feature flags, duplicated client construction, Opus not gated by an explicit allow flag.

**Cost guidance (no billing changes activated)**

- Prefer **`claude-haiku-4-5`** for all new Flexa AI features.
- Keep **`claude-opus-4-5`** behind `FLEXA_AI_ALLOW_OPUS=1` (default **off** for new routes).
- Do not provision new vendor accounts or raise spend without explicit approval.

---

## Capability readiness (without new API integrations)

| Flexa AI feature | Can reuse existing keys? | Notes |
|---|---|---|
| AI customer support | Yes | FlexaBot already; Flexa AI support endpoint shares Haiku |
| AI product descriptions | Yes | New Haiku prompt over title/category/attrs |
| AI translation | Yes | New helper + existing chat translation |
| AI Booster recommendations | Yes | Haiku over listing + optional stats |
| AI seller analytics | Yes | Narrative layer over SQL metrics (no invented numbers) |
| AI administrative assistance | Yes | Admin-only Haiku; Opus only if explicitly allowed |

---

## Implementation principles for Flexa AI

1. Reuse Anthropic Haiku first; Groq only as chat backup where already used.
2. Never send API keys to the browser.
3. Require auth; admin routes require admin.
4. Enforce per-user daily quotas and request size limits.
5. Feature-flag capabilities via `FLEXA_AI_CAPABILITIES`.
6. Preserve FlexaBot routes and prompts.
7. Do not activate paid upgrades or change billing without approval.
