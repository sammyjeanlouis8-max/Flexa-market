import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CheckCircle2,
  Loader2,
  RefreshCw,
  Trash2,
  Upload,
  Video,
} from "lucide-react";
import { AdaptiveVideoPlayer, type AdaptiveVideoMeta } from "@/components/media/AdaptiveVideoPlayer";
import { VideoUploadChooser } from "@/components/VideoUploadCenter";
import { cn } from "@/lib/utils";

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const s = Math.round(seconds);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function formatRatioLabel(ratio: number): string {
  if (!Number.isFinite(ratio) || ratio <= 0) return "";
  const candidates: Array<[string, number]> = [
    ["16:9", 16 / 9],
    ["9:16", 9 / 16],
    ["1:1", 1],
    ["4:5", 4 / 5],
    ["3:4", 3 / 4],
    ["4:3", 4 / 3],
    ["3:2", 3 / 2],
    ["21:9", 21 / 9],
  ];
  let best = candidates[0];
  let bestDiff = Math.abs(ratio - best[1]);
  for (const c of candidates) {
    const d = Math.abs(ratio - c[1]);
    if (d < bestDiff) {
      best = c;
      bestDiff = d;
    }
  }
  return bestDiff < 0.08 ? best[0] : `${ratio.toFixed(2)}:1`;
}

type Props = {
  videoUrl: string | null;
  /** Local blob / crisp preview URL while the remote upload settles. */
  previewUrl?: string | null;
  /** Captured first-frame JPEG so the thumbnail is never a blank box. */
  posterUrl?: string | null;
  onPoster?: (dataUrl: string) => void;
  uploading: boolean;
  uploadPercent: number;
  onPick: () => void;
  onRemove: () => void;
  onUseSaved: (url: string) => void;
  className?: string;
  maxPreviewHeight?: number;
};

/**
 * Crystal-glass promo video panel shared by Boost Listing / Promotional Videos.
 */
