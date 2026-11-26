import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/auth";
import { WholesalePageGate } from "@/components/wholesale/WholesalePageGate";
import { WholesaleShell } from "@/components/wholesale/WholesaleShell";
import { fetchWholesaleProduct, updateWholesaleProduct } from "@/lib/wholesaleApi";

function ProductEditor({ id }: { id: number }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const product = useQuery({
    queryKey: ["wholesale-edit", user?.id, id],
    queryFn: () => fetchWholesaleProduct(id),
    gcTime: 0,
    enabled: Number.isSafeInteger(id) && id > 0,
  });

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const title = String(data.get("title")).trim();
    if (title.length < 3) {
      setNotice("wholesale.invalidTitle");
      return;
    }
    setSaving(true);
    setNotice("");
    try {
      await updateWholesaleProduct(id, {
        title, unitPrice: Number(data.get("price")), stockQuantity: Number(data.get("stock")),
      });
      setNotice("wholesale.changesSaved");
    } catch {
      setNotice("wholesale.saveFailed");
    } finally {
      setSaving(false);
    }
  }

  const item = product.data;
  const field = "mt-1 block h-11 w-full rounded-xl border border-border bg-background px-3";
  return (
    <WholesaleShell title={t("wholesale.editTitle")} subtitle={`#${id}`}>
      {item ? (
        <form onSubmit={save} onChange={() => setNotice("")}>
          <fieldset disabled={saving} className="space-y-3 rounded-2xl border p-4">
            <label className="block">{t("wholesale.formTitle")}
              <input className={field} name="title" defaultValue={item.title} required minLength={3} maxLength={160} />
            </label>
            <label className="block">{t("wholesale.unitPrice")} ({item.currency})
              <input className={field} name="price" defaultValue={item.unitPrice} required type="number" min="0.01" step="any" />
            </label>
            <label className="block">{t("wholesale.stock")}
              <input className={field} name="stock" defaultValue={item.stockQuantity} required type="number" min="0" max="2147483647" step="1" />
            </label>
            <p>{t("wholesale.depot")} · {item.warehouse?.name ?? item.warehouseName ?? "—"}</p>
            <button className="h-11 w-full rounded-xl bg-[hsl(152,55%,28%)] font-bold text-white">{t("wholesale.saveChanges")}</button>
          </fieldset>
        </form>
      ) : <p>{t(product.isLoading ? "common.loading" : "wholesale.failedLoad")}</p>}
      {notice && <p role="status">{t(notice)}</p>}
    </WholesaleShell>
  );
}

export default function WholesaleSellerEdit() {
  const [, params] = useRoute("/wholesale/seller/products/:id/edit");
  const { user } = useAuth();
  return <WholesalePageGate><ProductEditor key={`${user?.id}/${params?.id}`} id={Number(params?.id)} /></WholesalePageGate>;
}
