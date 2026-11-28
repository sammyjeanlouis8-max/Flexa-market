import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { WholesalePageGate } from "@/components/wholesale/WholesalePageGate";
import { WholesaleShell } from "@/components/wholesale/WholesaleShell";
import { useAuth } from "@/contexts/auth";
import { wholesaleSellerSettings } from "@/lib/wholesaleApi";

function SettingsForm({ userId }: { userId: number }) {
  const { t } = useTranslation();
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const settings = useQuery({
    queryKey: ["wholesale-settings", userId], queryFn: () => wholesaleSellerSettings(), gcTime: 0,
  });

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setSaving(true);
    setNotice("");
    try {
      await wholesaleSellerSettings({
        company: String(data.get("company")).trim(),
        chatAuto: data.has("chatAuto"),
        showStock: data.has("showStock"),
      });
      setNotice("wholesale.changesSaved");
    } catch {
      setNotice("wholesale.saveFailed");
    } finally {
      setSaving(false);
    }
  }
  const values = settings.data;
  return (
    <WholesaleShell title={t("wholesale.sellerSettingsTitle")}>
      {values ? (
        <form onSubmit={save} onChange={() => setNotice("")}>
          <fieldset disabled={saving} className="space-y-4 rounded-2xl border p-4">
            <label className="block">{t("wholesale.companyLabel")}
              <input name="company" maxLength={160} defaultValue={values.company} className="mt-1 h-11 w-full rounded-xl border px-3" />
            </label>
            <label className="flex justify-between">{t("wholesale.chatAutoLabel")}
              <input type="checkbox" name="chatAuto" defaultChecked={values.chatAuto} />
            </label>
            <label className="flex justify-between">{t("wholesale.showStockLabel")}
              <input type="checkbox" name="showStock" defaultChecked={values.showStock} />
            </label>
            <button className="h-11 w-full rounded-xl bg-[hsl(152,55%,28%)] font-bold text-white">{t("wholesale.saveChanges")}</button>
          </fieldset>
        </form>
      ) : <p>{t(settings.isLoading ? "common.loading" : "wholesale.failedLoad")}</p>}
      {notice && <p role="status">{t(notice)}</p>}
    </WholesaleShell>
  );
}

export default function WholesaleSellerSettings() {
  const { user } = useAuth();
  return <WholesalePageGate requireAuth>{user && <SettingsForm key={user.id} userId={user.id} />}</WholesalePageGate>;
}
