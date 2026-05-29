---
name: Flexa Market email/SMS/payments config
description: How OTP login, SMS, and payments are wired in the api-server and what credentials they need.
---

- **Login = email OTP via Resend.** `artifacts/api-server/src/lib/email.ts` reads `RESEND_API_KEY` directly from env (no connector). OTP routes in `src/routes/phone-otp.ts` (`POST /api/otp/send`, `/api/otp/verify`). Replit secrets are global → one secret covers dev + prod.
- **SMS is intentionally disabled.** `src/lib/twilio.ts` is a stub: `sendSms` always returns false ("use email instead"). Do NOT set up Twilio for this project unless explicitly asked to re-enable SMS.
- **Resend sender caveat:** default `onboarding@resend.dev` only delivers to the Resend account owner's own address. For real users you must verify a domain at resend.com/domains, then set `RESEND_FROM_EMAIL` + `RESEND_DOMAIN_VERIFIED=1`. Resend's `delivered@resend.dev` is a test address that always succeeds (useful for verifying the key works).
- **Stripe** (`src/lib/stripeClient.ts`) prefers direct env vars (`STRIPE_SECRET_KEY`/`STRIPE_PUBLISHABLE_KEY`/`STRIPE_WEBHOOK_SECRET`) but falls back to the Replit Stripe connector — so it can be enabled with zero code changes by connecting the connector.
