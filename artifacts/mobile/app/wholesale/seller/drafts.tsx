import React from "react";
import { WholesaleSimplePage } from "@/components/wholesale/WholesaleSimplePage";

export default function Screen() {
  return (
    <WholesaleSimplePage
      title="Draft listings"
      subtitle="Unpublished wholesale drafts."
      empty="Nothing here yet — chat-only wholesale."
    />
  );
}
