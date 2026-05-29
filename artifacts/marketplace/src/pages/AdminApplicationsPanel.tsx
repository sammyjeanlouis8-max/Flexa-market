import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  Truck, ShieldCheck, RefreshCw, MapPin, Check, X, ChevronDown, Clock,
  Search, AlertCircle, Eye, Ban, Unlock, PenLine, Phone, MessageSquare,
  Building2, FileText, User, Car, Bike, DollarSign, Calendar,
  ZoomIn, ZoomOut, RotateCw, Download, Maximize2, X as XIcon,
  Shield, AlertTriangle, CheckCircle2, TrendingUp, Activity,
  ChevronLeft, ChevronRight, Info, Star, Zap, Globe, Camera,
  UserPlus, Plus, ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/auth";

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function adminFetch(path: string, method = "GET", body?: object) {
  const token = localStorage.getItem("flexamarket_token");
  const res = await fetch(path, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error ?? "Network error");
  }
  return res.json();
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtDateTime(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ─── Status config ────────────────────────────────────────────────────────────

type AppStatus = "pending" | "approved" | "rejected" | "suspended" | "needs_changes" | "all";

const STATUS_STYLE: Record<string, { emoji: string; pill: string; ring: string; dot: string }> = {
  pending:       { emoji: "⏳", dot: "bg-amber-400",  pill: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",  ring: "ring-amber-400" },
  approved:      { emoji: "✅", dot: "bg-green-500",  pill: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",   ring: "ring-green-400" },
  rejected:      { emoji: "❌", dot: "bg-red-500",    pill: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",           ring: "ring-red-400" },
  suspended:     { emoji: "⛔", dot: "bg-gray-400",   pill: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",          ring: "ring-gray-400" },
  needs_changes: { emoji: "✏️", dot: "bg-blue-500",   pill: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",       ring: "ring-blue-400" },
};

function StatusPill({ status }: { status: string }) {
  const { t } = useTranslation();
  const style = STATUS_STYLE[status] ?? { emoji: "❓", pill: "bg-secondary text-secondary-foreground", ring: "ring-border", dot: "bg-gray-400" };
  const labelKey = status === "needs_changes" ? "adminApps.statusNeedsChanges"
    : status === "pending"  ? "adminApps.statusPending"
    : status === "approved" ? "adminApps.statusApproved"
    : status === "rejected" ? "adminApps.statusRejected"
    : status === "suspended" ? "adminApps.statusSuspended"
    : status;
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full ${style.pill}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${style.dot} animate-pulse`} />
      {t(labelKey)}
    </span>
  );
}

// ─── Risk Analysis ────────────────────────────────────────────────────────────

function computeDriverRisk(app: any): { level: "low" | "medium" | "high"; score: number; flagKeys: string[] } {
  let score = 100;
  const flagKeys: string[] = [];
  if (!app.facePhotoFront)      { score -= 20; flagKeys.push("adminApps.flagFacePhotoFront"); }
  if (!app.facePhotoHoldingId)  { score -= 15; flagKeys.push("adminApps.flagFacePhotoHoldingId"); }
  if (!app.photoIdSelfie)       { score -= 15; flagKeys.push("adminApps.flagPhotoIdSelfie"); }
  if (!app.photoFront)          { score -= 10; flagKeys.push("adminApps.flagPhotoFront"); }
  if (!app.licenseNumber)       { score -= 10; flagKeys.push("adminApps.flagLicenseNumber"); }
  if (!app.licensePlateNumber)  { score -= 10; flagKeys.push("adminApps.flagLicensePlate"); }
  if (!app.dateOfBirth)         { score -= 8;  flagKeys.push("adminApps.flagDob"); }
  if (!app.address)             { score -= 7;  flagKeys.push("adminApps.flagAddress"); }
  if (!app.vehicleBrand)        { score -= 5;  flagKeys.push("adminApps.flagVehicleBrand"); }
  const level = score >= 80 ? "low" : score >= 50 ? "medium" : "high";
  return { level, score: Math.max(0, score), flagKeys };
}

function computeAgentRisk(app: any): { level: "low" | "medium" | "high"; score: number; flagKeys: string[] } {
  let score = 100;
  const flagKeys: string[] = [];
  if (!app.govIdFront)         { score -= 25; flagKeys.push("adminApps.flagGovIdFront"); }
  if (!app.govIdBack)          { score -= 20; flagKeys.push("adminApps.flagGovIdBack"); }
  if (!app.selfieWithId)       { score -= 20; flagKeys.push("adminApps.flagSelfieWithId"); }
  if (!app.proofOfAddress)     { score -= 15; flagKeys.push("adminApps.flagProofOfAddress"); }
  if (!app.businessName)       { score -= 10; flagKeys.push("adminApps.flagBusinessName"); }
  if (!app.businessType)       { score -= 5;  flagKeys.push("adminApps.flagBusinessType"); }
  if (!app.address)            { score -= 5;  flagKeys.push("adminApps.flagAddress"); }
  const level = score >= 80 ? "low" : score >= 50 ? "medium" : "high";
  return { level, score: Math.max(0, score), flagKeys };
}

function RiskBadge({ level, score, flagKeys }: { level: "low" | "medium" | "high"; score: number; flagKeys: string[] }) {
  const { t } = useTranslation();
  const [showFlags, setShowFlags] = useState(false);
  const cfg = {
    low:    { label: t("adminApps.riskLow"),    color: "text-green-700 dark:text-green-300",  bg: "bg-green-100 dark:bg-green-900/30",  icon: Shield,        bar: "bg-green-500" },
    medium: { label: t("adminApps.riskMedium"), color: "text-amber-700 dark:text-amber-300",  bg: "bg-amber-100 dark:bg-amber-900/30",  icon: AlertTriangle, bar: "bg-amber-500" },
    high:   { label: t("adminApps.riskHigh"),   color: "text-red-700 dark:text-red-300",      bg: "bg-red-100 dark:bg-red-900/30",      icon: AlertCircle,   bar: "bg-red-500" },
  }[level];
  const Icon = cfg.icon;
  return (
    <div className="relative">
      <button type="button" onClick={() => setShowFlags(v => !v)}
        className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color} transition-all hover:opacity-80`}>
        <Icon className="h-2.5 w-2.5" />
        {cfg.label}
        <span className="font-black">{score}%</span>
      </button>
      {showFlags && flagKeys.length > 0 && (
        <div className="absolute top-full left-0 mt-1.5 z-50 bg-popover border border-border rounded-xl shadow-xl p-3 w-56 space-y-1.5">
          <p className="text-[10px] font-black text-muted-foreground uppercase tracking-wide mb-2">{t("adminApps.riskIssues")}</p>
          {flagKeys.map((fk, i) => (
            <div key={i} className="flex items-start gap-1.5 text-[10px] text-foreground">
              <AlertCircle className="h-2.5 w-2.5 mt-0.5 text-amber-500 shrink-0" />
              {t(fk)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DocCompletionBar({ pct, label }: { pct: number; label: string }) {
  const color = pct >= 80 ? "bg-green-500" : pct >= 50 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="text-[10px] text-muted-foreground shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden min-w-0">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] font-bold shrink-0">{pct}%</span>
    </div>
  );
}

function driverDocPct(app: any) {
  const docs = [
    // KYC face photos
    app.facePhotoFront, app.facePhotoLeft, app.facePhotoRight, app.facePhotoHoldingId,
    // Vehicle photos (new fields preferred, fallback to legacy)
    app.photoVehicleFront ?? app.photoFront,
    app.photoVehicleSide  ?? app.photoSide,
    // Document photos
    app.photoLicensePlate, app.photoVehicleRegistration, app.photoVehicleInsurance,
    app.photoLicenseFront,
  ];
  const present = docs.filter(Boolean).length;
  return Math.round((present / docs.length) * 100);
}

function agentDocPct(app: any) {
  const docs = [app.govIdFront, app.govIdBack, app.selfieWithId, app.proofOfAddress];
  const present = docs.filter(Boolean).length;
  return Math.round((present / docs.length) * 100);
}

// ─── Document Fullscreen Viewer ───────────────────────────────────────────────

interface DocSlide { url: string; title: string }

function DocViewer({ slides, startIndex = 0, onClose }: { slides: DocSlide[]; startIndex?: number; onClose: () => void }) {
  const { t } = useTranslation();
  const [idx, setIdx] = useState(startIndex);
  const [zoom, setZoom] = useState(1);
  const [rotate, setRotate] = useState(0);
  const current = slides[idx];

  useEffect(() => {
    setZoom(1);
    setRotate(0);
  }, [idx]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setIdx(i => Math.min(i + 1, slides.length - 1));
      if (e.key === "ArrowLeft")  setIdx(i => Math.max(i - 1, 0));
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose, slides.length]);

  return (
    <div className="fixed inset-0 z-[200] bg-black/95 flex flex-col" onClick={onClose}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/60 backdrop-blur-sm" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3">
          <span className="text-white font-bold text-sm">{current?.title}</span>
          <span className="text-white/50 text-xs">{idx + 1} / {slides.length}</span>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setZoom(z => Math.min(z + 0.25, 4))}
            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors">
            <ZoomIn className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => setZoom(z => Math.max(z - 0.25, 0.5))}
            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors">
            <ZoomOut className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => setRotate(r => (r + 90) % 360)}
            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors">
            <RotateCw className="h-4 w-4" />
          </button>
          {current?.url && (
            <a href={current.url} download target="_blank" rel="noopener noreferrer"
              className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
              onClick={e => e.stopPropagation()}>
              <Download className="h-4 w-4" />
            </a>
          )}
          <button type="button" onClick={onClose}
            className="p-2 rounded-lg bg-red-500/80 hover:bg-red-500 text-white transition-colors ml-2">
            <XIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Image area */}
      <div className="flex-1 flex items-center justify-center overflow-hidden relative" onClick={e => e.stopPropagation()}>
        {idx > 0 && (
          <button type="button" onClick={() => setIdx(i => i - 1)}
            className="absolute left-4 top-1/2 -translate-y-1/2 z-10 p-3 rounded-full bg-white/10 hover:bg-white/25 text-white transition-all">
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}
        {current?.url ? (
          <img
            src={current.url}
            alt={current.title}
            className="max-h-full max-w-full object-contain transition-transform duration-200 select-none"
            style={{ transform: `scale(${zoom}) rotate(${rotate}deg)` }}
            draggable={false}
          />
        ) : (
          <div className="flex flex-col items-center gap-4 text-white/40">
            <FileText className="h-20 w-20" />
            <p className="text-sm">{t("adminApps.docUnavailable")}</p>
          </div>
        )}
        {idx < slides.length - 1 && (
          <button type="button" onClick={() => setIdx(i => i + 1)}
            className="absolute right-4 top-1/2 -translate-y-1/2 z-10 p-3 rounded-full bg-white/10 hover:bg-white/25 text-white transition-all">
            <ChevronRight className="h-6 w-6" />
          </button>
        )}
      </div>

      {/* Thumbnail strip */}
      <div className="flex items-center gap-2 px-4 py-3 bg-black/60 backdrop-blur-sm overflow-x-auto" onClick={e => e.stopPropagation()}>
        {slides.map((s, i) => (
          <button key={i} type="button" onClick={() => setIdx(i)}
            className={`shrink-0 relative rounded-lg overflow-hidden border-2 transition-all ${i === idx ? "border-white" : "border-white/20 hover:border-white/50"}`}>
            {s.url ? (
              <img src={s.url} alt={s.title} className="h-14 w-14 object-cover" />
            ) : (
              <div className="h-14 w-14 bg-white/10 flex items-center justify-center">
                <FileText className="h-5 w-5 text-white/30" />
              </div>
            )}
            <div className="absolute inset-x-0 bottom-0 bg-black/70 py-0.5 px-1">
              <p className="text-center text-[8px] text-white truncate">{s.title}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Photo Grid with fullscreen ───────────────────────────────────────────────

function PhotoGrid({ label, photos }: { label: string; photos: DocSlide[] }) {
  const { t } = useTranslation();
  const [viewer, setViewer] = useState<number | null>(null);
  const valid = photos.filter(p => !!p.url);
  if (!valid.length) return (
    <div>
      <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-2">{label}</p>
      <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 rounded-xl px-3 py-4">
        <FileText className="h-4 w-4" />
        <span>{t("adminApps.noDocUploaded")}</span>
      </div>
    </div>
  );

  return (
    <div>
      {viewer !== null && (
        <DocViewer slides={valid} startIndex={viewer} onClose={() => setViewer(null)} />
      )}
      <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-2">{label}</p>
      <div className="flex gap-2 flex-wrap">
        {valid.map((p, i) => (
          <button key={p.title} type="button" onClick={() => setViewer(i)}
            className="group relative block rounded-xl overflow-hidden border-2 border-border hover:border-primary transition-all shadow-sm hover:shadow-md">
            <img src={p.url} alt={p.title} className="h-24 w-24 object-cover group-hover:scale-105 transition-transform duration-200" />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent py-1.5 px-1">
              <p className="text-center text-[9px] text-white font-semibold truncate">{p.title}</p>
            </div>
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all flex items-center justify-center">
              <Maximize2 className="h-5 w-5 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Timeline ─────────────────────────────────────────────────────────────────

function AppTimeline({ app }: { app: any }) {
  const { t } = useTranslation();
  const events: { date: string | null; label: string; color: string; icon: React.ReactNode }[] = [
    { date: app.createdAt, label: t("adminApps.timelineSubmitted"), color: "bg-blue-500", icon: <FileText className="h-3 w-3" /> },
  ];
  if (app.updatedAt && app.updatedAt !== app.createdAt) {
    if (app.status === "approved")
      events.push({ date: app.updatedAt, label: t("adminApps.timelineApproved"), color: "bg-green-500", icon: <CheckCircle2 className="h-3 w-3" /> });
    else if (app.status === "rejected")
      events.push({ date: app.updatedAt, label: t("adminApps.timelineRejected"), color: "bg-red-500", icon: <X className="h-3 w-3" /> });
    else if (app.status === "needs_changes")
      events.push({ date: app.updatedAt, label: t("adminApps.timelineChanges"), color: "bg-blue-500", icon: <PenLine className="h-3 w-3" /> });
    else if (app.status === "suspended")
      events.push({ date: app.updatedAt, label: t("adminApps.timelineSuspended"), color: "bg-gray-500", icon: <Ban className="h-3 w-3" /> });
  }
  if (app.status === "pending")
    events.push({ date: null, label: t("adminApps.timelinePendingReview"), color: "bg-amber-400", icon: <Clock className="h-3 w-3" /> });

  return (
    <div>
      <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-3">{t("adminApps.timelineTitle")}</p>
      <div className="relative">
        <div className="absolute left-3 top-0 bottom-0 w-px bg-border" />
        <div className="space-y-3 pl-8">
          {events.map((e, i) => (
            <div key={i} className="relative flex items-start gap-3">
              <div className={`absolute -left-[20px] w-6 h-6 rounded-full ${e.color} flex items-center justify-center text-white shadow-sm`}>
                {e.icon}
              </div>
              <div>
                <p className="text-xs font-semibold text-foreground">{e.label}</p>
                <p className="text-[10px] text-muted-foreground">{e.date ? fmtDateTime(e.date) : t("adminApps.timelineNow")}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Info Grid ────────────────────────────────────────────────────────────────

function InfoGrid({ items }: { items: { label: string; value: string | null | undefined; icon?: React.ReactNode }[] }) {
  const valid = items.filter(i => i.value);
  if (!valid.length) return null;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
      {valid.map((item, idx) => (
        <div key={idx} className="bg-muted/40 rounded-xl px-3 py-2.5">
          <p className="text-muted-foreground font-medium flex items-center gap-1 mb-0.5">{item.icon}{item.label}</p>
          <p className="font-semibold text-foreground">{item.value}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Driver Application Card ──────────────────────────────────────────────────

function DriverAppCard({ app, expanded, onToggle, onAction, actioning, scopeLock }: {
  app: any; expanded: boolean; onToggle: () => void;
  onAction: (type: string, payload?: object) => Promise<void>;
  actioning: boolean; scopeLock: string | null;
}) {
  const { t } = useTranslation();
  const [note, setNote] = useState(app.adminNote ?? "");
  const [changesReason, setChangesReason] = useState("");
  const [vehicleType, setVehicleType] = useState(app.vehicleType ?? "motorcycle");
  const [suspendForm, setSuspendForm] = useState(false);
  const [suspendReason, setSuspendReason] = useState("");
  const [suspendDuration, setSuspendDuration] = useState("7");
  const [subAction, setSubAction] = useState<"reject" | "changes" | null>(null);
  const [activeTab, setActiveTab] = useState<"rezime" | "dokiman" | "foto" | "selfie" | "lokalizasyon" | "aparey">("rezime");
  const [allowEdit, setAllowEdit] = useState(false);

  const risk = computeDriverRisk(app);
  const docPct = driverDocPct(app);

  const DRIVER_REJECT_KEYS = [
    "adminApps.driverRejectVehiclePhoto",
    "adminApps.driverRejectLicenseInvalid",
    "adminApps.driverRejectSelfieMismatch",
    "adminApps.driverRejectIncomplete",
    "adminApps.driverRejectDuplicate",
    "adminApps.driverRejectSuspicious",
    "adminApps.driverRejectLicenseExpired",
  ];

  const borderGlow = app.status === "pending" ? "border-amber-200/60 dark:border-amber-700/40 shadow-amber-100/50 dark:shadow-amber-900/20"
    : app.status === "approved" ? "border-green-200/60 dark:border-green-700/40"
    : app.status === "needs_changes" ? "border-blue-200/60 dark:border-blue-700/40"
    : "border-border";
  const headerBg = app.status === "pending" ? "from-amber-50/80 to-orange-50/40 dark:from-amber-900/10 dark:to-orange-900/5"
    : app.status === "approved" ? "from-green-50/80 to-emerald-50/40 dark:from-green-900/10 dark:to-emerald-900/5"
    : app.status === "needs_changes" ? "from-blue-50/80 to-indigo-50/40 dark:from-blue-900/10 dark:to-indigo-900/5"
    : "from-card to-card";

  const driverPhotos: DocSlide[] = [
    { url: app.photoVehicleFront ?? app.photoFront,  title: "Devan Veyikil" },
    { url: app.photoVehicleSide  ?? app.photoSide,   title: "Kote Veyikil" },
    { url: app.photoBody,                            title: t("adminApps.photoVehicleBody") },
    { url: app.photoLicensePlate,                    title: "Foto Plak" },
    { url: app.photoVehicleRegistration,             title: "Immatrikilasyon" },
    { url: app.photoVehicleInsurance,                title: "Asirans" },
    { url: app.photoLicenseFront,                    title: "Lisans — Devan" },
    { url: app.photoLicenseBack,                     title: "Lisans — Dèyè" },
    { url: app.photoIdSelfie,                        title: t("adminApps.photoSelfieId") },
    { url: app.facePhotoFront,                       title: t("adminApps.photoFaceFront") },
    { url: app.facePhotoLeft,                        title: t("adminApps.photoFaceLeft") },
    { url: app.facePhotoRight,                       title: t("adminApps.photoFaceRight") },
    { url: app.facePhotoHoldingId,                   title: t("adminApps.photoHoldingId") },
  ];

  return (
    <div className={`rounded-2xl border overflow-hidden transition-all shadow-sm bg-card ${borderGlow}`}>
      {/* Card Header */}
      <div className={`flex items-center gap-3 px-4 py-3 bg-gradient-to-r ${headerBg}`}>
        <div className="relative shrink-0">
          <Avatar className="h-12 w-12 ring-2 ring-border">
            {app.facePhotoFront && <AvatarImage src={app.facePhotoFront} className="object-cover" />}
            <AvatarFallback className="bg-gradient-to-br from-orange-500 to-red-600 text-white font-bold text-sm">
              {app.firstName?.[0]}{app.lastName?.[0]}
            </AvatarFallback>
          </Avatar>
          <span className="absolute -bottom-1 -right-1 text-base bg-white dark:bg-gray-800 rounded-full p-0.5 shadow-sm">
            {app.vehicleType === "car" ? "🚗" : "🏍️"}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-bold">{app.firstName} {app.lastName}</p>
            <StatusPill status={app.status} />
            <RiskBadge {...risk} />
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{app.city}, {app.country}</span>
            {app.userEmail && <span>{app.userEmail}</span>}
            <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{fmtDate(app.createdAt)}</span>
          </div>
          <div className="mt-1.5 max-w-xs">
            <DocCompletionBar pct={docPct} label={t("adminApps.docCompletionLabel")} />
          </div>
        </div>

        <button type="button"
          className="shrink-0 p-2 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-muted-foreground"
          onClick={onToggle}>
          <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} />
        </button>
      </div>

      {/* Expanded Panel */}
      {expanded && (
        <div className="border-t border-border bg-background">
          {/* Sub-tabs — scrollable row */}
          <div className="flex border-b border-border overflow-x-auto no-scrollbar">
            {([
              { k: "rezime",      label: "Rezime",          icon: User },
              { k: "dokiman",     label: "Dokiman",         icon: FileText },
              { k: "foto",        label: "Foto moto",       icon: Car },
              { k: "selfie",      label: "Selfie",          icon: Camera },
              { k: "lokalizasyon",label: "Lokalizasyon",    icon: MapPin },
              { k: "aparey",      label: "Aparèy",          icon: Shield },
            ] as const).map(tab => (
              <button key={tab.k} type="button"
                onClick={() => setActiveTab(tab.k)}
                className={`shrink-0 flex items-center justify-center gap-1 px-3 py-2.5 text-[11px] font-semibold transition-all border-b-2 ${activeTab === tab.k ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                <tab.icon className="h-3 w-3" />
                {tab.label}
              </button>
            ))}
          </div>

          <div className="px-4 py-4 space-y-4">
            {activeTab === "rezime" && (
              <>
                <InfoGrid items={[
                  { label: "WhatsApp",                         value: app.whatsappNumber,    icon: <MessageSquare className="h-3 w-3" /> },
                  { label: t("adminApps.fieldPhone"),          value: app.callPhone,         icon: <Phone className="h-3 w-3" /> },
                  { label: t("adminApps.fieldVehicle"),        value: [app.vehicleBrand, app.vehicleModel, app.vehicleYear].filter(Boolean).join(" ") || null, icon: <Car className="h-3 w-3" /> },
                  { label: t("adminApps.fieldVehicleColor"),   value: app.vehicleColor },
                  { label: t("adminApps.fieldPlate"),          value: app.licensePlateNumber },
                  { label: "Nimewo asirans",                   value: app.insuranceNumber },
                  { label: t("adminApps.fieldLicenseNumber"),  value: app.licenseNumber },
                  { label: t("adminApps.fieldAddress"),        value: app.address, icon: <MapPin className="h-3 w-3" /> },
                ]} />
                {/* Banking & Availability */}
                {(app.bankName || app.preferredPaymentMethod) && (
                  <div className="space-y-2">
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">💳 Bankè</p>
                    <InfoGrid items={[
                      { label: "Bank", value: app.bankName },
                      { label: "Non kont", value: app.bankAccountName },
                      { label: "Nimewo kont", value: app.bankAccountNumber },
                      { label: "Metòd peman", value: app.preferredPaymentMethod },
                    ]} />
                  </div>
                )}
                {(app.workZones || app.workHours) && (
                  <div className="space-y-2">
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">📅 Disponibilite</p>
                    <InfoGrid items={[
                      { label: "Zòn travay", value: app.workZones ? (() => { try { return JSON.parse(app.workZones).join(", "); } catch { return app.workZones; } })() : null },
                      { label: "Orè", value: app.workHours ? (() => { try { return JSON.parse(app.workHours).join(", "); } catch { return app.workHours; } })() : null },
                      { label: "Distans max", value: app.maxDeliveryKm ? `${app.maxDeliveryKm} km` : null },
                    ]} />
                  </div>
                )}
              </>
            )}

            {activeTab === "dokiman" && (
              <div className="space-y-4">
                <PhotoGrid label="🪪 Lisans & Idantite" photos={[
                  { url: app.photoLicenseFront, title: "Permis chofè (devan)" },
                  { url: app.photoLicenseBack,  title: "Permis chofè (dèyè)" },
                  { url: app.photoIdSelfie,     title: t("adminApps.photoSelfieId") },
                ]} />
                <PhotoGrid label="📋 Kat enskripsyon & Asirans" photos={[
                  { url: app.photoVehicleRegistration, title: "Kat Immatrikilasyon" },
                  { url: app.photoVehicleInsurance,    title: "Asirans Veyikil" },
                  { url: app.photoLicensePlate,        title: "Foto Plak" },
                ]} />
                <PhotoGrid label="🤳 KYC Selfie" photos={[
                  { url: app.facePhotoFront,     title: t("adminApps.photoFaceFront") },
                  { url: app.facePhotoLeft,      title: t("adminApps.photoFaceLeft") },
                  { url: app.facePhotoRight,     title: t("adminApps.photoFaceRight") },
                  { url: app.facePhotoHoldingId, title: t("adminApps.photoHoldingId") },
                ]} />
              </div>
            )}

            {activeTab === "foto" && (
              <div className="space-y-4">
                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">🚗 Foto Veyikil</p>
                <PhotoGrid label="" photos={[
                  { url: app.photoVehicleFront ?? app.photoFront, title: "Devan" },
                  { url: app.photoVehicleSide  ?? app.photoSide,  title: "Kote gich" },
                  { url: app.photoVehicleBack  ?? app.photoBody,   title: "Dèyè" },
                ]} />
                {!app.photoVehicleFront && !app.photoFront && (
                  <p className="text-xs text-muted-foreground text-center py-4">Pa gen foto veyikil</p>
                )}
              </div>
            )}

            {activeTab === "selfie" && (
              <div className="space-y-3">
                {app.selfiePhotoUrl || app.photoIdSelfie ? (
                  <>
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">🤳 Selfie Verifikasyon</p>
                    <div className="flex justify-center">
                      <div className="w-48 h-48 rounded-2xl overflow-hidden border-2 border-green-300 shadow-sm">
                        <img src={app.selfiePhotoUrl ?? app.photoIdSelfie} alt="Selfie" className="w-full h-full object-cover" />
                      </div>
                    </div>
                    <div className="flex items-center justify-center gap-1.5 text-xs text-green-600 font-semibold">
                      <CheckCircle2 className="h-4 w-4" /> Selfie soumèt
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-6">Pa gen selfie disponib</p>
                )}
              </div>
            )}

            {activeTab === "lokalizasyon" && (
              <AppTimeline app={app} />
            )}

            {activeTab === "aparey" && (
              <div className="space-y-3">
                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">📱 Enfòmasyon aparèy & sekirite</p>
                <InfoGrid items={[
                  { label: "Aparèy", value: [app.phoneBrand, app.phoneModel].filter(Boolean).join(" ") || null, icon: <Phone className="h-3 w-3" /> },
                  { label: "OS", value: app.phoneOs },
                  { label: "Koneksyon", value: app.internetProvider },
                  { label: "Smartphone", value: app.hasSmartphone ? "✅ Wi" : app.hasSmartphone === false ? "❌ Non" : null },
                  { label: "Entènèt stab", value: app.hasStableInternet ? "✅ Wi" : app.hasStableInternet === false ? "❌ Non" : null },
                ]} />
                {/* Risk section in aparey tab */}
                <div className={`rounded-2xl p-4 border-2 mt-3 ${risk.level === "low" ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800" : risk.level === "medium" ? "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800" : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"}`}>
                  <div className="flex items-center gap-3 mb-2">
                    {risk.level === "low" ? <Shield className="h-6 w-6 text-green-600" /> : risk.level === "medium" ? <AlertTriangle className="h-6 w-6 text-amber-600" /> : <AlertCircle className="h-6 w-6 text-red-600" />}
                    <p className="font-black text-base">{risk.score}% — {risk.level === "low" ? t("adminApps.riskLow") : risk.level === "medium" ? t("adminApps.riskMedium") : t("adminApps.riskHigh")}</p>
                  </div>
                  <div className="h-2.5 bg-white/60 dark:bg-black/20 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${risk.level === "low" ? "bg-green-500" : risk.level === "medium" ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${risk.score}%` }} />
                  </div>
                  {risk.flagKeys.length > 0 && (
                    <div className="mt-3 space-y-1.5">
                      {risk.flagKeys.map((fk, i) => (
                        <div key={i} className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200/60">
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                          <span className="text-xs font-medium text-amber-800 dark:text-amber-300">{t(fk)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Kept for backwards compat — risk tab removed, now in Aparèy */}
            {activeTab === ("risk" as any) && (
              <div className="space-y-4">
                <div className={`rounded-2xl p-4 border-2 ${risk.level === "low" ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800" : risk.level === "medium" ? "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800" : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"}`}>
                  <div className="flex items-center gap-3 mb-3">
                    {risk.level === "low" ? <Shield className="h-8 w-8 text-green-600" /> : risk.level === "medium" ? <AlertTriangle className="h-8 w-8 text-amber-600" /> : <AlertCircle className="h-8 w-8 text-red-600" />}
                    <div>
                      <p className="font-black text-lg">{risk.score}% — {risk.level === "low" ? t("adminApps.riskLow") : risk.level === "medium" ? t("adminApps.riskMedium") : t("adminApps.riskHigh")}</p>
                      <p className="text-xs text-muted-foreground">{t("adminApps.riskBasisDriver")}</p>
                    </div>
                  </div>
                  <div className="h-3 bg-white/60 dark:bg-black/20 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-700 ${risk.level === "low" ? "bg-green-500" : risk.level === "medium" ? "bg-amber-500" : "bg-red-500"}`}
                      style={{ width: `${risk.score}%` }} />
                  </div>
                </div>

                {risk.flagKeys.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-[11px] font-black text-muted-foreground uppercase tracking-wide">{t("adminApps.riskIssuesCount", { count: risk.flagKeys.length })}</p>
                    {risk.flagKeys.map((fk, i) => (
                      <div key={i} className="flex items-center gap-2.5 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200/60 dark:border-amber-800/40">
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                        <span className="text-xs font-medium text-amber-800 dark:text-amber-300">{t(fk)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-2.5 px-3 py-3 bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-200/60 dark:border-green-800/40">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span className="text-xs font-semibold text-green-700 dark:text-green-300">{t("adminApps.riskAllClearDriver")}</span>
                  </div>
                )}
              </div>
            )}

            {activeTab === ("timeline" as any) && <AppTimeline app={app} />}
          </div>

          {/* Admin note display */}
          {(app.adminNote || app.changesRequestedReason) && (
            <div className="px-4 pb-2 space-y-2">
              {app.adminNote && (
                <div className="bg-muted/60 rounded-xl px-3 py-2.5 text-xs flex gap-2">
                  <Info className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                  <span><span className="font-bold">{t("adminApps.adminNote")}</span> {app.adminNote}</span>
                </div>
              )}
              {app.changesRequestedReason && (
                <div className="bg-blue-50 dark:bg-blue-950/30 rounded-xl px-3 py-2.5 text-xs border border-blue-200/60 dark:border-blue-800/40 flex gap-2">
                  <PenLine className="h-3.5 w-3.5 text-blue-600 shrink-0 mt-0.5" />
                  <span><span className="font-bold text-blue-700 dark:text-blue-300">{t("adminApps.changesNote")}</span> <span className="text-blue-600 dark:text-blue-400">{app.changesRequestedReason}</span></span>
                </div>
              )}
            </div>
          )}

          {/* ── Action Area ── */}
          <div className="px-4 pb-4 pt-2 border-t border-border space-y-3">
            {(app.status === "pending" || app.status === "needs_changes") && (
              <>
                {/* Vehicle type */}
                <div>
                  <p className="text-[10px] font-black text-muted-foreground mb-2 uppercase tracking-wider">{t("adminApps.vehicleTypeLabel")}</p>
                  <div className="flex gap-2">
                    {[{ v: "motorcycle", label: t("adminApps.vehicleMoto") }, { v: "car", label: t("adminApps.vehicleCar") }].map(opt => (
                      <button key={opt.v} type="button" onClick={() => setVehicleType(opt.v)}
                        className={`text-xs font-bold px-4 py-2 rounded-xl border-2 transition-all ${vehicleType === opt.v ? "bg-orange-600 text-white border-orange-600 shadow-orange-200 dark:shadow-orange-900 shadow-sm" : "border-border bg-background text-foreground hover:bg-accent"}`}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <textarea
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
                  rows={2}
                  placeholder={t("adminApps.notePlaceholderDriver")}
                  value={note}
                  onChange={e => setNote(e.target.value)}
                />

                {/* Sub-action: reject */}
                {subAction === "reject" && (
                  <div className="p-4 rounded-2xl bg-red-50/80 dark:bg-red-900/20 border border-red-200/60 dark:border-red-800/40 space-y-3">
                    <p className="text-xs font-black text-red-700 dark:text-red-300 flex items-center gap-1.5"><X className="h-3.5 w-3.5" />{t("adminApps.confirmReject")}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {DRIVER_REJECT_KEYS.map(rk => (
                        <button key={rk} type="button" onClick={() => setNote(t(rk))}
                          className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border transition-all ${note === t(rk) ? "bg-red-600 text-white border-red-600" : "border-red-200 dark:border-red-700 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/40"}`}>
                          {t(rk)}
                        </button>
                      ))}
                    </div>
                    {/* Allow-edit toggle */}
                    <label className="flex items-center gap-2.5 cursor-pointer select-none group">
                      <div
                        onClick={() => setAllowEdit(v => !v)}
                        className={`w-10 h-5 rounded-full transition-colors flex items-center px-0.5 ${allowEdit ? "bg-orange-500" : "bg-gray-300 dark:bg-gray-600"}`}
                      >
                        <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${allowEdit ? "translate-x-5" : "translate-x-0"}`} />
                      </div>
                      <span className="text-xs font-semibold text-red-800 dark:text-red-300">
                        {allowEdit ? "✏️ Kite moun nan edite aplikasyon li" : "Kite moun nan edite? (Non)"}
                      </span>
                    </label>
                    {allowEdit && (
                      <p className="text-[10px] text-orange-700 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 rounded-xl px-3 py-2">
                        Moun nan pral wè motif la epi gen bouton pou korije epi soumèt ankò — li pa pral suspann.
                      </p>
                    )}
                    <div className="flex gap-2">
                      <Button size="sm" className="h-9 px-4 bg-red-600 hover:bg-red-700 text-white font-bold text-xs" disabled={actioning}
                        onClick={() => onAction("reject", { adminNote: note || null, allowEdit })}>
                        <X className="h-3.5 w-3.5 mr-1" />{t("adminApps.confirmRejectBtn")}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-9 text-xs" onClick={() => setSubAction(null)}>{t("adminApps.cancel")}</Button>
                    </div>
                  </div>
                )}

                {/* Sub-action: changes */}
                {subAction === "changes" && (
                  <div className="p-4 rounded-2xl bg-blue-50/80 dark:bg-blue-900/20 border border-blue-200/60 dark:border-blue-800/40 space-y-3">
                    <p className="text-xs font-black text-blue-700 dark:text-blue-300 flex items-center gap-1.5"><PenLine className="h-3.5 w-3.5" />{t("adminApps.requestChanges")}</p>
                    <textarea
                      className="w-full rounded-xl border border-blue-200 dark:border-blue-700 bg-background px-3 py-2 text-sm placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-blue-400"
                      rows={2}
                      placeholder={t("adminApps.changesPlaceholderDriver")}
                      value={changesReason}
                      onChange={e => setChangesReason(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <Button size="sm" className="h-9 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs" disabled={actioning || !changesReason.trim()}
                        onClick={() => onAction("request-changes", { adminNote: note || null, changesRequestedReason: changesReason })}>
                        <PenLine className="h-3.5 w-3.5 mr-1" />{t("adminApps.sendChanges")}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-9 text-xs" onClick={() => setSubAction(null)}>{t("adminApps.cancel")}</Button>
                    </div>
                  </div>
                )}

                {/* Primary actions — stacked vertical */}
                {subAction === null && (
                  <div className="flex flex-col gap-2">
                    <Button className="w-full h-11 bg-green-600 hover:bg-green-700 text-white font-bold text-sm justify-start" disabled={actioning}
                      onClick={() => onAction("approve", { adminNote: note || null, vehicleType })}>
                      <Check className="h-4 w-4 mr-2" />
                      Aprouve ({vehicleType === "car" ? t("adminApps.vehicleCar") : t("adminApps.vehicleMoto")})
                    </Button>
                    <Button variant="outline" className="w-full h-11 text-sm text-blue-600 border-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/20 font-bold justify-start" disabled={actioning}
                      onClick={() => setSubAction("changes")}>
                      <PenLine className="h-4 w-4 mr-2" />Mande plis dokiman
                    </Button>
                    <Button variant="outline" className="w-full h-11 text-sm text-red-600 border-red-200 hover:bg-red-50 dark:hover:bg-red-950/20 font-bold justify-start" disabled={actioning}
                      onClick={() => setSubAction("reject")}>
                      <X className="h-4 w-4 mr-2" />Rejte
                    </Button>
                    <Button variant="outline" className="w-full h-11 text-sm text-gray-500 border-gray-200 hover:bg-gray-50 dark:hover:bg-gray-900/20 font-bold justify-start" disabled={actioning}
                      onClick={() => setSuspendForm(true)}>
                      <Ban className="h-4 w-4 mr-2" />Sipann chofè
                    </Button>
                  </div>
                )}
              </>
            )}

            {app.status === "approved" && (
              !suspendForm ? (
                <Button size="sm" variant="outline" className="h-9 text-xs text-red-600 border-red-200 hover:bg-red-50 dark:hover:bg-red-950/20 font-bold" disabled={actioning}
                  onClick={() => setSuspendForm(true)}>
                  <Ban className="h-3.5 w-3.5 mr-1" />{t("adminApps.suspendDriver")}
                </Button>
              ) : (
                <div className="p-4 rounded-2xl bg-red-50/60 dark:bg-red-900/10 border border-red-200/60 dark:border-red-800/40 space-y-3">
                  <p className="text-xs font-black text-red-700 dark:text-red-300">{t("adminApps.confirmSuspendDriver")}</p>
                  <input className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                    placeholder={t("adminApps.suspendReasonPlaceholder")} value={suspendReason} onChange={e => setSuspendReason(e.target.value)} />
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-black text-muted-foreground">{t("adminApps.durationLabel")}</span>
                    {[{ v: "3", l: "3j" }, { v: "7", l: "7j" }, { v: "14", l: "14j" }, { v: "30", l: "30j" }, { v: "0", l: "∞" }].map(opt => (
                      <button key={opt.v} type="button" onClick={() => setSuspendDuration(opt.v)}
                        className={`text-[10px] font-black px-2.5 py-1.5 rounded-xl border-2 transition-all ${suspendDuration === opt.v ? "bg-red-600 text-white border-red-600" : "border-border bg-background hover:bg-accent"}`}>
                        {opt.l}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" className="h-9 px-4 bg-red-600 hover:bg-red-700 text-white font-bold text-xs" disabled={actioning}
                      onClick={() => onAction("suspend", { reason: suspendReason || "Policy violation", durationDays: suspendDuration === "0" ? 0 : parseInt(suspendDuration) })}>
                      {t("adminApps.suspendBtn")}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-9 text-xs" onClick={() => setSuspendForm(false)}>{t("adminApps.cancel")}</Button>
                  </div>
                </div>
              )
            )}

            {app.status === "suspended" && (
              <div className="flex items-center justify-between p-3 bg-red-50/50 dark:bg-red-900/10 rounded-2xl border border-red-200/50 dark:border-red-800/30">
                <span className="text-xs text-red-600 dark:text-red-400 font-semibold flex items-center gap-1.5">
                  <Ban className="h-3.5 w-3.5" /> {t("adminApps.driverSuspendedNow")}
                </span>
                <Button size="sm" className="h-8 text-xs bg-green-600 hover:bg-green-700 text-white font-bold" disabled={actioning}
                  onClick={() => onAction("unsuspend")}>
                  <Unlock className="h-3 w-3 mr-1" />{t("adminApps.unsuspend")}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Agent Application Card ───────────────────────────────────────────────────

function AgentAppCard({ app, expanded, onToggle, onAction, actioning }: {
  app: any; expanded: boolean; onToggle: () => void;
  onAction: (type: string, payload?: object) => Promise<void>;
  actioning: boolean;
}) {
  const { t } = useTranslation();
  const [note, setNote] = useState(app.adminNote ?? "");
  const [changesReason, setChangesReason] = useState("");
  const [monthlyLimit, setMonthlyLimit] = useState(String(app.monthlyLimitUsd ?? "15000"));
  const [suspendForm, setSuspendForm] = useState(false);
  const [suspendReason, setSuspendReason] = useState("");
  const [suspendDuration, setSuspendDuration] = useState("7");
  const [subAction, setSubAction] = useState<"reject" | "changes" | null>(null);
  const [activeTab, setActiveTab] = useState<"info" | "docs" | "risk" | "timeline">("info");

  const AGENT_REJECT_KEYS = [
    "adminApps.agentRejectGovIdInvalid",
    "adminApps.agentRejectSelfieUnclear",
    "adminApps.agentRejectAddressExpired",
    "adminApps.agentRejectBusinessIncomplete",
    "adminApps.agentRejectDuplicate",
    "adminApps.agentRejectSuspicious",
    "adminApps.agentRejectForgery",
  ];

  const risk = computeAgentRisk(app);
  const docPct = agentDocPct(app);

  const borderGlow = app.status === "pending" ? "border-violet-200/60 dark:border-violet-700/40"
    : app.status === "approved" ? "border-green-200/60 dark:border-green-700/40"
    : app.status === "needs_changes" ? "border-blue-200/60 dark:border-blue-700/40"
    : "border-border";
  const headerBg = app.status === "pending" ? "from-violet-50/80 to-purple-50/40 dark:from-violet-900/10 dark:to-purple-900/5"
    : app.status === "approved" ? "from-green-50/80 to-emerald-50/40 dark:from-green-900/10 dark:to-emerald-900/5"
    : app.status === "needs_changes" ? "from-blue-50/80 to-indigo-50/40 dark:from-blue-900/10 dark:to-indigo-900/5"
    : "from-card to-card";

  return (
    <div className={`rounded-2xl border overflow-hidden transition-all shadow-sm bg-card ${borderGlow}`}>
      {/* Header */}
      <div className={`flex items-center gap-3 px-4 py-3 bg-gradient-to-r ${headerBg}`}>
        <div className="relative shrink-0">
          <Avatar className="h-12 w-12 ring-2 ring-border">
            {app.selfieWithId && <AvatarImage src={app.selfieWithId} className="object-cover" />}
            <AvatarFallback className="bg-gradient-to-br from-violet-600 to-purple-700 text-white font-bold text-sm">
              {app.fullName?.[0]}
            </AvatarFallback>
          </Avatar>
          <span className="absolute -bottom-1 -right-1 text-base bg-white dark:bg-gray-800 rounded-full p-0.5 shadow-sm">🏦</span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-bold">{app.fullName}</p>
            <StatusPill status={app.status} />
            {app.status === "approved" && app.monthlyLimitUsd && (
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 border border-violet-200/60 dark:border-violet-800/40">
                ${Number(app.monthlyLimitUsd).toLocaleString()}{t("adminApps.monthLabel")}
              </span>
            )}
            <RiskBadge {...risk} />
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{app.city}, {app.country}</span>
            {app.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{app.phone}</span>}
            <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{fmtDate(app.createdAt)}</span>
          </div>
          <div className="mt-1.5 max-w-xs">
            <DocCompletionBar pct={docPct} label={t("adminApps.docCompletionLabel")} />
          </div>
        </div>

        <button type="button" className="shrink-0 p-2 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-muted-foreground" onClick={onToggle}>
          <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} />
        </button>
      </div>

      {/* Expanded panel */}
      {expanded && (
        <div className="border-t border-border bg-background">
          {/* Sub-tabs */}
          <div className="flex border-b border-border">
            {([
              { k: "info",     label: t("adminApps.tabInfo"),     icon: User },
              { k: "docs",     label: t("adminApps.tabDocs"),     icon: FileText },
              { k: "risk",     label: t("adminApps.tabRisk"),     icon: Shield },
              { k: "timeline", label: t("adminApps.tabTimeline"), icon: Activity },
            ] as const).map(tab => (
              <button key={tab.k} type="button" onClick={() => setActiveTab(tab.k)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[11px] font-semibold transition-all border-b-2 ${activeTab === tab.k ? "border-violet-500 text-violet-600 dark:text-violet-400" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                <tab.icon className="h-3 w-3" />
                {tab.label}
              </button>
            ))}
          </div>

          <div className="px-4 py-4 space-y-4">
            {activeTab === "info" && (
              <InfoGrid items={[
                { label: t("adminApps.fieldFullName"),         value: app.fullName,            icon: <User className="h-3 w-3" /> },
                { label: t("adminApps.fieldEmail"),            value: app.userEmail },
                { label: "WhatsApp",                           value: app.whatsappNumber ?? app.phone, icon: <MessageSquare className="h-3 w-3" /> },
                { label: t("adminApps.fieldPhone"),            value: app.phone,               icon: <Phone className="h-3 w-3" /> },
                { label: t("adminApps.fieldAddress"),          value: app.address,             icon: <MapPin className="h-3 w-3" /> },
                { label: t("adminApps.fieldCity"),             value: app.city },
                { label: t("adminApps.fieldBusiness"),         value: app.businessName,        icon: <Building2 className="h-3 w-3" /> },
                { label: t("adminApps.fieldBusinessType"),     value: app.businessType },
                { label: t("adminApps.fieldBusinessLocation"), value: app.businessLocation,    icon: <Globe className="h-3 w-3" /> },
                { label: t("adminApps.fieldExchangeActivity"), value: app.exchangeActivityType, icon: <TrendingUp className="h-3 w-3" /> },
              ]} />
            )}

            {activeTab === "docs" && (
              <PhotoGrid label={t("adminApps.photoGridKyc")} photos={[
                { url: app.govIdFront,      title: t("adminApps.photoIdFront") },
                { url: app.govIdBack,       title: t("adminApps.photoIdBack") },
                { url: app.selfieWithId,    title: t("adminApps.photoSelfieWithId") },
                { url: app.proofOfAddress,  title: t("adminApps.photoProofAddress") },
              ]} />
            )}

            {activeTab === "risk" && (
              <div className="space-y-4">
                <div className={`rounded-2xl p-4 border-2 ${risk.level === "low" ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800" : risk.level === "medium" ? "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800" : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"}`}>
                  <div className="flex items-center gap-3 mb-3">
                    {risk.level === "low" ? <Shield className="h-8 w-8 text-green-600" /> : risk.level === "medium" ? <AlertTriangle className="h-8 w-8 text-amber-600" /> : <AlertCircle className="h-8 w-8 text-red-600" />}
                    <div>
                      <p className="font-black text-lg">{risk.score}% — {risk.level === "low" ? t("adminApps.riskLow") : risk.level === "medium" ? t("adminApps.riskMedium") : t("adminApps.riskHigh")}</p>
                      <p className="text-xs text-muted-foreground">{t("adminApps.riskBasisAgent")}</p>
                    </div>
                  </div>
                  <div className="h-3 bg-white/60 dark:bg-black/20 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-700 ${risk.level === "low" ? "bg-green-500" : risk.level === "medium" ? "bg-amber-500" : "bg-red-500"}`}
                      style={{ width: `${risk.score}%` }} />
                  </div>
                </div>
                {risk.flagKeys.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-[11px] font-black text-muted-foreground uppercase tracking-wide">{t("adminApps.riskIssuesCount", { count: risk.flagKeys.length })}</p>
                    {risk.flagKeys.map((fk, i) => (
                      <div key={i} className="flex items-center gap-2.5 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200/60 dark:border-amber-800/40">
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                        <span className="text-xs font-medium text-amber-800 dark:text-amber-300">{t(fk)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-2.5 px-3 py-3 bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-200/60 dark:border-green-800/40">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span className="text-xs font-semibold text-green-700 dark:text-green-300">{t("adminApps.riskAllClearAgent")}</span>
                  </div>
                )}
              </div>
            )}

            {activeTab === ("timeline" as any) && <AppTimeline app={app} />}
          </div>

          {/* Notes display */}
          {(app.adminNote || app.changesRequestedReason) && (
            <div className="px-4 pb-2 space-y-2">
              {app.adminNote && (
                <div className="bg-muted/60 rounded-xl px-3 py-2.5 text-xs flex gap-2">
                  <Info className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                  <span><span className="font-bold">{t("adminApps.adminNote")}</span> {app.adminNote}</span>
                </div>
              )}
              {app.changesRequestedReason && (
                <div className="bg-blue-50 dark:bg-blue-950/30 rounded-xl px-3 py-2.5 text-xs border border-blue-200/60 dark:border-blue-800/40 flex gap-2">
                  <PenLine className="h-3.5 w-3.5 text-blue-600 shrink-0 mt-0.5" />
                  <span><span className="font-bold text-blue-700 dark:text-blue-300">{t("adminApps.changesNote")}</span> <span className="text-blue-600 dark:text-blue-400">{app.changesRequestedReason}</span></span>
                </div>
              )}
            </div>
          )}

          {/* Action area */}
          <div className="px-4 pb-4 pt-2 border-t border-border space-y-3">
            {(app.status === "pending" || app.status === "needs_changes") && (
              <>
                <div>
                  <p className="text-[10px] font-black text-muted-foreground mb-2 uppercase tracking-wider">{t("adminApps.monthlyLimitLabel")}</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    {["5000", "10000", "15000", "25000"].map(amt => (
                      <button key={amt} type="button" onClick={() => setMonthlyLimit(amt)}
                        className={`text-xs font-bold px-3 py-2 rounded-xl border-2 transition-all ${monthlyLimit === amt ? "bg-violet-600 text-white border-violet-600 shadow-sm" : "border-border bg-background hover:bg-accent"}`}>
                        ${parseInt(amt).toLocaleString()}
                      </button>
                    ))}
                    <input type="number"
                      className="h-9 w-28 rounded-xl border-2 border-border bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                      placeholder={t("adminApps.customAmountPlaceholder")} value={monthlyLimit} onChange={e => setMonthlyLimit(e.target.value)} />
                  </div>
                </div>

                <textarea
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-violet-400/50"
                  rows={2} placeholder={t("adminApps.notePlaceholderAgent")} value={note} onChange={e => setNote(e.target.value)} />

                {subAction === "reject" && (
                  <div className="p-4 rounded-2xl bg-red-50/80 dark:bg-red-900/20 border border-red-200/60 dark:border-red-800/40 space-y-3">
                    <p className="text-xs font-black text-red-700 dark:text-red-300 flex items-center gap-1.5"><X className="h-3.5 w-3.5" />{t("adminApps.confirmReject")}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {AGENT_REJECT_KEYS.map(rk => (
                        <button key={rk} type="button" onClick={() => setNote(t(rk))}
                          className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border transition-all ${note === t(rk) ? "bg-red-600 text-white border-red-600" : "border-red-200 dark:border-red-700 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/40"}`}>
                          {t(rk)}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" className="h-9 px-4 bg-red-600 hover:bg-red-700 text-white font-bold text-xs" disabled={actioning}
                        onClick={() => onAction("reject", { adminNote: note || null })}>
                        <X className="h-3.5 w-3.5 mr-1" />{t("adminApps.confirmRejectBtn")}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-9 text-xs" onClick={() => setSubAction(null)}>{t("adminApps.cancel")}</Button>
                    </div>
                  </div>
                )}

                {subAction === "changes" && (
                  <div className="p-4 rounded-2xl bg-blue-50/80 dark:bg-blue-900/20 border border-blue-200/60 dark:border-blue-800/40 space-y-3">
                    <p className="text-xs font-black text-blue-700 dark:text-blue-300 flex items-center gap-1.5"><PenLine className="h-3.5 w-3.5" />{t("adminApps.requestChanges")}</p>
                    <textarea
                      className="w-full rounded-xl border border-blue-200 dark:border-blue-700 bg-background px-3 py-2 text-sm placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-blue-400"
                      rows={2} placeholder={t("adminApps.changesPlaceholderAgent")}
                      value={changesReason} onChange={e => setChangesReason(e.target.value)} />
                    <div className="flex gap-2">
                      <Button size="sm" className="h-9 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs" disabled={actioning || !changesReason.trim()}
                        onClick={() => onAction("request-changes", { adminNote: note || null, changesRequestedReason: changesReason })}>
                        <PenLine className="h-3.5 w-3.5 mr-1" />{t("adminApps.sendChanges")}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-9 text-xs" onClick={() => setSubAction(null)}>{t("adminApps.cancel")}</Button>
                    </div>
                  </div>
                )}

                {subAction === null && (
                  <div className="grid grid-cols-3 gap-2">
                    <Button className="h-11 bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-700 hover:to-purple-800 text-white font-bold text-xs shadow-sm" disabled={actioning}
                      onClick={() => onAction("approve", { adminNote: note || null, monthlyLimitUsd: parseFloat(monthlyLimit) || 15000 })}>
                      <Check className="h-4 w-4 mr-1" />
                      <span>{t("adminApps.approveBtn")}<br/><span className="font-normal opacity-80 text-[9px]">${parseInt(monthlyLimit||"15000").toLocaleString()}{t("adminApps.monthLabel")}</span></span>
                    </Button>
                    <Button variant="outline" className="h-11 text-xs text-blue-600 border-blue-200 hover:bg-blue-50 dark:hover:bg-blue-950/20 font-bold" disabled={actioning}
                      onClick={() => setSubAction("changes")}>
                      <PenLine className="h-4 w-4 mr-1" />{t("adminApps.changesBtn")}
                    </Button>
                    <Button variant="outline" className="h-11 text-xs text-red-600 border-red-200 hover:bg-red-50 dark:hover:bg-red-950/20 font-bold" disabled={actioning}
                      onClick={() => setSubAction("reject")}>
                      <X className="h-4 w-4 mr-1" />{t("adminApps.rejectBtn")}
                    </Button>
                  </div>
                )}
              </>
            )}

            {app.status === "approved" && (
              !suspendForm ? (
                <Button size="sm" variant="outline" className="h-9 text-xs text-red-600 border-red-200 hover:bg-red-50 dark:hover:bg-red-950/20 font-bold" disabled={actioning}
                  onClick={() => setSuspendForm(true)}>
                  <Ban className="h-3.5 w-3.5 mr-1" />{t("adminApps.suspendAgent")}
                </Button>
              ) : (
                <div className="p-4 rounded-2xl bg-red-50/60 dark:bg-red-900/10 border border-red-200/60 dark:border-red-800/40 space-y-3">
                  <p className="text-xs font-black text-red-700 dark:text-red-300">{t("adminApps.confirmSuspendAgent")}</p>
                  <input className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                    placeholder={t("adminApps.suspendAgentReasonPlaceholder")} value={suspendReason} onChange={e => setSuspendReason(e.target.value)} />
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-black text-muted-foreground">{t("adminApps.durationLabel")}</span>
                    {[{ v: "7", l: "7j" }, { v: "14", l: "14j" }, { v: "30", l: "30j" }, { v: "90", l: "90j" }, { v: "0", l: "∞" }].map(opt => (
                      <button key={opt.v} type="button" onClick={() => setSuspendDuration(opt.v)}
                        className={`text-[10px] font-black px-2.5 py-1.5 rounded-xl border-2 transition-all ${suspendDuration === opt.v ? "bg-red-600 text-white border-red-600" : "border-border bg-background hover:bg-accent"}`}>
                        {opt.l}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" className="h-9 px-4 bg-red-600 hover:bg-red-700 text-white font-bold text-xs" disabled={actioning}
                      onClick={() => onAction("suspend", { reason: suspendReason || "Policy violation", durationDays: suspendDuration === "0" ? 0 : parseInt(suspendDuration) })}>
                      {t("adminApps.suspendBtn")}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-9 text-xs" onClick={() => setSuspendForm(false)}>{t("adminApps.cancel")}</Button>
                  </div>
                </div>
              )
            )}

            {app.status === "suspended" && (
              <div className="flex items-center justify-between p-3 bg-red-50/50 dark:bg-red-900/10 rounded-2xl border border-red-200/50 dark:border-red-800/30">
                <span className="text-xs text-red-600 dark:text-red-400 font-semibold flex items-center gap-1.5">
                  <Ban className="h-3.5 w-3.5" /> {t("adminApps.agentSuspendedNow")}
                </span>
                <Button size="sm" className="h-8 text-xs bg-green-600 hover:bg-green-700 text-white font-bold" disabled={actioning}
                  onClick={() => onAction("unsuspend")}>
                  <Unlock className="h-3 w-3 mr-1" />{t("adminApps.unsuspend")}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Add Agent Manually Modal ─────────────────────────────────────────────────

function AddAgentManualModal({
  onClose,
  onSuccess,
  adminUser,
}: {
  onClose: () => void;
  onSuccess: () => void;
  adminUser: any;
}) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const isSuperAdmin = !!(adminUser?.isSuperAdmin || adminUser?.role === "super_admin");

  // Derive admin's locked country scope
  let adminCountry = "";
  if (!isSuperAdmin) {
    try {
      const parsed = adminUser?.adminScopeCountries ? JSON.parse(adminUser.adminScopeCountries) : [];
      adminCountry = parsed[0] ?? adminUser?.adminScopeCountry ?? "";
    } catch {
      adminCountry = adminUser?.adminScopeCountry ?? "";
    }
  }

  // Step 1: search, Step 2: form
  const [step, setStep] = useState<1 | 2>(1);
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);

  // Form fields
  const [fullName, setFullName] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState(adminCountry);
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [monthlyLimit, setMonthlyLimit] = useState("15000");
  const [adminNote, setAdminNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!searchQ.trim() || searchQ.length < 2) { setSearchResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const token = localStorage.getItem("flexamarket_token");
        const res = await fetch(`/api/admin/agent-user-search?q=${encodeURIComponent(searchQ)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        setSearchResults(data.users ?? []);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [searchQ]);

  function selectUser(u: any) {
    setSelectedUser(u);
    setFullName(u.name ?? "");
    setCity(u.city ?? "");
    setCountry(isSuperAdmin ? (u.country ?? "") : adminCountry);
    setPhone(u.phone ?? "");
    setWhatsapp(u.phone ?? "");
    setStep(2);
  }

  async function handleSubmit() {
    if (!selectedUser || !fullName.trim() || !city.trim() || !country.trim() || !phone.trim()) {
      toast({ title: t("adminApps.manualModalRequiredFields"), variant: "destructive" }); return;
    }
    setSubmitting(true);
    try {
      const token = localStorage.getItem("flexamarket_token");
      const res = await fetch("/api/admin/agents/add-manual", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: selectedUser.id,
          fullName: fullName.trim(),
          city: city.trim(),
          country: country.trim(),
          phone: phone.trim(),
          whatsappNumber: whatsapp.trim() || phone.trim(),
          businessName: businessName.trim() || null,
          monthlyLimitUsd: parseFloat(monthlyLimit) || 15000,
          adminNote: adminNote.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? t("common.error"));
      toast({ title: t("adminApps.manualModalSuccessTitle"), description: t("adminApps.manualModalSuccessDesc", { name: fullName }) });
      onSuccess();
      onClose();
    } catch (err: any) {
      toast({ title: "Erè", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-md bg-card border border-border rounded-3xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 bg-gradient-to-r from-violet-600 to-purple-700 text-white">
          {step === 2 && (
            <button type="button" onClick={() => setStep(1)} className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 transition-colors mr-1">
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <div className="p-2 rounded-xl bg-white/15">
            <UserPlus className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-black text-sm">{t("adminApps.manualModalTitle")}</h3>
            <p className="text-[11px] text-white/70">
              {step === 1 ? t("adminApps.manualModalStep1Sub") : t("adminApps.manualModalStep2Sub")}
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 transition-colors">
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {step === 1 ? (
            <>
              {/* Scope badge for regular admin */}
              {!isSuperAdmin && adminCountry && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-violet-50 dark:bg-violet-900/20 border border-violet-200/60 dark:border-violet-800/40 text-xs font-semibold text-violet-700 dark:text-violet-300">
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  {t("adminApps.manualModalScopeAdmin", { country: adminCountry })}
                </div>
              )}
              {isSuperAdmin && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200/60 dark:border-emerald-800/40 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                  <Shield className="h-3.5 w-3.5 shrink-0" />
                  {t("adminApps.manualModalScopeSuperAdmin")}
                </div>
              )}

              {/* Search input */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  autoFocus
                  type="text"
                  className="w-full rounded-2xl border-2 border-border bg-background pl-10 pr-4 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-violet-400/50 focus:border-violet-400/50 transition-all"
                  placeholder={t("adminApps.manualModalSearchPlaceholder")}
                  value={searchQ}
                  onChange={e => setSearchQ(e.target.value)}
                />
                {searching && (
                  <RefreshCw className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground animate-spin" />
                )}
              </div>

              {/* Results */}
              {searchResults.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-[10px] font-black text-muted-foreground uppercase tracking-wide">{t("adminApps.manualModalResultsCount", { count: searchResults.length })}</p>
                  {searchResults.map(u => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => selectUser(u)}
                      className="w-full flex items-center gap-3 px-3 py-3 rounded-2xl border-2 border-border hover:border-violet-400 hover:bg-violet-50/50 dark:hover:bg-violet-900/20 transition-all text-left group"
                    >
                      <Avatar className="h-10 w-10 shrink-0 ring-2 ring-border group-hover:ring-violet-400 transition-all">
                        {u.avatar && <AvatarImage src={u.avatar} className="object-cover" />}
                        <AvatarFallback className="bg-gradient-to-br from-violet-500 to-purple-600 text-white text-xs font-bold">
                          {(u.name ?? "?")[0].toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-foreground truncate">{u.name}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{u.email}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {u.phone && <span className="text-[10px] text-muted-foreground">{u.phone}</span>}
                          {u.accountNumber && <span className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded-md">{u.accountNumber}</span>}
                          {u.country && <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded-md">{u.country}</span>}
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-violet-500 transition-colors shrink-0" />
                    </button>
                  ))}
                </div>
              ) : searchQ.length >= 2 && !searching ? (
                <div className="flex flex-col items-center gap-3 py-8 text-center">
                  <User className="h-10 w-10 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">{t("adminApps.manualModalNoResults", { query: searchQ })}</p>
                </div>
              ) : searchQ.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-8 text-center">
                  <Search className="h-10 w-10 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">{t("adminApps.manualModalEmptyState")}</p>
                </div>
              ) : null}
            </>
          ) : (
            <>
              {/* Selected user badge */}
              {selectedUser && (
                <div className="flex items-center gap-3 px-3 py-2.5 rounded-2xl bg-violet-50 dark:bg-violet-900/20 border border-violet-200/60 dark:border-violet-800/40">
                  <Avatar className="h-9 w-9 shrink-0">
                    {selectedUser.avatar && <AvatarImage src={selectedUser.avatar} className="object-cover" />}
                    <AvatarFallback className="bg-gradient-to-br from-violet-500 to-purple-600 text-white text-xs font-bold">
                      {(selectedUser.name ?? "?")[0].toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-violet-700 dark:text-violet-300 truncate">{selectedUser.name}</p>
                    <p className="text-[10px] text-violet-600/70 dark:text-violet-400/70 truncate">{selectedUser.email} · ID #{selectedUser.id}</p>
                  </div>
                  <CheckCircle2 className="h-4 w-4 text-violet-500 shrink-0 ml-auto" />
                </div>
              )}

              {/* Form */}
              <div className="space-y-3">
                {/* Full name */}
                <div>
                  <label className="text-[10px] font-black text-muted-foreground uppercase tracking-wide mb-1 flex items-center gap-1">
                    <User className="h-3 w-3" /> {t("adminApps.manualModalLabelFullName")}
                  </label>
                  <input
                    type="text"
                    className="w-full rounded-xl border-2 border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400/50 transition-all"
                    placeholder={t("adminApps.manualModalPlaceholderFullName")}
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                  />
                </div>

                {/* City + Country */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-black text-muted-foreground uppercase tracking-wide mb-1 flex items-center gap-1">
                      <MapPin className="h-3 w-3" /> {t("adminApps.manualModalLabelCity")}
                    </label>
                    <input
                      type="text"
                      className="w-full rounded-xl border-2 border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400/50 transition-all"
                      placeholder={t("adminApps.manualModalPlaceholderCity")}
                      value={city}
                      onChange={e => setCity(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-muted-foreground uppercase tracking-wide mb-1 flex items-center gap-1">
                      <Globe className="h-3 w-3" /> {t("adminApps.manualModalLabelCountry")}
                    </label>
                    <input
                      type="text"
                      className={`w-full rounded-xl border-2 border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400/50 transition-all ${!isSuperAdmin ? "opacity-60 cursor-not-allowed" : ""}`}
                      placeholder="HT"
                      value={country}
                      onChange={e => isSuperAdmin && setCountry(e.target.value)}
                      readOnly={!isSuperAdmin}
                    />
                  </div>
                </div>

                {/* Phone + WhatsApp */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-black text-muted-foreground uppercase tracking-wide mb-1 flex items-center gap-1">
                      <Phone className="h-3 w-3" /> {t("adminApps.manualModalLabelPhone")}
                    </label>
                    <input
                      type="tel"
                      className="w-full rounded-xl border-2 border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400/50 transition-all"
                      placeholder="+509 …"
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-muted-foreground uppercase tracking-wide mb-1 flex items-center gap-1">
                      <MessageSquare className="h-3 w-3" /> {t("adminApps.manualModalLabelWhatsApp")}
                    </label>
                    <input
                      type="tel"
                      className="w-full rounded-xl border-2 border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400/50 transition-all"
                      placeholder="+509 …"
                      value={whatsapp}
                      onChange={e => setWhatsapp(e.target.value)}
                    />
                  </div>
                </div>

                {/* Business name */}
                <div>
                  <label className="text-[10px] font-black text-muted-foreground uppercase tracking-wide mb-1 flex items-center gap-1">
                    <Building2 className="h-3 w-3" /> {t("adminApps.manualModalLabelBusiness")}
                  </label>
                  <input
                    type="text"
                    className="w-full rounded-xl border-2 border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400/50 transition-all"
                    placeholder={t("adminApps.manualModalPlaceholderBusiness")}
                    value={businessName}
                    onChange={e => setBusinessName(e.target.value)}
                  />
                </div>

                {/* Monthly limit */}
                <div>
                  <label className="text-[10px] font-black text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                    <DollarSign className="h-3 w-3" /> {t("adminApps.manualModalLabelLimit")}
                  </label>
                  <div className="flex items-center gap-2 flex-wrap">
                    {["5000", "10000", "15000", "25000"].map(amt => (
                      <button key={amt} type="button" onClick={() => setMonthlyLimit(amt)}
                        className={`text-xs font-bold px-3 py-1.5 rounded-xl border-2 transition-all ${monthlyLimit === amt ? "bg-violet-600 text-white border-violet-600" : "border-border bg-background hover:bg-accent"}`}>
                        ${parseInt(amt).toLocaleString()}
                      </button>
                    ))}
                    <input
                      type="number"
                      className="h-8 w-24 rounded-xl border-2 border-border bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                      placeholder={t("adminApps.manualModalPlaceholderCustom")}
                      value={monthlyLimit}
                      onChange={e => setMonthlyLimit(e.target.value)}
                    />
                  </div>
                </div>

                {/* Admin note */}
                <div>
                  <label className="text-[10px] font-black text-muted-foreground uppercase tracking-wide mb-1 flex items-center gap-1">
                    <FileText className="h-3 w-3" /> {t("adminApps.manualModalLabelNote")}
                  </label>
                  <textarea
                    className="w-full rounded-xl border-2 border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-violet-400/50 transition-all"
                    rows={2}
                    placeholder={t("adminApps.manualModalPlaceholderNote")}
                    value={adminNote}
                    onChange={e => setAdminNote(e.target.value)}
                  />
                </div>
              </div>

              {/* Warning banner */}
              <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200/60 dark:border-amber-800/40 text-xs text-amber-700 dark:text-amber-300">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>{t("adminApps.manualModalWarning")}</span>
              </div>

              {/* Submit */}
              <Button
                className="w-full h-12 bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-700 hover:to-purple-800 text-white font-black text-sm shadow-lg shadow-violet-200 dark:shadow-violet-900/40 rounded-2xl"
                disabled={submitting || !fullName.trim() || !city.trim() || !country.trim() || !phone.trim()}
                onClick={handleSubmit}
              >
                {submitting ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <UserPlus className="h-4 w-4 mr-2" />
                )}
                {submitting ? t("adminApps.manualModalSubmitting") : t("adminApps.manualModalSubmitBtn")}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Premium Stat Header ──────────────────────────────────────────────────────

function PremiumStatHeader({
  apps, isDriver, onFilterSelect,
}: {
  apps: any[]; isDriver: boolean; onFilterSelect: (f: AppStatus) => void;
}) {
  const { t } = useTranslation();
  const counts = { pending: 0, approved: 0, rejected: 0, suspended: 0, needs_changes: 0 };
  for (const a of apps) { if (a.status in counts) counts[a.status as keyof typeof counts]++; }
  const stats = [
    { key: "pending" as const,       label: t("adminApps.filterPending"),  value: counts.pending,       icon: Clock,         gradient: "from-amber-500 to-orange-500",     glow: "shadow-amber-200 dark:shadow-amber-900/40" },
    { key: "approved" as const,      label: t("adminApps.filterApproved"), value: counts.approved,      icon: CheckCircle2,  gradient: "from-green-500 to-emerald-600",     glow: "shadow-green-200 dark:shadow-green-900/40" },
    { key: "needs_changes" as const, label: t("adminApps.filterChanges"),  value: counts.needs_changes, icon: PenLine,       gradient: "from-blue-500 to-indigo-600",       glow: "shadow-blue-200 dark:shadow-blue-900/40" },
    { key: "rejected" as const,      label: t("adminApps.filterRejected"), value: counts.rejected,      icon: X,             gradient: "from-red-500 to-rose-600",          glow: "shadow-red-200 dark:shadow-red-900/40" },
    { key: "suspended" as const,     label: t("adminApps.filterSuspended"),value: counts.suspended,     icon: Ban,           gradient: "from-gray-500 to-slate-600",        glow: "shadow-gray-200 dark:shadow-gray-900/40" },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
      {stats.map(s => {
        const Icon = s.icon;
        return (
          <button key={s.key} type="button" onClick={() => onFilterSelect(s.key)}
            className={`relative overflow-hidden rounded-2xl p-3 text-left transition-all hover:scale-[1.02] active:scale-[0.98] bg-gradient-to-br ${s.gradient} text-white shadow-sm ${s.glow} hover:shadow-md`}>
            <div className="absolute top-0 right-0 w-16 h-16 rounded-full bg-white/10 -translate-y-4 translate-x-4" />
            <Icon className="h-4 w-4 opacity-80 mb-2" />
            <p className="text-2xl font-black">{s.value}</p>
            <p className="text-[10px] font-semibold opacity-80 mt-0.5">{s.label}</p>
          </button>
        );
      })}
    </div>
  );
}

// ─── Main exported panel ──────────────────────────────────────────────────────

export default function AdminApplicationsPanel({
  type,
  scopeLock = null,
}: {
  type: "driver" | "agent";
  scopeLock?: string | null;
}) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const { user } = useAuth();
  const isDriver = type === "driver";

  const [apps, setApps] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<AppStatus>("pending");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [actioning, setActioning] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const [showAddManual, setShowAddManual] = useState(false);
  const PAGE_SIZE = 10;

  const apiBase = isDriver ? "/api/admin/delivery/applications" : "/api/admin/agents";

  const load = useCallback(async (statusFilter: AppStatus = filter) => {
    setLoading(true);
    try {
      const qs = statusFilter !== "all" ? `?status=${statusFilter}` : "";
      const data = await adminFetch(`${apiBase}${qs}`, "GET");
      setApps(data.applications ?? []);
      setPage(0);
    } catch (err: any) {
      toast({ title: t("adminApps.toastError"), description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [filter, apiBase, toast, t]);

  useEffect(() => { load(); }, []);

  const handleAction = useCallback(async (appId: number, actionType: string, payload?: object) => {
    setActioning(appId);
    try {
      await adminFetch(`${apiBase}/${appId}/${actionType}`, "PATCH", payload);
      const labels: Record<string, string> = {
        approve: t("adminApps.toastApproved"),
        reject: t("adminApps.toastRejected"),
        "request-changes": t("adminApps.toastChanges"),
        suspend: t("adminApps.toastSuspended"),
        unsuspend: t("adminApps.toastUnsuspended"),
      };
      toast({ title: labels[actionType] ?? t("adminApps.toastDone") });
      await load(filter);
      setExpanded(null);
    } catch (err: any) {
      toast({ title: t("adminApps.toastError"), description: err.message, variant: "destructive" });
    } finally {
      setActioning(null);
    }
  }, [apiBase, filter, load, toast, t]);

  const filtered = apps.filter(a => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const name = isDriver ? `${a.firstName ?? ""} ${a.lastName ?? ""}` : (a.fullName ?? "");
    return (
      name.toLowerCase().includes(q) ||
      (a.userEmail ?? "").toLowerCase().includes(q) ||
      (a.city ?? "").toLowerCase().includes(q) ||
      (a.country ?? "").toLowerCase().includes(q) ||
      (a.phone ?? "").includes(q) ||
      (a.callPhone ?? "").includes(q) ||
      (a.whatsappNumber ?? "").includes(q)
    );
  });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const filterOpts: { v: AppStatus; label: string }[] = [
    { v: "pending",       label: t("adminApps.filterPending") },
    { v: "needs_changes", label: t("adminApps.filterChanges") },
    { v: "approved",      label: t("adminApps.filterApproved") },
    { v: "rejected",      label: t("adminApps.filterRejected") },
    { v: "suspended",     label: t("adminApps.filterSuspended") },
    { v: "all",           label: t("adminApps.filterAll") },
  ];

  return (
    <>
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-black flex items-center gap-2">
            <span className={`p-2 rounded-xl ${isDriver ? "bg-gradient-to-br from-orange-500 to-red-600" : "bg-gradient-to-br from-violet-600 to-purple-700"} text-white shadow-sm`}>
              {isDriver ? <Truck className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
            </span>
            {isDriver ? t("adminApps.panelTitleDriver") : t("adminApps.panelTitleAgent")}
            {scopeLock && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 border border-green-200/60 dark:border-green-800/40">
                <MapPin className="h-2.5 w-2.5" />{scopeLock}
              </span>
            )}
          </h2>
          <p className="text-xs text-muted-foreground mt-1 ml-10">
            {isDriver ? t("adminApps.panelSubtitleDriver") : t("adminApps.panelSubtitleAgent")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!isDriver && (
            <Button
              size="sm"
              className="h-9 text-xs font-bold bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-700 hover:to-purple-800 text-white shadow-sm shadow-violet-200 dark:shadow-violet-900/30"
              onClick={() => setShowAddManual(true)}
            >
              <UserPlus className="h-3.5 w-3.5 mr-1.5" />
              Ajoute Ajan Manuel
            </Button>
          )}
          <Button size="sm" variant="outline" className="h-9 text-xs font-semibold" onClick={() => load(filter)} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            {t("adminApps.refresh")}
          </Button>
        </div>
      </div>

      {/* Premium stat header */}
      {apps.length > 0 && (
        <PremiumStatHeader
          apps={apps}
          isDriver={isDriver}
          onFilterSelect={(f) => { setFilter(f); load(f); }}
        />
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          className="w-full rounded-2xl border-2 border-border bg-background pl-10 pr-4 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50 transition-all"
          placeholder={isDriver ? t("adminApps.searchPlaceholderDriver") : t("adminApps.searchPlaceholderAgent")}
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(0); }}
        />
      </div>

      {/* Filter pills */}
      <div className="flex items-center gap-2 flex-wrap">
        {filterOpts.map(opt => {
          const count = opt.v !== "all" ? apps.filter(a => a.status === opt.v).length : apps.length;
          const style = STATUS_STYLE[opt.v] ?? { ring: "ring-border", pill: "bg-secondary text-secondary-foreground", dot: "bg-gray-400" };
          const isActive = filter === opt.v;
          return (
            <button key={opt.v} type="button"
              onClick={() => { setFilter(opt.v); load(opt.v); setPage(0); }}
              className={`text-xs font-bold px-3.5 py-1.5 rounded-full transition-all border-2 flex items-center gap-2 ${isActive ? `${style.pill} ring-2 ${style.ring} border-transparent` : "border-border/60 bg-background text-muted-foreground hover:bg-accent hover:border-border"}`}>
              {opt.label}
              {count > 0 && (
                <span className={`text-[10px] font-black rounded-full px-1.5 min-w-[1.25rem] text-center leading-5 h-5 inline-flex items-center justify-center ${isActive ? "bg-current/20" : "bg-muted text-muted-foreground"}`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
        {search && (
          <span className="text-xs text-muted-foreground">
            {t("adminApps.searchResults", { count: filtered.length })}
          </span>
        )}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-muted-foreground">
          <div className={`h-16 w-16 rounded-full flex items-center justify-center ${isDriver ? "bg-orange-100 dark:bg-orange-900/20" : "bg-violet-100 dark:bg-violet-900/20"}`}>
            <RefreshCw className={`h-7 w-7 animate-spin ${isDriver ? "text-orange-500" : "text-violet-500"}`} />
          </div>
          <p className="text-sm font-medium">{t("adminApps.loading")}</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
          <div className={`h-20 w-20 rounded-full flex items-center justify-center ${isDriver ? "bg-orange-50 dark:bg-orange-900/20" : "bg-violet-50 dark:bg-violet-900/20"}`}>
            {isDriver ? <Truck className="h-10 w-10 text-orange-300" /> : <ShieldCheck className="h-10 w-10 text-violet-300" />}
          </div>
          <div>
            <p className="font-bold text-sm text-foreground">
              {filter !== "all"
                ? t("adminApps.emptyStateFilter", { label: filterOpts.find(o => o.v === filter)?.label ?? filter })
                : t("adminApps.emptyStateBase")}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {search ? t("adminApps.emptySearchHint") : t("adminApps.emptyFilterHint")}
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {paginated.map((app: any) =>
              isDriver ? (
                <DriverAppCard
                  key={app.id}
                  app={app}
                  expanded={expanded === app.id}
                  onToggle={() => setExpanded(expanded === app.id ? null : app.id)}
                  onAction={(actionType, payload) => handleAction(app.id, actionType, payload)}
                  actioning={actioning === app.id}
                  scopeLock={scopeLock}
                />
              ) : (
                <AgentAppCard
                  key={app.id}
                  app={app}
                  expanded={expanded === app.id}
                  onToggle={() => setExpanded(expanded === app.id ? null : app.id)}
                  onAction={(actionType, payload) => handleAction(app.id, actionType, payload)}
                  actioning={actioning === app.id}
                />
              )
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <Button size="sm" variant="outline" className="h-8 w-8 p-0" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              {Array.from({ length: totalPages }, (_, i) => (
                <button key={i} type="button" onClick={() => setPage(i)}
                  className={`h-8 w-8 rounded-xl text-xs font-bold transition-all ${i === page ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"}`}>
                  {i + 1}
                </button>
              ))}
              <Button size="sm" variant="outline" className="h-8 w-8 p-0" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              <span className="text-xs text-muted-foreground ml-2">
                {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} {t("adminApps.paginationOf")} {filtered.length}
              </span>
            </div>
          )}
        </>
      )}
    </div>

    {/* Add Agent Manually Modal */}
    {showAddManual && !isDriver && (
      <AddAgentManualModal
        adminUser={user}
        onClose={() => setShowAddManual(false)}
        onSuccess={() => { load(filter); setFilter("approved"); }}
      />
    )}
    </>
  );
}
