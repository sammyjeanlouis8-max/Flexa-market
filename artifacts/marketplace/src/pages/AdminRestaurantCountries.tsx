import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { ChevronLeft, Globe2, ShieldAlert } from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { isSuperAdminUser } from "@/lib/adminCountryAccess";

type CountryRow = {
  countryCode: string;
  countryName: string;
  status: string;
  enabled: boolean;
  restaurantsEnabled: boolean;
  foodTrucksEnabled: boolean;
  homeKitchensEnabled: boolean;
  cateringEnabled: boolean;
  requiredLicensesNote: string;
  foodSafetyRequirementsNote: string;
  regulatoryReviewNotes: string;
  approvalDocumentUrl: string | null;
  suspensionReason: string | null;
  approvedAt: string | null;
};

type Jurisdiction = {
  id: number;
  countryCode: string;
  level: string;
  name: string;
  status: string;
  enabled: boolean;
};

type AuditLog = {
  id: number;
  action: string;
  countryCode: string | null;
  details: string;
  createdAt: string;
};

const STATUSES = ["not_reviewed", "under_review", "approved", "restricted", "suspended"] as const;

function authHeaders(): HeadersInit {
  const token = localStorage.getItem("flexamarket_token") ?? localStorage.getItem("token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/**
 * Super Admin Control Center → Flexa Restaurant → Country Availability
 */
export default function AdminRestaurantCountries() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [countries, setCountries] = useState<CountryRow[]>([]);
  const [selected, setSelected] = useState<CountryRow | null>(null);
  const [jurisdictions, setJurisdictions] = useState<Jurisdiction[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [jName, setJName] = useState("");
  const [jLevel, setJLevel] = useState("municipality");
  const [reqKey, setReqKey] = useState("food_service_permit");
  const [reqLabel, setReqLabel] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cRes, aRes] = await Promise.all([
        fetch("/api/admin/restaurants/countries", { headers: authHeaders() }),
        fetch("/api/admin/restaurants/regulatory-audit?limit=40", { headers: authHeaders() }),
      ]);
      if (!cRes.ok) throw new Error((await cRes.json().catch(() => ({}))).error || "Failed to load countries");
      const cData = await cRes.json();
      setCountries(cData.countries ?? []);
      if (aRes.ok) {
        const aData = await aRes.json();
        setLogs(aData.logs ?? []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isSuperAdminUser(user as any)) void load();
  }, [user, load]);

  async function selectCountry(row: CountryRow) {
    setSelected({ ...row });
    const res = await fetch(`/api/admin/restaurants/countries/${row.countryCode}/jurisdictions`, {
      headers: authHeaders(),
    });
    if (res.ok) {
      const data = await res.json();
      setJurisdictions(data.jurisdictions ?? []);
    } else {
      setJurisdictions([]);
    }
  }

  async function saveCountry() {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/restaurants/countries/${selected.countryCode}`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify(selected),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Save failed");
      await load();
      setSelected(data.country);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  async function addJurisdiction() {
    if (!selected || !jName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/restaurants/countries/${selected.countryCode}/jurisdictions`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({
          level: jLevel,
          name: jName.trim(),
          status: "under_review",
          enabled: false,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed");
      const data = await res.json();
      setJurisdictions(data.jurisdictions ?? []);
      setJName("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  async function addRequirement() {
    if (!selected || !reqLabel.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/restaurants/countries/${selected.countryCode}/requirements`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          requirementKey: reqKey,
          label: reqLabel.trim(),
          required: true,
          businessType: "*",
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed");
      setReqLabel("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  if (!isSuperAdminUser(user as any)) {
    return (
      <div className="mx-auto max-w-lg p-6">
        <p className="text-sm text-muted-foreground">
          {t("restaurant.superAdminOnly", { defaultValue: "Super Admin access required." })}
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 pb-12 pt-4" data-testid="admin-restaurant-countries">
      <Link href="/admin/restaurants" className="inline-flex items-center gap-1 text-sm font-semibold text-[hsl(152,55%,28%)]">
        <ChevronLeft className="h-4 w-4" /> Flexa Restaurant
      </Link>
      <div className="mt-3 flex items-center gap-2">
        <Globe2 className="h-6 w-6 text-[hsl(152,55%,28%)]" />
        <h1 className="text-2xl font-black tracking-tight">
          {t("restaurant.countryAvailability", { defaultValue: "Country Availability" })}
        </h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Default-deny. United States and Canada start disabled. Haiti is under review and not publicly activated.
        Public activation requires status <strong>approved</strong> and <strong>enabled</strong> with documented review notes.
      </p>
      <p className="mt-2 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
        Operational flags do not eliminate legal responsibilities of Flexa Technology LLC or food businesses.
      </p>

      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      {loading ? (
        <p className="mt-6 text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div>
            <h2 className="text-sm font-black uppercase tracking-wide">Countries</h2>
            <ul className="mt-2 space-y-2">
              {countries.map((c) => (
                <li key={c.countryCode}>
                  <button
                    type="button"
                    onClick={() => void selectCountry(c)}
                    className={`w-full rounded-xl border px-3 py-2 text-left text-sm ${
                      selected?.countryCode === c.countryCode
                        ? "border-[hsl(152,55%,40%)] bg-[hsl(152,45%,95%)]"
                        : "border-border bg-card"
                    }`}
                  >
                    <span className="font-bold">{c.countryName}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{c.countryCode}</span>
                    <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {c.status.replace(/_/g, " ")} · {c.enabled ? "enabled" : "disabled"}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div>
            {selected ? (
              <div className="space-y-3 rounded-2xl border bg-card p-4">
                <h2 className="font-black">{selected.countryName}</h2>
                <label className="block text-xs font-bold uppercase">
                  Compliance status
                  <select
                    value={selected.status}
                    onChange={(e) => setSelected({ ...selected, status: e.target.value })}
                    className="mt-1 w-full rounded-xl border px-3 py-2 text-sm font-normal normal-case"
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selected.enabled}
                    onChange={(e) => setSelected({ ...selected, enabled: e.target.checked })}
                  />
                  Enabled for public activation
                </label>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {(
                    [
                      ["restaurantsEnabled", "Restaurants"],
                      ["foodTrucksEnabled", "Food Trucks"],
                      ["homeKitchensEnabled", "Home Kitchens"],
                      ["cateringEnabled", "Catering"],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={!!selected[key]}
                        onChange={(e) => setSelected({ ...selected, [key]: e.target.checked })}
                      />
                      {label}
                    </label>
                  ))}
                </div>
                <label className="block text-xs font-bold uppercase">
                  Required licenses / permits
                  <textarea
                    value={selected.requiredLicensesNote}
                    onChange={(e) => setSelected({ ...selected, requiredLicensesNote: e.target.value })}
                    className="mt-1 w-full rounded-xl border px-3 py-2 text-sm font-normal normal-case"
                    rows={2}
                  />
                </label>
                <label className="block text-xs font-bold uppercase">
                  Food safety requirements
                  <textarea
                    value={selected.foodSafetyRequirementsNote}
                    onChange={(e) => setSelected({ ...selected, foodSafetyRequirementsNote: e.target.value })}
                    className="mt-1 w-full rounded-xl border px-3 py-2 text-sm font-normal normal-case"
                    rows={2}
                  />
                </label>
                <label className="block text-xs font-bold uppercase">
                  Regulatory review notes (required to approve)
                  <textarea
                    value={selected.regulatoryReviewNotes}
                    onChange={(e) => setSelected({ ...selected, regulatoryReviewNotes: e.target.value })}
                    className="mt-1 w-full rounded-xl border px-3 py-2 text-sm font-normal normal-case"
                    rows={3}
                  />
                </label>
                <label className="block text-xs font-bold uppercase">
                  Approval document URL
                  <input
                    value={selected.approvalDocumentUrl || ""}
                    onChange={(e) => setSelected({ ...selected, approvalDocumentUrl: e.target.value || null })}
                    className="mt-1 w-full rounded-xl border px-3 py-2 text-sm font-normal normal-case"
                    placeholder="Wasabi / storage path"
                  />
                </label>
                <label className="block text-xs font-bold uppercase">
                  Suspension reason
                  <input
                    value={selected.suspensionReason || ""}
                    onChange={(e) => setSelected({ ...selected, suspensionReason: e.target.value || null })}
                    className="mt-1 w-full rounded-xl border px-3 py-2 text-sm font-normal normal-case"
                  />
                </label>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void saveCountry()}
                  className="w-full rounded-full bg-[hsl(152,55%,28%)] py-2.5 text-sm font-bold text-white disabled:opacity-60"
                >
                  {saving ? "Saving…" : "Save country policy"}
                </button>

                <div className="border-t pt-3">
                  <h3 className="text-xs font-black uppercase tracking-wide">Regions / municipalities</h3>
                  <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                    {jurisdictions.map((j) => (
                      <li key={j.id}>{j.level}: {j.name} · {j.status} · {j.enabled ? "on" : "off"}</li>
                    ))}
                    {!jurisdictions.length && <li>None configured</li>}
                  </ul>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <select value={jLevel} onChange={(e) => setJLevel(e.target.value)} className="rounded-xl border px-2 py-1.5 text-sm">
                      <option value="state">State</option>
                      <option value="province">Province</option>
                      <option value="region">Region</option>
                      <option value="municipality">Municipality</option>
                    </select>
                    <input value={jName} onChange={(e) => setJName(e.target.value)} placeholder="Name" className="flex-1 rounded-xl border px-2 py-1.5 text-sm" />
                    <button type="button" onClick={() => void addJurisdiction()} className="rounded-full border px-3 py-1.5 text-xs font-bold">
                      Add
                    </button>
                  </div>
                </div>

                <div className="border-t pt-3">
                  <h3 className="text-xs font-black uppercase tracking-wide">Compliance requirement</h3>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <select value={reqKey} onChange={(e) => setReqKey(e.target.value)} className="rounded-xl border px-2 py-1.5 text-sm">
                      <option value="identity">Owner identity</option>
                      <option value="business_registration">Business registration</option>
                      <option value="food_service_permit">Food-service permit</option>
                      <option value="health_permit">Health / sanitation</option>
                      <option value="food_truck_permit">Food Truck permit</option>
                      <option value="home_kitchen_auth">Home Kitchen authorization</option>
                      <option value="insurance">Insurance</option>
                      <option value="food_safety_cert">Food safety certification</option>
                      <option value="allergen_disclosure">Allergen disclosure</option>
                      <option value="tax_registration">Tax registration</option>
                    </select>
                    <input value={reqLabel} onChange={(e) => setReqLabel(e.target.value)} placeholder="Label" className="flex-1 rounded-xl border px-2 py-1.5 text-sm" />
                    <button type="button" onClick={() => void addRequirement()} className="rounded-full border px-3 py-1.5 text-xs font-bold">
                      Add requirement
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Select a country to configure.</p>
            )}
          </div>
        </div>
      )}

      <h2 className="mt-10 text-sm font-black uppercase tracking-wide">Regulatory audit log</h2>
      <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto text-xs text-muted-foreground">
        {logs.map((l) => (
          <li key={l.id} className="rounded border px-2 py-1">
            {new Date(l.createdAt).toLocaleString()} · {l.action}
            {l.countryCode ? ` · ${l.countryCode}` : ""} · {l.details.slice(0, 120)}
          </li>
        ))}
        {!logs.length && <li>No audit entries yet.</li>}
      </ul>
    </div>
  );
}
