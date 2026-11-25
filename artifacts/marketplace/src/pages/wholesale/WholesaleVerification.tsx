import { WholesaleSimplePage } from "@/pages/wholesale/WholesaleSimplePage";

export default function WholesaleVerification() {
  return (
    <WholesaleSimplePage
      title="Seller verification"
      subtitle="Verify company + depot to sell wholesale."
      stats={[
        { label: "Status", value: "Pending" },
      ]}
      items={[
        { title: "Business docs", meta: "Upload registration", href: "/wholesale/seller/documents", badge: "Needed" },
        { title: "Depot proof", meta: "Photo of warehouse", href: "/wholesale/seller/warehouse", badge: "Needed" },

      ]}
    />
  );
}
