import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import {
  Send, ArrowRight, User, Search, Loader2, AlertCircle,
  CheckCircle, Shield, Globe, DollarSign, Clock, Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const REGIONAL_COUNTRIES = ["Haiti", "Dominican Republic"];

interface SearchedUser {
  id: number | string;
  name: string;
  avatar: string | null;
  country: string | null;
}

interface TransferPreview {
  amountUsd: number;
  feeUsd: number;
  netAmountUsd: number;
  isInternational: boolean;
  internationalFeeRate: number | null;
  dailyFee: number;
  monthlyUsed: number;
  monthlyLimit: number;
  canTransfer: boolean;
  blockReason: string | null;
}

export default function WalletTransfer() {
  const { user, token } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { t } = useTranslation();

  const [step, setStep] = useState<"search" | "amount" | "confirm" | "done">("search");
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchedUser[]>([]);
  const [recipient, setRecipient] = useState<SearchedUser | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [preview, setPreview] = useState<TransferPreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [walletAvailable, setWalletAvailable] = useState<number | null>(null);
  const [recipientSource, setRecipientSource] = useState<"market" | "wholesale">("market");
  const [submitIdempotencyKey, setSubmitIdempotencyKey] = useState("");
  const [transferPending, setTransferPending] = useState(false);

  useEffect(() => {
    if (!user) { navigate("/auth/login"); return; }
  }, [user]);

  useEffect(() => {
    if (!token) return;
    fetch("/api/wallet/balance", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => {
        setWalletAvailable(d.availableUsd ?? d.balanceUsd ?? null);
      })
      .catch(() => {});
  }, [token]);

  // An idempotency key belongs to one immutable transfer intent. Network retries
  // with unchanged fields reuse it; editing any intent field starts a new intent.
  useEffect(() => {
    setSubmitIdempotencyKey("");
  }, [recipientSource, recipient?.id, amount, note]);

  const searchUsers = async () => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const res = recipientSource === "market"
        ? await fetch(`/api/wallet/p2p/search?q=${encodeURIComponent(query)}`, {
            headers: { Authorization: `Bearer ${token}` },
          })
        : await fetch("/api/wallet/cross-app/search", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ query }),
          });
      if (res.ok) setResults((await res.json()).users ?? []);
    } finally { setSearching(false); }
  };

  const loadPreview = async (amt: string) => {
    if (!recipient || !parseFloat(amt)) return;
    setLoadingPreview(true);
    try {
      const res = await fetch(recipientSource === "market" ? "/api/wallet/p2p/preview" : "/api/wallet/cross-app/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(recipientSource === "market"
          ? { toUserId: recipient.id, amountUsd: parseFloat(amt) }
          : { destinationUserId: recipient.id, amountUsd: parseFloat(amt) }),
      });
      if (res.ok) setPreview(await res.json());
    } finally { setLoadingPreview(false); }
  };

  const handleSubmit = async () => {
    if (!recipient || !preview) return;
    setSubmitting(true);
    try {
      const idempotencyKey = submitIdempotencyKey || crypto.randomUUID();
      if (!submitIdempotencyKey) setSubmitIdempotencyKey(idempotencyKey);
      const res = await fetch(recipientSource === "market" ? "/api/wallet/p2p" : "/api/wallet/cross-app", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "Idempotency-Key": idempotencyKey },
        body: JSON.stringify(recipientSource === "market"
          ? { toUserId: recipient.id, amountUsd: parseFloat(amount), note, idempotencyKey }
          : { destinationUserId: recipient.id, amountUsd: parseFloat(amount), note, idempotencyKey }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error");
      setTransferPending(Boolean(data.pending));
      setStep("done");
    } catch (err: any) {
      toast({ title: err.message ?? "Error. Please try again.", variant: "destructive" });
    } finally { setSubmitting(false); }
  };

  if (!user) return null;

  if (step === "done") {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle className="h-10 w-10 text-green-600" />
        </div>
        <h2 className="text-2xl font-black mb-2">
          {transferPending ? "Transfer pending" : t("walletTransfer.successTitle")}
        </h2>
        <p className="text-muted-foreground mb-2">
          {transferPending
            ? "Your wallet was debited safely. Delivery will retry automatically; you will not be charged twice."
            : t("walletTransfer.successDesc", { amount: parseFloat(amount).toFixed(2), name: recipient?.name })}
        </p>
        {preview?.netAmountUsd && (
          <p className="text-sm text-muted-foreground">
            {t("walletTransfer.successReceives", { amount: preview.netAmountUsd.toFixed(2) })}
          </p>
        )}
        <div className="flex gap-3 justify-center mt-8">
          <Button variant="outline" onClick={() => { setStep("search"); setRecipient(null); setAmount(""); setPreview(null); setSubmitIdempotencyKey(""); setTransferPending(false); }}>
            {t("walletTransfer.newTransfer")}
          </Button>
          <Button onClick={() => navigate("/wallet")}>{t("walletTransfer.viewWallet")}</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6 pb-20 space-y-5">
      {/* Header */}
      <div className="text-center">
        <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-3">
          <Send className="h-7 w-7 text-primary" />
        </div>
        <h1 className="text-2xl font-black">{t("walletTransfer.title")}</h1>
        {walletAvailable !== null && (
          <p className="text-muted-foreground text-sm mt-1">
            {t("walletTransfer.balanceLabel")}: <span className="font-bold text-foreground">${walletAvailable.toFixed(2)}</span>
          </p>
        )}
      </div>

      {/* Transfer limits info */}
      <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-2xl p-3 text-xs text-blue-700 dark:text-blue-300 flex gap-2">
        <Shield className="h-4 w-4 shrink-0 mt-0.5" />
        <div>{t("walletTransfer.feesInfo")}</div>
      </div>

      {/* STEP 1: Search recipient */}
      {step === "search" && (
        <div className="space-y-4">
          <h2 className="font-bold">{t("walletTransfer.searchTitle")}</h2>
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-muted p-1">
            <Button
              type="button"
              size="sm"
              variant={recipientSource === "market" ? "default" : "ghost"}
              onClick={() => { setRecipientSource("market"); setResults([]); setRecipient(null); }}
            >
              Flexa Market
            </Button>
            <Button
              type="button"
              size="sm"
              variant={recipientSource === "wholesale" ? "default" : "ghost"}
              onClick={() => { setRecipientSource("wholesale"); setResults([]); setRecipient(null); }}
            >
              Flexa Wholesale
            </Button>
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => e.key === "Enter" && searchUsers()}
                placeholder={t("walletTransfer.searchPlaceholder")}
                className="pl-9 rounded-xl"
              />
            </div>
            <Button onClick={searchUsers} disabled={searching} className="rounded-xl">
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : t("walletTransfer.search")}
            </Button>
          </div>

          {results.length > 0 && (
            <div className="space-y-2">
              {results.map(u => (
                <button
                  key={String(u.id)}
                  type="button"
                  onClick={() => { setRecipient(u); setStep("amount"); }}
                  className="w-full flex items-center gap-3 p-3 bg-card border border-border rounded-2xl hover:border-primary/50 hover:bg-accent transition-all text-left"
                >
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={u.avatar ?? undefined} />
                    <AvatarFallback className="bg-primary/10 text-primary font-bold">{u.name?.[0]}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <p className="font-semibold text-sm">{u.name}</p>
                    {recipientSource === "wholesale" && <p className="text-[10px] font-medium text-primary">Flexa Wholesale</p>}
                    {u.country && <p className="text-xs text-muted-foreground">{u.country}</p>}
                  </div>
                  {!REGIONAL_COUNTRIES.includes(u.country ?? "") && REGIONAL_COUNTRIES.includes(user.country ?? "") && (
                    <Badge variant="secondary" className="text-[10px]">
                      <Globe className="h-2.5 w-2.5 mr-0.5" /> {t("walletTransfer.international")}
                    </Badge>
                  )}
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* STEP 2: Amount */}
      {step === "amount" && recipient && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-4 bg-muted/40 rounded-2xl">
            <Avatar className="h-12 w-12">
              <AvatarImage src={recipient.avatar ?? undefined} />
              <AvatarFallback className="bg-primary/10 text-primary font-bold">{recipient.name[0]}</AvatarFallback>
            </Avatar>
            <div>
              <p className="font-bold">{recipient.name}</p>
              <p className="text-sm text-muted-foreground">{recipient.country}</p>
            </div>
            {!REGIONAL_COUNTRIES.includes(recipient.country ?? "") && (
              <Badge className="ml-auto bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 text-xs">
                <Globe className="h-3 w-3 mr-0.5" /> {t("walletTransfer.intlBadge")}
              </Badge>
            )}
          </div>

          <div className="space-y-2">
            <Label>{t("walletTransfer.amountLabel")}</Label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <input
                type="number"
                value={amount}
                onChange={e => { setAmount(e.target.value); setPreview(null); }}
                placeholder="0.00"
                min="1"
                max={walletAvailable ?? undefined}
                step="0.01"
                className="w-full pl-9 pr-4 py-3 text-2xl font-bold border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 bg-background"
              />
            </div>
            {walletAvailable !== null && (
              <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
                <span>{t("walletTransfer.balanceLabel")}:</span>
                <button
                  type="button"
                  className="font-bold text-primary hover:underline"
                  onClick={() => { setAmount(walletAvailable.toFixed(2)); setPreview(null); }}
                >
                  ${walletAvailable.toFixed(2)} (max)
                </button>
              </div>
            )}
            {walletAvailable !== null && parseFloat(amount) > walletAvailable && (
              <p className="text-xs text-red-500 flex items-center gap-1">
                <AlertCircle className="h-3.5 w-3.5" />
                {t("walletTransfer.balanceLabel")}: ${walletAvailable.toFixed(2)} disponib
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>{t("walletTransfer.noteLabel")}</Label>
            <Input value={note} onChange={e => setNote(e.target.value)} placeholder={t("walletTransfer.notePlaceholder")} className="rounded-xl" />
          </div>

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1 rounded-full" onClick={() => setStep("search")}>
              {t("walletTransfer.back")}
            </Button>
            <Button
              className="flex-1 rounded-full"
              disabled={
                !!user.flexCardBlocked ||
                !amount ||
                parseFloat(amount) <= 0 ||
                (walletAvailable !== null && parseFloat(amount) > walletAvailable) ||
                loadingPreview
              }
              onClick={() => { loadPreview(amount); setStep("confirm"); }}
            >
              {t("walletTransfer.continue")} <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* STEP 3: Confirm */}
      {step === "confirm" && recipient && (
        <div className="space-y-4">
          <h2 className="font-bold text-lg">{t("walletTransfer.confirmTitle")}</h2>

          {loadingPreview ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : preview ? (
            <div className="space-y-3">
              {preview.blockReason && (
                <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-2xl p-3 text-sm text-red-700 dark:text-red-300 flex gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{preview.blockReason}</span>
                </div>
              )}

              <div className="bg-muted/40 rounded-2xl p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("walletTransfer.sendTo")}</span>
                  <span className="font-semibold">{recipient.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("walletTransfer.amount")}</span>
                  <span className="font-semibold">${parseFloat(amount).toFixed(2)}</span>
                </div>
                {preview.feeUsd > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <Shield className="h-3 w-3" /> {t("walletTransfer.intlFee")}
                    </span>
                    <span className="text-amber-600">-${preview.feeUsd.toFixed(2)}</span>
                  </div>
                )}
                <div className="border-t border-border pt-2 flex justify-between font-bold">
                  <span>{t("walletTransfer.theyReceive")}</span>
                  <span className="text-primary">${preview.netAmountUsd.toFixed(2)}</span>
                </div>

                <div className="mt-2 pt-2 border-t border-border flex justify-between text-xs text-muted-foreground">
                  <span>{t("walletTransfer.monthlyLimit")}</span>
                  <span>${preview.monthlyUsed.toFixed(0)} / ${preview.monthlyLimit.toFixed(0)}</span>
                </div>
              </div>

              {!preview.isInternational && (
                <div className="flex items-center gap-2 text-xs text-green-600 bg-green-50 dark:bg-green-950/20 rounded-xl p-2.5">
                  <Shield className="h-3.5 w-3.5" />
                  <span>{t("walletTransfer.regional")}</span>
                </div>
              )}

              <div className="flex gap-3">
                <Button variant="outline" className="flex-1 rounded-full" onClick={() => setStep("amount")}>
                  {t("walletTransfer.change")}
                </Button>
                <Button
                  className="flex-1 rounded-full"
                  disabled={!!user.flexCardBlocked || !preview.canTransfer || submitting}
                  onClick={handleSubmit}
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <>
                    <Send className="h-4 w-4 mr-1.5" /> {t("walletTransfer.send", { amount: parseFloat(amount).toFixed(2) })}
                  </>}
                </Button>
              </div>
            </div>
          ) : (
            <Button onClick={() => loadPreview(amount)} className="w-full rounded-full">
              {t("walletTransfer.calculateFee")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
