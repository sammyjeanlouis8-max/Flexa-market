import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/auth";
import { useLocation } from "wouter";
import {
  Truck, DollarSign, Star, Package, TrendingUp, Clock, ChevronRight,
  Bike, Car, MapPin, CheckCircle, Loader2, RefreshCw, ArrowLeft,
  ShieldCheck, Wallet, Navigation, Award, Heart, User, AlertCircle,
  CircleDot, PackageCheck, Flag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

const apiGet = (url: string) =>
  fetch(url, {
    headers: { Authorization: `Bearer ${localStorage.getItem("flexamarket_token")}` },
  }).then(r => r.json());

interface DriverStats {
  id: number;
  userId: number;
  status: string;
  country: string | null;
  city: string | null;
  vehicleType: string | null;
  vehicleBrand: string | null;
  vehicleModel: string | null;
  vehicleColor: string | null;
  licensePlateNumber: string | null;
  rating: number;
  deliveryCount: number;
  earningsTotal: number;
  isOnline: boolean;
  suspensionReason: string | null;
}

interface DeliveryHistoryItem {
  id: number;
  deliveryMethod: string;
  pickupAddress: string | null;
  pickupCity: string | null;
  deliveryAddress: string | null;
  deliveryCity: string | null;
  country: string;
  status: string;
  feeUsd: number | null;
  driverEarnings: number | null;
  distanceKm: number | null;
  createdAt: string;
  acceptedAt: string | null;
  pickedUpAt: string | null;
  deliveredAt: string | null;
}

const STATUS_COLOR: Record<string, string> = {
  waiting:         "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  driver_assigned: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  picked_up:       "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
  on_the_way:      "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  arrived:         "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300",
  delivered:       "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  cancelled:       "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
};

const STATUS_LABEL: Record<string, string> = {
  waiting: "Ap Tann", driver_assigned: "Asiyene", picked_up: "Pran",
  on_the_way: "Nan Wout", arrived: "Rive", delivered: "Livre", cancelled: "Anile",
};

function StatCard({
  icon: Icon, label, value, sub, color, gradient,
}: {
  icon: typeof Truck; label: string; value: string; sub?: string; color: string; gradient: string;
}) {
  return (
    <div className={`relative overflow-hidden rounded-2xl p-4 border border-border/40 ${gradient}`}>
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 bg-white/20 backdrop-blur-sm ${color}`}>
        <Icon className="h-4.5 w-4.5" />
      </div>
      <p className="text-2xl font-black tracking-tight text-foreground">{value}</p>
      <p className="text-xs font-semibold text-muted-foreground mt-0.5">{label}</p>
      {sub && <p className="text-[10px] text-muted-foreground/70 mt-0.5">{sub}</p>}
    </div>
  );
}

export default function DriverDashboard() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { t } = useTranslation();

  const { data: statsData, isLoading: statsLoading, refetch } = useQuery<{ driver: DriverStats }>({
    queryKey: ["/delivery/driver/stats"],
    queryFn: () => apiGet("/api/delivery/driver/stats"),
    enabled: !!user,
    refetchInterval: 30000,
  });

  const { data: historyData, isLoading: historyLoading } = useQuery<{ deliveries: DeliveryHistoryItem[] }>({
    queryKey: ["/driver/delivery-history"],
    queryFn: () => apiGet("/api/driver/delivery-history"),
    enabled: !!user,
  });

  const { data: tipStats } = useQuery<{
    total: number; today: number; thisWeek: number; thisMonth: number;
    tipCount: number;
    history: Array<{
      id: number; delivery_id: number; amount_usd: number;
      message: string | null; rating: number | null;
      from_user_type: string; created_at: string;
      tipper_name: string | null; tipper_avatar: string | null;
    }>;
  }>({
    queryKey: ["/driver/tip-stats"],
    queryFn: () => apiGet("/api/driver/tip-stats"),
    enabled: !!user,
  });

  const { data: reviewData } = useQuery<{
    avgRating: number; reviewCount: number; positiveRate: number; flagged: boolean;
    distribution: Record<string, number>;
    topTags: Array<{ tag: string; freq: number }>;
    reviews: Array<{
      id: number; delivery_id: number; rating: number; comment: string | null;
      tags: string[] | null; from_user_type: string; created_at: string;
      reviewer_name: string | null; reviewer_avatar: string | null;
    }>;
  }>({
    queryKey: ["/driver/my-reviews"],
    queryFn: () => apiGet("/api/driver/my-reviews"),
    enabled: !!user,
  });

  const driver = statsData?.driver;
  const deliveries = historyData?.deliveries ?? [];

  if (statsLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Chajman done chauffè...</p>
      </div>
    );
  }

  if (!driver) {
    return (
      <div className="max-w-md mx-auto px-4 py-12 text-center space-y-5">
        <div className="w-20 h-20 bg-muted rounded-3xl flex items-center justify-center mx-auto">
          <Truck className="h-10 w-10 text-muted-foreground/50" />
        </div>
        <div>
          <h2 className="text-xl font-black mb-2">Pa gen aksè chauffè</h2>
          <p className="text-sm text-muted-foreground">
            Ou pa yon chauffè apwouve. Aplike kounye a pou komanse livrezon yo.
          </p>
        </div>
        <Button className="w-full" onClick={() => setLocation("/deliveries")}>
          Ale nan paj livrezon
        </Button>
      </div>
    );
  }

  const completedDeliveries = deliveries.filter(d => d.status === "delivered");
  const pendingDeliveries   = deliveries.filter(d => !["delivered", "cancelled"].includes(d.status));
  const totalEarningsUsd    = completedDeliveries.reduce((sum, d) => sum + (d.driverEarnings ?? 0), 0);
  const totalFeeUsd         = completedDeliveries.reduce((sum, d) => sum + (d.feeUsd ?? 0), 0);
  const platformDeductions  = totalFeeUsd - totalEarningsUsd;

  const isActive    = driver.status === "active";
  const isSuspended = driver.status === "suspended";

  return (
    <div className="max-w-xl mx-auto px-3 py-4 pb-24 space-y-5">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setLocation("/deliveries")}
          className="w-9 h-9 rounded-xl border border-border flex items-center justify-center hover:bg-accent transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-black flex items-center gap-2">
            <Truck className="h-5 w-5 text-primary" /> Tableau de Bord Chauffè
          </h1>
          <p className="text-xs text-muted-foreground">Revni · Pèfòmans · Istwa livrezon</p>
        </div>
        <button
          onClick={() => refetch()}
          className="w-9 h-9 rounded-xl border border-border flex items-center justify-center hover:bg-accent transition-colors"
        >
          <RefreshCw className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      {/* ── Status banner ────────────────────────────────────────────────── */}
      {isSuspended && (
        <div className="rounded-2xl border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800/40 p-4 space-y-1">
          <p className="text-sm font-bold text-red-700 dark:text-red-400">Kont ou sispann</p>
          {driver.suspensionReason && (
            <p className="text-xs text-red-600 dark:text-red-400/80">{driver.suspensionReason}</p>
          )}
        </div>
      )}

      {/* ── Driver Identity Card ─────────────────────────────────────────── */}
      <div
        className="relative rounded-2xl overflow-hidden shadow-lg"
        style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f2027 100%)" }}
      >
        {/* Decorative circles */}
        <div className="absolute -right-12 -top-12 w-40 h-40 rounded-full border border-white/8 pointer-events-none" />
        <div className="absolute -left-8 -bottom-8 w-28 h-28 rounded-full border border-white/6 pointer-events-none" />
        {/* Brand accent line */}
        <div className="h-1 w-full" style={{ background: "linear-gradient(90deg, #f97316, #8b5cf6, #06b6d4)" }} />

        <div className="relative p-5">
          <div className="flex items-start gap-4">
            <div className="relative shrink-0">
              <Avatar className="h-14 w-14 border-2 border-white/20">
                <AvatarImage src={user?.avatar ?? undefined} />
                <AvatarFallback className="bg-primary/20 text-white font-black text-lg">
                  {user?.name?.[0] ?? "D"}
                </AvatarFallback>
              </Avatar>
              <div className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-slate-900 flex items-center justify-center ${isActive ? "bg-green-500" : "bg-red-500"}`}>
                <div className="w-2 h-2 rounded-full bg-white" />
              </div>
            </div>

            <div className="flex-1 min-w-0">
              <p className="font-black text-white text-base leading-tight">{user?.name ?? "Chauffè"}</p>
              {driver.city && (
                <p className="text-xs text-white/50 flex items-center gap-1 mt-0.5">
                  <MapPin className="h-3 w-3" /> {driver.city}
                </p>
              )}
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <Badge className={`text-[10px] px-2 py-0.5 ${isActive ? "bg-green-500/20 text-green-300 border-green-500/30" : "bg-red-500/20 text-red-300 border-red-500/30"}`}>
                  {isActive ? "✓ Aktif" : isSuspended ? "⚠ Sispann" : driver.status}
                </Badge>
                {driver.vehicleType && (
                  <Badge className="text-[10px] px-2 py-0.5 bg-white/10 text-white/70 border-white/20">
                    {driver.vehicleType === "motorcycle" ? "🏍 Moto" : "🚗 Machin"}
                  </Badge>
                )}
                {driver.rating > 0 && (
                  <Badge className="text-[10px] px-2 py-0.5 bg-amber-400/20 text-amber-300 border-amber-400/30">
                    ★ {driver.rating.toFixed(1)}
                  </Badge>
                )}
              </div>
            </div>

            <div className="text-right shrink-0">
              <p className="text-2xl font-black text-white leading-none">
                ${totalEarningsUsd.toFixed(2)}
              </p>
              <p className="text-[10px] text-white/40 mt-0.5">total revni</p>
            </div>
          </div>

          {/* Vehicle info */}
          {(driver.vehicleBrand || driver.licensePlateNumber) && (
            <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-xs text-white/50">
              <span>
                {[driver.vehicleBrand, driver.vehicleModel, driver.vehicleColor].filter(Boolean).join(" · ")}
              </span>
              {driver.licensePlateNumber && (
                <span className="font-mono bg-white/10 px-2 py-0.5 rounded-md text-white/70">
                  {driver.licensePlateNumber}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Stats Grid ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          icon={Package}
          label="Livrezon fini"
          value={String(completedDeliveries.length)}
          sub={`${pendingDeliveries.length} an kours`}
          color="text-blue-600"
          gradient="bg-blue-50/60 dark:bg-blue-950/20"
        />
        <StatCard
          icon={DollarSign}
          label="Revni total (80%)"
          value={`$${totalEarningsUsd.toFixed(2)}`}
          sub={`${driver.deliveryCount} livrezon total`}
          color="text-emerald-600"
          gradient="bg-emerald-50/60 dark:bg-emerald-950/20"
        />
        <StatCard
          icon={TrendingUp}
          label="Frè platfòm (20%)"
          value={`$${platformDeductions.toFixed(2)}`}
          sub="Dedui otomatikman"
          color="text-orange-600"
          gradient="bg-orange-50/60 dark:bg-orange-950/20"
        />
        <StatCard
          icon={Star}
          label="Nòt mwayen"
          value={driver.rating > 0 ? driver.rating.toFixed(1) : "—"}
          sub={driver.rating > 0 ? "/ 5.0 zetwal" : "Poko gen nòt"}
          color="text-amber-600"
          gradient="bg-amber-50/60 dark:bg-amber-950/20"
        />
      </div>

      {/* ── Ratings & Badges Section ──────────────────────────────────────── */}
      {reviewData && (
        <div className="space-y-3">
          {/* Flagged warning */}
          {reviewData.flagged && (
            <div className="rounded-2xl border border-red-300 bg-red-50 dark:bg-red-950/20 dark:border-red-800/40 px-4 py-3 flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-black text-red-700 dark:text-red-300">Kont ou anba revizyon ⚠️</p>
                <p className="text-xs text-red-600/80 dark:text-red-400/70 mt-0.5">Mwayen nòt ou ba. Yon admin ap revize kont ou. Kontinye bay bon sèvis pou amelyore nòt ou.</p>
              </div>
            </div>
          )}

          {/* Badges */}
          {(() => {
            const badges: { icon: string; label: string; desc: string; color: string }[] = [];
            const avg   = reviewData.avgRating;
            const cnt   = reviewData.reviewCount;
            const tips  = tipStats?.tipCount ?? 0;
            const dels  = driver.deliveryCount ?? 0;
            const low   = (reviewData.distribution["1"] ?? 0) + (reviewData.distribution["2"] ?? 0);
            if (avg >= 4.8 && dels >= 20)  badges.push({ icon: "🏆", label: "Top Chauffè",       desc: "Mwayen nòt ≥ 4.8 ak 20+ livrezon",       color: "from-amber-400 to-yellow-500"  });
            if (avg >= 4.5 && dels >= 10)  badges.push({ icon: "⚡", label: "Livrezon Rapid",    desc: "Chauffè rapid ak nòt ekselan",            color: "from-blue-400 to-cyan-500"     });
            if (tips >= 10)                badges.push({ icon: "❤️", label: "Kliyan Favori",      desc: "10+ poubwa resevwa — trè byeneme!",       color: "from-pink-400 to-rose-500"     });
            if (avg >= 4.5 && cnt >= 5)    badges.push({ icon: "⭐", label: "Nòt Ekselan",        desc: "Mwayen ≥ 4.5 sou 5+ evalyasyon",         color: "from-violet-400 to-purple-500" });
            if (cnt >= 5 && low === 0)     badges.push({ icon: "🛡️", label: "Chauffè Serye",     desc: "Zéwo nòt ba sou 5+ evalyasyon",           color: "from-green-400 to-emerald-500" });
            if (badges.length === 0) return null;
            return (
              <div className="space-y-2">
                <h3 className="text-sm font-black flex items-center gap-2">
                  <Award className="h-4 w-4 text-amber-500" /> Bag yo
                </h3>
                <div className="flex flex-wrap gap-2">
                  {badges.map(b => (
                    <div key={b.label} className={`flex items-center gap-2 px-3 py-1.5 rounded-full bg-gradient-to-r ${b.color} shadow-sm`}>
                      <span className="text-base leading-none">{b.icon}</span>
                      <span className="text-xs font-black text-white">{b.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Rating header */}
          <h3 className="text-sm font-black flex items-center gap-2">
            <Star className="h-4 w-4 text-amber-500 fill-amber-400" /> Evalyasyon Kliyan
            {reviewData.reviewCount > 0 && (
              <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 text-[10px]">
                {reviewData.reviewCount}
              </Badge>
            )}
          </h3>

          {reviewData.reviewCount === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-6 text-center space-y-1">
              <Star className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm font-semibold text-muted-foreground">Poko gen evalyasyon</p>
              <p className="text-xs text-muted-foreground/60">Kliyan yo ap kapab evalye ou apre livrezon</p>
            </div>
          ) : (
            <>
              {/* Rating summary */}
              <div className="rounded-2xl border border-amber-200/60 dark:border-amber-800/30 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/10 dark:to-orange-950/10 p-4">
                <div className="flex items-center gap-4">
                  <div className="text-center">
                    <p className="text-4xl font-black text-amber-600">{reviewData.avgRating.toFixed(1)}</p>
                    <div className="flex gap-0.5 justify-center mt-1">
                      {[1,2,3,4,5].map(s => (
                        <Star key={s} className={`h-3.5 w-3.5 ${s <= Math.round(reviewData.avgRating) ? "fill-amber-400 text-amber-400" : "fill-muted text-muted-foreground/20"}`} />
                      ))}
                    </div>
                    <p className="text-[10px] text-amber-600/70 mt-1">{reviewData.reviewCount} evalyasyon</p>
                  </div>
                  <div className="flex-1 space-y-1">
                    {[5,4,3,2,1].map(s => {
                      const cnt2 = reviewData.distribution[String(s)] ?? 0;
                      const pct  = reviewData.reviewCount > 0 ? (cnt2 / reviewData.reviewCount) * 100 : 0;
                      return (
                        <div key={s} className="flex items-center gap-1.5">
                          <span className="text-[10px] text-amber-700 dark:text-amber-300 w-3 text-right font-bold">{s}</span>
                          <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400 shrink-0" />
                          <div className="flex-1 h-1.5 bg-amber-100 dark:bg-amber-900/30 rounded-full overflow-hidden">
                            <div className="h-full bg-amber-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-[10px] text-muted-foreground w-4 text-right">{cnt2}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Positive rate */}
                <div className="mt-3 pt-3 border-t border-amber-200/40 flex items-center justify-between">
                  <span className="text-xs text-amber-700 dark:text-amber-300 font-semibold">Evalyasyon pozitif</span>
                  <span className="text-sm font-black text-amber-600">{reviewData.positiveRate}%</span>
                </div>
              </div>

              {/* Top positive tags */}
              {reviewData.topTags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {reviewData.topTags.map(({ tag, freq }) => (
                    <div key={tag} className="flex items-center gap-1 bg-amber-50 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-800/30 rounded-full px-2.5 py-1 text-xs font-semibold text-amber-700 dark:text-amber-300">
                      {tag}
                      <span className="text-amber-500 font-black">×{freq}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Recent 5 reviews */}
              <div className="space-y-2">
                {reviewData.reviews.slice(0, 5).map(r => (
                  <div key={r.id} className="rounded-2xl border border-border bg-card p-3.5 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <div className="w-6 h-6 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-xs font-black text-amber-600">
                          {(r.reviewer_name ?? "K")[0].toUpperCase()}
                        </div>
                        <span className="text-xs font-semibold">{r.reviewer_name ?? "Kliyan anonim"}</span>
                      </div>
                      <div className="flex gap-0.5">
                        {[1,2,3,4,5].map(s => (
                          <Star key={s} className={`h-3 w-3 ${s <= r.rating ? "fill-amber-400 text-amber-400" : "fill-muted text-muted-foreground/20"}`} />
                        ))}
                      </div>
                    </div>
                    {r.tags && r.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {r.tags.map(t => (
                          <span key={t} className="text-[10px] bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-300 border border-amber-200/50 dark:border-amber-800/30 px-2 py-0.5 rounded-full font-semibold">{t}</span>
                        ))}
                      </div>
                    )}
                    {r.comment && (
                      <p className="text-xs text-muted-foreground italic">"{r.comment}"</p>
                    )}
                    <p className="text-[10px] text-muted-foreground/50">
                      {new Date(r.created_at).toLocaleDateString("fr-HT", { day: "2-digit", month: "short", year: "numeric" })}
                    </p>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Tips Section ─────────────────────────────────────────────────── */}
      {tipStats && (
        <div className="space-y-3">
          <h3 className="text-sm font-black flex items-center gap-2">
            <Heart className="h-4 w-4 text-pink-500 fill-pink-400" /> Poubwa Resevwa
            {tipStats.tipCount > 0 && (
              <Badge className="bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300 text-[10px]">
                {tipStats.tipCount}
              </Badge>
            )}
          </h3>

          {/* Tip stat mini-cards */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-2xl p-3.5 border border-pink-200/60 bg-gradient-to-br from-pink-50 to-rose-50 dark:from-pink-950/20 dark:to-rose-950/20 dark:border-pink-800/30">
              <p className="text-xl font-black text-pink-600">${tipStats.total.toFixed(2)}</p>
              <p className="text-[10px] font-semibold text-pink-500/80 mt-0.5">Total poubwa</p>
            </div>
            <div className="rounded-2xl p-3.5 border border-orange-200/60 bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-950/20 dark:to-amber-950/20 dark:border-orange-800/30">
              <p className="text-xl font-black text-orange-600">${tipStats.thisMonth.toFixed(2)}</p>
              <p className="text-[10px] font-semibold text-orange-500/80 mt-0.5">Mwa sa a</p>
            </div>
            <div className="rounded-2xl p-3.5 border border-border bg-muted/30">
              <p className="text-xl font-black">${tipStats.thisWeek.toFixed(2)}</p>
              <p className="text-[10px] font-semibold text-muted-foreground mt-0.5">Semèn sa a</p>
            </div>
            <div className="rounded-2xl p-3.5 border border-border bg-muted/30">
              <p className="text-xl font-black">${tipStats.today.toFixed(2)}</p>
              <p className="text-[10px] font-semibold text-muted-foreground mt-0.5">Jodi a</p>
            </div>
          </div>

          {/* Tip history */}
          {tipStats.history.length > 0 && (
            <div className="space-y-2">
              {tipStats.history.slice(0, 10).map(tip => (
                <div key={tip.id} className="flex items-center gap-3 bg-card border border-border rounded-2xl px-3.5 py-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: "linear-gradient(135deg, #f97316, #ec4899)" }}>
                    <Heart className="h-4 w-4 text-white fill-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-foreground truncate">
                      {tip.tipper_name ?? "Yon kliyan"}
                      <span className="ml-1 text-[10px] font-normal text-muted-foreground capitalize">({tip.from_user_type})</span>
                    </p>
                    {tip.message && (
                      <p className="text-xs text-muted-foreground truncate">"{tip.message}"</p>
                    )}
                    {tip.rating && (
                      <div className="flex items-center gap-0.5 mt-0.5">
                        {Array.from({ length: tip.rating }).map((_, i) => (
                          <Star key={i} className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />
                        ))}
                      </div>
                    )}
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {new Date(tip.created_at).toLocaleDateString("fr-HT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                  <p className="font-black text-pink-600 shrink-0">+${tip.amount_usd.toFixed(2)}</p>
                </div>
              ))}
            </div>
          )}

          {tipStats.tipCount === 0 && (
            <div className="text-center py-8 space-y-2">
              <div className="w-12 h-12 bg-muted rounded-2xl flex items-center justify-center mx-auto">
                <Heart className="h-6 w-6 text-muted-foreground/40" />
              </div>
              <p className="text-sm text-muted-foreground">Pa gen poubwa pou kounye a</p>
              <p className="text-xs text-muted-foreground/60">Fè bon travay epi kliyan yo pral rekonpanse ou!</p>
            </div>
          )}
        </div>
      )}

      {/* ── Commission Explanation ───────────────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <h3 className="text-sm font-black flex items-center gap-2">
          <Wallet className="h-4 w-4 text-primary" /> Kijan Revni ou Kalkile
        </h3>
        <div className="space-y-2.5">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-primary shrink-0" />
              <span className="text-muted-foreground">Frè livrezon ($4 / 7 km)</span>
            </div>
            <span className="font-bold text-foreground">100%</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-emerald-500 shrink-0" />
              <span className="text-foreground font-semibold">Ou resevwa (80%)</span>
            </div>
            <span className="font-black text-emerald-600">$0.457 / km</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-orange-400 shrink-0" />
              <span className="text-muted-foreground">Platfòm Flexa (20%)</span>
            </div>
            <span className="font-semibold text-orange-600">$0.114 / km</span>
          </div>
          <div className="h-px bg-border" />
          <p className="text-[11px] text-muted-foreground flex items-start gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
            Peman ou kalkile otomatikman chak fwa ou rive livrezon nan. Peman kredite nan kont ou apre konfirmasyon.
          </p>
        </div>
      </div>

      {/* ── Pending Deliveries ───────────────────────────────────────────── */}
      {pendingDeliveries.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-black flex items-center gap-2">
            <Navigation className="h-4 w-4 text-blue-500" /> Livrezon An Kours
            <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 text-[10px]">
              {pendingDeliveries.length}
            </Badge>
          </h3>
          {pendingDeliveries.map(d => (
            <DeliveryCard key={d.id} delivery={d} />
          ))}
        </div>
      )}

      {/* ── Delivery History ─────────────────────────────────────────────── */}
      <div className="space-y-2">
        <h3 className="text-sm font-black flex items-center gap-2">
          <CheckCircle className="h-4 w-4 text-emerald-500" /> Istwa Livrezon
          {completedDeliveries.length > 0 && (
            <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 text-[10px]">
              {completedDeliveries.length}
            </Badge>
          )}
        </h3>

        {historyLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : deliveries.length === 0 ? (
          <div className="text-center py-12 space-y-3">
            <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mx-auto">
              <Truck className="h-8 w-8 text-muted-foreground/40" />
            </div>
            <p className="text-sm text-muted-foreground">Pa gen istwa livrezon pou kounye a</p>
            <Button variant="outline" onClick={() => setLocation("/deliveries")} className="rounded-xl">
              Chèche livrezon
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {completedDeliveries.slice(0, 20).map(d => (
              <DeliveryCard key={d.id} delivery={d} />
            ))}
          </div>
        )}
      </div>

      {/* ── Performance Badge ────────────────────────────────────────────── */}
      {completedDeliveries.length >= 10 && (
        <div className="rounded-2xl bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20 border border-amber-200/60 dark:border-amber-700/30 p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shrink-0">
            <Award className="h-6 w-6 text-white" />
          </div>
          <div>
            <p className="font-black text-amber-900 dark:text-amber-200 text-sm">
              {completedDeliveries.length >= 50 ? "Chauffè Elit 🌟" :
               completedDeliveries.length >= 25 ? "Chauffè Prò ⭐" : "Chauffè Konfyans ✓"}
            </p>
            <p className="text-xs text-amber-700 dark:text-amber-300/80">
              {completedDeliveries.length} livrezon fini · Mèsi pou sèvis ou!
            </p>
          </div>
        </div>
      )}

      {/* ── Go to Browse ─────────────────────────────────────────────────── */}
      <Button
        className="w-full h-12 font-bold"
        onClick={() => setLocation("/deliveries")}
        disabled={isSuspended}
      >
        <Truck className="h-4 w-4 mr-2" />
        {isActive ? "Chèche Livrezon Disponib" : "Wè Estati Kont Ou"}
      </Button>
    </div>
  );
}

// ── Delivery Card ─────────────────────────────────────────────────────────────

function fmtDt(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleString("fr-HT", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function DeliveryCard({ delivery: d }: { delivery: DeliveryHistoryItem }) {
  const [expanded, setExpanded] = useState(false);
  const MethodIcon = d.deliveryMethod === "car" ? Car : Bike;
  const platformFee = d.feeUsd ? d.feeUsd * 0.20 : null;

  const timeline = [
    { key: "accepted",  label: "Aksepte",  icon: CircleDot,    ts: d.acceptedAt,  loc: null },
    { key: "pickup",    label: "Pran",      icon: Package,      ts: d.pickedUpAt,  loc: [d.pickupAddress, d.pickupCity].filter(Boolean).join(", ") || null },
    { key: "delivered", label: "Livre",     icon: PackageCheck, ts: d.deliveredAt, loc: [d.deliveryAddress, d.deliveryCity].filter(Boolean).join(", ") || null },
  ].filter(t => t.ts);

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
      <div className={`h-1 w-full ${
        d.status === "delivered" ? "bg-emerald-500" :
        d.status === "cancelled" ? "bg-red-500" :
        d.status === "on_the_way" ? "bg-orange-500" :
        d.status === "waiting"   ? "bg-amber-400" : "bg-blue-500"
      }`} />

      {/* Header row */}
      <div className="p-3.5 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center shrink-0 border border-border">
          <MethodIcon className="h-4.5 w-4.5 text-muted-foreground" />
        </div>

        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-black text-sm text-foreground">FL-{d.id}</span>
            <Badge className={`text-[10px] px-1.5 py-0 ${STATUS_COLOR[d.status] ?? ""}`}>
              {STATUS_LABEL[d.status] ?? d.status}
            </Badge>
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3 text-blue-500 shrink-0" />
            <span className="font-medium text-foreground truncate">{d.pickupCity ?? "?"}</span>
            <ChevronRight className="h-3 w-3 shrink-0" />
            <Flag className="h-3 w-3 text-red-500 shrink-0" />
            <span className="font-medium text-foreground truncate">{d.deliveryCity ?? "?"}</span>
            {d.distanceKm != null && (
              <span className="font-bold text-primary bg-primary/10 px-1.5 py-0 rounded-md shrink-0">
                {d.distanceKm.toFixed(1)} km
              </span>
            )}
          </div>

          <p className="text-[10px] text-muted-foreground">
            Kreye: {fmtDt(d.createdAt)}
          </p>
        </div>

        <div className="flex flex-col items-end gap-1 shrink-0">
          {d.driverEarnings != null && d.driverEarnings > 0 ? (
            <>
              <p className="font-black text-base text-emerald-600">+${d.driverEarnings.toFixed(2)}</p>
              <p className="text-[10px] text-muted-foreground">ou (80%)</p>
              {platformFee != null && (
                <p className="text-[10px] text-orange-500">-${platformFee.toFixed(2)} platfòm</p>
              )}
            </>
          ) : (
            <p className="text-xs text-muted-foreground">—</p>
          )}
          {timeline.length > 0 && (
            <button
              type="button"
              onClick={() => setExpanded(v => !v)}
              className="text-[10px] text-primary underline mt-1"
            >
              {expanded ? "Kache" : "Istwa"}
            </button>
          )}
        </div>
      </div>

      {/* Timeline */}
      {expanded && timeline.length > 0 && (
        <div className="px-3.5 pb-3.5 border-t border-border/50 pt-3 space-y-0">
          {timeline.map((step, i) => {
            const Icon = step.icon;
            const isLast = i === timeline.length - 1;
            return (
              <div key={step.key} className="flex gap-3">
                {/* Vertical line */}
                <div className="flex flex-col items-center">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                    step.key === "delivered" ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40" :
                    step.key === "pickup"    ? "bg-violet-100 text-violet-600 dark:bg-violet-900/40" :
                                              "bg-blue-100 text-blue-600 dark:bg-blue-900/40"
                  }`}>
                    <Icon className="h-3 w-3" />
                  </div>
                  {!isLast && <div className="w-px flex-1 bg-border my-0.5" />}
                </div>
                <div className={`min-w-0 ${isLast ? "pb-0" : "pb-2.5"}`}>
                  <p className="text-xs font-bold text-foreground">{step.label}</p>
                  <p className="text-[10px] text-muted-foreground">{fmtDt(step.ts)}</p>
                  {step.loc && (
                    <p className="text-[10px] text-primary mt-0.5 flex items-center gap-1">
                      <MapPin className="h-2.5 w-2.5 shrink-0" />
                      {step.loc}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
