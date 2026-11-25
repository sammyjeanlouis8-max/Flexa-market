/**
 * Fallback destination for general / unknown notifications.
 * Shows the stored message and a CTA to the best related entity when present.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useLocation } from "wouter";
import { Bell, ArrowLeft, ExternalLink } from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  formatNotificationMessage,
  getNotificationHref,
  type NotificationNavInput,
} from "@/lib/notificationNavigation";
import { publicDisplayName } from "@/lib/publicDisplayName";

type Row = NotificationNavInput & {
  isRead: boolean;
  createdAt: string;
  actorAvatar: string | null;
  listingTitle: string | null;
  listingImage: string | null;
};

export default function NotificationDetail() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { token, user } = useAuth();
  const { t } = useTranslation();
  const [row, setRow] = useState<Row | null>(null);
  const [missing, setMissing] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token || !user) {
      setLoading(false);
      setMissing(true);
      return;
    }
    const notifId = Number(id);
    if (!Number.isFinite(notifId) || notifId <= 0) {
      setMissing(true);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/notifications/${notifId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (cancelled) return;
        if (res.status === 404) {
          setMissing(true);
          setRow(null);
          return;
        }
        if (!res.ok) {
          setMissing(true);
          return;
        }
        const data = (await res.json()) as Row;
        setRow(data);
        if (!data.isRead) {
          void fetch(`/api/notifications/${notifId}/read`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
          });
        }
      } catch {
        if (!cancelled) setMissing(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, token, user]);

  const body = useMemo(
    () => (row ? formatNotificationMessage(row, t) : ""),
    [row, t],
  );

  const deepHref = useMemo(() => {
    if (!row) return null;
    const href = getNotificationHref(row);
    // Avoid looping back to this same details page.
    if (href === `/notifications/${row.id}`) return null;
    return href;
  }, [row]);

  if (loading) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10 text-center text-sm text-muted-foreground">
        {t("profile.loading")}
      </div>
    );
  }

  if (missing || !row) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10 text-center space-y-4">
        <Bell className="mx-auto h-10 w-10 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          {t("notifications.notFound", {
            defaultValue: "This notification is no longer available.",
          })}
        </p>
        <Button variant="outline" onClick={() => navigate("/")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          {t("common.back", { defaultValue: "Back" })}
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-6 space-y-5">
      <button
        type="button"
        onClick={() => (window.history.length > 1 ? window.history.back() : navigate("/"))}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("common.back", { defaultValue: "Back" })}
      </button>

      <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold">
            {publicDisplayName(row.actorName, "U").charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground leading-snug">{body}</p>
            {row.listingTitle && (
              <p className="mt-1 text-xs text-muted-foreground truncate">{row.listingTitle}</p>
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              {new Date(row.createdAt).toLocaleString()}
            </p>
          </div>
          {row.listingImage && (
            <img
              src={row.listingImage}
              alt=""
              className="h-14 w-14 rounded-lg object-cover"
            />
          )}
        </div>

        {deepHref ? (
          <Button asChild className="w-full">
            <Link href={deepHref}>
              <ExternalLink className="mr-2 h-4 w-4" />
              {t("notifications.openRelated", { defaultValue: "Open related page" })}
            </Link>
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground text-center">
            {t("notifications.noDestination", {
              defaultValue: "No further destination for this notification.",
            })}
          </p>
        )}
      </div>
    </div>
  );
}
