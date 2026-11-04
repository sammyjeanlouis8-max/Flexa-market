import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useSendOtp, useVerifyOtp, useLoginPhone } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/auth";
import { useToast } from "@/hooks/use-toast";
import { Phone, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { PHONE_COUNTRIES, getPhoneCountry, ISO_TO_COUNTRY } from "@/lib/phoneCountries";
import { appPath, spaNavigate } from "@/lib/spaNavigate";
import AuthShell, { AuthPrimaryButton } from "@/components/auth/AuthShell";

export default function LoginPhone() {
  const { t } = useTranslation();
  const { setToken } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const sendOtp = useSendOtp();
  const verifyOtp = useVerifyOtp();
  const loginPhone = useLoginPhone();

  const [step, setStep] = useState(1);
  const [phoneIso, setPhoneIso] = useState("HT");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [eulaAccepted, setEulaAccepted] = useState(false);
  const countryDef = getPhoneCountry(phoneIso)!;
  const countryName = ISO_TO_COUNTRY[phoneIso] ?? countryDef.name;

  const steps = [
    { label: t("auth.phone"), icon: Phone },
    { label: t("auth.verify", "Verify"), icon: ShieldCheck },
  ];

  const handleSendOtp = () => {
    if (!phone.trim()) return;
    sendOtp.mutate(
      { data: { phone: phone.trim(), country: countryName } },
      {
        onSuccess: (res: any) => {
          setDevCode(res?.devCode ?? null);
          toast({
            title: t("auth.codeSent", "Code sent"),
            description: t("auth.checkPhone", "Check your phone for the code."),
          });
          setStep(2);
        },
        onError: (e: any) =>
          toast({
            title: t("auth.couldNotSend", "Could not send code"),
            description: e?.data?.error ?? t("auth.connectionError"),
            variant: "destructive",
          }),
      },
    );
  };

  const handleVerifyAndLogin = () => {
    if (otp.length < 4) return;
    verifyOtp.mutate(
      { data: { phone: phone.trim(), country: countryName, code: otp } },
      {
        onSuccess: (vRes: any) => {
          loginPhone.mutate(
            { data: { phoneToken: vRes.phoneToken, eulaAccepted } },
            {
              onSuccess: (lRes: any) => {
                setToken(lRes.token, lRes.user);
                toast({ title: t("auth.welcomeBack", "Welcome back!") });
                const params = new URLSearchParams(window.location.search);
                const next = params.get("next");
                if (next && next.startsWith("/") && !next.startsWith("//")) {
                  spaNavigate(next, { replace: true });
                } else {
                  setLocation("/");
                }
              },
              onError: (e: any) => {
                const status: number = e?.status ?? 0;
                const rawMsg: string = e?.data?.error ?? "";
                if (status >= 500 || status === 0) {
                  toast({
                    title: t("auth.loginFailed"),
                    description: t("auth.networkError"),
                    variant: "destructive",
                  });
                  return;
                }
                if (status === 403 || rawMsg.toLowerCase().includes("suspend")) {
                  spaNavigate(appPath("/auth/suspended"), { replace: true });
                  return;
                }
                const msg =
                  rawMsg ||
                  t("auth.noPhoneAccount", "No account found for this phone. Please sign up.");
                toast({ title: t("auth.loginFailed"), description: msg, variant: "destructive" });
              },
            },
          );
        },
        onError: (e: any) =>
          toast({
            title: t("auth.invalidCode", "Invalid code"),
            description: e?.data?.error ?? t("auth.connectionError"),
            variant: "destructive",
          }),
      },
    );
  };

  const isPending = verifyOtp.isPending || loginPhone.isPending;

  return (
    <AuthShell
      title={t("auth.signIn")}
      subtitle={t("auth.signInWithPhoneSubtitle", "Sign in with your phone number — no password needed.")}
      compact
      footer={
        <>
          <p>
            <Link
              href="/auth/login"
              className="font-semibold text-[var(--auth-accent)] hover:underline"
              data-testid="link-password-login"
            >
              {t("auth.useEmailPassword", "Sign in with email & password")}
            </Link>
          </p>
          <p>
            {t("auth.noAccount", "Don't have an account?")}{" "}
            <Link
              href="/auth/register"
              className="font-semibold text-[var(--auth-accent)] hover:underline"
              data-testid="link-register"
            >
              {t("auth.signUp", "Sign up")}
            </Link>
          </p>
        </>
      }
    >
      <div className="mb-6 flex items-center justify-center gap-0">
        {steps.map((s, i) => {
          const n = i + 1;
          const active = step === n;
          const done = step > n;
          const Icon = s.icon;
          return (
            <div key={n} className="flex items-center">
              <div
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-full transition-all",
                  done
                    ? "bg-[var(--auth-accent)] text-white"
                    : active
                      ? "bg-orange-100 text-[var(--auth-accent)] ring-2 ring-[var(--auth-accent)]"
                      : "bg-[var(--auth-border)] text-[var(--auth-muted)]",
                )}
                aria-current={active ? "step" : undefined}
              >
                <Icon className="h-4 w-4" />
              </div>
              {i < steps.length - 1 && (
                <div
                  className={cn(
                    "mx-1.5 h-0.5 w-12 transition-colors",
                    step > n ? "bg-[var(--auth-accent)]" : "bg-[var(--auth-border)]",
                  )}
                />
              )}
            </div>
          );
        })}
      </div>

      {step === 1 && (
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-bold text-[var(--auth-fg)]">{t("auth.phone")}</h3>
            <p className="mt-1 text-sm text-[var(--auth-muted)]">
              {t("auth.weWillSendCode", "We'll send you a code via SMS.")}
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-[13px] font-semibold text-[var(--auth-fg)]">
              {t("auth.country", "Country")}
            </label>
            <select
              value={phoneIso}
              onChange={(e) => {
                setPhoneIso(e.target.value);
                setPhone("");
              }}
              className="h-12 w-full rounded-xl border border-[var(--auth-border)] bg-white px-3 text-base shadow-sm focus:outline-none focus:ring-2 focus:ring-[rgba(249,115,22,0.25)]"
              data-testid="select-country"
            >
              {PHONE_COUNTRIES.map((c) => (
                <option key={c.iso} value={c.iso}>
                  {c.flag} {c.name} ({c.dialCode})
                </option>
              ))}
            </select>
          </div>

          <div className="flex min-w-0 gap-2">
            <div className="flex h-12 shrink-0 items-center gap-2 rounded-xl border border-[var(--auth-border)] bg-white px-3 font-mono text-sm">
              <span>{countryDef.flag}</span>
              <span>{countryDef.dialCode}</span>
            </div>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder={countryDef.example}
              className="h-12 min-w-0 flex-1 font-mono"
              inputMode="tel"
              data-testid="input-phone"
              onKeyDown={(e) => e.key === "Enter" && handleSendOtp()}
            />
          </div>

          <AuthPrimaryButton
            type="button"
            onClick={handleSendOtp}
            disabled={sendOtp.isPending || !phone.trim()}
            data-testid="button-send-otp"
          >
            {sendOtp.isPending ? t("auth.sendingCode", "Sending…") : t("auth.sendOtp", "Send code")}
          </AuthPrimaryButton>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => {
              setStep(1);
              setOtp("");
              setDevCode(null);
            }}
            className="text-xs font-semibold text-[var(--auth-muted)] hover:text-[var(--auth-accent)]"
          >
            ← {t("auth.back", "Back")}
          </button>

          <div>
            <h3 className="text-lg font-bold text-[var(--auth-fg)]">
              {t("auth.enterOtp", "Enter the code")}
            </h3>
            <p className="mt-1 text-sm text-[var(--auth-muted)]">
              {t("auth.otpSentTo", "Code sent to")}{" "}
              <strong className="text-[var(--auth-fg)]">
                {countryDef.dialCode} {phone}
              </strong>
            </p>
          </div>

          {devCode && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs font-medium text-amber-800">
                Demo mode — your code is:{" "}
                <span
                  className="font-mono text-base font-black tracking-widest"
                  data-testid="text-dev-code"
                >
                  {devCode}
                </span>
              </p>
            </div>
          )}

          <Input
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="000000"
            className="h-14 text-center font-mono text-2xl tracking-[0.45em]"
            maxLength={6}
            inputMode="numeric"
            autoComplete="one-time-code"
            data-testid="input-otp"
            onKeyDown={(e) => e.key === "Enter" && otp.length === 6 && handleVerifyAndLogin()}
          />

          <label className="flex items-start gap-3 rounded-xl border border-[var(--auth-border)] bg-white/70 p-3.5 text-sm leading-snug">
            <Checkbox
              checked={eulaAccepted}
              onCheckedChange={(v) => setEulaAccepted(v === true)}
              className="mt-0.5"
            />
            <span>
              {t("auth.eulaAgreePrefix")}{" "}
              <Link href="/eula" className="font-semibold text-[var(--auth-accent)] underline">
                {t("auth.eula")}
              </Link>{" "}
              {t("auth.eulaAnd")}{" "}
              <Link href="/terms" className="font-semibold text-[var(--auth-accent)] underline">
                {t("auth.termsOfService")}
              </Link>
              .
            </span>
          </label>

          <AuthPrimaryButton
            type="button"
            onClick={handleVerifyAndLogin}
            disabled={isPending || otp.length !== 6 || !eulaAccepted}
            data-testid="button-verify-and-login"
          >
            {isPending ? t("auth.signingIn", "Signing in…") : t("auth.signIn", "Sign in")}
          </AuthPrimaryButton>

          <button
            type="button"
            onClick={() => {
              setStep(1);
              setOtp("");
              setDevCode(null);
            }}
            className="w-full text-xs font-medium text-[var(--auth-muted)] hover:text-[var(--auth-accent)]"
          >
            {t("auth.resend", "Didn't get it? Resend")}
          </button>
        </div>
      )}
    </AuthShell>
  );
}
