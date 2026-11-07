import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/auth";
import { useCart } from "@/contexts/cart";
import { matchesTaggedSession, type SessionTagged } from "@/lib/authSession";
import NotificationsDropdown from "@/components/NotificationsDropdown";
import {
  ArrowLeft, Clock, Calendar, Lock, Loader2, Users, ShoppingBag, ShoppingCart,
  Copy, Share2, Wallet, Link2, MessageCircle, BarChart3, ChevronRight, Megaphone, Coins,
} from "lucide-react";

interface CommissionSummary {
  currentMonth: string;
  pendingAmount: number;
  pendingCount: number;
  availableAmount: number;
  availableCount: number;
  totalReferrals: number;
  buyersWhoSpent: number;
  referralCode: string | null;
  referralLink: string | null;
  history: {
    id: number;
    commissionAmount: number;
    purchaseAmount: number;
    cycleMonth: string;
    status: string;
    isAvailable: boolean;
    createdAt: string;
  }[];
}

/** Returns "1 Jiyè 2026", "1 Septanm 2026", etc. — the 1st of the NEXT month */
function firstOfNextMonth(currentMonth: string): string {
  const [y, m] = currentMonth.split("-").map(Number);
  const next = new Date(y, m, 1); // JS months 0-indexed → m = next month
  return next.toLocaleDateString("fr-HT", { day: "numeric", month: "long", year: "numeric" });
}

