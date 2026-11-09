import NativePlaceholder from "@/components/NativePlaceholder";
import React from "react";

/** Messaging migration is queued; keep native (no WebView) meanwhile. */
export default function InboxTab() {
  return (
    <NativePlaceholder
      title="Messages"
      subtitle="Native chat is coming next. Buyer–seller messaging remains on the website until this inbox is rebuilt in React Native."
      showBack={false}
    />
  );
}
