import { WholesaleSimplePage } from "@/pages/wholesale/WholesaleSimplePage";

export default function WholesaleAdminReports() {
  return (
    <WholesaleSimplePage
      title="Admin · reports"
      subtitle="Wholesale volume without checkout GMV."
      stats={[
        { label: "Chats", value: "410" },
        { label: "Closed", value: "92" },
      ]}
      items={[
        { title: "Haiti report", meta: "Download CSV", href: "/wholesale/admin", badge: "CSV" },
        { title: "Depot report", meta: "Download CSV", href: "/wholesale/admin/warehouses", badge: "CSV" },

      ]}
    />
  );
}
