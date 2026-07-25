import SafeWebView from "@/components/SafeWebView";
import { useLocalSearchParams } from "expo-router";
import React from "react";

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <SafeWebView uri={`https://flexamarket.com/chat/${id}`} />;
}
