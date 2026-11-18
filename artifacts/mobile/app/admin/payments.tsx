import React from "react";
import { FlexaControlShell } from "@/components/admin/FlexaControlShell";
import { AdminActionList } from "@/components/admin/AdminActionList";

export default function AdminPayments() {
  return (
    <FlexaControlShell activeTab="payments">
      <AdminActionList kind="payments" title="Payments" />
    </FlexaControlShell>
  );
}
