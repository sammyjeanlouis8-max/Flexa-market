# Flexa AI / FlexaBot environment variables

Server-side only. Never expose these to the browser or commit values.

## Existing credentials (reuse — do not create new vendor accounts)

| Variable | Required for | Notes |
|---|---|---|
| `AI_INTEGRATIONS_ANTHROPIC_BASE_URL` | Anthropic via managed proxy | Used by FlexaBot, translation, Flexa AI |
| `AI_INTEGRATIONS_ANTHROPIC_API_KEY` | Anthropic | Primary key |
| `ANTHROPIC_API_KEY` | Anthropic (alternate) | Accepted by shared client as fallback |
| `GROQ_API_KEY` | Optional FlexaBot backup | `llama-3.1-8b-instant` |
| `AI_INTEGRATIONS_OPENAI_BASE_URL` | Listing moderation | Must pair with OpenAI key |
| `AI_INTEGRATIONS_OPENAI_API_KEY` | Listing moderation | |

## Flexa AI controls (no billing activation)

| Variable | Default | Purpose |
|---|---|---|
| `FLEXA_AI_ENABLED` | `1` | Master switch |
| `FLEXA_AI_CAPABILITIES` | `support,descriptions,translation,boost,analytics,admin` | Comma list |
| `FLEXA_AI_ALLOW_OPUS` | `0` | Keep Opus off unless explicitly approved |
| `FLEXA_AI_DAILY_SUPPORT_LIMIT` | `60` | Per-user / day |
| `FLEXA_AI_DAILY_DESCRIPTIONS_LIMIT` | `40` | Per-user / day |
| `FLEXA_AI_DAILY_TRANSLATION_LIMIT` | `80` | Per-user / day |
| `FLEXA_AI_DAILY_BOOST_LIMIT` | `30` | Per-user / day |
| `FLEXA_AI_DAILY_ANALYTICS_LIMIT` | `30` | Per-user / day |
| `FLEXA_AI_DAILY_ADMIN_LIMIT` | `80` | Per-admin / day |

Do not raise spend caps or enable Opus in production without approval.
