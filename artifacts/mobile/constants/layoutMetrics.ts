/**
 * Layout metrics measured from live flexamarket.com WebView at 390×844 CSS px
 * (iPhone-like). Native layouts scale from these proportions.
 *
 * HOME (Featured / Today's Picks grid) — remeasured 2026-11-13:
 * - page horizontal inset ≈ 13
 * - column gap ≈ 12
 * - listing-card-media: aspect-square 1:1, object-fit: cover
 * - media size @390: 176×176; card width ≈ 178; full web card ≈ 349 tall
 * - bottom tab bar ≈ 57
 *
 * PDP gallery — remeasured 2026-11-13:
 * - thumb: 44×44, left inset 8, vertical gap 6
 * - gap thumb → main: 10
 * - main: aspect-square, object-fit: contain → 320×320 @390
 * - purchase bar (.fm-pdp-purchase-bar): height 61, pad 8×10, gap 6
 * - qty ≈ 98×44; Add to Cart ≈ 125×44; Buy Now ≈ 135×44
 */
export const WEB_VIEWPORT = { width: 390, height: 844 } as const;

export const HOME_METRICS = {
  pageInset: 13,
  columnGap: 12,
  imageAspect: 1, // square
  // Match WebView listing-card-media: square frame + object-fit cover.
  objectFit: "cover" as const,
  /** Measured media edge at 390 CSS px */
  mediaAt390: 176,
  /** Compact native meta under the photo (title/price/loc/stock) */
  metaApprox: 58,
  rowGap: 8,
  bottomBar: 57,
  /** Chrome above the 2×2 grid: header + country/search + section title */
  chromeAboveGrid: 160,
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
 * Home photo frame height. Prefer the measured square proportion; on short
 * viewports shrink just enough so two full rows sit above the tab bar.
 */
export function homeImageHeight(
  windowWidth: number,
  windowHeight: number,
  tabBarHeight = HOME_METRICS.bottomBar,
): number {
  const cardW = homeCardWidth(windowWidth);
  const square = Math.round(cardW * HOME_METRICS.imageAspect);
  const available =
    windowHeight -
    HOME_METRICS.chromeAboveGrid -
    tabBarHeight -
    HOME_METRICS.rowGap;
  const maxForTwoRows = Math.floor(
    (available - 2 * HOME_METRICS.metaApprox) / 2,
  );
  // Prefer square (WebView). On short phones shrink so two full rows clear
  // the tab bar — still well above the old ~0.48 crop (~57dp on this width).
  const minReadable = Math.round(square * 0.55);
  if (!Number.isFinite(maxForTwoRows) || maxForTwoRows <= 0) {
    return square;
  }
  return Math.min(square, Math.max(minReadable, maxForTwoRows));
}

/** PDP main gallery box size for a given window. */
export function pdpMainSize(windowWidth: number, windowHeight: number): number {
  const {
    thumbSize,
    thumbLeft,
    gapThumbToMain,
    mainRightInset,
    mainMaxVh,
    mainMaxPx,
    purchaseBarApprox,
  } = PDP_METRICS;
  const fromWidth =
    windowWidth - thumbLeft - thumbSize - gapThumbToMain - mainRightInset;
  // Reserve header + title/price/delivery block + purchase bar so content
  // isn't covered by the sticky bar on first paint.
  const reservedChrome = 72 + 140 + purchaseBarApprox;
  const fromHeight = Math.min(
    windowHeight * mainMaxVh,
    mainMaxPx,
    Math.max(180, windowHeight - reservedChrome),
  );
  return Math.max(180, Math.min(fromWidth, fromHeight));
}
