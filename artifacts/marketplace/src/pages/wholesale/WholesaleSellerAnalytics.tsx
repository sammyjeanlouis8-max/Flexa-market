import { WholesaleSimplePage } from "@/pages/wholesale/WholesaleSimplePage";

export default function WholesaleSellerAnalytics() {
  return (
    <WholesaleSimplePage
      title="Analytics"
      subtitle="Views, chats, closed deals — no cart metrics."
      stats={[
        { label: "Views", value: "1.2k" },
        { label: "Chats", value: "86" },
        { label: "Closed", value: "18" },
      ]}
      items={[
        { title: "Top listing", meta: "Rice 50lb", href: "/wholesale/products/101", badge: "#1" },
        { title: "Top depot", meta: "Delmas", href: "/wholesale/stores/1", badge: "#1" },

      ]}
    />
  );
}
