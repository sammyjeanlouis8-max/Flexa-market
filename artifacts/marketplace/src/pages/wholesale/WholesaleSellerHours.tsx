import { WholesaleSimplePage } from "@/pages/wholesale/WholesaleSimplePage";

export default function WholesaleSellerHours() {
  return (
    <WholesaleSimplePage
      title="Depot hours"
      subtitle="When buyers can pickup after chat."
      items={[
        { title: "Mon–Fri", meta: "8:00–17:00", href: "/wholesale/seller/warehouse", badge: "Open" },
        { title: "Sat", meta: "9:00–13:00", href: "/wholesale/seller/warehouse", badge: "Open" },

      ]}
    />
  );
}
