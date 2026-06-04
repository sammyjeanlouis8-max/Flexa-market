import SiteWebView from "@/components/SiteWebView";
import React from "react";

const WEBSITE = "https://flexamarket.com/messages";

export default function InboxTab() {
  return <SiteWebView uri={WEBSITE} />;
}
