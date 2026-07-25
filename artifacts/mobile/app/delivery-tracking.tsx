import SafeWebView from "@/components/SafeWebView";
import { useLocalSearchParams } from "expo-router";
import React from "react";

export default function DeliveryTrackingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const uri = id
    ? `https://flexamarket.com/delivery/${id}`
    : "https://flexamarket.com/delivery";
  return <SafeWebView uri={uri} />;
}
