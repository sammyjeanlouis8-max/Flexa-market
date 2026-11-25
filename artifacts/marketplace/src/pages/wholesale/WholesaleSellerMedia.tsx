import { WholesaleSimplePage } from "@/pages/wholesale/WholesaleSimplePage";

export default function WholesaleSellerMedia() {
  return (
    <WholesaleSimplePage
      title="Media library"
      subtitle="Photos for depot listings."
      stats={[
        { label: "Images", value: "18" },
      ]}
      items={[
        { title: "rice-main.jpg", meta: "Used on 2 listings", href: "/wholesale/seller", badge: "Image" },
        { title: "depot-door.jpg", meta: "Warehouse proof", href: "/wholesale/seller/warehouse", badge: "Image" },

      ]}
    />
  );
}
