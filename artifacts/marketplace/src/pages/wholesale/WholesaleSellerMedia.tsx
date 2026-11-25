import { WholesaleSimplePage } from "@/pages/wholesale/WholesaleSimplePage";

export default function WholesaleSellerMedia() {
  return (
    <WholesaleSimplePage
      titleKey="wholesale.mediaTitle"
      subtitleKey="wholesale.mediaSubtitle"
      stats={[
        { label: "Images", labelKey: "wholesale.images", value: "18" },
      ]}
      items={[
        { title: "rice-main.jpg", meta: "Used on 2 listings", href: "/wholesale/seller", badge: "Image" },
        { title: "depot-door.jpg", meta: "Warehouse proof", href: "/wholesale/seller/warehouse", badge: "Image" },

      ]}
    />
  );
}
