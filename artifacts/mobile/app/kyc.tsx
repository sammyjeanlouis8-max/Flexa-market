import SiteWebView from "@/components/SiteWebView";
import React from "react";

export default function KycScreen() {
  const uri = "https://flexamarket.com/kyc";
  return <SiteWebView uri={uri} />;
}
