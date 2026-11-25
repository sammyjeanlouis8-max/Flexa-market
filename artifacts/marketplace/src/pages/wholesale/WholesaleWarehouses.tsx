import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { MapPin, Warehouse } from "lucide-react";
import { WholesalePageGate } from "@/components/wholesale/WholesalePageGate";
import { WholesaleShell } from "@/components/wholesale/WholesaleShell";
import { WHOLESALE_WAREHOUSES } from "@/lib/wholesaleDemo";

export default function WholesaleWarehouses() {
  const { t } = useTranslation();
  return (
    <WholesalePageGate>
      <WholesaleShell
        title={t("wholesale.depotsTitle", { defaultValue: "Warehouses & depots" })}
        subtitle={t("wholesale.depotsSubtitle", { defaultValue: "Sellers stock a depot in their country. Chat to arrange pickup." })}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {WHOLESALE_WAREHOUSES.map((w) => (
            <Link
              key={w.id}
              href={`/wholesale/stores/${w.id}`}
              className="rounded-2xl border border-border/70 bg-white p-4 dark:bg-[hsl(152,16%,12%)]"
              data-testid={`wholesale-depot-${w.id}`}
            >
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[hsl(152,40%,92%)] text-[hsl(152,50%,28%)]">
                  <Warehouse className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="font-bold">{w.name}</p>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3" />
                    {w.city} · {w.country}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {w.seller} · {w.products} products
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </WholesaleShell>
    </WholesalePageGate>
  );
}
