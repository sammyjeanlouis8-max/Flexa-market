import SafeWebView from "@/components/SafeWebView";
    import React from "react";

    export default function WalletScreen() {
    // Show the real Flexa Wallet on all platforms (iOS + Android)
    return <SafeWebView uri="https://flexamarket.com/wallet" showBack={false} />;
    }
    