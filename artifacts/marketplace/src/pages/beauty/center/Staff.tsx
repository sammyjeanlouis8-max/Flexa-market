import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { useTranslation } from "react-i18next";
import { BeautyPageGate } from "@/components/beauty/BeautyPageGate";
import { BeautyEmpty, BeautyShell } from "@/components/beauty/BeautyShell";
import {
  createBeautyProfessional,
  fetchMyBeautyBusiness,
  updateBeautyProfessional,
  type BeautyProfessional,
} from "@/lib/beautyApi";
import { CenterNav } from "./CenterNav";

export default function BeautyCenterStaff() {
  const { businessId } = useParams<{ businessId: string }>();
  return (
    <BeautyPageGate requireAuth>
      <BeautyShell title="Staff">
        <Body id={Number(businessId)} />
      </BeautyShell>
    </BeautyPageGate>
  );
}

function Body({ id }: { id: number }) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<BeautyProfessional[]>([]);
  const [loading, setLoading] = useState(true);
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("stylist");
  const [busy, setBusy] = useState(false);

  function load() {
    setLoading(true);
    fetchMyBeautyBusiness(id)
      .then((d) => setRows(d.professionals ?? []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, [id]);

  async function onAdd() {
    if (!fullName.trim()) return;
    setBusy(true);
    try {
      await createBeautyProfessional(id, { fullName: fullName.trim(), role });
      setFullName("");
      load();
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(p: BeautyProfessional) {
    await updateBeautyProfessional(id, p.id, { isActive: !p.isActive });
    load();
  }

  return (
    <div>
      <CenterNav businessId={id} />
      {loading ? (
        <p className="text-sm text-muted-foreground">{t("beauty.loading")}</p>
      ) : rows.length === 0 ? (
        <BeautyEmpty title={t("beauty.emptyStaffTitle")} body="" />
      ) : (
        <div className="space-y-2">
          {rows.map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded-xl border border-[hsl(350,20%,88%)] bg-white px-3 py-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 overflow-hidden rounded-full bg-[hsl(350,30%,94%)]">
                  {p.photoUrl ? <img src={p.photoUrl} alt="" className="h-full w-full object-cover" /> : null}
                </div>
                <div>
                  <p className="text-sm font-bold">{p.fullName}</p>
                  <p className="text-xs text-muted-foreground">{p.role} · {p.isActive ? "active" : "inactive"}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void toggleActive(p)}
                className="text-xs font-semibold text-[hsl(350,45%,40%)]"
              >
                {p.isActive ? "Deactivate" : "Activate"}
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 space-y-2 rounded-2xl border border-[hsl(350,20%,88%)] bg-white p-3">
        <p className="text-sm font-extrabold">{t("beauty.addProfessional")}</p>
        <input
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Full name"
          className="w-full rounded-lg border border-[hsl(350,20%,88%)] px-3 py-2 text-sm"
        />
        <input
          value={role}
          onChange={(e) => setRole(e.target.value)}
          placeholder="Role"
          className="w-full rounded-lg border border-[hsl(350,20%,88%)] px-3 py-2 text-sm"
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => void onAdd()}
          className="rounded-xl bg-[hsl(350,45%,38%)] px-4 py-2.5 text-sm font-bold text-white"
        >
          {t("beauty.save")}
        </button>
      </div>
    </div>
  );
}
