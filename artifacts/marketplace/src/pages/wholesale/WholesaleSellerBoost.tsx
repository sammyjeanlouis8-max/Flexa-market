import { WholesaleSimplePage } from "@/pages/wholesale/WholesaleSimplePage";

export default function WholesaleSellerBoost() {
  return (
    <WholesaleSimplePage
      titleKey="wholesale.boostTitle"
      subtitleKey="wholesale.boostSubtitle"
      items={[
        { title: "Boost Rice 50lb", meta: "7 days · Haiti feed", href: "/wholesale/featured", badge: "Boost" },
        { title: "Boost Cement", meta: "3 days · Construction", href: "/wholesale/featured", badge: "Boost" },

      ]}
    />
  );
}