export function BoostPromoVideoPanel({
  videoUrl,
  previewUrl = null,
  posterUrl = null,
  onPoster,
  uploading,
  uploadPercent,
  onPick,
  onRemove,
  onUseSaved,
  className,
  maxPreviewHeight = 420,
}: Props) {
  const { t } = useTranslation();
  const [meta, setMeta] = useState<AdaptiveVideoMeta | null>(null);
  const playbackSrc = previewUrl || videoUrl;

  const durationLabel = useMemo(
    () => (meta ? formatDuration(meta.duration) : null),
    [meta],
  );
  const ratioLabel = useMemo(
    () => (meta ? formatRatioLabel(meta.ratio) : null),
    [meta],
  );
  const withinLimit = !meta || meta.duration <= 120 + 0.5;

  return (
    <section
      className={cn("bpv-glass", className)}
      data-testid="boost-video-section"
    >
      <header className="bpv-head">
        <div className="bpv-head-icon" aria-hidden="true">
          <Video className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="bpv-title">
              {t("boost.promoVideoTitle", { defaultValue: "Promo Video" })}
            </h3>
            <span className="bpv-optional">
              {t("boost.optionalBadge", { defaultValue: "Optional" })}
            </span>
          </div>
          <p className="bpv-help">
            {t("boost.videoHelpShowcase", {
              defaultValue: "Add a video to showcase your product. Max duration:",
            })}{" "}
            <strong>{t("boost.videoMax2Min", { defaultValue: "2 minutes." })}</strong>
          </p>
        </div>
      </header>

      {playbackSrc ? (
        <div className="bpv-body">
          <div className="bpv-player-col">
            <AdaptiveVideoPlayer
              src={playbackSrc}
              poster={posterUrl}
              maxHeight={maxPreviewHeight}
              muted={false}
              controls
              autoPlay={false}
              onMeta={setMeta}
              onPoster={onPoster}
              className="bpv-player"
            />
          </div>

          <aside className="bpv-meta-col">
            <div className="bpv-status-card">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900">
                    {t("boost.videoUploaded", { defaultValue: "Video Uploaded" })}
                  </p>
                  <p className="text-xs font-semibold text-emerald-600 tabular-nums">
                    {t("boost.videoPercentComplete", {
                      percent: 100,
                      defaultValue: "{{percent}}% Complete",
                    })}
                  </p>
                </div>
              </div>
              <div className="bpv-progress bpv-progress-done" aria-hidden="true">
                <i style={{ width: "100%" }} />
              </div>
            </div>

            <ul className="bpv-specs">
              <li>
                <span>{t("boost.videoDuration", { defaultValue: "Duration" })}</span>
                <strong className="tabular-nums">{durationLabel ?? "—"}</strong>
              </li>
              {meta && meta.width > 0 && meta.height > 0 ? (
                <li>
                  <span>{t("boost.videoResolution", { defaultValue: "Resolution" })}</span>
                  <strong className="tabular-nums">
                    {meta.width} × {meta.height}
                    {ratioLabel ? ` (${ratioLabel})` : ""}
                  </strong>
                </li>
              ) : null}
              <li>
                <span>{t("boost.videoLimit", { defaultValue: "Limit" })}</span>
                <strong className={withinLimit ? "text-emerald-600" : "text-red-600"}>
                  {withinLimit
                    ? t("boost.within2Minutes", { defaultValue: "Within 2 minutes" })
                    : t("boost.videoTooLong", { defaultValue: "Video cannot exceed 2 minutes." })}
                </strong>
              </li>
            </ul>
          </aside>

          <div className="bpv-status-row" aria-live="polite">
            <span className="bpv-chip ok">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {t("boost.videoReadyWithDuration", {
                duration: durationLabel ?? "—",
                defaultValue: "Video ready ({{duration}})",
              })}
            </span>
            <span className={cn("bpv-chip", withinLimit ? "ok" : "bad")}>
              <CheckCircle2 className="h-3.5 w-3.5" />
              {withinLimit
                ? t("boost.within2Minutes", { defaultValue: "Within 2 minutes" })
                : t("boost.videoTooLong", { defaultValue: "Video cannot exceed 2 minutes." })}
            </span>
            <span className="bpv-chip ok bpv-chip-right">
              {t("boost.videoPercentUploaded", {
                percent: 100,
                defaultValue: "{{percent}}% Uploaded",
              })}
            </span>
          </div>
          <div className="bpv-progress bpv-progress-done bpv-progress-full" aria-hidden="true">
            <i style={{ width: "100%" }} />
          </div>

          <div className="bpv-actions">
            <button type="button" className="bpv-btn bpv-btn-replace" onClick={onPick} data-testid="boost-video-replace">
              <RefreshCw className="h-3.5 w-3.5" />
              {t("boost.replaceVideo", { defaultValue: "Replace Video" })}
            </button>
            <button type="button" className="bpv-btn bpv-btn-remove" onClick={onRemove} data-testid="button-video-remove">
              <Trash2 className="h-3.5 w-3.5" />
              {t("boost.removeVideo", { defaultValue: "Remove" })}
            </button>
            <div className="bpv-saved-slot">
              <VideoUploadChooser
                purpose="boost"
                onUse={onUseSaved}
                className="bpv-chooser"
                compact
              />
            </div>
          </div>
        </div>
      ) : uploading ? (
        <div className="space-y-3" role="status" aria-live="polite" data-testid="boost-video-upload-progress">
          {(posterUrl || previewUrl) ? (
            <div className="relative overflow-hidden rounded-2xl bg-slate-900">
              {posterUrl ? (
                <img
                  src={posterUrl}
                  alt=""
                  className="mx-auto w-full object-contain"
                  style={{ maxHeight: maxPreviewHeight }}
                  data-testid="boost-upload-poster"
                />
              ) : previewUrl ? (
                <AdaptiveVideoPlayer
                  src={previewUrl}
                  poster={posterUrl}
                  maxHeight={maxPreviewHeight}
                  muted
                  controls={false}
                  onPoster={onPoster}
                />
              ) : null}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-3 py-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-white">
                  <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                  {uploadPercent < 100
                    ? t("boost.videoUploadingPct", {
                        percent: uploadPercent,
                        defaultValue: "Uploading video: {{percent}}%",
                      })
                    : t("boost.videoProcessing", { defaultValue: "Processing video…" })}
                </div>
                <div className="bpv-progress mt-2">
                  <i style={{ width: `${Math.max(2, uploadPercent)}%` }} />
                </div>
              </div>
            </div>
          ) : (
            <div className="bpv-upload-progress">
              <div className="flex items-center justify-center gap-2 text-sm font-semibold text-violet-700">
                <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                <span>
                  {uploadPercent < 100
                    ? t("boost.videoUploadingPct", {
                        percent: uploadPercent,
                        defaultValue: "Uploading video: {{percent}}%",
                      })
                    : t("boost.videoProcessing", { defaultValue: "Processing video…" })}
                </span>
              </div>
              <div className="bpv-progress">
                <i style={{ width: `${Math.max(2, uploadPercent)}%` }} />
              </div>
            </div>
          )}
          <p className="text-[11px] text-slate-500 text-center">
            {uploadPercent < 100
              ? t("boost.videoUploadKeepOpen", {
                  defaultValue: "Keep this page open while the video uploads.",
                })
              : t("boost.videoProcessing", { defaultValue: "Processing video…" })}
          </p>
        </div>
      ) : (
        <button
          type="button"
          className="bpv-pick"
          onClick={onPick}
          data-testid="button-video-pick"
        >
          <Upload className="h-4 w-4" />
          {t("boost.videoPick", { defaultValue: "Upload Media" })}
        </button>
      )}

      {!videoUrl && !uploading ? (
        <div className="mt-3">
          <VideoUploadChooser purpose="boost" onUse={onUseSaved} className="bpv-chooser" compact />
        </div>
      ) : null}
    </section>
  );
}
