import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useSEO } from "@/hooks/useSEO";
import { Search as SearchIcon, SlidersHorizontal, X, Globe, ChevronRight, ShieldCheck, Camera, ImageIcon, Sparkles, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MobileSelect } from "@/components/ui/mobile-select";
import { Slider } from "@/components/ui/slider";
import { useGetListings, useGetCategories } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/auth";
import ListingCard from "@/components/ListingCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "react-i18next";
import { apiFetch } from "@/lib/api";

import { COUNTRY_FLAGS, SUPPORTED_COUNTRIES } from "@/lib/countries";

// ── Debounce hook — delays updating the value until the user stops typing ─────
function useDebounce<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

// ── Filter panel (extracted so it can be called as a function, not a component,
//    avoiding remount-on-every-render caused by inline component definitions) ──
interface FilterPanelProps {
  city: string;
  setCity: (v: string) => void;
  category: string;
  setCategory: (v: string) => void;
  subcategory: string;
  setSubcategory: (v: string) => void;
  condition: string;
  setCondition: (v: string) => void;
  priceRange: [number, number];
  setPriceRange: (v: [number, number]) => void;
  adminCountry: string | null;
  setAdminCountry: (v: string | null) => void;
  onClear: () => void;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  scopeLock: string | null;
  userCountry: string | null | undefined;
  selectedParent: any;
  categories: any[] | undefined;
  setPage: (p: number) => void;
  isMultiCountryAdmin: boolean;
  adminScopeCountriesList: string[];
}

