import SiteWebView from "@/components/SiteWebView";
import React from "react";

export default function OffersScreen() {
  const uri = "https://flexamarket.com/offers";
  return <SiteWebView uri={uri} />;
}
