import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { WholesalePageGate } from "@/components/wholesale/WholesalePageGate";
import { WholesaleShell, WholesaleStat } from "@/components/wholesale/WholesaleShell";

const LINKS = [
  { href: "/wholesale/admin/products", labelKey: "wholesale.allProducts" as const },
  { href: "/wholesale/admin/sellers", labelKey: "wholesale.sellers" as const },
  { href: "/wholesale/admin/warehouses", labelKey: "wholesale.depots" as const },
];

export default function WholesaleAdmin() {
  const { t } = useTranslation();
  return (
    <WholesalePageGate>
      <WholesaleShell
        title={t("wholesale.adminTitle", { defaultValue: "Wholesale admin" })}
        subtitle={t("wholesale.adminSubtitle")}
      >
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <WholesaleStat label={t("wholesale.products")} value={186} />
          <WholesaleStat label={t("wholesale.sellers")} value={42} />
          <WholesaleStat label={t("wholesale.depots")} value={57} />
          <WholesaleStat label={t("wholesale.openChats")} value={23} />
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-xl border border-border/70 bg-white px-4 py-4 text-center text-sm font-bold dark:bg-[hsl(152,16%,12%)]"
            >
              {t(l.labelKey)}
            </Link>
          ))}
        </div>
      </WholesaleShell>
    </WholesalePageGate>
  );
}
