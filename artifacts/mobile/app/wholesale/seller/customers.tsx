import React from "react";
import { WholesaleSimplePage } from "@/components/wholesale/WholesaleSimplePage";

export default function Screen() {
  return (
    <WholesaleSimplePage
      title="Customers"
      subtitle="People who opened chat on your depot listings."
      empty="Nothing here yet — chat-only wholesale."
    />
  );
}
