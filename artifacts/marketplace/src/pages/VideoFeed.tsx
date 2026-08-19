import { useState, useEffect, useLayoutEffect, useRef, useCallback } from "react";
import { useSEO } from "@/hooks/useSEO";
import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import {
  Heart, MessageCircle, Share2, Eye,
  Play, BadgeCheck, Loader2, X, ArrowLeft,
  SendHorizontal, ChevronDown, Zap, Plus, ShoppingBag,
  MoreVertical, Pencil, Trash2, Check,
  VolumeX, Volume2, Bookmark, Home,
} from "lucide-react";

import { useAuth } from "@/contexts/auth";
import { useFavorites } from "@/contexts/favorites";
import { useToast } from "@/hooks/use-toast";
import { useRestriction } from "@/hooks/useRestriction";
import { RestrictionBanner } from "@/components/RestrictionBanner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { formatPrice } from "@/lib/currency";
import { captureVideoPosterFrame } from "@/lib/videoPoster";
import { cn } from "@/lib/utils";
import { insertEmojiAtCursor } from "@/components/EmojiPickerButton";
import TikTokEmojiPanel from "@/components/TikTokEmojiPanel";
import BoostWizard from "@/components/BoostWizard";
import { isAudioUnlocked, setAudioUnlocked } from "@/lib/audioUnlocked";

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} xmlns="http://www.w3.org/2000/svg">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  );
}

// ── Expandable caption — TikTok "...plus" pattern ─────────────────────────────

function ExpandableCaption({ text }: { text: string }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > 65;
  if (!isLong) return <p className="text-white text-[14px] leading-snug break-words drop-shadow-md">{text}</p>;
  return (
    <p className="text-white text-[14px] leading-snug break-words drop-shadow-md">
      {expanded ? text : <>{text.slice(0, 65)}</>}
      {!expanded && (
        <button type="button" onClick={() => setExpanded(true)} className="text-white/55 font-semibold ml-0.5">
          {t("tr.readMore")}
        </button>
      )}
    </p>
  );
}

// ── Single comment row — TikTok flat style ────────────────────────────────────

function CommentActionMenu({
  canEdit, canDelete, onEdit, onDelete, onClose,
}: { canEdit: boolean; canDelete: boolean; onEdit: () => void; onDelete: () => void; onClose: () => void }) {
  const { t } = useTranslation();
  useEffect(() => {
    const close = (e: MouseEvent | TouchEvent) => { onClose(); };
    setTimeout(() => {
      document.addEventListener("mousedown", close);
      document.addEventListener("touchstart", close, { passive: true });
    }, 0);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("touchstart", close);
    };
  }, [onClose]);

  return (
    <div
      className="absolute right-0 top-6 z-[80] rounded-xl overflow-hidden shadow-2xl"
      style={{ background: "#2a2a2a", border: "1px solid rgba(255,255,255,0.12)", minWidth: 160 }}
      onMouseDown={e => e.stopPropagation()}
      onTouchStart={e => e.stopPropagation()}
    >
      {canEdit && (
        <button
          type="button"
          onClick={() => { onEdit(); onClose(); }}
          className="w-full flex items-center gap-2.5 px-4 py-3 text-[13px] font-medium text-white/90 hover:bg-white/10 active:bg-white/15 transition-colors"
        >
          <Pencil className="h-3.5 w-3.5 text-white/60" />
          {t("tr.edit")}
        </button>
      )}
      {canEdit && canDelete && <div style={{ height: 1, background: "rgba(255,255,255,0.08)" }} />}
      {canDelete && (
        <button
          type="button"
          onClick={() => { onDelete(); onClose(); }}
          className="w-full flex items-center gap-2.5 px-4 py-3 text-[13px] font-medium text-red-400 hover:bg-red-500/15 active:bg-red-500/20 transition-colors"
        >
          <Trash2 className="h-3.5 w-3.5" />
          {t("tr.delete")}
        </button>
      )}
    </div>
  );
}

function CommentRow({
  comment, sellerId, currentUserId, isCollapsed, likedComments, commentLikes,
  onToggleLike, onToggleReplies, onReply, onDelete, onEdit, t,
}: {
  comment: CommentItem;
  sellerId: number;
  currentUserId?: number;
  isCollapsed: boolean;
  likedComments: Set<number>;
  commentLikes: Map<number, number>;
  onToggleLike: (id: number) => void;
  onToggleReplies: (id: number) => void;
  onReply: (name: string) => void;
  onDelete: (id: number) => void;
  onEdit: (id: number, content: string) => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  const { token } = useAuth();
  const { toast } = useToast();
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(comment.content);
  const [saving, setSaving] = useState(false);

  const isCreator = comment.userId === sellerId;
  const likeCount = commentLikes.get(comment.id) ?? 0;
  const isLiked = likedComments.has(comment.id);
  const canEdit = !!currentUserId && currentUserId === comment.userId && !comment.isDeleted;
  const canDelete = !!currentUserId && (currentUserId === comment.userId || currentUserId === sellerId) && !comment.isDeleted;
  const showMenu = (canEdit || canDelete) && !comment.isDeleted;

  const saveEdit = async () => {
    if (!editText.trim() || editText.trim() === comment.content) { setEditing(false); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/comments/${comment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ content: editText.trim() }),
      });
      if (!res.ok) throw new Error();
      onEdit(comment.id, editText.trim());
      setEditing(false);
    } catch {
      toast({ title: t("tr.editFailed"), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const deleteComment = async () => {
    try {
      const res = await fetch(`/api/comments/${comment.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      onDelete(comment.id);
    } catch {
      toast({ title: t("tr.deleteCommentFailed"), variant: "destructive" });
    }
  };

  return (
    <div className="flex gap-3">
      <Link href={`/profile/${comment.userId}`}>
        <Avatar className="h-9 w-9 shrink-0 mt-0.5 cursor-pointer active:opacity-70 transition-opacity">
          <AvatarImage src={comment.userAvatar ?? undefined} />
          <AvatarFallback className="text-xs bg-zinc-700 text-white font-bold">{comment.userName?.[0] ?? "?"}</AvatarFallback>
        </Avatar>
      </Link>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
              <Link href={`/profile/${comment.userId}`}>
                <span className="text-[13px] font-bold text-white/90 leading-none cursor-pointer hover:text-white transition-colors">{comment.userName}</span>
              </Link>
              {comment.userIsVerified && <BadgeCheck className="h-3 w-3 text-primary shrink-0" />}
              {isCreator && (
                <span
                  className="text-[9px] font-black px-1.5 py-0.5 rounded-sm leading-none text-white"
                  style={{ background: "linear-gradient(135deg, #f97316, #ea580c)" }}
                >
                  {t("videoFeed.creator")}
                </span>
              )}
            </div>

            {/* Inline edit mode */}
            {editing ? (
              <div className="mt-1">
                <textarea
                  autoFocus
                  value={editText}
                  onChange={e => setEditText(e.target.value)}
                  rows={2}
                  className="w-full resize-none rounded-lg px-2.5 py-1.5 text-[13px] text-white bg-white/10 border border-white/20 focus:outline-none focus:border-primary leading-snug"
                  style={{ minHeight: 56 }}
                />
                <div className="flex items-center gap-2 mt-1.5">
                  <button
                    type="button"
                    onClick={() => { setEditing(false); setEditText(comment.content); }}
                    className="text-[12px] text-white/50 font-semibold"
                  >
                    {t("tr.cancel")}
                  </button>
                  <button
                    type="button"
                    onClick={saveEdit}
                    disabled={saving || !editText.trim()}
                    className="flex items-center gap-1 text-[12px] font-bold text-primary disabled:opacity-40"
                  >
                    {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                    {t("tr.save")}
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-[14px] text-white/90 leading-snug break-words">
                {comment.isDeleted
                  ? <span className="italic text-white/35">{t("videoFeed.deletedComment")}</span>
                  : comment.content}
              </p>
            )}

            {!editing && (
              <div className="flex items-center gap-3 mt-1.5">
                <span className="text-[11px] text-white/40">{timeAgo(comment.createdAt, t("videoFeed.timeJustNow"))}</span>
                {!comment.isDeleted && (
                  <button
                    type="button"
                    onClick={() => onReply(comment.userName)}
                    className="text-[12px] font-semibold text-white/50"
                  >
                    {t("videoFeed.reply")}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Right side: ⋯ menu + heart */}
          <div className="flex flex-col items-center gap-1.5 shrink-0 pt-0.5">
            {showMenu && !editing && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setMenuOpen(v => !v)}
                  className="flex items-center justify-center w-6 h-6 rounded-full text-white/30 hover:text-white/70 hover:bg-white/10 active:scale-90 transition-all"
                  aria-label="Options"
                >
                  <MoreVertical className="h-3.5 w-3.5" />
                </button>
                {menuOpen && (
                  <CommentActionMenu
                    canEdit={canEdit}
                    canDelete={canDelete}
                    onEdit={() => { setEditing(true); setEditText(comment.content); }}
                    onDelete={deleteComment}
                    onClose={() => setMenuOpen(false)}
                  />
                )}
              </div>
            )}
            <button type="button" onClick={() => onToggleLike(comment.id)} className="active:scale-90 transition-transform">
              <Heart className={cn("h-4 w-4 transition-colors", isLiked ? "fill-red-500 text-red-500" : "text-white/40")} />
            </button>
            {likeCount > 0 && <span className="text-[10px] text-white/40 tabular-nums leading-none">{likeCount}</span>}
          </div>
        </div>

        {/* Show/hide replies toggle */}
        {comment.replies?.length > 0 && (
          <button
            type="button"
            onClick={() => onToggleReplies(comment.id)}
            className="flex items-center gap-2 mt-2.5 text-[12px] font-semibold text-white/55"
          >
            <div className="w-6 h-px bg-white/30" />
            {isCollapsed
              ? t("tr.showReplies", { count: comment.replies.length })
              : t("tr.hideReplies")}
          </button>
        )}

        {/* Replies (collapsed by default) */}
        {!isCollapsed && comment.replies?.map(r => {
          const rCanEdit = !!currentUserId && currentUserId === r.userId && !r.isDeleted;
          const rCanDelete = !!currentUserId && (currentUserId === r.userId || currentUserId === sellerId) && !r.isDeleted;
          return (
            <div key={r.id} className="flex gap-2.5 mt-3">
              <Avatar className="h-7 w-7 shrink-0 mt-0.5">
                <AvatarImage src={r.userAvatar ?? undefined} />
                <AvatarFallback className="text-[10px] bg-zinc-700 text-white font-bold">{r.userName?.[0]}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1 mb-0.5 flex-wrap">
                      <span className="text-[12px] font-bold text-white/90">{r.userName}</span>
                      {r.userIsVerified && <BadgeCheck className="h-2.5 w-2.5 text-primary shrink-0" />}
                      {r.userId === sellerId && (
                        <span
                          className="text-[8px] font-black px-1 py-0.5 rounded-sm leading-none text-white"
                          style={{ background: "linear-gradient(135deg, #f97316, #ea580c)" }}
                        >
                          {t("videoFeed.creator")}
                        </span>
                      )}
                    </div>
                    <p className="text-[13px] text-white/85 leading-snug break-words">
                      {r.isDeleted ? <span className="italic text-white/35">{t("videoFeed.deletedComment")}</span> : r.content}
                    </p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-[11px] text-white/40">{timeAgo(r.createdAt, t("videoFeed.timeJustNow"))}</span>
                      {!r.isDeleted && (
                        <button
                          type="button"
                          onClick={() => onReply(r.userName)}
                          className="text-[12px] font-semibold text-white/50"
                        >
                          {t("videoFeed.reply")}
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-center gap-1 shrink-0 pt-0.5">
                    {(rCanEdit || rCanDelete) && (
                      <ReplyActionBtn
                        commentId={r.id}
                        canEdit={rCanEdit}
                        canDelete={rCanDelete}
                        content={r.content}
                        token={token}
                        onEdit={(id, c) => onEdit(id, c)}
                        onDelete={id => onDelete(id)}
                      />
                    )}
                    <button type="button" onClick={() => onToggleLike(r.id)} className="active:scale-90 transition-transform">
                      <Heart className={cn("h-3.5 w-3.5 transition-colors", likedComments.has(r.id) ? "fill-red-500 text-red-500" : "text-white/40")} />
                    </button>
                    {(commentLikes.get(r.id) ?? 0) > 0 && (
                      <span className="text-[10px] text-white/40 tabular-nums leading-none">{commentLikes.get(r.id)}</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ReplyActionBtn({
  commentId, canEdit, canDelete, content, token, onEdit, onDelete,
}: {
  commentId: number; canEdit: boolean; canDelete: boolean;
  content: string; token: string | null | undefined;
  onEdit: (id: number, c: string) => void;
  onDelete: (id: number) => void;
}) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setMenuOpen(v => !v)}
        className="flex items-center justify-center w-5 h-5 rounded-full text-white/30 hover:text-white/60 hover:bg-white/10 active:scale-90 transition-all"
      >
        <MoreVertical className="h-3 w-3" />
      </button>
      {menuOpen && (
        <CommentActionMenu
          canEdit={canEdit}
          canDelete={canDelete}
          onEdit={async () => {
            const newContent = window.prompt(t("tr.editCommentPrompt"), content);
            if (!newContent?.trim() || newContent.trim() === content) return;
            try {
              const res = await fetch(`/api/comments/${commentId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ content: newContent.trim() }),
              });
              if (!res.ok) throw new Error();
              onEdit(commentId, newContent.trim());
            } catch { toast({ title: t("tr.editFailed"), variant: "destructive" }); }
          }}
          onDelete={async () => {
            try {
              const res = await fetch(`/api/comments/${commentId}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` },
              });
              if (!res.ok) throw new Error();
              onDelete(commentId);
            } catch { toast({ title: t("tr.deleteFailed"), variant: "destructive" }); }
          }}
          onClose={() => setMenuOpen(false)}
        />
      )}
    </div>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface VideoItem {
  id: number;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  title: string;
  description: string;
  price: number;
  currency: string;
  originalPrice?: number | null;
  discountPct?: number | null;
  sellerId: number;
  sellerName: string;
  sellerAvatar: string | null;
  sellerIsVerified: boolean;
  sellerWhatsapp?: string | null;
  sellerPhone?: string | null;
  sellerIsFollowing?: boolean;
  viewCount: number;
  likeCount: number;
  sharesCount: number;
  commentCount: number;
  isBoosted: boolean;
  boostEndAt: string | null;
  createdAt: string | Date;
}

