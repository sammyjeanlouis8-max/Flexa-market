import { useLocalSearchParams } from "expo-router";
import React from "react";
import { FlexaControlShell } from "@/components/admin/FlexaControlShell";
import { AdminActionList, type ModuleKind } from "@/components/admin/AdminActionList";
import { MORE_MODULES } from "@/lib/adminModules";

const KIND_BY_SLUG: Record<string, ModuleKind> = {
  users: "users",
  listings: "listings",
  moderation: "moderation",
  payments: "payments",
  "stripe-transactions": "payments",
  refunds: "refunds",
  boosts: "boosts",
  support: "support",
  "promo-videos": "promo-videos",
  operations: "operations",
  team: "team",
  security: "security",
  deliveries: "deliveries",
  "push-notifications": "push-notifications",
  "driver-applications": "driver-applications",
  "agent-applications": "agent-applications",
  loans: "loans",
  rates: "rates",
  tv: "tv",
  music: "music",
  "vip-subscriptions": "vip",
  "flex-card": "flex-card",
  transactions: "transactions",
  "moncash-transactions": "payments",
  actions: "security",
  activity: "security",
  "broadcast-email": "broadcast-email",
  "broadcast-sms": "broadcast-sms",
  appeals: "appeals",
  reports: "reports",
  flagged: "flagged",
  "live-support": "live-support",
};

export default function AdminModuleRoute() {
  const { module: slug } = useLocalSearchParams<{ module: string }>();
  const key = String(slug || "");
  const def = MORE_MODULES.find((m) => m.slug === key || m.href.endsWith(`/${key}`));
  const kind = KIND_BY_SLUG[key] || "generic";
  const title = def?.title || key.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <FlexaControlShell activeTab="more">
      <AdminActionList kind={kind} title={title} emptyHint={def?.desc} />
    </FlexaControlShell>
  );
}
