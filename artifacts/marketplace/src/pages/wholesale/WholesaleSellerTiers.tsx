import { WholesaleSimplePage } from "@/pages/wholesale/WholesaleSimplePage";

export default function WholesaleSellerTiers() {
  return (
    <WholesaleSimplePage
      title="Price tiers editor"
      subtitle="Volume pricing for chat quotes."
      items={[
        { title: "10–19", meta: "$28.50", href: "/wholesale/seller/products/101/edit", badge: "Tier" },
        { title: "20–49", meta: "$26.00", href: "/wholesale/seller/products/101/edit", badge: "Tier" },
        { title: "50+", meta: "$23.75", href: "/wholesale/seller/products/101/edit", badge: "Tier" },

      ]}
    />
  );
}
