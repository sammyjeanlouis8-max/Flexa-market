import React from "react";
import { WholesaleSimplePage } from "@/components/wholesale/WholesaleSimplePage";

export default function Screen() {
  return (
    <WholesaleSimplePage
      title="Seller verification"
      subtitle="Verify company + depot to sell wholesale."
      empty="Nothing here yet — chat-only wholesale."
    />
  );
}
