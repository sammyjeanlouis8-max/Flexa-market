import { WholesaleSimplePage } from "@/pages/wholesale/WholesaleSimplePage";

export default function WholesaleSellerReviews() {
  return (
    <WholesaleSimplePage
      title="Reviews"
      subtitle="Feedback after depot pickup deals."
      stats={[
        { label: "Rating", value: "4.8" },
      ]}
      items={[
        { title: "Hotel Karibe", meta: "Fast depot pickup", href: "/wholesale/seller/customers", badge: "★★★★★" },
        { title: "Construct SA", meta: "Good cement stock", href: "/wholesale/seller/customers", badge: "★★★★☆" },

      ]}
    />
  );
}
