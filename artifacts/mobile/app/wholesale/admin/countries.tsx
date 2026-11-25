import React from "react";
import { WholesaleSimplePage } from "@/components/wholesale/WholesaleSimplePage";

export default function Screen() {
  return (
    <WholesaleSimplePage
      title="Admin · countries"
      subtitle="Countries enabled for depot selling."
      empty="Nothing here yet — chat-only wholesale."
    />
  );
}
