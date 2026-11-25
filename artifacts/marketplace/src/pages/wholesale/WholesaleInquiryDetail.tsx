import { WholesaleSimplePage } from "@/pages/wholesale/WholesaleSimplePage";

export default function WholesaleInquiryDetail() {
  return (
    <WholesaleSimplePage
      title="Inquiry"
      subtitle="Chat thread summary for a wholesale quote."
      stats={[
        { label: "Status", value: "Open" },
        { label: "Qty", value: "40" },
      ]}
      items={[
        { title: "Message seller", meta: "Continue in Market chat", href: "/messages", badge: "Chat" },
        { title: "View product", meta: "Rice 50lb bags", href: "/wholesale/products/101", badge: "Product" },

      ]}
    />
  );
}
