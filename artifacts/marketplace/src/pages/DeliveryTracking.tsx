import { useState, useEffect, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { useAuth } from "@/contexts/auth";
import { useTranslation } from "react-i18next";
import {
  Package, MapPin, CheckCircle, Clock, Truck, User,
  Phone, Loader2, AlertCircle, Star, Copy, ChevronRight,
  Shield, MessageCircle, Navigation2, Bike, Car, ChevronDown,
  Wifi, Heart,
} from "lucide-react";
import TipModal from "@/components/TipModal";
import DriverRatingModal from "@/components/DriverRatingModal";
import { OpenDisputeDialog } from "@/components/OpenDisputeDialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useSocket } from "@/hooks/useSocket";

// ── Types ──────────────────────────────────────────────────────────────────────
interface DeliveryData {
  id: number; status: string; deliveryMethod: string;
  pickupAddress: string | null; pickupCity: string | null;
  deliveryAddress: string | null; deliveryCity: string | null;
  verificationCode: string | null; country: string;
  totalAmount: number | null; currency: string;
  acceptedAt: string | null; pickedUpAt: string | null;
  deliveredAt: string | null; paymentHeldUntil: string | null;
  createdAt: string; sellerId: number; buyerId: number; driverUserId: number | null;
  holdAmountUsd?: number | null;
  returnCode?: string | null;
  failedPickupAt?: string | null;
  returnFeeUsd?: number | null;
  feeUsd?: number | null;
  buyerAbsentAt?: string | null;
  buyerRescheduleDeadline?: string | null;
  pickupPhotoUrl?: string | null;
  dropoffPhotoUrl?: string | null;
}
interface DriverInfo {
  name: string; avatar: string | null; phone: string | null;
  rating: number | null; deliveryCount: number | null; isOnline: boolean | null;
  vehicleType: string | null; vehicleBrand: string | null; vehicleModel: string | null;
  vehicleYear: string | null; vehicleColor: string | null; licensePlateNumber: string | null;
  photoFront: string | null; photoSide: string | null; facePhotoFront: string | null;
  latitude: number | null; longitude: number | null; lastLocationAt: string | null;
}

// ── Simple Haversine for km distance (client-side) ────────────────────────────
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Known city coordinates (Haiti + DR)
const CITY_COORDS: Record<string, [number, number]> = {
  "Port-au-Prince": [18.5392, -72.3288],
  "Pétion-Ville":   [18.5128, -72.2872],
  "Delmas":         [18.5494, -72.3072],
  "Croix-des-Bouquets": [18.5769, -72.2217],
  "Tabarre":        [18.5844, -72.2711],
  "Carrefour":      [18.5308, -72.4036],
  "Léogâne":        [18.5142, -72.6317],
  "Jacmel":         [18.2336, -72.5353],
  "Cap-Haïtien":    [19.7580, -72.2003],
  "Gonaïves":       [19.4500, -72.6833],
  "Saint-Marc":     [19.1167, -72.7000],
  "Les Cayes":      [18.2000, -73.7333],
  "Jérémie":        [18.6500, -74.1167],
  "Port-de-Paix":   [19.9333, -72.8333],
  "Santo Domingo":  [18.4861, -69.9312],
  "Santiago":       [19.4510, -70.6974],
  "La Romana":      [18.4274, -68.9728],
};

function lookupCityCoords(city: string | null): [number, number] | null {
  if (!city) return null;
  const key = Object.keys(CITY_COORDS).find(k =>
    city.toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes(city.toLowerCase())
  );
  return key ? CITY_COORDS[key] : null;
}

const STEPS = ["waiting", "driver_assigned", "picked_up", "on_the_way", "arrived", "delivered"];
const STEP_ICONS = [Clock, User, Package, Truck, MapPin, CheckCircle];

// ── Google-Maps-style Animated Map with optional real GPS dot ─────────────────
function PremiumMap({
  status, isMoto, driverLat, driverLng,
}: {
  status: string; isMoto: boolean;
  driverLat: number | null; driverLng: number | null;
}) {
  const [progress, setProgress] = useState(0);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const idx = Math.max(0, STEPS.indexOf(status));
    const target = idx / (STEPS.length - 1);
    const id = setInterval(() => {
      setProgress(p => {
        const diff = target - p;
        return Math.abs(diff) < 0.005 ? target : p + diff * 0.05;
      });
      setTick(t => t + 1);
    }, 80);
    return () => clearInterval(id);
  }, [status]);

  const routeD = "M 40 230 C 80 215 110 195 140 170 C 168 148 185 128 215 110 C 248 90 272 78 305 60 C 330 46 355 35 375 25";
  const points = [
    [40,230],[75,215],[110,195],[140,170],[170,148],[200,125],[230,108],[265,88],[300,65],[375,25],
  ];
  const pidx = Math.min(Math.floor(progress * (points.length - 1)), points.length - 2);
  const frac  = progress * (points.length - 1) - pidx;
  const vx = points[pidx][0] + (points[pidx+1][0] - points[pidx][0]) * frac;
  const vy = points[pidx][1] + (points[pidx+1][1] - points[pidx][1]) * frac;
  const isActive = !["waiting","delivered"].includes(status);

  // Map real GPS lat/lng → SVG coordinates (Haiti/DR bounding box)
  // lat range 18.0–20.1, lng range -74.5 to -71.7
  let realX: number | null = null;
  let realY: number | null = null;
  if (driverLat != null && driverLng != null) {
    realX = Math.max(10, Math.min(390, ((driverLng + 74.5) / 2.8) * 400));
    realY = Math.max(10, Math.min(260, ((20.1 - driverLat) / 2.1) * 270));
  }

  return (
    <div className="absolute inset-0 overflow-hidden">
      <div className="absolute inset-0" style={{ background: "#e8eaed" }} />
      <svg viewBox="0 0 400 270" className="absolute inset-0 w-full h-full" preserveAspectRatio="xMidYMid slice">
        {/* Green park areas */}
        <rect x="0"   y="0"   width="60"  height="65"  rx="0" fill="#c5e4a5" opacity="0.6" />
        <rect x="280" y="180" width="120" height="90"  rx="0" fill="#c5e4a5" opacity="0.6" />
        <rect x="120" y="0"   width="50"  height="40"  rx="0" fill="#c5e4a5" opacity="0.5" />
        <rect x="0"   y="150" width="40"  height="120" rx="0" fill="#c5e4a5" opacity="0.4" />
        {/* City blocks */}
        {[
          [65,5,50,55],[175,5,55,50],[240,5,55,50],[310,5,60,50],
          [65,70,50,60],[130,70,45,60],[190,70,45,55],[245,70,45,55],[300,70,65,55],
          [45,145,45,55],[100,145,50,55],[160,145,50,55],[220,145,50,55],
          [65,215,45,50],[120,215,50,50],[180,215,50,50],[240,215,45,50],
        ].map(([x,y,w,h], i) => (
          <rect key={i} x={x} y={y} width={w} height={h} rx="2" fill="#d8dbe3" opacity="0.85" />
        ))}
        {/* Roads */}
        <line x1="0" y1="65"  x2="400" y2="65"  stroke="#c8cad0" strokeWidth="8" />
        <line x1="0" y1="135" x2="400" y2="135" stroke="#c8cad0" strokeWidth="8" />
        <line x1="0" y1="210" x2="400" y2="210" stroke="#c8cad0" strokeWidth="8" />
        <line x1="60"  y1="0" x2="60"  y2="270" stroke="#c8cad0" strokeWidth="8" />
        <line x1="115" y1="0" x2="115" y2="270" stroke="#c8cad0" strokeWidth="8" />
        <line x1="175" y1="0" x2="175" y2="270" stroke="#c8cad0" strokeWidth="8" />
        <line x1="240" y1="0" x2="240" y2="270" stroke="#c8cad0" strokeWidth="8" />
        <line x1="300" y1="0" x2="300" y2="270" stroke="#c8cad0" strokeWidth="8" />
        {/* Road dashes */}
        {[65,135,210].map((y, i) => (
          <line key={i} x1="0" y1={y} x2="400" y2={y} stroke="white" strokeWidth="1.5" strokeDasharray="18 16" opacity="0.7" />
        ))}
        {/* Street labels */}
        <text x="12"  y="60"  fontSize="6" fill="#80868b" fontWeight="500" fontFamily="sans-serif">Rue Lamarre</text>
        <text x="12"  y="130" fontSize="6" fill="#80868b" fontWeight="500" fontFamily="sans-serif">Rue Chartophe</text>
        <text x="12"  y="205" fontSize="6" fill="#80868b" fontWeight="500" fontFamily="sans-serif">Delmas</text>
        <text x="62"  y="12"  fontSize="6" fill="#80868b" fontWeight="500" fontFamily="sans-serif" transform="rotate(90,62,12)">Av. Christophe</text>
        <text x="302" y="12"  fontSize="6" fill="#80868b" fontWeight="500" fontFamily="sans-serif" transform="rotate(90,302,12)">Blvd. Toussaint</text>
        {/* Yellow route */}
        <path d={routeD} stroke="#d4a000" strokeWidth="12" fill="none"
          strokeLinecap="round" strokeLinejoin="round" opacity="0.25"
          strokeDasharray="1000" strokeDashoffset={1000 - progress * 1000}
        />
        <path d={routeD} stroke="#FBBF24" strokeWidth="7" fill="none"
          strokeLinecap="round" strokeLinejoin="round"
          strokeDasharray="1000" strokeDashoffset={1000 - progress * 1000}
        />
        <path d={routeD} stroke="white" strokeWidth="2" fill="none"
          strokeLinecap="round" strokeLinejoin="round" opacity="0.4"
          strokeDasharray="1000" strokeDashoffset={1000 - progress * 1000}
        />
        {/* Pickup dot */}
        <circle cx="40" cy="230" r="9" fill="white" stroke="#f97316" strokeWidth="2.5" />
        <circle cx="40" cy="230" r="5" fill="#f97316" />
        <circle cx="40" cy="230" r={12 + (tick % 20) * 0.4} fill="none"
          stroke="#f97316" strokeWidth="1.2" opacity={0.9 - (tick % 20) * 0.045} />
        {/* Destination pin */}
        <ellipse cx="375" cy="32" rx="14" ry="5" fill="rgba(0,0,0,0.15)" />
        <path d="M375 25 C375 19 367 13 367 22 C367 28 372 33 375 36 C378 33 383 28 383 22 C383 13 375 19 375 25Z" fill="#EA4335" />
        <circle cx="375" cy="22" r="4" fill="white" />
        {/* Animated vehicle (status-based) */}
        {isActive && realX == null && (
          <g transform={`translate(${vx},${vy})`}>
            <ellipse cx="0" cy="6" rx="14" ry="5" fill="rgba(0,0,0,0.25)" />
            <circle cx="0" cy="0" r="14" fill="white" stroke="#333" strokeWidth="1.5" />
            <text x="0" y="5" textAnchor="middle" fontSize="13">
              {isMoto ? "🏍️" : "🚗"}
            </text>
          </g>
        )}
        {/* Real GPS vehicle dot (replaces animated one when GPS available) */}
        {realX != null && realY != null && (
          <g transform={`translate(${realX},${realY})`}>
            <circle cx="0" cy="0" r="18" fill="#22c55e" opacity="0.2" />
            <circle cx="0" cy="0" r="12" fill="white" stroke="#22c55e" strokeWidth="2.5" />
            <text x="0" y="5" textAnchor="middle" fontSize="13">
              {isMoto ? "🏍️" : "🚗"}
            </text>
            {/* GPS accuracy ring pulse */}
            <circle cx="0" cy="0" r={16 + (tick % 30) * 0.5} fill="none"
              stroke="#22c55e" strokeWidth="1.5" opacity={0.8 - (tick % 30) * 0.026} />
          </g>
        )}
      </svg>
      {/* Real GPS indicator badge */}
      {realX != null && (
        <div className="absolute top-3 right-3 bg-green-500/90 backdrop-blur-sm rounded-full px-2.5 py-1 flex items-center gap-1.5 shadow-md z-10">
          <Wifi className="h-3 w-3 text-white" />
          <span className="text-[10px] font-black text-white">GPS LIVE</span>
          <span className="flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-white opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
          </span>
        </div>
      )}
      {/* Bottom fade */}
      <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-white dark:from-gray-900 to-transparent" />
    </div>
  );
}

