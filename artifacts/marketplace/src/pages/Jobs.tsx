import { useEffect, useState, useCallback, useRef } from "react";
import { useSEO } from "@/hooks/useSEO";
import { useLocation } from "wouter";
import {
  Briefcase, MapPin, DollarSign, Plus, X, CheckCircle2, Clock,
  User as UserIcon, Trash2, Smartphone, CreditCard, Wallet, AlertTriangle,
  Copy, ShieldCheck, ChevronRight, Building2, FileText, Phone, Star,
  Users, Send, CheckCheck, XCircle, Loader2, AlertCircle, Eye,
  Shield, Camera, Flag, Lock, MessageSquare, PhoneCall, AlertOctagon,
  Bookmark, ImageIcon, Upload, BadgeCheck,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

const MONCASH_NUMBER = "+509 3600-3636";
const NATCASH_NUMBER = "+509 3900-3636";

const JOB_CATEGORIES = [
  "Konstriksyon / Construction",
  "Technoloji / IT",
  "Sante / Healthcare",
  "Edikasyon / Education",
  "Transpò / Transport",
  "Manje & Restoran / Food",
  "Menaj & Netwayaj / Cleaning",
  "Sekirite / Security",
  "Kòmès / Sales",
  "Kontabilite / Finance",
  "Administratif / Admin",
  "Agrikilti / Agriculture",
  "Atizana & Kreyatif / Creative",
  "Lòt / Other",
];

const JOB_TYPES = ["Full-time", "Part-time", "Freelance / Kontra", "Sezonye / Seasonal"];
const SCHEDULES = ["Jou / Day", "Nuit / Night", "Fleksib / Flexible"];
const EXP_LEVELS = ["Debutant / Entry-level", "Eksperyanse / Mid-level", "Ekspè / Senior"];

interface JobItem {
  id: number;
  title: string;
  description: string;
  budget: number | null;
  salaryMax?: number | null;
  location: string | null;
  country: string | null;
  category?: string | null;
  jobType?: string | null;
  workSchedule?: string | null;
  experienceLevel?: string | null;
  status: "draft" | "open" | "claimed" | "cancelled";
  paid?: boolean;
  feeAmount?: number | null;
  feeCurrency?: "USD" | "HTG" | null;
  paymentMethod?: string | null;
  posterId: number;
  posterName: string | null;
  posterAvatar: string | null;
  claimedById: number | null;
  claimedAt: string | null;
  createdAt: string;
  applicationCount?: number;
}

type PayMethod = "card" | "moncash" | "natcash" | "usdt" | "fm_wallet";
interface FeeInfo {
  amount: number;
  currency: "USD" | "HTG";
  methods: PayMethod[];
  required: boolean;
}
interface CreatedJobResponse extends JobItem {
  fee?: FeeInfo;
}

interface EmployerStatus {
  status: "pending" | "approved" | "rejected" | null;
  isVerifiedEmployer: boolean;
  adminBypass?: boolean;
  application?: { id: number; rejection_reason?: string } | null;
}

interface JobApplication {
  id: number;
  job_id: number;
  applicant_id: number;
  applicant_name: string;
  applicant_avatar: string | null;
  applicant_phone: string | null;
  cover_letter: string | null;
  whatsapp: string | null;
  status: "pending" | "shortlisted" | "rejected" | "hired";
  employer_note: string | null;
  rating: number | null;
  review_count: number | null;
  created_at: string;
}

type Tab = "browse" | "mine" | "applications";

async function authFetch(path: string, opts?: RequestInit) {
  const tk = localStorage.getItem("flexamarket_token");
  return fetch(path, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(tk ? { Authorization: `Bearer ${tk}` } : {}),
      ...(opts?.headers ?? {}),
    },
  });
}

async function fetchJobs(path: string): Promise<JobItem[]> {
  const res = await authFetch(path);
  if (!res.ok) return [];
  return (await res.json()) as JobItem[];
}

