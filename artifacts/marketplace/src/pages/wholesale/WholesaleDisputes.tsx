import { WholesaleSimplePage } from "@/pages/wholesale/WholesaleSimplePage";

export default function WholesaleDisputes() {
  return (
    <WholesaleSimplePage
      titleKey="wholesale.disputesTitle"
      subtitleKey="wholesale.disputesSubtitle"
      stats={[
        { label: "Open", labelKey: "wholesale.openLabel", value: "1" },
      ]}
      items={[
        { title: "Pickup delay · Rice", meta: "Waiting seller reply", href: "/messages", badge: "Open" },
        { title: "Wrong qty note", meta: "Closed", href: "/wholesale/help", badge: "Closed" },

      ]}
    />
  );
}
