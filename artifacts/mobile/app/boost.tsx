import SafeWebView from "@/components/SafeWebView";
import React from "react";

export default function BoostScreen() {
  return (
    <SafeWebView
      uri="https://flexamarket.com/boost"
      iosRedirect={{
        icon: "🚀",
        title: "Boost Your Listing",
        body:
          "Boosting a listing is a digital promotion service. To purchase a boost, please visit our website where you can manage your boosts and billing.",
        buttonText: "Boost on Website",
        url: "https://flexamarket.com/boost",
        note: "Your active boosts are linked to your account and visible across all platforms.",
      }}
    />
  );
}
