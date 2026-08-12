import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/auth";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  ArrowLeft, Send, Loader2, AlertTriangle, CheckCircle2, Search, Users, Mail, Trash2, Sparkles,
} from "lucide-react";

interface Recipient {
  id: number;
  name: string | null;
  email: string;
  country: string | null;
}

const STARTER_TEMPLATE = `<h2 style="color:#f97316;margin:0 0 12px;font-size:20px;">Bonjou, kominote Flexa Market! 👋</h2>

<p style="margin:0 0 12px;line-height:1.7;">Ekri mesaj prensipal ou la. Ou ka pale de yon nouvo fonksyon, yon pwomo, oswa yon enfòmasyon enpòtan pou tout moun.</p>

<ul style="margin:0 0 16px;padding-left:20px;line-height:2;">
  <li>✅ <strong>Premye pwen enpòtan</strong></li>
  <li>✅ <strong>Dezyèm pwen enpòtan</strong></li>
  <li>✅ <strong>Twazyèm pwen enpòtan</strong></li>
</ul>

<p style="margin:0 0 16px;line-height:1.7;">Pou nenpòt kesyon, kontakte nou nan <a href="mailto:support@flexamarket.com" style="color:#f97316;">support@flexamarket.com</a>.</p>

<p style="margin:0;color:#64748b;font-size:13px;">Mèsi pou konfyans ou,<br/><strong>Ekip Flexa Market</strong></p>`;

const QUICK_VARS = [
  { label: "Bold",       tag: () => `<strong>{{}}</strong>` },
  { label: "Koulè wouj", tag: () => `<span style="color:#e53e3e">{{}}</span>` },
  { label: "Lyen",       tag: () => `<a href="https://flexamarket.com" style="color:#f97316">Klike la</a>` },
  { label: "Separatè",   tag: () => `<hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0">` },
];