interface CommentItem {
  id: number;
  content: string;
  isDeleted: boolean;
  createdAt: string;
  userId: number;
  userName: string;
  userAvatar: string | null;
  userIsVerified: boolean;
  parentId: number | null;
  likeCount: number;
  isLikedByMe: boolean;
  replies: CommentItem[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function timeAgo(dateStr: string, justNowLabel: string): string {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return justNowLabel;
  if (diff < 3600) return `${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}j`;
}

// ── Comment Panel — TikTok exact style ────────────────────────────────────────

function CommentPanel({ listingId, sellerId, onClose }: { listingId: number; sellerId: number; onClose: () => void }) {
  const { user, token } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();
  const { isRestricted, showRestrictionToast } = useRestriction();
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [kbOffset, setKbOffset] = useState(0);
  const [collapsedReplies, setCollapsedReplies] = useState<Set<number>>(new Set());
  const [commentLikes, setCommentLikes] = useState<Map<number, number>>(new Map());
  const [likedComments, setLikedComments] = useState<Set<number>>(new Set());
  const [replyingTo, setReplyingTo] = useState<{ id: number; name: string } | null>(null);
  const [showEmojiPanel, setShowEmojiPanel] = useState(false);
  const [dragY, setDragY] = useState(0);
  const dragStartY = useRef<number | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const handleDragStart = (e: React.TouchEvent) => {
    dragStartY.current = e.touches[0].clientY;
    setDragY(0);
  };
  const handleDragMove = (e: React.TouchEvent) => {
    if (dragStartY.current === null) return;
    const delta = e.touches[0].clientY - dragStartY.current;
    if (delta > 0) setDragY(delta);
  };
  const handleDragEnd = () => {
    if (dragY > 80) { onClose(); }
    else { setDragY(0); }
    dragStartY.current = null;
  };

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const kb = Math.max(0, window.innerHeight - vv.height - (vv.offsetTop ?? 0));
      setKbOffset(kb);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => { vv.removeEventListener("resize", update); vv.removeEventListener("scroll", update); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/listings/${listingId}/comments`, { cache: "no-store" })
      .then(r => r.json())
      .then(d => {
        if (!cancelled) {
          const cs: CommentItem[] = Array.isArray(d) ? d : (d.comments ?? []);
          setComments(cs);
          const likesMap = new Map<number, number>();
          const likedSet = new Set<number>();
          cs.forEach(c => {
            likesMap.set(c.id, c.likeCount ?? 0);
            if (c.isLikedByMe) likedSet.add(c.id);
            c.replies?.forEach(r => {
              likesMap.set(r.id, r.likeCount ?? 0);
              if (r.isLikedByMe) likedSet.add(r.id);
            });
          });
          setCommentLikes(likesMap);
          setLikedComments(likedSet);
          setCollapsedReplies(new Set(cs.filter(c => (c.replies?.length ?? 0) > 0).map(c => c.id)));
          setLoading(false);
        }
      })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [listingId]);

  const handleSubmit = async () => {
    if (!user) { toast({ title: t("videoFeed.loginToComment"), variant: "destructive" }); return; }
    if (isRestricted) { showRestrictionToast(); return; }
    if (!text.trim()) return;
    const parentId = replyingTo?.id ?? null;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/listings/${listingId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ content: text.trim(), parentId }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (parentId) {
        setComments(prev => prev.map(comment => (
          comment.id === parentId
            ? { ...comment, replies: [...(comment.replies ?? []), data] }
            : comment
        )));
        setCollapsedReplies(prev => {
          const next = new Set(prev);
          next.delete(parentId);
          return next;
        });
      } else {
        setComments(prev => [data, ...prev]);
      }
      setText("");
      setReplyingTo(null);
      setShowEmojiPanel(false);
    } catch {
      toast({ title: t("videoFeed.commentSubmitError"), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const toggleCommentLike = useCallback(async (commentId: number) => {
    if (!user) return;
    const wasLiked = likedComments.has(commentId);
    // Optimistic update
    setLikedComments(prev => { const s = new Set(prev); wasLiked ? s.delete(commentId) : s.add(commentId); return s; });
    setCommentLikes(m => { const nm = new Map(m); nm.set(commentId, Math.max(0, (nm.get(commentId) ?? 0) + (wasLiked ? -1 : 1))); return nm; });
    try {
      const res = await fetch(`/api/comments/${commentId}/like`, {
        method: wasLiked ? "DELETE" : "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setCommentLikes(m => { const nm = new Map(m); nm.set(commentId, data.likeCount); return nm; });
        setLikedComments(prev => { const s = new Set(prev); data.isLikedByMe ? s.add(commentId) : s.delete(commentId); return s; });
      } else {
        // Rollback on error
        setLikedComments(prev => { const s = new Set(prev); wasLiked ? s.add(commentId) : s.delete(commentId); return s; });
        setCommentLikes(m => { const nm = new Map(m); nm.set(commentId, Math.max(0, (nm.get(commentId) ?? 0) + (wasLiked ? 1 : -1))); return nm; });
      }
    } catch {
      setLikedComments(prev => { const s = new Set(prev); wasLiked ? s.add(commentId) : s.delete(commentId); return s; });
      setCommentLikes(m => { const nm = new Map(m); nm.set(commentId, Math.max(0, (nm.get(commentId) ?? 0) + (wasLiked ? 1 : -1))); return nm; });
    }
  }, [user, token, likedComments]);

  const toggleReplies = (parentId: number) => {
    setCollapsedReplies(prev => {
      const next = new Set(prev);
      if (next.has(parentId)) { next.delete(parentId); } else { next.add(parentId); }
      return next;
    });
  };

  const handleDeleteComment = useCallback((id: number) => {
    setComments(prev => prev
      .map(c => {
        if (c.id === id) return { ...c, isDeleted: true, content: "" };
        return { ...c, replies: c.replies?.map(r => r.id === id ? { ...r, isDeleted: true, content: "" } : r) };
      })
    );
  }, []);

  const handleEditComment = useCallback((id: number, newContent: string) => {
    setComments(prev => prev
      .map(c => {
        if (c.id === id) return { ...c, content: newContent };
        return { ...c, replies: c.replies?.map(r => r.id === id ? { ...r, content: newContent } : r) };
      })
    );
  }, []);

  return (
    <div
      className="fixed z-[60] flex flex-col left-1/2 -translate-x-1/2 w-full"
      role="dialog"
      aria-modal="true"
      data-testid="video-comments-panel"
      style={{
        bottom: kbOffset,
        maxWidth: "420px",
        maxHeight: `min(75vh, calc(100vh - ${kbOffset}px - 60px))`,
        transition: dragY > 0 ? "none" : "bottom 0.18s cubic-bezier(0.25,0.46,0.45,0.94), transform 0.22s cubic-bezier(0.25,0.46,0.45,0.94)",
        transform: `translateY(${dragY}px)`,
        background: "#1C1C1C",
        borderRadius: "16px 16px 0 0",
        boxShadow: "0 -4px 40px rgba(0,0,0,0.8)",
      }}
      onClick={e => e.stopPropagation()}
      onTouchStart={e => e.stopPropagation()}
      onTouchEnd={e => e.stopPropagation()}
      onTouchMove={e => e.stopPropagation()}
    >
      {/* Drag handle — swipe down to close */}
      <div
        className="flex justify-center pt-2.5 pb-2 shrink-0 cursor-grab active:cursor-grabbing select-none"
        onTouchStart={handleDragStart}
        onTouchMove={handleDragMove}
        onTouchEnd={handleDragEnd}
      >
        <div
          className="w-10 h-[4px] rounded-full transition-colors"
          style={{ background: dragY > 40 ? "rgba(249,115,22,0.7)" : "rgba(255,255,255,0.25)" }}
        />
      </div>

      {/* Header — centered count + X button */}
      <div
        className="flex items-center justify-center px-5 py-3 shrink-0 relative"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.10)" }}
      >
        <span className="font-bold text-[15px] text-white">
          {loading ? "..." : t("videoFeed.commentCount", { count: comments.length })}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 w-8 h-8 rounded-full flex items-center justify-center"
          style={{ background: "rgba(255,255,255,0.15)" }}
        >
          <X className="h-4 w-4 text-white" />
        </button>
      </div>

      {/* Comment list */}
      <div ref={listRef} className="flex-1 overflow-y-auto min-h-0 px-4 py-3">
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-white/40" />
          </div>
        ) : comments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <MessageCircle className="h-9 w-9 text-white/20" />
            <p className="text-sm text-white/40 font-medium">{t("videoFeed.commentsEmpty")}</p>
          </div>
        ) : (
          <div className="space-y-5">
            {comments.map(c => (
              <CommentRow
                key={c.id}
                comment={c}
                sellerId={sellerId}
                currentUserId={user?.id}
                isCollapsed={collapsedReplies.has(c.id)}
                likedComments={likedComments}
                commentLikes={commentLikes}
                onToggleLike={toggleCommentLike}
                onToggleReplies={toggleReplies}
                onReply={name => { setReplyingTo({ id: c.id, name }); setShowEmojiPanel(false); textRef.current?.focus(); }}
                onDelete={handleDeleteComment}
                onEdit={handleEditComment}
                t={t}
              />
            ))}
          </div>
        )}
      </div>

      {/* Input bar — TikTok style */}
      <div className="shrink-0 px-3 py-2.5" style={{ borderTop: "1px solid rgba(255,255,255,0.10)" }}>
        {isRestricted ? (
          <RestrictionBanner action="comment" />
        ) : (
          <div className="flex items-center gap-2">
            {user && (
              <Avatar className="h-8 w-8 shrink-0">
                <AvatarImage src={(user as any).avatar ?? undefined} />
                <AvatarFallback className="text-xs bg-zinc-600 text-white font-bold">
                  {(user.name ?? user.email ?? "?")[0].toUpperCase()}
                </AvatarFallback>
              </Avatar>
            )}
            <div
              className="flex-1 flex items-center gap-1 px-3 rounded-full min-h-[40px]"
              style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              {replyingTo && (
                <span className="text-primary text-[12px] font-semibold shrink-0 mr-1">@{replyingTo.name}</span>
              )}
              <Textarea
                ref={textRef}
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder={replyingTo ? t("videoFeed.replyPlaceholder", { name: replyingTo.name }) : t("videoFeed.commentPlaceholderDefault")}
                rows={1}
                className="flex-1 resize-none bg-transparent border-0 shadow-none p-0 text-[14px] text-white placeholder:text-white/40 focus-visible:ring-0 min-h-0 leading-snug self-center"
                style={{ maxHeight: "80px", overflowY: text.length > 80 ? "auto" : "hidden" }}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
              />
            </div>
            {/* Icon tray — emoji + send */}
            <div className="flex items-center gap-1.5 shrink-0">
              {/* Emoji toggle button */}
              <button
                type="button"
                onClick={() => {
                  setShowEmojiPanel(v => !v);
                  if (!showEmojiPanel) textRef.current?.blur();
                  else textRef.current?.focus();
                }}
                className="w-8 h-8 rounded-full flex items-center justify-center transition-all active:scale-90"
                style={{
                  background: showEmojiPanel ? "rgba(249,115,22,0.25)" : "rgba(255,255,255,0.12)",
                  border: showEmojiPanel ? "1px solid rgba(249,115,22,0.5)" : "1px solid transparent",
                }}
                aria-label="Emoji"
              >
                <span style={{ fontSize: 18, lineHeight: 1 }}>😊</span>
              </button>

              {/* Send button */}
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting || !text.trim()}
                className="w-8 h-8 rounded-full flex items-center justify-center active:scale-90 transition-transform disabled:opacity-30"
                style={{ background: "linear-gradient(135deg, #f97316, #fb923c)" }}
                aria-label="Voye"
              >
                {submitting
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin text-white" />
                  : <SendHorizontal className="h-3.5 w-3.5 text-white" />}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* TikTok-style emoji panel */}
      <TikTokEmojiPanel
        visible={showEmojiPanel && !isRestricted}
        onEmojiSelect={emoji => {
          if (textRef.current) {
            setText(insertEmojiAtCursor(textRef.current, text, emoji));
          } else {
            setText(t => t + emoji);
          }
        }}
      />
    </div>
  );
}

// ── Single video card — TikTok style ──────────────────────────────────────────

function VideoCard({
  video,
  isActive,
  isNext,
  onCommentOpen,
  onNext,
}: {
  video: VideoItem;
  isActive: boolean;
  isNext: boolean;
  onCommentOpen: (id: number) => void;
  onNext: () => void;
}) {
  const { user, token, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { t } = useTranslation();
  const { isRestricted, showRestrictionToast } = useRestriction();
  const { isFavorited, markFavorited, markUnfavorited } = useFavorites();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const liked = isFavorited(video.id);
  const [likeCount, setLikeCount] = useState(video.likeCount);
  const [shareCount, setShareCount] = useState(video.sharesCount);
  const [showComments, setShowComments] = useState(false);
  const [showWhatsAppBtn, setShowWhatsAppBtn] = useState(false);
  const [whatsAppDismissed, setWhatsAppDismissed] = useState(false);
  const [showHeartFlash, setShowHeartFlash] = useState(false);
  const [isLandscape, setIsLandscape] = useState(false);
  const overlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapRef = useRef<number>(0);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPausedByHoldRef = useRef(false);
  const activatedAtRef = useRef<number>(0);
  const stallTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visualReadyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const frameCallbackRef = useRef<number | null>(null);
  const fallbackFrameRafRef = useRef<number | null>(null);
  const fallbackPaintRafRef = useRef<number | null>(null);
  const activationGenerationRef = useRef(0);
  const pendingReloadResumeRef = useRef<{
    element: HTMLVideoElement;
    listener: () => void;
  } | null>(null);
  const isActiveRef = useRef(isActive);
  const visibleFrameRef = useRef(false);
  const stallAttemptsRef = useRef(0);
  const hardReloadTriedRef = useRef(false);
  const [following, setFollowing] = useState(video.sellerIsFollowing ?? false);
  const [messagePending, setMessagePending] = useState(false);
  const [muted, setMuted] = useState(false);
  const [generatedThumbnail, setGeneratedThumbnail] = useState<string | null>(null);
  const [videoBuffering, setVideoBuffering] = useState(true);
  const [hasVisibleFrame, setHasVisibleFrame] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  isActiveRef.current = isActive;

  useEffect(() => {
    if (!isActive && !isNext && !video.thumbnailUrl) {
      setGeneratedThumbnail(null);
    }
  }, [isActive, isNext, video.thumbnailUrl]);

  // Sync muted state across all VideoCard instances when audio is unlocked
  useEffect(() => {
    const handler = (e: Event) => {
      if (!isActiveRef.current || !visibleFrameRef.current) return;
      const unlocked = (e as CustomEvent<boolean>).detail;
      setMuted(!unlocked);
      if (videoRef.current) videoRef.current.muted = !unlocked;
    };
    window.addEventListener("flexa:audio-unlocked", handler);
    return () => window.removeEventListener("flexa:audio-unlocked", handler);
  }, []);

  const cancelVisualReadinessChecks = useCallback(() => {
    if (visualReadyTimerRef.current) {
      clearTimeout(visualReadyTimerRef.current);
      visualReadyTimerRef.current = null;
    }
    const el = videoRef.current as (HTMLVideoElement & {
      cancelVideoFrameCallback?: (id: number) => void;
    }) | null;
    if (el && frameCallbackRef.current !== null && el.cancelVideoFrameCallback) {
      el.cancelVideoFrameCallback(frameCallbackRef.current);
    }
    frameCallbackRef.current = null;
    if (fallbackFrameRafRef.current !== null) {
      cancelAnimationFrame(fallbackFrameRafRef.current);
      fallbackFrameRafRef.current = null;
    }
    if (fallbackPaintRafRef.current !== null) {
      cancelAnimationFrame(fallbackPaintRafRef.current);
      fallbackPaintRafRef.current = null;
    }
  }, []);

  const cancelPendingReloadResume = useCallback(() => {
    const pending = pendingReloadResumeRef.current;
    if (pending) {
      pending.element.removeEventListener("loadedmetadata", pending.listener);
      pendingReloadResumeRef.current = null;
    }
  }, []);

  const markVisibleFrame = useCallback((el: HTMLVideoElement): boolean => {
    if (!isActiveRef.current) return false;
    if (el.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || el.videoWidth <= 0 || el.videoHeight <= 0) {
      return false;
    }
    visibleFrameRef.current = true;
    cancelVisualReadinessChecks();
    setHasVisibleFrame(true);
    setVideoBuffering(false);
    setLoadFailed(false);
    const shouldMute = !isAudioUnlocked();
    el.muted = shouldMute;
    setMuted(shouldMute);
    return true;
  }, [cancelVisualReadinessChecks]);

  const showPlaybackFailure = useCallback(() => {
    cancelVisualReadinessChecks();
    cancelPendingReloadResume();
    if (!isActiveRef.current) {
      videoRef.current?.pause();
      return;
    }
    videoRef.current?.pause();
    setPlaying(false);
    setVideoBuffering(false);
    setLoadFailed(true);
  }, [cancelPendingReloadResume, cancelVisualReadinessChecks]);

  const hardReloadVideoOnce = useCallback((el: HTMLVideoElement): boolean => {
    if (hardReloadTriedRef.current || !isActiveRef.current) return false;
    hardReloadTriedRef.current = true;
    cancelVisualReadinessChecks();
    cancelPendingReloadResume();
    setVideoBuffering(true);
    const resumeAt = el.currentTime;
    const generation = activationGenerationRef.current;
    const resume = () => {
      pendingReloadResumeRef.current = null;
      if (!isActiveRef.current || activationGenerationRef.current !== generation) return;
      if (resumeAt > 0 && Number.isFinite(resumeAt)) {
        try { el.currentTime = resumeAt; } catch { /* ignore */ }
      }
      el.play().catch(showPlaybackFailure);
    };
    pendingReloadResumeRef.current = { element: el, listener: resume };
    el.addEventListener("loadedmetadata", resume, { once: true });
    try {
      el.load();
      return true;
    } catch {
      cancelPendingReloadResume();
      return false;
    }
  }, [cancelPendingReloadResume, cancelVisualReadinessChecks, showPlaybackFailure]);

  const scheduleFramePresentationCheck = useCallback((el: HTMLVideoElement) => {
    if (!isActiveRef.current || visibleFrameRef.current) return;
    const frameAwareVideo = el as HTMLVideoElement & {
      requestVideoFrameCallback?: (callback: () => void) => number;
    };
    if (frameAwareVideo.requestVideoFrameCallback) {
      if (frameCallbackRef.current !== null) return;
      frameCallbackRef.current = frameAwareVideo.requestVideoFrameCallback(() => {
        frameCallbackRef.current = null;
        markVisibleFrame(el);
      });
      return;
    }

    // Older engines without requestVideoFrameCallback get a conservative
    // double-paint fallback only after decoded data and dimensions exist.
    if (
      fallbackFrameRafRef.current === null &&
      el.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
      el.videoWidth > 0 &&
      el.videoHeight > 0
    ) {
      fallbackFrameRafRef.current = requestAnimationFrame(() => {
        fallbackFrameRafRef.current = null;
        fallbackPaintRafRef.current = requestAnimationFrame(() => {
          fallbackPaintRafRef.current = null;
          markVisibleFrame(el);
        });
      });
    }
  }, [markVisibleFrame]);

  const armVisualReadinessCheck = useCallback((el: HTMLVideoElement) => {
    cancelVisualReadinessChecks();
    scheduleFramePresentationCheck(el);

    // A play event only proves the media timeline started; audio can advance
    // while the browser has not decoded a visible video frame. Give the first
    // frame a bounded window, then do one hard reload at most. A second miss
    // becomes an explicit retry state and the invisible audio is stopped.
    visualReadyTimerRef.current = setTimeout(() => {
      if (visibleFrameRef.current || !isActiveRef.current) return;
      if (!hardReloadVideoOnce(el)) showPlaybackFailure();
    }, 8000);
  }, [cancelVisualReadinessChecks, hardReloadVideoOnce, scheduleFramePresentationCheck, showPlaybackFailure]);

  const handleVideoStall = useCallback(() => {
    const el = videoRef.current;
    if (!el || !isActive || el.paused) return;
    if (stallTimerRef.current) clearTimeout(stallTimerRef.current);
    stallTimerRef.current = setTimeout(() => {
      const v = videoRef.current;
      if (!v || v.paused || v.readyState >= 3) return;
      // Gentle recovery first: nudge playback without destroying the buffer.
      // Calling v.load() resets the element and re-downloads from scratch, which
      // on slow connections turns a brief buffer wait into a visible freeze loop.
      v.play().catch(() => {});
      stallAttemptsRef.current += 1;
      // Hard-reload only as a last resort and only ONCE per activation, when the
      // element is still essentially empty (readyState < 2 = no current frame).
      // The flag is cleared only when a new card becomes active — never here and
      // never on onPlay — so an unstable stream can't be reloaded in a loop.
      if (stallAttemptsRef.current >= 3 && v.readyState < 2) {
        if (!hardReloadVideoOnce(v)) showPlaybackFailure();
      }
    }, 3000);
  }, [hardReloadVideoOnce, isActive, showPlaybackFailure]);

  const handleMuteToggle = useCallback(() => {
    const nowUnlocked = muted;
    setAudioUnlocked(nowUnlocked);
    setMuted(!nowUnlocked);
    if (videoRef.current) videoRef.current.muted = !nowUnlocked;
  }, [muted]);

  // Auto-play / pause + WhatsApp overlay + impression tracking + skip countdown
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    isActiveRef.current = isActive;
    activationGenerationRef.current += 1;
    cancelPendingReloadResume();
    if (isActive) {
      activatedAtRef.current = Date.now();
      stallAttemptsRef.current = 0;
      hardReloadTriedRef.current = false;
      visibleFrameRef.current = false;
      setHasVisibleFrame(false);
      setVideoBuffering(true);
      setLoadFailed(false);

      const tryPlay = () => {
        // Every automatically activated card starts muted until its first visible
        // frame. If the user had already unlocked audio, markVisibleFrame restores
        // sound as soon as video and audio can begin together.
        el.muted = true;
        setMuted(true);

        el.play()
          .catch(showPlaybackFailure);
      };

      // Always call play() immediately — on iOS Safari this is what triggers buffering.
      // Do NOT wait for canplay: if readyState is low, calling play() causes the browser
      // to start loading and fire onplay/canplay automatically.
      tryPlay();

      if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
      overlayTimerRef.current = setTimeout(() => setShowWhatsAppBtn(true), 1500);
      fetch(`/api/videos/${video.id}/impression`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }).catch(() => {});

      return () => {
        el.removeEventListener("canplay", tryPlay);
        activationGenerationRef.current += 1;
        isActiveRef.current = false;
        cancelPendingReloadResume();
        cancelVisualReadinessChecks();
        if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
      };
    } else {
      cancelPendingReloadResume();
      cancelVisualReadinessChecks();
      el.pause();
      setPlaying(false);
      setShowComments(false);
      if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
      setShowWhatsAppBtn(false);
      setWhatsAppDismissed(false);
    }
    return () => {
      if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
    };
  }, [cancelPendingReloadResume, cancelVisualReadinessChecks, isActive, showPlaybackFailure]);

  // Touch handlers: hold-to-pause + double-tap like + single-tap mute
  const handleTouchStart = useCallback(() => {
    holdTimerRef.current = setTimeout(() => {
      isPausedByHoldRef.current = true;
      videoRef.current?.pause();
      setPlaying(false);
    }, 400);
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (isPausedByHoldRef.current) {
      isPausedByHoldRef.current = false;
      videoRef.current?.play().catch(() => {});
      setPlaying(true);
      return;
    }
    const now = Date.now();
    if (now - lastTapRef.current < 350) {
      lastTapRef.current = 0;
      if (!liked) {
        markFavorited(video.id);
        setLikeCount(c => c + 1);
        fetch(`/api/favorites/${video.id}`, { method: "POST", headers: { Authorization: `Bearer ${token ?? ""}` } }).catch(() => {});
      }
      setShowHeartFlash(true);
      setTimeout(() => setShowHeartFlash(false), 800);
    } else {
      lastTapRef.current = now;
      // Ignore single-tap if the video just became active (scroll gesture lands on card)
      if (Date.now() - activatedAtRef.current < 500) return;
      const el = videoRef.current;
      if (!el) return;
      // First meaningful tap enables sound. Autoplay is forced muted by the browser,
      // so the very first user gesture should turn sound ON (the #1 user complaint),
      // not pause the video. Once unmuted, single-tap toggles play/pause as usual.
      if (el.muted || muted) {
        setAudioUnlocked(true);
        setMuted(false);
        el.muted = false;
        el.play().catch(() => {});
        setPlaying(true);
        return;
      }
      // single-tap toggles play/pause
      if (el.paused) { el.play().catch(() => {}); setPlaying(true); }
      else { el.pause(); setPlaying(false); }
    }
  }, [liked, token, video.id, muted]);

  const handleLike = async () => {
    if (!user) { if (!isLoading) setLocation("/auth/login"); return; }
    if (isRestricted) { showRestrictionToast(); return; }
    const wasLiked = liked;
    if (wasLiked) {
      markUnfavorited(video.id);
      setLikeCount(c => Math.max(0, c - 1));
    } else {
      markFavorited(video.id);
      setLikeCount(c => c + 1);
    }
    try {
      const response = await fetch(`/api/favorites/${video.id}`, {
        method: wasLiked ? "DELETE" : "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Favorite request failed");
    } catch {
      // revert on error
      if (wasLiked) { markFavorited(video.id); setLikeCount(c => c + 1); }
      else { markUnfavorited(video.id); setLikeCount(c => Math.max(0, c - 1)); }
    }
  };

  const handleSave = () => {
    void handleLike();
  };

  const handleMessageSeller = async () => {
    if (!user) {
      if (!isLoading) setLocation("/auth/login");
      return;
    }
    if (user.id === video.sellerId || messagePending) return;
    if (isRestricted) {
      showRestrictionToast();
      return;
    }

    setMessagePending(true);
    try {
      const response = await fetch("/api/conversations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ listingId: video.id, sellerId: video.sellerId }),
      });
      if (!response.ok) throw new Error("Conversation request failed");
      const conversation = await response.json();
      setLocation(`/messages/${conversation.id}`);
    } catch {
      toast({
        title: t("errors.serverError"),
        description: t("videoFeed.messageError", { defaultValue: "Nou pa t ka ouvri konvèsasyon an." }),
        variant: "destructive",
      });
    } finally {
      setMessagePending(false);
    }
  };

  const handleShare = async () => {
    if (isRestricted) { showRestrictionToast(); return; }
    const url = `${window.location.origin}/videos?video=${video.id}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: video.title, url });
      } else {
        await navigator.clipboard.writeText(url);
        toast({ title: t("videoFeed.shareLinkCopied") });
      }
      fetch(`/api/listings/${video.id}/share`, { method: "POST" }).catch(() => {});
      setShareCount(c => c + 1);
    } catch { /* user cancelled */ }
  };

  const handleCommentOpen = () => {
    if (isRestricted) { showRestrictionToast(); return; }
    setShowComments(true);
    onCommentOpen(video.id);
  };

  const handleWhatsApp = useCallback(() => {
    fetch(`/api/videos/${video.id}/buy-click`, { method: "POST" }).catch(() => {});
    // Prefer boost-specific WhatsApp number, fall back to seller's profile phone
    const rawPhone = video.sellerWhatsapp || video.sellerPhone || "";
    const phone = rawPhone.replace(/[^\d+]/g, "").replace(/^\+/, "");
    if (!phone) return; // no number available — button should be hidden
    const msg = encodeURIComponent(
      `Bonjou! Mwen wè videyo pwodwi ou a sou FLEXA MARKET epi mwen enterese. Èske ou disponib?`
    );
    window.open(`https://wa.me/${phone}?text=${msg}`, "_blank", "noopener,noreferrer");
  }, [video.id, video.sellerWhatsapp, video.sellerPhone]);

  if (!video.videoUrl) return null;

  // WhatsApp only when seller explicitly enabled it in the boost wizard
  // (sellerWhatsapp = boostWhatsappNumber, only set when ctaType="whatsapp")
  const hasWhatsApp = !!video.sellerWhatsapp;
  // For video-only ghost boosts, price is always 0 — hide price + cart in that case
  const hasPrice = video.price > 0;
  const hasCta = hasWhatsApp || hasPrice;
  const showWhatsAppOverlay = hasCta && showWhatsAppBtn && !whatsAppDismissed && !showComments;
  const posterUrl = video.thumbnailUrl ?? generatedThumbnail ?? null;

  return (
    <div
      className="relative w-full h-full flex-shrink-0 bg-black overflow-hidden"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* ── Thumbnail fallback layer ──
          Always rendered behind the video so the frame is never pure black while
          the video loads, and stays visible if the video fails to play. */}
      {posterUrl && (
        <img
          src={posterUrl}
          alt={video.title}
          aria-hidden="true"
          className={`absolute inset-0 w-full h-full ${isLandscape ? "object-contain" : "object-cover"}`}
        />
      )}

      {/* ── Video ── */}
      <video
        ref={(el) => {
          (videoRef as React.MutableRefObject<HTMLVideoElement | null>).current = el;
          if (el) el.muted = !isAudioUnlocked();
        }}
        src={video.videoUrl ?? undefined}
        playsInline
        preload={isActive ? "auto" : isNext ? "metadata" : "none"}
        poster={video.thumbnailUrl ?? generatedThumbnail ?? undefined}
        className={`absolute inset-0 w-full h-full ${isLandscape ? "object-contain" : "object-cover"}`}
        style={{
          willChange: "transform, opacity",
          transform: "translateZ(0)",
          opacity: isActive && !hasVisibleFrame ? 0 : 1,
          transition: "opacity 120ms linear",
        }}
        onPlay={e => {
          setPlaying(true);
          if (stallTimerRef.current) {
            clearTimeout(stallTimerRef.current);
            stallTimerRef.current = null;
          }
          if (!visibleFrameRef.current) armVisualReadinessCheck(e.currentTarget);
        }}
        onPlaying={e => {
          scheduleFramePresentationCheck(e.currentTarget);
        }}
        onPause={() => setPlaying(false)}
        loop
        onLoadedMetadata={e => {
          const v = e.currentTarget;
          setIsLandscape(v.videoWidth > v.videoHeight);
        }}
        onLoadedData={e => {
          scheduleFramePresentationCheck(e.currentTarget);
          if (!video.thumbnailUrl && !generatedThumbnail) {
            const frame = captureVideoPosterFrame(e.currentTarget, 360, 640);
            if (frame) setGeneratedThumbnail(frame);
          }
        }}
        onCanPlay={e => { scheduleFramePresentationCheck(e.currentTarget); }}
        onTimeUpdate={e => {
          if (!visibleFrameRef.current && e.currentTarget.currentTime > 0) {
            scheduleFramePresentationCheck(e.currentTarget);
          }
        }}
        onStalled={handleVideoStall}
        onWaiting={() => { setVideoBuffering(true); handleVideoStall(); }}
        onError={() => {
          const el = videoRef.current;
          if (!el || !isActive) return;
          setVideoBuffering(false);
          if (!hardReloadVideoOnce(el)) showPlaybackFailure();
        }}
      />

      {/* ── Buffering spinner ── */}
      {videoBuffering && isActive && !loadFailed && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <div className="h-12 w-12 rounded-full border-4 border-white/20 border-t-white animate-spin" />
        </div>
      )}

      {/* ── Load-failed: thumbnail stays visible behind, offer a tap-to-retry ── */}
      {loadFailed && isActive && (
        <button
          className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-black/30 text-white"
          onClick={(e) => {
            e.stopPropagation();
            const el = videoRef.current;
            if (!el) return;
            cancelVisualReadinessChecks();
            cancelPendingReloadResume();
            visibleFrameRef.current = false;
            hardReloadTriedRef.current = false;
            stallAttemptsRef.current = 0;
            setHasVisibleFrame(false);
            setLoadFailed(false);
            setVideoBuffering(true);
            el.load();
            el.play().catch(showPlaybackFailure);
          }}
          onTouchStart={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
        >
          <div className="bg-black/40 backdrop-blur-sm rounded-full p-4">
            <Play className="h-9 w-9 text-white fill-white" />
          </div>
          <span className="text-sm font-medium drop-shadow">Tape pou w eseye videyo a ankò</span>
        </button>
      )}

      {/* ── Top gradient (for UI legibility) ── */}
      <div
        className="absolute inset-x-0 top-0 pointer-events-none"
        style={{ height: "120px", background: "linear-gradient(to bottom, rgba(0,0,0,0.45) 0%, transparent 100%)" }}
      />

      {/* ── Mute / unmute toggle (top-right) ── */}
      {/* onClick fires once on both desktop (click) and mobile (tap-end), so we      */}
      {/* stop touch propagation without calling the handler — avoiding a double-toggle */}
      <button
        className="absolute top-3 right-3 z-20 bg-black/40 backdrop-blur-sm rounded-full p-2 text-white"
        onClick={e => { e.stopPropagation(); handleMuteToggle(); }}
        onTouchStart={e => e.stopPropagation()}
        onTouchEnd={e => e.stopPropagation()}
        aria-label={muted ? "Unmute" : "Mute"}
      >
        {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
      </button>

      {/* ── "Tap for sound" hint — only while muted & active, so users discover audio ── */}
      {muted && isActive && !loadFailed && (
        <button
          className="absolute left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 bg-black/55 backdrop-blur-sm rounded-full pl-2.5 pr-3 py-1.5 text-white text-xs font-semibold shadow-lg animate-pulse"
          style={{ top: "calc(env(safe-area-inset-top, 16px) + 64px)" }}
          onClick={e => { e.stopPropagation(); handleMuteToggle(); }}
          onTouchStart={e => e.stopPropagation()}
          onTouchEnd={e => e.stopPropagation()}
          aria-label="Unmute"
        >
          <VolumeX className="h-4 w-4" />
          {t("videoFeed.tapForSound", { defaultValue: "Tape pou son" })}
        </button>
      )}

      {/* ── Bottom gradient ── */}
      <div
        className="absolute inset-x-0 bottom-0 pointer-events-none"
        style={{ height: "260px", background: "linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 60%, transparent 100%)" }}
      />

      {/* ── Pause overlay ── */}
      {!playing && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="bg-black/30 backdrop-blur-sm rounded-full p-5">
            <Play className="h-10 w-10 text-white fill-white drop-shadow-lg" />
          </div>
        </div>
      )}

      {/* ── Double-tap heart flash ── */}
      {showHeartFlash && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
          <Heart
            className="h-28 w-28 fill-red-500 text-red-500 drop-shadow-2xl animate-ping"
            style={{ animationDuration: "0.6s", animationIterationCount: 1 }}
          />
        </div>
      )}

      {/* ── Right-side engagement column — pure TikTok style ── */}
      <div
        className="absolute right-2 z-10 flex flex-col items-center gap-3.5"
        style={{ bottom: "calc(88px + env(safe-area-inset-bottom, 0px))" }}
        onClick={e => e.stopPropagation()}
        onTouchStart={e => e.stopPropagation()}
        onTouchEnd={e => e.stopPropagation()}
      >
        {/* Seller avatar + follow "+" badge overlapping bottom */}
        <div className="flex flex-col items-center mb-1">
          <Link href={`/profile/${video.sellerId}`}>
            <div className="relative">
              <Avatar className="h-12 w-12 border-2 border-white shadow-lg">
                <AvatarImage src={video.sellerAvatar ?? undefined} />
                <AvatarFallback className="bg-primary text-primary-foreground font-bold text-sm">
                  {video.sellerName?.[0] ?? "?"}
                </AvatarFallback>
              </Avatar>
              {!following && user?.id !== video.sellerId && (
                <button
                  type="button"
                  onClick={async e => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!user) {
                      if (!isLoading) setLocation("/auth/login");
                      return;
                    }
                    if (!token) return;
                    setFollowing(true);
                    try {
                      const response = await fetch(`/api/users/${video.sellerId}/follow`, {
                        method: "POST",
                        headers: { Authorization: `Bearer ${token}` },
                      });
                      if (!response.ok) throw new Error("Follow request failed");
                    } catch {
                      setFollowing(false);
                    }
                  }}
                  className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-5 h-5 bg-primary rounded-full flex items-center justify-center shadow border-[1.5px] border-black active:scale-90 transition-transform z-10"
                  aria-label={t("videoFeed.follow", { defaultValue: "Swiv" })}
                  data-testid={`button-follow-seller-${video.sellerId}`}
                >
                  <span className="text-white text-[11px] font-black leading-none">+</span>
                </button>
              )}
            </div>
          </Link>
        </div>

        {/* Like */}
        <button type="button" onClick={handleLike} className="flex flex-col items-center gap-0.5 active:scale-90 transition-transform" data-testid={`button-like-video-${video.id}`}>
          <span className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-black/35 backdrop-blur-md">
            <Heart className={cn("h-[27px] w-[27px] drop-shadow-lg transition-colors", liked ? "fill-red-500 text-red-500" : "text-white")} />
          </span>
          <span className="text-white text-[12px] font-semibold drop-shadow-md tabular-nums">{formatCount(likeCount)}</span>
        </button>

        {/* Comment */}
        <button
          type="button"
          onClick={event => {
            event.stopPropagation();
            handleCommentOpen();
          }}
          aria-expanded={showComments}
          className="flex flex-col items-center gap-0.5 active:scale-90 transition-transform"
          data-testid={`button-comments-video-${video.id}`}
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-black/35 backdrop-blur-md">
            <MessageCircle className="h-[27px] w-[27px] text-white" />
          </span>
          <span className="text-white text-[12px] font-semibold drop-shadow-md tabular-nums">{formatCount(video.commentCount)}</span>
        </button>

        {/* Save — favorites are the marketplace's persisted saved-items model */}
        <button type="button" onClick={handleSave} className="flex flex-col items-center gap-0.5 active:scale-90 transition-transform" data-testid={`button-save-video-${video.id}`}>
          <span className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-black/35 backdrop-blur-md">
            <Bookmark className={cn("h-[25px] w-[25px] transition-colors", liked ? "fill-amber-400 text-amber-400" : "text-white")} />
          </span>
          <span className="text-[10px] font-semibold text-white drop-shadow-md">{t("videoFeed.save", { defaultValue: "Sove" })}</span>
        </button>

        {/* Share */}
        <button type="button" onClick={handleShare} className="flex flex-col items-center gap-0.5 active:scale-90 transition-transform" data-testid={`button-share-video-${video.id}`}>
          <span className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-black/35 backdrop-blur-md">
            <Share2 className="h-[25px] w-[25px] text-white" />
          </span>
          <span className="text-white text-[12px] font-semibold drop-shadow-md tabular-nums">{formatCount(shareCount)}</span>
        </button>

      </div>

      {/* ── Product CTA Card — slides up after 1.5s ── */}
      <div
        className="absolute left-3 right-16 z-20"
        style={{
          bottom: showWhatsAppOverlay
            ? "calc(104px + env(safe-area-inset-bottom, 0px))"
            : "calc(80px + env(safe-area-inset-bottom, 0px))",
          opacity: showWhatsAppOverlay ? 1 : 0,
          transform: showWhatsAppOverlay ? "translateY(0px) scale(1)" : "translateY(14px) scale(0.97)",
          transition: "opacity 0.4s cubic-bezier(0.16,1,0.3,1), transform 0.4s cubic-bezier(0.16,1,0.3,1), bottom 0.4s cubic-bezier(0.16,1,0.3,1)",
          pointerEvents: showWhatsAppOverlay ? "auto" : "none",
        }}
        onClick={e => e.stopPropagation()}
        onTouchStart={e => e.stopPropagation()}
        onTouchEnd={e => e.stopPropagation()}
      >
        <div className="relative flex items-center gap-2.5 bg-black/72 backdrop-blur-xl rounded-2xl p-2 border border-white/12 shadow-2xl overflow-hidden">
          {/* Dismiss button */}
          <button
            type="button"
            onClick={e => { e.stopPropagation(); setWhatsAppDismissed(true); }}
            className="absolute -top-2 -right-1.5 w-5 h-5 rounded-full bg-zinc-900/90 border border-white/20 flex items-center justify-center z-10 shadow"
          >
            <X className="h-2.5 w-2.5 text-white/70" />
          </button>

          {/* Product thumbnail */}
          {video.thumbnailUrl && (
            <div className="shrink-0 w-12 h-12 rounded-xl overflow-hidden border border-white/10">
              <img
                src={video.thumbnailUrl}
                alt=""
                className="w-full h-full object-cover"
                draggable={false}
              />
            </div>
          )}

          {/* Title + price */}
          <div className="flex-1 min-w-0">
            <p className="text-white font-semibold text-[11px] leading-tight line-clamp-1 mb-0.5">{video.title}</p>
            {hasPrice && (
              <span className="text-primary font-black text-[13px] leading-none">{formatPrice(video.price, null, video.currency)}</span>
            )}
          </div>

          {/* Action buttons */}
          <div className="shrink-0 flex flex-col gap-1.5">
            {/* Achte — only for product boosts (price > 0) */}
            {hasPrice && (
              <Link href={`/listings/${video.id}`} onClick={() => { fetch(`/api/videos/${video.id}/buy-click`, { method: "POST" }).catch(() => {}); }}>
                <span className="flex items-center gap-1.5 bg-primary text-white font-black px-3 py-1.5 rounded-lg shadow-lg text-[11px] leading-none whitespace-nowrap">
                  <ShoppingBag className="h-3 w-3" />
                  Achte
                </span>
              </Link>
            )}
            {/* WhatsApp — only when boost CTA = whatsapp */}
            {hasWhatsApp && (
              <button
                type="button"
                onClick={handleWhatsApp}
                className="flex items-center gap-1.5 bg-[#25D366] text-white font-black px-3 py-1.5 rounded-lg shadow-lg active:scale-95 transition-all text-[11px] leading-none whitespace-nowrap"
              >
                <WhatsAppIcon className="h-3 w-3" />
                WhatsApp
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Bottom info overlay — TikTok exact layout ── */}
      <div
        className="absolute bottom-0 left-0 right-14 px-4 z-10"
        style={{ paddingBottom: "calc(76px + env(safe-area-inset-bottom, 0px))" }}
        onClick={e => e.stopPropagation()}
        onTouchStart={e => e.stopPropagation()}
        onTouchEnd={e => e.stopPropagation()}
      >
        {/* @username + verified */}
        <div className="mb-1 flex items-center gap-2">
          <Link href={`/profile/${video.sellerId}`}>
            <p className="flex w-fit items-center gap-1.5 text-[15px] font-bold text-white drop-shadow-md">
              @{video.sellerName}
              {video.sellerIsVerified && <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-primary" />}
            </p>
          </Link>
          {user?.id !== video.sellerId && (
            <button
              type="button"
              onClick={handleMessageSeller}
              disabled={messagePending}
              className="flex items-center gap-1 rounded-full border border-white/20 bg-black/35 px-2.5 py-1 text-[10px] font-bold text-white backdrop-blur-md transition-transform active:scale-95 disabled:opacity-50"
              data-testid={`button-message-seller-${video.sellerId}`}
            >
              {messagePending
                ? <Loader2 className="h-3 w-3 animate-spin" />
                : <SendHorizontal className="h-3 w-3" />}
              {t("videoFeed.message", { defaultValue: "Mesaj" })}
            </button>
          )}
        </div>

        {/* Caption with "...plus" expand */}
        <ExpandableCaption text={video.title} />

        {/* Boosted / promotional badge */}
        {video.isBoosted && (
          <p className="text-white/55 text-[12px] mt-1 flex items-center gap-1">
            <Zap className="h-3 w-3 text-primary" />
            {t("videoFeed.promotionalContent")}
          </p>
        )}

        {/* Views row */}
        <div className="flex items-center gap-1.5 mt-1">
          <Eye className="h-3 w-3 text-white/45" />
          <span className="text-white/45 text-[11px] tabular-nums">{formatCount(video.viewCount)}</span>
        </div>

        {/* Price + WhatsApp — only shown when relevant */}
        {(hasPrice || hasWhatsApp) && (
          <div className="flex items-center gap-2.5 mt-2">
            {hasPrice && (
              <span className="text-white font-black text-[15px] drop-shadow-md">
                {formatPrice(video.price, null, video.currency)}
              </span>
            )}
            {hasWhatsApp && !showWhatsAppOverlay && (
              <button
                type="button"
                onClick={handleWhatsApp}
                className="flex items-center gap-1.5 bg-[#25D366]/90 backdrop-blur-sm text-white font-bold text-[11px] px-3 py-1.5 rounded-full active:scale-95 transition-all"
              >
                <WhatsAppIcon className="h-3.5 w-3.5" />
                WhatsApp
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Comment panel ── */}
      {showComments && (
        <CommentPanel
          listingId={video.id}
          sellerId={video.sellerId}
          onClose={() => setShowComments(false)}
        />
      )}
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyFeed({ onBoostClick }: { onBoostClick: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center h-full text-white gap-5 px-8 text-center">
      <div className="text-6xl">🎬</div>
      <div>
        <h2 className="text-xl font-black mb-2">{t("videoFeed.emptyTitle")}</h2>
        <p className="text-white/60 text-sm leading-relaxed max-w-xs">{t("videoFeed.emptyDesc")}</p>
      </div>
      <button
        type="button"
        onClick={onBoostClick}
        className="flex items-center gap-2 bg-primary text-white font-bold px-6 py-3 rounded-full shadow-xl hover:opacity-90 transition-opacity active:scale-95"
      >
        <Zap className="h-4 w-4" />
        {t("videoFeed.emptyCta")}
      </button>
    </div>
  );
}

// ── Main VideoFeed page ───────────────────────────────────────────────────────

interface SideListing {
  id: number;
  title: string;
  price: number;
  currency: string | null;
  images: string[];
  city: string | null;
  condition: string | null;
}

export default function VideoFeed() {
  const { t } = useTranslation();
  useSEO({ title: t("tr.promoVideo"), description: t("tr.videoFeedSeoDesc"), path: "/videos" });
  const [, navigate] = useLocation();
  // Robust "back": return to the previous in-app screen when there is history
  // (the feed is usually opened from the drawer or a link), otherwise fall back
  // to the marketplace home. window.history.back() drives wouter via popstate,
  // and sidesteps any base-path edge cases that could make navigate("/") no-op.
  const handleBack = useCallback(() => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      window.history.back();
    } else {
      navigate("/");
    }
  }, [navigate]);
  const { token } = useAuth();
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [initialBatchLoaded, setInitialBatchLoaded] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [wizardOpen, setWizardOpen] = useState(() => {
    try { return sessionStorage.getItem("bw_open_vf") === "1"; } catch { return false; }
  });
  const openWizard = () => {
    try { sessionStorage.setItem("bw_open_vf", "1"); } catch { /* ok */ }
    setWizardOpen(true);
  };
  const closeWizard = () => {
    try { sessionStorage.removeItem("bw_open_vf"); } catch { /* ok */ }
    setWizardOpen(false);
  };
  const [sideListings, setSideListings] = useState<SideListing[]>([]);

  const containerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const feedGenerationRef = useRef(0);
  const activeVideoIdRef = useRef<number | null>(null);
  const pendingPreservedActiveIdRef = useRef<number | null>(null);
  const selectedVideoIdRef = useRef<number | null>(
    typeof window === "undefined"
      ? null
      : (() => {
          const parsed = parseInt(new URLSearchParams(window.location.search).get("video") ?? "", 10);
          return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
        })(),
  );
  const initialSelectionAppliedRef = useRef(selectedVideoIdRef.current === null);

  // ── AI recommendation state ──────────────────────────────────────────────
  // seenIds: tracks every video the user has seen this session so we can
  //          send them to the API as ?exclude=... to prevent repeats.
  // sessionSeed: random number sent as ?seed=... so the ranking formula
  //              returns a different ordering each time the app is opened.
  const seenIdsRef = useRef<Set<number>>(new Set());
  const sessionSeedRef = useRef<number>(Math.floor(Math.random() * 1_000_000) + 1);

  const buildFeedUrl = useCallback((p: number, replaceAll = false) => {
    const seed = sessionSeedRef.current;
    // Only send exclude list when loading MORE pages (not on a full replace).
    // On replace we want fresh ordering so we reset the seen set instead.
    const excludeList = (!replaceAll && seenIdsRef.current.size > 0)
      ? [...seenIdsRef.current].join(",")
      : "";
    let url = `/api/videos/feed?page=${p}&limit=10&seed=${seed}`;
    if (excludeList) url += `&exclude=${encodeURIComponent(excludeList)}`;
    if (replaceAll && selectedVideoIdRef.current) {
      url += `&selected=${selectedVideoIdRef.current}`;
    }
    return url;
  }, []);

  const fetchPage = useCallback(async (p: number, replace = false) => {
    const requestGeneration = replace
      ? ++feedGenerationRef.current
      : feedGenerationRef.current;
    if (p === 1) setLoadingInitial(true); else setLoadingMore(true);
    try {
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(buildFeedUrl(p, replace), { headers });
      if (!res.ok) return;
      const data = await res.json();
      if (requestGeneration !== feedGenerationRef.current) return;
      const incoming: VideoItem[] = data.videos ?? [];
      if (replace) {
        const currentActiveId = initialSelectionAppliedRef.current
          ? activeVideoIdRef.current
          : null;
        if (currentActiveId && incoming.some(video => video.id === currentActiveId)) {
          pendingPreservedActiveIdRef.current = currentActiveId;
        }
        seenIdsRef.current = new Set(incoming.map(v => v.id));
        setVideos(incoming);
        setInitialBatchLoaded(true);
      } else {
        incoming.forEach(v => seenIdsRef.current.add(v.id));
        setVideos(prev => (
          requestGeneration === feedGenerationRef.current
            ? [...prev, ...incoming]
            : prev
        ));
      }
      setHasMore(data.hasMore ?? false);
      setPage(p);
    } catch { /* non-critical */ } finally {
      if (requestGeneration === feedGenerationRef.current) {
        setLoadingInitial(false);
        setLoadingMore(false);
      }
    }
  }, [token, buildFeedUrl]);

  useEffect(() => { fetchPage(1, true); }, [fetchPage]);

  // Fetch sidebar listings for desktop view
  useEffect(() => {
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    fetch("/api/listings?limit=12&sort=newest", { headers })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        const items: SideListing[] = (data.listings ?? data ?? []).slice(0, 12).map((l: any) => ({
          id: l.id,
          title: l.title,
          price: l.price,
          currency: l.currency ?? null,
          images: Array.isArray(l.images) ? l.images : (l.imageUrl ? [l.imageUrl] : []),
          city: l.city ?? null,
          condition: l.condition ?? null,
        }));
        setSideListings(items);
      })
      .catch(() => {});
  }, [token]);

  // Real-time boost-expiry pruning
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setVideos(prev => {
        const live = prev.filter(v => {
          if (!v.boostEndAt) return true;
          return new Date(v.boostEndAt).getTime() > now;
        });
        if (live.length < prev.length) {
          pendingPreservedActiveIdRef.current = activeVideoIdRef.current;
          void fetchPage(1, true);
        }
        return live;
      });
    }, 30_000);
    return () => clearInterval(interval);
  }, [fetchPage]);

  // Auto-polling for new boosts (every 2 min) — prepend freshly-boosted videos
  useEffect(() => {
    const poll = setInterval(async () => {
      try {
        const requestGeneration = feedGenerationRef.current;
        const headers: Record<string, string> = {};
        if (token) headers["Authorization"] = `Bearer ${token}`;
        // Use seed=0 for the poll so RANDOM() ordering surfaces newest content
        const res = await fetch("/api/videos/feed?page=1&limit=10&seed=0", { headers });
        if (!res.ok) return;
        const data = await res.json();
        if (requestGeneration !== feedGenerationRef.current) return;
        const fresh: VideoItem[] = data.videos ?? [];
        if (fresh.length === 0) return;
        setVideos(prev => {
          if (requestGeneration !== feedGenerationRef.current) return prev;
          const existingIds = new Set(prev.map(v => v.id));
          const newOnes = fresh.filter(v => !existingIds.has(v.id));
          if (newOnes.length === 0) return prev;
          // Mark them seen so they don't appear again in paginated loads
          newOnes.forEach(v => seenIdsRef.current.add(v.id));
          pendingPreservedActiveIdRef.current = activeVideoIdRef.current;
          return [...newOnes, ...prev];
        });
      } catch { /* non-critical */ }
    }, 2 * 60_000);
    return () => clearInterval(poll);
  }, [token]);

  // IntersectionObserver — track which card is ≥55% visible
  useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect();

    observerRef.current = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.55) {
            const idx = cardRefs.current.indexOf(entry.target as HTMLDivElement);
            if (idx >= 0) {
              setActiveIdx(idx);
              activeVideoIdRef.current = videos[idx]?.id ?? null;
              if (idx >= videos.length - 2 && hasMore && !loadingMore) {
                fetchPage(page + 1);
              }
              // Auto-loop: when last video is reached and there are no more pages,
              // silently restart the feed with a new seed so the scroll never ends.
              if (idx >= videos.length - 1 && !hasMore && !loadingMore) {
                sessionSeedRef.current = Math.floor(Math.random() * 1_000_000) + 1;
                seenIdsRef.current = new Set();
                fetchPage(1, true);
                scrollTo(0);
              }
            }
          }
        }
      },
      { threshold: 0.55 },
    );

    cardRefs.current.forEach(el => { if (el) observerRef.current!.observe(el); });
    return () => observerRef.current?.disconnect();
  }, [videos.length, hasMore, loadingMore, page, fetchPage]);

  const scrollTo = (idx: number) => {
    const el = cardRefs.current[idx];
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  useEffect(() => {
    if (!initialBatchLoaded || initialSelectionAppliedRef.current) return;
    const selectedId = selectedVideoIdRef.current;
    const selectedIndex = selectedId === null
      ? -1
      : videos.findIndex(video => video.id === selectedId);
    initialSelectionAppliedRef.current = true;
    if (selectedIndex < 0) return;

    setActiveIdx(selectedIndex);
    activeVideoIdRef.current = videos[selectedIndex]?.id ?? null;
    requestAnimationFrame(() => {
      const container = containerRef.current;
      const card = cardRefs.current[selectedIndex];
      if (!container || !card) return;
      container.scrollTo({ top: card.offsetTop, behavior: "auto" });
    });
  }, [initialBatchLoaded, videos]);

  useLayoutEffect(() => {
    const activeId = pendingPreservedActiveIdRef.current;
    if (activeId === null) return;
    pendingPreservedActiveIdRef.current = null;

    const preservedIndex = videos.findIndex(video => video.id === activeId);
    if (preservedIndex < 0) {
      const fallbackIndex = Math.max(0, Math.min(activeIdx, videos.length - 1));
      setActiveIdx(fallbackIndex);
      activeVideoIdRef.current = videos[fallbackIndex]?.id ?? null;
      return;
    }

    setActiveIdx(preservedIndex);
    activeVideoIdRef.current = activeId;
    requestAnimationFrame(() => {
      const container = containerRef.current;
      const card = cardRefs.current[preservedIndex];
      if (!container || !card) return;
      container.scrollTo({ top: card.offsetTop, behavior: "auto" });
    });
  }, [activeIdx, videos]);

  // ── Loading state ──────────────────────────────────────────────────────────
  if (loadingInitial) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-black gap-4">
        {/* Transparent header on loading too */}
        <div
          className="absolute inset-x-0 top-0 z-50 flex items-center px-4 gap-3"
          style={{ paddingTop: "env(safe-area-inset-top, 16px)", height: "calc(56px + env(safe-area-inset-top, 0px))" }}
        >
          <button
            type="button"
            onClick={handleBack}
            className="w-9 h-9 rounded-full bg-black/30 backdrop-blur-md flex items-center justify-center text-white border border-white/15"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <span className="flex-1 text-white font-bold text-base text-center drop-shadow">{t("videoFeed.title")}</span>
          <div className="w-9 h-9" />
        </div>
        <Loader2 className="h-9 w-9 animate-spin text-white/60" />
        <p className="text-white/40 text-sm">{t("videoFeed.loading", { defaultValue: "Chajman..." })}</p>
      </div>
    );
  }

  // ── Single return — empty + populated share one component tree so the
  //    BoostWizard is never re-mounted when videos.length changes.
  return (
    <div
      className={cn("relative h-full", videos.length === 0 ? "flex flex-col bg-black" : "flex")}
      style={videos.length > 0 ? { background: "#0a0a0a" } : undefined}
    >

      {/* ── Empty state ──────────────────────────────────────────────────── */}
      {videos.length === 0 && (
        <>
          <div
            className="absolute inset-x-0 top-0 z-50 flex items-center px-4 gap-3"
            style={{ paddingTop: "env(safe-area-inset-top, 16px)", height: "calc(56px + env(safe-area-inset-top, 0px))" }}
          >
            <button
              type="button"
              onClick={handleBack}
              className="w-9 h-9 rounded-full bg-black/30 backdrop-blur-md flex items-center justify-center text-white border border-white/15"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <span className="flex-1 text-white font-bold text-base text-center drop-shadow">{t("videoFeed.title")}</span>
            <div className="w-9 h-9" />
          </div>
          <EmptyFeed onBoostClick={openWizard} />
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          LEFT SIDEBAR — Now Playing panel
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="hidden lg:flex flex-col w-[300px] shrink-0 overflow-hidden" style={{ borderRight: "1px solid rgba(255,255,255,0.06)" }}>

        {/* Brand header */}
        <div className="px-5 pt-5 pb-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center shadow-lg">
              <Play className="h-3.5 w-3.5 text-white fill-white" />
            </div>
            <span className="text-white font-black text-[15px] tracking-tight">FLEXA</span>
            <span className="text-primary font-black text-[15px] tracking-tight">TV</span>
          </div>
          <p className="text-white/35 text-[11px] tracking-wide uppercase">{t("videoFeed.sidebarPromo")}</p>
        </div>

        {/* Now playing card */}
        {videos[activeIdx] ? (
          <div className="flex-1 flex flex-col px-4 py-4 gap-4 overflow-hidden">

            {/* Live indicator */}
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
              </span>
              <span className="text-[10px] font-bold text-primary/90 uppercase tracking-widest">{t("videoFeed.nowPlaying")}</span>
            </div>

            {/* Cinematic thumbnail */}
            <div
              className="w-full rounded-2xl overflow-hidden relative"
              style={{
                aspectRatio: "16/9",
                boxShadow: "0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.06)",
              }}
            >
              {videos[activeIdx].thumbnailUrl ? (
                <img
                  src={videos[activeIdx].thumbnailUrl!}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-zinc-900 flex items-center justify-center">
                  <Play className="h-10 w-10 text-white/20 fill-white/20" />
                </div>
              )}
              {/* Orange accent bar at bottom */}
              <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-primary" />
            </div>

            {/* Meta */}
            <div className="flex-1 min-h-0 flex flex-col gap-1.5">
              <p className="text-white font-bold text-[14px] leading-snug line-clamp-2">
                {videos[activeIdx].title}
              </p>
              <p className="text-primary font-black text-xl tracking-tight">
                {formatPrice(videos[activeIdx].price, null, videos[activeIdx].currency)}
              </p>
              <p className="text-white/35 text-[11px] flex items-center gap-1.5">
                <Eye className="h-3 w-3" />
                {videos[activeIdx].viewCount ?? 0} views
              </p>
            </div>

            {/* CTA */}
            <button
              type="button"
              onClick={() => navigate(`/listings/${videos[activeIdx].id}`)}
              className="w-full flex items-center justify-center gap-2 text-white font-bold text-[13px] py-3 rounded-xl transition-all active:scale-[0.98]"
              style={{
                background: "linear-gradient(135deg, #f97316 0%, #ea580c 100%)",
                boxShadow: "0 4px 16px rgba(249,115,22,0.35)",
              }}
            >
              <ShoppingBag className="h-4 w-4" />
              {t("videoFeed.viewListing")}
            </button>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-white/20" />
          </div>
        )}

        {/* Progress strip — shows position in feed */}
        {videos.length > 0 && (
          <div className="px-4 pb-4 flex gap-1">
            {videos.slice(0, 10).map((_, i) => (
              <div
                key={i}
                className="h-[3px] flex-1 rounded-full transition-all duration-300"
                style={{ background: i === activeIdx % 10 ? "#f97316" : "rgba(255,255,255,0.12)" }}
              />
            ))}
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          CENTER — Video column
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="relative h-full w-full lg:w-[430px] lg:shrink-0 overflow-hidden bg-black">
        {/* Transparent overlay header */}
        <div
          className="absolute inset-x-0 top-0 z-50 flex items-center px-4 gap-3"
          style={{
            paddingTop: "env(safe-area-inset-top, 16px)",
            height: "calc(56px + env(safe-area-inset-top, 0px))",
            background: "linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, transparent 100%)",
            pointerEvents: "none",
          }}
        >
          <button
            type="button"
            onClick={handleBack}
            className="w-9 h-9 rounded-full bg-black/30 backdrop-blur-md flex items-center justify-center text-white border border-white/15 shrink-0"
            style={{ pointerEvents: "auto" }}
            aria-label={t("common.back", { defaultValue: "Retounen" })}
            data-testid="button-video-feed-back"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <span className="flex-1 text-white font-bold text-base text-center drop-shadow-md">{t("videoFeed.title")}</span>
          <button
            type="button"
            onClick={() => navigate("/")}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/15 bg-black/30 text-white backdrop-blur-md"
            style={{ pointerEvents: "auto" }}
            aria-label={t("common.close", { defaultValue: "Fèmen" })}
            data-testid="button-video-feed-close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scroll container */}
        <div
          ref={containerRef}
          className="h-full overflow-y-scroll scrollbar-none"
          style={{ scrollSnapType: "y mandatory", scrollBehavior: "smooth" }}
        >
          {videos.map((video, idx) => (
            <div
              key={video.id}
              ref={el => { cardRefs.current[idx] = el; }}
              className="w-full"
              style={{ height: "100%", scrollSnapAlign: "start", scrollSnapStop: "always" }}
            >
              <VideoCard
                video={video}
                isActive={activeIdx === idx}
                isNext={activeIdx + 1 === idx}
                onCommentOpen={() => {}}
                onNext={() => scrollTo(idx + 1)}
              />
            </div>
          ))}

          {loadingMore && (
            <div className="w-full flex justify-center py-6 bg-black" style={{ scrollSnapAlign: "start" }}>
              <Loader2 className="h-6 w-6 animate-spin text-white/40" />
            </div>
          )}

          {/* No end-of-feed card — auto-loop restarts the feed seamlessly */}
        </div>

        {/* Scroll hint */}
        {videos.length > 1 && activeIdx === 0 && (
          <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-20 pointer-events-none animate-bounce">
            <div className="flex flex-col items-center gap-0.5">
              <ChevronDown className="h-5 w-5 text-white/40" />
              <ChevronDown className="h-5 w-5 text-white/20 -mt-2" />
            </div>
          </div>
        )}

        {/* FAB — Add boost */}
        <button
          type="button"
          onClick={openWizard}
          className="absolute z-50 flex items-center justify-center w-12 h-12 bg-primary rounded-full shadow-2xl active:scale-95 transition-transform"
          style={{
            right: "16px",
            bottom: "calc(76px + env(safe-area-inset-bottom, 0px))",
            boxShadow: "0 0 24px rgba(249,115,22,0.5)",
          }}
          aria-label={t("videoFeed.addBoost", { defaultValue: "Ajoute yon videyo" })}
          data-testid="button-add-video-boost"
        >
          <Plus className="h-6 w-6 text-white" />
        </button>

        {/* Mobile feed navigation — the global marketplace nav is intentionally hidden on /videos */}
        <nav
          className="absolute inset-x-0 bottom-0 z-40 flex items-start justify-around border-t border-white/10 bg-black/80 px-2 pt-2 backdrop-blur-xl lg:hidden"
          style={{
            height: "calc(64px + env(safe-area-inset-bottom, 0px))",
            paddingBottom: "env(safe-area-inset-bottom, 0px)",
          }}
          aria-label={t("nav.main", { defaultValue: "Navigasyon prensipal" })}
        >
          <button type="button" onClick={() => navigate("/")} className="flex min-w-14 flex-col items-center gap-1 text-white/65" data-testid="nav-video-home">
            <Home className="h-5 w-5" />
            <span className="text-[9px] font-semibold">{t("nav.home")}</span>
          </button>
          <button type="button" className="flex min-w-14 flex-col items-center gap-1 text-primary" aria-current="page" data-testid="nav-video-feed">
            <Play className="h-5 w-5 fill-current" />
            <span className="text-[9px] font-black">{t("tr.promoVideo")}</span>
          </button>
          <button type="button" onClick={() => navigate("/saved")} className="flex min-w-14 flex-col items-center gap-1 text-white/65" data-testid="nav-video-saved">
            <Bookmark className="h-5 w-5" />
            <span className="text-[9px] font-semibold">{t("nav.saved")}</span>
          </button>
          <button type="button" onClick={() => navigate("/messages")} className="flex min-w-14 flex-col items-center gap-1 text-white/65" data-testid="nav-video-messages">
            <MessageCircle className="h-5 w-5" />
            <span className="text-[9px] font-semibold">{t("nav.messages")}</span>
          </button>
        </nav>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          RIGHT SIDEBAR — Marketplace listings grid
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="hidden lg:flex flex-col flex-1 min-w-0 overflow-hidden" style={{ borderLeft: "1px solid rgba(255,255,255,0.06)" }}>

        {/* Header */}
        <div
          className="px-5 pt-5 pb-4 flex items-center justify-between shrink-0"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
        >
          <div>
            <h2 className="text-white font-black text-[15px] tracking-tight">{t("videoFeed.sidebarTitle")}</h2>
            <p className="text-white/35 text-[11px] tracking-wide uppercase mt-0.5">{t("videoFeed.sidebarSub")}</p>
          </div>
          <button
            type="button"
            onClick={() => navigate("/")}
            className="text-[11px] font-bold text-primary/80 hover:text-primary transition-colors uppercase tracking-wide"
          >
            {t("videoFeed.sidebarViewAll")} →
          </button>
        </div>

        {/* 2-column listing grid */}
        <div className="flex-1 overflow-y-auto px-3 py-3">
          {sideListings.length === 0 ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-5 w-5 animate-spin text-white/20" />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2.5">
              {sideListings.map(listing => (
                <button
                  key={listing.id}
                  type="button"
                  onClick={() => navigate(`/listings/${listing.id}`)}
                  className="flex flex-col text-left rounded-xl overflow-hidden group transition-all duration-200 hover:scale-[1.02]"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.07)",
                  }}
                >
                  {/* Image */}
                  <div className="w-full aspect-square overflow-hidden bg-zinc-900 relative">
                    {listing.images[0] ? (
                      <img
                        src={listing.images[0]}
                        alt=""
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ShoppingBag className="h-8 w-8 text-white/10" />
                      </div>
                    )}
                    {/* Subtle bottom fade */}
                    <div
                      className="absolute inset-x-0 bottom-0 h-8 pointer-events-none"
                      style={{ background: "linear-gradient(to top, rgba(0,0,0,0.5), transparent)" }}
                    />
                  </div>
                  {/* Info */}
                  <div className="px-2.5 py-2">
                    <p className="text-white/85 font-semibold text-[11px] leading-snug line-clamp-2 mb-1">{listing.title}</p>
                    <p className="text-primary font-black text-[13px] leading-none">{formatPrice(listing.price, null, listing.currency)}</p>
                    {listing.city && (
                      <p className="text-white/30 text-[10px] mt-1 truncate">{listing.city}</p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer CTA */}
        <div className="px-4 py-4 shrink-0" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <button
            type="button"
            onClick={() => navigate("/")}
            className="w-full flex items-center justify-center gap-2 font-bold text-[13px] py-2.5 rounded-xl transition-all hover:opacity-90"
            style={{
              background: "rgba(249,115,22,0.12)",
              border: "1px solid rgba(249,115,22,0.25)",
              color: "#f97316",
            }}
          >
            <ShoppingBag className="h-3.5 w-3.5" />
            {t("videoFeed.goToMarketplace")}
          </button>
        </div>
      </div>

      <BoostWizard open={wizardOpen} onClose={() => { closeWizard(); fetchPage(1, true); }} />
    </div>
  );
}
