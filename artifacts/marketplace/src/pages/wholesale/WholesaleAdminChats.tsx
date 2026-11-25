import { WholesaleSimplePage } from "@/pages/wholesale/WholesaleSimplePage";

export default function WholesaleAdminChats() {
  return (
    <WholesaleSimplePage
      title="Admin · chat moderation"
      subtitle="Wholesale inquiry health."
      stats={[
        { label: "Open", value: "23" },
        { label: "Flagged", value: "2" },
      ]}
      items={[
        { title: "Flagged chat #88", meta: "Possible spam", href: "/messages", badge: "Flag" },
        { title: "Open · Cement", meta: "Construct SA", href: "/wholesale/inquiries", badge: "Open" },

      ]}
    />
  );
}
