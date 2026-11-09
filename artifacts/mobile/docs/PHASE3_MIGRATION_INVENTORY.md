# Flexa Market — Phase 3 Native Migration Inventory

**PR:** #172 · **Branch:** `cursor/native-auth-globe-android-09ff`  
**Backend:** `https://flexamarket.com/api`  
**Machine-readable:** [`phase3-migration-inventory.json`](./phase3-migration-inventory.json)

## Verification

| Check | Result |
|---|---|
| Phase 1–2 intact | Login, Signup, AuthGlobe, Home, Search, Cart, Checkout |
| Phase 3A intact | Orders, Order detail, Favorites, Notifications list |
| Phase 3B intact | Wallet, Addresses, Edit Profile, Stripe, Language |
| Phase 3C | Flexa Chat inbox + thread + smart notification deep-links |
| eSIM | **DEFERRED** |
| WebView marketplace shell? | No — Expo Router entry |

## Snapshot counts (after Phase 3C)

| Status | Count |
|---|---|
| FULLY_NATIVE | 23 |
| PARTIALLY_NATIVE | 5 |
| PLACEHOLDER | 16 |
| MISSING | 33 |
| BLOCKED | 5 |
| **Total** | **82** |

## Phase 3C completed

- **Inbox / Flexa Chat** — `/inbox` conversation list, Buying/Selling filters, unread badges, socket + poll refresh
- **Chat thread** — `/chat/[id]` text + image send, typing indicators, long-press translate, Socket.IO realtime with HTTP polling fallback
- **Listing → Message** — creates/opens conversation via `POST /api/conversations`
- **Smart notifications** — push tap routing to `/chat/:id`, `/orders/:id`, `/wallet`
- Tab badge from `GET /api/conversations/unread-count`

## Still open (do not fake)

- Voice/video message composers
- Support tickets / FlexaBot
- Sell / upload listings
- Wallet top-up (BLOCKED) · eSIM (DEFERRED)

## Recommended Phase 3D (do not auto-start)

1. Sell + image upload + my listings  
2. Seller order ship/label actions  
3. Support center (reuse chat patterns)
