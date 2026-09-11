import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { ChevronDown, ChevronUp, FileVideo, Loader2, X } from "lucide-react";
import { useAuth } from "@/contexts/auth";
import {
  cancelVideoUpload,
  dismissVideoUpload,
  getVideoUploads,
  retryVideoUpload,
  setVideoUploadIdentity,
  subscribeVideoUploads,
  type VideoUploadJob,
  type VideoUploadPurpose,
} from "@/lib/videoUploadQueue";
import { cn } from "@/lib/utils";

const ACTIVE_STATES = new Set<VideoUploadJob["state"]>([
  "preparing",
  "uploading",
  "processing",
  "paused",
]);

const STATE_LABELS: Record<VideoUploadJob["state"], string> = {
  preparing: "Preparing",
  uploading: "Uploading",
  processing: "Processing",
  paused: "Paused",
  complete: "Complete",
  failed: "Failed",
  cancelled: "Cancelled",
};

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

function JobRow({
  job,
  onActionError,
}: {
  job: VideoUploadJob;
  onActionError: (message: string) => void;
}) {
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
    <div className="rounded-lg border border-border/70 bg-background/80 px-3 py-2.5">
      <div className="flex items-start gap-2">
        <FileVideo className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-sm font-medium text-foreground" title={job.fileName}>
              {job.fileName}
            </p>
            <span className="shrink-0 text-xs text-muted-foreground">
              {STATE_LABELS[job.state]}
            </span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
            <div
              className={cn(
                "h-full rounded-full transition-[width] duration-200",
                job.state === "failed"
                  ? "bg-destructive"
                  : job.state === "complete"
                    ? "bg-green-500"
                    : "bg-primary",
              )}
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <span>{progress}%{job.totalBytes > 0 ? ` · ${formatBytes(job.totalBytes)}` : ""}</span>
            <span className="capitalize">{job.purpose}</span>
          </div>
          {job.error && (
            <p className="mt-1 text-xs text-destructive" role="alert">
              {job.error}
            </p>
          )}
          {job.state === "failed" && (
            <p className="mt-1 text-xs text-muted-foreground">
              Try again to resume this upload. Your saved upload can recover when the app is reopened.
            </p>
          )}
          {job.state === "paused" && (
            <p className="mt-1 text-xs text-muted-foreground">
              This upload is paused and will resume when the app is reopened.
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {(job.state === "failed" || job.state === "paused") && (
            <button
              type="button"
              className="rounded px-1.5 py-1 text-xs font-semibold text-primary hover:bg-primary/10 disabled:opacity-50"
              onClick={() => retryVideoUpload(job.id)}
              disabled={busy}
            >
              Try again
            </button>
          )}
          {(active || job.state === "failed") && (
            <button
              type="button"
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-50"
              onClick={() => void runAction(
                () => cancelVideoUpload(job.id),
                "We could not cancel this upload. Try again.",
              )}
              disabled={busy}
              aria-label={`Cancel ${job.fileName}`}
              title="Cancel upload"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
            </button>
          )}
          {(job.state === "complete" || job.state === "cancelled") && (
            <button
              type="button"
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-50"
              onClick={() => void runAction(
                () => dismissVideoUpload(job.id),
                "We could not remove this upload. Try again.",
              )}
              disabled={busy}
              aria-label={`Remove ${job.fileName}`}
              title="Remove upload"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Persistent, account-scoped upload controls. This component intentionally
 * lives above the router in App so changing pages does not interrupt the
 * durable queue.
 */
export default function VideoUploadCenter() {
  const { user, token } = useAuth();
  const jobs = useSyncExternalStore(
    subscribeVideoUploads,
    getVideoUploads,
    getVideoUploads,
  );
  const [expanded, setExpanded] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    setVideoUploadIdentity(user?.id ?? null, token ?? null);
  }, [user?.id, token]);

  const ownJobs = useMemo(
    () => user ? jobs.filter(job => job.ownerId === user.id) : [],
    [jobs, user?.id],
  );

  if (ownJobs.length === 0) return null;

  const activeCount = ownJobs.filter(job => ACTIVE_STATES.has(job.state)).length;
  const completeCount = ownJobs.filter(job => job.state === "complete").length;

  return (
    <aside
      className="fixed bottom-4 right-4 z-50 w-[min(24rem,calc(100vw-2rem))] rounded-xl border border-border bg-card/95 p-2 shadow-lg backdrop-blur"
      aria-label="Video uploads"
      data-testid="video-upload-center"
    >
      <button
        type="button"
        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-muted/60"
        onClick={() => {
          setActionError(null);
          setExpanded(value => !value);
        }}
        aria-expanded={expanded}
      >
        <FileVideo className="h-4 w-4 shrink-0 text-primary" />
        <span className="min-w-0 flex-1 text-sm font-semibold text-foreground">
          Video uploads
        </span>
        {activeCount > 0 && (
          <span className="text-xs text-muted-foreground">
            {activeCount} active
          </span>
        )}
        {completeCount > 0 && (
          <span className="text-xs text-green-600 dark:text-green-400">
            {completeCount} ready
          </span>
        )}
        {expanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronUp className="h-4 w-4 shrink-0" />}
      </button>

      {expanded && (
        <div className="mt-2 space-y-2 border-t border-border/70 pt-2">
          <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">
            Native-supported transfers continue after preparation. On the web, uploads resume when you reopen the app, but recovery is not guaranteed in every browser.
          </p>
          {actionError && (
            <p className="px-1 text-xs text-destructive" role="alert">{actionError}</p>
          )}
          {[...ownJobs]
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .map(job => (
              <JobRow key={job.id} job={job} onActionError={setActionError} />
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
}: {
  purpose: VideoUploadPurpose;
  onUse: (url: string) => void;
  className?: string;
}) {
  const { user } = useAuth();
  const jobs = useSyncExternalStore(
    subscribeVideoUploads,
    getVideoUploads,
    getVideoUploads,
  );
  const completed = useMemo(
    () => user
      ? jobs.filter(job => job.ownerId === user.id && job.purpose === purpose && job.state === "complete" && !!job.url)
      : [],
    [jobs, purpose, user?.id],
  );

  if (completed.length === 0) return null;

  return (
    <div className={cn("space-y-2 rounded-lg border border-border/70 bg-muted/30 p-3", className)} data-testid={`video-upload-chooser-${purpose}`}>
      <p className="text-xs font-semibold text-foreground">Completed uploads</p>
      <p className="text-xs text-muted-foreground">Use a completed video without publishing or purchasing anything.</p>
      <div className="space-y-1.5">
        {completed.map(job => (
          <div key={job.id} className="flex items-center gap-2">
            <FileVideo className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate text-xs text-foreground" title={job.fileName}>
              {job.fileName}
            </span>
            <button
              type="button"
              className="shrink-0 rounded-md border border-border bg-background px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/10"
              onClick={() => job.url && onUse(job.url)}
              data-testid={`button-use-video-upload-${job.id}`}
            >
              Use
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}