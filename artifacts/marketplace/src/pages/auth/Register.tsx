import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, useLocation } from "wouter";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Button } from "@/components/ui/button";
import { useRegister } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/auth";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { useState, useMemo, useEffect } from "react";
import { SUPPORTED_COUNTRIES, COUNTRY_FLAGS } from "@/lib/countries";
import { PHONE_COUNTRIES, getPhoneCountry, ISO_TO_COUNTRY, COUNTRY_TO_ISO } from "@/lib/phoneCountries";
import { Gift } from "lucide-react";
import i18n from "@/i18n";

function buildSchema(t: (key: string) => string) {
  return z.object({
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
      .refine(
        (v) => !v || /^[0-9]{6,15}$/.test(v),
        t("auth.phoneDigitsOnly")
      ),
    country: z.string().min(1, t("auth.countryRequired")),
    location: z.string().optional(),
  }).refine(
    (data) => data.password.trim() === data.confirmPassword.trim(),
    { message: t("auth.passwordMismatch"), path: ["confirmPassword"] }
  );
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

  // Force English on signup page — user can change language after login
  useEffect(() => {
    const prev = i18n.language;
    if (prev !== "en") i18n.changeLanguage("en");
    return () => {
      if (prev !== "en") i18n.changeLanguage(prev);
    };
  }, []);

  const [phoneIso, setPhoneIso] = useState("US");
  const [promoCode, setPromoCode] = useState("");

  const schema = useMemo(() => buildSchema(t), [t]);
  type FormValues = z.infer<typeof schema>;

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", email: "", password: "", confirmPassword: "", phoneNumber: "", country: "", location: "" },
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
        } as any,
      },
      {
        onSuccess: (res: any) => {
          if (!res.token) {
            toast({ title: t("auth.registrationFailed"), description: "Login initialization failed", variant: "destructive" });
            return;
          }
          setToken(res.token);
          toast({
            title: t("auth.welcomeToFlexa"),
            description: promoCode.trim()
              ? t("auth.referralBonus")
              : t("auth.accountReady"),
          });
          setLocation("/");
        },
        onError: (e: any) => {
          const data = e?.data ?? {};
          const msg: string = data.error ?? t("auth.couldNotCreate");
          const field: string | undefined = data.field;
          if (field && field in form.getValues()) {
            form.setError(field as any, { message: msg });
            setTimeout(() => {
              const el = document.querySelector(
                `[data-testid="input-${field}"], [data-testid="select-${field}"], [data-testid="select-calling-code"]`
              );
              el?.scrollIntoView({ behavior: "smooth", block: "center" });
            }, 50);
          } else {
            toast({ title: t("auth.registrationFailed"), description: msg, variant: "destructive" });
          }
        },
      }
    );
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-8 relative">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img src="/logo.png" alt="FLEXA MARKET" className="h-72 w-auto mx-auto mb-2" />
          <h1 className="text-3xl font-extrabold text-foreground mt-4">{t("auth.createAccount")}</h1>
          <p className="text-muted-foreground mt-1">{t("auth.joinSubtitle")}</p>
        </div>

        <div className="bg-card border border-border rounded-2xl p-8 shadow-lg">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">

              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("auth.name")}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t("auth.namePlaceholder")}
                      autoComplete="name"
                      {...field}
                      data-testid="input-name"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="email" render={({ field }) => (
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
                      {...field}
                      data-testid="input-email"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="password" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("auth.password")}</FormLabel>
                  <FormControl>
                    <PasswordInput
                      placeholder="••••••••"
                      autoComplete="new-password"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      {...field}
                      data-testid="input-password"
                    />
                  </FormControl>
                  {!form.formState.errors.password && (
                    <p className="text-xs text-muted-foreground">{t("auth.passwordMin")}</p>
                  )}
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="confirmPassword" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("auth.confirmPassword")}</FormLabel>
                  <FormControl>
                    <PasswordInput
                      placeholder="••••••••"
                      autoComplete="new-password"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      {...field}
                      data-testid="input-confirm-password"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              {/* Phone number with country calling code */}
              <FormField control={form.control} name="phoneNumber" render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {t("auth.phone")}
                    <span className="text-xs font-normal text-muted-foreground ml-1">
                      (Optional)
                    </span>
                  </FormLabel>
                  <div className="flex gap-2">
                    <select
                      value={phoneIso}
                      onChange={(e) => {
                        const iso = e.target.value;
                        setPhoneIso(iso);
                        const mapped = ISO_TO_COUNTRY[iso];
                        if (mapped) form.setValue("country", mapped, { shouldValidate: true });
                      }}
                      className="w-[160px] shrink-0 h-9 rounded-md border border-input bg-background px-2 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      style={{ fontSize: "16px" }}
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
                        className="flex-1"
                      />
                    </FormControl>
                  </div>
                  <FormMessage />
                </FormItem>
              )} />

              {/* Country */}
              <FormField control={form.control} name="country" render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {t("auth.yourCountry")}
                    <span className="text-xs font-normal text-muted-foreground ml-1">
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
                      className="h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      style={{ fontSize: "16px" }}
                      data-testid="select-country"
                    >
                      <option value="" disabled>{t("auth.selectCountry")}</option>
                      {SUPPORTED_COUNTRIES.map((c) => (
                        <option key={c} value={c}>
                          {COUNTRY_FLAGS[c]} {c}
                        </option>
                      ))}
                    </select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              {/* Optional promo code */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium flex items-center gap-1.5">
                  <Gift className="h-3.5 w-3.5 text-primary" />
                  {t("auth.promoCode")} <span className="text-xs font-normal text-muted-foreground">{t("auth.promoCodeOptional")}</span>
                </label>
                <Input
                  placeholder={t("auth.promoCodePlaceholder")}
                  value={promoCode}
                  onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                  maxLength={8}
                  autoComplete="off"
                  className="font-mono tracking-widest"
                  data-testid="input-promo-code"
                />
                <p className="text-xs text-muted-foreground">
                  {t("auth.promoCodeDesc")}
                </p>
              </div>

              <Button
                type="submit"
                className="w-full font-bold bg-[#F97316] hover:bg-[#ea6c10] text-white border-0"
                disabled={register.isPending}
                data-testid="button-register"
              >
                {register.isPending ? t("auth.creatingAccount") : t("auth.createAccount")}
              </Button>
            </form>
          </Form>

          <p className="text-center text-sm text-muted-foreground mt-6">
            {t("auth.alreadyAccount")}{" "}
            <Link href="/auth/login" className="text-primary font-semibold hover:underline" data-testid="link-login">
              {t("auth.signIn")}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
