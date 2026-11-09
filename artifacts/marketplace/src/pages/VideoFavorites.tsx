import { useCallback, useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft, BadgeCheck, Bookmark, Loader2, Play, ShoppingBag, Trash2, UserRound,
} from "lucide-react";
import { useSEO } from "@/hooks/useSEO";
import { useAuth } from "@/contexts/auth";
import { useVideoSaves } from "@/contexts/videoSaves";
import { useToast } from "@/hooks/use-toast";
import { formatPrice } from "@/lib/currency";
import PromoVideoPoster from "@/components/PromoVideoPoster";
import PromoVideosBottomNav, { PROMO_NAV_HEIGHT_CSS, PROMO_NAV_SAFE_BOTTOM } from "@/components/PromoVideosBottomNav";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { isAndroidApp } from "@/lib/androidPurchasePolicy";

type SavedVideo = {
  id: number;
  videoUrl: string;
  thumbnailUrl: string | null;
  title: string;
  description: string;
  price: number;
  currency: string | null;
  isVideoOnly: boolean;
  sellerId: number;
  sellerName: string;
  sellerAvatar: string | null;
  sellerIsVerified: boolean;
  viewCount: number;
  likeCount: number;
  saveCount: number;
  sharesCount: number;
  savedAt: string;
  boostEndAt: string | null;
};

