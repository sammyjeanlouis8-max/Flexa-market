# Haiti domestic delivery vs carrier POD photos

## Rule
External carrier Proof of Delivery photos (UPS, USPS, FedEx, DHL, and other supported carriers) **must not** be enabled for **domestic deliveries within Haiti**.

Eligibility uses:
1. Verified **destination country** (shipment destination → ship-to → listing country snapshot)
2. **Shipping service type** (`deliveryMethod` / carrier)

Never use: user GPS, IP address, or account country.

## Haiti domestic
- Confirmation mode: `haiti_pin`
- Preserve existing Flexa Market local delivery + customer PIN verification
- `carrierPodEligible = false`
- Carrier registration / AfterShip POD blocked

## Eligible international / company-carrier
- Confirmation mode: `carrier_tracking`
- Display authentic carrier POD photos **only when** an authorized integration returns them
- If none: show “Delivery photo unavailable.”

## Implementation
- `artifacts/api-server/src/lib/deliveryConfirmationPolicy.ts`
- Wired into order detail, shipment registration, tracking center
- UI: `OrderDetail.tsx` gates POD section on `carrierPodEligible`
