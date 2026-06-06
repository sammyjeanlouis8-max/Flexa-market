import SafeWebView from "@/components/SafeWebView";
import React from "react";

export default function SubscriptionScreen() {
  return (
    <SafeWebView
      uri="https://flexamarket.com/subscription"
      iosRedirect={{
        icon: "👑",
        title: "Subscription Plans",
        body:
          "Choose Standard ($15/mo) or Premium ($30/mo). Tap below to view plans and subscribe — your plan will update automatically after payment.",
        buttonText: "View Plans & Subscribe",
        url: "https://flexamarket.com/subscription",
        note: "Your subscription is linked to your account and works across all platforms.",
      }}
    />
  );
}
