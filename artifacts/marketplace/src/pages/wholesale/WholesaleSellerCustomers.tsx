import { useTranslation } from "react-i18next";
import { WholesalePageGate } from "@/components/wholesale/WholesalePageGate";
import { WholesaleListCard, WholesaleShell } from "@/components/wholesale/WholesaleShell";

const CUSTOMERS = [
  { id: 1, name: "Hotel Karibe", meta: "3 chats · Haiti · last 2h", href: "/messages" },
  { id: 2, name: "SuperMax Cap", meta: "1 chat · Haiti · last 5h", href: "/messages" },
  { id: 3, name: "Construct SA", meta: "2 chats · Haiti · last 1d", href: "/messages" },
];

export default function WholesaleSellerCustomers() {
  const { t } = useTranslation();
  return (
    <WholesalePageGate requireAuth>
      <WholesaleShell
        title={t("wholesale.customersTitle", { defaultValue: "Customers" })}
        subtitle={t("wholesale.customersSubtitle")}
      >
        <div className="space-y-2">
          {CUSTOMERS.map((c) => (
            <WholesaleListCard key={c.id} href={c.href} title={c.name} meta={c.meta} badge={t("wholesale.tabInquiries")} />
          ))}
        </div>
      </WholesaleShell>
    </WholesalePageGate>
  );
}
