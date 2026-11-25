import React from "react";
import { WholesaleSimplePage } from "@/components/wholesale/WholesaleSimplePage";

export default function Screen() {
  return (
    <WholesaleSimplePage
      title="City wholesale"
      subtitle="Depots and bulk stock near this city."
      empty="Nothing here yet — chat-only wholesale."
    />
  );
}
