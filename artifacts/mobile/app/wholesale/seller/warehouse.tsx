import React from "react";
import { WholesaleSimplePage } from "@/components/wholesale/WholesaleSimplePage";

export default function Screen() {
  return (
    <WholesaleSimplePage
      title="My warehouse"
      subtitle="Buyers see this depot on your wholesale listings."
      empty="Nothing here yet — chat-only wholesale."
    />
  );
}
