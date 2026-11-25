import { WholesaleSimplePage } from "@/pages/wholesale/WholesaleSimplePage";

export default function WholesaleSellerInventory() {
  return (
    <WholesaleSimplePage
      title="Depot inventory"
      subtitle="Stock by warehouse — chat buyers see live qty."
      stats={[
        { label: "SKUs", value: "24" },
        { label: "Low stock", value: "3" },
      ]}
      items={[
        { title: "Rice 50lb", meta: "Delmas · 420", href: "/wholesale/seller/products/101/edit", badge: "OK" },
        { title: "Water pallets", meta: "PV Cold · 40", href: "/wholesale/seller/products/104/edit", badge: "Low" },

      ]}
    />
  );
}
