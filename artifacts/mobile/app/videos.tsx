import SiteWebView from "@/components/SiteWebView";
import React from "react";

export default function VideosScreen() {
  const uri = "https://flexamarket.com/videos";
  return <SiteWebView uri={uri} />;
}
