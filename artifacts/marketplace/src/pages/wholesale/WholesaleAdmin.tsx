import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { WholesalePageGate } from "@/components/wholesale/WholesalePageGate";
import { WholesaleShell, WholesaleStat } from "@/components/wholesale/WholesaleShell";

const LINKS = [
  { href: "/wholesale/admin/products", label: "All products" },
  { href: "/wholesale/admin/sellers", label: "Sellers" },
  { href: "/wholesale/admin/warehouses", label: "Depots" },
];

export default function WholesaleAdmin() {
  const { t } = useTranslation();
  return (
    <WholesalePageGate>
      <WholesaleShell
        title={t("wholesale.adminTitle", { defaultValue: "Wholesale admin" })}
        subtitle="Super Admin overview — chat-only marketplace health."
      >
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <WholesaleStat label="Products" value={186} />
          <WholesaleStat label="Sellers" value={42} />
          <WholesaleStat label="Depots" value={57} />
          <WholesaleStat label="Open chats" value={23} />
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="rounded-xl border border-border/70 bg-white px-4 py-4 text-center text-sm font-bold dark:bg-[hsl(152,16%,12%)]">
              {l.label}
            </Link>
          ))}
        </div>
      </WholesaleShell>
    </WholesalePageGate>
  );
}
