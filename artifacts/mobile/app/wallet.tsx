import SiteWebView from "@/components/SiteWebView";
import React from "react";

export default function WalletScreen() {
  const uri = "https://flexamarket.com/wallet";
  return <SiteWebView uri={uri} />;
}
