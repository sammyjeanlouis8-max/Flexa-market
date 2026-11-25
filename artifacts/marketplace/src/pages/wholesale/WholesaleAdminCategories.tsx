import { WholesaleSimplePage } from "@/pages/wholesale/WholesaleSimplePage";

export default function WholesaleAdminCategories() {
  return (
    <WholesaleSimplePage
      title="Admin · categories"
      subtitle="Manage wholesale category taxonomy."
      stats={[
        { label: "Categories", value: "6" },
      ]}
      items={[
        { title: "Food & Grocery", meta: "48 listings", href: "/wholesale/categories/food-grocery", badge: "Edit" },
        { title: "Construction", meta: "31 listings", href: "/wholesale/categories/construction", badge: "Edit" },

      ]}
    />
  );
}
