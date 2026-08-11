import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useUpdateUser, useSendOtp, useVerifyOtp, useChangeCountry, getGetMeQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/auth";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  Camera, Check, CheckCircle, Clock, Globe, Loader2,
  Lock, Phone, Shield, Sparkles, Star, Store, UserPlus, UserX, AlertTriangle,
} from "lucide-react";
import { useUpload } from "@workspace/object-storage-web";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useTranslation } from "react-i18next";
import { PHONE_COUNTRIES, getPhoneCountry, ISO_TO_COUNTRY } from "@/lib/phoneCountries";

// Each country listed individually — USA, Canada, Dominican Republic each
// have their own ISO code so they're never confused despite sharing +1.
type PhoneIso = string;

const GENDER_OPTIONS = [
  { value: "male",   label: "Gason" },
  { value: "female", label: "Fanm" },
  { value: "other",  label: "Lòt" },
] as const;

const schema = z.object({
  name: z.string().min(2, "Need at least 2 characters"),
  location: z.string().optional(),
  bio: z.string().max(200, "Keep it under 200 characters").optional(),
  avatar: z.string().optional(),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Dat ki valid: JJJJ-MM-AA").optional().or(z.literal("")),
  gender: z.enum(["male", "female", "other"]).optional().or(z.literal("")),
});

type FormValues = z.infer<typeof schema>;

function getStorageUrl(objectPath: string): string {
  if (objectPath.startsWith("http://") || objectPath.startsWith("https://")) return objectPath;
  const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
  return `${base}/api/storage${objectPath}`;
}

type StrengthLevel = "incomplete" | "good" | "verified";

function calcStrength(
  name: string,
  avatar: string,
  location: string,
  bio: string,
  phoneVerified: boolean,
  country: string
): { level: StrengthLevel; score: number; total: number } {
  const checks = [!!name?.trim(), !!avatar, !!location?.trim(), !!bio?.trim(), phoneVerified, !!country?.trim()];
  const score = checks.filter(Boolean).length;
  const total = checks.length;
  let level: StrengthLevel = "incomplete";
  if (phoneVerified && score >= 5) level = "verified";
  else if (score >= 4) level = "good";
  return { level, score, total };
}

let _triggerAutoSaveStatus: ((s: "saving" | "saved" | "idle") => void) | null = null;

function AutoSaveIndicator() {
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");

  useEffect(() => {
    _triggerAutoSaveStatus = setStatus;
    return () => { _triggerAutoSaveStatus = null; };
  }, []);

  return (
    <div
      data-testid="autosave-indicator"
      aria-live="polite"
      aria-label={status === "saving" ? "Saving" : status === "saved" ? "Saved" : ""}
      className={[
        "fixed bottom-20 left-1/2 -translate-x-1/2 z-50",
        "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium shadow-md transition-all duration-300",
        status === "idle" ? "opacity-0 bg-muted text-muted-foreground" :
          status === "saving" ? "opacity-100 bg-muted text-muted-foreground" :
            "opacity-100 bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
      ].join(" ")}
    >
      {status === "saving" && <Loader2 className="h-3 w-3 animate-spin" />}
      {status === "saved" && <Check className="h-3 w-3" />}
      {status === "saving" ? "Saving…" : status === "saved" ? "Saved" : ""}
    </div>
  );
}

