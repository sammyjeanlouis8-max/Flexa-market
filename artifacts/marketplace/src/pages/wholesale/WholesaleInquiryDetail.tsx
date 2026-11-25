import { WholesaleLiveProductsPage } from "@/pages/wholesale/WholesaleLiveProducts";

export default function WholesaleInquiryDetail() {
  return (
    <WholesaleLiveProductsPage
      title="Inquiry"
      subtitle="Open a live product, then continue the quote in Market chat."
      stats={[
        { label: "Flow", value: "Chat" },
        { label: "Checkout", value: "None" },
      ]}
      badge="Product"
    />
  );
}
