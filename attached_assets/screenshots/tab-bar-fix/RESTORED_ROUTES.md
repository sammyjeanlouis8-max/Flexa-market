# Bottom tab bar audit — restored routes

## Shared tab bar fix
- Applied `useSafeAreaInsets().bottom` once on `(tabs)/_layout` via `tabBarStyle.paddingBottom` + matching `height`.
- Set `safeAreaInsets: { bottom: 0 }` so React Navigation does not double-apply the inset.
- Tab content scroll padding uses `useTabContentPaddingBottom()` so the last cards clear the bar.

## Routes where the shared bottom bar was restored
(Moved under `app/(tabs)/` with `href: null` so marketplace flows keep Home / Search / Sell / Chat / Account.)

| Route | File |
|-------|------|
| `/cart` | `app/(tabs)/cart.tsx` |
| `/favorites` | `app/(tabs)/favorites.tsx` |
| `/orders` | `app/(tabs)/orders.tsx` |
| `/my-listings` | `app/(tabs)/my-listings.tsx` |
| `/sales` | `app/(tabs)/sales.tsx` |
| `/offers` | `app/(tabs)/offers.tsx` |
| `/wallet` | `app/(tabs)/wallet.tsx` |
| `/addresses` | `app/(tabs)/addresses.tsx` |
| `/notifications` | `app/(tabs)/notifications.tsx` |
| `/settings` | `app/(tabs)/settings.tsx` |
| `/support` | `app/(tabs)/support.tsx` |
| `/esim` | `app/(tabs)/esim.tsx` |

## Dedicated flows kept without the bottom bar
`/listing/[id]`, `/checkout`, `/checkout-success`, `/stripe-checkout`, `/chat/[id]`, `/orders/[id]`, `/support/[id]`, `/delivery-tracking`, `/auth/*`, `/edit-profile`, `/language-picker`, `/chatbot`

## Verification
- Gesture navigation: tab labels clear the gesture pill (Sell label bottom ≈1852; pill ≈1884–1892).
- Three-button navigation: labels sit above Back/Home/Recents with clear gap.
- Search: keyboard open and closed; tab buttons switch all five tabs; Back from checkout returns to a tab screen with the bar.
