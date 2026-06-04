import SiteWebView from "@/components/SiteWebView";
import React from "react";
import { useLocalSearchParams } from "expo-router";

export default function WebsiteScreen() {
  const { url } = useLocalSearchParams<{ url: string }>();
  const uri = url ? decodeURIComponent(url) : "https://flexamarket.com";
  return <SiteWebView uri={uri} />;
}
