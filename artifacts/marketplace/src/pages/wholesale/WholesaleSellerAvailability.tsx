import { WholesaleSimplePage } from "@/pages/wholesale/WholesaleSimplePage";

export default function WholesaleSellerAvailability() {
  return (
    <WholesaleSimplePage
      titleKey="wholesale.availabilityTitle"
      subtitleKey="wholesale.availabilitySubtitle"
      stats={[
        { label: "Alerts", labelKey: "wholesale.alerts", value: "3" },
      ]}
      items={[
        { title: "Water pallets", meta: "Under 50 cases", href: "/wholesale/seller/inventory", badge: "Alert" },
        { title: "Oil cartons", meta: "Under 20", href: "/wholesale/seller/inventory", badge: "Alert" },

      ]}
    />
  );
}
