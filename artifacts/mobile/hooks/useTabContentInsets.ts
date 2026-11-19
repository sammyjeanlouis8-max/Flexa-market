/**
 * Bottom padding for scroll content inside the shared tab navigator.
 * Matches `(tabs)/_layout` content height + safe-area so the last card clears the bar.
 */
import { useMemo } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const TAB_BAR_CONTENT_HEIGHT = 52;
const TAB_BAR_TOP_PAD = 6;
const SCROLL_EXTRA = 20;

export function useTabBarHeight(): number {
  const insets = useSafeAreaInsets();
  const pad = Math.max(insets.bottom, 8);
  return TAB_BAR_CONTENT_HEIGHT + TAB_BAR_TOP_PAD + pad;
}

export function useTabContentPaddingBottom(extra: number = SCROLL_EXTRA): number {
  const tabBarHeight = useTabBarHeight();
  return useMemo(() => tabBarHeight + extra, [tabBarHeight, extra]);
}
