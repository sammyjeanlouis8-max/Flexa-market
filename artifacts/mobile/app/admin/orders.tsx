import React from "react";
import { FlexaControlShell } from "@/components/admin/FlexaControlShell";
import { AdminActionList } from "@/components/admin/AdminActionList";

export default function AdminOrders() {
  return (
    <FlexaControlShell activeTab="orders">
      <AdminActionList kind="orders" title="Orders" />
    </FlexaControlShell>
  );
}
