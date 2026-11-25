import { WholesaleSimplePage } from "@/pages/wholesale/WholesaleSimplePage";

export default function WholesaleRecent() {
  return (
    <WholesaleSimplePage
      title="Recently viewed"
      subtitle="Bulk listings you opened."
      items={[
        { title: "Rice 50lb bags", meta: "Haiti · Delmas", href: "/wholesale/products/101", badge: "Viewed" },
        { title: "Cooking oil cartons", meta: "Haiti · Cap", href: "/wholesale/products/102", badge: "Viewed" },

      ]}
    />
  );
}
