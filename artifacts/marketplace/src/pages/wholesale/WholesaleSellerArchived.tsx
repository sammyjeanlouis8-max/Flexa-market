import { WholesaleSimplePage } from "@/pages/wholesale/WholesaleSimplePage";

export default function WholesaleSellerArchived() {
  return (
    <WholesaleSimplePage
      title="Archived listings"
      subtitle="Hidden from catalog · chat history kept."
      items={[
        { title: "Old rice lot", meta: "Archived · Haiti", href: "/wholesale/seller", badge: "Archived" },

      ]}
    />
  );
}