export default function VideoFavorites() {
  const { t } = useTranslation();
  useSEO({
    title: t("videoFeed.favoritesTitle", { defaultValue: "Favorite Videos" }),
    description: t("tr.videoFeedSeoDesc"),
    path: "/videos/favorites",
  });
  const [, navigate] = useLocation();
  const { user, token, isLoading: authLoading } = useAuth();
  const { markUnsaved, refresh } = useVideoSaves();
  const { toast } = useToast();

  const [videos, setVideos] = useState<SavedVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [removingId, setRemovingId] = useState<number | null>(null);

  useEffect(() => {
    if (isAndroidApp() || /Android/i.test(navigator.userAgent)) {
      document.documentElement.style.setProperty("--flexa-android-bottom", "48px");
    }
  }, []);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate(`/auth/login?next=${encodeURIComponent("/videos/favorites")}`);
    }
  }, [authLoading, user, navigate]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch("/api/video-saves", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setVideos(Array.isArray(data.videos) ? data.videos : []);
    } catch {
      toast({
        title: t("errors.serverError", { defaultValue: "Something went wrong" }),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [token, toast, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const removeSave = async (id: number) => {
    if (!token || removingId) return;
    setRemovingId(id);
    const prev = videos;
    setVideos(v => v.filter(x => x.id !== id));
    markUnsaved(id);
    try {
      const res = await fetch(`/api/video-saves/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed");
      refresh();
    } catch {
      setVideos(prev);
      toast({
        title: t("errors.serverError", { defaultValue: "Something went wrong" }),
        variant: "destructive",
      });
    } finally {
      setRemovingId(null);
    }
  };

  const openWatch = (id: number) => {
    navigate(`/videos/watch?video=${id}`);
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col bg-black text-white"
      style={{
        bottom: `calc(-1 * ${PROMO_NAV_SAFE_BOTTOM})`,
        minHeight: `calc(100dvh + ${PROMO_NAV_SAFE_BOTTOM})`,
      }}
      data-testid="video-favorites-page"
    >
      <header
        className="shrink-0 flex items-center gap-3 px-4 border-b border-white/10"
        style={{
          paddingTop: "env(safe-area-inset-top, 12px)",
          height: "calc(56px + env(safe-area-inset-top, 0px))",
        }}
      >
        <button
          type="button"
          onClick={() => navigate("/videos")}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/5"
          aria-label={t("common.back", { defaultValue: "Back" })}
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="truncate text-[16px] font-black tracking-tight">
            {t("videoFeed.favoritesTitle", { defaultValue: "Favorites" })}
          </h1>
          <p className="truncate text-[11px] text-white/45">
            {t("videoFeed.favoritesSubtitle", { defaultValue: "Saved promotional videos" })}
          </p>
        </div>
        <Bookmark className="h-5 w-5 text-amber-400 fill-amber-400 shrink-0" />
      </header>

      <div
        className="flex-1 overflow-y-auto px-3 pt-3"
        style={{ paddingBottom: `calc(${PROMO_NAV_HEIGHT_CSS} + 16px)` }}
      >
        {loading ? (
          <div className="flex min-h-[40vh] items-center justify-center">
            <Loader2 className="h-7 w-7 animate-spin text-white/40" />
          </div>
        ) : videos.length === 0 ? (
          <div className="flex min-h-[50vh] flex-col items-center justify-center px-6 text-center gap-3">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/5 border border-white/10">
              <Bookmark className="h-7 w-7 text-white/35" />
            </div>
            <h2 className="text-lg font-black">
              {t("videoFeed.favoritesEmptyTitle", { defaultValue: "No favorites yet" })}
            </h2>
            <p className="text-sm text-white/50 max-w-xs leading-relaxed">
              {t("videoFeed.favoritesEmptyDesc", {
                defaultValue: "Tap the bookmark on a promotional video to save it here.",
              })}
            </p>
            <button
              type="button"
              onClick={() => navigate("/videos/watch")}
              className="mt-2 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold"
            >
              <Play className="h-4 w-4 fill-white" />
              {t("videoFeed.favoritesBrowse", { defaultValue: "Browse videos" })}
            </button>
          </div>
        ) : (
          <div className="mx-auto grid max-w-3xl grid-cols-1 gap-3 sm:grid-cols-2">
            {videos.map(v => {
              const canBuy = !v.isVideoOnly && v.price > 0;
              return (
                <article
                  key={v.id}
                  className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]"
                  data-testid={`saved-video-${v.id}`}
                >
                  <button
                    type="button"
                    onClick={() => openWatch(v.id)}
                    className="relative aspect-[3/4] w-full overflow-hidden bg-zinc-900 text-left"
                  >
                    <PromoVideoPoster
                      videoUrl={v.videoUrl}
                      thumbnailUrl={v.thumbnailUrl}
                      title={v.title}
                      className="h-full w-full object-cover"
                    />
                    <span className="absolute inset-0 flex items-center justify-center">
                      <span className="flex h-11 w-11 items-center justify-center rounded-full border border-white/60 bg-black/30 backdrop-blur-sm">
                        <Play className="h-5 w-5 fill-white text-white ml-0.5" />
                      </span>
                    </span>
                  </button>

                  <div className="p-3 space-y-2.5">
                    <h3 className="line-clamp-2 text-[13px] font-bold leading-snug">{v.title}</h3>

                    <Link href={`/profile/${v.sellerId}`} className="flex items-center gap-2 min-w-0">
                      <Avatar className="h-7 w-7 shrink-0 border border-white/20">
                        <AvatarImage src={v.sellerAvatar ?? undefined} />
                        <AvatarFallback className="text-[10px] bg-primary text-white">
                          {(v.sellerName || "?")[0]?.toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="truncate text-[12px] font-semibold text-white/80">@{v.sellerName}</span>
                      {v.sellerIsVerified && <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-primary" />}
                      <UserRound className="h-3.5 w-3.5 shrink-0 text-white/35 ml-auto" />
                    </Link>

                    <div className="flex items-center gap-2">
                      {canBuy && (
                        <Link
                          href={`/listings/${v.id}`}
                          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-[12px] font-black"
                        >
                          <ShoppingBag className="h-3.5 w-3.5" />
                          {formatPrice(v.price, null, v.currency)}
                        </Link>
                      )}
                      <button
                        type="button"
                        onClick={() => openWatch(v.id)}
                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-[12px] font-bold"
                      >
                        <Play className="h-3.5 w-3.5" />
                        {t("videoFeed.openVideo", { defaultValue: "Open" })}
                      </button>
                      <button
                        type="button"
                        onClick={() => void removeSave(v.id)}
                        disabled={removingId === v.id}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-red-400 disabled:opacity-50"
                        aria-label={t("videoFeed.removeFavorite", { defaultValue: "Remove from favorites" })}
                        data-testid={`button-unsave-${v.id}`}
                      >
                        {removingId === v.id
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : <Trash2 className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      <PromoVideosBottomNav active="favorites" />
    </div>
  );
}
