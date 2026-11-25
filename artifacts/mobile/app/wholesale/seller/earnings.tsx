import React from "react";
import { WholesaleSimplePage } from "@/components/wholesale/WholesaleSimplePage";

export default function Screen() {
  return (
    <WholesaleSimplePage
      title="Earnings"
      subtitle="Recorded from closed chat deals (no cart checkout)."
      empty="Nothing here yet — chat-only wholesale."
    />
  );
}
