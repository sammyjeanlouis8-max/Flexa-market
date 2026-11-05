import { useEffect, useState } from "react";
import { useRoute, useLocation } from "wouter";
import {
  ChevronLeft, MapPin, Package, Phone, MessageCircle, Truck, Lock, Loader2,
  Navigation, Flag, XCircle, CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/auth";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { DRIVER_BRAND, formatHtg } from "@/lib/driverBrand";

type Job = {
  id: number;
  orderRef: string;
  status: string;
  listingTitle: string | null;
  listingImage: string | null;
  orderAmount: number | null;
  pickupCity: string | null;
  pickupAddress: string | null;
  deliveryCity: string | null;
  deliveryAddress: string | null;
  distanceKm: number | null;
  driverEarnings: number | null;
  driverEarningsHtg: number | null;
  feeLocal: number | null;
  sellerName: string | null;
  sellerPhone: string | null;
  buyerName: string | null;
  buyerPhone: string | null;
  sellerNote: string | null;
  pinRequired: boolean;
  country: string;
};

const NEXT_STATUS: Record<string, string> = {
  driver_assigned: "arrived_pickup",
  arrived_pickup: "picked_up",
  picked_up: "on_the_way",
  on_the_way: "arrived",
};

export default function DriverJobDetail() {
  const [, params] = useRoute("/delivery/job/:id");
  const id = params?.id ? Number(params.id) : NaN;
  const { user, token } = useAuth();
  const [, setLocation] = useLocation();
  const { t } = useTranslation();
  const { toast } = useToast();

  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pin, setPin] = useState("");

  async function load() {
    if (!Number.isFinite(id)) return;
    const res = await fetch(`/api/delivery/${id}/driver-view`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data?.error || t("driverJob.loadError", { defaultValue: "Could not load delivery" }));
      return;
    }
    setJob(data.delivery as Job);
  }

  useEffect(() => {
    if (!user) {
      setLocation("/auth/login");
      return;
    }
    load().catch(() => setError(t("driverJob.loadError", { defaultValue: "Could not load delivery" })));
  }, [user, id, token]);

  async function advance() {
    if (!job) return;
    const next = NEXT_STATUS[job.status];
    if (!next) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/delivery/${job.id}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ title: data?.error || "Error", variant: "destructive" });
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function verifyPin() {
    if (!job || pin.trim().length < 4) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/delivery/${job.id}/verify-code`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ code: pin.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({
          title: data?.error || t("driverJob.invalidPin", { defaultValue: "Invalid PIN" }),
          variant: "destructive",
        });
        return;
      }
      toast({
        title: t("driverJob.delivered", { defaultValue: "Delivery confirmed" }),
      });
      setLocation("/driver/dashboard");
    } finally {
      setBusy(false);
    }
  }

  async function cancelJob() {
    if (!job) return;
    if (!confirm(t("driverJob.confirmCancel", { defaultValue: "Cancel this delivery and return it to the pool?" }))) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/delivery/${job.id}/driver-cancel`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ title: data?.error || "Error", variant: "destructive" });
        return;
      }
      setLocation("/delivery/deliveries");
    } finally {
      setBusy(false);
    }
  }

  if (!user) return null;
  if (error) {
    return (
      <div className="max-w-lg mx-auto px-4 py-12 text-center space-y-3">
        <p className="text-destructive font-semibold">{error}</p>
        <Button variant="outline" onClick={() => setLocation("/delivery/deliveries")}>
          {t("driverJob.back", { defaultValue: "Back" })}
        </Button>
      </div>
    );
  }
  if (!job) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: DRIVER_BRAND.success }} />
      </div>
    );
  }

  const feeHtg =
    job.driverEarningsHtg ??
    (job.feeLocal != null ? Math.round(job.feeLocal * 0.8) : null);
  const mapsPickup = encodeURIComponent([job.pickupAddress, job.pickupCity].filter(Boolean).join(", "));
  const mapsDrop = encodeURIComponent([job.deliveryAddress, job.deliveryCity].filter(Boolean).join(", "));
  const canStart = ["driver_assigned", "arrived_pickup"].includes(job.status);
  const nextLabel =
    job.status === "driver_assigned"
      ? t("driverJob.startDelivery", { defaultValue: "Start delivery" })
      : job.status === "arrived_pickup"
        ? t("driverJob.confirmPickup", { defaultValue: "Confirm pickup" })
        : job.status === "picked_up"
          ? t("driverJob.onTheWay", { defaultValue: "Mark on the way" })
          : job.status === "on_the_way"
            ? t("driverJob.arrivedCustomer", { defaultValue: "Arrived at customer" })
            : null;

  return (
    <div className="max-w-lg mx-auto px-4 py-5 pb-28 space-y-4" data-testid="driver-job-detail">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" className="-ml-2" onClick={() => setLocation("/delivery/deliveries")}>
          <ChevronLeft className="h-4 w-4 mr-1" />
          {t("driverJob.back", { defaultValue: "Back" })}
        </Button>
        <h1 className="text-sm font-bold">
          {t("driverJob.title", { defaultValue: "Delivery details" })}
        </h1>
        <span className="w-14" />
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 space-y-3 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-sm font-bold">{job.orderRef}</span>
          <span
            className="text-[11px] font-bold px-2.5 py-1 rounded-full"
            style={{ background: "hsla(210,90%,94%,1)", color: "hsl(210,70%,40%)" }}
          >
            {job.status === "driver_assigned"
              ? t("driverJob.statusAccepted", { defaultValue: "Accepted" })
              : job.status}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {job.listingImage ? (
            <img src={job.listingImage} alt="" className="h-16 w-16 rounded-xl object-cover border border-border" />
          ) : (
            <div className="h-16 w-16 rounded-xl bg-muted flex items-center justify-center">
              <Package className="h-6 w-6 text-muted-foreground" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="font-bold text-sm truncate">{job.listingTitle || t("driverJob.package", { defaultValue: "Package" })}</p>
            {job.orderAmount != null && (
              <p className="text-xs text-muted-foreground mt-0.5">${Number(job.orderAmount).toFixed(2)}</p>
            )}
          </div>
        </div>
      </div>

      {/* Route */}
      <div className="rounded-2xl border border-border bg-card p-4 space-y-4">
        <div className="flex gap-3">
          <div className="flex flex-col items-center">
            <span className="h-8 w-8 rounded-full flex items-center justify-center text-white" style={{ background: DRIVER_BRAND.success }}>
              <Package className="h-4 w-4" />
            </span>
            <span className="w-0.5 flex-1 my-1" style={{ background: DRIVER_BRAND.softBorder }} />
            <span className="h-8 w-8 rounded-full flex items-center justify-center bg-red-500 text-white">
              <MapPin className="h-4 w-4" />
            </span>
          </div>
          <div className="flex-1 space-y-4 min-w-0">
            <div>
              <p className="text-xs font-bold text-muted-foreground uppercase">
                {t("driverJob.pickup", { defaultValue: "Pickup" })}
              </p>
              <p className="font-bold text-sm">{job.pickupCity || "—"}</p>
              <p className="text-xs text-muted-foreground truncate">{job.pickupAddress}</p>
            </div>
            <div>
              <p className="text-xs font-bold text-muted-foreground uppercase">
                {t("driverJob.dropoff", { defaultValue: "Deliver to customer" })}
              </p>
              <p className="font-bold text-sm">{job.deliveryCity || "—"}</p>
              <p className="text-xs text-muted-foreground truncate">{job.deliveryAddress}</p>
            </div>
          </div>
        </div>
        {job.distanceKm != null && (
          <p className="text-xs text-muted-foreground">
            {t("driverJob.distance", { km: job.distanceKm.toFixed(1), defaultValue: `${job.distanceKm.toFixed(1)} km` })}
          </p>
        )}
      </div>

      <div className="rounded-2xl border p-4 flex items-center justify-between" style={{ background: DRIVER_BRAND.soft, borderColor: DRIVER_BRAND.softBorder }}>
        <span className="text-sm font-semibold">
          {t("driverJob.feeForYou", { defaultValue: "Delivery fee for you" })}
        </span>
        <span className="text-lg font-black" style={{ color: DRIVER_BRAND.success }}>
          {formatHtg(feeHtg)}
        </span>
      </div>

      {job.pinRequired && (
        <div className="rounded-xl px-4 py-3 flex gap-2 text-sm" style={{ background: DRIVER_BRAND.soft }}>
          <Lock className="h-4 w-4 mt-0.5 shrink-0" style={{ color: DRIVER_BRAND.success }} />
          <p>
            {t("driverJob.pinHint", {
              defaultValue:
                "Hand the package to the customer, then enter their delivery PIN to confirm. No doorstep photo is required for Haiti deliveries.",
            })}
          </p>
        </div>
      )}

      {job.sellerNote && (
        <div className="rounded-xl border border-border bg-card p-3 text-sm">
          <p className="text-xs font-bold text-muted-foreground uppercase mb-1">
            {t("driverJob.instructions", { defaultValue: "Instructions" })}
          </p>
          <p>{job.sellerNote}</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <a
          className="h-11 rounded-xl border-2 font-bold text-sm flex items-center justify-center gap-1.5"
          style={{ borderColor: DRIVER_BRAND.success, color: DRIVER_BRAND.success }}
          href={job.buyerPhone ? `tel:${job.buyerPhone}` : undefined}
          onClick={(e) => { if (!job.buyerPhone) e.preventDefault(); }}
        >
          <Phone className="h-4 w-4" />
          {t("driverJob.callCustomer", { defaultValue: "Call customer" })}
        </a>
        <Button
          variant="outline"
          className="h-11 rounded-xl border-2 font-bold"
          style={{ borderColor: DRIVER_BRAND.success, color: DRIVER_BRAND.success }}
          onClick={() => setLocation("/messages")}
        >
          <MessageCircle className="h-4 w-4 mr-1.5" />
          {t("driverJob.messageCustomer", { defaultValue: "Message customer" })}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <a
          className="h-10 rounded-xl border font-semibold text-xs flex items-center justify-center gap-1"
          href={`https://www.google.com/maps/dir/?api=1&destination=${mapsPickup}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Navigation className="h-3.5 w-3.5" />
          {t("driverJob.navPickup", { defaultValue: "Navigate pickup" })}
        </a>
        <a
          className="h-10 rounded-xl border font-semibold text-xs flex items-center justify-center gap-1"
          href={`https://www.google.com/maps/dir/?api=1&destination=${mapsDrop}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Navigation className="h-3.5 w-3.5" />
          {t("driverJob.navDropoff", { defaultValue: "Navigate dropoff" })}
        </a>
      </div>

      {job.sellerPhone && (
        <a href={`tel:${job.sellerPhone}`} className="text-sm font-semibold underline block text-center" style={{ color: DRIVER_BRAND.success }}>
          {t("driverJob.contactSeller", { defaultValue: "Contact seller" })} · {job.sellerName || job.sellerPhone}
        </a>
      )}

      {NEXT_STATUS[job.status] && (
        <Button
          className="w-full h-12 text-base font-bold rounded-xl text-white"
          style={{ background: DRIVER_BRAND.primary }}
          disabled={busy}
          onClick={advance}
          data-testid="advance-delivery"
        >
          {busy ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : canStart ? <Truck className="h-5 w-5 mr-2" /> : <CheckCircle2 className="h-5 w-5 mr-2" />}
          {nextLabel}
        </Button>
      )}

      {job.status === "arrived" && (
        <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
          <p className="text-sm font-bold">
            {t("driverJob.enterPin", { defaultValue: "Enter customer delivery PIN" })}
          </p>
          <Input
            inputMode="numeric"
            maxLength={8}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            placeholder="••••••"
            className="h-12 text-center text-xl tracking-[0.4em] font-mono"
            data-testid="delivery-pin-input"
          />
          <Button
            className="w-full h-12 font-bold rounded-xl text-white"
            style={{ background: DRIVER_BRAND.primary }}
            disabled={busy || pin.length < 4}
            onClick={verifyPin}
          >
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : t("driverJob.confirmWithPin", { defaultValue: "Confirm delivery" })}
          </Button>
        </div>
      )}

      <Button
        variant="outline"
        className="w-full h-11 font-bold rounded-xl border-2"
        style={{ borderColor: DRIVER_BRAND.danger, color: DRIVER_BRAND.danger }}
        disabled={busy || job.status === "delivered"}
        onClick={cancelJob}
      >
        <XCircle className="h-4 w-4 mr-2" />
        {t("driverJob.cancelDelivery", { defaultValue: "Cancel delivery" })}
      </Button>

      <Button
        variant="ghost"
        className="w-full font-semibold"
        onClick={() => setLocation(`/support?topic=delivery&deliveryId=${job.id}`)}
      >
        <Flag className="h-4 w-4 mr-2" />
        {t("driverJob.reportProblem", { defaultValue: "Report a problem" })}
      </Button>
    </div>
  );
}
