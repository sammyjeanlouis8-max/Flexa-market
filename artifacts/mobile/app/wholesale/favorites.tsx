import React from "react";
import { WholesaleSimplePage } from "@/components/wholesale/WholesaleSimplePage";

export default function Screen() {
  return (
    <WholesaleSimplePage
      title="Saved wholesale"
      subtitle="Products you saved to chat about later."
      empty="Nothing here yet — chat-only wholesale."
    />
  );
}
