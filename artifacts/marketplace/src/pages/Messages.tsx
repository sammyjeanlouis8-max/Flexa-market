import React, { useState, useEffect, useRef, useCallback, Component, type ReactNode } from "react";
import { useRestriction } from "@/hooks/useRestriction";
import { RestrictionBanner } from "@/components/RestrictionBanner";
import { AdminBlockButton } from "@/components/AdminBlockModal";
import { useRoute, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import {
  Send, MessageCircle, ArrowLeft, Check, CheckCheck,
  Plus, Camera, X, Play, Phone, Video, Mic, Sun, Moon, Copy, Trash2, Globe, Loader2,
} from "lucide-react";
import { insertEmojiAtCursor } from "@/components/EmojiPickerButton";
import TikTokEmojiPanel from "@/components/TikTokEmojiPanel";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  useGetConversations, useGetMessages, useSendMessage,
  getGetMessagesQueryKey, getGetConversationsQueryKey,
} from "@workspace/api-client-react";
import { useAuth } from "@/contexts/auth";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { useSocket } from "@/hooks/useSocket";

// ─── Types ────────────────────────────────────────────────────────────────────
type Conversation = {
  id: number; listingId?: number | null; listingTitle: string; listingImage?: string | null;
  otherUserId: number; otherUserName: string; otherUserAvatar?: string | null;
  lastMessage?: string | null; lastMessageAt?: string | null; unreadCount: number;
};

type MsgType = "text" | "image" | "video" | "audio";

type ChatMessage = {
  id: number; conversationId: number; senderId: number;
  senderName: string; senderAvatar?: string | null;
  senderIsAdmin?: boolean;
  content: string; messageType: MsgType;
  mediaUrl?: string | null;
  imageUrl?: string | null;
  isRead: boolean;
  isListened: boolean;
  isDeleted?: boolean;
  createdAt: string;
};

// ─── Chat Theme ───────────────────────────────────────────────────────────────
type ChatTheme = "sunlight" | "night";
const THEME_KEY = "flexamarket_chat_theme_v2";

const T = {
  sunlight: {
    isDark: false,
    pageBg: "#F0F2F5",
    listBg: "#FFFFFF",
    listItemHover: "#F3F4F6",
    listItemActive: "#EBF4FF",
    listBorder: "#E5E7EB",
    headerBg: "#FFFFFF",
    headerBorder: "#E5E7EB",
    msgAreaBg: "#F0F2F5",
    bubbleOut: "linear-gradient(135deg, #4f7cff, #3b82f6)",
    bubbleIn: "#FFFFFF",
    textOut: "#FFFFFF",
    textIn: "#1F2937",
    timeOut: "rgba(255,255,255,0.75)",
    timeIn: "#9CA3AF",
    seenColor: "#3B82F6",
    inputWrapBg: "#FFFFFF",
    inputBg: "#F3F4F6",
    inputText: "#111827",
    inputPlaceholder: "#9CA3AF",
    iconColor: "#6B7280",
    iconActiveBg: "#F3F4F6",
    nameColor: "#111827",
    presenceOn: "#22C55E",
    presenceOff: "#9CA3AF",
    typingBg: "#FFFFFF",
    typingDot: "#9CA3AF",
    contextBg: "#FFFFFF",
    contextBorder: "#E5E7EB",
    contextText: "#1F2937",
    contextDestructive: "#EF4444",
    listName: "#111827",
    listSub: "#6B7280",
    listTime: "#9CA3AF",
    emptyIcon: "#D1D5DB",
    emptyText: "#9CA3AF",
    toggleBg: "#F3F4F6",
    toggleIcon: "#818CF8",
    sendBg: "#2563EB",
  },
  night: {
    isDark: true,
    pageBg: "#0F172A",
    listBg: "#0F172A",
    listItemHover: "#1E293B",
    listItemActive: "#1E293B",
    listBorder: "#1E293B",
    headerBg: "#0F172A",
    headerBorder: "#1E293B",
    msgAreaBg: "#0F172A",
    bubbleOut: "linear-gradient(135deg, #4f7cff, #3b82f6)",
    bubbleIn: "rgba(255, 255, 255, 0.08)",
    textOut: "#FFFFFF",
    textIn: "#E5E7EB",
    timeOut: "rgba(255,255,255,0.55)",
    timeIn: "#94A3B8",
    seenColor: "#A78BFA",
    inputWrapBg: "#0F172A",
    inputBg: "#1E293B",
    inputText: "#F1F5F9",
    inputPlaceholder: "#94A3B8",
    iconColor: "#94A3B8",
    iconActiveBg: "#1E293B",
    nameColor: "#F1F5F9",
    presenceOn: "#22C55E",
    presenceOff: "#64748B",
    typingBg: "#1E293B",
    typingDot: "#475569",
    contextBg: "#1E293B",
    contextBorder: "#334155",
    contextText: "#F1F5F9",
    contextDestructive: "#EF4444",
    listName: "#F1F5F9",
    listSub: "#94A3B8",
    listTime: "#64748B",
    emptyIcon: "#334155",
    emptyText: "#94A3B8",
    toggleBg: "#1E293B",
    toggleIcon: "#818CF8",
    sendBg: "#7C3AED",
  },
} as const;

// Inject animation keyframes once
let _animInjected = false;
function injectChatAnimations() {
  if (_animInjected || typeof document === "undefined") return;
  _animInjected = true;
  const el = document.createElement("style");
  el.textContent = `
    @keyframes msgIn { from { transform: translateY(6px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
    @keyframes menuIn { from { transform: scale(0.92) translateY(4px); opacity: 0; } to { transform: scale(1) translateY(0); opacity: 1; } }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    @keyframes recordWave { from { transform: scaleY(0.55); } to { transform: scaleY(1); } }
    .msg-bubble-anim { animation: msgIn 120ms ease-out; }
    .menu-anim { animation: menuIn 100ms ease-out; }
  `;
  document.head.appendChild(el);
}
injectChatAnimations();

// ─── Helpers ──────────────────────────────────────────────────────────────────
function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (!Number.isFinite(m) || m < 1) return "kounye a";
    if (m < 60) return `${m}min`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    return `${Math.floor(h / 24)}j`;
  } catch { return ""; }
}
function formatMsgTime(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
}

// ─── Thread Error Boundary ────────────────────────────────────────────────────
class ThreadBoundary extends Component<
  { children: ReactNode; convId: number; pageBg: string },
  { hasError: boolean; isRetrying: boolean; retryCount: number }
> {
  private _timer: ReturnType<typeof setTimeout> | null = null;
  constructor(props: { children: ReactNode; convId: number; pageBg: string }) {
    super(props);
    this.state = { hasError: false, isRetrying: false, retryCount: 0 };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch() {
    const { retryCount } = this.state;
    if (retryCount < 3) {
      this.setState({ isRetrying: true });
      this._timer = setTimeout(() => {
        this.setState({ hasError: false, isRetrying: false, retryCount: retryCount + 1 });
      }, 1200);
    } else {
      this.setState({ isRetrying: false });
    }
  }
  componentDidUpdate(prev: { convId: number }) {
    if (prev.convId !== this.props.convId && this.state.hasError) {
      this.setState({ hasError: false, retryCount: 0, isRetrying: false });
    }
  }
  componentWillUnmount() { if (this._timer) clearTimeout(this._timer); }
  render() {
    if (!this.state.hasError) return this.props.children;

    // Silent retry → spinner only
    if (this.state.isRetrying) {
      return (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", background: this.props.pageBg }}>
          <div style={{ width: 32, height: 32, borderRadius: "50%", border: "3px solid #3b82f6", borderTopColor: "transparent", animation: "eb-spin 0.8s linear infinite" }} />
        </div>
      );
    }

    // Final fail → friendly UI
    return (
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", height: "100%", padding: 32,
        background: this.props.pageBg, textAlign: "center", gap: 14,
      }}>
        <MessageCircle style={{ width: 44, height: 44, color: "#3b82f6", opacity: 0.7 }} />
        <p style={{ color: "#94a3b8", fontSize: 14, margin: 0, maxWidth: 240, lineHeight: 1.6 }}>
          Gen yon ti pwoblèm koneksyon. Eseye ankò.
        </p>
        <button
          onClick={() => this.setState({ hasError: false, retryCount: 0, isRetrying: false })}
          style={{
            background: "linear-gradient(135deg, #4f7cff, #3b82f6)",
            color: "#fff", border: "none", borderRadius: 10,
            padding: "10px 26px", fontSize: 14, fontWeight: 700, cursor: "pointer",
          }}
        >
          Rekòmanse
        </button>
      </div>
    );
  }
}
function formatLastSeen(lastSeenAt: string | null, t: (k: string, o?: any) => string): string {
  if (!lastSeenAt) return "";
  const diff = Math.floor((Date.now() - new Date(lastSeenAt).getTime()) / 1000);
  if (diff < 60) return t("messages.lastSeenJustNow");
  if (diff < 3600) return t("messages.lastSeenMinutes", { n: Math.floor(diff / 60) });
  if (diff < 86400) return t("messages.lastSeenHours", { n: Math.floor(diff / 3600) });
  return t("messages.lastSeenDays", { n: Math.floor(diff / 86400) });
}
async function uploadMedia(file: Blob, contentType: string, token: string): Promise<string> {
  const presignRes = await fetch("/api/storage/uploads/request-url", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: "media", size: file.size, contentType }),
  });
  if (!presignRes.ok) {
    const err = await presignRes.json().catch(() => ({}));
    throw new Error((err as any).error || "Presign failed");
  }
  const { uploadURL, objectPath } = await presignRes.json();
  const putRes = await fetch(uploadURL, {
    method: "PUT",
    headers: { "Content-Type": contentType, Authorization: `Bearer ${token}` },
    body: file,
  });
  if (!putRes.ok) throw new Error("Upload failed");
  // The upload proxy returns the real persisted-media URL. Wasabi URLs are
  // same-origin `/api/storage/...` paths, while legacy Cloudinary responses
  // may be absolute HTTPS URLs. Do not discard the Wasabi path and fall back
  // to `objectPath`: that value is only a pre-upload placeholder.
  try {
    const data = await putRes.json();
    if (
      typeof data?.url === "string" &&
      (/^https:\/\//i.test(data.url) || data.url.startsWith("/api/storage/"))
    ) {
      return data.url;
    }
  } catch { /* non-JSON response — fall back */ }
  return `/api/storage/objects${(objectPath as string).replace(/^\/objects/, "")}`;
}

