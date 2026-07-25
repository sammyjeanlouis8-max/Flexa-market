import { useState, useEffect } from "react";
import { Ban, ShieldAlert, ShieldCheck, CreditCard } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/auth";
import { useToast } from "@/hooks/use-toast";

type TargetStatus = "active" | "restricted" | "banned";

interface AdminBlockModalProps {
  targetUserId: number;
  targetUserName: string;
  targetStatus?: TargetStatus;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function AdminBlockModal({
  targetUserId,
  targetUserName,
  targetStatus = "active",
  isOpen,
  onClose,
  onSuccess,
}: AdminBlockModalProps) {
  const { token } = useAuth();
  const { toast } = useToast();
  const [reason, setReason] = useState("spam");
  const [banType, setBanType] = useState<"restricted" | "full_ban">("restricted");
  const [duration, setDuration] = useState("7");
  const [loading, setLoading] = useState(false);

  // ── Flex Card debt block (separate from account suspension) ─────────────────
  const [mode, setMode] = useState<"account" | "flexcard">("account");
  const [fcAmount, setFcAmount] = useState("");
  const [fcReason, setFcReason] = useState("debt");
  const [fcDeadline, setFcDeadline] = useState("");
  const [fcNotes, setFcNotes] = useState("");
  const [fcStatus, setFcStatus] = useState<{ blocked: boolean; active: any } | null>(null);

  useEffect(() => {
    if (!isOpen || mode !== "flexcard") return;
    let cancelled = false;
    fetch(`/api/admin/flex-card/${targetUserId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (!cancelled && d) setFcStatus({ blocked: !!d.blocked, active: d.active }); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [isOpen, mode, targetUserId, token]);

  const apiCall = async (path: string, body?: object) => {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.error ?? "Erè entèn");
    }
    return res.json();
  };

  const handleConfirm = async () => {
    setLoading(true);
    try {
      if (banType === "full_ban") {
        await apiCall(`/api/admin/users/${targetUserId}/ban`);
      } else {
        const durationDays = duration === "0" ? null : parseInt(duration, 10);
        await apiCall(`/api/admin/users/${targetUserId}/restrict`, { reason, durationDays });
      }
      toast({ title: "Itilizatè a bloke avèk siksè." });
      onSuccess?.();
      onClose();
    } catch (e: any) {
      toast({ title: e.message ?? "Erè: Pa kapab bloke itilizatè a.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleLift = async () => {
    setLoading(true);
    try {
      const endpoint = targetStatus === "banned" ? "unban" : "unrestrict";
      await apiCall(`/api/admin/users/${targetUserId}/${endpoint}`);
      toast({ title: "Restriksyon retire avèk siksè." });
      onSuccess?.();
      onClose();
    } catch (e: any) {
      toast({ title: e.message ?? "Erè: Pa kapab retire blokaj la.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleFlexBlock = async () => {
    const amt = parseFloat(fcAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast({ title: "Antre yon montan dèt ki valab.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      await apiCall(`/api/admin/flex-card/block`, {
        userId: targetUserId,
        amountUsd: amt,
        reason: fcReason,
        deadline: fcDeadline || null,
        notes: fcNotes || null,
      });
      toast({ title: "Flex Card bloke pou dèt. Kont la rete aktif." });
      onSuccess?.();
      onClose();
    } catch (e: any) {
      toast({ title: e.message ?? "Erè: pa kapab bloke Flex Card la.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleFlexUnblock = async () => {
    setLoading(true);
    try {
      await apiCall(`/api/admin/flex-card/unblock`, { userId: targetUserId });
      toast({ title: "Flex Card debloke avèk siksè." });
      onSuccess?.();
      onClose();
    } catch (e: any) {
      toast({ title: e.message ?? "Erè: pa kapab debloke Flex Card la.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <Ban className="h-5 w-5" />
            Bloke Itilizatè
          </DialogTitle>
        </DialogHeader>

        {/* Current status */}
        <div className="flex items-center gap-2 pb-3 border-b border-border">
          <span className="text-xs text-muted-foreground font-medium">Estati:</span>
          {targetStatus === "banned" ? (
            <Badge variant="destructive" className="text-xs">Banned</Badge>
          ) : targetStatus === "restricted" ? (
            <Badge className="text-xs bg-amber-500 hover:bg-amber-500">Restricted</Badge>
          ) : (
            <Badge variant="secondary" className="text-xs">Active</Badge>
          )}
          <span className="text-sm font-semibold text-foreground truncate">{targetUserName}</span>
        </div>

        {/* Mode switch: account suspension vs Flex Card debt block */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setMode("account")}
            className={`rounded-xl border-2 px-3 py-2 text-xs font-semibold transition-all ${mode === "account" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
          >
            <Ban className="h-4 w-4 mx-auto mb-1" />
            Blokaj Kont
          </button>
          <button
            type="button"
            onClick={() => setMode("flexcard")}
            className={`rounded-xl border-2 px-3 py-2 text-xs font-semibold transition-all ${mode === "flexcard" ? "border-violet-500 bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-400" : "border-border text-muted-foreground hover:text-foreground"}`}
          >
            <CreditCard className="h-4 w-4 mx-auto mb-1" />
            Flex Card (Dèt)
          </button>
        </div>

        {mode === "account" && (<>
        {/* Lift current block option */}
        {(targetStatus === "banned" || targetStatus === "restricted") && (
          <div className="space-y-3">
            <Button
              variant="outline"
              className="w-full text-emerald-600 border-emerald-300 dark:border-emerald-700"
              onClick={handleLift}
              disabled={loading}
            >
              <ShieldCheck className="h-4 w-4 mr-2" />
              {targetStatus === "banned" ? "Retire Ban an" : "Retire Restriksyon an"}
            </Button>
            <div className="relative">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">oswa aplike nouvo aksyon</span>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-4">
          {/* Reason */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Rezon</label>
            <select
              className="mt-1.5 h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              value={reason}
              onChange={e => setReason(e.target.value)}
            >
              <option value="spam">🗑 Spam</option>
              <option value="fraud">💳 Fwòd (Fraud)</option>
              <option value="abuse">⚠️ Abi (Abuse)</option>
              <option value="fake_account">🎭 Fo Kont (Fake account)</option>
            </select>
          </div>

          {/* Ban type */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tip Blokaj</label>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setBanType("restricted")}
                className={`rounded-xl border-2 px-3 py-3 text-xs font-semibold transition-all text-center ${banType === "restricted" ? "border-amber-500 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400" : "border-border text-muted-foreground hover:border-amber-400 hover:text-foreground"}`}
              >
                <ShieldAlert className="h-4 w-4 mx-auto mb-1.5" />
                🔒 Restriksyon
                <div className="text-[10px] font-normal mt-0.5 opacity-80">Ka achte sèlman</div>
              </button>
              <button
                type="button"
                onClick={() => setBanType("full_ban")}
                className={`rounded-xl border-2 px-3 py-3 text-xs font-semibold transition-all text-center ${banType === "full_ban" ? "border-destructive bg-red-50 dark:bg-red-950/30 text-destructive" : "border-border text-muted-foreground hover:border-destructive hover:text-foreground"}`}
              >
                <Ban className="h-4 w-4 mx-auto mb-1.5" />
                🚫 Ban Konplè
                <div className="text-[10px] font-normal mt-0.5 opacity-80">Pèmanan, bloke tout</div>
              </button>
            </div>
          </div>

          {/* Duration — restricted only */}
          {banType === "restricted" && (
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Dire</label>
              <div className="mt-1.5 grid grid-cols-4 gap-1.5">
                {[
                  { label: "7 jou", value: "7" },
                  { label: "30 jou", value: "30" },
                  { label: "90 jou", value: "90" },
                  { label: "Pèmanan", value: "0" },
                ].map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setDuration(opt.value)}
                    className={`rounded-lg border-2 py-2 text-xs font-semibold transition-all ${duration === opt.value ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        </>)}

        {mode === "flexcard" && (
          <div className="space-y-4">
            {fcStatus?.blocked && fcStatus.active && (
              <div className="rounded-xl border border-violet-300 dark:border-violet-700 bg-violet-50 dark:bg-violet-950/30 p-3 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Dèt aktyèl</span>
                  <span className="font-bold text-violet-700 dark:text-violet-400">${Number(fcStatus.active.outstandingUsd).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Referans</span>
                  <span className="font-mono">{fcStatus.active.referenceCode}</span>
                </div>
                <Button
                  variant="outline"
                  className="w-full text-emerald-600 border-emerald-300 dark:border-emerald-700"
                  onClick={handleFlexUnblock}
                  disabled={loading}
                >
                  <ShieldCheck className="h-4 w-4 mr-2" />
                  Debloke Flex Card (efase dèt)
                </Button>
                <div className="relative">
                  <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">oswa mete yon nouvo dèt</span>
                  </div>
                </div>
              </div>
            )}

            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Montan Dèt (USD)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={fcAmount}
                onChange={e => setFcAmount(e.target.value)}
                placeholder="0.00"
                className="mt-1.5 h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Rezon</label>
              <select
                className="mt-1.5 h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={fcReason}
                onChange={e => setFcReason(e.target.value)}
              >
                <option value="debt">💸 Dèt</option>
                <option value="merchant_complaint">🏪 Plent Machann</option>
                <option value="chargeback">↩️ Chargeback</option>
                <option value="fraud_investigation">🔍 Envestigasyon Fwòd</option>
                <option value="policy_violation">📋 Vyolasyon Règ</option>
                <option value="manual_review">👀 Revizyon Manyèl</option>
                <option value="other">➕ Lòt</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Dat Limit (opsyonèl)</label>
              <input
                type="date"
                value={fcDeadline}
                onChange={e => setFcDeadline(e.target.value)}
                className="mt-1.5 h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Nòt (opsyonèl)</label>
              <textarea
                value={fcNotes}
                onChange={e => setFcNotes(e.target.value)}
                rows={2}
                placeholder="Detay sou dèt la…"
                className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <p className="text-[11px] text-muted-foreground leading-relaxed">
              ⚠️ Sa ap bloke depans, transfè ak retrè SÈLMAN. Itilizatè a ap toujou ka konekte, navige, vann ak resevwa lajan.
            </p>
          </div>
        )}

        <DialogFooter className="gap-2 mt-1">
          <Button variant="outline" onClick={onClose} disabled={loading}>Anile</Button>
          {mode === "account" ? (
            <Button
              variant="destructive"
              onClick={handleConfirm}
              disabled={loading}
              className={banType === "restricted" ? "bg-amber-500 hover:bg-amber-600 border-amber-600" : ""}
            >
              <Ban className="h-4 w-4 mr-1" />
              {banType === "full_ban" ? "🚫 Ban Pèmanan" : "🔒 Aplike Restriksyon"}
            </Button>
          ) : (
            <Button
              onClick={handleFlexBlock}
              disabled={loading}
              className="bg-violet-600 hover:bg-violet-700 text-white"
            >
              <CreditCard className="h-4 w-4 mr-1" />
              Bloke Flex Card
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface AdminBlockButtonProps {
  targetUserId: number;
  targetUserName: string;
  targetStatus?: TargetStatus;
  onSuccess?: () => void;
  size?: "sm" | "default";
  variant?: "icon" | "full";
  className?: string;
}

export function AdminBlockButton({
  targetUserId,
  targetUserName,
  targetStatus = "active",
  onSuccess,
  size = "sm",
  variant = "full",
  className = "",
}: AdminBlockButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="destructive"
        size={size}
        className={`gap-1.5 ${variant === "icon" ? "h-7 w-7 p-0" : "h-7 px-2 text-xs"} ${className}`}
        onClick={e => { e.stopPropagation(); setOpen(true); }}
        title="Bloke itilizatè a"
      >
        <Ban className="h-3.5 w-3.5 flex-shrink-0" />
        {variant === "full" && <span>Bloke</span>}
      </Button>
      <AdminBlockModal
        targetUserId={targetUserId}
        targetUserName={targetUserName}
        targetStatus={targetStatus}
        isOpen={open}
        onClose={() => setOpen(false)}
        onSuccess={onSuccess}
      />
    </>
  );
}
