import { useState } from "react";
import { useTranslation } from "react-i18next";
import { WholesalePageGate } from "@/components/wholesale/WholesalePageGate";
import { WholesaleShell } from "@/components/wholesale/WholesaleShell";
import { SUPPORTED_COUNTRIES, COUNTRY_FLAGS } from "@/lib/countries";

export default function WholesaleSellerWarehouse() {
  const { t } = useTranslation();
  const [name, setName] = useState("Flexa Delmas Depot");
  const [country, setCountry] = useState("Haiti");
  const [city, setCity] = useState("Delmas");
  const [address, setAddress] = useState("Route de Delmas 33");

  return (
    <WholesalePageGate>
      <WholesaleShell
        title={t("wholesale.myDepotTitle", { defaultValue: "My warehouse" })}
        subtitle={t("wholesale.myDepotSubtitle", { defaultValue: "Buyers see this depot on your wholesale listings." })}
      >
        <form className="space-y-3 rounded-2xl border border-border/70 bg-white p-4 dark:bg-[hsl(152,16%,12%)]" onSubmit={(e) => e.preventDefault()}>
          <div>
            <label className="text-xs font-semibold uppercase text-muted-foreground">Depot name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" data-testid="wholesale-depot-name" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-semibold uppercase text-muted-foreground">Country</label>
              <select value={country} onChange={(e) => setCountry(e.target.value)} className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm">
                {SUPPORTED_COUNTRIES.map((c) => (
                  <option key={c} value={c}>{COUNTRY_FLAGS[c]} {c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase text-muted-foreground">City</label>
              <input value={city} onChange={(e) => setCity(e.target.value)} className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold uppercase text-muted-foreground">Address</label>
            <input value={address} onChange={(e) => setAddress(e.target.value)} className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" />
          </div>
          <p className="text-xs text-muted-foreground">Pickup from this depot only — no retail shipping cart.</p>
          <button type="submit" className="h-11 w-full rounded-xl bg-[hsl(152,55%,28%)] text-sm font-bold text-white">Save depot</button>
        </form>
      </WholesaleShell>
    </WholesalePageGate>
  );
}
