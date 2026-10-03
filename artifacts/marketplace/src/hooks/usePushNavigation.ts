import { useCallback, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { isAndroidApp } from "@/lib/androidPurchasePolicy";
import {
  conversationIdFromPath, normalizePushPath, OPEN_PUSH_CONVERSATION,
  PENDING_PUSH_KEY, readPendingPush,
} from "@/lib/pushNavigation";

type PushWindow = Window & {
  __handlePushUrl?: (url: unknown) => boolean;
  __pendingPushUrl?: unknown;
};

/** One pending intent survives authentication and a page reload, not just boot. */
export function usePushNavigation(user: { profileCompleted?: boolean } | null | undefined, authLoading: boolean) {
  const [, navigate] = useLocation();
  const base = import.meta.env.BASE_URL;
  const [pending, setPending] = useState<string | null>(() => {
    const w = window as PushWindow;
    const native = normalizePushPath(w.__pendingPushUrl, location.origin, base);
    const current = normalizePushPath(location.href, location.origin, base);
    const directConversation = current && conversationIdFromPath(current) ? current : null;
    try {
      return native ?? directConversation ?? readPendingPush(sessionStorage, location.origin, base);
    } catch { return native ?? directConversation; }
  });

  const accept = useCallback((value: unknown) => {
    const path = normalizePushPath(value, location.origin, base);
    if (!path) return false;
    try {
      sessionStorage.setItem(PENDING_PUSH_KEY, JSON.stringify({ path, time: Date.now() }));
    } catch { /* In-memory navigation still works if storage is unavailable. */ }
    delete (window as PushWindow).__pendingPushUrl;
    setPending(path);
    return true;
  }, [base]);

  useEffect(() => {
    const w = window as PushWindow;
    w.__handlePushUrl = accept;
    if (w.__pendingPushUrl !== undefined) accept(w.__pendingPushUrl);
    const receive = (event: MessageEvent) => {
      if (event.data?.type !== "FLEXA_OPEN_PUSH_URL") return;
      if (accept(event.data.url)) event.ports[0]?.postMessage({ accepted: true });
    };
    navigator.serviceWorker?.addEventListener("message", receive);
    return () => {
      if (w.__handlePushUrl === accept) delete w.__handlePushUrl;
      navigator.serviceWorker?.removeEventListener("message", receive);
    };
  }, [accept]);

  useEffect(() => {
    if (!pending || authLoading) return;
    if (!user) {
      try {
        sessionStorage.setItem(PENDING_PUSH_KEY, JSON.stringify({ path: pending, time: Date.now() }));
      } catch { /* preserve the in-memory intent */ }
      const browserTarget = `${base.replace(/\/$/, "")}${pending}`;
      navigate(`/auth/login?next=${encodeURIComponent(browserTarget)}`, { replace: true });
      return;
    }
    // Profile completion has its own redirect. Resume only after it finishes.
    if (user.profileCompleted === false) return;
    const id = conversationIdFromPath(pending);
    const detail = { conversationId: id, handled: false };
    if (id && isAndroidApp()) {
      window.dispatchEvent(new CustomEvent(OPEN_PUSH_CONVERSATION, { detail }));
    }
    if (!detail.handled) navigate(pending);
    try {
      const saved = JSON.parse(sessionStorage.getItem(PENDING_PUSH_KEY) || "null");
      if (saved?.path === pending) sessionStorage.removeItem(PENDING_PUSH_KEY);
    } catch { /* non-critical */ }
    setPending(current => current === pending ? null : current);
  }, [pending, authLoading, user, navigate, base]);
}