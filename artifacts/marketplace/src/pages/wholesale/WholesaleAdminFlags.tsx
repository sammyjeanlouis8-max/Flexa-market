import { WholesaleLiveProductsPage } from "@/pages/wholesale/WholesaleLiveProducts";

export default function WholesaleAdminFlags() {
  return (
    <WholesaleLiveProductsPage
      title="Admin · flagged listings"
      subtitle="Review live wholesale products (no demo product IDs)."
      badge="Review"
    />
  );
}
