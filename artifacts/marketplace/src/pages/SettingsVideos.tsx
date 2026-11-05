import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/auth";
import { ArrowLeft, Film, Loader2, Plus, Play, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface OwnerVideo {
  listingId: number;
  title: string;
  thumbnail: string | null;
  boostVideoUrl: string | null;
  isExpired: boolean;
  impressions: number;
  clicks: number;
  plan: string | null;
  budget: number | null;
}

export default function SettingsVideos() {
  const { user, token } = useAuth();
  const { t } = useTranslation();
  const [videos, setVideos] = useState<OwnerVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetch("/api/boost/my-active", {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || t("accountCenter.videosLoadError"));
        setVideos(Array.isArray(body.boosts) ? body.boosts : []);
      })
      .catch((err) => {
        if (err.name !== "AbortError") setError(err.message || t("accountCenter.videosLoadError"));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [token, t]);

  if (!user) {
    return (
      <div className="max-w-md mx-auto p-6 text-center">
        <p className="text-muted-foreground mb-4">{t("settings.loginRequired")}</p>
        <Link href="/auth/login"><Button>{t("auth.signIn")}</Button></Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-3 sm:p-4 md:p-5 space-y-4 pb-24">
      <div className="flex items-center gap-2">
        <Link
          href="/settings"
          className="h-11 w-11 rounded-full flex items-center justify-center hover:bg-accent"
          aria-label={t("settings.backToSettings")}
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-bold truncate">{t("accountCenter.myVideos")}</h1>
          <p className="text-xs text-muted-foreground">{t("accountCenter.myVideosSub")}</p>
        </div>
        <Link href="/my-boosts">
          <Button size="sm" className="h-9">
            <Plus className="h-4 w-4 mr-1" />
            {t("accountCenter.manageBoosts")}
          </Button>
        </Link>
      </div>

      {loading && (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">{t("profile.loading")}</span>
        </div>
      )}

      {!loading && error && (
        <Card className="p-4 text-sm text-destructive border-destructive/30">{error}</Card>
      )}

      {!loading && !error && videos.length === 0 && (
        <Card className="rounded-2xl p-8 text-center space-y-3">
          <Film className="h-10 w-10 mx-auto text-muted-foreground" />
          <p className="text-sm font-medium">{t("accountCenter.noVideos")}</p>
          <p className="text-xs text-muted-foreground">{t("accountCenter.noVideosSub")}</p>
          <div className="flex flex-wrap gap-2 justify-center pt-1">
            <Link href="/my-boosts"><Button size="sm">{t("myBoosts.boostCta")}</Button></Link>
            <Link href="/videos"><Button size="sm" variant="outline">{t("videoFeed.title")}</Button></Link>
          </div>
        </Card>
      )}

      {!loading && videos.length > 0 && (
        <div className="space-y-2.5">
          {videos.map((v) => (
            <Card key={`${v.listingId}-${v.plan}`} className="rounded-2xl overflow-hidden">
              <Link href={`/listings/${v.listingId}/video`} className="flex items-center gap-3 p-3 hover:bg-accent/40">
                <div className="relative h-16 w-12 rounded-lg overflow-hidden bg-muted shrink-0">
                  {v.thumbnail ? (
                    <img src={v.thumbnail} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center">
                      <Film className="h-5 w-5 text-muted-foreground" />
                    </div>
                  )}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/25">
                    <Play className="h-5 w-5 text-white fill-white" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{v.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {(v.impressions ?? 0).toLocaleString()} {t("myBoosts.impressionsLabel").toLowerCase()}
                    {" · "}
                    {v.clicks ?? 0} {t("myBoosts.clicksLabel").toLowerCase()}
                  </p>
                  <span className={cn(
                    "inline-flex mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full",
                    v.isExpired
                      ? "bg-muted text-muted-foreground"
                      : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
                  )}>
                    {v.isExpired ? t("myBoosts.expired") : t("accountCenter.active")}
                  </span>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </Link>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
