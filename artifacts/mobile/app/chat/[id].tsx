import SiteWebView from "@/components/SiteWebView";
import React from "react";
import { useLocalSearchParams } from "expo-router";

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const uri = `https://flexamarket.com/chat/${id}`;
  return <SiteWebView uri={uri} />;
}
