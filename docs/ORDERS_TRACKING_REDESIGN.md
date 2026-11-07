# Orders, Live Tracking & Delivery Confirmation Redesign

Customer-facing order management UI aligned to the three-screen Flexa Market reference (My Orders → Order Details → Delivery Confirmation).

## Scope

- Presentation-layer redesign only.
- Reuses existing authenticated order / delivery / carrier APIs.
- No duplicate delivery services, order tables, or tracking backends.
- English remains the default language; translations added for `en`, `fr`, `ht`, `es` under `orderTracking.*`.
- Brand: existing header green `hsl(152,65%,18%)` and official `flexa-logo-v2` via Layout (unchanged).

## Screens

| Screen | Route | Notes |
|--------|-------|--------|
| My Orders | `/orders` | Filters All / Processing / Shipped / Delivered; clickable cards |
| Order Details | `/orders/:id` | Vertical 5-stage timeline; Track live delivery when FM delivery exists |
| Delivery Confirmation | `/orders/:id/delivered` | Success card; Haiti PIN verified; Flexa driver proof photos when uploaded; carrier POD only when eligible |

## Delivery workflow rules (unchanged policy)

Policy lives in `artifacts/api-server/src/lib/deliveryConfirmationPolicy.ts`.

- Destination country + shipping service type only (never GPS / IP / account country).
- Domestic Haiti (`haiti_pin`): hand-to-hand + PIN; no external carrier POD photos.
- Flexa / company driver handoff photos (`pickupPhotoUrl` / `dropoffPhotoUrl`) are shown to the buyer on Order Details, Delivery Tracking, and Delivery Confirmation once uploaded — separate from carrier POD.
- Eligible international carriers: official POD when the carrier integration returns it; otherwise “Delivery photo unavailable.”
- Other local services keep their configured confirmation mode.

## Live tracking

- Button shown only when `fmDeliveryId` or a real carrier tracking number exists (`canShowLiveTrackButton`).
- FM deliveries → existing `/delivery/tracking/:id` (real GPS when authorized).
- Carrier shipments → official carrier track URL (no fake map / fake positions).

## Files

**New**

- `artifacts/marketplace/src/lib/orderTrackingUi.ts`
- `artifacts/marketplace/src/lib/orderTrackingUi.test.ts`
- `artifacts/marketplace/src/components/orders/OrderTimeline.tsx`
- `artifacts/marketplace/src/components/orders/OrderStatusBadge.tsx`
- `artifacts/marketplace/src/pages/OrderDelivered.tsx`
- `docs/ORDERS_TRACKING_REDESIGN.md`

**Updated**

- `artifacts/marketplace/src/pages/Orders.tsx`
- `artifacts/marketplace/src/pages/OrderDetail.tsx`
- `artifacts/marketplace/src/App.tsx`
- `artifacts/marketplace/src/i18n/locales/{en,fr,ht,es}.ts`

## Backend / migrations

None required for this redesign. Confirmation, PIN verification, carrier POD eligibility, and live GPS remain on existing APIs.

## Remaining API requirements

None blocking. Optional future: dedicated pagination on `/api/orders/purchases` if order volume grows.
