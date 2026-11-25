import { WholesaleSimplePage } from "@/pages/wholesale/WholesaleSimplePage";

export default function WholesaleMap() {
  return (
    <WholesaleSimplePage
      titleKey="wholesale.mapTitle"
      subtitleKey="wholesale.mapSubtitle"
      stats={[
        { label: "Depots", labelKey: "wholesale.depots", value: "6" },
        { label: "Countries", labelKey: "wholesale.countries", value: "3" },
      ]}
      items={[
        { title: "Delmas Depot", meta: "Port-au-Prince · HT", href: "/wholesale/stores/1", badge: "HT" },
        { title: "MIA Forwarding", meta: "Miami · USA", href: "/wholesale/stores/5", badge: "US" },

      ]}
    />
  );
}
