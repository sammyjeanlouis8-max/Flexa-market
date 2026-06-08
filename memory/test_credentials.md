# Flexa Market — Test Credentials

> **Source of truth for QA, App Review, and testing-agent flows.**
> Update this file whenever credentials change.

## 🍎 Apple App Store Reviewer Account
Provisioned automatically at backend boot via
`artifacts/api-server/src/lib/appleReviewerSeed.ts`. Password is rotated on
every deploy to match this file.

- **Email:** `apple.reviewer@flexamarket.com`
- **Password:** `FlexaReview2026!`
- **Country (auto-set):** Haiti
- **Pre-populated content:**
  - 3 active listings (Haiti iPhone, DR Honda, USA MacBook)
  - 1 active conversation with messages
- **Use this in App Store Connect → App Review Information → Sign-in Required.**

### How to provide to Apple
Paste the above email/password into the "Sign-in Required" fields in App
Store Connect. The account is verified, has listings, has at least one chat
thread, and is country=Haiti so the reviewer can access loan features that
are gated to Haiti / Dominican Republic.

## Admin / Super-admin
Provisioned via `artifacts/api-server/src/lib/superAdmins.ts` from the
`SUPER_ADMIN_EMAILS` env var. Ask the owner for the live credentials —
they are not stored in this repo.
