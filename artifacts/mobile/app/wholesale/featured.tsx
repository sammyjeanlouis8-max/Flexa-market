import React from "react";
import { WholesaleSimplePage } from "@/components/wholesale/WholesaleSimplePage";

export default function Screen() {
  return (
    <WholesaleSimplePage
      title="Featured wholesale"
      subtitle="Highlighted depot stock — chat to buy."
      empty="Nothing here yet — chat-only wholesale."
    />
  );
}
