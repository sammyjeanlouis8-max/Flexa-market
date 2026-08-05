import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import {
  Package, Clock, User, MapPin, Truck, CheckCircle, Search,
  Loader2, AlertCircle, Shield, ChevronRight, ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// ── Types ─────────────────────────────────────────────────────────────────────
interface PublicDelivery {
  id: number;
  trackingNumber: string;
  status: string;
  deliveryCity: string | null;
  pickupCity: string | null;
  country: string;
  createdAt: string;
  acceptedAt: string | null;
  pickedUpAt: string | null;
  deliveredAt: string | null;
  driverFirstName: string | null;
  driverVehicleType: string | null;
  estimatedMinutes: number | null;
}

const STEPS = [
  { key: "waiting",         label: "Kòmand Reçu",       icon: Package },
  { key: "driver_assigned", label: "Chofè Trovè",        icon: User },
  { key: "arrived_pickup",  label: "Kote Machann",       icon: MapPin },
  { key: "picked_up",       label: "Kolis Ranmase",      icon: Package },
  { key: "on_the_way",      label: "Sou Wout",           icon: Truck },
  { key: "arrived",         label: "Rive Kote Ou",       icon: MapPin },
  { key: "delivered",       label: "Livre ✓",            icon: CheckCircle },
];

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  waiting:         { label: "Ap Chèche Chofè",   color: "text-orange-600 dark:text-orange-400", bg: "bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-700" },
  driver_assigned: { label: "Chofè Asiyé",       color: "text-green-600 dark:text-green-400",  bg: "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-700" },
  arrived_pickup:  { label: "Kote Machann",       color: "text-green-600 dark:text-green-400",  bg: "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-700" },
  picked_up:       { label: "Kolis Ranmase",      color: "text-blue-600 dark:text-blue-400",    bg: "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-700" },
  on_the_way:      { label: "Sou Wout",           color: "text-blue-600 dark:text-blue-400",    bg: "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-700" },
  arrived:         { label: "Chofè Rive!",        color: "text-green-600 dark:text-green-400",  bg: "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-700" },
  delivered:       { label: "Livre ✓",            color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-700" },
};

// ── Animated Route Visualization ──────────────────────────────────────────────
function TrackingRoute({ status, isMoto }: { status: string; isMoto: boolean }) {
  const stepIdx = Math.max(0, STEPS.findIndex(s => s.key === status));
  const progress = stepIdx / (STEPS.length - 1);

  return (
    <div className="relative w-full h-32 bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl overflow-hidden">
      {/* Grid lines */}
      {[25, 50, 75].map(p => (
        <div key={p} className="absolute inset-y-0 border-l border-white/5" style={{ left: `${p}%` }} />
      ))}
      {[33, 66].map(p => (
        <div key={p} className="absolute inset-x-0 border-t border-white/5" style={{ top: `${p}%` }} />
      ))}

      {/* Route track */}
      <div className="absolute top-1/2 left-6 right-6 -translate-y-1/2 h-1.5 bg-white/10 rounded-full">
        <div
          className="h-full bg-gradient-to-r from-orange-500 to-green-500 rounded-full transition-all duration-1000"
          style={{ width: `${progress * 100}%` }}
        />
      </div>

      {/* Origin dot */}
      <div className="absolute left-6 top-1/2 -translate-y-1/2">
        <div className="w-4 h-4 rounded-full bg-orange-500 border-2 border-white shadow-lg shadow-orange-500/40" />
        <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[9px] text-white/60 whitespace-nowrap font-medium">MACHANN</div>
      </div>

      {/* Destination pin */}
      <div className="absolute right-6 top-1/2 -translate-y-1/2 -translate-y-2">
        <svg width="20" height="28" viewBox="0 0 20 28">
          <path d="M10 0C4.5 0 0 4.5 0 10c0 7.5 10 18 10 18s10-10.5 10-18C20 4.5 15.5 0 10 0z" fill="#22c55e"/>
          <circle cx="10" cy="10" r="4" fill="white"/>
        </svg>
        <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-[9px] text-white/60 whitespace-nowrap font-medium">VOU</div>
      </div>

      {/* Moving vehicle */}
      {status !== "delivered" && (
        <div
          className="absolute top-1/2 -translate-y-1/2 transition-all duration-1000"
          style={{ left: `calc(24px + ${progress * (100 - (24 / 4))}% - 16px)` }}
        >
          <div className="w-9 h-9 rounded-full bg-white shadow-xl shadow-black/30 flex items-center justify-center text-xl border-2 border-slate-200">
            {isMoto ? "🏍️" : "🚗"}
          </div>
          {["on_the_way", "arrived_pickup", "arrived"].includes(status) && (
            <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-green-400 animate-ping" />
          )}
        </div>
      )}

      {/* Delivered checkmark */}
      {status === "delivered" && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex flex-col items-center gap-1">
            <div className="w-12 h-12 rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center">
              <CheckCircle className="h-7 w-7 text-emerald-400" />
            </div>
            <span className="text-xs font-black text-emerald-400">LIVRE ✓</span>
          </div>
        </div>
      )}

      {/* FM badge */}
      <div className="absolute top-2.5 right-3 flex items-center gap-1 bg-white/10 rounded-full px-2 py-0.5">
        <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
        <span className="text-[9px] font-black text-white tracking-wider">FM LIVE</span>
      </div>
    </div>
  );
}

