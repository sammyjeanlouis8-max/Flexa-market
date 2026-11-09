import NativePlaceholder from "@/components/NativePlaceholder";
import React from "react";

/** Sell flow migration is next; keep native (no WebView) meanwhile. */
export default function SellTab() {
  return (
    <NativePlaceholder
      title="Sell on Flexa Market"
      subtitle="Native listing creation (photos, videos, pricing, and categories) is next in the migration. Your seller tools stay available on flexamarket.com until this screen ships."
      showBack={false}
    />
  );
}
