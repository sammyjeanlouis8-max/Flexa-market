import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  FileVideo,
  Loader2,
  Minimize2,
  X,
} from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import {
  cancelVideoUpload,
  defaultReturnPathForPurpose,
  dismissVideoUpload,
  getVideoUploads,
  retryVideoUpload,
  setVideoUploadIdentity,
  subscribeVideoUploads,
  type VideoUploadJob,
  type VideoUploadPurpose,
} from "@/lib/videoUploadQueue";
import { cn } from "@/lib/utils";
import "@/components/video-upload-center.css";

const HIDE_KEY = "flexa_video_upload_bar_hidden";

const ACTIVE_STATES = new Set<VideoUploadJob["state"]>([
  "draft",
  "queued",
  "preparing",
  "uploading",
  "processing",
  "waiting_for_connection",
  "paused",
]);

const NEEDS_ATTENTION = new Set<VideoUploadJob["state"]>([
  "failed",
  "waiting_for_connection",
  "paused",
]);

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

function progressFor(job: VideoUploadJob): number {
  return Math.max(0, Math.min(100, Math.round(job.progress || 0)));
}

function stateLabel(job: VideoUploadJob, translate: (key: string, opts?: object) => string): string {
  const progress = progressFor(job);
  switch (job.state) {
    case "draft":
      return translate("videoUploads.stateDraft", { defaultValue: "Draft" });
    case "queued":
      return translate("videoUploads.stateQueued", { defaultValue: "Queued" });
    case "preparing":
      return translate("videoUploads.statePreparing", { defaultValue: "Preparing" });
    case "uploading":
      return translate("boost.videoUploadingPct", {
        percent: progress,
        defaultValue: "Uploading video: {{percent}}%",
      });
    case "processing":
      return translate("boost.videoProcessing", { defaultValue: "Processing video…" });
    case "waiting_for_connection":
      return translate("videoUploads.stateWaitingConnection", { defaultValue: "Waiting for connection" });
    case "paused":
      return translate("boost.videoUploadPaused", { defaultValue: "Paused" });
    case "complete":
      return translate("videoUploads.stateCompleted", { defaultValue: "Completed" });
    case "failed":
      return translate("videoUploads.stateFailed", { defaultValue: "Failed" });
    case "cancelled":
      return translate("boost.videoUploadCancelled", { defaultValue: "Cancelled" });
    default:
      return job.state;
  }
}

