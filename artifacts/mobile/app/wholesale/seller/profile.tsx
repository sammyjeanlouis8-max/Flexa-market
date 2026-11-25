import React from "react";
import { WholesaleSimplePage } from "@/components/wholesale/WholesaleSimplePage";

export default function Screen() {
  return (
    <WholesaleSimplePage
      title="Public seller profile"
      subtitle="What buyers see before chatting."
      empty="Nothing here yet — chat-only wholesale."
    />
  );
}
