import SiteWebView from "@/components/SiteWebView";
import React from "react";

export default function EditProfileScreen() {
  const uri = "https://flexamarket.com/settings";
  return <SiteWebView uri={uri} />;
}
