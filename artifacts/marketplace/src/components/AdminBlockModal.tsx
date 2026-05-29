import { useState } from "react";
import { Ban, ShieldAlert, ShieldCheck } from "lucide-react";
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

        <DialogFooter className="gap-2 mt-1">
          <Button variant="outline" onClick={onClose} disabled={loading}>Anile</Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={loading}
            className={banType === "restricted" ? "bg-amber-500 hover:bg-amber-600 border-amber-600" : ""}
          >
            <Ban className="h-4 w-4 mr-1" />
            {banType === "full_ban" ? "🚫 Ban Pèmanan" : "🔒 Aplike Restriksyon"}
          </Button>
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
