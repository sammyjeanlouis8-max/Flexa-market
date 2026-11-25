import React from "react";
import { WholesaleSimplePage } from "@/components/wholesale/WholesaleSimplePage";

export default function Screen() {
  return (
    <WholesaleSimplePage
      title="Admin · categories"
      subtitle="Manage wholesale category taxonomy."
      empty="Nothing here yet — chat-only wholesale."
    />
  );
}
