import { WholesaleSimplePage } from "@/pages/wholesale/WholesaleSimplePage";

export default function WholesaleAdminCountries() {
  return (
    <WholesaleSimplePage
      titleKey="wholesale.adminCountries"
      subtitleKey="wholesale.adminCountriesSub"
      stats={[
        { label: "Live", labelKey: "wholesale.live", value: "3" },
      ]}
      items={[
        { title: "Haiti", meta: "4 depots", href: "/wholesale/country/Haiti", badge: "On" },
        { title: "USA", meta: "1 depot", href: "/wholesale/country/USA", badge: "On" },
        { title: "Dominican Republic", meta: "1 depot", href: "/wholesale/country/Dominican%20Republic", badge: "On" },

      ]}
    />
  );
}
