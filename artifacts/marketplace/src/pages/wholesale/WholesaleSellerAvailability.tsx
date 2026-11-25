import { WholesaleSimplePage } from "@/pages/wholesale/WholesaleSimplePage";

export default function WholesaleSellerAvailability() {
  return (
    <WholesaleSimplePage
      title="Stock alerts"
      subtitle="Low-stock warnings for depot SKUs."
      stats={[
        { label: "Alerts", value: "3" },
      ]}
      items={[
        { title: "Water pallets", meta: "Under 50 cases", href: "/wholesale/seller/inventory", badge: "Alert" },
        { title: "Oil cartons", meta: "Under 20", href: "/wholesale/seller/inventory", badge: "Alert" },

      ]}
    />
  );
}
