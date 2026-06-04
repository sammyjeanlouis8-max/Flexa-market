import SiteWebView from "@/components/SiteWebView";
import React from "react";

export default function LoginScreen() {
  const uri = "https://flexamarket.com/login";
  return <SiteWebView uri={uri} />;
}
