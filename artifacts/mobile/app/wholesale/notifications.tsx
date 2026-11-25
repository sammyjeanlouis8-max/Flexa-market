import React from "react";
import { WholesaleSimplePage } from "@/components/wholesale/WholesaleSimplePage";

export default function Screen() {
  return (
    <WholesaleSimplePage
      title="Wholesale alerts"
      subtitle="Chat and depot notifications."
      empty="Nothing here yet — chat-only wholesale."
    />
  );
}
