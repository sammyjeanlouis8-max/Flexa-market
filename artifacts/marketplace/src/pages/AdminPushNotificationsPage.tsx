/**
 * AdminPushNotificationsPage — Push Notifications (APNs)
 * Route: /admin/push-notifications
 * Super-admin only — view registered token counts and send a test push.
 */
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft, Bell, Smartphone, Users, Send, Loader2,
  AlertTriangle, CheckCircle2, RefreshCw,
} from "lucide-react";

interface TokenCounts { total: number; apns: number; expo: number }
interface PushResult  { ok: boolean; error?: string | null; gone?: boolean }
interface ManualRecipient { id: number; name: string; deviceCount: number }
interface ManualPushResult {
  ok: boolean;
  targetedUsers: number;
  acceptedUsers: number;
  acceptedDevices: number;
  failedDevices: number;
  skippedUsers: number;
  inAppStored: number;
  note: string;
}

export default function AdminPushNotificationsPage() {
  const [, nav]   = useLocation();
  const { token } = useAuth();
  const { toast } = useToast();
  const BASE       = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
  const authHeader = token ? `Bearer ${token}` : "";

  const [counts,     setCounts]     = useState<TokenCounts | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [testToken,  setTestToken]  = useState("");
  const [sending,    setSending]    = useState(false);
  const [result,     setResult]     = useState<PushResult | null>(null);
  const [audience, setAudience] = useState<"all" | "user">("all");
  const [manualTitle, setManualTitle] = useState("");
  const [manualMessage, setManualMessage] = useState("");
  const [manualUrl, setManualUrl] = useState("/");
  const [recipientSearch, setRecipientSearch] = useState("");
  const [recipients, setRecipients] = useState<ManualRecipient[]>([]);
  const [selectedRecipient, setSelectedRecipient] = useState<ManualRecipient | null>(null);
  const [totalEligibleUsers, setTotalEligibleUsers] = useState(0);
  const [recipientLoading, setRecipientLoading] = useState(false);
  const [manualSending, setManualSending] = useState(false);
  const [manualResult, setManualResult] = useState<ManualPushResult | null>(null);

  const fetchCounts = () => {
    setLoading(true);
    fetch(`${BASE}/api/push/tokens`, { headers: { Authorization: authHeader } })
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setCounts(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchCounts(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (audience !== "user") return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setRecipientLoading(true);
      try {
        const params = new URLSearchParams();
        if (recipientSearch.trim()) params.set("q", recipientSearch.trim());
        const response = await fetch(`${BASE}/api/push/manual-recipients?${params}`, {
          headers: { Authorization: authHeader },
          signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Pa ka chaje itilizatè yo");
        setRecipients(data.recipients ?? []);
        setTotalEligibleUsers(data.totalEligibleUsers ?? 0);
      } catch (error: any) {
        if (error.name !== "AbortError") {
          setRecipients([]);
          toast({ title: error.message, variant: "destructive" });
        }
      } finally {
        setRecipientLoading(false);
      }
    }, 300);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [audience, recipientSearch, BASE, authHeader, toast]);

  const sendManualPush = async () => {
    if (!manualTitle.trim() || !manualMessage.trim()) return;
    if (audience === "user" && !selectedRecipient) {
      toast({ title: "Chwazi yon itilizatè", variant: "destructive" });
      return;
    }
    const targetLabel = audience === "all"
      ? `tout ${totalEligibleUsers || counts?.total || 0} itilizatè ki gen push aktif`
      : selectedRecipient!.name;
    if (!window.confirm(`Voye notifikasyon sa a bay ${targetLabel}?`)) return;

    setManualSending(true);
    setManualResult(null);
    try {
      const response = await fetch(`${BASE}/api/push/manual-send`, {
        method: "POST",
        headers: { Authorization: authHeader, "Content-Type": "application/json" },
        body: JSON.stringify({
          audience,
          userId: audience === "user" ? selectedRecipient!.id : undefined,
          title: manualTitle.trim(),
          message: manualMessage.trim(),
          url: manualUrl.trim() || "/",
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Notifikasyon an pa t ka voye");
      setManualResult(data);
      toast({
        title: data.ok ? "Notifikasyon an aksepte" : "Voye a fini ak kèk erè",
        description: `${data.acceptedDevices} aparèy aksepte mesaj la.`,
      });
    } catch (error: any) {
      toast({ title: error.message, variant: "destructive" });
    } finally {
      setManualSending(false);
    }
  };

  const sendTest = async () => {
    if (!/^[0-9a-f]{32,}$/i.test(testToken.trim())) {
      toast({ title: "Token APNs envalid — 32+ karaktè hex", variant: "destructive" }); return;
    }
    setSending(true); setResult(null);
    try {
      const r = await fetch(`${BASE}/api/push/test-apns`, {
        method: "POST",
        headers: { Authorization: authHeader, "Content-Type": "application/json" },
        body: JSON.stringify({ token: testToken.trim() }),
      });
      const d = await r.json();
      setResult(d);
      if (d.ok) toast({ title: "✅ Notifikasyon voye!" });
      else      toast({ title: `❌ Echèk: ${d.error ?? "erè enkoni"}`, variant: "destructive" });
    } catch (e: any) {
      toast({ title: `Erè rezo: ${e.message}`, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-4 py-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => nav("/admin")}
          className="h-9 w-9 flex items-center justify-center rounded-xl hover:bg-accent transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center">
            <Bell className="h-4 w-4 text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold leading-tight">Push Notifications iOS</h1>
            <p className="text-xs text-muted-foreground">Tokens APNs — Estatistik ak tès</p>
          </div>
        </div>
      </div>

      <div className="px-4 py-5 space-y-5 max-w-lg mx-auto">

        {/* Token counts card */}
        <div className="rounded-2xl border border-border bg-card shadow-sm p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Tokens anrejistre</h2>
            <button
              onClick={fetchCounts}
              disabled={loading}
              className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-accent transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col items-center gap-1 bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3">
              <Smartphone className="h-5 w-5 text-blue-500" />
              <span className="text-xl font-bold text-blue-700 dark:text-blue-300">
                {loading ? "…" : (counts?.apns ?? 0)}
              </span>
              <span className="text-xs text-blue-600 dark:text-blue-400 text-center">APNs iOS</span>
            </div>
            <div className="flex flex-col items-center gap-1 bg-green-50 dark:bg-green-900/20 rounded-xl p-3">
              <Smartphone className="h-5 w-5 text-green-500" />
              <span className="text-xl font-bold text-green-700 dark:text-green-300">
                {loading ? "…" : (counts?.expo ?? 0)}
              </span>
              <span className="text-xs text-green-600 dark:text-green-400 text-center">Expo</span>
            </div>
            <div className="flex flex-col items-center gap-1 bg-slate-50 dark:bg-slate-800 rounded-xl p-3">
              <Users className="h-5 w-5 text-slate-500" />
              <span className="text-xl font-bold text-slate-700 dark:text-slate-300">
                {loading ? "…" : (counts?.total ?? 0)}
              </span>
              <span className="text-xs text-slate-500 text-center">Total</span>
            </div>
          </div>

          {!loading && counts?.apns === 0 && (
            <div className="flex items-start gap-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-sm text-amber-700 dark:text-amber-300 space-y-1">
                <p className="font-semibold">Pa gen token APNs ankò</p>
                <p className="text-xs">Enstale <strong>dènye build</strong> via TestFlight → louvri app la → aksepte notifikasyon → konekte.</p>
              </div>
            </div>
          )}

          {!loading && (counts?.apns ?? 0) > 0 && (
            <div className="flex items-center gap-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl px-4 py-3 text-sm text-green-700 dark:text-green-300">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>{counts!.apns} aparèy iOS anrejistre — sistèm push aktif ✅</span>
            </div>
          )}
        </div>

        {/* Manual push campaign */}
        <div className="rounded-2xl border border-blue-200 dark:border-blue-800 bg-card shadow-sm p-5 space-y-5">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Voye notifikasyon manyèl</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Voye yon mesaj bay tout aparèy aktif oswa yon itilizatè presi. Token yo rete kache sou sèvè a.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => { setAudience("all"); setSelectedRecipient(null); }}
              className={`rounded-xl border px-3 py-3 text-left transition-colors ${
                audience === "all"
                  ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30"
                  : "border-border hover:bg-accent"
              }`}
              data-testid="button-push-audience-all"
            >
              <span className="block text-sm font-semibold">Tout itilizatè</span>
              <span className="block text-xs text-muted-foreground mt-0.5">Tout moun ki gen push aktif</span>
            </button>
            <button
              type="button"
              onClick={() => setAudience("user")}
              className={`rounded-xl border px-3 py-3 text-left transition-colors ${
                audience === "user"
                  ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30"
                  : "border-border hover:bg-accent"
              }`}
              data-testid="button-push-audience-user"
            >
              <span className="block text-sm font-semibold">Yon itilizatè</span>
              <span className="block text-xs text-muted-foreground mt-0.5">Chèche pa non oswa ID</span>
            </button>
          </div>

          {audience === "user" && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground uppercase tracking-wide">Chwazi itilizatè</Label>
              {selectedRecipient ? (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-blue-300 bg-blue-50 dark:bg-blue-950/30 px-3 py-2.5">
                  <div>
                    <p className="text-sm font-semibold">{selectedRecipient.name}</p>
                    <p className="text-xs text-muted-foreground">
                      ID #{selectedRecipient.id} · {selectedRecipient.deviceCount} aparèy
                    </p>
                  </div>
                  <Button type="button" size="sm" variant="outline" onClick={() => setSelectedRecipient(null)}>
                    Chanje
                  </Button>
                </div>
              ) : (
                <>
                  <Input
                    value={recipientSearch}
                    onChange={(event) => setRecipientSearch(event.target.value)}
                    placeholder="Ekri non oswa ID itilizatè a"
                    data-testid="input-push-recipient-search"
                  />
                  <div className="max-h-48 overflow-y-auto rounded-xl border divide-y">
                    {recipientLoading ? (
                      <div className="p-4 text-xs text-muted-foreground flex items-center gap-2">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Ap chèche…
                      </div>
                    ) : recipients.length === 0 ? (
                      <div className="p-4 text-xs text-muted-foreground">Pa jwenn itilizatè ki gen push aktif.</div>
                    ) : recipients.map((recipient) => (
                      <button
                        key={recipient.id}
                        type="button"
                        onClick={() => setSelectedRecipient(recipient)}
                        className="w-full px-3 py-2.5 text-left hover:bg-accent transition-colors"
                        data-testid={`button-push-recipient-${recipient.id}`}
                      >
                        <span className="block text-sm font-medium">{recipient.name}</span>
                        <span className="block text-xs text-muted-foreground">
                          ID #{recipient.id} · {recipient.deviceCount} aparèy
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground uppercase tracking-wide">Tit</Label>
              <span className="text-[11px] text-muted-foreground">{manualTitle.length}/80</span>
            </div>
            <Input
              value={manualTitle}
              onChange={(event) => setManualTitle(event.target.value.slice(0, 80))}
              placeholder="Egzanp: Nouvo pwodwi sou Flexa Market"
              data-testid="input-manual-push-title"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground uppercase tracking-wide">Mesaj</Label>
              <span className="text-[11px] text-muted-foreground">{manualMessage.length}/240</span>
            </div>
            <Textarea
              value={manualMessage}
              onChange={(event) => setManualMessage(event.target.value.slice(0, 240))}
              placeholder="Ekri mesaj ki pral parèt sou telefòn itilizatè yo"
              rows={4}
              data-testid="input-manual-push-message"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase tracking-wide">Paj pou ouvri</Label>
            <Input
              value={manualUrl}
              onChange={(event) => setManualUrl(event.target.value)}
              placeholder="/ oswa /search"
              data-testid="input-manual-push-url"
            />
            <p className="text-[11px] text-muted-foreground">Dwe kòmanse ak / epi rete andedan Flexa Market.</p>
          </div>

          <Button
            onClick={sendManualPush}
            disabled={manualSending || !manualTitle.trim() || !manualMessage.trim() || (audience === "user" && !selectedRecipient)}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white"
            data-testid="button-send-manual-push"
          >
            {manualSending
              ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Ap voye…</>
              : <><Send className="h-4 w-4 mr-2" /> Voye notifikasyon</>}
          </Button>

          {manualResult && (
            <div className={`rounded-xl border px-4 py-3 text-sm ${
              manualResult.failedDevices === 0
                ? "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800 text-green-800 dark:text-green-300"
                : "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300"
            }`}>
              <p className="font-semibold">{manualResult.acceptedDevices} aparèy pou {manualResult.acceptedUsers} itilizatè aksepte mesaj la.</p>
              <p className="text-xs mt-1">{manualResult.inAppStored} kopi anrejistre nan sant notifikasyon an.</p>
              {manualResult.failedDevices > 0 && (
                <p className="text-xs mt-1">{manualResult.failedDevices} aparèy echwe.</p>
              )}
              {manualResult.skippedUsers > 0 && (
                <p className="text-xs mt-1">{manualResult.skippedUsers} itilizatè te dezaktive push.</p>
              )}
              <p className="text-[11px] opacity-80 mt-2">{manualResult.note}</p>
            </div>
          )}
        </div>

        {/* Test a single token */}
        <div className="rounded-2xl border border-border bg-card shadow-sm p-5 space-y-4">
          <h2 className="text-sm font-semibold text-foreground">Teste yon token espesifik</h2>
          <p className="text-xs text-muted-foreground">
            Kole token APNs brut (64 karaktè hex) epi voye yon notifikasyon tès dirèkteman sou telefòn nan.
          </p>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase tracking-wide">Token APNs (hex)</Label>
            <Input
              placeholder="a1b2c3d4e5f6… (64 karaktè)"
              value={testToken}
              onChange={e => setTestToken(e.target.value)}
              className="font-mono text-xs"
            />
          </div>

          <Button
            onClick={sendTest}
            disabled={sending || !testToken.trim()}
            className="w-full bg-orange-500 hover:bg-orange-600 text-white"
          >
            {sending
              ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Ap voye…</>
              : <><Send className="h-4 w-4 mr-2" /> Voye notifikasyon tès</>}
          </Button>

          {result && (
            <div className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm border ${
              result.ok
                ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300"
                : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300"
            }`}>
              {result.ok
                ? <><CheckCircle2 className="h-4 w-4 shrink-0" /> Notifikasyon reyisi voye ✅</>
                : <><AlertTriangle className="h-4 w-4 shrink-0" />
                    {result.gone
                      ? "Token ekspire — aparèy la dezinstalé app la"
                      : `Echèk: ${result.error}`}
                  </>}
            </div>
          )}
        </div>

        {/* Info box */}
        <div className="rounded-2xl border border-dashed border-orange-200 dark:border-orange-800 bg-orange-50/50 dark:bg-orange-950/10 p-4 space-y-2">
          <p className="text-xs font-semibold text-orange-700 dark:text-orange-400">Kijan sa travay?</p>
          <ul className="text-xs text-orange-600 dark:text-orange-400 space-y-1 list-disc list-inside">
            <li>Itilizatè enstale app iOS la → aksepte notifikasyon</li>
            <li>Apple voye yon token APNs (64 karaktè hex) bay app la</li>
            <li>App la voye token nan sèvè Flexa Market</li>
            <li>Kounye a sèvè a ka voye notifikasyon dirèkteman sou iPhone yo</li>
          </ul>
        </div>

      </div>
    </div>
  );
}
