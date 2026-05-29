import { useCallback, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/auth";

// One view per listing per 30 minutes (client-side gate — server also deduplicates).
const COOLDOWN_MS = 30 * 60 * 1000;

/**
 * Low-level hook: returns a `track` function that calls
 * POST /api/listings/:id/view once per cooldown window.
 * Safe to call multiple times — subsequent calls within the window are no-ops.
 */
export function useViewTracker(
  listingId: number,
  { onCounted }: { onCounted?: (viewCount: number) => void } = {},
) {
  const { user, token } = useAuth();
  const trackedRef = useRef(false);

  const track = useCallback(async () => {
    if (trackedRef.current || !listingId) return;

    // Client-side cooldown gate (sessionStorage survives soft navigations)
    const key = `flexa_view_${listingId}`;
    const last = sessionStorage.getItem(key);
    if (last && Date.now() - parseInt(last, 10) < COOLDOWN_MS) return;

    trackedRef.current = true;
    sessionStorage.setItem(key, String(Date.now()));

    try {
      const res = await fetch(`/api/listings/${listingId}/view`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ country: (user as any)?.country ?? null }),
      });
      if (res.ok) {
        const data = await res.json();
        if (typeof data.viewCount === "number") onCounted?.(data.viewCount);
      }
    } catch {
      // Fire-and-forget — never surface tracking errors to the user
    }
  }, [listingId, user, token, onCounted]);

  return track;
}

/**
 * Returns a `containerRef` to attach to a DOM element.
 * Once that element has been visible on screen for `delayMs` (default 2 500 ms),
 * a deduplicated view is counted via POST /api/listings/:id/view.
 *
 * Designed for:
 *  – VideoPost page (attach to the video container)
 *  – ListingDetail page (attach to the top of the content card)
 */
export function useIntersectionViewTracker(
  listingId: number,
  {
    onCounted,
    delayMs = 2500,
    threshold = 0.4,
  }: {
    onCounted?: (viewCount: number) => void;
    delayMs?: number;
    threshold?: number;
  } = {},
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const track = useViewTracker(listingId, { onCounted });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !listingId) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          // Start the dwell timer — cancel it if the element leaves before it fires
          if (!timerRef.current) {
            timerRef.current = setTimeout(() => {
              timerRef.current = null;
              track();
            }, delayMs);
          }
        } else {
          if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
          }
        }
      },
      { threshold },
    );

    observer.observe(el);

    return () => {
      observer.disconnect();
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [listingId, track, delayMs, threshold]);

  return containerRef;
}

/** Format a raw view count into a compact string: 1200 → "1.2K", 1000000 → "1M" */
export function formatViewCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(n);
}
