import { WholesaleSimplePage } from "@/pages/wholesale/WholesaleSimplePage";

export default function WholesaleMap() {
  return (
    <WholesaleSimplePage
      title="Depot map"
      subtitle="Warehouses by country — tap to chat seller."
      stats={[
        { label: "Depots", value: "6" },
        { label: "Countries", value: "3" },
      ]}
      items={[
        { title: "Delmas Depot", meta: "Port-au-Prince · HT", href: "/wholesale/stores/1", badge: "HT" },
        { title: "MIA Forwarding", meta: "Miami · USA", href: "/wholesale/stores/5", badge: "US" },

      ]}
    />
  );
}
