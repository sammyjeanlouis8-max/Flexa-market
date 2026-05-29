import { useState, useEffect, useRef } from "react";
import { Heart, Star, Check, X, Loader2, DollarSign, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/contexts/auth";

// ── Confetti particle ─────────────────────────────────────────────────────────
interface Particle {
  id: number; x: number; y: number; vx: number; vy: number;
  color: string; size: number; rotation: number; vr: number; opacity: number;
}

const CONFETTI_COLORS = ["#f97316","#ec4899","#8b5cf6","#06b6d4","#22c55e","#fbbf24","#ef4444"];

function Confetti({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width  = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    particlesRef.current = Array.from({ length: 80 }, (_, i) => ({
      id: i,
      x: canvas.width / 2 + (Math.random() - 0.5) * 120,
      y: canvas.height * 0.35,
      vx: (Math.random() - 0.5) * 14,
      vy: -(Math.random() * 12 + 4),
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      size: Math.random() * 8 + 4,
      rotation: Math.random() * 360,
      vr: (Math.random() - 0.5) * 10,
      opacity: 1,
    }));

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let alive = false;
      for (const p of particlesRef.current) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.35;
        p.vx *= 0.98;
        p.rotation += p.vr;
        p.opacity -= 0.012;
        if (p.opacity <= 0) continue;
        alive = true;
        ctx.save();
        ctx.globalAlpha = Math.max(0, p.opacity);
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      }
      if (alive) rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [active]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none z-50 rounded-3xl"
    />
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface TipModalProps {
  deliveryId: number;
  driverName: string;
  driverAvatar?: string | null;
  onClose: () => void;
}

// ── Quick tip amounts ─────────────────────────────────────────────────────────

const QUICK_AMOUNTS = [1, 2, 5, 10];

// ── Main Component ────────────────────────────────────────────────────────────

export default function TipModal({ deliveryId, driverName, driverAvatar, onClose }: TipModalProps) {
  const { token } = useAuth();

  const [step, setStep] = useState<"pick" | "review" | "success">("pick");
  const [selected, setSelected] = useState<number | null>(null);
  const [custom, setCustom] = useState("");
  const [rating, setRating] = useState(0);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [confetti, setConfetti] = useState(false);
  const [alreadyTipped, setAlreadyTipped] = useState(false);
  const [checkDone, setCheckDone] = useState(false);

  // Check if already tipped
  useEffect(() => {
    if (!token) return;
    fetch(`/api/delivery/${deliveryId}/tip-status`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => {
        if (data.alreadyTipped) setAlreadyTipped(true);
      })
      .catch(() => {})
      .finally(() => setCheckDone(true));
  }, [deliveryId, token]);

  const amount = selected ?? (parseFloat(custom) || 0);

  const isValidAmount = amount >= 0.50 && amount <= 100 && isFinite(amount);

  const handleSubmit = async () => {
    if (!isValidAmount) { setError("Minimum poubwa: $0.50, maximum: $100.00"); return; }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/delivery/${deliveryId}/tip`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ amount, message: message.trim() || null, rating: rating || null }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.alreadyTipped) { setAlreadyTipped(true); return; }
        setError(data.error ?? "Echèk pou voye poubwa");
        return;
      }
      setStep("success");
      setTimeout(() => setConfetti(true), 100);
    } catch {
      setError("Echèk rezo. Eseye ankò.");
    } finally {
      setLoading(false);
    }
  };

  const REVIEWS = [
    "Livrezon rapid! ⚡", "Trè pwofesyonèl 👍", "Mèsi anpil! ❤️",
    "Sèvis ekselan 🌟", "Chauffè janti 😊", "M pral rekòmande li 🏆",
  ];

  // ── Already tipped state ──────────────────────────────────────────────────

  if (alreadyTipped) {
    return (
      <ModalShell onClose={onClose}>
        <div className="flex flex-col items-center gap-4 py-6">
          <div className="w-20 h-20 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
            <Check className="h-10 w-10 text-emerald-500" />
          </div>
          <div className="text-center">
            <p className="text-lg font-black">Ou deja voye poubwa</p>
            <p className="text-sm text-muted-foreground mt-1">Ou deja sipòte chauffè sa a pou livrezon sa a.</p>
          </div>
          <Button onClick={onClose} className="w-full rounded-2xl h-12 font-bold">Fèmen</Button>
        </div>
      </ModalShell>
    );
  }

  if (!checkDone) {
    return (
      <ModalShell onClose={onClose}>
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </ModalShell>
    );
  }

  // ── Success state ─────────────────────────────────────────────────────────

  if (step === "success") {
    return (
      <ModalShell onClose={onClose}>
        <div className="relative">
          <Confetti active={confetti} />
          <div className="flex flex-col items-center gap-4 py-6 relative z-10">
            {/* Animated heart */}
            <div
              className="w-24 h-24 rounded-full flex items-center justify-center shadow-xl"
              style={{ background: "linear-gradient(135deg, #f97316, #ec4899)" }}
            >
              <Heart className="h-12 w-12 text-white fill-white animate-bounce" />
            </div>

            <div className="text-center space-y-1">
              <p className="text-2xl font-black tracking-tight">Mèsi! ❤️</p>
              <p className="text-lg font-bold text-primary">${amount.toFixed(2)} poubwa voye</p>
              <p className="text-sm text-muted-foreground">
                {driverName.split(" ")[0]} resevwa 100% poubwa ou a kounye a.
              </p>
            </div>

            {/* Driver card */}
            <div className="flex items-center gap-3 bg-muted/40 rounded-2xl px-4 py-3 w-full">
              <Avatar className="h-12 w-12 border-2 border-primary/20">
                <AvatarImage src={driverAvatar ?? undefined} />
                <AvatarFallback className="bg-primary/10 text-primary font-black">{driverName[0]}</AvatarFallback>
              </Avatar>
              <div>
                <p className="font-black text-sm">{driverName}</p>
                <p className="text-xs text-muted-foreground">Chauffè FM · Sipòte!</p>
              </div>
              <div className="ml-auto">
                <div className="bg-emerald-500 text-white text-xs font-black px-3 py-1.5 rounded-xl">
                  +${amount.toFixed(2)}
                </div>
              </div>
            </div>

            {/* Appreciation message */}
            <div
              className="w-full rounded-2xl p-4 text-center space-y-1"
              style={{ background: "linear-gradient(135deg, #fef3c7, #fde68a)" }}
            >
              <p className="font-black text-amber-900 text-sm">Ou fè yon diferans! 🌟</p>
              <p className="text-xs text-amber-800">
                Chauffè yo travay di. Poubwa ou a ankouraje yo kontinye ba sèvis ekselan.
              </p>
            </div>

            <Button onClick={onClose} className="w-full rounded-2xl h-12 font-bold mt-2">
              <Check className="h-4 w-4 mr-2" /> Excellent!
            </Button>
          </div>
        </div>
      </ModalShell>
    );
  }

  // ── Review step ───────────────────────────────────────────────────────────

  if (step === "review") {
    return (
      <ModalShell onClose={onClose}>
        <div className="space-y-5">
          <div className="text-center space-y-1">
            <p className="text-lg font-black">Kite yon mesaj 💬</p>
            <p className="text-xs text-muted-foreground">Opsyonèl — Chauffè pral wè l</p>
          </div>

          {/* Star rating */}
          <div className="flex justify-center gap-2">
            {[1, 2, 3, 4, 5].map(star => (
              <button
                key={star}
                type="button"
                onClick={() => setRating(r => r === star ? 0 : star)}
                className="transition-transform hover:scale-110 active:scale-95"
              >
                <Star
                  className={`h-9 w-9 transition-colors ${
                    star <= rating
                      ? "fill-amber-400 text-amber-400"
                      : "fill-muted text-muted-foreground/30"
                  }`}
                />
              </button>
            ))}
          </div>

          {/* Quick review chips */}
          <div className="flex flex-wrap gap-2 justify-center">
            {REVIEWS.map(r => (
              <button
                key={r}
                type="button"
                onClick={() => setMessage(m => m === r ? "" : r)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                  message === r
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border hover:bg-accent"
                }`}
              >
                {r}
              </button>
            ))}
          </div>

          {/* Custom message */}
          <textarea
            value={message.startsWith("L") || message.startsWith("T") || message.startsWith("M") || message.startsWith("S") || message.startsWith("C") ? "" : message}
            onChange={e => setMessage(e.target.value.slice(0, 300))}
            placeholder="Ekri yon mesaj pèsonèl... (opsyonèl)"
            rows={3}
            className="w-full border rounded-2xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 bg-background"
          />

          {/* Summary */}
          <div className="flex items-center justify-between bg-primary/5 rounded-2xl px-4 py-3">
            <span className="text-sm text-muted-foreground">Poubwa pou {driverName.split(" ")[0]}</span>
            <span className="text-xl font-black text-primary">${amount.toFixed(2)}</span>
          </div>

          {error && <p className="text-xs text-destructive text-center">{error}</p>}

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1 rounded-2xl h-12 font-bold" onClick={() => setStep("pick")}>
              Retounen
            </Button>
            <Button
              className="flex-1 rounded-2xl h-12 font-bold"
              onClick={handleSubmit}
              disabled={loading}
              style={{ background: "linear-gradient(135deg, #f97316, #ec4899)" }}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                <span className="flex items-center gap-2">
                  <Heart className="h-4 w-4 fill-white" /> Voye Poubwa
                </span>
              )}
            </Button>
          </div>
        </div>
      </ModalShell>
    );
  }

  // ── Pick amount step (default) ────────────────────────────────────────────

  return (
    <ModalShell onClose={onClose}>
      <div className="space-y-5">

        {/* Driver card */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <Avatar className="h-14 w-14 border-2 border-primary/30 shadow-lg">
              <AvatarImage src={driverAvatar ?? undefined} />
              <AvatarFallback className="bg-gradient-to-br from-primary to-pink-500 text-white font-black text-xl">
                {driverName[0]}
              </AvatarFallback>
            </Avatar>
            <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-emerald-500 border-2 border-background flex items-center justify-center">
              <Check className="h-3 w-3 text-white" />
            </div>
          </div>
          <div>
            <p className="font-black text-base leading-tight">{driverName}</p>
            <p className="text-xs text-muted-foreground">Chauffè · Livrezon fini ✓</p>
            <p className="text-[10px] text-emerald-600 font-semibold mt-0.5">100% poubwa — zero komisyon Flexa</p>
          </div>
        </div>

        {/* Headline */}
        <div className="text-center space-y-0.5">
          <p className="text-lg font-black">Sipòte Chauffè ou a ❤️</p>
          <p className="text-xs text-muted-foreground">Chwazi yon poubwa — li prale dirèkteman nan pòch li</p>
        </div>

        {/* Quick amounts */}
        <div className="grid grid-cols-4 gap-2">
          {QUICK_AMOUNTS.map(a => (
            <button
              key={a}
              type="button"
              onClick={() => { setSelected(s => s === a ? null : a); setCustom(""); }}
              className={`relative flex flex-col items-center justify-center py-4 rounded-2xl border-2 transition-all font-black text-xl ${
                selected === a
                  ? "border-primary bg-primary text-primary-foreground shadow-lg scale-105"
                  : "border-border hover:border-primary/50 hover:bg-primary/5"
              }`}
            >
              ${a}
              {selected === a && (
                <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center">
                  <Check className="h-3 w-3 text-white" />
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Custom amount */}
        <div className="relative">
          <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <input
            type="number"
            min="0.5"
            max="100"
            step="0.5"
            value={custom}
            onChange={e => {
              setCustom(e.target.value);
              setSelected(null);
            }}
            placeholder="Antre montan pèsonèl..."
            className={`w-full border-2 rounded-2xl pl-10 pr-4 py-3.5 font-bold text-base focus:outline-none transition-all bg-background ${
              custom && isValidAmount && !selected
                ? "border-primary bg-primary/5"
                : "border-border focus:border-primary/50"
            }`}
          />
        </div>

        {/* Amount preview */}
        {amount > 0 && (
          <div className="flex items-center justify-between bg-emerald-50 dark:bg-emerald-950/20 rounded-2xl px-4 py-3 border border-emerald-200 dark:border-emerald-800/30">
            <span className="text-sm text-emerald-700 dark:text-emerald-300 font-semibold">
              {driverName.split(" ")[0]} resevwa
            </span>
            <span className="text-2xl font-black text-emerald-600">${amount.toFixed(2)}</span>
          </div>
        )}

        {error && <p className="text-xs text-destructive text-center">{error}</p>}

        {/* Actions */}
        <div className="flex gap-3">
          <Button variant="ghost" className="flex-1 rounded-2xl h-12 font-bold text-muted-foreground" onClick={onClose}>
            Pa kounye a
          </Button>
          <Button
            className="flex-2 rounded-2xl h-12 font-bold flex-1"
            onClick={() => setStep("review")}
            disabled={!isValidAmount}
            style={isValidAmount ? { background: "linear-gradient(135deg, #f97316, #ec4899)" } : {}}
          >
            Kontinye <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>

        <p className="text-center text-[10px] text-muted-foreground/60">
          Flexa Market pa pran okenn komisyon sou poubwa. 0% — 100% ale nan chauffè.
        </p>
      </div>
    </ModalShell>
  );
}

// ── Modal shell (backdrop + card) ─────────────────────────────────────────────

function ModalShell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Card */}
      <div className="relative w-full sm:max-w-md bg-card rounded-t-3xl sm:rounded-3xl shadow-2xl border border-border/50 p-6 z-10 max-h-[92vh] overflow-y-auto">
        {/* Pill handle (mobile) */}
        <div className="absolute top-2.5 left-1/2 -translate-x-1/2 w-10 h-1 bg-border rounded-full sm:hidden" />

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-muted/60 flex items-center justify-center hover:bg-muted transition-colors z-20"
        >
          <X className="h-4 w-4 text-muted-foreground" />
        </button>

        {children}
      </div>
    </div>
  );
}
