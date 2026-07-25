import SafeWebView from "@/components/SafeWebView";
import { useLocalSearchParams } from "expo-router";
import React from "react";

export default function ListingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <SafeWebView uri={`https://flexamarket.com/listing/${id}`} />;
}
