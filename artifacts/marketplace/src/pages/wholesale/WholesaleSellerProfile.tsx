import { WholesaleSimplePage } from "@/pages/wholesale/WholesaleSimplePage";

export default function WholesaleSellerProfile() {
  return (
    <WholesaleSimplePage
      title="Public seller profile"
      subtitle="What buyers see before chatting."
      items={[
        { title: "Company", meta: "Caribbean Bulk Co", href: "/wholesale/stores/1", badge: "Public" },
        { title: "Countries", meta: "Haiti", href: "/wholesale/country/Haiti", badge: "Public" },

      ]}
    />
  );
}
