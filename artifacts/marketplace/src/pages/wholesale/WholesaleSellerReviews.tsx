import { WholesaleSimplePage } from "@/pages/wholesale/WholesaleSimplePage";

export default function WholesaleSellerReviews() {
  return (
    <WholesaleSimplePage
      titleKey="wholesale.reviewsTitle"
      subtitleKey="wholesale.reviewsSubtitle"
      stats={[
        { label: "Rating", labelKey: "wholesale.rating", value: "4.8" },
      ]}
      items={[
        { title: "Hotel Karibe", meta: "Fast depot pickup", href: "/wholesale/seller/customers", badge: "★★★★★" },
        { title: "Construct SA", meta: "Good cement stock", href: "/wholesale/seller/customers", badge: "★★★★☆" },

      ]}
    />
  );
}
