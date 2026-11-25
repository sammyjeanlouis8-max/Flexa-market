import { WholesaleSimplePage } from "@/pages/wholesale/WholesaleSimplePage";

export default function WholesaleBlocked() {
  return (
    <WholesaleSimplePage
      title="Blocked sellers"
      subtitle="Wholesale sellers you blocked from chat."
      items={[
        { title: "Spam Bulk LLC", meta: "Blocked 3d ago", href: "/wholesale/inquiries", badge: "Blocked" },

      ]}
    />
  );
}
