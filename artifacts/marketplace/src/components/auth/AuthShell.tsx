import { type ButtonHTMLAttributes, type ReactNode } from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { PUBLIC_LANGUAGES } from "@/i18n";
import { cn } from "@/lib/utils";
import AuthGlobe from "@/components/auth/AuthGlobe";

interface AuthShellProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  showLanguage?: boolean;
  className?: string;
  compact?: boolean;
}

/**
 * Auth shell matching the Flexa Market reference mock:
 * dark navy header (logo wordmark + worldwide headline + globe) over white form.
 * Mobile-first stacked; split brand/form from lg when space allows.
 */
export default function AuthShell({
  title,
  subtitle,
  children,
  footer,
  showLanguage = true,
  className,
  compact = false,
}: AuthShellProps) {
  const { t } = useTranslation();
  return (
    <div
      className={cn(
        "auth-shell min-h-screen min-h-[100dvh] w-full overflow-x-hidden",
        "bg-white text-[var(--auth-fg)]",
        className,
      )}
    >
      <div className="mx-auto grid min-h-[100dvh] w-full max-w-[1600px] lg:grid-cols-2">
        {/* ── Brand header ── */}
        <aside
          className={cn(
            "auth-brand-panel relative overflow-hidden",
            "px-5 pt-[calc(0.85rem+max(env(safe-area-inset-top,0px),0px))] pb-7",
            "sm:px-8 sm:pt-7 sm:pb-9",
            "lg:flex lg:min-h-[100dvh] lg:flex-col lg:justify-center lg:px-12 lg:py-14 xl:px-16",
          )}
          aria-label="Flexa Market"
        >
          <div className="auth-brand-atmosphere" aria-hidden />

          {/* Top row: logo wordmark + language */}
          <div className="relative z-10 flex items-center justify-between gap-3">
            <Link
              href="/"
              className="inline-flex min-w-0 items-center gap-2.5 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
            >
              <img
                src="/flexa-logo-v2.png"
                alt=""
                className="h-9 w-9 shrink-0 rounded-[10px] object-contain sm:h-10 sm:w-10 lg:h-11 lg:w-11"
              />
              <span className="auth-wordmark truncate text-[13px] font-bold uppercase tracking-[0.14em] text-white sm:text-sm">
                Flexa Market
              </span>
            </Link>
            {showLanguage && (
              <div className="shrink-0 rounded-full bg-white/10 p-0.5 backdrop-blur-md ring-1 ring-white/15 lg:hidden">
                <LanguageSwitcher languages={PUBLIC_LANGUAGES} align="end" />
              </div>
            )}
          </div>

          {/* Headline + globe */}
          <div className="relative z-10 mt-7 flex items-end gap-3 sm:mt-9 sm:gap-5 lg:mt-14 lg:items-center">
            <div className="min-w-0 flex-1 pb-1 lg:pb-0">
              <h1 className="auth-brand-title text-[1.65rem] font-bold leading-[1.15] tracking-tight text-white sm:text-[2.1rem] lg:text-[2.65rem] xl:text-[3rem]">
                {t("auth.brandTitle")}
              </h1>
              <p className="mt-2.5 max-w-[22rem] text-[13px] leading-relaxed text-white/75 sm:mt-3 sm:max-w-md sm:text-[15px]">
                {t("auth.brandSubtitle")}
              </p>
            </div>
            <div className="auth-globe-wrap relative shrink-0 self-center">
              <AuthGlobe className="h-[8rem] w-[8rem] sm:h-40 sm:w-40 lg:h-52 lg:w-52 xl:h-60 xl:w-60" />
            </div>
          </div>
        </aside>

        {/* ── Form column ── */}
        <main
          className={cn(
            "relative flex w-full flex-col bg-white",
            "px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] pt-6",
            "sm:px-8 sm:pb-10 sm:pt-8",
            "lg:justify-center lg:px-10 lg:py-12 xl:px-16",
          )}
        >
          {showLanguage && (
            <div className="absolute right-5 top-4 z-20 hidden lg:block sm:right-8 lg:right-10 xl:right-16">
              <LanguageSwitcher languages={PUBLIC_LANGUAGES} align="end" />
            </div>
          )}

          <div
            className={cn(
              "mx-auto w-full min-w-0",
              compact ? "max-w-[400px]" : "max-w-[440px]",
            )}
          >
            <header className="mb-5 sm:mb-6">
              <h2 className="auth-form-title text-[1.7rem] font-bold tracking-tight text-[#0f1b33] sm:text-[1.9rem]">
                {title}
              </h2>
              {subtitle && (
                <p className="mt-1.5 text-sm leading-relaxed text-[#6b7280] sm:text-[0.95rem]">
                  {subtitle}
                </p>
              )}
            </header>

            <div className="auth-form-surface w-full min-w-0">{children}</div>

            {footer && (
              <div className="mt-5 space-y-2.5 text-center text-sm text-[#6b7280] sm:mt-6">
                {footer}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

export function AuthPrimaryButton({
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        "auth-cta inline-flex h-[52px] w-full items-center justify-center rounded-full px-4",
        "text-[15px] font-bold tracking-wide text-white",
        "bg-[var(--auth-accent)] hover:bg-[var(--auth-accent-hover)]",
        "shadow-[0_12px_28px_-10px_rgba(249,115,22,0.7)]",
        "transition-[transform,background-color,box-shadow] duration-200",
        "active:scale-[0.985] disabled:pointer-events-none disabled:opacity-60",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--auth-accent)] focus-visible:ring-offset-2",
        className,
      )}
      {...props}
    />
  );
}
