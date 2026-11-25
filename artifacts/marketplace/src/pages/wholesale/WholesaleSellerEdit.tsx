import { useRoute } from "wouter";
import { useTranslation } from "react-i18next";
import { WholesalePageGate } from "@/components/wholesale/WholesalePageGate";
import { WholesaleShell } from "@/components/wholesale/WholesaleShell";

export default function WholesaleSellerEdit() {
  const { t } = useTranslation();
  const [, params] = useRoute("/wholesale/seller/products/:id/edit");
  const id = params?.id ?? "101";

  return (
    <WholesalePageGate>
      <WholesaleShell
        title={t("wholesale.editTitle", { defaultValue: "Edit listing" })}
        subtitle={`#${id} · ${t("wholesale.editSubtitle")}`}
      >
        <form className="space-y-3 rounded-2xl border border-border/70 bg-white p-4 dark:bg-[hsl(152,16%,12%)]" onSubmit={(e) => e.preventDefault()}>
          <div>
            <label className="text-xs font-semibold uppercase text-muted-foreground">{t("wholesale.formTitle")}</label>
            <input defaultValue="Rice 50lb bags — Port-au-Prince warehouse" className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold uppercase text-muted-foreground">{t("wholesale.unitPrice")}</label>
              <input defaultValue="28.50" type="number" step="0.01" className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase text-muted-foreground">{t("wholesale.stock")}</label>
              <input defaultValue="420" type="number" className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold uppercase text-muted-foreground">{t("wholesale.depot")}</label>
            <input defaultValue="Flexa Delmas Depot" className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" />
          </div>
          <button type="submit" className="h-11 w-full rounded-xl bg-[hsl(152,55%,28%)] text-sm font-bold text-white">{t("wholesale.saveChanges")}</button>
        </form>
      </WholesaleShell>
    </WholesalePageGate>
  );
}
