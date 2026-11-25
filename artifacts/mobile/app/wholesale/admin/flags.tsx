import React from "react";
import { WholesaleSimplePage } from "@/components/wholesale/WholesaleSimplePage";

export default function Screen() {
  return (
    <WholesaleSimplePage
      title="Admin · flagged listings"
      subtitle="Review reported wholesale products."
      empty="Nothing here yet — chat-only wholesale."
    />
  );
}
