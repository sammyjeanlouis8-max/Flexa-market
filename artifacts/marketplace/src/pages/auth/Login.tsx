import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, useLocation } from "wouter";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Checkbox } from "@/components/ui/checkbox";
import { useLogin } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/auth";
import { useTranslation } from "react-i18next";
import { useMemo } from "react";
import { appPath, spaNavigate } from "@/lib/spaNavigate";
import AuthShell, { AuthPrimaryButton } from "@/components/auth/AuthShell";

function buildSchema(t: (k: string) => string) {
  return z.object({
    email: z
      .string()
      .transform((s) => s.trim().toLowerCase())
      .pipe(z.string().email(t("auth.emailInvalid"))),
    password: z
      .string()
      .transform((s) => s.trim())
      .pipe(z.string().min(1, t("auth.confirmPasswordRequired"))),
    eulaAccepted: z.boolean().refine((v) => v === true, t("auth.eulaRequired")),
  });
}

export default function Login() {
  const { setToken, setRequiresPasswordUpgrade } = useAuth();
  const [, setLocation] = useLocation();
  const login = useLogin();
  const { t } = useTranslation();

  const schema = useMemo(() => buildSchema(t), [t]);
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "", eulaAccepted: false },
  });

  const onSubmit = (values: z.infer<typeof schema>) => {
    login.mutate(
      { data: values },
      {
        onSuccess: (res: any) => {
          setToken(res.token, res.user);
          setRequiresPasswordUpgrade(!!res.requiresPasswordUpgrade);
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
          const field: string | undefined = data.field;
          const status: number = e?.status ?? 0;

          if (status >= 500 || status === 0) {
            form.setError("root", { message: t("auth.networkError") });
            return;
          }

          if (status === 403 || (data.error ?? "").toLowerCase().includes("suspend")) {
            spaNavigate(appPath("/auth/suspended"), { replace: true });
            return;
          }

          let msg: string;
          if (field === "email") {
            msg = t("auth.accountNotFound");
            form.setError("email", { message: msg });
          } else if (field === "password") {
            msg = t("auth.incorrectPassword");
            form.setError("password", { message: msg });
          } else {
            msg = data.error ?? t("auth.invalidCredentials");
            form.setError("root", { message: msg });
          }
        },
      },
    );
  };

  return (
    <AuthShell
      title={t("auth.welcomeBack")}
      subtitle={t("auth.signInSubtitle")}
      compact
      footer={
        <>
          <p>
            <Link
              href="/auth/login-phone"
              className="font-semibold text-[var(--auth-accent)] hover:underline"
              data-testid="link-phone-login"
            >
              {t("auth.usePhoneInstead", "Sign in with phone number")}
            </Link>
          </p>
          <p>
            {t("auth.noAccount")}{" "}
            <Link
              href="/auth/register"
              className="font-semibold text-[var(--auth-accent)] hover:underline"
              data-testid="link-register"
            >
              {t("auth.signUp")}
            </Link>
          </p>
        </>
      }
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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

          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <FormLabel className="mb-0">{t("auth.password")}</FormLabel>
                  <Link
                    href="/auth/forgot-password"
                    className="text-xs font-semibold text-[var(--auth-accent)] hover:underline"
                    data-testid="link-forgot-password"
                  >
                    {t("auth.forgotPassword", "Forgot password?")}
                  </Link>
                </div>
                <FormControl>
                  <PasswordInput
                    autoComplete="current-password"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder="••••••••"
                    className="h-12"
                    {...field}
                    data-testid="input-password"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {form.formState.errors.root && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
              {form.formState.errors.root.message}
            </p>
          )}

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

          <AuthPrimaryButton type="submit" disabled={login.isPending} data-testid="button-login">
            {login.isPending ? t("auth.signingIn") : t("auth.signIn")}
          </AuthPrimaryButton>
        </form>
      </Form>
    </AuthShell>
  );
}
