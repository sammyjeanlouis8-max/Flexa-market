# Flexa Restaurant — Merchant-Managed Delivery

**Branch:** `cursor/restaurant-merchant-delivery-5a20`  
**Public launch gate:** `RESTAURANT_PUBLIC_LAUNCH=true` (visible to everyone; already on `main` via #321)  
**Flexa Delivery for food:** gated by `RESTAURANT_FLEXA_DELIVERY_ENABLED` (default off)

## Summary

Restaurants, Food Trucks, and Home Kitchens can fulfill orders with their own delivery personnel. Merchant delivery does **not** create Flexa Driver assignments or driver payouts. Haiti customer confirmation PIN is required to complete delivery.

## Delivery methods

| Method | Merchant toggle | Customer label |
|--------|-----------------|----------------|
| Customer Pickup | `pickupAvailable` | Customer Pickup |
| Merchant Delivery | `merchantDeliveryEnabled` | Delivered by Restaurant |
| Flexa Delivery | `flexaDeliveryEnabled` + env gate | Delivered by Flexa |

Customers only see methods that are enabled and not suspended for the selected restaurant.

## Merchant settings

Configurable via Owner Settings (web + mobile):

- Fixed vs distance-based fees (`feeMode`, `feePerKm`)
- Delivery radius (km) and zone labels (address match; polygon map when tiles configured)
- Minimum order, free-delivery threshold, ETA, prep minutes
- Delivery operating hours + temporary suspension
- Delivery personnel (no Flexa Driver registration)

## Order operations

Authorized owners/employees can: accept → prepare → ready → out for delivery → assign staff → confirm with PIN → complete. Failed delivery attempts are recorded. Completing merchant/flexa delivery without PIN returns `PIN_REQUIRED`. Duplicate PIN confirmation is blocked.

## Financial separation

- `merchant_delivery_fee_minor` vs `flexa_delivery_fee_minor` on orders
- Checkout shows merchant fee and `$0` Flexa driver fee for merchant delivery
- Marketplace commission follows existing Super Admin config (restaurant launch remains zero-commission unless configured)

## Security

- Server-side method eligibility, radius/zone/fee validation on order create + `/delivery-quote`
- Status transition checks + PIN gate for delivery completion
- Audit via order status history + failed-delivery notes
- `assignFlexaDriver` / `driverId` rejected on restaurant orders

## Tests

| Suite | Result |
|-------|--------|
| `restaurantDelivery.test.ts` | pass |
| All `src/tests/restaurant*` (api-server) | 39 pass |
| Marketplace production build | pass |

## Deployment

Staging validation and DigitalOcean deploy require merge to `main` after CI green. This PR keeps the restaurant public launch flag false until an authorized release.

## Artifacts

Local UI walkthrough screenshots (public launch remains gated):

- `md_01_checkout_methods.png` — Customer Pickup / Delivered by Restaurant + fee split
- `md_02_owner_delivery_settings.png` — method toggles, distance fees, radius, zones, staff
- `md_03_owner_orders_pin.png` — assign courier + PIN confirm + failed attempt
- `md_04_customer_tracking_pin.png` — method label, ETA, PIN, restaurant contact

## Deployment status

- Merging #315 to `main` triggers `.github/workflows/deploy.yml` → DigitalOcean App Platform.
- Restaurant module is publicly visible (`RESTAURANT_PUBLIC_LAUNCH=true`).
