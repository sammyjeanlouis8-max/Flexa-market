import { WholesaleSimplePage } from "@/pages/wholesale/WholesaleSimplePage";

export default function WholesaleQuoteDetail() {
  return (
    <WholesaleSimplePage
      title="Quote detail"
      subtitle="Negotiate in chat — no checkout."
      stats={[
        { label: "Qty", value: "40" },
        { label: "Quote", value: "$1,040" },
      ]}
      items={[
        { title: "Buyer", meta: "Hotel Karibe · Haiti", href: "/messages", badge: "Open" },
        { title: "Depot", meta: "Flexa Delmas Depot", href: "/wholesale/stores/1", badge: "Pickup" },

      ]}
    />
  );
}
