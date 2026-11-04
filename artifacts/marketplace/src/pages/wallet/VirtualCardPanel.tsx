import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Copy, Share2, QrCode, Loader2 } from "lucide-react";
import QRCode from "qrcode";

function formatCardNumber(acct: string | null | undefined): string {
  if (!acct) return "•••• •••• •••• ••••";
  const raw = acct.replace(/\D/g, ""); // "482910"
  const prefix = "5288 4000 00";
  const padded = (prefix.replace(/ /g, "") + raw.padStart(6, "0")).slice(-16);
  return padded.match(/.{4}/g)?.join("  ") ?? padded;
}

function formatCardNumberShort(acct: string | null | undefined): string {
  if (!acct) return "••••";
  const raw = acct.replace(/\D/g, "");
  return raw.padStart(6, "0").slice(-4);
}

function deriveCVV(acct: string | null | undefined): string {
  if (!acct) return "•••";
  const n = parseInt(acct.replace(/\D/g, "") || "0", 10);
  return String(((n * 31 + 137) % 900) + 100);
}

function getCardExpiry(): string {
  const y = new Date().getFullYear() + 4;
  return `12/${String(y).slice(-2)}`;
}

export function QRModal({ accountNumber, onClose }: { accountNumber: string; onClose: () => void }) {
  const { t } = useTranslation();
  const [qrUrl, setQrUrl] = useState<string | null>(null);

  useEffect(() => {
    QRCode.toDataURL(accountNumber, {
      width: 240,
      margin: 2,
      color: { dark: "#0f172a", light: "#ffffff" },
    }).then(setQrUrl).catch(() => {});
  }, [accountNumber]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl p-8 max-w-xs w-full text-center shadow-2xl"
        onClick={e => e.stopPropagation()}
        style={{ animation: "scaleIn 0.2s ease" }}
      >
        <p className="font-black text-lg text-slate-800 mb-1">{t("wallet.qrTitle")}</p>
        <p className="text-xs text-slate-500 mb-5">{t("wallet.qrSubtitle")}</p>
        {qrUrl ? (
          <img src={qrUrl} alt="QR Code" className="mx-auto rounded-xl" style={{ width: 200, height: 200 }} />
        ) : (
          <div className="w-[200px] h-[200px] mx-auto flex items-center justify-center bg-muted rounded-xl">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}
        <p className="mt-5 font-mono font-black text-xl tracking-widest text-slate-800">{accountNumber}</p>
        <p className="text-xs text-muted-foreground mt-1 mb-5">{t("wallet.qrAccountLabel")}</p>
        <Button variant="outline" className="w-full" onClick={onClose}>{t("buttons.close") || "×"}</Button>
      </div>
    </div>
  );
}

interface VirtualCardProps {
  balance: { balanceUsd: number; accountNumber: string | null } | undefined;
  isLoading: boolean;
  userName: string;
  onCopy: () => void;
  onShare: () => void;
  onQR: () => void;
  rechargePending?: boolean;
}

export function VirtualCard({ balance, isLoading, userName, onCopy, onShare, onQR, rechargePending }: VirtualCardProps) {
  const { t } = useTranslation();
  const [flipped, setFlipped] = useState(false);
  const acct = balance?.accountNumber ?? null;
  const cardNum = formatCardNumber(acct);
  const lastFour = formatCardNumberShort(acct);
  const cvv = deriveCVV(acct);
  const expiry = getCardExpiry();
  const usd = balance?.balanceUsd ?? 0;

  return (
    <div className="w-full" style={{ perspective: 1000 }}>
      {/* Card container — flip on click */}
      <div
        className="relative w-full cursor-pointer select-none"
        style={{
          aspectRatio: "1.586",
          transformStyle: "preserve-3d",
          transition: "transform 0.55s cubic-bezier(.4,0,.2,1)",
          transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
        }}
        onClick={() => setFlipped(f => !f)}
        title={t("wallet.cardFlipHint")}
      >
        {/* ── FRONT ───────────────────────────────────────────────────────── */}
        <div
          className="absolute inset-0 rounded-3xl overflow-hidden shadow-2xl"
          style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" }}
        >
          {/* Gradient background */}
          <div
            className="absolute inset-0"
            style={{ background: "linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)" }}
          />
          {/* Shimmer overlay */}
          <div
            className="absolute inset-0 opacity-20"
            style={{ background: "linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.35) 50%, transparent 60%)" }}
          />
          {/* Decorative arcs */}
          <div className="absolute -right-16 -top-16 w-64 h-64 rounded-full border border-white/10" />
          <div className="absolute -right-8 -top-8 w-40 h-40 rounded-full border border-white/8" />
          <div className="absolute -left-10 -bottom-10 w-48 h-48 rounded-full border border-white/6" />

          <div className="absolute inset-0 flex flex-col justify-between p-5 sm:p-6">
            {/* Top row: chip + logo + network mark */}
            <div className="flex items-start justify-between">
              {/* EMV chip */}
              <div
                className="rounded-md"
                style={{
                  width: 40, height: 30,
                  background: "linear-gradient(135deg, #d4af37 0%, #f5e17c 40%, #c8a400 100%)",
                  boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.2)",
                  position: "relative",
                }}
              >
                <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", justifyContent: "space-around", padding: "4px 5px" }}>
                  <div style={{ height: 2, background: "rgba(0,0,0,0.25)", borderRadius: 1 }} />
                  <div style={{ height: 2, background: "rgba(0,0,0,0.25)", borderRadius: 1 }} />
                  <div style={{ height: 2, background: "rgba(0,0,0,0.25)", borderRadius: 1 }} />
                </div>
              </div>

              {/* FLEXA MARKET brand + USDT badge */}
              <div className="text-right">
                <div className="flex items-center gap-2 justify-end">
                  <span className="text-white font-black text-sm tracking-tight leading-none">ZE<span className="text-yellow-400">NO</span></span>
                </div>
                <div className="mt-1 flex items-center gap-1 justify-end">
                  <span className="text-xs font-bold px-1.5 py-0.5 rounded-full text-white/85 border border-white/30 tracking-wider">USDT · USD</span>
                </div>
              </div>
            </div>

            {/* Balance (center of card) */}
            <div className="text-white">
              {isLoading ? (
                <div className="h-8 w-28 bg-white/20 rounded-lg animate-pulse" />
              ) : rechargePending ? (
                <>
                  <p className="text-xs text-white/80 uppercase tracking-widest mb-0.5">{t("wallet.availableBalance")}</p>
                  <div className="flex items-center gap-2">
                    <p className="text-3xl font-black leading-none">${usd.toFixed(2)}</p>
                    <span className="flex items-center gap-1 text-xs font-bold text-green-300 animate-pulse bg-green-400/20 border border-green-400/40 rounded-full px-2 py-0.5">
                      <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
                      Ap kredite…
                    </span>
                  </div>
                  <p className="text-xs text-white/80 mt-0.5">{usd.toFixed(2)} USDT</p>
                </>
              ) : (
                <>
                  <p className="text-xs text-white/80 uppercase tracking-widest mb-0.5">{t("wallet.availableBalance")}</p>
                  <p className="text-3xl font-black leading-none">${usd.toFixed(2)}</p>
                  <p className="text-xs text-white/80 mt-0.5">{usd.toFixed(2)} USDT</p>
                </>
              )}
            </div>

            {/* FM Account number — PRIMARY identifier, always visible */}
            <div>
              {isLoading || !acct ? (
                <div className="h-7 w-36 bg-white/20 rounded animate-pulse" />
              ) : (
                <div>
                  <p className="text-xs text-white/80 uppercase tracking-widest mb-0.5">{t("wallet.accountNumberLabel")}</p>
                  <p className="font-mono text-white text-xl sm:text-2xl font-black tracking-widest">{acct}</p>
                </div>
              )}
            </div>

            {/* Bottom row: name + expiry + card digits */}
            <div className="flex items-end justify-between">
              <div>
                <p className="text-xs text-white/80 uppercase tracking-widest">{t("wallet.cardHolder")}</p>
                <p className="text-white text-xs sm:text-sm font-bold uppercase tracking-wide leading-tight truncate max-w-[130px]">
                  {userName || "FLEXA MARKET User"}
                </p>
              </div>
              <div className="text-center">
                <p className="text-xs text-white/80 uppercase tracking-widest">{t("wallet.expires")}</p>
                <p className="text-white text-xs font-bold font-mono">{expiry}</p>
              </div>
              {/* Mastercard-style circles */}
              <div className="flex">
                <div className="w-8 h-8 rounded-full opacity-80" style={{ background: "#eb001b" }} />
                <div className="w-8 h-8 rounded-full opacity-80 -ml-3" style={{ background: "#f79e1b", mixBlendMode: "multiply" }} />
              </div>
            </div>
          </div>
        </div>

        {/* ── BACK ─────────────────────────────────────────────────────────── */}
        <div
          className="absolute inset-0 rounded-3xl overflow-hidden shadow-2xl"
          style={{
            backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
            background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
          }}
        >
          {/* Magnetic stripe */}
          <div className="w-full h-10 mt-8 bg-black/70" />

          <div className="px-5 pt-4 space-y-4">
            {/* Signature strip + CVV */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-9 rounded flex items-center px-3 bg-white/90">
                <div className="flex-1 border-b border-dashed border-slate-300" />
              </div>
              <div className="bg-white/90 rounded px-3 h-9 flex flex-col items-center justify-center min-w-[56px]">
                <p className="text-xs text-slate-600 uppercase tracking-wider">CVV</p>
                <p className="font-black text-slate-800 font-mono text-sm">{cvv}</p>
              </div>
            </div>

            {/* Card info */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-white/75">{t("wallet.accountNumberLabel")}</span>
                <span className="text-white font-mono font-bold">{acct ?? "—"}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-white/75">{t("wallet.lastFour")}</span>
                <span className="text-white font-mono font-bold">••••  ••••  ••••  {lastFour}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-white/75">{t("wallet.expiryDate")}</span>
                <span className="text-white font-mono font-bold">{expiry}</span>
              </div>
            </div>

            {/* Notice */}
            <div className="rounded-lg border border-white/15 bg-white/5 p-2.5">
              <p className="text-xs text-white/75 leading-relaxed text-center">
                {t("wallet.cardNotice")}
              </p>
            </div>
          </div>

          {/* Hint */}
          <p className="absolute bottom-4 right-5 text-xs text-white/75">{t("wallet.cardClickBack")}</p>
        </div>
      </div>

      {/* ── Action buttons below card ──────────────────────────────────────── */}
      <div className="flex items-center justify-center gap-4 mt-4">
        <button
          onClick={e => { e.stopPropagation(); onCopy(); }}
          className="flex flex-col items-center gap-1 px-4 py-2 rounded-2xl bg-muted/60 hover:bg-muted transition-colors"
        >
          <Copy className="h-4 w-4 text-foreground" />
          <span className="text-xs text-muted-foreground font-medium">{t("buttons.copy") || "Copy"}</span>
        </button>
        <button
          onClick={e => { e.stopPropagation(); onShare(); }}
          className="flex flex-col items-center gap-1 px-4 py-2 rounded-2xl bg-muted/60 hover:bg-muted transition-colors"
        >
          <Share2 className="h-4 w-4 text-foreground" />
          <span className="text-xs text-muted-foreground font-medium">{t("buttons.share") || "Share"}</span>
        </button>
        <button
          onClick={e => { e.stopPropagation(); onQR(); }}
          className="flex flex-col items-center gap-1 px-4 py-2 rounded-2xl bg-muted/60 hover:bg-muted transition-colors"
        >
          <QrCode className="h-4 w-4 text-foreground" />
          <span className="text-xs text-muted-foreground font-medium">QR Code</span>
        </button>
      </div>
      <p className="text-center text-xs text-muted-foreground mt-1">{t("wallet.cardFlipHint")}</p>
    </div>
  );
}
