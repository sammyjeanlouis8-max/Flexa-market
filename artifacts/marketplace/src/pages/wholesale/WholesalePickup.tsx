import { WholesaleSimplePage } from "@/pages/wholesale/WholesaleSimplePage";

export default function WholesalePickup() {
  return (
    <WholesaleSimplePage
      titleKey="wholesale.pickupTitle"
      subtitleKey="wholesale.pickupSubtitle"
      items={[
        { title: "1. Agree in chat", meta: "Confirm qty + pickup window", href: "/wholesale/help", badge: "Step" },
        { title: "2. Go to depot", meta: "Bring ID · seller confirms stock", href: "/wholesale/warehouses", badge: "Step" },
        { title: "3. Load & pay", meta: "Payment arranged offline / wallet", href: "/wholesale/deals", badge: "Step" },

      ]}
    />
  );
}
