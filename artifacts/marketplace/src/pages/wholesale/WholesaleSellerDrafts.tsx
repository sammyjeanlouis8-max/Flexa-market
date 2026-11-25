import { WholesaleSimplePage } from "@/pages/wholesale/WholesaleSimplePage";

export default function WholesaleSellerDrafts() {
  return (
    <WholesaleSimplePage
      titleKey="wholesale.draftsTitle"
      subtitleKey="wholesale.draftsSubtitle"
      stats={[
        { label: "Drafts", labelKey: "wholesale.drafts", value: "2" },
      ]}
      items={[
        { title: "Draft: Soap cases", meta: "Missing depot city", href: "/wholesale/seller/products/101/edit", badge: "Draft" },
        { title: "Draft: Nails bulk", meta: "Missing tiers", href: "/wholesale/seller", badge: "Draft" },

      ]}
    />
  );
}
