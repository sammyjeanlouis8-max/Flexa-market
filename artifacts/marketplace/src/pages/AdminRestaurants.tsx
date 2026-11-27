import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { BadgeCheck, Ban, ChevronLeft, UtensilsCrossed } from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { isSuperAdminUser } from "@/lib/adminCountryAccess";

type PendingIdv = {
  id: number;
  restaurantId: number;
  legalName: string;
  countryOfResidence: string;
  documentType: string;
  status: string;
  restaurantName?: string;
  documentFrontUrl?: string;
  selfieUrl?: string;
};

type RestaurantRow = {
  id: number;
  name: string;
  city: string;
  country: string;
  status: string;
  identityStatus: string;
  suspensionReason?: string | null;
};

function authHeaders(): HeadersInit {
  const token = localStorage.getItem("flexamarket_token") ?? localStorage.getItem("token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/**
 * Super Admin Control — Flexa Restaurant identity + suspension tools.
 * Document URLs are short-lived authorized proxies (never public Wasabi links).
 */
export default function AdminRestaurants() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [pending, setPending] = useState<PendingIdv[]>([]);
  const [restaurants, setRestaurants] = useState<RestaurantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [idvRes, listRes] = await Promise.all([
        fetch("/api/admin/restaurants/identity/pending", { headers: authHeaders() }),
        fetch("/api/admin/restaurants", { headers: authHeaders() }),
      ]);
      if (!idvRes.ok || !listRes.ok) throw new Error("Failed to load restaurant admin data");
      const idvData = await idvRes.json();
      const listData = await listRes.json();
      setPending(idvData.submissions ?? idvData.pending ?? []);
      setRestaurants(listData.restaurants ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isSuperAdminUser(user as any)) void load();
  }, [user, load]);

  async function decide(idvId: number, decision: "verified" | "rejected", reason?: string) {
    setBusy(`idv-${idvId}`);
    try {
      const res = await fetch(`/api/admin/restaurants/identity/${idvId}/decide`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ decision, rejectionReason: reason }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Decision failed");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(null);
    }
  }

  async function suspend(id: number) {
    const reason = window.prompt("Suspension reason (required):")?.trim();
    if (!reason) return;
    setBusy(`suspend-${id}`);
    try {
      const res = await fetch(`/api/admin/restaurants/${id}/suspend`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Suspend failed");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(null);
    }
  }

  async function decideApplication(id: number, decision: string) {
    const note =
      decision === "rejected" || decision === "additional_info_required"
        ? window.prompt("Note for the owner (required):")?.trim()
        : undefined;
    if ((decision === "rejected" || decision === "additional_info_required") && !note) return;
    setBusy(`app-${id}-${decision}`);
    try {
      const res = await fetch(`/api/admin/restaurants/${id}/application`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ decision, note }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Application update failed");
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

  return (
    <div className="mx-auto max-w-3xl px-4 pb-10 pt-4" data-testid="admin-restaurants-page">
      <Link href="/admin/more" className="inline-flex items-center gap-1 text-sm font-semibold text-[hsl(152,55%,28%)]">
        <ChevronLeft className="h-4 w-4" /> {t("adminNav.more", { defaultValue: "More" })}
      </Link>
      <div className="mt-3 flex items-center gap-2">
        <UtensilsCrossed className="h-6 w-6 text-[hsl(152,55%,28%)]" />
        <h1 className="text-2xl font-black tracking-tight">Flexa Restaurant</h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Identity verification review and restaurant suspension. Verified badge = identity only, not food-safety certification.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link
          href="/admin/restaurants/countries"
          className="rounded-full bg-[hsl(152,55%,28%)] px-3 py-1.5 text-xs font-bold text-white"
        >
          Country Availability
        </Link>
      </div>
      <p className="mt-2 rounded-xl border border-[hsl(152,40%,80%)] bg-[hsl(152,45%,96%)] px-3 py-2 text-xs text-[hsl(152,55%,22%)]">
        Free launch: no commission. Documents are private — open via authorized short-lived links only. US/CA disabled by default; Haiti pending regulatory approval.
      </p>

      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      {loading ? (
        <p className="mt-6 text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          <h2 className="mt-6 flex items-center gap-2 text-sm font-black uppercase tracking-wide">
            <BadgeCheck className="h-4 w-4" /> Pending identity
          </h2>
          {pending.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">No pending restaurant ID reviews.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {pending.map((p) => (
                <li key={p.id} className="rounded-2xl border border-border bg-card p-4">
                  <p className="font-bold">{p.restaurantName ?? `Restaurant #${p.restaurantId}`}</p>
                  <p className="text-sm text-muted-foreground">
                    {p.legalName} · {p.documentType} · {p.countryOfResidence}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {p.documentFrontUrl && (
                      <a href={p.documentFrontUrl} target="_blank" rel="noreferrer" className="text-xs font-semibold text-[hsl(152,55%,28%)]">
                        View document
                      </a>
                    )}
                    {p.selfieUrl && (
                      <a href={p.selfieUrl} target="_blank" rel="noreferrer" className="text-xs font-semibold text-[hsl(152,55%,28%)]">
                        View selfie
                      </a>
                    )}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      disabled={busy === `idv-${p.id}`}
                      onClick={() => decide(p.id, "verified")}
                      className="rounded-full bg-[hsl(152,55%,28%)] px-3 py-1.5 text-xs font-bold text-white"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      disabled={busy === `idv-${p.id}`}
                      onClick={() => {
                        const reason = window.prompt("Rejection reason:")?.trim();
                        if (reason) void decide(p.id, "rejected", reason);
                      }}
                      className="rounded-full border border-destructive/40 px-3 py-1.5 text-xs font-bold text-destructive"
                    >
                      Reject
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <h2 className="mt-8 flex items-center gap-2 text-sm font-black uppercase tracking-wide">
            <Ban className="h-4 w-4" /> All restaurants
          </h2>
          <ul className="mt-3 space-y-2">
            {restaurants.map((r) => (
              <li key={r.id} className="flex flex-col gap-2 rounded-xl border border-border bg-card px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{r.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.city}, {r.country} · {r.status} · ID: {r.identityStatus}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {["submitted", "under_review", "additional_info_required", "draft"].includes(r.status) && (
                    <>
                      <button
                        type="button"
                        disabled={!!busy}
                        onClick={() => decideApplication(r.id, "under_review")}
                        className="rounded-full border px-3 py-1 text-xs font-bold"
                      >
                        Review
                      </button>
                      <button
                        type="button"
                        disabled={!!busy}
                        onClick={() => decideApplication(r.id, "published")}
                        className="rounded-full bg-[hsl(152,55%,28%)] px-3 py-1 text-xs font-bold text-white"
                      >
                        Approve & publish
                      </button>
                      <button
                        type="button"
                        disabled={!!busy}
                        onClick={() => decideApplication(r.id, "additional_info_required")}
                        className="rounded-full border px-3 py-1 text-xs font-bold"
                      >
                        Need info
                      </button>
                      <button
                        type="button"
                        disabled={!!busy}
                        onClick={() => decideApplication(r.id, "rejected")}
                        className="rounded-full border border-destructive/40 px-3 py-1 text-xs font-bold text-destructive"
                      >
                        Reject
                      </button>
                    </>
                  )}
                  {r.status !== "suspended" && (
                    <button
                      type="button"
                      disabled={busy === `suspend-${r.id}`}
                      onClick={() => suspend(r.id)}
                      className="shrink-0 rounded-full border px-3 py-1 text-xs font-bold"
                    >
                      Suspend
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