function FilterPanel({
  city, setCity, category, setCategory,
  subcategory, setSubcategory, condition, setCondition,
  priceRange, setPriceRange,
  adminCountry, setAdminCountry,
  onClear,
  isAdmin, isSuperAdmin, scopeLock, userCountry,
  selectedParent, categories, setPage,
  isMultiCountryAdmin, adminScopeCountriesList,
}: FilterPanelProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-5">
      {isAdmin && isSuperAdmin ? (
        <div>
          <Label className="text-sm font-semibold mb-2 block">{t("search.countryAdmin")}</Label>
          <MobileSelect
            value={adminCountry ?? "all"}
            onValueChange={v => { setAdminCountry(v === "all" ? null : v); setPage(1); }}
            placeholder={`🌍 ${t("search.allCountries")}`}
            options={[
              { value: "all", label: `🌍 ${t("search.allCountries")}` },
              ...SUPPORTED_COUNTRIES.map(c => ({ value: c, label: `${COUNTRY_FLAGS[c]} ${c}` })),
            ]}
            className="text-sm"
            data-testid="select-admin-country-search"
          />
          <p className="text-xs text-muted-foreground mt-1">
            {adminCountry
              ? t("search.filteredTo", { country: adminCountry })
              : t("search.showingAll")}
          </p>
        </div>
      ) : isAdmin && !isSuperAdmin && isMultiCountryAdmin ? (
        <div>
          <Label className="text-sm font-semibold mb-2 block">{t("search.country")}</Label>
          <MobileSelect
            value={adminCountry ?? "all"}
            onValueChange={v => setAdminCountry(v === "all" ? null : v)}
            placeholder={`🌍 ${t("home.allCountriesDesc", "All Countries")}`}
            options={[
              { value: "all", label: `🌍 ${t("home.allCountriesDesc", "All Countries")}` },
              ...adminScopeCountriesList.map(c => ({ value: c, label: `${COUNTRY_FLAGS[c] ?? ""} ${c}` })),
            ]}
            className="h-9 w-full text-sm"
            data-testid="select-search-country-scoped"
          />
        </div>
      ) : isAdmin && !isSuperAdmin ? (
        <div>
          <Label className="text-sm font-semibold mb-2 block">{t("search.country")}</Label>
          <div className="flex items-center gap-2 p-2 bg-violet-50 dark:bg-violet-950/30 rounded-lg border border-violet-200 dark:border-violet-800">
            <ShieldCheck className="h-4 w-4 text-violet-500" />
            <span className="text-sm font-medium text-foreground">
              {scopeLock ? `${COUNTRY_FLAGS[scopeLock] ?? ""} ${scopeLock}` : "—"}
            </span>
            <span className="text-xs bg-violet-200 dark:bg-violet-800 text-violet-700 dark:text-violet-300 px-2 py-0.5 rounded-full font-medium ml-auto">
              {t("home.locked", "Locked")}
            </span>
          </div>
        </div>
      ) : userCountry ? (
        <div>
          <Label className="text-sm font-semibold mb-2 block">{t("search.country")}</Label>
          <div className="flex items-center gap-2 p-2 bg-primary/10 rounded-lg border border-primary/20">
            <Globe className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-primary">
              {COUNTRY_FLAGS[userCountry]} {userCountry}
            </span>
            <Badge variant="secondary" className="text-xs ml-auto">{t("search.active")}</Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1">{t("search.showingYourCountry")}</p>
        </div>
      ) : null}

      <div>
        <Label className="text-sm font-semibold mb-2 block">{t("search.city")}</Label>
        <Input
          value={city}
          onChange={(e) => { setCity(e.target.value); setPage(1); }}
          placeholder={t("search.cityPlaceholder")}
          className="text-sm"
          data-testid="input-city"
        />
      </div>

      <div>
        <Label className="text-sm font-semibold mb-2 block">{t("search.category")}</Label>
        <MobileSelect
          value={category || "_all"}
          onValueChange={v => { setCategory(v === "_all" ? "" : v); setSubcategory(""); setPage(1); }}
          placeholder={t("search.allCategories")}
          options={[
            { value: "_all", label: t("search.allCategories") },
            ...(categories ?? []).map(c => ({ value: c.slug, label: `${c.icon} ${c.name}` })),
          ]}
          data-testid="select-category"
        />
      </div>

      {selectedParent && (selectedParent as any).children?.length > 0 && (
        <div>
          <Label className="text-sm font-semibold mb-2 block">
            <span className="flex items-center gap-1">
              <ChevronRight className="h-3 w-3" /> {t("search.subcategory")}
            </span>
          </Label>
          <MobileSelect
            value={subcategory || "_all"}
            onValueChange={v => { setSubcategory(v === "_all" ? "" : v); setPage(1); }}
            placeholder={t("search.allSubcategories")}
            options={[
              { value: "_all", label: t("search.allSubcategories") },
              ...((selectedParent as any).children as any[]).map((sub: any) => ({
                value: sub.slug,
                label: `${sub.icon} ${sub.name}`,
              })),
            ]}
            data-testid="select-subcategory"
          />
        </div>
      )}

      <div>
        <Label className="text-sm font-semibold mb-2 block">{t("search.condition")}</Label>
        <MobileSelect
          value={condition || "_all"}
          onValueChange={v => { setCondition(v === "_all" ? "" : v); setPage(1); }}
          placeholder={t("search.anyCondition")}
          options={[
            { value: "_all", label: t("search.anyCondition") },
            { value: "new", label: t("search.conditionNew") },
            { value: "like_new", label: t("search.conditionLikeNew") },
            { value: "good", label: t("search.conditionGood") },
            { value: "fair", label: t("search.conditionFair") },
            { value: "poor", label: t("search.conditionPoor") },
          ]}
          data-testid="select-condition"
        />
      </div>

      <div>
        <Label className="text-sm font-semibold mb-2 block">
          {t("search.priceLabel", {
            min: priceRange[0],
            max: priceRange[1] >= 5000 ? t("search.priceAny") : `$${priceRange[1]}`,
          })}
        </Label>
        <Slider
          min={0} max={5000} step={10}
          value={priceRange}
          onValueChange={(v) => { setPriceRange(v as [number, number]); setPage(1); }}
          className="mt-2"
          data-testid="slider-price"
        />
      </div>

      <Button
        variant="outline"
        size="sm"
        onClick={onClear}
        className="w-full"
        data-testid="button-clear-filters"
      >
        <X className="h-4 w-4 mr-1" /> {t("search.clearFilters")}
      </Button>
    </div>
  );
}

// ── Visual Search State ────────────────────────────────────────────────────────
type VisualSearchStatus = "idle" | "analyzing" | "done" | "error";

