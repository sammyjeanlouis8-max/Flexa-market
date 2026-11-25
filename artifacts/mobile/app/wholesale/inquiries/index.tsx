import React from "react";
import { WholesaleSimplePage } from "@/components/wholesale/WholesaleSimplePage";

export default function Screen() {
  return (
    <WholesaleSimplePage
      title="Chat inquiries"
      subtitle="Quote requests — no checkout. Deals close in chat."
      empty="Nothing here yet — chat-only wholesale."
    />
  );
}
