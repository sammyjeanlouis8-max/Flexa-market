import SiteWebView from "@/components/SiteWebView";
import React from "react";

const WEBSITE = "https://flexamarket.com/profile";

export default function ProfileTab() {
  return <SiteWebView uri={WEBSITE} />;
}
