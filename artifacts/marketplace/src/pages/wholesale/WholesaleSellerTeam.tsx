import { WholesaleSimplePage } from "@/pages/wholesale/WholesaleSimplePage";

export default function WholesaleSellerTeam() {
  return (
    <WholesaleSimplePage
      title="Team"
      subtitle="Staff who answer wholesale chat."
      stats={[
        { label: "Members", value: "3" },
      ]}
      items={[
        { title: "Sammy · Owner", meta: "All depots", href: "/wholesale/seller/settings", badge: "Owner" },
        { title: "Marie · Chat agent", meta: "Delmas Depot", href: "/messages", badge: "Agent" },

      ]}
    />
  );
}
