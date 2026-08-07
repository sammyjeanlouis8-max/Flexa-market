import SafeWebView from "@/components/SafeWebView";
import React from "react";

export default function InboxTab() {
  return <SafeWebView uri="https://flexamarket.com/messages" showBack={false} />;
}
