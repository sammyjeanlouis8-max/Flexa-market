import React from "react";
import { WholesaleSimplePage } from "@/components/wholesale/WholesaleSimplePage";

export default function Screen() {
  return (
    <WholesaleSimplePage
      title="Admin · products"
      subtitle="Moderate wholesale listings."
      empty="Nothing here yet — chat-only wholesale."
    />
  );
}
