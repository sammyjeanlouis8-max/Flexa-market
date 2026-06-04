import SiteWebView from "@/components/SiteWebView";
import React from "react";

export default function FavoritesScreen() {
  const uri = "https://flexamarket.com/favorites";
  return <SiteWebView uri={uri} />;
}
