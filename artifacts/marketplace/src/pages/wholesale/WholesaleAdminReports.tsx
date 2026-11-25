import { WholesaleSimplePage } from "@/pages/wholesale/WholesaleSimplePage";

export default function WholesaleAdminReports() {
  return (
    <WholesaleSimplePage
      titleKey="wholesale.adminReports"
      subtitleKey="wholesale.adminReportsSub"
      stats={[
        { label: "Chats", labelKey: "wholesale.chats", value: "410" },
        { label: "Closed", labelKey: "wholesale.closed", value: "92" },
      ]}
      items={[
        { title: "Haiti report", meta: "Download CSV", href: "/wholesale/admin", badge: "CSV" },
        { title: "Depot report", meta: "Download CSV", href: "/wholesale/admin/warehouses", badge: "CSV" },

      ]}
    />
  );
}
