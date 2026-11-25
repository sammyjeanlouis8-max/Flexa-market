import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ArrowUpRight, Package, Wallet, Warehouse } from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { cn } from "@/lib/utils";

type LaunchPayload = {
  configured: boolean;
  url: string | null;
  label?: string;
};

function clientWholesaleUrl(): string | null {
  const fromEnv = (import.meta.env.VITE_FLEXA_WHOLESALE_URL as string | undefined)?.trim();
  return fromEnv ? fromEnv.replace(/\/$/, "") : null;
}

function openWholesale(url: string) {
  // Same-tab navigation keeps Market → Wholesale feeling like one product.
  window.location.assign(url);
}

export default function FlexaWholesale() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [launch, setLaunch] = useState<LaunchPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const envUrl = clientWholesaleUrl();
    if (envUrl) {
      setLaunch({ configured: true, url: envUrl, label: "Flexa Wholesale" });
      return;
    }

    fetch("/api/wholesale/launch")
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<LaunchPayload>;
      })
      .then((data) => {
        if (!cancelled) setLaunch(data);
      })
      .catch(() => {
        if (!cancelled) {
          setLaunch({ configured: false, url: null });
          setError(t("wholesale.loadError", { defaultValue: "Could not load Wholesale launch info." }));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [t]);

  useEffect(() => {
    if (!launch?.configured || !launch.url) return;
    const timer = window.setTimeout(() => openWholesale(launch.url!), 450);
    return () => window.clearTimeout(timer);
  }, [launch?.configured, launch?.url]);

  const ready = !!launch?.configured && !!launch.url;

  return (
    <div className="relative min-h-[calc(100dvh-4rem)] overflow-hidden bg-[hsl(152,28%,97%)] dark:bg-[hsl(152,18%,8%)]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_hsl(152,55%,36%)_0%,_transparent_55%),linear-gradient(180deg,_hsl(152,45%,18%)_0%,_transparent_42%)] opacity-90 dark:opacity-70"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 top-24 h-56 w-56 rounded-full bg-[hsl(152,60%,42%)]/25 blur-3xl"
      />

      <div className="relative mx-auto flex min-h-[calc(100dvh-4rem)] max-w-lg flex-col px-4 pb-10 pt-4 sm:px-6">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setLocation("/")}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur hover:bg-white/25"
            aria-label={t("common.back", { defaultValue: "Back" })}
            data-testid="wholesale-back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-10 flex flex-1 flex-col justify-center">
          <div className="flex items-center gap-3">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-[hsl(152,65%,22%)] shadow-lg shadow-black/10">
              <Warehouse className="h-7 w-7" strokeWidth={2.25} />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/75">
                Flexa Market
              </p>
              <h1 className="truncate text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
                {t("nav.flexaWholesale", { defaultValue: "Flexa Wholesale" })}
              </h1>
            </div>
          </div>

          <p className="mt-5 max-w-md text-[15px] leading-relaxed text-white/90">
            {t("wholesale.tagline", {
              defaultValue: "Buy in bulk from verified vendors — one Flexa account, one wallet bridge.",
            })}
          </p>

          <div className="mt-8 space-y-3">
            {ready ? (
              <button
                type="button"
                onClick={() => openWholesale(launch!.url!)}
                className={cn(
                  "inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3.5",
                  "text-[15px] font-semibold text-[hsl(152,65%,18%)] shadow-lg shadow-black/15",
                  "active:scale-[0.99] transition-transform",
                )}
                data-testid="wholesale-open"
              >
                {t("wholesale.open", { defaultValue: "Open Flexa Wholesale" })}
                <ArrowUpRight className="h-4 w-4" />
              </button>
            ) : (
              <div
                className="rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-sm text-white/90 backdrop-blur"
                data-testid="wholesale-pending"
              >
                {launch === null
                  ? t("common.loading", { defaultValue: "Loading…" })
                  : t("wholesale.pending", {
                      defaultValue:
                        "Wholesale is linked in Flexa Market. Storefront URL is not configured on this environment yet.",
                    })}
                {error && <p className="mt-2 text-xs text-white/70">{error}</p>}
              </div>
            )}

            {user && (
              <Link
                href="/wallet/transfer"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/25 bg-transparent px-4 py-3 text-[14px] font-medium text-white hover:bg-white/10"
                data-testid="wholesale-wallet-transfer"
              >
                <Wallet className="h-4 w-4" />
                {t("wholesale.walletTransfer", {
                  defaultValue: "Transfer wallet ↔ Wholesale",
                })}
              </Link>
            )}
          </div>

          <ul className="mt-10 space-y-3 text-sm text-white/85">
            <li className="flex items-start gap-2.5">
              <Package className="mt-0.5 h-4 w-4 shrink-0 text-emerald-200" />
              <span>
                {t("wholesale.bulletBulk", {
                  defaultValue: "Wholesale catalog, vendor subscriptions, and bulk pricing.",
                })}
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <Wallet className="mt-0.5 h-4 w-4 shrink-0 text-emerald-200" />
              <span>
                {t("wholesale.bulletWallet", {
                  defaultValue: "Cross-app wallet transfers already connect Market and Wholesale.",
                })}
              </span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
