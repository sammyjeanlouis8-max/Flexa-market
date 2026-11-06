import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, useLocation } from "wouter";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Checkbox } from "@/components/ui/checkbox";
import { useRegister } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/auth";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { useState, useMemo } from "react";
import { SUPPORTED_COUNTRIES, COUNTRY_FLAGS } from "@/lib/countries";
import { PHONE_COUNTRIES, getPhoneCountry, ISO_TO_COUNTRY, COUNTRY_TO_ISO } from "@/lib/phoneCountries";
import { Gift } from "lucide-react";
import AuthShell, { AuthPrimaryButton } from "@/components/auth/AuthShell";
import { spaNavigate } from "@/lib/spaNavigate";

function buildSchema(t: (key: string) => string) {
  return z
    .object({
      name: z.string().min(2, t("auth.nameMin")),
      email: z
        .string()
        .transform((s) => s.trim().toLowerCase())
        .pipe(z.string().email(t("auth.emailInvalid"))),
      password: z
        .string()
        .transform((s) => s.trim())
        .pipe(z.string().min(6, t("auth.passwordMin"))),
      confirmPassword: z.string().min(1, t("auth.confirmPasswordRequired")),
      phoneNumber: z
        .string()
        .optional()
        .refine((v) => !v || /^[0-9]{6,15}$/.test(v), t("auth.phoneDigitsOnly")),
      country: z.string().min(1, t("auth.countryRequired")),
      location: z.string().optional(),
      eulaAccepted: z.boolean().refine((v) => v === true, t("auth.eulaRequired")),
    })
    .refine((data) => data.password.trim() === data.confirmPassword.trim(), {
      message: t("auth.passwordMismatch"),
      path: ["confirmPassword"],
    });
}

