import { useEffect, useState, useCallback } from "react";
import { useRoute, useLocation } from "wouter";
import {
  Printer, ChevronLeft, Truck, CheckCircle2, Package, Clock, MapPin,
  ExternalLink, ShieldCheck, ChevronDown, ChevronUp, RotateCcw, AlertTriangle, X, Copy, Lock, XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { MobileSelect } from "@/components/ui/mobile-select";
import { useAuth } from "@/contexts/auth";
import { useToast } from "@/hooks/use-toast";
import CommissionBreakdown from "@/components/CommissionBreakdown";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

type FmDriverInfo = {
  name: string | null;
  phone: string | null;
  avatar: string | null;
  rating: number | null;
  deliveryCount: number | null;
  vehicleType: string | null;
  vehicleBrand: string | null;
  vehicleModel: string | null;
  vehicleYear: string | null;
  vehicleColor: string | null;
  licensePlateNumber: string | null;
  photoFront: string | null;
};

type FmDelivery = {
  id: number;
  status: string;
  deliveryMethod: string | null;
  pickupCity: string | null;
  deliveryCity: string | null;
  driverUserId: number | null;
  acceptedAt: string | null;
  verificationCode: string | null;
  driverInfo: FmDriverInfo | null;
};

type Order = {
  orderId: number;
  orderRef: string;
  createdAt: string;
  amount: number;
  currency: string;
  paymentMethod: string;
  orderStatus: string;
  shippedAt: string | null;
  deliveredAt: string | null;
  buyerConfirmedAt: string | null;
  commissionRate: number | null;
  commissionAmount: number | null;
  sellerEarnings: number | null;
  trackingNumber: string | null;
  carrier: string | null;
  trackingStatus: string | null;
  trackingLastUpdated: string | null;
  deliveryDescription: string | null;
  driverName: string | null;
  driverPhone: string | null;
  deliveryNote: string | null;
  fmDelivery: FmDelivery | null;
  escrowReleased: boolean;
  escrowReleasedAt: string | null;
  autoReleaseAt: string | null;
  listingCountry: string | null;
  listingCity: string | null;
  isHaiti: boolean;
  isSeller: boolean;
  isBuyer: boolean;
  isAdminView?: boolean;
  deliveryType: string | null;
  buyerProposedDeliveryFee: number | null;
  listing: { id: number; title: string; images: string[] | null; country: string | null };
  merchant: { id: number; name: string; phone: string | null; avatar: string | null };
  buyer: { id: number; name: string | null };
  shipTo: {
    name: string | null; phone: string | null; email: string | null;
    street: string | null; city: string | null; region: string | null; country: string | null;
  };
};

// ── Haiti city → department map ───────────────────────────────────────────────
const CITY_DEPT: Record<string, string> = {
  // Ouest
  "port-au-prince": "Ouest", "pétion-ville": "Ouest", "petionville": "Ouest",
  "petion-ville": "Ouest", "delmas": "Ouest", "carrefour": "Ouest",
  "léogâne": "Ouest", "leogane": "Ouest", "croix-des-bouquets": "Ouest",
  "croix des bouquets": "Ouest", "kenscoff": "Ouest", "thomazeau": "Ouest",
  "arcahaie": "Ouest", "anse-à-galets": "Ouest",
  // Artibonite
  "gonaïves": "Artibonite", "gonaives": "Artibonite",
  "saint-marc": "Artibonite", "saint marc": "Artibonite",
  "verrettes": "Artibonite", "montrouis": "Artibonite", "gros-morne": "Artibonite",
  // Nord
  "cap-haïtien": "Nord", "cap-haitien": "Nord",
  "cap haïtien": "Nord", "cap haitien": "Nord",
  // Centre
  "hinche": "Centre", "mirebalais": "Centre",
  // Sud
  "les cayes": "Sud", "les-cayes": "Sud",
  // Grande-Anse
  "jérémie": "Grande-Anse", "jeremie": "Grande-Anse",
  // Sud-Est
  "jacmel": "Sud-Est",
};

// ── Dominican Republic city → province map ────────────────────────────────────
const CITY_PROV_DR: Record<string, string> = {
  "santo domingo": "Distrito Nacional",
  "santiago": "Santiago",
  "la romana": "La Romana",
  "san pedro de macorís": "San Pedro de Macorís",
  "san pedro de macoris": "San Pedro de Macorís",
  "puerto plata": "Puerto Plata",
  "la vega": "La Vega",
  "jarabacoa": "La Vega",
  "higüey": "La Altagracia",
  "higuey": "La Altagracia",
  "san cristóbal": "San Cristóbal",
  "san cristobal": "San Cristóbal",
  "barahona": "Barahona",
  "san francisco de macorís": "Duarte",
  "san francisco de macoris": "Duarte",
  "bonao": "Monseñor Nouel",
  "moca": "Espaillat",
  "azua": "Azua",
  "nagua": "María Trinidad Sánchez",
};

function getDept(city: string | null | undefined): string | null {
  if (!city) return null;
  return CITY_DEPT[city.toLowerCase().trim()] ?? null;
}

function getDeptDR(city: string | null | undefined): string | null {
  if (!city) return null;
  return CITY_PROV_DR[city.toLowerCase().trim()] ?? null;
}

/** Returns cross-regional info for both Haiti (departments) and DR (provinces).
 *  Also handles cross-country Haiti ↔ DR routes. */
function getCrossRegionInfo(
  sellerCity: string | null | undefined,
  buyerCity: string | null | undefined,
  listingCountry: string | null | undefined,
  buyerCountry: string | null | undefined,
): { isCross: boolean; fromLabel: string; toLabel: string } {
  const sellerCountry = listingCountry ?? "";
  const bCountry = buyerCountry ?? "";

  // Cross-country route (Haiti ↔ DR)
  if (
    (sellerCountry === "Haiti" && bCountry === "Dominican Republic") ||
    (sellerCountry === "Dominican Republic" && bCountry === "Haiti")
  ) {
    return { isCross: true, fromLabel: sellerCountry, toLabel: bCountry };
  }

  // DR → DR inter-provincial
  if (sellerCountry === "Dominican Republic") {
    const sp = getDeptDR(sellerCity);
    const bp = getDeptDR(buyerCity);
    if (sp && bp && sp !== bp) return { isCross: true, fromLabel: sp, toLabel: bp };
    return { isCross: false, fromLabel: "", toLabel: "" };
  }

  // Haiti → Haiti inter-departmental
  const sd = getDept(sellerCity);
  const bd = getDept(buyerCity);
  if (sd && bd && sd !== bd) return { isCross: true, fromLabel: sd, toLabel: bd };
  return { isCross: false, fromLabel: "", toLabel: "" };
}

function VerificationCodeCard({ code, isBus = false }: { code: string; isBus?: boolean }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const openModal = () => { setStep(1); setOpen(true); };
  const close = () => { setOpen(false); setTimeout(() => setStep(1), 300); };

  return (
    <>
      {/* ── Trigger button ─────────────────────────────────── */}
      <button
        onClick={openModal}
        className="w-full rounded-2xl bg-[#6C63FF] hover:bg-[#5a52e0] active:scale-[0.98] transition-all p-4 text-white flex items-center justify-between shadow-lg shadow-[#6C63FF]/30"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
            <Truck className="h-5 w-5 text-white" />
          </div>
          <div className="text-left">
            <p className="font-black text-sm tracking-wide">{isBus ? "KÒD POU BAY MACHANN NAN" : "KÒD POU BAY CHOFÉ A"}</p>
            <p className="text-[11px] text-white/70 mt-0.5">Klike pou wè kòd ou a</p>
          </div>
        </div>
        <div className="flex gap-1 shrink-0">
          {code.split("").map((_, i) => (
            <div key={i} className="w-5 h-6 rounded bg-white/25 flex items-center justify-center">
              <span className="text-[10px] font-black">•</span>
            </div>
          ))}
        </div>
      </button>

      {/* ── Modal overlay ──────────────────────────────────── */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm"
          onClick={e => { if (e.target === e.currentTarget) close(); }}
        >
          <div className="w-full max-w-sm bg-white dark:bg-gray-950 rounded-t-3xl shadow-2xl animate-in slide-in-from-bottom-4 duration-300">

            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-gray-200 dark:bg-gray-700" />
            </div>

            {step === 1 ? (
              /* ── Step 1: ACHTE RESEVWA ─────────────────── */
              <div className="px-6 pb-8 pt-4 space-y-5 text-center">
                {/* Green checkmark */}
                <div className="flex justify-center">
                  <div className="w-20 h-20 rounded-full bg-emerald-100 dark:bg-emerald-950/50 flex items-center justify-center">
                    <CheckCircle2 className="h-12 w-12 text-emerald-500" />
                  </div>
                </div>

                {/* Title */}
                <div>
                  <h2 className="text-xl font-black text-emerald-600 dark:text-emerald-400 tracking-wide uppercase">
                    {isBus ? "KÒD KONFIRMASYON" : "ACHTE RESEVWA"}
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
                    {isBus
                      ? <>Men kòd sekrè ou a.<br />Bay machann nan kòd la pa mesaj lè ou resevwa atik la.</>
                      : <>Ou te achte avèk siksès.<br />Men kòd konfimasyon w lan :</>}
                  </p>
                </div>

                {/* Code digits */}
                <div className="flex justify-center gap-2">
                  {code.split("").map((d, i) => (
                    <div key={i} className="w-11 h-14 rounded-xl bg-gray-50 dark:bg-gray-900 border-2 border-[#6C63FF]/40 flex items-center justify-center shadow-sm">
                      <span className="text-2xl font-black text-[#6C63FF]">{d}</span>
                    </div>
                  ))}
                </div>

                {/* Bus: prominent "send code to seller" callout right under digits */}
                {isBus && (
                  <div className="bg-amber-50 dark:bg-amber-950/30 border-2 border-amber-300/70 dark:border-amber-700/50 rounded-2xl p-4 flex items-start gap-3 text-left">
                    <span className="text-xl shrink-0 mt-0.5">⚠️</span>
                    <div>
                      <p className="font-black text-sm text-amber-800 dark:text-amber-300 uppercase tracking-wide">Kisa pou w fè ak kòd sa a?</p>
                      <p className="text-xs text-amber-700 dark:text-amber-400 mt-1 leading-relaxed">
                        Lè ou <span className="font-bold">resevwa atik la</span> nan men transpòtè a — voye kòd sa a bay <span className="font-bold">machann nan pa mesaj</span>. Li ap antre l nan app li pou libere lajan l imedyatman.
                      </p>
                      <p className="text-[11px] text-amber-600 dark:text-amber-500 mt-1.5 font-semibold">
                        ⛔ Pa bay kòd la si ou pa resevwa atik la!
                      </p>
                    </div>
                  </div>
                )}

                {/* Next steps banner */}
                <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200/70 dark:border-emerald-800/40 rounded-2xl p-4 text-left">
                  <div className="flex items-center gap-2 mb-1.5">
                    <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <p className="font-black text-[11px] text-emerald-700 dark:text-emerald-400 uppercase tracking-wide">SA KI PWOCHEN</p>
                  </div>
                  <p className="text-xs text-emerald-800 dark:text-emerald-300 leading-relaxed">
                    {isBus
                      ? "Bay machann nan kòd la lè ou resevwa atik la. Li ap antre l pou libere lajan li imedyatman."
                      : "Lajan an ap lage bay vandè a sèlman lè w konfime livrezon atik la. Ale nan lèd la pou w swiv estati a."}
                  </p>
                </div>

                {/* Next step button */}
                <button
                  onClick={() => setStep(2)}
                  className="w-full bg-[#6C63FF] hover:bg-[#5a52e0] text-white font-black rounded-2xl py-3.5 text-sm transition-colors shadow-md shadow-[#6C63FF]/30"
                >
                  {isBus ? "Wè kòd pou machann nan →" : "Wè kòd pou chofe a →"}
                </button>
              </div>
            ) : (
              /* ── Step 2: KÒD POU BAY CHOFÉ A ────────────── */
              <div className="px-6 pb-8 pt-4 space-y-5 text-center">
                {/* Delivery icon */}
                <div className="flex justify-center">
                  <div className="w-20 h-20 rounded-full border-2 border-[#6C63FF]/30 bg-[#6C63FF]/10 flex items-center justify-center">
                    <Truck className="h-10 w-10 text-[#6C63FF]" />
                  </div>
                </div>

                {/* Title */}
                <div>
                  <h2 className="text-lg font-black text-[#6C63FF] tracking-wide uppercase">
                    {isBus ? "KÒD POU BAY MACHANN NAN" : "KÒD POU BAY CHOFÉ A"}
                  </h2>
                  <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                    {isBus
                      ? "Bay machann nan kòd sa a pa mesaj lè ou resevwa atik la. Li ap antre l nan app li pou libere lajan li imedyatman."
                      : "Bay chofè livrezon an kòd sa a pou konfime resepsyon an."}
                  </p>
                </div>

                {/* Code digits — large */}
                <div className="flex justify-center gap-2">
                  {code.split("").map((d, i) => (
                    <div key={i} className="w-11 h-14 rounded-xl bg-gray-50 dark:bg-gray-900 border-2 border-[#6C63FF]/50 shadow-md flex items-center justify-center">
                      <span className="text-2xl font-black text-[#6C63FF]">{d}</span>
                    </div>
                  ))}
                </div>

                {/* Copy */}
                <button onClick={copy} className="flex items-center gap-1.5 mx-auto text-xs text-[#6C63FF] font-semibold py-1">
                  {copied
                    ? <><CheckCircle2 className="h-4 w-4 text-emerald-500" /> Kòd kopye ✓</>
                    : <><Copy className="h-4 w-4" /> Kopye kòd la</>}
                </button>

                {/* Important info */}
                <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200/60 dark:border-blue-800/40 rounded-2xl p-4 text-left">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-base">ℹ️</span>
                    <p className="font-black text-[11px] text-blue-700 dark:text-blue-400 uppercase tracking-wide">ENFÒMASYON ENPÒTAN</p>
                  </div>
                  <ul className="space-y-1 text-xs text-blue-800 dark:text-blue-300">
                    {isBus ? (
                      <>
                        <li>• Bay <span className="font-bold">machann nan sèlman</span> kòd la — pa lòt moun.</li>
                        <li>• Bay kòd la <span className="font-bold">sèlman lè ou resevwa atik la</span> nan men transpòtè a.</li>
                        <li>• Si ou pa resevwa atik la, pa bay kòd la — kontakte sipò nou.</li>
                      </>
                    ) : (
                      <>
                        <li>• Pa pataje kòd sa a ak lòt moun.</li>
                        <li>• Li valab sèlman pou tranzaksyon sa a.</li>
                      </>
                    )}
                  </ul>
                </div>

                {/* Close button */}
                <button
                  onClick={close}
                  className="w-full bg-[#6C63FF] hover:bg-[#5a52e0] text-white font-black rounded-2xl py-3.5 text-sm transition-colors shadow-md shadow-[#6C63FF]/30"
                >
                  Fèmen
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

const STAGE_KEYS = [
  { key: "ordered",       labelKey: "orderDetail.stageOrdered",  icon: CheckCircle2 },
  { key: "ready_to_ship", labelKey: "orderDetail.stageReady",    icon: Package },
  { key: "shipped",       labelKey: "orderDetail.stageShipped",  icon: Truck },
  { key: "delivered",     labelKey: "orderDetail.stageDelivered",icon: CheckCircle2 },
  { key: "completed",     labelKey: "orderDetail.stageCompleted",icon: ShieldCheck },
] as const;

function stageIndex(status: string): number {
  const map: Record<string, number> = {
    pending: 0, ordered: 0,
    ready_to_ship: 1,
    shipped: 2, en_route: 2,
    delivered: 3, arrived: 3,
    completed: 4,
  };
  return map[status] ?? 1;
}

const TRACKING_STATUS_COLOR: Record<string, string> = {
  pending:          "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  in_transit:       "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  out_for_delivery: "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300",
  delivered:        "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  exception:        "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

function DaysLeft({ isoDate, t }: { isoDate: string; t: (key: string) => string }) {
  const ms = new Date(isoDate).getTime() - Date.now();
  if (ms <= 0) return <span className="text-amber-400 font-semibold">{t("orderDetail.releasingSoon")}</span>;
  const days = Math.ceil(ms / 86400000);
  return <span>{days === 1 ? t("orderDetail.days_one").replace("{{count}}", "1") : t("orderDetail.days_other").replace("{{count}}", String(days))}</span>;
}

export default function OrderDetail() {
  const [, params] = useRoute("/orders/:id");
  const orderId = parseInt(params?.id ?? "0", 10);
  const [, setLocation] = useLocation();
  const { user, token } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [trackingNumber, setTrackingNumber] = useState("");
  const [carrier, setCarrier] = useState("");
  const [deliveryDescription, setDeliveryDescription] = useState("");
  const [driverName, setDriverName] = useState("");
  const [driverPhone, setDriverPhone] = useState("");
  const [deliveryNote, setDeliveryNote] = useState("");
  const [shipMode, setShipMode] = useState<"fm" | "personal" | "bus">("personal");
  const [fmVehicleType, setFmVehicleType] = useState<"motorcycle" | "car">("motorcycle");
  const [carriers, setCarriers] = useState<string[]>([]);
  const [showSimulate, setShowSimulate] = useState(false);

  // ── Return request state ──────────────────────────────────────────────────
  const [returnInfo, setReturnInfo] = useState<any>(null);
  const [showReturnDialog, setShowReturnDialog] = useState(false);
  const [returnReason, setReturnReason] = useState("");
  const [returnDescription, setReturnDescription] = useState("");
  const [returnBusy, setReturnBusy] = useState(false);
  const [showBuyerShipDialog, setShowBuyerShipDialog] = useState(false);
  const [returnTrackingNum, setReturnTrackingNum] = useState("");
  const [returnCarrierVal, setReturnCarrierVal] = useState("");
  const [busCode, setBusCode] = useState("");
  const [busCodeBusy, setBusCodeBusy] = useState(false);
  const [busCodeError, setBusCodeError] = useState("");
  const [busCodeSuccess, setBusCodeSuccess] = useState(false);
  const [busDestCity, setBusDestCity] = useState("");
  const [busTrackingLink, setBusTrackingLink] = useState("");
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectBusy, setRejectBusy] = useState(false);

  const trackingLabel = (key: string) => {
    const map: Record<string, string> = {
      pending:          t("orderDetail.trackingPending"),
      in_transit:       t("orderDetail.trackingInTransit"),
      out_for_delivery: t("orderDetail.trackingOutForDelivery"),
      delivered:        t("orderDetail.trackingDelivered"),
      exception:        t("orderDetail.trackingException"),
    };
    return map[key] ?? key;
  };

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError((data as any)?.error || t("orderDetail.loading")); return; }
      setOrder(data as Order);
      setError(null);
    } catch { setError(t("orderDetail.toastNetworkError")); }
  }, [orderId, token, t]);

  const loadReturnInfo = useCallback(async () => {
    try {
      const res = await fetch(`/api/orders/${orderId}/return`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) { setReturnInfo(await res.json()); }
    } catch { /* ignore */ }
  }, [orderId, token]);

  useEffect(() => {
    if (!user) { if (!isLoading) setLocation("/auth/login"); return null; }
    if (!orderId) { setError("Invalid order"); return; }
    load();
    loadReturnInfo();
    fetch("/api/orders/carriers")
      .then(r => r.json())
      .then(d => setCarriers(d.carriers ?? []))
      .catch(() => {});
  }, [user, orderId, load, loadReturnInfo, setLocation]);

  // Auto-select bus when order crosses departments/provinces/countries
  useEffect(() => {
    if (!order || order.orderStatus !== "ready_to_ship" || !order.isSeller) return;
    const { isCross } = getCrossRegionInfo(
      order.listingCity, order.shipTo.city,
      order.listingCountry, order.shipTo.country,
    );
    if (isCross) setShipMode("bus");
  }, [order?.orderId]);

  const apiCall = async (
    path: string,
    body?: Record<string, unknown>,
    method = "POST",
  ): Promise<boolean> => {
    setBusy(true);
    try {
      const res = await fetch(path, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({
          title: t("orderDetail.toastError"),
          description: (data as any)?.error || t("orderDetail.tryAgain"),
          variant: "destructive",
        });
        return false;
      }
      return true;
    } catch {
      toast({ title: t("orderDetail.toastNetworkError"), variant: "destructive" });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleShipNonHaiti = async () => {
    if (!trackingNumber.trim()) {
      toast({ title: t("orderDetail.toastTrackingRequired"), variant: "destructive" }); return;
    }
    if (!carrier) {
      toast({ title: t("orderDetail.toastCarrierRequired"), variant: "destructive" }); return;
    }
    const ok = await apiCall(`/api/orders/${orderId}/ship`, { trackingNumber, carrier });
    if (ok) {
      toast({ title: t("orderDetail.toastMarkedShipped"), description: `Tracking: ${carrier} ${trackingNumber}` });
      await load();
    }
  };

  const handleShipHaiti = async () => {
    if (!deliveryDescription.trim()) {
      toast({ title: t("orderDetail.toastDeliveryDescRequired"), variant: "destructive" }); return;
    }
    if ((shipMode === "personal" || shipMode === "bus") && !driverPhone.trim()) {
      toast({ title: t("orderDetail.toastDriverPhoneRequired"), variant: "destructive" }); return;
    }
    const payload: Record<string, unknown> = {
      deliveryDescription,
      deliveryNote: deliveryNote || undefined,
    };
    if (shipMode === "fm") {
      payload.useFmDriver = true;
      payload.fmVehicleType = fmVehicleType;
    } else if (shipMode === "bus") {
      payload.useBus = true;
      payload.driverPhone = driverPhone;
      payload.driverName = driverName || undefined;
      if (busDestCity) payload.busDestCity = busDestCity;
      if (busTrackingLink.trim()) payload.busTrackingLink = busTrackingLink.trim();
    } else {
      payload.driverPhone = driverPhone;
      payload.driverName = driverName || undefined;
    }
    const ok = await apiCall(`/api/orders/${orderId}/ship`, payload);
    if (ok) {
      toast({
        title: shipMode === "fm"
          ? "Livrezon voye bay chofè FM!"
          : shipMode === "bus"
          ? "Kòmand voye pa bis! 🚌"
          : t("orderDetail.toastDeliverySubmitted"),
        description: shipMode === "fm"
          ? "Chofè ki disponib yo ap wè kòmann nan. Youn ap aksepte l touswit."
          : shipMode === "bus"
          ? "Achtè ap resevwa yon notifikasyon. Lajan ou ap libere lè li konfime resepsyon."
          : t("orderDetail.toastDeliverySubmittedDesc"),
      });
      await load();
    }
  };

  const handleConfirmDelivery = async () => {
    const ok = await apiCall(`/api/orders/${orderId}/confirm-delivery`);
    if (ok) {
      // Optimistically hide the confirm section immediately so there is
      // zero window for a second click before load() re-fetches the order.
      setOrder(prev =>
        prev ? { ...prev, escrowReleased: true, orderStatus: "completed" } : prev,
      );
      toast({ title: t("orderDetail.toastDeliveryConfirmed"), description: t("orderDetail.toastFundsReleased") });
      await load();
    }
  };

  const handlePickupUpdate = async (status: "en_route" | "arrived" | "collected") => {
    const ok = await apiCall(`/api/orders/${orderId}/pickup-update`, { status });
    if (ok) {
      if (status === "collected") {
        // Same optimistic update: hide confirm section immediately on collection
        setOrder(prev =>
          prev ? { ...prev, escrowReleased: true, orderStatus: "completed" } : prev,
        );
        toast({ title: "Ranmase fèt! ✅", description: "Vandè a resevwa lajan l nan pòtfèy li." });
      } else if (status === "arrived") {
        toast({ title: "Vandè a konnen ou rive! 📍" });
      } else {
        toast({ title: "Vandè a konnen ou nan wout! 🚶" });
      }
      await load();
    }
  };

  const handleSimulate = async (status: string) => {
    const ok = await apiCall(`/api/orders/${orderId}/simulate-tracking`, { status });
    if (ok) {
      toast({ title: t("orderDetail.toastAdvancedTo", { status }) });
      await load();
    }
  };

  const handleSubmitReturn = async () => {
    if (!returnReason) { toast({ title: "Chwazi yon rezon retou", variant: "destructive" }); return; }
    if (returnDescription.trim().length < 10) { toast({ title: "Deskripsyon twò kout (omwen 10 karaktè)", variant: "destructive" }); return; }
    setReturnBusy(true);
    try {
      const res = await fetch(`/api/orders/${orderId}/return`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ reason: returnReason, description: returnDescription.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast({ title: (data as any)?.error ?? "Erè", variant: "destructive" }); return; }
      toast({ title: "Demann retou voye!", description: "Vandè a pral resevwa yon notifikasyon." });
      setShowReturnDialog(false);
      setReturnReason("");
      setReturnDescription("");
      await loadReturnInfo();
    } finally { setReturnBusy(false); }
  };

  const handleSellerReject = async () => {
    if (!order) return;
    setRejectBusy(true);
    try {
      const res = await fetch(`/api/orders/${order.orderId}/seller-reject`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast({ title: (data as any)?.error ?? "Erè", variant: "destructive" }); return; }
      const d = data as { walletRefunded?: boolean; refundAmount?: number };
      toast({
        title: "Kòmand refize",
        description: d.walletRefunded
          ? `$${(d.refundAmount ?? 0).toFixed(2)} tounen nan pòtfèy achtè a imedyatman.`
          : "Achtè a pral resevwa ranbousman li.",
      });
      setShowRejectDialog(false);
      await load();
    } finally { setRejectBusy(false); }
  };

  const handleSellerBusCode = async () => {
    if (busCode.length !== 6 || !order) return;
    setBusCodeBusy(true);
    setBusCodeError("");
    try {
      const res = await fetch(`/api/orders/${order.orderId}/seller-confirm-bus-code`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ code: busCode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if ((data as any)?.alreadyProcessed) { setBusCodeSuccess(true); return; }
        setBusCodeError((data as any)?.error ?? "Erè — eseye ankò");
      } else {
        setBusCodeSuccess(true);
        await load();
      }
    } catch { setBusCodeError("Erè koneksyon — eseye ankò"); }
    finally { setBusCodeBusy(false); }
  };

  const handleSellerRespond = async (decision: "accept" | "reject") => {
    if (!returnInfo) return;
    setReturnBusy(true);
    try {
      const res = await fetch(`/api/returns/${returnInfo.id}/seller-respond`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast({ title: (data as any)?.error ?? "Erè", variant: "destructive" }); return; }
      toast({ title: decision === "accept" ? "Retou aksepte — achetè ap voye atik la tounen." : "Retou refize." });
      await loadReturnInfo();
    } finally { setReturnBusy(false); }
  };

  const handleBuyerShipReturn = async () => {
    if (!returnInfo) return;
    setReturnBusy(true);
    try {
      const res = await fetch(`/api/returns/${returnInfo.id}/buyer-ship`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ trackingNumber: returnTrackingNum.trim() || undefined, carrier: returnCarrierVal.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast({ title: (data as any)?.error ?? "Erè", variant: "destructive" }); return; }
      toast({ title: "Atik retou make kòm voye!" });
      setShowBuyerShipDialog(false);
      await loadReturnInfo();
    } finally { setReturnBusy(false); }
  };

  if (!user) return null;
  if (error) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <p className="text-destructive font-semibold mb-3">{error}</p>
        <Button variant="outline" onClick={() => history.back()}>{t("orderDetail.back")}</Button>
      </div>
    );
  }
  if (!order) return (
    <div className="max-w-2xl mx-auto px-4 py-12 text-center text-muted-foreground">{t("orderDetail.loading")}</div>
  );

  const idx = stageIndex(order.orderStatus);
  const img = order.listing.images?.[0] ?? `https://placehold.co/120x120/f97316/white?text=Item`;
  const trackStatusKey = order.trackingStatus ?? "pending";
  const trackColor = TRACKING_STATUS_COLOR[trackStatusKey] ?? TRACKING_STATUS_COLOR.pending!;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
      <Button variant="ghost" size="sm" onClick={() => history.back()} className="-ml-2">
        <ChevronLeft className="h-4 w-4 mr-1" /> {t("orderDetail.back")}
      </Button>

      {/* ── Header ── */}
      <div className="rounded-2xl border border-border bg-card p-5 flex items-start gap-4">
        <img
          src={img} alt=""
          className="w-20 h-20 rounded-xl object-cover flex-shrink-0"
          onError={e => { (e.target as HTMLImageElement).src = "https://placehold.co/120x120/f97316/white?text=Item"; }}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs text-muted-foreground">{order.orderRef}</span>
            <Badge variant="secondary" className="capitalize text-xs">{order.paymentMethod}</Badge>
            {order.isHaiti && <Badge variant="outline" className="text-xs">🇭🇹 {t("orderDetail.haitiBadge")}</Badge>}
          </div>
          <h1 className="text-lg font-extrabold mt-1 leading-tight">{order.listing.title}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {order.isBuyer
              ? t("orderDetail.fromSeller", { name: order.merchant.name })
              : t("orderDetail.toBuyer", { name: order.shipTo.name ?? order.buyer.name ?? "Buyer" })
            } · {t("orderDetail.placed", { date: new Date(order.createdAt).toLocaleString() })}
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-xl font-black text-primary">${order.amount.toFixed(2)}</div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">{order.currency}</div>
        </div>
      </div>

      {/* ── Commission breakdown ── */}
      {order.commissionAmount != null && (
        <CommissionBreakdown
          quote={{
            totalAmount: order.amount,
            rate: order.commissionRate ?? 0,
            commissionAmount: order.commissionAmount,
            sellerEarnings: order.sellerEarnings ?? order.amount,
            reason: (order.commissionRate ?? 0) === 0 ? "new_seller_promo" : "platform_default",
          }}
          audience={order.isSeller ? "seller" : "buyer"}
        />
      )}

      {/* ── Escrow status ── */}
      <div className={cn(
        "rounded-xl border px-4 py-3 flex items-center gap-3",
        order.escrowReleased
          ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30"
          : "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30",
      )}>
        {order.escrowReleased ? (
          <ShieldCheck className="h-5 w-5 text-green-600 dark:text-green-400 shrink-0" />
        ) : (
          <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          {order.escrowReleased ? (
            <>
              <p className="text-sm font-bold text-green-700 dark:text-green-400">{t("orderDetail.fundsReleased")}</p>
              <p className="text-xs text-green-400">
                {t("orderDetail.fundsReleasedAmt", {
                  amount: (order.sellerEarnings ?? order.amount).toFixed(2),
                  date: new Date(order.escrowReleasedAt!).toLocaleDateString(),
                })}
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-bold text-amber-700 dark:text-amber-400">{t("orderDetail.fundsInEscrow")}</p>
              <p className="text-xs text-amber-400">
                {order.autoReleaseAt
                  ? <>{t("orderDetail.autoRelease").split("{{days}}")[0]}<DaysLeft isoDate={order.autoReleaseAt} t={t} />{t("orderDetail.autoRelease").split("{{days}}")[1]}</>
                  : t("orderDetail.releasedAfterConfirm")
                }
              </p>
            </>
          )}
        </div>
      </div>

      {/* ── Timeline ── */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground mb-4">{t("orderDetail.timeline")}</h2>
        <div className="relative">
          <div className="absolute top-5 left-5 right-5 h-0.5 bg-border" />
          <div
            className="absolute top-5 left-5 h-0.5 bg-primary transition-all duration-500"
            style={{ width: `calc(${(idx / (STAGE_KEYS.length - 1)) * 100}% - 0px)` }}
          />
          <div className="relative grid grid-cols-5 gap-1">
            {STAGE_KEYS.map((s, i) => {
              const done = i <= idx;
              const Icon = s.icon;
              const ts = s.key === "ordered" ? order.createdAt
                : s.key === "shipped" ? order.shippedAt
                : s.key === "delivered" ? order.deliveredAt
                : s.key === "completed" ? order.escrowReleasedAt
                : null;
              return (
                <div key={s.key} className="flex flex-col items-center text-center">
                  <div className={cn(
                    "w-10 h-10 rounded-full border-2 flex items-center justify-center bg-card relative z-10 transition-all",
                    done ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground",
                  )}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className={cn("text-xs font-semibold mt-2 leading-tight", done ? "text-foreground" : "text-muted-foreground")}>
                    {t(s.labelKey)}
                  </div>
                  {ts && done && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {new Date(ts).toLocaleDateString()}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Carrier tracking (non-Haiti) ── */}
      {!order.isHaiti && order.trackingNumber && (
        <div className="rounded-2xl border border-border bg-card p-5">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-1.5">
            <Truck className="h-4 w-4" /> {t("orderDetail.carrierTracking")}
          </h2>
          <div className="flex items-center gap-3 flex-wrap">
            <span className={cn("inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold", trackColor)}>
              {trackingLabel(trackStatusKey)}
            </span>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-bold">{order.trackingNumber}</span>
              <Badge variant="outline" className="text-xs">{order.carrier}</Badge>
            </div>
          </div>
          {order.trackingLastUpdated && (
            <p className="text-xs text-muted-foreground mt-2">
              {t("orderDetail.lastUpdated", { date: new Date(order.trackingLastUpdated).toLocaleString() })}
            </p>
          )}
          {order.carrier && order.trackingNumber && (
            <Button
              variant="outline"
              size="sm"
              className="mt-3 gap-1.5"
              onClick={() => {
                const num = encodeURIComponent(order.trackingNumber!);
                const urls: Record<string, string> = {
                  "UPS": `https://www.ups.com/track?tracknum=${num}`,
                  "FedEx": `https://www.fedex.com/apps/fedextrack/?tracknumbers=${num}`,
                  "DHL": `https://www.dhl.com/en/express/tracking.html?AWB=${num}`,
                  "USPS": `https://tools.usps.com/go/TrackConfirmAction?qtc_tLabels1=${num}`,
                };
                window.open(urls[order.carrier!] ?? `https://www.google.com/search?q=${order.carrier}+tracking+${num}`, "_blank");
              }}
            >
              <ExternalLink className="h-3.5 w-3.5" /> {t("orderDetail.trackOn", { carrier: order.carrier })}
            </Button>
          )}
        </div>
      )}

      {/* ── Haiti delivery info (shown after seller ships) ── */}
      {order.isHaiti && (order.driverPhone || order.driverName === "fm_driver") && (
        <div className="rounded-2xl border border-border bg-card p-5">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-1.5">
            <Truck className="h-4 w-4" /> {t("orderDetail.deliveryDetails")}
          </h2>

          {order.deliveryDescription && (
            <p className="text-sm text-muted-foreground mb-3">{order.deliveryDescription}</p>
          )}

          {/* FM Driver: show driver card or "searching" banner */}
          {order.driverName === "fm_driver" && (
            <>
              {order.fmDelivery?.driverInfo ? (
                /* ── Driver assigned: full info card ── */
                <div className="space-y-3">
                  <div className="flex items-center gap-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-800/40 rounded-2xl p-3">
                    {/* Avatar */}
                    <div className="w-14 h-14 rounded-xl overflow-hidden bg-muted shrink-0">
                      {order.fmDelivery.driverInfo.avatar ? (
                        <img src={order.fmDelivery.driverInfo.avatar} alt="driver" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-2xl">🚗</div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-base text-foreground truncate">
                        {order.fmDelivery.driverInfo.name ?? "Chofè FM"}
                      </p>
                      {order.fmDelivery.driverInfo.rating != null && (
                        <p className="text-xs text-amber-600 font-bold">
                          ⭐ {order.fmDelivery.driverInfo.rating.toFixed(1)}
                          {order.fmDelivery.driverInfo.deliveryCount != null && (
                            <span className="text-muted-foreground font-normal ml-1">
                              • {order.fmDelivery.driverInfo.deliveryCount} livrezon
                            </span>
                          )}
                        </p>
                      )}
                      {order.fmDelivery.driverInfo.phone && (
                        <a
                          href={`tel:${order.fmDelivery.driverInfo.phone}`}
                          className="text-sm text-primary font-mono font-bold mt-0.5 block"
                        >
                          📞 {order.fmDelivery.driverInfo.phone}
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Vehicle info */}
                  {(order.fmDelivery.driverInfo.vehicleBrand || order.fmDelivery.driverInfo.vehicleColor || order.fmDelivery.driverInfo.licensePlateNumber) && (
                    <div className="bg-muted/50 rounded-xl p-3 space-y-1 text-sm">
                      <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                        {order.fmDelivery.driverInfo.vehicleType === "moto" ? "🏍 Moto" : "🚗 Machin"}
                      </p>
                      {(order.fmDelivery.driverInfo.vehicleBrand || order.fmDelivery.driverInfo.vehicleModel) && (
                        <p className="font-semibold">
                          {[order.fmDelivery.driverInfo.vehicleBrand, order.fmDelivery.driverInfo.vehicleModel, order.fmDelivery.driverInfo.vehicleYear].filter(Boolean).join(" ")}
                        </p>
                      )}
                      {order.fmDelivery.driverInfo.vehicleColor && (
                        <p className="text-muted-foreground">{order.fmDelivery.driverInfo.vehicleColor}</p>
                      )}
                      {order.fmDelivery.driverInfo.licensePlateNumber && (
                        <p className="font-mono font-bold text-foreground">🔖 {order.fmDelivery.driverInfo.licensePlateNumber}</p>
                      )}
                    </div>
                  )}

                  {/* FM delivery status badge + tracking link */}
                  {(() => {
                    const statusMap: Record<string, { label: string; color: string }> = {
                      driver_assigned: { label: "Chofè Asiye", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" },
                      picked_up:       { label: "Pako Pran", color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300" },
                      on_the_way:      { label: "Chofè an Wout", color: "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300" },
                      arrived:         { label: "Chofè Rive", color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300" },
                      delivered:       { label: "Livrezon Fèt ✓", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" },
                    };
                    const meta = statusMap[order.fmDelivery!.status] ?? { label: order.fmDelivery!.status, color: "bg-muted text-muted-foreground" };
                    return (
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${meta.color}`}>{meta.label}</span>
                        <button
                          type="button"
                          onClick={() => setLocation(`/delivery/tracking/${order.fmDelivery!.id}`)}
                          className="flex items-center gap-1.5 text-xs font-bold text-primary hover:underline"
                        >
                          <MapPin className="h-3.5 w-3.5" /> Suiv Livrezon →
                        </button>
                      </div>
                    );
                  })()}

                </div>
              ) : (
                /* ── No driver yet: searching ── */
                <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-800/40 rounded-xl px-3 py-2.5">
                  <span className="text-lg">🚛</span>
                  <div>
                    <p className="text-xs font-bold text-emerald-800 dark:text-emerald-300">Chofè FM ap chèche</p>
                    <p className="text-[11px] text-emerald-700 dark:text-emerald-400">Yon chofè ki disponib ap aksepte livrezon an.</p>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Personal driver info */}
          {order.driverName !== "fm_driver" && order.driverPhone && (
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-3 bg-muted/50 rounded-xl p-3">
                <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center shrink-0">
                  <Truck className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  {order.driverName && (
                    <p className="font-bold text-sm text-foreground">{order.driverName}</p>
                  )}
                  <a href={`tel:${order.driverPhone}`} className="text-sm text-primary font-mono">
                    📞 {order.driverPhone}
                  </a>
                </div>
              </div>
            </div>
          )}

          {order.deliveryNote && (
            <p className="text-xs text-muted-foreground mt-2">
              <span className="font-semibold">{t("orderDetail.note")} </span>{order.deliveryNote}
            </p>
          )}
        </div>
      )}

      {/* ── Buyer verification code (always visible for Haiti/DR delivery orders) ── */}
      {order.isBuyer && order.isHaiti && order.deliveryType !== "pickup" &&
        !["pending", "cancelled", "completed", "return_refunded", "delivered"].includes(order.orderStatus) && (
        order.fmDelivery?.verificationCode &&
        !["delivered", "returned", "cancelled"].includes(order.fmDelivery.status) ? (
          <VerificationCodeCard
            code={order.fmDelivery.verificationCode}
            isBus={order.fmDelivery.deliveryMethod === "bus"}
          />
        ) : (
          <div className="rounded-2xl border border-orange-200/50 dark:border-orange-800/30 bg-orange-50/60 dark:bg-orange-950/20 p-5">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center shrink-0">
                <Lock className="h-6 w-6 text-orange-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-black text-sm uppercase tracking-wider text-orange-700 dark:text-orange-400">
                  KÒD KONFIRMASYON
                </p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  Kòd sekrè ou a ap parèt isit la lè vandè a ekspedye kòmand lan. Ba chofè a kòd la <span className="font-bold text-foreground">SÈLMAN</span> lè li rive ba ou kòmand lan.
                </p>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              {[...Array(6)].map((_, i) => (
                <div
                  key={i}
                  className="flex-1 h-12 rounded-xl bg-orange-100/80 dark:bg-orange-900/30 border-2 border-dashed border-orange-300/60 dark:border-orange-700/40 flex items-center justify-center"
                >
                  <span className="text-orange-400/60 dark:text-orange-600/60 text-xl font-black">•</span>
                </div>
              ))}
            </div>
          </div>
        )
      )}

      {/* ── Shipping address ── */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-1.5">
          <MapPin className="h-4 w-4" /> {t("orderDetail.shippingAddress")}
        </h2>
        <div className="space-y-0.5">
          <div className="font-bold text-base">{order.shipTo.name ?? "—"}</div>
          <div className="text-sm">{order.shipTo.street ?? "—"}</div>
          <div className="text-sm">
            {[order.shipTo.city, order.shipTo.region, order.shipTo.country].filter(Boolean).join(", ") || "—"}
          </div>
          {order.shipTo.phone && <div className="text-sm mt-2">📞 {order.shipTo.phone}</div>}
          {order.shipTo.email && <div className="text-xs text-muted-foreground">{order.shipTo.email}</div>}
        </div>
      </div>

      {/* ── Seller actions ── */}
      {order.isSeller && (
        <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
            <Package className="h-4 w-4" /> {t("orderDetail.sellerActions")}
          </h2>

          {/* ── Seller reject order — only when ready_to_ship and driver not yet assigned ── */}
          {order.orderStatus === "ready_to_ship" &&
           !["shipped", "delivered", "completed", "cancelled", "return_refunded"].includes(order.orderStatus) && (
            <div className="flex items-start gap-3 bg-red-50 dark:bg-red-950/20 border border-red-200/60 dark:border-red-800/30 rounded-xl px-3.5 py-3">
              <span className="text-xl shrink-0 mt-0.5">⚠️</span>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm text-red-800 dark:text-red-300">Ou pa kapab satisfè kòmand sa?</p>
                <p className="text-xs text-red-700 dark:text-red-400 mt-0.5">
                  Si ou refize, achtè a pral resevwa ranbousman konplè imedyatman epi pwodwi a pral disponib ankò.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2.5 border-red-400 text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-950/40 gap-1.5 text-xs"
                  onClick={() => setShowRejectDialog(true)}
                  data-testid="button-seller-reject-order"
                >
                  <XCircle className="h-3.5 w-3.5" /> Refize Kòmand
                </Button>
              </div>
            </div>
          )}

          {/* ── Bus delivery: seller enters code sent by buyer ── */}
          {order.fmDelivery?.deliveryMethod === "bus" &&
           order.orderStatus === "shipped" &&
           !order.escrowReleased &&
           !["delivered", "returned", "cancelled"].includes(order.fmDelivery?.status ?? "") && (
            <div className="rounded-xl border border-violet-200/60 dark:border-violet-800/40 bg-violet-50/60 dark:bg-violet-950/20 p-4 space-y-3">
              {busCodeSuccess ? (
                <div className="flex flex-col items-center gap-3 py-2 text-center">
                  <div className="w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-950/50 flex items-center justify-center">
                    <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                  </div>
                  <div>
                    <p className="font-black text-emerald-700 dark:text-emerald-400">Livrezon konfime!</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Lajan ou libere nan pòch ou.</p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center shrink-0">
                      <span className="text-base">🔑</span>
                    </div>
                    <div>
                      <p className="font-bold text-sm text-violet-800 dark:text-violet-300">Antre kòd achtè a ba ou</p>
                      <p className="text-[11px] text-violet-600 dark:text-violet-400">Achtè a te voye ou yon kòd 6 chif pa mesaj. Antre l pou libere lajan ou imedyatman.</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={busCode}
                      onChange={e => { setBusCode(e.target.value.replace(/\D/g, "").slice(0, 6)); setBusCodeError(""); }}
                      placeholder="_ _ _ _ _ _"
                      className="text-center text-xl font-black tracking-[0.4em] h-11 flex-1"
                      maxLength={6}
                      inputMode="numeric"
                      data-testid="input-seller-bus-code"
                    />
                    <Button
                      onClick={handleSellerBusCode}
                      disabled={busCode.length !== 6 || busCodeBusy}
                      className="h-11 px-5 bg-violet-600 hover:bg-violet-700 text-white font-bold shrink-0"
                      data-testid="button-seller-bus-confirm"
                    >
                      {busCodeBusy ? "..." : "Konfime"}
                    </Button>
                  </div>
                  {busCodeError && (
                    <p className="text-xs text-destructive font-semibold flex items-center gap-1.5">
                      <span>⚠️</span>{busCodeError}
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── Pickup: waiting for buyer to come ── */}
          {order.deliveryType === "pickup" && ["ready_to_ship", "pending", "en_route", "arrived"].includes(order.orderStatus) && (
            <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-800/40 p-4 space-y-2">
              <div className="flex items-center gap-2.5">
                <span className="text-2xl">🏪</span>
                <div>
                  <p className="font-bold text-sm text-emerald-800 dark:text-emerald-300">Achetè pral vin cherche kòmand lan</p>
                  <p className="text-xs text-emerald-700 dark:text-emerald-400">Prepare kòmand lan — achetè ap vin ranmase l.</p>
                </div>
              </div>
              {order.orderStatus === "en_route" && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 text-xs font-semibold">
                  🚶 Achetè nan wout — li ap vini!
                </div>
              )}
              {order.orderStatus === "arrived" && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 text-xs font-semibold">
                  📍 Achetè rive — remèt kòmand lan pou resevwa lajan ou!
                </div>
              )}
              {order.buyerProposedDeliveryFee !== null && order.buyerProposedDeliveryFee !== undefined && (
                <p className="text-xs text-muted-foreground">
                  💡 Achetè te pwopze <span className="font-bold text-foreground">${order.buyerProposedDeliveryFee.toFixed(2)}</span> pou livrezon.
                </p>
              )}
            </div>
          )}

          {order.orderStatus === "ready_to_ship" && !order.isHaiti && order.deliveryType !== "pickup" && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">{t("orderDetail.shipNonHaitiDesc")}</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">{t("orderDetail.carrier")}</Label>
                  <MobileSelect
                    value={carrier}
                    onValueChange={setCarrier}
                    placeholder={t("orderDetail.selectCarrier")}
                    options={carriers.map(c => ({ value: c, label: c }))}
                    className="text-sm"
                    data-testid="select-carrier"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">{t("orderDetail.trackingNumber")}</Label>
                  <Input
                    value={trackingNumber}
                    onChange={e => setTrackingNumber(e.target.value)}
                    placeholder="e.g. 1Z999AA1…"
                    className="h-9 text-sm font-mono"
                    data-testid="input-tracking-number"
                  />
                </div>
              </div>
              <Button
                onClick={handleShipNonHaiti}
                disabled={busy || !trackingNumber.trim() || !carrier}
                data-testid="button-mark-shipped"
              >
                <Truck className="h-4 w-4 mr-1.5" />
                {busy ? t("orderDetail.updating") : t("orderDetail.markShipped")}
              </Button>
            </div>
          )}

          {order.orderStatus === "ready_to_ship" && order.isHaiti && order.deliveryType !== "pickup" && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">{t("orderDetail.shipHaitiDesc")}</p>

              {/* ── Cross-region detection banner (Haiti dept OR DR province OR cross-country) ── */}
              {(() => {
                const { isCross, fromLabel, toLabel } = getCrossRegionInfo(
                  order.listingCity, order.shipTo.city,
                  order.listingCountry, order.shipTo.country,
                );
                if (!isCross) return null;
                const isCrossCountry =
                  (order.listingCountry === "Haiti"                && order.shipTo.country === "Dominican Republic") ||
                  (order.listingCountry === "Dominican Republic"   && order.shipTo.country === "Haiti");
                return (
                  <div className="flex items-start gap-3 bg-violet-50 dark:bg-violet-950/30 border border-violet-200/70 dark:border-violet-800/40 rounded-xl px-3.5 py-3">
                    <span className="text-xl shrink-0">{isCrossCountry ? "🌐" : "🗺️"}</span>
                    <div>
                      <p className="font-black text-xs text-violet-800 dark:text-violet-300 uppercase tracking-wide">
                        {isCrossCountry ? "Livrezon Entènasyonal detekte" : order.listingCountry === "Dominican Republic" ? "Livrezon Entèpwovens detekte" : "Livrezon Entèdepartemal detekte"}
                      </p>
                      <p className="text-xs text-violet-700 dark:text-violet-400 mt-0.5 leading-relaxed">
                        <span className="font-bold">{fromLabel}</span>
                        <span className="mx-1.5 text-violet-400">→</span>
                        <span className="font-bold">{toLabel}</span>
                        <span className="mx-1.5 text-violet-400">·</span>
                        Bis Pwovens rekòmande pou trajè sa a.
                      </p>
                    </div>
                  </div>
                );
              })()}

              {/* ── Ship Mode Toggle ── */}
              {(() => {
                const { isCross } = getCrossRegionInfo(
                  order.listingCity, order.shipTo.city,
                  order.listingCountry, order.shipTo.country,
                );
                return (
                  <div className="flex rounded-xl overflow-hidden border border-border">
                    <button
                      type="button"
                      onClick={() => setShipMode("personal")}
                      className={`flex-1 py-2.5 px-2 text-xs font-bold transition-all flex items-center justify-center gap-1 ${shipMode === "personal" ? "bg-primary text-white" : "bg-background text-muted-foreground hover:bg-muted"}`}
                    >
                      📞 Chofè pèsonèl
                    </button>
                    <button
                      type="button"
                      onClick={() => setShipMode("fm")}
                      className={`flex-1 py-2.5 px-2 text-xs font-bold transition-all flex items-center justify-center gap-1 ${shipMode === "fm" ? "bg-primary text-white" : "bg-background text-muted-foreground hover:bg-muted"}`}
                    >
                      🚛 Chofè FM
                    </button>
                    <button
                      type="button"
                      onClick={() => setShipMode("bus")}
                      className={`relative flex-1 py-2.5 px-2 text-xs font-bold transition-all flex flex-col items-center justify-center gap-0.5 ${shipMode === "bus" ? "bg-primary text-white" : isCross ? "bg-violet-600 text-white hover:bg-violet-700" : "bg-background text-muted-foreground hover:bg-muted"}`}
                    >
                      🚌 Bis/Transpò
                      {isCross && shipMode !== "bus" && (
                        <span className="text-[9px] font-black uppercase tracking-wider opacity-90 leading-none">
                          REKÒMANDE
                        </span>
                      )}
                    </button>
                  </div>
                );
              })()}

              {/* FM driver info banner */}
              {shipMode === "fm" && (
                <div className="flex items-start gap-2.5 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-800/40 rounded-xl px-3 py-2.5">
                  <span className="text-emerald-600 text-base shrink-0">✅</span>
                  <p className="text-xs text-emerald-800 dark:text-emerald-300 leading-relaxed">
                    Livrezon an ap parèt nan lis chofè FM ki disponib yo. Premye chofè ki aksepte l ap reklame l epi ou ap resevwa yon notifikasyon.
                  </p>
                </div>
              )}

              {/* Delivery description — always shown */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">{t("orderDetail.deliveryDesc")}</Label>
                <Textarea
                  value={deliveryDescription}
                  onChange={e => setDeliveryDescription(e.target.value)}
                  placeholder={t("orderDetail.deliveryDescPlaceholder")}
                  rows={2}
                  className="text-sm resize-none"
                  data-testid="input-delivery-description"
                />
              </div>

              {/* FM: vehicle type picker */}
              {shipMode === "fm" && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Tip veyikil chofè</Label>
                  <div className="flex gap-2">
                    {([
                      { v: "motorcycle" as const, label: "🏍️ Moto" },
                      { v: "car" as const,        label: "🚗 Vòtire" },
                    ]).map(opt => (
                      <button
                        key={opt.v}
                        type="button"
                        onClick={() => setFmVehicleType(opt.v)}
                        className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold border-2 transition-all ${fmVehicleType === opt.v ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground hover:bg-muted"}`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Bus / external: info + transporter fields */}
              {shipMode === "bus" && (
                <div className="space-y-3">
                  <div className="flex items-start gap-2.5 bg-blue-50 dark:bg-blue-950/30 border border-blue-200/60 dark:border-blue-800/40 rounded-xl px-3 py-2.5">
                    <span className="text-blue-600 text-base shrink-0">🚌</span>
                    <p className="text-xs text-blue-800 dark:text-blue-300 leading-relaxed">
                      Sistem ap jenere yon <span className="font-bold">kòd 6 chif</span> pou achtè a. Li dwe bay kòd la bay <span className="font-bold">machann nan pa mesaj</span> lè li resevwa atik la — machann antre l pou libere lajan imedyatman.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">Telefòn transpòtè / chofe bis <span className="text-destructive">*</span></Label>
                      <Input
                        type="tel"
                        value={driverPhone}
                        onChange={e => setDriverPhone(e.target.value)}
                        placeholder="+509 XXXX XXXX"
                        className="h-9 text-sm"
                        data-testid="input-bus-driver-phone"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">Non transpòtè / konpayi bis</Label>
                      <Input
                        value={driverName}
                        onChange={e => setDriverName(e.target.value)}
                        placeholder="ex. Caribe Tours, Jean Pierre…"
                        className="h-9 text-sm"
                        data-testid="input-bus-driver-name"
                      />
                    </div>
                  </div>
                  {/* DR-specific: destination city + tracking link */}
                  {order.listingCountry === "Dominican Republic" && (
                    <div className="space-y-3 pt-1 border-t border-blue-200/50 dark:border-blue-800/30">
                      <p className="text-[11px] font-bold text-blue-700 dark:text-blue-400 uppercase tracking-wide">📦 Livrezon Repiblik Dominikèn</p>
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold">Vil destinasyon nan RD</Label>
                        <MobileSelect
                          value={busDestCity}
                          onValueChange={setBusDestCity}
                          placeholder="Chwazi yon vil…"
                          options={[
                            "Santo Domingo","Santiago","La Romana","San Pedro de Macorís",
                            "Puerto Plata","La Vega","Higüey","San Cristóbal","Barahona",
                            "San Francisco de Macorís","Bonao","Moca","Azua","Nagua","Jarabacoa",
                          ].map(c => {
                            const prov = getDeptDR(c);
                            return { value: c, label: prov ? `${c} — ${prov}` : c };
                          })}
                          className="text-sm"
                          data-testid="select-bus-dest-city"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold">Lyen suivi / referans bis <span className="text-muted-foreground font-normal">(opsyonèl)</span></Label>
                        <Input
                          value={busTrackingLink}
                          onChange={e => setBusTrackingLink(e.target.value)}
                          placeholder="https://... oswa nimewo referans"
                          className="h-9 text-sm"
                          data-testid="input-bus-tracking-link"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Personal driver: phone + name fields */}
              {shipMode === "personal" && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">{t("orderDetail.driverPhoneLabel")}</Label>
                    <Input
                      type="tel"
                      value={driverPhone}
                      onChange={e => setDriverPhone(e.target.value)}
                      placeholder="+509 XXXX XXXX"
                      className="h-9 text-sm"
                      data-testid="input-driver-phone"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">{t("orderDetail.driverNameLabel")}</Label>
                    <Input
                      value={driverName}
                      onChange={e => setDriverName(e.target.value)}
                      placeholder="Driver's name"
                      className="h-9 text-sm"
                    />
                  </div>
                </div>
              )}

              {/* Additional note — always shown */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">{t("orderDetail.additionalNote")}</Label>
                <Textarea
                  value={deliveryNote}
                  onChange={e => setDeliveryNote(e.target.value)}
                  placeholder={t("orderDetail.additionalNotePlaceholder")}
                  rows={2}
                  className="text-sm resize-none"
                />
              </div>

              <Button
                onClick={handleShipHaiti}
                disabled={busy || !deliveryDescription.trim() || ((shipMode === "personal" || shipMode === "bus") && !driverPhone.trim())}
                data-testid="button-submit-delivery-info"
              >
                <Truck className="h-4 w-4 mr-1.5" />
                {busy
                  ? t("orderDetail.submitting")
                  : shipMode === "fm"
                    ? "Voye bay chofè FM"
                    : shipMode === "bus"
                    ? "Konfime Voye pa Bis 🚌"
                    : t("orderDetail.submitDelivery")
                }
              </Button>
            </div>
          )}

          {["shipped", "delivered", "completed"].includes(order.orderStatus) && (
            <div className="space-y-2">
              {order.trackingNumber && (
                <p className="text-sm">
                  <span className="font-semibold">{t("orderDetail.carrierLabel")}</span> {order.carrier} ·{" "}
                  <span className="font-mono">{order.trackingNumber}</span>
                </p>
              )}
              <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-green-700 dark:text-green-400">
                <CheckCircle2 className="h-4 w-4" />
                {order.orderStatus === "completed"
                  ? t("orderDetail.orderCompletedFunds")
                  : t("orderDetail.shippedAwaiting")}
              </p>
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-1 border-t border-border">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLocation(`/orders/${orderId}/label`)}
            >
              <Printer className="h-4 w-4 mr-1.5" /> {t("orderDetail.printLabel")}
            </Button>
          </div>
        </div>
      )}

      {/* ── Buyer actions: PICKUP flow ── */}
      {order.isBuyer && !order.escrowReleased && order.deliveryType === "pickup" &&
        ["ready_to_ship", "pending", "en_route", "arrived"].includes(order.orderStatus) && (
        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5 space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4" /> Pikup nan Magazen
          </h2>

          {/* Progress steps */}
          <div className="flex items-center gap-1 text-xs">
            {[
              { s: ["ready_to_ship","pending"], label: "Prè", done: ["en_route","arrived"].includes(order.orderStatus) },
              { s: ["en_route"], label: "Nan Wout", done: order.orderStatus === "arrived" },
              { s: ["arrived"], label: "Rive", done: false },
              { s: ["collected"], label: "Ranmase", done: false },
            ].map((step, i) => (
              <div key={i} className="flex items-center gap-1">
                <div className={cn(
                  "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border-2 shrink-0",
                  step.done ? "bg-primary border-primary text-white"
                  : step.s.includes(order.orderStatus) ? "border-primary text-primary bg-primary/10"
                  : "border-muted-foreground/30 text-muted-foreground"
                )}>
                  {step.done ? "✓" : i + 1}
                </div>
                <span className={cn("text-[10px] font-medium",
                  step.done ? "text-primary" : step.s.includes(order.orderStatus) ? "text-primary" : "text-muted-foreground"
                )}>{step.label}</span>
                {i < 3 && <div className="w-4 h-px bg-border mx-0.5" />}
              </div>
            ))}
          </div>

          {/* Action button */}
          {order.orderStatus === "en_route" ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Ou rive devan magazen an? Klike pou fè vandè a konnen.</p>
              <Button onClick={() => handlePickupUpdate("arrived")} disabled={busy} className="gap-1.5 w-full" data-testid="button-pickup-arrived">
                <MapPin className="h-4 w-4" />
                {busy ? "Ap voye…" : "📍 Mwen Rive!"}
              </Button>
            </div>
          ) : order.orderStatus === "arrived" ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Ou resevwa atik la? Klike pou konfime — lajan ale jwenn vandè a imedyatman.</p>
              <Button onClick={() => handlePickupUpdate("collected")} disabled={busy} className="gap-1.5 w-full bg-green-600 hover:bg-green-700 text-white" data-testid="button-pickup-collected">
                <CheckCircle2 className="h-4 w-4" />
                {busy ? "Ap trete…" : "✅ Ranmase / Kolekte"}
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Ou prèt pou ale nan magazen an? Klike pou avèti vandè a.</p>
              <Button onClick={() => handlePickupUpdate("en_route")} disabled={busy} className="gap-1.5 w-full" data-testid="button-pickup-en-route">
                🚶 {busy ? "Ap voye…" : "Nan Wout — m'ap vini!"}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ── Buyer actions: regular delivery confirm ── */}
      {order.isBuyer && !order.escrowReleased && order.deliveryType !== "pickup" && (
        order.isHaiti
          // Haiti / DR: buyer can confirm from any active status — no need to wait for seller to "ship"
          ? ["pending", "ready_to_ship", "shipped", "delivered"].includes(order.orderStatus)
          // Carrier-tracking countries: order must be shipped first
          : ["shipped", "delivered"].includes(order.orderStatus)
      ) && (
        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4" /> {t("orderDetail.buyerActions")}
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            {(order as any).deliveryMethod === "bus" || (order as any).deliveryMethod === "self_delivery"
              ? "Ou resevwa kòmand ou pa bis/transpò? Klike pou konfime — lajan machann nan ap libere imedyatman."
              : order.isHaiti
              ? t("orderDetail.confirmHaiti")
              : t("orderDetail.confirmNonHaiti")
            }
          </p>
          <Button
            onClick={handleConfirmDelivery}
            disabled={busy}
            className="gap-1.5"
            data-testid="button-confirm-delivery"
          >
            <CheckCircle2 className="h-4 w-4" />
            {busy ? t("orderDetail.processing") : t("orderDetail.confirmReceived")}
          </Button>
          {order.autoReleaseAt && (
            <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1">
              <Clock className="h-3.5 w-3.5 shrink-0" />
              {t("orderDetail.autoReleaseNote").split("{{days}}")[0]}
              <DaysLeft isoDate={order.autoReleaseAt} t={t} />
              {t("orderDetail.autoReleaseNote").split("{{days}}")[1]}
            </p>
          )}
        </div>
      )}

      {/* ── Buyer waiting (not yet shipped) — only for carrier-tracking countries ── */}
      {order.isBuyer && !order.isHaiti && order.orderStatus === "ready_to_ship" && (
        <div className="rounded-2xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground flex items-start gap-2">
          <Clock className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{t("orderDetail.buyerWaiting")}</span>
        </div>
      )}

      {/* ── DEV: Simulate tracking ── */}
      {!order.isHaiti && order.orderStatus === "shipped" && !order.escrowReleased && (
        <div className="rounded-xl border border-dashed border-muted-foreground/30 p-4">
          <button
            onClick={() => setShowSimulate(p => !p)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground font-semibold w-full"
          >
            {showSimulate ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {t("orderDetail.simulateTracking")}
          </button>
          {showSimulate && (
            <div className="flex flex-wrap gap-2 mt-3">
              {["in_transit", "out_for_delivery", "delivered"].map(s => (
                <Button
                  key={s}
                  size="sm"
                  variant="outline"
                  className="text-xs"
                  disabled={busy}
                  onClick={() => handleSimulate(s)}
                  data-testid={`button-simulate-${s}`}
                >
                  → {s.replace(/_/g, " ")}
                </Button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══ Return Request System (non-Haiti / entènasyonal) ══ */}
      {!order.isHaiti && ["completed", "return_refunded"].includes(order.orderStatus) && (() => {
        const releaseDate = (order as any).escrowReleasedAt ?? order.deliveredAt ?? order.buyerConfirmedAt;
        const daysSince = releaseDate ? (Date.now() - new Date(releaseDate).getTime()) / 86400000 : 999;
        const inWindow = daysSince <= 3;
        const daysLeft = Math.max(0, Math.ceil(3 - daysSince));

        return (
          <>
            {/* ── Buyer: open return (no existing return, within window) ── */}
            {order.isBuyer && inWindow && !returnInfo && order.orderStatus === "completed" && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50/60 dark:bg-amber-950/20 dark:border-amber-800 p-5">
                <div className="flex items-start gap-3">
                  <RotateCcw className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-sm text-amber-800 dark:text-amber-300">Politik Retou — 3 jou</h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      Ou gen <strong className="text-amber-700 dark:text-amber-400">{daysLeft} jou</strong> pou mande retou si pwodui a domaje, pa kòm deskripsyon, oswa move atik.
                    </p>
                    <Button size="sm" variant="outline" className="mt-3 h-8 text-xs border-amber-400 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-950/40 gap-1.5" onClick={() => setShowReturnDialog(true)}>
                      <RotateCcw className="h-3 w-3" /> Mande Retou
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* ── Buyer: window expired ── */}
            {order.isBuyer && !inWindow && !returnInfo && order.orderStatus === "completed" && (
              <div className="rounded-xl border border-border bg-muted/30 p-3 text-xs text-muted-foreground flex items-center gap-2">
                <Clock className="h-3.5 w-3.5 shrink-0" /> Delè retou 3 jou ekspire.
              </div>
            )}

            {/* ── Return status card (both parties) ── */}
            {returnInfo && (
              <div className={`rounded-2xl border p-5 space-y-3 ${
                returnInfo.status === "refunded" ? "border-green-400 bg-green-50/60 dark:bg-green-950/20" :
                ["admin_rejected", "seller_rejected"].includes(returnInfo.status) ? "border-red-300 bg-red-50/60 dark:bg-red-950/20" :
                "border-amber-300 bg-amber-50/60 dark:bg-amber-950/20"
              }`}>
                <div className="flex items-center gap-2 flex-wrap">
                  <RotateCcw className="h-4 w-4 text-amber-600 shrink-0" />
                  <span className="font-bold text-sm">Demann Retou</span>
                  <span className={`text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full text-white ${
                    returnInfo.status === "refunded" ? "bg-green-600" :
                    ["admin_rejected"].includes(returnInfo.status) ? "bg-red-600" :
                    ["seller_rejected"].includes(returnInfo.status) ? "bg-orange-600" :
                    returnInfo.status === "buyer_shipped" ? "bg-blue-600" :
                    returnInfo.status === "seller_accepted" ? "bg-teal-600" :
                    "bg-amber-600"
                  }`}>
                    {({
                      requested:       "An atant vandè",
                      seller_accepted: "Aksepte — voye atik",
                      seller_rejected: "Refize pa vandè",
                      buyer_shipped:   "Atik voye tounen",
                      admin_rejected:  "Refize pa admin",
                      refunded:        "Ranbouse",
                    } as Record<string, string>)[returnInfo.status] ?? returnInfo.status}
                  </span>
                </div>

                <div className="text-xs text-muted-foreground space-y-1">
                  <p><strong>Rezon:</strong> {({
                    not_as_described: "Pa kòm deskripsyon",
                    damaged:    "Domaje",
                    wrong_item: "Move atik resevwa",
                    defective:  "Pa fonksyone",
                    not_received: "Pa janm resevwa",
                    changed_mind: "Chanje lide",
                  } as Record<string, string>)[returnInfo.reason] ?? returnInfo.reason}</p>
                  {returnInfo.description && (
                    <p className="border-l-2 border-amber-400 pl-3 text-foreground">{returnInfo.description}</p>
                  )}
                  {returnInfo.seller_note && <p><strong>Nòt vandè:</strong> {returnInfo.seller_note}</p>}
                  {returnInfo.admin_note  && <p><strong>Nòt admin:</strong> {returnInfo.admin_note}</p>}
                  {returnInfo.return_tracking_number && (
                    <p><strong>Tracking retou:</strong> {returnInfo.return_carrier} <span className="font-mono">{returnInfo.return_tracking_number}</span></p>
                  )}
                </div>

                {returnInfo.status === "refunded" && returnInfo.refund_amount && (
                  <div className="space-y-1">
                    <p className="text-base font-black text-green-700 dark:text-green-400">
                      ${parseFloat(returnInfo.refund_amount).toFixed(2)} ranbouse ✅
                    </p>
                    {returnInfo.refund_method === "stripe_card" ? (
                      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                        💳 <span>Lajan ap tounen <strong>sou kat ou</strong> nan <strong>5 jou ouvrab</strong> via Stripe.</span>
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                        💰 <span>Lajan ajoute nan <strong>pòtfèy FM</strong> ou imedyatman.</span>
                      </p>
                    )}
                  </div>
                )}

                {/* Seller: accept/reject */}
                {order.isSeller && returnInfo.status === "requested" && (
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" className="bg-teal-600 hover:bg-teal-700 text-white gap-1.5" disabled={returnBusy} onClick={() => handleSellerRespond("accept")}>
                      <CheckCircle2 className="h-3.5 w-3.5" /> Aksepte
                    </Button>
                    <Button size="sm" variant="outline" className="border-red-300 text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 gap-1.5" disabled={returnBusy} onClick={() => handleSellerRespond("reject")}>
                      <X className="h-3.5 w-3.5" /> Refize
                    </Button>
                  </div>
                )}

                {/* Buyer: mark return shipped */}
                {order.isBuyer && returnInfo.status === "seller_accepted" && (
                  <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5" onClick={() => setShowBuyerShipDialog(true)}>
                    <Truck className="h-3.5 w-3.5" /> Make atik kòm voye tounen
                  </Button>
                )}
              </div>
            )}

            {/* ── Return request dialog ── */}
            {showReturnDialog && (
              <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
                <div className="bg-card rounded-2xl border border-border shadow-xl w-full max-w-md p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-base flex items-center gap-2">
                      <RotateCcw className="h-4 w-4 text-amber-600" /> Mande Retou
                    </h3>
                    <button onClick={() => setShowReturnDialog(false)} className="text-muted-foreground hover:text-foreground">
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                    <p className="text-xs text-amber-800 dark:text-amber-300">
                      Vandè a gen 48 èdtan pou reponn. Si li refize, admin ap revize ka a.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-black uppercase tracking-widest text-muted-foreground block">Rezon Retou *</label>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { v: "not_as_described", l: "Pa kòm deskripsyon" },
                        { v: "damaged",          l: "Pwodui domaje" },
                        { v: "wrong_item",       l: "Move atik resevwa" },
                        { v: "defective",        l: "Pa fonksyone" },
                        { v: "not_received",     l: "Pa janm resevwa" },
                        { v: "changed_mind",     l: "Chanje lide" },
                      ].map(opt => (
                        <button key={opt.v} onClick={() => setReturnReason(opt.v)}
                          className={`text-left px-3 py-2.5 rounded-xl text-xs border-2 font-medium transition-all ${returnReason === opt.v ? "border-amber-500 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300" : "border-border hover:border-amber-300 text-foreground"}`}>
                          {opt.l}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-black uppercase tracking-widest text-muted-foreground block">Deskripsyon *</label>
                    <Textarea value={returnDescription} onChange={e => setReturnDescription(e.target.value)}
                      placeholder="Eksplike pwoblèm nan ak detay (omwen 10 karaktè)…"
                      rows={3} className="text-sm resize-none" />
                  </div>

                  <div className="flex gap-2 pt-1">
                    <Button variant="outline" className="flex-1" onClick={() => setShowReturnDialog(false)}>Anile</Button>
                    <Button className="flex-1 bg-amber-600 hover:bg-amber-700 text-white" disabled={returnBusy || !returnReason} onClick={handleSubmitReturn}>
                      {returnBusy ? "Ap voye…" : "Voye Demann"}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* ── Buyer ship return dialog ── */}
            {showBuyerShipDialog && (
              <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
                <div className="bg-card rounded-2xl border border-border shadow-xl w-full max-w-sm p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-base flex items-center gap-2">
                      <Truck className="h-4 w-4 text-blue-600" /> Konfime Ekspedisyon Retou
                    </h3>
                    <button onClick={() => setShowBuyerShipDialog(false)} className="text-muted-foreground hover:text-foreground">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">Ekri enfòmasyon tracking si ou genyen l (opsyonèl).</p>
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-black uppercase tracking-widest text-muted-foreground block">Transportè</label>
                      <Input value={returnCarrierVal} onChange={e => setReturnCarrierVal(e.target.value)} placeholder="UPS, FedEx, USPS…" className="h-9 text-sm" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-black uppercase tracking-widest text-muted-foreground block">Nimewo Tracking</label>
                      <Input value={returnTrackingNum} onChange={e => setReturnTrackingNum(e.target.value)} placeholder="1Z9999…" className="h-9 text-sm font-mono" />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1" onClick={() => setShowBuyerShipDialog(false)}>Anile</Button>
                    <Button className="flex-1 bg-blue-600 hover:bg-blue-700 text-white" disabled={returnBusy} onClick={handleBuyerShipReturn}>
                      {returnBusy ? "Ap trete…" : "Konfime"}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </>
        );
      })()}

      {/* ── Seller reject order confirmation dialog ── */}
      {showRejectDialog && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
          <div className="bg-card rounded-2xl border border-border shadow-xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base flex items-center gap-2">
                <XCircle className="h-4 w-4 text-red-600" /> Refize Kòmand
              </h3>
              <button onClick={() => setShowRejectDialog(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 p-3 space-y-1.5">
              <p className="text-sm font-bold text-red-800 dark:text-red-300">Ou sèten ou vle refize kòmand sa?</p>
              <ul className="text-xs text-red-700 dark:text-red-400 space-y-1 list-disc list-inside">
                <li>Achtè a pral resevwa ranbousman konplè <span className="font-bold">imedyatman</span></li>
                <li>Pwodwi a pral parèt ankò sou mache a</li>
                <li>Aksyon sa pa ka defèt</li>
              </ul>
            </div>

            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setShowRejectDialog(false)} disabled={rejectBusy}>
                Anile
              </Button>
              <Button
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold"
                disabled={rejectBusy}
                onClick={handleSellerReject}
                data-testid="button-confirm-seller-reject"
              >
                {rejectBusy ? "Ap trete…" : "Wi, Refize"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
