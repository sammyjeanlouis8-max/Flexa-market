import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import {
  CreditCard,
  Wallet,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Loader2,
  History,
  LifeBuoy,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

interface RepaymentRow {
  id: number;
  amountUsd: number;
  outstandingAfterUsd: number;
  source: string;
  createdAt: string;
}

interface FlexCardStatus {
  blocked: boolean;
  debt: {
    referenceCode: string;
    reason: string;
    originalAmountUsd: number;
    outstandingUsd: number;
    deadline: string | null;
    notes: string | null;
    blockedAt: string | null;
  } | null;
  repayments: RepaymentRow[];
  walletBalanceUsd: number;
}

export default function FlexCardRepay() {
  const { t } = useTranslation();
  const { refreshUser } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const [amount, setAmount] = useState("");

  const { data, isLoading, isError } = useQuery<FlexCardStatus>({
    queryKey: ["/flex-card/me"],
    queryFn: () => apiFetch("/api/flex-card/me"),
  });

  const repayMut = useMutation({
    mutationFn: (amountUsd: number) =>
      apiFetch("/api/flex-card/repay", {
        method: "POST",
        body: JSON.stringify({ amountUsd }),
      }),
    onSuccess: async (res: { amountPaid: number; outstandingUsd: number; cleared: boolean }) => {
      if (res.cleared) {
        toast({ title: t("flexCard.clearedToast") });
      } else {
        toast({ title: t("flexCard.paidToast", { amount: res.amountPaid.toFixed(2) }) });
      }
      setAmount("");
      await qc.invalidateQueries({ queryKey: ["/flex-card/me"] });
      await qc.invalidateQueries({ queryKey: ["/wallet/balance"] });
      refreshUser();
    },
    onError: (e: Error) => {
      const msg = e?.message ?? "";
      if (/insufficient/i.test(msg)) {
        toast({ title: t("flexCard.insufficientFunds"), variant: "destructive" });
      } else {
        toast({ title: t("flexCard.payError"), description: msg, variant: "destructive" });
      }
    },
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="max-w-lg mx-auto px-4 py-10 text-center space-y-4">
        <AlertCircle className="h-10 w-10 mx-auto text-red-500" />
        <p className="text-muted-foreground">{t("flexCard.loadError")}</p>
        <Button onClick={() => qc.invalidateQueries({ queryKey: ["/flex-card/me"] })}>
          {t("flexCard.retry")}
        </Button>
      </div>
    );
  }

  const debt = data?.debt ?? null;
  const balance = data?.walletBalanceUsd ?? 0;
  const outstanding = debt?.outstandingUsd ?? 0;

  // Not blocked / fully cleared state.
  if (!data?.blocked || !debt) {
    return (
      <div className="max-w-lg mx-auto px-4 py-12 text-center space-y-5">
        <div className="w-16 h-16 rounded-3xl bg-green-100 dark:bg-green-950/40 flex items-center justify-center mx-auto">
          <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
        </div>
        <h1 className="text-2xl font-black">{t("flexCard.activeTitle")}</h1>
        <p className="text-muted-foreground">{t("flexCard.activeDesc")}</p>
        <Button className="rounded-full" onClick={() => navigate("/wallet")}>
          <Wallet className="h-4 w-4 mr-1.5" /> {t("flexCard.goWallet")}
        </Button>
      </div>
    );
  }

  const enteredAmount = parseFloat(amount);
  const canPay =
    Number.isFinite(enteredAmount) &&
    enteredAmount > 0 &&
    enteredAmount <= balance + 0.001 &&
    balance > 0 &&
    !repayMut.isPending;

  const payFull = () => {
    const full = Math.min(outstanding, balance);
    if (full <= 0) {
      toast({ title: t("flexCard.insufficientFunds"), variant: "destructive" });
      return;
    }
    repayMut.mutate(Math.round(full * 100) / 100);
  };

  return (
    <div className="max-w-lg mx-auto px-4 py-6 pb-24 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => window.history.back()}
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          aria-label={t("flexCard.back")}
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <CreditCard className="h-5 w-5 text-red-600 dark:text-red-400" />
        <h1 className="text-lg font-black">{t("flexCard.repayTitle")}</h1>
      </div>

      {/* Explainer */}
      <div className="rounded-2xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-4 space-y-1">
        <p className="text-sm font-semibold text-red-800 dark:text-red-300">{t("flexCard.repayWhyTitle")}</p>
        <p className="text-xs text-red-700/90 dark:text-red-300/90 leading-relaxed">{t("flexCard.repayWhyDesc")}</p>
      </div>

      {/* Debt summary */}
      <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-sm text-muted-foreground">{t("flexCard.outstanding")}</span>
          <span className="text-2xl font-black text-red-600 dark:text-red-400">${outstanding.toFixed(2)}</span>
        </div>
        <div className="border-t border-border pt-3 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t("flexCard.reference")}</span>
            <span className="font-mono font-semibold">{debt.referenceCode}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t("flexCard.original")}</span>
            <span className="font-semibold">${debt.originalAmountUsd.toFixed(2)}</span>
          </div>
          {debt.deadline && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("flexCard.deadline")}</span>
              <span className="font-semibold">{new Date(debt.deadline).toLocaleDateString()}</span>
            </div>
          )}
          {debt.notes && (
            <div className="pt-1 text-xs text-muted-foreground italic">{debt.notes}</div>
          )}
        </div>
      </div>

      {/* Wallet balance */}
      <div className="rounded-2xl border border-border bg-muted/40 p-4 flex justify-between items-center">
        <span className="text-sm text-muted-foreground flex items-center gap-1.5">
          <Wallet className="h-4 w-4" /> {t("flexCard.fmBalance")}
        </span>
        <span className="text-lg font-bold text-primary">${balance.toFixed(2)}</span>
      </div>

      {/* Pay form */}
      <div className="space-y-3">
        <label className="text-sm font-semibold">{t("flexCard.amountLabel")}</label>
        <Input
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          className="rounded-xl text-lg"
          disabled={repayMut.isPending}
        />
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1 rounded-full"
            disabled={repayMut.isPending || balance <= 0}
            onClick={() => setAmount(Math.min(outstanding, balance).toFixed(2))}
          >
            {t("flexCard.useMax")}
          </Button>
          <Button
            className="flex-1 rounded-full"
            disabled={!canPay}
            onClick={() => repayMut.mutate(Math.round(enteredAmount * 100) / 100)}
          >
            {repayMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t("flexCard.pay")}
          </Button>
        </div>
        <Button
          className="w-full rounded-full bg-red-600 hover:bg-red-700 text-white"
          disabled={repayMut.isPending || balance <= 0}
          onClick={payFull}
        >
          {t("flexCard.payFull", { amount: Math.min(outstanding, balance).toFixed(2) })}
        </Button>
        {balance <= 0 && (
          <p className="text-xs text-amber-600 dark:text-amber-400 text-center">{t("flexCard.noBalanceHint")}</p>
        )}
      </div>

      {/* Repayment history */}
      {data.repayments.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-bold flex items-center gap-1.5">
            <History className="h-4 w-4" /> {t("flexCard.historyTitle")}
          </h2>
          <div className="rounded-2xl border border-border divide-y divide-border overflow-hidden">
            {data.repayments.map((r) => (
              <div key={r.id} className="flex justify-between items-center px-4 py-2.5 text-sm">
                <div>
                  <p className="font-semibold text-green-600 dark:text-green-400">-${r.amountUsd.toFixed(2)}</p>
                  <p className="text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleString()}</p>
                </div>
                <span className="text-xs text-muted-foreground">
                  {t("flexCard.remaining")}: ${r.outstandingAfterUsd.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Support */}
      <button
        onClick={() => navigate("/support")}
        className="w-full flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors py-2"
      >
        <LifeBuoy className="h-4 w-4" /> {t("flexCard.contactSupport")}
      </button>
    </div>
  );
}
