import React from "react";
import { WholesaleSimplePage } from "@/components/wholesale/WholesaleSimplePage";

export default function Screen() {
  return (
    <WholesaleSimplePage
      title="Depot map"
      subtitle="Warehouses by country — tap to chat seller."
      empty="Nothing here yet — chat-only wholesale."
    />
  );
}