// ── Status Timeline ────────────────────────────────────────────────────────────
function TrackingTimeline({ status, delivery }: { status: string; delivery: PublicDelivery }) {
  const currentIdx = STEPS.findIndex(s => s.key === status);
  const timestamps: Record<string, string | null | undefined> = {
    waiting: delivery.createdAt,
    driver_assigned: delivery.acceptedAt,
    picked_up: delivery.pickedUpAt,
    delivered: delivery.deliveredAt,
  };

  return (
    <div className="space-y-1">
      {STEPS.map((step, i) => {
        const Icon = step.icon;
        const done = i <= currentIdx;
        const active = i === currentIdx;
        const ts = timestamps[step.key];

        return (
          <div key={step.key} className="flex items-start gap-3">
            {/* Icon column */}
            <div className="flex flex-col items-center shrink-0" style={{ width: 32 }}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all ${
                active ? "border-green-500 bg-green-500 text-white shadow-lg shadow-green-500/25"
                  : done  ? "border-green-400/60 bg-green-50 dark:bg-green-900/20 text-green-500"
                  : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-300"
              }`}>
                <Icon className="h-3.5 w-3.5" />
              </div>
              {i < STEPS.length - 1 && (
                <div className={`w-0.5 h-6 my-0.5 ${i < currentIdx ? "bg-green-400/50" : "bg-gray-200 dark:bg-gray-700"}`} />
              )}
            </div>

            {/* Label + timestamp */}
            <div className={`flex-1 pb-2 ${active ? "" : ""}`}>
              <div className="flex items-center gap-2">
                <p className={`text-sm font-bold ${
                  active ? "text-green-600 dark:text-green-400"
                    : done ? "text-gray-800 dark:text-gray-200"
                    : "text-gray-400 dark:text-gray-600"
                }`}>
                  {step.label}
                </p>
                {active && (
                  <span className="flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-green-400 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
                  </span>
                )}
              </div>
              {ts && done && (
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                  {new Date(ts).toLocaleString("fr-HT", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function PublicTracking() {
  const [, params] = useRoute("/track/:trackingNumber");
  const [, setLocation] = useLocation();
  const [inputValue, setInputValue] = useState(params?.trackingNumber ?? "");
  const [delivery, setDelivery] = useState<PublicDelivery | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchTracking = async (tn: string) => {
    if (!tn.trim()) return;
    setLoading(true);
    setError("");
    try {
      const r = await fetch(`/api/track/${encodeURIComponent(tn.trim().toUpperCase())}`);
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        setError((data as any)?.error || "Nimewo tracking sa pa jwenn. Verifye l epi eseye ankò.");
        setDelivery(null);
      } else {
        const data = await r.json();
        setDelivery(data.delivery);
        setLocation(`/track/${tn.trim().toUpperCase()}`, { replace: true });
      }
    } catch {
      setError("Pa ka konekte ak sèvè a. Tcheke koneksyon ou epi eseye ankò.");
    } finally {
      setLoading(false);
    }
  };

  // Auto-fetch if tracking number in URL
  useEffect(() => {
    if (params?.trackingNumber) {
      setInputValue(params.trackingNumber);
      fetchTracking(params.trackingNumber);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params?.trackingNumber]);

  const meta = delivery ? STATUS_META[delivery.status] ?? STATUS_META["waiting"] : null;
  const isMoto = delivery?.driverVehicleType === "moto" || delivery?.driverVehicleType === "motorcycle";

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* ── Header ── */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-0 z-20 shadow-sm">
        <div className="max-w-xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="flex items-center gap-2 flex-1">
            <span className="text-xl font-black text-orange-500">FLEXA</span>
            <span className="text-xl font-black text-gray-900 dark:text-white">MARKET</span>
          </div>
          <div className="flex items-center gap-1.5 bg-gray-100 dark:bg-gray-800 rounded-full px-3 py-1">
            <Package className="h-3.5 w-3.5 text-gray-500" />
            <span className="text-xs font-bold text-gray-600 dark:text-gray-400">TRACKING</span>
          </div>
        </div>
      </div>

      <div className="max-w-xl mx-auto px-4 py-6 space-y-5">
        {/* ── Search Box ── */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-5 border border-gray-200 dark:border-gray-800 shadow-sm">
          <p className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
            <Search className="h-4 w-4 text-orange-500" />
            Antre Nimewo Tracking Ou
          </p>
          <div className="flex gap-2">
            <Input
              value={inputValue}
              onChange={e => setInputValue(e.target.value.toUpperCase())}
              placeholder="FM-XXXXXXXXX"
              className="font-mono text-sm tracking-wider flex-1"
              onKeyDown={e => e.key === "Enter" && fetchTracking(inputValue)}
              disabled={loading}
            />
            <Button
              onClick={() => fetchTracking(inputValue)}
              disabled={loading || !inputValue.trim()}
              className="bg-orange-500 hover:bg-orange-600 text-white shrink-0"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Swiv"}
            </Button>
          </div>
          {error && (
            <div className="flex items-start gap-2 mt-3 p-3 bg-red-50 dark:bg-red-950/30 rounded-xl border border-red-200 dark:border-red-800">
              <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
              <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}
        </div>

        {/* ── Tracking Result ── */}
        {delivery && meta && (
          <>
            {/* Status Banner */}
            <div className={`border rounded-2xl px-5 py-4 ${meta.bg}`}>
              <div className="flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className={`text-xs font-black tracking-wider uppercase ${meta.color}`}>FLEXA MARKET DELIVERY</p>
                    <Shield className={`h-3 w-3 ${meta.color}`} />
                  </div>
                  <p className={`text-2xl font-black ${meta.color}`}>{meta.label}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 font-mono">{delivery.trackingNumber}</p>
                </div>
                {delivery.status !== "delivered" && delivery.estimatedMinutes && (
                  <div className="text-right shrink-0">
                    <p className="text-xs text-gray-500 dark:text-gray-400">ETA</p>
                    <p className={`text-2xl font-black tabular-nums ${meta.color}`}>{delivery.estimatedMinutes}</p>
                    <p className="text-xs text-gray-400">minit</p>
                  </div>
                )}
              </div>
            </div>

            {/* Route Animation */}
            <TrackingRoute status={delivery.status} isMoto={isMoto} />

            {/* Delivery Info */}
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                <p className="text-xs font-black text-gray-500 uppercase tracking-wider">Enfòmasyon Livrezon</p>
              </div>
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {delivery.pickupCity && (
                  <div className="px-5 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-orange-500" />
                      <span className="text-sm text-gray-500 dark:text-gray-400">Kote Machann</span>
                    </div>
                    <span className="text-sm font-bold text-gray-800 dark:text-gray-200">{delivery.pickupCity}</span>
                  </div>
                )}
                {delivery.deliveryCity && (
                  <div className="px-5 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-green-500" />
                      <span className="text-sm text-gray-500 dark:text-gray-400">Destinasyon</span>
                    </div>
                    <span className="text-sm font-bold text-gray-800 dark:text-gray-200">{delivery.deliveryCity}</span>
                  </div>
                )}
                {delivery.driverFirstName && delivery.status !== "waiting" && (
                  <div className="px-5 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <User className="h-3.5 w-3.5 text-gray-400" />
                      <span className="text-sm text-gray-500 dark:text-gray-400">Chofè</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-bold text-gray-800 dark:text-gray-200">{delivery.driverFirstName}</span>
                      <Shield className="h-3 w-3 text-green-500" />
                    </div>
                  </div>
                )}
                <div className="px-5 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="h-3.5 w-3.5 text-gray-400" />
                    <span className="text-sm text-gray-500 dark:text-gray-400">Kòmand Pase</span>
                  </div>
                  <span className="text-sm font-bold text-gray-800 dark:text-gray-200">
                    {new Date(delivery.createdAt).toLocaleDateString("fr-HT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              </div>
            </div>

            {/* Timeline */}
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5">
              <p className="text-xs font-black text-gray-500 uppercase tracking-wider mb-4">Istorik Livrezon</p>
              <TrackingTimeline status={delivery.status} delivery={delivery} />
            </div>

            {/* Login CTA */}
            <div className="bg-gradient-to-br from-orange-500/10 to-orange-600/5 border border-orange-200 dark:border-orange-800/40 rounded-2xl p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-orange-500/20 flex items-center justify-center shrink-0">
                <ExternalLink className="h-6 w-6 text-orange-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-black text-gray-900 dark:text-white">Konekte pou wè plis detay</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Wè kòd sekrè, kontakte chofè, epi konfime livrezon</p>
              </div>
              <a href="/login" className="shrink-0">
                <Button size="sm" className="bg-orange-500 hover:bg-orange-600 text-white text-xs">
                  Konekte <ChevronRight className="h-3 w-3 ml-1" />
                </Button>
              </a>
            </div>
          </>
        )}

        {/* Empty state (no search yet) */}
        {!delivery && !loading && !error && !params?.trackingNumber && (
          <div className="flex flex-col items-center gap-4 py-12 text-center">
            <div className="w-20 h-20 rounded-full bg-orange-50 dark:bg-orange-950/30 flex items-center justify-center">
              <Package className="h-10 w-10 text-orange-400" />
            </div>
            <div>
              <p className="font-black text-gray-800 dark:text-white text-lg">Swiv Livrezon Ou</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-xs">
                Antre nimewo FM-XXXXXXXXX ou jwenn nan email konfirmasyon ou pou wè estati livrezon ou an tan reyèl.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3 w-full max-w-xs mt-2">
              {["📦 Ranmase", "🏍️ Sou Wout", "✅ Livre"].map(label => (
                <div key={label} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl py-3 px-2 text-center">
                  <p className="text-xs font-bold text-gray-600 dark:text-gray-400">{label}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Trust footer */}
        <div className="flex items-center justify-center gap-2 py-2">
          <Shield className="h-3.5 w-3.5 text-green-500" />
          <p className="text-xs text-gray-400 font-medium">Pwoteje pa Flexa Market Escrow System</p>
        </div>
      </div>
    </div>
  );
}
