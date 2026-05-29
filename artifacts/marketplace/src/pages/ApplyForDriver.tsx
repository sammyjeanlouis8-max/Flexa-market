import React, { useState, useEffect, useRef, useId } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth";
import { useToast } from "@/hooks/use-toast";
import {
  ChevronLeft, CheckCircle, Loader2, Eye, EyeOff,
  Copy, Check, Truck, MapPin, Shield, Camera,
  FileText, Clock, AlertCircle, RefreshCw,
  CameraOff, Zap, X, QrCode,
} from "lucide-react";
import { cn } from "@/lib/utils";
import QRCode from "qrcode";

// ─── Constants ────────────────────────────────────────────────────────────────

const DELIVERY_COUNTRIES = ["Haiti", "Dominican Republic"];

const HAITI_CITIES = [
  "Port-au-Prince","Delmas","Pétion-Ville","Tabarre","Carrefour",
  "Cité Soleil","Croix-des-Bouquets","Kenscoff","Jacmel","Cap-Haïtien",
  "Gonaïves","Saint-Marc","Les Cayes","Miragoâne","Jérémie",
];
const DR_CITIES = [
  "Santo Domingo","Santiago","La Romana","San Pedro de Macorís",
  "Puerto Plata","La Vega","Higüey","Moca","Bonao",
];

const WORK_ZONES_HAITI = [
  "Port-au-Prince","Delmas","Pétion-Ville","Carrefour",
  "Cité Soleil","Tabarre","Croix-des-Bouquets","Kenscoff",
];
const WORK_ZONES_DR = [
  "Santo Domingo","Santiago","La Romana","San Pedro de Macorís","Puerto Plata",
];

const WORK_HOUR_SLOTS = [
  { id: "6am-12pm",  label: "6AM – 12PM" },
  { id: "12pm-6pm",  label: "12PM – 6PM" },
  { id: "6pm-12am",  label: "6PM – 12AM" },
  { id: "12am-6am",  label: "Nwit (12AM – 6AM)" },
  { id: "all",        label: "Sou tout orè yo" },
];

const VEHICLE_TYPES = [
  { id: "moto",   label: "Moto",   emoji: "🏍️", backend: "moto" },
  { id: "machin", label: "Machin", emoji: "🚗", backend: "car" },
  { id: "biyik",  label: "Biyik",  emoji: "🚲", backend: "bicycle" },
  { id: "kamyon", label: "Kamyon", emoji: "🚛", backend: "truck" },
];

// ─── Vehicle-specific document config ────────────────────────────────────────
// All labels, instructions and icons adapt to the selected vehicle type so the
// form feels personalised — like Uber/Lyft professional onboarding.

interface VehicleDocConfig {
  emoji: string;
  vehicleImage?: string;
  // Step 2A
  infoTitle: string;
  infoSubtitle: string;
  // Step 2B (photos)
  photoTitle: string;
  photoSubtitle: string;
  photoTip: string;
  photoFrontLabel: string;
  // Step 2C (documents)
  docTitle: string;
  docSubtitle: string;
  registrationLabel: string;
  registrationInstruction: string;
  registrationOptional: boolean;
  // Progress bar label overrides
  stepLabelInfo: string;
  stepLabelPhoto: string;
}

function buildVehicleDocConfig(t: (k: string) => string): Record<string, VehicleDocConfig> {
  return {
    moto: {
      emoji: "🏍️",
      vehicleImage: "/delivery-moto.png",
      infoTitle: t("driverApply.vcfgMotoInfoTitle"),
      infoSubtitle: t("driverApply.vcfgMotoInfoSubtitle"),
      photoTitle: t("driverApply.vcfgMotoPhotoTitle"),
      photoSubtitle: t("driverApply.vcfgMotoPhotoSubtitle"),
      photoTip: t("driverApply.vcfgMotoPhotoTip"),
      photoFrontLabel: t("driverApply.vcfgMotoPhotoFront"),
      docTitle: t("driverApply.vcfgMotoDocTitle"),
      docSubtitle: t("driverApply.vcfgMotoDocSubtitle"),
      registrationLabel: t("driverApply.vcfgMotoRegLabel"),
      registrationInstruction: t("driverApply.vcfgMotoRegInstruction"),
      registrationOptional: false,
      stepLabelInfo: t("driverApply.vcfgMotoStepInfo"),
      stepLabelPhoto: t("driverApply.vcfgMotoStepPhoto"),
    },
    machin: {
      emoji: "🚗",
      vehicleImage: "/delivery-car.png",
      infoTitle: t("driverApply.vcfgMachinInfoTitle"),
      infoSubtitle: t("driverApply.vcfgMachinInfoSubtitle"),
      photoTitle: t("driverApply.vcfgMachinPhotoTitle"),
      photoSubtitle: t("driverApply.vcfgMachinPhotoSubtitle"),
      photoTip: t("driverApply.vcfgMachinPhotoTip"),
      photoFrontLabel: t("driverApply.vcfgMachinPhotoFront"),
      docTitle: t("driverApply.vcfgMachinDocTitle"),
      docSubtitle: t("driverApply.vcfgMachinDocSubtitle"),
      registrationLabel: t("driverApply.vcfgMachinRegLabel"),
      registrationInstruction: t("driverApply.vcfgMachinRegInstruction"),
      registrationOptional: false,
      stepLabelInfo: t("driverApply.vcfgMachinStepInfo"),
      stepLabelPhoto: t("driverApply.vcfgMachinStepPhoto"),
    },
    biyik: {
      emoji: "🚲",
      infoTitle: t("driverApply.vcfgBiyikInfoTitle"),
      infoSubtitle: t("driverApply.vcfgBiyikInfoSubtitle"),
      photoTitle: t("driverApply.vcfgBiyikPhotoTitle"),
      photoSubtitle: t("driverApply.vcfgBiyikPhotoSubtitle"),
      photoTip: t("driverApply.vcfgBiyikPhotoTip"),
      photoFrontLabel: t("driverApply.vcfgBiyikPhotoFront"),
      docTitle: t("driverApply.vcfgBiyikDocTitle"),
      docSubtitle: t("driverApply.vcfgBiyikDocSubtitle"),
      registrationLabel: t("driverApply.vcfgBiyikRegLabel"),
      registrationInstruction: t("driverApply.vcfgBiyikRegInstruction"),
      registrationOptional: true,
      stepLabelInfo: t("driverApply.vcfgBiyikStepInfo"),
      stepLabelPhoto: t("driverApply.vcfgBiyikStepPhoto"),
    },
    kamyon: {
      emoji: "🚛",
      infoTitle: t("driverApply.vcfgKamyonInfoTitle"),
      infoSubtitle: t("driverApply.vcfgKamyonInfoSubtitle"),
      photoTitle: t("driverApply.vcfgKamyonPhotoTitle"),
      photoSubtitle: t("driverApply.vcfgKamyonPhotoSubtitle"),
      photoTip: t("driverApply.vcfgKamyonPhotoTip"),
      photoFrontLabel: t("driverApply.vcfgKamyonPhotoFront"),
      docTitle: t("driverApply.vcfgKamyonDocTitle"),
      docSubtitle: t("driverApply.vcfgKamyonDocSubtitle"),
      registrationLabel: t("driverApply.vcfgKamyonRegLabel"),
      registrationInstruction: t("driverApply.vcfgKamyonRegInstruction"),
      registrationOptional: false,
      stepLabelInfo: t("driverApply.vcfgKamyonStepInfo"),
      stepLabelPhoto: t("driverApply.vcfgKamyonStepPhoto"),
    },
  };
}

function getVehicleConfig(vehicleType: string, t: (k: string) => string): VehicleDocConfig {
  const cfg = buildVehicleDocConfig(t);
  return cfg[vehicleType] ?? cfg.moto;
}

const PAYMENT_METHODS = [
  { id: "fm_wallet", label: "Kat FM",  bgClass: "bg-orange-500", emoji: "💳" },
  { id: "stripe",    label: "Stripe",  bgClass: "bg-indigo-600", emoji: "💠" },
];

// ─── Types ────────────────────────────────────────────────────────────────────

type Step = "landing" | "s1" | "s2a" | "s2b" | "s2c" | "selfie" | "s3" | "s4" | "s5";

interface FormData {
  fullName: string; phone: string; email: string;
  country: string; city: string;
  vehicleType: string; vehicleBrand: string; vehicleModel: string;
  vehicleYear: string; vehicleColor: string; licensePlate: string; insuranceNumber: string;
  photoFront: string; photoSide: string; photoBack: string;
  photoPermis: string; photoIdCard: string; photoSelfieDoc: string; photoVehicleCard: string;
  selfiePhotoUrl: string;
  bankName: string; bankAccountName: string; bankAccountNumber: string; paymentMethod: string;
  workZones: string[]; maxDistance: number; workHours: string[];
  agreeTos1: boolean; agreeTos2: boolean;
}

const INIT: FormData = {
  fullName: "", phone: "", email: "", country: "Haiti", city: "",
  vehicleType: "", vehicleBrand: "", vehicleModel: "", vehicleYear: "",
  vehicleColor: "", licensePlate: "", insuranceNumber: "",
  photoFront: "", photoSide: "", photoBack: "",
  photoPermis: "", photoIdCard: "", photoSelfieDoc: "", photoVehicleCard: "",
  selfiePhotoUrl: "",
  bankName: "", bankAccountName: "", bankAccountNumber: "", paymentMethod: "",
  workZones: [], maxDistance: 10, workHours: [],
  agreeTos1: false, agreeTos2: false,
};

// ─── Primitive UI ─────────────────────────────────────────────────────────────

function BluePrimaryBtn({ children, onClick, disabled, loading, className = "" }: {
  children: React.ReactNode; onClick?: () => void; disabled?: boolean; loading?: boolean; className?: string;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled || loading}
      className={cn(
        "w-full h-14 rounded-2xl font-bold text-base text-white transition-all",
        "bg-blue-600 hover:bg-blue-700 active:scale-[0.98] shadow-lg shadow-blue-500/20",
        "disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2",
        className,
      )}>
      {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : children}
    </button>
  );
}

