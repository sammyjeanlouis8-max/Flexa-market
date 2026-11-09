import { NativePlaceholder } from "@/components/NativePlaceholder";
import React from "react";

export default function InboxTab() {
  return (
    <NativePlaceholder
      title="Inbox (native wave next)"
      detail="Messaging will be rebuilt with React Native components against the existing chat API. Voice notes remain supported in messaging; support chat stays text-only."
      showBack={false}
    />
  );
}
