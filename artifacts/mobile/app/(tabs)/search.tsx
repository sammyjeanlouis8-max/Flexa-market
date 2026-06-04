import SiteWebView from "@/components/SiteWebView";
import React from "react";

const WEBSITE = "https://flexamarket.com/search";

export default function SearchTab() {
  return <SiteWebView uri={WEBSITE} />;
}