// ─── Context Menu ─────────────────────────────────────────────────────────────
function BubbleContextMenu({
  isMe, hasText, text, theme, onCopy, onDelete, onClose,
}: {
  isMe: boolean; hasText: boolean; text: string;
  theme: (typeof T)[ChatTheme]; onCopy: () => void; onDelete: () => void; onClose: () => void;
}) {
  const { t } = useTranslation();
  const c = theme;
  useEffect(() => {
    const h = () => onClose();
    document.addEventListener("pointerdown", h, { capture: true });
    return () => document.removeEventListener("pointerdown", h, { capture: true });
  }, [onClose]);
  return (
    <div
      className="menu-anim"
      onPointerDown={e => e.stopPropagation()}
      style={{
        position: "absolute",
        [isMe ? "right" : "left"]: 0,
        bottom: "calc(100% + 6px)",
        zIndex: 200,
        background: c.contextBg,
        border: `1px solid ${c.contextBorder}`,
        borderRadius: 12,
        overflow: "hidden",
        minWidth: 160,
        boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
      }}
    >
      {hasText && (
        <button
          type="button"
          onClick={onCopy}
          style={{
            display: "flex", alignItems: "center", gap: 10,
            width: "100%", padding: "11px 16px",
            background: "none", border: "none", cursor: "pointer",
            color: c.contextText, fontSize: 14, fontWeight: 500,
          }}
        >
          <Copy style={{ width: 15, height: 15, opacity: 0.7 }} />
          {t("messages.copy")}
        </button>
      )}
      {isMe && (
        <button
          type="button"
          onClick={onDelete}
          style={{
            display: "flex", alignItems: "center", gap: 10,
            width: "100%", padding: "11px 16px",
            background: "none", border: "none", cursor: "pointer",
            color: c.contextDestructive, fontSize: 14, fontWeight: 500,
            borderTop: `1px solid ${c.contextBorder}`,
          }}
        >
          <Trash2 style={{ width: 15, height: 15 }} />
          {t("messages.deleteMsg")}
        </button>
      )}
    </div>
  );
}

// ─── Fullscreen Media Modal ───────────────────────────────────────────────────
function MediaModal({ url, type, onClose }: { url: string; type: "image" | "video"; onClose: () => void }) {
  const { t } = useTranslation();
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.96)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <button
        onClick={onClose}
        style={{
          position: "absolute", top: 16, left: 16,
          width: 44, height: 44, borderRadius: "50%",
          background: "rgba(255,255,255,0.12)", border: "none",
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          color: "#fff", zIndex: 1,
        }}
        aria-label={t("messages.back")}
      >
        <ArrowLeft style={{ width: 22, height: 22 }} />
      </button>
      {type === "image" ? (
        <img
          src={url} alt="" onClick={e => e.stopPropagation()}
          style={{ maxWidth: "95vw", maxHeight: "90vh", objectFit: "contain", borderRadius: 10 }}
        />
      ) : (
        <video
          src={url} controls autoPlay playsInline onClick={e => e.stopPropagation()}
          style={{ maxWidth: "95vw", maxHeight: "90vh", borderRadius: 10, outline: "none" }}
        />
      )}
    </div>
  );
}

// ─── Audio Bubble ─────────────────────────────────────────────────────────────
// Natural-sounding voice waveform heights (0–1 scale)
const WAVE_BARS = [
  0.30,0.72,0.48,1.00,0.55,0.85,0.38,0.90,0.62,0.45,
  0.78,0.32,0.95,0.58,0.80,0.42,0.68,0.52,0.88,0.35,
  0.65,0.50,
];

// Module-level singleton — only one audio plays at a time
let _globalAudioEl: HTMLAudioElement | null = null;

const AudioBubble = React.memo(function AudioBubble({
  src, isMe, theme, timestamp, statusIcon, isListened, onListened,
}: {
  src: string; isMe: boolean; theme: (typeof T)[ChatTheme];
  timestamp: string; statusIcon: React.ReactNode;
  isListened: boolean; onListened?: () => void;
}) {
  const audioRef     = useRef<HTMLAudioElement>(null);
  const rafRef       = useRef<number | null>(null);
  const playingRef   = useRef(false);                       // used inside rAF loop
  const barsRef      = useRef<(HTMLDivElement | null)[]>([]); // direct DOM refs
  const dotRef       = useRef<HTMLDivElement>(null);
  const timeRef      = useRef<HTMLSpanElement>(null);
  const listenedRef  = useRef(false);
  const stallRef     = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [playing,  setPlaying]  = useState(false);
  const [duration, setDuration] = useState(0);
  const [fracSnap, setFracSnap] = useState(0); // low-freq React state for time display
  const [playbackError, setPlaybackError] = useState(false);

  const N = WAVE_BARS.length;

  // ── colours ──────────────────────────────────────────────────────────────
  const PLAYED_COLOR = "#33AAFF";
  const IDLE_COLOR   = isMe ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.18)";
  const iconColor    = isMe ? "#fff" : theme.textIn;
  const timeColor    = isMe ? "rgba(255,255,255,0.70)" : theme.timeIn;

  // ── direct-DOM waveform update at 60 fps ─────────────────────────────────
  const paintFrame = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    const frac = el.duration > 0 ? el.currentTime / el.duration : 0;

    // Update each bar directly — no React re-render
    barsRef.current.forEach((bar, i) => {
      if (!bar) return;
      // bar i covers the strip [i/N, (i+1)/N)
      // it becomes fully played once frac > i/N
      const played = frac > i / N;
      bar.style.background = played ? PLAYED_COLOR : IDLE_COLOR;
    });

    // Move the progress dot
    if (dotRef.current) {
      dotRef.current.style.left = `calc(${frac * 100}% - 5px)`;
      dotRef.current.style.opacity = el.duration > 0 ? "1" : "0";
    }

    // Update time label (cheap string op)
    if (timeRef.current) {
      const s = el.currentTime;
      const m2 = Math.floor(s / 60);
      const s2 = Math.floor(s % 60);
      timeRef.current.textContent = `${m2}:${s2.toString().padStart(2, "0")}`;
    }
  }, [N, IDLE_COLOR]);

  const startRaf = useCallback(() => {
    playingRef.current = true;
    const tick = () => {
      if (!playingRef.current) return;
      paintFrame();
      rafRef.current = requestAnimationFrame(tick);
    };
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);
  }, [paintFrame]);

  const stopRaf = useCallback(() => {
    playingRef.current = false;
    if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopRaf();
      if (_globalAudioEl === audioRef.current) _globalAudioEl = null;
      if (stallRef.current) clearTimeout(stallRef.current);
    };
  }, [stopRaf]);

  // iOS Safari/WKWebView needs an explicit load after the media source changes.
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    setPlaybackError(false);
    el.load();
  }, [src]);

  // ── controls ─────────────────────────────────────────────────────────────
  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (playingRef.current) {
      el.pause();
    } else {
      if (_globalAudioEl && _globalAudioEl !== el) _globalAudioEl.pause();
      _globalAudioEl = el;
      setPlaybackError(false);
      if (el.error || el.networkState === HTMLMediaElement.NETWORK_NO_SOURCE) el.load();
      el.play().catch(() => {
        setPlaying(false);
        setPlaybackError(true);
        if (_globalAudioEl === el) _globalAudioEl = null;
      });
    }
  };

  const handlePlay = () => {
    setPlaying(true);
    startRaf();
    if (!isMe && !isListened && !listenedRef.current) {
      listenedRef.current = true;
      onListened?.();
    }
  };

  const handlePause = () => { setPlaying(false); stopRaf(); paintFrame(); };

  const handleEnded = () => {
    setPlaying(false); stopRaf();
    setFracSnap(0);
    // Reset all bars and dot
    barsRef.current.forEach(b => { if (b) b.style.background = IDLE_COLOR; });
    if (dotRef.current) dotRef.current.style.left = "calc(0% - 5px)";
    if (timeRef.current && audioRef.current) {
      const d = audioRef.current.duration;
      const m2 = Math.floor(d / 60); const s2 = Math.floor(d % 60);
      timeRef.current.textContent = `${m2}:${s2.toString().padStart(2, "0")}`;
    }
    if (_globalAudioEl === audioRef.current) _globalAudioEl = null;
  };

  // Stall recovery
  const handleStall = () => {
    const el = audioRef.current;
    if (!el || el.paused) return;
    if (stallRef.current) clearTimeout(stallRef.current);
    stallRef.current = setTimeout(() => {
      if (el && !el.paused && el.readyState < 3) {
        const t = el.currentTime; el.load(); el.currentTime = t; el.play().catch(() => {});
      }
    }, 400);
  };

  // Duration display (shown before playback / after end)
  const fmtSecs = (s: number) => {
    if (!isFinite(s) || s <= 0) return "0:00";
    const m2 = Math.floor(s / 60); const s2 = Math.floor(s % 60);
    return `${m2}:${s2.toString().padStart(2, "0")}`;
  };

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: "8px 10px 6px", width: "100%", boxSizing: "border-box" }}>
      <audio
        ref={audioRef} src={src} preload="auto"
        onPlaying={handlePlay}
        onPause={handlePause}
        onEnded={handleEnded}
        onLoadedMetadata={() => { if (audioRef.current) setDuration(audioRef.current.duration); }}
        onStalled={handleStall} onSuspend={handleStall}
        onError={() => { setPlaying(false); setPlaybackError(true); stopRaf(); }}
      />

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>

        {/* ── Play / Pause button — filled circle WhatsApp style ── */}
        <button
          type="button" onClick={toggle}
          style={{
            flexShrink: 0, width: 36, height: 36, borderRadius: "50%",
            background: isMe ? "rgba(255,255,255,0.22)" : "rgba(0,0,0,0.10)",
            border: "none", cursor: "pointer", padding: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: iconColor, transition: "background 0.15s",
            WebkitTapHighlightColor: "transparent",
          }}
        >
          {playing ? (
            <span style={{ display: "flex", gap: 3, alignItems: "center" }}>
              <span style={{ width: 3.5, height: 13, borderRadius: 2, background: "currentColor", display: "block" }} />
              <span style={{ width: 3.5, height: 13, borderRadius: 2, background: "currentColor", display: "block" }} />
            </span>
          ) : (
            <svg width="13" height="15" viewBox="0 0 13 15" fill="currentColor" style={{ marginLeft: 2 }}>
              <path d="M0 0 L13 7.5 L0 15 Z" />
            </svg>
          )}
        </button>

        {/* ── Waveform ── */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Bars row */}
          <div style={{ position: "relative", height: 28 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 1.5, height: "100%", overflow: "hidden" }}>
              {WAVE_BARS.map((h, i) => (
                <div
                  key={i}
                  ref={el => { barsRef.current[i] = el; }}
                  style={{
                    width: 3, flexShrink: 0, borderRadius: 99,
                    height: `${Math.round(h * 100)}%`,
                    background: IDLE_COLOR,
                    // No CSS transition — rAF handles color, transition would lag behind
                  }}
                />
              ))}
            </div>
            {/* Progress dot */}
            <div
              ref={dotRef}
              style={{
                position: "absolute", top: "50%", transform: "translateY(-50%)",
                left: "calc(0% - 5px)", opacity: 0,
                width: 11, height: 11, borderRadius: "50%",
                background: PLAYED_COLOR,
                pointerEvents: "none",
                boxShadow: "0 1px 4px rgba(51,170,255,0.5)",
              }}
            />
          </div>

          {/* Time + metadata row */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 3 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <Mic style={{
                width: 11, height: 11, flexShrink: 0,
                color: isMe ? (isListened ? PLAYED_COLOR : "rgba(255,255,255,0.50)") : "rgba(0,0,0,0.30)",
                transition: "color 0.3s",
              }} />
              {/* rAF writes here directly; React only sets the initial value */}
              <span
                ref={timeRef}
                style={{ fontSize: 11, color: timeColor, fontVariantNumeric: "tabular-nums", minWidth: 28 }}
              >
                {fmtSecs(duration)}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
              <span style={{ fontSize: 11, color: timeColor }}>{timestamp}</span>
              {statusIcon}
            </div>
          </div>
        </div>
      </div>
      {playbackError && (
        <p style={{
          margin: "5px 0 0 46px", fontSize: 11,
          color: isMe ? "rgba(255,255,255,0.88)" : "#B91C1C",
        }}>
          Odyo a pa ka jwe. Peze ankò.
        </p>
      )}
    </div>
  );
});

