import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import {
  ChevronLeft, Check, Loader2, DollarSign, Calendar, MapPin, Camera, Trash2,
  FileText, Home, Clock, Bike, Car, MoreHorizontal, User, Phone, Mail, AlertCircle,
} from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { APPLY_BRAND, HAITI_COMMUNES_BY_DEPARTMENT, HAITI_DEPARTMENTS } from "@/lib/haitiCommunes";

type WizardStep = 0 | 1 | 2 | 3 | 4 | 5; // 0 welcome, 1-4 form, 5 success

type FormState = {
  fullName: string;
  dateOfBirth: string;
  phone: string;
  email: string;
  address: string;
  residentialDepartment: string;
  residentialCommune: string;
  vehicleType: "moto" | "car" | "other" | "";
  vehicleBrand: string;
  vehicleModel: string;
  licensePlate: string;
  workDepartment: string;
  workCommunes: string[];
  photoId: string | null;
  photoLicense: string | null;
  photoVehicleDoc: string | null;
  acceptedTerms: boolean;
};

const EMPTY: FormState = {
  fullName: "",
  dateOfBirth: "",
  phone: "",
  email: "",
  address: "",
  residentialDepartment: "",
  residentialCommune: "",
  vehicleType: "",
  vehicleBrand: "",
  vehicleModel: "",
  licensePlate: "",
  workDepartment: "",
  workCommunes: [],
  photoId: null,
  photoLicense: null,
  photoVehicleDoc: null,
  acceptedTerms: false,
};

const LS_KEY = "fm_driver_apply_v2";

function splitName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: parts[0] };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("509") && digits.length >= 11) return `+${digits}`;
  if (digits.length === 8) return `+509${digits}`;
  if (raw.trim().startsWith("+")) return raw.trim();
  return digits ? `+509${digits}` : "";
}

function ageFromDob(dob: string): number | null {
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  return (Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000);
}

async function uploadFile(file: File, token: string): Promise<string> {
  if (file.size > 12 * 1024 * 1024) throw new Error("File too large (max 12MB)");
  const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
  if (!allowed.includes(file.type)) throw new Error("Unsupported file type");
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/upload", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "Upload failed");
  const url = data.url || data.fileUrl || data.location;
  if (!url) throw new Error("Upload failed");
  return String(url);
}