function InputField({ label, value, onChange, placeholder, type = "text", optional = false, optionalLabel, prefix }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
  type?: string; optional?: boolean; optionalLabel?: string; prefix?: React.ReactNode;
}) {
  const [showPw, setShowPw] = useState(false);
  const isPw = type === "password";
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-semibold text-gray-700">
        {label} {optional && <span className="text-xs font-normal text-gray-400">{optionalLabel ?? "(opsyonèl)"}</span>}
      </label>
      <div className="relative flex items-center">
        {prefix && (
          <div className="absolute left-3 flex items-center gap-1 text-sm text-gray-500 pointer-events-none select-none">{prefix}</div>
        )}
        <input
          type={isPw ? (showPw ? "text" : "password") : type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className={cn(
            "w-full h-12 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-900",
            "focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 focus:bg-white",
            "placeholder:text-gray-400 transition-all",
            prefix ? "pl-24" : "pl-4",
            isPw ? "pr-11" : "pr-4",
          )}
        />
        {isPw && (
          <button type="button" onClick={() => setShowPw(v => !v)}
            className="absolute right-3 text-gray-400 hover:text-gray-600">
            {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        )}
      </div>
    </div>
  );
}

function SelectField({ label, value, onChange, options, optional = false, optionalLabel, choosePlaceholder }: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[]; optional?: boolean; optionalLabel?: string; choosePlaceholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-semibold text-gray-700">
        {label} {optional && <span className="text-xs font-normal text-gray-400">{optionalLabel ?? "(opsyonèl)"}</span>}
      </label>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="w-full h-12 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-900 px-4
          focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 focus:bg-white
          transition-all appearance-none cursor-pointer">
        <option value="">{choosePlaceholder ?? "Chwazi..."}</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

// ─── Progress Header ──────────────────────────────────────────────────────────

const STEP_META_BASE: Partial<Record<Step, { num: number }>> = {
  s1:  { num: 1 },
  s2a: { num: 2 },
  s2b: { num: 2 },
  s2c: { num: 2 },
  s3:  { num: 3 },
  s4:  { num: 4 },
  s5:  { num: 5 },
};

function getStepLabel(step: Step, vehicleType: string, t: (k: string) => string): string {
  if (step === "s2a") return getVehicleConfig(vehicleType, t).stepLabelInfo;
  if (step === "s2b") return getVehicleConfig(vehicleType, t).stepLabelPhoto;
  const staticLabels: Partial<Record<Step, string>> = {
    s1:  t("driverApply.step1"),
    s2c: t("driverApply.step2c"),
    s3:  t("driverApply.step3"),
    s4:  t("driverApply.step4"),
    s5:  t("driverApply.step5"),
  };
  return staticLabels[step] ?? "";
}

function ProgressHeader({ step, onBack, vehicleType }: { step: Step; onBack: () => void; vehicleType: string }) {
  const { t } = useTranslation();
  const meta = STEP_META_BASE[step];
  if (!meta) return null;
  const label = getStepLabel(step, vehicleType, t);
  const vcfg  = vehicleType ? getVehicleConfig(vehicleType, t) : null;

  return (
    <div className="sticky top-0 z-10 bg-white border-b border-gray-100 shadow-sm">
      <div className="h-1 bg-gray-100">
        <div className="h-full bg-blue-600 transition-all duration-500" style={{ width: `${(meta.num / 5) * 100}%` }} />
      </div>
      <div className="flex items-center gap-3 px-4 py-3">
        <button type="button" onClick={onBack}
          className="p-2 rounded-xl hover:bg-gray-100 transition-colors text-gray-500">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-xs font-black text-blue-600">{meta.num}/5</span>
            {/* Show vehicle emoji badge for step 2 sub-screens when type is known */}
            {vcfg && (step === "s2a" || step === "s2b" || step === "s2c") && (
              vcfg.vehicleImage
                ? <img src={vcfg.vehicleImage} alt="" className="h-5 w-7 object-contain" />
                : <span className="text-sm leading-none">{vcfg.emoji}</span>
            )}
            <span className="text-xs font-semibold text-gray-600">{label}</span>
          </div>
          <div className="flex gap-1">
            {[1,2,3,4,5].map(i => (
              <div key={i} className={cn("h-1.5 rounded-full flex-1 transition-all duration-300",
                i < meta.num ? "bg-blue-600" : i === meta.num ? "bg-blue-400" : "bg-gray-200")} />
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-7 h-7 rounded-lg bg-orange-500 flex items-center justify-center">
            <Truck className="h-4 w-4 text-white" />
          </div>
          <span className="text-[10px] font-black text-gray-700 leading-tight">FLEXA<br/>MARKET</span>
        </div>
      </div>
    </div>
  );
}

// ─── Vehicle Photo Card ───────────────────────────────────────────────────────
// Camera-only upload — capture="environment" forces the device camera.
// Gallery access is intentionally disabled for fraud protection.
// After upload, Claude Vision verifies the photo shows the correct vehicle type.

type VerifyState = "idle" | "verifying" | "ok" | "rejected";

function VehiclePhotoCard({ label, url, onUpload, token, vehicleType }: {
  label: string; url: string; onUpload: (u: string) => void; token: string; vehicleType: string;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [verifyState, setVerifyState] = useState<VerifyState>("idle");
  const [rejectReason, setRejectReason] = useState("");

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setUploading(true);
    setVerifyState("idle");
    setRejectReason("");
    try {
      // 1. Upload the file
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd });
      const data = await res.json();
      if (!data.url) {
        toast({ title: t("driverApply.uploadFailed", "Erè upload"), description: data.error ?? t("driverApply.uploadFailedDesc", "Reasèye ankò"), variant: "destructive" });
        return;
      }

      // 2. Show in UI immediately while AI verifies
      onUpload(data.url);
      setUploading(false);
      setVerifyState("verifying");

      // 3. Ask AI to verify the vehicle photo
      const vRes = await fetch("/api/driver/verify-vehicle-photo", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ imageUrl: data.url, vehicleType }),
      });
      const vData = await vRes.json();

      if (!vData.valid) {
        // Clear the photo and show the rejection reason
        onUpload("");
        setVerifyState("rejected");
        setRejectReason(vData.reason ?? t("driverApply.photoVerifyFail", "Foto rejte — voye yon foto reyèl veyikil ou a."));
      } else {
        setVerifyState("ok");
      }
    } catch {
      toast({ title: t("driverApply.uploadFailed", "Erè upload"), description: t("driverApply.uploadFailedDesc", "Koneksyon echwe — reasèye"), variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const resetCard = () => {
    onUpload("");
    setVerifyState("idle");
    setRejectReason("");
  };

  const openCamera = () => setTimeout(() => cameraInputRef.current?.click(), 80);

  return (
    <div className="space-y-0">
      {/* ── Card shell ── */}
      <div className={cn(
        "relative w-full rounded-3xl overflow-hidden transition-all",
        verifyState === "rejected"
          ? "h-52 ring-2 ring-red-400/60"
          : url
          ? "h-56"
          : "h-52 ring-1 ring-slate-200 dark:ring-slate-700"
      )}>

        {/* ── Uploading ── */}
        {uploading && (
          <div className="flex flex-col items-center justify-center h-full gap-3 bg-slate-950">
            <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center">
              <Loader2 className="h-6 w-6 text-white/70 animate-spin" />
            </div>
            <span className="text-xs font-medium text-white/50 tracking-wide uppercase">
              {t("driverApply.newFormPhotoUploading", "Ap telechaje…")}
            </span>
          </div>
        )}

        {/* ── Photo preview ── */}
        {!uploading && url && (
          <>
            <img src={url} alt={label} className="w-full h-full object-cover" />
            {/* Subtle vignette */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-black/10 pointer-events-none" />
            {/* Close */}
            <button type="button" onClick={resetCard}
              className="absolute top-3 right-3 w-9 h-9 rounded-2xl bg-black/40 backdrop-blur-md text-white flex items-center justify-center active:scale-90 transition-transform z-10 border border-white/10">
              <X className="h-4 w-4" />
            </button>
            {/* Status pill */}
            {verifyState === "verifying" && (
              <div className="absolute bottom-4 left-4 bg-blue-500/90 backdrop-blur-md text-white text-[11px] font-bold px-3 py-1.5 rounded-full flex items-center gap-1.5 shadow-lg">
                <Loader2 className="h-3 w-3 animate-spin" /> {t("driverApply.photoVerifying", "AI ap verifye…")}
              </div>
            )}
            {(verifyState === "ok" || verifyState === "idle") && (
              <div className="absolute bottom-4 left-4 bg-emerald-500/90 backdrop-blur-md text-white text-[11px] font-bold px-3 py-1.5 rounded-full flex items-center gap-1.5 shadow-lg">
                <Check className="h-3 w-3" /> {t("driverApply.photoVerifyOk", "Verifye")}
              </div>
            )}
          </>
        )}

        {/* ── Rejected ── */}
        {!uploading && !url && verifyState === "rejected" && (
          <div className="flex flex-col items-center justify-center h-full gap-4 bg-slate-950 px-6">
            <div className="w-12 h-12 rounded-2xl bg-red-500/20 border border-red-400/30 flex items-center justify-center">
              <CameraOff className="h-5 w-5 text-red-400" />
            </div>
            <p className="text-[12px] font-semibold text-red-400 text-center leading-relaxed max-w-[220px]">
              {rejectReason}
            </p>
            <button type="button" onClick={openCamera}
              className="w-full max-w-xs h-11 rounded-2xl bg-white text-slate-900 font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.96] transition-transform">
              <Camera className="h-4 w-4" />
              <span>{t("driverApply.photoPickerCamera", "Kamera")}</span>
            </button>
          </div>
        )}

        {/* ── Empty (idle) — camera only ── */}
        {!uploading && !url && verifyState !== "rejected" && (
          <button
            type="button"
            onClick={openCamera}
            className="flex h-full w-full bg-slate-950 flex-col items-center justify-center gap-3 active:bg-white/5 transition-colors group relative overflow-hidden"
          >
            {/* Subtle top accent line */}
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-primary to-transparent opacity-60" />
            <div className="w-14 h-14 rounded-2xl bg-primary/20 border border-primary/30 flex items-center justify-center group-active:scale-95 transition-transform">
              <Camera className="h-7 w-7 text-primary" />
            </div>
            <div className="text-center">
              <p className="text-[13px] font-bold text-white/90">{t("driverApply.photoPickerCamera", "Kamera")}</p>
              <p className="text-[10px] text-white/35 mt-0.5">Pran foto</p>
            </div>
            {/* Label overlay at bottom */}
            <div className="absolute bottom-0 inset-x-0 py-2 flex justify-center pointer-events-none">
              <span className="text-[10px] text-white/25 font-medium">{label}</span>
            </div>
          </button>
        )}
      </div>

      {/* Hidden inputs */}
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={handleFile}
        style={{ position: "fixed", top: -9999, left: -9999, opacity: 0, pointerEvents: "none" }} />
    </div>
  );
}

// ─── Doc Upload Row ───────────────────────────────────────────────────────────

function DocUploadRow({ label, url, onUpload, token }: {
  label: string; url: string; onUpload: (u: string) => void; token: string;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [fileName, setFileName] = useState("");

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setFileName(file.name);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd });
      const data = await res.json();
      if (data.url) {
        onUpload(data.url);
      } else {
        setFileName("");
        toast({ title: t("driverApply.uploadFailed", "Erè upload"), description: data.error ?? t("driverApply.uploadFailedDesc", "Reasèye ankò"), variant: "destructive" });
      }
    } catch {
      setFileName("");
      toast({ title: t("driverApply.uploadFailed", "Erè upload"), description: t("driverApply.uploadFailedDesc", "Koneksyon echwe — reasèye"), variant: "destructive" });
    } finally { setUploading(false); }
  };

  return (
    <div className="flex items-center gap-3 p-3.5 bg-gray-50 rounded-2xl border border-gray-100">
      <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors",
        url ? "bg-green-100" : "bg-white border-2 border-dashed border-gray-200")}>
        <FileText className={cn("h-5 w-5", url ? "text-green-600" : "text-gray-400")} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-800">{label}</p>
        {url && fileName && <p className="text-[11px] text-gray-500 truncate">{fileName}</p>}
      </div>
      {uploading ? (
        <Loader2 className="h-4 w-4 animate-spin text-blue-500 shrink-0" />
      ) : url ? (
        <div className="flex items-center gap-2 shrink-0">
          <span className="flex items-center gap-1 text-[11px] font-bold text-green-600 bg-green-100 px-2.5 py-1 rounded-full">
            <Check className="h-3 w-3" /> {t("driverApply.newFormPhotoValidated")}
          </span>
          <button type="button"
            onClick={() => { onUpload(""); setFileName(""); if (inputRef.current) inputRef.current.value = ""; inputRef.current?.click(); }}
            className="text-[11px] text-gray-400 hover:text-gray-600">
            {t("driverApply.newFormPhotoChange")}
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => inputRef.current?.click()}
          className="shrink-0 text-sm font-bold text-blue-600 hover:text-blue-700 px-3 py-1.5 rounded-xl border-2 border-blue-200 hover:bg-blue-50 transition-colors">
          {t("driverApply.newFormPhotoUploadBtn")}
        </button>
      )}
      <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
    </div>
  );
}

// ─── Landing Screen ───────────────────────────────────────────────────────────

