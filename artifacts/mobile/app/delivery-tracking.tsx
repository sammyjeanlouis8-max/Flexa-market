import SiteWebView from "@/components/SiteWebView";
import React from "react";
import { useLocalSearchParams } from "expo-router";

export default function DeliveryTrackingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const uri = id ? `https://flexamarket.com/delivery/${id}` : "https://flexamarket.com/delivery";
  return <SiteWebView uri={uri} />;
}
