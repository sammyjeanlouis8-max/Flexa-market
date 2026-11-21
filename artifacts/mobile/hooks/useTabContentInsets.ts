/**
 * Bottom padding for scroll content inside the shared tab navigator.
 * Matches `(tabs)/_layout` content height + safe-area so the last card clears the bar.
 *
 * Inset is read once from react-native-safe-area-context (no hardcoded nav offsets).
 * Android edge-to-edge may briefly report 0 before WindowInsets settle — we also
 * consult initialWindowMetrics and keep a small floor so icons stay tappable.
 */
import { useMemo } from "react";
import { Platform } from "react-native";
import {
  initialWindowMetrics,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

const TAB_BAR_CONTENT_HEIGHT = 52;
const TAB_BAR_TOP_PAD = 6;
const SCROLL_EXTRA = 20;

/** Live bottom system inset — applied once on the shared tab bar. */
export function useBottomSafeInset(): number {
  const insets = useSafeAreaInsets();
  const fromMetrics = initialWindowMetrics?.insets.bottom ?? 0;
  const bottom = Math.max(insets.bottom, fromMetrics);
  // Floor only when the OS reports nothing under edge-to-edge (common race on
  // cold start). Prefer the real inset whenever it is available.
  if (Platform.OS === "android" && bottom < 8) {
    return Math.max(fromMetrics, 24);
  }
  return Math.max(bottom, 8);
}

export function useTabBarHeight(): number {
  const pad = useBottomSafeInset();
  return TAB_BAR_CONTENT_HEIGHT + TAB_BAR_TOP_PAD + pad;
}

export function useTabContentPaddingBottom(extra: number = SCROLL_EXTRA): number {
  const tabBarHeight = useTabBarHeight();
  return useMemo(() => tabBarHeight + extra, [tabBarHeight, extra]);
}

export { TAB_BAR_CONTENT_HEIGHT, TAB_BAR_TOP_PAD };
