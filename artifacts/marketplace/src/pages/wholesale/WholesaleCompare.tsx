import { WholesaleLiveProductsPage } from "@/pages/wholesale/WholesaleLiveProducts";

export default function WholesaleCompare() {
  return (
    <WholesaleLiveProductsPage
      titleKey="wholesale.compareTitle"
      subtitleKey="wholesale.compareSubtitle"
      stats={[
        { label: "Mode", labelKey: "wholesale.mode", value: "Chat" },
        { label: "Checkout", labelKey: "wholesale.checkoutNone", value: "—" },
      ]}
      badge={(p) => p.category || "Quote"}
    />
  );
}
