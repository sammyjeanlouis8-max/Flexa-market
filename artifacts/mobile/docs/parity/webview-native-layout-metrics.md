# WebView ↔ Native layout parity (Home + PDP)

Measured 2026-11-14 from live `flexamarket.com` (Chrome mobile UA) and native
`com.flexamarket.app` release APK on emulator. **No AAB** — waiting for review.

## WebView measurements

| Surface | Normal 390×844 | Small 360×640 |
|---|---:|---:|
| Header row (excl. safe-area) | 56 | 56 |
| Header total (with `--sat` 20) | 77 | 77 |
| Bottom nav row | 56 | 56 |
| Bottom nav + `--flexa-android-bottom` 32 | 89 | 89 |
| Home grid inset | 12 | 12 |
| Home grid gap | 10 | 10 |
| `.listing-card-media` | **169×169** cover 1:1 | **154×154** cover 1:1 |
| Info padding | 10 | 10 |
| PDP thumb | 44×44 | 44×44 |
| PDP main | **305×305** contain | **275×275** contain |
| Purchase bar | 61 (pad 8, gap 6, btn 44) | 61 |
| Gallery below header | yes (after breadcrumbs) | yes |
| Fullscreen dialog | `object-contain`, full photo | same |

## Native mapping (`constants/layoutMetrics.ts`)

- Home media: **always square** `homeImageHeight(w) = homeCardWidth(w)` + `cover`
  (no short-viewport crop — WebView scrolls instead).
- PDP: `pdpMainSize` = min(width−thumbRail, min(52vh, 380)); `contain`.
- Gallery `paddingTop: 12` under `AppHeader` so the green bar never covers the photo top.
- Fullscreen `Modal`: black stage, `contentFit: "contain"`, close / prev / next.
- Tab bar: 56 + `max(safeAreaBottom, 24)` so **Messages** clears the gesture bar.
- Purchase bar: qty + yellow Add to Cart + orange Buy Now (h 44).

## Emulator verification

| Check | Normal 1080×1920 | Small 720×1280 |
|---|---|---|
| Home 2-col square photos | Pass | Pass |
| Messages above gesture bar | Pass (label y≈1814 on 1920) | Pass |
| PDP gallery below green bar | Pass (main top ≈207, header ≈165) | Pass |
| Add to Cart / Buy Now visible | Pass (became “In cart”) | Pass |
| Fullscreen entire photo | Pass (black stage + contain) | Partial* |

\*Small fullscreen a11y tap flaky when first media is promo video; maximize works after selecting a still photo.

## Remaining deltas (for review)

1. Web PDP chrome includes search + “Deliver to …” under the green bar; native uses compact 48dp toolbar + status — gallery still fully below native green bar.
2. Web Featured cards can show Add to Cart / category chips; native cards stay title / price / location / stock (density match, not every badge).
3. Web scrollbar can shrink content width (~375 vs 390); native uses full window width so main can be slightly larger at the same CSS width formula.
4. Awaiting approval before generating AAB.
