import { useState, useEffect } from "react";
import { Star, X, ChevronRight, Check, Loader2, ThumbsUp, ThumbsDown, Award } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/contexts/auth";

// ── Tag data ──────────────────────────────────────────────────────────────────

const POSITIVE_TAGS = [
  { label: "Livrezon rapid ⚡", key: "Livrezon rapid" },
  { label: "Pwofesyonèl 👔", key: "Chauffè pwofesyonèl" },
  { label: "Trè janti 😊", key: "Trè janti" },
  { label: "Ekselan sèvis 🌟", key: "Ekselan sèvis" },
  { label: "Bon kominikasyon 📞", key: "Bon kominikasyon" },
  { label: "Konduit an sekirite 🛡️", key: "Konduit an sekirite" },
  { label: "Pako an bon eta 📦", key: "Pako an bon eta" },
];

const NEGATIVE_TAGS = [
  { label: "Livrezon anreta ⏰", key: "Livrezon anreta" },
  { label: "Move kominikasyon 📵", key: "Move kominikasyon" },
  { label: "Pa pwofesyonèl 😤", key: "Pa pwofesyonèl" },
  { label: "Pako donmaje 📦", key: "Pako donmaje" },
  { label: "Konduit danjere ⚠️", key: "Konduit danjere" },
  { label: "Difisil jwenn 🗺️", key: "Difisil jwenn" },
];

const STAR_LABELS = ["", "Trè move 😞", "Move 😕", "Kòrèk 😐", "Bon 😊", "Ekselan! 🌟"];

// ── Props ─────────────────────────────────────────────────────────────────────

