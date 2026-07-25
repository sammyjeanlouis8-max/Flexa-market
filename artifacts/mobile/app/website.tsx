import SafeWebView from "@/components/SafeWebView";
import { useLocalSearchParams } from "expo-router";
import React from "react";

export default function WebsiteScreen() {
  const { url } = useLocalSearchParams<{ url: string }>();
  const uri = url ? decodeURIComponent(url) : "https://flexamarket.com";
  return <SafeWebView uri={uri} />;
}
