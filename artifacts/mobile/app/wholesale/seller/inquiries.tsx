import React from "react";
import { WholesaleSimplePage } from "@/components/wholesale/WholesaleSimplePage";

export default function Screen() {
  return (
    <WholesaleSimplePage
      title="Inbound chats"
      subtitle="Quote requests on your warehouse stock."
      empty="Nothing here yet — chat-only wholesale."
    />
  );
}
