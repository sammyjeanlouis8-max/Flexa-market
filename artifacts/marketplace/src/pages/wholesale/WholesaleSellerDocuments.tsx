import { WholesaleSimplePage } from "@/pages/wholesale/WholesaleSimplePage";

export default function WholesaleSellerDocuments() {
  return (
    <WholesaleSimplePage
      title="Documents"
      subtitle="Invoices & depot papers for chat deals."
      items={[
        { title: "Invoice #1042", meta: "Rice deal · Karibe", href: "/wholesale/deals", badge: "PDF" },
        { title: "Depot lease", meta: "Delmas proof", href: "/wholesale/verification", badge: "PDF" },

      ]}
    />
  );
}
