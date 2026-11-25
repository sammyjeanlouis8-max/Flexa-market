import { WholesaleSimplePage } from "@/pages/wholesale/WholesaleSimplePage";

export default function WholesaleDeals() {
  return (
    <WholesaleSimplePage
      title="Closed deals"
      subtitle="Chat deals confirmed with depot pickup."
      stats={[
        { label: "This month", value: "12" },
        { label: "Value", value: "$8.4k" },
      ]}
      items={[
        { title: "Rice · Hotel Karibe", meta: "Closed chat · Delmas Depot · $1,040", href: "/wholesale/inquiries", badge: "Paid" },
        { title: "Cement · Construct SA", meta: "Closed chat · Yard 3 · $1,680", href: "/wholesale/inquiries", badge: "Paid" },

      ]}
    />
  );
}
