import React from "react";
import { WholesaleSimplePage } from "@/components/wholesale/WholesaleSimplePage";

export default function Screen() {
  return (
    <WholesaleSimplePage
      title="Admin · sellers"
      subtitle="Verified wholesale sellers."
      empty="Nothing here yet — chat-only wholesale."
    />
  );
}
