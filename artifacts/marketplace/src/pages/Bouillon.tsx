import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { FileVideo, ArrowLeft } from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { Button } from "@/components/ui/button";
import { VideoUploadJobRow } from "@/components/VideoUploadCenter";
import {
  defaultReturnPathForPurpose,
  getVideoUploads,
  setVideoUploadIdentity,
  subscribeVideoUploads,
  type VideoUploadJob,
} from "@/lib/videoUploadQueue";
import "@/components/video-upload-center.css";

export default function Bouillon() {
  const { t } = useTranslation();
  const { user, token, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [actionError, setActionError] = useState<string | null>(null);
  const jobs = useSyncExternalStore(
    subscribeVideoUploads,
    getVideoUploads,
    getVideoUploads,
  );

  useEffect(() => {
    setVideoUploadIdentity(user?.id ?? null, token ?? null);
  }, [user?.id, token]);

  useEffect(() => {
    if (!isLoading && !user) setLocation("/auth/login");
  }, [user, isLoading, setLocation]);

  const ownJobs = useMemo(() => {
    if (!user) return [] as VideoUploadJob[];
    return jobs
      .filter((job) => job.ownerId === user.id && job.state !== "cancelled")
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [jobs, user?.id]);

  const continueJob = (job: VideoUploadJob) => {
    const path =
      job.returnPath ||
      defaultReturnPathForPurpose(job.purpose) ||
      (job.purpose === "listing" ? "/sell" : "/booster/create");
    setLocation(path);
  };

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl px-3 py-8 text-sm text-muted-foreground">
        {t("common.loading", { defaultValue: "Loading…" })}
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-3 py-4 pb-24 sm:px-4 sm:py-5">
      <div className="flex items-start gap-2">
        <Link
          href="/"
          className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-full hover:bg-accent"
          aria-label={t("common.back", { defaultValue: "Back" })}
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-extrabold text-foreground sm:text-2xl">
            {t("nav.bouillon", { defaultValue: "Bouillon" })}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {t("bouillon.subtitle", {
              defaultValue: "Drafts and finished video uploads ready to use in Boost or Sell.",
            })}
          </p>
        </div>
      </div>

      {actionError ? (
        <p className="text-sm text-red-600" role="alert">
          {actionError}
        </p>
      ) : null}

      {ownJobs.length === 0 ? (
        <div className="rounded-xl border border-card-border bg-card px-4 py-12 text-center">
          <FileVideo className="mx-auto mb-2 h-10 w-10 text-muted-foreground" />
          <p className="font-semibold text-foreground">
            {t("bouillon.empty", { defaultValue: "No videos in Bouillon yet" })}
          </p>
          <p className="mt-1 mb-4 text-sm text-muted-foreground">
            {t("bouillon.emptyHint", {
              defaultValue: "When you upload a boost or listing video, it stays here until you use or remove it.",
            })}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button asChild size="sm">
              <Link href="/booster/create">{t("booster.nav.create", { defaultValue: "Create Boost" })}</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/sell">{t("nav.sell", { defaultValue: "Sell" })}</Link>
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2 rounded-xl border border-border/70 bg-card p-3">
          <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">
            {t("bouillon.hint", {
              defaultValue:
                "Use Continue to return to your Boost or Sell flow. Dismiss removes a finished upload from this list.",
            })}
          </p>
          {ownJobs.map((job) => (
            <VideoUploadJobRow
              key={job.id}
              job={job}
              onActionError={setActionError}
              onContinue={continueJob}
            />
          ))}
        </div>
      )}
    </div>
  );
}
