import { WholesaleSimplePage } from "@/pages/wholesale/WholesaleSimplePage";

export default function WholesaleSellerDrafts() {
  return (
    <WholesaleSimplePage
      title="Draft listings"
      subtitle="Unpublished wholesale drafts."
      stats={[
        { label: "Drafts", value: "2" },
      ]}
      items={[
        { title: "Draft: Soap cases", meta: "Missing depot city", href: "/wholesale/seller/products/101/edit", badge: "Draft" },
        { title: "Draft: Nails bulk", meta: "Missing tiers", href: "/wholesale/seller", badge: "Draft" },

      ]}
    />
  );
}
