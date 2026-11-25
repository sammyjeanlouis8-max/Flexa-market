import React from "react";
import { WholesaleSimplePage } from "@/components/wholesale/WholesaleSimplePage";

export default function Screen() {
  return (
    <WholesaleSimplePage
      title="Stock alerts"
      subtitle="Low-stock warnings for depot SKUs."
      empty="Nothing here yet — chat-only wholesale."
    />
  );
}