// ── SearchPage ─────────────────────────────────────────────────────────────────
export default function SearchPage() {
  const { user } = useAuth();
  const { t } = useTranslation();
  useSEO({ title: "Rechèch Annons", description: "Chèche annons ann Ayiti — elektwonik, rad, machin, meuble ak plis sou FLEXA MARKET.", path: "/search" });
  const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");

  const [q, setQ] = useState(params.get("q") ?? "");
  const [category, setCategory] = useState(params.get("category") ?? "");
  const [subcategory, setSubcategory] = useState(params.get("subcategory") ?? "");
  const [condition, setCondition] = useState("");
  const [city, setCity] = useState("");
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 5000]);
  const [page, setPage] = useState(1);
  const [adminCountry, setAdminCountry] = useState<string | null>(null);

  // ── Visual search state ──────────────────────────────────────────────────────
  const [vsOpen, setVsOpen] = useState(false);
  const [vsStatus, setVsStatus] = useState<VisualSearchStatus>("idle");
  const [vsPreview, setVsPreview] = useState<string | null>(null);
  const [vsResult, setVsResult] = useState<{ keywords: string; description: string; confidence: string } | null>(null);
  const [vsError, setVsError] = useState<string | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const runVisualSearch = useCallback(async (file: File) => {
    setVsStatus("analyzing");
    setVsResult(null);
    setVsError(null);

    // Show preview
    const reader = new FileReader();
    reader.onload = e => setVsPreview(e.target?.result as string);
    reader.readAsDataURL(file);

    try {
      const token = localStorage.getItem("flexamarket_token");
      const form = new FormData();
      form.append("image", file);
      const res = await fetch("/api/listings/visual-search", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");

      if (data.confidence === "low" || !data.keywords) {
        setVsStatus("done");
        setVsResult({ keywords: "", description: data.description ?? "", confidence: "low" });
      } else {
        setVsStatus("done");
        setVsResult(data);
      }
    } catch (err: any) {
      setVsStatus("error");
      setVsError(err.message ?? t("search.visualSearchError"));
    }
  }, [t]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setVsOpen(true);
    runVisualSearch(file);
  }, [runVisualSearch]);

  const applyVisualKeywords = useCallback(() => {
    if (vsResult?.keywords) {
      setQ(vsResult.keywords);
      setPage(1);
    }
    setVsOpen(false);
  }, [vsResult]);

  const resetVisualSearch = useCallback(() => {
    setVsStatus("idle");
    setVsPreview(null);
    setVsResult(null);
    setVsError(null);
  }, []);

  // Debounce free-text inputs so the API is called only after the user pauses
  const debouncedQ = useDebounce(q, 300);
  const debouncedCity = useDebounce(city, 300);

  // ── Silently persist search history so the home page can personalise results ──
  useEffect(() => {
    if (!user?.id || debouncedQ.trim().length < 2) return;
    // Fire-and-forget — never blocks or alerts on failure
    apiFetch("/api/listings/search-history", {
      method: "POST",
      body: JSON.stringify({ query: debouncedQ.trim(), category: category || undefined }),
    }).catch(() => {});
  }, [debouncedQ, user?.id]); // category intentionally omitted — one history row per term

  const { data: categories } = useGetCategories();

  const userCountry = user?.country;
  const isAdmin = !!(user?.isAdmin || user?.isSuperAdmin);
  const isSuperAdmin = !!(user?.isSuperAdmin);
  const adminScopeCountriesListSearch: string[] = (() => {
    if (!isAdmin || isSuperAdmin) return [];
    const raw = (user as any)?.adminScopeCountries;
    if (raw) { try { const p = JSON.parse(raw) as string[]; if (p.length > 0) return p; } catch { /* ignore */ } }
    const single = (user as any)?.adminScopeCountry;
    return single ? [single] : [];
  })();
  const isMultiCountryAdminSearch = isAdmin && !isSuperAdmin && adminScopeCountriesListSearch.length > 1;
  const scopeLock: string | null = (isSuperAdmin || isMultiCountryAdminSearch)
    ? null
    : ((user as any)?.adminScopeCountry ?? user?.country ?? null);
  const effectiveAdminCountry: string | null = isSuperAdmin ? adminCountry : (isMultiCountryAdminSearch ? adminCountry : scopeLock);

  const selectedParent = useMemo(
    () => categories?.find(c => c.slug === category),
    [categories, category],
  );

  const { data, isLoading } = useGetListings(
    {
      q: debouncedQ || undefined,
      category: category || undefined,
      subcategory: subcategory || undefined,
      condition: condition || undefined,
      minPrice: priceRange[0] || undefined,
      maxPrice: priceRange[1] < 5000 ? priceRange[1] : undefined,
      city: debouncedCity || undefined,
      ...(isAdmin && effectiveAdminCountry != null ? { country: effectiveAdminCountry } : {}),
      page,
      limit: 20,
    },
    {
      query: {
        queryKey: [
          "listings", debouncedQ, category, subcategory, condition,
          priceRange, debouncedCity, page, user?.id,
          isAdmin ? effectiveAdminCountry : null,
        ],
      },
    },
  );

  const clearFilters = useCallback(() => {
    setQ(""); setCategory(""); setSubcategory(""); setCondition("");
    setCity(""); setPriceRange([0, 5000]); setPage(1);
    if (isSuperAdmin) setAdminCountry(null);
  }, [isSuperAdmin]);

  const filterPanelProps: FilterPanelProps = {
    city, setCity, category, setCategory,
    subcategory, setSubcategory, condition, setCondition,
    priceRange, setPriceRange,
    adminCountry, setAdminCountry,
    onClear: clearFilters,
    isAdmin, isSuperAdmin, scopeLock, userCountry,
    selectedParent, categories,
    setPage,
    isMultiCountryAdmin: isMultiCountryAdminSearch,
    adminScopeCountriesList: adminScopeCountriesListSearch,
  };

  const activeFiltersCount =
    [category, subcategory, condition, city, q].filter(Boolean).length +
    (priceRange[0] > 0 || priceRange[1] < 5000 ? 1 : 0);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">

      {/* ── Hidden file inputs for camera / gallery ── */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
        aria-label="Take photo"
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
        aria-label="Choose from gallery"
      />

      {/* ── Visual Search Sheet ── */}
      <Sheet open={vsOpen} onOpenChange={open => { setVsOpen(open); if (!open) resetVisualSearch(); }}>
        <SheetContent side="bottom" className="rounded-t-3xl pb-10 px-0">
          <SheetHeader className="px-5 pb-4 border-b border-border">
            <SheetTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-5 w-5 text-primary" />
              {t("search.visualSearchTitle")}
            </SheetTitle>
          </SheetHeader>

          <div className="px-5 pt-5 space-y-4">
            {/* Image preview */}
            {vsPreview && (
              <div className="relative w-full max-h-56 overflow-hidden rounded-2xl bg-muted flex items-center justify-center">
                <img
                  src={vsPreview}
                  alt="Preview"
                  className="object-contain max-h-56 w-full"
                />
                {vsStatus === "analyzing" && (
                  <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center gap-3 rounded-2xl">
                    <Loader2 className="h-8 w-8 text-white animate-spin" />
                    <p className="text-white text-sm font-medium">{t("search.visualSearchAnalyzing")}</p>
                  </div>
                )}
              </div>
            )}

            {/* Idle — show camera / gallery buttons */}
            {vsStatus === "idle" && !vsPreview && (
              <>
                <p className="text-sm text-muted-foreground text-center">{t("search.visualSearchDesc")}</p>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => cameraInputRef.current?.click()}
                    className="flex flex-col items-center gap-2 py-5 rounded-2xl border-2 border-dashed border-primary/40 hover:border-primary hover:bg-primary/5 transition-all active:scale-95"
                    data-testid="btn-visual-camera"
                  >
                    <Camera className="h-8 w-8 text-primary" />
                    <span className="text-sm font-semibold text-foreground">{t("search.visualSearchCamera")}</span>
                  </button>
                  <button
                    onClick={() => galleryInputRef.current?.click()}
                    className="flex flex-col items-center gap-2 py-5 rounded-2xl border-2 border-dashed border-border hover:border-primary hover:bg-primary/5 transition-all active:scale-95"
                    data-testid="btn-visual-gallery"
                  >
                    <ImageIcon className="h-8 w-8 text-muted-foreground" />
                    <span className="text-sm font-semibold text-foreground">{t("search.visualSearchGallery")}</span>
                  </button>
                </div>
                <p className="text-xs text-muted-foreground text-center">{t("search.visualSearchTip")}</p>
              </>
            )}

            {/* Done — show result */}
            {vsStatus === "done" && vsResult && (
              <div className="space-y-3">
                {vsResult.confidence === "low" ? (
                  <div className="flex items-start gap-3 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl">
                    <AlertCircle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-amber-800 dark:text-amber-300">{t("search.visualSearchLowConfidence")}</p>
                      {vsResult.description && <p className="text-xs text-muted-foreground mt-1">{vsResult.description}</p>}
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-xl">
                    <p className="text-sm font-semibold text-green-800 dark:text-green-300 flex items-center gap-2">
                      <Sparkles className="h-4 w-4" />
                      {t("search.visualSearchFound", { keywords: vsResult.keywords })}
                    </p>
                    {vsResult.description && <p className="text-xs text-muted-foreground mt-1">{vsResult.description}</p>}
                  </div>
                )}

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => { resetVisualSearch(); galleryInputRef.current?.click(); }}
                  >
                    <ImageIcon className="h-4 w-4 mr-1.5" />
                    {t("search.visualSearchGallery")}
                  </Button>
                  {vsResult.keywords && (
                    <Button
                      className="flex-[1.5] bg-primary hover:bg-primary/90"
                      onClick={applyVisualKeywords}
                      data-testid="btn-visual-apply"
                    >
                      <SearchIcon className="h-4 w-4 mr-1.5" />
                      {t("search.visualSearchFound", { keywords: vsResult.keywords })}
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* Error state */}
            {vsStatus === "error" && (
              <div className="space-y-3">
                <div className="flex items-start gap-3 p-3 bg-destructive/10 border border-destructive/30 rounded-xl">
                  <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                  <p className="text-sm text-destructive">{vsError ?? t("search.visualSearchError")}</p>
                </div>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => { resetVisualSearch(); galleryInputRef.current?.click(); }}
                >
                  {t("search.visualSearchGallery")}
                </Button>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Search bar */}
      <div className="flex gap-2 mb-6">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={e => { setQ(e.target.value); setPage(1); }}
            placeholder={
              userCountry
                ? t("search.placeholderCountry", { country: userCountry })
                : t("search.placeholder")
            }
            className="pl-9 pr-10"
            data-testid="input-search"
          />
          {/* Camera icon inside the input — right side, like Temu */}
          <button
            type="button"
            onClick={() => { resetVisualSearch(); setVsOpen(true); }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all active:scale-90"
            title={t("search.visualSearchBtn")}
            data-testid="btn-visual-search"
            aria-label={t("search.visualSearchBtn")}
          >
            <Camera className="h-4 w-4" />
          </button>
        </div>
        <Sheet>
          <SheetTrigger asChild>
            <Button
              variant="outline"
              className="md:hidden relative"
              data-testid="button-filters-mobile"
            >
              <SlidersHorizontal className="h-4 w-4 mr-1" /> {t("search.filters")}
              {activeFiltersCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-primary text-primary-foreground text-xs font-bold rounded-full h-4 w-4 flex items-center justify-center">
                  {activeFiltersCount}
                </span>
              )}
            </Button>
          </SheetTrigger>
          <SheetContent side="left">
            <SheetHeader><SheetTitle>{t("search.filters")}</SheetTitle></SheetHeader>
            <div className="mt-6">
              <FilterPanel {...filterPanelProps} />
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Active filter chips */}
      {(category || subcategory) && (
        <div className="flex flex-wrap gap-2 mb-4">
          {category && (
            <Badge variant="secondary" className="flex items-center gap-1 px-2 py-1">
              {categories?.find(c => c.slug === category)?.icon}{" "}
              {categories?.find(c => c.slug === category)?.name}
              <button
                onClick={() => { setCategory(""); setSubcategory(""); }}
                className="ml-1 hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {subcategory && (
            <Badge variant="outline" className="flex items-center gap-1 px-2 py-1">
              {(selectedParent as any)?.children?.find((s: any) => s.slug === subcategory)?.icon}{" "}
              {(selectedParent as any)?.children?.find((s: any) => s.slug === subcategory)?.name}
              <button onClick={() => setSubcategory("")} className="ml-1 hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
        </div>
      )}

      <div className="flex gap-6">
        {/* Desktop sidebar */}
        <aside className="hidden md:block w-64 flex-shrink-0">
          <div className="bg-card border border-border rounded-xl p-5 sticky top-20">
            <h3 className="font-bold mb-4 text-foreground">{t("search.filters")}</h3>
            <FilterPanel {...filterPanelProps} />
          </div>
        </aside>

        {/* Results */}
        <div className="flex-1">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-muted-foreground">
              {isLoading
                ? t("search.searching")
                : userCountry
                ? t("search.listingsFoundIn", { count: data?.total ?? 0, country: userCountry })
                : t("search.listingsFound", { count: data?.total ?? 0 })}
            </p>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {Array.from({ length: 10 }).map((_, i) => (
                <Skeleton key={i} className="aspect-[3/4] rounded-xl" />
              ))}
            </div>
          ) : data?.listings && data.listings.length > 0 ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {data.listings.map(l => <ListingCard key={l.id} listing={l} />)}
              </div>
              {data.totalPages > 1 && (
                <div className="flex justify-center gap-2 mt-6">
                  <Button
                    variant="outline"
                    disabled={page === 1}
                    onClick={() => setPage(p => p - 1)}
                    data-testid="button-prev-page"
                  >
                    {t("search.previous")}
                  </Button>
                  <span className="flex items-center px-3 text-sm text-muted-foreground">
                    {t("search.page", { current: page, total: data.totalPages })}
                  </span>
                  <Button
                    variant="outline"
                    disabled={page === data.totalPages}
                    onClick={() => setPage(p => p + 1)}
                    data-testid="button-next-page"
                  >
                    {t("search.next")}
                  </Button>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-20 bg-card border border-border rounded-xl">
              <SearchIcon className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <p className="font-semibold text-foreground">{t("search.noListingsTitle")}</p>
              <p className="text-sm text-muted-foreground mt-1">{t("search.noListingsDesc")}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
