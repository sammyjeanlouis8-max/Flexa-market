import React from "react";
import { WholesaleSimplePage } from "@/components/wholesale/WholesaleSimplePage";

export default function Screen() {
  return (
    <WholesaleSimplePage
      title="Wholesale admin"
      subtitle="Super Admin overview — chat-only marketplace health."

        stats={[
          { label: "Chats", value: 410 },
          { label: "Closed", value: 92 },
        ]}

        items={[
          { title: "Products", meta: "Moderate listings", href: "/wholesale/admin/products" },
          { title: "Sellers", meta: "Verified vendors", href: "/wholesale/admin/sellers" },
          { title: "Depots", meta: "Warehouses", href: "/wholesale/admin/warehouses" },
          { title: "Reports", meta: "CSV exports", href: "/wholesale/admin/reports" },
          { title: "Flags", meta: "Reported stock", href: "/wholesale/admin/flags" },
        ]}
      empty="Nothing here yet — chat-only wholesale."
    />
  );
}
