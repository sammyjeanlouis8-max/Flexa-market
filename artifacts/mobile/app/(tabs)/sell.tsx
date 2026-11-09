import { SellForm } from "@/components/SellForm";
import React from "react";

/**
 * Native Sell tab — product creation with Android Photo Picker.
 * No WebView. Reuses existing /api/listings + Wasabi upload routes.
 */
export default function SellTab() {
  return <SellForm mode="create" />;
}
