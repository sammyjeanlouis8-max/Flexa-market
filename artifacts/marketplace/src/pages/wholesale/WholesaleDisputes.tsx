import { WholesaleSimplePage } from "@/pages/wholesale/WholesaleSimplePage";

export default function WholesaleDisputes() {
  return (
    <WholesaleSimplePage
      title="Disputes & help"
      subtitle="Resolve chat/depot issues with support."
      stats={[
        { label: "Open", value: "1" },
      ]}
      items={[
        { title: "Pickup delay · Rice", meta: "Waiting seller reply", href: "/messages", badge: "Open" },
        { title: "Wrong qty note", meta: "Closed", href: "/wholesale/help", badge: "Closed" },

      ]}
    />
  );
}