// ─── Message Bubble ───────────────────────────────────────────────────────────
function MsgBubble({
  msg, isMe, isLastInGroup, isLastSentByMe, onMediaTap, theme, onAudioListened,
  translation, isTranslating, onTranslate, onDeleteMsg,
}: {
  msg: ChatMessage; isMe: boolean; isLastInGroup: boolean; isLastSentByMe: boolean;
  onMediaTap: (url: string, type: "image" | "video") => void;
  onAudioListened?: (msgId: number) => void;
  onDeleteMsg?: (msgId: number) => void;
  theme: (typeof T)[ChatTheme];
  translation?: { translatedText: string; detectedLanguage: string } | null;
  isTranslating?: boolean;
  onTranslate?: () => void;
}) {
  const { t } = useTranslation();
  const c = theme;
  const [showMenu, setShowMenu] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (msg.isDeleted) {
    return (
      <div style={{ display: "flex", justifyContent: isMe ? "flex-end" : "flex-start", padding: "2px 8px" }}>
        <span style={{ fontSize: 12, color: theme.timeOut, fontStyle: "italic", opacity: 0.55 }}>
          {t("messages.deletedMessage")}
        </span>
      </div>
    );
  }

  const mtype = (msg.messageType as MsgType) || (msg.imageUrl ? "image" : "text");
  const mediaUrl = msg.mediaUrl || msg.imageUrl || "";
  const isAudio = mtype === "audio" && !!mediaUrl;
  const hasMedia = (mtype === "image" || mtype === "video") && !!mediaUrl;
  const hasText = !!msg.content;

  const R = 16, TAIL = 4;
  const br = isMe
    ? `${R}px ${R}px ${isLastInGroup ? TAIL : R}px ${R}px`
    : `${R}px ${R}px ${R}px ${isLastInGroup ? TAIL : R}px`;
  const mediaBR = isMe
    ? `${R}px ${R}px ${hasText ? 0 : (isLastInGroup ? TAIL : R)}px ${hasText ? 0 : R}px`
    : `${R}px ${R}px ${hasText ? 0 : R}px ${hasText ? 0 : (isLastInGroup ? TAIL : R)}px`;

  const bubbleBg = isMe ? c.bubbleOut : c.bubbleIn;
  const textColor = isMe ? c.textOut : c.textIn;
  const timeColor = isMe ? c.timeOut : c.timeIn;
  const mediaW = "min(200px, 72vw)";
  const bubbleMaxW = isAudio ? "160px" : hasMedia && !hasText ? mediaW : "72%";

  const pressStartRef = useRef<{ x: number; y: number } | null>(null);

  const startLongPress = (e: React.PointerEvent) => {
    pressStartRef.current = { x: e.clientX, y: e.clientY };
    longPressRef.current = setTimeout(() => setShowMenu(true), 420);
  };
  const cancelLongPress = () => {
    pressStartRef.current = null;
    if (longPressRef.current) { clearTimeout(longPressRef.current); longPressRef.current = null; }
  };
  const onMoveCheck = (e: React.PointerEvent) => {
    if (!pressStartRef.current) return;
    const dx = e.clientX - pressStartRef.current.x;
    const dy = e.clientY - pressStartRef.current.y;
    // Any scroll-like movement (≥8 px) cancels the long-press so native scroll stays fluid
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) cancelLongPress();
  };

  const handleCopy = () => {
    if (msg.content) navigator.clipboard.writeText(msg.content).catch(() => {});
    setShowMenu(false);
  };
  const handleDelete = () => {
    setShowMenu(false);
    if (window.confirm(t("messages.confirmDelete"))) {
      onDeleteMsg?.(msg.id);
    }
  };

  // Read receipt: blue seen, grey sent
  const StatusIcon = isMe ? (
    msg.isRead
      ? <CheckCheck style={{ width: 13, height: 13, color: c.seenColor }} />
      : isLastSentByMe
        ? <Check style={{ width: 13, height: 13, color: timeColor }} />
        : <CheckCheck style={{ width: 13, height: 13, color: timeColor }} />
  ) : null;

  return (
    <div
      className="msg-bubble-anim"
      style={{ display: "flex", alignItems: "flex-end", gap: 4, width: "100%", overflow: "hidden", position: "relative" }}
    >
      {isMe && <div style={{ flex: 1 }} />}
      {!isMe && <div style={{ width: 24, flexShrink: 0 }} />}

      <div
        style={{
          position: "relative",
          display: "flex", flexDirection: "column",
          maxWidth: bubbleMaxW, minWidth: 0,
          width: isAudio ? bubbleMaxW : undefined,
          borderRadius: br,
          background: bubbleBg,
          overflow: isAudio ? "hidden" : "visible",
          // Allow native vertical scroll even while long-press timer is running
          touchAction: "pan-y",
        }}
        onPointerDown={startLongPress}
        onPointerMove={onMoveCheck}
        onPointerUp={cancelLongPress}
        onPointerLeave={cancelLongPress}
        onPointerCancel={cancelLongPress}
        onContextMenu={e => { e.preventDefault(); setShowMenu(true); }}
      >
        {/* Admin badge */}
        {!isMe && msg.senderIsAdmin && (
          <div style={{ padding: "6px 12px 2px", display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{
              fontSize: 10, fontWeight: 800, letterSpacing: 0.6, color: "#22D3EE",
              background: "rgba(34,211,238,0.10)", borderRadius: 6, padding: "2px 7px",
              border: "1px solid rgba(34,211,238,0.25)", display: "inline-flex", alignItems: "center", gap: 4,
            }}>
              🛡 ADM-{String(msg.senderId).padStart(4, "0")}
            </span>
          </div>
        )}

        {/* Image */}
        {mtype === "image" && mediaUrl && (
          <button
            type="button" onClick={() => onMediaTap(mediaUrl, "image")}
            style={{
              display: "block", padding: 0, border: "none", cursor: "pointer",
              background: "none", width: mediaW, borderRadius: mediaBR,
              overflow: "hidden", flexShrink: 0,
            } as React.CSSProperties}
          >
            <img
              src={mediaUrl} alt="foto" loading="lazy"
              style={{ display: "block", width: "100%", height: "auto", maxHeight: 200, objectFit: "cover" }}
            />
          </button>
        )}

        {/* Video */}
        {mtype === "video" && mediaUrl && (
          <button
            type="button" onClick={() => onMediaTap(mediaUrl, "video")}
            style={{
              display: "block", padding: 0, border: "none", cursor: "pointer",
              background: "#000", width: mediaW, borderRadius: 12,
              overflow: "hidden", position: "relative", flexShrink: 0,
              aspectRatio: "16/9",
            } as React.CSSProperties}
          >
            <video
              src={mediaUrl} preload="metadata" playsInline muted
              style={{ display: "block", width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }}
            />
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.35)" }}>
              <div style={{ width: 40, height: 40, borderRadius: "50%", background: "rgba(255,255,255,0.92)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Play style={{ width: 16, height: 16, color: "#111827", marginLeft: 2 }} />
              </div>
            </div>
          </button>
        )}

        {/* Audio */}
        {mtype === "audio" && mediaUrl && (
          <AudioBubble
            src={mediaUrl} isMe={isMe} theme={c}
            timestamp={formatMsgTime(msg.createdAt)}
            statusIcon={StatusIcon}
            isListened={msg.isListened}
            onListened={() => onAudioListened?.(msg.id)}
          />
        )}

        {/* Text */}
        {mtype === "text" && hasText && (
          <>
            <p style={{
              margin: 0, padding: "10px 14px 4px",
              fontSize: 15, lineHeight: 1.5, fontWeight: 400,
              wordBreak: "break-word", whiteSpace: "pre-wrap",
              color: textColor, letterSpacing: 0.1,
            }}>
              {translation && !showOriginal ? translation.translatedText : msg.content}
            </p>

            {/* Translation controls — only for received text messages */}
            {!isMe && (
              <div style={{ padding: "2px 14px 8px", display: "flex", flexDirection: "column", gap: 3 }}>
                {translation ? (
                  <>
                    {/* "Translated from X" badge */}
                    <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10.5, color: textColor, opacity: 0.5 }}>
                      <Globe size={10} />
                      <span>{t("messages.translatedFrom", { lang: translation.detectedLanguage })}</span>
                    </div>
                    {/* Toggle original / translation */}
                    <button
                      type="button"
                      onClick={() => setShowOriginal(s => !s)}
                      style={{
                        background: "none", border: "none", cursor: "pointer",
                        color: textColor, opacity: 0.65, fontSize: 11,
                        padding: 0, textAlign: "left",
                        display: "inline-flex", alignItems: "center", gap: 4, width: "fit-content",
                      }}
                    >
                      {showOriginal ? t("messages.showTranslation") : t("messages.showOriginal")}
                    </button>
                  </>
                ) : (
                  /* Translate button */
                  <button
                    type="button"
                    onClick={onTranslate}
                    disabled={isTranslating}
                    style={{
                      background: "none", border: "none",
                      cursor: isTranslating ? "default" : "pointer",
                      color: textColor, opacity: isTranslating ? 0.4 : 0.6, fontSize: 11,
                      padding: 0, textAlign: "left",
                      display: "inline-flex", alignItems: "center", gap: 4, width: "fit-content",
                    }}
                  >
                    {isTranslating ? (
                      <>
                        <Loader2 size={11} style={{ animation: "spin 1s linear infinite" }} />
                        <span>{t("messages.translating")}</span>
                      </>
                    ) : (
                      <>
                        <Globe size={11} />
                        <span>{t("messages.translate")}</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            )}
          </>
        )}
        {mtype !== "text" && hasText && (
          <p style={{
            margin: 0, padding: "4px 12px 2px",
            fontSize: 12, lineHeight: 1.4,
            wordBreak: "break-word", color: textColor, opacity: 0.85,
          }}>
            {msg.content}
          </p>
        )}

        {/* Timestamp + status (hidden for audio — AudioBubble renders its own) */}
        {!isAudio && (
          <div style={{
            display: "flex", alignItems: "center", gap: 3,
            justifyContent: isMe ? "flex-end" : "flex-start",
            padding: "2px 10px 7px",
          }}>
            <span style={{ fontSize: 11, color: timeColor, letterSpacing: 0.1 }}>
              {formatMsgTime(msg.createdAt)}
            </span>
            {StatusIcon}
          </div>
        )}

        {/* Long-press context menu */}
        {showMenu && (
          <BubbleContextMenu
            isMe={isMe}
            hasText={hasText}
            text={msg.content}
            theme={theme}
            onCopy={handleCopy}
            onDelete={handleDelete}
            onClose={() => setShowMenu(false)}
          />
        )}
      </div>

      {!isMe && <div style={{ flex: 1 }} />}
    </div>
  );
}

// ─── Conversation List ────────────────────────────────────────────────────────
function ConvList({ convs, activeId, theme }: { convs: Conversation[]; activeId?: number; theme: (typeof T)[ChatTheme] }) {
  const { t } = useTranslation();
  const c = theme;
  if (convs.length === 0) return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, textAlign: "center", padding: "64px 16px", background: c.listBg }}>
      <MessageCircle style={{ width: 48, height: 48, color: c.emptyIcon, marginBottom: 12 }} />
      <p style={{ fontWeight: 600, color: c.listName, margin: 0 }}>{t("messages.noConversations")}</p>
      <p style={{ fontSize: 14, color: c.emptyText, marginTop: 4 }}>{t("messages.browseListings")}</p>
    </div>
  );
  return (
    <div style={{ overflowY: "auto", flex: 1, background: c.listBg }}>
      {convs.map(conv => (
        <Link key={conv.id} href={`/messages/${conv.id}`}>
          <div style={{
            display: "flex", alignItems: "center", gap: 12,
            padding: "12px 16px",
            borderBottom: `1px solid ${c.listBorder}`,
            background: activeId === conv.id ? c.listItemActive : c.listBg,
            cursor: "pointer",
            transition: "background 80ms",
          }}>
            <div
              style={{ position: "relative", flexShrink: 0 }}
              onClick={e => { e.preventDefault(); e.stopPropagation(); window.location.href = `/profile/${conv.otherUserId}`; }}
            >
              <Avatar className="h-12 w-12" style={{ cursor: "pointer" }}>
                <AvatarImage src={conv.otherUserAvatar ?? undefined} className="object-cover" />
                <AvatarFallback style={{ background: "#2563EB", color: "#fff", fontWeight: 700, fontSize: 16 }}>
                  {(conv.otherUserName ?? "?")[0]?.toUpperCase() ?? "?"}
                </AvatarFallback>
              </Avatar>
              {conv.unreadCount > 0 && (
                <span style={{
                  position: "absolute", top: -2, right: -2,
                  width: 16, height: 16, borderRadius: "50%",
                  background: "#2563EB", border: `2px solid ${c.listBg}`,
                }} />
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4, marginBottom: 2 }}>
                <span style={{
                  fontSize: 15, color: c.listName, fontWeight: conv.unreadCount > 0 ? 700 : 500,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {conv.otherUserName}
                </span>
                <span style={{ fontSize: 11, color: c.listTime, flexShrink: 0 }}>
                  {conv.lastMessageAt ? timeAgo(conv.lastMessageAt) : ""}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4 }}>
                <p style={{
                  fontSize: 13, color: conv.unreadCount > 0 ? c.listName : c.listSub,
                  fontWeight: conv.unreadCount > 0 ? 600 : 400,
                  margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {conv.lastMessage ?? conv.listingTitle}
                </p>
                {conv.unreadCount > 0 && (
                  <Badge style={{ fontSize: 11, minWidth: 20, height: 20, padding: "0 6px", background: "#2563EB", flexShrink: 0 }}>
                    {conv.unreadCount > 99 ? "99+" : conv.unreadCount}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

// ─── Message Thread ───────────────────────────────────────────────────────────
function MessageThread({ convId, theme, onToggleTheme }: {
  convId: number; theme: (typeof T)[ChatTheme]; onToggleTheme: () => void;
}) {
  const { user, token, isLoading: authLoading } = useAuth();
  const { isRestricted } = useRestriction();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  // ── Hardware / WebView back-button fix ─────────────────────────────────────
  // Problem: when inside a conversation the WebView may push extra history
  // entries (media loads, link previews, etc.).  Calling window.history.back()
  // would traverse those entries rather than returning to /messages.
  // Solution: push a sentinel entry on mount so the hardware back button
  // has exactly ONE thing to pop; intercept the resulting popstate event and
  // navigate directly to /messages via wouter (bypasses the dirty history).
  // The in-thread ArrowLeft button also calls window.history.back() so both
  // paths converge through the same handler.
  useEffect(() => {
    const sentinel = { _flexaConvBack: convId };
    window.history.pushState(sentinel, "");

    let handled = false;
    const onPop = () => {
      if (handled) return;
      handled = true;
      setLocation("/messages");
    };

    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      // If the sentinel is still on top (e.g. user navigated away via a Link),
      // silently pop it so we don't leave garbage in the session history.
      if (window.history.state?._flexaConvBack === convId) {
        handled = true;            // prevent onPop from firing again
        window.history.back();
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convId]);

  // iOS WKWebView zoom-reset: mounting a position:fixed fullscreen overlay
  // causes WKWebView to recalculate viewport scale, which shifts the whole
  // page right and puts the back button (far left) in the untouchable dead zone.
  // Fix: briefly toggle the viewport meta so WKWebView re-parses it at scale=1,
  // then restore. Also force scroll to top to clear any viewport offset.
  useEffect(() => {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    if (!meta) return;
    const original = meta.getAttribute('content') ?? '';
    // Toggle scale slightly — WKWebView re-reads the meta and resets zoom
    meta.setAttribute('content', original.replace('initial-scale=1.0', 'initial-scale=1.001'));
    const tid = setTimeout(() => {
      meta.setAttribute('content', original);
      window.scrollTo(0, 0);
    }, 32);
    window.scrollTo(0, 0);
    return () => clearTimeout(tid);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [text, setText] = useState("");
  const [showEmojiPanel, setShowEmojiPanel] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [typingOther, setTypingOther] = useState(false);
  const [otherOnline, setOtherOnline] = useState<boolean | null>(null);
  const [otherLastSeen, setOtherLastSeen] = useState<string | null>(null);
  const [mediaModal, setMediaModal] = useState<{ url: string; type: "image" | "video" } | null>(null);
  const [isNight, setIsNight] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingPaused, setRecordingPaused] = useState(false);
  const [recordingSecs, setRecordingSecs] = useState(0);
  const [voiceFinalizing, setVoiceFinalizing] = useState(false);
  const [translations, setTranslations] = useState<Map<number, { translatedText: string; detectedLanguage: string }>>(new Map());
  const [translatingIds, setTranslatingIds] = useState<Set<number>>(new Set());
  const autoTranslatedRef = useRef<Set<number>>(new Set());
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const voiceSessionRef = useRef<{
    recorder: MediaRecorder;
    stream: MediaStream;
    chunks: Blob[];
    recordedMime: string;
    cancelled: boolean;
    failed: boolean;
    finalized: boolean;
    finalize: () => Promise<void>;
  } | null>(null);
  const voiceBusyRef = useRef(false);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingBarRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const recordingMeterRafRef = useRef<number | null>(null);
  const recordingAudioContextRef = useRef<AudioContext | null>(null);
  const recordingAnalyserRef = useRef<AnalyserNode | null>(null);
  const recordingSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const msgContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const socket = useSocket();
  const c = theme;
  const composerActionColor = c.isDark ? "#A5B4FC" : "#2563EB";

  // Detect if night is active by checking pageBg
  const isDarkMode = c.isDark;

  const { data: messages, isLoading } = useGetMessages(convId, {
    query: {
      queryKey: getGetMessagesQueryKey(convId),
      refetchInterval: 5000,
      refetchIntervalInBackground: true,
      refetchOnWindowFocus: true,
      refetchOnMount: true,
    },
  });
  const { data: convs } = useGetConversations({
    query: {
      enabled: true,
      queryKey: getGetConversationsQueryKey(),
      refetchInterval: 5000,
      refetchIntervalInBackground: true,
      refetchOnWindowFocus: true,
      refetchOnMount: true,
    },
  });
  const conv = convs?.find((cv: any) => cv.id === convId) as Conversation | undefined;
  const sendMsg = useSendMessage();

  useEffect(() => {
    socket.joinConv(convId);
    const unsub = socket.onNewMessage((msg: any) => {
      if (msg.conversationId !== convId) return;
      queryClient.setQueryData(getGetMessagesQueryKey(convId), (old: any) => {
        const list: any[] = Array.isArray(old) ? old : [];
        if (list.find((m: any) => m.id === msg.id)) return list;
        return [...list, msg];
      });
      queryClient.invalidateQueries({ queryKey: getGetConversationsQueryKey() });
      setTimeout(() => scrollToBottom(true), 60);
    });
    const unsubListened = socket.onAudioListened(({ convId: cid, msgId }) => {
      if (cid !== convId) return;
      queryClient.setQueryData(getGetMessagesQueryKey(convId), (old: any) => {
        if (!Array.isArray(old)) return old;
        return old.map((m: any) => m.id === msgId ? { ...m, isListened: true } : m);
      });
    });
    const unsubDeleted = socket.onMsgDeleted(({ convId: cid, msgId }) => {
      if (cid !== convId) return;
      queryClient.setQueryData(getGetMessagesQueryKey(convId), (old: any) => {
        if (!Array.isArray(old)) return old;
        return old.map((m: any) => m.id === msgId ? { ...m, isDeleted: true, content: "" } : m);
      });
    });
    const unsubTyping = socket.onTyping(({ convId: cid }) => { if (cid === convId) setTypingOther(true); });
    const unsubStop = socket.onStopTyping(({ convId: cid }) => { if (cid === convId) setTypingOther(false); });
    return () => { socket.leaveConv(convId); unsub(); unsubListened(); unsubDeleted(); unsubTyping(); unsubStop(); };
  }, [convId, queryClient, socket]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        queryClient.invalidateQueries({ queryKey: getGetMessagesQueryKey(convId) });
        queryClient.invalidateQueries({ queryKey: getGetConversationsQueryKey() });
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [queryClient, convId]);

  // ── Presence ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!conv?.otherUserId) return;
    if (user?.id) socket.emitPresenceJoin(user.id);
    const fetchPresence = () => {
      fetch(`/api/users/${conv.otherUserId}/presence`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
        .then(r => r.json())
        .then(d => {
          if (typeof d.isOnline === "boolean") setOtherOnline(d.isOnline);
          if (d.lastSeenAt) setOtherLastSeen(d.lastSeenAt);
        })
        .catch(() => {});
    };
    fetchPresence();
    const unsubPresence = socket.onPresenceStatus(({ userId, isOnline, lastSeenAt }) => {
      if (userId === conv.otherUserId) {
        setOtherOnline(isOnline);
        if (lastSeenAt) setOtherLastSeen(lastSeenAt);
      }
    });
    socket.queryPresence(conv.otherUserId);
    const interval = setInterval(fetchPresence, 30_000);
    return () => { clearInterval(interval); unsubPresence(); };
  }, [conv?.otherUserId, user?.id, token, socket]);

  const isFirstLoadRef = useRef(true);
  const prevMsgCountRef = useRef(0);
  useEffect(() => {
    isFirstLoadRef.current = true;
    prevMsgCountRef.current = 0;
  }, [convId]);

  const scrollToBottom = (smooth = false) => {
    const el = msgContainerRef.current;
    if (!el) { bottomRef.current?.scrollIntoView({ behavior: "auto" }); return; }
    if (smooth && el.scrollHeight - el.scrollTop - el.clientHeight < 400) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    } else {
      el.scrollTop = el.scrollHeight;
    }
  };

  useEffect(() => {
    if (!messages) return;
    const count = (messages as any[]).length;
    const isFirst = isFirstLoadRef.current;
    isFirstLoadRef.current = false;
    // Only scroll to bottom on first load or when NEW messages arrive — never on periodic refetches
    if (isFirst || count > prevMsgCountRef.current) {
      scrollToBottom(!isFirst);
    }
    prevMsgCountRef.current = count;
  }, [messages]);

  // ── Translation helpers ────────────────────────────────────────────────────
  const translateMessage = useCallback(async (msgId: number) => {
    if (translatingIds.has(msgId) || translations.has(msgId)) return;
    setTranslatingIds(prev => { const n = new Set(prev); n.add(msgId); return n; });
    try {
      const tk = localStorage.getItem("flexamarket_token") ?? "";
      const res = await fetch(`/api/messages/${msgId}/translate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tk}` },
        body: JSON.stringify({ targetLanguage: user?.preferredLanguage || "en" }),
      });
      if (res.ok) {
        const data = await res.json();
        setTranslations(prev => new Map(prev).set(msgId, { translatedText: data.translatedText, detectedLanguage: data.detectedLanguage }));
      }
    } catch { /* silent — user can retry manually */ }
    setTranslatingIds(prev => { const n = new Set(prev); n.delete(msgId); return n; });
  }, [translatingIds, translations, user?.preferredLanguage]);

  const handleTyping = () => {
    if (user) socket.emitTyping(convId, user.id);
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      if (user) socket.emitStopTyping(convId, user.id);
    }, 2000);
  };

  const doSend = useCallback((body: {
    content?: string; messageType?: MsgType; mediaUrl?: string; imageUrl?: string;
  }) => {
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    if (user) socket.emitStopTyping(convId, user.id);
    sendMsg.mutate({ id: convId, data: body as any }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetMessagesQueryKey(convId) });
        queryClient.invalidateQueries({ queryKey: getGetConversationsQueryKey() });
        setTimeout(() => scrollToBottom(true), 100);
      },
    });
  }, [convId, queryClient, sendMsg, socket, user]);

  const sendText = () => {
    if (!text.trim() || isRestricted) return;
    const content = text.trim();
    setText("");
    setShowEmojiPanel(false);
    doSend({ content, messageType: "text" });
  };

  const stopRecordingTimer = () => {
    if (recordingTimerRef.current) { clearInterval(recordingTimerRef.current); recordingTimerRef.current = null; }
  };

  const stopRecordingMeter = useCallback(() => {
    if (recordingMeterRafRef.current !== null) {
      cancelAnimationFrame(recordingMeterRafRef.current);
      recordingMeterRafRef.current = null;
    }
    recordingSourceRef.current?.disconnect();
    recordingSourceRef.current = null;
    recordingAnalyserRef.current = null;
    const ctx = recordingAudioContextRef.current;
    recordingAudioContextRef.current = null;
    if (ctx && ctx.state !== "closed") void ctx.close().catch(() => {});
    recordingBarRefs.current.forEach(bar => {
      if (bar) bar.style.height = "4px";
    });
  }, []);

  const startRecordingMeter = useCallback((stream: MediaStream) => {
    stopRecordingMeter();
    const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextCtor) return;
    try {
      const ctx: AudioContext = new AudioContextCtor();
      const analyser = ctx.createAnalyser();
      const source = ctx.createMediaStreamSource(stream);
      analyser.fftSize = 256;
      analyser.minDecibels = -75;
      analyser.maxDecibels = -20;
      analyser.smoothingTimeConstant = 0.72;
      source.connect(analyser);
      recordingAudioContextRef.current = ctx;
      recordingAnalyserRef.current = analyser;
      recordingSourceRef.current = source;
      if (ctx.state === "suspended") void ctx.resume().catch(() => {});

      const samples = new Uint8Array(analyser.frequencyBinCount);
      const draw = () => {
        const recorderState = mediaRecorderRef.current?.state;
        if (recorderState === "recording") {
          analyser.getByteFrequencyData(samples);
          const usableBins = Math.min(64, samples.length);
          recordingBarRefs.current.forEach((bar, i) => {
            if (!bar) return;
            const bin = Math.min(usableBins - 1, 2 + Math.floor((i / WAVE_BARS.length) * (usableBins - 2)));
            const nearby = (samples[bin] + samples[Math.min(bin + 1, usableBins - 1)]) / 2;
            const height = Math.max(4, Math.min(42, 4 + (nearby / 255) * 42));
            bar.style.height = `${Math.round(height)}px`;
          });
        } else {
          recordingBarRefs.current.forEach(bar => {
            if (bar) bar.style.height = "4px";
          });
        }
        recordingMeterRafRef.current = requestAnimationFrame(draw);
      };
      recordingMeterRafRef.current = requestAnimationFrame(draw);
    } catch {
      stopRecordingMeter();
    }
  }, [stopRecordingMeter]);

  const startVoiceRecording = async () => {
    if (isRestricted || voiceBusyRef.current || uploading) return;
    voiceBusyRef.current = true;
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      const isAppleMobile =
        /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      const candidates = isAppleMobile
        ? ["audio/mp4;codecs=mp4a.40.2", "audio/mp4", "audio/webm;codecs=opus", "audio/webm"]
        : ["audio/webm;codecs=opus", "audio/webm", "audio/mp4;codecs=mp4a.40.2", "audio/mp4"];
      const requestedMime = candidates.find(type => MediaRecorder.isTypeSupported(type)) ?? "";
      const mr = requestedMime
        ? new MediaRecorder(stream, { mimeType: requestedMime })
        : new MediaRecorder(stream);
      const recordedMime = mr.mimeType || requestedMime || (isAppleMobile ? "audio/mp4" : "audio/webm");
      const activeStream = stream;
      const session = {
        recorder: mr,
        stream: activeStream,
        chunks: [] as Blob[],
        recordedMime,
        cancelled: false,
        failed: false,
        finalized: false,
        finalize: async () => {},
      };
      const finalizeSession = async () => {
        if (session.finalized) return;
        session.finalized = true;
        stopRecordingMeter();
        session.stream.getTracks().forEach(t => t.stop());
        if (voiceSessionRef.current === session) voiceSessionRef.current = null;
        if (mediaRecorderRef.current === session.recorder) mediaRecorderRef.current = null;
        try {
          if (session.cancelled || session.failed) return;
          const blob = new Blob(session.chunks, { type: session.recordedMime });
          if (blob.size < 100) return;
          const tkn = localStorage.getItem("flexamarket_token") ?? "";
          setUploading(true);
          try {
            // Normalize MIME params (e.g. audio/webm;codecs=opus → audio/webm).
            const uploadMime = session.recordedMime.split(";")[0].trim();
            const url = await uploadMedia(blob as unknown as File, uploadMime, tkn);
            doSend({ messageType: "audio", mediaUrl: url, content: "" });
          } catch {
            toast({ title: t("messages.voiceUploadFailed"), variant: "destructive" });
          } finally {
            setUploading(false);
          }
        } finally {
          session.chunks = [];
          voiceBusyRef.current = false;
          setVoiceFinalizing(false);
        }
      };
      session.finalize = finalizeSession;
      voiceSessionRef.current = session;
      mr.ondataavailable = e => { if (e.data.size > 0) session.chunks.push(e.data); };
      mr.onstop = () => { void session.finalize(); };
      mr.onerror = () => {
        session.failed = true;
        setVoiceFinalizing(true);
        stopRecordingMeter();
        session.stream.getTracks().forEach(t => t.stop());
        setIsRecording(false);
        stopRecordingTimer();
        toast({ title: t("messages.voiceUploadFailed"), variant: "destructive" });
        // Browsers normally dispatch stop after error; cover implementations
        // that transition directly to inactive without a stop callback.
        if (session.recorder.state === "inactive") {
          queueMicrotask(() => { void session.finalize(); });
        }
      };
      mr.start(100);
      mediaRecorderRef.current = mr;
      setIsRecording(true);
      setRecordingPaused(false);
      setRecordingSecs(0);
      startRecordingMeter(stream);
      recordingTimerRef.current = setInterval(() => setRecordingSecs(s => s + 1), 1000);
    } catch {
      stream?.getTracks().forEach(t => t.stop());
      voiceBusyRef.current = false;
      setVoiceFinalizing(false);
      stopRecordingMeter();
      toast({ title: t("messages.micDenied"), variant: "destructive" });
    }
  };

  const stopVoiceRecording = (cancel = false) => {
    stopRecordingTimer();
    setIsRecording(false);
    setRecordingPaused(false);
    setRecordingSecs(0);
    const session = voiceSessionRef.current;
    if (!session) return;
    session.cancelled = cancel;
    setVoiceFinalizing(true);
    stopRecordingMeter();
    if (session.recorder.state !== "inactive") {
      session.recorder.stop();
    } else {
      void session.finalize();
    }
  };

  const toggleRecordingPause = () => {
    const mr = mediaRecorderRef.current;
    if (!mr) return;
    if (mr.state === "recording") {
      mr.pause();
      stopRecordingTimer();
      setRecordingPaused(true);
    } else if (mr.state === "paused") {
      mr.resume();
      setRecordingPaused(false);
      recordingTimerRef.current = setInterval(() => setRecordingSecs(s => s + 1), 1000);
    }
  };

  const fmtRecSecs = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    const tkn = localStorage.getItem("flexamarket_token") ?? "";
    const isVideo = file.type.startsWith("video/");
    const isImage = file.type.startsWith("image/");
    if (!isImage && !isVideo) { alert(t("messages.onlyPhotosVideos")); return; }
    const limitMB = isVideo ? 50 : 10;
    if (file.size > limitMB * 1024 * 1024) { alert(t("messages.fileTooLarge", { size: limitMB })); return; }
    setUploading(true);
    try {
      const url = await uploadMedia(file, file.type, tkn);
      doSend({ messageType: isVideo ? "video" : "image", mediaUrl: url, content: "" });
    } catch { alert(t("messages.uploadFailed")); }
    finally { setUploading(false); }
  };

  useEffect(() => () => {
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    stopRecordingTimer();
    const session = voiceSessionRef.current;
    if (session) {
      session.cancelled = true;
      if (session.recorder.state !== "inactive") session.recorder.stop();
      else void session.finalize();
      session.stream.getTracks().forEach(track => track.stop());
    }
    stopRecordingMeter();
  }, [stopRecordingMeter]);

  const msgList: ChatMessage[] = Array.isArray(messages) ? (messages as ChatMessage[]) : [];
  // Find the last message sent by me (for status icon)
  let lastSentByMeId: number | null = null;
  for (let i = msgList.length - 1; i >= 0; i--) {
    if (msgList[i].senderId === user?.id) { lastSentByMeId = msgList[i].id; break; }
  }

  // Auto-translate all incoming text messages to match the user's app language
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (!user?.preferredLanguage || !msgList.length) return;
    const received = msgList.filter(m => m.senderId !== user.id && m.messageType === "text" && !!m.content?.trim());
    for (const m of received) {
      if (!autoTranslatedRef.current.has(m.id) && !translations.has(m.id)) {
        autoTranslatedRef.current.add(m.id);
        translateMessage(m.id);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [msgList.length, user?.preferredLanguage]);

  // Called by AudioBubble when the recipient first plays a voice note.
  const handleAudioListened = useCallback((msgId: number) => {
    const tkn = localStorage.getItem("flexamarket_token") ?? "";
    fetch(`/api/conversations/${convId}/messages/${msgId}/listened`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${tkn}` },
    }).catch(() => {});
    // Optimistic local update (socket event will confirm for sender)
    queryClient.setQueryData(getGetMessagesQueryKey(convId), (old: any) => {
      if (!Array.isArray(old)) return old;
      return old.map((m: any) => m.id === msgId ? { ...m, isListened: true } : m);
    });
  }, [convId, queryClient]);

  const handleDeleteMsg = useCallback((msgId: number) => {
    const tkn = localStorage.getItem("flexamarket_token") ?? "";
    fetch(`/api/conversations/${convId}/messages/${msgId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${tkn}` },
    }).catch(() => {});
    // Optimistic local update — socket event will sync to the other party
    queryClient.setQueryData(getGetMessagesQueryKey(convId), (old: any) => {
      if (!Array.isArray(old)) return old;
      return old.map((m: any) => m.id === msgId ? { ...m, isDeleted: true, content: "" } : m);
    });
  }, [convId, queryClient]);

  // ── iOS safe-area top inset (inline — more reliable than CSS class in WKWebView)
  // max(env(safe-area-inset-top), var(--sat)) can silently return 0 in some
  // WKWebView builds. Reading the JS-set CSS variable directly and applying it
  // as an inline numeric value is guaranteed to win over any CSS rule.
  const threadHeaderTopPad = (() => {
    if (typeof document === "undefined") return 8;
    // Priority 1: injected by the native React Native WebView before page load
    const native = (window as any).__flexaNativeSafeTop;
    if (typeof native === "number" && native > 0) return native + 8;
    // Priority 2: --sat set synchronously in index.html bootstrap
    const v = document.documentElement.style.getPropertyValue("--sat") ||
              getComputedStyle(document.documentElement).getPropertyValue("--sat");
    const sat = parseInt(v, 10);
    if (!isNaN(sat) && sat > 0) return sat + 8;
    // Priority 3: FlexaMarket WebView UA or standard iOS UA
    if (/FlexaMarket|iPhone|iPad|iPod/.test(navigator.userAgent)) {
      return (window.screen.height >= 812 ? 59 : 20) + 8;
    }
    return 8;
  })();

  return (
    <div className="chat-fullscreen" style={{ display: "flex", flexDirection: "column", minHeight: 0, background: c.pageBg }}>

      {/* ── Thread header — paddingTop applied inline so WKWebView can't ignore it */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        paddingTop: threadHeaderTopPad,
        paddingBottom: "8px", paddingLeft: "10px", paddingRight: "10px",
        borderBottom: `1px solid ${c.headerBorder}`,
        background: c.headerBg, flexShrink: 0, overflow: "hidden",
      }}>
        {/* Back button — always visible.
            Uses window.history.back() to pop the sentinel we pushed on mount.
            The popstate handler then calls setLocation("/messages"), which
            ensures we land on the list regardless of any extra WebView history
            entries that accumulated while the conversation was open. */}
        <button
          type="button"
          onClick={() => window.history.back()}
          onTouchEnd={e => { e.preventDefault(); window.history.back(); }}
          style={{
            width: 44, height: 44, borderRadius: "50%", background: "none",
            border: "none", display: "flex", alignItems: "center", justifyContent: "center",
            color: c.iconColor, cursor: "pointer", flexShrink: 0,
            touchAction: "manipulation", WebkitTapHighlightColor: "transparent",
            userSelect: "none",
          } as React.CSSProperties}
        >
          <ArrowLeft style={{ width: 22, height: 22 }} />
        </button>

      {conv && (<>

          {/* Avatar + online dot */}
          <Link href={`/profile/${conv.otherUserId}`} style={{ flexShrink: 0 }}>
            <div style={{ position: "relative", cursor: "pointer" }}>
              <Avatar className="h-10 w-10">
                <AvatarImage src={conv.otherUserAvatar ?? undefined} className="object-cover" />
                <AvatarFallback style={{ background: "#2563EB", color: "#fff", fontWeight: 700, fontSize: 15 }}>
                  {(conv.otherUserName ?? "?")[0]?.toUpperCase() ?? "?"}
                </AvatarFallback>
              </Avatar>
              {otherOnline && (
                <span style={{
                  position: "absolute", bottom: 0, right: 0,
                  width: 11, height: 11, borderRadius: "50%",
                  background: c.presenceOn, border: `2px solid ${c.headerBg}`,
                }} />
              )}
            </div>
          </Link>

          {/* Name + status */}
          <Link href={`/profile/${conv.otherUserId}`} style={{ flex: 1, minWidth: 0, textDecoration: "none" }}>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: c.nameColor, lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {conv.otherUserName}
            </p>
            <p style={{ margin: 0, fontSize: 12, lineHeight: 1.3, color: otherOnline ? c.presenceOn : c.presenceOff }}>
              {otherOnline
                ? t("messages.online")
                : otherLastSeen
                  ? formatLastSeen(otherLastSeen, t)
                  : ""}
            </p>
          </Link>

          {/* Actions — compact (30×30) so they fit on any screen width */}
          <div style={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0 }}>
            {/* Theme toggle */}
            <button
              type="button"
              onClick={onToggleTheme}
              title={isDarkMode ? t("messages.sunlightMode") : t("messages.nightMode")}
              style={{
                width: 30, height: 30, borderRadius: "50%",
                background: c.iconActiveBg, border: "none",
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", flexShrink: 0,
              }}
            >
              {isDarkMode
                ? <Sun style={{ width: 15, height: 15, color: "#FCD34D" }} />
                : <Moon style={{ width: 15, height: 15, color: "#818CF8" }} />}
            </button>

            {/* Video call */}
            <button type="button" style={{
              width: 30, height: 30, borderRadius: "50%", background: c.iconActiveBg,
              border: "none", display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", flexShrink: 0,
            }}>
              <Video style={{ width: 15, height: 15, color: c.iconColor }} />
            </button>

            {/* Profile */}
            <Link href={`/profile/${conv.otherUserId}`}>
              <button type="button" style={{
                width: 30, height: 30, borderRadius: "50%", background: c.iconActiveBg,
                border: "none", display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", flexShrink: 0,
              }}>
                <Phone style={{ width: 15, height: 15, color: c.iconColor }} />
              </button>
            </Link>

            {/* Admin block */}
            {(!!(user as any)?.isAdmin || !!(user as any)?.isSuperAdmin) && (
              <AdminBlockButton
                targetUserId={conv.otherUserId}
                targetUserName={conv.otherUserName}
                variant="icon"
              />
            )}
          </div>
        </>)}
      </div>

      {/* ── Listing context banner ── */}
      {conv && conv.listingTitle && (
        <Link href={conv.listingId ? `/listings/${conv.listingId}` : "#"}>
          <div style={{
            display: "flex", alignItems: "center", gap: 10, padding: "8px 14px",
            background: c.listItemActive, borderBottom: `1px solid ${c.headerBorder}`,
            cursor: "pointer", flexShrink: 0,
          }}>
            {conv.listingImage && (
              <img
                src={conv.listingImage} alt=""
                style={{ width: 38, height: 38, borderRadius: 8, objectFit: "cover", flexShrink: 0 }}
              />
            )}
            <div style={{ minWidth: 0, flex: 1 }}>
              <p style={{ margin: 0, fontSize: 11, color: c.listSub, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>
                {t("messages.listingLabel")}
              </p>
              <p style={{ margin: 0, fontSize: 13, color: c.nameColor, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {conv.listingTitle}
              </p>
            </div>
            <span style={{ fontSize: 11, color: c.listSub, flexShrink: 0 }}>{"→"}</span>
          </div>
        </Link>
      )}

      {/* ── Messages scroll area ── */}
      <div
        ref={msgContainerRef}
        style={{
          flex: 1, overflowY: "auto", overflowX: "hidden",
          backgroundImage: "url(/chat-bg.png)",
          backgroundSize: "cover",
          backgroundPosition: "center top",
          backgroundRepeat: "no-repeat",
          backgroundColor: "#f5e8c0",   /* warm gold fallback while image loads */
          position: "relative",
          // Explicitly tell iOS this container handles vertical pan — prevents
          // the browser from suspending scroll when a child captures pointerdown
          touchAction: "pan-y",
          overscrollBehavior: "contain",
        } as React.CSSProperties}
      >
        {isLoading && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
            <p style={{ color: c.listSub, fontSize: 14 }}>{t("messages.loading")}</p>
          </div>
        )}
        {!isLoading && msgList.length === 0 && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", textAlign: "center", padding: "0 32px" }}>
            <MessageCircle style={{ width: 40, height: 40, color: c.emptyIcon, marginBottom: 8 }} />
            <p style={{ fontSize: 14, color: c.emptyText, margin: 0 }}>
              {t("messages.startConversation", "Kòmanse konvèsasyon an")}
            </p>
          </div>
        )}

        {msgList.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", padding: "12px 14px 8px", maxWidth: 680, margin: "0 auto", boxSizing: "border-box", overflowX: "hidden" }}>
            <div style={{ flex: 1 }} />
            {msgList.map((msg, idx) => {
              const isMe = Number(msg.senderId) === Number(user?.id);
              const prev = msgList[idx - 1];
              const next = msgList[idx + 1];
              const isFirstInGroup = !prev || prev.senderId !== msg.senderId;
              const isLastInGroup = !next || next.senderId !== msg.senderId;
              const isLastSentByMe = msg.id === lastSentByMeId;

              return (
                <div key={msg.id} style={{ marginTop: idx === 0 ? 0 : isFirstInGroup ? 12 : 4 }}>
                  <MsgBubble
                    msg={msg} isMe={isMe}
                    isLastInGroup={isLastInGroup}
                    isLastSentByMe={isLastSentByMe}
                    onMediaTap={(url, type) => setMediaModal({ url, type })}
                    theme={theme}
                    onAudioListened={handleAudioListened}
                    onDeleteMsg={handleDeleteMsg}
                    translation={translations.get(msg.id) ?? null}
                    isTranslating={translatingIds.has(msg.id)}
                    onTranslate={() => translateMessage(msg.id)}
                  />
                </div>
              );
            })}

            {/* Typing indicator */}
            {typingOther && (
              <div style={{ display: "flex", justifyContent: "flex-start", marginTop: 10, paddingLeft: 4 }}>
                <div style={{ background: c.typingBg, borderRadius: "16px 16px 16px 4px", padding: "10px 16px" }}>
                  <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                    {[0, 150, 300].map(delay => (
                      <span key={delay} className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: c.typingDot, animationDelay: `${delay}ms`, display: "block", width: 7, height: 7, borderRadius: "50%" }} />
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* ── Emoji panel — slides up / down with animation ── */}
      <TikTokEmojiPanel
        visible={showEmojiPanel}
        onEmojiSelect={(emoji) => {
          setText(prev => insertEmojiAtCursor(chatInputRef.current, prev, emoji));
          setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 30);
        }}
      />

      {/* ── Input bar ──
          IMPORTANT: do NOT set paddingBottom here — the .chat-input-bar CSS
          class owns it so that env(safe-area-inset-bottom) is applied and
          the home indicator / Dynamic Island never blocks the buttons. */}
      <div className="chat-input-bar" style={{
        flexShrink: 0,
        position: "sticky", bottom: 0, zIndex: 10,
        background: c.inputWrapBg,
        borderTop: `1px solid ${c.headerBorder}`,
        paddingTop: "8px", paddingLeft: "10px", paddingRight: "10px",
        /* paddingBottom intentionally omitted — CSS class handles safe-area */
        maxWidth: "100vw", overflow: "hidden",
      }}>
        <input ref={fileInputRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleFileSelect} />
        <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileSelect} />

        {isRestricted ? (
          <div style={{ padding: "4px 0" }}><RestrictionBanner action="message" /></div>
        ) : isRecording ? (
          <div style={{
            width: "100%", boxSizing: "border-box",
            background: c.isDark ? c.inputBg : "#FFFFFF",
            border: `1px solid ${c.isDark ? c.listBorder : "#E5E7EB"}`,
            borderRadius: 28, padding: "13px 16px 12px",
            boxShadow: c.isDark ? "none" : "0 2px 10px rgba(15,23,42,0.06)",
          }}>
            {/* Live recording waveform */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
              <span style={{
                flexShrink: 0, width: 42,
                color: c.isDark ? "#F8FAFC" : "#111827",
                fontSize: 19, fontWeight: 500, fontVariantNumeric: "tabular-nums",
              }}>
                {fmtRecSecs(recordingSecs)}
              </span>
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                gap: 3, height: 46, flex: 1, minWidth: 0, overflow: "hidden",
              }}>
                {WAVE_BARS.map((height, i) => (
                  <span
                    key={i}
                    ref={el => { recordingBarRefs.current[i] = el; }}
                    style={{
                      width: 3, minWidth: 2, height: "4px",
                      borderRadius: 99, background: composerActionColor, opacity: recordingPaused ? 0.55 : 0.95,
                      transformOrigin: "center",
                      transition: "height 80ms linear, opacity 120ms ease",
                    }}
                  />
                ))}
              </div>
              <span style={{
                flexShrink: 0, borderRadius: 14, padding: "7px 10px",
                background: c.isDark ? "rgba(165,180,252,0.14)" : "#EEF3FF",
                color: composerActionColor, fontSize: 13, fontWeight: 700,
              }}>
                1x
              </span>
            </div>

            {/* Recording controls */}
            <div style={{
              display: "grid", gridTemplateColumns: "1fr auto 1fr",
              alignItems: "center", marginTop: 12,
            }}>
              <button
                type="button"
                onClick={() => stopVoiceRecording(true)}
                aria-label={t("messages.deleteRecording", "Efase recording la")}
                style={{
                  justifySelf: "start", width: 44, height: 44, borderRadius: "50%",
                  background: "none", border: "none", color: composerActionColor,
                  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <Trash2 style={{ width: 28, height: 28, strokeWidth: 1.8 }} />
              </button>

              <button
                type="button"
                onClick={toggleRecordingPause}
                aria-label={recordingPaused
                  ? t("messages.resumeRecording", "Kontinye recording la")
                  : t("messages.pauseRecording", "Mete recording la sou poz")}
                style={{
                  justifySelf: "center", width: 58, height: 58, borderRadius: "50%",
                  background: "none", border: `2px solid ${composerActionColor}`,
                  color: composerActionColor, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                {recordingPaused ? (
                  <Play style={{ width: 23, height: 23, fill: "currentColor", marginLeft: 3 }} />
                ) : (
                  <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <span style={{ width: 5, height: 22, borderRadius: 3, background: "currentColor" }} />
                    <span style={{ width: 5, height: 22, borderRadius: 3, background: "currentColor" }} />
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => stopVoiceRecording(false)}
                aria-label={t("messages.sendVoice", "Voye recording la")}
                style={{
                  justifySelf: "end", width: 58, height: 58, borderRadius: "50%",
                  background: composerActionColor, border: "none", color: "#FFFFFF",
                  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                  boxShadow: "0 3px 8px rgba(37,99,235,0.22)",
                }}
              >
                <Play style={{ width: 27, height: 27, fill: "currentColor", marginLeft: 3 }} />
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>

            {/* Add attachment — kept outside the text pill like the mobile reference */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              aria-label={t("messages.attach", "Ajoute foto oswa videyo")}
              style={{
                flexShrink: 0, width: 36, height: 44, borderRadius: "50%",
                background: "none", border: "none", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: composerActionColor, opacity: uploading ? 0.4 : 1,
              }}
            >
              <Plus style={{ width: 28, height: 28, strokeWidth: 1.8 }} />
            </button>

            {/* Text pill */}
            <div style={{ flex: "1 1 0%", minWidth: 0 }}>
              <Input
                ref={chatInputRef}
                value={text}
                onChange={e => { setText(e.target.value); handleTyping(); }}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendText(); } }}
                placeholder={uploading ? t("messages.uploading") : t("messages.typeMessage", "Ekri yon mesaj…")}
                disabled={uploading}
                className="chat-input w-full"
                style={{
                  fontSize: 16, height: 46,
                  background: c.isDark ? c.inputBg : "#FFFFFF",
                  border: `1px solid ${c.listBorder}`,
                  borderRadius: 28,
                  color: c.inputText,
                  paddingLeft: 18, paddingRight: 18,
                  outline: "none",
                  boxShadow: "none",
                }}
              />
            </div>

            {/* Sticker / emoji */}
            <button
              type="button"
              onClick={() => {
                const next = !showEmojiPanel;
                setShowEmojiPanel(next);
                if (next) {
                  chatInputRef.current?.blur();
                  setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 60);
                } else {
                  chatInputRef.current?.focus();
                }
              }}
              style={{
                flexShrink: 0, width: 38, height: 44, borderRadius: "50%",
                background: showEmojiPanel ? "rgba(37,99,235,0.10)" : "none",
                border: showEmojiPanel ? "1.5px solid rgba(37,99,235,0.35)" : "none",
                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                color: composerActionColor, transition: "background 0.15s, border 0.15s",
              }}
              aria-label={t("messages.sticker", "Sticker ak emoji")}
            >
              <MessageCircle style={{ width: 23, height: 23, strokeWidth: 1.8 }} />
            </button>

            {/* Camera — opens the native camera picker on supported phones */}
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              disabled={uploading}
              aria-label={t("messages.camera", "Pran yon foto")}
              style={{
                flexShrink: 0, width: 38, height: 44, borderRadius: "50%",
                background: "none", border: "none", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: composerActionColor, opacity: uploading ? 0.4 : 1,
              }}
            >
              <Camera style={{ width: 24, height: 24, strokeWidth: 1.8 }} />
            </button>

            {/* Send / Mic */}
            {text.trim() ? (
              <button
                type="button"
                onClick={sendText}
                disabled={uploading}
                style={{
                  flexShrink: 0, width: 46, height: 46, borderRadius: "50%",
                  background: c.sendBg, border: "none", cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#fff", opacity: uploading ? 0.3 : 1,
                }}
              >
                <Send style={{ width: 19, height: 19 }} />
              </button>
            ) : (
              <button
                type="button"
                onClick={startVoiceRecording}
                disabled={uploading || voiceFinalizing}
                style={{
                  flexShrink: 0, width: 46, height: 46, borderRadius: "50%",
                  background: c.sendBg, border: "none", cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#fff", opacity: uploading || voiceFinalizing ? 0.4 : 1,
                }}
                aria-label={t("messages.recordVoice")}
              >
                <Mic style={{ width: 20, height: 20 }} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Media modal */}
      {mediaModal && (
        <MediaModal url={mediaModal.url} type={mediaModal.type} onClose={() => setMediaModal(null)} />
      )}
    </div>
  );
}

// ─── Messages Page ────────────────────────────────────────────────────────────
export default function Messages() {
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { t } = useTranslation();
  const [, params] = useRoute("/messages/:id");
  const convId = params?.id ? parseInt(params.id, 10) : null;
  const queryClient = useQueryClient();
  const socket = useSocket();

  // Theme state — persisted to localStorage
  const [chatTheme, setChatTheme] = useState<ChatTheme>(() => {
    return (localStorage.getItem(THEME_KEY) as ChatTheme) ?? "sunlight";
  });
  const theme = T[chatTheme];

  const toggleTheme = useCallback(() => {
    setChatTheme(prev => {
      const next: ChatTheme = prev === "sunlight" ? "night" : "sunlight";
      localStorage.setItem(THEME_KEY, next);
      return next;
    });
  }, []);

  const { data: convs } = useGetConversations({
    query: {
      enabled: !!user,
      queryKey: getGetConversationsQueryKey(),
      refetchInterval: 5000,
      refetchIntervalInBackground: true,
      refetchOnMount: true,
      refetchOnWindowFocus: true,
    },
  });

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        queryClient.invalidateQueries({ queryKey: getGetConversationsQueryKey() });
        if (convId) queryClient.invalidateQueries({ queryKey: getGetMessagesQueryKey(convId) });
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [queryClient, convId]);

  useEffect(() => { if (!authLoading && !user) setLocation("/auth/login"); }, [authLoading, user]);

  const c = theme;

  return (
    <div style={{ display: "flex", height: "100%", background: c.pageBg }} className="md:max-w-5xl md:mx-auto md:border-x md:border-border">

      {/* Conversation list */}
      <div
        style={{
          borderRight: `1px solid ${c.listBorder}`,
          flexDirection: "column", minHeight: 0, background: c.listBg,
        }}
        className={`w-full md:w-80 ${convId ? "hidden md:flex" : "flex"}`}
      >
        {/* List header */}
        <div style={{
          padding: "10px 12px 10px",
          borderBottom: `1px solid ${c.listBorder}`,
          background: c.headerBg, flexShrink: 0,
          display: "flex", alignItems: "center", gap: 6,
        }}>
          {/* Back button → home */}
          <button
            type="button"
            onClick={() => window.location.href = "/"}
            onTouchEnd={e => { e.preventDefault(); window.location.href = "/"; }}
            style={{
              width: 44, height: 44, borderRadius: "50%", background: "none",
              border: "none", display: "flex", alignItems: "center", justifyContent: "center",
              color: c.iconColor, cursor: "pointer", flexShrink: 0,
              touchAction: "manipulation", WebkitTapHighlightColor: "transparent",
              userSelect: "none",
            } as React.CSSProperties}
          >
            <ArrowLeft style={{ width: 20, height: 20 }} />
          </button>
          <h1 style={{ fontWeight: 700, color: c.nameColor, fontSize: 18, margin: 0, flex: 1 }}>
            {t("messages.title")}
          </h1>
          {/* Theme toggle */}
          <button
            type="button"
            onClick={toggleTheme}
            style={{
              width: 34, height: 34, borderRadius: "50%",
              background: c.iconActiveBg, border: "none",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", flexShrink: 0,
            }}
          >
            {chatTheme === "night"
              ? <Sun style={{ width: 16, height: 16, color: "#FCD34D" }} />
              : <Moon style={{ width: 16, height: 16, color: "#818CF8" }} />}
          </button>
        </div>
        <ConvList convs={(convs as Conversation[]) ?? []} activeId={convId ?? undefined} theme={theme} />
      </div>

      {/* Thread pane */}
      <div
        style={{ flex: 1, flexDirection: "column", minHeight: 0 }}
        className={convId ? "flex" : "hidden md:flex"}
      >
        {convId ? (
          <ThreadBoundary convId={convId} pageBg={theme.pageBg}>
            <MessageThread convId={convId} theme={theme} onToggleTheme={toggleTheme} />
          </ThreadBoundary>
        ) : (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", height: "100%", textAlign: "center",
            padding: "0 32px", background: c.pageBg,
          }}>
            <MessageCircle style={{ width: 64, height: 64, color: c.emptyIcon, marginBottom: 16 }} />
            <p style={{ fontSize: 18, fontWeight: 700, color: c.nameColor, margin: 0 }}>
              {t("messages.selectConversation")}
            </p>
            <p style={{ fontSize: 14, color: c.emptyText, marginTop: 6 }}>
              {t("messages.chooseConversation")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
