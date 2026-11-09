import { useEffect, useId, useRef, useState } from "react";
import { Loader2, MapPin, Search, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/auth";
import { cn } from "@/lib/utils";
import {
  fetchLocationSuggestions,
  MAX_GEO_PLACES,
  type GeoPlace,
} from "@/lib/geoPlaces";

type Props = {
  country: string;
  selected: GeoPlace[];
  onChange: (places: GeoPlace[]) => void;
  className?: string;
  placeholder?: string;
};

export function LocationAutocomplete({
  country,
  selected,
  onChange,
  className,
  placeholder,
}: Props) {
  const { t } = useTranslation();
  const { token } = useAuth();
  const listId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<GeoPlace[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setSuggestions([]);
      setLoading(false);
      return;
    }
    const timer = window.setTimeout(async () => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      setLoading(true);
      try {
        const results = await fetchLocationSuggestions({
          q,
          country,
          token,
          limit: 8,
          signal: ac.signal,
        });
        if (!ac.signal.aborted) {
          const selectedIds = new Set(selected.map((p) => p.id));
          setSuggestions(results.filter((r) => !selectedIds.has(r.id)));
          setActiveIdx(0);
          setOpen(true);
        }
      } catch {
        if (!ac.signal.aborted) setSuggestions([]);
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    }, 220);
    return () => {
      window.clearTimeout(timer);
      abortRef.current?.abort();
    };
  }, [query, country, token, selected]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const addPlace = (place: GeoPlace) => {
    if (selected.some((p) => p.id === place.id)) return;
    if (selected.length >= MAX_GEO_PLACES) return;
    onChange([...selected, place]);
    setQuery("");
    setSuggestions([]);
    setOpen(false);
  };

  const removePlace = (id: string) => {
    onChange(selected.filter((p) => p.id !== id));
  };

  return (
    <div ref={wrapRef} className={cn("space-y-2", className)} data-testid="boost-location-autocomplete">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5" data-testid="boost-selected-locations">
          {selected.map((p) => (
            <span
              key={p.id}
              className="fb-tag inline-flex items-center gap-1 max-w-full"
              title={p.displayName}
            >
              <MapPin className="h-3 w-3 shrink-0 opacity-70" />
              <span className="truncate">{p.displayName || p.name}</span>
              <button
                type="button"
                aria-label={t("boost.removeLocation", {
                  defaultValue: "Remove {{name}}",
                  name: p.name,
                })}
                onClick={() => removePlace(p.id)}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="fb-search relative">
        <Search className="h-4 w-4 text-slate-400" />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            if (suggestions.length > 0) setOpen(true);
          }}
          onKeyDown={(e) => {
            if (!open || suggestions.length === 0) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActiveIdx((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              const pick = suggestions[activeIdx];
              if (pick) addPlace(pick);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          placeholder={
            placeholder
            || t("boost.searchLocation", {
              defaultValue: "Search city, commune, department…",
            })
          }
          className="fb-search-input"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          data-testid="boost-location-search-input"
        />
        {loading && (
          <Loader2 className="h-4 w-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 animate-spin" />
        )}
      </div>

      {open && (suggestions.length > 0 || (query.trim().length >= 2 && !loading)) && (
        <ul
          id={listId}
          role="listbox"
          className="fb-check-list max-h-56 overflow-y-auto border border-slate-200 rounded-xl bg-white shadow-sm"
          data-testid="boost-location-suggestions"
        >
          {suggestions.length === 0 ? (
            <li className="px-3 py-2 text-xs text-slate-500">
              {t("boost.noLocationsFound", { defaultValue: "No matching locations" })}
            </li>
          ) : (
            suggestions.map((s, i) => (
              <li key={s.id} role="option" aria-selected={i === activeIdx}>
                <button
                  type="button"
                  className={cn("fb-check-row w-full text-left", i === activeIdx && "on")}
                  onMouseEnter={() => setActiveIdx(i)}
                  onClick={() => addPlace(s)}
                >
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-violet-600" />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold truncate">{s.name}</span>
                    <span className="block text-[11px] text-slate-500 truncate">
                      {s.displayName}
                      {s.kind ? ` · ${s.kind}` : ""}
                    </span>
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}

      <p className="text-[11px] text-slate-400">
        {t("boost.locationLimitHint", {
          defaultValue: "Add multiple locations. Overlapping areas are merged for reach estimates (max {{max}}).",
          max: MAX_GEO_PLACES,
        })}
      </p>
    </div>
  );
}
