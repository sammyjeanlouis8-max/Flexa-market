import React from "react";
import { WholesaleSimplePage } from "@/components/wholesale/WholesaleSimplePage";

export default function Screen() {
  return (
    <WholesaleSimplePage
      title="Depot inventory"
      subtitle="Stock by warehouse — chat buyers see live qty."
      empty="Nothing here yet — chat-only wholesale."
    />
  );
}
