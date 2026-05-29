import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/auth";
import { useToast } from "@/hooks/use-toast";
import {
  Shield, User, FileText, Camera, ChevronRight, ChevronLeft,
  CheckCircle2, Loader2, Star, Globe, DollarSign, AlertCircle,
  Upload, ArrowLeft, BadgeCheck, Clock, XCircle, Ban,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const STEPS = ["personal", "business", "kyc", "review"] as const;
type Step = typeof STEPS[number];

interface FormData {
  fullName: string;
  address: string;
  city: string;
  phone: string;
  whatsappNumber: string;
  businessName: string;
  businessLocation: string;
  businessType: string;
  exchangeActivityType: string;
  govIdFront: string;
  govIdBack: string;
  selfieWithId: string;
  proofOfAddress: string;
}

/* ── Step progress bar ── */
function StepBar({ current, labels }: { current: number; labels: string[] }) {
  return (
    <div className="flex items-center justify-center mb-8 px-2">
      {labels.map((label, i) => (
        <div key={i} className="flex items-center">
          <div className="flex flex-col items-center gap-1.5">
            <div className={`relative w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300 ${
              i < current
                ? "bg-primary text-white shadow-lg shadow-primary/30"
                : i === current
                  ? "bg-primary text-white ring-4 ring-primary/20 shadow-lg shadow-primary/30"
                  : "bg-muted text-muted-foreground"
            }`}>
              {i < current ? <CheckCircle2 className="h-4 w-4" /> : <span>{i + 1}</span>}
            </div>
            <span className={`text-[10px] font-semibold tracking-wide ${
              i === current ? "text-primary" : i < current ? "text-primary/70" : "text-muted-foreground"
            }`}>{label}</span>
          </div>
          {i < labels.length - 1 && (
            <div className={`h-0.5 w-10 mb-5 mx-1 rounded-full transition-all duration-300 ${
              i < current ? "bg-primary" : "bg-muted"
            }`} />
          )}
        </div>
      ))}
    </div>
  );
}

/* ── Document upload zone ── */
function DocUpload({
  label, hint, value, onChange, uploadLabel, uploadedLabel, uploadFailLabel,
}: {
  label: string; hint: string; value: string; onChange: (url: string) => void;
  uploadLabel: string; uploadedLabel: string; uploadFailLabel: string;
}) {
  const [uploading, setUploading] = useState(false);
  const { token } = useAuth();

  const handleFile = async (file: File) => {
    setUploading(true);
    try {
      const body = new globalThis.FormData();
      body.append("file", file);
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body,
      });
      if (!res.ok) throw new Error("upload");
      const data = await res.json();
      onChange(data.url);
    } catch {
      alert(uploadFailLabel);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-2">
      <div>
        <p className="text-sm font-semibold text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>
      </div>
      <label className={`relative flex flex-col items-center justify-center w-full h-32 rounded-2xl border-2 border-dashed cursor-pointer transition-all duration-200 ${
        value
          ? "border-primary/60 bg-primary/5"
          : "border-border hover:border-primary/40 hover:bg-muted/30"
      }`}>
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          disabled={uploading}
        />
        {uploading ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="text-xs text-muted-foreground">Uploading…</span>
          </div>
        ) : value ? (
          <div className="flex flex-col items-center gap-2">
            <div className="relative">
              <img src={value} alt="" className="h-16 w-24 object-cover rounded-xl shadow" />
              <div className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-primary rounded-full flex items-center justify-center">
                <CheckCircle2 className="h-3 w-3 text-white" />
              </div>
            </div>
            <span className="text-xs text-primary font-semibold">{uploadedLabel} ✓</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
              <Upload className="h-5 w-5" />
            </div>
            <span className="text-xs font-medium">{uploadLabel}</span>
          </div>
        )}
      </label>
    </div>
  );
}

