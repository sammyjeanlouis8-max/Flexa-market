import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, ArrowLeft, Mail, ShieldQuestion, RefreshCw, Lock, ShieldOff, KeyRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { PUBLIC_LANGUAGES } from "@/i18n";
import { useAuth } from "@/contexts/auth";

type Step = "identify" | "otp" | "questions" | "reset" | "done";

interface SecurityQuestion {
  key: string;
  text: string;
}

export default function ForgotPassword() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { t } = useTranslation();
  const { setToken } = useAuth();

  const [step, setStep] = useState<Step>("identify");
  const [identifier, setIdentifier] = useState("");
  const [sessionToken, setSessionToken] = useState("");
  const [sentVia, setSentVia] = useState<"email">("email");
  const [maskedDest, setMaskedDest] = useState("");
  const [otp, setOtp] = useState("");
  const [otpRemaining, setOtpRemaining] = useState(3);
  const [securityQuestions, setSecurityQuestions] = useState<SecurityQuestion[]>([]);
  const [sqAnswers, setSqAnswers] = useState<string[]>(["", ""]);
  const [sqRemaining, setSqRemaining] = useState(3);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [showAlternate, setShowAlternate] = useState(false);
  const [suspendedMsg, setSuspendedMsg] = useState<string | null>(null);

  // Temp-password (admin-reset) login state
  const [showTempLogin, setShowTempLogin] = useState(false);
  const [tempPassword, setTempPassword] = useState("");
  const [tempLogging, setTempLogging] = useState(false);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setTimeout(() => setResendCooldown(c => c - 1), 1000);
    return () => clearTimeout(id);
  }, [resendCooldown]);

  const handleStart = async () => {
    if (!identifier.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/recovery/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: identifier.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 403 && (data.suspended || data.error?.toLowerCase().includes("sispann") || data.error?.toLowerCase().includes("suspend"))) {
          const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
          window.location.replace(`${base}/auth/suspended`);
          return;
        } else {
          toast({ title: data.error ?? t("errors.somethingWrong"), variant: "destructive" });
        }
        return;
      }
      setSuspendedMsg(null);
      setSessionToken(data.sessionToken ?? "");
      setSentVia(data.sentVia ?? "email");
      setMaskedDest(data.maskedDestination ?? "");
      setResendCooldown(60);
      setStep("otp");
    } catch {
      toast({ title: t("errors.somethingWrong"), description: t("auth.networkError"), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otp.trim() || otp.length !== 6) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/recovery/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionToken, code: otp.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.useSecurityQuestions) {
          setShowAlternate(true);
          toast({ title: t("recovery.otpMaxAttempts"), description: t("recovery.trySecurityQuestions"), variant: "destructive" });
        } else {
          if (typeof data.remaining === "number") setOtpRemaining(data.remaining);
          toast({ title: data.error ?? t("errors.somethingWrong"), variant: "destructive" });
        }
        return;
      }
      setStep("reset");
    } catch {
      toast({ title: t("errors.somethingWrong"), description: t("auth.networkError"), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/recovery/resend-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionToken }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: data.error ?? t("errors.somethingWrong"), variant: "destructive" });
        return;
      }
      setOtp("");
      setOtpRemaining(3);
      setShowAlternate(false);
      setResendCooldown(60);
      toast({ title: t("recovery.otpResent"), description: `${t("recovery.codeSentTo")} ${data.maskedDestination}` });
    } catch {
      toast({ title: t("errors.somethingWrong"), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleLoadQuestions = async () => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/recovery/get-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionToken }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.noQuestions) {
          toast({ title: t("recovery.noSecurityQuestions"), description: t("recovery.contactSupport"), variant: "destructive" });
        } else {
          toast({ title: data.error ?? t("errors.somethingWrong"), variant: "destructive" });
        }
        return;
      }
      setSecurityQuestions(data.questions ?? []);
      setSqAnswers(new Array(data.questions?.length ?? 2).fill(""));
      setStep("questions");
    } catch {
      toast({ title: t("errors.somethingWrong"), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifySecurity = async () => {
    if (sqAnswers.some(a => !a.trim())) return;
    setSubmitting(true);
    try {
      const answers = securityQuestions.map((q, i) => ({ key: q.key, answer: sqAnswers[i] }));
      const res = await fetch("/api/recovery/verify-security", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionToken, answers }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (typeof data.remaining === "number") setSqRemaining(data.remaining);
        if (data.locked) {
          toast({ title: t("recovery.tooManyAttempts"), description: t("recovery.accountLockedHour"), variant: "destructive" });
        } else {
          toast({ title: data.error ?? t("errors.somethingWrong"), variant: "destructive" });
        }
        return;
      }
      setStep("reset");
    } catch {
      toast({ title: t("errors.somethingWrong"), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleTempLogin = async () => {
    if (!identifier.trim() || !tempPassword.trim()) return;
    setTempLogging(true);
    try {
      const res = await fetch("/api/auth/login-temp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: identifier.trim(), password: tempPassword.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 403 && data.suspended) {
          const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
          window.location.replace(`${base}/auth/suspended`);
          return;
        }
        toast({ title: data.error ?? t("errors.somethingWrong"), variant: "destructive" });
        return;
      }
      setToken(data.token);
      toast({ title: t("recovery.tempLoginSuccess"), variant: "default" });
      setLocation("/auth/set-new-password");
    } catch {
      toast({ title: t("errors.somethingWrong"), description: t("auth.networkError"), variant: "destructive" });
    } finally {
      setTempLogging(false);
    }
  };

  const handleReset = async () => {
    if (!password.trim()) return;
    if (password !== confirmPassword) {
      toast({ title: t("settings.passwordMismatch"), variant: "destructive" });
      return;
    }
    if (password.length < 6) {
      toast({ title: t("settings.passwordTooShort"), variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/recovery/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionToken, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: data.error ?? t("errors.somethingWrong"), variant: "destructive" });
        return;
      }
      setStep("done");
      setTimeout(() => setLocation("/auth/login"), 3000);
    } catch {
      toast({ title: t("errors.somethingWrong"), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const stepIndex = { identify: 0, otp: 1, questions: 1, reset: 2, done: 3 }[step];

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-8 relative">
      {/* EN/FR language switcher — top-right corner */}
      <div className="absolute top-3 right-3">
        <LanguageSwitcher languages={PUBLIC_LANGUAGES} align="end" />
      </div>
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <img src="/logo.png" alt="FLEXA MARKET" className="h-56 w-auto mx-auto mb-2" />
          <h1 className="text-2xl font-extrabold text-foreground mt-4">
            {step === "done" ? t("auth.passwordUpdated") : t("auth.resetPassword")}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {step === "identify" && t("recovery.identifySubtitle")}
            {step === "otp" && t("recovery.otpSubtitle")}
            {step === "questions" && t("recovery.questionsSubtitle")}
            {step === "reset" && t("recovery.resetSubtitle")}
          </p>
        </div>

        {/* Suspended account banner */}
        {suspendedMsg && (
          <div className="mb-5 rounded-xl border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30 px-4 py-3">
            <div className="flex items-start gap-3">
              <ShieldOff className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
              <div className="text-sm">
                <p className="font-semibold text-red-700 dark:text-red-300">{t("auth.accountSuspended", "Kont ou sispann")}</p>
                <p className="mt-0.5 text-red-600 dark:text-red-400">{suspendedMsg}</p>
              </div>
            </div>
            <Link href="/contact">
              <button className="mt-3 w-full rounded-lg bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600 text-white font-semibold text-sm py-2 px-4 transition-colors flex items-center justify-center gap-2">
                <ShieldOff className="h-4 w-4" />
                {t("footer.contactSupport", "Kontakte Sipò")}
              </button>
            </Link>
          </div>
        )}

        {step !== "done" && (
          <div className="flex items-center gap-1.5 mb-5 px-1">
            {[0, 1, 2].map(i => (
              <div
                key={i}
                className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${i < stepIndex ? "bg-primary" : i === stepIndex ? "bg-primary/50" : "bg-muted"}`}
              />
            ))}
          </div>
        )}

        <div className="bg-card border border-border rounded-2xl p-6 shadow-lg space-y-4">

          {step === "done" && (
            <div className="flex flex-col items-center gap-3 py-4">
              <CheckCircle className="h-14 w-14 text-green-500" />
              <p className="font-bold text-lg text-center">{t("recovery.passwordResetSuccess")}</p>
              <p className="text-sm text-muted-foreground text-center">{t("recovery.redirectingToLogin")}</p>
              <Button asChild className="w-full mt-2">
                <Link href="/auth/login">{t("auth.signIn")}</Link>
              </Button>
            </div>
          )}

          {step === "identify" && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium block mb-1">{t("recovery.emailOrPhone")}</label>
                <Input
                  type="text"
                  inputMode="text"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder={t("recovery.emailOrPhonePlaceholder")}
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") showTempLogin ? handleTempLogin() : handleStart();
                  }}
                  data-testid="input-identifier"
                />
                <p className="text-xs text-muted-foreground mt-1">{t("recovery.identifyHint")}</p>
              </div>

              {/* Temp-password panel (admin-reset flow) */}
              {showTempLogin && (
                <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/20 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <KeyRound className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                    <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                      {t("recovery.tempPasswordLabel")}
                    </p>
                  </div>
                  <PasswordInput
                    placeholder={t("recovery.tempPasswordPlaceholder")}
                    value={tempPassword}
                    onChange={(e) => setTempPassword(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleTempLogin()}
                    data-testid="input-temp-password"
                  />
                  <Button
                    className="w-full font-bold bg-amber-500 hover:bg-amber-600 text-white border-0"
                    onClick={handleTempLogin}
                    disabled={tempLogging || !identifier.trim() || !tempPassword.trim()}
                    data-testid="button-temp-login"
                  >
                    {tempLogging ? t("recovery.loggingIn") : t("recovery.loginWithTemp")}
                  </Button>
                </div>
              )}

              {!showTempLogin && (
                <Button
                  className="w-full font-bold bg-[#F97316] hover:bg-[#ea6c10] text-white border-0"
                  onClick={handleStart}
                  disabled={submitting || !identifier.trim()}
                  data-testid="button-send-otp"
                >
                  {submitting ? t("recovery.sending") : t("recovery.sendVerificationCode")}
                </Button>
              )}

              {/* Toggle between OTP flow and temp-password flow */}
              <div className="relative flex items-center gap-3 py-1">
                <div className="flex-1 h-px bg-border" />
                <button
                  type="button"
                  onClick={() => { setShowTempLogin(v => !v); setTempPassword(""); }}
                  className="text-xs text-muted-foreground hover:text-primary transition-colors shrink-0 flex items-center gap-1"
                  data-testid="toggle-temp-login"
                >
                  <KeyRound className="h-3 w-3" />
                  {showTempLogin ? t("recovery.sendVerificationCode") : t("recovery.haveAdminTempPassword")}
                </button>
                <div className="flex-1 h-px bg-border" />
              </div>
            </div>
          )}

          {step === "otp" && (
            <div className="space-y-4">
              <div className="bg-muted/50 rounded-lg p-3 flex items-start gap-3">
                <Mail className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                <p className="text-sm text-muted-foreground">
                  {t("recovery.otpSentVia")}{" "}
                  <strong>{t("recovery.email")}</strong>{" "}
                  {t("recovery.to")}{" "}
                  <strong>{maskedDest}</strong>
                </p>
              </div>

              <div>
                <label className="text-sm font-medium block mb-1">{t("recovery.enterCode")}</label>
                <Input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="000000"
                  className="font-mono tracking-[0.5em] text-center text-xl"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  onKeyDown={(e) => e.key === "Enter" && handleVerifyOtp()}
                  data-testid="input-otp"
                />
                {otpRemaining < 3 && (
                  <p className="text-xs text-amber-600 mt-1">
                    {t("recovery.attemptsLeft", { count: otpRemaining })}
                  </p>
                )}
              </div>

              <Button
                className="w-full font-bold bg-[#F97316] hover:bg-[#ea6c10] text-white border-0"
                onClick={handleVerifyOtp}
                disabled={submitting || otp.length !== 6}
                data-testid="button-verify-otp"
              >
                {submitting ? t("recovery.verifying") : t("recovery.verifyCode")}
              </Button>

              <div className="flex flex-col gap-2 pt-1 border-t border-border">
                <button
                  onClick={handleResend}
                  disabled={resendCooldown > 0 || submitting}
                  className="flex items-center justify-center gap-1.5 text-sm text-primary hover:underline disabled:opacity-40 disabled:no-underline"
                  data-testid="button-resend-otp"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  {resendCooldown > 0
                    ? t("recovery.resendIn", { secs: resendCooldown })
                    : t("recovery.resendCode")}
                </button>

                <button
                  onClick={handleLoadQuestions}
                  disabled={submitting}
                  className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
                  data-testid="button-try-another-way"
                >
                  <ShieldQuestion className="h-3.5 w-3.5" />
                  {t("recovery.tryAnotherWay")}
                </button>
              </div>
            </div>
          )}

          {step === "questions" && (
            <div className="space-y-4">
              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3 flex items-start gap-2">
                <ShieldQuestion className="h-4 w-4 mt-0.5 text-amber-600 shrink-0" />
                <p className="text-sm text-amber-700 dark:text-amber-400">{t("recovery.answersHint")}</p>
              </div>

              {securityQuestions.map((q, i) => (
                <div key={q.key}>
                  <label className="text-sm font-medium block mb-1">
                    {t("recovery.question")} {i + 1}
                    <span className="font-normal text-muted-foreground ml-1">{q.text.split(" / ")[0]}</span>
                  </label>
                  <Input
                    placeholder={t("recovery.yourAnswer")}
                    value={sqAnswers[i] ?? ""}
                    onChange={(e) => {
                      const next = [...sqAnswers];
                      next[i] = e.target.value;
                      setSqAnswers(next);
                    }}
                    data-testid={`input-sq-${i}`}
                  />
                </div>
              ))}

              {sqRemaining < 3 && (
                <p className="text-xs text-amber-600">{t("recovery.attemptsLeft", { count: sqRemaining })}</p>
              )}

              <Button
                className="w-full font-bold bg-[#F97316] hover:bg-[#ea6c10] text-white border-0"
                onClick={handleVerifySecurity}
                disabled={submitting || sqAnswers.some(a => !a.trim())}
                data-testid="button-verify-security"
              >
                {submitting ? t("recovery.verifying") : t("recovery.verifyAnswers")}
              </Button>

              <button
                onClick={() => setStep("otp")}
                className="flex items-center justify-center gap-1 text-sm text-muted-foreground hover:text-foreground w-full"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                {t("recovery.backToOtp")}
              </button>
            </div>
          )}

          {step === "reset" && (
            <div className="space-y-4">
              <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg p-3 flex items-center gap-2">
                <Lock className="h-4 w-4 text-green-600 shrink-0" />
                <p className="text-sm text-green-700 dark:text-green-400">{t("recovery.identityVerified")}</p>
              </div>

              <div>
                <label className="text-sm font-medium block mb-1">{t("auth.newPassword")}</label>
                <PasswordInput
                  placeholder="••••••••"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  data-testid="input-password"
                />
                <p className="text-xs text-muted-foreground mt-1">{t("auth.passwordMinLength")}</p>
              </div>

              <div>
                <label className="text-sm font-medium block mb-1">{t("auth.confirmNewPassword")}</label>
                <PasswordInput
                  placeholder="••••••••"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleReset()}
                  data-testid="input-confirm-password"
                />
              </div>

              <Button
                className="w-full font-bold bg-[#F97316] hover:bg-[#ea6c10] text-white border-0"
                onClick={handleReset}
                disabled={submitting || !password.trim() || !confirmPassword.trim()}
                data-testid="button-set-password"
              >
                {submitting ? t("auth.saving") : t("auth.setNewPassword")}
              </Button>
            </div>
          )}

          {step !== "done" && (
            <p className="text-center text-sm text-muted-foreground pt-1">
              {t("auth.rememberPassword")}{" "}
              <Link href="/auth/login" className="text-primary font-semibold hover:underline">
                {t("auth.signIn")}
              </Link>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
