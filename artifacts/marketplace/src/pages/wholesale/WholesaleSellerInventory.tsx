import { WholesaleSimplePage } from "@/pages/wholesale/WholesaleSimplePage";

export default function WholesaleSellerInventory() {
  return (
    <WholesaleSimplePage
      titleKey="wholesale.inventoryTitle"
      subtitleKey="wholesale.inventorySubtitle"
      stats={[
        { label: "SKUs", labelKey: "wholesale.skus", value: "24" },
        { label: "Low stock", labelKey: "wholesale.lowStock", value: "3" },
      ]}
      items={[
        { title: "Rice 50lb", meta: "Delmas · 420", href: "/wholesale/seller/products/101/edit", badge: "OK" },
        { title: "Water pallets", meta: "PV Cold · 40", href: "/wholesale/seller/products/104/edit", badge: "Low" },

      ]}
    />
  );
}
