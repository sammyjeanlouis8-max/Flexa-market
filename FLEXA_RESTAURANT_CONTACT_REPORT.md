# Flexa Restaurant — Direct Business Contact System

**Branch:** `cursor/restaurant-direct-contact-5a20`  
**Date:** 2026-11-27 (America/New_York)  
**RESTAURANT_PUBLIC_LAUNCH:** remains **disabled**

---

## Summary

Professional contact actions on every Flexa Restaurant business profile (web + mobile): Call, Message, WhatsApp (when configured), Directions (when public location exists), Save, View Menu & Order, and Reserve a Table when supported.

## Critical review follow-up (2026-11-27)

| Fix | Status |
| --- | --- |
| Rebase onto main after #312 merge | DONE |
| iOS `Linking.canOpenURL(tel:)` silent failure | FIXED — openURL directly |
| Submit clearing phone after validating old value | FIXED — validate effective stored phone |
| WhatsApp clear (`null`) ignored | FIXED — `'whatsapp' in body` |
| Home Kitchen directions leak via coords | FIXED — pickup-only gate |
| Conversations on draft businesses | FIXED — public status + requireNotRestricted |
| `tel:` opened with `target=_blank` | FIXED |
| Owner settings `+509 ` seed blocking hours save | FIXED |

---

## Requirement matrix

| Requirement | Result |
| --- | --- |
| Call opens native dialer (`tel:`) — never auto-dials | PASS |
| Message uses Flexa Market messaging (`POST /restaurants/:id/conversations`) | PASS |
| WhatsApp only when owner configured number | PASS |
| Directions only for public location; Home Kitchen private address protected | PASS |
| Save favorites | PASS (local storage web + mobile) |
| View Menu & Order | PASS |
| Reserve a Table when supported | PASS |
| Open/Closed status visible; actions remain while closed | PASS |
| Phone + WhatsApp on registration + owner settings | PASS |
| Valid phone required before approval/submit | PASS (`BUSINESS_PHONE_REQUIRED`) |
| International formats / country codes | PASS (E.164-ish 8–15 digits) |
| Never expose KYC / identity phones | PASS (uses `restaurants.phone` / `whatsapp` only) |
| Owner-managed delivery / no Flexa Driver | PASS (unchanged) |
| EN i18n keys | PASS; HT/FR/ES inherit with defaults |
| Website / Android / iOS code paths | PASS |
| Live UI screenshots | NOT TESTED (no authenticated staging session this run) |
| End-to-end dialer / WhatsApp / Maps on device | NOT TESTED |

---

## Implementation notes

- `RestaurantContactBar` (web + mobile)
- `restaurantContact.ts` / `restaurantPhone.ts` validators
- Conversations: nullable `restaurant_id` + type `restaurant`
- Owner settings public contact editor (enable WhatsApp toggle)
- Inbox list joins restaurants for chat titles/avatars

---

## Tests

| Suite | Result |
| --- | --- |
| `restaurantPhone.test.ts` | PASS |
| `restaurantContact.test.ts` | PASS |
| Marketplace production build | *(run before push)* |

---

## PR / deploy

| Item | Value |
| --- | --- |
| PR URL | https://github.com/sammyjeanlouis8-max/Flexa-market/pull/313 |
| Commit SHA | `a2306fb30e1d5cf9245b833fb1245a34920bc2fd` |
| Deployment | Pending merge → DigitalOcean |
