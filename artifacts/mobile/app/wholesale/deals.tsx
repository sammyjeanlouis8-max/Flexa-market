import React from "react";
import { WholesaleSimplePage } from "@/components/wholesale/WholesaleSimplePage";

export default function Screen() {
  return (
    <WholesaleSimplePage
      title="Closed deals"
      subtitle="Chat deals confirmed with depot pickup."
      empty="Nothing here yet — chat-only wholesale."
    />
  );
}
