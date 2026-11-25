import React from "react";
import { WholesaleSimplePage } from "@/components/wholesale/WholesaleSimplePage";

export default function Screen() {
  return (
    <WholesaleSimplePage
      title="Categories"
      subtitle="Browse wholesale by category — chat only."
      empty="Nothing here yet — chat-only wholesale."
    />
  );
}
