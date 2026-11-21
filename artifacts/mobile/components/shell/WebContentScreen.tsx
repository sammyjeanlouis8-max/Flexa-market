/**
 * Live website content inside the native shell (parity for screens that are
 * still web-first). Expo-web uses WebHybridFrame; Android/iOS use MarketplaceWebView.
 */
import React from "react";
import { Platform } from "react-native";
import MarketplaceWebView from "@/components/MarketplaceWebView";
import WebHybridFrame from "@/components/WebHybridFrame";

type Props = {
  path: string;
  /** Tab roots hide the native back chevron. */
  isTabRoot?: boolean;
};

export default function WebContentScreen({ path, isTabRoot = false }: Props) {
  if (Platform.OS === "web") {
    return <WebHybridFrame path={path} />;
  }
  return <MarketplaceWebView path={path} isTabRoot={isTabRoot} />;
}
