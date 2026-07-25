import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSendOtp, useVerifyOtp, useLoginPhone } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/auth";
import { useToast } from "@/hooks/use-toast";
import { Phone, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { PUBLIC_LANGUAGES } from "@/i18n";
import { PHONE_COUNTRIES, getPhoneCountry, ISO_TO_COUNTRY } from "@/lib/phoneCountries";

const STEPS = [
  { label: "Phone", icon: Phone },
  { label: "Verify", icon: ShieldCheck },
];

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
  const countryDef = getPhoneCountry(phoneIso)!;
  // Map ISO → canonical country name used by the backend
  const countryName = ISO_TO_COUNTRY[phoneIso] ?? countryDef.name;

  const handleSendOtp = () => {
    if (!phone.trim()) return;
    sendOtp.mutate(
      { data: { phone: phone.trim(), country: countryName } },
      {
        onSuccess: (res: any) => {
          setDevCode(res?.devCode ?? null);
          toast({ title: t("auth.codeSent", "Code sent"), description: t("auth.checkPhone", "Check your phone for the code.") });
          setStep(2);
        },
        onError: (e: any) =>
          toast({
            title: t("auth.couldNotSend", "Could not send code"),
            description: e?.data?.error ?? "Please try again",
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
            { data: { phoneToken: vRes.phoneToken } },
            {
              onSuccess: (lRes: any) => {
                setToken(lRes.token);
                toast({ title: t("auth.welcomeBack", "Welcome back!") });
                const params = new URLSearchParams(window.location.search);
                const next = params.get("next");
                if (next && next.startsWith("/") && !next.startsWith("//")) {
                  window.location.href = next;
                } else {
                  setLocation("/");
                }
              },
              onError: (e: any) => {
                const status: number = e?.status ?? 0;
                const rawMsg: string = e?.data?.error ?? "";
                if (status >= 500 || status === 0) {
                  toast({ title: t("auth.loginFailed"), description: t("auth.networkError"), variant: "destructive" });
                  return;
                }
                if (status === 403 || rawMsg.toLowerCase().includes("suspend")) {
                  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
                  window.location.replace(`${base}/auth/suspended`);
                  return;
                }
                const msg = rawMsg || t("auth.noPhoneAccount", "No account found for this phone. Please sign up.");
                toast({ title: t("auth.loginFailed"), description: msg, variant: "destructive" });
              },
            },
          );
        },
        onError: (e: any) =>
          toast({
            title: t("auth.invalidCode", "Invalid code"),
            description: e?.data?.error ?? "Please try again",
            variant: "destructive",
          }),
      },
    );
  };

  const isPending = verifyOtp.isPending || loginPhone.isPending;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-8 relative">
      <div className="absolute top-3 right-3">
        <LanguageSwitcher languages={PUBLIC_LANGUAGES} align="end" />
      </div>
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <img src="/logo.png" alt="FLEXA MARKET" className="h-72 w-auto mx-auto mb-1" />
          <p className="text-muted-foreground text-sm">
            {t("auth.signInWithPhoneSubtitle", "Sign in with your phone number — no password needed.")}
          </p>
        </div>

        {/* Steps indicator */}
        <div className="flex items-center justify-center gap-0 mb-6">
          {STEPS.map((s, i) => {
            const n = i + 1;
            const active = step === n;
            const done = step > n;
            const Icon = s.icon;
            return (
              <div key={n} className="flex items-center">
                <div
                  className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center transition-all",
                    done
                      ? "bg-primary text-primary-foreground"
                      : active
                      ? "bg-primary/20 text-primary ring-2 ring-primary"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                </div>
                {i < STEPS.length - 1 && (
                  <div className={cn("h-0.5 w-10 mx-1 transition-colors", step > n ? "bg-primary" : "bg-muted")} />
                )}
              </div>
            );
          })}
        </div>

        <div className="bg-card border border-border rounded-2xl p-6 shadow-lg">
          {step === 1 && (
            <div>
              <h2 className="text-xl font-extrabold text-foreground mb-1">{t("auth.phone")}</h2>
              <p className="text-sm text-muted-foreground mb-4">
                {t("auth.weWillSendCode", "We'll send you a code via SMS.")}
              </p>

              <label className="text-xs font-semibold text-muted-foreground uppercase">
                {t("auth.country", "Country")}
              </label>
              {/* Native select — no scroll jump, opens OS picker on mobile */}
              <select
                value={phoneIso}
                onChange={(e) => { setPhoneIso(e.target.value); setPhone(""); }}
                className="w-full mt-1 mb-4 h-10 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                style={{ fontSize: "16px" }}
                data-testid="select-country"
              >
                {PHONE_COUNTRIES.map((c) => (
                  <option key={c.iso} value={c.iso}>
                    {c.flag} {c.name} ({c.dialCode})
                  </option>
                ))}
              </select>

              <div className="flex gap-2 mb-3">
                <div className="flex items-center gap-2 bg-muted px-3 rounded-lg border border-border text-sm font-mono shrink-0">
                  <span>{countryDef.flag}</span>
                  <span>{countryDef.dialCode}</span>
                </div>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder={countryDef.example}
                  className="flex-1 font-mono"
                  inputMode="tel"
                  data-testid="input-phone"
                  onKeyDown={(e) => e.key === "Enter" && handleSendOtp()}
                />
              </div>

              <Button
                className="w-full font-bold"
                onClick={handleSendOtp}
                disabled={sendOtp.isPending || !phone.trim()}
                data-testid="button-send-otp"
              >
                {sendOtp.isPending ? t("auth.signingIn", "Sending…") : t("auth.sendOtp", "Send code")}
              </Button>
            </div>
          )}

          {step === 2 && (
            <div>
              <button
                onClick={() => { setStep(1); setOtp(""); setDevCode(null); }}
                className="text-xs text-muted-foreground hover:text-primary mb-4 flex items-center gap-1"
              >
                ← {t("auth.back", "Back")}
              </button>
              <h2 className="text-xl font-extrabold text-foreground mb-1">{t("auth.enterOtp", "Enter the code")}</h2>
              <p className="text-sm text-muted-foreground mb-4">
                {t("auth.otpSentTo", "Code sent to")}{" "}
                <strong className="text-foreground">
                  {countryDef.dialCode} {phone}
                </strong>
              </p>

              {devCode && (
                <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3 mb-4">
                  <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">
                    Demo mode — your code is:{" "}
                    <span className="font-mono font-black text-base tracking-widest" data-testid="text-dev-code">{devCode}</span>
                  </p>
                </div>
              )}

              <Input
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                className="text-center text-2xl font-mono tracking-[0.5em] mb-4"
                maxLength={6}
                inputMode="numeric"
                data-testid="input-otp"
                onKeyDown={(e) => e.key === "Enter" && otp.length === 6 && handleVerifyAndLogin()}
              />

              <Button
                className="w-full font-bold"
                onClick={handleVerifyAndLogin}
                disabled={isPending || otp.length !== 6}
                data-testid="button-verify-and-login"
              >
                {isPending ? t("auth.signingIn", "Signing in…") : t("auth.signIn", "Sign in")}
              </Button>

              <button
                onClick={() => { setStep(1); setOtp(""); setDevCode(null); }}
                className="w-full text-xs text-muted-foreground hover:text-primary mt-3"
              >
                {t("auth.resend", "Didn't get it? Resend")}
              </button>
            </div>
          )}
        </div>

        <p className="text-center text-sm text-muted-foreground mt-5">
          <Link href="/auth/login" className="text-primary font-semibold hover:underline" data-testid="link-password-login">
            {t("auth.useEmailPassword", "Sign in with email & password")}
          </Link>
        </p>
        <p className="text-center text-sm text-muted-foreground mt-2">
          {t("auth.noAccount", "Don't have an account?")}{" "}
          <Link href="/auth/register" className="text-primary font-semibold hover:underline" data-testid="link-register">
            {t("auth.signUp", "Sign up")}
          </Link>
        </p>
      </div>
    </div>
  );
}
