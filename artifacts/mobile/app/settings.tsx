import SiteWebView from "@/components/SiteWebView";
import React from "react";

export default function SettingsScreen() {
  const uri = "https://flexamarket.com/settings";
  return <SiteWebView uri={uri} />;
}
