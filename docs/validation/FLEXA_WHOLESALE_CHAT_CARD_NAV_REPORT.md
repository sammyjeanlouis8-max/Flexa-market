# Flexa Wholesale — Chat product card + back navigation

## Status
Deployed to production (DigitalOcean) via merges of PR #286 and #287.

## Commits
- `db3a615d` — Merge PR #286 (product card + back navigation)
- `2e6c49dc` — Merge PR #287 (Super Admin chat preview on own listings)

## Access
`WHOLESALE_PUBLIC_LAUNCH = false` — Super Admin only (unchanged).

## Validation (website live)
| Check | Result |
| --- | --- |
| Chat opens Market conversation from Wholesale product | Pass |
| Product card: image, name, price/currency, MOQ, View product | Pass |
| Card visible in history (buyer/seller thread) | Pass |
| No duplicate card on re-open Chat (`cardInserted: false`) | Pass |
| In-app Back returns to Wholesale product | Pass |
| Browser back restores Wholesale filters/context | Pass |
| Existing Market messaging still works | Pass (thread uses shared inbox) |

## Native (Android / iOS)
- Code shipped in the same PRs (`artifacts/mobile/app/chat/[id].tsx`, wholesale product chat + nav context).
- Native device E2E not run in this environment; EAS Android preview builds remain quota-limited until the Expo plan reset.
- Next store/build update will include the card renderer + back restore.

## API proof
- First `POST /api/wholesale/conversations` → `cardInserted: true`, `messageType: wholesale_card`
- Second call same product → `cardInserted: false` (dedupe via `clientMessageId`)
