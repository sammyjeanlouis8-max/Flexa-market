import React from "react";
import { WholesaleSimplePage } from "@/components/wholesale/WholesaleSimplePage";

export default function Screen() {
  return (
    <WholesaleSimplePage
      title="Seller dashboard"
      subtitle="Monitor depot stock and chat deals — no cart orders."

        stats={[
          { label: "Listings", value: 12 },
          { label: "Open chats", value: 4 },
          { label: "Depots", value: 2 },
          { label: "Country", value: "HT" },
        ]}
        items={[
          { title: "My listings", meta: "Active depot stock", href: "/wholesale/seller" },
          { title: "My depot", meta: "Warehouse profile", href: "/wholesale/seller/warehouse" },
          { title: "Buyer chats", meta: "Inbound quotes", href: "/wholesale/seller/inquiries", badge: "Chat" },
          { title: "Add product", meta: "Native Photo Picker", href: "/wholesale/seller/new", badge: "New" },
        ]}
      empty="Nothing here yet — chat-only wholesale."
    />
  );
}
