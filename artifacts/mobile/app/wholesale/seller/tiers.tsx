import React from "react";
import { WholesaleSimplePage } from "@/components/wholesale/WholesaleSimplePage";

export default function Screen() {
  return (
    <WholesaleSimplePage
      title="Price tiers editor"
      subtitle="Volume pricing for chat quotes."
      empty="Nothing here yet — chat-only wholesale."
    />
  );
}
