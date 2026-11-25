import React from "react";
import { WholesaleSimplePage } from "@/components/wholesale/WholesaleSimplePage";

export default function Screen() {
  return (
    <WholesaleSimplePage
      title="Archived listings"
      subtitle="Hidden from catalog · chat history kept."
      empty="Nothing here yet — chat-only wholesale."
    />
  );
}
