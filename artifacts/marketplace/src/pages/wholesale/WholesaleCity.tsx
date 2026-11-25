import { WholesaleSimplePage } from "@/pages/wholesale/WholesaleSimplePage";

export default function WholesaleCity() {
  return (
    <WholesaleSimplePage
      title="City wholesale"
      subtitle="Depots and bulk stock near this city."
      stats={[
        { label: "Depots", value: "2" },
      ]}
      items={[
        { title: "Flexa Delmas Depot", meta: "12 products", href: "/wholesale/stores/1", badge: "Delmas" },
        { title: "Industrial Yard 3", meta: "15 products", href: "/wholesale/stores/4", badge: "Carrefour" },

      ]}
    />
  );
}