function ChangePasswordCard() {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  };

  const handleSubmit = async () => {
    if (newPassword.length < 6) {
      toast({ title: t("editProfile.passwordTooShort"), description: t("editProfile.use6chars"), variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: t("editProfile.passwordsNoMatch"), variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const tk = localStorage.getItem("flexamarket_token");
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tk}` },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({
          title: t("editProfile.couldNotUpdate"),
          description: (data as any)?.error ?? t("common.tryAgain"),
          variant: "destructive",
        });
        return;
      }
      toast({ title: t("editProfile.passwordUpdated") });
      reset();
      setOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-2xl p-5 mb-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-bold text-foreground text-base flex items-center gap-1.5">
            <Lock className="h-4 w-4" /> {t("editProfile.password")}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t("editProfile.passwordDesc")}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-xl"
          onClick={() => setOpen(true)}
          data-testid="button-open-change-password"
        >
          {t("editProfile.change")}
        </Button>
      </div>
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("editProfile.changePassword")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <label className="text-sm font-medium">{t("editProfile.currentPassword")}</label>
            <PasswordInput
              placeholder="••••••••"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              data-testid="input-current-password"
            />
            <label className="text-sm font-medium">{t("editProfile.newPassword")}</label>
            <PasswordInput
              placeholder={t("editProfile.atLeast6")}
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              data-testid="input-new-password"
            />
            <label className="text-sm font-medium">{t("editProfile.confirmNewPassword")}</label>
            <PasswordInput
              placeholder="••••••••"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              data-testid="input-confirm-new-password"
            />
            <Button
              className="w-full font-bold mt-2"
              onClick={handleSubmit}
              disabled={submitting || !currentPassword || newPassword.length < 6 || newPassword !== confirmPassword}
              data-testid="button-submit-change-password"
            >
              {submitting ? t("editProfile.updating") : t("editProfile.updatePassword")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Store Manager Card ────────────────────────────────────────────────────────
const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

function StoreManagerCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [manager, setManager] = useState<{ id: number; name: string; email: string | null; phone: string | null } | null>(null);
  const [loadingManager, setLoadingManager] = useState(true);
  const [identifier, setIdentifier] = useState("");
  const [inviting, setInviting] = useState(false);
  const [revoking, setRevoking] = useState(false);

  const token = () => localStorage.getItem("flexamarket_token");

  const fetchManager = async () => {
    try {
      const r = await fetch(`${BASE_URL}/api/seller/manager`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      if (!r.ok) return;
      const d = await r.json();
      setManager(d.manager ?? null);
    } catch { /* non-fatal */ } finally {
      setLoadingManager(false);
    }
  };

  useEffect(() => { fetchManager(); }, []);

  const handleInvite = async () => {
    if (!identifier.trim()) return;
    setInviting(true);
    try {
      const r = await fetch(`${BASE_URL}/api/seller/manager/invite`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: identifier.trim() }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Invite failed");
      setManager(d.manager);
      setIdentifier("");
      toast({ title: "Manadjè envite ✓" });
    } catch (e: any) {
      toast({ title: e.message, variant: "destructive" });
    } finally {
      setInviting(false);
    }
  };

  const handleRevoke = async () => {
    setRevoking(true);
    try {
      const r = await fetch(`${BASE_URL}/api/seller/manager`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token()}` },
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Revoke failed");
      setManager(null);
      toast({ title: "Aksè manadjè retire ✓" });
    } catch (e: any) {
      toast({ title: e.message, variant: "destructive" });
    } finally {
      setRevoking(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-2xl p-5 shadow-sm mb-4">
      <div className="flex items-center gap-2 mb-1">
        <Store className="h-4 w-4 text-primary" />
        <h2 className="font-bold text-foreground text-base">Manadjè Lokal</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Chwazi yon moun nan zòn nan pou resevwa kòmand ak prepare pake yo pou chaofè.
      </p>

      {loadingManager ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Ap chaje…
        </div>
      ) : manager ? (
        <div className="space-y-3">
          <div className="flex items-center gap-3 bg-primary/5 border border-primary/20 rounded-xl px-3 py-2.5">
            <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">
              {manager.name?.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm text-foreground truncate">{manager.name}</p>
              <p className="text-xs text-muted-foreground truncate">{manager.phone ?? manager.email ?? "—"}</p>
            </div>
            <UserX
              className="h-4 w-4 text-destructive cursor-pointer shrink-0"
              onClick={handleRevoke}
            />
          </div>
          <button
            onClick={handleRevoke}
            disabled={revoking}
            className="w-full text-xs text-destructive hover:text-destructive/80 transition-colors font-medium flex items-center justify-center gap-1.5"
          >
            {revoking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserX className="h-3.5 w-3.5" />}
            Retire aksè manadjè
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              value={identifier}
              onChange={e => setIdentifier(e.target.value)}
              placeholder="Email oswa nimewo telefòn"
              className="flex-1 h-9 px-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              onKeyDown={e => e.key === "Enter" && handleInvite()}
            />
            <button
              onClick={handleInvite}
              disabled={inviting || !identifier.trim()}
              className="h-9 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 flex items-center gap-1.5 transition-opacity"
            >
              {inviting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
              Envite
            </button>
          </div>
          <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-500" />
            <span>Moun nan dwe gen kont Flexa deja. Yo ap wè kòmand ou yo sèlman — pa finansman.</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Pickup Hours Card ─────────────────────────────────────────────────────────
type PickupSlot = { day: number; openTime: string; closeTime: string };

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function PickupHoursCard({ initialSchedule }: { initialSchedule: PickupSlot[] | null }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [slots, setSlots] = useState<PickupSlot[]>(() => initialSchedule ?? []);
  const [saving, setSaving] = useState(false);

  const enabledDays = new Set(slots.map((s) => s.day));

  const toggleDay = (day: number) => {
    if (enabledDays.has(day)) {
      setSlots((prev) => prev.filter((s) => s.day !== day));
    } else {
      setSlots((prev) =>
        [...prev, { day, openTime: "08:00", closeTime: "17:00" }].sort((a, b) => a.day - b.day)
      );
    }
  };

  const updateTime = (day: number, field: "openTime" | "closeTime", value: string) => {
    setSlots((prev) => prev.map((s) => s.day === day ? { ...s, [field]: value } : s));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const tk = localStorage.getItem("flexamarket_token");
      const res = await fetch("/api/users/me/pickup-schedule", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tk}` },
        body: JSON.stringify({ schedule: slots }),
      });
      if (!res.ok) throw new Error();
      // Sync saved schedule back into the auth user cache so the card
      // reflects the correct state on the next render / page reload.
      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      toast({ title: "Pickup hours saved ✓" });
    } catch {
      toast({ title: "Couldn't save", description: "Please try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-bold text-foreground text-base flex items-center gap-1.5">
            <Clock className="h-4 w-4" /> Pickup Hours
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Let drivers know when your location is open for package pickup
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {DAY_LABELS.map((label, day) => {
          const enabled = enabledDays.has(day);
          const slot = slots.find((s) => s.day === day);
          return (
            <div key={day} className="flex items-center gap-3">
              {/* Day toggle */}
              <button
                type="button"
                onClick={() => toggleDay(day)}
                className={[
                  "w-12 text-xs font-semibold py-1.5 rounded-lg border transition-all shrink-0",
                  enabled
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-muted text-muted-foreground border-border hover:border-primary/50",
                ].join(" ")}
              >
                {label}
              </button>

              {/* Time pickers */}
              {enabled && slot ? (
                <div className="flex items-center gap-1.5 flex-1">
                  <input
                    type="time"
                    value={slot.openTime}
                    onChange={(e) => updateTime(day, "openTime", e.target.value)}
                    className="flex-1 min-w-0 rounded-lg border border-border bg-background px-2 py-1 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <span className="text-xs text-muted-foreground shrink-0">–</span>
                  <input
                    type="time"
                    value={slot.closeTime}
                    onChange={(e) => updateTime(day, "closeTime", e.target.value)}
                    className="flex-1 min-w-0 rounded-lg border border-border bg-background px-2 py-1 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              ) : (
                <span className="text-xs text-muted-foreground italic">Closed</span>
              )}
            </div>
          );
        })}
      </div>

      <Button
        type="button"
        size="sm"
        className="w-full mt-4 rounded-xl"
        onClick={handleSave}
        disabled={saving}
      >
        {saving ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Saving…</> : "Save Pickup Hours"}
      </Button>
    </div>
  );
}

export default function EditProfile() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const updateUser = useUpdateUser();
  const sendOtp = useSendOtp();
  const verifyOtp = useVerifyOtp();
  const changeCountry = useChangeCountry();
  const { uploadFile } = useUpload();
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [countryDialogOpen, setCountryDialogOpen] = useState(false);
  const [changeStep, setChangeStep] = useState<"select" | "phone" | "otp">("select");
  // ISO-2 code of the country selected in the change-country dialog
  const [newPhoneIso, setNewPhoneIso] = useState<PhoneIso | null>(null);
  const [newPhone, setNewPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);

  // ── Phone-change state (email OTP flow) ────────────────────────────────────
  const [phoneEditOpen, setPhoneEditOpen]       = useState(false);
  const [phoneStep, setPhoneStep]               = useState<"input" | "otp">("input");
  const [newPhoneInput, setNewPhoneInput]        = useState("");
  const [phoneOtp, setPhoneOtp]                 = useState("");
  const [phoneSending, setPhoneSending]          = useState(false);
  const [phoneConfirming, setPhoneConfirming]    = useState(false);
  const [maskedEmail, setMaskedEmail]            = useState("");
  const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
  const authHeader = token ? `Bearer ${token}` : "";

  const handlePhoneRequestCode = async () => {
    if (!newPhoneInput.trim() || newPhoneInput.trim().length < 6) {
      toast({ title: "Ekri yon nimewo telefòn valid", variant: "destructive" }); return;
    }
    setPhoneSending(true);
    try {
      const r = await fetch(`${BASE}/api/users/me/phone-change-request`, {
        method: "POST",
        headers: { Authorization: authHeader, "Content-Type": "application/json" },
        body: JSON.stringify({ phone: newPhoneInput.trim() }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Erè");
      setMaskedEmail(d.maskedEmail ?? "");
      setPhoneStep("otp");
      toast({ title: "✅ Kòd voye pa email!" });
    } catch (e: any) {
      toast({ title: e?.message ?? "Erè", variant: "destructive" });
    } finally {
      setPhoneSending(false);
    }
  };

  const handlePhoneConfirm = async () => {
    if (!phoneOtp.trim()) {
      toast({ title: "Ekri kòd ou te resevwa a", variant: "destructive" }); return;
    }
    setPhoneConfirming(true);
    try {
      const r = await fetch(`${BASE}/api/users/me/phone-change-confirm`, {
        method: "POST",
        headers: { Authorization: authHeader, "Content-Type": "application/json" },
        body: JSON.stringify({ code: phoneOtp.trim() }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Erè");
      toast({ title: "✅ Nimewo telefòn aktualize!" });
      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      setPhoneEditOpen(false);
      setPhoneStep("input");
      setNewPhoneInput(""); setPhoneOtp(""); setMaskedEmail("");
    } catch (e: any) {
      toast({ title: e?.message ?? "Erè", variant: "destructive" });
    } finally {
      setPhoneConfirming(false);
    }
  };

  useEffect(() => { if (!user) setLocation("/auth/login"); }, [user]);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: user?.name ?? "",
      location: user?.location ?? "",
      bio: user?.bio ?? "",
      avatar: user?.avatar ?? "",
      dateOfBirth: (user as any)?.dateOfBirth ?? "",
      gender: (user as any)?.gender ?? "",
    },
  });

  const persistSave = useCallback((values: FormValues) => {
    if (!user) return;
    _triggerAutoSaveStatus?.("saving");
    updateUser.mutate(
      { id: user.id, data: values },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
          _triggerAutoSaveStatus?.("saved");
          if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
          savedTimerRef.current = setTimeout(() => _triggerAutoSaveStatus?.("idle"), 3000);
        },
        onError: () => {
          _triggerAutoSaveStatus?.("idle");
          toast({ title: t("editProfile.couldntSave"), description: t("editProfile.checkConnection"), variant: "destructive" });
        },
      }
    );
  }, [user, updateUser, queryClient, toast]);

  const persistSaveRef = useRef(persistSave);
  useEffect(() => { persistSaveRef.current = persistSave; });

  useEffect(() => {
    const { unsubscribe } = form.watch(() => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        const values = form.getValues();
        const result = schema.safeParse(values);
        if (result.success) persistSaveRef.current(result.data);
      }, 1200);
    });
    return () => {
      unsubscribe();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [form]);

  const handleAvatarFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast({ title: "Not an image 😅", description: "Pick a photo file.", variant: "destructive" });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "Too large", description: "Keep it under 10 MB please.", variant: "destructive" });
      return;
    }
    setAvatarUploading(true);
    try {
      const result = await uploadFile(file);
      if (!result) throw new Error("Upload failed");
      const url = getStorageUrl(result.objectPath);
      form.setValue("avatar", url, { shouldDirty: true });
      persistSave({ ...form.getValues(), avatar: url });
    } catch {
      toast({ title: "Upload failed", description: "Couldn't upload the photo. Try again?", variant: "destructive" });
    } finally {
      setAvatarUploading(false);
    }
  };

  const selectedCountryInfo = newPhoneIso ? getPhoneCountry(newPhoneIso) : null;
  // Map ISO → canonical country name expected by the backend
  const newCountryName = newPhoneIso ? (ISO_TO_COUNTRY[newPhoneIso] ?? selectedCountryInfo?.name ?? "") : "";

  const handleSendOtp = () => {
    if (!newPhoneIso || !newPhone.trim()) return;
    sendOtp.mutate(
      { data: { phone: newPhone.trim(), country: newCountryName } },
      {
        onSuccess: (res: any) => {
          setDevCode(res.devCode ?? null);
          toast({ title: "Code sent! 📱" });
          setChangeStep("otp");
        },
        onError: (e: any) =>
          toast({ title: "That number doesn't look right", description: e?.data?.error ?? "Check it and try again", variant: "destructive" }),
      }
    );
  };

  const handleVerifyAndChange = () => {
    if (!newPhoneIso || !newPhone || !otp) return;
    verifyOtp.mutate(
      { data: { phone: newPhone.trim(), country: newCountryName, code: otp.trim() } },
      {
        onSuccess: (res: any) => {
          changeCountry.mutate(
            { data: { phoneToken: res.phoneToken } },
            {
              onSuccess: () => {
                toast({ title: t("editProfile.countryUpdated") ?? `Country updated! 🎉`, description: `${newCountryName}` });
                queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
                setCountryDialogOpen(false);
                setChangeStep("select");
                setNewPhone(""); setOtp(""); setDevCode(null); setNewPhoneIso(null);
              },
              onError: (e: any) =>
                toast({ title: "Couldn't update", description: e?.data?.error ?? "Please try again", variant: "destructive" }),
            }
          );
        },
        onError: (e: any) =>
          toast({ title: "Wrong code", description: e?.data?.error ?? "Double-check and try again", variant: "destructive" }),
      }
    );
  };

  const avatar = form.watch("avatar");
  const name = form.watch("name") ?? "";
  const location = form.watch("location") ?? "";
  const bio = form.watch("bio") ?? "";

  // Find the flag for the user's current country
  const currentCountryInfo = user?.country
    ? PHONE_COUNTRIES.find((c) => ISO_TO_COUNTRY[c.iso] === user.country) ?? null
    : null;
  const currentCountryFlag = currentCountryInfo?.flag ?? null;

  const countryDaysRemaining = (() => {
    const changedAt = (user as any)?.countryChangedAt;
    const isAdmin = (user as any)?.isAdmin || (user as any)?.isSuperAdmin;
    if (!changedAt || isAdmin) return 0;
    const days = (Date.now() - new Date(changedAt).getTime()) / (1000 * 60 * 60 * 24);
    return days < 30 ? Math.ceil(30 - days) : 0;
  })();
  const countryLocked = countryDaysRemaining > 0;

  const { level, score, total } = calcStrength(name, avatar ?? "", location, bio, !!user?.isPhoneVerified, user?.country ?? "");

  const strengthMeta = {
    incomplete: { label: t("editProfile.incomplete"), colorClass: "text-orange-500", barClass: "bg-orange-400", bgClass: "bg-orange-100 dark:bg-orange-900/30", Icon: Sparkles },
    good: { label: t("editProfile.good"), colorClass: "text-blue-500", barClass: "bg-blue-500", bgClass: "bg-blue-100 dark:bg-blue-900/30", Icon: Star },
    verified: { label: t("editProfile.trustedMember"), colorClass: "text-green-400", barClass: "bg-green-500", bgClass: "bg-green-900/30", Icon: CheckCircle },
  };
  const meta = strengthMeta[level];

  const closeCountryDialog = (open: boolean) => {
    setCountryDialogOpen(open);
    if (!open) { setChangeStep("select"); setNewPhone(""); setOtp(""); setDevCode(null); setNewPhoneIso(null); }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-6 pb-16">
      <AutoSaveIndicator />
      {user && (
        <button
          onClick={() => setLocation(`/profile/${user.id}`)}
          className="text-sm text-muted-foreground hover:text-primary mb-5 flex items-center gap-1 transition-colors"
        >
          {t("editProfile.backToProfile")}
        </button>
      )}

      {/* ── Hero: Avatar ── */}
      <div className="flex flex-col items-center mb-8">
        <div className="relative mb-3">
          <Avatar className="h-32 w-32 ring-4 ring-background shadow-xl">
            <AvatarImage src={avatar || undefined} className="object-cover" />
            <AvatarFallback className="text-5xl font-black bg-primary text-primary-foreground">
              {name?.[0]?.toUpperCase() ?? "?"}
            </AvatarFallback>
          </Avatar>
          <button
            type="button"
            onClick={() => avatarInputRef.current?.click()}
            disabled={avatarUploading}
            className="absolute bottom-1 right-1 h-9 w-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg hover:bg-primary/90 active:scale-95 transition-all"
            aria-label="Change profile photo"
          >
            {avatarUploading
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Camera className="h-4 w-4" />}
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          {avatarUploading ? t("editProfile.uploadingPhoto") : t("editProfile.tapToChange")}
        </p>
        <input
          ref={avatarInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleAvatarFile(f); e.target.value = ""; }}
        />
        <input type="hidden" {...form.register("avatar")} data-testid="input-avatar" />
      </div>

      {/* ── Profile Strength ── */}
      <div className="bg-card border border-border rounded-2xl p-5 mb-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1">{t("editProfile.profileStrength")}</p>
            <p className={`text-sm font-bold ${meta.colorClass}`}>{meta.label}</p>
          </div>
          <div className={`h-11 w-11 rounded-full flex items-center justify-center ${meta.bgClass}`}>
            <meta.Icon className={`h-5 w-5 ${meta.colorClass}`} />
          </div>
        </div>
        <div className="h-2.5 rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ease-out ${meta.barClass}`}
            style={{ width: `${(score / total) * 100}%` }}
          />
        </div>
        <div className="flex justify-between mt-2">
          <p className="text-xs text-muted-foreground">{t("editProfile.fieldsFilled", { score, total })}</p>
          <p className="text-xs text-muted-foreground">{Math.round((score / total) * 100)}%</p>
        </div>
      </div>

      {/* ── About You card ── */}
      <div className="bg-card border border-border rounded-2xl p-5 mb-4 shadow-sm space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-foreground text-base">{t("editProfile.aboutYou")}</h2>
        </div>

        {/* Name */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <label className="text-sm font-semibold text-foreground" htmlFor="name">{t("editProfile.yourName")}</label>
            <span className="text-xs bg-primary/10 text-primary font-bold px-1.5 py-0.5 rounded-md">{t("editProfile.required")}</span>
          </div>
          <p className="text-xs text-muted-foreground mb-2">{t("editProfile.nameHint")}</p>
          <Input
            id="name"
            {...form.register("name")}
            placeholder="e.g. Alex Johnson"
            data-testid="input-name"
            className="rounded-xl"
          />
          {form.formState.errors.name && (
            <p className="text-xs text-destructive mt-1">{form.formState.errors.name.message}</p>
          )}
        </div>

        {/* Location */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <label className="text-sm font-semibold text-foreground" htmlFor="location">{t("editProfile.whereAreYou")}</label>
            <span className="text-xs text-muted-foreground font-medium px-1.5 py-0.5 rounded-md border border-border">{t("editProfile.optional")}</span>
          </div>
          <p className="text-xs text-muted-foreground mb-2">{t("editProfile.locationHint")}</p>
          <Input
            id="location"
            {...form.register("location")}
            placeholder="Miami, New York, Los Angeles…"
            data-testid="input-location"
            className="rounded-xl"
          />
        </div>

        {/* Bio */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <label className="text-sm font-semibold text-foreground" htmlFor="bio">{t("editProfile.yourVibe")}</label>
            <span className="text-xs text-muted-foreground font-medium px-1.5 py-0.5 rounded-md border border-border">{t("editProfile.optional")}</span>
          </div>
          <p className="text-xs text-muted-foreground mb-2">{t("editProfile.bioHint")}</p>
          <Textarea
            id="bio"
            {...form.register("bio")}
            placeholder="Trusted seller — fast shipping, honest descriptions 🤝"
            rows={3}
            data-testid="input-bio"
            className="rounded-xl resize-none"
          />
          <p className="text-xs text-muted-foreground mt-1.5 text-right">{bio.length}/200</p>
        </div>

        {/* Date of Birth */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <label className="text-sm font-semibold text-foreground" htmlFor="dateOfBirth">Dat nesans</label>
            <span className="text-xs text-muted-foreground font-medium px-1.5 py-0.5 rounded-md border border-border">{t("editProfile.optional")}</span>
          </div>
          <p className="text-xs text-muted-foreground mb-2">Itilize pou piblisite kap montre tèt yo yon fason ki kòrèk pou ou. Pa janm pataje ak moun.</p>
          <Input
            id="dateOfBirth"
            type="date"
            {...form.register("dateOfBirth")}
            data-testid="input-dob"
            className="rounded-xl"
            max={new Date().toISOString().slice(0, 10)}
          />
          {form.formState.errors.dateOfBirth && (
            <p className="text-xs text-destructive mt-1">{form.formState.errors.dateOfBirth.message}</p>
          )}
        </div>

        {/* Gender */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <label className="text-sm font-semibold text-foreground" htmlFor="gender">Sèks</label>
            <span className="text-xs text-muted-foreground font-medium px-1.5 py-0.5 rounded-md border border-border">{t("editProfile.optional")}</span>
          </div>
          <p className="text-xs text-muted-foreground mb-2">Pou piblisite pèsonalize sèlman. Pa janm pataje.</p>
          <select
            id="gender"
            {...form.register("gender")}
            data-testid="input-gender"
            className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          >
            <option value="">— Chwazi —</option>
            {GENDER_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Country & Phone card ── */}
      <div className={`bg-card border rounded-2xl p-5 mb-4 shadow-sm ${countryLocked ? "border-orange-300 dark:border-orange-700" : "border-border"}`}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <h2 className="font-bold text-foreground text-base">{t("editProfile.yourCountry")}</h2>
              <Globe className="h-4 w-4 text-muted-foreground" />
            </div>
            {user?.country ? (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-2xl">{currentCountryFlag}</span>
                <div>
                  <p className="text-sm font-semibold text-foreground">{user.country}</p>
                  {user.phone && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Phone className="h-3 w-3" /> {user.phone}
                      {user.isPhoneVerified && (
                        <span className="ml-1 flex items-center gap-0.5 text-green-400 font-medium">
                          <CheckCircle className="h-3 w-3" /> {t("editProfile.countryVerified")}
                        </span>
                      )}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">{t("editProfile.noCountrySet")}</p>
            )}
            {countryLocked && (
              <div className="flex items-center gap-1.5 mt-2 text-xs text-orange-700 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 rounded-lg px-2.5 py-1.5">
                <Lock className="h-3 w-3 flex-shrink-0" />
                <span>{t("editProfile.countryLocked", { days: countryDaysRemaining })}</span>
              </div>
            )}
          </div>
          <Button
            variant={countryLocked ? "ghost" : "outline"}
            size="sm"
            onClick={() => { if (!countryLocked) { setCountryDialogOpen(true); setChangeStep("select"); } }}
            disabled={countryLocked}
            data-testid="button-change-country"
            className={`rounded-xl shrink-0 ${countryLocked ? "opacity-50 cursor-not-allowed" : ""}`}
            title={countryLocked ? t("editProfile.countryLocked", { days: countryDaysRemaining }) : t("editProfile.changeCountryTitle")}
          >
            {countryLocked ? <Lock className="h-3.5 w-3.5 mr-1.5" /> : <Shield className="h-3.5 w-3.5 mr-1.5" />}
            {countryLocked ? t("editProfile.lockedBtn") : t("editProfile.changeBtn")}
          </Button>
        </div>
      </div>

      {/* ── Phone Number card ── */}
      <div className="bg-card border border-border rounded-2xl p-5 mb-4 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <h2 className="font-bold text-foreground text-base">📱 Nimewo Telefòn</h2>
            </div>
            {user?.phone ? (
              <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5 shrink-0" />
                {user.phone}
                {user.isPhoneVerified && (
                  <span className="ml-1 flex items-center gap-0.5 text-green-500 text-xs font-medium">
                    <CheckCircle className="h-3 w-3" /> Verifye
                  </span>
                )}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">Pa gen nimewo. Ajoute yon nimewo pou resevwa notifikasyon SMS.</p>
            )}
          </div>
          {!phoneEditOpen && (
            <Button variant="outline" size="sm" onClick={() => setPhoneEditOpen(true)} className="rounded-xl shrink-0">
              <Phone className="h-3.5 w-3.5 mr-1.5" />
              {user?.phone ? "Chanje" : "Ajoute"}
            </Button>
          )}
        </div>

        {phoneEditOpen && (
          <div className="mt-4 space-y-3 border-t border-border pt-4">
            {phoneStep === "input" ? (
              <>
                <p className="text-xs text-muted-foreground">
                  Ekri nimewo ou a. Yon kòd 6 chif ap voye nan <strong>email</strong> ou pou konfirme.
                </p>
                <div className="flex gap-2">
                  <Input
                    value={newPhoneInput}
                    onChange={e => setNewPhoneInput(e.target.value)}
                    placeholder="+50912345678"
                    type="tel"
                    className="h-9 rounded-xl"
                  />
                  <Button
                    size="sm" className="h-9 shrink-0 rounded-xl"
                    onClick={handlePhoneRequestCode}
                    disabled={phoneSending || !newPhoneInput.trim()}
                  >
                    {phoneSending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Voye kòd"}
                  </Button>
                </div>
                <button onClick={() => setPhoneEditOpen(false)} className="text-xs text-muted-foreground hover:underline">Anile</button>
              </>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">
                  Kòd 6 chif voye nan <strong>{maskedEmail}</strong>. Antre li anba pou konfime.
                </p>
                <div className="flex gap-2">
                  <Input
                    value={phoneOtp}
                    onChange={e => setPhoneOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="123456"
                    maxLength={6}
                    inputMode="numeric"
                    className="h-9 rounded-xl font-mono tracking-widest text-center"
                  />
                  <Button
                    size="sm" className="h-9 shrink-0 rounded-xl"
                    onClick={handlePhoneConfirm}
                    disabled={phoneConfirming || phoneOtp.length < 6}
                  >
                    {phoneConfirming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  </Button>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => { setPhoneStep("input"); setPhoneOtp(""); }}
                    className="text-xs text-muted-foreground hover:underline"
                  >← Tounen</button>
                  <button
                    onClick={handlePhoneRequestCode}
                    disabled={phoneSending}
                    className="text-xs text-primary hover:underline disabled:opacity-50"
                  >Voye kòd ankò</button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Change password card ── */}
      <ChangePasswordCard />

      {/* ── Language card ── */}
      <div className="bg-card border border-border rounded-2xl p-5 shadow-sm mb-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-bold text-foreground text-base">{t("settings.language")}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{t("editProfile.preferredLanguage")}</p>
          </div>
          <LanguageSwitcher />
        </div>
      </div>

      {/* ── Pickup Hours card ── */}
      <PickupHoursCard initialSchedule={(user as any)?.pickupSchedule ?? null} />

      {/* ── Store Manager card ── */}
      <StoreManagerCard />

      {/* ── Change Country Dialog ── */}
      <Dialog open={countryDialogOpen} onOpenChange={closeCountryDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("editProfile.changeCountryTitle")}</DialogTitle>
          </DialogHeader>

          {changeStep === "select" && (
            <div>
              <p className="text-sm text-muted-foreground mb-4">
                {t("editProfile.pickCountry")}
              </p>
              <div className="space-y-2">
                {PHONE_COUNTRIES.map((c) => (
                  <button
                    key={c.iso}
                    onClick={() => { setNewPhoneIso(c.iso); setChangeStep("phone"); }}
                    className="w-full flex items-center gap-3 p-2.5 rounded-xl border border-border hover:border-primary hover:bg-accent transition-all text-left"
                    data-testid={`change-country-${c.iso.toLowerCase()}`}
                  >
                    <span className="text-xl">{c.flag}</span>
                    <div>
                      <p className="font-semibold text-sm text-foreground">{c.name}</p>
                      <p className="text-xs text-muted-foreground">{c.dialCode}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {changeStep === "phone" && selectedCountryInfo && (
            <div>
              <button onClick={() => setChangeStep("select")} className="text-xs text-muted-foreground hover:text-primary mb-3 transition-colors">
                {t("editProfile.back")}
              </button>
              <p className="text-sm text-muted-foreground mb-4">
                {t("editProfile.enterPhoneFor", { country: selectedCountryInfo.name })}
              </p>
              <div className="flex gap-2 mb-4">
                <div className="flex items-center gap-1.5 bg-muted px-3 rounded-xl border border-border text-sm font-mono shrink-0">
                  <span>{selectedCountryInfo.flag}</span>
                  <span className="text-muted-foreground">{selectedCountryInfo.dialCode}</span>
                </div>
                <Input
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder={selectedCountryInfo.example}
                  className="flex-1 font-mono rounded-xl"
                  data-testid="input-new-phone"
                />
              </div>
              <Button className="w-full rounded-xl" onClick={handleSendOtp} disabled={sendOtp.isPending || !newPhone.trim()}>
                {sendOtp.isPending ? t("editProfile.sending") : t("editProfile.sendCode")}
              </Button>
            </div>
          )}

          {changeStep === "otp" && (
            <div>
              <p className="text-sm text-muted-foreground mb-4">
                {t("editProfile.enterCode", { phone: `${selectedCountryInfo?.dialCode} ${newPhone}` })}
              </p>
              {devCode && (
                <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl p-3 mb-4">
                  <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">
                    Demo code: <span className="font-mono font-black tracking-widest">{devCode}</span>
                  </p>
                </div>
              )}
              <Input
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                className="text-center text-2xl font-mono tracking-[0.5em] mb-4 rounded-xl"
                maxLength={6}
                data-testid="input-change-otp"
              />
              <Button
                className="w-full rounded-xl"
                onClick={handleVerifyAndChange}
                disabled={verifyOtp.isPending || changeCountry.isPending || otp.length !== 6}
              >
                {verifyOtp.isPending || changeCountry.isPending ? t("editProfile.verifying") : t("editProfile.confirmChange")}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
