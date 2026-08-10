import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/auth";
import { useTranslation } from "react-i18next";
import {
  Truck, RefreshCw, DollarSign, MapPin, Bike, Car, Clock,
  CheckCircle, XCircle, Loader2, TrendingUp, Package, Navigation,
  Heart, Star, Trophy, ChevronRight, Ban, CheckCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const STATUS_COLOR: Record<string, string> = {
  waiting:         "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  driver_assigned: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  picked_up:       "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300",
  on_the_way:      "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  arrived:         "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300",
  delivered:       "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  buyer_absent:    "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  cancelled:       "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

const STATUS_LABEL: Record<string, string> = {
  waiting: "Ap Tann", driver_assigned: "Asiyene", picked_up: "Pran",
  on_the_way: "Nan Wout", arrived: "Rive", delivered: "Livre",
  buyer_absent: "Pa Disponib", cancelled: "Anile",
};

const STATUS_ICON: Record<string, typeof Truck> = {
  waiting: Clock, driver_assigned: Truck, picked_up: Package,
  on_the_way: Navigation, arrived: MapPin, delivered: CheckCircle,
  buyer_absent: Clock, cancelled: XCircle,
};

interface DeliveryRow {
  id: number;
  deliveryMethod: string;
  pickupCity: string | null;
  deliveryCity: string | null;
  country: string;
  status: string;
  totalAmount: number | null;
  driverEarnings: number | null;
  feeLocal: number | null;
  feeUsd: number | null;
  distanceKm: number | null;
  currency: string;
  createdAt: string;
  sellerName: string | null;
  sellerAvatar: string | null;
  driverName: string | null;
  driverAvatar: string | null;
  pickupPhotoUrl?: string | null;
  dropoffPhotoUrl?: string | null;
  listingTitle?: string | null;
  listingImage?: string | null;
}

function StatCard({ icon: Icon, label, value, sub, color, bg }: {
  icon: typeof Truck; label: string; value: string; sub?: string; color: string; bg: string;
}) {
  return (
    <div className={`relative overflow-hidden rounded-2xl p-4 ${bg} border border-border/50`}>
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 bg-background/60 backdrop-blur-sm ${color}`}>
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-2xl font-black tracking-tight">{value}</p>
      <p className="text-xs font-semibold text-foreground/80 mt-0.5">{label}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

const FILTER_STATUSES = ["all", "waiting", "driver_assigned", "on_the_way", "delivered", "cancelled"];

interface TipRow {
  id: number; delivery_id: number; amount_usd: number;
  message: string | null; rating: number | null;
  from_user_type: string; status: string; created_at: string;
  driver_name: string | null; tipper_name: string | null;
}

interface TipStats {
  totalTipsUsd: number; totalTipCount: number; avgTipUsd: number;
  topDrivers: Array<{ driver_user_id: number; name: string | null; avatar: string | null; tip_count: number; tips_total: number }>;
  recent: TipRow[];
}

export default function AdminDeliveryPanel() {
  const { token } = useAuth();
  const { t } = useTranslation();
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [countryFilter, setCountryFilter] = useState("all");
  const [activeTab, setActiveTab] = useState<"deliveries" | "tips" | "ratings">("deliveries");
  const [tipStats, setTipStats] = useState<TipStats | null>(null);
  const [tipsLoading, setTipsLoading] = useState(false);
  const [ratingsData, setRatingsData] = useState<any | null>(null);
  const [ratingsLoading, setRatingsLoading] = useState(false);
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [forceCompletingId, setForceCompletingId] = useState<number | null>(null);

  /** Admin force-cancel — refunds buyer automatically */
  const handleCancel = async (id: number) => {
    if (!confirm(t("adminDelivery.cancelConfirm"))) return;
    setCancellingId(id);
    try {
      const res = await fetch(`/api/admin/deliveries/${id}/cancel`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        setDeliveries(prev =>
          prev.map(d => d.id === id ? { ...d, status: "cancelled" } : d),
        );
        if (data.refundedAmount) {
          alert(t("adminDelivery.cancelRefundSuccess", { amount: Number(data.refundedAmount).toFixed(2) }));
        }
      }
    } finally {
      setCancellingId(null);
    }
  };

  /** Admin force-complete — finishes delivery driver couldn't complete */
  const handleForceComplete = async (id: number) => {
    if (!confirm(t("adminDelivery.forceCompleteConfirm"))) return;
    setForceCompletingId(id);
    try {
      const res = await fetch(`/api/admin/deliveries/${id}/force-complete`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setDeliveries(prev =>
          prev.map(d => d.id === id ? { ...d, status: "delivered" } : d),
        );
        alert(t("adminDelivery.forceCompleteSuccess"));
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error ?? t("adminDelivery.forceCompleteError"));
      }
    } finally {
      setForceCompletingId(null);
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (countryFilter !== "all") params.set("country", countryFilter);
      const res = await fetch(`/api/admin/deliveries?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setDeliveries(data.deliveries ?? []);
      }
    } finally { setLoading(false); }
  };

  const loadTips = async () => {
    setTipsLoading(true);
    try {
      const res = await fetch("/api/admin/driver-tips", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setTipStats(await res.json());
    } finally { setTipsLoading(false); }
  };

  const loadRatings = async () => {
    setRatingsLoading(true);
    try {
      const res = await fetch("/api/admin/driver-reviews", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setRatingsData(await res.json());
    } finally { setRatingsLoading(false); }
  };

  useEffect(() => { load(); }, [statusFilter, countryFilter]);
  useEffect(() => { if (activeTab === "tips") loadTips(); }, [activeTab]);
  useEffect(() => { if (activeTab === "ratings") loadRatings(); }, [activeTab]);

  const total      = deliveries.length;
  const delivered  = deliveries.filter(d => d.status === "delivered").length;
  const active     = deliveries.filter(d => !["delivered", "cancelled"].includes(d.status)).length;
  const totalRevenue = deliveries
    .filter(d => d.status === "delivered" && d.feeUsd)
    .reduce((acc, d) => acc + (d.feeUsd ?? 0) * 0.20, 0);

  return (
    <div className="space-y-6">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-lg font-black flex items-center gap-2">
            <Truck className="h-5 w-5 text-primary" /> Sistèm Livrezon
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">Tout livrezon ak analitik</p>
        </div>
        <Button size="sm" variant="outline" className="h-8 rounded-xl text-xs gap-1.5"
          onClick={activeTab === "tips" ? loadTips : activeTab === "ratings" ? loadRatings : load}
          disabled={loading || tipsLoading || ratingsLoading}>
          <RefreshCw className={`h-3.5 w-3.5 ${(loading || tipsLoading || ratingsLoading) ? "animate-spin" : ""}`} />
          Rafraîchi
        </Button>
      </div>

      {/* ── Tab switcher ────────────────────────────────────────────────── */}
      <div className="flex gap-1.5">
        <button
          onClick={() => setActiveTab("deliveries")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold border transition-all ${
            activeTab === "deliveries"
              ? "bg-primary text-primary-foreground border-primary shadow-sm"
              : "border-border hover:bg-accent"
          }`}
        >
          <Truck className="h-4 w-4" /> Livrezon
        </button>
        <button
          onClick={() => setActiveTab("tips")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold border transition-all ${
            activeTab === "tips"
              ? "bg-pink-500 text-white border-pink-500 shadow-sm"
              : "border-border hover:bg-accent"
          }`}
        >
          <Heart className="h-4 w-4" /> Poubwa (Tips)
        </button>
        <button
          onClick={() => setActiveTab("ratings")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold border transition-all ${
            activeTab === "ratings"
              ? "bg-amber-500 text-white border-amber-500 shadow-sm"
              : "border-border hover:bg-accent"
          }`}
        >
          <Star className="h-4 w-4" /> Evalyasyon
        </button>
      </div>

      {/* ── Tips analytics tab ──────────────────────────────────────────── */}
      {activeTab === "tips" && (
        <div className="space-y-5">
          {tipsLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
            </div>
          ) : tipStats ? (
            <>
              {/* Tip overview stat cards */}
              <div className="grid grid-cols-3 gap-3">
                <StatCard
                  icon={DollarSign} label="Total poubwa" value={`$${tipStats.totalTipsUsd.toFixed(2)}`}
                  bg="bg-pink-50 dark:bg-pink-950/30" color="text-pink-600"
                />
                <StatCard
                  icon={Heart} label="Nòm poubwa" value={String(tipStats.totalTipCount)}
                  bg="bg-rose-50 dark:bg-rose-950/30" color="text-rose-600"
                />
                <StatCard
                  icon={TrendingUp} label="Mwayen" value={`$${tipStats.avgTipUsd.toFixed(2)}`}
                  bg="bg-orange-50 dark:bg-orange-950/30" color="text-orange-600"
                />
              </div>

              {/* Top tipped drivers */}
              {tipStats.topDrivers.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-black flex items-center gap-2">
                    <Trophy className="h-4 w-4 text-amber-500" /> Top Chauffè (Pi Plis Poubwa)
                  </h3>
                  <div className="space-y-2">
                    {tipStats.topDrivers.slice(0, 10).map((d, i) => (
                      <div key={d.driver_user_id} className="flex items-center gap-3 bg-card border border-border rounded-2xl px-3.5 py-3">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${
                          i === 0 ? "bg-amber-100 text-amber-700" :
                          i === 1 ? "bg-gray-100 text-gray-700" :
                          i === 2 ? "bg-orange-100 text-orange-700" : "bg-muted text-muted-foreground"
                        }`}>
                          {i + 1}
                        </div>
                        <Avatar className="h-8 w-8 border border-border shrink-0">
                          <AvatarImage src={d.avatar ?? undefined} />
                          <AvatarFallback className="text-xs">{(d.name ?? "?")[0]}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-sm truncate">{d.name ?? "Chauffè"}</p>
                          <p className="text-[10px] text-muted-foreground">{d.tip_count} poubwa</p>
                        </div>
                        <p className="font-black text-pink-600 shrink-0">${parseFloat(String(d.tips_total)).toFixed(2)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recent tips list */}
              <div className="space-y-2">
                <h3 className="text-sm font-black flex items-center gap-2">
                  <Heart className="h-4 w-4 text-pink-400 fill-pink-300" /> Poubwa Resan (100 dènye)
                </h3>
                {tipStats.recent.length === 0 ? (
                  <div className="text-center py-10 space-y-2">
                    <Heart className="h-8 w-8 text-muted-foreground/30 mx-auto" />
                    <p className="text-sm text-muted-foreground">Pa gen poubwa pou kounye a</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {tipStats.recent.map(tip => (
                      <div key={tip.id} className="flex items-center gap-3 bg-card border border-border rounded-2xl px-3.5 py-3">
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                          style={{ background: "linear-gradient(135deg, #f97316, #ec4899)" }}>
                          <Heart className="h-4 w-4 text-white fill-white" />
                        </div>
                        <div className="flex-1 min-w-0 space-y-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-sm">{tip.tipper_name ?? "Kliyan"}</span>
                            <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                            <span className="font-bold text-sm text-primary">{tip.driver_name ?? "Chauffè"}</span>
                            <Badge className="text-[9px] px-1.5 py-0 bg-muted capitalize">{tip.from_user_type}</Badge>
                          </div>
                          {tip.rating && (
                            <div className="flex items-center gap-0.5">
                              {Array.from({ length: tip.rating }).map((_, i) => (
                                <Star key={i} className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />
                              ))}
                            </div>
                          )}
                          {tip.message && (
                            <p className="text-xs text-muted-foreground italic truncate">"{tip.message}"</p>
                          )}
                          <p className="text-[10px] text-muted-foreground">
                            FL-{tip.delivery_id} · {new Date(tip.created_at).toLocaleDateString("fr-HT", {
                              day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
                            })}
                          </p>
                        </div>
                        <p className="font-black text-pink-600 shrink-0">+${tip.amount_usd.toFixed(2)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="text-center py-10">
              <p className="text-sm text-muted-foreground">Klike Rafraîchi pou chaje done</p>
            </div>
          )}
        </div>
      )}

      {/* ── Ratings analytics tab ───────────────────────────────────────── */}
      {activeTab === "ratings" && (
        <div className="space-y-5">
          {ratingsLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
            </div>
          ) : ratingsData ? (
            <>
              {/* Overview stat cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard icon={Star}      label="Total evalyasyon" value={String(ratingsData.totalReviews)}              bg="bg-amber-50 dark:bg-amber-950/30"  color="text-amber-600" />
                <StatCard icon={TrendingUp} label="Mwayen global"   value={ratingsData.avgRating ? ratingsData.avgRating.toFixed(1) + " ★" : "—"} bg="bg-yellow-50 dark:bg-yellow-950/30" color="text-yellow-600" />
                <StatCard icon={ChevronRight} label="Nòt ba (1-2★)" value={String(ratingsData.lowCount)}                bg="bg-red-50 dark:bg-red-950/30"      color="text-red-600" />
                <StatCard icon={Trophy}    label="Chauffè flage"    value={String(ratingsData.flaggedCount)}              bg="bg-orange-50 dark:bg-orange-950/30" color="text-orange-600" />
              </div>

              {/* Flagged drivers */}
              {ratingsData.flaggedDrivers.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-black flex items-center gap-2 text-red-600">
                    ⚠️ Chauffè Flage
                    <span className="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-[10px] font-black px-2 py-0.5 rounded-full">
                      {ratingsData.flaggedDrivers.length}
                    </span>
                  </h3>
                  <div className="space-y-2">
                    {ratingsData.flaggedDrivers.map((d: any) => (
                      <div key={d.id} className="flex items-center gap-3 rounded-2xl border border-red-200/60 dark:border-red-800/30 bg-red-50/60 dark:bg-red-950/10 px-4 py-3">
                        <Avatar className="h-8 w-8 shrink-0">
                          <AvatarImage src={d.avatar ?? undefined} />
                          <AvatarFallback className="bg-red-100 text-red-600 text-xs font-black">{(d.name ?? "?")[0]}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-black truncate">{d.name ?? "—"}</p>
                          <p className="text-xs text-muted-foreground">{d.phone}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-black text-red-600">{d.rating ? parseFloat(d.rating).toFixed(1) : "—"} ★</p>
                          <p className="text-[10px] text-muted-foreground">{d.review_count} evalyasyon</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Top drivers */}
              {ratingsData.topDrivers.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-black flex items-center gap-2 text-amber-600">
                    🏆 Top Chauffè
                  </h3>
                  <div className="space-y-2">
                    {ratingsData.topDrivers.map((d: any, i: number) => (
                      <div key={d.id} className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3">
                        <span className="text-base font-black text-muted-foreground w-6 text-center">
                          {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}`}
                        </span>
                        <Avatar className="h-8 w-8 shrink-0">
                          <AvatarImage src={d.avatar ?? undefined} />
                          <AvatarFallback className="bg-amber-100 text-amber-700 text-xs font-black">{(d.name ?? "?")[0]}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-black truncate">{d.name ?? "—"}</p>
                          <p className="text-[10px] text-muted-foreground">{d.review_count} evalyasyon</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-black text-amber-600">
                            {d.rating ? parseFloat(d.rating).toFixed(1) : "—"} ★
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recent reviews */}
              {ratingsData.recent.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-black flex items-center gap-2">
                    <Star className="h-4 w-4 text-amber-500 fill-amber-400" /> Dènye Evalyasyon
                  </h3>
                  <div className="space-y-2">
                    {ratingsData.recent.slice(0, 30).map((r: any) => (
                      <div key={r.id} className="rounded-2xl border border-border bg-card px-4 py-3 space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <Avatar className="h-6 w-6 shrink-0">
                              <AvatarImage src={r.driver_avatar ?? undefined} />
                              <AvatarFallback className="text-[10px] font-black">{(r.driver_name ?? "?")[0]}</AvatarFallback>
                            </Avatar>
                            <span className="text-xs font-semibold truncate">{r.driver_name ?? "Chauffè"}</span>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {[1,2,3,4,5].map(s => (
                              <Star key={s} className={`h-3 w-3 ${s <= r.rating ? "fill-amber-400 text-amber-400" : "fill-muted text-muted-foreground/20"}`} />
                            ))}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 flex-wrap">
                          <span className="text-[10px] text-muted-foreground">Pa:</span>
                          <span className="text-[10px] font-semibold">{r.reviewer_name ?? "Anonim"}</span>
                          {r.flagged && (
                            <span className="text-[10px] bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 px-1.5 py-0.5 rounded-full font-bold ml-auto">⚠ Flage</span>
                          )}
                        </div>
                        {r.tags && r.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {r.tags.map((t: string) => (
                              <span key={t} className="text-[10px] bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-300 border border-amber-200/50 px-2 py-0.5 rounded-full">{t}</span>
                            ))}
                          </div>
                        )}
                        {r.comment && (
                          <p className="text-xs text-muted-foreground italic truncate">"{r.comment}"</p>
                        )}
                        <p className="text-[10px] text-muted-foreground/50">
                          FL-{r.delivery_id} · {new Date(r.created_at).toLocaleDateString("fr-HT", { day: "2-digit", month: "short", year: "numeric" })}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {ratingsData.totalReviews === 0 && (
                <div className="text-center py-12 space-y-2">
                  <Star className="h-10 w-10 text-muted-foreground/20 mx-auto" />
                  <p className="text-sm text-muted-foreground">Poko gen evalyasyon</p>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-10">
              <p className="text-sm text-muted-foreground">Klike Rafraîchi pou chaje done</p>
            </div>
          )}
        </div>
      )}

      {/* ── Deliveries tab (only shown when activeTab === "deliveries") ─── */}
      {activeTab === "deliveries" && (
        <div className="space-y-6">

      {/* ── Stat cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon={Truck}       label={t("adminDelivery.statTotal")}    value={String(total)}                bg="bg-blue-50 dark:bg-blue-950/30"    color="text-blue-600" />
        <StatCard icon={CheckCircle} label={t("adminDelivery.statDelivered")} value={String(delivered)}            bg="bg-emerald-50 dark:bg-emerald-950/30" color="text-emerald-600" />
        <StatCard icon={Clock}       label={t("adminDelivery.statActive")}   value={String(active)}               bg="bg-orange-50 dark:bg-orange-950/30" color="text-orange-600" />
        <StatCard icon={DollarSign}  label={t("adminDelivery.statRevenue")}  value={`$${totalRevenue.toFixed(2)}`} sub={t("adminDelivery.statRevenueSub")} bg="bg-primary/5" color="text-primary" />
      </div>

      {/* ── Filters ────────────────────────────────────────────────────── */}
      <div className="space-y-2">
        {/* Status pills */}
        <div className="flex gap-1.5 flex-wrap">
          {FILTER_STATUSES.map(s => {
            const Icon = s !== "all" ? (STATUS_ICON[s] ?? Truck) : TrendingUp;
            return (
              <button key={s} type="button" onClick={() => setStatusFilter(s)}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border ${
                  statusFilter === s
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "border-border hover:bg-accent"
                }`}
              >
                <Icon className="h-3 w-3" />
                {s === "all" ? t("adminDelivery.filterAll") : STATUS_LABEL[s] ?? s}
              </button>
            );
          })}
        </div>
        {/* Country toggle */}
        <div className="flex gap-1.5">
          {["all", "Haiti", "Dominican Republic"].map(c => (
            <button key={c} type="button" onClick={() => setCountryFilter(c)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                countryFilter === c
                  ? "bg-foreground text-background border-foreground"
                  : "border-border hover:bg-accent"
              }`}
            >
              {c === "all" ? `🌍 ${t("adminDelivery.countryAll")}` : c === "Haiti" ? "🇭🇹 Haiti" : "🇩🇴 DR"}
            </button>
          ))}
        </div>
      </div>

      {/* ── Delivery list ──────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Chajman livrezon yo...</p>
        </div>
      ) : deliveries.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mx-auto">
            <Truck className="h-8 w-8 text-muted-foreground/50" />
          </div>
          <p className="text-sm font-semibold text-muted-foreground">Pa gen livrezon pou filtre sa</p>
        </div>
      ) : (
        <div className="space-y-3">
          {deliveries.map(d => {
            const MethodIcon = d.deliveryMethod === "car" ? Car : Bike;
            const SIcon = STATUS_ICON[d.status] ?? Truck;
            const platformFee = d.feeUsd ? d.feeUsd * 0.20 : 0;
            return (
              <div key={d.id} className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                {/* Colored top bar by status */}
                <div className={`h-1 w-full ${
                  d.status === "delivered" ? "bg-emerald-500" :
                  d.status === "cancelled" ? "bg-red-500" :
                  d.status === "on_the_way" ? "bg-orange-500" :
                  d.status === "waiting" ? "bg-amber-400" : "bg-blue-500"
                }`} />

                <div className="p-4">
                  <div className="flex items-start gap-3">
                    {/* Transport method icon */}
                    <div className="w-11 h-11 rounded-xl bg-muted flex items-center justify-center shrink-0 border border-border">
                      <MethodIcon className="h-5 w-5 text-muted-foreground" />
                    </div>

                    {/* Main info */}
                    <div className="flex-1 min-w-0 space-y-2">
                      {/* ID + status + country */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-black text-sm text-foreground">FL-{d.id}</span>
                        <Badge className={`text-[10px] px-2 py-0.5 flex items-center gap-1 ${STATUS_COLOR[d.status] ?? ""}`}>
                          <SIcon className="h-3 w-3" />
                          {STATUS_LABEL[d.status] ?? d.status}
                        </Badge>
                        <span className="text-base leading-none">{d.country === "Haiti" ? "🇭🇹" : "🇩🇴"}</span>
                        <span className="text-[10px] text-muted-foreground ml-auto">
                          {new Date(String(d.createdAt).replace(" ", "T")).toLocaleDateString("fr-HT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>

                      {/* Route */}
                      <div className="flex items-center gap-2 text-sm">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full bg-primary shrink-0" />
                          <span className="font-semibold">{d.pickupCity ?? "?"}</span>
                        </div>
                        <div className="flex-1 border-t border-dashed border-border" />
                        <div className="flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5 text-red-500 shrink-0" />
                          <span className="font-semibold">{d.deliveryCity ?? "?"}</span>
                        </div>
                        {d.distanceKm != null && (
                          <span className="text-xs font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded-lg shrink-0">
                            {d.distanceKm.toFixed(1)} km
                          </span>
                        )}
                      </div>

                      {/* Actors */}
                      <div className="flex items-center gap-3 flex-wrap">
                        {d.sellerName && (
                          <div className="flex items-center gap-1.5">
                            <Avatar className="h-5 w-5 border border-border">
                              <AvatarImage src={d.sellerAvatar ?? undefined} />
                              <AvatarFallback className="text-[8px] bg-muted">{d.sellerName[0]}</AvatarFallback>
                            </Avatar>
                            <span className="text-xs text-muted-foreground">
                              <span className="font-medium text-foreground">{d.sellerName}</span> (vandè)
                            </span>
                          </div>
                        )}
                        {d.driverName ? (
                          <div className="flex items-center gap-1.5">
                            <Avatar className="h-5 w-5 border border-primary/30">
                              <AvatarImage src={d.driverAvatar ?? undefined} />
                              <AvatarFallback className="text-[8px] bg-primary/10 text-primary">{d.driverName[0]}</AvatarFallback>
                            </Avatar>
                            <span className="text-xs text-muted-foreground">
                              <span className="font-medium text-foreground">{d.driverName}</span> ({t("adminDelivery.driverLabel")})
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">{t("adminDelivery.noDriver")}</span>
                        )}
                      </div>

                      {/* Delivery photo thumbnails */}
                      {(d.pickupPhotoUrl || d.dropoffPhotoUrl) && (
                        <div className="flex gap-2 pt-1">
                          {d.pickupPhotoUrl && (
                            <a href={d.pickupPhotoUrl} target="_blank" rel="noopener noreferrer"
                              className="relative rounded-xl overflow-hidden border border-border block shrink-0">
                              <img src={d.pickupPhotoUrl} alt="Prise" className="w-16 h-16 object-cover" />
                              <div className="absolute bottom-0 inset-x-0 bg-black/60 py-0.5">
                                <p className="text-[8px] text-white text-center font-black tracking-wide">PRISE</p>
                              </div>
                            </a>
                          )}
                          {d.dropoffPhotoUrl && (
                            <a href={d.dropoffPhotoUrl} target="_blank" rel="noopener noreferrer"
                              className="relative rounded-xl overflow-hidden border border-border block shrink-0">
                              <img src={d.dropoffPhotoUrl} alt="Livrezon" className="w-16 h-16 object-cover" />
                              <div className="absolute bottom-0 inset-x-0 bg-black/60 py-0.5">
                                <p className="text-[8px] text-white text-center font-black tracking-wide">LIVREZON</p>
                              </div>
                            </a>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Earnings + cancel column */}
                    <div className="text-right shrink-0 space-y-1.5">
                      {d.feeUsd != null && d.feeUsd > 0 ? (
                        <>
                          <p className="font-black text-base text-primary">${parseFloat(String(d.feeUsd)).toFixed(2)}</p>
                          <p className="text-[10px] text-muted-foreground">{t("adminDelivery.deliveryFeeLabel")}</p>
                          <p className="text-[10px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 px-1.5 py-0.5 rounded-md">
                            +${platformFee.toFixed(2)} {t("adminDelivery.platformLabel")}
                          </p>
                        </>
                      ) : d.driverEarnings ? (
                        <>
                          <p className="font-black text-base text-primary">${parseFloat(String(d.driverEarnings)).toFixed(2)}</p>
                          <p className="text-[10px] text-muted-foreground">{t("adminDelivery.driverLabel")}</p>
                        </>
                      ) : (
                        <p className="text-xs text-muted-foreground">—</p>
                      )}

                      {/* Cancel — only if driver hasn't picked up yet, refunds buyer */}
                      {(d.status === "waiting" || d.status === "driver_assigned") && (
                        <button
                          type="button"
                          onClick={() => handleCancel(d.id)}
                          disabled={cancellingId === d.id}
                          className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold text-red-600 border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors disabled:opacity-50 ml-auto"
                        >
                          {cancellingId === d.id
                            ? <><Loader2 className="h-3 w-3 animate-spin" /> {t("adminDelivery.cancellingLabel")}</>
                            : <><Ban className="h-3 w-3" /> {t("adminDelivery.cancelBtn")}</>}
                        </button>
                      )}

                      {/* Force Complete — for stuck deliveries (driver can't finish) */}
                      {(["picked_up", "on_the_way", "arrived", "buyer_absent"].includes(d.status)) && (
                        <button
                          type="button"
                          onClick={() => handleForceComplete(d.id)}
                          disabled={forceCompletingId === d.id}
                          className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold text-emerald-700 border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors disabled:opacity-50 ml-auto"
                        >
                          {forceCompletingId === d.id
                            ? <><Loader2 className="h-3 w-3 animate-spin" /> {t("adminDelivery.forceCompletingLabel")}</>
                            : <><CheckCheck className="h-3 w-3" /> {t("adminDelivery.forceCompleteBtn")}</>}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

        </div>
      )}
    </div>
  );
}
