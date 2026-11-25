import React from "react";
import { WholesaleSimplePage } from "@/components/wholesale/WholesaleSimplePage";

export default function Screen() {
  return (
    <WholesaleSimplePage
      title="Documents"
      subtitle="Invoices & depot papers for chat deals."
      empty="Nothing here yet — chat-only wholesale."
    />
  );
}
