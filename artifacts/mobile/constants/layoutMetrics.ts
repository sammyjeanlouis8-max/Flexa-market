/**
 * Layout metrics measured from live flexamarket.com (mobile Chrome / WebView)
 * on 2026-11-14. Native layouts use the same proportions at the same useful
 * viewport size — do not shrink photos just to force 2×2 above the tab bar;
 * the WebView scrolls instead.
 *
 * HOME (.home-product-grid) @390×844:
 * - page horizontal inset = 12
 * - grid gap = 10
 * - listing-card-media: aspect-ratio 1/1, object-fit cover → 169×169
 * - listing-card-info padding = 10
 * - card border-radius ≈ 12–20 (rounded-xl)
 * - mobile-app-header-row = 56 (+ safe-area top)
 * - mobile-bottom-nav-row = 56 (+ safe-area / --flexa-android-bottom)
 *
 * HOME @360×640 (small): media 154×154 square cover (same rules)
 *
 * PDP gallery @390×844:
 * - thumb 44×44, left inset 8, vertical gap 6, gap thumb→main 10
 * - main aspect-square, object-fit contain, max-h min(52vh, 380) → 305×305
 * - gallery sits below sticky green header (breadcrumbs may sit between)
 * - .fm-pdp-purchase-bar height 61, pad 8×10, gap 6; buttons h-11 (44)
 * - fullscreen dialog: object-contain, full photo visible
 *
 * PDP @360×640: main 275×275 contain; bar still 61
 */
export const WEB_VIEWPORT = { width: 390, height: 844 } as const;
export const WEB_VIEWPORT_SMALL = { width: 360, height: 640 } as const;

export const HOME_METRICS = {
  pageInset: 12,
  columnGap: 10,
  imageAspect: 1, // square — always match WebView at equal width
  objectFit: "cover" as const,
  /** Measured media edge at 390 CSS px */
  mediaAt390: 169,
  /** Measured media edge at 360 CSS px */
  mediaAt360: 154,
  infoPadding: 10,
  cardRadius: 12,
  rowGap: 10,
  bottomBarRow: 56,
  /** Web often injects --flexa-android-bottom ≈ 32 under gesture nav */
  bottomBarGestureFloor: 24,
  headerRow: 56,
};

export const PDP_METRICS = {
  thumbSize: 44,
  thumbGap: 6,
  thumbLeft: 8,
  gapThumbToMain: 10,
  mainRightInset: 8,
  mainAspect: 1,
  mainMaxVh: 0.52,
  mainMaxPx: 380,
  objectFit: "contain" as const,
  /** Gallery top padding under green bar (web uses pt-3 ≈ 12) */
  galleryPadTop: 12,
  purchaseBarPaddingV: 8,
  purchaseBarPaddingH: 10,
  purchaseBarGap: 6,
  purchaseBtnHeight: 44,
  purchaseBarApprox: 61,
};

/** Home card width for a given window width (2-col grid). */
export function homeCardWidth(windowWidth: number): number {
  const { pageInset, columnGap } = HOME_METRICS;
  return (windowWidth - pageInset * 2 - columnGap) / 2;
}

/**
 * Home photo frame height — always square like WebView `.listing-card-media`.
 * Same useful width ⇒ same media size (169 @390, 154 @360).
 */
export function homeImageHeight(windowWidth: number): number {
  const cardW = homeCardWidth(windowWidth);
  return Math.round(cardW * HOME_METRICS.imageAspect);
}

/** PDP main gallery box size for a given window (matches web max-h + aspect). */
export function pdpMainSize(windowWidth: number, windowHeight: number): number {
  const {
    thumbSize,
    thumbLeft,
    gapThumbToMain,
    mainRightInset,
    mainMaxVh,
    mainMaxPx,
  } = PDP_METRICS;
  const fromWidth =
    windowWidth - thumbLeft - thumbSize - gapThumbToMain - mainRightInset;
  // Web: max-h-[min(52vh,380px)] with aspect-square → limited by both.
  const fromHeight = Math.min(windowHeight * mainMaxVh, mainMaxPx);
  return Math.max(180, Math.min(fromWidth, fromHeight));
}

/** Bottom tab bar total height including gesture / safe-area floor. */
export function bottomTabBarHeight(safeBottom: number): number {
  const inset = Math.max(safeBottom, HOME_METRICS.bottomBarGestureFloor);
  return HOME_METRICS.bottomBarRow + inset;
}
