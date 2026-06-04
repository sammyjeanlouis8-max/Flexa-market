import SiteWebView from "@/components/SiteWebView";
import React from "react";

export default function LoansScreen() {
  const uri = "https://flexamarket.com/loans";
  return <SiteWebView uri={uri} />;
}