async function uploadFile(file: File): Promise<string> {
  const tk = localStorage.getItem("flexamarket_token") ?? "";
  const presignRes = await fetch("/api/s3-upload/presign", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${tk}` },
    body: JSON.stringify({ filename: file.name, contentType: file.type }),
  });
  if (!presignRes.ok) throw new Error("Failed to get upload URL");
  const { uploadUrl, publicUrl } = await presignRes.json();
  const putRes = await fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
  if (!putRes.ok) throw new Error("Upload failed");
  return publicUrl as string;
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function formatFee(amount: number, currency: "USD" | "HTG"): string {
  if (currency === "HTG") return `${amount.toLocaleString()} HTG`;
  return `$${amount.toFixed(2)} USD`;
}

// ── Photo upload field ─────────────────────────────────────────────────────────

function PhotoUploadField({
  label, hint, value, onChange, required,
}: {
  label: string;
  hint?: string;
  value: string | null;
  onChange: (url: string) => void;
  required?: boolean;
}) {
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) { toast({ title: "Sèlman imaj yo aksepte", variant: "destructive" }); return; }
    setUploading(true);
    try {
      const url = await uploadFile(file);
      onChange(url);
    } catch {
      toast({ title: "Erè upload — eseye ankò", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-1">
      <label className="text-sm font-medium">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</label>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {/* Hidden inputs — camera (capture) and gallery (no capture) */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
      />

      {value ? (
        <div
          onClick={() => inputRef.current?.click()}
          className="relative rounded-xl border-2 border-emerald-400 bg-emerald-50 dark:bg-emerald-950/20 cursor-pointer overflow-hidden"
          style={{ minHeight: 100 }}
        >
          <div className="flex items-center gap-3 p-3">
            <img src={value} alt="preview" className="w-16 h-16 rounded-lg object-cover shrink-0 border" />
            <div className="flex-1 min-w-0">
              <CheckCircle2 className="h-4 w-4 text-emerald-500 mb-0.5" />
              <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">Photo chaje!</p>
              <p className="text-xs text-muted-foreground">Klike pou chanje</p>
            </div>
          </div>
        </div>
      ) : uploading ? (
        <div className="rounded-xl border-2 border-dashed border-border bg-muted/30" style={{ minHeight: 100 }}>
          <div className="flex flex-col items-center justify-center h-24 gap-2">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="text-xs text-muted-foreground">Ap telechaje...</p>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border-2 border-dashed border-border bg-muted/30" style={{ minHeight: 100 }}>
          <div className="flex flex-col items-center justify-center gap-3 py-4">
            <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
              <Camera className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="flex gap-2 px-4">
              <button type="button" onClick={() => inputRef.current?.click()}
                className="flex-1 h-9 rounded-xl bg-primary text-primary-foreground font-semibold text-xs flex items-center justify-center gap-1.5 active:scale-[0.97] transition-all">
                <Camera className="h-3.5 w-3.5" /> Kamera
              </button>
              <button type="button" onClick={() => galleryRef.current?.click()}
                className="flex-1 h-9 rounded-xl bg-muted text-foreground font-semibold text-xs flex items-center justify-center gap-1.5 active:scale-[0.97] transition-all border border-border">
                <ImageIcon className="h-3.5 w-3.5" /> Galri
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Safety Warning Modal ───────────────────────────────────────────────────────

function SafetyWarningModal({ jobTitle, onConfirm, onCancel, lang }: {
  jobTitle: string;
  onConfirm: () => void;
  onCancel: () => void;
  lang?: string;
}) {
  const isHt = lang === "ht";
  const isFr = lang === "fr";

  const title = isHt ? "⚠️ Sekirite Ou Enpòtan" : isFr ? "⚠️ Votre Sécurité est Importante" : "⚠️ Your Safety Matters";
  const msg = isHt
    ? `Èske ou santi ou an sekirite pou ale nan zòn sa?\n\nTanpri pa janm aksepte okenn travay sèlman pou lajan.\nSekirite w gen plis valè pase milya dola.\n\nSi ou pa konnen zòn nan,\nsi ou santi ou pè,\nsi sitiyasyon an pa sanble serye,\nPA AKSEPTE DJÒB LA.\n\nToujou pwoteje tèt ou.\nDesizyon final la depan de ou.`
    : isFr
    ? `Vous sentez-vous en sécurité pour vous rendre dans cette zone ?\n\nNe jamais accepter un emploi uniquement pour de l'argent.\nVotre sécurité vaut plus que tout.\n\nSi vous ne connaissez pas la zone, si vous avez peur ou si la situation semble douteuse, NE PAS ACCEPTER.\n\nProtégez-vous toujours.`
    : `Do you feel safe going to this location?\n\nNever accept a job just for money.\nYour safety is worth more than anything.\n\nIf you don't know the area, if you feel afraid, or if the situation seems suspicious, DO NOT ACCEPT.\n\nAlways protect yourself.`;

  const tips = isHt
    ? ["Mande pou rankontre nan yon kote piblik", "Pa bay enfòmasyon pèsonèl avan ou konfime", "Avèti yon zanmi kote w prale", "Fè rechèch sou anplwayè a anvan"]
    : isFr
    ? ["Proposez un lieu public pour la rencontre", "Ne donnez pas d'informations personnelles avant confirmation", "Avertissez un proche de votre destination", "Vérifiez l'employeur avant de vous engager"]
    : ["Meet in a public place first", "Don't share personal info before confirming", "Tell a friend where you're going", "Research the employer first"];

  return (
    <div className="fixed inset-0 z-[200] flex flex-col" style={{ background: "rgba(0,0,0,0.85)" }}>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-lg mx-auto px-4 py-6 flex flex-col min-h-full">
          {/* Header */}
          <div
            className="rounded-2xl p-5 mb-4 text-white"
            style={{ background: "linear-gradient(135deg, #dc2626, #ea580c, #f59e0b)" }}
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                <Shield className="h-7 w-7 text-white" />
              </div>
              <div>
                <p className="font-black text-lg leading-tight">{title}</p>
                <p className="text-white/80 text-xs mt-0.5 line-clamp-1">"{jobTitle}"</p>
              </div>
            </div>
          </div>

          {/* Warning message */}
          <div className="bg-card border-2 border-amber-400/50 rounded-2xl p-5 mb-4">
            <p className="text-sm font-medium leading-relaxed whitespace-pre-line text-foreground">{msg}</p>
          </div>

          {/* Safety tips */}
          <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-2xl p-4 mb-4">
            <p className="text-xs font-bold text-blue-800 dark:text-blue-300 mb-2 flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5" />
              {isHt ? "Konsèy Sekirite" : isFr ? "Conseils de Sécurité" : "Safety Tips"}
            </p>
            <ul className="space-y-1.5">
              {tips.map((tip, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-blue-700 dark:text-blue-400">
                  <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0 text-blue-500" />
                  {tip}
                </li>
              ))}
            </ul>
          </div>

          {/* Emergency note */}
          <div className="flex items-start gap-2 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl px-3 py-2.5 mb-6 text-xs text-red-700 dark:text-red-400">
            <PhoneCall className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>{isHt ? "Ijans: 114 (Polis) · 116 (CIMO)" : isFr ? "Urgences: 114 (Police) · 116" : "Emergency: 114 (Police) · 116"}</span>
          </div>

          {/* Buttons */}
          <div className="grid grid-cols-2 gap-3 sticky bottom-0 pb-safe">
            <Button variant="outline" size="lg" onClick={onCancel} className="rounded-xl font-semibold">
              <X className="h-4 w-4 mr-1" />
              {isHt ? "Anile" : isFr ? "Annuler" : "Cancel"}
            </Button>
            <Button
              size="lg"
              onClick={onConfirm}
              className="rounded-xl font-bold text-white"
              style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)" }}
            >
              <CheckCircle2 className="h-4 w-4 mr-1" />
              {isHt ? "Mwen Konprann" : isFr ? "Je Comprends" : "I Understand"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Employer verification banner ──────────────────────────────────────────────

function EmployerVerifyBanner({ status, onApply }: { status: EmployerStatus | null; onApply: () => void }) {
  if (!status || status.isVerifiedEmployer || status.adminBypass) return null;

  if (status.status === "pending") {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/25 dark:border-amber-800 px-4 py-3 flex items-start gap-3">
        <Clock className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Aplikasyon ou an annatant revizyon</p>
          <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">Super Admin ap revize dosye ou anvan 24-48h. Ou kapab chèche djòb pandan w ap tann.</p>
        </div>
      </div>
    );
  }

  if (status.status === "rejected") {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/25 dark:border-red-800 px-4 py-3 flex items-start gap-3">
        <XCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-red-800 dark:text-red-300">Aplikasyon ou an te rejete</p>
          <p className="text-xs text-red-700 dark:text-red-400 mt-0.5">Ou ka soumèt yon nouvo aplikasyon ak enfòmasyon ki kòrèk.</p>
          <Button size="sm" className="mt-2 h-7 text-xs" variant="destructive" onClick={onApply}>Re-aplike</Button>
        </div>
      </div>
    );
  }

  return null;
}

// ── Employer KYC application form (3 steps + photo uploads) ───────────────────

function EmployerApplyForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    fullName: "", phone: "", whatsapp: "", address: "",
    businessName: "", businessAddress: "",
  });
  const [photos, setPhotos] = useState({
    profilePhoto: null as string | null,
    idFront: null as string | null,
    idBack: null as string | null,
    idSelfie: null as string | null,
  });

  const setF = (k: string, v: string) => setForm(prev => ({ ...prev, [k]: v }));
  const setPhoto = (k: string, v: string) => setPhotos(prev => ({ ...prev, [k]: v }));

  const submit = async () => {
    if (!form.fullName.trim() || !form.phone.trim() || !form.address.trim()) {
      toast({ title: "Non, telefòn, ak adrès obligatwa.", variant: "destructive" }); return;
    }
    setSubmitting(true);
    try {
      const res = await authFetch("/api/jobs/employer-apply", {
        method: "POST",
        body: JSON.stringify({
          fullName: form.fullName, phone: form.phone, whatsapp: form.whatsapp,
          address: form.address, businessName: form.businessName, businessAddress: form.businessAddress,
          idFront: photos.idFront, idBack: photos.idBack, idSelfie: photos.idSelfie,
          businessPhotos: photos.profilePhoto ? [photos.profilePhoto] : null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast({ title: err?.error ?? "Erè — eseye ankò", variant: "destructive" }); return;
      }
      toast({ title: "Aplikasyon soumèt! Nou ap revize l anvan 24-48h." });
      onDone();
    } finally {
      setSubmitting(false);
    }
  };

  const steps = [
    { label: "Enfòmasyon", icon: UserIcon },
    { label: "Foto ID", icon: Camera },
    { label: "Selfie & Biznis", icon: ImageIcon },
  ];

  return (
    <Dialog open={true} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-emerald-500" />
            Verifye Anplwayè
          </DialogTitle>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-1 mb-4">
          {steps.map((s, i) => {
            const num = i + 1;
            const done = step > num;
            const active = step === num;
            return (
              <div key={i} className="flex items-center flex-1">
                <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold shrink-0 transition-all
                  ${done ? "bg-emerald-500 text-white" : active ? "bg-primary text-white" : "bg-muted text-muted-foreground"}`}>
                  {done ? <CheckCircle2 className="h-4 w-4" /> : num}
                </div>
                <span className={`text-[10px] ml-1 font-medium ${active ? "text-primary" : "text-muted-foreground"}`}>{s.label}</span>
                {i < steps.length - 1 && <div className={`flex-1 h-px mx-2 ${done ? "bg-emerald-400" : "bg-border"}`} />}
              </div>
            );
          })}
        </div>

        {step === 1 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Nou bezwen verifikasyon idantite ou pou pwoteje chèchè djòb yo.</p>
            <div>
              <label className="text-sm font-medium block mb-1">Non konplè *</label>
              <Input value={form.fullName} onChange={e => setF("fullName", e.target.value)} placeholder="Jan Batis Pierre" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium block mb-1">Telefòn *</label>
                <Input value={form.phone} onChange={e => setF("phone", e.target.value)} placeholder="+509 3xxx-xxxx" />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">WhatsApp</label>
                <Input value={form.whatsapp} onChange={e => setF("whatsapp", e.target.value)} placeholder="+509..." />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Adrès *</label>
              <Input value={form.address} onChange={e => setF("address", e.target.value)} placeholder="Ri, Vil, Depatman" />
            </div>
            <div className="flex gap-2 justify-end pt-1">
              <Button variant="outline" onClick={onCancel}>Anile</Button>
              <Button onClick={() => setStep(2)} disabled={!form.fullName.trim() || !form.phone.trim() || !form.address.trim()}>
                Kontinye <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-start gap-2 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl px-3 py-2.5 text-xs text-blue-700 dark:text-blue-400">
              <Shield className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              Foto ID ou ap rèstè konfidansyèl. Sèlman Super Admin ka wè yo.
            </div>
            <PhotoUploadField
              label="Foto ID devan (CIN / Pasepò) *"
              hint="Pran foto avanfas dokiman ou"
              value={photos.idFront}
              onChange={v => setPhoto("idFront", v)}
              required
            />
            <PhotoUploadField
              label="Foto ID dèyè *"
              hint="Pran foto bò dèyè dokiman ou"
              value={photos.idBack}
              onChange={v => setPhoto("idBack", v)}
              required
            />
            <div className="flex gap-2 justify-end pt-1">
              <Button variant="outline" onClick={() => setStep(1)}>Retounen</Button>
              <Button onClick={() => setStep(3)} disabled={!photos.idFront || !photos.idBack}>
                Kontinye <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <PhotoUploadField
              label="Selfie w kenbe ID ou nan men ou *"
              hint="Pran yon foto tèt ou k ap kenbe ID ou devan figi ou"
              value={photos.idSelfie}
              onChange={v => setPhoto("idSelfie", v)}
              required
            />
            <PhotoUploadField
              label="Foto pwofil biznis (opsyonèl)"
              hint="Logo oswa foto konpayi ou"
              value={photos.profilePhoto}
              onChange={v => setPhoto("profilePhoto", v)}
            />
            <div>
              <label className="text-sm font-medium block mb-1">Non Biznis / Konpayi</label>
              <Input value={form.businessName} onChange={e => setF("businessName", e.target.value)} placeholder="MonEntreprise SA" />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Adrès Biznis</label>
              <Input value={form.businessAddress} onChange={e => setF("businessAddress", e.target.value)} placeholder="Adrès biwo a" />
            </div>
            <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 px-3 py-2.5 text-xs text-emerald-700 dark:text-emerald-400 flex items-start gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              Admin ap revize enfòmasyon sa yo epi kontakte w si yo bezwen plis dokiman (24-48h).
            </div>
            <div className="flex gap-2 justify-end pt-1">
              <Button variant="outline" onClick={() => setStep(2)}>Retounen</Button>
              <Button onClick={submit} disabled={submitting || !photos.idSelfie}>
                {submitting ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Soumèt...</> : "Soumèt Aplikasyon"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Post job form ─────────────────────────────────────────────────────────────

function PostJobForm({ onCreated, onCancel, userCountry }: {
  onCreated: (job: CreatedJobResponse) => void;
  onCancel: () => void;
  userCountry: string | null;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [budget, setBudget] = useState("");
  const [salaryMax, setSalaryMax] = useState("");
  const [category, setCategory] = useState("");
  const [jobType, setJobType] = useState("");
  const [workSchedule, setWorkSchedule] = useState("");
  const [experienceLevel, setExperienceLevel] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const previewFee = userCountry === "Haiti"
    ? { amount: 250, currency: "HTG" as const }
    : { amount: 15, currency: "USD" as const };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) {
      toast({ title: t("jobs.requiredFields"), variant: "destructive" }); return;
    }
    setSubmitting(true);
    try {
      const res = await authFetch("/api/jobs", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          location: location.trim() || null,
          budget: budget ? parseFloat(budget) : null,
          salaryMax: salaryMax ? parseFloat(salaryMax) : null,
          category: category || null,
          jobType: jobType || null,
          workSchedule: workSchedule || null,
          experienceLevel: experienceLevel || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast({ title: err?.error ?? t("jobs.postFailed"), variant: "destructive" }); return;
      }
      const created = (await res.json()) as CreatedJobResponse;
      onCreated(created);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4 bg-card border border-card-border rounded-xl p-4" data-testid="form-post-job">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-lg flex items-center gap-2">
          <Briefcase className="h-5 w-5 text-primary" />
          {t("jobs.postNew")}
        </h2>
        <Button type="button" variant="ghost" size="icon" onClick={onCancel} data-testid="button-close-post-job">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div>
        <label className="text-sm font-medium block mb-1">{t("jobs.titleLabel")} *</label>
        <Input value={title} onChange={e => setTitle(e.target.value)} placeholder={t("jobs.titlePlaceholder")} maxLength={120} data-testid="input-job-title" />
      </div>

      <div>
        <label className="text-sm font-medium block mb-1">{t("jobs.descriptionLabel")} *</label>
        <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder={t("jobs.descriptionPlaceholder")} rows={4} maxLength={2000} data-testid="input-job-description" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-sm font-medium block mb-1">Kategori</label>
          <select value={category} onChange={e => setCategory(e.target.value)} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
            <option value="">Chwazi kategori...</option>
            {JOB_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="text-sm font-medium block mb-1">Tip Travay</label>
          <select value={jobType} onChange={e => setJobType(e.target.value)} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
            <option value="">Chwazi tip...</option>
            {JOB_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-sm font-medium block mb-1">Orè / Schedule</label>
          <select value={workSchedule} onChange={e => setWorkSchedule(e.target.value)} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
            <option value="">Chwazi orè...</option>
            {SCHEDULES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="text-sm font-medium block mb-1">Eksperyans</label>
          <select value={experienceLevel} onChange={e => setExperienceLevel(e.target.value)} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
            <option value="">Nivo...</option>
            {EXP_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-sm font-medium block mb-1">{t("jobs.budgetLabel")} (min)</label>
          <Input type="number" inputMode="decimal" min={0} value={budget} onChange={e => setBudget(e.target.value)} placeholder="0" data-testid="input-job-budget" />
        </div>
        <div>
          <label className="text-sm font-medium block mb-1">Salè max (opsyonèl)</label>
          <Input type="number" inputMode="decimal" min={0} value={salaryMax} onChange={e => setSalaryMax(e.target.value)} placeholder="0" />
        </div>
      </div>

      <div>
        <label className="text-sm font-medium block mb-1">{t("jobs.locationLabel")}</label>
        <Input value={location} onChange={e => setLocation(e.target.value)} placeholder={t("jobs.locationPlaceholder")} maxLength={120} data-testid="input-job-location" />
      </div>

      <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs">
        <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
        <p className="text-amber-900 dark:text-amber-200">
          Frè piblikasyon: <strong>{formatFee(previewFee.amount, previewFee.currency)}</strong>. Ou ap peye apre etap sa a.
        </p>
      </div>

      <div className="flex gap-2 justify-end pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>{t("jobs.cancel")}</Button>
        <Button type="submit" disabled={submitting} data-testid="button-submit-job">
          {submitting ? t("jobs.posting") : t("jobs.continueToPay", { defaultValue: "Continue" })}
        </Button>
      </div>
    </form>
  );
}

// ── Payment dialog (poster pays fee) ─────────────────────────────────────────

function JobPaymentDialog({ job, fee, walletBalance, onPaid, onCancel }: {
  job: JobItem;
  fee: FeeInfo;
  walletBalance?: number;
  onPaid: () => void;
  onCancel: () => void;
}) {
  const { toast } = useToast();
  const [step, setStep] = useState<"select" | PayMethod>("select");
  const [ref, setRef] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const feeUsd = fee.currency === "HTG" ? fee.amount / 150 : fee.amount;
  const canUseWallet = (walletBalance ?? 0) >= feeUsd;

  const submitPayment = async (method: PayMethod, paymentRef: string) => {
    setSubmitting(true);
    try {
      const res = await authFetch(`/api/jobs/${job.id}/pay`, {
        method: "POST",
        body: JSON.stringify({ paymentMethod: method, paymentRef }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast({ title: err?.error ?? "Peman echwe", variant: "destructive" }); return;
      }
      toast({ title: "Peman resevwa — djòb ou an piblik kounye a!" });
      onPaid();
    } finally {
      setSubmitting(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    try { await navigator.clipboard.writeText(text); toast({ title: "Kopye!" }); } catch {}
  };

  const allMethods: PayMethod[] = ["fm_wallet", ...fee.methods];

  const labelFor = (m: PayMethod) => {
    if (m === "fm_wallet") return "FM Wallet (Imedya)";
    if (m === "card") return "Kat Kredi/Debi";
    if (m === "moncash") return "MonCash";
    if (m === "natcash") return "NatCash";
    return "USDT (TRC-20)";
  };
  const subFor = (m: PayMethod) => {
    if (m === "fm_wallet") return canUseWallet ? `Solde disponib: $${(walletBalance ?? 0).toFixed(2)}` : `Solde ensifizan ($${(walletBalance ?? 0).toFixed(2)})`;
    if (m === "card") return "Visa, Mastercard";
    if (m === "moncash") return "Peye ak MonCash";
    if (m === "natcash") return "Peye ak NatCash";
    return "Rezo Tron — rapid, ba frè";
  };
  const iconFor = (m: PayMethod) => {
    if (m === "fm_wallet") return Wallet;
    if (m === "card") return CreditCard;
    if (m === "usdt") return Wallet;
    return Smartphone;
  };

  return (
    <Dialog open={true} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent className="max-w-md" data-testid="dialog-job-payment">
        <DialogHeader>
          <DialogTitle>Peye {formatFee(fee.amount, fee.currency)} pou pibliye djòb</DialogTitle>
        </DialogHeader>

        {step === "select" ? (
          <div className="space-y-2">
            {allMethods.map(m => {
              const Icon = iconFor(m);
              const isDisabled = m === "fm_wallet" && !canUseWallet;
              return (
                <button
                  key={m}
                  onClick={() => {
                    if (m === "fm_wallet") { submitPayment("fm_wallet", "wallet"); return; }
                    setStep(m);
                  }}
                  disabled={isDisabled || submitting}
                  className={`w-full flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${isDisabled ? "opacity-40 cursor-not-allowed border-border" : "hover:border-primary hover:bg-primary/5 border-border"}`}
                >
                  <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center shrink-0">
                    <Icon className="h-5 w-5 text-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">{labelFor(m)}</p>
                    <p className="text-xs text-muted-foreground">{subFor(m)}</p>
                  </div>
                  {m === "fm_wallet" && submitting && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                  {m === "fm_wallet" && canUseWallet && !submitting && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-2 text-sm">
              {step === "moncash" && (
                <>
                  <p className="font-medium">Transfè {formatFee(fee.amount, fee.currency)} bay:</p>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-lg font-bold">{MONCASH_NUMBER}</span>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => copyToClipboard(MONCASH_NUMBER)}><Copy className="h-3.5 w-3.5" /></Button>
                  </div>
                  <p className="text-xs text-muted-foreground">Note: "Djòb #{job.id}"</p>
                </>
              )}
              {step === "natcash" && (
                <>
                  <p className="font-medium">Transfè {formatFee(fee.amount, fee.currency)} bay:</p>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-lg font-bold">{NATCASH_NUMBER}</span>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => copyToClipboard(NATCASH_NUMBER)}><Copy className="h-3.5 w-3.5" /></Button>
                  </div>
                  <p className="text-xs text-muted-foreground">Note: "Djòb #{job.id}"</p>
                </>
              )}
              {step === "usdt" && (
                <>
                  <p className="font-medium">Voye {fee.currency === "HTG" ? `~$${(fee.amount / 150).toFixed(2)}` : formatFee(fee.amount, fee.currency)} USDT TRC-20 bay:</p>
                  <p className="font-mono text-xs break-all bg-muted px-2 py-1 rounded">TRxxx…(admin wallet)</p>
                </>
              )}
              {step === "card" && <p className="text-xs text-muted-foreground">Nou ap voye yon lyen Stripe pou ou. Kontakte admin.</p>}
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Referans tranzaksyon</label>
              <Input value={ref} onChange={e => setRef(e.target.value)} placeholder="ID tranzaksyon..." />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setStep("select")}>Retounen</Button>
              <Button onClick={() => submitPayment(step, ref)} disabled={submitting || ref.length < 4}>
                {submitting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                Konfime Peman
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Apply-to-job dialog (for seekers) ────────────────────────────────────────

function ApplyToJobDialog({ job, onApplied, onCancel, lang }: {
  job: JobItem;
  onApplied: () => void;
  onCancel: () => void;
  lang?: string;
}) {
  const { toast } = useToast();
  const [showSafety, setShowSafety] = useState(true);
  const [coverLetter, setCoverLetter] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setSubmitting(true);
    try {
      const res = await authFetch(`/api/jobs/${job.id}/apply`, {
        method: "POST",
        body: JSON.stringify({ coverLetter: coverLetter.trim(), whatsapp: whatsapp.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast({ title: err?.error ?? "Erè — eseye ankò", variant: "destructive" }); return;
      }
      toast({ title: "Aplikasyon soumèt bay anplwayè a!" });
      onApplied();
    } finally {
      setSubmitting(false);
    }
  };

  if (showSafety) {
    return (
      <SafetyWarningModal
        jobTitle={job.title}
        onConfirm={() => setShowSafety(false)}
        onCancel={onCancel}
        lang={lang}
      />
    );
  }

  return (
    <Dialog open={true} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5 text-primary" />
            Aplike pou: {job.title}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium block mb-1">Lèt motivasyon (opsyonèl)</label>
            <Textarea
              value={coverLetter}
              onChange={e => setCoverLetter(e.target.value)}
              placeholder="Eksplike poukisa ou bon pou djòb sa a, eksperyans ou, elatriye..."
              rows={4}
              maxLength={1000}
            />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">WhatsApp (opsyonèl)</label>
            <Input value={whatsapp} onChange={e => setWhatsapp(e.target.value)} placeholder="+509 3xxx-xxxx" />
          </div>
          <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 px-3 py-2 text-xs text-blue-800 dark:text-blue-300">
            <AlertCircle className="h-3.5 w-3.5 inline mr-1" />
            Anplwayè a ap wè pwofil ou, non ou, ak enfòmasyon ou soumetèt yo.
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onCancel}>Anile</Button>
            <Button onClick={submit} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
              Voye Aplikasyon
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Applications panel (employer view) ───────────────────────────────────────

function ApplicationsPanel({ job, onClose }: { job: JobItem; onClose: () => void }) {
  const { toast } = useToast();
  const [apps, setApps] = useState<JobApplication[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [actioning, setActioning] = useState<number | null>(null);

  const loadApps = useCallback(async () => {
    setLoading(true);
    const res = await authFetch(`/api/jobs/${job.id}/applications`);
    if (res.ok) setApps(await res.json());
    setLoading(false);
  }, [job.id]);

  useEffect(() => { loadApps(); }, [loadApps]);

  const updateStatus = async (appId: number, status: string) => {
    setActioning(appId);
    try {
      const res = await authFetch(`/api/jobs/${job.id}/applications/${appId}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      if (!res.ok) { toast({ title: "Erè", variant: "destructive" }); return; }
      toast({ title: status === "shortlisted" ? "Mete nan lis kout!" : status === "hired" ? "Kandida anboche!" : "Rejete" });
      await loadApps();
    } finally {
      setActioning(null);
    }
  };

  const statusBadge = (s: string) => {
    if (s === "hired") return <Badge className="bg-emerald-500 text-white text-[10px]"><CheckCheck className="h-3 w-3 mr-1" />Anboche</Badge>;
    if (s === "shortlisted") return <Badge className="bg-blue-500 text-white text-[10px]"><Star className="h-3 w-3 mr-1" />Lis kout</Badge>;
    if (s === "rejected") return <Badge variant="destructive" className="text-[10px]"><XCircle className="h-3 w-3 mr-1" />Rejete</Badge>;
    return <Badge variant="secondary" className="text-[10px]"><Clock className="h-3 w-3 mr-1" />Annatant</Badge>;
  };

  return (
    <Dialog open={true} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Aplikasyon yo — {job.title}
          </DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
        ) : !apps?.length ? (
          <div className="text-center py-10">
            <Users className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Pa gen aplikasyon toujou.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {apps.map(app => (
              <div key={app.id} className="rounded-xl border border-border p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {app.applicant_avatar ? (
                      <img src={app.applicant_avatar} className="w-9 h-9 rounded-full object-cover shrink-0" alt="" />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                        <UserIcon className="h-5 w-5 text-muted-foreground" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{app.applicant_name}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {app.rating && <><Star className="h-3 w-3 text-amber-400" />{app.rating.toFixed(1)} ({app.review_count})</>}
                        {app.whatsapp && <><Phone className="h-3 w-3" />{app.whatsapp}</>}
                        <Clock className="h-3 w-3" />{timeAgo(app.created_at)}
                      </div>
                    </div>
                  </div>
                  {statusBadge(app.status)}
                </div>
                {app.cover_letter && (
                  <p className="text-xs text-foreground/80 bg-muted/50 rounded-lg px-3 py-2 whitespace-pre-wrap line-clamp-3">{app.cover_letter}</p>
                )}
                {app.status === "pending" && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="h-7 text-xs border-blue-300 text-blue-600 hover:bg-blue-50" onClick={() => updateStatus(app.id, "shortlisted")} disabled={actioning === app.id}>
                      <Star className="h-3 w-3 mr-1" />Lis kout
                    </Button>
                    <Button size="sm" className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700" onClick={() => updateStatus(app.id, "hired")} disabled={actioning === app.id}>
                      <CheckCheck className="h-3 w-3 mr-1" />Anboche
                    </Button>
                    <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => updateStatus(app.id, "rejected")} disabled={actioning === app.id}>
                      <XCircle className="h-3 w-3 mr-1" />Rejete
                    </Button>
                  </div>
                )}
                {app.status === "shortlisted" && (
                  <div className="flex gap-2">
                    <Button size="sm" className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700" onClick={() => updateStatus(app.id, "hired")} disabled={actioning === app.id}>
                      <CheckCheck className="h-3 w-3 mr-1" />Anboche
                    </Button>
                    <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => updateStatus(app.id, "rejected")} disabled={actioning === app.id}>
                      Rejete
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Report job dialog ──────────────────────────────────────────────────────────

function ReportJobDialog({ job, onClose }: { job: JobItem; onClose: () => void }) {
  const { toast } = useToast();
  const [reason, setReason] = useState("");
  const [detail, setDetail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const reasons = [
    "Djòb sa a sanble fwòd",
    "Anplwayè a mande lajan pou travay",
    "Imaj / kontni ennapropiye",
    "Kondisyon travay danjere",
    "Fòs / Trafik umèn",
    "Lòt rezon",
  ];

  const submit = async () => {
    if (!reason) { toast({ title: "Chwazi yon rezon", variant: "destructive" }); return; }
    setSubmitting(true);
    try {
      await authFetch("/api/reports", {
        method: "POST",
        body: JSON.stringify({ listingId: job.id, reason: `[JOB REPORT] ${reason}: ${detail}` }),
      });
      toast({ title: "Rapò soumèt! Nou ap revize sa." });
      onClose();
    } catch {
      toast({ title: "Erè — eseye ankò", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <Flag className="h-4 w-4" />
            Rapòte Djòb Sa
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">"{job.title}"</p>
          <div className="space-y-2">
            {reasons.map(r => (
              <button
                key={r}
                onClick={() => setReason(r)}
                className={`w-full text-left text-sm px-3 py-2.5 rounded-xl border transition-colors
                  ${reason === r ? "border-red-400 bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400 font-medium" : "border-border hover:border-red-300 hover:bg-red-50/50 dark:hover:bg-red-950/10"}`}
              >
                {r}
              </button>
            ))}
          </div>
          <Textarea value={detail} onChange={e => setDetail(e.target.value)} placeholder="Detay siplemantè (opsyonèl)..." rows={2} maxLength={500} />
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={onClose}>Anile</Button>
            <Button size="sm" variant="destructive" onClick={submit} disabled={submitting || !reason}>
              {submitting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Flag className="h-3.5 w-3.5 mr-1" />}
              Rapòte
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Job card ──────────────────────────────────────────────────────────────────

const CARD_COLORS = [
  "from-violet-500 to-purple-600",
  "from-blue-500 to-indigo-600",
  "from-emerald-500 to-teal-600",
  "from-orange-500 to-amber-600",
  "from-pink-500 to-rose-600",
  "from-cyan-500 to-blue-600",
];

function JobCard({ job, currentUserId, isEmployer, myApplicationStatus, onClaim, onDelete, onPay, onApply, onViewApps, onReport }: {
  job: JobItem;
  currentUserId: number | null;
  isEmployer: boolean;
  myApplicationStatus?: string | null;
  onClaim?: (id: number) => Promise<void>;
  onDelete?: (id: number) => Promise<void>;
  onPay?: (job: JobItem) => void;
  onApply?: (job: JobItem) => void;
  onViewApps?: (job: JobItem) => void;
  onReport?: (job: JobItem) => void;
}) {
  const isMine = currentUserId !== null && job.posterId === currentUserId;
  const isClaimer = currentUserId !== null && job.claimedById === currentUserId;
  const claimed = job.status === "claimed";
  const isDraft = job.status === "draft" || job.paid === false;
  const [busy, setBusy] = useState(false);
  const colorIdx = job.id % CARD_COLORS.length;

  const handleClaim = async () => {
    if (!onClaim) return;
    setBusy(true);
    try { await onClaim(job.id); } finally { setBusy(false); }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    setBusy(true);
    try { await onDelete(job.id); } finally { setBusy(false); }
  };

  const appStatusBadge = myApplicationStatus ? {
    pending: <Badge variant="secondary" className="text-[10px]"><Clock className="h-3 w-3 mr-1" />Aplike</Badge>,
    shortlisted: <Badge className="bg-blue-500 text-white text-[10px]"><Star className="h-3 w-3 mr-1" />Lis kout</Badge>,
    hired: <Badge className="bg-emerald-500 text-white text-[10px]"><CheckCheck className="h-3 w-3 mr-1" />Anboche</Badge>,
    rejected: <Badge variant="destructive" className="text-[10px]"><XCircle className="h-3 w-3 mr-1" />Rejete</Badge>,
  }[myApplicationStatus] : null;

  return (
    <article className="bg-card border border-card-border rounded-2xl p-4 flex gap-3" data-testid={`card-job-${job.id}`}>
      {/* Company Avatar */}
      <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${CARD_COLORS[colorIdx]} flex items-center justify-center shrink-0 shadow-sm`}>
        {job.posterAvatar ? (
          <img src={job.posterAvatar} className="w-12 h-12 rounded-xl object-cover" alt="" />
        ) : (
          <span className="text-white font-black text-xl">
            {(job.posterName ?? job.title)?.[0]?.toUpperCase() ?? "J"}
          </span>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-bold text-foreground leading-tight" data-testid={`text-job-title-${job.id}`}>{job.title}</h3>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground mt-0.5">
              <span className="flex items-center gap-1">
                <Building2 className="h-3 w-3" />
                {job.posterName ?? "—"}
                {!isDraft && (
                  <span title="Anplwayè Verifye">
                    <BadgeCheck className="h-3 w-3 text-blue-500" />
                  </span>
                )}
              </span>
              {job.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{job.location}</span>}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            {claimed ? (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-bold">
                <CheckCircle2 className="h-3 w-3" />Pran
              </span>
            ) : isDraft ? (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400 text-xs font-bold uppercase">Draft</span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold">Ouvè</span>
            )}
            {appStatusBadge}
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5 mt-2">
          {job.category && <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-medium">{job.category}</span>}
          {job.jobType && <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 text-xs font-medium">{job.jobType}</span>}
          {job.experienceLevel && <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-xs font-medium">{job.experienceLevel}</span>}
        </div>

        <p className="text-sm text-foreground/80 line-clamp-2 mt-2">{job.description}</p>

        <div className="flex flex-wrap items-center justify-between gap-2 mt-3">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            {typeof job.budget === "number" && job.budget > 0 && (
              <span className="inline-flex items-center gap-1 font-bold text-emerald-600" data-testid={`text-job-budget-${job.id}`}>
                <DollarSign className="h-4 w-4" />
                {job.budget.toLocaleString()}{job.salaryMax ? ` — ${job.salaryMax.toLocaleString()}` : ""} / mwa
              </span>
            )}
            {job.workSchedule && <span className="text-xs text-muted-foreground">{job.workSchedule}</span>}
            <span className="text-xs text-muted-foreground"><Clock className="h-3 w-3 inline mr-0.5" />{timeAgo(job.createdAt)}</span>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {isMine && isDraft && onPay && (
              <Button size="sm" disabled={busy} onClick={() => onPay(job)} className="h-8 text-xs" data-testid={`button-pay-now-${job.id}`}>Peye Pou Pibliye</Button>
            )}
            {isMine && !isDraft && onDelete && (
              <Button size="sm" variant="outline" disabled={busy} onClick={handleDelete} className="h-8 w-8 p-0" data-testid={`button-delete-job-${job.id}`}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
            {isMine && !isDraft && onViewApps && (
              <Button size="sm" variant="outline" onClick={() => onViewApps(job)} className="h-8 text-xs">
                <Users className="h-3.5 w-3.5 mr-1" />
                {typeof job.applicationCount === "number" ? `${job.applicationCount} Kandida` : "Kandida"}
              </Button>
            )}
            {!isMine && !claimed && !isDraft && (
              <>
                {myApplicationStatus ? null : isEmployer ? (
                  <Button size="sm" disabled={busy} onClick={handleClaim} className="h-8 text-xs" data-testid={`button-claim-job-${job.id}`}>
                    {busy ? "..." : "Pran djòb la"}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => onApply?.(job)}
                    className="h-8 text-xs"
                    style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)" }}
                    data-testid={`button-apply-job-${job.id}`}
                  >
                    <Send className="h-3.5 w-3.5 mr-1" />Aplike
                  </Button>
                )}
                {!isMine && onReport && (
                  <button
                    onClick={() => onReport(job)}
                    className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
                    title="Rapòte djòb sa"
                  >
                    <Flag className="h-3.5 w-3.5" />
                  </button>
                )}
              </>
            )}
            {isClaimer && claimed && <span className="text-xs text-muted-foreground italic">Ou pran djòb sa a</span>}
          </div>
        </div>
      </div>
    </article>
  );
}

// ── Feature icons row ──────────────────────────────────────────────────────────

const FEATURES = [
  { icon: Shield, label: "Sekirite w\nanvan tout bagay", color: "#6366f1" },
  { icon: BadgeCheck, label: "Employeurs\nVerifye", color: "#10b981" },
  { icon: Lock, label: "Chat\nSekirize", color: "#3b82f6" },
  { icon: Wallet, label: "Peman Sekirize\n(FM Wallet)", color: "#f59e0b" },
  { icon: Star, label: "Evalyasyon &\nRevizyon", color: "#ec4899" },
  { icon: PhoneCall, label: "Konsèy\nSekirite", color: "#8b5cf6" },
];

// ── Main Jobs page ────────────────────────────────────────────────────────────

export default function Jobs() {
  useSEO({ title: "Djòb — Travay ann Ayiti", description: "Jwenn travay oswa poste yon ofò djòb ann Ayiti sou FLEXA MARKET — platfòm #1 pou djòb lokal.", path: "/jobs" });
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("browse");
  const [showForm, setShowForm] = useState(false);
  const [showEmployerApply, setShowEmployerApply] = useState(false);
  const [browse, setBrowse] = useState<JobItem[] | null>(null);
  const [mine, setMine] = useState<JobItem[] | null>(null);
  const [myApplications, setMyApplications] = useState<Array<{ job: JobItem; status: string }> | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingPayment, setPendingPayment] = useState<{ job: JobItem; fee: FeeInfo } | null>(null);
  const [applyingToJob, setApplyingToJob] = useState<JobItem | null>(null);
  const [viewingApps, setViewingApps] = useState<JobItem | null>(null);
  const [reportingJob, setReportingJob] = useState<JobItem | null>(null);
  const [employerStatus, setEmployerStatus] = useState<EmployerStatus | null>(null);
  const [walletBalance, setWalletBalance] = useState<number>(0);

  useEffect(() => { if (!user) setLocation("/auth/login"); }, [user, setLocation]);

  const isHaitiUser = !user || (user.country ?? "").toLowerCase() === "haiti";

  const isVerifiedEmployer = employerStatus?.isVerifiedEmployer || employerStatus?.adminBypass ||
    Boolean((user as any)?.isAdmin) || Boolean((user as any)?.isSuperAdmin);

  const loadEmployerStatus = useCallback(async () => {
    const res = await authFetch("/api/jobs/employer-status");
    if (res.ok) setEmployerStatus(await res.json());
  }, []);

  const loadWalletBalance = useCallback(async () => {
    const res = await authFetch("/api/wallet/balance");
    if (res.ok) {
      const data = await res.json();
      setWalletBalance(parseFloat(data.balance ?? data.balanceUsd ?? "0"));
    }
  }, []);

  const loadMyApplications = useCallback(async () => {
    const res = await authFetch("/api/jobs/my-applications");
    if (res.ok) setMyApplications(await res.json());
    else setMyApplications([]);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [b, m] = await Promise.all([fetchJobs("/api/jobs"), fetchJobs("/api/jobs/me")]);
    setBrowse(b);
    setMine(m);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (user) {
      refresh();
      loadEmployerStatus();
      loadWalletBalance();
      loadMyApplications();
    }
  }, [user, refresh, loadEmployerStatus, loadWalletBalance, loadMyApplications]);

  const handleClaim = async (id: number) => {
    const res = await authFetch(`/api/jobs/${id}/claim`, { method: "POST" });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = err?.code === "ALREADY_CLAIMED" ? t("jobs.alreadyTaken") : err?.error ?? t("jobs.claimFailed");
      toast({ title: msg, variant: "destructive" });
      await refresh();
      return;
    }
    toast({ title: t("jobs.claimedToast") });
    await refresh();
    setTab("mine");
  };

  const handleDelete = async (id: number) => {
    const res = await authFetch(`/api/jobs/${id}`, { method: "DELETE" });
    if (!res.ok) { toast({ title: t("jobs.deleteFailed"), variant: "destructive" }); return; }
    toast({ title: t("jobs.deletedToast") });
    await refresh();
  };

  const myAppStatusMap = new Map(
    (myApplications ?? []).map(a => [a.job?.id ?? (a as any).job_id, a.status])
  );

  if (!isHaitiUser) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <Briefcase className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
        <h1 className="text-2xl font-extrabold text-foreground mb-2">{t("jobs.title")}</h1>
        <p className="text-muted-foreground max-w-sm mx-auto">
          {t("jobs.haitiOnly", { defaultValue: "The Jobs (Djòb) feature is currently available in Haiti only. Stay tuned — we're expanding soon!" })}
        </p>
      </div>
    );
  }

  const visible = tab === "browse" ? browse : tab === "mine" ? mine : null;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
      {/* Dialogs */}
      {showEmployerApply && (
        <EmployerApplyForm
          onCancel={() => setShowEmployerApply(false)}
          onDone={() => { setShowEmployerApply(false); loadEmployerStatus(); }}
        />
      )}

      {applyingToJob && (
        <ApplyToJobDialog
          job={applyingToJob}
          lang={i18n.language}
          onCancel={() => setApplyingToJob(null)}
          onApplied={() => { setApplyingToJob(null); loadMyApplications(); refresh(); toast({ title: "Aplikasyon soumèt!" }); }}
        />
      )}

      {viewingApps && <ApplicationsPanel job={viewingApps} onClose={() => setViewingApps(null)} />}
      {reportingJob && <ReportJobDialog job={reportingJob} onClose={() => setReportingJob(null)} />}

      {pendingPayment && (
        <JobPaymentDialog
          job={pendingPayment.job}
          fee={pendingPayment.fee}
          walletBalance={walletBalance}
          onCancel={() => setPendingPayment(null)}
          onPaid={() => { setPendingPayment(null); refresh(); }}
        />
      )}

      {/* ── Hero Banner ─────────────────────────────────────────────────────── */}
      <div
        className="relative rounded-3xl overflow-hidden"
        style={{ background: "linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #6d28d9 100%)" }}
      >
        {/* Background decoration */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-4 right-8 w-32 h-32 rounded-full bg-white" />
          <div className="absolute bottom-0 left-12 w-20 h-20 rounded-full bg-white" />
        </div>
        <div className="relative px-5 pt-6 pb-4 flex items-center gap-4">
          <div className="flex-1">
            <p className="text-white/70 text-xs font-semibold uppercase tracking-wider mb-1">Jobs (Djòb)</p>
            <h1 className="text-white font-black text-2xl leading-tight">
              Jwenn bon djòb,<br />lavi ou chanje!
            </h1>
            <p className="text-white/80 text-sm mt-2 leading-snug">
              Achte, vann, epi jwenn travay an sekirite sou Flexa Market.
            </p>
          </div>
          <div className="text-6xl shrink-0 select-none">💼</div>
        </div>

        {/* Action cards */}
        <div className="relative px-4 pb-5 grid grid-cols-2 gap-3">
          {/* Post a Job */}
          <button
            type="button"
            onClick={() => {
              if (isVerifiedEmployer) { setShowForm(true); }
              else { setShowEmployerApply(true); }
            }}
            className="group rounded-2xl p-4 text-left transition-all hover:scale-[1.02] active:scale-[0.98]"
            style={{ background: "linear-gradient(135deg, #f59e0b, #f97316)" }}
            data-testid="button-new-job"
          >
            <div className="flex items-start justify-between mb-2">
              <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
                <Plus className="h-5 w-5 text-white" />
              </div>
              <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center group-hover:bg-white/30 transition-colors">
                <ChevronRight className="h-4 w-4 text-white" />
              </div>
            </div>
            <p className="text-white font-bold text-sm leading-tight">Poste Djòb</p>
            <p className="text-white/80 text-xs mt-0.5 leading-snug">Pibliye yon travay epi jwenn bon kandida</p>
          </button>

          {/* Apply for a Job */}
          <button
            type="button"
            onClick={() => setTab("browse")}
            className="group rounded-2xl p-4 text-left bg-white/15 backdrop-blur-sm border border-white/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            <div className="flex items-start justify-between mb-2">
              <div className="w-9 h-9 rounded-xl bg-emerald-500 flex items-center justify-center">
                <UserIcon className="h-5 w-5 text-white" />
              </div>
              <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center group-hover:bg-white/30 transition-colors">
                <ChevronRight className="h-4 w-4 text-white" />
              </div>
            </div>
            <p className="text-white font-bold text-sm leading-tight">Aplike pou yon Djòb</p>
            <p className="text-white/80 text-xs mt-0.5 leading-snug">Jwenn travay ki matche ak ou</p>
          </button>
        </div>
      </div>

      {/* ── Feature icons ────────────────────────────────────────────────────── */}
      <div className="overflow-x-auto -mx-4 px-4">
        <div className="flex gap-3 min-w-max pb-1">
          {FEATURES.map(({ icon: Icon, label, color }) => (
            <div key={label} className="flex flex-col items-center gap-1.5 text-center w-16">
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
                style={{ background: `${color}18`, border: `1.5px solid ${color}30` }}
              >
                <Icon className="h-6 w-6" style={{ color }} />
              </div>
              <p className="text-[10px] text-muted-foreground font-medium leading-tight whitespace-pre-line">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Employer status banners ──────────────────────────────────────────── */}
      <EmployerVerifyBanner status={employerStatus} onApply={() => setShowEmployerApply(true)} />

      {/* ── Post Job Form (inline) ───────────────────────────────────────────── */}
      {showForm && (
        <PostJobForm
          userCountry={user?.country ?? null}
          onCancel={() => setShowForm(false)}
          onCreated={(created) => {
            setShowForm(false);
            setMine(prev => [created, ...(prev ?? [])]);
            setTab("mine");
            if (created.fee?.required) {
              setPendingPayment({ job: created, fee: created.fee });
            } else {
              toast({ title: t("jobs.postedToast") });
            }
          }}
        />
      )}

      {/* ── Tabs ─────────────────────────────────────────────────────────────── */}
      <div className="flex gap-0 border border-border rounded-xl overflow-hidden">
        {([
          { id: "browse", label: t("jobs.tabBrowse"), testid: "tab-jobs-browse" },
          { id: "mine", label: t("jobs.tabMine"), testid: "tab-jobs-mine" },
          { id: "applications", label: `Aplikasyon Mwen${myApplications?.length ? ` (${myApplications.length})` : ""}`, testid: "tab-jobs-applications" },
        ] as const).map(({ id, label, testid }) => (
          <button
            key={id}
            onClick={() => setTab(id as Tab)}
            className={`flex-1 py-2.5 text-xs font-semibold transition-colors
              ${tab === id ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
            data-testid={testid}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Tab content ──────────────────────────────────────────────────────── */}
      {tab === "applications" ? (
        !myApplications ? (
          <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}</div>
        ) : myApplications.length === 0 ? (
          <div className="text-center py-16 bg-card border border-card-border rounded-2xl">
            <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="font-semibold text-foreground">Pa gen aplikasyon toujou</p>
            <p className="text-sm text-muted-foreground mt-1">Chwazi yon djòb epi klike "Aplike" pou soumèt aplikasyon ou.</p>
            <Button size="sm" variant="outline" className="mt-4" onClick={() => setTab("browse")}>
              <Briefcase className="h-4 w-4 mr-1" />Wè Djòb Disponib
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {myApplications.map((a: any) => {
              const job = a.job ?? { id: a.job_id, title: a.job_title ?? "Djòb" };
              const s = a.status;
              const badge = {
                pending: <Badge variant="secondary" className="text-[10px]"><Clock className="h-3 w-3 mr-1" />Annatant</Badge>,
                shortlisted: <Badge className="bg-blue-500 text-white text-[10px]"><Star className="h-3 w-3 mr-1" />Lis kout</Badge>,
                hired: <Badge className="bg-emerald-500 text-white text-[10px]"><CheckCheck className="h-3 w-3 mr-1" />Anboche</Badge>,
                rejected: <Badge variant="destructive" className="text-[10px]"><XCircle className="h-3 w-3 mr-1" />Rejete</Badge>,
              }[s as string] ?? null;
              return (
                <div key={a.id} className="bg-card border border-card-border rounded-2xl p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{job.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5"><Clock className="h-3 w-3 inline mr-0.5" />{timeAgo(a.created_at)}</p>
                  </div>
                  {badge}
                </div>
              );
            })}
          </div>
        )
      ) : loading ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-36 rounded-2xl" />)}</div>
      ) : !visible || visible.length === 0 ? (
        <div className="text-center py-16 bg-card border border-card-border rounded-2xl">
          <Briefcase className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
          <p className="font-semibold text-foreground">
            {tab === "browse" ? t("jobs.emptyBrowse") : t("jobs.emptyMine")}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            {tab === "browse" ? t("jobs.emptyBrowseHint") : t("jobs.emptyMineHint")}
          </p>
          {tab === "browse" && isVerifiedEmployer && (
            <Button size="sm" className="mt-4" onClick={() => setShowForm(true)}>
              <Plus className="h-4 w-4 mr-1" />Poste premye djòb ou
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-foreground">
              {tab === "browse" ? "Djòb ki disponib" : "Djòb mwen yo"}
            </p>
            <span className="text-xs text-muted-foreground">{visible.length} djòb</span>
          </div>
          <div className="space-y-3" data-testid={`list-jobs-${tab}`}>
            {visible.map(job => (
              <JobCard
                key={job.id}
                job={job}
                currentUserId={user?.id ?? null}
                isEmployer={isVerifiedEmployer}
                myApplicationStatus={tab === "browse" ? (myAppStatusMap.get(job.id) ?? null) : null}
                onClaim={tab === "browse" ? handleClaim : undefined}
                onDelete={tab === "mine" && job.posterId === user?.id ? handleDelete : undefined}
                onPay={tab === "mine" && job.posterId === user?.id
                  ? (j) => {
                      const isHaiti = (user?.country ?? "").toLowerCase() === "haiti";
                      setPendingPayment({
                        job: j,
                        fee: isHaiti
                          ? { amount: 250, currency: "HTG", methods: ["moncash", "natcash", "usdt"], required: true }
                          : { amount: 15,  currency: "USD", methods: ["card", "usdt"], required: true },
                      });
                    }
                  : undefined}
                onApply={tab === "browse" && !isVerifiedEmployer ? (j) => setApplyingToJob(j) : undefined}
                onViewApps={tab === "mine" && job.posterId === user?.id ? (j) => setViewingApps(j) : undefined}
                onReport={tab === "browse" && job.posterId !== user?.id ? (j) => setReportingJob(j) : undefined}
              />
            ))}
          </div>
        </>
      )}

      {/* ── Safety Tips Banner ───────────────────────────────────────────────── */}
      {tab === "browse" && (
        <div
          className="rounded-2xl p-4 flex items-start gap-4"
          style={{
            background: "linear-gradient(135deg, #f59e0b18, #f9731618)",
            border: "1.5px solid #f59e0b44",
          }}
        >
          <div className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center shrink-0 shadow-sm">
            <Shield className="h-6 w-6 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-amber-800 dark:text-amber-300 text-sm">Sekirite w enpòtan!</p>
            <p className="text-xs text-amber-700 dark:text-amber-400 mt-1 leading-relaxed">
              Pa aksepte okenn travay si w pa <strong>santi</strong> w an sekirite nan zòn nan.
              Sekirite w vo plis pase nenpòz lajan.
            </p>
            <button
              className="mt-2 text-xs font-bold text-amber-700 dark:text-amber-400 underline underline-offset-2 flex items-center gap-1"
              onClick={() => {
                const job = browse?.[0];
                if (job) setApplyingToJob(job);
              }}
            >
              Li plis <ChevronRight className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
