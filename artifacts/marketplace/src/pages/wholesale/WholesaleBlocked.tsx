import { WholesaleSimplePage } from "@/pages/wholesale/WholesaleSimplePage";

export default function WholesaleBlocked() {
  return (
    <WholesaleSimplePage
      titleKey="wholesale.blockedTitle"
      subtitleKey="wholesale.blockedSubtitle"
      items={[
        { title: "Spam Bulk LLC", meta: "Blocked 3d ago", href: "/wholesale/inquiries", badge: "Blocked" },

      ]}
    />
  );
}