function StepProgress({ step }: { step: number }) {
  return (
    <div className="flex items-center justify-center gap-2 py-3" data-testid="apply-progress">
      {[1, 2, 3, 4, 5].map((n) => {
        const done = step > n;
        const current = step === n;
        return (
          <div key={n} className="flex items-center gap-2">
            <div
              className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-black border-2"
              style={
                done || current
                  ? { background: APPLY_BRAND.success, borderColor: APPLY_BRAND.success, color: "#fff" }
                  : { borderColor: "hsl(var(--border))", color: "hsl(var(--muted-foreground))" }
              }
            >
              {done ? <Check className="h-4 w-4" /> : n}
            </div>
            {n < 5 && (
              <div className="w-6 h-0.5 rounded" style={{ background: step > n ? APPLY_BRAND.success : "hsl(var(--border))" }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function DocSlot({
  label, hint, url, onUpload, onClear, uploading,
}: {
  label: string; hint: string; url: string | null;
  onUpload: (file: File) => void; onClear: () => void; uploading: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="rounded-2xl border border-border bg-card p-3 space-y-2">
      <div className="flex items-start gap-3">
        <span className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: APPLY_BRAND.soft, color: APPLY_BRAND.success }}>
          <FileText className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">{label}</p>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
        {url && (
          <button type="button" onClick={onClear} className="text-muted-foreground hover:text-destructive" aria-label="Remove">
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
      {url ? (
        <div className="rounded-xl overflow-hidden border border-border bg-muted/30">
          {url.toLowerCase().includes(".pdf") ? (
            <a href={url} target="_blank" rel="noopener noreferrer" className="block p-3 text-sm font-semibold underline" style={{ color: APPLY_BRAND.success }}>
              View uploaded document
            </a>
          ) : (
            <img src={url} alt="" className="h-28 w-full object-cover" />
          )}
        </div>
      ) : (
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="w-full h-11 rounded-xl border-2 border-dashed font-bold text-sm flex items-center justify-center gap-2"
          style={{ borderColor: APPLY_BRAND.softBorder, color: APPLY_BRAND.success }}
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
          Upload
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onUpload(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}

export default function ApplyForDriver() {
  const { user, token } = useAuth();
  const [, setLocation] = useLocation();
  const { t } = useTranslation();
  const { toast } = useToast();

  const [step, setStep] = useState<WizardStep>(0);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [loadingGate, setLoadingGate] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<{ id: string; at: string; status: string } | null>(null);
  const [existingStatus, setExistingStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setLocation("/auth/login");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/delivery/application", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        const app = data.application;
        const driver = data.driver;
        if (driver?.status === "active") {
          setLocation("/driver/dashboard");
          return;
        }
        if (app && ["pending", "approved"].includes(app.status)) {
          setExistingStatus(app.status);
          setSubmitted({
            id: `DRV-${String(app.id).padStart(10, "0")}`,
            at: app.updatedAt || app.createdAt,
            status: app.status,
          });
          setStep(5);
          return;
        }
        // Resume draft / needs_changes / rejected into form
        const saved = localStorage.getItem(LS_KEY);
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            if (parsed?.form) setForm({ ...EMPTY, ...parsed.form });
            if (typeof parsed?.step === "number" && parsed.step >= 1 && parsed.step <= 4) {
              setStep(parsed.step as WizardStep);
            }
          } catch { /* ignore */ }
        }
        if (app && ["draft", "needs_changes", "rejected"].includes(app.status)) {
          setExistingStatus(app.status);
          const zones = (() => {
            try { return JSON.parse(app.workZones || "[]"); } catch { return []; }
          })();
          setForm((prev) => ({
            ...prev,
            fullName: `${app.firstName || ""} ${app.lastName || ""}`.trim() || prev.fullName,
            dateOfBirth: app.dateOfBirth && app.dateOfBirth !== "1900-01-01" ? app.dateOfBirth : prev.dateOfBirth,
            phone: app.callPhone || app.whatsappNumber || prev.phone,
            email: app.internetProvider?.includes("@") ? app.internetProvider : prev.email || user.email || "",
            address: app.address || prev.address,
            residentialCommune: app.city || prev.residentialCommune,
            vehicleType: app.vehicleType === "car" ? "car" : app.vehicleType === "moto" ? "moto" : app.vehicleType ? "other" : prev.vehicleType,
            vehicleBrand: app.vehicleBrand || prev.vehicleBrand,
            vehicleModel: app.vehicleModel || prev.vehicleModel,
            licensePlate: app.licensePlateNumber || prev.licensePlate,
            workCommunes: Array.isArray(zones) ? zones : prev.workCommunes,
            photoId: app.photoIdSelfie || app.facePhotoHoldingId || prev.photoId,
            photoLicense: app.photoLicenseFront || prev.photoLicense,
            photoVehicleDoc: app.photoVehicleRegistration || prev.photoVehicleDoc,
          }));
        } else {
          setForm((prev) => ({
            ...prev,
            fullName: prev.fullName || user.name || "",
            email: prev.email || user.email || "",
            phone: prev.phone || user.phone || "",
          }));
        }
      } finally {
        if (!cancelled) setLoadingGate(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user, token, setLocation]);

  useEffect(() => {
    if (step >= 1 && step <= 4) {
      localStorage.setItem(LS_KEY, JSON.stringify({ step, form }));
    }
  }, [step, form]);

  const residentialCommunes = form.residentialDepartment
    ? HAITI_COMMUNES_BY_DEPARTMENT[form.residentialDepartment] || []
    : [];
  const workCommunesOptions = form.workDepartment
    ? HAITI_COMMUNES_BY_DEPARTMENT[form.workDepartment] || []
    : [];

  const payload = useMemo(() => {
    const { firstName, lastName } = splitName(form.fullName);
    const phone = normalizePhone(form.phone);
    const backendVehicle =
      form.vehicleType === "car" ? "car" : form.vehicleType === "moto" ? "moto" : form.vehicleType === "other" ? "other" : null;
    return {
      firstName,
      lastName,
      dateOfBirth: form.dateOfBirth,
      address: form.address || form.residentialCommune,
      city: form.residentialCommune || form.workCommunes[0] || form.residentialDepartment,
      residentialDepartment: form.residentialDepartment,
      whatsappNumber: phone,
      callPhone: phone,
      email: form.email,
      vehicleType: backendVehicle,
      vehicleBrand: form.vehicleBrand || null,
      vehicleModel: form.vehicleModel || null,
      licensePlateNumber: form.licensePlate || null,
      workZones: form.workCommunes,
      photoIdSelfie: form.photoId,
      facePhotoHoldingId: form.photoId,
      photoLicenseFront: form.photoLicense,
      photoVehicleRegistration: form.photoVehicleDoc,
      hasSmartphone: true,
      hasStableInternet: true,
      hasFastPhone: true,
    };
  }, [form]);

  async function saveDraft(silent = false) {
    setSaving(true);
    try {
      const res = await fetch("/api/delivery/application/draft", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Could not save draft");
      if (!silent) {
        toast({ title: t("driverApplyPro.draftSaved", { defaultValue: "Progress saved" }) });
      }
      return true;
    } catch (e: any) {
      if (!silent) toast({ title: e?.message || "Error", variant: "destructive" });
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function submit() {
    if (!form.acceptedTerms) {
      toast({
        title: t("driverApplyPro.acceptTerms", { defaultValue: "Please accept the driver terms" }),
        variant: "destructive",
      });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/delivery/apply", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Submit failed");
      localStorage.removeItem(LS_KEY);
      setSubmitted({
        id: data.applicationId || `DRV-${data.application?.id}`,
        at: data.application?.updatedAt || data.application?.createdAt || new Date().toISOString(),
        status: data.application?.status || "pending",
      });
      setStep(5);
    } catch (e: any) {
      toast({ title: e?.message || "Error", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpload(key: "photoId" | "photoLicense" | "photoVehicleDoc", file: File) {
    setUploading(key);
    try {
      const url = await uploadFile(file, token!);
      setForm((f) => ({ ...f, [key]: url }));
    } catch (e: any) {
      toast({ title: e?.message || "Upload failed", variant: "destructive" });
    } finally {
      setUploading(null);
    }
  }

  function validateStep(s: WizardStep): string | null {
    if (s === 1) {
      if (!form.fullName.trim()) return t("driverApplyPro.errName", { defaultValue: "Enter your full legal name" });
      if (!form.dateOfBirth) return t("driverApplyPro.errDob", { defaultValue: "Enter your date of birth" });
      const age = ageFromDob(form.dateOfBirth);
      if (age == null || age < 18) return t("driverApplyPro.errAge", { defaultValue: "You must be at least 18 years old" });
      if (!normalizePhone(form.phone)) return t("driverApplyPro.errPhone", { defaultValue: "Enter a valid Haiti phone number (+509)" });
      if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
        return t("driverApplyPro.errEmail", { defaultValue: "Enter a valid email" });
      }
      if (!form.residentialDepartment || !form.residentialCommune) {
        return t("driverApplyPro.errResidence", { defaultValue: "Select your residential department and commune" });
      }
    }
    if (s === 2) {
      if (!form.vehicleType) return t("driverApplyPro.errVehicle", { defaultValue: "Select a transport type" });
      if (!form.workDepartment || form.workCommunes.length === 0) {
        return t("driverApplyPro.errZones", { defaultValue: "Select a work department and at least one commune" });
      }
    }
    if (s === 3) {
      if (!form.photoId) return t("driverApplyPro.errId", { defaultValue: "Upload a national ID document" });
      if (form.vehicleType === "car" && !form.photoLicense) {
        return t("driverApplyPro.errLicense", { defaultValue: "Driver’s license is required for cars" });
      }
      if ((form.vehicleType === "moto" || form.vehicleType === "car") && !form.photoVehicleDoc) {
        return t("driverApplyPro.errVehicleDoc", { defaultValue: "Upload the vehicle document" });
      }
    }
    return null;
  }

  async function goNext() {
    const err = validateStep(step);
    if (err) {
      toast({ title: err, variant: "destructive" });
      return;
    }
    await saveDraft(true);
    if (step === 4) {
      await submit();
      return;
    }
    setStep((s) => (s + 1) as WizardStep);
  }

  if (!user || loadingGate) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: APPLY_BRAND.success }} />
      </div>
    );
  }

  // ── Welcome ──
  if (step === 0) {
    return (
      <div className="max-w-lg mx-auto pb-28" data-testid="driver-apply-welcome">
        <div className="relative h-56 overflow-hidden" style={{ background: APPLY_BRAND.primary }}>
          <img
            src="/delivery-moto.png"
            alt=""
            className="absolute inset-0 w-full h-full object-cover opacity-80"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
          <div className="absolute top-4 left-4 flex items-center gap-2">
            <img src="/flexa-logo-v2.png" alt="Flexa Market" className="h-9 w-9 rounded-xl" />
            <span className="text-white font-bold text-sm">Flexa Market</span>
          </div>
        </div>
        <div className="px-5 -mt-6 relative space-y-4">
          <div className="rounded-2xl bg-card border border-border shadow-sm p-5 space-y-3">
            <h1 className="text-2xl font-black text-foreground">
              {t("driverApplyPro.welcomeTitle", { defaultValue: "Become a Flexa Market Driver" })}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t("driverApplyPro.welcomeSubtitle", {
                defaultValue: "Make deliveries, earn income, and work in your own area in Haiti.",
              })}
            </p>
            <ul className="space-y-2.5 pt-1">
              {[
                { icon: DollarSign, text: t("driverApplyPro.benefitIncome", { defaultValue: "Attractive income — get paid for each delivery." }) },
                { icon: Calendar, text: t("driverApplyPro.benefitFlex", { defaultValue: "Flexible schedule — work when you are available." }) },
                { icon: MapPin, text: t("driverApplyPro.benefitLocal", { defaultValue: "Work locally — choose your department and communes." }) },
              ].map((b) => (
                <li key={b.text} className="flex gap-3 items-start text-sm">
                  <span className="h-8 w-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: APPLY_BRAND.soft, color: APPLY_BRAND.success }}>
                    <b.icon className="h-4 w-4" />
                  </span>
                  <span className="pt-1.5 font-medium text-foreground">{b.text}</span>
                </li>
              ))}
            </ul>
            <Button
              className="w-full h-12 text-base font-bold rounded-xl text-white mt-2"
              style={{ background: APPLY_BRAND.primary }}
              onClick={() => setStep(1)}
              data-testid="start-driver-apply"
            >
              {t("driverApplyPro.applyCta", { defaultValue: "Apply as a driver" })} →
            </Button>
            <button
              type="button"
              className="w-full text-center text-sm font-semibold underline"
              style={{ color: APPLY_BRAND.success }}
              onClick={() => setLocation("/help-center")}
            >
              {t("driverApplyPro.learnMore", { defaultValue: "Learn more about the requirements" })}
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground text-center px-2">
            {t("driverApplyPro.noGuarantee", {
              defaultValue: "Approval is not guaranteed. Existing Flexa Market accounts are reused — no duplicate driver accounts.",
            })}
          </p>
        </div>
      </div>
    );
  }

  // ── Success / status ──
  if (step === 5 && submitted) {
    return (
      <div className="max-w-lg mx-auto px-4 py-8 pb-28 space-y-5" data-testid="driver-apply-success">
        <div className="text-center space-y-3 pt-6">
          <div className="mx-auto h-20 w-20 rounded-2xl flex items-center justify-center" style={{ background: APPLY_BRAND.soft }}>
            <Check className="h-10 w-10" style={{ color: APPLY_BRAND.success }} />
          </div>
          <h1 className="text-2xl font-black">
            {t("driverApplyPro.submittedTitle", { defaultValue: "Application submitted" })}
          </h1>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            {t("driverApplyPro.submittedBody", {
              defaultValue: "Your application was submitted successfully! We are verifying your information. You will get a notification when the status changes.",
            })}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 space-y-3 shadow-sm">
          <p className="text-xs font-bold uppercase text-muted-foreground">
            {t("driverApplyPro.applicationStatus", { defaultValue: "Application status" })}
          </p>
          <div className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-bold bg-amber-50 text-amber-800 border border-amber-200">
            <Clock className="h-4 w-4" />
            {submitted.status === "pending"
              ? t("driverApplyPro.pendingReview", { defaultValue: "Pending review" })
              : submitted.status}
          </div>
          <p className="text-sm">
            <span className="text-muted-foreground">{t("driverApplyPro.ref", { defaultValue: "Reference" })}: </span>
            <span className="font-mono font-bold">{submitted.id}</span>
          </p>
          <p className="text-sm text-muted-foreground">
            {t("driverApplyPro.submittedAt", { defaultValue: "Submitted" })}:{" "}
            {new Date(submitted.at).toLocaleString()}
          </p>
        </div>
        <Button
          className="w-full h-12 font-bold rounded-xl text-white"
          style={{ background: APPLY_BRAND.primary }}
          onClick={() => setLocation("/driver/status")}
        >
          {t("driverApplyPro.trackStatus", { defaultValue: "Track application status" })}
        </Button>
        <Button variant="outline" className="w-full h-11 font-bold rounded-xl" onClick={() => setLocation("/")}>
          <Home className="h-4 w-4 mr-2" />
          {t("driverApplyPro.backHome", { defaultValue: "Return to Home" })}
        </Button>
      </div>
    );
  }

  const titles: Record<number, string> = {
    1: t("driverApplyPro.personalTitle", { defaultValue: "Personal information" }),
    2: t("driverApplyPro.transportTitle", { defaultValue: "Transport information" }),
    3: t("driverApplyPro.docsTitle", { defaultValue: "Documents & verification" }),
    4: t("driverApplyPro.reviewTitle", { defaultValue: "Submit application" }),
  };

  return (
    <div className="max-w-lg mx-auto px-4 py-4 pb-28 space-y-4" data-testid="driver-apply-wizard">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2"
          onClick={() => setStep((s) => (s <= 1 ? 0 : ((s - 1) as WizardStep)))}
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          {t("driverApplyPro.back", { defaultValue: "Back" })}
        </Button>
        <div className="flex-1" />
        <img src="/flexa-logo-v2.png" alt="" className="h-7 w-7 rounded-lg" />
      </div>

      <StepProgress step={step} />
      <div>
        <h1 className="text-xl font-black text-foreground">{titles[step]}</h1>
        {existingStatus === "needs_changes" && (
          <p className="text-xs text-amber-700 mt-1 flex items-center gap-1">
            <AlertCircle className="h-3.5 w-3.5" />
            {t("driverApplyPro.needsChanges", { defaultValue: "Additional information was requested. Update and resubmit." })}
          </p>
        )}
      </div>

      {step === 1 && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {t("driverApplyPro.personalHint", { defaultValue: "Fill in your personal information." })}
          </p>
          <label className="block space-y-1">
            <span className="text-xs font-bold">{t("driverApplyPro.fullName", { defaultValue: "Full name" })} *</span>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="h-11 pl-9 rounded-xl" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
            </div>
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-bold">{t("driverApplyPro.dob", { defaultValue: "Date of birth" })} *</span>
            <Input type="date" className="h-11 rounded-xl" value={form.dateOfBirth} onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })} />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-bold">{t("driverApplyPro.phone", { defaultValue: "Phone number" })} *</span>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="h-11 pl-9 rounded-xl" placeholder="+509 …" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-bold">{t("driverApplyPro.email", { defaultValue: "Email" })}</span>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input type="email" className="h-11 pl-9 rounded-xl" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-bold">{t("driverApplyPro.address", { defaultValue: "Residential address" })}</span>
            <Input className="h-11 rounded-xl" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-bold">{t("driverApplyPro.department", { defaultValue: "Department" })} *</span>
            <select
              className="w-full h-11 rounded-xl border border-border bg-background px-3 text-sm font-semibold"
              value={form.residentialDepartment}
              onChange={(e) => setForm({ ...form, residentialDepartment: e.target.value, residentialCommune: "" })}
            >
              <option value="">{t("driverApplyPro.select", { defaultValue: "Select…" })}</option>
              {HAITI_DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-bold">{t("driverApplyPro.commune", { defaultValue: "Commune" })} *</span>
            <select
              className="w-full h-11 rounded-xl border border-border bg-background px-3 text-sm font-semibold"
              value={form.residentialCommune}
              disabled={!form.residentialDepartment}
              onChange={(e) => setForm({ ...form, residentialCommune: e.target.value })}
            >
              <option value="">{t("driverApplyPro.select", { defaultValue: "Select…" })}</option>
              {residentialCommunes.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t("driverApplyPro.transportHint", {
              defaultValue: "Provide transport details and the areas where you want to deliver.",
            })}
          </p>
          <div className="grid grid-cols-3 gap-2">
            {([
              { id: "moto", label: t("driverApplyPro.moto", { defaultValue: "Motorcycle" }), Icon: Bike },
              { id: "car", label: t("driverApplyPro.car", { defaultValue: "Car" }), Icon: Car },
              { id: "other", label: t("driverApplyPro.other", { defaultValue: "Other" }), Icon: MoreHorizontal },
            ] as const).map((v) => {
              const active = form.vehicleType === v.id;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setForm({ ...form, vehicleType: v.id })}
                  className="rounded-2xl border-2 p-3 text-center space-y-1"
                  style={active ? { borderColor: APPLY_BRAND.success, background: APPLY_BRAND.soft } : undefined}
                >
                  <v.Icon className="h-6 w-6 mx-auto" style={{ color: active ? APPLY_BRAND.success : undefined }} />
                  <span className="text-xs font-bold block">{v.label}</span>
                </button>
              );
            })}
          </div>
          {(form.vehicleType === "moto" || form.vehicleType === "car") && (
            <>
              <Input className="h-11 rounded-xl" placeholder={t("driverApplyPro.make", { defaultValue: "Make" })} value={form.vehicleBrand} onChange={(e) => setForm({ ...form, vehicleBrand: e.target.value })} />
              <Input className="h-11 rounded-xl" placeholder={t("driverApplyPro.model", { defaultValue: "Model" })} value={form.vehicleModel} onChange={(e) => setForm({ ...form, vehicleModel: e.target.value })} />
              <Input className="h-11 rounded-xl" placeholder={t("driverApplyPro.plate", { defaultValue: "License plate (if available)" })} value={form.licensePlate} onChange={(e) => setForm({ ...form, licensePlate: e.target.value })} />
            </>
          )}

          <div className="rounded-2xl border border-border p-3 space-y-3">
            <p className="text-sm font-bold">
              {t("driverApplyPro.workZones", { defaultValue: "Delivery work zones" })}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("driverApplyPro.workZonesHint", {
                defaultValue: "Separate from your residential address. Choose where you want to accept deliveries.",
              })}
            </p>
            <select
              className="w-full h-11 rounded-xl border border-border bg-background px-3 text-sm font-semibold"
              value={form.workDepartment}
              onChange={(e) => setForm({ ...form, workDepartment: e.target.value, workCommunes: [] })}
            >
              <option value="">{t("driverApplyPro.selectDepartment", { defaultValue: "Select department" })}</option>
              {HAITI_DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            {form.workDepartment && (
              <div className="flex flex-wrap gap-2">
                {form.workCommunes.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className="rounded-full px-3 py-1 text-xs font-bold text-white"
                    style={{ background: APPLY_BRAND.primary }}
                    onClick={() => setForm({ ...form, workCommunes: form.workCommunes.filter((x) => x !== c) })}
                  >
                    {c} ×
                  </button>
                ))}
              </div>
            )}
            {form.workDepartment && (
              <select
                className="w-full h-11 rounded-xl border border-border bg-background px-3 text-sm"
                value=""
                onChange={(e) => {
                  const c = e.target.value;
                  if (c && !form.workCommunes.includes(c)) {
                    setForm({ ...form, workCommunes: [...form.workCommunes, c] });
                  }
                }}
              >
                <option value="">{t("driverApplyPro.addCommune", { defaultValue: "Add another commune" })}</option>
                {workCommunesOptions
                  .filter((c) => !form.workCommunes.includes(c))
                  .map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            )}
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {t("driverApplyPro.docsHint", {
              defaultValue: "Upload the documents required to verify your account.",
            })}
          </p>
          <DocSlot
            label={t("driverApplyPro.docId", { defaultValue: "National ID" })}
            hint={t("driverApplyPro.docIdHint", { defaultValue: "CIN, national ID, or passport" })}
            url={form.photoId}
            uploading={uploading === "photoId"}
            onUpload={(f) => handleUpload("photoId", f)}
            onClear={() => setForm({ ...form, photoId: null })}
          />
          {form.vehicleType !== "other" && (
            <DocSlot
              label={t("driverApplyPro.docLicense", { defaultValue: "Driver’s license" })}
              hint={
                form.vehicleType === "car"
                  ? t("driverApplyPro.docLicenseRequired", { defaultValue: "Required for cars" })
                  : t("driverApplyPro.docLicenseOptional", { defaultValue: "If required for your vehicle" })
              }
              url={form.photoLicense}
              uploading={uploading === "photoLicense"}
              onUpload={(f) => handleUpload("photoLicense", f)}
              onClear={() => setForm({ ...form, photoLicense: null })}
            />
          )}
          {(form.vehicleType === "moto" || form.vehicleType === "car") && (
            <DocSlot
              label={t("driverApplyPro.docVehicle", { defaultValue: "Vehicle document" })}
              hint={t("driverApplyPro.docVehicleHint", { defaultValue: "Registration / technical sheet" })}
              url={form.photoVehicleDoc}
              uploading={uploading === "photoVehicleDoc"}
              onUpload={(f) => handleUpload("photoVehicleDoc", f)}
              onClear={() => setForm({ ...form, photoVehicleDoc: null })}
            />
          )}
          <label className="flex items-start gap-3 rounded-xl border border-border p-3 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={form.acceptedTerms}
              onChange={(e) => setForm({ ...form, acceptedTerms: e.target.checked })}
            />
            <span>
              {t("driverApplyPro.termsPrefix", { defaultValue: "I have read and agree to the" })}{" "}
              <a href="/seller-policy" className="underline font-semibold" style={{ color: APPLY_BRAND.success }}>
                {t("driverApplyPro.driverRules", { defaultValue: "Driver Rules" })}
              </a>
              ,{" "}
              <a href="/privacy-policy" className="underline font-semibold" style={{ color: APPLY_BRAND.success }}>
                {t("driverApplyPro.privacy", { defaultValue: "Privacy Policy" })}
              </a>
              ,{" "}
              <a href="/terms" className="underline font-semibold" style={{ color: APPLY_BRAND.success }}>
                {t("driverApplyPro.terms", { defaultValue: "Terms of Use" })}
              </a>
              .
            </span>
          </label>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-3">
          <div className="rounded-2xl border border-border bg-card p-4 space-y-2 text-sm shadow-sm">
            <p className="font-bold text-base">{form.fullName}</p>
            <p className="text-muted-foreground">{normalizePhone(form.phone)} · {form.email || "—"}</p>
            <p>{form.residentialCommune}, {form.residentialDepartment}</p>
            <p className="capitalize">{form.vehicleType} {form.vehicleBrand} {form.vehicleModel}</p>
            <p>
              <span className="font-semibold">{t("driverApplyPro.zones", { defaultValue: "Zones" })}: </span>
              {form.workCommunes.join(", ")}
            </p>
            <p>
              {t("driverApplyPro.docsReady", { defaultValue: "Documents" })}:{" "}
              {[form.photoId && "ID", form.photoLicense && "License", form.photoVehicleDoc && "Vehicle"]
                .filter(Boolean)
                .join(", ") || "—"}
            </p>
            <p className="text-xs text-muted-foreground">
              {form.acceptedTerms
                ? t("driverApplyPro.termsAccepted", { defaultValue: "Terms accepted" })
                : t("driverApplyPro.termsMissing", { defaultValue: "Terms not accepted" })}
            </p>
          </div>
          <button type="button" className="text-sm font-semibold underline" style={{ color: APPLY_BRAND.success }} onClick={() => setStep(1)}>
            {t("driverApplyPro.editSections", { defaultValue: "Edit previous sections" })}
          </button>
        </div>
      )}

      <div className="flex gap-2 pt-2">
        <Button
          variant="outline"
          className="flex-1 h-12 font-bold rounded-xl"
          disabled={saving || submitting}
          onClick={() => saveDraft(false)}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : t("driverApplyPro.save", { defaultValue: "Save" })}
        </Button>
        <Button
          className="flex-[2] h-12 font-bold rounded-xl text-white"
          style={{ background: APPLY_BRAND.primary }}
          disabled={saving || submitting}
          onClick={goNext}
          data-testid="apply-continue"
        >
          {submitting ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : step === 4 ? (
            t("driverApplyPro.submit", { defaultValue: "Submit application" })
          ) : (
            t("driverApplyPro.continue", { defaultValue: "Continue" })
          )}
        </Button>
      </div>
    </div>
  );
}
