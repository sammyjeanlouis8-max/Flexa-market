import { WholesaleLiveProductsPage } from "@/pages/wholesale/WholesaleLiveProducts";

export default function WholesaleCompare() {
  return (
    <WholesaleLiveProductsPage
      title="Compare listings"
      subtitle="Side-by-side wholesale quotes before you chat."
      stats={[
        { label: "Mode", value: "Chat" },
        { label: "Checkout", value: "None" },
      ]}
      badge={(p) => p.category || "Quote"}
    />
  );
}
