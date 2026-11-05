# FlexaBot Intelligent Support — Audit & Implementation Plan

**Branch:** `cursor/intelligent-support-chatbot-9bdb`  
**Constraint:** Reuse existing Anthropic Haiku / Groq credentials. No new paid AI vendor. No production deploy/data changes from this work alone.

## 1. Existing AI system identified

| Component | Location | Notes |
|---|---|---|
| FlexaBot UI | `artifacts/marketplace/src/pages/Chatbot.tsx` | Auth-gated, local history, escalate → `/support` |
| FlexaBot API | `artifacts/api-server/src/routes/chatbot.ts` | Anthropic Haiku preferred, Groq backup, soft fallback |
| Shared Flexa AI | `artifacts/api-server/src/lib/flexaAi.ts` | Reused from Flexa AI service work (same keys) |
| Usage quotas | `artifacts/api-server/src/lib/flexaAiUsage.ts` | Daily per-capability limits |
| Human support | `artifacts/api-server/src/routes/support.ts` | Threads + botHistory |

**Gaps before this upgrade:** no verified FAQ corpus, no authorized account data tools, no chatbot quota/audit, plain-text replies without deep links.

## 2. Architecture (RAG without unrestricted DB)

```
User message
  → auth + rate limit + quota
  → language detect (ht/en/fr/es/pt)
  → intent classify (rules)
  → read-only tools (owner-scoped DB queries OR public listing)
  → verified knowledge snippets (curated FAQ/policy)
  → LLM with strict system prompt (untrusted retrieved text)
  → response + suggested deep links + escalate hint
  → usage + audit log (no cross-account private cache)
```

LLM never receives raw SQL. Tools return minimized, permission-checked JSON.

## 3. Safe actions

Read-only only. No payments, refunds, cancellations, deletions, suspensions, publications, wallet transfers, or subscription changes via the bot.

## 4. Implementation checklist

1. Curated knowledge corpus from FAQ + Help/policy routes  
2. Owner-scoped tools: orders, deliveries, listings summary, boosts, wallet balance (no card PAN), subscription  
3. Rewrite `/chatbot/message` to inject verified context  
4. Rate limit + audit + quota  
5. UX: link chips, suggestions, escalation preserved  
6. Automated tests for languages, authz, injection, hallucination guardrails  
7. Final report (this doc § Final report)

## 5. Estimated operating costs

Same as existing FlexaBot: Anthropic Haiku (~$0.25–$1.25 / MTok class) or Groq free/paid tier already configured. No new vendor billing. Quotas default ~60 support turns/user/day.

---

## Final report

### 1. Existing AI system
Anthropic `claude-haiku-4-5` (primary) + Groq `llama-3.1-8b-instant` (backup), shared via `flexaAi.ts`.

### 2. Architecture changes
Verified RAG: curated knowledge + owner-scoped read-only tools → LLM with strict anti-hallucination system prompt. Read-only only.

### 3. Endpoints
- `GET /api/chatbot/status` — provider/status
- `POST /api/chatbot/message` — auth + rate limit (20/min) + daily support quota + tools/knowledge + audit

### 4. Files modified / added
- `artifacts/api-server/src/routes/chatbot.ts`
- `artifacts/api-server/src/lib/flexaAi.ts`, `flexaAiUsage.ts` (reused)
- `artifacts/api-server/src/lib/chatbotKnowledge.ts`, `chatbotTools.ts`, `chatbotIntent.ts`, `chatbotLanguage.ts`
- `artifacts/api-server/src/tests/chatbotSupport.test.ts`
- `artifacts/marketplace/src/pages/Chatbot.tsx`
- `docs/FLEXABOT_SUPPORT_AUDIT.md`, `docs/FLEXA_AI_*.md`

### 5. Migrations
- `flexa_ai_usage` table + indexes
- `flexabot_audit` table + indexes

### 6. Security
Auth required; owner-scoped order/delivery/wallet tools; prompt-injection sanitization; untrusted LIVE_DATA labeling; rate limit; daily quota; audit log; no write actions; sensitive field redaction.

### 7. Tests
`pnpm exec vitest run src/tests/chatbotSupport.test.ts` → **16 passed** (ht/fr/es/en, intents, knowledge, injection, authz contract, escalation).

### 8. Costs
No new paid vendor. Existing Haiku/Groq credentials only.

### 9. Remaining configuration
- Ensure `ANTHROPIC_API_KEY` or `AI_INTEGRATIONS_ANTHROPIC_*` (and optional `GROQ_API_KEY`) are set in the target environment.
- Optional: tune `FLEXA_AI_DAILY_SUPPORT_LIMIT`.
- Expand knowledge corpus with legal-approved policy excerpts as needed.
- Live DB integration tests for cross-account order denial (unit contract covered).
