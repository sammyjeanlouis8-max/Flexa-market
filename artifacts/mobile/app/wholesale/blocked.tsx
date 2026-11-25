import React from "react";
import { WholesaleSimplePage } from "@/components/wholesale/WholesaleSimplePage";

export default function Screen() {
  return (
    <WholesaleSimplePage
      title="Blocked sellers"
      subtitle="Wholesale sellers you blocked from chat."
      empty="Nothing here yet — chat-only wholesale."
    />
  );
}
