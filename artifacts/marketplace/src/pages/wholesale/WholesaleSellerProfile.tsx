import { WholesaleSimplePage } from "@/pages/wholesale/WholesaleSimplePage";

export default function WholesaleSellerProfile() {
  return (
    <WholesaleSimplePage
      titleKey="wholesale.profileTitle"
      subtitleKey="wholesale.profileSubtitle"
      items={[
        { title: "Company", meta: "Caribbean Bulk Co", href: "/wholesale/stores/1", badge: "Public" },
        { title: "Countries", meta: "Haiti", href: "/wholesale/country/Haiti", badge: "Public" },

      ]}
    />
  );
}
