---
name: Flexa Stripe recharge fallback
description: Why FM-card recharges must not depend solely on the Stripe webhook
---
Rule: every Stripe checkout return path needs a client-triggered fallback activation. Web uses authed GET /api/stripe/checkout/session; mobile uses public GET /api/stripe/checkout/activate (no auth — safe because session_id is unguessable, credit is idempotent via the pending→completed wallet_transaction gate, and paid status comes from Stripe itself).

**Why:** the mobile stripe-checkout WebView intercepts and BLOCKS any flexamarket.com navigation (to close the sheet), so the success_url with session_id never loads and the web fallback never runs — if the webhook was delayed/misconfigured, users paid but the FM card was never credited.

**How to apply:** when adding any new Stripe checkout flow (boost, subscription, etc.), wire its completion into handleCheckoutCompleted idempotently and make sure the mobile close-on-redirect handler fires the activate call first. Mobile changes ship via EAS OTA update, not DO deploy.
