import { useEffect, useState } from "react";
import { useLocation, Link } from "wouter";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { ChevronLeft, BellRing, Mail, MessageSquare } from "lucide-react";
import {
  isPushSupported,
  getCurrentSubscription,
  enablePush,
  disablePush,
} from "@/lib/push";

/**
 * Notification preferences page. Three independent channels:
 *   1. Browser push — re-uses the existing service-worker push pipeline,
 *      so the toggle does the actual subscribe/unsubscribe round-trip
 *      with the API. Tracks both the OS permission and the live
 *      PushSubscription so the switch reflects reality.
 *   2. Email — server-side flag stored on users.notify_email.
 *   3. SMS   — server-side flag stored on users.notify_sms.
 *
 * Email/SMS hookups are read on every fetch from /api/users/me/preferences
 * so the UI stays in sync with what the backend actually has.
 */
export default function SettingsNotifications() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [, setLocation] = useLocation();

  const [pushOn, setPushOn] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [emailOn, setEmailOn] = useState(true);
  const [smsOn, setSmsOn] = useState(true);
  const [loaded, setLoaded] = useState(false);

  // Bootstrap state from local push subscription + server preferences.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const tk = localStorage.getItem("flexamarket_token");
      const [sub, prefsRes] = await Promise.all([
        getCurrentSubscription().catch(() => null),
        fetch("/api/users/me/preferences", {
          headers: { Authorization: `Bearer ${tk ?? ""}` },
        }).catch(() => null),
      ]);
      if (cancelled) return;
      const granted =
        typeof Notification !== "undefined" && Notification.permission === "granted";
      setPushOn(!!sub && granted);
      if (prefsRes && prefsRes.ok) {
        const data = await prefsRes.json();
        setEmailOn(!!data.notifyEmail);
        setSmsOn(!!data.notifySms);
      }
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [user]);

  if (!user) {
    return (
      <div className="max-w-md mx-auto p-6 text-center">
        <p className="text-muted-foreground mb-4">{t("settings.loginRequired")}</p>
        <Link href="/auth/login"><Button>{t("auth.signIn")}</Button></Link>
      </div>
    );
  }

  const updateServerPref = async (
    field: "notifyPush" | "notifyEmail" | "notifySms",
    value: boolean,
  ): Promise<boolean> => {
    try {
      const res = await fetch("/api/users/me/preferences", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("flexamarket_token") ?? ""}`,
        },
        body: JSON.stringify({ [field]: value }),
      });
      return res.ok;
    } catch {
      return false;
    }
  };

  const setEmailPref = async (value: boolean) => {
    setEmailOn(value);
    const ok = await updateServerPref("notifyEmail", value);
    if (ok) toast({ title: t("settings.preferenceSaved") });
    else { setEmailOn(!value); toast({ title: t("settings.requestFailed"), variant: "destructive" }); }
  };

  const setSmsPref = async (value: boolean) => {
    setSmsOn(value);
    const ok = await updateServerPref("notifySms", value);
    if (ok) toast({ title: t("settings.preferenceSaved") });
    else { setSmsOn(!value); toast({ title: t("settings.requestFailed"), variant: "destructive" }); }
  };

  const togglePush = async (next: boolean) => {
    if (!isPushSupported()) {
      toast({ title: t("settings.pushUnsupported"), variant: "destructive" });
      return;
    }
    setPushBusy(true);
    try {
      if (next) {
        const result = await enablePush();
        if (!result.ok) {
          toast({ title: result.reason || t("settings.pushDeniedHint"), variant: "destructive" });
          return;
        }
        // Persist the server-side preference BEFORE flipping UI to "on" — if
        // the API call fails we keep the toggle in its previous state so the
        // user does not see a misleading success state. The browser-level
        // subscription stays active even if the pref flag fails to save; we
        // tear it down to keep client and server in sync.
        const ok = await updateServerPref("notifyPush", true);
        if (!ok) {
          await disablePush().catch(() => {});
          toast({ title: t("settings.requestFailed"), variant: "destructive" });
          return;
        }
        setPushOn(true);
        toast({ title: t("settings.pushEnabled") });
      } else {
        await disablePush();
        const ok = await updateServerPref("notifyPush", false);
        if (!ok) {
          toast({ title: t("settings.requestFailed"), variant: "destructive" });
          return;
        }
        setPushOn(false);
        toast({ title: t("settings.pushDisabled") });
      }
    } catch {
      toast({ title: t("settings.requestFailed"), variant: "destructive" });
    } finally {
      setPushBusy(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-4 pb-24">
      <button
        onClick={() => setLocation("/settings")}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        data-testid="button-back-settings"
      >
        <ChevronLeft className="h-4 w-4" /> {t("settings.backToSettings")}
      </button>

      <h1 className="text-2xl font-bold">{t("settings.notifications")}</h1>
      <p className="text-sm text-muted-foreground">{t("settings.notificationsIntro")}</p>

      <Card className="divide-y divide-border">
        <ToggleRow
          icon={BellRing}
          label={t("settings.browserPush")}
          sub={t("settings.browserPushSub")}
          checked={pushOn}
          disabled={pushBusy || !loaded}
          onCheckedChange={togglePush}
          testid="toggle-push"
        />
        <ToggleRow
          icon={Mail}
          label={t("settings.emailNotifications")}
          sub={t("settings.emailNotificationsSub")}
          checked={emailOn}
          disabled={!loaded}
          onCheckedChange={setEmailPref}
          testid="toggle-email"
        />
        <ToggleRow
          icon={MessageSquare}
          label={t("settings.smsNotifications")}
          sub={t("settings.smsNotificationsSub")}
          checked={smsOn}
          disabled={!loaded}
          onCheckedChange={setSmsPref}
          testid="toggle-sms"
        />
      </Card>
    </div>
  );
}

function ToggleRow({
  icon: Icon,
  label,
  sub,
  checked,
  disabled,
  onCheckedChange,
  testid,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  sub: string;
  checked: boolean;
  disabled: boolean;
  onCheckedChange: (v: boolean) => void;
  testid?: string;
}) {
  return (
    <div className="flex items-start gap-3 p-4">
      <div className="bg-primary/10 text-primary rounded-lg p-2 flex-shrink-0">
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm">{label}</p>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </div>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} data-testid={testid} />
    </div>
  );
}
