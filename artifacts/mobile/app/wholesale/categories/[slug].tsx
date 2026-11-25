import React from "react";
import { WholesaleSimplePage } from "@/components/wholesale/WholesaleSimplePage";

export default function Screen() {
  return (
    <WholesaleSimplePage
      title="Category"
      subtitle="Bulk lots in this category."
      empty="Nothing here yet — chat-only wholesale."
    />
  );
}
