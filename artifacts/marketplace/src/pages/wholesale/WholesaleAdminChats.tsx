import { WholesaleSimplePage } from "@/pages/wholesale/WholesaleSimplePage";

export default function WholesaleAdminChats() {
  return (
    <WholesaleSimplePage
      titleKey="wholesale.adminChats"
      subtitleKey="wholesale.adminSubtitle"
      stats={[
        { label: "Open", labelKey: "wholesale.openLabel", value: "23" },
        { label: "Flagged", labelKey: "wholesale.flagged", value: "2" },
      ]}
      items={[
        { title: "Flagged chat #88", meta: "Possible spam", href: "/messages", badge: "Flag" },
        { title: "Open · Cement", meta: "Construct SA", href: "/wholesale/inquiries", badge: "Open" },

      ]}
    />
  );
}
