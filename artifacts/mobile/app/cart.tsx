import SiteWebView from "@/components/SiteWebView";
import React from "react";

export default function CartScreen() {
  const uri = "https://flexamarket.com/cart";
  return <SiteWebView uri={uri} />;
}
