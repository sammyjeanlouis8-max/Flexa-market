import { WholesaleLiveProductsPage } from "@/pages/wholesale/WholesaleLiveProducts";

export default function WholesaleInquiryDetail() {
  return (
    <WholesaleLiveProductsPage
      titleKey="wholesale.inquiryTitle"
      subtitleKey="wholesale.inquirySubtitle"
      stats={[
        { label: "Flow", labelKey: "wholesale.flow", value: "Chat" },
        { label: "Checkout", labelKey: "wholesale.checkoutNone", value: "—" },
      ]}
      badge="Product"
    />
  );
}
