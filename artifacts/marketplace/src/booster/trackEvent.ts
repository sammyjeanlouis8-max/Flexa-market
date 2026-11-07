/** Fire-and-forget Booster Pro ad event with client idempotency. */

export type BoosterEventType =
  | "impression"
  | "video_start"
  | "video_complete"
  | "ten_sec_view"
  | "skip"
  | "click"
  | "message";

export async function trackBoosterEvent(opts: {
  listingId: number;
  boostId?: number | null;
  eventType: BoosterEventType;
  placement?: string;
  token?: string | null;
  country?: string | null;
  state?: string | null;
  city?: string | null;
}): Promise<void> {
  const idempotencyKey = [
    opts.eventType,
    opts.listingId,
    opts.boostId ?? "x",
    opts.placement ?? "overlay",
    // One event per browser session per listing+type for skip/impression dedupe windows
    sessionStorageKey(opts.eventType, opts.listingId),
  ].join(":");

  try {
    await fetch("/api/booster/events/track", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      },
      body: JSON.stringify({
        listingId: opts.listingId,
        boostId: opts.boostId ?? undefined,
        eventType: opts.eventType,
        placement: opts.placement ?? "overlay",
        idempotencyKey,
        country: opts.country ?? undefined,
        state: opts.state ?? undefined,
        city: opts.city ?? undefined,
      }),
      keepalive: true,
    });
  } catch {
    /* non-blocking analytics */
  }
}

function sessionStorageKey(eventType: string, listingId: number): string {
  const key = `bp_evt_${eventType}_${listingId}`;
  try {
    let v = sessionStorage.getItem(key);
    if (!v) {
      v = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      sessionStorage.setItem(key, v);
    }
    return v;
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}
