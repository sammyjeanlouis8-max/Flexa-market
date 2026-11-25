import React from "react";
import { WholesaleSimplePage } from "@/components/wholesale/WholesaleSimplePage";

export default function Screen() {
  return (
    <WholesaleSimplePage
      title="Analytics"
      subtitle="Views, chats, closed deals — no cart metrics."
      empty="Nothing here yet — chat-only wholesale."
    />
  );
}