function LandingScreen({ onStart }: { onStart: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen bg-[#0d1b2a] flex flex-col">
      {/* ── Content — no centering, flows naturally top→bottom ── */}
      <div className="flex flex-col items-center px-6 pt-10 pb-0">
        {/* Logo */}
        <div className="flex items-center gap-2 mb-6">
          <div className="w-8 h-8 rounded-lg bg-orange-500 flex items-center justify-center">
            <Truck className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="text-white font-bold text-xs tracking-widest leading-none uppercase">FLEXA MARKET</p>
            <p className="text-orange-400 text-[10px] font-semibold tracking-[0.2em] mt-0.5">DELIVERY</p>
          </div>
        </div>

        {/* Hero image */}
        <div className="relative mb-6">
          <div className="w-60 h-44 rounded-2xl bg-gradient-to-br from-[#1a3a5c] to-[#0d2640] flex items-center justify-center overflow-hidden">
            <img src="/delivery-moto.png" alt="Delivery motorcycle" className="w-full h-full object-cover object-center" />
          </div>
          <div className="absolute -top-2.5 -right-2.5 w-10 h-10 rounded-full bg-orange-500 flex items-center justify-center shadow-md">
            <span className="text-lg">📦</span>
          </div>
          <div className="absolute -bottom-2.5 -left-2.5 w-8 h-8 rounded-full bg-[#1a3a5c] flex items-center justify-center border-2 border-[#0d1b2a]">
            <MapPin className="h-3.5 w-3.5 text-blue-400" />
          </div>
        </div>

        {/* Title + subtitle */}
        <h1 className="text-2xl font-bold text-white text-center leading-snug mb-2">
          {t("driverApply.landingTitle")}
        </h1>
        <p className="text-gray-500 text-center text-xs leading-relaxed max-w-xs">
          {t("driverApply.landingSubtitle")}
        </p>

        {/* Earning badge */}
        <div className="flex items-center gap-2 mt-4 mb-6 bg-white/5 rounded-full px-4 py-2 border border-white/8">
          <span className="text-yellow-400 text-sm">⭐</span>
          <span className="text-gray-300 text-xs font-medium">{t("driverApply.landingEarning")}</span>
        </div>

        {/* CTA button — immediately under badge, no gap */}
        <button type="button" onClick={onStart}
          className="w-full h-12 rounded-xl bg-orange-500 hover:bg-orange-400 active:scale-[0.98] text-white font-semibold text-sm
            transition-all flex items-center justify-center gap-2">
          <Truck className="h-4 w-4" />
          {t("driverApply.landingStart")}
        </button>
        <p className="text-center text-xs text-gray-600 mt-3 mb-6">
          {t("driverApply.landingAlreadyAccount")} <span className="text-orange-400 font-medium">{t("driverApply.landingLogin")}</span>
        </p>
      </div>

      {/* ── Stats bar — sticks below content ── */}
      <div className="border-t border-[#1a3a5c] bg-[#0a1520] mt-auto">
        <div className="flex overflow-x-auto gap-6 px-6 py-4 no-scrollbar">
          {[
            { icon: "🛡️", label: t("driverApply.landingBadge1") },
            { icon: "🤳", label: t("driverApply.landingBadge2") },
            { icon: "🤖", label: t("driverApply.landingBadge3") },
            { icon: "💬", label: t("driverApply.landingBadge4") },
          ].map((b, i) => (
            <div key={i} className="flex items-center gap-2 shrink-0">
              <span className="text-xl">{b.icon}</span>
              <span className="text-xs font-semibold text-gray-400 whitespace-nowrap">{b.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Step 1: Personal info ────────────────────────────────────────────────────

function Step1({ form, setForm, onNext, onSave }: {
  form: FormData; setForm: (f: FormData) => void; onNext: () => void; onSave: () => void;
}) {
  const { t } = useTranslation();
  const isHaiti = form.country === "Haiti";
  const isDR    = form.country === "Dominican Republic";
  const cities  = isHaiti ? HAITI_CITIES : isDR ? DR_CITIES : [];
  const flag    = isHaiti ? "🇭🇹" : isDR ? "🇩🇴" : "🌍";
  const prefix  = isHaiti ? "+509" : isDR ? "+1 809" : "";
  const availableCountries = Array.from(new Set([form.country, "Haiti", "Dominican Republic"].filter(Boolean)));
  const ok = form.fullName.trim().length >= 2 && form.phone.trim().length >= 6 && !!form.city;

  return (
    <div className="flex flex-col min-h-[calc(100vh-68px)]">
      <div className="flex-1 px-5 py-6 space-y-4 overflow-y-auto">
        <div className="pb-1">
          <h2 className="text-xl font-black text-gray-900">{t("driverApply.step1Title")}</h2>
          <p className="text-sm text-gray-500 mt-1">{t("driverApply.step1Subtitle")}</p>
        </div>

        <InputField label={t("driverApply.newFormFullName")} value={form.fullName}
          onChange={v => setForm({ ...form, fullName: v })} placeholder="Jean Marie Pierre" />

        <div className="space-y-1.5">
          <label className="block text-sm font-semibold text-gray-700">{t("driverApply.newFormPhone")}</label>
          <div className="relative flex items-center">
            <div className="absolute left-3 flex items-center gap-1 text-sm text-gray-600 pointer-events-none select-none shrink-0">
              <span>{flag}</span><span className="font-bold">{prefix}</span>
            </div>
            <input type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
              placeholder="4612 3456"
              className="w-full h-12 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-900 pl-24 pr-4
                focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 focus:bg-white
                transition-all placeholder:text-gray-400" />
          </div>
        </div>

        <InputField label={t("driverApply.newFormEmail")} value={form.email} onChange={v => setForm({ ...form, email: v })}
          placeholder="jeanmarie@gmail.com" type="email" optional optionalLabel={t("driverApply.newFormOptional")} />

        <SelectField label={t("driverApply.newFormCountry")} value={form.country} onChange={v => setForm({ ...form, country: v, city: "" })}
          options={availableCountries.map(c => ({ value: c, label: c }))} choosePlaceholder={t("driverApply.newFormChoose")} />

        {(isHaiti || isDR) ? (
          <SelectField label={t("driverApply.newFormCity")} value={form.city} onChange={v => setForm({ ...form, city: v })}
            options={cities.map(c => ({ value: c, label: c }))} choosePlaceholder={t("driverApply.newFormChoose")} />
        ) : (
          <InputField label={t("driverApply.newFormCity")} value={form.city}
            onChange={v => setForm({ ...form, city: v })} placeholder="e.g. Miami, Paris, London" />
        )}
      </div>

      <div className="px-5 pb-8 space-y-3 bg-white border-t border-gray-50 pt-4">
        <BluePrimaryBtn onClick={onNext} disabled={!ok}>{t("driverApply.newFormNext")}</BluePrimaryBtn>
        <button type="button" onClick={onSave} className="w-full py-2 text-sm text-gray-400 hover:text-gray-600 transition-colors">
          {t("driverApply.newFormSave")}
        </button>
      </div>
    </div>
  );
}

// ─── Step 2A: Vehicle type + details ─────────────────────────────────────────

function Step2A({ form, setForm, onNext, onSave }: {
  form: FormData; setForm: (f: FormData) => void; onNext: () => void; onSave: () => void;
}) {
  const { t } = useTranslation();
  const VEHICLE_TYPES_I18N = [
    { id: "moto",   emoji: "🏍️", label: t("driverApply.vehicleMotoLabel"),   backend: "moto" },
    { id: "machin", emoji: "🚗", label: t("driverApply.vehicleMachinLabel"), backend: "machin" },
    { id: "biyik",  emoji: "🚲", label: t("driverApply.vehicleBiyikLabel"),  backend: "biyik" },
    { id: "kamyon", emoji: "🚛", label: t("driverApply.vehicleKamyonLabel"), backend: "kamyon" },
  ];
  const vt = VEHICLE_TYPES_I18N.find(v => v.id === form.vehicleType);
  const ok = !!form.vehicleType && form.vehicleBrand.trim().length > 0 && form.vehicleModel.trim().length > 0 && form.licensePlate.trim().length > 0;

  const vcfg = form.vehicleType ? getVehicleConfig(form.vehicleType, t) : null;

  return (
    <div className="flex flex-col min-h-[calc(100vh-68px)]">
      <div className="flex-1 px-5 py-6 space-y-5 overflow-y-auto">
        <div className="pb-1">
          {/* Title updates instantly as vehicle type changes */}
          <h2 className="text-xl font-black text-gray-900 transition-all duration-200">
            {vcfg ? vcfg.infoTitle : "Enfòmasyon sou veyikil ou"}
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            {vcfg ? vcfg.infoSubtitle : "Chwazi kalite veyikil ou anba a"}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {VEHICLE_TYPES_I18N.map(v => (
            <button key={v.id} type="button" onClick={() => setForm({ ...form, vehicleType: v.id })}
              className={cn("p-4 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all",
                form.vehicleType === v.id
                  ? "border-blue-500 bg-blue-50 shadow-lg shadow-blue-100"
                  : "border-gray-200 bg-gray-50 hover:border-blue-200 hover:bg-blue-50/20")}>
              <span className="text-4xl">{v.emoji}</span>
              <span className={cn("text-sm font-bold", form.vehicleType === v.id ? "text-blue-600" : "text-gray-700")}>
                {v.label}
              </span>
              {form.vehicleType === v.id && (
                <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center">
                  <Check className="h-3 w-3 text-white" />
                </div>
              )}
            </button>
          ))}
        </div>

        {form.vehicleType && vcfg && (
          <div className="space-y-4 pt-1">
            {/* Personalized header pill */}
            <div className="flex items-center gap-2.5 bg-blue-50 border border-blue-100 rounded-2xl px-3.5 py-2.5">
              {vcfg.vehicleImage
                ? <img src={vcfg.vehicleImage} alt="" className="h-8 w-12 object-contain" />
                : <span className="text-2xl">{vcfg.emoji}</span>}
              <div>
                <p className="text-xs font-black text-blue-700 leading-none">{t("driverApply.vehicleChosen")}</p>
                <p className="text-sm font-black text-blue-900 mt-0.5">{vt?.label}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="w-1 h-5 rounded-full bg-orange-500" />
              <p className="text-sm font-black text-gray-700">{t("driverApply.newFormVehicleDetails")} {vt?.label.toLowerCase() ?? ""}</p>
            </div>

            <InputField label={`${t("driverApply.newFormBrand")} ${vt?.label.toLowerCase() ?? ""}`} value={form.vehicleBrand}
              onChange={v => setForm({ ...form, vehicleBrand: v })} placeholder="Honda, Suzuki, Yamaha..." />
            <InputField label={`${t("driverApply.newFormModel")} ${vt?.label.toLowerCase() ?? ""}`} value={form.vehicleModel}
              onChange={v => setForm({ ...form, vehicleModel: v })} placeholder="CB150, Wave, GY6..." />

            <div className="grid grid-cols-2 gap-3">
              <InputField label={t("driverApply.newFormYear")} value={form.vehicleYear}
                onChange={v => setForm({ ...form, vehicleYear: v })} placeholder="2021" type="number" />
              <InputField label={t("driverApply.newFormColor")} value={form.vehicleColor}
                onChange={v => setForm({ ...form, vehicleColor: v })} placeholder="Nwa, Wouj..." />
            </div>

            <InputField label={t("driverApply.newFormPlate")} value={form.licensePlate}
              onChange={v => setForm({ ...form, licensePlate: v.toUpperCase() })} placeholder="AA-12345" />
            <InputField label={t("driverApply.newFormInsurance")} value={form.insuranceNumber}
              onChange={v => setForm({ ...form, insuranceNumber: v })} placeholder="INS-785412"
              optional optionalLabel={t("driverApply.newFormOptional")} />
          </div>
        )}
      </div>

      <div className="px-5 pb-8 space-y-3 bg-white border-t border-gray-50 pt-4">
        <BluePrimaryBtn onClick={onNext} disabled={!ok}>{t("driverApply.newFormNext")}</BluePrimaryBtn>
        <button type="button" onClick={onSave} className="w-full py-2 text-sm text-gray-400 hover:text-gray-600 transition-colors">
          {t("driverApply.newFormSave")}
        </button>
      </div>
    </div>
  );
}

// ─── Step 2B: Vehicle photos ──────────────────────────────────────────────────

function Step2B({ form, setForm, onNext, onSave, token }: {
  form: FormData; setForm: (f: FormData) => void; onNext: () => void; onSave: () => void; token: string;
}) {
  const { t } = useTranslation();
  const vcfg = getVehicleConfig(form.vehicleType, t);

  const obligatwa = t("driverApply.newFormRequired", "obligatwa");

  return (
    <div className="flex flex-col min-h-[calc(100vh-68px)] bg-white">
      <div className="flex-1 px-5 pt-6 pb-4 space-y-6 overflow-y-auto">

        {/* ── Header ────────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-4 pb-2 border-b border-gray-100">
          <div className="w-16 h-16 rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-center shrink-0 overflow-hidden">
            {vcfg.vehicleImage
              ? <img src={vcfg.vehicleImage} alt="" className="w-full h-full object-contain p-1" />
              : <span className="text-5xl leading-none">{vcfg.emoji}</span>}
          </div>
          <div>
            <h2 className="text-2xl font-black text-gray-900 leading-tight">{vcfg.photoTitle}</h2>
            <p className="text-sm text-gray-500 mt-0.5">{vcfg.photoSubtitle}</p>
          </div>
        </div>

        {/* ── Photo slots ───────────────────────────────────────────────────── */}
        <div className="space-y-5">
          {/* Front */}
          <div className="space-y-2">
            <div className="flex items-center justify-between px-0.5">
              <span className="text-sm font-semibold text-gray-800">{vcfg.photoFrontLabel}</span>
              <span className="text-[11px] text-gray-400">({obligatwa})</span>
            </div>
            <VehiclePhotoCard label={vcfg.photoFrontLabel}
              url={form.photoFront} onUpload={u => setForm({ ...form, photoFront: u })} token={token} vehicleType={form.vehicleType} />
          </div>

          {/* Side */}
          <div className="space-y-2">
            <div className="flex items-center justify-between px-0.5">
              <span className="text-sm font-semibold text-gray-800">{t("driverApply.newFormPhotoSide")}</span>
              <span className="text-[11px] text-gray-400">({obligatwa})</span>
            </div>
            <VehiclePhotoCard label={t("driverApply.newFormPhotoSide")}
              url={form.photoSide} onUpload={u => setForm({ ...form, photoSide: u })} token={token} vehicleType={form.vehicleType} />
          </div>

          {/* Back */}
          <div className="space-y-2">
            <div className="flex items-center justify-between px-0.5">
              <span className="text-sm font-semibold text-gray-800">{t("driverApply.newFormPhotoBack")}</span>
              <span className="text-[11px] text-gray-400">({obligatwa})</span>
            </div>
            <VehiclePhotoCard label={t("driverApply.newFormPhotoBack")}
              url={form.photoBack} onUpload={u => setForm({ ...form, photoBack: u })} token={token} vehicleType={form.vehicleType} />
          </div>
        </div>

        {/* ── Photo match warning ───────────────────────────────────────── */}
        <div className="flex items-start gap-3 px-4 py-3 rounded-2xl bg-gradient-to-r from-slate-50 to-slate-50/60 border border-slate-200/80 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
          <div className="shrink-0 mt-0.5 w-7 h-7 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-slate-500">
              <path d="M7 1.167A5.25 5.25 0 1 0 7 11.667 5.25 5.25 0 0 0 7 1.167ZM7 10.5A4.083 4.083 0 1 1 7 2.334 4.083 4.083 0 0 1 7 10.5Z" fill="currentColor"/>
              <path d="M7 6.125a.583.583 0 0 0-.583.583v2.334a.583.583 0 1 0 1.166 0V6.708A.583.583 0 0 0 7 6.125ZM7 4.375a.729.729 0 1 0 0 1.458A.729.729 0 0 0 7 4.375Z" fill="currentColor"/>
            </svg>
          </div>
          <p className="text-[12.5px] leading-[1.55] text-slate-500 font-medium">
            <span className="font-semibold text-slate-600">🛡️ </span>
            Si foto yo pa koresponn ak papye machin nan, aplikasyon an ka rejte.
          </p>
        </div>

        {/* ── Tip ───────────────────────────────────────────────────────────── */}
        <div className="flex gap-3 p-4 rounded-2xl bg-amber-50 border border-amber-100">
          <span className="text-xl shrink-0 mt-0.5">💡</span>
          <p className="text-sm text-amber-800 leading-relaxed">{vcfg.photoTip}</p>
        </div>
      </div>

      <div className="px-5 pb-8 pt-4 space-y-3 bg-white border-t border-gray-100">
        <BluePrimaryBtn onClick={onNext} disabled={!form.photoFront || !form.photoSide || !form.photoBack}>
          {t("driverApply.newFormNext")}
        </BluePrimaryBtn>
        <button type="button" onClick={onSave} className="w-full py-2 text-sm text-gray-400 hover:text-gray-600 transition-colors">
          {t("driverApply.newFormSave")}
        </button>
      </div>
    </div>
  );
}

// ─── Step 2C: Documents ───────────────────────────────────────────────────────

function Step2C({ form, setForm, onNext, onSave, token }: {
  form: FormData; setForm: (f: FormData) => void; onNext: () => void; onSave: () => void; token: string;
}) {
  const { t } = useTranslation();
  const vcfg = getVehicleConfig(form.vehicleType, t);

  return (
    <div className="flex flex-col min-h-[calc(100vh-68px)]">
      <div className="flex-1 px-5 py-6 space-y-4 overflow-y-auto">

        {/* Dynamic header: title + subtitle change per vehicle type */}
        <div className="pb-1">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-11 h-11 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0 overflow-hidden">
              {vcfg.vehicleImage
                ? <img src={vcfg.vehicleImage} alt="" className="w-full h-full object-contain p-0.5" />
                : <span className="text-2xl">{vcfg.emoji}</span>}
            </div>
            <div>
              <h2 className="text-xl font-black text-gray-900">{vcfg.docTitle}</h2>
              <p className="text-sm text-gray-500">{vcfg.docSubtitle}</p>
            </div>
          </div>
        </div>

        {/* Required documents — same for all vehicles */}
        <div className="space-y-1">
          <p className="text-[11px] font-black uppercase tracking-wide text-gray-400 px-1 pb-1">{t("driverApply.newFormPersonalDocs")}</p>
          <div className="space-y-3">
            <DocUploadRow label={t("driverApply.newFormDriverLicense")} url={form.photoPermis}
              onUpload={u => setForm({ ...form, photoPermis: u })} token={token} />
            <DocUploadRow label={t("driverApply.newFormIdCard")} url={form.photoIdCard}
              onUpload={u => setForm({ ...form, photoIdCard: u })} token={token} />
            <DocUploadRow label={t("driverApply.newFormSelfieWithId")} url={form.photoSelfieDoc}
              onUpload={u => setForm({ ...form, photoSelfieDoc: u })} token={token} />
          </div>
        </div>

        {/* Vehicle registration — label + instruction adapt to vehicle type */}
        <div className="space-y-1">
          <p className="text-[11px] font-black uppercase tracking-wide text-gray-400 px-1 pb-1">
            {t("driverApply.newFormVehicleDocs")} {vcfg.emoji}
          </p>
          <div className="space-y-2">
            <DocUploadRow
              label={vcfg.registrationLabel + (vcfg.registrationOptional ? ` (${t("driverApply.newFormOptional")})` : "")}
              url={form.photoVehicleCard}
              onUpload={u => setForm({ ...form, photoVehicleCard: u })}
              token={token}
            />
            {/* Dynamic instruction text below the upload row */}
            <div className="flex items-start gap-2 px-1">
              <span className="text-base shrink-0 mt-0.5">📄</span>
              <p className="text-[11px] text-gray-500 leading-relaxed">{vcfg.registrationInstruction}</p>
            </div>
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-blue-50 border border-blue-200 flex gap-2.5">
          <Shield className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
          <p className="text-xs text-blue-700 leading-relaxed">
            {t("driverApply.newFormDocPrivacy")}
          </p>
        </div>
      </div>

      <div className="px-5 pb-8 space-y-3 bg-white border-t border-gray-50 pt-4">
        <BluePrimaryBtn onClick={onNext} disabled={!form.photoPermis || !form.photoIdCard}>{t("driverApply.newFormNext")}</BluePrimaryBtn>
        <button type="button" onClick={onSave} className="w-full py-2 text-sm text-gray-400 hover:text-gray-600 transition-colors">
          {t("driverApply.newFormSave")}
        </button>
      </div>
    </div>
  );
}

// ─── Selfie Camera Step — Pro Max Edition ─────────────────────────────────────
// Universal front-camera system: multi-strategy init, black-screen detection,
// device enumeration fallback, permission handling, retry cascade.
// Compatible with: Android, iOS, Samsung, Tecno, Infinix, Huawei, Redmi,
//                  Motorola, Oppo, Vivo, Chrome Mobile, Safari, WebView, PWA.

const INSTRUCTIONS = [
  { icon: "👁️", text: "Gade kamera a" },
  { icon: "😊", text: "Souri" },
  { icon: "⬅️", text: "Vire tèt agoch" },
  { icon: "➡️", text: "Vire tèt adwat" },
];

// Ordered strategies — most specific first, most permissive last
const SELFIE_STRATEGIES: MediaStreamConstraints[] = [
  // 0: HD front camera (exact)
  { video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } } },
  // 1: VGA front camera (exact)
  { video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } } },
  // 2: Bare front camera (exact facingMode, browser chooses resolution)
  { video: { facingMode: "user" } },
  // 3: Ideal front camera (not exact — allows fallback on devices that reject "user")
  { video: { facingMode: { ideal: "user" } } },
  // 4: Any camera (absolute last resort before deviceId strategy)
  { video: true },
];
// Strategy 5 (index === SELFIE_STRATEGIES.length): enumerate devices and use front deviceId

const ACQUIRE_TIMEOUT_MS = 4000;     // per strategy — keep short so iOS doesn't hang forever
const BLACK_DETECT_DELAY_MS = 1500;  // wait before sampling frame for black screen
const GLOBAL_LOADING_TIMEOUT_MS = 14000; // bail to error if still loading after 14s total

/** Wrap getUserMedia with a timeout so a hung browser doesn't block forever */
function acquireStream(constraints: MediaStreamConstraints): Promise<MediaStream> {
  return Promise.race([
    navigator.mediaDevices.getUserMedia(constraints),
    new Promise<never>((_, rej) =>
      setTimeout(() => rej(new DOMException("Camera timeout", "TimeoutError")), ACQUIRE_TIMEOUT_MS)
    ),
  ]);
}

/** Sample a tiny canvas frame to detect a black/blank preview */
function detectBlackFrame(video: HTMLVideoElement): boolean {
  if (video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) return true;
  try {
    const cv = document.createElement("canvas");
    cv.width = 16; cv.height = 16;
    const ctx = cv.getContext("2d");
    if (!ctx) return false;
    ctx.drawImage(video, 0, 0, 16, 16);
    const { data } = ctx.getImageData(0, 0, 16, 16);
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) sum += data[i] + data[i + 1] + data[i + 2];
    return sum / ((data.length / 4) * 3) < 8; // avg brightness < 8/255
  } catch { return false; }
}

/** Enumerate video devices and return the most likely front-facing deviceId */
async function findFrontDeviceId(): Promise<string | null> {
  try {
    const devs = await navigator.mediaDevices.enumerateDevices();
    const vids = devs.filter(d => d.kind === "videoinput");
    // Common label substrings for front cameras across manufacturers
    const FRONT_LABELS = ["front", "frontal", "selfie", "user", "face", "avant", "devan", "facing front"];
    for (const lbl of FRONT_LABELS) {
      const match = vids.find(d => d.label.toLowerCase().includes(lbl));
      if (match?.deviceId) return match.deviceId;
    }
    // Heuristic: on most Android phones index 1 is the front camera
    return vids.length >= 2 ? vids[1].deviceId : (vids[0]?.deviceId ?? null);
  } catch { return null; }
}

type CamPhase =
  | "idle"         // initial — instructions screen
  | "qr_loading"   // creating desktop session (fetching QR URL)
  | "qr"           // QR code visible, polling for mobile completion
  | "requesting"   // asking browser for permission / trying strategy 0
  | "opening"      // stream acquired, about to attach to <video>
  | "live"         // live preview active (black-screen check pending)
  | "animating"    // liveness checks running while camera is live
  | "done"         // photo captured & uploaded
  | "perm_denied"  // NotAllowedError — need settings change
  | "error";       // all strategies exhausted

function SelfieStep({ onComplete, token }: { onComplete: (url: string) => void; token: string }) {
  const { t } = useTranslation();

  const videoRef    = useRef<HTMLVideoElement>(null);
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const streamRef   = useRef<MediaStream | null>(null);
  const stratIdxRef = useRef(0);
  const mountedRef  = useRef(true);
  const pollRef     = useRef<ReturnType<typeof setInterval> | null>(null);

  // Detect desktop on mount (no touch = desktop = QR mode)
  const [isDesktop] = useState(() =>
    typeof window !== "undefined" && !("ontouchstart" in window) && !/Mobi|Android/i.test(navigator.userAgent)
  );

  const [phase, setPhase]           = useState<CamPhase>("idle");
  const [instrIdx, setInstrIdx]     = useState(0);
  const [completed, setCompleted]   = useState([false, false, false, false]);
  const [uploading, setUploading]   = useState(false);
  const [captured, setCaptured]     = useState("");
  const [stratLabel, setStratLabel] = useState("");
  const [sessionId, setSessionId]   = useState("");
  const [qrDataUrl, setQrDataUrl]   = useState("");

  // ── Stop all tracks & clean up video element ──
  const stopStream = () => {
    streamRef.current?.getTracks().forEach(trk => trk.stop());
    streamRef.current = null;
    try { if (videoRef.current) videoRef.current.srcObject = null; } catch { /* ignore */ }
  };

  // ── Stop polling helper ──
  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  };

  // ── Cleanup on unmount ──
  useEffect(() => () => { mountedRef.current = false; stopStream(); stopPolling(); }, []); // eslint-disable-line react-hooks/exhaustive-deps


  // ── Desktop: create a QR session and start polling ──
  const startDesktopSession = async () => {
    setPhase("qr_loading");
    setQrDataUrl("");
    setSessionId("");
    stopPolling();
    try {
      const res = await fetch("/api/driver/selfie-session", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { if (mountedRef.current) setPhase("error"); return; }
      const data = await res.json() as { sessionId: string; mobileUrl: string };
      if (!mountedRef.current) return;

      // Generate QR code data URL
      const dataUrl = await QRCode.toDataURL(data.mobileUrl, {
        width: 220, margin: 2,
        color: { dark: "#1a3a5c", light: "#ffffff" },
      });
      if (!mountedRef.current) return;

      setSessionId(data.sessionId);
      setQrDataUrl(dataUrl);
      setPhase("qr");

      // Poll every 3 seconds for mobile completion
      pollRef.current = setInterval(async () => {
        if (!mountedRef.current) { stopPolling(); return; }
        try {
          const pr = await fetch(`/api/driver/selfie-session/${data.sessionId}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (pr.status === 410) { stopPolling(); if (mountedRef.current) setPhase("error"); return; }
          if (!pr.ok) return;
          const pd = await pr.json() as { completed: boolean; photoUrl: string | null };
          if (pd.completed && pd.photoUrl && mountedRef.current) {
            stopPolling();
            setPhase("done");
            setCaptured(pd.photoUrl);
          }
        } catch { /* network hiccup — retry next tick */ }
      }, 3000);
    } catch {
      if (mountedRef.current) setPhase("error");
    }
  };

  // ── Start camera — ASYNC, called directly from button click ──
  // CRITICAL iOS fix: getUserMedia MUST be called within (or very close to)
  // a user gesture handler. Calling it from useEffect breaks iOS Safari.
  // This function IS the cascade — it tries all strategies sequentially.
  const startCamera = async (fromStrategyIdx = 0) => {
    stopStream();
    setCompleted([false, false, false, false]);
    setInstrIdx(0);
    setStratLabel("");
    stratIdxRef.current = fromStrategyIdx;
    setPhase("requesting");

    if (!navigator.mediaDevices?.getUserMedia) {
      if (mountedRef.current) setPhase("error");
      return;
    }

    const TOTAL = SELFIE_STRATEGIES.length + 1; // +1 for deviceId strategy
    let stream: MediaStream | null = null;

    for (let i = fromStrategyIdx; i < TOTAL; i++) {
      if (!mountedRef.current) return;
      stratIdxRef.current = i;
      if (i > fromStrategyIdx) {
        setStratLabel(`${t("driverApply.selfieRetrying", "Ap reasèye…")} (${i}/${TOTAL - 1})`);
        await new Promise(r => setTimeout(r, 200));
      }
      try {
        if (i < SELFIE_STRATEGIES.length) {
          stream = await acquireStream(SELFIE_STRATEGIES[i]);
        } else {
          // DeviceId enumeration strategy (labels only available after first getUserMedia grant)
          const deviceId = await findFrontDeviceId();
          if (deviceId) stream = await acquireStream({ video: { deviceId: { exact: deviceId } } });
        }
        if (stream) break;
      } catch (err) {
        const e = err as { name?: string };
        if (e.name === "NotAllowedError" || e.name === "PermissionDeniedError") {
          if (mountedRef.current) setPhase("perm_denied");
          return;
        }
        // OverconstrainedError, NotReadableError, TimeoutError → try next strategy
      }
    }

    if (!mountedRef.current) { stream?.getTracks().forEach(t => t.stop()); return; }
    if (!stream) { if (mountedRef.current) setPhase("error"); return; }

    streamRef.current = stream;
    setStratLabel("");
    setPhase("opening");
    // Tiny delay so React renders the <video> element into the DOM before srcObject is set
    setTimeout(() => { if (mountedRef.current) setPhase("live"); }, 80);
  };

  // ── Effect: attach stream & black-screen check when phase = "live" ──
  useEffect(() => {
    if (phase !== "live") return;
    const vid = videoRef.current;
    if (!vid || !streamRef.current) return;

    vid.srcObject = streamRef.current;
    vid.play().catch(() => { /* muted, should always work */ });

    let cancelled = false;
    const timer = setTimeout(async () => {
      if (cancelled || !mountedRef.current) return;
      const v = videoRef.current;
      if (!v) return;

      if (detectBlackFrame(v)) {
        // Black screen detected — stop and retry with next strategy
        stopStream();
        const nextIdx = stratIdxRef.current + 1;
        if (nextIdx >= SELFIE_STRATEGIES.length + 1) {
          if (!cancelled && mountedRef.current) setPhase("error");
        } else {
          if (!cancelled && mountedRef.current) startCamera(nextIdx);
        }
      } else {
        if (!cancelled && mountedRef.current) setPhase("animating");
      }
    }, BLACK_DETECT_DELAY_MS);

    return () => { cancelled = true; clearTimeout(timer); };
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Effect: liveness animation when phase = "animating" ──
  useEffect(() => {
    if (phase !== "animating") return;
    const vid = videoRef.current;
    if (vid && !vid.srcObject && streamRef.current) {
      vid.srcObject = streamRef.current;
      vid.play().catch(() => {});
    }
    // Schedule each step individually so ALL timers can be properly cleaned up
    const timers = INSTRUCTIONS.map((_, i) => {
      const delay = 1200 + i * 1400;
      return setTimeout(() => {
        if (!mountedRef.current) return;
        setCompleted(prev => { const n = [...prev]; n[i] = true; return n; });
        setInstrIdx(i + 1);
      }, delay);
    });
    return () => timers.forEach(clearTimeout);
  }, [phase]);

  // ── Capture selfie frame from live video ──
  const captureFrame = () => {
    const vid = videoRef.current;
    const cv  = canvasRef.current;
    if (!vid || !cv) return;

    const w = Math.max(vid.videoWidth || 0, 640);
    const h = Math.max(vid.videoHeight || 0, 480);
    cv.width = w; cv.height = h;
    const ctx = cv.getContext("2d");
    if (!ctx) return;

    // Un-mirror the capture (preview is CSS-mirrored, capture should be natural)
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(vid, 0, 0);

    stopStream();
    setUploading(true);

    cv.toBlob(async blob => {
      if (!blob || !mountedRef.current) { setUploading(false); return; }
      try {
        const fd = new FormData();
        fd.append("file", blob, "selfie.jpg");
        const res = await fetch("/api/upload", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: fd,
        });
        const d = await res.json();
        if (d.url && mountedRef.current) { setCaptured(d.url); setPhase("done"); }
        else if (!d.url && mountedRef.current) { setPhase("error"); }
      } catch { if (mountedRef.current) setPhase("error"); }
      finally { if (mountedRef.current) setUploading(false); }
    }, "image/jpeg", 0.9);
  };

  const isLive = phase === "live" || phase === "animating";
  const isLoading = phase === "requesting" || phase === "opening";

  const selfieCurrentStep =
    phase === "done" && !uploading ? 4
    : phase === "done" || uploading ? 3
    : (isLive || isLoading) ? 2
    : 1;

  const SELFIE_STEPS = [
    t("driverApply.selfieStep1", "Préparer"),
    t("driverApply.selfieStep2", "Prendre photo"),
    t("driverApply.selfieStep3", "Vérification"),
    t("driverApply.selfieStep4", "Terminé"),
  ];

  const FEATURES = [
    { icon: "🤖", bg: "bg-blue-500/20", title: t("driverApply.selfieFeatureAI", "Détection intelligente"), desc: t("driverApply.selfieFeatureAIDesc", "IA avancée pour une vérification plus précise") },
    { icon: "🛡️", bg: "bg-green-500/20", title: t("driverApply.selfieFeatureFraud", "Anti-fraude renforcé"), desc: t("driverApply.selfieFeatureFraudDesc", "Protection contre les tentatives d'usurpation") },
    { icon: "⚡", bg: "bg-yellow-500/20", title: t("driverApply.selfieFeatureFluid", "Expérience fluide"), desc: t("driverApply.selfieFeatureFluidDesc", "Processus rapide et intuitif") },
    { icon: "📱", bg: "bg-purple-500/20", title: t("driverApply.selfieFeatureCompat", "Compatibilité totale"), desc: t("driverApply.selfieFeatureCompatDesc", "Optimisé pour tous les appareils") },
  ];

  return (
    <div className="min-h-screen bg-[#0a0f1a] flex flex-col">

      {/* ── Header ── */}
      <div className="px-5 pt-5 pb-4 shrink-0 border-b border-white/5">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-7 h-7 rounded-lg bg-orange-500 flex items-center justify-center">
            <Truck className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="text-white font-bold text-xs tracking-widest uppercase">FLEXA MARKET</span>
          <span className="ml-auto flex items-center gap-1 text-emerald-400 text-[10px] font-semibold">
            <Shield className="h-3 w-3" /> Sécurisé
          </span>
        </div>
        <p className="text-white font-semibold text-sm mb-3">{t("driverApply.selfieIdleTitle", "Vérification d'identité")}</p>
        {/* Step progress */}
        <div className="flex items-center gap-1">
          {SELFIE_STEPS.map((label, i) => {
            const num = i + 1;
            const done = num < selfieCurrentStep;
            const active = num === selfieCurrentStep;
            return (
              <React.Fragment key={i}>
                <div className={cn(
                  "w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold border transition-all shrink-0",
                  done ? "bg-green-500 border-green-500 text-white"
                  : active ? "bg-orange-500 border-orange-500 text-white"
                  : "border-gray-700 text-gray-600"
                )}>
                  {done ? <Check className="h-2.5 w-2.5" /> : num}
                </div>
                {i < SELFIE_STEPS.length - 1 && (
                  <div className={cn("flex-1 h-px transition-colors", done ? "bg-green-500" : "bg-gray-800")} />
                )}
              </React.Fragment>
            );
          })}
        </div>
        <div className="flex justify-between mt-1.5">
          {SELFIE_STEPS.map((label, i) => {
            const num = i + 1;
            const done = num < selfieCurrentStep;
            const active = num === selfieCurrentStep;
            return (
              <span key={i} className={cn(
                "text-[9px] leading-tight",
                i === 0 ? "text-left" : i === SELFIE_STEPS.length - 1 ? "text-right" : "text-center flex-1",
                done ? "text-green-400" : active ? "text-orange-400" : "text-gray-600"
              )}>{label}</span>
            );
          })}
        </div>
      </div>

      {/* Hidden canvas — must stay in DOM always */}
      <canvas ref={canvasRef} className="hidden" />

      {/* ── Main scrollable content ── */}
      <div className="flex-1 overflow-y-auto">

        {/* ─── IDLE ─── */}
        {phase === "idle" && (
          <div className="flex flex-col px-5 py-7 gap-6 pb-10">

            {/* Camera placeholder circle */}
            <div className="relative w-44 h-44 mx-auto">
              <div className="w-full h-full rounded-full bg-[#111827] border border-white/8 flex items-center justify-center">
                <Camera className="h-11 w-11 text-gray-700" />
              </div>
              <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 176 176">
                <ellipse cx="88" cy="90" rx="48" ry="60" fill="none"
                  stroke="rgba(255,255,255,0.12)" strokeWidth="1.5" strokeDasharray="6 4" />
              </svg>
            </div>

            {/* Hints */}
            <div className="flex items-center justify-center gap-4 text-[11px] text-gray-500">
              <span>💡 {t("driverApply.selfieHintLight", "Bonne lumière")}</span>
              <span className="w-px h-3 bg-gray-800" />
              <span>😊 {t("driverApply.selfieHintExpression", "Expression naturelle")}</span>
            </div>

            {/* Info row */}
            <div className="flex items-center gap-2.5 bg-white/4 rounded-xl p-3 border border-white/6">
              <Shield className="h-3.5 w-3.5 text-gray-500 shrink-0" />
              <p className="text-gray-500 text-[11px] leading-relaxed">
                {t("driverApply.selfieDataProtectedDesc", "Vos données sont chiffrées et protégées.")}
              </p>
            </div>

            {/* CTA */}
            {isDesktop ? (
              <button type="button" onClick={startDesktopSession}
                className="w-full h-12 rounded-xl bg-orange-500 hover:bg-orange-400 text-white font-semibold text-sm
                  flex items-center justify-center gap-2 transition-all active:scale-[0.98]">
                <QrCode className="h-4 w-4" />
                Kontinye sou Telefòn (QR)
              </button>
            ) : (
              <button type="button" onClick={() => startCamera(0)}
                className="w-full h-12 rounded-xl bg-orange-500 hover:bg-orange-400 text-white font-semibold text-sm
                  flex items-center justify-center gap-2 transition-all active:scale-[0.98]">
                <Camera className="h-4 w-4" />
                {t("driverApply.selfieCommencer", "Commencer la capture")}
              </button>
            )}

          </div>
        )}

        {/* ─── QR LOADING ─── */}
        {phase === "qr_loading" && (
          <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 px-5">
            <Loader2 className="h-6 w-6 text-gray-500 animate-spin" />
            <p className="text-gray-400 text-xs">Ap jenere QR code…</p>
          </div>
        )}

        {/* ─── QR ─── */}
        {phase === "qr" && (
          <div className="flex flex-col items-center px-5 py-6 gap-5">
            <div className="text-center">
              <QrCode className="h-5 w-5 text-gray-500 mx-auto mb-2" />
              <p className="text-white text-sm font-medium">Skan ak telefòn ou</p>
              <p className="text-gray-500 text-[11px] mt-1">Ouvri kamera epi skan kòd la</p>
            </div>
            {qrDataUrl && (
              <div className="p-3 bg-white rounded-2xl">
                <img src={qrDataUrl} alt="QR Code selfie" className="w-48 h-48" />
              </div>
            )}
            <div className="flex items-center gap-2 text-gray-500 text-[11px]">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Ap tann selfie sou telefòn…</span>
            </div>
            <div className="w-full bg-white/4 border border-white/6 rounded-xl p-3.5 space-y-1.5 text-[11px] text-gray-500">
              <p>1. Ouvri kamera telefòn ou</p>
              <p>2. Skan QR code a</p>
              <p>3. Pran selfie ou</p>
              <p>4. Retounen sou òdinatè — ap kontinye otomatik</p>
            </div>
            <button type="button" onClick={startDesktopSession}
              className="text-gray-600 text-[11px] underline underline-offset-2 hover:text-gray-400">
              Jenere QR code ankò
            </button>
          </div>
        )}

        {/* ─── LOADING ─── */}
        {isLoading && (
          <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-5">
            <div className="w-12 h-12 rounded-full border border-white/10 bg-white/4 flex items-center justify-center">
              <Loader2 className="h-5 w-5 text-gray-500 animate-spin" />
            </div>
            <div className="text-center">
              <p className="text-white text-xs font-medium">{stratLabel || t("driverApply.selfieOpeningCamera", "Ap ouvri kamera…")}</p>
              <p className="text-gray-600 text-[10px] mt-1">{t("driverApply.selfieRequestingPerm", "Ap mande pèmisyon…")}</p>
            </div>
          </div>
        )}

        {/* ─── LIVE / ANIMATING — video always in DOM ─── */}
        <div className={cn("flex flex-col", isLive ? "block" : "hidden")}>
          <div className="flex flex-col items-center px-5 py-5 gap-4">

            {/* Status pill */}
            <div className="h-7 flex items-center justify-center">
              {phase === "animating" && instrIdx < INSTRUCTIONS.length ? (
                <div className="bg-white/6 border border-white/10 text-gray-300 text-[11px] px-3 py-1 rounded-full flex items-center gap-1.5">
                  <span>{INSTRUCTIONS[instrIdx]?.icon}</span>
                  <span>{INSTRUCTIONS[instrIdx]?.text}</span>
                </div>
              ) : completed.every(Boolean) ? (
                <div className="bg-green-500/10 border border-green-500/20 text-green-400 text-[11px] px-3 py-1 rounded-full flex items-center gap-1.5">
                  <CheckCircle className="h-3 w-3" />
                  <span>{t("driverApply.selfieReadyCapture", "Prêt — cliquez pour capturer")}</span>
                </div>
              ) : (
                <p className="text-gray-600 text-[11px]">{t("driverApply.selfieAlignFace", "Mete figi ou nan sèk la")}</p>
              )}
            </div>

            {/* Live camera circle */}
            <div className="relative w-52 h-52 mx-auto">
              <div className={cn(
                "absolute inset-0 rounded-full border-2 transition-all duration-500",
                completed.every(Boolean) ? "border-green-500/50" : "border-white/12"
              )} />
              <div className="absolute inset-0 rounded-full overflow-hidden">
                <video ref={videoRef} autoPlay muted playsInline disablePictureInPicture
                  className="w-full h-full object-cover scale-x-[-1]" />
                <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 208 208">
                  <defs>
                    <mask id="selfie-oval-mask">
                      <rect width="208" height="208" fill="white" />
                      <ellipse cx="104" cy="100" rx="60" ry="74" fill="black" />
                    </mask>
                  </defs>
                  <rect width="208" height="208" fill="rgba(0,0,0,0.2)" mask="url(#selfie-oval-mask)" />
                  <ellipse cx="104" cy="100" rx="60" ry="74" fill="none"
                    stroke={completed.every(Boolean) ? "rgba(74,222,128,0.7)" : "rgba(255,255,255,0.25)"}
                    strokeWidth="1.5" strokeDasharray="8 4" />
                </svg>
              </div>
            </div>

            {/* Liveness step dots */}
            <div className="flex items-center gap-2">
              {INSTRUCTIONS.map((ins, i) => (
                <div key={i} className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center text-sm transition-all duration-300",
                  completed[i]
                    ? "bg-green-500 text-white"
                    : i === instrIdx && phase === "animating"
                      ? "bg-white/8 border border-white/20 animate-pulse text-gray-400"
                      : "bg-white/4 border border-white/6 text-gray-700 opacity-50"
                )}>
                  {completed[i] ? <Check className="h-3 w-3" /> : <span>{ins.icon}</span>}
                </div>
              ))}
            </div>

            {/* Capture button */}
            <button type="button" onClick={captureFrame}
              disabled={uploading || !completed.every(Boolean)}
              className={cn(
                "w-full h-12 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98]",
                completed.every(Boolean) && !uploading
                  ? "bg-orange-500 hover:bg-orange-400 text-white"
                  : "bg-white/4 border border-white/8 text-white/20 cursor-not-allowed"
              )}>
              {uploading
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <><Camera className="h-4 w-4" /> {t("driverApply.selfieCapture")}</>}
            </button>

          </div>
        </div>

        {/* ─── DONE ─── */}
        {phase === "done" && (
          <div className="flex flex-col items-center justify-center min-h-[70vh] px-5 gap-5">
            <div className="w-14 h-14 rounded-full bg-green-500 flex items-center justify-center">
              <Check className="h-7 w-7 text-white" />
            </div>
            <div className="text-center">
              <p className="text-white font-semibold text-sm">{t("driverApply.selfiePerfect", "Vérification réussie")}</p>
              <p className="text-gray-500 text-[11px] mt-1">{t("driverApply.selfieVerified", "Votre identité a été confirmée.")}</p>
            </div>
            {captured && (
              <div className="w-14 h-14 rounded-xl overflow-hidden border border-white/10">
                <img src={captured} alt="Selfie" className="w-full h-full object-cover" />
              </div>
            )}
            <button type="button" onClick={() => onComplete(captured)}
              className="w-full h-12 rounded-xl bg-orange-500 hover:bg-orange-400 text-white font-semibold text-sm
                flex items-center justify-center gap-2 transition-all active:scale-[0.98]">
              {t("driverApply.newFormNext")}
            </button>
          </div>
        )}

        {/* ─── PERMISSION DENIED ─── */}
        {phase === "perm_denied" && (
          <div className="flex flex-col items-center justify-center min-h-[60vh] px-5 gap-4">
            <div className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
              <Shield className="h-6 w-6 text-gray-500" />
            </div>
            <div className="text-center">
              <p className="text-white text-sm font-medium">{t("driverApply.selfiePermDenied", "Pèmisyon Kamera Refize")}</p>
              <p className="text-gray-500 text-[11px] mt-1.5 leading-relaxed max-w-xs">{t("driverApply.selfiePermDeniedHint", "Al nan Paramèt epi aktive kamera pou navigatè a")}</p>
            </div>
          </div>
        )}

        {/* ─── ERROR ─── */}
        {phase === "error" && (
          <div className="flex flex-col items-center justify-center min-h-[60vh] px-5 gap-4">
            <div className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
              <CameraOff className="h-6 w-6 text-gray-500" />
            </div>
            <div className="text-center">
              <p className="text-white text-sm font-medium">{t("driverApply.selfieNoCamera")}</p>
              <p className="text-gray-500 text-[11px] mt-1">{t("driverApply.selfieErrorSub", "Reasèye kamera a")}</p>
            </div>
            <button type="button" onClick={() => startCamera(0)}
              className="h-9 px-5 rounded-xl bg-white/6 hover:bg-white/10 border border-white/10 text-white text-xs font-medium
                flex items-center justify-center gap-1.5 transition-all">
              <RefreshCw className="h-3.5 w-3.5" />
              {t("driverApply.selfieRetry", "Reasèye")}
            </button>
          </div>
        )}

      </div>
    </div>
  );
}

// ─── Step 3: Banking ──────────────────────────────────────────────────────────

function Step3({ form, setForm, onNext, onSave }: {
  form: FormData; setForm: (f: FormData) => void; onNext: () => void; onSave: () => void;
}) {
  const { t } = useTranslation();
  const ok = form.bankName.trim().length > 0 || form.paymentMethod.length > 0;
  return (
    <div className="flex flex-col min-h-[calc(100vh-68px)]">
      <div className="flex-1 px-5 py-6 space-y-5 overflow-y-auto">
        <div className="pb-1">
          <h2 className="text-xl font-black text-gray-900">{t("driverApply.step3Title")}</h2>
          <p className="text-sm text-gray-500 mt-1">{t("driverApply.step3Subtitle")}</p>
        </div>

        <InputField label={t("driverApply.newFormBankName")} value={form.bankName} onChange={v => setForm({ ...form, bankName: v })}
          placeholder="Unibank, BNC, Sogebank..." optional optionalLabel={t("driverApply.newFormOptional")} />
        <InputField label={t("driverApply.newFormAccountName")} value={form.bankAccountName} onChange={v => setForm({ ...form, bankAccountName: v })}
          placeholder="Jean Marie Pierre" optional optionalLabel={t("driverApply.newFormOptional")} />
        <InputField label={t("driverApply.newFormAccountNumber")} value={form.bankAccountNumber} onChange={v => setForm({ ...form, bankAccountNumber: v })}
          placeholder="1234 5678 9012" optional optionalLabel={t("driverApply.newFormOptional")} />

        <div className="space-y-2.5">
          <p className="text-sm font-semibold text-gray-700">{t("driverApply.newFormPreferredPayment")}</p>
          {PAYMENT_METHODS.map(pm => (
            <button key={pm.id} type="button" onClick={() => setForm({ ...form, paymentMethod: form.paymentMethod === pm.id ? "" : pm.id })}
              className={cn("w-full flex items-center gap-3 p-4 rounded-2xl border-2 transition-all",
                form.paymentMethod === pm.id ? "border-blue-500 bg-blue-50" : "border-gray-200 bg-gray-50 hover:border-blue-200")}>
              <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center text-white font-black text-xl", pm.bgClass)}>
                {pm.emoji}
              </div>
              <span className={cn("flex-1 text-left font-bold text-sm",
                form.paymentMethod === pm.id ? "text-blue-700" : "text-gray-700")}>
                {pm.label}
              </span>
              <div className={cn("w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all",
                form.paymentMethod === pm.id ? "border-blue-600 bg-blue-600" : "border-gray-300")}>
                {form.paymentMethod === pm.id && <Check className="h-3 w-3 text-white" />}
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="px-5 pb-8 space-y-3 bg-white border-t border-gray-50 pt-4">
        <BluePrimaryBtn onClick={onNext} disabled={!ok}>{t("driverApply.newFormNext")}</BluePrimaryBtn>
        <button type="button" onClick={onSave} className="w-full py-2 text-sm text-gray-400 hover:text-gray-600 transition-colors">
          {t("driverApply.newFormSave")}
        </button>
      </div>
    </div>
  );
}

// ─── Step 4: Availability ─────────────────────────────────────────────────────

function Step4({ form, setForm, onNext, onSave }: {
  form: FormData; setForm: (f: FormData) => void; onNext: () => void; onSave: () => void;
}) {
  const { t } = useTranslation();
  const isHaiti4 = form.country === "Haiti";
  const isDR4    = form.country === "Dominican Republic";
  const zones = isDR4 ? WORK_ZONES_DR : WORK_ZONES_HAITI;
  const WORK_HOUR_SLOTS_I18N = [
    ...WORK_HOUR_SLOTS.filter(h => h.id !== "12am-6am" && h.id !== "all"),
    { id: "12am-6am", label: t("driverApply.workHourNight") },
    { id: "all",      label: t("driverApply.workHourAll") },
  ];

  const toggleZone = (z: string) =>
    setForm({ ...form, workZones: form.workZones.includes(z) ? form.workZones.filter(x => x !== z) : [...form.workZones, z] });

  const toggleHour = (h: string) =>
    setForm({ ...form, workHours: form.workHours.includes(h) ? form.workHours.filter(x => x !== h) : [...form.workHours, h] });

  return (
    <div className="flex flex-col min-h-[calc(100vh-68px)]">
      <div className="flex-1 px-5 py-6 space-y-6 overflow-y-auto">
        <div className="pb-1">
          <h2 className="text-xl font-black text-gray-900">{t("driverApply.step4Title")}</h2>
          <p className="text-sm text-gray-500 mt-1">{t("driverApply.step4Subtitle")}</p>
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-blue-500" />
            <p className="text-sm font-bold text-gray-800">{t("driverApply.workHourZoneLabel")}</p>
          </div>
          {(isHaiti4 || isDR4) ? (
            <div className="flex flex-wrap gap-2">
              {zones.map(z => (
                <button key={z} type="button" onClick={() => toggleZone(z)}
                  className={cn("text-xs font-semibold px-3.5 py-2 rounded-xl border-2 transition-all",
                    form.workZones.includes(z)
                      ? "border-blue-500 bg-blue-600 text-white shadow-sm"
                      : "border-gray-200 bg-gray-50 text-gray-700 hover:border-blue-200")}>
                  {z}
                </button>
              ))}
            </div>
          ) : (
            <input
              type="text"
              value={form.workZones.join(", ")}
              onChange={e => setForm({ ...form, workZones: e.target.value ? e.target.value.split(",").map(s => s.trim()).filter(Boolean) : [] })}
              placeholder="e.g. Downtown, North Zone, Airport Area"
              className="w-full h-12 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-900 px-4
                focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 focus:bg-white
                transition-all placeholder:text-gray-400"
            />
          )}
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Truck className="h-4 w-4 text-blue-500" />
              <p className="text-sm font-bold text-gray-800">{t("driverApply.workHourDistLabel")}</p>
            </div>
            <span className="text-sm font-black text-blue-600 bg-blue-50 px-3 py-1 rounded-full">{form.maxDistance} km</span>
          </div>
          <input type="range" min={3} max={50} value={form.maxDistance}
            onChange={e => setForm({ ...form, maxDistance: Number(e.target.value) })}
            className="w-full h-2 bg-gray-200 rounded-full appearance-none cursor-pointer accent-blue-600" />
          <div className="flex justify-between text-xs text-gray-400">
            <span>3 km</span><span>50 km</span>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-blue-500" />
            <p className="text-sm font-bold text-gray-800">{t("driverApply.workHourScheduleLabel")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {WORK_HOUR_SLOTS_I18N.map(h => (
              <button key={h.id} type="button" onClick={() => toggleHour(h.id)}
                className={cn("text-xs font-semibold px-3.5 py-2 rounded-xl border-2 transition-all",
                  form.workHours.includes(h.id)
                    ? "border-blue-500 bg-blue-600 text-white shadow-sm"
                    : "border-gray-200 bg-gray-50 text-gray-700 hover:border-blue-200")}>
                {h.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="px-5 pb-8 space-y-3 bg-white border-t border-gray-50 pt-4">
        <BluePrimaryBtn onClick={onNext}>{t("driverApply.newFormNext")}</BluePrimaryBtn>
        <button type="button" onClick={onSave} className="w-full py-2 text-sm text-gray-400 hover:text-gray-600 transition-colors">
          {t("driverApply.newFormSave")}
        </button>
      </div>
    </div>
  );
}

// ─── Step 5: Agreement ────────────────────────────────────────────────────────

function Step5({ form, setForm, onSubmit, submitting }: {
  form: FormData; setForm: (f: FormData) => void; onSubmit: () => void; submitting: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col min-h-[calc(100vh-68px)]">
      <div className="flex-1 px-5 py-6 space-y-5 overflow-y-auto">
        <div className="flex flex-col items-center py-4">
          <div className="w-24 h-24 rounded-3xl bg-blue-50 border-2 border-blue-100 flex items-center justify-center mb-4">
            <span className="text-5xl">📋</span>
          </div>
          <h2 className="text-xl font-black text-gray-900 text-center">{t("driverApply.step5Title")}</h2>
          <p className="text-sm text-gray-500 text-center mt-2 max-w-xs leading-relaxed">
            {t("driverApply.step5Subtitle")}
          </p>
        </div>

        <div className="space-y-3">
          <div onClick={() => setForm({ ...form, agreeTos1: !form.agreeTos1 })}
            className={cn("flex gap-3 p-4 rounded-2xl border-2 cursor-pointer transition-all",
              form.agreeTos1 ? "border-blue-500 bg-blue-50" : "border-gray-200 bg-gray-50 hover:border-blue-200")}>
            <div className={cn("w-6 h-6 rounded-lg border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all",
              form.agreeTos1 ? "border-blue-600 bg-blue-600" : "border-gray-300")}>
              {form.agreeTos1 && <Check className="h-4 w-4 text-white" />}
            </div>
            <p className="text-sm text-gray-700 leading-relaxed">
              {t("driverApply.step5Tos1")}
            </p>
          </div>

          <div onClick={() => setForm({ ...form, agreeTos2: !form.agreeTos2 })}
            className={cn("flex gap-3 p-4 rounded-2xl border-2 cursor-pointer transition-all",
              form.agreeTos2 ? "border-blue-500 bg-blue-50" : "border-gray-200 bg-gray-50 hover:border-blue-200")}>
            <div className={cn("w-6 h-6 rounded-lg border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all",
              form.agreeTos2 ? "border-blue-600 bg-blue-600" : "border-gray-300")}>
              {form.agreeTos2 && <Check className="h-4 w-4 text-white" />}
            </div>
            <p className="text-sm text-gray-700 leading-relaxed">
              {t("driverApply.step5Tos2")}
            </p>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200">
          <p className="text-xs font-bold text-amber-700 flex items-center gap-1.5 mb-2">
            <Zap className="h-3.5 w-3.5" /> {t("driverApply.step5BenefitsTitle")}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {[
              t("driverApply.step5Benefit1"),
              t("driverApply.step5Benefit2"),
              t("driverApply.step5Benefit3"),
              t("driverApply.step5Benefit4"),
            ].map(b => (
              <div key={b} className="flex items-center gap-1.5 text-xs text-amber-700">
                <CheckCircle className="h-3.5 w-3.5 text-green-600 shrink-0" />{b}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="px-5 pb-8 bg-white border-t border-gray-50 pt-4">
        <BluePrimaryBtn onClick={onSubmit} disabled={!form.agreeTos1 || !form.agreeTos2} loading={submitting}>
          {!submitting && <CheckCircle className="h-5 w-5" />}
          {t("driverApply.step5Submit")}
        </BluePrimaryBtn>
      </div>
    </div>
  );
}

// ─── Success Screen ───────────────────────────────────────────────────────────

function SuccessScreen({ applicationId }: { applicationId: string }) {
  const [, navigate] = useLocation();
  const [copied, setCopied] = useState(false);
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-between px-6 py-10 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {Array.from({ length: 20 }).map((_, i) => (
          <div key={i} className="absolute w-2 h-2 rounded-sm animate-bounce opacity-60"
            style={{
              left: `${Math.random() * 100}%`, top: `${-5 + Math.random() * 30}%`,
              backgroundColor: ["#3b82f6","#10b981","#f59e0b","#ef4444","#8b5cf6"][i % 5],
              animationDelay: `${Math.random() * 2}s`, animationDuration: `${1.5 + Math.random() * 2}s`,
              transform: `rotate(${Math.random() * 360}deg)`,
            }} />
        ))}
      </div>

      <div className="flex flex-col items-center gap-6 flex-1 justify-center">
        <div className="w-24 h-24 rounded-full bg-green-100 flex items-center justify-center shadow-xl shadow-green-100">
          <CheckCircle className="h-14 w-14 text-green-500" />
        </div>

        <div className="text-center">
          <h1 className="text-2xl font-black text-gray-900">{t("driverApply.successTitle")}</h1>
          <p className="text-gray-500 text-sm mt-2 max-w-xs leading-relaxed">
            {t("driverApply.successSubtitle")}
          </p>
        </div>

        <div className="w-full max-w-xs bg-gradient-to-br from-blue-600 to-blue-800 rounded-3xl p-5 shadow-xl shadow-blue-200">
          <div className="flex items-center gap-2 mb-2">
            <Truck className="h-4 w-4 text-blue-200" />
            <span className="text-blue-200 text-xs font-bold uppercase tracking-widest">{t("driverApply.successAppId")}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-white font-black text-lg tracking-wider">{applicationId}</span>
            <button type="button"
              onClick={() => { navigator.clipboard.writeText(applicationId); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
              className="w-9 h-9 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors">
              {copied ? <Check className="h-4 w-4 text-white" /> : <Copy className="h-4 w-4 text-white" />}
            </button>
          </div>
          <div className="mt-3 pt-3 border-t border-blue-500/40 flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-blue-300" />
            <span className="text-blue-200 text-xs">{t("driverApply.successReviewTime")}</span>
          </div>
        </div>

        <div className="w-full max-w-xs space-y-2">
          {[
            { icon: "✅", label: t("driverApply.successStep1"), done: true },
            { icon: "🔍", label: t("driverApply.successStep2"), done: false },
            { icon: "✅", label: t("driverApply.successStep3"), done: false },
          ].map((s, i) => (
            <div key={i} className={cn("flex items-center gap-3 p-3 rounded-xl", s.done ? "bg-green-50" : "bg-gray-50")}>
              <span className="text-xl">{s.icon}</span>
              <span className={cn("text-sm font-semibold flex-1", s.done ? "text-green-700" : "text-gray-500")}>{s.label}</span>
              {s.done && <CheckCircle className="h-4 w-4 text-green-500" />}
            </div>
          ))}
        </div>
      </div>

      <div className="w-full space-y-3">
        <button type="button" onClick={() => navigate("/driver/status")}
          className="w-full h-14 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-black text-base flex items-center justify-center gap-2 shadow-lg shadow-blue-200 transition-all active:scale-[0.98]">
          {t("driverApply.successViewStatus")}
        </button>
        <button type="button" onClick={() => navigate("/")}
          className="w-full h-12 rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98]">
          {t("driverApply.successDashboard")}
        </button>
        <button type="button" className="w-full py-2 text-sm text-gray-400 hover:text-gray-600 transition-colors">
          {t("driverApply.successSupport")}
        </button>
      </div>
    </div>
  );
}

// ─── Status Screens ───────────────────────────────────────────────────────────

function PendingState({ app }: { app: any }) {
  const [, navigate] = useLocation();
  const { t } = useTranslation();
  const appId = `DRV-${String(app.id).padStart(10, "0")}`;
  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6 py-12 gap-6">
      <div className="w-20 h-20 rounded-full bg-amber-100 flex items-center justify-center">
        <Clock className="h-10 w-10 text-amber-500" />
      </div>
      <div className="text-center space-y-2">
        <h1 className="text-xl font-black text-gray-900">{t("driverApply.pendingTitle")}</h1>
        <p className="text-sm text-gray-500 max-w-xs text-center">
          {t("driverApply.pendingSubtitle")}
        </p>
      </div>
      <div className="w-full max-w-xs bg-amber-50 border border-amber-200 rounded-2xl p-4">
        <p className="text-xs text-amber-700 font-semibold mb-1">{t("driverApply.pendingAppId")}</p>
        <p className="text-amber-800 font-black tracking-wider">{appId}</p>
      </div>
      <button type="button" onClick={() => navigate("/")}
        className="w-full max-w-xs h-12 rounded-2xl bg-blue-600 text-white font-bold text-sm flex items-center justify-center gap-2">
        {t("driverApply.successDashboard")}
      </button>
    </div>
  );
}

function ApprovedState({ driver }: { driver: any }) {
  const [, navigate] = useLocation();
  const { t } = useTranslation();
  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6 py-12 gap-6">
      <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center">
        <CheckCircle className="h-10 w-10 text-green-500" />
      </div>
      <div className="text-center space-y-2">
        <h1 className="text-xl font-black text-gray-900">{t("driverApply.approvedTitle")}</h1>
        <p className="text-sm text-gray-500 max-w-xs text-center">
          {t("driverApply.approvedSubtitle")}
        </p>
      </div>
      <div className="w-full max-w-xs grid grid-cols-3 gap-3">
        {[
          { label: t("driverApply.approvedRating"), value: `${(driver.rating ?? 0).toFixed(1)} ⭐` },
          { label: t("driverApply.approvedDeliveries"), value: String(driver.deliveryCount ?? 0) },
          { label: t("driverApply.approvedEarnings"), value: `$${(driver.earningsTotal ?? 0).toFixed(0)}` },
        ].map(s => (
          <div key={s.label} className="bg-gray-50 rounded-2xl p-3 text-center">
            <p className="text-base font-black text-gray-900">{s.value}</p>
            <p className="text-[10px] text-gray-500 font-semibold mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>
      <button type="button" onClick={() => navigate("/")}
        className="w-full max-w-xs h-12 rounded-2xl bg-green-600 text-white font-bold text-sm flex items-center justify-center gap-2">
        <Truck className="h-4 w-4" /> {t("driverApply.approvedCta")}
      </button>
    </div>
  );
}

function RejectedState({ app, onEdit }: { app: any; onEdit: () => void }) {
  const [, navigate] = useLocation();
  const { t } = useTranslation();
  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6 py-12 gap-6">
      <div className="w-20 h-20 rounded-full bg-red-100 flex items-center justify-center">
        <AlertCircle className="h-10 w-10 text-red-500" />
      </div>
      <div className="text-center space-y-2">
        <h1 className="text-xl font-black text-gray-900">
          {app.status === "needs_changes" ? t("driverApply.changesTitle") : t("driverApply.rejectedTitle")}
        </h1>
        <p className="text-sm text-gray-500 max-w-xs text-center">
          {app.adminNote || (app.status === "needs_changes"
            ? t("driverApply.changesSubtitle")
            : t("driverApply.rejectedSubtitle"))}
        </p>
      </div>
      {app.changesRequestedReason && (
        <div className="w-full max-w-xs bg-blue-50 border border-blue-200 rounded-2xl p-4">
          <p className="text-xs font-bold text-blue-700 mb-1">{t("driverApply.changesReason")}</p>
          <p className="text-sm text-blue-800">{app.changesRequestedReason}</p>
        </div>
      )}
      <div className="w-full max-w-xs space-y-2">
        {app.status === "needs_changes" && (
          <button type="button" onClick={onEdit}
            className="w-full h-12 rounded-2xl bg-blue-600 text-white font-bold text-sm flex items-center justify-center gap-2">
            <RefreshCw className="h-4 w-4" /> {t("driverApply.changesCta")}
          </button>
        )}
        <button type="button" onClick={() => navigate("/")}
          className="w-full h-12 rounded-2xl border-2 border-gray-200 text-gray-700 font-bold text-sm flex items-center justify-center">
          {t("driverApply.rejectedBack")}
        </button>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ApplyForDriver() {
  const { user, token } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>("landing");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [applicationId, setApplicationId] = useState<string | null>(null);
  const [existingApp, setExistingApp] = useState<any>(null);
  const [existingDriver, setExistingDriver] = useState<any>(null);

  const savedForm = (() => {
    try { const r = localStorage.getItem("fm_driver_form"); return r ? { ...INIT, ...JSON.parse(r) } : null; }
    catch { return null; }
  })();
  const [form, setFormRaw] = useState<FormData>(savedForm ?? INIT);

  const setForm = (f: FormData) => {
    setFormRaw(f);
    try { localStorage.setItem("fm_driver_form", JSON.stringify(f)); } catch { /* ignore */ }
  };

  useEffect(() => {
    if (!user) return;
    const u = user as any;
    setFormRaw(prev => ({
      ...prev,
      fullName: prev.fullName || [`${u.firstName ?? ""}`, `${u.lastName ?? ""}`].join(" ").trim(),
      email: prev.email || u.email || "",
      phone: prev.phone || u.whatsappNumber || u.phone || "",
      country: u.country || prev.country || "Haiti",
      city: prev.city || u.city || "",
    }));
  }, [user]);

  useEffect(() => {
    if (!user || !token) { setLoading(false); return; }
    fetch("/api/delivery/application", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) { setExistingApp(data.application ?? null); setExistingDriver(data.driver ?? null); } })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user, token]);

  const goTo = (s: Step) => { setStep(s); window.scrollTo(0, 0); };

  const handleBack = () => {
    const prev: Partial<Record<Step, Step>> = {
      s1: "landing", s2a: "s1", s2b: "s2a", s2c: "s2b",
      selfie: "s2c", s3: "selfie", s4: "s3", s5: "s4",
    };
    const p = prev[step]; if (p) goTo(p);
  };

  const { t } = useTranslation();

  const handleSave = () => {
    toast({ title: t("driverApply.savedTitle"), description: t("driverApply.savedDesc") });
    navigate("/");
  };

  const handleSubmit = async () => {
    if (!token) { navigate("/auth/login"); return; }
    setSubmitting(true);
    try {
      const parts = form.fullName.trim().split(/\s+/);
      const firstName = parts[0] ?? "N/A";
      const lastName = parts.slice(1).join(" ") || firstName;
      const phone = form.phone.trim();
      const vBackend = VEHICLE_TYPES.find(v => v.id === form.vehicleType)?.backend ?? form.vehicleType;

      const res = await fetch("/api/delivery/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          firstName, lastName, city: form.city, address: form.city,
          dateOfBirth: "", whatsappNumber: phone, callPhone: phone,
          vehicleType: vBackend, vehicleBrand: form.vehicleBrand,
          vehicleModel: form.vehicleModel, vehicleYear: form.vehicleYear,
          vehicleColor: form.vehicleColor, licensePlateNumber: form.licensePlate,
          insuranceNumber: form.insuranceNumber,
          photoVehicleFront: form.photoFront, photoVehicleSide: form.photoSide,
          photoVehicleBack: form.photoBack, photoLicenseFront: form.photoPermis,
          facePhotoHoldingId: form.photoSelfieDoc, facePhotoFront: form.photoIdCard,
          photoVehicleRegistration: form.photoVehicleCard,
          selfiePhotoUrl: form.selfiePhotoUrl, photoIdSelfie: form.selfiePhotoUrl,
          bankName: form.bankName, bankAccountName: form.bankAccountName,
          bankAccountNumber: form.bankAccountNumber,
          preferredPaymentMethod: form.paymentMethod,
          workZones: form.workZones, workHours: form.workHours,
          maxDeliveryKm: form.maxDistance,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erè soumisyon");
      const id = data.applicationId ?? `DRV-${String(data.application?.id ?? "0").padStart(10, "0")}`;
      setApplicationId(id);
      try { localStorage.removeItem("fm_driver_form"); } catch { /* ignore */ }
    } catch (err: any) {
      toast({ title: t("driverApply.submitError"), description: err.message ?? t("driverApply.submitErrorDesc"), variant: "destructive" });
    } finally { setSubmitting(false); }
  };

  if (loading && user) return (
    <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-blue-500" /></div>
  );

  if (applicationId) return <SuccessScreen applicationId={applicationId} />;
  if (existingDriver?.status === "active") return <ApprovedState driver={existingDriver} />;
  if (existingApp?.status === "pending") return <PendingState app={existingApp} />;
  if (existingApp?.status === "needs_changes") return <RejectedState app={existingApp} onEdit={() => setExistingApp(null)} />;
  if (existingApp?.status === "rejected") return <RejectedState app={existingApp} onEdit={() => setExistingApp(null)} />;

  if (step === "landing") {
    return (
      <LandingScreen onStart={() => {
        if (!user) { navigate("/auth/login"); return; }
        const u = user as any;
        goTo("s1");
      }} />
    );
  }

  if (step === "selfie") {
    return <SelfieStep token={token ?? ""} onComplete={url => { setForm({ ...form, selfiePhotoUrl: url }); goTo("s3"); }} />;
  }

  return (
    <div className="min-h-screen bg-white">
      <ProgressHeader step={step} onBack={handleBack} vehicleType={form.vehicleType} />
      {step === "s1"  && <Step1  form={form} setForm={setForm} onNext={() => goTo("s2a")} onSave={handleSave} />}
      {step === "s2a" && <Step2A form={form} setForm={setForm} onNext={() => goTo("s2b")} onSave={handleSave} />}
      {step === "s2b" && <Step2B form={form} setForm={setForm} onNext={() => goTo("s2c")} onSave={handleSave} token={token ?? ""} />}
      {step === "s2c" && <Step2C form={form} setForm={setForm} onNext={() => goTo("selfie")} onSave={handleSave} token={token ?? ""} />}
      {step === "s3"  && <Step3  form={form} setForm={setForm} onNext={() => goTo("s4")} onSave={handleSave} />}
      {step === "s4"  && <Step4  form={form} setForm={setForm} onNext={() => goTo("s5")} onSave={handleSave} />}
      {step === "s5"  && <Step5  form={form} setForm={setForm} onSubmit={handleSubmit} submitting={submitting} />}
    </div>
  );
}
