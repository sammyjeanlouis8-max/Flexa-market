import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { ChevronLeft, Scissors } from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { isSuperAdminUser } from "@/lib/adminCountryAccess";
import {
  decideBeautyBusiness,
  fetchBeautyAdminBusinesses,
  fetchBeautyAdminCategories,
  fetchBeautyAdminCountries,
  fetchBeautyAdminOverview,
  saveBeautyAdminCountries,
  type BeautyAdminOverview,
  type BeautyBusiness,
  type BeautyCategory,
} from "@/lib/beautyApi";

type Tab = "stats" | "applications" | "categories" | "countries";

export default function AdminBeauty() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("applications");
  const [overview, setOverview] = useState<BeautyAdminOverview | null>(null);
  const [businesses, setBusinesses] = useState<BeautyBusiness[]>([]);
  const [categories, setCategories] = useState<BeautyCategory[]>([]);
  const [countries, setCountries] = useState<
    Array<{ countryCode: string; enabled: boolean; status: string; notes?: string }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("submitted");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ov, biz, cats, countriesRows] = await Promise.all([
        fetchBeautyAdminOverview(),
        fetchBeautyAdminBusinesses(statusFilter || undefined),
        fetchBeautyAdminCategories(),
        fetchBeautyAdminCountries(),
      ]);
      setOverview(ov);
      setBusinesses(biz);
      setCategories(cats);
      setCountries(countriesRows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    if (isSuperAdminUser(user as any)) void load();
  }, [user, load]);

  async function decide(id: number, decision: string) {
    const notes =
      decision === "reject" || decision === "additional_info" || decision === "suspend"
        ? window.prompt("Notes (required):")?.trim()
        : window.prompt("Notes (optional):")?.trim() || undefined;
    if ((decision === "reject" || decision === "additional_info" || decision === "suspend") && !notes) {
      return;
    }
    setBusy(`${id}-${decision}`);
    try {
      await decideBeautyBusiness(id, { decision, notes });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(null);
    }
  }

  async function toggleCountry(code: string, enabled: boolean) {
    setBusy(`country-${code}`);
    try {
      await saveBeautyAdminCountries([
        {
          countryCode: code,
          enabled,
          status: enabled ? "approved" : "under_review",
        },
      ]);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(null);
    }
  }

  if (!isSuperAdminUser(user as any)) {
    return (
      <div className="mx-auto max-w-lg p-6">
        <p className="text-sm text-muted-foreground">Super Admin access required.</p>
      </div>
    );
  }

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "applications", label: t("beauty.applications") },
    { id: "stats", label: t("beauty.stats") },
    { id: "categories", label: t("beauty.categories") },
    { id: "countries", label: t("beauty.countries") },
  ];

  return (
    <div className="mx-auto max-w-3xl px-4 pb-10 pt-4" data-testid="admin-beauty-page">
      <Link href="/admin/more" className="inline-flex items-center gap-1 text-sm font-semibold text-[hsl(350,45%,35%)]">
        <ChevronLeft className="h-4 w-4" /> {t("adminNav.more", { defaultValue: "More" })}
      </Link>
      <div className="mt-3 flex items-center gap-2">
        <Scissors className="h-6 w-6 text-[hsl(350,45%,38%)]" />
        <h1 className="text-2xl font-black tracking-tight">{t("beauty.adminTitle")}</h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{t("beauty.adminSubtitle")}</p>

      <div className="mt-4 flex gap-1 overflow-x-auto">
        {tabs.map((tabItem) => (
          <button
            key={tabItem.id}
            type="button"
            onClick={() => setTab(tabItem.id)}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold ${
              tab === tabItem.id
                ? "bg-[hsl(350,45%,38%)] text-white"
                : "border border-[hsl(350,20%,88%)] bg-white"
            }`}
          >
            {tabItem.label}
          </button>
        ))}
      </div>

      {error && (
        <p className="mt-3 text-sm font-semibold text-[hsl(0,55%,40%)]">{error}</p>
      )}

      {loading ? (
        <p className="mt-6 text-sm text-muted-foreground">{t("beauty.loading")}</p>
      ) : (
        <div className="mt-4 space-y-3">
          {tab === "stats" && overview && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {[
                ["Businesses", overview.businesses.total],
                ["Approved", overview.businesses.approved],
                ["Submitted", overview.businesses.submitted],
                ["Suspended", overview.businesses.suspended],
                ["Appointments", overview.appointments.total],
                ["Open reports", overview.openReports],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-xl border border-[hsl(350,20%,88%)] bg-white px-3 py-3">
                  <p className="text-[10px] font-semibold uppercase text-muted-foreground">{label}</p>
                  <p className="mt-1 text-xl font-black">{value}</p>
                </div>
              ))}
              <div className="col-span-2 rounded-xl border border-[hsl(350,20%,88%)] bg-[hsl(350,40%,97%)] px-3 py-3 text-sm sm:col-span-3">
                Public launch: <strong>{overview.publicLaunch ? "ON" : "OFF (Super Admin preview)"}</strong>
              </div>
            </div>
          )}

          {tab === "applications" && (
            <>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-lg border border-[hsl(350,20%,88%)] px-2 py-1.5 text-sm"
              >
                <option value="">All</option>
                <option value="submitted">Submitted</option>
                <option value="under_review">Under review</option>
                <option value="additional_info_required">Additional info</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="suspended">Suspended</option>
                <option value="draft">Draft</option>
              </select>
              {businesses.length === 0 ? (
                <p className="text-sm text-muted-foreground">No applications.</p>
              ) : (
                businesses.map((b) => (
                  <article key={b.id} className="rounded-xl border border-[hsl(350,20%,88%)] bg-white p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-bold text-sm">{b.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {b.businessType} · {b.city}, {b.country} · {b.status}
                        </p>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {[
                        ["approve", t("beauty.approve")],
                        ["reject", t("beauty.reject")],
                        ["additional_info", t("beauty.additionalInfo")],
                        ["under_review", t("beauty.underReview")],
                        ["suspend", t("beauty.suspend")],
                        ["reactivate", t("beauty.reactivate")],
                      ].map(([decision, label]) => (
                        <button
                          key={decision}
                          type="button"
                          disabled={busy === `${b.id}-${decision}`}
                          onClick={() => void decide(b.id, decision)}
                          className="rounded-lg border border-[hsl(350,20%,88%)] px-2 py-1 text-[11px] font-semibold"
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </article>
                ))
              )}
            </>
          )}

          {tab === "categories" && (
            <div className="space-y-2">
              {categories.length === 0 ? (
                <p className="text-sm text-muted-foreground">No categories.</p>
              ) : (
                categories.map((c) => (
                  <div key={c.id} className="rounded-xl border border-[hsl(350,20%,88%)] bg-white px-3 py-2.5 text-sm">
                    <p className="font-bold">{c.nameEn}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.slug} · {c.kind} · {c.isActive === false ? "inactive" : "active"}
                    </p>
                  </div>
                ))
              )}
            </div>
          )}

          {tab === "countries" && (
            <div className="space-y-2">
              {countries.length === 0 ? (
                <p className="text-sm text-muted-foreground">No country rows yet.</p>
              ) : (
                countries.map((c) => (
                  <div
                    key={c.countryCode}
                    className="flex items-center justify-between rounded-xl border border-[hsl(350,20%,88%)] bg-white px-3 py-2.5"
                  >
                    <div>
                      <p className="text-sm font-bold">{c.countryCode}</p>
                      <p className="text-xs text-muted-foreground">{c.status}</p>
                    </div>
                    <button
                      type="button"
                      disabled={busy === `country-${c.countryCode}`}
                      onClick={() => void toggleCountry(c.countryCode, !c.enabled)}
                      className="rounded-lg bg-[hsl(350,40%,95%)] px-2.5 py-1.5 text-xs font-semibold text-[hsl(350,45%,35%)]"
                    >
                      {c.enabled ? "Disable" : "Enable"}
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
