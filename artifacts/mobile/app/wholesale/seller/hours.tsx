import React from "react";
import { WholesaleSimplePage } from "@/components/wholesale/WholesaleSimplePage";

export default function Screen() {
  return (
    <WholesaleSimplePage
      title="Depot hours"
      subtitle="When buyers can pickup after chat."
      empty="Nothing here yet — chat-only wholesale."
    />
  );
}
