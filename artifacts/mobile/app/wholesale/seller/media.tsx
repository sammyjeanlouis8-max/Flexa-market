import React from "react";
import { WholesaleSimplePage } from "@/components/wholesale/WholesaleSimplePage";

export default function Screen() {
  return (
    <WholesaleSimplePage
      title="Media library"
      subtitle="Photos for depot listings."
      empty="Nothing here yet — chat-only wholesale."
    />
  );
}
