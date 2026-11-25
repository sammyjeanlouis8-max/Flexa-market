import { WholesaleSimplePage } from "@/pages/wholesale/WholesaleSimplePage";

export default function WholesaleDeals() {
  return (
    <WholesaleSimplePage
      titleKey="wholesale.dealsTitle"
      subtitleKey="wholesale.dealsSubtitle"
      stats={[
        { label: "This month", labelKey: "wholesale.thisMonth", value: "12" },
        { label: "Value", labelKey: "wholesale.value", value: "$8.4k" },
      ]}
      items={[
        { title: "Rice · Hotel Karibe", meta: "Closed chat · Delmas Depot · $1,040", href: "/wholesale/inquiries", badge: "Paid" },
        { title: "Cement · Construct SA", meta: "Closed chat · Yard 3 · $1,680", href: "/wholesale/inquiries", badge: "Paid" },

      ]}
    />
  );
}
