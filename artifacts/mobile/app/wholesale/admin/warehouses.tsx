import React from "react";
import { WholesaleSimplePage } from "@/components/wholesale/WholesaleSimplePage";

export default function Screen() {
  return (
    <WholesaleSimplePage
      title="Admin · depots"
      subtitle="Warehouse directory."
      empty="Nothing here yet — chat-only wholesale."
    />
  );
}
