import React from "react";
import { WholesaleSimplePage } from "@/components/wholesale/WholesaleSimplePage";

export default function Screen() {
  return (
    <WholesaleSimplePage
      title="Reviews"
      subtitle="Feedback after depot pickup deals."
      empty="Nothing here yet — chat-only wholesale."
    />
  );
}
