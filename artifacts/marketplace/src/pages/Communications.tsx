import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/auth";
import { ArrowLeft, Megaphone, Search, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";

interface CommSummary {
  id: number;
  title: string;
  preview: string;
  category: string;
  bannerUrl: string | null;
  publishedAt: string | null;
  status: string;
}

const CATEGORIES = ["", "update", "security", "promo", "ops", "general"] as const;

function formatDate(iso: string | null, locale: string): string {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export default function Communications() {
  const [, navigate] = useLocation();
  const { token } = useAuth();
  const { t, i18n } = useTranslation();
  const [items, setItems] = useState<CommSummary[]>([]);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (q.trim()) params.set("q", q.trim());
        if (category) params.set("category", category);
        const res = await fetch(`/api/communications?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        if (res.ok) setItems(await res.json());
        else setItems([]);
      } catch {
        if (!controller.signal.aborted) setItems([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 200);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [token, q, category]);

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
          <h1 className="flex-1 text-center font-semibold text-[15px]">
            {t("communications.historyTitle")}
          </h1>
          <div className="w-11" aria-hidden />
        </div>
      </header>

      <div className="max-w-2xl mx-auto w-full px-4 py-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("communications.searchPlaceholder")}
            className="pl-9 h-11 rounded-xl"
            aria-label={t("communications.searchPlaceholder")}
          />
        </div>

        <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1" role="tablist" aria-label={t("communications.filterCategory")}>
          {CATEGORIES.map((cat) => (
            <button
              key={cat || "all"}
              type="button"
              role="tab"
              aria-selected={category === cat}
              onClick={() => setCategory(cat)}
              className={`shrink-0 h-9 px-3 rounded-full text-xs font-semibold border transition-colors ${
                category === cat
                  ? "bg-[hsl(152,65%,18%)] text-white border-transparent"
                  : "bg-card text-foreground border-border hover:bg-accent"
              }`}
            >
              {cat ? t(`communications.category.${cat}`) : t("communications.categoryAll")}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">{t("profile.loading")}</span>
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-16 space-y-2">
            <Megaphone className="h-10 w-10 mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{t("communications.empty")}</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/communications/${item.id}`)}
                  className="w-full text-left rounded-2xl border border-border bg-card p-3.5 hover:bg-accent/40 transition-colors flex gap-3 min-h-[44px]"
                >
                  <span className="h-10 w-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0">
                    <Megaphone className="h-5 w-5" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-foreground truncate">{item.title}</span>
                    <span className="block text-xs text-muted-foreground truncate mt-0.5">{item.preview}</span>
                    <span className="block text-[11px] text-muted-foreground mt-1">
                      {formatDate(item.publishedAt, i18n.language)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
