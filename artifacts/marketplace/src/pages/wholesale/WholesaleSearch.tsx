import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Search } from "lucide-react";
import { WholesalePageGate } from "@/components/wholesale/WholesalePageGate";
import { WholesaleListCard, WholesaleShell } from "@/components/wholesale/WholesaleShell";

const ALL = [
  { id: 101, title: "Rice 50lb bags — Port-au-Prince warehouse", meta: "Haiti · Delmas Depot" },
  { id: 102, title: "Cooking oil cartons (12×1L)", meta: "Haiti · Nord Hub" },
  { id: 104, title: "Bottled water pallets (24×500ml)", meta: "Haiti · PV Cold Store" },
  { id: 105, title: "Cement bags — wholesale construction", meta: "Haiti · Yard 3" },
];

export default function WholesaleSearch() {
  const { t } = useTranslation();
  const [q, setQ] = useState("rice");
  const results = ALL.filter((p) => p.title.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <WholesalePageGate>
      <WholesaleShell title={t("wholesale.searchTitle", { defaultValue: "Search wholesale" })}>
        <div className="relative mb-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-11 w-full rounded-xl border border-border bg-white pl-9 pr-3 text-sm dark:bg-[hsl(152,16%,12%)]"
            data-testid="wholesale-search-page"
          />
        </div>
        <p className="mb-2 text-xs text-muted-foreground">{results.length} results · chat only</p>
        <div className="space-y-2">
          {results.map((p) => (
            <WholesaleListCard key={p.id} href={`/wholesale/products/${p.id}`} title={p.title} meta={p.meta} badge="Wholesale" />
          ))}
        </div>
      </WholesaleShell>
    </WholesalePageGate>
  );
}
