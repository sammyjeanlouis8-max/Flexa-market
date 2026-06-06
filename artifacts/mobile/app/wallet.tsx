import SafeWebView from "@/components/SafeWebView";
import React from "react";

export default function WalletScreen() {
  return (
    <SafeWebView
      uri="https://flexamarket.com/wallet"
      iosRedirect={{
        icon: "💳",
        title: "FM Wallet",
        body:
          "To add funds or manage your FM Wallet balance, please visit our website. Your balance is linked to your account and available on all platforms.",
        buttonText: "Manage Wallet on Website",
        url: "https://flexamarket.com/wallet",
        note: "Purchases made via the website are reflected instantly in your app.",
      }}
    />
  );
}
