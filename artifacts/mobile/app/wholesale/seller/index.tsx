import React from "react";
import { WholesaleSimplePage } from "@/components/wholesale/WholesaleSimplePage";

export default function Screen() {
  return (
    <WholesaleSimplePage
      title="My wholesale"
      subtitle="Listings, depot, and inbound chats."

        items={[
          { title: "Add product", meta: "Photo Picker · Wasabi · chat only", href: "/wholesale/seller/new", badge: "New" },
          { title: "Dashboard", meta: "Listings · chats · depots", href: "/wholesale/seller/dashboard" },
          { title: "My warehouse", meta: "Country depot buyers see", href: "/wholesale/seller/warehouse" },
          { title: "Inventory", meta: "Stock by SKU", href: "/wholesale/seller/inventory" },
          { title: "Inbound chats", meta: "Quote requests", href: "/wholesale/seller/inquiries", badge: "Chat" },
          { title: "Earnings", meta: "Closed chat deals", href: "/wholesale/seller/earnings" },
          { title: "Settings", meta: "Seller preferences", href: "/wholesale/seller/settings" },
        ]}
      empty="Nothing here yet — chat-only wholesale."
    />
  );
}
