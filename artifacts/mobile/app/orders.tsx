import SiteWebView from "@/components/SiteWebView";
import React from "react";

export default function OrdersScreen() {
  const uri = "https://flexamarket.com/orders";
  return <SiteWebView uri={uri} />;
}
