import React from "react";
import { WholesaleSimplePage } from "@/components/wholesale/WholesaleSimplePage";

export default function Screen() {
  return (
    <WholesaleSimplePage
      title="Warehouses & depots"
      subtitle="Sellers stock a depot in their country. Chat to arrange pickup."
      empty="Nothing here yet — chat-only wholesale."
    />
  );
}
