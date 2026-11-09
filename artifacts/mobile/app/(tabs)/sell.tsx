import { NativePlaceholder } from "@/components/NativePlaceholder";
import React from "react";

export default function SellTab() {
  return (
    <NativePlaceholder
      title="Sell (native wave next)"
      detail="Listing creation will use native forms, Android Photo Picker, and the existing /api/listings endpoints. No WebView shell."
      showBack={false}
    />
  );
}
