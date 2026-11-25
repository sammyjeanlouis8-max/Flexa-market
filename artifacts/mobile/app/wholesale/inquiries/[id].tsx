import React from "react";
import { WholesaleSimplePage } from "@/components/wholesale/WholesaleSimplePage";

export default function Screen() {
  return (
    <WholesaleSimplePage
      title="Inquiry"
      subtitle="Chat thread summary for a wholesale quote."
      empty="Nothing here yet — chat-only wholesale."
    />
  );
}
