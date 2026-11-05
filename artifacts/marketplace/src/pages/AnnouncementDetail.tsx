import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/auth";
import {
  ArrowLeft, Megaphone, Calendar, Share2, MoreVertical, CheckCircle2, Loader2, ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface Announcement {
  id: number;
  title: string;
  preview: string;
  bodyHtml: string;
  bannerUrl: string | null;
  category: string;
  highlightTitle: string | null;
  highlightItems: string[];
  actionLabel: string | null;
  actionUrl: string | null;
  publishedAt: string | null;
}

function formatPublishedAt(iso: string | null, locale: string): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat(locale, {
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(d);
  } catch {
    return iso;
  }
}

export default function AnnouncementDetail() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { token } = useAuth();
  const { t, i18n } = useTranslation();
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!token || !id) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetch(`/api/communications/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || t("communications.loadError"));
        setAnnouncement(data);
      })
      .catch((err) => {
        if (err.name !== "AbortError") setError(err.message || t("communications.loadError"));
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [id, token, t]);

  const share = async () => {
    if (!announcement) return;
    const url = `${window.location.origin}/communications/${announcement.id}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: announcement.title, text: announcement.preview, url });
      } else {
        await navigator.clipboard.writeText(url);
      }
    } catch { /* user cancelled */ }
  };

  return (
    <div className="min-h-dvh bg-background flex flex-col">
      <header
        className="sticky top-0 z-20 bg-[hsl(152,65%,18%)] text-white border-b border-[hsl(152,65%,14%)]"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        <div className="h-12 px-2 flex items-center gap-1 max-w-2xl mx-auto">
          <button
            type="button"
            onClick={() => window.history.length > 1 ? window.history.back() : navigate("/")}
            className="h-11 w-11 flex items-center justify-center rounded-full hover:bg-white/10"
            aria-label={t("common.back", { defaultValue: "Back" })}
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="flex-1 text-center font-semibold text-[15px] tracking-wide">
            {t("communications.pageTitle")}
          </h1>
          <button
            type="button"
            onClick={share}
            className="h-11 w-11 flex items-center justify-center rounded-full hover:bg-white/10"
            aria-label={t("communications.share")}
          >
            <Share2 className="h-5 w-5" />
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="h-11 w-11 flex items-center justify-center rounded-full hover:bg-white/10"
              aria-label={t("communications.more")}
              aria-expanded={menuOpen}
            >
              <MoreVertical className="h-5 w-5" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 mt-1 w-48 rounded-xl bg-card text-foreground border border-border shadow-lg py-1 z-30">
                <button
                  type="button"
                  className="w-full text-left px-3 py-2.5 text-sm hover:bg-accent"
                  onClick={() => { setMenuOpen(false); navigate("/communications"); }}
                >
                  {t("communications.viewHistory")}
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-5 pb-24">
        {loading && (
          <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">{t("profile.loading")}</span>
          </div>
        )}

        {!loading && error && (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5 text-center space-y-3">
            <p className="text-sm text-destructive font-medium">{error}</p>
            <Button variant="outline" onClick={() => navigate("/")}>{t("communications.backHome")}</Button>
          </div>
        )}

        {!loading && announcement && (
          <article className="space-y-4">
            <div className="inline-flex items-center gap-2">
              <span className="h-8 w-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 flex items-center justify-center">
                <Megaphone className="h-4 w-4" aria-hidden />
              </span>
              <span className="inline-flex items-center rounded-full bg-emerald-50 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-200 text-xs font-semibold px-3 py-1">
                {t("communications.officialBadge")}
              </span>
            </div>

            <h2 className="text-2xl font-bold tracking-tight text-foreground leading-snug">
              {announcement.title}
            </h2>

            {announcement.publishedAt && (
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Calendar className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <time dateTime={announcement.publishedAt}>
                  {formatPublishedAt(announcement.publishedAt, i18n.language)}
                </time>
              </p>
            )}

            {announcement.bannerUrl && (
              <div className="overflow-hidden rounded-2xl border border-border bg-[hsl(152,65%,18%)]">
                <img
                  src={announcement.bannerUrl}
                  alt=""
                  className="w-full h-auto object-cover max-h-64"
                  loading="eager"
                />
              </div>
            )}

            <div
              className="prose prose-sm dark:prose-invert max-w-none text-foreground/90 leading-relaxed
                [&_p]:mb-3 [&_ul]:my-2 [&_li]:my-1 [&_a]:text-emerald-700 dark:[&_a]:text-emerald-300"
              dangerouslySetInnerHTML={{ __html: announcement.bodyHtml }}
            />

            {announcement.highlightTitle && (announcement.highlightItems?.length ?? 0) > 0 && (
              <section
                className="rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/80 dark:bg-emerald-950/30 p-4 space-y-3"
                aria-label={announcement.highlightTitle}
              >
                <h3 className="flex items-center gap-2 text-sm font-bold text-emerald-900 dark:text-emerald-100">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden />
                  {announcement.highlightTitle}
                </h3>
                <ul className="space-y-2">
                  {announcement.highlightItems.map((item, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm text-emerald-900/90 dark:text-emerald-100/90">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" aria-hidden />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {announcement.actionLabel && announcement.actionUrl && (
              <Button
                className="w-full h-11 bg-[hsl(152,65%,18%)] hover:bg-[hsl(152,65%,14%)] text-white"
                onClick={() => navigate(announcement.actionUrl!)}
              >
                {announcement.actionLabel}
                <ExternalLink className="h-4 w-4 ml-2" />
              </Button>
            )}

            <footer className="pt-4 border-t border-border space-y-1 text-sm text-muted-foreground">
              <p>{t("communications.thanks")}</p>
              <p className="font-semibold text-foreground">{t("communications.signature")}</p>
            </footer>
          </article>
        )}
      </main>
    </div>
  );
}
