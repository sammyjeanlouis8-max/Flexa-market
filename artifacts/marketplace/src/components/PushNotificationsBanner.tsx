import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import {
  isPushSupported,
  getNotificationPermission,
  enablePush,
  isPromptDismissed,
  dismissPrompt,
  getCurrentSubscription,
} from "../lib/push";

/**
 * Lightweight one-time prompt encouraging the user to enable browser
 * push notifications. Shown only when:
 *   - the user is logged in,
 *   - the browser supports push,
 *   - permission is still in the "default" state (not granted, not
 *     denied),
 *   - the user hasn't previously dismissed the prompt,
 *   - and there isn't already a registered subscription.
 *
 * Once dismissed it stays hidden via localStorage; the user can still
 * enable push from the profile page.
 */
export default function PushNotificationsBanner({ isLoggedIn }: { isLoggedIn: boolean }) {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoggedIn) { setShow(false); return; }
    if (!isPushSupported()) { setShow(false); return; }
    if (isPromptDismissed()) { setShow(false); return; }
    const perm = getNotificationPermission();
    if (perm !== "default") { setShow(false); return; }
    // Check whether a subscription already exists (e.g. on another tab).
    let cancelled = false;
    (async () => {
      const existing = await getCurrentSubscription();
      if (cancelled) return;
      setShow(!existing);
    })();
    return () => { cancelled = true; };
  }, [isLoggedIn]);

  if (!show) return null;

  const onEnable = async () => {
    setBusy(true);
    setError(null);
    const r = await enablePush();
    setBusy(false);
    if (r.ok) {
      setShow(false);
    } else {
      setError(r.reason);
      // If the user denied permission, stop nagging.
      if (getNotificationPermission() === "denied") {
        dismissPrompt();
        setShow(false);
      }
    }
  };

  const onDismiss = () => {
    dismissPrompt();
    setShow(false);
  };

  return (
    <div
      className="border-b border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900"
      data-testid="push-notifications-banner"
    >
      <div className="mx-auto flex max-w-6xl items-start gap-3">
        <Bell className="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-600" />
        <div className="flex-1">
          <p className="font-medium">Aktive notifikasyon sou navigatè a</p>
          <p className="text-xs text-blue-800/80">
            Resevwa yon alèt imedyatman lè ou jwenn yon mesaj, yon òf, oswa yon mizajou kòmand — menm lè onglè a fèmen.
          </p>
          {error && <p className="mt-1 text-xs text-red-700" data-testid="push-error">{error}</p>}
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onEnable}
            disabled={busy}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            data-testid="button-enable-push"
          >
            {busy ? "Ap aktive..." : "Aktive"}
          </button>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Fèmen"
            className="rounded-md p-1 text-blue-700 hover:bg-blue-100"
            data-testid="button-dismiss-push"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
