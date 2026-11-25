import { WholesaleSimplePage } from "@/pages/wholesale/WholesaleSimplePage";

export default function WholesaleCompare() {
  return (
    <WholesaleSimplePage
      title="Compare listings"
      subtitle="Side-by-side wholesale quotes before you chat."
      stats={[
        { label: "A", value: "Rice" },
        { label: "B", value: "Oil" },
      ]}
      items={[
        { title: "Rice 50lb · $28.50", meta: "Min 10 · Delmas", href: "/wholesale/products/101", badge: "A" },
        { title: "Oil cartons · $34.00", meta: "Min 5 · Nord Hub", href: "/wholesale/products/102", badge: "B" },

      ]}
    />
  );
}