export interface DriverRatingModalProps {
  deliveryId: number;
  driverName: string;
  driverAvatar?: string | null;
  onClose: () => void;
  onDone?: () => void;
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function DriverRatingModal({ deliveryId, driverName, driverAvatar, onClose, onDone }: DriverRatingModalProps) {
  const { token } = useAuth();

  type Step = "rate" | "tags" | "comment" | "success";
  const [step, setStep]         = useState<Step>("rate");
  const [stars, setStars]       = useState(0);
  const [hoveredStar, setHoveredStar] = useState(0);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [comment, setComment]   = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [checking, setChecking] = useState(true);
  const [alreadyRated, setAlreadyRated] = useState(false);

  // Check if already rated
  useEffect(() => {
    if (!token) return;
    fetch(`/api/delivery/${deliveryId}/rating-status`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(d => { if (d.alreadyRated) setAlreadyRated(true); })
      .catch(() => {})
      .finally(() => setChecking(false));
  }, [deliveryId, token]);

  const availableTags = stars >= 4 ? POSITIVE_TAGS : stars <= 2 ? NEGATIVE_TAGS : [...POSITIVE_TAGS, ...NEGATIVE_TAGS];

  const toggleTag = (key: string) =>
    setSelectedTags(t => t.includes(key) ? t.filter(x => x !== key) : [...t, key].slice(0, 6));

  const handleSubmit = async () => {
    if (stars < 1) { setError("Chwazi omwen 1 zetwal"); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/delivery/${deliveryId}/rate-driver`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ rating: stars, tags: selectedTags, comment: comment.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.alreadyRated) { setAlreadyRated(true); return; }
        setError(data.error ?? "Echèk pou voye evalyasyon");
        return;
      }
      setStep("success");
    } catch { setError("Echèk rezo. Eseye ankò."); }
    finally { setLoading(false); }
  };

  // ── Already rated ────────────────────────────────────────────────────────

  if (alreadyRated) {
    return (
      <ModalShell onClose={onClose}>
        <div className="flex flex-col items-center gap-4 py-6">
          <div className="w-20 h-20 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
            <Star className="h-10 w-10 fill-amber-400 text-amber-400" />
          </div>
          <div className="text-center">
            <p className="text-lg font-black">Ou deja evalye chauffè sa a</p>
            <p className="text-sm text-muted-foreground mt-1">Mèsi pou kòmantè ou a!</p>
          </div>
          <Button onClick={onClose} className="w-full rounded-2xl h-12 font-bold">Fèmen</Button>
        </div>
      </ModalShell>
    );
  }

  if (checking) {
    return (
      <ModalShell onClose={onClose}>
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </ModalShell>
    );
  }

  // ── Success ──────────────────────────────────────────────────────────────

  if (step === "success") {
    const isPositive = stars >= 4;
    return (
      <ModalShell onClose={() => { onDone?.(); onClose(); }}>
        <div className="flex flex-col items-center gap-5 py-4">
          {/* Big animated star ring */}
          <div className="relative w-28 h-28 flex items-center justify-center">
            <div className={`absolute inset-0 rounded-full opacity-20 animate-ping ${isPositive ? "bg-amber-400" : "bg-blue-400"}`} />
            <div className={`absolute inset-0 rounded-full opacity-10 scale-110 ${isPositive ? "bg-amber-400" : "bg-blue-400"}`} />
            <div className={`w-24 h-24 rounded-full flex items-center justify-center shadow-xl ${isPositive ? "bg-gradient-to-br from-amber-400 to-orange-500" : "bg-gradient-to-br from-blue-400 to-blue-600"}`}>
              {isPositive
                ? <Award className="h-12 w-12 text-white" />
                : <Check className="h-12 w-12 text-white" />
              }
            </div>
          </div>

          <div className="text-center space-y-1">
            <p className="text-2xl font-black">{isPositive ? "Ekselan! 🌟" : "Mèsi 🙏"}</p>
            <p className="text-base font-semibold text-muted-foreground">
              Evalyasyon ou a voye ba {driverName.split(" ")[0]}
            </p>
          </div>

          {/* Stars displayed */}
          <div className="flex gap-1.5">
            {[1,2,3,4,5].map(s => (
              <Star key={s} className={`h-8 w-8 ${s <= stars ? "fill-amber-400 text-amber-400" : "fill-muted text-muted-foreground/20"}`} />
            ))}
          </div>

          {isPositive && (
            <div className="w-full bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20 border border-amber-200/60 dark:border-amber-800/30 rounded-2xl p-4 text-center space-y-1">
              <p className="font-black text-amber-900 dark:text-amber-200 text-sm">Ou ede amelyore sèvis livrezon! 🚀</p>
              <p className="text-xs text-amber-700 dark:text-amber-300/80">
                Evalyasyon pozitif yo ankouraje chauffè yo travay pi di.
              </p>
            </div>
          )}

          {stars <= 2 && (
            <div className="w-full bg-blue-50 dark:bg-blue-950/20 border border-blue-200/60 dark:border-blue-800/30 rounded-2xl p-4 text-center space-y-1">
              <p className="font-black text-blue-900 dark:text-blue-200 text-sm">Kòmantè ou enpòtan pou nou 🙏</p>
              <p className="text-xs text-blue-700 dark:text-blue-300/80">
                Nou pral revize evalyasyon an epi travay pou amelyore sèvis.
              </p>
            </div>
          )}

          <Button
            className="w-full rounded-2xl h-12 font-bold"
            onClick={() => { onDone?.(); onClose(); }}
          >
            <Check className="h-4 w-4 mr-2" /> Parfè!
          </Button>
        </div>
      </ModalShell>
    );
  }

  // ── Tags step ────────────────────────────────────────────────────────────

  if (step === "tags") {
    const isPositive = stars >= 4;
    return (
      <ModalShell onClose={onClose}>
        <div className="space-y-5">
          <div className="text-center space-y-1">
            <p className="text-lg font-black">
              {isPositive ? "Sa ou te renmen? 👍" : "Ki pwoblèm ou te genyen? 👎"}
            </p>
            <p className="text-xs text-muted-foreground">Chwazi tout ki aplike (opsyonèl)</p>
          </div>

          <div className="flex flex-wrap gap-2 justify-center">
            {availableTags.map(({ key, label }) => (
              <button
                key={key} type="button"
                onClick={() => toggleTag(key)}
                className={`px-3 py-2 rounded-full text-xs font-semibold border transition-all ${
                  selectedTags.includes(key)
                    ? isPositive
                      ? "bg-amber-400 text-white border-amber-400 shadow-sm"
                      : "bg-blue-500 text-white border-blue-500 shadow-sm"
                    : "border-border hover:bg-accent"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Stars reminder */}
          <div className="flex items-center justify-center gap-1">
            {[1,2,3,4,5].map(s => (
              <Star key={s} className={`h-5 w-5 ${s <= stars ? "fill-amber-400 text-amber-400" : "fill-muted text-muted-foreground/20"}`} />
            ))}
            <span className="text-xs text-muted-foreground ml-2">{STAR_LABELS[stars]}</span>
          </div>

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1 rounded-2xl h-12" onClick={() => setStep("comment")}>
              Pase <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
            <Button className="flex-1 rounded-2xl h-12 font-bold"
              onClick={() => setStep("comment")}
            >
              Kontinye <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      </ModalShell>
    );
  }

  // ── Comment step ─────────────────────────────────────────────────────────

  if (step === "comment") {
    return (
      <ModalShell onClose={onClose}>
        <div className="space-y-5">
          <div className="text-center space-y-1">
            <p className="text-lg font-black">Kòmantè opsyonèl 💬</p>
            <p className="text-xs text-muted-foreground">Pataje eksperyans ou (maks 500 karaktè)</p>
          </div>

          <textarea
            value={comment}
            onChange={e => setComment(e.target.value.slice(0, 500))}
            placeholder={stars >= 4
              ? "Ekri yon mesaj pou chauffè ou a... ex: Livrezon rapid, trè janti!"
              : "Dekri ki pwoblèm ou te genyen..."}
            rows={4}
            className="w-full border rounded-2xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 bg-background"
          />
          <p className="text-right text-[10px] text-muted-foreground/60">{comment.length}/500</p>

          {/* Summary */}
          <div className="bg-muted/30 rounded-2xl px-4 py-3 space-y-2">
            <div className="flex items-center gap-2 justify-between">
              <span className="text-sm text-muted-foreground">Evalyasyon</span>
              <div className="flex gap-0.5">
                {[1,2,3,4,5].map(s => (
                  <Star key={s} className={`h-4 w-4 ${s <= stars ? "fill-amber-400 text-amber-400" : "fill-muted text-muted-foreground/20"}`} />
                ))}
              </div>
            </div>
            {selectedTags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {selectedTags.map(t => (
                  <span key={t} className="text-[10px] bg-primary/10 text-primary font-semibold px-2 py-0.5 rounded-full">{t}</span>
                ))}
              </div>
            )}
          </div>

          {error && <p className="text-xs text-destructive text-center">{error}</p>}

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1 rounded-2xl h-12" onClick={() => setStep("tags")}>
              Retounen
            </Button>
            <Button
              className="flex-1 rounded-2xl h-12 font-bold"
              onClick={handleSubmit}
              disabled={loading}
              style={{ background: "linear-gradient(135deg, #f59e0b, #f97316)" }}
            >
              {loading
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <span className="flex items-center gap-2"><Star className="h-4 w-4 fill-white" /> Voye Evalyasyon</span>
              }
            </Button>
          </div>

          <button
            type="button" onClick={() => { onDone?.(); onClose(); }}
            className="w-full text-center text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
          >
            Pa voye evalyasyon
          </button>
        </div>
      </ModalShell>
    );
  }

  // ── Star rating step (default) ────────────────────────────────────────────

  const displayStar = hoveredStar || stars;

  return (
    <ModalShell onClose={onClose}>
      <div className="space-y-6">

        {/* Driver card */}
        <div className="flex flex-col items-center gap-3">
          <div className="relative">
            <Avatar className="h-20 w-20 border-4 border-amber-100 shadow-xl">
              <AvatarImage src={driverAvatar ?? undefined} className="object-cover" />
              <AvatarFallback className="bg-gradient-to-br from-amber-400 to-orange-500 text-white font-black text-2xl">
                {driverName[0]}
              </AvatarFallback>
            </Avatar>
            <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-green-500 border-2 border-background flex items-center justify-center shadow-md">
              <Check className="h-4 w-4 text-white" />
            </div>
          </div>
          <div className="text-center">
            <p className="text-xl font-black">{driverName}</p>
            <p className="text-xs text-muted-foreground">Chauffè FM Verifye · Livrezon fini ✓</p>
          </div>
        </div>

        {/* Headline */}
        <div className="text-center space-y-1">
          <p className="text-lg font-black">Ki jan ou evalye sèvis li? ⭐</p>
          <p className="text-xs text-muted-foreground">
            {displayStar > 0
              ? <span className="font-semibold text-amber-500">{STAR_LABELS[displayStar]}</span>
              : "Touche yon zetwal pou bay nòt"
            }
          </p>
        </div>

        {/* Animated star rating */}
        <div className="flex justify-center gap-3">
          {[1, 2, 3, 4, 5].map(s => (
            <button
              key={s} type="button"
              onMouseEnter={() => setHoveredStar(s)}
              onMouseLeave={() => setHoveredStar(0)}
              onClick={() => setStars(s)}
              className="transition-all hover:scale-125 active:scale-95 touch-manipulation"
            >
              <Star
                className={`h-14 w-14 transition-all duration-150 ${
                  s <= displayStar
                    ? "fill-amber-400 text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.6)]"
                    : "fill-muted text-muted-foreground/20"
                } ${s <= displayStar && displayStar === 5 ? "scale-110" : ""}`}
              />
            </button>
          ))}
        </div>

        {/* Quick positive/negative indicator */}
        {stars > 0 && (
          <div className={`flex items-center justify-center gap-2 py-2 px-4 rounded-2xl ${
            stars >= 4 ? "bg-amber-50 dark:bg-amber-950/20" :
            stars === 3 ? "bg-blue-50 dark:bg-blue-950/20" :
            "bg-red-50 dark:bg-red-950/20"
          }`}>
            {stars >= 4
              ? <ThumbsUp className="h-4 w-4 text-amber-500" />
              : <ThumbsDown className={`h-4 w-4 ${stars === 3 ? "text-blue-400" : "text-red-400"}`} />
            }
            <span className={`text-sm font-bold ${
              stars >= 4 ? "text-amber-700 dark:text-amber-300" :
              stars === 3 ? "text-blue-700 dark:text-blue-300" :
              "text-red-700 dark:text-red-300"
            }`}>{STAR_LABELS[stars]}</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <Button variant="ghost" className="flex-1 rounded-2xl h-12 text-muted-foreground"
            onClick={() => { onDone?.(); onClose(); }}>
            Pase
          </Button>
          <Button
            className="flex-1 rounded-2xl h-12 font-bold"
            onClick={() => stars > 0 && setStep("tags")}
            disabled={stars < 1}
            style={stars > 0 ? { background: "linear-gradient(135deg, #f59e0b, #f97316)" } : {}}
          >
            Kontinye <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>
    </ModalShell>
  );
}

// ── Modal shell ───────────────────────────────────────────────────────────────

function ModalShell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-md bg-card rounded-t-3xl sm:rounded-3xl shadow-2xl border border-border/50 p-6 z-10 max-h-[92vh] overflow-y-auto">
        <div className="absolute top-2.5 left-1/2 -translate-x-1/2 w-10 h-1 bg-border rounded-full sm:hidden" />
        <button onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-muted/60 flex items-center justify-center hover:bg-muted transition-colors z-20">
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
        {children}
      </div>
    </div>
  );
}
