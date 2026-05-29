import { useState } from "react";
import { useLocation } from "wouter";
import { KeyRound, Eye, EyeOff, CheckCircle, Loader2, ShieldCheck } from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTranslation } from "react-i18next";

export default function SetNewPassword() {
  const [, setLocation] = useLocation();
  const { token, setToken } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const strong = newPassword.length >= 8;
  const match = newPassword === confirmPassword && confirmPassword.length > 0;
  const canSubmit = newPassword.length >= 6 && match && !loading;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    if (newPassword !== confirmPassword) {
      toast({ title: t("auth.passwordMismatch"), variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/set-new-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: data.error ?? t("auth.networkError"), variant: "destructive" });
        return;
      }
      if (data.token) setToken(data.token);
      setDone(true);
    } catch {
      toast({ title: t("auth.networkError"), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="w-full max-w-sm flex flex-col items-center gap-6 text-center">
          <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
            <CheckCircle className="h-10 w-10 text-green-500" />
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-black text-foreground">{t("auth.passwordChanged")}</h1>
            <p className="text-sm text-muted-foreground">{t("auth.passwordChangedDesc")}</p>
          </div>
          <Button className="w-full h-12 font-bold text-base" onClick={() => setLocation("/")}>
            {t("auth.goHome")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">

        {/* Header */}
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <KeyRound className="h-8 w-8 text-primary" />
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-black text-foreground">{t("auth.changeYourPassword")}</h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {t("auth.tempPasswordSubtitle")}
            </p>
          </div>
        </div>

        {/* Info banner */}
        <div className="flex items-start gap-3 rounded-2xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/50 px-4 py-3">
          <ShieldCheck className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
            {t("auth.tempPasswordBanner")}
          </p>
        </div>

        {/* New password */}
        <div className="space-y-2">
          <label className="text-sm font-semibold text-foreground">{t("auth.newPassword")}</label>
          <div className="relative">
            <Input
              type={showPw ? "text" : "password"}
              placeholder={t("auth.passwordMinLength")}
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              className="pr-10 h-12"
              style={{ fontSize: 16 }}
              onKeyDown={e => e.key === "Enter" && canSubmit && handleSubmit()}
            />
            <button
              type="button"
              onClick={() => setShowPw(p => !p)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {newPassword.length > 0 && (
            <div className="flex items-center gap-1.5">
              <div className={`h-1.5 flex-1 rounded-full transition-colors ${newPassword.length >= 6 ? "bg-amber-400" : "bg-muted"}`} />
              <div className={`h-1.5 flex-1 rounded-full transition-colors ${strong ? "bg-green-500" : "bg-muted"}`} />
              <div className={`h-1.5 flex-1 rounded-full transition-colors ${newPassword.length >= 12 ? "bg-green-600" : "bg-muted"}`} />
              <span className="text-[11px] text-muted-foreground ml-1">
                {newPassword.length < 6 ? t("auth.passwordTooShort") : strong ? t("auth.passwordGood") : t("auth.passwordWeak")}
              </span>
            </div>
          )}
        </div>

        {/* Confirm password */}
        <div className="space-y-2">
          <label className="text-sm font-semibold text-foreground">{t("auth.confirmPassword")}</label>
          <div className="relative">
            <Input
              type={showConfirm ? "text" : "password"}
              placeholder={t("auth.confirmPasswordPlaceholder")}
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              className={`pr-10 h-12 transition-colors ${confirmPassword.length > 0 ? (match ? "border-green-400 focus-visible:ring-green-300" : "border-red-400 focus-visible:ring-red-300") : ""}`}
              style={{ fontSize: 16 }}
              onKeyDown={e => e.key === "Enter" && canSubmit && handleSubmit()}
            />
            <button
              type="button"
              onClick={() => setShowConfirm(p => !p)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {confirmPassword.length > 0 && !match && (
            <p className="text-xs text-red-500">{t("auth.passwordMismatch")}</p>
          )}
          {match && (
            <p className="text-xs text-green-600 flex items-center gap-1">
              <CheckCircle className="h-3 w-3" /> {t("auth.passwordsMatch")}
            </p>
          )}
        </div>

        {/* Submit */}
        <Button
          className="w-full h-12 font-bold text-base"
          disabled={!canSubmit}
          onClick={handleSubmit}
        >
          {loading
            ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t("auth.saving")}</>
            : <><KeyRound className="h-4 w-4 mr-2" />{t("auth.setPermanentPassword")}</>
          }
        </Button>

        <p className="text-center text-xs text-muted-foreground">
          {t("auth.redirecting")}
        </p>
      </div>
    </div>
  );
}