export function VideoUploadJobRow({
  job,
  onActionError,
  onContinue,
}: {
  job: VideoUploadJob;
  onActionError: (message: string) => void;
  onContinue: (job: VideoUploadJob) => void;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const progress = progressFor(job);
  const active = ACTIVE_STATES.has(job.state);

  const runAction = async (action: () => void | Promise<void>, message: string) => {
    setBusy(true);
    try {
      await action();
    } catch {
      onActionError(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="vuc-job">
      <div className="flex items-start gap-2">
        <FileVideo className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-sm font-medium text-slate-900" title={job.fileName}>
              {job.fileName}
            </p>
            <span className="shrink-0 text-[11px] font-semibold text-slate-500 max-w-[48%] text-right">
              {stateLabel(job, t as (key: string, opts?: object) => string)}
            </span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-violet-100" aria-hidden="true">
            <div
              className={cn(
                "h-full rounded-full transition-[width] duration-200",
                job.state === "failed"
                  ? "bg-red-500"
                  : job.state === "complete"
                    ? "bg-emerald-500"
                    : job.state === "waiting_for_connection"
                      ? "bg-amber-400"
                      : "bg-violet-600",
              )}
              style={{
                width: `${Math.max(
                  active && job.state !== "waiting_for_connection" ? 2 : 0,
                  progress,
                )}%`,
              }}
            />
          </div>
          <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-slate-500">
            <span>
              {progress}%{job.totalBytes > 0 ? ` · ${formatBytes(job.totalBytes)}` : ""}
            </span>
            <span className="capitalize">{job.purpose}</span>
          </div>
          {job.error && (
            <p className="mt-1 text-xs text-red-600" role="alert">
              {job.error}
            </p>
          )}
          {job.state === "waiting_for_connection" && (
            <p className="mt-1 text-xs text-amber-700">
              {t("videoUploads.waitingHint", {
                defaultValue: "Upload paused safely. It will resume when you are back online.",
              })}
            </p>
          )}
          {(job.state === "failed" || job.state === "paused") && (
            <p className="mt-1 text-xs text-slate-500">
              {t("videoUploads.retryHint", {
                defaultValue: "Try again to resume. Your saved upload can recover when the app is reopened.",
              })}
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {(job.state === "failed" ||
              job.state === "paused" ||
              job.state === "waiting_for_connection") && (
              <button
                type="button"
                className="vuc-chip-btn"
                onClick={() => retryVideoUpload(job.id)}
                disabled={busy}
              >
                {t("videoUploads.retry", { defaultValue: "Retry upload" })}
              </button>
            )}
            {(job.state === "complete" || active || job.state === "failed") && (
              <button
                type="button"
                className="vuc-chip-btn"
                onClick={() => onContinue(job)}
              >
                {t("videoUploads.continueWorkflow", { defaultValue: "Continue" })}
              </button>
            )}
            {active && (
              <button
                type="button"
                className="vuc-chip-btn vuc-chip-danger"
                onClick={() =>
                  void runAction(
                    () => cancelVideoUpload(job.id),
                    t("videoUploads.cancelFailed", {
                      defaultValue: "We could not cancel this upload. Try again.",
                    }),
                  )
                }
                disabled={busy}
              >
                {busy ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  t("videoUploads.cancelUpload", { defaultValue: "Cancel upload" })
                )}
              </button>
            )}
            {(job.state === "complete" || job.state === "cancelled" || job.state === "failed") && (
              <button
                type="button"
                className="vuc-chip-btn"
                onClick={() =>
                  void runAction(
                    () => dismissVideoUpload(job.id),
                    t("videoUploads.dismissFailed", {
                      defaultValue: "We could not remove this upload. Try again.",
                    }),
                  )
                }
                disabled={busy}
              >
                {t("videoUploads.dismiss", { defaultValue: "Dismiss" })}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Persistent, account-scoped upload controls. Lives above the router in App so
 * navigation does not interrupt the durable IndexedDB queue.
 *
 * Closing / minimizing the bar NEVER cancels uploads — only Cancel upload does.
 */
export default function VideoUploadCenter() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { user, token } = useAuth();
  const jobs = useSyncExternalStore(
    subscribeVideoUploads,
    getVideoUploads,
    getVideoUploads,
  );
  const [expanded, setExpanded] = useState(false);
  const [hidden, setHidden] = useState(() => {
    try {
      return sessionStorage.getItem(HIDE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [actionError, setActionError] = useState<string | null>(null);
  const autoHideTimer = useRef<number | null>(null);
  const celebratedRef = useRef<string>("");

  useEffect(() => {
    setVideoUploadIdentity(user?.id ?? null, token ?? null);
  }, [user?.id, token]);

  const ownJobs = useMemo(
    () => (user ? jobs.filter((job) => job.ownerId === user.id) : []),
    [jobs, user?.id],
  );

  const activeJobs = ownJobs.filter((job) => ACTIVE_STATES.has(job.state));
  const attentionJobs = ownJobs.filter((job) => NEEDS_ATTENTION.has(job.state));
  const completeCount = ownJobs.filter((job) => job.state === "complete").length;
  const inFlight =
    ownJobs.length > 0 &&
    ownJobs.some((job) => ACTIVE_STATES.has(job.state) || NEEDS_ATTENTION.has(job.state));
  const allSettled =
    ownJobs.length > 0 &&
    !inFlight &&
    ownJobs.every((job) => job.state === "complete" || job.state === "cancelled");
  const leadActive = activeJobs.slice().sort((a, b) => b.updatedAt - a.updatedAt)[0];
  const leadPercent = leadActive ? progressFor(leadActive) : 0;

  // Re-show the bar only while uploads are active or need attention.
  useEffect(() => {
    if (activeJobs.length > 0 || attentionJobs.length > 0) {
      setHidden(false);
      try {
        sessionStorage.removeItem(HIDE_KEY);
      } catch {
        /* ignore */
      }
      if (autoHideTimer.current) {
        window.clearTimeout(autoHideTimer.current);
        autoHideTimer.current = null;
      }
    }
  }, [activeJobs.length, attentionJobs.length, ownJobs.map((j) => `${j.id}:${j.state}`).join("|")]);

  // When everything settles, toast once and drop the floating bar.
  // Completed leftovers live on the Bouillon menu page — not above the nav.
  useEffect(() => {
    if (!allSettled || completeCount === 0) return;
    const fingerprint = ownJobs.map((j) => `${j.id}:${j.state}`).join("|");
    if (celebratedRef.current !== fingerprint) {
      celebratedRef.current = fingerprint;
      toast({
        title: t("myDrafts.videoReadyTitle", { defaultValue: "Video Ready" }),
        description: t("myDrafts.videoReadyMessage", {
          defaultValue: "Your video has finished uploading and is ready to use.",
        }),
        action: (
          <ToastAction
            altText={t("myDrafts.viewDraft", { defaultValue: "View Draft" })}
            onClick={() => setLocation("/my-drafts")}
          >
            {t("myDrafts.viewDraft", { defaultValue: "View Draft" })}
          </ToastAction>
        ),
      });
    }
    setExpanded(false);
    setHidden(true);
    try {
      sessionStorage.setItem(HIDE_KEY, "1");
    } catch {
      /* ignore */
    }
  }, [allSettled, completeCount, ownJobs, t, toast, setLocation]);

  const hideBar = () => {
    // Visibility only — never cancels uploads.
    setExpanded(false);
    setHidden(true);
    try {
      sessionStorage.setItem(HIDE_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  const openManager = () => {
    setHidden(false);
    setExpanded(true);
    setActionError(null);
    try {
      sessionStorage.removeItem(HIDE_KEY);
    } catch {
      /* ignore */
    }
  };

  const continueJob = (job: VideoUploadJob) => {
    const path =
      job.returnPath ||
      defaultReturnPathForPurpose(job.purpose) ||
      (job.purpose === "listing" ? "/sell" : "/booster/create");
    setExpanded(false);
    setLocation(path);
  };

  // Never park completed-only leftovers above the nav — those belong on /bouillon.
  if (!user || (activeJobs.length === 0 && attentionJobs.length === 0)) return null;

  // If hidden but still active, show a tiny restore chip above the nav.
  if (hidden) {
    return (
      <aside
        className="vuc-restore"
        data-testid="video-upload-center-restore"
      >
        <button type="button" className="vuc-restore-btn" onClick={openManager}>
          <FileVideo className="h-3.5 w-3.5" />
          <span>
            {activeJobs.length > 0
              ? t("boost.videoUploadingPct", {
                  percent: leadPercent,
                  defaultValue: "Uploading video: {{percent}}%",
                })
              : t("boost.videoUploadsTitle", { defaultValue: "Video uploads" })}
          </span>
        </button>
      </aside>
    );
  }

  return (
    <aside
      className={cn("vuc-shell", expanded && "vuc-shell-expanded")}
      aria-label={t("boost.videoUploadsTitle", { defaultValue: "Video uploads" })}
      data-testid="video-upload-center"
    >
      <div className="vuc-bar">
        <button
          type="button"
          className="vuc-bar-main"
          onClick={() => {
            setActionError(null);
            setExpanded((value) => !value);
          }}
          aria-expanded={expanded}
        >
          <FileVideo className="h-4 w-4 shrink-0 text-violet-600" />
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">
            {t("boost.videoUploadsTitle", { defaultValue: "Video uploads" })}
          </span>
          {activeJobs.length > 0 && leadActive ? (
            <span className="text-xs font-semibold text-violet-700 tabular-nums shrink-0">
              {t("boost.videoUploadingPct", {
                percent: leadPercent,
                defaultValue: "Uploading video: {{percent}}%",
              })}
            </span>
          ) : null}
          {activeJobs.length > 0 && (
            <span className="text-[11px] text-slate-500 shrink-0">
              {t("boost.videoUploadsActive", {
                count: activeJobs.length,
                defaultValue: "{{count}} active",
              })}
            </span>
          )}
          {completeCount > 0 && (
            <span className="text-[11px] text-emerald-600 shrink-0">
              {t("boost.videoUploadsReady", {
                count: completeCount,
                defaultValue: "{{count}} ready",
              })}
            </span>
          )}
          {expanded ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />
          ) : (
            <ChevronUp className="h-4 w-4 shrink-0 text-slate-500" />
          )}
        </button>
        <button
          type="button"
          className="vuc-icon-btn"
          onClick={() => setExpanded(false)}
          aria-label={t("videoUploads.minimize", { defaultValue: "Minimize" })}
          title={t("videoUploads.minimize", { defaultValue: "Minimize" })}
        >
          <Minimize2 className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          className="vuc-icon-btn"
          onClick={hideBar}
          aria-label={t("videoUploads.closeBar", { defaultValue: "Close upload bar" })}
          title={t("videoUploads.closeBarHint", {
            defaultValue: "Hide the bar. Uploads keep running in the background.",
          })}
          data-testid="video-upload-center-close"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {expanded && (
        <div className="vuc-panel">
          <p className="px-1 text-[11px] leading-relaxed text-slate-500">
            {t("videoUploads.managerHint", {
              defaultValue:
                "Closing this bar does not cancel uploads. Use Cancel upload only when you want to stop a transfer.",
            })}
          </p>
          {actionError && (
            <p className="px-1 text-xs text-red-600" role="alert">
              {actionError}
            </p>
          )}
          {[...ownJobs]
            .filter((job) => ACTIVE_STATES.has(job.state) || NEEDS_ATTENTION.has(job.state))
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .map((job) => (
              <VideoUploadJobRow
                key={job.id}
                job={job}
                onActionError={setActionError}
                onContinue={continueJob}
              />
            ))}
        </div>
      )}
    </aside>
  );
}

export function VideoUploadChooser({
  purpose,
  onUse,
  className,
  compact = false,
}: {
  purpose: VideoUploadPurpose;
  onUse: (url: string) => void;
  className?: string;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const jobs = useSyncExternalStore(
    subscribeVideoUploads,
    getVideoUploads,
    getVideoUploads,
  );
  const completed = useMemo(() => {
    if (!user) return [];
    const list = jobs
      .filter(
        (job) =>
          job.ownerId === user.id &&
          job.purpose === purpose &&
          job.state === "complete" &&
          !!job.url,
      )
      .sort((a, b) => b.updatedAt - a.updatedAt);
    const seen = new Set<string>();
    const unique: typeof list = [];
    for (const job of list) {
      const key = String(job.url);
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(job);
    }
    return unique;
  }, [jobs, purpose, user?.id]);

  if (completed.length === 0) return null;

  const list = (
    <div className="space-y-1.5">
      {completed.map((job) => (
        <div key={job.id} className="flex items-center gap-2">
          <FileVideo className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate text-xs text-foreground" title={job.fileName}>
            {job.fileName}
          </span>
          <button
            type="button"
            className="shrink-0 rounded-md border border-border bg-background px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/10"
            onClick={() => {
              if (job.url) onUse(job.url);
              setOpen(false);
            }}
            data-testid={`button-use-video-upload-${job.id}`}
          >
            {t("boost.useVideo", { defaultValue: "Use" })}
          </button>
        </div>
      ))}
    </div>
  );

  if (compact) {
    return (
      <div className={cn("bpv-saved-wrap", className)} data-testid={`video-upload-chooser-${purpose}`}>
        <button
          type="button"
          className="bpv-btn bpv-btn-saved"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          data-testid="boost-saved-videos-toggle"
        >
          <FileVideo className="h-3.5 w-3.5" />
          {t("boost.savedVideosCount", {
            count: completed.length,
            defaultValue: "Saved Videos ({{count}})",
          })}
          {open ? (
            <ChevronDown className="h-3.5 w-3.5 ml-auto opacity-90" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 ml-auto opacity-90" />
          )}
        </button>
        {open ? (
          <div className="bpv-saved-panel mt-2 space-y-2">
            <p className="text-[11px] text-slate-500">
              {t("boost.completedUploadsHint", {
                defaultValue: "Use a completed video without publishing or purchasing anything.",
              })}
            </p>
            {list}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={cn("space-y-2 rounded-lg border border-border/70 bg-muted/30 p-3", className)}
      data-testid={`video-upload-chooser-${purpose}`}
    >
      <p className="text-xs font-semibold text-foreground">
        {t("boost.completedUploads", { defaultValue: "Completed uploads" })}
      </p>
      <p className="text-xs text-muted-foreground">
        {t("boost.completedUploadsHint", {
          defaultValue: "Use a completed video without publishing or purchasing anything.",
        })}
      </p>
      {list}
    </div>
  );
}
