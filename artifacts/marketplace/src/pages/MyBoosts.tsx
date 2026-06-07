import { useState, useEffect, useCallback, useRef } from "react";
import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import {
  Zap, Eye, TrendingUp, MousePointerClick, Play,
  AlertCircle, Loader2, Film, Trash2, Upload,
} from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useUpload } from "@workspace/object-storage-web";
import BoostWizard from "@/components/BoostWizard";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

function toStorageUrl(path: string | null | undefined): string {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  if (path.startsWith("/")) return path;
  return `/api/storage/objects/${path}`;
}

function daysLeft(isoDate: string | null): number | null {
  if (!isoDate) return null;
  const ms = new Date(isoDate).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

/** Prorated refund estimate shown in the confirmation dialog. */
function estimateRefund(boost: ActiveBoost): number {
  if (!boost.boostExpiresAt || !boost.budget) return 0;
  const start = boost.boostStartAt ? new Date(boost.boostStartAt).getTime() : null;
  const expires = new Date(boost.boostExpiresAt).getTime();
  const now = Date.now();
  const totalMs = start ? expires - start : null;
  const remainingMs = Math.max(0, expires - now);
  if (!totalMs || totalMs <= 0) return 0;
  return parseFloat((boost.budget * (remainingMs / totalMs)).toFixed(2));
}

interface ActiveBoost {
  listingId: number;
  title: string;
  price: number;
  thumbnail: string | null;
  boostVideoUrl: string | null;
  boostStartAt: string | null;
  boostExpiresAt: string | null;
  viewCount: number;
  impressions: number;
  clicks: number;
  boostId: number;
  plan: string;
  budget: number;
}

function StatChip({
  icon: Icon, value, label, color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  value: number;
  label: string;
  color: string;
}) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className={cn("flex items-center gap-1", color)}>
        <Icon className="h-3 w-3 shrink-0" />
        <span className="text-xs font-bold tabular-nums">{value.toLocaleString()}</span>
      </div>
      <span className="text-[9px] text-muted-foreground/70 font-medium leading-none">{label}</span>
    </div>
  );
}

