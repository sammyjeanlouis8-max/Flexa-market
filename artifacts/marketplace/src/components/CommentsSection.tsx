import { useState, useRef, useEffect, useCallback } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MessageCircle, Reply, MoreVertical, Trash2, SendHorizontal, Loader2, BadgeCheck, Ban } from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { AdminBlockModal } from "@/components/AdminBlockModal";
import { useToast } from "@/hooks/use-toast";
import { useRestriction } from "@/hooks/useRestriction";
import { RestrictionBanner } from "@/components/RestrictionBanner";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { EmojiPickerButton, insertEmojiAtCursor } from "@/components/EmojiPickerButton";

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
}

function timeAgo(dateStr: string): string {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

interface CommentItemProps {
  comment: Comment | CommentReply;
  isReply?: boolean;
  onReply?: (commentId: number, userName: string) => void;
  onDelete: (commentId: number) => void;
  onBlock?: (userId: number, userName: string) => void;
  currentUserId?: number;
  isAdmin?: boolean;
}

function CommentItem({ comment, isReply = false, onReply, onDelete, onBlock, currentUserId, isAdmin }: CommentItemProps) {
  const { t } = useTranslation();
  const canDelete = !comment.isDeleted && (comment.userId === currentUserId || isAdmin);
  const canBlock = isAdmin && comment.userId !== currentUserId && !comment.isDeleted;
  return (
    <div className={`flex gap-2.5 ${isReply ? "ml-8 mt-2" : ""}`}>
      <Link href={`/profile/${comment.userId}`} className="flex-shrink-0 mt-0.5">
        <Avatar className="h-7 w-7">
          <AvatarImage src={comment.userAvatar ?? undefined} />
          <AvatarFallback className="text-xs bg-primary text-primary-foreground font-bold">{comment.userName?.[0] ?? "?"}</AvatarFallback>
        </Avatar>
      </Link>
      <div className="flex-1 min-w-0">
        <div className="bg-secondary rounded-2xl px-3 py-2 inline-block max-w-full">
          <div className="flex items-center gap-1.5 mb-0.5">
            <Link href={`/profile/${comment.userId}`}><span className="text-xs font-semibold text-foreground hover:text-primary">{comment.userName}</span></Link>
            {comment.userIsVerified && <BadgeCheck className="h-3 w-3 text-primary flex-shrink-0" />}
          </div>
          <p className={`text-sm leading-relaxed ${comment.isDeleted ? "text-muted-foreground italic" : "text-foreground"} break-words`}>
            {comment.isDeleted ? t("comments.deleted") : comment.content}
          </p>
        </div>
        <div className="flex items-center gap-3 mt-1 ml-1">
          <span className="text-xs text-muted-foreground">{timeAgo(comment.createdAt)}</span>
          {!comment.isDeleted && !isReply && onReply && (
            <button onClick={() => onReply(comment.id, comment.userName)} className="text-xs font-semibold text-muted-foreground hover:text-primary transition-colors">
              {t("buttons.reply")}
            </button>
          )}
          {(canDelete || canBlock) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="text-muted-foreground hover:text-foreground transition-colors"><MoreVertical className="h-3 w-3" /></button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-40">
                {canDelete && (
                  <DropdownMenuItem className="text-destructive" onClick={() => onDelete(comment.id)}>
                    <Trash2 className="h-3.5 w-3.5 mr-2" />{t("buttons.delete")}
                  </DropdownMenuItem>
                )}
                {canBlock && (
                  <DropdownMenuItem className="text-orange-600 dark:text-orange-400" onClick={() => onBlock?.(comment.userId, comment.userName)}>
                    <Ban className="h-3.5 w-3.5 mr-2" />Bloke itilizatè
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CommentsSection({ listingId }: { listingId: number }) {
  const { user, token } = useAuth();
  const { toast } = useToast();
  const { isRestricted } = useRestriction();
  const { t } = useTranslation();
  const isAdmin = !!(user as any)?.isAdmin || !!(user as any)?.isSuperAdmin;
  const [comments, setComments] = useState<Comment[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<{ id: number; name: string } | null>(null);
  const [blockTarget, setBlockTarget] = useState<{ userId: number; userName: string } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const loadComments = async () => {
    if (loaded) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/listings/${listingId}/comments`);
      const data = await res.json();
      setComments(data);
      setLoaded(true);
    } catch {
      toast({ title: "Failed to load comments", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // Auto-load comments on mount
  useEffect(() => { loadComments(); }, [listingId]);

  const handleReply = (commentId: number, userName: string) => {
    setReplyTo({ id: commentId, name: userName });
    setTimeout(() => textareaRef.current?.focus(), 100);
  };

  const cancelReply = () => setReplyTo(null);

  const submit = async () => {
    if (!text.trim()) return;
    if (!user) { toast({ title: "Sign in to comment", variant: "destructive" }); return; }
    if (isRestricted) { toast({ title: "Fonksyon sa a limite sou kont ou kounye a. Tanpri respekte règ platfòm nan.", variant: "destructive" }); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/listings/${listingId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ content: text.trim(), parentId: replyTo?.id }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast({ title: d.error ?? "Failed to post", variant: "destructive" });
        return;
      }
      const newComment = await res.json();
      if (replyTo) {
        setComments(prev => prev.map(c => c.id === replyTo.id ? { ...c, replies: [...c.replies, newComment] } : c));
      } else {
        setComments(prev => [...prev, { ...newComment, replies: [] }]);
      }
      setText("");
      setReplyTo(null);
    } catch {
      toast({ title: "Failed to post comment", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const deleteComment = async (commentId: number) => {
    try {
      await fetch(`/api/comments/${commentId}`, { method: "DELETE", headers: { "Authorization": `Bearer ${token}` } });
      setComments(prev => prev.map(c => {
        if (c.id === commentId) return { ...c, content: "[deleted]", isDeleted: true };
        return { ...c, replies: c.replies.map(r => r.id === commentId ? { ...r, content: "[deleted]", isDeleted: true } : r) };
      }));
    } catch {
      toast({ title: "Failed to delete", variant: "destructive" });
    }
  };

  const totalCount = comments.length + comments.reduce((acc, c) => acc + c.replies.length, 0);

  return (
    <div className="mt-6">
      {/* Section header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-primary" />
          <span className="text-sm font-bold text-foreground">
            {t("comments.comments")}
          </span>
          {loaded && totalCount > 0 && (
            <span className="rounded-full bg-primary/10 text-primary text-xs font-bold px-2 py-0.5">
              {totalCount}
            </span>
          )}
        </div>
      </div>

      {/* Loading skeletons */}
      {loading && (
        <div className="space-y-3 mb-4">
          {[1, 2].map(i => (
            <div key={i} className="flex gap-2.5 animate-pulse">
              <div className="w-7 h-7 rounded-full bg-muted flex-shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 bg-muted rounded-full w-24" />
                <div className="h-8 bg-muted rounded-2xl w-full" />
              </div>
            </div>
          ))}
        </div>
      )}

      {loaded && (
        <>
          {/* Comment list */}
          <div className="space-y-4 mb-4">
            {comments.length === 0 && (
              <div className="text-center py-6 text-muted-foreground">
                <MessageCircle className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">{t("comments.noComments")}</p>
              </div>
            )}
            {comments.map(comment => (
              <div key={comment.id}>
                <CommentItem
                  comment={comment}
                  onReply={handleReply}
                  onDelete={deleteComment}
                  onBlock={(uid, uname) => setBlockTarget({ userId: uid, userName: uname })}
                  currentUserId={user?.id}
                  isAdmin={isAdmin}
                />
                {comment.replies.map(reply => (
                  <CommentItem
                    key={reply.id}
                    comment={reply as unknown as Comment}
                    isReply
                    onDelete={deleteComment}
                    onBlock={(uid, uname) => setBlockTarget({ userId: uid, userName: uname })}
                    currentUserId={user?.id}
                    isAdmin={isAdmin}
                  />
                ))}
              </div>
            ))}
          </div>

          {/* Comment input */}
          {user ? (
            isRestricted ? (
              <RestrictionBanner action="comment" />
            ) : (
            <div className="flex gap-1.5 items-end">
              <Avatar className="h-8 w-8 flex-shrink-0 mb-0.5">
                <AvatarImage src={user.avatar ?? undefined} />
                <AvatarFallback className="text-xs bg-primary text-primary-foreground font-bold">{user.name[0]}</AvatarFallback>
              </Avatar>
              {/* Emoji picker — opens above, avoids any overflow clipping */}
              <EmojiPickerButton
                onEmojiSelect={(emoji) =>
                  setText(prev => insertEmojiAtCursor(textareaRef.current, prev, emoji))
                }
              />
              <div className="flex-1 relative">
                {replyTo && (
                  <div className="flex items-center gap-1.5 mb-1 text-xs text-muted-foreground">
                    <Reply className="h-3 w-3" />
                    <span>{t("comments.replyTo", { name: replyTo.name })}</span>
                    <button onClick={cancelReply} className="ml-1 text-muted-foreground hover:text-foreground font-semibold text-xs">✕</button>
                  </div>
                )}
                <div className="relative">
                  <Textarea
                    ref={textareaRef}
                    placeholder={replyTo ? t("comments.postComment", { name: replyTo.name }) : t("comments.addComment")}
                    value={text}
                    onChange={e => setText(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
                    rows={1}
                    className="resize-none pr-10 py-2.5 rounded-2xl text-sm min-h-[40px] bg-secondary border-0 focus:ring-1 focus:ring-primary"
                    maxLength={1000}
                    data-testid="input-comment"
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="absolute right-1.5 bottom-1.5 h-7 w-7 text-primary"
                    onClick={submit}
                    disabled={!text.trim() || submitting}
                    data-testid="button-submit-comment"
                  >
                    {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <SendHorizontal className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              </div>
            </div>
            )
          ) : (
            <Link href="/auth/login">
              <div className="flex items-center gap-2 p-3 bg-secondary rounded-2xl cursor-pointer hover:bg-accent transition-colors">
                <MessageCircle className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">{t("comments.signInToComment")}</span>
              </div>
            </Link>
          )}
        </>
      )}

      {blockTarget && (
        <AdminBlockModal
          targetUserId={blockTarget.userId}
          targetUserName={blockTarget.userName}
          isOpen={!!blockTarget}
          onClose={() => setBlockTarget(null)}
        />
      )}
    </div>
  );
}
