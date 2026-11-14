import React from "react";
import { FlexaControlShell } from "@/components/admin/FlexaControlShell";
import { CommandCenterDashboard } from "@/components/admin/CommandCenterDashboard";

export default function AdminCommandCenter() {
  return (
    <FlexaControlShell activeTab="dashboard">
      <CommandCenterDashboard />
    </FlexaControlShell>
  );
}
