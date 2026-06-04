import SiteWebView from "@/components/SiteWebView";
import React from "react";

export default function MyListingsScreen() {
  const uri = "https://flexamarket.com/my-listings";
  return <SiteWebView uri={uri} />;
}
