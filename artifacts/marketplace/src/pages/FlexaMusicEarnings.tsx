/**
 * Flexa Music — Artist Earnings Dashboard
 * Shows per-track impressions, revenue, CPM; monthly summary; payout history;
 * and a shortcut to Flexa Wallet for withdrawal.
 */
import { useState, useEffect } from "react";
import {
  ArrowLeft, Music2, DollarSign, TrendingUp, BarChart2,
  Loader2, Wallet, ChevronRight, Calendar, Clock, Star,
  RefreshCw, Info,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/auth";
import { useLocation } from "wouter";

// ── Types ─────────────────────────────────────────────────────────────────────
type TrackStat = {
  id: number; title: string; artist: string; cover_url: string | null;
  genre: string | null; valid_impressions: number; total_impressions: number;
  play_count: number; is_active: boolean; created_at: string;
};
type DailyStat = {
  track_id: number; date: string;
  valid_impressions: number; estimated_revenue_usd: number; confirmed_revenue_usd: number;
};
type Totals = { impressions: number; estimated: number; confirmed: number; cpm: number; };
type Earning = {
  id: number; amount_usd: number; impressions_credited: number;
  milestone: number; description: string; created_at: string;
  track_title: string | null; track_artist: string | null; cover_url: string | null;
};
type Monthly = { month: string; total_usd: string; total_impressions: string; };
const FOLLOWER_GOAL = 500;

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt$ = (n: number) => `$${n.toFixed(2)}`;
const fmtN = (n: number) => n >= 1_000_000
  ? `${(n / 1_000_000).toFixed(1)}M`
  : n >= 1_000 ? `${(n / 1000).toFixed(1)}k` : String(n);
const fmtDate = (s: string) => new Date(s).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
const fmtMonth = (s: string) => new Date(s).toLocaleDateString(undefined, { month: "long", year: "numeric" });

type Tab = "tracks" | "daily" | "monthly" | "history";

// ── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, sub, color }: {
  icon: React.ElementType; label: string; value: string; sub?: string; color: string;
}) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4">
      <div className={`w-9 h-9 rounded-xl ${color} flex items-center justify-center mb-2`}>
        <Icon size={18} className="text-white" />
      </div>
      <p className="text-xl font-black">{value}</p>
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Main
// ══════════════════════════════════════════════════════════════════════════════
export default function FlexaMusicEarnings() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  const [tab, setTab] = useState<Tab>("tracks");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [tracks,  setTracks]  = useState<TrackStat[]>([]);
  const [daily,   setDaily]   = useState<DailyStat[]>([]);
  const [totals,  setTotals]  = useState<Totals | null>(null);
  const [earnings, setEarnings] = useState<Earning[]>([]);
  const [monthly,  setMonthly]  = useState<Monthly[]>([]);
  const [musicBalance, setMusicBalance] = useState(0);
  const [minWith,      setMinWith]      = useState(10);
  const [withdrawing,  setWithdrawing]  = useState(false);
  const [withdrawMsg,  setWithdrawMsg]  = useState<string | null>(null);
  const [followerCount, setFollowerCount] = useState(0);

  const load = async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);
    try {
      const token = localStorage.getItem("flexamarket_token");
      const authHdr = token ? { Authorization: `Bearer ${token}` } : {};
      const [statsRes, earningsRes] = await Promise.all([
        fetch("/api/music/artist/stats",    { headers: authHdr }),
        fetch("/api/music/artist/earnings", { headers: authHdr }),
      ]);
      const [statsData, earningsData] = await Promise.all([
        statsRes.json(), earningsRes.json(),
      ]);
      setTracks(statsData.tracks   ?? []);
      setDaily(statsData.daily     ?? []);
      setTotals(statsData.totals   ?? null);
      setEarnings(earningsData.earnings ?? []);
      setMonthly(earningsData.monthly   ?? []);
      setMusicBalance(earningsData.musicEarningsBalance ?? 0);
      setMinWith(earningsData.minWithdraw  ?? 10);
      setFollowerCount(earningsData.followerCount ?? 0);
    } catch { /* show stale */ }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => {
    if (!user) { setLocation("/auth/login"); return; }
    load();
    // Refresh every 60 s to pick up impression flushes
    const iv = setInterval(() => load(true), 60_000);
    return () => clearInterval(iv);
  }, [user]);

  // ── Aggregate daily by track for "by track" view ──────────────────────────
  const trackMap = Object.fromEntries(tracks.map(t => [t.id, t]));

  // ── Daily grouped by date ─────────────────────────────────────────────────
  const dailyByDate = Object.entries(
    daily.reduce<Record<string, { impressions: number; estimated: number; confirmed: number }>>((acc, d) => {
      if (!acc[d.date]) acc[d.date] = { impressions: 0, estimated: 0, confirmed: 0 };
      acc[d.date].impressions += d.valid_impressions;
      acc[d.date].estimated   += d.estimated_revenue_usd;
      acc[d.date].confirmed   += d.confirmed_revenue_usd;
      return acc;
    }, {})
  ).sort((a, b) => b[0].localeCompare(a[0]));

  const CPM = totals?.cpm ?? 1.0;
  const pending = (totals?.impressions ?? 0) % 1000; // impressions since last milestone

  return (
    <div className="max-w-3xl mx-auto px-3 py-4 pb-24">

      {/* ── Header ── */}
      <div className="flex items-center gap-3 mb-5">
        <button onClick={() => setLocation("/music")}
          className="w-9 h-9 rounded-full hover:bg-muted flex items-center justify-center transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-700 flex items-center justify-center shadow">
          <BarChart2 size={20} className="text-white" />
        </div>
        <div className="flex-1">
          <h1 className="font-black text-xl">{t("music.earningsTitle")}</h1>
          <p className="text-xs text-muted-foreground">{t("music.earningsSubtitle")}</p>
        </div>
        <button onClick={() => load(true)} disabled={refreshing}
          className="w-9 h-9 rounded-full hover:bg-muted flex items-center justify-center transition-colors">
          <RefreshCw size={16} className={refreshing ? "animate-spin text-violet-500" : "text-muted-foreground"} />
        </button>
      </div>

      {loading ? (
        <div className="text-center py-20">
          <Loader2 size={28} className="animate-spin text-violet-500 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">{t("music.loading")}</p>
        </div>
      ) : (
        <>
          {/* ── Music Earnings Balance Banner ── */}
          <div
            className="rounded-2xl p-4 mb-5 flex items-center gap-4"
            style={{ background: "linear-gradient(135deg,#1e1b4b,#312e81)" }}>
            <div className="w-11 h-11 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
              <Wallet size={20} className="text-violet-300" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white/60 text-xs">{t("music.musicEarningsBalance") || "Music Earnings"}</p>
              <p className="text-white text-2xl font-black">{fmt$(musicBalance)}</p>
              {withdrawMsg && (
                <p className="text-emerald-300 text-[11px] mt-0.5 font-semibold">{withdrawMsg}</p>
              )}
              {!withdrawMsg && musicBalance < minWith && (
                <p className="text-white/50 text-[10px] mt-0.5">
                  {t("music.minWithdraw", { amount: fmt$(minWith) })}
                </p>
              )}
            </div>
            <button
              onClick={async () => {
                setWithdrawing(true);
                setWithdrawMsg(null);
                try {
                  const token = localStorage.getItem("flexamarket_token");
                  const r = await fetch("/api/music/artist/withdraw", {
                    method: "POST",
                    headers: token ? { Authorization: `Bearer ${token}` } : {},
                  });
                  const d = await r.json();
                  if (!r.ok) throw new Error(d.error ?? "Withdraw failed");
                  setWithdrawMsg(d.message);
                  setMusicBalance(0);
                  setTimeout(() => setWithdrawMsg(null), 5000);
                } catch (err: any) {
                  setWithdrawMsg(err.message);
                } finally {
                  setWithdrawing(false);
                }
              }}
              disabled={musicBalance < minWith || withdrawing}
              className="bg-white text-violet-800 font-bold text-xs px-4 py-2 rounded-xl shrink-0 shadow disabled:opacity-40 hover:bg-violet-50 transition-colors flex items-center gap-1.5">
              {withdrawing
                ? <Loader2 size={12} className="animate-spin" />
                : <Wallet size={12} />}
              {t("music.withdraw")}
            </button>
          </div>

          {/* ── Summary Cards ── */}
          {totals && (
            <div className="grid grid-cols-2 gap-3 mb-5">
              <StatCard icon={BarChart2}   label={t("music.totalImpressions")} value={fmtN(totals.impressions)}
                sub={`${fmtN(pending)} ${t("music.toNextMilestone")}`} color="bg-violet-600" />
              <StatCard icon={DollarSign}  label={t("music.estimatedRevenue")} value={fmt$(totals.estimated)}
                sub={`CPM: ${fmt$(CPM)}`} color="bg-fuchsia-600" />
              <StatCard icon={TrendingUp}  label={t("music.confirmedRevenue")} value={fmt$(totals.confirmed)}
                color="bg-emerald-600" />
              <StatCard icon={Music2}      label={t("music.tracksManaged")} value={String(tracks.length)}
                color="bg-blue-600" />
            </div>
          )}

          {/* ── CPM Info ── */}
          <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3 mb-3">
            <Info size={14} className="text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700 dark:text-amber-300">{t("music.cpmInfo", { cpm: fmt$(CPM) })}</p>
          </div>

          {/* ── 500-subscriber monetisation gate ── */}
          {followerCount >= FOLLOWER_GOAL ? (
            <div className="flex items-center gap-2 rounded-xl px-3 py-2.5 mb-5"
              style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)" }}>
              <Star size={14} className="text-emerald-400 shrink-0" />
              <p className="text-xs font-semibold text-emerald-400">{t("music.monetizedUnlocked")}</p>
            </div>
          ) : (
            <div className="rounded-2xl p-4 mb-5"
              style={{ background: "rgba(124,58,237,0.08)", border: "1px solid rgba(124,58,237,0.25)" }}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-black" style={{ color: "#a78bfa" }}>{t("music.monetizeGateTitle")}</p>
                <span className="text-xs font-bold" style={{ color: "#a78bfa" }}>
                  {followerCount}/{FOLLOWER_GOAL}
                </span>
              </div>
              {/* Progress bar */}
              <div className="h-2 rounded-full mb-2" style={{ background: "rgba(255,255,255,0.08)" }}>
                <div className="h-2 rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, (followerCount / FOLLOWER_GOAL) * 100)}%`,
                    background: "linear-gradient(90deg,#7c3aed,#c026d3)",
                  }} />
              </div>
              <p className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.5)" }}>
                {t("music.monetizeGateDesc", { count: followerCount, goal: FOLLOWER_GOAL, need: FOLLOWER_GOAL - followerCount })}
              </p>
            </div>
          )}

          {/* ── Tabs ── */}
          <div className="flex gap-1 bg-muted rounded-xl p-1 mb-4">
            {(["tracks","daily","monthly","history"] as Tab[]).map(tb => (
              <button key={tb} onClick={() => setTab(tb)}
                className={`flex-1 text-xs font-semibold py-1.5 rounded-lg transition-all ${tab === tb ? "bg-background shadow text-foreground" : "text-muted-foreground"}`}>
                {t(`music.tab_${tb}`)}
              </button>
            ))}
          </div>

          {/* ── Tab: Tracks ── */}
          {tab === "tracks" && (
            tracks.length === 0
              ? <Empty label={t("music.noTracks")} />
              : <div className="space-y-2">
                  {tracks.map(track => {
                    const estRev = (track.valid_impressions / 1000) * CPM;
                    const confRev = earnings.filter(e => {
                      // sum confirmed for this track
                      return String(e.track_title) === track.title;
                    }).reduce((s, e) => s + e.amount_usd, 0);

                    return (
                      <div key={track.id} className="bg-card border border-border rounded-2xl p-4">
                        <div className="flex items-center gap-3 mb-3">
                          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center shrink-0 overflow-hidden">
                            {track.cover_url
                              ? <img src={track.cover_url} alt={track.title} className="w-full h-full object-cover" />
                              : <Music2 size={16} className="text-white" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-sm truncate">{track.title}</p>
                            <p className="text-xs text-muted-foreground">{track.artist}{track.genre ? ` · ${track.genre}` : ""}</p>
                          </div>
                          {!track.is_active && (
                            <span className="text-[10px] bg-muted text-muted-foreground px-2 py-0.5 rounded-full">{t("music.inactive")}</span>
                          )}
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <Metric label={t("music.validImpressions")} value={fmtN(track.valid_impressions)} />
                          <Metric label={t("music.totalImpressions")} value={fmtN(track.total_impressions)} />
                          <Metric label={t("music.estimatedRevenue")} value={fmt$(estRev)} highlight />
                          <Metric label={t("music.confirmedRevenue")} value={fmt$(confRev)} />
                        </div>

                        {/* Progress to next milestone */}
                        <div className="mt-3">
                          <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                            <span>{t("music.nextMilestone")}</span>
                            <span>{track.valid_impressions % 1000} / 1 000</span>
                          </div>
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-violet-500 rounded-full transition-all"
                              style={{ width: `${(track.valid_impressions % 1000) / 10}%` }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
          )}

          {/* ── Tab: Daily ── */}
          {tab === "daily" && (
            dailyByDate.length === 0
              ? <Empty label={t("music.noData")} />
              : <div className="space-y-2">
                  {dailyByDate.map(([date, stat]) => (
                    <div key={date} className="flex items-center gap-3 p-3 bg-card border border-border rounded-2xl">
                      <div className="w-9 h-9 rounded-xl bg-violet-100 dark:bg-violet-950/40 flex items-center justify-center shrink-0">
                        <Calendar size={16} className="text-violet-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm">{fmtDate(date)}</p>
                        <p className="text-xs text-muted-foreground">{fmtN(stat.impressions)} {t("music.impressionsUnit")}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-bold text-sm text-emerald-600">{fmt$(stat.confirmed)}</p>
                        <p className="text-[10px] text-muted-foreground">{fmt$(stat.estimated)} {t("music.estimated")}</p>
                      </div>
                    </div>
                  ))}
                </div>
          )}

          {/* ── Tab: Monthly ── */}
          {tab === "monthly" && (
            monthly.length === 0
              ? <Empty label={t("music.noData")} />
              : <div className="space-y-2">
                  {monthly.map(m => (
                    <div key={m.month} className="flex items-center gap-3 p-4 bg-card border border-border rounded-2xl">
                      <div className="w-10 h-10 rounded-xl bg-fuchsia-100 dark:bg-fuchsia-950/40 flex items-center justify-center shrink-0">
                        <Clock size={18} className="text-fuchsia-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm">{fmtMonth(m.month)}</p>
                        <p className="text-xs text-muted-foreground">{fmtN(Number(m.total_impressions))} {t("music.impressionsUnit")}</p>
                      </div>
                      <p className="font-black text-lg text-emerald-600 shrink-0">{fmt$(Number(m.total_usd))}</p>
                    </div>
                  ))}
                </div>
          )}

          {/* ── Tab: History ── */}
          {tab === "history" && (
            earnings.length === 0
              ? <Empty label={t("music.noEarnings")} />
              : <div className="space-y-2">
                  {earnings.map(e => (
                    <div key={e.id} className="flex items-center gap-3 p-3 bg-card border border-border rounded-2xl">
                      <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950/40 flex items-center justify-center shrink-0 overflow-hidden">
                        {e.cover_url
                          ? <img src={e.cover_url} alt={e.track_title ?? ""} className="w-full h-full object-cover" />
                          : <DollarSign size={16} className="text-emerald-600" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm truncate">{e.track_title ?? "—"}</p>
                        <p className="text-xs text-muted-foreground">{fmtN(e.impressions_credited)} impressions · {fmtDate(e.created_at)}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-black text-base text-emerald-600">+{fmt$(e.amount_usd)}</p>
                        <p className="text-[10px] text-muted-foreground">{t("music.milestoneLabel", { n: e.milestone })}</p>
                      </div>
                    </div>
                  ))}
                </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────
function Metric({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="bg-muted/50 rounded-xl px-3 py-2">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className={`font-bold text-sm ${highlight ? "text-violet-600 dark:text-violet-400" : ""}`}>{value}</p>
    </div>
  );
}
function Empty({ label }: { label: string }) {
  return (
    <div className="text-center py-12 border border-dashed border-border rounded-2xl">
      <Music2 size={28} className="text-muted-foreground mx-auto mb-2 opacity-40" />
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}
