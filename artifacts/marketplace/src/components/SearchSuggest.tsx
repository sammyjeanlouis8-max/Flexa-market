import { useEffect, useId, useRef, useState } from "react";
import { Clock, Flame, FolderOpen, Search as SearchIcon, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/auth";
import { cn } from "@/lib/utils";

export type SearchSuggestPayload = {
  q: string;
  didYouMean: string | null;
  listings: Array<{
    id: number;
    title: string;
    price: number;
    currency: string | null;
    image: string | null;
    city: string | null;
    country: string | null;
    categorySlug: string | null;
    categoryName: string | null;
  }>;
  categories: Array<{ id: number; slug: string; name: string; icon: string | null }>;
  history: Array<{ query: string; count: number }>;
  popular: Array<{ query: string; count: number }>;
};

type Props = {
  query: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPickQuery: (query: string) => void;
  onPickListing?: (id: number) => void;
  onPickCategory?: (slug: string) => void;
  className?: string;
  /** When true, show history/popular even with empty query. */
  showIdleHints?: boolean;
};

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

export function SearchSuggestPanel({
  query,
  open,
  onOpenChange,
  onPickQuery,
  onPickListing,
  onPickCategory,
  className,
  showIdleHints = true,
}: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const debounced = useDebounced(query.trim(), 180);
  const [data, setData] = useState<SearchSuggestPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const listId = useId();
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open) return;
    if (!showIdleHints && debounced.length < 1) {
      setData(null);
      return;
    }

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true);

    const params = new URLSearchParams();
    if (debounced) params.set("q", debounced);
    if (user?.country) params.set("country", user.country);

    apiFetch<SearchSuggestPayload>(`/api/listings/suggest?${params.toString()}`, {
      signal: ac.signal,
    })
      .then((json) => {
        if (!ac.signal.aborted) setData(json);
      })
      .catch(() => {
        if (!ac.signal.aborted) setData(null);
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });

    return () => ac.abort();
  }, [debounced, open, showIdleHints, user?.country]);

  const clearHistory = async (term?: string) => {
    try {
      const qs = term ? `?query=${encodeURIComponent(term)}` : "";
      await apiFetch(`/api/listings/search-history${qs}`, { method: "DELETE" });
      setData((prev) =>
        prev
          ? {
              ...prev,
              history: term
                ? prev.history.filter((h) => h.query !== term.toLowerCase())
                : [],
            }
          : prev,
      );
    } catch {
      /* ignore */
    }
  };

  if (!open) return null;

  const hasTyped = debounced.length >= 1;
  const history = data?.history ?? [];
  const popular = data?.popular ?? [];
  const listings = data?.listings ?? [];
  const categories = data?.categories ?? [];
  const didYouMean = data?.didYouMean ?? null;
  const empty =
    !loading &&
    !didYouMean &&
    history.length === 0 &&
    popular.length === 0 &&
    listings.length === 0 &&
    categories.length === 0;

  return (
    <div
      id={listId}
      role="listbox"
      aria-label={t("search.suggestions")}
      className={cn(
        "absolute left-0 right-0 top-full z-40 mt-1.5 max-h-[min(70vh,28rem)] overflow-y-auto rounded-xl border border-border bg-card shadow-lg",
        className,
      )}
    >
      {loading && (
        <p className="px-3 py-2.5 text-xs text-muted-foreground">{t("search.searching")}</p>
      )}

      {didYouMean && (
        <button
          type="button"
          role="option"
          className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-muted/60"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            onPickQuery(didYouMean);
            onOpenChange(false);
          }}
        >
          <SearchIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span>
            {t("search.didYouMean")}{" "}
            <span className="font-semibold text-foreground">{didYouMean}</span>
          </span>
        </button>
      )}

      {!hasTyped && history.length > 0 && (
        <section className="border-b border-border/60 py-1">
          <div className="flex items-center justify-between px-3 py-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t("search.recentSearches")}
            </p>
            <button
              type="button"
              className="text-[11px] font-medium text-muted-foreground hover:text-foreground"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => clearHistory()}
            >
              {t("search.clearHistory")}
            </button>
          </div>
          {history.map((h) => (
            <div key={h.query} className="flex items-center gap-1 pr-1">
              <button
                type="button"
                role="option"
                className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/60"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onPickQuery(h.query);
                  onOpenChange(false);
                }}
              >
                <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="truncate">{h.query}</span>
              </button>
              <button
                type="button"
                aria-label={t("search.removeHistoryItem")}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => clearHistory(h.query)}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </section>
      )}

      {!hasTyped && popular.length > 0 && (
        <section className="py-1">
          <p className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t("search.popularSearches")}
          </p>
          {popular.map((p) => (
            <button
              key={p.query}
              type="button"
              role="option"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/60"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onPickQuery(p.query);
                onOpenChange(false);
              }}
            >
              <Flame className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="truncate">{p.query}</span>
            </button>
          ))}
        </section>
      )}

      {hasTyped && categories.length > 0 && (
        <section className="border-b border-border/60 py-1">
          <p className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t("search.categories")}
          </p>
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              role="option"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/60"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                if (onPickCategory) onPickCategory(c.slug);
                else onPickQuery(c.name);
                onOpenChange(false);
              }}
            >
              <FolderOpen className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="truncate">
                {c.icon ? `${c.icon} ` : ""}
                {c.name}
              </span>
            </button>
          ))}
        </section>
      )}

      {hasTyped && listings.length > 0 && (
        <section className="py-1">
          <p className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t("search.productSuggestions")}
          </p>
          {listings.map((l) => (
            <button
              key={l.id}
              type="button"
              role="option"
              className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted/60"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                if (onPickListing) onPickListing(l.id);
                else onPickQuery(l.title);
                onOpenChange(false);
              }}
            >
              <div className="h-9 w-9 shrink-0 overflow-hidden rounded-md bg-muted">
                {l.image ? (
                  <img src={l.image} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <SearchIcon className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{l.title}</p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {[l.city, l.country].filter(Boolean).join(" · ")}
                </p>
              </div>
            </button>
          ))}
        </section>
      )}

      {hasTyped && history.length > 0 && (
        <section className="border-t border-border/60 py-1">
          {history.map((h) => (
            <button
              key={`h-${h.query}`}
              type="button"
              role="option"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/60"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onPickQuery(h.query);
                onOpenChange(false);
              }}
            >
              <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="truncate">{h.query}</span>
            </button>
          ))}
        </section>
      )}

      {empty && hasTyped && (
        <p className="px-3 py-4 text-center text-sm text-muted-foreground">
          {t("search.noSuggestions")}
        </p>
      )}

      {!hasTyped && empty && (
        <p className="px-3 py-4 text-center text-sm text-muted-foreground">
          {t("search.startTyping")}
        </p>
      )}
    </div>
  );
}