export default function CommissionPromo() {
  const { t } = useTranslation();
  const { token, user, isLoading: authLoading } = useAuth();
  const { count: cartCount } = useCart();
  const [, navigate] = useLocation();

  const [data, setData]           = useState<CommissionSummary | null>(null);
  const [loading, setLoading]     = useState(true);
  const [withdrawing, setWithdrawing] = useState(false);
  const [toast, setToast]         = useState<{ msg: string; ok: boolean } | null>(null);
  const [historyOpen, setHistoryOpen] = useState(true);

  const tokenRef = useRef<string | null>(token);
  const sessionGenerationRef = useRef(0);
  const loadIdRef = useRef(0);
  const loadAbortRef = useRef<AbortController | null>(null);
  const withdrawAbortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const withdrawIdRef = useRef(0);
  const dataTagRef = useRef<SessionTagged<CommissionSummary> | null>(null);
  if (tokenRef.current !== token) {
    tokenRef.current = token;
    sessionGenerationRef.current += 1;
    // Hide data from the previous identity synchronously during this render.
    dataTagRef.current = null;
  }

  const isCurrentSession = (requestToken: string, requestGeneration: number) =>
    mountedRef.current &&
    tokenRef.current === requestToken &&
    sessionGenerationRef.current === requestGeneration;

  const load = useCallback(() => {
    const requestToken = tokenRef.current;
    const requestGeneration = sessionGenerationRef.current;
    loadAbortRef.current?.abort();
    loadAbortRef.current = null;
    if (!requestToken) {
      ++loadIdRef.current;
      dataTagRef.current = null;
      setData(null);
      setLoading(false);
      return;
    }
    const loadId = ++loadIdRef.current;
    const controller = new AbortController();
    loadAbortRef.current = controller;
    setLoading(true);
    fetch("/api/promo-purchase-commissions/my", {
      headers: { Authorization: `Bearer ${requestToken}` },
      signal: controller.signal,
    })
      .then(async response => {
        if (!response.ok) throw new Error(`Request failed (${response.status})`);
        return response.json();
      })
      .then(d => {
        if (loadId === loadIdRef.current && isCurrentSession(requestToken, requestGeneration)) {
          dataTagRef.current = {
            value: d as CommissionSummary,
            token: requestToken,
            generation: requestGeneration,
          };
          setData(d);
        }
      })
      .catch(() => {
        if (
          loadId === loadIdRef.current &&
          isCurrentSession(requestToken, requestGeneration) &&
          !controller.signal.aborted
        ) {
          setData(null);
        }
      })
      .finally(() => {
        if (loadId === loadIdRef.current && mountedRef.current) setLoading(false);
      });
  }, []);

  const currentSession = {
    token: tokenRef.current,
    generation: sessionGenerationRef.current,
  };
  const taggedData = dataTagRef.current;
  const displayData = matchesTaggedSession(taggedData, currentSession)
    ? taggedData?.value ?? null
    : null;

  useEffect(() => {
    withdrawAbortRef.current?.abort();
    withdrawAbortRef.current = null;
    setWithdrawing(false);
    if (authLoading) return;
    load();
  }, [authLoading, token, load]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      loadAbortRef.current?.abort();
      withdrawAbortRef.current?.abort();
    };
  }, []);

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  };

  /* ── Withdraw ── */
  const handleWithdraw = async () => {
    if (!displayData || displayData.availableAmount <= 0 || withdrawing) return;
    const requestToken = tokenRef.current;
    const requestGeneration = sessionGenerationRef.current;
    const requestDataTag = dataTagRef.current;
    if (!requestToken) return;
    const requestId = ++withdrawIdRef.current;
    const controller = new AbortController();
    withdrawAbortRef.current = controller;
    setWithdrawing(true);
    try {
      const res = await fetch("/api/promo-purchase-commissions/withdraw", {
        method: "POST",
        headers: { Authorization: `Bearer ${requestToken}`, "Content-Type": "application/json" },
        signal: controller.signal,
      });
      const json = await res.json();
      if (
        !isCurrentSession(requestToken, requestGeneration) ||
        !matchesTaggedSession(requestDataTag, {
          token: tokenRef.current,
          generation: sessionGenerationRef.current,
        }) ||
        requestId !== withdrawIdRef.current
      ) {
        return;
      }
      if (!res.ok) { showToast(json.error || t("commissionPromo.withdrawError"), false); return; }
      showToast(t("commissionPromo.withdrawSuccess", { amount: json.withdrawn.toFixed(2) }), true);
      load();
    } catch {
      if (isCurrentSession(requestToken, requestGeneration) && !controller.signal.aborted) {
        showToast(t("commissionPromo.withdrawError"), false);
      }
    } finally {
      if (
        isCurrentSession(requestToken, requestGeneration) &&
        matchesTaggedSession(requestDataTag, {
          token: tokenRef.current,
          generation: sessionGenerationRef.current,
        }) &&
        requestId === withdrawIdRef.current
      ) {
        setWithdrawing(false);
      }
    }
  };

  const formatMonth = (ym: string) => {
    const [year, month] = ym.split("-");
    const date = new Date(Number(year), Number(month) - 1);
    return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  };

  const handleBack = () => {
    if (window.history.length > 1) window.history.back();
    else navigate("/");
  };

  return (
    <div
      className="min-h-dvh w-full max-w-full overflow-x-hidden text-white flex flex-col bg-[hsl(152,65%,18%)]"
      data-testid="commission-promo-page"
    >
      {/* Header — owns top safe-area; official logo + brand */}
      <header
        className="sticky top-0 z-30 border-b border-white/10 bg-[hsl(152,65%,18%)]/95 backdrop-blur-sm"
        style={{ paddingTop: "max(env(safe-area-inset-top, 0px), var(--sat, 0px))" }}
      >
        <div className="mx-auto flex h-14 w-full max-w-2xl items-center gap-2 px-3 sm:px-4">
          <button
            type="button"
            onClick={handleBack}
            className="shrink-0 -ml-1 flex h-10 w-10 items-center justify-center rounded-full text-white hover:bg-white/10 transition-colors"
            aria-label={t("common.back", { defaultValue: "Back" })}
            data-testid="commission-promo-back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>

          <Link
            href="/"
            className="min-w-0 flex-1 flex items-center gap-2"
            aria-label="Flexa Market home"
          >
            <img
              src="/flexa-logo-v2.png"
              alt=""
              className="h-8 w-8 sm:h-9 sm:w-9 rounded-[9px] object-cover shrink-0"
              width={36}
              height={36}
            />
            <span className="font-bold text-[15px] sm:text-base tracking-wide text-white truncate">
              Flexa Market
            </span>
          </Link>

          <div className="flex items-center gap-0.5 shrink-0">
            {user && <NotificationsDropdown light />}
            <Link href="/cart" aria-label={t("nav.cart", { defaultValue: "Cart" })}>
              <button
                type="button"
                className="relative p-2 rounded-xl hover:bg-white/10 transition-colors"
                data-testid="commission-promo-cart"
              >
                <ShoppingCart className="h-5 w-5 text-white" />
                {cartCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-[#F97316] text-white text-[10px] font-black rounded-full flex items-center justify-center px-1 leading-none">
                    {cartCount > 9 ? "9+" : cartCount}
                  </span>
                )}
              </button>
            </Link>
          </div>
        </div>
      </header>

      {/* Toast */}
      {toast && (
        <div className={`fixed top-[calc(max(env(safe-area-inset-top,0px),var(--sat,0px))+3.5rem)] left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl shadow-xl text-sm font-semibold transition-all max-w-[min(20rem,calc(100vw-2rem))] text-center ${toast.ok ? "bg-emerald-500 text-white" : "bg-red-500 text-white"}`}>
          {toast.msg}
        </div>
      )}

      <div
        className="flex-1 w-full max-w-2xl mx-auto px-3 sm:px-4 pt-4 sm:pt-5 space-y-3.5 sm:space-y-4"
        style={{
          paddingBottom: "max(1.25rem, calc(env(safe-area-inset-bottom, 0px) + 0.75rem), calc(var(--flexa-android-bottom, 0px) + 0.75rem))",
        }}
      >
        {/* Title block */}
        <div className="flex items-start gap-2.5 px-0.5 pb-1">
          <Megaphone className="h-7 w-7 sm:h-8 sm:w-8 text-orange-400 shrink-0 mt-0.5 -rotate-12" aria-hidden />
          <div className="min-w-0">
            <h1 className="font-bold text-xl sm:text-2xl leading-tight text-white">
              {t("commissionPromo.title")}
            </h1>
            <p className="text-sm text-white/85 mt-0.5 leading-snug">
              {t("commissionPromo.subtitle")}
            </p>
          </div>
        </div>

        {/* ─── Referral code card ─── */}
        {(displayData?.referralCode || loading) && (
          <section className="bg-white text-slate-900 rounded-2xl p-3.5 sm:p-4 space-y-3 shadow-sm">
            <div className="flex items-center gap-2">
              <Link2 size={16} className="text-blue-600 shrink-0" />
              <span className="text-sm font-semibold text-slate-800">
                {t("commissionPromo.yourCode")}
              </span>
            </div>

            {loading ? (
              <div className="h-11 bg-slate-100 rounded-xl animate-pulse" />
            ) : (
              <>
                <div className="flex items-center gap-2 bg-slate-100 rounded-xl px-3.5 py-2.5">
                  <span className="flex-1 text-base sm:text-lg font-bold tracking-wide text-slate-900 truncate">
                    {displayData?.referralCode}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(displayData?.referralCode ?? "");
                      showToast(t("commissionPromo.codeCopied"), true);
                    }}
                    className="p-2 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors shrink-0"
                    aria-label={t("commissionPromo.codeCopied")}
                  >
                    <Copy size={18} />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const msg = t("commissionPromo.shareMsg", { code: displayData?.referralCode ?? "" });
                      navigator.clipboard.writeText(msg);
                      showToast(t("commissionPromo.linkCopied"), true);
                    }}
                    className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-blue-500 bg-white hover:bg-blue-50 text-xs sm:text-sm font-semibold text-blue-600 transition-colors"
                  >
                    <MessageCircle size={14} className="shrink-0" />
                    <span className="truncate">{t("commissionPromo.copyLink")}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const msg = t("commissionPromo.shareMsg", { code: displayData?.referralCode ?? "" });
                      if (navigator.share) {
                        navigator.share({ text: msg }).catch(() => {});
                      } else {
                        navigator.clipboard.writeText(msg);
                        showToast(t("commissionPromo.linkCopied"), true);
                      }
                    }}
                    className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-xs sm:text-sm font-semibold text-white transition-colors"
                  >
                    <Share2 size={14} className="shrink-0" />
                    <span className="truncate">{t("commissionPromo.share")}</span>
                  </button>
                </div>
              </>
            )}
          </section>
        )}

        {/* Referral stats */}
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
          <div className="bg-white text-slate-900 rounded-2xl p-3.5 sm:p-4 flex flex-col gap-1.5 shadow-sm min-w-0">
            <div className="flex items-center gap-1.5 text-blue-600">
              <Users size={15} className="shrink-0" />
              <span className="text-xs font-semibold truncate">{t("commissionPromo.statReferrals")}</span>
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 tabular-nums">
              {loading ? "—" : (displayData?.totalReferrals ?? 0)}
            </div>
            <p className="text-[11px] sm:text-xs text-slate-500 leading-snug">
              {t("commissionPromo.statReferralsSub")}
            </p>
          </div>
          <div className="bg-white text-slate-900 rounded-2xl p-3.5 sm:p-4 flex flex-col gap-1.5 shadow-sm min-w-0">
            <div className="flex items-center gap-1.5 text-blue-600">
              <ShoppingBag size={15} className="shrink-0" />
              <span className="text-xs font-semibold truncate">{t("commissionPromo.statBuyers")}</span>
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 tabular-nums">
              {loading ? "—" : (displayData?.buyersWhoSpent ?? 0)}
            </div>
            <p className="text-[11px] sm:text-xs text-slate-500 leading-snug">
              {t("commissionPromo.statBuyersSub")}
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 size={32} className="animate-spin text-orange-400" />
          </div>
        ) : (
          <>
            {/* ─── Pending this month ─── */}
            <section className="rounded-2xl overflow-hidden bg-gradient-to-br from-orange-50 to-amber-50 border border-orange-100 shadow-sm">
              <div className="relative p-3.5 sm:p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Clock size={15} className="text-orange-500 shrink-0" />
                      <span className="text-xs sm:text-sm font-semibold text-slate-700">
                        {t("commissionPromo.pendingLabel")}
                      </span>
                    </div>
                    <div className="text-2xl sm:text-3xl font-extrabold text-orange-500 tabular-nums">
                      ${(displayData?.pendingAmount ?? 0).toFixed(2)}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {t("commissionPromo.pendingCount", { count: displayData?.pendingCount ?? 0 })}
                    </p>
                  </div>
                  <Calendar size={20} className="text-orange-400/80 shrink-0 mt-0.5" aria-hidden />
                </div>
              </div>
              <div className="mx-3 mb-3 sm:mx-3.5 sm:mb-3.5 flex items-center gap-2 rounded-xl bg-orange-100/90 px-3 py-2 text-xs text-orange-800">
                <Lock size={13} className="shrink-0" />
                <span className="leading-snug">
                  {t("commissionPromo.pendingLockedUntil", {
                    date: displayData?.currentMonth ? firstOfNextMonth(displayData.currentMonth) : "—",
                  })}
                </span>
              </div>
            </section>

            {/* ─── Available to withdraw ─── */}
            <section className="rounded-2xl overflow-hidden bg-gradient-to-br from-emerald-100/90 to-green-50 border border-emerald-200/80 shadow-sm p-3.5 sm:p-4">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Coins size={15} className="text-emerald-600 shrink-0" />
                    <span className="text-xs sm:text-sm font-semibold text-slate-700">
                      {t("commissionPromo.availableLabel")}
                    </span>
                  </div>
                  <div className="text-2xl sm:text-3xl font-extrabold text-emerald-600 tabular-nums">
                    ${(displayData?.availableAmount ?? 0).toFixed(2)}
                  </div>
                  <p className="text-[11px] sm:text-xs text-slate-500 mt-1 leading-snug">
                    {t("commissionPromo.withdrawDestination")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleWithdraw}
                  disabled={(displayData?.availableAmount ?? 0) <= 0 || withdrawing}
                  className="shrink-0 inline-flex items-center gap-1.5 rounded-xl border border-emerald-500 bg-white px-3 py-2.5 text-xs sm:text-sm font-semibold text-emerald-700 transition-all hover:bg-emerald-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  data-testid="commission-promo-withdraw"
                >
                  {withdrawing ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : (
                    <Wallet size={15} className="shrink-0" />
                  )}
                  <span>
                    {withdrawing
                      ? t("commissionPromo.withdrawing")
                      : t("commissionPromo.withdraw")}
                  </span>
                </button>
              </div>
            </section>

            {/* ─── History ─── */}
            <section className="space-y-2.5">
              <button
                type="button"
                onClick={() => setHistoryOpen(open => !open)}
                className="w-full bg-white text-slate-900 rounded-2xl px-3.5 sm:px-4 py-3.5 flex items-center gap-3 shadow-sm hover:bg-slate-50 transition-colors"
                aria-expanded={historyOpen}
                data-testid="commission-promo-history-toggle"
              >
                <BarChart3 size={18} className="text-blue-600 shrink-0" />
                <span className="flex-1 text-left text-sm font-semibold">
                  {t("commissionPromo.history")}
                </span>
                <ChevronRight
                  size={18}
                  className={`text-slate-400 shrink-0 transition-transform ${historyOpen ? "rotate-90" : ""}`}
                />
              </button>

              {historyOpen && (
                (displayData?.history ?? []).length === 0 ? (
                  <div className="bg-white/10 rounded-2xl px-4 py-8 text-center">
                    <p className="text-sm text-white/80">{t("commissionPromo.noHistory")}</p>
                    <p className="text-xs text-white/55 mt-1">{t("commissionPromo.noHistoryHint")}</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {(displayData?.history ?? []).map(row => (
                      <div
                        key={row.id}
                        className="bg-white text-slate-900 rounded-xl px-3.5 sm:px-4 py-3 flex items-center justify-between gap-3 shadow-sm"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-semibold">
                            +${row.commissionAmount.toFixed(2)}
                            <span className="ml-2 text-xs font-normal text-slate-500">
                              {t("commissionPromo.onPurchase", { amount: row.purchaseAmount.toFixed(2) })}
                            </span>
                          </p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {formatMonth(row.cycleMonth)} · {new Date(row.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                        <span className={`shrink-0 text-[11px] font-bold px-2 py-1 rounded-full ${
                          row.status === "withdrawn"
                            ? "bg-slate-100 text-slate-500"
                            : row.isAvailable
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-orange-50 text-orange-600"
                        }`}>
                          {row.status === "withdrawn"
                            ? t("commissionPromo.statusWithdrawn")
                            : row.isAvailable
                            ? t("commissionPromo.statusAvailable")
                            : t("commissionPromo.statusPending")}
                        </span>
                      </div>
                    ))}
                  </div>
                )
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
