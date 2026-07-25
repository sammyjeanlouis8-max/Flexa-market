import React, { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/auth";
import { useToast } from "@/hooks/use-toast";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import {
  Package, MapPin, Bike, Car, CheckCircle,
  Clock, Phone, RefreshCw, Navigation, TrendingUp,
  Wifi, WifiOff, ChevronRight, Lock, AlertCircle, X,
  Truck, ArrowRight, Zap, Shield, ChevronDown, ChevronUp, Loader2,
  Copy, Flag, Eye, Camera,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const DELIVERY_COUNTRIES = ["Haiti", "Dominican Republic"];

const KM_TO_MI = 0.621371;
function toMiles(km: number): string {
  return (km * KM_TO_MI).toFixed(1);
}

// Cities per country for commune switcher
const CITIES_BY_COUNTRY: Record<string, string[]> = {
  "Haiti": ["Port-au-Prince","Pétion-Ville","Delmas","Carrefour","Jacmel","Cap-Haïtien","Gonaïves","Les Cayes","Saint-Marc","Jérémie","Hinche","Mirebalais","Léogâne","Croix-des-Bouquets","Kenscoff","Arcahaie"],
  "Dominican Republic": ["Santo Domingo","Santiago","La Romana","San Pedro de Macorís","Puerto Plata","La Vega","Higüey","San Cristóbal","Barahona","San Francisco de Macorís","Bonao","Moca","Azua","Nagua","Jarabacoa"],
};

type DriverCta = "none" | "pending" | "approved" | "rejected" | "suspended";

interface BrowseDelivery {
  id: number;
  deliveryMethod: string;
  pickupAddress: string | null;
  pickupCity: string | null;
  deliveryAddress: string | null;
  deliveryCity: string | null;
  country: string;
  status: string;
  feeUsd: number | null;
  feeLocal: number | null;
  distanceKm: number | null;
  tipUsd?: number | null;
  distanceFromDriverKm: number | null;
  driverEarnings: number | null;
  currency: string;
  sellerNote: string | null;
  speedTier?: string | null;
  transactionIdNum?: number | null;
  buyerPhone?: string | null;
  buyerName?: string | null;
  paymentMethod?: string | null;
  createdAt: string;
  listingTitle?: string | null;
  listingImage?: string | null;
}

interface ActiveDelivery {
  id: number;
  deliveryMethod: string;
  pickupAddress: string | null;
  pickupCity: string | null;
  deliveryAddress: string | null;
  deliveryCity: string | null;
  status: string;
  totalAmount: number | null;
  driverEarnings: number | null;
  currency: string;
  distanceKm: number | null;
  acceptedAt: string | null;
  createdAt: string;
  sellerName: string | null;
  sellerPhone: string | null;
  buyerName: string | null;
  buyerPhone: string | null;
  feeUsd?: number | null;
  feeLocal?: number | null;
  listingTitle?: string | null;
  listingImage?: string | null;
  transactionIdNum?: number | null;
  holdAmountUsd?: number | null;
  returnCode?: string | null;
  returnFeeUsd?: number | null;
  arrivedAt?: string | null;
  failedPickupAt?: string | null;
  buyerAbsentAt?: string | null;
  buyerRescheduleDeadline?: string | null;
  rescheduleCount?: number | null;
  transactionId?: number | null;
  pickupPhotoUrl?: string | null;
  dropoffPhotoUrl?: string | null;
}

interface DriverStats {
  status: string;
  rating: number;
  deliveryCount: number;
  earningsTotal: number;
  isOnline: boolean;
  latitude: number | null;
  longitude: number | null;
  commune: string | null;
}

// ── Utilities ────────────────────────────────────────────────────────────────

function timeAgo(date: string, tNow: string): string {
  const diff = (Date.now() - new Date(date).getTime()) / 60000;
  if (diff < 1) return tNow;
  if (diff < 60) return `${Math.floor(diff)}min`;
  if (diff < 1440) return `${Math.floor(diff / 60)}h`;
  return `${Math.floor(diff / 1440)}j`;
}

// ── Lock Modal ────────────────────────────────────────────────────────────────

function DriverRequiredModal({ status, onClose, onApply }: {
  status: DriverCta;
  onClose: () => void;
  onApply: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-card rounded-3xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
        {/* Decorative top strip */}
        <div className="h-1.5 w-full bg-gradient-to-r from-primary via-orange-400 to-primary" />

        <div className="p-6">
          <button onClick={onClose} className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-muted transition-colors">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>

          {status === "pending" ? (
            <>
              <div className="w-16 h-16 bg-amber-100 dark:bg-amber-900/30 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Clock className="h-8 w-8 text-amber-600" />
              </div>
              <h3 className="text-xl font-black text-center mb-2">{t("availableDeliveries.modalPendingTitle")}</h3>
              <p className="text-sm text-muted-foreground text-center leading-relaxed mb-6">
                {t("availableDeliveries.modalPendingDesc")}
              </p>
              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-2xl p-3 mb-5">
                <div className="flex items-center gap-2.5">
                  <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
                  <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">
                    {t("availableDeliveries.modalPendingStatus")}
                  </p>
                </div>
              </div>
              <Button variant="outline" className="w-full rounded-2xl" onClick={onClose}>
                {t("availableDeliveries.modalPendingBtn")}
              </Button>
            </>
          ) : (
            <>
              <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Truck className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-xl font-black text-center mb-2">{t("availableDeliveries.modalNoneTitle")}</h3>
              <p className="text-sm text-muted-foreground text-center leading-relaxed mb-5">
                {t("availableDeliveries.modalNoneDesc")}
              </p>

              <div className="space-y-2 mb-5">
                {[
                  { icon: Zap,        text: t("availableDeliveries.modalPerk1") },
                  { icon: Shield,     text: t("availableDeliveries.modalPerk2") },
                  { icon: TrendingUp, text: t("availableDeliveries.modalPerk3") },
                ].map(({ icon: Icon, text }) => (
                  <div key={text} className="flex items-center gap-3 p-2.5 bg-muted/40 rounded-xl">
                    <Icon className="h-4 w-4 text-primary shrink-0" />
                    <span className="text-sm font-medium">{text}</span>
                  </div>
                ))}
              </div>

              <Button className="w-full rounded-2xl py-6 text-base font-bold" onClick={onApply}>
                {t("availableDeliveries.modalApplyBtn")} <ChevronRight className="h-5 w-5 ml-1" />
              </Button>
              <button className="w-full text-center text-sm text-muted-foreground mt-3 py-1" onClick={onClose}>
                {t("availableDeliveries.modalNotNow")}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Speed tier helpers ────────────────────────────────────────────────────────

const SPEED_TIER_CONFIG: Record<string, { label: string; time: string; color: string; bg: string }> = {
  rapid:   { label: "Rapid",   time: "1 – 2h",      color: "text-blue-700 dark:text-blue-300",   bg: "bg-blue-100 dark:bg-blue-900/30" },
  express: { label: "Express", time: "2 – 4h",       color: "text-violet-700 dark:text-violet-300", bg: "bg-violet-100 dark:bg-violet-900/30" },
  regular: { label: "Estanda", time: "Menm Jou",     color: "text-slate-600 dark:text-slate-400",  bg: "bg-slate-100 dark:bg-slate-800/40" },
};

function getSpeedConfig(tier?: string | null) {
  return tier ? (SPEED_TIER_CONFIG[tier] ?? SPEED_TIER_CONFIG.regular) : SPEED_TIER_CONFIG.regular;
}

function copyText(text: string) {
  navigator.clipboard?.writeText(text).catch(() => {});
}

// ── Delivery Card (browse view) ───────────────────────────────────────────────

function DeliveryBrowseCard({ delivery, driverCta, onAcceptClick, onSkip, driverRating, isAccepting, onNavigate }: {
  delivery: BrowseDelivery;
  driverCta: DriverCta;
  onAcceptClick: (delivery: BrowseDelivery) => void;
  onSkip: (id: number) => void;
  driverRating: number;
  isAccepting: boolean;
  onNavigate: (path: string) => void;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  const isMoto = delivery.deliveryMethod === "motorcycle";
  const earnings = delivery.driverEarnings ?? (delivery.feeUsd != null ? Math.round(delivery.feeUsd * 0.80 * 100) / 100 : 0);
  const hasTip = (delivery.tipUsd ?? 0) > 0;
  const totalWithTip = earnings + (delivery.tipUsd ?? 0);
  const displayEarnings = hasTip ? totalWithTip : earnings;
  const localEarnings = delivery.feeLocal != null ? Math.round(delivery.feeLocal * 0.80) : null;
  const localCurrency = delivery.country === "Haiti" ? "HTG"
    : delivery.country === "Dominican Republic" ? "DOP"
    : delivery.currency !== "USD" ? delivery.currency
    : null;
  const speedCfg = getSpeedConfig(delivery.speedTier);
  const isApproved = driverCta === "approved";

  const productName = delivery.listingTitle?.trim() || t("availableDeliveries.cardGenericItem");

  return (
    <div className={`bg-card border rounded-3xl overflow-hidden shadow-sm transition-all duration-200 ${
      hasTip
        ? "border-emerald-400 dark:border-emerald-700 shadow-emerald-100 dark:shadow-emerald-900/20"
        : "border-border"
    }`}>

      {/* ── Priority tip banner ── */}
      {hasTip && (
        <div className="bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-1.5 flex items-center gap-2">
          <Zap className="h-3 w-3 text-white" />
          <span className="text-white text-[11px] font-black uppercase tracking-wide">{t("availableDeliveries.cardPriority")}</span>
          <span className="ml-auto text-white/90 text-[11px] font-bold">+${delivery.tipUsd!.toFixed(2)} tip</span>
        </div>
      )}

      {/* ── Hero: photo of the item the driver will pick up ── */}
      <div className="relative">
        {delivery.listingImage ? (
          <img
            src={delivery.listingImage}
            alt={productName}
            className="w-full h-48 object-cover"
          />
        ) : (
          <div className="w-full h-48 bg-gradient-to-br from-muted to-muted/40 flex items-center justify-center">
            <Package className="h-12 w-12 text-muted-foreground/60" />
          </div>
        )}

        {/* legibility gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-black/5" />

        {/* vehicle + speed chip */}
        <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-white/95 dark:bg-card/95 backdrop-blur rounded-full pl-1.5 pr-2.5 py-1 shadow-sm">
          <span className={`w-6 h-6 rounded-full flex items-center justify-center ${isMoto ? "bg-orange-100 dark:bg-orange-900/40" : "bg-blue-100 dark:bg-blue-900/40"}`}>
            {isMoto ? <Bike className="h-3.5 w-3.5 text-orange-600" /> : <Car className="h-3.5 w-3.5 text-blue-600" />}
          </span>
          <span className="text-[11px] font-bold text-foreground">
            {isMoto ? t("availableDeliveries.motoLabel") : t("availableDeliveries.carLabel")}
          </span>
        </div>

        {/* earnings badge */}
        <div className={`absolute top-3 right-3 rounded-2xl px-3 py-1.5 text-center shadow-lg ${
          displayEarnings > 0
            ? "bg-gradient-to-br from-emerald-500 to-teal-600 text-white"
            : "bg-white/95 dark:bg-card/95 text-foreground"
        }`}>
          <p className={`text-[8px] font-black uppercase tracking-wider leading-none ${displayEarnings > 0 ? "text-emerald-100" : "text-muted-foreground"}`}>
            💰 {t("availableDeliveries.cardYouEarn")}
          </p>
          <p className="text-xl font-black leading-tight mt-0.5">
            {displayEarnings > 0 ? `$${displayEarnings.toFixed(2)}` : "..."}
          </p>
          {localEarnings != null && localEarnings > 0 && localCurrency && (
            <p className={`text-[9px] font-bold leading-none ${displayEarnings > 0 ? "text-emerald-100" : "text-muted-foreground"}`}>
              ≈ {localEarnings.toLocaleString()} {localCurrency}
            </p>
          )}
          {hasTip && (
            <p className="text-[8px] bg-white/25 rounded-full px-1.5 py-0.5 mt-1 font-bold">
              +${delivery.tipUsd!.toFixed(2)} tip ⚡
            </p>
          )}
        </div>

        {/* product name overlay */}
        <div className="absolute bottom-0 left-0 right-0 p-3">
          <p className="text-[9px] font-black uppercase tracking-widest text-white/70 mb-0.5">
            📦 {t("availableDeliveries.cardItemToPickup")}
          </p>
          <p className="text-lg font-black text-white leading-tight line-clamp-2 drop-shadow">{productName}</p>
        </div>
      </div>

      <div className="p-4 space-y-4">

        {/* ── Meta row: speed tier + posted time ── */}
        <div className="flex items-center justify-between gap-2">
          <span className={`text-[11px] font-bold px-2 py-1 rounded-lg ${speedCfg.bg} ${speedCfg.color}`}>
            ⚡ {speedCfg.label} · {speedCfg.time}
          </span>
          {delivery.createdAt && (
            <span className="text-[11px] text-muted-foreground">
              {timeAgo(delivery.createdAt, t("availableDeliveries.timeNow"))}
            </span>
          )}
        </div>

        {/* ── Route: pickup → drop-off (the seller's entered address) ── */}
        <div className="flex items-stretch gap-3 bg-muted/40 rounded-2xl p-3">
          <div className="flex flex-col items-center shrink-0 pt-1">
            <div className="w-3 h-3 rounded-full bg-blue-500 border-2 border-white dark:border-card shadow" />
            <div className="w-px flex-1 bg-border my-1 min-h-[28px]" />
            <MapPin className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="flex-1 space-y-3 min-w-0">
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-blue-600 dark:text-blue-400">📍 {t("availableDeliveries.cardPickupPoint")}</p>
              <p className="text-sm font-bold text-foreground truncate">{delivery.pickupCity ?? "—"}</p>
              {isApproved && delivery.pickupAddress && (
                <p className="text-xs text-muted-foreground truncate">{delivery.pickupAddress}</p>
              )}
            </div>
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400">🏁 {t("availableDeliveries.cardDropoffPoint")}</p>
              <p className="text-sm font-bold text-foreground truncate">{delivery.deliveryCity ?? "—"}</p>
              {isApproved && delivery.deliveryAddress && (
                <p className="text-xs text-muted-foreground truncate">{delivery.deliveryAddress}</p>
              )}
            </div>
          </div>
        </div>

        {/* ── Stats row ── */}
        <div className="grid grid-cols-3 gap-2">
          {[
            {
              icon: "📍",
              label: t("availableDeliveries.cardStatDistance"),
              value: delivery.distanceKm != null && delivery.distanceKm > 0
                ? `${delivery.distanceKm.toFixed(1)} km`
                : (delivery.pickupCity && delivery.deliveryCity && delivery.pickupCity !== delivery.deliveryCity)
                  ? `${delivery.pickupCity} → ${delivery.deliveryCity}`.length > 16
                    ? t("availableDeliveries.cardTrip")
                    : `${delivery.pickupCity} → ${delivery.deliveryCity}`
                  : t("availableDeliveries.cardLocal"),
            },
            {
              icon: "⭐",
              label: t("availableDeliveries.cardStatRating"),
              value: driverRating > 0 ? `${driverRating.toFixed(1)} / 5` : t("availableDeliveries.cardRatingNew"),
            },
            {
              icon: "🛍️",
              label: t("availableDeliveries.cardStatItems"),
              value: t("availableDeliveries.cardOneItem"),
            },
          ].map(({ icon, label, value }) => (
            <div key={label} className="bg-muted/40 rounded-xl py-2 px-2 text-center">
              <p className="text-base">{icon}</p>
              <p className="text-xs font-bold text-foreground leading-tight">{value}</p>
              <p className="text-[9px] text-muted-foreground mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* ── Buyer / seller note ── */}
        {delivery.sellerNote && (
          <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-xl px-3 py-2.5 flex items-start gap-2">
            <span className="text-base shrink-0">💬</span>
            <p className="text-xs text-amber-800 dark:text-amber-300 font-medium leading-relaxed">{delivery.sellerNote}</p>
          </div>
        )}

        {/* ── Non-approved lock notice ── */}
        {!isApproved && (
          <div className="flex items-center gap-2 bg-muted/50 rounded-xl px-3 py-2.5">
            <Lock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <p className="text-xs text-muted-foreground">{t("availableDeliveries.hiddenDetails")}</p>
          </div>
        )}

        {/* ── Expandable details (approved drivers only) ── */}
        {isApproved && (
          <div className="rounded-xl overflow-hidden border border-emerald-200 dark:border-emerald-800">
            <button
              type="button"
              onClick={() => setExpanded(e => !e)}
              className="w-full flex items-center gap-3 bg-emerald-50 dark:bg-emerald-950/30 px-4 py-3 text-left hover:bg-emerald-100 dark:hover:bg-emerald-950/50 transition-colors"
            >
              <Eye className="h-4 w-4 text-emerald-700 dark:text-emerald-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-black uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                  {expanded ? t("availableDeliveries.cardExpandClose") : t("availableDeliveries.cardExpandOpen")}
                </p>
                {!expanded && (
                  <p className="text-[10px] text-emerald-700/70 dark:text-emerald-400/70">
                    {t("availableDeliveries.cardExpandSub")}
                  </p>
                )}
              </div>
              {expanded ? (
                <ChevronUp className="h-4 w-4 text-emerald-700 dark:text-emerald-400 shrink-0" />
              ) : (
                <ChevronDown className="h-4 w-4 text-emerald-700 dark:text-emerald-400 shrink-0" />
              )}
            </button>

            {expanded && (
              <div className="bg-card px-4 py-3 space-y-3">
                {/* Phone */}
                {delivery.buyerPhone && (
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">📱 {t("availableDeliveries.cardPhone")}</p>
                      <p className="text-sm font-bold text-foreground">{delivery.buyerPhone}</p>
                    </div>
                    <a
                      href={`tel:${delivery.buyerPhone}`}
                      className="shrink-0 w-10 h-10 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center hover:bg-green-200 transition-colors"
                    >
                      <Phone className="h-4 w-4 text-green-700" />
                    </a>
                  </div>
                )}

                <div className="h-px bg-border" />

                {/* IDs grid */}
                <div className="space-y-2">
                  {([
                    { label: `🏷️ ${t("availableDeliveries.cardIdDelivery")}`,    value: `FM-${delivery.id}` },
                    { label: `📦 ${t("availableDeliveries.cardIdOrder")}`,       value: delivery.transactionIdNum != null ? `ORD-${delivery.transactionIdNum}` : null },
                    { label: `💳 ${t("availableDeliveries.cardIdTransaction")}`, value: delivery.transactionIdNum != null ? `TRX-${delivery.transactionIdNum}` : null },
                  ] as { label: string; value: string | null }[]).map(({ label, value }) => value && (
                    <div key={label} className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">{label}</p>
                        <p className="text-xs font-mono font-bold text-foreground">{value}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => copyText(value)}
                        className="shrink-0 w-8 h-8 rounded-lg bg-muted flex items-center justify-center hover:bg-accent transition-colors"
                      >
                        <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Actions ── */}
        {isApproved ? (
          <div className="space-y-2 pt-1">
            <Button
              className="w-full rounded-2xl py-5 font-bold text-sm bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 shadow-md shadow-blue-500/20"
              onClick={() => onAcceptClick(delivery)}
              disabled={isAccepting}
            >
              {isAccepting
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <><CheckCircle className="h-4 w-4 mr-2" /> {t("availableDeliveries.cardAccept")}</>
              }
            </Button>
            <Button
              className="w-full rounded-2xl py-4 font-bold text-sm"
              variant="outline"
              onClick={() => onSkip(delivery.id)}
              disabled={isAccepting}
            >
              {t("availableDeliveries.cardRefuse")}
            </Button>
            <button
              type="button"
              className="w-full text-center text-sm font-semibold text-red-600 dark:text-red-400 py-2 hover:underline flex items-center justify-center gap-1.5"
              onClick={() => onNavigate("/help")}
            >
              <Flag className="h-3.5 w-3.5" /> {t("availableDeliveries.cardReport")}
            </button>
          </div>
        ) : driverCta === "pending" ? (
          <Button
            className="w-full rounded-2xl py-5 font-bold text-sm bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 hover:bg-amber-200"
            variant="ghost"
            onClick={() => onAcceptClick(delivery)}
          >
            <Clock className="h-4 w-4 mr-2" /> {t("availableDeliveries.btnPendingAccept")}
          </Button>
        ) : (
          <Button
            className="w-full rounded-2xl py-5 font-bold text-sm"
            variant="outline"
            onClick={() => onAcceptClick(delivery)}
          >
            <Lock className="h-4 w-4 mr-2" /> {t("availableDeliveries.btnAccept")}
          </Button>
        )}
      </div>
    </div>
  );
}

// ── Active Delivery Card (approved driver view) ───────────────────────────────

function ActiveDeliveryCard({ delivery, onUpdateStatus, onDriverCancel, updating, token }: {
  delivery: ActiveDelivery;
  onUpdateStatus: (id: number, status: string) => void;
  onDriverCancel: (id: number) => void;
  updating: boolean;
  token: string;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();

  const STATUS_CONFIG: Record<string, { label: string; color: string; step: number }> = {
    driver_assigned: { label: t("availableDeliveries.statusGoPickup"),      color: "bg-blue-500",    step: 1 },
    arrived_pickup:  { label: t("availableDeliveries.statusArrivedPickup"), color: "bg-cyan-500",    step: 2 },
    picked_up:       { label: t("availableDeliveries.statusPickedUp"),      color: "bg-purple-500",  step: 3 },
    on_the_way:      { label: t("availableDeliveries.statusOnWay"),         color: "bg-primary",     step: 4 },
    arrived:         { label: t("availableDeliveries.statusArrived"),       color: "bg-emerald-500", step: 5 },
    delivered:       { label: t("availableDeliveries.statusDelivered"),     color: "bg-green-600",   step: 6 },
    failed_pickup:   { label: "Machann Pa Prezan",                          color: "bg-red-500",     step: 1 },
    buyer_absent:    { label: "Achtè Pa Disponib ⏳",                       color: "bg-amber-500",   step: 5 },
    returning:       { label: "Retou an Kour 🔄",                           color: "bg-indigo-500",  step: 5 },
    seller_closed:   { label: "Machann Fèmen 🔒",                           color: "bg-red-700",     step: 5 },
    returned:        { label: "Retou Konfime ✓",                            color: "bg-slate-500",   step: 6 },
  };

  const nextStatus: Record<string, string> = {
    driver_assigned: "arrived_pickup",
    arrived_pickup:  "picked_up",
    picked_up:       "on_the_way",
    on_the_way:      "arrived",
  };

  const nextLabel: Record<string, string> = {
    driver_assigned: t("availableDeliveries.nextArrivedPickup"),
    arrived_pickup:  t("availableDeliveries.nextPickedUp"),
    picked_up:       t("availableDeliveries.nextOnWay"),
    on_the_way:      t("availableDeliveries.nextArrived"),
  };

  const [digits, setDigits] = useState<string[]>(Array(6).fill(""));
  const [showCodeEntry, setShowCodeEntry] = useState(false);
  const [returnCodeInput, setReturnCodeInput] = useState("");
  const [reportingFailed, setReportingFailed] = useState(false);
  const [confirmingReturn, setConfirmingReturn] = useState(false);
  const [reportingAbsent, setReportingAbsent] = useState(false);
  const [buyerReturnCodeInput, setBuyerReturnCodeInput] = useState("");
  const [confirmingBuyerReturn, setConfirmingBuyerReturn] = useState(false);
  const [reportingSellerClosed, setReportingSellerClosed] = useState(false);
  const [uploadingPickup, setUploadingPickup] = useState(false);
  const [uploadingDropoff, setUploadingDropoff] = useState(false);
  const [localPickupPhoto, setLocalPickupPhoto] = useState<string | null>(delivery.pickupPhotoUrl ?? null);
  const [localDropoffPhoto, setLocalDropoffPhoto] = useState<string | null>(delivery.dropoffPhotoUrl ?? null);
  const digitRefs = useRef<(HTMLInputElement | null)[]>([]);
  const pickupInputRef = useRef<HTMLInputElement>(null);
  const dropoffInputRef = useRef<HTMLInputElement>(null);

  // Countdown timer for buyer_absent 2h reschedule grace period
  const [countdown, setCountdown] = useState<string>("");
  useEffect(() => {
    if (delivery.status !== "buyer_absent" || !delivery.buyerRescheduleDeadline) return;
    const interval = setInterval(() => {
      const remaining = new Date(delivery.buyerRescheduleDeadline!).getTime() - Date.now();
      if (remaining <= 0) { setCountdown("Delè ekspire"); clearInterval(interval); return; }
      const h = Math.floor(remaining / 3600000);
      const m = Math.floor((remaining % 3600000) / 60000);
      const s = Math.floor((remaining % 60000) / 1000);
      setCountdown(h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`);
    }, 1000);
    return () => clearInterval(interval);
  }, [delivery.status, delivery.buyerRescheduleDeadline]);

  // 20-minute arrived window — driver must wait before reporting absent
  const [arrivedCountdown, setArrivedCountdown] = useState<string>("");
  const [arrivedWaitAllowed, setArrivedWaitAllowed] = useState(false);
  useEffect(() => {
    if (delivery.status !== "arrived" || !delivery.arrivedAt) {
      setArrivedWaitAllowed(!delivery.arrivedAt); // if no arrivedAt, allow immediately
      return;
    }
    const WAIT_MS = 20 * 60 * 1000;
    const check = () => {
      const elapsed = Date.now() - new Date(delivery.arrivedAt!).getTime();
      const remaining = WAIT_MS - elapsed;
      if (remaining <= 0) { setArrivedWaitAllowed(true); setArrivedCountdown(""); return; }
      setArrivedWaitAllowed(false);
      const m = Math.floor(remaining / 60000);
      const s = Math.floor((remaining % 60000) / 1000);
      setArrivedCountdown(`${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`);
    };
    check();
    const interval = setInterval(check, 1000);
    return () => clearInterval(interval);
  }, [delivery.status, delivery.arrivedAt]);

  // 20-minute return cooldown — driver must wait after reporting absent before initiating return
  const [returnCooldown, setReturnCooldown] = useState<string>("");
  const [returnAllowed, setReturnAllowed] = useState(false);
  useEffect(() => {
    if (delivery.status !== "buyer_absent" || !delivery.buyerAbsentAt) return;
    const COOLDOWN_MS = 20 * 60 * 1000;
    const check = () => {
      const elapsed = Date.now() - new Date(delivery.buyerAbsentAt!).getTime();
      const remaining = COOLDOWN_MS - elapsed;
      if (remaining <= 0) { setReturnAllowed(true); setReturnCooldown(""); return; }
      setReturnAllowed(false);
      const m = Math.floor(remaining / 60000);
      const s = Math.floor((remaining % 60000) / 1000);
      setReturnCooldown(`${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`);
    };
    check();
    const interval = setInterval(check, 1000);
    return () => clearInterval(interval);
  }, [delivery.status, delivery.buyerAbsentAt]);

  const codeInput = digits.join("");

  const handleDigitChange = (i: number, val: string) => {
    const d = val.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[i] = d;
    setDigits(next);
    if (d && i < 5) {
      digitRefs.current[i + 1]?.focus();
    } else if (d && i === 5 && next.every(v => v !== "")) {
      // Last digit entered — auto-submit immediately, no button needed
      handleVerify(next.join(""));
    }
  };
  const handleDigitKey = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[i] && i > 0) {
      const next = [...digits];
      next[i - 1] = "";
      setDigits(next);
      digitRefs.current[i - 1]?.focus();
    }
  };

  const handleDriverReturn = async () => {
    if (!window.confirm("Ou sèten ou vle retounen kòmand lan bay machann?\n\nOu ap touche 2× frè livrezon (ale + retou).\nAchtè a ap resevwa ranbousman pri atik lan mwens frè retou a.")) return;
    setReportingAbsent(true);
    try {
      const res = await fetch(`/api/delivery/${delivery.id}/driver-return`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        toast({ title: "🔄 Retou kòmanse! Ale kay machann pou li ba ou kòd konfirmasyon an." });
        onUpdateStatus(delivery.id, "returning");
      } else {
        const d = await res.json().catch(() => ({}));
        toast({ title: d.error ?? "Erè", variant: "destructive" });
      }
    } finally {
      setReportingAbsent(false);
    }
  };

  const handleConfirmBuyerReturn = async () => {
    if (buyerReturnCodeInput.length < 6) return;
    setConfirmingBuyerReturn(true);
    try {
      const res = await fetch(`/api/delivery/${delivery.id}/confirm-buyer-return`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code: buyerReturnCodeInput }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        const earned = data.driverTotal ? `$${Number(data.driverTotal).toFixed(2)} kredite` : "Retou konfime";
        toast({ title: `✅ Retou konfime pa machann! ${earned} nan kont ou.` });
        onUpdateStatus(delivery.id, "returned");
      } else {
        const d = await res.json().catch(() => ({}));
        toast({ title: d.error ?? "Kòd retou pa bon", variant: "destructive" });
      }
    } finally {
      setConfirmingBuyerReturn(false);
    }
  };

  const handleSellerClosed = async () => {
    if (!window.confirm("Ou sèten pòt machann nan fèmen?\n\nAdmin FlexaMarket ap notifye epi ranje nouvo dat retou. Ou ka kontinye travay ou nòmalman.")) return;
    setReportingSellerClosed(true);
    try {
      const res = await fetch(`/api/delivery/${delivery.id}/seller-closed`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        toast({ title: data.message ?? "Admin notifye. Ou ka kontinye travay ou." });
        onUpdateStatus(delivery.id, "seller_closed");
      } else {
        const d = await res.json().catch(() => ({}));
        toast({ title: d.error ?? "Erè", variant: "destructive" });
      }
    } finally {
      setReportingSellerClosed(false);
    }
  };

  const handleReportBuyerAbsent = async () => {
    if (!window.confirm("Ou sèten achtè a pa disponib? Y ap voye notifikasyon ba li avèk 2h pou reskède.")) return;
    setReportingAbsent(true);
    try {
      const res = await fetch(`/api/delivery/${delivery.id}/report-buyer-absent`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        toast({ title: `⏳ Rapò voye. Achtè gen ${data.graceHours ?? 2}h pou reskède.` });
        onUpdateStatus(delivery.id, "buyer_absent");
      } else {
        const d = await res.json().catch(() => ({}));
        toast({ title: d.error ?? "Erè", variant: "destructive" });
      }
    } finally {
      setReportingAbsent(false);
    }
  };

  const handleReportFailed = async () => {
    if (!window.confirm("Ou sèten machann nan pa prezan? Kliyan an pral peye livrezon 2 fwa.")) return;
    setReportingFailed(true);
    try {
      const res = await fetch(`/api/delivery/${delivery.id}/report-failed`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        toast({ title: "Rapò voye. Machann nan resevwa kòd retou pa SMS." });
        onUpdateStatus(delivery.id, "failed_pickup");
      } else {
        const d = await res.json().catch(() => ({}));
        toast({ title: d.error ?? "Erè", variant: "destructive" });
      }
    } finally {
      setReportingFailed(false);
    }
  };

  const handleConfirmReturn = async () => {
    if (returnCodeInput.length < 6) return;
    setConfirmingReturn(true);
    try {
      const res = await fetch(`/api/delivery/${delivery.id}/confirm-return`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code: returnCodeInput }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        const earned = data.driverReturnEarnings
          ? `$${Number(data.driverReturnEarnings).toFixed(2)} krédite nan kont ou`
          : "Retou konfime";
        toast({ title: `✅ Retou konfime! ${earned}` });
        onUpdateStatus(delivery.id, "returned");
      } else {
        const d = await res.json().catch(() => ({}));
        toast({ title: d.error ?? "Kòd retou pa bon", variant: "destructive" });
      }
    } finally {
      setConfirmingReturn(false);
    }
  };
  const handlePhotoUpload = async (type: "pickup" | "dropoff", file: File) => {
    const setUploading = type === "pickup" ? setUploadingPickup : setUploadingDropoff;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const upRes = await fetch("/api/s3-upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (!upRes.ok) { toast({ title: "Upload echwe", variant: "destructive" }); return; }
      const { url } = await upRes.json();
      const body = type === "pickup" ? { pickupPhotoUrl: url } : { dropoffPhotoUrl: url };
      const pRes = await fetch(`/api/delivery/${delivery.id}/photos`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (pRes.ok) {
        if (type === "pickup") setLocalPickupPhoto(url);
        else setLocalDropoffPhoto(url);
        toast({ title: type === "pickup" ? "📷 Foto prise sovgardé ✓" : "📷 Foto livrezon sovgardé ✓" });
      }
    } catch {
      toast({ title: "Erè upload foto", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const isBuyerAbsent = delivery.status === "buyer_absent";
  const cfg = STATUS_CONFIG[delivery.status] ?? STATUS_CONFIG.driver_assigned;
  const progressSteps = [1, 2, 3, 4, 5];

  const handleVerify = async (overrideCode?: string) => {
    const code = overrideCode ?? codeInput;
    const res = await fetch(`/api/delivery/${delivery.id}/verify-code`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ code }),
    });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      const earned = data.driverEarnings
        ? `$${Number(data.driverEarnings).toFixed(2)} ${t("availableDeliveries.earningsCredit")}`
        : t("availableDeliveries.earningsReleased");
      toast({ title: `${t("availableDeliveries.toastDeliveryConfirmed")} ${earned}` });
      onUpdateStatus(delivery.id, "delivered");
    } else {
      toast({ title: t("availableDeliveries.badCode"), variant: "destructive" });
    }
  };

  const isBeforeArrived = ["driver_assigned", "arrived_pickup", "picked_up", "on_the_way"].includes(delivery.status);
  const isArrived       = delivery.status === "arrived";
  const isDone          = delivery.status === "delivered" || delivery.status === "returned";
  const isFailed        = delivery.status === "failed_pickup";
  const isReturning     = delivery.status === "returning";
  const isSellerClosed  = delivery.status === "seller_closed";

  const earningsUsd   = delivery.driverEarnings ?? (delivery.feeUsd   != null ? Math.round(delivery.feeUsd   * 0.80 * 100) / 100 : null);
  const earningsLocal = delivery.feeLocal != null ? Math.round(delivery.feeLocal * 0.80) : null;

  return (
    <div className="bg-white dark:bg-gray-950 border border-border rounded-3xl overflow-hidden shadow-lg">

      {/* ── Status bar ── */}
      <div className={`${cfg.color} px-4 py-3`}>
        <div className="flex items-center justify-between">
          <p className="text-white font-black text-sm">
            {delivery.transactionIdNum ? `BZH-${String(delivery.transactionIdNum).padStart(6,"0")}` : `FM-${delivery.id}`}
          </p>
          <p className="text-white/85 text-xs font-semibold">{cfg.label}</p>
        </div>
        <div className="flex items-center gap-1.5 mt-2">
          {progressSteps.map(s => (
            <div key={s} className={`h-1.5 flex-1 rounded-full transition-all ${s <= cfg.step ? "bg-white" : "bg-white/30"}`} />
          ))}
        </div>
      </div>

      <div className="p-4 space-y-4">

        {/* ── Screen 2 banner: arrived at buyer ── */}
        {(isArrived || (isArrived && showCodeEntry)) && (
          <div className="flex items-start gap-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-800/40 rounded-2xl px-4 py-3">
            <MapPin className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-black text-sm text-emerald-700 dark:text-emerald-400">Ou rive kote kliyan an</p>
              <p className="text-xs text-emerald-700/80 dark:text-emerald-500 mt-0.5">Tanpri kontakte kliyan an.</p>
            </div>
          </div>
        )}

        {/* ── Product card ── */}
        {delivery.listingTitle && (
          <div className="flex items-center gap-3 border border-border rounded-2xl px-3 py-2.5">
            {delivery.listingImage ? (
              <img src={delivery.listingImage} alt={delivery.listingTitle}
                className="h-14 w-14 rounded-xl object-cover shrink-0 border border-border" />
            ) : (
              <div className="h-14 w-14 rounded-xl bg-muted flex items-center justify-center shrink-0 border border-border">
                <Package className="h-5 w-5 text-muted-foreground" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-0.5">📦 Pwodwi</p>
              <p className="text-sm font-bold text-foreground leading-tight truncate">{delivery.listingTitle}</p>
              {earningsUsd != null && (
                <p className="text-base font-black text-emerald-600 mt-0.5">${earningsUsd.toFixed(2)} <span className="text-[10px] font-semibold text-muted-foreground">USD</span></p>
              )}
            </div>
          </div>
        )}

        {/* ── Buyer info rows (KLIYAN / TELEFÒN / ADRÈS) ── */}
        <div className="space-y-3">
          {/* KLIYAN */}
          {delivery.buyerName && (
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-0.5">KLIYAN</p>
              <p className="text-sm font-semibold text-foreground">De {delivery.buyerName}</p>
            </div>
          )}

          {/* TELEFÒN */}
          {delivery.buyerPhone && (
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-0.5">TELEFÒN</p>
                <p className="text-sm font-semibold text-foreground">{delivery.buyerPhone}</p>
              </div>
              <a href={`tel:${delivery.buyerPhone}`}
                className="w-10 h-10 rounded-2xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center hover:bg-emerald-200 transition-colors shrink-0">
                <Phone className="h-5 w-5 text-emerald-700 dark:text-emerald-400" />
              </a>
            </div>
          )}

          {/* ADRÈS LIVREZON */}
          {(delivery.deliveryAddress || delivery.deliveryCity) && (
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-0.5">ADRÈS LIVREZON</p>
                <p className="text-sm font-semibold text-foreground leading-snug">
                  {[delivery.deliveryAddress, delivery.deliveryCity].filter(Boolean).join(", ")}
                </p>
              </div>
              <a
                href={`https://maps.google.com/?q=${encodeURIComponent([delivery.deliveryAddress, delivery.deliveryCity].filter(Boolean).join(", "))}`}
                target="_blank" rel="noreferrer"
                className="w-10 h-10 rounded-2xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center hover:bg-blue-200 transition-colors shrink-0 mt-1">
                <MapPin className="h-5 w-5 text-blue-700 dark:text-blue-400" />
              </a>
            </div>
          )}
        </div>

        {/* ── Screen 3: Code entry (arrived + showCodeEntry) ── */}
        {isArrived && showCodeEntry ? (
          <div className="space-y-5 pt-1">
            {/* Checkmark + title */}
            <div className="text-center space-y-3">
              <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-950/50 flex items-center justify-center mx-auto">
                <CheckCircle className="h-10 w-10 text-emerald-500" />
              </div>
              <div>
                <p className="font-black text-base text-foreground">Antre kòd kliyan an</p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  Mande kliyan an kòd 6 chif li resevwa a epi antre li anba a.
                </p>
              </div>
            </div>

            {/* 6 individual digit boxes */}
            <div className="flex justify-center gap-2">
              {digits.map((d, i) => (
                <input
                  key={i}
                  ref={el => { digitRefs.current[i] = el; }}
                  type="tel"
                  inputMode="numeric"
                  maxLength={1}
                  value={d}
                  onChange={e => handleDigitChange(i, e.target.value)}
                  onKeyDown={e => handleDigitKey(i, e)}
                  className="w-11 h-14 rounded-xl border-2 border-border focus:border-emerald-500 bg-background text-center text-2xl font-black focus:outline-none transition-colors"
                />
              ))}
            </div>

            {/* Auto-submit indicator */}
            <p className="text-center text-xs text-muted-foreground">
              Kòd la ap voye otomatikman depi 6yèm chif antre ✓
            </p>

            {/* Important note */}
            <div className="flex items-start gap-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200/60 dark:border-blue-800/40 rounded-2xl px-4 py-3">
              <Shield className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-black text-xs text-blue-700 dark:text-blue-400 uppercase tracking-wide mb-0.5">Enpòtan</p>
                <p className="text-xs text-blue-700/80 dark:text-blue-500 leading-relaxed">
                  Pa konfime livrezon san ou pa antre kòd konfimasyon kliyan an.
                </p>
              </div>
            </div>

            {/* Back link */}
            <button
              type="button"
              onClick={() => setShowCodeEntry(false)}
              className="w-full text-center text-xs text-muted-foreground hover:text-foreground py-1 transition-colors"
            >
              ← Tounen
            </button>
          </div>

        ) : isDone ? (
          /* ── Done state ── */
          <div className="flex items-center justify-center gap-2.5 py-4 bg-emerald-50 dark:bg-emerald-950/30 rounded-2xl">
            <CheckCircle className="h-6 w-6 text-emerald-600" />
            <span className="font-bold text-emerald-700 dark:text-emerald-400">
              {delivery.status === "returned" ? "Retou Konfime ✓" : t("availableDeliveries.deliveryConfirmed")}
            </span>
          </div>

        ) : isFailed ? (
          /* ── Failed pickup: return code entry ── */
          <div className="space-y-3">
            <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-2xl p-3 text-center">
              <p className="text-xs font-black text-red-700 dark:text-red-400 uppercase tracking-wider mb-1">⚠️ Machann Pa Prezan</p>
              <p className="text-xs text-red-600 dark:text-red-400">Machann nan pa t prezan. Antre kòd retou machann nan ba ou.</p>
              {delivery.returnFeeUsd != null && delivery.returnFeeUsd > 0 && (
                <p className="text-xs font-bold text-red-700 dark:text-red-300 mt-1">
                  💰 Ou ap touche ${Math.round(delivery.returnFeeUsd * 0.80 * 100) / 100} pou retou a
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <input
                type="tel" inputMode="numeric"
                value={returnCodeInput}
                onChange={e => setReturnCodeInput(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="• • • • • •"
                className="flex-1 border-2 border-border focus:border-primary rounded-2xl px-4 py-3 text-center text-2xl font-black tracking-widest focus:outline-none transition-colors bg-background"
              />
              <Button onClick={handleConfirmReturn} disabled={returnCodeInput.length < 6 || confirmingReturn}
                className="rounded-2xl px-5 py-3 bg-slate-600 hover:bg-slate-700 text-white font-bold">
                {confirmingReturn ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle className="h-5 w-5" />}
              </Button>
            </div>
          </div>

        ) : isBuyerAbsent ? (
          /* ── Buyer absent: 15-min cooldown + return button ── */
          <div className="space-y-3">
            {/* 2h reschedule grace period countdown */}
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-2xl p-4 text-center">
              <p className="text-xs font-black text-amber-700 dark:text-amber-400 uppercase tracking-wider mb-2">⏳ Achtè Pa Disponib</p>
              <p className="text-xs text-amber-600 dark:text-amber-400 leading-relaxed mb-3">
                SMS + notifikasyon voye. Achtè a gen 2h pou reskède. Ou ka tann oswa fè retou apre 20 minit.
              </p>
              {countdown && (
                <div className="inline-flex items-center gap-2 bg-amber-100 dark:bg-amber-900/50 rounded-xl px-4 py-2">
                  <Clock className="h-4 w-4 text-amber-700 dark:text-amber-400" />
                  <span className="font-black text-base text-amber-800 dark:text-amber-300 tabular-nums">{countdown}</span>
                  <span className="text-[10px] text-amber-600">jiska reskèd</span>
                </div>
              )}
            </div>

            {/* 15-min cooldown / Return button */}
            {!returnAllowed ? (
              /* Cooldown: button greyed with countdown */
              <div className="rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 px-4 py-4 text-center space-y-2">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">⏱ Bouton Retou Aktive Nan</p>
                <p className="text-2xl font-black text-slate-700 dark:text-slate-300 tabular-nums">{returnCooldown || "20:00"}</p>
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  Ba achtè a chans pou rive. Apre 20 min, bouton retou a ap aktive.
                </p>
              </div>
            ) : (
              /* Cooldown passed: show active return button */
              <>
                {/* Return earnings info */}
                <div className="flex items-start gap-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-800/40 rounded-2xl px-4 py-3">
                  <div className="w-7 h-7 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center shrink-0">
                    <span className="text-sm">💰</span>
                  </div>
                  <div>
                    <p className="font-black text-xs text-emerald-700 dark:text-emerald-400 uppercase tracking-wide mb-0.5">Ou ap touche 2×</p>
                    <p className="text-xs text-emerald-700/80 dark:text-emerald-500 leading-relaxed">
                      {delivery.driverEarnings
                        ? `$${(delivery.driverEarnings * 2).toFixed(2)} total ($${delivery.driverEarnings.toFixed(2)} ale + $${delivery.driverEarnings.toFixed(2)} retou)`
                        : "Frè ale + frè retou"} kredite nan kont ou apre retou a konfime.
                    </p>
                  </div>
                </div>
                <Button
                  className="w-full rounded-2xl py-5 font-black text-base bg-slate-700 hover:bg-slate-800 text-white shadow-md"
                  onClick={handleDriverReturn}
                  disabled={reportingAbsent || updating}
                >
                  {reportingAbsent
                    ? <Loader2 className="h-5 w-5 animate-spin" />
                    : "↩ Fè Retou bay Machann"}
                </Button>
              </>
            )}

            {/* Info footer */}
            <div className="flex items-start gap-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200/60 dark:border-blue-800/40 rounded-2xl px-4 py-3">
              <Shield className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
              <p className="text-xs text-blue-700/80 dark:text-blue-500 leading-relaxed">
                Si achtè a reskède nan 2h, ou ap jwenn yon nouvo kòd pa SMS pou retounen livre.
              </p>
            </div>
          </div>

        ) : isReturning ? (
          /* ── Returning: driver heading back to seller, needs seller return code ── */
          <div className="space-y-3">
            {/* Header */}
            <div className="bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 rounded-2xl p-4">
              <p className="text-xs font-black text-indigo-700 dark:text-indigo-300 uppercase tracking-wider mb-1.5">🔄 Retounen Kay Machann</p>
              <p className="text-xs text-indigo-600 dark:text-indigo-400 leading-relaxed">
                Lè ou rive kay machann, li ap ba ou yon <strong>kòd 6 chif</strong>. Antre l pou konfime retou a epi debwoke lajan ou.
              </p>
            </div>

            {/* 6-digit return code entry */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-4 space-y-3">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">Kòd Retou Machann Bay</p>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={buyerReturnCodeInput}
                onChange={e => setBuyerReturnCodeInput(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="_ _ _ _ _ _"
                className="w-full text-center text-3xl font-black tracking-[12px] bg-transparent outline-none border-2 border-slate-200 dark:border-slate-700 rounded-xl py-3 focus:border-indigo-500 dark:focus:border-indigo-400 placeholder:text-slate-300 dark:placeholder:text-slate-600 transition-colors"
              />
              <Button
                className="w-full rounded-2xl py-5 font-black text-base bg-indigo-600 hover:bg-indigo-700 text-white shadow-md"
                onClick={handleConfirmBuyerReturn}
                disabled={buyerReturnCodeInput.length < 6 || confirmingBuyerReturn || updating}
              >
                {confirmingBuyerReturn
                  ? <><Loader2 className="h-5 w-5 animate-spin mr-2" />Ap verifye…</>
                  : "✅ Konfime Retou"}
              </Button>
            </div>

            {/* Seller closed button */}
            <Button
              variant="outline"
              className="w-full rounded-2xl py-3 text-sm border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/20 font-bold"
              onClick={handleSellerClosed}
              disabled={reportingSellerClosed || updating}
            >
              {reportingSellerClosed
                ? <Loader2 className="h-4 w-4 animate-spin mr-2" />
                : <AlertCircle className="h-4 w-4 mr-2" />}
              Machann Pa Lakay / Pòt Fèmen
            </Button>
          </div>

        ) : isSellerClosed ? (
          /* ── Seller closed during return: admin notified, driver keeps item ── */
          <div className="space-y-3">
            <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-2xl p-4">
              <p className="text-xs font-black text-red-700 dark:text-red-400 uppercase tracking-wider mb-2">🔒 Machann Pa T Disponib</p>
              <p className="text-xs text-red-600 dark:text-red-400 leading-relaxed mb-3">
                Admin FlexaMarket notifye. Yo ap kontakte machann nan pou ranje yon nouvo dat retou.
              </p>
            </div>
            <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-800/40 rounded-2xl px-4 py-3">
              <p className="font-black text-xs text-emerald-700 dark:text-emerald-400 mb-1">📦 Enstriksyon pou Chofe</p>
              <p className="text-xs text-emerald-600 dark:text-emerald-500 leading-relaxed">
                Kenbe atik la <strong>byen pwoteje epi an sekirite</strong>. Pa ouvri l, pa ba okenn moun l. Admin ap ba ou enstriksyon nouvo livrezon an byento. <strong>Ou ka kontinye aksepte lòt livrezon nòmalman.</strong>
              </p>
            </div>
          </div>

        ) : isArrived ? (
          /* ── Screen 2: arrived — 20-min client window + "Kliyan Prezan" flow ── */
          <div className="space-y-3">

            {/* ── 20-minute countdown banner ── */}
            {delivery.arrivedAt ? (
              <div className={`rounded-2xl p-4 text-center ${arrivedWaitAllowed
                ? "bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800"
                : "bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800"}`}>
                <p className={`text-[10px] font-black uppercase tracking-widest mb-2 ${arrivedWaitAllowed
                  ? "text-red-700 dark:text-red-400"
                  : "text-amber-700 dark:text-amber-400"}`}>
                  {arrivedWaitAllowed ? "⏰ Delè 20 min ekspire" : "⏳ Tann Kliyan — Kronomèt"}
                </p>
                {!arrivedWaitAllowed && arrivedCountdown && (
                  <div className="inline-flex items-center gap-3 bg-amber-100 dark:bg-amber-900/50 rounded-2xl px-6 py-3 mb-2">
                    <Clock className="h-6 w-6 text-amber-700 dark:text-amber-400 shrink-0" />
                    <span className="font-black text-4xl text-amber-800 dark:text-amber-200 tabular-nums tracking-widest">{arrivedCountdown}</span>
                  </div>
                )}
                <p className={`text-xs leading-relaxed ${arrivedWaitAllowed
                  ? "text-red-600 dark:text-red-400"
                  : "text-amber-600 dark:text-amber-500"}`}>
                  {arrivedWaitAllowed
                    ? "Kliyan pa rive nan 20 minit. Ou ka rapòte li absan kounye a."
                    : "Ba kliyan an 20 minit pou rive. Si li prezan, klike bouton vèt la anba a."}
                </p>
              </div>
            ) : (
              /* No arrivedAt yet — simple instruction */
              <div className="flex items-start gap-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200/60 dark:border-blue-800/40 rounded-2xl px-4 py-3">
                <Navigation className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-black text-xs text-blue-700 dark:text-blue-400 uppercase tracking-wide mb-0.5">Ou rive kote kliyan an</p>
                  <p className="text-xs text-blue-700/80 dark:text-blue-500 leading-relaxed">
                    Mande kliyan an pou li ba ou kòd konfimasyon an.
                  </p>
                </div>
              </div>
            )}

            {/* ── Delivery photo ── */}
            <input
              ref={dropoffInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handlePhotoUpload("dropoff", f); e.target.value = ""; }}
            />
            {localDropoffPhoto ? (
              <div className="flex items-center gap-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-800/40 rounded-2xl px-4 py-3">
                <img src={localDropoffPhoto} alt="livrezon" className="w-12 h-12 rounded-xl object-cover shrink-0 border border-border" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-black text-emerald-700 dark:text-emerald-400">📷 Foto Livrezon Sovgardé ✓</p>
                  <button type="button" onClick={() => dropoffInputRef.current?.click()} className="text-[10px] text-muted-foreground underline mt-0.5">Chanje foto</button>
                </div>
              </div>
            ) : (
              <Button
                variant="outline"
                className="w-full rounded-2xl py-3 text-sm border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-900/30 font-bold"
                onClick={() => dropoffInputRef.current?.click()}
                disabled={uploadingDropoff}
              >
                {uploadingDropoff ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Camera className="h-4 w-4 mr-2" />}
                Foto Livrezon (Prèv Remèt)
              </Button>
            )}

            {/* ── PRIMARY: Kliyan Prezan button (always active) ── */}
            <Button
              className="w-full rounded-2xl py-5 font-black text-lg bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-white shadow-lg shadow-emerald-500/30 flex items-center justify-center gap-2"
              onClick={() => { setDigits(Array(6).fill("")); setShowCodeEntry(true); }}
            >
              <CheckCircle className="h-6 w-6 shrink-0" />
              Kliyan Prezan — Antre Kòd
            </Button>

            {/* ── SECONDARY: Absent button — locked until 20-min timer expires ── */}
            {arrivedWaitAllowed || !delivery.arrivedAt ? (
              <Button
                variant="outline"
                className="w-full rounded-2xl py-3 text-sm border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-950/20 font-bold"
                onClick={handleReportBuyerAbsent}
                disabled={reportingAbsent || updating}
              >
                {reportingAbsent
                  ? <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  : <AlertCircle className="h-4 w-4 mr-2" />}
                Kliyan Pa Prezan
              </Button>
            ) : (
              /* Locked — show countdown in button */
              <div className="w-full rounded-2xl py-3 px-4 border-2 border-dashed border-slate-300 dark:border-slate-700 text-center opacity-70 cursor-not-allowed">
                <p className="text-[10px] font-black text-slate-500 dark:text-slate-500 uppercase tracking-widest">🔒 Rapòte Absan Aktive Nan</p>
                <p className="text-xl font-black text-slate-600 dark:text-slate-400 tabular-nums mt-0.5">{arrivedCountdown}</p>
              </div>
            )}
          </div>

        ) : isBeforeArrived ? (
          /* ── Screen 1: heading to buyer ── */
          <div className="space-y-3">
            {/* Instruction banner */}
            <div className="flex items-start gap-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-800/40 rounded-2xl px-4 py-3">
              <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-black text-xs text-amber-700 dark:text-amber-400 uppercase tracking-wide mb-0.5">Enstriksyon</p>
                <p className="text-xs text-amber-700/80 dark:text-amber-500 leading-relaxed">
                  Mande kliyan an pou li ba ou kòd konfimasyon an lè ou rive.
                </p>
              </div>
            </div>

            {/* Primary action button */}
            <Button
              className="w-full rounded-2xl py-5 font-black text-base bg-emerald-500 hover:bg-emerald-600 text-white shadow-md shadow-emerald-500/25"
              onClick={() => onUpdateStatus(delivery.id, nextStatus[delivery.status])}
              disabled={updating}
            >
              {updating
                ? <Loader2 className="h-5 w-5 animate-spin" />
                : nextLabel[delivery.status]}
            </Button>

            {/* Pickup photo — once driver has the package */}
            {(delivery.status === "picked_up" || delivery.status === "on_the_way") && (
              <>
                <input
                  ref={pickupInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handlePhotoUpload("pickup", f); e.target.value = ""; }}
                />
                {localPickupPhoto ? (
                  <div className="flex items-center gap-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-800/40 rounded-2xl px-4 py-3">
                    <img src={localPickupPhoto} alt="pickup" className="w-12 h-12 rounded-xl object-cover shrink-0 border border-border" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-black text-emerald-700 dark:text-emerald-400">📷 Foto Prise Sovgardé ✓</p>
                      <button type="button" onClick={() => pickupInputRef.current?.click()} className="text-[10px] text-muted-foreground underline mt-0.5">Chanje foto</button>
                    </div>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    className="w-full rounded-2xl py-3 text-sm border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-900/30 font-bold"
                    onClick={() => pickupInputRef.current?.click()}
                    disabled={uploadingPickup}
                  >
                    {uploadingPickup ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Camera className="h-4 w-4 mr-2" />}
                    Foto Prise (Prèv Ranmasaj)
                  </Button>
                )}
              </>
            )}

            {/* Secondary actions for driver_assigned */}
            {delivery.status === "driver_assigned" && (
              <>
                <Button variant="outline"
                  className="w-full rounded-2xl py-3 text-sm border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-950/20 font-bold"
                  onClick={handleReportFailed} disabled={reportingFailed || updating}>
                  {reportingFailed ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <AlertCircle className="h-4 w-4 mr-2" />}
                  Machann Pa Prezan
                </Button>
                <Button variant="outline"
                  className="w-full rounded-2xl py-3 text-sm border-red-300 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/20"
                  onClick={() => onDriverCancel(delivery.id)} disabled={updating}
                  data-testid="button-driver-cancel">
                  Anile Livrezon Sa
                </Button>
              </>
            )}
          </div>

        ) : null}
      </div>
    </div>
  );
}

// ── Driver Stats Card ─────────────────────────────────────────────────────────

function DriverStatsBar({ stats, onToggle, toggling }: {
  stats: DriverStats;
  onToggle: () => void;
  toggling: boolean;
}) {
  const { t } = useTranslation();

  return (
    <div className="bg-gradient-to-r from-card to-card border border-border rounded-3xl p-4 mb-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-11 h-11 bg-primary/10 rounded-2xl flex items-center justify-center">
              <Truck className="h-6 w-6 text-primary" />
            </div>
            <div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-card ${stats.isOnline ? "bg-emerald-500" : "bg-slate-400"}`} />
          </div>
          <div>
            <p className="font-bold text-sm">{t("availableDeliveries.activeDriver")}</p>
            <p className="text-xs text-muted-foreground">{stats.commune ?? "Haiti"}</p>
          </div>
        </div>
        <button
          onClick={onToggle}
          disabled={toggling}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 ${
            stats.isOnline
              ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {toggling ? <Loader2 className="h-3 w-3 animate-spin" /> :
            stats.isOnline ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
          {stats.isOnline ? t("availableDeliveries.online") : t("availableDeliveries.offline")}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {[
          { value: stats.deliveryCount,               label: t("availableDeliveries.statsDeliveries"), color: "text-foreground" },
          { value: `${stats.rating.toFixed(1)}⭐`,    label: t("availableDeliveries.statsRating"),     color: "text-amber-600" },
          { value: `$${stats.earningsTotal.toFixed(0)}`, label: t("availableDeliveries.statsEarnings"), color: "text-emerald-600" },
        ].map(({ value, label, color }) => (
          <div key={label} className="text-center bg-muted/40 rounded-xl py-2.5">
            <p className={`text-xl font-black ${color}`}>{value}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── GPS Prompt ────────────────────────────────────────────────────────────────

function GpsPromptBanner({ onShare, sharing }: { onShare: () => void; sharing: boolean }) {
  const { t } = useTranslation();

  return (
    <div className="bg-gradient-to-r from-blue-500/10 to-blue-600/5 border border-blue-200 dark:border-blue-800 rounded-2xl p-4 mb-4 flex items-center gap-3">
      <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/40 rounded-xl flex items-center justify-center shrink-0">
        <Navigation className="h-5 w-5 text-blue-600" />
      </div>
      <div className="flex-1">
        <p className="text-sm font-bold text-blue-800 dark:text-blue-300">{t("availableDeliveries.gpsTitle")}</p>
        <p className="text-xs text-blue-700/80 dark:text-blue-400/80">{t("availableDeliveries.gpsDesc")}</p>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="shrink-0 rounded-xl border-blue-300 text-blue-700 text-xs font-bold"
        onClick={onShare}
        disabled={sharing}
      >
        {sharing ? <Loader2 className="h-3 w-3 animate-spin" /> : t("availableDeliveries.gpsBtn")}
      </Button>
    </div>
  );
}

// ── Loading Skeleton ──────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map(i => (
        <div key={i} className="bg-card border border-border rounded-3xl overflow-hidden">
          <div className="h-14 bg-muted animate-pulse" />
          <div className="p-4 space-y-2">
            <div className="h-4 bg-muted rounded-full w-3/4 animate-pulse" />
            <div className="h-4 bg-muted rounded-full w-1/2 animate-pulse" />
            <div className="h-10 bg-muted rounded-2xl mt-3 animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AvailableDeliveries() {
  const { user, token } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { t } = useTranslation();

  const isAdminUser = !!(user?.isAdmin || (user as any)?.isSuperAdmin);
  const isSuperAdmin = !!(user as any)?.isSuperAdmin;
  const adminScopeCountry: string | null = (user as any)?.adminScopeCountry ?? null;

  // Admin default country: their scope country, or their own country, or first delivery country
  const defaultAdminCountry = adminScopeCountry
    ?? (DELIVERY_COUNTRIES.includes(user?.country ?? "") ? (user?.country ?? "Haiti") : "Haiti");

  const [tab, setTab] = useState<"browse" | "mine">("browse");
  const [deliveries, setDeliveries] = useState<BrowseDelivery[]>([]);
  const [mine, setMine] = useState<ActiveDelivery[]>([]);
  const [driverCta, setDriverCta] = useState<DriverCta>("none");
  const [driverStats, setDriverStats] = useState<DriverStats | null>(null);
  const [driverHasGps, setDriverHasGps] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isAdminView, setIsAdminView] = useState(false);
  const [adminSelectedCountry, setAdminSelectedCountry] = useState<string>(defaultAdminCountry);

  const [accepting, setAccepting] = useState<number | null>(null);
  const [updating, setUpdating] = useState<number | null>(null);
  const [togglingOnline, setTogglingOnline] = useState(false);
  const [sharingGps, setSharingGps] = useState(false);
  const watchIdRef = useRef<number | null>(null);
  const lastSentRef = useRef<number>(0);
  const [driverCommune, setDriverCommune] = useState<string | null>(null);
  const [showCommunePicker, setShowCommunePicker] = useState(false);
  const [changingCommune, setChangingCommune] = useState(false);

  const [modalDelivery, setModalDelivery] = useState<BrowseDelivery | null>(null);

  const loadAll = async (h: Record<string, string>, setCta = true, country?: string) => {
    const countryParam = country ?? (isAdminUser ? adminSelectedCountry : undefined);
    const url = countryParam
      ? `/api/delivery/browse?country=${encodeURIComponent(countryParam)}`
      : "/api/delivery/browse";
    const browseRes = await fetch(url, { headers: h });
    if (browseRes.ok) {
      const d = await browseRes.json();
      setDeliveries(d.deliveries ?? []);
      if (d.isAdminView) setIsAdminView(true);
      if (setCta) {
        const cta: DriverCta = d.driverCta ?? "none";
        setDriverCta(cta);
      }
      setDriverHasGps(d.driverHasGps ?? false);
      setDriverCommune(d.driverCommune ?? null);
    }
  };

  // Initial load
  useEffect(() => {
    if (!token) return;
    const h = { Authorization: `Bearer ${token}` };

    const run = async () => {
      setLoading(true);
      try {
        if (isAdminUser) {
          // Admins: just load deliveries, no driver-specific data needed
          await loadAll(h, true, defaultAdminCountry);
        } else {
          await loadAll(h);
          const cta = (await fetch("/api/delivery/browse", { headers: h }).then(r => r.json()).catch(() => ({}))).driverCta ?? "none";
          if (cta === "approved") {
            const [myRes, statsRes] = await Promise.all([
              fetch("/api/delivery/my", { headers: h }),
              fetch("/api/delivery/driver/stats", { headers: h }),
            ]);
            if (myRes.ok) setMine((await myRes.json()).deliveries ?? []);
            if (statsRes.ok) setDriverStats((await statsRes.json()).driver ?? null);
          }
        }
      } catch {/* */} finally {
        setLoading(false);
      }
    };

    run();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Admin: reload when country selection changes
  useEffect(() => {
    if (!isAdminUser || !token) return;
    const h = { Authorization: `Bearer ${token}` };
    setLoading(true);
    loadAll(h, true, adminSelectedCountry).finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminSelectedCountry]);

  useEffect(() => { if (!user) navigate("/auth/login"); }, [user]);

  if (!user) return null;

  if (!isAdminUser && !isSuperAdmin && !DELIVERY_COUNTRIES.includes(user.country ?? "")) {
    return (
      <div className="max-w-lg mx-auto px-4 py-20 text-center">
        <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <p className="font-bold text-lg mb-1">{t("availableDeliveries.notAvailableTitle")}</p>
        <p className="text-sm text-muted-foreground">{t("availableDeliveries.notAvailableDesc")}</p>
      </div>
    );
  }

  // ── Actions ──────────────────────────────────────────────────────────────

  const handleAcceptClick = (delivery: BrowseDelivery) => {
    if (driverCta === "approved") {
      doAccept(delivery.id);
    } else {
      setModalDelivery(delivery);
    }
  };

  const doAccept = async (id: number) => {
    setAccepting(id);
    setModalDelivery(null);
    try {
      const res = await fetch(`/api/delivery/${id}/accept`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        toast({ title: t("availableDeliveries.toastAccepted") });
        const h = { Authorization: `Bearer ${token}` };
        const [myRes, statsRes] = await Promise.all([
          fetch("/api/delivery/my", { headers: h }),
          fetch("/api/delivery/driver/stats", { headers: h }),
        ]);
        await loadAll(h, false);
        if (myRes.ok) setMine((await myRes.json()).deliveries ?? []);
        if (statsRes.ok) setDriverStats((await statsRes.json()).driver ?? null);
        setTab("mine");
      } else {
        toast({ title: data.error ?? t("availableDeliveries.toastError"), variant: "destructive" });
      }
    } catch {
      toast({ title: t("availableDeliveries.toastConnFail"), variant: "destructive" });
    } finally {
      setAccepting(null);
    }
  };

  const handleDriverCancel = async (deliveryId: number) => {
    if (!window.confirm("Ou sèten ou vle anile livrezon sa? Li ap retounen nan lis disponib la pou yon lòt chofe.")) return;
    setUpdating(deliveryId);
    try {
      const res = await fetch(`/api/delivery/${deliveryId}/driver-cancel`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast({ title: "Livrezon kansele. Li retounen nan pool." });
        const h = { Authorization: `Bearer ${token}` };
        const myRes = await fetch("/api/delivery/my", { headers: h });
        if (myRes.ok) setMine((await myRes.json()).deliveries ?? []);
        setTab("browse");
      } else {
        toast({ title: data.error ?? t("availableDeliveries.toastError"), variant: "destructive" });
      }
    } catch {
      toast({ title: t("availableDeliveries.toastConnFail"), variant: "destructive" });
    } finally {
      setUpdating(null);
    }
  };

  const handleUpdateStatus = async (id: number, status: string) => {
    setUpdating(id);
    try {
      const res = await fetch(`/api/delivery/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        const h = { Authorization: `Bearer ${token}` };
        const myRes = await fetch("/api/delivery/my", { headers: h });
        if (myRes.ok) setMine((await myRes.json()).deliveries ?? []);
      } else {
        toast({ title: t("availableDeliveries.toastError"), variant: "destructive" });
      }
    } finally {
      setUpdating(null);
    }
  };

  const handleToggleOnline = async () => {
    if (!driverStats) return;
    setTogglingOnline(true);
    try {
      await fetch("/api/delivery/driver/location", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ isOnline: !driverStats.isOnline }),
      });
      setDriverStats(s => s ? { ...s, isOnline: !s.isOnline } : s);
    } catch {
      toast({ title: t("availableDeliveries.toastError"), variant: "destructive" });
    } finally { setTogglingOnline(false); }
  };

  const sendGpsUpdate = async (lat: number, lng: number) => {
    const now = Date.now();
    if (now - lastSentRef.current < 20000) return; // throttle: min 20s between sends
    lastSentRef.current = now;
    try {
      await fetch("/api/delivery/driver/location", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ latitude: lat, longitude: lng }),
      });
    } catch {/* */}
  };

  const stopGpsWatch = () => {
    if (watchIdRef.current != null) {
      navigator.geolocation?.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setSharingGps(false);
  };

  const handleShareGps = () => {
    if (!navigator.geolocation) {
      toast({ title: t("availableDeliveries.toastGpsFail"), variant: "destructive" });
      return;
    }
    setSharingGps(true);
    // Get initial position immediately, then watch continuously
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const { latitude, longitude } = pos.coords;
        lastSentRef.current = 0; // force first send
        await sendGpsUpdate(latitude, longitude);
        setDriverHasGps(true);
        toast({ title: t("availableDeliveries.toastGpsOk") });
        await loadAll({ Authorization: `Bearer ${token}` }, false);
        // Start continuous watch (updates every ~30s via sendGpsUpdate throttle)
        if (watchIdRef.current == null) {
          watchIdRef.current = navigator.geolocation.watchPosition(
            p => { sendGpsUpdate(p.coords.latitude, p.coords.longitude); },
            () => {},
            { enableHighAccuracy: true, maximumAge: 15000 },
          );
        }
      },
      () => {
        toast({ title: t("availableDeliveries.toastGpsFail"), variant: "destructive" });
        setSharingGps(false);
      },
      { enableHighAccuracy: true, timeout: 12000 },
    );
  };

  // Cleanup watchPosition on unmount
  useEffect(() => () => stopGpsWatch(), []);

  // Change driver's active commune — saves to DB + reloads deliveries
  const handleChangeCommune = async (commune: string) => {
    setChangingCommune(true);
    setShowCommunePicker(false);
    try {
      await fetch("/api/delivery/driver/location", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ commune }),
      });
      setDriverCommune(commune);
      await loadAll({ Authorization: `Bearer ${token}` }, false);
      toast({ title: `📍 Komin chanje → ${commune}` });
    } catch {
      toast({ title: t("availableDeliveries.toastError"), variant: "destructive" });
    } finally {
      setChangingCommune(false);
    }
  };

  const activeCount = mine.filter(d => !["delivered", "cancelled"].includes(d.status)).length;
  const availableCities = CITIES_BY_COUNTRY[user.country ?? ""] ?? [];

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Modal overlay */}
      {modalDelivery && (
        <DriverRequiredModal
          status={driverCta}
          onClose={() => setModalDelivery(null)}
          onApply={() => { setModalDelivery(null); navigate("/delivery/apply"); }}
        />
      )}

      {/* ── Commune Picker Modal ── */}
      {showCommunePicker && driverCta === "approved" && availableCities.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowCommunePicker(false)} />
          <div className="relative w-full max-w-sm bg-card rounded-3xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
            <div className="h-1.5 w-full bg-gradient-to-r from-primary via-orange-400 to-primary" />
            <div className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-base font-black">Chwazi Komin Ou</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Ou ap wè sèlman livrezon nan komin sa a</p>
                </div>
                <button onClick={() => setShowCommunePicker(false)} className="p-1.5 rounded-full hover:bg-muted transition-colors">
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-1">
                {availableCities.map(city => (
                  <button key={city} type="button"
                    onClick={() => handleChangeCommune(city)}
                    className={`text-left px-3 py-2.5 rounded-xl text-sm font-semibold border transition-all active:scale-95 ${driverCommune?.toLowerCase() === city.toLowerCase() ? "bg-primary text-white border-primary" : "border-border bg-background hover:bg-accent text-foreground"}`}>
                    <MapPin className="h-3 w-3 inline mr-1.5 opacity-60" />{city}
                  </button>
                ))}
              </div>
              {driverCommune && (
                <button type="button" className="mt-3 w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors py-2"
                  onClick={() => handleChangeCommune("")}>
                  🔄 Wè tout livrezon nan peyi a (san filtre komin)
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="max-w-lg mx-auto px-4 py-6 pb-24">
        {/* ── Header ── */}
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-2xl font-black tracking-tight">{t("availableDeliveries.pageTitle")}</h1>
            <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
              {isAdminView ? adminSelectedCountry : user.country}
              {isAdminView && (
                <span className="ml-1 text-[10px] font-bold bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 px-1.5 py-0.5 rounded-md uppercase tracking-wide">
                  {isSuperAdmin ? "Super Admin" : "Admin"}
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <LanguageSwitcher variant="icon" align="end" className="rounded-xl" />
            <button
              onClick={async () => {
                setLoading(true);
                const h = { Authorization: `Bearer ${token}` };
                await loadAll(h, true, isAdminUser ? adminSelectedCountry : undefined);
                if (!isAdminUser) {
                  const [myRes, statsRes] = await Promise.all([
                    fetch("/api/delivery/my", { headers: h }),
                    fetch("/api/delivery/driver/stats", { headers: h }),
                  ]);
                  if (myRes.ok) setMine((await myRes.json()).deliveries ?? []);
                  if (statsRes.ok) setDriverStats((await statsRes.json()).driver ?? null);
                }
                setLoading(false);
              }}
              className="w-10 h-10 rounded-2xl bg-muted flex items-center justify-center hover:bg-accent transition-colors active:scale-95"
            >
              <RefreshCw className={`h-4 w-4 text-muted-foreground ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* ── Admin: country selector ── */}
        {isAdminView && (
          <div className="mb-4 bg-violet-50 dark:bg-violet-950/20 border border-violet-200 dark:border-violet-800/40 rounded-2xl p-3">
            <p className="text-[10px] font-bold text-violet-700 dark:text-violet-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Shield className="h-3 w-3" /> Livrezon Disponib — Wè Pa Peyi
            </p>
            <div className="flex gap-2">
              {(isSuperAdmin ? [...DELIVERY_COUNTRIES] : adminScopeCountry ? [adminScopeCountry] : DELIVERY_COUNTRIES).map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setAdminSelectedCountry(c)}
                  className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold border-2 transition-all ${adminSelectedCountry === c ? "border-violet-500 bg-violet-500/10 text-violet-700 dark:text-violet-300" : "border-border bg-background text-muted-foreground hover:bg-muted"}`}
                >
                  {c === "Haiti" ? "🇭🇹 Haiti" : "🇩🇴 Dominican Republic"}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-violet-600/70 dark:text-violet-400/60 mt-2">
              {deliveries.length} livrezon an atant • Tout detay vizib pou admin
            </p>
          </div>
        )}

        {/* ── Commune switcher banner (approved drivers only, not admins) ── */}
        {!isAdminView && driverCta === "approved" && availableCities.length > 0 && (
          <button type="button"
            onClick={() => setShowCommunePicker(true)}
            className={`w-full mb-3 flex items-center gap-3 px-4 py-3 rounded-2xl border transition-all active:scale-[0.99] ${driverCommune ? "bg-primary/10 border-primary/30 hover:bg-primary/15" : "bg-muted/60 border-border hover:bg-accent"}`}>
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${driverCommune ? "bg-primary/20" : "bg-muted"}`}>
              <MapPin className={`h-5 w-5 ${driverCommune ? "text-primary" : "text-muted-foreground"}`} />
            </div>
            <div className="flex-1 text-left">
              {driverCommune ? (
                <>
                  <p className="text-xs font-bold text-primary uppercase tracking-wide">Komin Aktif</p>
                  <p className="text-sm font-black text-foreground">{driverCommune}</p>
                </>
              ) : (
                <>
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Aucun filtre komin</p>
                  <p className="text-sm font-semibold text-muted-foreground">Chwazi komin ou pou wè livrezon pre ou</p>
                </>
              )}
            </div>
            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
          </button>
        )}

        {/* ── Driver banner for approved (not admins) ── */}
        {!isAdminView && driverStats && driverCta === "approved" && (
          <DriverStatsBar stats={driverStats} onToggle={handleToggleOnline} toggling={togglingOnline} />
        )}

        {/* ── GPS prompt for Haiti approved drivers (not admins) ── */}
        {!isAdminView && driverCta === "approved" && user.country === "Haiti" && !driverHasGps && (
          <GpsPromptBanner onShare={handleShareGps} sharing={sharingGps} />
        )}

        {/* ── Apply CTA banner for non-drivers (not admins) ── */}
        {!isAdminView && driverCta === "none" && (
          <button
            onClick={() => navigate("/delivery/apply")}
            className="w-full mb-4 bg-gradient-to-r from-primary/10 to-orange-500/10 border border-primary/20 rounded-2xl p-4 text-left flex items-center gap-3 hover:from-primary/15 transition-all active:scale-[0.99]"
          >
            <div className="w-11 h-11 bg-primary/15 rounded-xl flex items-center justify-center shrink-0">
              <Truck className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1">
              <p className="font-bold text-sm">{t("availableDeliveries.ctaTitle")}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{t("availableDeliveries.ctaDesc")}</p>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
          </button>
        )}

        {/* ── Pending banner (not admins) ── */}
        {!isAdminView && driverCta === "pending" && (
          <div className="mb-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-4 flex items-center gap-3">
            <Clock className="h-5 w-5 text-amber-600 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-bold text-amber-800 dark:text-amber-300">{t("availableDeliveries.pendingBanner")}</p>
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">{t("availableDeliveries.pendingBannerSub")}</p>
            </div>
            <button onClick={() => navigate("/delivery/apply")} className="text-xs font-bold text-amber-700 dark:text-amber-400 underline shrink-0">
              {t("availableDeliveries.pendingBannerBtn")}
            </button>
          </div>
        )}

        {/* ── Rejected banner ── */}
        {!isAdminView && driverCta === "rejected" && (
          <div className="mb-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-2xl p-4 flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-bold text-red-800 dark:text-red-300">{t("availableDeliveries.rejectedBanner")}</p>
              <p className="text-xs text-red-700 dark:text-red-400 mt-0.5">{t("availableDeliveries.rejectedBannerSub")}</p>
            </div>
            <button onClick={() => navigate("/delivery/apply")} className="text-xs font-bold text-red-700 dark:text-red-400 underline shrink-0">
              {t("availableDeliveries.rejectedBannerBtn")}
            </button>
          </div>
        )}

        {/* ── Suspended banner — full-page takeover ── */}
        {!isAdminView && driverCta === "suspended" && (
          <div className="mb-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-2xl p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-10 w-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
                <Shield className="h-5 w-5 text-red-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-red-800 dark:text-red-300">Kont Chofe Suspann</p>
                <p className="text-xs text-red-700 dark:text-red-400 mt-0.5">Ou pa ka aksepte livrezon pandan suspansyon an.</p>
              </div>
            </div>
            <button
              onClick={() => navigate("/delivery/suspended")}
              className="w-full text-xs font-bold text-red-700 dark:text-red-400 bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors rounded-xl py-2.5 text-center"
            >
              Wè detay suspansyon an →
            </button>
          </div>
        )}

        {/* ── Tabs (only show for approved drivers, not admins) ── */}
        {!isAdminView && driverCta === "approved" && (
          <div className="flex bg-muted rounded-2xl p-1 mb-5 gap-1">
            {[
              { key: "browse" as const, label: `${t("availableDeliveries.tabAvailable")} (${deliveries.length})` },
              { key: "mine"   as const, label: `${t("availableDeliveries.tabMine")}${activeCount > 0 ? ` (${activeCount})` : ""}` },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${tab === key ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"}`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {/* ── Content ── */}
        {loading ? (
          <Skeleton />
        ) : tab === "browse" || driverCta !== "approved" ? (
          deliveries.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-20 h-20 bg-muted rounded-3xl flex items-center justify-center mx-auto mb-4">
                <Package className="h-10 w-10 text-muted-foreground" />
              </div>
              <p className="font-bold text-lg mb-1">{t("availableDeliveries.emptyTitle")}</p>
              <p className="text-sm text-muted-foreground">
                {driverCta === "approved" && driverCommune
                  ? `Pa gen livrezon ki tann nan ${driverCommune} pou kounya`
                  : driverCta === "approved" && user.country === "Haiti" && !driverHasGps
                    ? t("availableDeliveries.emptyGpsHint")
                    : t("availableDeliveries.emptyGeneral")}
              </p>
              {driverCta === "approved" && driverCommune && (
                <Button className="mt-4 rounded-xl" variant="outline" onClick={() => setShowCommunePicker(true)}>
                  <MapPin className="h-4 w-4 mr-2" /> Chanje komin
                </Button>
              )}
              {driverCta === "approved" && !driverCommune && user.country === "Haiti" && !driverHasGps && (
                <Button className="mt-4 rounded-xl" onClick={handleShareGps} disabled={sharingGps}>
                  <Navigation className="h-4 w-4 mr-2" /> {t("availableDeliveries.emptyGpsBtn")}
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {/* Commune / proximity sort indicator */}
              {driverCta === "approved" && (driverCommune || driverHasGps) && (
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-1.5">
                    {driverCommune
                      ? <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />
                      : <Navigation className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                    }
                    <p className="text-xs text-muted-foreground">
                      {driverCommune
                        ? `Komin: ${driverCommune} • Klase pa distans`
                        : t("availableDeliveries.sortedByProximity")}
                    </p>
                  </div>
                  {driverCommune && (
                    <button type="button" className="text-[10px] text-primary font-bold" onClick={() => setShowCommunePicker(true)}>
                      Chanje
                    </button>
                  )}
                </div>
              )}
              {deliveries.map(d => (
                <DeliveryBrowseCard
                  key={d.id}
                  delivery={d}
                  driverCta={accepting === d.id ? "approved" : driverCta}
                  onAcceptClick={handleAcceptClick}
                  onSkip={(id) => setDeliveries(prev => prev.filter(x => x.id !== id))}
                  driverRating={driverStats?.rating ?? 0}
                  isAccepting={accepting === d.id}
                  onNavigate={navigate}
                />
              ))}
            </div>
          )
        ) : (
          /* My deliveries tab */
          mine.length === 0 ? (
            <div className="text-center py-16">
              <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <p className="font-bold mb-1">{t("availableDeliveries.emptyMineTitle")}</p>
              <p className="text-sm text-muted-foreground">{t("availableDeliveries.emptyMineSub")}</p>
              <Button className="mt-4 rounded-xl" variant="outline" onClick={() => setTab("browse")}>
                {t("availableDeliveries.emptyMineBtn")} <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {mine.map(d => (
                <ActiveDeliveryCard
                  key={d.id}
                  delivery={d}
                  onUpdateStatus={handleUpdateStatus}
                  onDriverCancel={handleDriverCancel}
                  updating={updating === d.id}
                  token={token ?? ""}
                />
              ))}
            </div>
          )
        )}
      </div>
    </>
  );
}