export default function AdminBroadcastPage() {
  const [, nav]      = useLocation();
  const { token }    = useAuth();
  const { toast }    = useToast();
  const { t }        = useTranslation();
  const BASE         = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

  const authHeader = token ? `Bearer ${token}` : "";

  const [subject,     setSubject]     = useState("");
  const [htmlBody,    setHtmlBody]    = useState("");
  const [testEmail,   setTestEmail]   = useState("");
  const [sending,     setSending]     = useState<"idle" | "test" | "broadcast">("idle");
  const [result,      setResult]      = useState<{ mode: string; sent: number; total?: number } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Recipients
  const [recipients,        setRecipients]        = useState<Recipient[]>([]);
  const [loadingRecipients, setLoadingRecipients] = useState(true);
  const [search,            setSearch]            = useState("");
  const [selected,          setSelected]          = useState<Set<number>>(new Set());
  const [countryFilter,     setCountryFilter]     = useState<string>("");

  useEffect(() => {
    setLoadingRecipients(true);
    fetch(`${BASE}/api/admin/broadcast-recipients`, {
      headers: { Authorization: authHeader },
    })
      .then(r => r.json())
      .then(d => {
        const list: Recipient[] = d.users ?? [];
        setRecipients(list);
        setSelected(new Set(list.map(u => u.id)));
      })
      .catch(() => toast({ title: t("broadcastPage.loadError"), variant: "destructive" }))
      .finally(() => setLoadingRecipients(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const countries = useMemo(() => {
    const set = new Set(recipients.map(u => u.country).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [recipients]);

  const filtered = useMemo(() => recipients.filter(u => {
    if (countryFilter && u.country !== countryFilter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (u.name ?? "").toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
  }), [recipients, countryFilter, search]);

  const allFilteredSelected = filtered.length > 0 && filtered.every(u => selected.has(u.id));

  const toggleSelectAll = () => {
    const next = new Set(selected);
    if (allFilteredSelected) {
      filtered.forEach(u => next.delete(u.id));
    } else {
      filtered.forEach(u => next.add(u.id));
    }
    setSelected(next);
  };

  const toggleOne = (id: number) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  const insertAt = (rawTag: string) => {
    const ta = document.getElementById("bc-body") as HTMLTextAreaElement | null;
    const sel = ta ? htmlBody.slice(ta.selectionStart, ta.selectionEnd) || "tèks" : "tèks";
    const insert = rawTag.includes("{{}}") ? rawTag.replace("{{}}", sel) : rawTag;
    if (!ta) { setHtmlBody(prev => prev + insert); return; }
    const s = ta.selectionStart;
    setHtmlBody(htmlBody.slice(0, s) + insert + htmlBody.slice(ta.selectionEnd));
    setTimeout(() => { ta.selectionStart = ta.selectionEnd = s + insert.length; ta.focus(); }, 0);
  };

  const resetForm = () => {
    setSubject("");
    setHtmlBody("");
    setTestEmail("");
    setResult(null);
  };

  const send = async (mode: "test" | "broadcast") => {
    if (!subject.trim() || !htmlBody.trim()) {
      toast({ title: t("broadcastPage.fillBoth"), variant: "destructive" }); return;
    }
    if (mode === "test" && !testEmail.trim()) {
      toast({ title: t("broadcastPage.enterTestEmail"), variant: "destructive" }); return;
    }
    if (mode === "broadcast" && selected.size === 0) {
      toast({ title: t("broadcastPage.noRecipients"), variant: "destructive" }); return;
    }
    setSending(mode);
    setResult(null);
    try {
      const body: Record<string, unknown> = { subject, htmlBody };
      if (mode === "test")      body.testEmail    = testEmail.trim();
      if (mode === "broadcast") body.recipientIds = [...selected];
      const r = await fetch(`${BASE}/api/admin/broadcast-email`, {
        method: "POST",
        headers: { Authorization: authHeader, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Erè");
      setResult(d);
      toast({
        title: mode === "test"
          ? "✅ Tès voye!"
          : `✅ ${d.sent} / ${d.total} email voye!`,
      });
      // Clear the compose form after a successful broadcast (not after test)
      if (mode === "broadcast") {
        setSubject("");
        setHtmlBody("");
        setTestEmail("");
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erè";
      toast({ title: msg, variant: "destructive" });
    } finally {
      setSending("idle");
      setConfirmOpen(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* ── Sticky header ── */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => nav("/admin")}
          className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-muted transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="h-8 w-8 rounded-lg bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center shrink-0">
          <Send className="h-4 w-4 text-rose-600 dark:text-rose-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="font-bold text-sm text-foreground">{t("broadcastPage.title")}</h1>
          <p className="text-[11px] text-muted-foreground truncate">{t("broadcastPage.subtitle")}</p>
        </div>
        {/* Clear button — visible only when there's content */}
        {(subject || htmlBody) && (
          <button
            onClick={resetForm}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors px-2 py-1 rounded-lg hover:bg-muted"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {t("broadcastPage.clear")}
          </button>
        )}
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-5 space-y-5">
        {/* Warning */}
        <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3 text-xs text-amber-800 dark:text-amber-300">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{t("broadcastPage.warning")}</span>
        </div>

        {/* Subject */}
        <div className="space-y-1.5">
          <Label className="text-sm font-semibold">{t("broadcastPage.subject")}</Label>
          <Input
            value={subject}
            onChange={e => setSubject(e.target.value)}
            placeholder={t("broadcastPage.subjectPlaceholder")}
            className="h-10"
          />
        </div>

        {/* HTML Body */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-semibold">{t("broadcastPage.body")}</Label>
            <button
              onClick={() => setHtmlBody(STARTER_TEMPLATE)}
              className="flex items-center gap-1 text-[11px] font-semibold text-violet-600 dark:text-violet-400 hover:underline"
            >
              <Sparkles className="h-3 w-3" />
              {t("broadcastPage.useTemplate")}
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {QUICK_VARS.map(v => (
              <button
                key={v.label}
                onClick={() => insertAt(v.tag())}
                className="text-[10px] font-medium bg-muted hover:bg-muted/80 border border-border rounded-md px-2 py-1 transition-colors"
              >
                {v.label}
              </button>
            ))}
          </div>
          <Textarea
            id="bc-body"
            value={htmlBody}
            onChange={e => setHtmlBody(e.target.value)}
            placeholder={`<p><strong>Bonjou!</strong></p>\n<p>Nou gen yon bèl nouvèl pou ou...</p>`}
            className="font-mono text-xs min-h-[180px] resize-y"
          />
          <p className="text-[10px] text-muted-foreground">
            HTML valab: &lt;p&gt;, &lt;strong&gt;, &lt;a href="..."&gt;, &lt;ul&gt;&lt;li&gt;
          </p>
        </div>

        {/* Live preview */}
        {htmlBody.trim() && (
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold">{t("broadcastPage.preview")}</Label>
            <div
              className="border border-border rounded-xl p-4 bg-white dark:bg-zinc-900 text-sm prose prose-sm dark:prose-invert max-w-none"
              dangerouslySetInnerHTML={{ __html: htmlBody }}
            />
          </div>
        )}

        {/* Test email */}
        <div className="space-y-1.5">
          <Label className="text-sm font-semibold">{t("broadcastPage.testEmail")}</Label>
          <div className="flex gap-2">
            <Input
              value={testEmail}
              onChange={e => setTestEmail(e.target.value)}
              placeholder="admin@example.com"
              type="email"
              className="h-9"
            />
            <Button
              variant="outline" size="sm"
              className="h-9 px-4 shrink-0"
              onClick={() => send("test")}
              disabled={sending !== "idle"}
            >
              {sending === "test"
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Send className="h-4 w-4 mr-1.5" />}
              {t("broadcastPage.sendTest")}
            </Button>
          </div>
        </div>

        {/* Country filter */}
        {countries.length > 1 && (
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold">{t("broadcastPage.countryFilter")}</Label>
            <div className="flex flex-wrap gap-1.5">
              {["", ...countries].map(c => {
                const FLAG: Record<string, string> = { HT: "🇭🇹", DO: "🇩🇴", US: "🇺🇸", CA: "🇨🇦", FR: "🇫🇷" };
                return (
                  <button
                    key={c || "all"}
                    onClick={() => setCountryFilter(c)}
                    className={`text-[11px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap transition-colors ${
                      countryFilter === c
                        ? "bg-rose-600 text-white"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    }`}
                  >
                    {c ? `${FLAG[c] ?? "🌍"} ${c}` : t("broadcastPage.allCountries")}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Recipients list */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-semibold flex items-center gap-1.5">
              <Users className="h-4 w-4" />
              {t("broadcastPage.recipients")}
              {!loadingRecipients && (
                <span className="text-xs font-normal text-muted-foreground ml-1">
                  ({selected.size} / {recipients.length} {t("broadcastPage.selected")})
                </span>
              )}
            </Label>
            <button
              onClick={toggleSelectAll}
              className="text-xs font-semibold text-rose-600 dark:text-rose-400 hover:underline"
            >
              {allFilteredSelected ? t("broadcastPage.deselectAll") : t("broadcastPage.selectAll")}
            </button>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t("broadcastPage.searchPlaceholder")}
              className="h-9 pl-8 text-sm"
            />
          </div>

          <div className="border border-border rounded-xl overflow-hidden max-h-72 overflow-y-auto">
            {loadingRecipients ? (
              <div className="flex items-center justify-center h-20 gap-2 text-muted-foreground text-sm">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("broadcastPage.loading")}
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex items-center justify-center h-16 text-muted-foreground text-sm">
                {t("broadcastPage.noResults")}
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
                        <Mail className="h-3 w-3 shrink-0" />
                        {u.email}
                      </p>
                    </div>
                    {u.country && (
                      <span className="text-[11px] text-muted-foreground shrink-0">
                        {u.country === "HT" ? "🇭🇹" : u.country === "DO" ? "🇩🇴" : u.country}
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
            <strong className="text-foreground">{selected.size}</strong> {t("broadcastPage.recipientsWillGet")}
          </p>
          <Button
            className="bg-rose-600 hover:bg-rose-700 text-white h-9 px-5"
            onClick={() => setConfirmOpen(true)}
            disabled={sending !== "idle" || !subject.trim() || !htmlBody.trim() || selected.size === 0}
          >
            {sending === "broadcast"
              ? <Loader2 className="h-4 w-4 animate-spin mr-2" />
              : <Send className="h-4 w-4 mr-2" />}
            {t("broadcastPage.sendToSelected")} ({selected.size})
          </Button>
        </div>

        {/* Result chip */}
        {result && (
          <div className="flex items-center gap-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl px-4 py-3 text-sm text-green-700 dark:text-green-300">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {result.mode === "test"
              ? t("broadcastPage.testSent")
              : t("broadcastPage.broadcastSent", { sent: result.sent, total: result.total })}
          </div>
        )}
      </div>

      {/* Confirm dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base text-rose-600 dark:text-rose-400">
              <AlertTriangle className="h-5 w-5" />
              {t("broadcastPage.confirmTitle")}
            </DialogTitle>
          </DialogHeader>
          <div className="text-sm text-muted-foreground space-y-2 py-2">
            <p
              dangerouslySetInnerHTML={{
                __html: t("broadcastPage.confirmDesc", { count: `<strong class="text-foreground">${selected.size}</strong>` }),
              }}
            />
            <p className="font-medium text-foreground">
              {t("broadcastPage.subject")}: <span className="font-normal text-muted-foreground">{subject}</span>
            </p>
            <p className="text-amber-600 dark:text-amber-400 text-xs font-medium">
              ⚠️ {t("broadcastPage.irreversible")}
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              {t("broadcastPage.cancel")}
            </Button>
            <Button
              className="bg-rose-600 hover:bg-rose-700 text-white"
              onClick={() => send("broadcast")}
              disabled={sending !== "idle"}
            >
              {sending === "broadcast" && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {t("broadcastPage.confirmSend")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
