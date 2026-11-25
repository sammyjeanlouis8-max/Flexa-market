import { WholesaleSimplePage } from "@/pages/wholesale/WholesaleSimplePage";

export default function WholesaleFeatured() {
  return (
    <WholesaleSimplePage
      title="Featured wholesale"
      subtitle="Highlighted depot stock — chat to buy."
      items={[
        { title: "Featured: Rice 50lb", meta: "Caribbean Bulk · Haiti", href: "/wholesale/products/101", badge: "Hot" },
        { title: "Featured: Cement bags", meta: "BuildMart HT", href: "/wholesale/products/105", badge: "Hot" },

      ]}
    />
  );
}