/* ── Section header ── */
function SectionHeader({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="flex items-center gap-3 mb-6 pb-3 border-b border-border">
      <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <h2 className="text-lg font-bold text-foreground">{title}</h2>
    </div>
  );
}

/* ── Field wrapper ── */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium text-foreground/80">{label}</Label>
      {children}
    </div>
  );
}

/* ── Chip selector ── */
function ChipGroup({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(opt => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          className={`px-4 py-2 rounded-full border text-sm font-medium transition-all duration-150 ${
            value === opt
              ? "border-primary bg-primary text-white shadow-sm shadow-primary/30"
              : "border-border text-foreground/70 hover:border-primary/40 hover:bg-muted/40"
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

export default function AgentApplication() {
  const { user, token } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { t } = useTranslation();

  const [step, setStep] = useState<Step>("personal");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [existingStatus, setExistingStatus] = useState<string | null>(null);

  const [form, setForm] = useState<FormData>({
    fullName: user?.name ?? "",
    address: "",
    city: "",
    phone: user?.phone ?? "",
    whatsappNumber: user?.phone ?? "",
    businessName: "",
    businessLocation: "",
    businessType: "",
    exchangeActivityType: "",
    govIdFront: "",
    govIdBack: "",
    selfieWithId: "",
    proofOfAddress: "",
  });

  useEffect(() => {
    if (!user) navigate("/auth/login");
    if (!token) return;
    fetch("/api/agents/my", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { if (d.application) setExistingStatus(d.application.status); })
      .catch(() => {});
  }, [user, token]);

  const set = (f: keyof FormData, v: string) => setForm(p => ({ ...p, [f]: v }));

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/agents/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error");
      setSubmitted(true);
    } catch (err: any) {
      toast({ title: err.message ?? "Error. Try again.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (!user) return null;

  const stepLabels = [
    t("wallet.agentApplyStepPersonal"),
    t("wallet.agentApplyStepBusiness"),
    t("wallet.agentApplyStepKyc"),
    t("wallet.agentApplyStepReview"),
  ];

  /* ── Status screen ── */
  if (existingStatus) {
    const configs: Record<string, { Icon: React.ElementType; color: string; bg: string; text: string }> = {
      pending:  { Icon: Clock,        color: "text-amber-500",  bg: "bg-amber-50 dark:bg-amber-950/30",   text: t("wallet.agentApplyStatusPending") },
      approved: { Icon: BadgeCheck,   color: "text-emerald-500",bg: "bg-emerald-50 dark:bg-emerald-950/30",text: t("wallet.agentApplyStatusApproved") },
      rejected: { Icon: XCircle,      color: "text-red-500",    bg: "bg-red-50 dark:bg-red-950/30",       text: t("wallet.agentApplyStatusRejected") },
      suspended:{ Icon: Ban,          color: "text-red-500",    bg: "bg-red-50 dark:bg-red-950/30",       text: t("wallet.agentApplyStatusSuspended") },
    };
    const cfg = configs[existingStatus] ?? configs.pending;
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="w-full max-w-sm text-center space-y-6">
          <div className={`w-24 h-24 ${cfg.bg} rounded-3xl flex items-center justify-center mx-auto`}>
            <cfg.Icon className={`h-12 w-12 ${cfg.color}`} />
          </div>
          <div>
            <h2 className="text-2xl font-black mb-2">{t("wallet.agentApplyStatusTitle")}</h2>
            <div className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold capitalize mb-4 ${cfg.bg} ${cfg.color}`}>
              {existingStatus}
            </div>
            <p className="text-muted-foreground text-sm leading-relaxed">{cfg.text}</p>
          </div>
          <Button variant="outline" className="w-full rounded-full" onClick={() => navigate("/wallet")}>
            <ArrowLeft className="h-4 w-4 mr-2" /> {t("wallet.agentApplyReturnWallet")}
          </Button>
        </div>
      </div>
    );
  }

  /* ── Success screen ── */
  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="w-full max-w-sm text-center space-y-6">
          <div className="w-24 h-24 bg-emerald-50 dark:bg-emerald-950/30 rounded-3xl flex items-center justify-center mx-auto">
            <CheckCircle2 className="h-12 w-12 text-emerald-500" />
          </div>
          <div>
            <h2 className="text-2xl font-black mb-3">{t("wallet.agentApplySuccessTitle")}</h2>
            <p className="text-muted-foreground text-sm leading-relaxed">{t("wallet.agentApplySuccessDesc")}</p>
            <p className="text-xs text-muted-foreground mt-2">{t("wallet.agentApplySuccessNote")}</p>
          </div>
          <Button className="w-full rounded-full" onClick={() => navigate("/wallet")}>
            {t("wallet.agentApplyReturnWallet")}
          </Button>
        </div>
      </div>
    );
  }

  const idx = STEPS.indexOf(step);
  const businessTypes = ["Echanj Lajan", "Transfè Voye", "Kanbis / Boutik", "Lòt"];
  const exchangeTypes = ["USD ↔ HTG", "USD ↔ DOP", "HTG ↔ DOP", "Kriptomoneyi"];

  return (
    <div className="min-h-screen bg-background">
      {/* ── Header ── */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-lg border-b border-border/50">
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center gap-3">
          <button type="button" onClick={() => navigate("/wallet")} className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-muted transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <span className="font-semibold text-foreground flex-1">{t("nav.agent")}</span>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 pb-24">
        {/* ── Hero banner ── */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-primary/90 to-orange-500 p-6 mb-8 text-white shadow-xl shadow-primary/20">
          <div className="absolute top-0 right-0 w-40 h-40 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />
          <div className="relative">
            <div className="w-14 h-14 bg-white/20 backdrop-blur rounded-2xl flex items-center justify-center mb-4">
              <Shield className="h-7 w-7 text-white" />
            </div>
            <h1 className="text-2xl font-black leading-tight mb-1">
              {t("wallet.agentApplyTitle")}
            </h1>
            <p className="text-white/80 text-sm leading-relaxed mb-4">
              {t("wallet.agentApplySubtitle")}
            </p>
            <div className="flex flex-wrap gap-2">
              {[
                { icon: DollarSign, label: t("wallet.agentApplyBadge") },
                { icon: Globe,      label: t("wallet.agentApplyBadgeExchange") },
                { icon: Star,       label: t("wallet.agentApplyBadgeElite") },
              ].map(({ icon: Icon, label }) => (
                <div key={label} className="flex items-center gap-1.5 bg-white/15 backdrop-blur rounded-full px-3 py-1.5">
                  <Icon className="h-3.5 w-3.5" />
                  <span className="text-xs font-semibold">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Step bar ── */}
        <StepBar current={idx} labels={stepLabels} />

        {/* ── Step 1: Personal ── */}
        {step === "personal" && (
          <div className="space-y-5">
            <SectionHeader icon={User} title={t("wallet.agentApplyPersonalTitle")} />
            <Field label={t("wallet.agentApplyFullName")}>
              <Input value={form.fullName} onChange={e => set("fullName", e.target.value)} placeholder="Jean Pierre" className="rounded-xl h-12 bg-muted/40 border-border/60 focus:bg-background" />
            </Field>
            <Field label={t("wallet.agentApplyAddress")}>
              <Input value={form.address} onChange={e => set("address", e.target.value)} placeholder="Rue principale, Pétion-Ville" className="rounded-xl h-12 bg-muted/40 border-border/60 focus:bg-background" />
            </Field>
            <Field label={t("wallet.agentApplyCity")}>
              <Input value={form.city} onChange={e => set("city", e.target.value)} placeholder="Port-au-Prince" className="rounded-xl h-12 bg-muted/40 border-border/60 focus:bg-background" />
            </Field>
            <Field label={t("wallet.agentApplyPhone")}>
              <Input value={form.phone} onChange={e => set("phone", e.target.value)} placeholder="+509 3412 3456" className="rounded-xl h-12 bg-muted/40 border-border/60 focus:bg-background" />
            </Field>
            <Field label={t("wallet.agentApplyWhatsapp")}>
              <Input value={form.whatsappNumber} onChange={e => set("whatsappNumber", e.target.value)} placeholder="+509 3412 3456" className="rounded-xl h-12 bg-muted/40 border-border/60 focus:bg-background" />
            </Field>
            <Button
              className="w-full h-12 rounded-full font-semibold shadow-lg shadow-primary/20 mt-2"
              onClick={() => setStep("business")}
              disabled={!form.fullName || !form.address || !form.city || !form.phone}
            >
              {t("wallet.agentApplyContinue")} <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        )}

        {/* ── Step 2: Business ── */}
        {step === "business" && (
          <div className="space-y-5">
            <SectionHeader icon={FileText} title={t("wallet.agentApplyBusinessTitle")} />
            <Field label={t("wallet.agentApplyBusinessName")}>
              <Input value={form.businessName} onChange={e => set("businessName", e.target.value)} placeholder="MonCash Exchange…" className="rounded-xl h-12 bg-muted/40 border-border/60 focus:bg-background" />
            </Field>
            <Field label={t("wallet.agentApplyBusinessLocation")}>
              <Input value={form.businessLocation} onChange={e => set("businessLocation", e.target.value)} placeholder="Rue Pavée, Port-au-Prince" className="rounded-xl h-12 bg-muted/40 border-border/60 focus:bg-background" />
            </Field>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-foreground/80">{t("wallet.agentApplyBusinessType")}</Label>
              <ChipGroup options={businessTypes} value={form.businessType} onChange={v => set("businessType", v)} />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-foreground/80">{t("wallet.agentApplyExchangeType")}</Label>
              <ChipGroup options={exchangeTypes} value={form.exchangeActivityType} onChange={v => set("exchangeActivityType", v)} />
            </div>
            <div className="flex gap-3 mt-2">
              <Button variant="outline" className="flex-1 h-12 rounded-full" onClick={() => setStep("personal")}>
                <ChevronLeft className="h-4 w-4 mr-1" /> {t("wallet.agentApplyBack")}
              </Button>
              <Button className="flex-1 h-12 rounded-full font-semibold shadow-lg shadow-primary/20" onClick={() => setStep("kyc")}>
                {t("wallet.agentApplyContinue")} <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 3: KYC ── */}
        {step === "kyc" && (
          <div className="space-y-5">
            <SectionHeader icon={Camera} title={t("wallet.agentApplyKycTitle")} />
            <div className="flex items-start gap-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-2xl p-4">
              <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                {t("wallet.agentApplyKycNotice")}
              </p>
            </div>
            <DocUpload
              label={t("wallet.agentApplyGovIdFront")}
              hint={t("wallet.agentApplyGovIdFrontHint")}
              value={form.govIdFront}
              onChange={v => set("govIdFront", v)}
              uploadLabel={t("wallet.agentApplyUpload")}
              uploadedLabel={t("wallet.agentApplyUploaded")}
              uploadFailLabel={t("wallet.agentApplyUploadFail")}
            />
            <DocUpload
              label={t("wallet.agentApplyGovIdBack")}
              hint={t("wallet.agentApplyGovIdBackHint")}
              value={form.govIdBack}
              onChange={v => set("govIdBack", v)}
              uploadLabel={t("wallet.agentApplyUpload")}
              uploadedLabel={t("wallet.agentApplyUploaded")}
              uploadFailLabel={t("wallet.agentApplyUploadFail")}
            />
            <DocUpload
              label={t("wallet.agentApplySelfie")}
              hint={t("wallet.agentApplySelfieHint")}
              value={form.selfieWithId}
              onChange={v => set("selfieWithId", v)}
              uploadLabel={t("wallet.agentApplyUpload")}
              uploadedLabel={t("wallet.agentApplyUploaded")}
              uploadFailLabel={t("wallet.agentApplyUploadFail")}
            />
            <DocUpload
              label={t("wallet.agentApplyProofAddress")}
              hint={t("wallet.agentApplyProofAddressHint")}
              value={form.proofOfAddress}
              onChange={v => set("proofOfAddress", v)}
              uploadLabel={t("wallet.agentApplyUpload")}
              uploadedLabel={t("wallet.agentApplyUploaded")}
              uploadFailLabel={t("wallet.agentApplyUploadFail")}
            />
            <div className="flex gap-3 mt-2">
              <Button variant="outline" className="flex-1 h-12 rounded-full" onClick={() => setStep("business")}>
                <ChevronLeft className="h-4 w-4 mr-1" /> {t("wallet.agentApplyBack")}
              </Button>
              <Button
                className="flex-1 h-12 rounded-full font-semibold shadow-lg shadow-primary/20"
                onClick={() => setStep("review")}
                disabled={!form.govIdFront || !form.selfieWithId}
              >
                {t("wallet.agentApplyContinue")} <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 4: Review ── */}
        {step === "review" && (
          <div className="space-y-5">
            <SectionHeader icon={CheckCircle2} title={t("wallet.agentApplyReviewTitle")} />

            {/* Personal summary */}
            <div className="rounded-2xl border border-border/60 overflow-hidden">
              <div className="bg-muted/40 px-4 py-2.5 border-b border-border/40">
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  {t("wallet.agentApplyReviewPersonal")}
                </p>
              </div>
              <div className="px-4 py-3 space-y-2">
                {[form.fullName, form.address, form.city, form.phone].filter(Boolean).map((v, i) => (
                  <p key={i} className="text-sm text-foreground">{v}</p>
                ))}
              </div>
            </div>

            {/* Business summary */}
            <div className="rounded-2xl border border-border/60 overflow-hidden">
              <div className="bg-muted/40 px-4 py-2.5 border-b border-border/40">
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  {t("wallet.agentApplyReviewBusiness")}
                </p>
              </div>
              <div className="px-4 py-3 space-y-2">
                {[form.businessName || "—", form.businessType || "—", form.exchangeActivityType || "—"].map((v, i) => (
                  <p key={i} className="text-sm text-foreground">{v}</p>
                ))}
              </div>
            </div>

            {/* KYC docs thumbnails */}
            <div className="rounded-2xl border border-border/60 overflow-hidden">
              <div className="bg-muted/40 px-4 py-2.5 border-b border-border/40">
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  {t("wallet.agentApplyReviewDocs")}
                </p>
              </div>
              <div className="px-4 py-3">
                <div className="flex gap-2 flex-wrap">
                  {[form.govIdFront, form.govIdBack, form.selfieWithId, form.proofOfAddress].filter(Boolean).map((url, i) => (
                    <div key={i} className="relative">
                      <img src={url} alt="" className="w-16 h-16 rounded-xl object-cover border border-border shadow-sm" />
                      <div className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-primary rounded-full flex items-center justify-center">
                        <CheckCircle2 className="h-3 w-3 text-white" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Consent notice */}
            <div className="flex items-start gap-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-2xl p-4">
              <Shield className="h-4 w-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
                {t("wallet.agentApplyReviewNotice")}
              </p>
            </div>

            <div className="flex gap-3 mt-2">
              <Button variant="outline" className="flex-1 h-12 rounded-full" onClick={() => setStep("kyc")}>
                <ChevronLeft className="h-4 w-4 mr-1" /> {t("wallet.agentApplyBack")}
              </Button>
              <Button
                className="flex-1 h-12 rounded-full font-semibold shadow-lg shadow-primary/20"
                onClick={handleSubmit}
                disabled={submitting}
              >
                {submitting
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <><Shield className="h-4 w-4 mr-1.5" /> {t("wallet.agentApplySubmit")}</>
                }
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
