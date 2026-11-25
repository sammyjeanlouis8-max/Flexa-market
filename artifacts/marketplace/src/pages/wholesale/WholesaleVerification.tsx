import { WholesaleSimplePage } from "@/pages/wholesale/WholesaleSimplePage";

export default function WholesaleVerification() {
  return (
    <WholesaleSimplePage
      titleKey="wholesale.verificationTitle"
      subtitleKey="wholesale.verificationSubtitle"
      stats={[
        { label: "Status", labelKey: "wholesale.status", value: "Pending" },
      ]}
      items={[
        { title: "Business docs", meta: "Upload registration", href: "/wholesale/seller/documents", badge: "Needed" },
        { title: "Depot proof", meta: "Photo of warehouse", href: "/wholesale/seller/warehouse", badge: "Needed" },

      ]}
    />
  );
}
