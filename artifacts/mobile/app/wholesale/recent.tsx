import React from "react";
import { WholesaleSimplePage } from "@/components/wholesale/WholesaleSimplePage";

export default function Screen() {
  return (
    <WholesaleSimplePage
      title="Recently viewed"
      subtitle="Bulk listings you opened."
      empty="Nothing here yet — chat-only wholesale."
    />
  );
}
