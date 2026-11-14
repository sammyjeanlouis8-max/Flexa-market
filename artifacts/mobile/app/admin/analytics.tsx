import React from "react";
import { FlexaControlShell } from "@/components/admin/FlexaControlShell";
import { AdminActionList } from "@/components/admin/AdminActionList";

export default function AdminAnalytics() {
  return (
    <FlexaControlShell activeTab="analytics">
      <AdminActionList kind="analytics" title="Analytics" />
    </FlexaControlShell>
  );
}
