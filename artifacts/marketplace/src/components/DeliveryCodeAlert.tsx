import { useEffect, useState, useCallback, useRef } from "react";
import { Copy, X, Lock } from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { useSocket } from "@/hooks/useSocket";

interface DeliveryNotif {
  id: number;
  type: string;
  message: string | null;
  isRead: boolean;
  createdAt: string;
}

const PIN_NOTIF_TYPES = new Set(["delivery_pin", "driver_assigned", "delivery_picked_up"]);

/** Extract the active delivery PIN from Haitian Creole / English notification copy. */
function extractCode(message: string | null): string | null {
  if (!message) return null;
  const m =
    message.match(/kòd\s*pin\s*livrezon\s*ou:\s*(\d{4,8})/i) ??
    message.match(/kòd\s*sekrè\s*ou:\s*(\d{4,8})/i) ??
    message.match(/kòd\s*konfirmasyon\s*ou:\s*(\d{4,8})/i) ??
    message.match(/nouvo\s*kòd\s*sekrè\s*ou:\s*(\d{4,8})/i) ??
    message.match(/delivery\s*pin[:\s]+(\d{4,8})/i) ??
    message.match(/code[:\s]+(\d{4,8})/i) ??
    message.match(/:\s*(\d{4,8})(?:\n|\.|\s|$)/);
  return m ? m[1] : null;
}

export default function DeliveryCodeAlert() {
  const { user, token } = useAuth();
  const [alert, setAlert] = useState<{ notifId: number; code: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const socket = useSocket();
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchPending = useCallback(async () => {
    if (!user || !token) return;
    try {
      const res = await fetch("/api/notifications", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data: DeliveryNotif[] = await res.json();
      const hit = data.find(
        (n) => PIN_NOTIF_TYPES.has(n.type) && !n.isRead && extractCode(n.message),
      );
      if (hit) {
        const code = extractCode(hit.message)!;
        setAlert({ notifId: hit.id, code });
      }
    } catch {}
  }, [user, token]);

  // Poll every 30s so the alert appears even if the socket event is missed
  useEffect(() => {
    fetchPending();
    pollingRef.current = setInterval(fetchPending, 30_000);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [fetchPending]);

  // Real-time socket push: show the code when driver is assigned / picks up
  useEffect(() => {
    const unsub = socket.onDeliveryStatus((data) => {
      if (
        (data.status === "picked_up" || data.status === "driver_assigned" || data.status === "seller_delivering") &&
        (data as { verificationCode?: string }).verificationCode
      ) {
        fetchPending();
      } else if (data.status === "picked_up" || data.status === "driver_assigned") {
        fetchPending();
      }
    });
    return unsub;
  }, [socket.onDeliveryStatus, fetchPending]);

  const dismiss = async () => {
    if (!alert) return;
    setAlert(null);
    await fetch(`/api/notifications/${alert.notifId}/read`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});
  };

  const copy = () => {
    if (!alert) return;
    navigator.clipboard.writeText(alert.code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!alert) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-sm bg-background rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="bg-[hsl(152,65%,18%)] px-5 pt-5 pb-6 text-white relative">
          <button
            onClick={dismiss}
            className="absolute top-3 right-3 p-1.5 rounded-full bg-white/20 hover:bg-white/30 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
              <Lock className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest opacity-80">Kòd livrezon</p>
              <p className="text-sm font-bold">Bay chofè Flexa Market la sèlman</p>
            </div>
          </div>
          <div className="bg-white/15 rounded-xl px-4 py-3">
            <p className="text-[10px] font-black uppercase tracking-widest opacity-70 mb-1">Kòd PIN</p>
            <p className="text-5xl font-black tracking-[0.3em] text-center py-1">{alert.code}</p>
          </div>
        </div>
        <div className="px-5 py-4 space-y-3">
          <p className="text-sm text-foreground font-medium text-center">
            Bay chofè a kòd sa a <strong>lè li rive</strong> pou konfime livrezon an. Pa pataje li ak pèsonn.
          </p>
          <button
            onClick={copy}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[hsl(152,65%,18%)]/10 hover:bg-[hsl(152,65%,18%)]/20 text-[hsl(152,65%,18%)] font-bold transition-colors"
          >
            <Copy className="h-4 w-4" />
            {copied ? "Kopye ✓" : "Kopi kòd la"}
          </button>
          <button
            onClick={dismiss}
            className="w-full text-center text-xs text-muted-foreground hover:text-foreground py-1"
          >
            Fèmen — mwen deja wè kòd la
          </button>
        </div>
      </div>
    </div>
  );
}
