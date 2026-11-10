/**
 * Promotional Videos creator profile — same user account as Marketplace /profile/:id.
 * Route: /videos/profile/:id
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  BadgeCheck,
  Bookmark,
  Film,
  Flag,
  Heart,
  Loader2,
  MoreVertical,
  Pencil,
  Pin,
  Play,
  Plus,
  Share2,
  ShoppingBag,
  Trash2,
  UserPlus,
  UserMinus,
  SendHorizontal,
  BarChart3,
  Zap,
  X,
} from "lucide-react";
import { useSEO } from "@/hooks/useSEO";
import { useAuth } from "@/contexts/auth";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import PromoVideosBottomNav, {
  PROMO_NAV_HEIGHT_CSS,
} from "@/components/PromoVideosBottomNav";
import { cn } from "@/lib/utils";

const RETURN_KEY = "flexa_video_profile_return";

type ProfilePayload = {
  id: number;
  name: string;
  username: string;
  videoBio: string | null;
  avatar: string | null;
  isVerified: boolean;
  followerCount: number;
  followingCount: number;
  likesReceived: number;
  isFollowing: boolean;
  isOwner: boolean;
  hasShop: boolean;
  shopPath: string;
  videoLikedPublic: boolean;
  tabs: { videos: boolean; liked: boolean; saved: boolean };
  canMessage: boolean;
  canFollow: boolean;
};

type VideoCard = {
  id: number;
  title: string;
  thumbnail: string | null;
  boostVideoUrl: string | null;
  viewCount: number;
  likeCount: number;
  pinned: boolean;
  pinnedAt: string | null;
  moderationStatus: string;
  status: string;
  lifecycleStatus: string | null;
  moderationReason: string | null;
};

type TabKey = "videos" | "liked" | "saved";

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}K`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(n);
}

export default function VideoProfilePage() {
  const { t } = useTranslation();
  const [, params] = useRoute("/videos/profile/:id");
  const userId = parseInt(params?.id ?? "0", 10);
  const [, navigate] = useLocation();
  const { user, token, isLoading: authLoading } = useAuth();
  const { toast } = useToast();

  const [profile, setProfile] = useState<ProfilePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>("videos");
  const [videos, setVideos] = useState<VideoCard[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingVideos, setLoadingVideos] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState<VideoCard | null>(null);
  const [deleteOpen, setDeleteOpen] = useState<VideoCard | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectNotes, setRejectNotes] = useState("");
  const [modBusy, setModBusy] = useState(false);
  const [editUsername, setEditUsername] = useState("");
  const [editBio, setEditBio] = useState("");
  const [editLikedPublic, setEditLikedPublic] = useState(false);
  const [editBusy, setEditBusy] = useState(false);
  const [messageBusy, setMessageBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const restoredRef = useRef(false);

  const isAdmin =
    !!(user as any)?.isAdmin || !!(user as any)?.isSuperAdmin || (user as any)?.role === "moderator";

  useSEO({
    title: profile
      ? t("videoProfile.seoTitle", {
          name: profile.name,
          defaultValue: `{{name}} · Promotional Videos`,
        })
      : t("videoProfile.title", { defaultValue: "Video profile" }),
    path: userId ? `/videos/profile/${userId}` : undefined,
    noindex: true,
  });

  const authHeaders = useMemo(() => {
    const h: Record<string, string> = {};
    if (token) h.Authorization = `Bearer ${token}`;
    return h;
  }, [token]);

  const loadProfile = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/videos/profile/${userId}`, { headers: authHeaders });
      if (res.status === 404) {
        setProfile(null);
        return;
      }
      if (!res.ok) throw new Error("fail");
      const data = (await res.json()) as ProfilePayload;
      setProfile(data);
      setEditUsername(data.username || "");
      setEditBio(data.videoBio || "");
      setEditLikedPublic(!!data.videoLikedPublic);
      // Pick a visible default tab
      if (!data.tabs.liked && tab === "liked") setTab("videos");
      if (!data.tabs.saved && tab === "saved") setTab("videos");
    } catch {
      toast({
        title: t("errors.serverError", { defaultValue: "Something went wrong" }),
        variant: "destructive",
      });
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, [userId, authHeaders, t, toast, tab]);

  const loadVideos = useCallback(
    async (nextPage: number, replace: boolean) => {
      if (!userId || !profile) return;
      setLoadingVideos(true);
      try {
        let path = `/api/videos/profile/${userId}/videos?page=${nextPage}&limit=18`;
        if (tab === "liked") path = `/api/videos/profile/${userId}/liked?page=${nextPage}&limit=18`;
        if (tab === "saved") path = `/api/videos/profile/${userId}/saved?page=${nextPage}&limit=18`;
        if (tab === "videos" && profile.isOwner) path += `&scope=owner`;

        const res = await fetch(path, { headers: authHeaders });
        if (res.status === 403) {
          if (replace) setVideos([]);
          setHasMore(false);
          return;
        }
        if (!res.ok) throw new Error("fail");
        const data = await res.json();
        const rows = (data.videos ?? []) as VideoCard[];
        setVideos((prev) => (replace ? rows : [...prev, ...rows]));
        setPage(data.page ?? nextPage);
        setHasMore(!!data.hasMore);
      } catch {
        if (replace) setVideos([]);
        toast({
          title: t("errors.serverError", { defaultValue: "Something went wrong" }),
          variant: "destructive",
        });
      } finally {
        setLoadingVideos(false);
      }
    },
    [userId, profile, tab, authHeaders, t, toast],
  );

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    if (!profile) return;
    setVideos([]);
    setPage(1);
    loadVideos(1, true);
  }, [profile?.id, tab]); // eslint-disable-line react-hooks/exhaustive-deps

  // Restore scroll/tab after View shop round-trip
  useEffect(() => {
    if (!profile || restoredRef.current || typeof window === "undefined") return;
    try {
      const raw = sessionStorage.getItem(RETURN_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { userId?: number; scroll?: number; tab?: TabKey };
      if (parsed.userId !== profile.id) return;
      if (parsed.tab && parsed.tab !== tab && profile.tabs[parsed.tab]) {
        setTab(parsed.tab);
      }
      const scroll = parsed.scroll ?? 0;
      requestAnimationFrame(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scroll;
      });
      sessionStorage.removeItem(RETURN_KEY);
      restoredRef.current = true;
    } catch {
      /* ok */
    }
  }, [profile, tab]);

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      window.history.back();
      return;
    }
    navigate("/videos");
  };

  const handleShare = async () => {
    const url = `${window.location.origin}/videos/profile/${userId}`;
    try {
      if (navigator.share) {
        await navigator.share({ url, title: profile?.name });
        return;
      }
    } catch {
      /* fall through */
    }
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: t("videoFeed.shareLinkCopied", { defaultValue: "Link copied!" }) });
    } catch {
      toast({ title: url });
    }
  };

  const toggleFollow = async () => {
    if (!user) {
      navigate(`/auth/login?next=${encodeURIComponent(`/videos/profile/${userId}`)}`);
      return;
    }
    if (!profile || profile.isOwner || followBusy) return;
    setFollowBusy(true);
    const was = profile.isFollowing;
    setProfile({
      ...profile,
      isFollowing: !was,
      followerCount: Math.max(0, profile.followerCount + (was ? -1 : 1)),
    });
    try {
      const res = await fetch(`/api/users/${userId}/follow`, {
        method: was ? "DELETE" : "POST",
        headers: authHeaders,
      });
      if (!res.ok) throw new Error("fail");
    } catch {
      setProfile({
        ...profile,
        isFollowing: was,
        followerCount: profile.followerCount,
      });
      toast({
        title: t("errors.serverError", { defaultValue: "Something went wrong" }),
        variant: "destructive",
      });
    } finally {
      setFollowBusy(false);
    }
  };

  const openWatch = (videoId: number) => {
    navigate(`/videos/watch?video=${videoId}&creator=${userId}`);
  };

  const viewShop = () => {
    if (!profile) return;
    try {
      sessionStorage.setItem(
        RETURN_KEY,
        JSON.stringify({
          userId: profile.id,
          scroll: scrollRef.current?.scrollTop ?? 0,
          tab,
        }),
      );
    } catch {
      /* ok */
    }
    navigate(`${profile.shopPath}?from=video-profile`);
  };

  const handleMessage = async () => {
    if (!user) {
      navigate(`/auth/login?next=${encodeURIComponent(`/videos/profile/${userId}`)}`);
      return;
    }
    if (!profile || profile.isOwner || messageBusy) return;
    setMessageBusy(true);
    try {
      let listingId = videos[0]?.id;
      if (!listingId) {
        const res = await fetch(`/api/videos/profile/${userId}/videos?page=1&limit=1`, {
          headers: authHeaders,
        });
        if (res.ok) {
          const data = await res.json();
          listingId = data.videos?.[0]?.id;
        }
      }
      if (!listingId) {
        toast({
          title: t("videoProfile.messageNeedsVideo", {
            defaultValue: "This creator has no videos to message about yet.",
          }),
        });
        return;
      }
      const response = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ listingId, sellerId: userId }),
      });
      if (!response.ok) throw new Error("fail");
      const conversation = await response.json();
      navigate(`/messages/${conversation.id}`);
    } catch {
      toast({
        title: t("videoFeed.messageError", { defaultValue: "We couldn't open the conversation." }),
        variant: "destructive",
      });
    } finally {
      setMessageBusy(false);
    }
  };

  const saveEdit = async () => {
    if (!profile?.isOwner || editBusy) return;
    setEditBusy(true);
    try {
      const res = await fetch("/api/videos/profile/me", {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({
          username: editUsername,
          videoBio: editBio,
          videoLikedPublic: editLikedPublic,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409) {
        toast({
          title: t("videoProfile.usernameTaken", { defaultValue: "Username already taken" }),
          variant: "destructive",
        });
        return;
      }
      if (!res.ok) {
        toast({
          title: data.error || t("errors.serverError", { defaultValue: "Something went wrong" }),
          variant: "destructive",
        });
        return;
      }
      setProfile({
        ...profile,
        username: data.username ?? editUsername,
        videoBio: data.videoBio ?? editBio,
        videoLikedPublic: !!data.videoLikedPublic,
        tabs: {
          ...profile.tabs,
          liked: profile.isOwner || !!data.videoLikedPublic,
        },
      });
      setEditOpen(false);
      toast({ title: t("videoProfile.saved", { defaultValue: "Profile saved" }) });
    } finally {
      setEditBusy(false);
    }
  };

  const submitReject = async () => {
    if (!rejectOpen || rejectReason.trim().length < 3 || modBusy) return;
    setModBusy(true);
    try {
      const res = await fetch(`/api/admin/videos/${rejectOpen.id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ reason: rejectReason.trim(), notes: rejectNotes.trim() || undefined }),
      });
      if (!res.ok) throw new Error("fail");
      toast({ title: t("videoProfile.rejected", { defaultValue: "Video rejected" }) });
      setRejectOpen(null);
      setRejectReason("");
      setRejectNotes("");
      loadVideos(1, true);
    } catch {
      toast({
        title: t("errors.serverError", { defaultValue: "Something went wrong" }),
        variant: "destructive",
      });
    } finally {
      setModBusy(false);
    }
  };

  const submitDelete = async () => {
    if (!deleteOpen || modBusy) return;
    setModBusy(true);
    try {
      const res = await fetch(`/api/admin/videos/${deleteOpen.id}/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ confirmTitle: deleteOpen.title }),
      });
      if (!res.ok) throw new Error("fail");
      toast({ title: t("videoProfile.deleted", { defaultValue: "Video deleted" }) });
      setDeleteOpen(null);
      loadVideos(1, true);
    } catch {
      toast({
        title: t("errors.serverError", { defaultValue: "Something went wrong" }),
        variant: "destructive",
      });
    } finally {
      setModBusy(false);
    }
  };

  if (!userId) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-white text-[#0B1F3A]">
        {t("profile.notFound", { defaultValue: "Not found" })}
      </div>
    );
  }

  if (loading || authLoading) {
    return (
      <div
        className="fixed inset-0 z-[60] flex items-center justify-center bg-white"
        data-testid="video-profile-loading"
      >
        <Loader2 className="h-7 w-7 animate-spin text-[hsl(152,65%,28%)]" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-3 bg-white text-[#0B1F3A]">
        <p>{t("profile.notFound", { defaultValue: "User not found" })}</p>
        <button type="button" onClick={() => navigate("/videos")} className="text-[hsl(152,65%,28%)] font-semibold">
          {t("videoFeed.favoritesBrowse", { defaultValue: "Browse videos" })}
        </button>
      </div>
    );
  }

  const visibleTabs: { key: TabKey; label: string }[] = [
    { key: "videos", label: t("videoProfile.tabVideos", { defaultValue: "Videos" }) },
  ];
  if (profile.tabs.liked) {
    visibleTabs.push({ key: "liked", label: t("videoProfile.tabLiked", { defaultValue: "Liked" }) });
  }
  if (profile.tabs.saved) {
    visibleTabs.push({ key: "saved", label: t("videoProfile.tabSaved", { defaultValue: "Saved" }) });
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col bg-white text-[#0B1F3A]"
      data-testid="video-profile-page"
    >
      <header
        className="shrink-0 flex items-center gap-2 px-3 border-b border-slate-200/80 bg-white"
        style={{
          paddingTop: "env(safe-area-inset-top, 10px)",
          height: "calc(52px + env(safe-area-inset-top, 0px))",
        }}
      >
        <button
          type="button"
          onClick={handleBack}
          className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-slate-100"
          aria-label={t("common.back", { defaultValue: "Back" })}
          data-testid="video-profile-back"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <Link href="/videos" className="flex items-center gap-2 min-w-0 flex-1">
          <img src="/flexa-logo-v2.png" alt="FLEXA MARKET" className="h-8 w-auto" width={32} height={32} />
          <span className="truncate text-[13px] font-black tracking-wide text-[#0B1F3A]">
            {t("videoProfile.brandMark", { defaultValue: "Promotional Videos" })}
          </span>
        </Link>
        <button
          type="button"
          onClick={handleShare}
          className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-slate-100"
          aria-label={t("common.share", { defaultValue: "Share" })}
          data-testid="video-profile-share"
        >
          <Share2 className="h-4 w-4" />
        </button>
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-slate-100"
            aria-label={t("common.more", { defaultValue: "More" })}
            data-testid="video-profile-menu"
          >
            <MoreVertical className="h-5 w-5" />
          </button>
          {menuOpen && (
            <>
              <button
                type="button"
                className="fixed inset-0 z-40"
                aria-label="Close menu"
                onClick={() => setMenuOpen(false)}
              />
              <div className="absolute right-0 top-10 z-50 min-w-[200px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
                {profile.isOwner ? (
                  <>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-semibold hover:bg-slate-50"
                      onClick={() => {
                        setMenuOpen(false);
                        setEditOpen(true);
                      }}
                    >
                      <Pencil className="h-4 w-4" /> {t("videoProfile.edit", { defaultValue: "Edit profile" })}
                    </button>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-semibold hover:bg-slate-50"
                      onClick={() => {
                        setMenuOpen(false);
                        navigate("/booster/create");
                      }}
                    >
                      <Plus className="h-4 w-4" /> {t("videoProfile.addVideo", { defaultValue: "Add video" })}
                    </button>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-semibold hover:bg-slate-50"
                      onClick={() => {
                        setMenuOpen(false);
                        navigate("/my-boosts");
                      }}
                    >
                      <Zap className="h-4 w-4" /> {t("videoProfile.myBoosts", { defaultValue: "My boosts" })}
                    </button>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-semibold hover:bg-slate-50"
                      onClick={() => {
                        setMenuOpen(false);
                        navigate("/booster/analytics");
                      }}
                    >
                      <BarChart3 className="h-4 w-4" /> {t("videoProfile.analytics", { defaultValue: "Analytics" })}
                    </button>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-semibold hover:bg-slate-50"
                      onClick={() => {
                        setMenuOpen(false);
                        navigate("/my-drafts");
                      }}
                    >
                      <Film className="h-4 w-4" /> {t("videoProfile.drafts", { defaultValue: "Drafts" })}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-semibold hover:bg-slate-50"
                    onClick={() => {
                      setMenuOpen(false);
                      navigate(`/report?type=user&id=${userId}`);
                    }}
                  >
                    <Flag className="h-4 w-4" /> {t("videoFeed.report", { defaultValue: "Report" })}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </header>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto"
        style={{ paddingBottom: `calc(${PROMO_NAV_HEIGHT_CSS} + 12px)` }}
        data-testid="video-profile-scroll"
      >
        <section className="px-4 pt-5 pb-4">
          <div className="flex items-start gap-4">
            <Avatar className="h-[86px] w-[86px] shrink-0 ring-2 ring-[hsl(152,65%,28%)]/20">
              <AvatarImage src={profile.avatar ?? undefined} />
              <AvatarFallback className="text-2xl font-black bg-[hsl(152,65%,18%)] text-white">
                {(profile.name || "?")[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1 pt-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <h1 className="truncate text-[20px] font-black tracking-tight text-[#0B1F3A]" data-testid="video-profile-name">
                  {profile.name}
                </h1>
                {profile.isVerified && (
                  <BadgeCheck className="h-5 w-5 shrink-0 text-[hsl(152,65%,32%)]" aria-label="Verified" />
                )}
              </div>
              <p className="mt-0.5 text-[14px] font-semibold text-slate-500" data-testid="video-profile-username">
                @{profile.username}
              </p>
              <div className="mt-3 flex gap-4 text-[13px]">
                <button type="button" className="text-left" data-testid="video-profile-following-count">
                  <span className="font-black text-[#0B1F3A]">{formatCount(profile.followingCount)}</span>{" "}
                  <span className="text-slate-500">{t("videoProfile.following", { defaultValue: "Following" })}</span>
                </button>
                <button type="button" className="text-left" data-testid="video-profile-followers-count">
                  <span className="font-black text-[#0B1F3A]">{formatCount(profile.followerCount)}</span>{" "}
                  <span className="text-slate-500">{t("videoProfile.followers", { defaultValue: "Followers" })}</span>
                </button>
                <button type="button" className="text-left" data-testid="video-profile-likes-count">
                  <span className="font-black text-[#0B1F3A]">{formatCount(profile.likesReceived)}</span>{" "}
                  <span className="text-slate-500">{t("videoProfile.likes", { defaultValue: "Likes" })}</span>
                </button>
              </div>
            </div>
          </div>

          {profile.videoBio && (
            <p className="mt-3 text-[14px] leading-relaxed text-slate-700 whitespace-pre-wrap" data-testid="video-profile-bio">
              {profile.videoBio}
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            {profile.isOwner ? (
              <>
                <button
                  type="button"
                  onClick={() => setEditOpen(true)}
                  className="inline-flex flex-1 min-w-[120px] items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[13px] font-bold text-[#0B1F3A] hover:bg-slate-50"
                  data-testid="video-profile-edit"
                >
                  <Pencil className="h-4 w-4" />
                  {t("videoProfile.edit", { defaultValue: "Edit" })}
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/booster/create")}
                  className="inline-flex flex-1 min-w-[120px] items-center justify-center gap-1.5 rounded-xl bg-[hsl(152,65%,28%)] px-3 py-2.5 text-[13px] font-bold text-white"
                  data-testid="video-profile-add"
                >
                  <Plus className="h-4 w-4" />
                  {t("videoProfile.addVideo", { defaultValue: "Add video" })}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={toggleFollow}
                  disabled={followBusy}
                  className={cn(
                    "inline-flex flex-1 min-w-[110px] items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-[13px] font-bold disabled:opacity-60",
                    profile.isFollowing
                      ? "border border-slate-200 bg-white text-[#0B1F3A]"
                      : "bg-[hsl(152,65%,28%)] text-white",
                  )}
                  data-testid="video-profile-follow"
                >
                  {profile.isFollowing ? (
                    <>
                      <UserMinus className="h-4 w-4" />
                      {t("videoFeed.unfollow", { defaultValue: "Following" })}
                    </>
                  ) : (
                    <>
                      <UserPlus className="h-4 w-4" />
                      {t("videoFeed.follow", { defaultValue: "Follow" })}
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleMessage}
                  disabled={messageBusy}
                  className="inline-flex flex-1 min-w-[110px] items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[13px] font-bold text-[#0B1F3A]"
                  data-testid="video-profile-message"
                >
                  {messageBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
                  {t("videoFeed.message", { defaultValue: "Message" })}
                </button>
                {profile.hasShop && (
                  <button
                    type="button"
                    onClick={viewShop}
                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-[hsl(152,65%,28%)]/30 bg-[hsl(152,65%,96%)] px-3 py-2.5 text-[13px] font-bold text-[hsl(152,65%,22%)]"
                    data-testid="video-profile-view-shop"
                  >
                    <ShoppingBag className="h-4 w-4" />
                    {t("videoProfile.viewShop", { defaultValue: "View shop" })}
                  </button>
                )}
              </>
            )}
          </div>
        </section>

        <div className="sticky top-0 z-10 border-y border-slate-200/80 bg-white/95 backdrop-blur">
          <div className="flex" role="tablist">
            {visibleTabs.map((item) => (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={tab === item.key}
                onClick={() => setTab(item.key)}
                className={cn(
                  "relative flex-1 py-3 text-[13px] font-bold tracking-wide",
                  tab === item.key ? "text-[#0B1F3A]" : "text-slate-400",
                )}
                data-testid={`video-profile-tab-${item.key}`}
              >
                <span className="inline-flex items-center gap-1.5 justify-center">
                  {item.key === "liked" && <Heart className="h-3.5 w-3.5" />}
                  {item.key === "saved" && <Bookmark className="h-3.5 w-3.5" />}
                  {item.key === "videos" && <Film className="h-3.5 w-3.5" />}
                  {item.label}
                </span>
                {tab === item.key && (
                  <span className="absolute inset-x-6 bottom-0 h-0.5 rounded-full bg-[hsl(152,65%,28%)]" />
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="px-0.5 pt-0.5">
          {loadingVideos && videos.length === 0 ? (
            <div className="flex min-h-[30vh] items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
            </div>
          ) : videos.length === 0 ? (
            <div className="flex min-h-[30vh] flex-col items-center justify-center gap-2 px-6 text-center">
              <Film className="h-8 w-8 text-slate-300" />
              <p className="text-sm font-semibold text-slate-500">
                {t("videoProfile.emptyTab", { defaultValue: "No videos here yet" })}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-0.5" data-testid="video-profile-grid">
              {videos.map((v) => {
                const rejected =
                  v.moderationStatus === "rejected" || v.lifecycleStatus === "rejected" || v.status === "removed";
                return (
                  <div key={v.id} className="relative aspect-[3/4] bg-slate-100 group">
                    <button
                      type="button"
                      onClick={() => openWatch(v.id)}
                      className="absolute inset-0 overflow-hidden text-left"
                      data-testid={`video-profile-card-${v.id}`}
                    >
                      {v.thumbnail ? (
                        <img
                          src={v.thumbnail}
                          alt=""
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-slate-200">
                          <Play className="h-6 w-6 text-slate-400" />
                        </div>
                      )}
                      <span className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />
                      {v.pinned && (
                        <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-0.5 rounded bg-black/55 px-1.5 py-0.5 text-[9px] font-bold text-white">
                          <Pin className="h-2.5 w-2.5" /> {t("videoProfile.pinned", { defaultValue: "Pinned" })}
                        </span>
                      )}
                      <span className="absolute bottom-1.5 left-1.5 flex items-center gap-1 text-[10px] font-bold text-white drop-shadow">
                        <Play className="h-3 w-3 fill-white" />
                        {formatCount(v.viewCount)}
                      </span>
                      {rejected && profile.isOwner && (
                        <span className="absolute right-1.5 top-1.5 rounded bg-red-600 px-1.5 py-0.5 text-[9px] font-black uppercase text-white">
                          {t("videoProfile.rejectedBadge", { defaultValue: "Rejected" })}
                        </span>
                      )}
                    </button>
                    {isAdmin && (
                      <div className="absolute right-1 bottom-1 flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={() => {
                            setRejectReason("");
                            setRejectNotes("");
                            setRejectOpen(v);
                          }}
                          className="rounded bg-black/70 p-1 text-white"
                          aria-label="Reject"
                        >
                          <Flag className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteOpen(v)}
                          className="rounded bg-black/70 p-1 text-white"
                          aria-label="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                    {rejected && profile.isOwner && v.moderationReason && (
                      <p className="sr-only">{v.moderationReason}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {hasMore && (
            <div className="flex justify-center py-4">
              <button
                type="button"
                disabled={loadingVideos}
                onClick={() => loadVideos(page + 1, false)}
                className="rounded-full border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600"
              >
                {loadingVideos ? <Loader2 className="h-4 w-4 animate-spin" /> : t("common.loadMore", { defaultValue: "Load more" })}
              </button>
            </div>
          )}

          {profile.isOwner &&
            videos.some((v) => v.moderationStatus === "rejected") && (
              <div className="mx-3 my-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-800">
                {t("videoProfile.rejectedHint", {
                  defaultValue: "Rejected videos stay in your library with the reason. Fix and resubmit from My boosts / drafts when available.",
                })}
              </div>
            )}
        </div>
      </div>

      <PromoVideosBottomNav active="profile" />

      {editOpen && (
        <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
          <div className="w-full max-w-md rounded-t-2xl sm:rounded-2xl bg-white p-4 shadow-xl" data-testid="video-profile-edit-sheet">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-black">{t("videoProfile.edit", { defaultValue: "Edit profile" })}</h2>
              <button type="button" onClick={() => setEditOpen(false)} aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>
            <label className="block text-xs font-bold text-slate-500 mb-1">
              {t("videoProfile.username", { defaultValue: "Username" })}
            </label>
            <div className="mb-3 flex items-center rounded-xl border border-slate-200 px-3">
              <span className="text-slate-400">@</span>
              <input
                value={editUsername}
                onChange={(e) => setEditUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 30))}
                className="w-full bg-transparent py-2.5 text-sm font-semibold outline-none"
                maxLength={30}
                data-testid="video-profile-edit-username"
              />
            </div>
            <label className="block text-xs font-bold text-slate-500 mb-1">
              {t("videoProfile.bio", { defaultValue: "Video bio" })}
            </label>
            <textarea
              value={editBio}
              onChange={(e) => setEditBio(e.target.value.slice(0, 300))}
              rows={3}
              className="mb-3 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[hsl(152,65%,28%)]"
              data-testid="video-profile-edit-bio"
            />
            <label className="mb-4 flex items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                checked={editLikedPublic}
                onChange={(e) => setEditLikedPublic(e.target.checked)}
                data-testid="video-profile-edit-liked-public"
              />
              {t("videoProfile.likedPublic", { defaultValue: "Make Liked tab public" })}
            </label>
            <button
              type="button"
              disabled={editBusy}
              onClick={saveEdit}
              className="w-full rounded-xl bg-[hsl(152,65%,28%)] py-3 text-sm font-black text-white disabled:opacity-60"
              data-testid="video-profile-save"
            >
              {editBusy ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : t("buttons.save", { defaultValue: "Save" })}
            </button>
          </div>
        </div>
      )}

      {rejectOpen && (
        <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl" data-testid="video-reject-dialog">
            <h2 className="text-base font-black mb-1">
              {t("videoProfile.rejectTitle", { defaultValue: "Reject video" })}
            </h2>
            <p className="text-xs text-slate-500 mb-3 line-clamp-2">{rejectOpen.title}</p>
            <label className="block text-xs font-bold text-slate-500 mb-1">
              {t("videoProfile.rejectReason", { defaultValue: "Reason (required)" })}
            </label>
            <input
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="mb-3 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none"
              data-testid="video-reject-reason"
            />
            <label className="block text-xs font-bold text-slate-500 mb-1">
              {t("videoProfile.rejectNotes", { defaultValue: "Notes (optional)" })}
            </label>
            <textarea
              value={rejectNotes}
              onChange={(e) => setRejectNotes(e.target.value.slice(0, 1000))}
              rows={2}
              className="mb-3 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none"
            />
            <div className="flex gap-2">
              <button type="button" onClick={() => setRejectOpen(null)} className="flex-1 rounded-xl border py-2.5 text-sm font-bold">
                {t("buttons.cancel", { defaultValue: "Cancel" })}
              </button>
              <button
                type="button"
                disabled={modBusy || rejectReason.trim().length < 3}
                onClick={submitReject}
                className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                data-testid="video-reject-confirm"
              >
                {t("videoProfile.rejectConfirm", { defaultValue: "Reject" })}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteOpen && (
        <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl" data-testid="video-delete-dialog">
            <h2 className="text-base font-black mb-1 text-red-700">
              {t("videoProfile.deleteTitle", { defaultValue: "Delete video" })}
            </h2>
            <p className="text-sm text-slate-600 mb-4">
              {t("videoProfile.deleteConfirm", {
                title: deleteOpen.title,
                defaultValue: `Permanently remove “{{title}}” from public surfaces? Orders and payments are kept.`,
              })}
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setDeleteOpen(null)} className="flex-1 rounded-xl border py-2.5 text-sm font-bold">
                {t("buttons.cancel", { defaultValue: "Cancel" })}
              </button>
              <button
                type="button"
                disabled={modBusy}
                onClick={submitDelete}
                className="flex-1 rounded-xl bg-red-700 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                data-testid="video-delete-confirm"
              >
                {t("videoProfile.deleteConfirmBtn", { defaultValue: "Delete" })}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
