import SiteWebView from "@/components/SiteWebView";
import React from "react";
import { useLocalSearchParams } from "expo-router";

export default function OrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const uri = `https://flexamarket.com/orders/${id}`;
  return <SiteWebView uri={uri} />;
}
