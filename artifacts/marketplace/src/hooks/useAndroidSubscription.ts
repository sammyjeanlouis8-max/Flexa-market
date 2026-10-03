import { useCallback, useEffect, useRef, useState } from "react";
import { isAndroidApp } from "@/lib/androidPurchasePolicy";
import { createAndroidIapController } from "@/lib/androidIapController";
import { canPurchaseApplePlan, emptyAppleIapState } from "@/lib/appleIapController";

export function useAndroidSubscription(userId: number | null, token: string | null, onConfirmed: () => void) {
  const android = isAndroidApp();
  const [state, setState] = useState(() => emptyAppleIapState(null));
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const controllerRef = useRef<ReturnType<typeof createAndroidIapController> | null>(null);
  const confirmedRef = useRef(onConfirmed);
  confirmedRef.current = onConfirmed;
  const expectedPlan = useRef<string | null>(null);
  const post = useCallback((payload: Record<string, unknown>) => {
    (window as any).ReactNativeWebView?.postMessage(JSON.stringify(payload));
  }, []);

  useEffect(() => {
    if (!android) return;
    let alive = true;
    let pollTimer: ReturnType<typeof setTimeout> | undefined;
    let purchaseTimer: ReturnType<typeof setTimeout> | undefined;
    const abort = new AbortController();
    setBusy(false); setPending(false); setMessage(""); setEnabled(false);
    expectedPlan.current = null;
    fetch("/api/subscription/android/status", { signal: abort.signal })
      .then(r => r.ok ? r.json() : Promise.reject(new Error("unavailable")))
      .then(d => { if (alive) setEnabled(d.enabled === true); })
      .catch(() => {});
    const controller = createAndroidIapController({
      target: window, userId, token, post, onState: value => { if (alive) setState(value); },
    });
    controllerRef.current = controller;
    const poll = async (attempt: number) => {
      if (!alive) return;
      try {
        const r = await fetch("/api/subscription/android/purchase-status", {
          headers: { Authorization: `Bearer ${token}` }, signal: abort.signal,
        });
        const d = r.ok ? await r.json() : null;
        if (alive && d?.active && (!expectedPlan.current || d.plan === expectedPlan.current)) {
          setBusy(false); setPending(false);
          setMessage("subscription.android.confirmed");
          confirmedRef.current();
          return;
        }
      } catch { /* Keep pending; a failed request is not a failed payment. */ }
      if (!alive) return;
      if (attempt < 30) pollTimer = setTimeout(() => void poll(attempt + 1), 2000);
      else {
        setBusy(false);
        setMessage("subscription.android.pending");
      }
    };
    const result: EventListener = event => {
      const d = (event as CustomEvent).detail;
      if (!d || Number(d.userId) !== userId) return;
      clearTimeout(purchaseTimer);
      if (d.ok === true) {
        setPending(true); setMessage("subscription.android.verifying");
        void poll(0);
      } else {
        setBusy(false);
        if (d.cancelled) setMessage("");
        else {
          // A store/network error can arrive after a charge. Verify first,
          // rather than encouraging another purchase.
          setPending(true); setMessage("subscription.android.pending");
          void poll(0);
        }
      }
    };
    const begin: EventListener = () => {
      // A native store dialog may remain open for a while. Never assume success.
      purchaseTimer = setTimeout(() => {
        if (!alive) return;
        setBusy(false); setPending(true); setMessage("subscription.android.pending");
      }, 180_000);
    };
    window.addEventListener("IAP_PURCHASE_RESULT", result);
    window.addEventListener("IAP_RESTORE_RESULT", result);
    window.addEventListener("flexa-android-purchase-start", begin);
    return () => {
      alive = false; abort.abort(); clearTimeout(pollTimer); clearTimeout(purchaseTimer);
      controller.cleanup(); controllerRef.current = null;
      window.removeEventListener("IAP_PURCHASE_RESULT", result);
      window.removeEventListener("IAP_RESTORE_RESULT", result);
      window.removeEventListener("flexa-android-purchase-start", begin);
    };
  }, [android, userId, token, post]);

  const canBuy = (plan: string) => enabled && !busy && !pending && canPurchaseApplePlan(state, userId, plan);
  return {
    android, state, enabled, busy, pending, message,
    products: state.userId === userId ? state.products : {},
    canBuy,
    buy(plan: string) {
      if (!canBuy(plan)) return;
      expectedPlan.current = plan; setBusy(true); setMessage("");
      window.dispatchEvent(new Event("flexa-android-purchase-start"));
      post({ type: "IAP_PURCHASE", plan, userId });
    },
    restore() {
      if (busy || !enabled || !state.identified || state.userId !== userId) return;
      expectedPlan.current = null; setBusy(true); setMessage("");
      window.dispatchEvent(new Event("flexa-android-purchase-start"));
      post({ type: "IAP_RESTORE", userId });
    },
    manage() { if (state.identified && state.userId === userId) post({ type: "IAP_MANAGE" }); },
    retry() { controllerRef.current?.retry(); },
  };
}