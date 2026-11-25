import { WholesaleSimplePage } from "@/pages/wholesale/WholesaleSimplePage";

export default function WholesaleQuoteDetail() {
  return (
    <WholesaleSimplePage
      titleKey="wholesale.quoteTitle"
      subtitleKey="wholesale.quoteSubtitle"
      stats={[
        { label: "Qty", labelKey: "wholesale.qty", value: "40" },
        { label: "Quote", labelKey: "wholesale.quote", value: "$1,040" },
      ]}
      items={[
        { title: "Buyer", meta: "Hotel Karibe · Haiti", href: "/messages", badge: "Open" },
        { title: "Depot", meta: "Flexa Delmas Depot", href: "/wholesale/stores/1", badge: "Pickup" },

      ]}
    />
  );
}
