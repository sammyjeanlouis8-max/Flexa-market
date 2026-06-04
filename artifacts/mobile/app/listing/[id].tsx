import SiteWebView from "@/components/SiteWebView";
import React from "react";
import { useLocalSearchParams } from "expo-router";

export default function ListingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const uri = `https://flexamarket.com/listing/${id}`;
  return <SiteWebView uri={uri} />;
}
