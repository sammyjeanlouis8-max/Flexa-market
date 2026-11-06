import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { X, Lock } from "lucide-react";
import { authPathWithNext, saveAuthIntent, type AuthIntent, type AuthIntentAction } from "@/lib/authIntent";

type PromptOptions = {
  action: AuthIntentAction;
  next: string;
  title?: string;
  description?: string;
  listingId?: number;
  sellerId?: number;
  quantity?: number;
  price?: number;
  currency?: string | null;
  image?: string | null;
  country?: string | null;
};

type AuthRequiredContextValue = {
  requireAuth: (opts: PromptOptions) => void;
  close: () => void;
  open: boolean;
};

const AuthRequiredContext = createContext<AuthRequiredContextValue>({
  requireAuth: () => {},
  close: () => {},
  open: false,
});

export function AuthRequiredProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState<PromptOptions | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    setPrompt(null);
  }, []);

  const requireAuth = useCallback((opts: PromptOptions) => {
    const intent: Omit<AuthIntent, "createdAt"> = {
      action: opts.action,
      next: opts.next,
      listingId: opts.listingId,
      sellerId: opts.sellerId,
      quantity: opts.quantity,
      title: opts.title,
      price: opts.price,
      currency: opts.currency,
      image: opts.image,
      country: opts.country,
    };
    saveAuthIntent(intent);
    setPrompt(opts);
    setOpen(true);
  }, []);

  const value = useMemo(() => ({ requireAuth, close, open }), [requireAuth, close, open]);

  const next = prompt?.next ?? "/";
  const heading =
    prompt?.title ??
    (prompt?.action === "contactSeller"
      ? t("authGate.signInToContact", { defaultValue: "Sign in to contact this seller." })
      : t("authGate.signInToContinue", { defaultValue: "Sign in to continue" }));
  const description =
    prompt?.description ??
    t("authGate.signInBody", {
      defaultValue: "Create an account or sign in to continue with this action.",
    });

  return (
    <AuthRequiredContext.Provider value={value}>
      {children}
      {open && (
        <div
          className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-sm px-3 pb-4 sm:pb-0"
          role="dialog"
          aria-modal="true"
          aria-labelledby="auth-required-title"
          data-testid="auth-required-modal"
          onClick={close}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-background border border-border shadow-2xl p-5 space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <Lock className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h2 id="auth-required-title" className="text-base font-bold text-foreground leading-snug">
                    {heading}
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{description}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={close}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted"
                aria-label={t("common.close", { defaultValue: "Close" })}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-2.5">
              <Link
                href={authPathWithNext("/auth/register", next)}
                onClick={close}
                className="flex items-center justify-center w-full min-h-11 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:opacity-95"
                data-testid="auth-required-register"
              >
                {t("authGate.createAccount", { defaultValue: "Create Account" })}
              </Link>
              <Link
                href={authPathWithNext("/auth/login", next)}
                onClick={close}
                className="flex items-center justify-center w-full min-h-11 rounded-xl border border-border bg-card font-bold text-sm text-foreground hover:bg-muted/60"
                data-testid="auth-required-login"
              >
                {t("authGate.logIn", { defaultValue: "Log In" })}
              </Link>
              <button
                type="button"
                onClick={close}
                className="flex items-center justify-center w-full min-h-10 rounded-xl text-sm font-semibold text-muted-foreground hover:text-foreground"
                data-testid="auth-required-continue"
              >
                {t("authGate.continueBrowsing", { defaultValue: "Continue Browsing" })}
              </button>
            </div>
          </div>
        </div>
      )}
    </AuthRequiredContext.Provider>
  );
}

export function useAuthRequired() {
  return useContext(AuthRequiredContext);
}
