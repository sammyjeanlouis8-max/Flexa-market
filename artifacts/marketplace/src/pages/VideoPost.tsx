import { useState, useEffect, useRef, useCallback } from "react";
import { useRoute, useLocation, Link } from "wouter";
import {
  Heart, MessageCircle, Share2, Eye,
  Play, Pause, ArrowLeft, MapPin, BadgeCheck, SendHorizontal,
  Loader2, Reply, Trash2, MoreVertical, Zap, Crown, Copy, Check,
  Facebook, VolumeX, Volume2,
} from "lucide-react";
import { useGetListing, useAddFavorite, useRemoveFavorite, getGetFavoritesQueryKey, getGetListingQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth";
import { useFavorites } from "@/contexts/favorites";
import { useRestriction } from "@/hooks/useRestriction";
import { RestrictionBanner } from "@/components/RestrictionBanner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { useSocket } from "@/hooks/useSocket";
import { useIntersectionViewTracker } from "@/hooks/useViewTracker";
import { EmojiPickerButton, insertEmojiAtCursor } from "@/components/EmojiPickerButton";
import { formatPrice } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { isAudioUnlocked, setAudioUnlocked } from "@/lib/audioUnlocked";
import { toStreamingVideoUrl } from "@/lib/videoUrl";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CommentUser {
  userId: number;
  userName: string;
  userAvatar?: string | null;
  userIsVerified?: boolean;
}

interface CommentReply extends CommentUser {
  id: number;
  content: string;
  isDeleted: boolean;
  createdAt: string;
  parentId: number;
}

interface Comment extends CommentUser {
  id: number;
  content: string;
  isDeleted: boolean;
  createdAt: string;
  parentId: null;
  replies: CommentReply[];
  listingId?: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
  return new Date(dateStr).toLocaleDateString();
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

// ── Single comment row ────────────────────────────────────────────────────────

function CommentRow({
  comment,
  isReply = false,
  onReply,
  onDelete,
  currentUserId,
  isAdmin,
}: {
  comment: Comment | CommentReply;
  isReply?: boolean;
  onReply?: (id: number, name: string) => void;
  onDelete: (id: number) => void;
  currentUserId?: number;
  isAdmin?: boolean;
}) {
  const canDelete = !comment.isDeleted && (comment.userId === currentUserId || isAdmin);
  return (
    <div className={cn("flex gap-2.5", isReply && "ml-8 mt-2")}>
      <Link href={`/profile/${comment.userId}`} className="flex-shrink-0 mt-0.5">
        <Avatar className="h-7 w-7">
          <AvatarImage src={comment.userAvatar ?? undefined} />
          <AvatarFallback className="text-xs bg-primary text-primary-foreground font-bold">
            {comment.userName?.[0] ?? "?"}
          </AvatarFallback>
        </Avatar>
      </Link>
      <div className="flex-1 min-w-0">
        <div className="bg-secondary rounded-2xl px-3 py-2 inline-block max-w-full">
          <div className="flex items-center gap-1.5 mb-0.5">
            <Link href={`/profile/${comment.userId}`}>
              <span className="text-xs font-semibold text-foreground hover:text-primary">
                {comment.userName}
              </span>
            </Link>
            {comment.userIsVerified && (
              <BadgeCheck className="h-3 w-3 text-primary flex-shrink-0" />
            )}
          </div>
          <p className={cn(
            "text-sm leading-relaxed break-words",
            comment.isDeleted ? "text-muted-foreground italic" : "text-foreground",
          )}>
            {comment.isDeleted ? "[deleted]" : comment.content}
          </p>
        </div>
        <div className="flex items-center gap-3 mt-1 ml-1">
          <span className="text-xs text-muted-foreground">{timeAgo(comment.createdAt)}</span>
          {!comment.isDeleted && !isReply && onReply && (
            <button
              onClick={() => onReply(comment.id, comment.userName)}
              className="text-xs font-semibold text-muted-foreground hover:text-primary transition-colors"
            >
              Reply
            </button>
          )}
          {canDelete && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="text-muted-foreground hover:text-foreground transition-colors">
                  <MoreVertical className="h-3 w-3" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-32">
                <DropdownMenuItem
                  className="text-destructive cursor-pointer gap-2"
                  onClick={() => onDelete(comment.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main VideoPost page ───────────────────────────────────────────────────────

export default function VideoPost() {
  const [, params] = useRoute("/listings/:id/video");
  const [, setLocation] = useLocation();
  const id = parseInt(params?.id ?? "0", 10);

  const { user, token } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const socket = useSocket();
  const { isFavorited, markFavorited, markUnfavorited } = useFavorites();

  // ── Video player state ──────────────────────────────────────────────────────
  const videoRef = useRef<HTMLVideoElement>(null);
  const stallTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [playing, setPlaying] = useState(true);
  const [videoReady, setVideoReady] = useState(false);
  const [muted, setMuted] = useState(!isAudioUnlocked());

  // ── Engagement state ────────────────────────────────────────────────────────
  const liked = isFavorited(id);
  const [likeCount, setLikeCount] = useState(0);
  const [shareCount, setShareCount] = useState(0);
  const [viewCount, setViewCount] = useState(0);
  const [linkCopied, setLinkCopied] = useState(false);

  // ── Restriction state ────────────────────────────────────────────────────────
  const { isRestricted } = useRestriction();

  // ── Comments state ──────────────────────────────────────────────────────────
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsLoaded, setCommentsLoaded] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [replyTo, setReplyTo] = useState<{ id: number; name: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const commentInputRef = useRef<HTMLTextAreaElement>(null);

  // ── Fetch listing ───────────────────────────────────────────────────────────
  const { data: listing, isLoading } = useGetListing(id, {
    query: { enabled: !!id, queryKey: getGetListingQueryKey(id) },
  });

  // Sync engagement counts from listing data (liked state managed by FavoritesContext)
  useEffect(() => {
    if (!listing) return;
    setLikeCount(listing.favoriteCount ?? 0);
    setShareCount((listing as any).sharesCount ?? 0);
    setViewCount(listing.viewCount ?? 0);
  }, [listing]);

  // ── Intersection-Observer view tracker ─────────────────────────────────────
  // Counts a deduplicated view after the page has been visible for ≥2.5 s.
  // Also keeps the boost impression counter in sync.
  const containerRef = useIntersectionViewTracker(id, {
    onCounted: (vc) => setViewCount(vc),
    delayMs: 2500,
    threshold: 0.3,
  });

  // Track boost impression (analytics click) separately — fires once on load
  useEffect(() => {
    if (!id || !listing?.isBoosted) return;
    fetch(`/api/listings/${id}/impression`, { method: "POST" }).catch(() => {});
  }, [id, listing?.isBoosted]);


  // ── Load comments ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!id) return;
    fetch(`/api/listings/${id}/comments`)
      .then(r => r.json())
      .then(data => { setComments(data); setCommentsLoaded(true); })
      .catch(() => setCommentsLoaded(true));
  }, [id]);

  // ── Socket — real-time comments + engagement ─────────────────────────────────
  useEffect(() => {
    if (!id) return;
    socket.joinListing(id);
    const unsubComment = socket.onNewListingComment((comment: Comment) => {
      if (comment.listingId !== id) return;
      setComments(prev => {
        if (prev.some(c => c.id === comment.id)) return prev;
        if (comment.parentId) {
          return prev.map(c =>
            c.id === comment.parentId
              ? { ...c, replies: [...c.replies, comment as unknown as CommentReply] }
              : c,
          );
        }
        return [...prev, { ...comment, replies: [] }];
      });
    });
    // Real-time viewCount updates broadcast by POST /listings/:id/view
    const unsubEngagement = socket.onListingEngagement((data: any) => {
      if (typeof data?.viewCount === "number") setViewCount(data.viewCount);
    });
    return () => {
      socket.leaveListing(id);
      unsubComment();
      unsubEngagement();
    };
  }, [id, socket]);

  // ── Favorites (like/unlike) ─────────────────────────────────────────────────
  const addFav = useAddFavorite();
  const removeFav = useRemoveFavorite();

  const handleLike = useCallback(() => {
    if (!user) { setLocation("/auth/login"); return; }
    if (liked) {
      markUnfavorited(id);
      setLikeCount(c => Math.max(0, c - 1));
      removeFav.mutate({ listingId: id }, {
        onError: () => { markFavorited(id); setLikeCount(c => c + 1); },
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetFavoritesQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetListingQueryKey(id) });
        },
      });
    } else {
      markFavorited(id);
      setLikeCount(c => c + 1);
      addFav.mutate({ listingId: id }, {
        onError: () => { markUnfavorited(id); setLikeCount(c => Math.max(0, c - 1)); },
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetFavoritesQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetListingQueryKey(id) });
        },
      });
    }
  }, [liked, user, id, addFav, removeFav, queryClient, setLocation, markFavorited, markUnfavorited]);

  // ── Share ───────────────────────────────────────────────────────────────────
  const shareUrl = `${window.location.origin}/listings/${id}`;

  const trackShare = useCallback(() => {
    fetch(`/api/listings/${id}/share`, { method: "POST" })
      .then(r => r.json())
      .then(d => { if (d.sharesCount != null) setShareCount(d.sharesCount); })
      .catch(() => {});
    setShareCount(c => c + 1);
  }, [id]);

  const handleNativeShare = useCallback(async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: listing?.title ?? "FLEXA MARKET", url: shareUrl });
      } else {
        await navigator.clipboard.writeText(shareUrl);
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 2000);
        toast({ title: t("share.copied") });
      }
      trackShare();
    } catch { /* user cancelled */ }
  }, [listing, shareUrl, trackShare, toast, t]);

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
      toast({ title: t("share.copied") });
      trackShare();
    } catch { toast({ title: "Could not copy", variant: "destructive" }); }
  }, [shareUrl, trackShare, toast, t]);

  const shareWhatsApp = useCallback(() => {
    const text = encodeURIComponent(`${listing?.title ?? ""} — ${shareUrl}`);
    window.open(`https://wa.me/?text=${text}`, "_blank", "noopener,noreferrer");
    trackShare();
  }, [listing, shareUrl, trackShare]);

  const shareFacebook = useCallback(() => {
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`, "_blank", "noopener,noreferrer");
    trackShare();
  }, [shareUrl, trackShare]);

  // ── Video controls ──────────────────────────────────────────────────────────
  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play().catch(() => {}); setPlaying(true); }
    else { v.pause(); setPlaying(false); }
  }, []);

  const handleVideoStall = useCallback(() => {
    const el = videoRef.current;
    if (!el || el.paused) return;
    if (stallTimerRef.current) clearTimeout(stallTimerRef.current);
    stallTimerRef.current = setTimeout(() => {
      const v = videoRef.current;
      if (!v || v.paused || v.readyState >= 3) return;
      const t = v.currentTime;
      v.load();
      v.currentTime = t;
      v.play().catch(() => {});
    }, 2500);
  }, []);

  const handleMuteToggle = useCallback(() => {
    const nowUnlocked = muted;
    setAudioUnlocked(nowUnlocked);
    setMuted(!nowUnlocked);
    if (videoRef.current) videoRef.current.muted = !nowUnlocked;
  }, [muted]);

  // Sync with other pages that may unlock audio
  useEffect(() => {
    const handler = (e: Event) => {
      const unlocked = (e as CustomEvent<boolean>).detail;
      setMuted(!unlocked);
      if (videoRef.current) videoRef.current.muted = !unlocked;
    };
    window.addEventListener("flexa:audio-unlocked", handler);
    return () => window.removeEventListener("flexa:audio-unlocked", handler);
  }, []);


  // ── Comments ────────────────────────────────────────────────────────────────
  const handleReply = useCallback((commentId: number, userName: string) => {
    setReplyTo({ id: commentId, name: userName });
    setTimeout(() => commentInputRef.current?.focus(), 100);
  }, []);

  const submitComment = useCallback(async () => {
    if (!commentText.trim()) return;
    if (!user) { toast({ title: "Sign in to comment", variant: "destructive" }); return; }
    if (isRestricted) { toast({ title: t("restriction.title"), description: t("restriction.desc"), variant: "destructive" }); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/listings/${id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ content: commentText.trim(), parentId: replyTo?.id }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast({ title: d.error ?? "Failed to post", variant: "destructive" });
        return;
      }
      const newComment = await res.json();
      // Socket will broadcast to other viewers; add locally immediately
      if (replyTo) {
        setComments(prev =>
          prev.map(c => c.id === replyTo.id ? { ...c, replies: [...c.replies, newComment] } : c),
        );
      } else {
        setComments(prev => [...prev, { ...newComment, replies: [] }]);
      }
      setCommentText("");
      setReplyTo(null);
    } catch {
      toast({ title: "Failed to post comment", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }, [commentText, user, id, token, replyTo, toast]);

  const deleteComment = useCallback(async (commentId: number) => {
    try {
      await fetch(`/api/comments/${commentId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      setComments(prev =>
        prev.map(c => {
          if (c.id === commentId) return { ...c, content: "[deleted]", isDeleted: true };
          return {
            ...c,
            replies: c.replies.map(r =>
              r.id === commentId ? { ...r, content: "[deleted]", isDeleted: true } : r,
            ),
          };
        }),
      );
    } catch { toast({ title: "Failed to delete", variant: "destructive" }); }
  }, [token, toast]);

  const totalComments = comments.length + comments.reduce((a, c) => a + c.replies.length, 0);

  // ── Loading skeleton ────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto px-0 md:px-4 pb-8">
        <div className="flex items-center gap-3 p-4">
          <Skeleton className="h-8 w-8 rounded-full" />
          <Skeleton className="h-5 w-40" />
        </div>
        <Skeleton className="w-full aspect-video" />
        <div className="p-4 space-y-3">
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <div className="flex gap-6">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-8 w-16" />)}
          </div>
        </div>
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <p className="text-muted-foreground">Listing not found.</p>
        <Button variant="outline" className="mt-4" onClick={() => setLocation("/")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Go Home
        </Button>
      </div>
    );
  }

  // boostVideoUrl is the promo video; fall back to listingVideoUrl for non-boost video posts
  const rawVideoUrl: string | null = (listing as any).boostVideoUrl ?? (listing as any).listingVideoUrl ?? null;
  // Cloudinary needs the faststart transform or 1+ min videos render as a black screen.
  const videoUrl: string | null = rawVideoUrl ? toStreamingVideoUrl(rawVideoUrl) : null;
  const isOwner = user && listing.sellerId ? user.id === listing.sellerId : false;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div ref={containerRef} className="md:flex md:h-full md:overflow-hidden">

      {/* ══════════════════════════════════════════════
          LEFT COLUMN — video + info + engagement
          (sticky on desktop, normal scroll on mobile)
          ══════════════════════════════════════════════ */}
      <div className="md:w-[440px] md:flex-shrink-0 md:flex md:flex-col md:h-full md:overflow-y-auto md:border-r md:border-border">

      {/* ── Top nav ── */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border sticky top-0 bg-background/95 backdrop-blur z-10">
        <button
          onClick={() => setLocation(`/listings/${id}`)}
          className="p-1.5 rounded-full hover:bg-muted transition-colors"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <span className="font-bold text-sm flex-1 truncate">{listing.title}</span>
        {listing.isBoosted && (
          <Badge className="bg-amber-500 text-white text-xs gap-0.5 px-1.5">
            <Zap className="h-2.5 w-2.5" /> Boosted
          </Badge>
        )}
      </div>

      {/* ── Video player ── */}
      <div className="relative bg-black overflow-hidden" style={{ aspectRatio: "16/9" }}>
        {videoUrl ? (
          <>
            <video
              ref={videoRef}
              src={videoUrl}
              autoPlay
              muted
              playsInline
              loop
              preload="auto"
              className="w-full h-full object-contain"
              onCanPlay={() => {
                setVideoReady(true);
                if (videoRef.current) {
                  videoRef.current.muted = !isAudioUnlocked();
                }
              }}
              onPlay={() => { setPlaying(true); if (stallTimerRef.current) { clearTimeout(stallTimerRef.current); stallTimerRef.current = null; } }}
              onPause={() => setPlaying(false)}
              onStalled={handleVideoStall}
              onWaiting={handleVideoStall}
              onError={() => {
                const el = videoRef.current;
                if (!el || el.paused) return;
                setTimeout(() => { el.load(); el.play().catch(() => {}); }, 1500);
              }}
            />

            {/* Click-to-play overlay */}
            <button
              className="absolute inset-0 w-full h-full focus:outline-none"
              onClick={togglePlay}
              aria-label={playing ? "Pause" : "Play"}
            >
              {!playing && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="bg-black/50 rounded-full p-4">
                    <Play className="h-8 w-8 text-white fill-white" />
                  </div>
                </div>
              )}
            </button>

            {/* Mute / unmute toggle */}
            <button
              className="absolute top-3 right-3 z-10 bg-black/40 backdrop-blur-sm rounded-full p-2 text-white"
              onClick={e => { e.stopPropagation(); handleMuteToggle(); }}
              aria-label={muted ? "Unmute" : "Mute"}
            >
              {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
            </button>

          </>
        ) : (
          // No video — show listing images as fallback
          <div className="w-full h-full flex items-center justify-center bg-muted">
            {listing.images?.[0] ? (
              <img
                src={listing.images[0]}
                alt={listing.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="text-center text-muted-foreground p-8">
                <Play className="h-12 w-12 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No video available</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Seller info ── */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
        <Link href={`/profile/${listing.sellerId}`}>
          <Avatar className="h-10 w-10 ring-2 ring-primary/20">
            <AvatarImage src={(listing as any).sellerAvatar ?? undefined} />
            <AvatarFallback className="bg-primary text-primary-foreground font-bold text-sm">
              {listing.sellerName?.[0] ?? "?"}
            </AvatarFallback>
          </Avatar>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <Link href={`/profile/${listing.sellerId}`}>
              <span className="font-semibold text-sm text-foreground hover:text-primary truncate">
                {listing.sellerName}
              </span>
            </Link>
            {listing.sellerIsVerified && (
              <BadgeCheck className="h-4 w-4 text-primary flex-shrink-0" />
            )}
            {(listing as any).sellerSubscriptionPlan === "vip" && (
              <Crown className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
            )}
          </div>
          {listing.city && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="h-3 w-3" />
              <span>{listing.city}{listing.country ? `, ${listing.country}` : ""}</span>
            </div>
          )}
        </div>
        {!isOwner && (
          <Button
            size="sm"
            variant="outline"
            className="flex-shrink-0 h-8 text-xs font-semibold"
            onClick={() => setLocation(`/listings/${id}`)}
          >
            View Listing
          </Button>
        )}
      </div>

      {/* ── Title + price ── */}
      <div className="px-4 py-3 border-b border-border">
        <h1 className="font-bold text-base text-foreground leading-snug line-clamp-2">
          {listing.title}
        </h1>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className="text-lg font-bold text-primary">
            {formatPrice(listing.price, listing.country, (listing as any).currency)}
          </span>
          {listing.condition && (
            <Badge variant="secondary" className="text-xs capitalize">
              {listing.condition.replace("_", " ")}
            </Badge>
          )}
          {listing.status === "sold" && (
            <Badge variant="destructive" className="text-xs">SOLD</Badge>
          )}
        </div>
        {listing.description && (
          <p className="text-sm text-muted-foreground mt-1.5 line-clamp-3">
            {listing.description}
          </p>
        )}
      </div>

      {/* ── Engagement bar ── */}
      <div className="flex items-center justify-around px-2 py-3 border-b border-border">
        {/* Like */}
        <button
          onClick={handleLike}
          className={cn(
            "flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl transition-all active:scale-95",
            liked ? "text-red-500" : "text-muted-foreground hover:text-red-400",
          )}
          data-testid="button-video-like"
        >
          <Heart className={cn("h-6 w-6 transition-transform", liked && "fill-red-500 scale-110")} />
          <span className="text-xs font-semibold">{formatCount(likeCount)}</span>
        </button>

        {/* Comments */}
        <button
          onClick={() => commentInputRef.current?.focus()}
          className="flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl text-muted-foreground hover:text-primary transition-all active:scale-95"
          data-testid="button-video-comments"
        >
          <MessageCircle className="h-6 w-6" />
          <span className="text-xs font-semibold">{formatCount(totalComments)}</span>
        </button>

        {/* Share (with dropdown) */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl text-muted-foreground hover:text-primary transition-all active:scale-95"
              data-testid="button-video-share"
            >
              <Share2 className="h-6 w-6" />
              <span className="text-xs font-semibold">{formatCount(shareCount)}</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" className="w-48">
            <DropdownMenuItem onClick={handleNativeShare} className="gap-2 cursor-pointer">
              <Share2 className="h-4 w-4" /> Share…
            </DropdownMenuItem>
            <DropdownMenuItem onClick={shareWhatsApp} className="gap-2 cursor-pointer text-[#25D366]">
              <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" xmlns="http://www.w3.org/2000/svg">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              WhatsApp
            </DropdownMenuItem>
            <DropdownMenuItem onClick={shareFacebook} className="gap-2 cursor-pointer text-[#1877F2]">
              <Facebook className="h-4 w-4" /> Facebook
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={copyLink} className="gap-2 cursor-pointer">
              {linkCopied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              {linkCopied ? "Copied!" : "Copy link"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Views */}
        <div className="flex flex-col items-center gap-0.5 px-3 py-1 text-muted-foreground">
          <Eye className="h-6 w-6" />
          <span className="text-xs font-semibold">{formatCount(viewCount)}</span>
        </div>
      </div>

      </div>{/* end left column */}

      {/* ══════════════════════════════════════════════
          RIGHT COLUMN — comments (desktop only scrollable panel)
          On mobile this is just a normal block below engagement bar
          ══════════════════════════════════════════════ */}
      <div className="md:flex-1 md:h-full md:overflow-y-auto md:flex md:flex-col">

        {/* ── Comments section header (pinned on desktop) ── */}
        <div className="sticky top-0 bg-background/95 backdrop-blur z-10 px-4 py-3 border-b border-border">
          <h2 className="font-bold text-sm text-foreground flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-primary" />
            Comments
            {totalComments > 0 && (
              <span className="text-xs bg-primary/10 text-primary rounded-full px-2 py-0.5 font-bold">
                {totalComments}
              </span>
            )}
          </h2>
        </div>

        {/* ── Comment input ── */}
        <div className="px-4 pt-3 pb-2 border-b border-border/50">
          {user ? (
            <div className="flex gap-1.5 items-end">
              {isRestricted ? (
                <div className="flex-1">
                  <RestrictionBanner action="comment" />
                </div>
              ) : (<>
              <Avatar className="h-8 w-8 flex-shrink-0 mb-0.5">
                <AvatarImage src={user.avatar ?? undefined} />
                <AvatarFallback className="text-xs bg-primary text-primary-foreground font-bold">
                  {user.name[0]}
                </AvatarFallback>
              </Avatar>
              <EmojiPickerButton
                onEmojiSelect={(emoji) =>
                  setCommentText(prev => insertEmojiAtCursor(commentInputRef.current, prev, emoji))
                }
              />
              <div className="flex-1 relative">
                {replyTo && (
                  <div className="flex items-center gap-1.5 mb-1 text-xs text-muted-foreground">
                    <Reply className="h-3 w-3" />
                    <span>Replying to {replyTo.name}</span>
                    <button
                      onClick={() => setReplyTo(null)}
                      className="ml-1 text-muted-foreground hover:text-foreground font-semibold text-xs"
                    >
                      ✕
                    </button>
                  </div>
                )}
                <Textarea
                  ref={commentInputRef}
                  value={commentText}
                  onChange={e => setCommentText(e.target.value)}
                  placeholder="Write a comment…"
                  rows={1}
                  className="resize-none text-sm rounded-2xl min-h-[38px] py-2.5 pr-10"
                  onKeyDown={e => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      submitComment();
                    }
                  }}
                  maxLength={1000}
                />
                <button
                  onClick={submitComment}
                  disabled={submitting || !commentText.trim()}
                  className="absolute right-2.5 bottom-2.5 text-primary disabled:text-muted-foreground transition-colors"
                  aria-label="Post comment"
                >
                  {submitting
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <SendHorizontal className="h-4 w-4" />}
                </button>
              </div>
              </>)}
            </div>
          ) : (
            <button
              onClick={() => setLocation("/auth/login")}
              className="w-full text-sm text-muted-foreground bg-secondary rounded-2xl px-4 py-2.5 text-left hover:bg-muted transition-colors"
            >
              Sign in to comment…
            </button>
          )}
        </div>

        {/* ── Comment list ── */}
        <div className="flex-1 px-4 py-4">
          {!commentsLoaded ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="flex gap-2.5 animate-pulse">
                  <div className="w-7 h-7 rounded-full bg-muted flex-shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 bg-muted rounded-full w-24" />
                    <div className="h-8 bg-muted rounded-2xl w-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : comments.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <MessageCircle className="h-10 w-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm font-medium">Be the first to comment!</p>
            </div>
          ) : (
            <div className="space-y-4 pb-8">
              {comments.map(comment => (
                <div key={comment.id}>
                  <CommentRow
                    comment={comment}
                    onReply={handleReply}
                    onDelete={deleteComment}
                    currentUserId={user?.id}
                    isAdmin={(user as any)?.isAdmin}
                  />
                  {comment.replies.map(reply => (
                    <CommentRow
                      key={reply.id}
                      comment={reply as unknown as Comment}
                      isReply
                      onDelete={deleteComment}
                      currentUserId={user?.id}
                      isAdmin={(user as any)?.isAdmin}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

      </div>{/* end right column */}
    </div>
  );
}
