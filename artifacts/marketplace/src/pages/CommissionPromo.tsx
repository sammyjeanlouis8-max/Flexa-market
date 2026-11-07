import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/auth";
import { matchesTaggedSession, type SessionTagged } from "@/lib/authSession";
import {
  Link2, Clock, Calendar, Copy, Share2, Wallet, Users, ShoppingCart,
  Loader2, MessageSquare, Coins, BarChart3, ChevronRight, Lock, Megaphone,
} from "lucide-react";
import "./commissionPromo.css";

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

/** First day of the next calendar month after `currentMonth` (YYYY-MM). */
function firstOfNextMonth(currentMonth: string, locale: string): string {
  const [y, m] = currentMonth.split("-").map(Number);
  const next = new Date(y, m, 1);
  return next.toLocaleDateString(locale || "en-US", { day: "numeric", month: "long", year: "numeric" });
}

export default function CommissionPromo() {
  const { t, i18n } = useTranslation();
  const { token, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();

  const [data, setData] = useState<CommissionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [withdrawing, setWithdrawing] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

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
    if (!token) {
      // Production requires auth; local/dev can still preview chrome with empty stats.
      if (import.meta.env.PROD) {
        navigate(`/auth/login?next=${encodeURIComponent("/commission-promo")}`);
      } else {
        setLoading(false);
        setData(null);
      }
      return;
    }
    load();
  }, [authLoading, token, load, navigate]);

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
    return date.toLocaleDateString(i18n.language || "en-US", { month: "long", year: "numeric" });
  };

  const copyCode = () => {
    navigator.clipboard.writeText(displayData?.referralCode ?? "");
    showToast(t("commissionPromo.codeCopied"), true);
  };

  const copyMessage = () => {
    const msg = t("commissionPromo.shareMsg", { code: displayData?.referralCode ?? "" });
    navigator.clipboard.writeText(msg);
    showToast(t("commissionPromo.linkCopied"), true);
  };

  const shareMessage = () => {
    const msg = t("commissionPromo.shareMsg", { code: displayData?.referralCode ?? "" });
    if (navigator.share) {
      navigator.share({ text: msg }).catch(() => {});
    } else {
      navigator.clipboard.writeText(msg);
      showToast(t("commissionPromo.linkCopied"), true);
    }
  };

  const unlockDate = displayData?.currentMonth
    ? firstOfNextMonth(displayData.currentMonth, i18n.language || "en-US")
    : "—";

  return (
    <div className="cp-page" data-testid="commission-promo-page">
      {toast && (
        <div className={`cp-toast ${toast.ok ? "cp-toast-ok" : "cp-toast-err"}`} role="status">
          {toast.msg}
        </div>
      )}

      <div className="cp-shell">
        <div className="cp-title-row">
          <Megaphone className="cp-megaphone" aria-hidden />
          <div className="min-w-0">
            <h1 className="cp-title">{t("commissionPromo.title")}</h1>
            <p className="cp-subtitle">{t("commissionPromo.subtitle")}</p>
          </div>
        </div>

        {/* Referral code */}
        <section className="cp-card" aria-label={t("commissionPromo.yourCode")}>
          <div className="cp-card-label">
            <Link2 aria-hidden />
            {t("commissionPromo.yourCode")}
          </div>
          {loading ? (
            <div className="cp-skeleton" />
          ) : (
            <>
              <div className="cp-code-box">
                <span className="cp-code-text" data-testid="referral-code">
                  {displayData?.referralCode || "—"}
                </span>
                <button type="button" className="cp-icon-btn" onClick={copyCode} aria-label={t("commissionPromo.codeCopied")}>
                  <Copy />
                </button>
              </div>
              <div className="cp-actions">
                <button type="button" className="cp-btn cp-btn-outline" onClick={copyMessage} data-testid="copy-message">
                  <MessageSquare /> {t("commissionPromo.copyLink")}
                </button>
                <button type="button" className="cp-btn cp-btn-primary" onClick={shareMessage} data-testid="share-message">
                  <Share2 /> {t("commissionPromo.share")}
                </button>
              </div>
            </>
          )}
        </section>

        {/* Stats */}
        <div className="cp-stats">
          <div className="cp-card cp-stat">
            <div className="cp-stat-top">
              <Users aria-hidden />
              {t("commissionPromo.statReferrals")}
            </div>
            <div className="cp-stat-value">{loading ? "—" : (displayData?.totalReferrals ?? 0)}</div>
            <p className="cp-stat-sub">{t("commissionPromo.statReferralsSub")}</p>
          </div>
          <div className="cp-card cp-stat">
            <div className="cp-stat-top">
              <ShoppingCart aria-hidden />
              {t("commissionPromo.statBuyers")}
            </div>
            <div className="cp-stat-value">{loading ? "—" : (displayData?.buyersWhoSpent ?? 0)}</div>
            <p className="cp-stat-sub">{t("commissionPromo.statBuyersSub")}</p>
          </div>
        </div>

        {loading ? (
          <div className="cp-loading"><Loader2 className="animate-spin" size={28} /></div>
        ) : (
          <>
            {/* Pending */}
            <section className="cp-card cp-pending" aria-label={t("commissionPromo.pendingLabel")}>
              <div className="cp-pending-body">
                <div className="cp-pending-head">
                  <div className="cp-pending-head-left">
                    <Clock aria-hidden />
                    {t("commissionPromo.pendingLabel")}
                  </div>
                  <Calendar className="cp-pending-cal" aria-hidden />
                </div>
                <div className="cp-amount">${(displayData?.pendingAmount ?? 0).toFixed(2)}</div>
                <p className="cp-pending-count">
                  {t("commissionPromo.pendingCount", { count: displayData?.pendingCount ?? 0 })}
                </p>
              </div>
              <div className="cp-lock-bar">
                <Lock aria-hidden />
                <span>
                  {t("commissionPromo.pendingLockedUntil", { date: unlockDate })}
                </span>
              </div>
            </section>

            {/* Available */}
            <section className="cp-card cp-available" aria-label={t("commissionPromo.availableLabel")}>
              <div className="cp-available-left">
                <div className="cp-available-label">
                  <Coins aria-hidden />
                  {t("commissionPromo.availableLabel")}
                </div>
                <div className="cp-amount">${(displayData?.availableAmount ?? 0).toFixed(2)}</div>
              </div>
              <button
                type="button"
                className="cp-withdraw"
                onClick={handleWithdraw}
                disabled={(displayData?.availableAmount ?? 0) <= 0 || withdrawing}
                data-testid="withdraw-btn"
              >
                {withdrawing ? (
                  <><Loader2 size={13} className="animate-spin" /> {t("commissionPromo.withdrawing")}</>
                ) : (
                  <><Wallet /> {t("commissionPromo.withdraw")}</>
                )}
              </button>
            </section>

            {/* History */}
            <button
              type="button"
              className="cp-history-row"
              onClick={() => setHistoryOpen(v => !v)}
              aria-expanded={historyOpen}
              data-testid="commission-history-toggle"
            >
              <span className="cp-history-row-left">
                <BarChart3 aria-hidden />
                {t("commissionPromo.history")}
              </span>
              <ChevronRight style={{ transform: historyOpen ? "rotate(90deg)" : undefined, transition: "transform 0.15s" }} aria-hidden />
            </button>

            {historyOpen && (
              <div className="cp-history-panel" data-testid="commission-history-panel">
                {(displayData?.history ?? []).length === 0 ? (
                  <div className="cp-history-empty">
                    <p>{t("commissionPromo.noHistory")}</p>
                    <p style={{ marginTop: 6, fontSize: "0.75rem" }}>{t("commissionPromo.noHistoryHint")}</p>
                  </div>
                ) : (
                  (displayData?.history ?? []).map(row => (
                    <div key={row.id} className="cp-history-item">
                      <div className="min-w-0">
                        <p style={{ fontSize: "0.85rem", fontWeight: 750 }}>
                          +${row.commissionAmount.toFixed(2)}
                          <span style={{ marginLeft: 8, fontWeight: 500, color: "#64748b", fontSize: "0.75rem" }}>
                            {t("commissionPromo.onPurchase", { amount: row.purchaseAmount.toFixed(2) })}
                          </span>
                        </p>
                        <p style={{ fontSize: "0.7rem", color: "#94a3b8", marginTop: 2 }}>
                          {formatMonth(row.cycleMonth)} · {new Date(row.createdAt).toLocaleDateString(i18n.language || "en-US")}
                        </p>
                      </div>
                      <span className={`cp-badge ${
                        row.status === "withdrawn"
                          ? "cp-badge-done"
                          : row.isAvailable
                            ? "cp-badge-ready"
                            : "cp-badge-pending"
                      }`}>
                        {row.status === "withdrawn"
                          ? t("commissionPromo.statusWithdrawn")
                          : row.isAvailable
                            ? t("commissionPromo.statusAvailable")
                            : t("commissionPromo.statusPending")}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
