import React from "react";
import { WholesaleSimplePage } from "@/components/wholesale/WholesaleSimplePage";

export default function Screen() {
  return (
    <WholesaleSimplePage
      title="Search wholesale"
      subtitle="Find depot stock — chat only."
      empty="Nothing here yet — chat-only wholesale."
    />
  );
}
