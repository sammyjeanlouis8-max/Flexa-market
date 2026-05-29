import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, useLocation } from "wouter";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Button } from "@/components/ui/button";
import { useLogin } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/auth";
import { useTranslation } from "react-i18next";
import { useMemo } from "react";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { PUBLIC_LANGUAGES } from "@/i18n";

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
  });
}

export default function Login() {
  const { setToken, setRequiresPasswordUpgrade } = useAuth();
  const [, setLocation] = useLocation();
  const login = useLogin();
  const { t } = useTranslation();

  const schema = useMemo(() => buildSchema(t), [t]);
  const form = useForm({ resolver: zodResolver(schema), defaultValues: { email: "", password: "" } });

  const onSubmit = (values: z.infer<typeof schema>) => {
    login.mutate({ data: values }, {
      onSuccess: (res: any) => {
        setToken(res.token);
        setRequiresPasswordUpgrade(!!res.requiresPasswordUpgrade);
        setLocation("/");
      },
      onError: (e: any) => {
        const data = e?.data ?? {};
        const field: string | undefined = data.field;
        const status: number = e?.status ?? 0;

        // Server down / gateway error → show connectivity message, not fake "wrong password"
        if (status >= 500 || status === 0) {
          form.setError("root", { message: t("auth.networkError") });
          return;
        }

        if (status === 403 || (data.error ?? "").toLowerCase().includes("suspend")) {
          const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
          window.location.replace(`${base}/auth/suspended`);
          return;
        }

        // Map API error strings → localized i18n keys so Kreyòl/French users
        // never see raw English error messages from the server
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
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 relative">
      <div className="absolute top-3 right-3">
        <LanguageSwitcher languages={PUBLIC_LANGUAGES} align="end" />
      </div>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img src="/logo.png" alt="FLEXA MARKET" className="h-72 w-auto mx-auto mb-2" />
          <h1 className="text-3xl font-extrabold text-foreground mt-4">{t("auth.welcomeBack")}</h1>
          <p className="text-muted-foreground mt-1">{t("auth.signInSubtitle")}</p>
        </div>

        <div className="bg-card border border-card-border rounded-2xl p-8 shadow-lg">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
                      autoComplete="current-password"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      placeholder="••••••••"
                      {...field}
                      data-testid="input-password"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              {form.formState.errors.root && (
                <p className="text-sm text-destructive">{form.formState.errors.root.message}</p>
              )}
              <Button type="submit" className="w-full font-bold bg-[#F97316] hover:bg-[#ea6c10] text-white border-0" disabled={login.isPending} data-testid="button-login">
                {login.isPending ? t("auth.signingIn") : t("auth.signIn")}
              </Button>
            </form>
          </Form>
          <div className="flex items-center justify-end mt-4 text-sm">
            <Link
              href="/auth/forgot-password"
              className="text-primary font-medium hover:underline"
              data-testid="link-forgot-password"
            >
              {t("auth.forgotPassword", "Forgot password?")}
            </Link>
          </div>
          <p className="text-center text-sm text-muted-foreground mt-4">
            <Link href="/auth/login-phone" className="text-primary font-semibold hover:underline" data-testid="link-phone-login">
              {t("auth.usePhoneInstead", "Sign in with phone number")}
            </Link>
          </p>
          <p className="text-center text-sm text-muted-foreground mt-3">
            {t("auth.noAccount")}{" "}
            <Link href="/auth/register" className="text-primary font-semibold hover:underline" data-testid="link-register">
              {t("auth.signUp")}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
