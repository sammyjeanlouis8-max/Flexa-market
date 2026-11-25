import { WholesaleSimplePage } from "@/pages/wholesale/WholesaleSimplePage";

export default function WholesaleAdminFlags() {
  return (
    <WholesaleSimplePage
      title="Admin · flagged listings"
      subtitle="Review reported wholesale products."
      stats={[
        { label: "Flags", value: "4" },
      ]}
      items={[
        { title: "Cement bags", meta: "Stock mismatch report", href: "/wholesale/products/105", badge: "Review" },
        { title: "Phone accessories", meta: "Wrong country tag", href: "/wholesale/admin/products", badge: "Review" },

      ]}
    />
  );
}
