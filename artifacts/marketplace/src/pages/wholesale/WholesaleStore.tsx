import { Link, useRoute } from "wouter";
import { useTranslation } from "react-i18next";
import { MessageCircle, Warehouse } from "lucide-react";
import { WholesalePageGate } from "@/components/wholesale/WholesalePageGate";
import { WholesaleListCard, WholesaleShell, WholesaleStat } from "@/components/wholesale/WholesaleShell";
import { WHOLESALE_WAREHOUSES } from "@/lib/wholesaleDemo";

export default function WholesaleStore() {
  const { t } = useTranslation();
  const [, params] = useRoute("/wholesale/stores/:id");
  const id = Number(params?.id);
  const depot = WHOLESALE_WAREHOUSES.find((w) => w.id === id) ?? WHOLESALE_WAREHOUSES[0];

  return (
    <WholesalePageGate>
      <WholesaleShell
        title={depot.seller}
        subtitle={`${depot.name} · ${depot.city}, ${depot.country}`}
        actions={
          <Link
            href="/messages"
            className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-[12px] font-bold text-[hsl(152,65%,18%)]"
          >
            <MessageCircle className="h-3.5 w-3.5" />
            Chat
          </Link>
        }
      >
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <WholesaleStat label="Listings" value={depot.products} />
          <WholesaleStat label="Country" value={depot.country} />
          <WholesaleStat label="Model" value="Chat only" />
        </div>
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-[hsl(152,30%,80%)] bg-[hsl(152,40%,96%)] px-3 py-2 text-sm text-[hsl(152,40%,24%)]">
          <Warehouse className="h-4 w-4" />
          {depot.name} · {depot.city}
        </div>
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <WholesaleListCard
              key={i}
              href="/wholesale/products/101"
              title={`${depot.seller} listing ${i}`}
              meta={`From ${depot.name}`}
              badge="Active"
            />
          ))}
        </div>
      </WholesaleShell>
    </WholesalePageGate>
  );
}
