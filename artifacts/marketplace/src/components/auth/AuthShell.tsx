import { type ButtonHTMLAttributes, type ReactNode } from "react";
import { Link } from "wouter";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { PUBLIC_LANGUAGES } from "@/i18n";
import { cn } from "@/lib/utils";

interface AuthShellProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Show language switcher (default true) */
  showLanguage?: boolean;
  className?: string;
  /** Narrower form column for short flows */
  compact?: boolean;
}

/**
 * Shared Login / Signup shell — one auth system, responsive brand-first layout.
 * Desktop: split brand panel + form. Mobile: stacked, safe-area aware.
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
  return (
    <div
      className={cn(
        "auth-shell min-h-screen min-h-[100dvh] w-full overflow-x-hidden",
        "bg-[var(--auth-bg)] text-[var(--auth-fg)]",
        className,
      )}
    >
      <div className="mx-auto grid min-h-[100dvh] w-full max-w-[1600px] lg:grid-cols-2">
        {/* ── Brand panel (desktop) / hero strip (mobile) ── */}
        <aside
          className={cn(
            "relative overflow-hidden",
            "px-5 pt-[calc(1rem+max(env(safe-area-inset-top,0px),0px))] pb-6",
            "sm:px-8 sm:pt-8 sm:pb-8",
            "lg:flex lg:min-h-[100dvh] lg:flex-col lg:justify-between lg:px-12 lg:py-12 xl:px-16",
            "auth-brand-panel",
          )}
          aria-label="Flexa Market"
        >
          <div className="auth-brand-atmosphere" aria-hidden />
          <div className="auth-brand-grid" aria-hidden />

          <div className="relative z-10 flex items-start justify-between gap-3">
            <Link href="/" className="group inline-flex items-center gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60">
              <img
                src="/flexa-logo-v2.png"
                alt="FLEXA MARKET"
                className="h-11 w-auto max-w-[42vw] object-contain drop-shadow-sm sm:h-14 lg:h-16"
              />
            </Link>
            {showLanguage && (
              <div className="lg:hidden shrink-0 rounded-full bg-black/20 p-0.5 backdrop-blur-md">
                <LanguageSwitcher languages={PUBLIC_LANGUAGES} align="end" />
              </div>
            )}
          </div>

          <div className="relative z-10 mt-6 max-w-lg lg:mt-0 lg:mb-auto lg:pt-16">
            <p className="auth-brand-kicker mb-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/70 sm:text-xs">
              Flexa Market
            </p>
            <h1 className="auth-brand-title text-[1.75rem] font-bold leading-[1.12] tracking-tight text-white sm:text-4xl lg:text-[2.75rem] xl:text-5xl">
              Buy &amp; sell with confidence across Haiti and beyond.
            </h1>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-white/75 sm:text-base lg:mt-4">
              One secure account for shoppers, sellers, drivers, and admins.
            </p>
          </div>

          <ul className="relative z-10 mt-6 hidden gap-3 text-sm text-white/80 lg:mt-10 lg:grid lg:grid-cols-1 lg:gap-2.5">
            {[
              "Secure sign-in for every role",
              "Local listings, delivery, and chat",
              "English · Français · Kreyòl",
            ].map((line) => (
              <li key={line} className="flex items-center gap-2.5">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--auth-accent)]" />
                {line}
              </li>
            ))}
          </ul>
        </aside>

        {/* ── Form column ── */}
        <main
          className={cn(
            "relative flex w-full flex-col",
            "px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] pt-2",
            "sm:px-8 sm:pb-10 sm:pt-6",
            "lg:justify-center lg:px-10 lg:py-12 xl:px-16",
            "bg-[var(--auth-panel)]",
          )}
        >
          {showLanguage && (
            <div className="absolute right-4 top-3 z-20 hidden lg:block sm:right-8 lg:right-10 xl:right-16">
              <LanguageSwitcher languages={PUBLIC_LANGUAGES} align="end" />
            </div>
          )}

          <div
            className={cn(
              "mx-auto w-full animate-in fade-in-0 slide-in-from-bottom-2 duration-500",
              compact ? "max-w-[400px]" : "max-w-[440px]",
            )}
          >
            <header className="mb-6 sm:mb-7">
              <h2 className="auth-form-title text-[1.65rem] font-bold tracking-tight text-[var(--auth-fg)] sm:text-3xl">
                {title}
              </h2>
              {subtitle && (
                <p className="mt-1.5 text-sm leading-relaxed text-[var(--auth-muted)] sm:text-[0.95rem]">
                  {subtitle}
                </p>
              )}
            </header>

            <div className="auth-form-surface w-full min-w-0">{children}</div>

            {footer && (
              <div className="mt-6 space-y-3 text-center text-sm text-[var(--auth-muted)]">
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
        "auth-cta inline-flex h-12 w-full items-center justify-center rounded-xl px-4",
        "text-[15px] font-bold tracking-wide text-white",
        "bg-[var(--auth-accent)] hover:bg-[var(--auth-accent-hover)]",
        "shadow-[0_10px_24px_-12px_rgba(249,115,22,0.65)]",
        "transition-[transform,background-color,box-shadow] duration-200",
        "active:scale-[0.985] disabled:pointer-events-none disabled:opacity-60",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--auth-accent)] focus-visible:ring-offset-2",
        className,
      )}
      {...props}
    />
  );
}

export function AuthFieldLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("mb-1.5 block text-[13px] font-semibold text-[var(--auth-fg)]", className)}>
      {children}
    </span>
  );
}
