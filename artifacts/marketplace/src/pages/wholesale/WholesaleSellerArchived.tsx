import { WholesaleSimplePage } from "@/pages/wholesale/WholesaleSimplePage";

export default function WholesaleSellerArchived() {
  return (
    <WholesaleSimplePage
      titleKey="wholesale.archivedTitle"
      subtitleKey="wholesale.archivedSubtitle"
      items={[
        { title: "Old rice lot", meta: "Archived · Haiti", href: "/wholesale/seller", badge: "Archived" },

      ]}
    />
  );
}