const getDeviceId = (): string => {
  const stored = localStorage.getItem("bh_device_id");
  if (stored) return stored;
  const fp = [
    navigator.userAgent,
    navigator.language,
    screen.width + "x" + screen.height,
    new Date().getTimezoneOffset(),
    navigator.hardwareConcurrency ?? 0,
  ].join("|");
  let hash = 0;
  for (let i = 0; i < fp.length; i++) {
    const char = fp.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  const id = Math.abs(hash).toString(36) + Date.now().toString(36);
  localStorage.setItem("bh_device_id", id);
  return id;
};

export default function Register() {
  const { t } = useTranslation();
  const { setToken } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const register = useRegister();

  const [phoneIso, setPhoneIso] = useState("US");
  const [promoCode, setPromoCode] = useState(() => {
    const referralFromLink = new URLSearchParams(window.location.search).get("ref");
    return referralFromLink?.trim().toUpperCase() ?? "";
  });

  const schema = useMemo(() => buildSchema(t), [t]);
  type FormValues = z.infer<typeof schema>;

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      confirmPassword: "",
      phoneNumber: "",
      country: "",
      location: "",
      eulaAccepted: false,
    },
  });

  const selectedPhone = getPhoneCountry(phoneIso)!;

  const onSubmit = (values: FormValues) => {
    const deviceId = getDeviceId();
    const phone = values.phoneNumber?.trim()
      ? `${selectedPhone.dialCode}${values.phoneNumber.trim()}`
      : undefined;
    register.mutate(
      {
        data: {
          name: values.name,
          email: values.email,
          password: values.password,
          ...(phone ? { phone } : {}),
          country: values.country,
          location: values.location || undefined,
          deviceId,
          ...(promoCode.trim() ? { promoCode: promoCode.trim().toUpperCase() } : {}),
          eulaAccepted: values.eulaAccepted,
        } as any,
      },
      {
        onSuccess: (res: any) => {
          if (!res.token) {
            toast({
              title: t("auth.registrationFailed"),
              description: "Login initialization failed",
              variant: "destructive",
            });
            return;
          }
          setToken(res.token, res.user);
          toast({
            title: t("auth.welcomeToFlexa"),
            description: promoCode.trim() ? t("auth.referralBonus") : t("auth.accountReady"),
          });
          const params = new URLSearchParams(window.location.search);
          const next = params.get("next");
          if (next && next.startsWith("/") && !next.startsWith("//")) {
            spaNavigate(next, { replace: true });
          } else {
            setLocation("/");
          }
        },
        onError: (e: any) => {
          const data = e?.data ?? {};
          const msg: string = data.error ?? t("auth.couldNotCreate");
          const field: string | undefined = data.field;
          if (field && field in form.getValues()) {
            form.setError(field as any, { message: msg });
            setTimeout(() => {
              const el = document.querySelector(
                `[data-testid="input-${field}"], [data-testid="select-${field}"], [data-testid="select-calling-code"]`,
              );
              el?.scrollIntoView({ behavior: "smooth", block: "center" });
            }, 50);
          } else {
            toast({ title: t("auth.registrationFailed"), description: msg, variant: "destructive" });
          }
        },
      },
    );
  };

  return (
    <AuthShell
      title={t("auth.createAccount")}
      subtitle={t("auth.joinSubtitle")}
      footer={
        <p>
          {t("auth.alreadyAccount")}{" "}
          <Link
            href="/auth/login"
            className="font-semibold text-[var(--auth-accent)] hover:underline"
            data-testid="link-login"
          >
            {t("auth.signIn")}
          </Link>
        </p>
      }
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
          <section className="space-y-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--auth-muted)]">
              {t("auth.sectionAccount", "Your account")}
            </p>

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("auth.name")}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t("auth.namePlaceholder")}
                      autoComplete="name"
                      className="h-12"
                      {...field}
                      data-testid="input-name"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("auth.email")}</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      placeholder={t("auth.emailPlaceholder")}
                      className="h-12"
                      {...field}
                      data-testid="input-email"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem className="min-w-0">
                    <FormLabel>{t("auth.password")}</FormLabel>
                    <FormControl>
                      <PasswordInput
                        placeholder="••••••••"
                        autoComplete="new-password"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        className="h-12"
                        {...field}
                        data-testid="input-password"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem className="min-w-0">
                    <FormLabel>{t("auth.confirmPassword")}</FormLabel>
                    <FormControl>
                      <PasswordInput
                        placeholder="••••••••"
                        autoComplete="new-password"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        className="h-12"
                        {...field}
                        data-testid="input-confirm-password"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            {!form.formState.errors.password && !form.formState.errors.confirmPassword && (
              <p className="-mt-1 text-xs text-[var(--auth-muted)]">{t("auth.passwordMin")}</p>
            )}
          </section>

          <section className="space-y-4 border-t border-[var(--auth-border)] pt-5">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--auth-muted)]">
              {t("auth.sectionLocation", "Location & contact")}
            </p>

            <FormField
              control={form.control}
              name="country"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {t("auth.yourCountry")}
                    <span className="ml-1 text-xs font-normal text-[var(--auth-muted)]">
                      {t("auth.countryDesc")}
                    </span>
                  </FormLabel>
                  <FormControl>
                    <select
                      value={field.value}
                      onChange={(e) => {
                        const country = e.target.value;
                        field.onChange(country);
                        const iso = COUNTRY_TO_ISO[country];
                        if (iso) setPhoneIso(iso);
                      }}
                      className="h-12 w-full rounded-xl border border-[var(--auth-border)] bg-white px-3 text-base shadow-sm focus:outline-none focus:ring-2 focus:ring-[rgba(249,115,22,0.25)]"
                      data-testid="select-country"
                    >
                      <option value="" disabled>
                        {t("auth.selectCountry")}
                      </option>
                      {SUPPORTED_COUNTRIES.map((c) => (
                        <option key={c} value={c}>
                          {COUNTRY_FLAGS[c]} {c}
                        </option>
                      ))}
                    </select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="phoneNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {t("auth.phone")}
                    <span className="ml-1 text-xs font-normal text-[var(--auth-muted)]">
                      {t("auth.optional", "(Optional)")}
                    </span>
                  </FormLabel>
                  <div className="flex min-w-0 gap-2">
                    <select
                      value={phoneIso}
                      onChange={(e) => {
                        const iso = e.target.value;
                        setPhoneIso(iso);
                        const mapped = ISO_TO_COUNTRY[iso];
                        if (mapped) form.setValue("country", mapped, { shouldValidate: true });
                      }}
                      className="h-12 w-[min(42%,11.5rem)] shrink-0 rounded-xl border border-[var(--auth-border)] bg-white px-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-[rgba(249,115,22,0.25)]"
                      data-testid="select-calling-code"
                    >
                      {PHONE_COUNTRIES.map((c) => (
                        <option key={c.iso} value={c.iso}>
                          {c.flag} {c.name} ({c.dialCode})
                        </option>
                      ))}
                    </select>
                    <FormControl>
                      <Input
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel-national"
                        placeholder={selectedPhone.example}
                        {...field}
                        data-testid="input-phone"
                        className="h-12 min-w-0 flex-1"
                      />
                    </FormControl>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-sm font-semibold text-[var(--auth-fg)]">
                <Gift className="h-3.5 w-3.5 text-[var(--auth-accent)]" />
                {t("auth.promoCode")}{" "}
                <span className="text-xs font-normal text-[var(--auth-muted)]">
                  {t("auth.promoCodeOptional")}
                </span>
              </label>
              <Input
                placeholder={t("auth.promoCodePlaceholder")}
                value={promoCode}
                onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                maxLength={16}
                autoComplete="off"
                className="h-12 font-mono tracking-widest"
                data-testid="input-promo-code"
              />
              <p className="text-xs text-[var(--auth-muted)]">{t("auth.promoCodeDesc")}</p>
            </div>
          </section>

          <FormField
            control={form.control}
            name="eulaAccepted"
            render={({ field }) => (
              <FormItem className="flex items-start gap-3 space-y-0">
                <FormControl>
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    className="mt-0.5 h-5 w-5 rounded-full border-[#d1d5db] shadow-none data-[state=checked]:border-[var(--auth-accent)] data-[state=checked]:bg-[var(--auth-accent)]"
                  />
                </FormControl>
                <div className="min-w-0 space-y-1">
                  <FormLabel className="text-sm font-normal leading-snug text-[var(--auth-fg)]">
                    {t("auth.eulaAgreePrefix")}{" "}
                    <Link href="/eula" className="font-semibold text-[var(--auth-accent)] underline-offset-2 hover:underline">
                      {t("auth.eula")}
                    </Link>{" "}
                    {t("auth.eulaAnd")}{" "}
                    <Link href="/terms" className="font-semibold text-[var(--auth-accent)] underline-offset-2 hover:underline">
                      {t("auth.termsOfService")}
                    </Link>
                    .
                  </FormLabel>
                  <FormMessage />
                </div>
              </FormItem>
            )}
          />

          <AuthPrimaryButton type="submit" disabled={register.isPending} data-testid="button-register">
            {register.isPending ? t("auth.creatingAccount") : t("auth.createAccount")}
          </AuthPrimaryButton>
        </form>
      </Form>
    </AuthShell>
  );
}
