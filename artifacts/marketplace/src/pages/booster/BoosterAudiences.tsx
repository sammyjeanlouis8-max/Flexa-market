import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Trash2, Plus } from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { useToast } from "@/hooks/use-toast";
import BoosterLayout from "./BoosterLayout";

interface Audience {
  id: number;
  name: string;
  country: string;
  state: string | null;
  cities: string[];
  radiusKm: number | null;
}

export default function BoosterAudiences() {
  const { t } = useTranslation();
  const { token, user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [audiences, setAudiences] = useState<Audience[]>([]);
  const [name, setName] = useState("");
  const [state, setState] = useState("Ouest");
  const [city, setCity] = useState("Port-au-Prince");
  const [radiusKm, setRadiusKm] = useState(25);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!token) { setLoading(false); return; }
    const res = await fetch("/api/booster/audiences", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    setAudiences(data.audiences || []);
    setLoading(false);
  };

  useEffect(() => { void load(); }, [token]);

  const save = async () => {
    if (!token || !name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/booster/audiences", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: name.trim(),
          country: user?.country || "Haiti",
          state,
          cities: [city],
          radiusKm,
          audienceType: "custom",
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        toast({ title: d.error || t("booster.audiences.saveFailed"), variant: "destructive" });
        return;
      }
      setName("");
      toast({ title: t("booster.audiences.saved") });
      await load();
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: number) => {
    if (!token) return;
    await fetch(`/api/booster/audiences/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    setAudiences((prev) => prev.filter((a) => a.id !== id));
  };

  return (
    <BoosterLayout
      title={t("booster.audiences.title")}
      subtitle={t("booster.audiences.subtitle")}
    >
      <div className="bp-card mb-4">
        <div className="font-bold text-sm mb-2">{t("booster.audiences.new")}</div>
        <label className="bp-label">{t("booster.audiences.name")}</label>
        <input className="bp-input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("booster.audiences.namePh")} data-testid="booster-audience-name" />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="bp-label">{t("booster.audience.department")}</label>
            <input className="bp-input" value={state} onChange={(e) => setState(e.target.value)} />
          </div>
          <div>
            <label className="bp-label">{t("booster.audience.cities")}</label>
            <input className="bp-input" value={city} onChange={(e) => setCity(e.target.value)} />
          </div>
        </div>
        <label className="bp-label">{t("booster.audience.radius")} — {radiusKm} km</label>
        <input type="range" min={5} max={100} step={5} value={radiusKm} onChange={(e) => setRadiusKm(Number(e.target.value))} className="w-full accent-violet-600" />
        <div className="bp-actions">
          <button type="button" className="bp-btn bp-btn-primary" disabled={saving || !name.trim()} onClick={() => void save()} data-testid="booster-audience-save">
            <Plus className="h-4 w-4 inline mr-1" /> {t("booster.audiences.save")}
          </button>
        </div>
      </div>

      <div className="bp-card">
        {loading ? (
          <div className="bp-empty"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>
        ) : audiences.length === 0 ? (
          <div className="bp-empty">{t("booster.audiences.empty")}</div>
        ) : (
          audiences.map((a) => (
            <div key={a.id} className="bp-campaign" data-testid={`booster-audience-${a.id}`}>
              <div className="bp-avatar">{a.name.slice(0, 2).toUpperCase()}</div>
              <div>
                <div className="font-bold text-sm">{a.name}</div>
                <div className="text-xs text-slate-500">
                  {a.country}{a.state ? ` · ${a.state}` : ""}
                  {a.cities?.length ? ` · ${a.cities.join(", ")}` : ""}
                  {a.radiusKm ? ` · ${a.radiusKm} km` : ""}
                </div>
              </div>
              <button type="button" className="bp-btn bp-btn-ghost" onClick={() => void remove(a.id)} aria-label="Delete">
                <Trash2 className="h-4 w-4 text-red-500" />
              </button>
            </div>
          ))
        )}
      </div>
    </BoosterLayout>
  );
}
