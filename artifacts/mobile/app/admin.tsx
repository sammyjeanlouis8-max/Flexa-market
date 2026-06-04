import SiteWebView from "@/components/SiteWebView";
import React from "react";

export default function AdminScreen() {
  const uri = "https://flexamarket.com/admin";
  return <SiteWebView uri={uri} />;
}