export default function MyBoosts() {
  const { t } = useTranslation();
  const { token, user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [boosts, setBoosts] = useState<ActiveBoost[]>([]);
  const [loading, setLoading] = useState(true);
  const [wizardOpen, setWizardOpen] = useState(() => {
    try { return sessionStorage.getItem("bw_open_mb") === "1"; } catch { return false; }
  });

  // Inline "Add Video" state — tracks which boostId is being uploaded
  const [uploadingBoostId, setUploadingBoostId] = useState<number | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const pendingBoostRef = useRef<ActiveBoost | null>(null);
  const { uploadFile, progress: videoUploadProgress } = useUpload();

  const handleAddVideo = (boost: ActiveBoost) => {
    pendingBoostRef.current = boost;
    videoInputRef.current?.click();
  };

  const handleVideoFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    const boost = pendingBoostRef.current;
    if (!file || !boost || !token) return;

    // eslint-disable-next-line no-console
    console.info("[myboosts:add-video] start", { boostId: boost.boostId, listingId: boost.listingId, fileName: file.name, fileSize: file.size });
    setUploadingBoostId(boost.boostId);
    try {
      const result = await uploadFile(file);
      // eslint-disable-next-line no-console
      console.info("[myboosts:add-video] uploadFile resolved", { result });
      if (!result) {
        // eslint-disable-next-line no-console
        console.error("[myboosts:add-video] uploadFile returned null — see [upload:*] logs above");
        toast({ title: t("myBoosts.videoUploadFailed", { defaultValue: "Echèk telechajman videyo" }), variant: "destructive" });
        return;
      }
      // eslint-disable-next-line no-console
      console.info("[myboosts:add-video] PATCH /api/boost/:id/video", { boostId: boost.boostId, videoUrl: result.objectPath });
      const res = await fetch(`/api/boost/${boost.boostId}/video`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ videoUrl: result.objectPath }),
      });
      const data = await res.json().catch((parseErr) => {
        // eslint-disable-next-line no-console
        console.error("[myboosts:add-video] PATCH response body parse failed", parseErr);
        return {};
      });
      // eslint-disable-next-line no-console
      console.info("[myboosts:add-video] PATCH response", { status: res.status, ok: res.ok, body: data });
      if (!res.ok) {
        // eslint-disable-next-line no-console
        console.error("[myboosts:add-video] backend rejected save", { status: res.status, error: data?.error });
        toast({ title: data.error ?? t("myBoosts.videoUploadFailed", { defaultValue: "Echèk telechajman videyo" }), variant: "destructive" });
        return;
      }
      // eslint-disable-next-line no-console
      console.info("[myboosts:add-video] SUCCESS — video saved to boost");
      toast({ title: t("myBoosts.videoAdded", { defaultValue: "Videyo ajoute ✓" }) });
      fetchBoosts();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[myboosts:add-video] EXCEPTION during save", err);
      toast({ title: t("myBoosts.videoUploadFailed", { defaultValue: "Echèk telechajman videyo" }), variant: "destructive" });
    } finally {
      setUploadingBoostId(null);
      pendingBoostRef.current = null;
    }
  };
  const openWizard = () => {
    try { sessionStorage.setItem("bw_open_mb", "1"); } catch { /* ok */ }
    setWizardOpen(true);
  };

  // Cancel confirmation state
  const [cancelTarget, setCancelTarget] = useState<ActiveBoost | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const fetchBoosts = useCallback(async () => {
    if (!token) { setLoading(false); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/boost/my-active", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      setBoosts(Array.isArray(data.boosts) ? data.boosts : []);
    } catch { /* non-critical */ } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchBoosts(); }, [fetchBoosts]);

  const handleWizardClose = () => {
    try { sessionStorage.removeItem("bw_open_mb"); } catch { /* ok */ }
    setWizardOpen(false);
    fetchBoosts();
  };

  const handleCancelConfirm = async () => {
    if (!cancelTarget || !token) return;
    setCancelling(true);
    try {
      const res = await fetch(`/api/boost/${cancelTarget.boostId}/cancel`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erè");
      const refund: number = data.refundUsd ?? 0;
      toast({
        title: t("myBoosts.cancelledTitle", { defaultValue: "Boost anile" }),
        description: refund > 0
          ? t("myBoosts.cancelledRefund", { defaultValue: `$${refund.toFixed(2)} retounen sou FM Wallet ou.`, amount: refund.toFixed(2) })
          : t("myBoosts.cancelledNoRefund", { defaultValue: "Boost anile san rembourseman." }),
      });
      setCancelTarget(null);
      fetchBoosts();
    } catch (err: unknown) {
      toast({
        title: t("myBoosts.cancelError", { defaultValue: "Echèk anilasyon" }),
        description: err instanceof Error ? err.message : "Erè enkoni",
        variant: "destructive",
      });
    } finally {
      setCancelling(false);
    }
  };

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4 text-center px-6">
        <AlertCircle className="h-10 w-10 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{t("myBoosts.loginRequired")}</p>
        <Link href="/auth/login" className="text-primary text-sm font-semibold underline">{t("nav.signIn")}</Link>
      </div>
    );
  }

  const totalImpressions = boosts.reduce((s, b) => s + b.impressions, 0);
  const totalViews       = boosts.reduce((s, b) => s + b.viewCount, 0);
  const totalClicks      = boosts.reduce((s, b) => s + b.clicks, 0);

  return (
    <div className="min-h-screen bg-background">

      {/* ── Premium gradient header ─────────────────────────────────────── */}
      <div className="relative overflow-hidden bg-gradient-to-br from-orange-500 via-amber-500 to-orange-600">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.18),transparent_70%)]" />
        <div className="relative z-10 px-4 pt-3 pb-4 max-w-2xl mx-auto">
          <div className="flex items-center gap-2.5 mb-0">
            <div className="w-8 h-8 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center shadow-inner shrink-0">
              <Zap className="h-4 w-4 text-white" />
            </div>
            <div>
              <h1 className="text-white text-base font-black leading-tight">{t("myBoosts.title")}</h1>
              <p className="text-white/75 text-[11px]">{t("myBoosts.subtitle")}</p>
            </div>
          </div>

          {/* Summary stats strip — only when there are boosts */}
          {boosts.length > 0 && !loading && (
            <div className="mt-2.5 grid grid-cols-3 gap-1.5">
              {[
                { label: t("myBoosts.impressionsLabel"), value: totalImpressions, Icon: TrendingUp },
                { label: t("myBoosts.viewsLabel"),       value: totalViews,       Icon: Eye },
                { label: t("myBoosts.clicksLabel"),      value: totalClicks,      Icon: MousePointerClick },
              ].map(({ label, value, Icon }) => (
                <div key={label} className="bg-white/15 backdrop-blur-sm rounded-lg px-2 py-1.5 text-center">
                  <div className="flex items-center justify-center gap-1 mb-0.5">
                    <Icon className="h-3 w-3 text-white/80" />
                    <span className="text-white font-black text-sm tabular-nums">{value.toLocaleString()}</span>
                  </div>
                  <span className="text-white/70 text-[9px] font-medium">{label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Content ─────────────────────────────────────────────────────── */}
      <div className="max-w-2xl mx-auto px-4 pt-3 pb-16">

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-7 w-7 animate-spin text-primary" />
          </div>

        ) : boosts.length === 0 ? (
          <div className="bg-card rounded-2xl shadow-sm border border-border/60 p-8 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <Film className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h3 className="font-bold text-foreground text-base">{t("myBoosts.empty")}</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-xs mx-auto">{t("myBoosts.emptyDesc")}</p>
            </div>
            <button
              type="button"
              onClick={openWizard}
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground font-bold px-6 py-2.5 rounded-full shadow-md hover:opacity-90 transition-opacity text-sm"
            >
              <Zap className="h-4 w-4" />
              {t("myBoosts.boostCta")}
            </button>
          </div>

        ) : (
          <>
            <div className="space-y-3">
              {boosts.map(boost => {
                const days = daysLeft(boost.boostExpiresAt);
                const expiringSoon = days !== null && days <= 1;
                const refundEst = estimateRefund(boost);
                return (
                  <div
                    key={boost.boostId}
                    className="bg-card rounded-2xl shadow-sm border border-border/60 overflow-hidden"
                  >
                    <div className="flex gap-3 p-3">

                      {/* Thumbnail / video preview button */}
                      <button
                        type="button"
                        onClick={() => navigate(`/listings/${boost.listingId}/video`)}
                        className="relative w-20 h-20 rounded-xl overflow-hidden bg-muted shrink-0 group"
                      >
                        {boost.thumbnail ? (
                          <img
                            src={toStorageUrl(boost.thumbnail)}
                            alt={boost.title}
                            className="w-full h-full object-cover"
                          />
                        ) : boost.boostVideoUrl ? (
                          <div className="w-full h-full bg-gradient-to-br from-orange-500 to-rose-600 flex items-center justify-center">
                            <Play className="h-7 w-7 text-white fill-white opacity-90" />
                          </div>
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Film className="h-7 w-7 text-muted-foreground" />
                          </div>
                        )}
                        {boost.boostVideoUrl && (
                          <div className="absolute inset-0 bg-black/40 flex items-center justify-center group-hover:bg-black/55 transition-colors">
                            <div className="w-8 h-8 rounded-full bg-white/90 flex items-center justify-center shadow">
                              <Play className="h-3.5 w-3.5 text-black fill-black ml-0.5" />
                            </div>
                          </div>
                        )}
                      </button>

                      {/* Info */}
                      <div className="flex-1 min-w-0 py-0.5">
                        <div className="flex items-start gap-2">
                          <p className="font-bold text-foreground text-sm leading-snug line-clamp-2 flex-1">
                            {boost.title}
                          </p>
                          {days !== null && (
                            <span className={cn(
                              "shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap",
                              expiringSoon
                                ? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
                                : "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400",
                            )}>
                              {days === 0
                                ? t("myBoosts.expiresIn")
                                : days === 1
                                  ? t("myBoosts.daysLeft", { n: 1 })
                                  : t("myBoosts.daysLeftPlural", { n: days })}
                            </span>
                          )}
                        </div>

                        {/* Stats row */}
                        <div className="flex items-center gap-3 mt-2 pt-2 border-t border-border/50">
                          <StatChip icon={TrendingUp}         value={boost.impressions} label={t("myBoosts.impressionsLabel")} color="text-blue-500" />
                          <div className="w-px h-6 bg-border/50" />
                          <StatChip icon={Eye}                value={boost.viewCount}   label={t("myBoosts.viewsLabel")}       color="text-green-500" />
                          <div className="w-px h-6 bg-border/50" />
                          <StatChip icon={MousePointerClick}  value={boost.clicks}      label={t("myBoosts.clicksLabel")}      color="text-orange-500" />
                        </div>
                      </div>
                    </div>

                    {/* Action row */}
                    <div className="px-3 pb-3 flex gap-2">
                      {boost.boostVideoUrl ? (
                        <button
                          type="button"
                          onClick={() => navigate(`/listings/${boost.listingId}/video`)}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-muted text-foreground text-xs font-semibold hover:bg-accent transition-colors"
                        >
                          <Play className="h-3.5 w-3.5" />
                          {t("myBoosts.watchAd")}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleAddVideo(boost)}
                          disabled={uploadingBoostId === boost.boostId}
                          className="flex-1 flex flex-col items-stretch justify-center gap-1 py-2 px-2 rounded-xl bg-muted text-primary text-xs font-semibold hover:bg-accent transition-colors border border-primary/30 disabled:opacity-60"
                        >
                          {uploadingBoostId === boost.boostId ? (
                            <>
                              <span className="flex items-center justify-center gap-1.5">
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                {t("myBoosts.videoUploading", { defaultValue: "Ap telechaje…" })} {videoUploadProgress}%
                              </span>
                              <span
                                className="h-1 w-full bg-background/60 rounded-full overflow-hidden"
                                role="progressbar"
                                aria-valuenow={videoUploadProgress}
                                aria-valuemin={0}
                                aria-valuemax={100}
                                data-testid="video-upload-progress"
                              >
                                <span
                                  className="block h-full bg-primary transition-all duration-200"
                                  style={{ width: `${videoUploadProgress}%` }}
                                />
                              </span>
                            </>
                          ) : (
                            <span className="flex items-center justify-center gap-1.5">
                              <Upload className="h-3.5 w-3.5" />
                              {t("myBoosts.addVideo")}
                            </span>
                          )}
                        </button>
                      )}
                      <Link
                        href={`/boost/${boost.listingId}`}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:opacity-90 transition-opacity"
                      >
                        <Zap className="h-3.5 w-3.5" />
                        {t("myBoosts.manage")}
                      </Link>
                      {/* Cancel boost */}
                      <button
                        type="button"
                        onClick={() => setCancelTarget(boost)}
                        className="flex items-center justify-center w-10 rounded-xl bg-red-50 dark:bg-red-950/20 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors border border-red-200 dark:border-red-800/40"
                        title={t("myBoosts.cancelBoost", { defaultValue: "Anile boost" })}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    {/* Refund estimate hint */}
                    {refundEst > 0 && (
                      <p className="px-3 pb-2.5 text-[10px] text-muted-foreground">
                        {t("myBoosts.refundEstimate", { defaultValue: `Anile kounye a = ~$${refundEst.toFixed(2)} rembourseman`, amount: refundEst.toFixed(2) })}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Launch new boost CTA */}
            <button
              type="button"
              onClick={openWizard}
              className="mt-4 w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-dashed border-primary/30 text-primary text-sm font-bold hover:bg-primary/5 transition-colors"
            >
              <Zap className="h-4 w-4" />
              {t("myBoosts.boostAgain")}
            </button>
          </>
        )}
      </div>

      {/* Hidden file input for inline "Add Video" uploads */}
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={handleVideoFileSelected}
      />

      <BoostWizard open={wizardOpen} onClose={handleWizardClose} />

      {/* ── Cancel confirmation dialog ───────────────────────────────────── */}
      <AlertDialog open={!!cancelTarget} onOpenChange={open => { if (!open) setCancelTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("myBoosts.cancelDialogTitle", { defaultValue: "Anile boost la?" })}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  {t("myBoosts.cancelDialogDesc", {
                    defaultValue: `Boost pou "${cancelTarget?.title}" ap sispann imedyatman.`,
                    title: cancelTarget?.title ?? "",
                  })}
                </p>
                {cancelTarget && estimateRefund(cancelTarget) > 0 && (
                  <div className="mt-2 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800/40 px-3 py-2.5">
                    <p className="text-sm font-semibold text-green-700 dark:text-green-400">
                      💰 ~${estimateRefund(cancelTarget).toFixed(2)} {t("myBoosts.willBeRefunded", { defaultValue: "pral retounen sou FM Wallet ou" })}
                    </p>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>
              {t("common.cancel", { defaultValue: "Retounen" })}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancelConfirm}
              disabled={cancelling}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {cancelling
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t("myBoosts.cancelling", { defaultValue: "Ap anile…" })}</>
                : t("myBoosts.confirmCancel", { defaultValue: "Wi, anile boost" })
              }
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
