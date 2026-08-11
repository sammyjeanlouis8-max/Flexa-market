/**
 * AdminSmsBroadcastPage — SMS Broadcast
 * Route: /admin/broadcast-sms
 * Super-admin only. Send bulk SMS via Twilio with country filter + individual selection.
 */
import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  ArrowLeft, Send, Loader2, AlertTriangle, CheckCircle2,
  Search, Users, MessageSquare, Trash2, Phone, XCircle,
} from "lucide-react";

interface Recipient {
  id: number;
  name: string | null;
  phone: string;
  country: string | null;
}

const COUNTRY_FLAGS: Record<string, string> = { HT: "🇭🇹", DO: "🇩🇴", US: "🇺🇸", CA: "🇨🇦", FR: "🇫🇷" };
const MAX_CHARS = 1600;

export default function AdminSmsBroadcastPage() {
  const [, nav]      = useLocation();
  const { token }    = useAuth();
  const { toast }    = useToast();
  const { t }        = useTranslation();
  const BASE         = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
  const authHeader   = token ? `Bearer ${token}` : "";

  const [message,     setMessage]     = useState("");
  const [testPhone,   setTestPhone]   = useState("");
  const [sending,     setSending]     = useState<"idle" | "test" | "broadcast">("idle");
  const [result,      setResult]      = useState<{ mode: string; sent: number; failed?: number; total?: number; firstError?: string } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [twilioOk,    setTwilioOk]    = useState<boolean | null>(null);

  // Recipients
  const [recipients,        setRecipients]        = useState<Recipient[]>([]);
  const [loadingRecipients, setLoadingRecipients] = useState(true);
  const [search,            setSearch]            = useState("");
  const [selected,          setSelected]          = useState<Set<number>>(new Set());
  const [countryFilter,     setCountryFilter]     = useState<string>("");

  const loadRecipients = (country = countryFilter) => {
    setLoadingRecipients(true);
    const qs = country ? `?country=${country}` : "";
    fetch(`${BASE}/api/admin/broadcast-sms-recipients${qs}`, {
      headers: { Authorization: authHeader },
    })
      .then(r => r.json())
      .then(d => {
        const list: Recipient[] = d.users ?? [];
        setRecipients(list);
        setSelected(new Set(list.map(u => u.id)));
        setTwilioOk(d.twilioConfigured ?? false);
      })
      .catch(() => toast({ title: t("smsBroadcastPage.noPhone"), variant: "destructive" }))
      .finally(() => setLoadingRecipients(false));
  };

  useEffect(() => { loadRecipients(); }, []);

  const handleCountryFilter = (c: string) => {
    setCountryFilter(c);
    loadRecipients(c);
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return recipients;
    const q = search.toLowerCase();
    return recipients.filter(u =>
      (u.name ?? "").toLowerCase().includes(q) || u.phone.includes(q)
    );
  }, [recipients, search]);

  const countries = useMemo(() => {
    const set = new Set(recipients.map(u => u.country).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [recipients]);

  const allFilteredSelected = filtered.length > 0 && filtered.every(u => selected.has(u.id));

  const toggleAll = () => {
    const next = new Set(selected);
    if (allFilteredSelected) { filtered.forEach(u => next.delete(u.id)); }
    else                      { filtered.forEach(u => next.add(u.id)); }
    setSelected(next);
  };

  const toggleOne = (id: number) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const resetForm = () => { setMessage(""); setTestPhone(""); setResult(null); };

  const send = async (mode: "test" | "broadcast") => {
    if (!message.trim()) {
      toast({ title: t("smsBroadcastPage.noMessage"), variant: "destructive" }); return;
    }
    if (mode === "test" && !testPhone.trim()) {
      toast({ title: t("smsBroadcastPage.noTestPhone"), variant: "destructive" }); return;
    }
    if (mode === "broadcast" && selected.size === 0) {
      toast({ title: t("smsBroadcastPage.noRecipients"), variant: "destructive" }); return;
    }
    setSending(mode); setResult(null);
    try {
      const body: Record<string, unknown> = { message };
      if (mode === "test")      body.testPhone    = testPhone.trim();
      if (mode === "broadcast") body.recipientIds = [...selected];
      const r = await fetch(`${BASE}/api/admin/broadcast-sms`, {
        method: "POST",
        headers: { Authorization: authHeader, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Erè");
      setResult(d);
      if (mode === "test") {
        toast({ title: t("smsBroadcastPage.testSent") });
      } else {
        const msg = d.failed
          ? t("smsBroadcastPage.broadcastSentFailed", { sent: d.sent, total: d.total, failed: d.failed })
          : t("smsBroadcastPage.broadcastSent", { sent: d.sent, total: d.total });
        toast({ title: msg });
        setMessage(""); setTestPhone("");
      }
    } catch (e: unknown) {
      toast({ title: e instanceof Error ? e.message : "Erè envwaye SMS", variant: "destructive" });
    } finally {
      setSending("idle"); setConfirmOpen(false);
    }
  };

  const charCount = message.length;
  const smsCount  = Math.ceil(charCount / 160) || 1;

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* ── Header ── */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => nav("/admin")}
          className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-muted transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="h-8 w-8 rounded-lg bg-sky-100 dark:bg-sky-900/30 flex items-center justify-center shrink-0">
          <MessageSquare className="h-4 w-4 text-sky-600 dark:text-sky-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="font-bold text-sm">📱 {t("smsBroadcastPage.title")}</h1>
          <p className="text-[11px] text-muted-foreground truncate">{t("smsBroadcastPage.subtitle")}</p>
        </div>
        {message && (
          <button
            onClick={resetForm}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors px-2 py-1 rounded-lg hover:bg-muted"
          >
            <Trash2 className="h-3.5 w-3.5" /> {t("smsBroadcastPage.clear")}
          </button>
        )}
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-5 space-y-5">

        {/* Twilio status */}
        {twilioOk === false && (
          <div className="flex items-start gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3 text-xs text-red-700 dark:text-red-300">
            <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{t("smsBroadcastPage.twilioNotConfigured")}</span>
          </div>
        )}

        {/* Warning */}
        <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3 text-xs text-amber-800 dark:text-amber-300">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{t("smsBroadcastPage.warning")}</span>
        </div>

        {/* Message composer */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-semibold">{t("smsBroadcastPage.message")}</Label>
            <span className={`text-[10px] font-mono ${charCount > MAX_CHARS ? "text-red-500" : "text-muted-foreground"}`}>
              {t("smsBroadcastPage.charCount", { count: charCount, sms: smsCount })}
            </span>
          </div>
          <Textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder="Bonjou! Flexa Market gen yon nouvèl pou ou. Vizite flexamarket.com pou plis enfòmasyon."
            className="min-h-[120px] resize-y text-sm"
            maxLength={MAX_CHARS}
          />
          <p className="text-[10px] text-muted-foreground">{t("smsBroadcastPage.textOnly")}</p>
        </div>

        {/* Test SMS */}
        <div className="space-y-1.5">
          <Label className="text-sm font-semibold">{t("smsBroadcastPage.testSms")}</Label>
          <div className="flex gap-2">
            <Input
              value={testPhone}
              onChange={e => setTestPhone(e.target.value)}
              placeholder={t("smsBroadcastPage.testPlaceholder")}
              type="tel"
              className="h-9"
            />
            <Button
              variant="outline" size="sm"
              className="h-9 px-4 shrink-0"
              onClick={() => send("test")}
              disabled={sending !== "idle" || !message.trim()}
            >
              {sending === "test"
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Send className="h-4 w-4 mr-1.5" />}
              {t("smsBroadcastPage.sendTest")}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground">{t("smsBroadcastPage.testHint")}</p>
        </div>

        {/* Country filter */}
        <div className="space-y-1.5">
          <Label className="text-sm font-semibold">{t("smsBroadcastPage.countryFilter")}</Label>
          <div className="flex flex-wrap gap-1.5">
            {["", ...countries].map(c => (
              <button
                key={c || "all"}
                onClick={() => handleCountryFilter(c)}
                className={`text-[11px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap transition-colors ${
                  countryFilter === c
                    ? "bg-sky-600 text-white"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {c ? `${COUNTRY_FLAGS[c] ?? "🌍"} ${c}` : t("smsBroadcastPage.allCountries")}
              </button>
            ))}
          </div>
        </div>

        {/* Recipients */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-semibold flex items-center gap-1.5">
              <Users className="h-4 w-4" />
              {t("smsBroadcastPage.recipients")}
              {!loadingRecipients && (
                <span className="text-xs font-normal text-muted-foreground ml-1">
                  ({t("smsBroadcastPage.selectedCount", { selected: selected.size, total: recipients.length })})
                </span>
              )}
            </Label>
            <button
              onClick={toggleAll}
              className="text-xs font-semibold text-sky-600 dark:text-sky-400 hover:underline"
            >
              {allFilteredSelected ? t("smsBroadcastPage.deselectAll") : t("smsBroadcastPage.selectAll")}
            </button>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t("smsBroadcastPage.searchPlaceholder")}
              className="h-9 pl-8 text-sm"
            />
          </div>

          <div className="border border-border rounded-xl overflow-hidden max-h-72 overflow-y-auto">
            {loadingRecipients ? (
              <div className="flex items-center justify-center h-20 gap-2 text-muted-foreground text-sm">
                <Loader2 className="h-4 w-4 animate-spin" /> {t("smsBroadcastPage.loading")}
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-20 gap-1 text-muted-foreground text-sm">
                <Phone className="h-5 w-5 opacity-40" />
                {countryFilter
                  ? t("smsBroadcastPage.noPhoneCountry", { country: countryFilter })
                  : t("smsBroadcastPage.noPhone")}
              </div>
            ) : (
              <div className="divide-y divide-border">
                {filtered.map(u => (
                  <label
                    key={u.id}
                    className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50 cursor-pointer transition-colors"
                  >
                    <Checkbox
                      checked={selected.has(u.id)}
                      onCheckedChange={() => toggleOne(u.id)}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-foreground truncate">{u.name ?? "—"}</p>
                      <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1">
                        <Phone className="h-3 w-3 shrink-0" />
                        {u.phone}
                      </p>
                    </div>
                    {u.country && (
                      <span className="text-[11px] text-muted-foreground shrink-0">
                        {COUNTRY_FLAGS[u.country] ?? "🌍"} {u.country}
                      </span>
                    )}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Send row */}
        <div className="flex items-center justify-between pt-2 border-t border-border">
          <p className="text-xs text-muted-foreground">
            {t("smsBroadcastPage.willReceive", { count: selected.size })}
          </p>
          <Button
            className="bg-sky-600 hover:bg-sky-700 text-white h-9 px-5"
            onClick={() => setConfirmOpen(true)}
            disabled={sending !== "idle" || !message.trim() || selected.size === 0 || twilioOk === false}
          >
            {sending === "broadcast"
              ? <Loader2 className="h-4 w-4 animate-spin mr-2" />
              : <Send className="h-4 w-4 mr-2" />}
            {t("smsBroadcastPage.sendBtn", { count: selected.size })}
          </Button>
        </div>

        {/* Result */}
        {result && (
          <div className={`rounded-xl px-4 py-3 text-sm border space-y-1.5 ${
            result.sent > 0
              ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300"
              : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300"
          }`}>
            <div className="flex items-center gap-2">
              {result.sent > 0
                ? <CheckCircle2 className="h-4 w-4 shrink-0" />
                : <XCircle className="h-4 w-4 shrink-0" />}
              <span>
                {result.mode === "test"
                  ? t("smsBroadcastPage.testSent")
                  : result.failed
                    ? t("smsBroadcastPage.broadcastSentFailed", { sent: result.sent, total: result.total, failed: result.failed })
                    : t("smsBroadcastPage.broadcastSent", { sent: result.sent, total: result.total })}
              </span>
            </div>
            {result.firstError && (
              <p className="text-xs font-medium pl-6">{result.firstError}</p>
            )}
          </div>
        )}
      </div>

      {/* Confirm dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base text-sky-700 dark:text-sky-400">
              <MessageSquare className="h-5 w-5" />
              {t("smsBroadcastPage.confirmTitle")}
            </DialogTitle>
          </DialogHeader>
          <div className="text-sm text-muted-foreground space-y-3 py-2">
            <p>{t("smsBroadcastPage.confirmTo", { count: selected.size })}</p>
            <div className="bg-muted rounded-lg px-3 py-2 text-xs font-mono text-foreground whitespace-pre-wrap break-words">
              {message}
            </div>
            <p className="text-amber-600 dark:text-amber-400 text-xs font-medium">
              {t("smsBroadcastPage.irreversible")}
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              {t("smsBroadcastPage.cancel")}
            </Button>
            <Button
              className="bg-sky-600 hover:bg-sky-700 text-white"
              onClick={() => send("broadcast")}
              disabled={sending !== "idle"}
            >
              {sending === "broadcast" && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {t("smsBroadcastPage.confirmSend")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