// ── FM License Plate ───────────────────────────────────────────────────────────
function FMPlate({ plate }: { plate: string }) {
  return (
    <div className="flex flex-col items-center justify-center bg-white rounded-xl border-2 border-gray-300 shadow-md px-4 pt-1.5 pb-2 min-w-[148px]">
      <div className="flex items-center gap-1.5 w-full mb-1">
        <div className="flex-1 h-[2px] bg-green-500/60 rounded-full" />
        <span className="text-[9px] font-black tracking-[4px] text-gray-600 uppercase">FM</span>
        <div className="flex-1 h-[2px] bg-green-500/60 rounded-full" />
      </div>
      <span className="text-[22px] font-black tracking-[2px] text-gray-900 leading-none font-mono">
        {plate}
      </span>
      <div className="flex w-full gap-1 mt-1.5">
        <div className="flex-1 h-0.5 bg-green-500/40 rounded-full" />
        <div className="flex-1 h-0.5 bg-green-500/40 rounded-full" />
      </div>
    </div>
  );
}

// ── Status timeline ────────────────────────────────────────────────────────────
function StatusTimeline({ status }: { status: string }) {
  const currentIdx = STEPS.indexOf(status);
  return (
    <div className="flex items-center justify-between">
      {STEPS.map((s, i) => {
        const Icon = STEP_ICONS[i];
        const done = i <= currentIdx;
        const active = i === currentIdx;
        return (
          <div key={s} className="flex flex-1 items-center">
            <div className="flex flex-col items-center shrink-0">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center border-2 transition-all duration-500 ${
                active ? "border-green-500 bg-green-500 text-white scale-125 shadow-lg shadow-green-500/30"
                  : done ? "border-green-400 bg-green-50 text-green-600"
                  : "border-gray-200 bg-white text-gray-400"
              }`}>
                <Icon className="h-3 w-3" />
              </div>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`flex-1 h-0.5 mx-0.5 transition-all duration-700 ${
                i < currentIdx ? "bg-green-400" : "bg-gray-200"
              }`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Main Driver Tracking Card ──────────────────────────────────────────────────
function DriverTrackingCard({
  driver, delivery, isBuyer, onCopyCode, vehicleImageUrl,
  driverLat, driverLng, lastGpsUpdate, onTipOpen,
}: {
  driver: DriverInfo | null;
  delivery: DeliveryData;
  isBuyer: boolean;
  onCopyCode: () => void;
  vehicleImageUrl?: string | null;
  driverLat: number | null;
  driverLng: number | null;
  lastGpsUpdate: string | null;
  onTipOpen: () => void;
}) {
  const { t } = useTranslation();
  const [showDetails, setShowDetails] = useState(false);

  const STATUS_META: Record<string, { label: string; bg: string }> = {
    waiting:         { label: "LOOKING FOR DRIVER",  bg: "bg-orange-500" },
    driver_assigned: { label: "DRIVER ASSIGNED",     bg: "bg-green-500"  },
    picked_up:       { label: "PACKAGE PICKED UP",   bg: "bg-green-500"  },
    on_the_way:      { label: "DRIVER ON THE WAY",   bg: "bg-green-500"  },
    arrived:         { label: "DRIVER ARRIVED",      bg: "bg-green-500"  },
    delivered:       { label: "DELIVERED ✓",         bg: "bg-blue-500"   },
    failed_pickup:   { label: "PICKUP RATE",         bg: "bg-red-500"    },
    returned:        { label: "RETOUNEN ✓",          bg: "bg-slate-500"  },
  };

  const meta      = STATUS_META[delivery.status] ?? STATUS_META["waiting"];
  const isMoto    = driver?.vehicleType === "moto";
  const isLive    = !["waiting", "delivered"].includes(delivery.status);
  const isDelivered = delivery.status === "delivered";
  const isWaiting   = delivery.status === "waiting";

  const vehicleName   = [driver?.vehicleBrand, driver?.vehicleModel, driver?.vehicleYear].filter(Boolean).join(" ") || null;
  const vehicleDetail = [driver?.vehicleColor, isMoto ? "Moto" : "Sedan"].filter(Boolean).join(" • ");
  const vehiclePhoto  = driver?.photoFront ?? vehicleImageUrl ?? null;

  // Real distance from GPS
  const destCoords = lookupCityCoords(delivery.deliveryCity);
  const kmAway = (driverLat != null && driverLng != null && destCoords)
    ? haversineKm(driverLat, driverLng, destCoords[0], destCoords[1])
    : null;
  const etaMin = kmAway != null ? Math.max(1, Math.round((kmAway / 30) * 60)) : null;

  // Format last GPS update
  const gpsAgo = lastGpsUpdate
    ? (() => {
        const secs = Math.floor((Date.now() - new Date(lastGpsUpdate).getTime()) / 1000);
        if (secs < 60) return `${secs}s ago`;
        return `${Math.floor(secs / 60)}m ago`;
      })()
    : null;

  const trackDriverUrl = driverLat != null && driverLng != null
    ? `https://www.google.com/maps?q=${driverLat},${driverLng}`
    : delivery.deliveryCity
    ? `https://www.google.com/maps/search/${encodeURIComponent(delivery.deliveryCity)}`
    : null;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-t-[28px] shadow-[0_-8px_40px_rgba(0,0,0,0.15)] overflow-hidden">
      {/* Drag handle */}
      <div className="flex justify-center pt-3 pb-0">
        <div className="w-10 h-1 bg-gray-200 rounded-full" />
      </div>

      {/* ── Status bar ── */}
      <div className="px-5 pt-4 pb-3">
        <div className="flex items-center gap-3">
          <div className={`${meta.bg} rounded-full px-3 py-1 shrink-0 flex items-center gap-1.5`}>
            <span className="text-[11px] font-black text-white tracking-wider">FM</span>
            {isLive && (
              <span className="flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-white opacity-50" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-black text-gray-900 dark:text-white tracking-wide">{meta.label}</p>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 font-medium truncate">
              {etaMin != null && kmAway != null
                ? `Arriving in ~${etaMin} min · ${kmAway.toFixed(1)} km away`
                : isLive
                ? "Tracking driver location..."
                : isDelivered
                ? "Package delivered successfully"
                : "Finding the nearest driver..."}
              {driverLat != null && gpsAgo && (
                <span className="ml-1 text-green-500 font-bold">· GPS {gpsAgo}</span>
              )}
            </p>
          </div>
          {/* FM Verified Delivery badge */}
          {driver && !isDelivered && (
            <div className="shrink-0 flex items-center gap-1.5 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded-full px-2.5 py-1">
              <Shield className="h-3 w-3 text-green-600 dark:text-green-400 shrink-0" />
              <span className="text-[9px] font-black text-green-700 dark:text-green-400 tracking-wide whitespace-nowrap">FM Verified</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Delivered Banner ── */}
      {isDelivered && (
        <div className="mx-5 mb-4 space-y-3">
          <div className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl p-5 text-white text-center">
            <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-3">
              <CheckCircle className="h-8 w-8 text-white" />
            </div>
            <h3 className="font-black text-xl">Livrezon Konplè!</h3>
            <p className="text-sm opacity-80 mt-1">Kolis ou a livré an sekirite pa FM</p>
            {delivery.deliveredAt && (
              <p className="text-xs opacity-60 mt-2">{new Date(delivery.deliveredAt).toLocaleString()}</p>
            )}
            <p className="text-xs opacity-70 mt-2 font-semibold">💰 Peman vandè a liberé nan FM Wallet</p>
          </div>

          {/* Tip CTA — shown to buyer only when driver is known */}
          {isBuyer && driver && (
            <button
              type="button"
              onClick={() => onTipOpen()}
              className="w-full flex items-center gap-4 p-4 rounded-2xl border-2 border-pink-200 bg-gradient-to-r from-pink-50 to-rose-50 dark:from-pink-950/20 dark:to-rose-950/20 dark:border-pink-800/40 hover:shadow-md transition-all active:scale-98"
            >
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0" style={{ background: "linear-gradient(135deg, #f97316, #ec4899)" }}>
                <Heart className="h-6 w-6 text-white fill-white" />
              </div>
              <div className="flex-1 text-left">
                <p className="font-black text-sm text-foreground">Voye Poubwa pou {driver.name.split(" ")[0]} ❤️</p>
                <p className="text-xs text-muted-foreground">100% ale nan chauffè · 0% komisyon Flexa</p>
              </div>
              <ChevronRight className="h-4 w-4 text-pink-400 shrink-0" />
            </button>
          )}
        </div>
      )}

      {/* ── Looking for driver ── */}
      {isWaiting && !driver && (
        <div className="mx-5 mb-4 py-6 flex flex-col items-center gap-3">
          <div className="w-14 h-14 rounded-full bg-orange-50 flex items-center justify-center">
            <Loader2 className="h-7 w-7 text-orange-500 animate-spin" />
          </div>
          <p className="font-bold text-gray-800 dark:text-white">Looking for a driver...</p>
          <p className="text-xs text-gray-400 text-center">A driver will be assigned shortly</p>
          <div className="flex items-center gap-3 w-full pt-1">
            <div className="animate-pulse w-14 h-14 rounded-full bg-gray-100 shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="animate-pulse h-4 bg-gray-100 rounded-lg w-32" />
              <div className="animate-pulse h-3 bg-gray-100 rounded-lg w-20" />
            </div>
          </div>
        </div>
      )}

      {/* ── Driver card ── */}
      {driver && !isDelivered && (
        <>
          {/* Driver name + rating row */}
          <div className="px-5 pb-3 flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h2 className="text-[26px] font-black text-gray-900 dark:text-white leading-tight">
                {driver.name}
              </h2>
              <div className="flex items-center gap-2 mt-0.5">
                <Shield className="h-4 w-4 text-green-500 shrink-0" />
                {driver.rating != null && driver.rating > 0 && (
                  <>
                    <span className="text-[15px] font-black text-gray-800 dark:text-white">{driver.rating.toFixed(1)}</span>
                    <Star className="h-[15px] w-[15px] fill-yellow-400 text-yellow-400 shrink-0" />
                  </>
                )}
              </div>
              <p className="text-xs text-gray-400 font-medium mt-0.5">FM Verified Driver</p>
              {/* Vehicle type badge */}
              <div className="mt-2">
                <span className="inline-flex items-center gap-1.5 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded-full px-3 py-1">
                  {isMoto
                    ? <Bike className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                    : <Car  className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                  }
                  <span className="text-[11px] font-bold text-green-700 dark:text-green-400">
                    {isMoto ? "Motorcycle Delivery" : "Car Delivery"}
                  </span>
                </span>
              </div>
            </div>
            {/* Avatar with online dot */}
            <div className="relative shrink-0">
              <div className="w-[76px] h-[76px] rounded-full overflow-hidden border-[3px] border-green-100 shadow-lg bg-green-50">
                <Avatar className="w-full h-full">
                  <AvatarImage src={driver.facePhotoFront ?? driver.avatar ?? undefined} className="object-cover w-full h-full" />
                  <AvatarFallback className="bg-green-100 text-green-700 font-black text-2xl w-full h-full flex items-center justify-center">
                    {driver.name?.[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </div>
              {/* FM badge on avatar */}
              <div className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 bg-green-500 rounded-full px-1.5 py-0.5">
                <span className="text-[8px] font-black text-white tracking-wider">FM</span>
              </div>
              {/* Online dot */}
              <div className="absolute top-0 right-0.5 w-4 h-4 rounded-full bg-green-500 border-2 border-white shadow-sm">
                <span className="absolute inset-0 rounded-full bg-green-400 animate-ping opacity-60" />
              </div>
            </div>
          </div>

          {/* Vehicle photo section — white card with avatar overlapping */}
          <div className="mx-5 mb-3 rounded-2xl overflow-hidden bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 relative">
            {vehiclePhoto ? (
              <img src={vehiclePhoto} alt={vehicleName ?? "Vehicle"} className="w-full h-52 object-contain py-2" />
            ) : (
              <div className="w-full h-52 flex items-center justify-center">
                {isMoto
                  ? <Bike className="h-36 w-36 text-gray-200 dark:text-gray-600" />
                  : <Car  className="h-36 w-36 text-gray-200 dark:text-gray-600" />
                }
              </div>
            )}
            {/* Avatar overlapping top-right of vehicle photo */}
            <div className="absolute top-3 right-3">
              <div className="w-[58px] h-[58px] rounded-full overflow-hidden border-[3px] border-white shadow-xl bg-green-50">
                <Avatar className="w-full h-full">
                  <AvatarImage src={driver.facePhotoFront ?? driver.avatar ?? undefined} className="object-cover w-full h-full" />
                  <AvatarFallback className="bg-green-100 text-green-700 font-black text-xl w-full h-full flex items-center justify-center">
                    {driver.name?.[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </div>
              <div className="absolute bottom-0.5 right-0.5 w-4 h-4 rounded-full bg-green-500 border-2 border-white shadow-sm">
                <span className="absolute inset-0 rounded-full bg-green-400 animate-ping opacity-60" />
              </div>
            </div>
          </div>

          {/* Vehicle name + plate */}
          <div className="px-5 pb-3 flex items-end justify-between gap-3">
            <div className="flex-1 min-w-0">
              {vehicleName && (
                <>
                  <p className="text-[20px] font-black text-gray-900 dark:text-white leading-tight">{vehicleName}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 font-medium mt-0.5">{vehicleDetail}</p>
                </>
              )}
            </div>
            {driver.licensePlateNumber && (
              <div className="shrink-0">
                <FMPlate plate={driver.licensePlateNumber} />
              </div>
            )}
          </div>

          <div className="mx-5 h-px bg-gray-100 dark:bg-gray-800" />
        </>
      )}

      {/* ── Action buttons ── */}
      {driver && !isDelivered && (
        <div className="px-5 pt-3 pb-3 grid grid-cols-3 gap-2.5">
          <a
            href={driver.phone ? `tel:${driver.phone}` : undefined}
            className={`flex items-center justify-center gap-2 py-3.5 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 transition-colors active:scale-95 ${!driver.phone ? "opacity-40 pointer-events-none" : ""}`}
          >
            <Phone className="h-5 w-5 text-green-500 shrink-0" />
            <span className="text-sm font-bold text-gray-700 dark:text-gray-300">Call</span>
          </a>
          <a
            href={driver.phone ? `https://wa.me/${driver.phone.replace(/[^\d]/g,"")}` : undefined}
            target="_blank" rel="noopener noreferrer"
            className={`flex items-center justify-center gap-2 py-3.5 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 transition-colors active:scale-95 ${!driver.phone ? "opacity-40 pointer-events-none" : ""}`}
          >
            <MessageCircle className="h-5 w-5 text-green-500 shrink-0" />
            <span className="text-sm font-bold text-gray-700 dark:text-gray-300">Message</span>
          </a>
          <a
            href={trackDriverUrl ?? undefined}
            target="_blank" rel="noopener noreferrer"
            className={`flex items-center justify-center gap-2 py-3.5 rounded-2xl border ${driverLat != null ? "border-green-300 bg-green-50 dark:bg-green-900/20" : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"} hover:opacity-90 transition-colors active:scale-95 ${!trackDriverUrl ? "opacity-40 pointer-events-none" : ""}`}
          >
            <Navigation2 className={`h-5 w-5 shrink-0 ${driverLat != null ? "text-green-600" : "text-green-500"}`} />
            <span className={`text-sm font-bold ${driverLat != null ? "text-green-700 dark:text-green-400" : "text-gray-700 dark:text-gray-300"}`}>
              {driverLat != null ? "GPS Live" : "Track"}
            </span>
          </a>
        </div>
      )}

      {/* Trust footer */}
      <div className="px-5 pb-2 flex items-center justify-center gap-2">
        <Shield className="h-3.5 w-3.5 text-green-500 shrink-0" />
        <p className="text-[11px] text-gray-400 dark:text-gray-500 font-medium">
          Your package is in safe hands with FM.
        </p>
      </div>

      {/* Buyer-absent policy banner (buyer only) */}
      {delivery.status === "buyer_absent" && isBuyer && (
        <div className="mx-5 mb-3 space-y-2">
          {/* Main alert */}
          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-700 rounded-2xl px-4 py-3">
            <p className="text-xs font-black text-amber-800 dark:text-amber-300 uppercase tracking-wider mb-1.5">⚠️ Chofè a Rive Men Ou Pa T La</p>
            <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
              Chofè a kapab fè retou apre <strong>15 minit</strong> si ou pa disponib. Reskède kounye a si ou ka rive.
            </p>
          </div>
          {/* Refund policy — exact amounts */}
          <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 space-y-1.5">
            <p className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">📋 Règ Ranbousman si Retou</p>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-600 dark:text-slate-400">Pri atik</span>
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {delivery.totalAmount != null ? `$${Number(delivery.totalAmount).toFixed(2)}` : "—"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-red-600 dark:text-red-400">− Frè retou (1×)</span>
              <span className="text-xs font-bold text-red-600 dark:text-red-400">
                {delivery.feeUsd != null ? `−$${Number(delivery.feeUsd).toFixed(2)}` : "−frè livrezon"}
              </span>
            </div>
            <div className="border-t border-slate-200 dark:border-slate-700 pt-1.5 flex items-center justify-between">
              <span className="text-xs font-black text-slate-700 dark:text-slate-300">Ranbousman ou</span>
              <span className="text-xs font-black text-emerald-600 dark:text-emerald-400">
                {delivery.totalAmount != null && delivery.feeUsd != null
                  ? `$${Math.max(0, Number(delivery.totalAmount) - Number(delivery.feeUsd)).toFixed(2)}`
                  : "Pri − frè retou"}
              </span>
            </div>
            <p className="text-[10px] text-slate-400 leading-relaxed pt-0.5">
              * Frè livrezon orijinal ou te peye a pa ranbouse. Sèlman frè retou an siplemantè a dedwi nan pri atik la.
            </p>
          </div>
        </div>
      )}

      {/* Returning banners (buyer-absent return trip) */}
      {delivery.status === "returning" && (
        <div className="mx-5 mb-3 space-y-2">
          {/* Seller: show return code prominently */}
          {!isBuyer && delivery.returnCode && (
            <div className="bg-gradient-to-br from-indigo-600 to-purple-600 rounded-2xl px-5 py-4 text-white">
              <p className="text-[10px] font-black opacity-80 mb-1.5 tracking-widest uppercase">🔁 Kòd Konfirmasyon Retou</p>
              <div className="flex items-center justify-between gap-4">
                <p className="text-4xl font-black tracking-[10px]">{delivery.returnCode}</p>
              </div>
              <p className="text-[11px] opacity-90 mt-2 font-medium">Bay chofè a kòd sa a SÈLMAN lè li rive devan pòt ou ✓</p>
            </div>
          )}
          {/* Buyer: info that driver is heading back */}
          {isBuyer && (
            <div className="bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 rounded-2xl px-4 py-3">
              <p className="text-xs font-black text-indigo-700 dark:text-indigo-300 uppercase tracking-wider mb-1">🔄 Chofè Ap Retounen</p>
              <p className="text-xs text-indigo-600 dark:text-indigo-400 leading-relaxed">
                Chofè a ap retounen kòmand lan bay machann. Lè machann konfime resepsyon an, ou ap resevwa ranbousman ou otomatikman.
              </p>
            </div>
          )}
          {/* Seller also sees storage reminder */}
          {!isBuyer && (
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-700 rounded-2xl px-4 py-2.5">
              <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                ⚠️ Prepare pou resevwa atik la. Chofè a kapab rapòte <strong>pòt fèmen</strong> si li pa jwenn ou — sa ap geneye yon delè siplemantè.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Seller-closed banners */}
      {delivery.status === "seller_closed" && (
        <div className="mx-5 mb-3 space-y-2">
          <div className="bg-red-50 dark:bg-red-950/30 border border-red-300 dark:border-red-700 rounded-2xl px-4 py-3">
            <p className="text-xs font-black text-red-700 dark:text-red-400 uppercase tracking-wider mb-1">
              🔒 {!isBuyer ? "Chofè Pa Jwenn Ou" : "Machann Pa T Disponib pou Retou"}
            </p>
            <p className="text-xs text-red-600 dark:text-red-400 leading-relaxed">
              {!isBuyer
                ? "Chofè a rive pou retounen atik la men li pa jwenn ou. Atik la an sekirite ak chofè a. Admin FlexaMarket ap kontakte ou pou ranje yon nouvo dat retou."
                : "Chofè a pa jwenn machann pou retounen atik la. Atik la an sekirite ak chofè a. Admin ap ranje nouvo tentativ retou a byento."}
            </p>
          </div>
        </div>
      )}

      {/* Failed pickup banners */}
      {delivery.status === "failed_pickup" && (
        <>
          {/* Seller sees their return code */}
          {!isBuyer && delivery.returnCode && (
            <div className="mx-5 mb-3">
              <div className="bg-gradient-to-br from-red-500 to-orange-500 rounded-2xl px-5 py-4 text-white">
                <p className="text-[10px] font-black opacity-80 mb-1.5 tracking-widest uppercase">🔁 Kòd Retou</p>
                <div className="flex items-center justify-between gap-4">
                  <p className="text-4xl font-black tracking-[10px]">{delivery.returnCode}</p>
                </div>
                <p className="text-[11px] opacity-90 mt-2 font-medium">Bay chofe a kòd sa a pou konfime retou pwodwi a ✓</p>
              </div>
            </div>
          )}
          {/* Buyer sees double-fee notice */}
          {isBuyer && (
            <div className="mx-5 mb-3">
              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-700 rounded-2xl px-4 py-3">
                <p className="text-xs font-black text-amber-800 dark:text-amber-300 uppercase tracking-wider mb-1">⚠️ Machann Pa Prezan</p>
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  Machann nan pa t disponib pou chofe a. Ou pral peye frè livrezon an <strong>2 fwa</strong> — ale + retou.
                  {delivery.returnFeeUsd != null && delivery.returnFeeUsd > 0 && ` Frè siplemantè: $${delivery.returnFeeUsd.toFixed(2)}.`}
                </p>
              </div>
            </div>
          )}
        </>
      )}

      {/* Returned status banner */}
      {delivery.status === "returned" && (
        <div className="mx-5 mb-3">
          <div className="bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-2xl px-4 py-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-slate-500 flex items-center justify-center shrink-0">
              <CheckCircle className="h-4 w-4 text-white" />
            </div>
            <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
              Livrezon retounen konfime. {isBuyer ? "Chèk depo ou a." : "Pwodwi ou retounen."}
            </p>
          </div>
        </div>
      )}

      {/* Verification code */}
      {isBuyer && delivery.verificationCode && !isDelivered &&
        ["driver_assigned", "picked_up", "on_the_way", "arrived"].includes(delivery.status) && (
        <div className="mx-5 mb-3">
          <div className="bg-gradient-to-br from-primary to-orange-500 rounded-2xl px-5 py-4 text-white">
            <p className="text-[10px] font-black opacity-80 mb-1.5 tracking-widest uppercase">🔐 Kòd Konfirmasyon</p>
            <div className="flex items-center justify-between gap-4">
              <p className="text-4xl font-black tracking-[10px]">{delivery.verificationCode}</p>
              <button
                onClick={onCopyCode}
                className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 rounded-xl px-3 py-2 text-xs font-bold transition-colors shrink-0"
              >
                <Copy className="h-3.5 w-3.5" /> Kopye
              </button>
            </div>
            <p className="text-[11px] opacity-90 mt-2 font-medium">Bay chofe a kòd sa a lè li rive pou konfime livrezon an ✓</p>
          </div>
        </div>
      )}

      {/* Step progress */}
      <div className="px-5 pb-3">
        <StatusTimeline status={delivery.status} />
      </div>

      {/* Phase 4 — Dispute entry point. Hidden once the delivery has reached
          a terminal status the state machine doesn't allow disputing from. */}
      <OpenDisputeDialog
        deliveryId={delivery.id}
        disabled={["completed", "cancelled", "returned", "seller_closed"].includes(delivery.status)}
      />

      {/* Photo evidence */}
      {(delivery.pickupPhotoUrl || delivery.dropoffPhotoUrl) && (
        <div className="px-5 pb-3">
          <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-2">📷 Foto Prèv Chofe</p>
          <div className="flex gap-3">
            {delivery.pickupPhotoUrl && (
              <a href={delivery.pickupPhotoUrl} target="_blank" rel="noopener noreferrer" className="flex-1 rounded-2xl overflow-hidden border border-border relative block">
                <img src={delivery.pickupPhotoUrl} alt="Prise" className="w-full h-28 object-cover" />
                <div className="absolute bottom-0 inset-x-0 bg-black/55 px-2 py-1">
                  <p className="text-[9px] font-black text-white uppercase tracking-wider">Prise chez machann</p>
                </div>
              </a>
            )}
            {delivery.dropoffPhotoUrl && (
              <a href={delivery.dropoffPhotoUrl} target="_blank" rel="noopener noreferrer" className="flex-1 rounded-2xl overflow-hidden border border-border relative block">
                <img src={delivery.dropoffPhotoUrl} alt="Livrezon" className="w-full h-28 object-cover" />
                <div className="absolute bottom-0 inset-x-0 bg-black/55 px-2 py-1">
                  <p className="text-[9px] font-black text-white uppercase tracking-wider">Remèt achtè</p>
                </div>
              </a>
            )}
          </div>
        </div>
      )}

      {/* Expandable delivery details */}
      <div className="px-5 pb-1">
        <button
          className="flex items-center justify-between w-full text-xs font-bold text-gray-400 dark:text-gray-500 hover:text-gray-600 transition-colors py-1"
          onClick={() => setShowDetails(d => !d)}
        >
          <span>Delivery #{`FL-${delivery.id}`}</span>
          {showDetails ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        {showDetails && (
          <div className="space-y-3 py-3 animate-in fade-in slide-in-from-top-2 duration-200">
            {delivery.pickupCity && (
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-green-500 mt-1.5 shrink-0" />
                <div>
                  <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wide">Pickup</p>
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                    {delivery.pickupAddress ? `${delivery.pickupAddress}, ` : ""}{delivery.pickupCity}
                  </p>
                </div>
              </div>
            )}
            {delivery.pickupCity && <div className="ml-1 h-4 border-l-2 border-dashed border-gray-200 dark:border-gray-700" />}
            <div className="flex items-start gap-3">
              <MapPin className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wide">Delivery</p>
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                  {delivery.deliveryAddress ? `${delivery.deliveryAddress}, ` : ""}{delivery.deliveryCity}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="h-4" />
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function DeliveryTracking() {
  const [, params] = useRoute("/delivery/tracking/:id");
  const { token, user } = useAuth();
  const [, navigate]    = useLocation();
  const [showTipModal, setShowTipModal]       = useState(false);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [ratingShownFor, setRatingShownFor]   = useState<number | null>(null);
  const { toast }       = useToast();
  const { t }           = useTranslation();
  const socket          = useSocket();

  const [delivery, setDelivery]               = useState<DeliveryData | null>(null);
  const [driver, setDriver]                   = useState<DriverInfo | null>(null);
  const [vehicleImageUrl, setVehicleImageUrl] = useState<string | null>(null);
  const [loading, setLoading]                 = useState(true);

  // Real-time GPS state (updated via Socket.io)
  const [driverLat, setDriverLat]           = useState<number | null>(null);
  const [driverLng, setDriverLng]           = useState<number | null>(null);
  const [lastGpsUpdate, setLastGpsUpdate]   = useState<string | null>(null);

  const deliveryId = params?.id;
  const isMoto     = driver?.vehicleType === "moto";

  const fetchTracking = async () => {
    if (!deliveryId || !token) return;
    try {
      const res = await fetch(`/api/delivery/tracking/${deliveryId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setDelivery(data.delivery);
        const drv: DriverInfo | null = data.driver;
        setDriver(drv);
        // Seed GPS state from initial API response
        if (drv?.latitude != null && drv?.longitude != null) {
          setDriverLat(drv.latitude);
          setDriverLng(drv.longitude);
          setLastGpsUpdate(drv.lastLocationAt ?? new Date().toISOString());
        }
      }
    } catch {/* */} finally {
      setLoading(false);
    }
  };

  // Fetch vehicle catalog image when brand+model known but no photoFront
  useEffect(() => {
    if (!driver?.vehicleBrand || !driver?.vehicleModel || driver?.photoFront) return;
    fetch(`/api/vehicle-images?brand=${encodeURIComponent(driver.vehicleBrand)}&model=${encodeURIComponent(driver.vehicleModel)}`)
      .then(r => r.ok ? r.json() : null)
      .then((data: any) => {
        if (data?.images?.[0]?.image_url) setVehicleImageUrl(data.images[0].image_url);
      })
      .catch(() => {});
  }, [driver?.vehicleBrand, driver?.vehicleModel, driver?.photoFront]);

  // Poll tracking data every 15s
  useEffect(() => {
    fetchTracking();
    const interval = setInterval(fetchTracking, 15000);
    return () => clearInterval(interval);
  }, [deliveryId, token]);

  // Join Socket.io delivery room for real-time GPS updates
  useEffect(() => {
    if (!delivery?.id) return;
    socket.joinDelivery(delivery.id);
    const unsub = socket.onDriverLocation((data) => {
      if (data.deliveryId === delivery.id) {
        setDriverLat(data.lat);
        setDriverLng(data.lng);
        setLastGpsUpdate(data.updatedAt);
      }
    });
    return () => {
      socket.leaveDelivery(delivery.id);
      unsub();
    };
  }, [delivery?.id]);

  useEffect(() => { if (!user) navigate("/auth/login"); }, [user]);

  // Auto-show rating modal when delivery first becomes "delivered" for the buyer
  useEffect(() => {
    if (
      delivery?.status === "delivered" &&
      user &&
      delivery.buyerId === user.id &&
      driver &&
      ratingShownFor !== delivery.id
    ) {
      setRatingShownFor(delivery.id);
      // Small delay so the delivered banner renders first
      const t = setTimeout(() => setShowRatingModal(true), 1200);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [delivery?.status, delivery?.id, delivery?.buyerId, user?.id, driver?.name]);

  const handleCopyCode = () => {
    if (delivery?.verificationCode) {
      navigator.clipboard.writeText(delivery.verificationCode);
      toast({ title: "Code copied!" });
    }
  };

  if (!user) return null;

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-white dark:bg-gray-900">
        <div className="text-center space-y-4">
          <div className="w-20 h-20 rounded-full bg-green-50 flex items-center justify-center mx-auto">
            <Loader2 className="h-10 w-10 text-green-500 animate-spin" />
          </div>
          <p className="font-bold text-gray-800 dark:text-white">Loading tracking...</p>
          <p className="text-sm text-gray-400">Fetching delivery information</p>
        </div>
      </div>
    );
  }

  if (!delivery) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <AlertCircle className="h-12 w-12 text-gray-300 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-gray-800 dark:text-white">Delivery not found</h2>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/orders")}>
          View All Orders
        </Button>
      </div>
    );
  }

  return (
    <div className="relative h-[calc(100vh-4rem)] overflow-hidden flex flex-col bg-white dark:bg-gray-900">
      {/* Full-screen map */}
      <div className="relative flex-1 min-h-0">
        <PremiumMap status={delivery.status} isMoto={isMoto} driverLat={driverLat} driverLng={driverLng} />
        {/* Map top overlay */}
        <div className="absolute top-4 left-4 z-10">
          <div className="bg-white/90 backdrop-blur-xl rounded-2xl px-3 py-2 shadow-md border border-gray-100">
            <p className="text-[11px] font-mono font-bold text-gray-500">FL-{delivery.id}</p>
          </div>
        </div>
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
          <div className="bg-green-500 rounded-2xl px-3 py-2 shadow-md flex items-center gap-1.5">
            <Shield className="h-3.5 w-3.5 text-white" />
            <span className="text-[11px] font-black text-white">FM Secured</span>
          </div>
        </div>
      </div>

      {/* Floating bottom card */}
      <div className="relative z-20 -mt-8 flex-shrink-0 max-h-[72vh] overflow-y-auto">
        <DriverTrackingCard
          driver={driver}
          delivery={delivery}
          isBuyer={user.id === delivery.buyerId}
          onCopyCode={handleCopyCode}
          vehicleImageUrl={vehicleImageUrl}
          driverLat={driverLat}
          driverLng={driverLng}
          lastGpsUpdate={lastGpsUpdate}
          onTipOpen={() => setShowTipModal(true)}
        />
      </div>

      {/* Rating Modal overlay (auto-shows after delivery) */}
      {showRatingModal && driver && delivery && (
        <DriverRatingModal
          deliveryId={delivery.id}
          driverName={driver.name}
          driverAvatar={driver.facePhotoFront ?? driver.avatar}
          onClose={() => setShowRatingModal(false)}
          onDone={() => setShowRatingModal(false)}
        />
      )}

      {/* Tip Modal overlay */}
      {showTipModal && driver && (
        <TipModal
          deliveryId={delivery.id}
          driverName={driver.name}
          driverAvatar={driver.facePhotoFront ?? driver.avatar}
          onClose={() => setShowTipModal(false)}
        />
      )}
    </div>
  );
}
