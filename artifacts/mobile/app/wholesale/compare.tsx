import React from "react";
import { WholesaleSimplePage } from "@/components/wholesale/WholesaleSimplePage";

export default function Screen() {
  return (
    <WholesaleSimplePage
      title="Compare listings"
      subtitle="Side-by-side wholesale quotes before you chat."
      empty="Nothing here yet — chat-only wholesale."
    />
  );
}
