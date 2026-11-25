import React from "react";
import { WholesaleSimplePage } from "@/components/wholesale/WholesaleSimplePage";

export default function Screen() {
  return (
    <WholesaleSimplePage
      title="Country wholesale"
      subtitle="Vendors with depots in this country."
      empty="Nothing here yet — chat-only wholesale."
    />
  );
}
