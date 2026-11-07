import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertCircle, Check, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { COUNTRY_FLAGS } from "@/lib/countries";
import { HAITI_COMMUNES_BY_DEPARTMENT, HAITI_DEPARTMENTS } from "@/lib/haitiCommunes";
import { HaitiDepartmentsMap } from "./HaitiDepartmentsMap";
import { MobileSelect } from "@/components/ui/mobile-select";

export type AudienceTab = "automatic" | "manual" | "map";
export type MapTool = "areas" | "radius";
export type GeoLevel = "country" | "department" | "city";

const RADIUS_OPTIONS = [5, 10, 20, 25, 50] as const;

export type BoostAudiencePanelHandle = {
  /** Scroll/focus the geographic targeting section (for inline validation). */
  focusGeo: () => void;
  getGeoSectionEl: () => HTMLElement | null;
};

type Props = {
  country: string;
  audienceType: "advantage_plus" | "custom";
  onAudienceType: (v: "advantage_plus" | "custom") => void;
  /** Multi-select departments / states. */
  audStates: string[];
  setAudStates: (v: string[]) => void;
  audCities: string[];
  setAudCities: (v: string[]) => void;
  audRadiusKm: number;
  setAudRadiusKm: (v: number) => void;
  ageMin: number;
  ageMax: number;
  setAgeMin: (v: number) => void;
  setAgeMax: (v: number) => void;
  gender: "all" | "male" | "female";
  setGender: (v: "all" | "male" | "female") => void;
  estimatedLabel?: string;
  estimatedSize?: "small" | "medium" | "large";
  /** Inline geo validation error (shown at the map / department section). */
  geoError?: string | null;
  onGeoErrorClear?: () => void;
};

export const BoostAudiencePanel = forwardRef<BoostAudiencePanelHandle, Props>(function BoostAudiencePanel({
  country,
  audienceType,
  onAudienceType,
  audStates,
  setAudStates,
  audCities,
  setAudCities,
  audRadiusKm,
  setAudRadiusKm,
  ageMin,
  ageMax,
  setAgeMin,
  setAgeMax,
  gender,
  setGender,
  estimatedLabel,
  estimatedSize = "medium",
  geoError = null,
  onGeoErrorClear,
}, ref) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<AudienceTab>(audienceType === "custom" ? "map" : "automatic");
  const [geoLevel, setGeoLevel] = useState<GeoLevel>("department");
  const [mapTool, setMapTool] = useState<MapTool>("areas");
  const [cityQuery, setCityQuery] = useState("");
  const geoSectionRef = useRef<HTMLDivElement>(null);
  const isHaiti = country === "Haiti";
  const flag = COUNTRY_FLAGS[country] ?? "🌍";

  useImperativeHandle(ref, () => ({
    focusGeo: () => {
      geoSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    },
    getGeoSectionEl: () => geoSectionRef.current,
  }));

  const primaryState = audStates[0] ?? "";
  const communes = useMemo(() => {
    if (!isHaiti || audStates.length === 0) return [];
    // Union of communes across selected departments
    const set = new Set<string>();
    for (const st of audStates) {
      for (const c of HAITI_COMMUNES_BY_DEPARTMENT[st] ?? []) set.add(c);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [isHaiti, audStates]);

  const filteredCommunes = useMemo(() => {
    const q = cityQuery.trim().toLowerCase();
    if (!q) return communes;
    return communes.filter((c) => c.toLowerCase().includes(q));
  }, [communes, cityQuery]);

  const switchTab = (next: AudienceTab) => {
    setTab(next);
    if (next === "automatic") onAudienceType("advantage_plus");
    else onAudienceType("custom");
  };

  const toggleCity = (city: string) => {
    onGeoErrorClear?.();
    if (audCities.includes(city)) setAudCities(audCities.filter((c) => c !== city));
    else setAudCities([...audCities, city]);
  };

  const toggleDepartment = (dept: string) => {
    onGeoErrorClear?.();
    onAudienceType("custom");
    if (audStates.includes(dept)) {
      const next = audStates.filter((d) => d !== dept);
      setAudStates(next);
      // Drop cities that no longer belong to remaining departments
      if (next.length === 0) setAudCities([]);
      else {
        const allowed = new Set(next.flatMap((s) => HAITI_COMMUNES_BY_DEPARTMENT[s] ?? []));
        setAudCities(audCities.filter((c) => allowed.has(c)));
      }
      return;
    }
    setAudStates([...audStates, dept]);
  };

  const selectAllDepartments = () => {
    onGeoErrorClear?.();
    onAudienceType("custom");
    setAudStates([...HAITI_DEPARTMENTS]);
  };

  const clearAllDepartments = () => {
    onGeoErrorClear?.();
    setAudStates([]);
    setAudCities([]);
  };

  const sizeDots = estimatedSize === "large" ? 3 : estimatedSize === "medium" ? 2 : 1;
  const showDeptMap = isHaiti && (tab === "map" || (tab === "manual" && geoLevel === "department"));

  return (
    <div className="fb-audience" data-testid="boost-audience-panel">
      <div className="fb-tabs" role="tablist">
        {([
          ["automatic", t("boost.tabAutomatic", { defaultValue: "Automatic" })],
          ["manual", t("boost.tabManual", { defaultValue: "Manual" })],
          ["map", t("boost.tabMap", { defaultValue: "Map" })],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={cn("fb-tab", tab === id && "on")}
            onClick={() => switchTab(id)}
            data-testid={`boost-audience-tab-${id}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="fb-country-pill">
        <span className="text-base leading-none">{flag}</span>
        <span className="font-semibold text-sm">{country || "—"}</span>
        <span className="text-[11px] text-slate-500 ml-auto">
          {t("boost.accountCountry", { defaultValue: "Account country" })}
        </span>
      </div>

      {tab === "automatic" && (
        <div className="fb-auto-card">
          <p className="font-bold text-sm text-slate-900">
            {t("boost.advantagePlus", { defaultValue: "Automatic Audience" })}
          </p>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            {t("boost.advantagePlusSub", {
              defaultValue: "Let Flexa find the best people in your area.",
            })}
          </p>
        </div>
      )}

      {(tab === "manual" || tab === "map") && (
        <div ref={geoSectionRef} className="space-y-3" data-testid="boost-geo-section">
          {isHaiti && (
            <div className="fb-seg" role="tablist" aria-label="Geographic level">
              {([
                ["country", t("boost.geoCountry", { defaultValue: "Country" })],
                ["department", t("boost.geoDepartment", { defaultValue: "Department" })],
                ["city", t("boost.geoCity", { defaultValue: "City" })],
              ] as const).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={cn("fb-seg-btn", geoLevel === id && "on")}
                  onClick={() => setGeoLevel(id)}
                  data-testid={`boost-geo-level-${id}`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          <div className="fb-country-pill">
            <span className="text-base leading-none">{flag}</span>
            <span className="font-semibold text-sm">{country || "—"}</span>
            <span className="text-[11px] text-slate-400 ml-auto">▼</span>
          </div>

          {geoLevel === "country" && (
            <div className="fb-auto-card">
              <p className="text-sm font-semibold">
                {t("boost.entireCountry", { defaultValue: "Entire country" })}: {country}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {t("boost.entireCountryHint", {
                  defaultValue: "Use Select All on the department map to target every region, or stay on Automatic.",
                })}
              </p>
              {isHaiti && (
                <button
                  type="button"
                  className="fb-util-btn mt-2"
                  onClick={selectAllDepartments}
                  data-testid="boost-select-all-country"
                >
                  {t("boost.selectAllDepartments", { defaultValue: "Select All" })}
                </button>
              )}
            </div>
          )}

          {(tab === "map" || geoLevel === "department") && isHaiti && (
            <>
              <HaitiDepartmentsMap
                selected={audStates}
                onToggle={toggleDepartment}
                invalid={!!geoError}
              />
              <div className="fb-util-row">
                <button
                  type="button"
                  className="fb-util-btn"
                  onClick={selectAllDepartments}
                  data-testid="boost-select-all-depts"
                >
                  {t("boost.selectAll", { defaultValue: "Select All" })}
                </button>
                <button
                  type="button"
                  className="fb-util-btn"
                  onClick={clearAllDepartments}
                  data-testid="boost-clear-all-depts"
                >
                  {t("boost.clearAll", { defaultValue: "Clear All" })}
                </button>
              </div>

              {audStates.length > 0 && (
                <div className="fb-selected-tags" data-testid="boost-selected-departments">
                  <span className="text-xs font-semibold text-slate-500">
                    {t("boost.selectedDepartments", {
                      defaultValue: "Selected Departments ({{count}})",
                      count: audStates.length,
                    })}
                  </span>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {audStates.map((d) => (
                      <span key={d} className="fb-tag">
                        {d}
                        <button
                          type="button"
                          aria-label={`Remove ${d}`}
                          onClick={() => toggleDepartment(d)}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {geoError && (
                <div
                  className="fb-inline-error"
                  role="alert"
                  data-testid="boost-geo-error"
                >
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{geoError}</span>
                </div>
              )}

              {tab === "map" && (
                <div className="fb-map-tools">
                  <button
                    type="button"
                    className={cn("fb-tool", mapTool === "areas" && "on")}
                    onClick={() => setMapTool("areas")}
                  >
                    {t("boost.selectAreas", { defaultValue: "Select Areas" })}
                  </button>
                  <button
                    type="button"
                    className={cn("fb-tool", mapTool === "radius" && "on")}
                    onClick={() => setMapTool("radius")}
                  >
                    {t("boost.radiusTool", { defaultValue: "Radius" })}
                  </button>
                  <button type="button" className="fb-tool" disabled title="Coming soon">
                    {t("boost.drawArea", { defaultValue: "Draw Area" })}
                  </button>
                </div>
              )}

              {tab === "map" && mapTool === "radius" && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="fb-label mb-0">{t("boost.radiusDistance", { defaultValue: "Radius distance" })}</label>
                    <span className="text-sm font-bold text-violet-700">{audRadiusKm} km</span>
                  </div>
                  <input
                    type="range"
                    min={5}
                    max={50}
                    step={5}
                    value={audRadiusKm}
                    onChange={(e) => setAudRadiusKm(Number(e.target.value))}
                    className="w-full accent-violet-600"
                  />
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {RADIUS_OPTIONS.map((r) => (
                      <button
                        key={r}
                        type="button"
                        className={cn("fb-chip", audRadiusKm === r && "on")}
                        onClick={() => setAudRadiusKm(r)}
                      >
                        {r} km
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {geoLevel === "city" && isHaiti && (
            <>
              {audStates.length === 0 && (
                <p className="text-xs text-slate-500">
                  {t("boost.selectDepartmentFirst", { defaultValue: "Select a department to see communes." })}
                </p>
              )}
              {audStates.length === 1 && (
                <MobileSelect
                  value={primaryState}
                  onValueChange={(v) => { setAudStates(v ? [v] : []); setAudCities([]); onGeoErrorClear?.(); }}
                  placeholder={t("boost.selectDepartment")}
                  options={HAITI_DEPARTMENTS.map((d) => ({ value: d, label: d }))}
                  data-testid="select-audience-state"
                />
              )}
              <div className="fb-search">
                <Search className="h-4 w-4 text-slate-400" />
                <input
                  value={cityQuery}
                  onChange={(e) => setCityQuery(e.target.value)}
                  placeholder={t("boost.searchCity", { defaultValue: "Search commune / city" })}
                  className="fb-search-input"
                />
              </div>
              <div className="fb-check-list" data-testid="boost-commune-list">
                {filteredCommunes.map((city) => {
                  const on = audCities.includes(city);
                  return (
                    <button
                      key={city}
                      type="button"
                      className={cn("fb-check-row", on && "on")}
                      onClick={() => toggleCity(city)}
                    >
                      <span className={cn("fb-check", on && "on")}>
                        {on ? <Check className="h-3 w-3" /> : null}
                      </span>
                      {city}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {!isHaiti && (
            <div className="fb-auto-card">
              <p className="text-sm font-semibold">
                {t("boost.mapCenteredOn", { defaultValue: "Map centered on" })} {country}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {t("boost.mapNonHaitiHint", {
                  defaultValue: "Department map is available for Haiti. Use city tags and radius for other countries.",
                })}
              </p>
            </div>
          )}

          {tab === "manual" && (
            <>
              <label className="fb-label">{t("boost.ageRange", { defaultValue: "Age range" })}</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={18}
                  max={64}
                  value={ageMin}
                  onChange={(e) => setAgeMin(Math.min(Number(e.target.value) || 18, ageMax - 1))}
                  className="fb-input w-20 text-center"
                />
                <span className="text-slate-400">–</span>
                <input
                  type="number"
                  min={19}
                  max={65}
                  value={ageMax}
                  onChange={(e) => setAgeMax(Math.max(Number(e.target.value) || 65, ageMin + 1))}
                  className="fb-input w-20 text-center"
                />
              </div>

              <label className="fb-label">{t("boost.gender", { defaultValue: "Gender" })}</label>
              <div className="fb-seg">
                {([
                  ["all", t("boost.genderAll", { defaultValue: "All" })],
                  ["male", t("boost.genderMale", { defaultValue: "Men" })],
                  ["female", t("boost.genderFemale", { defaultValue: "Women" })],
                ] as const).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    className={cn("fb-seg-btn", gender === id && "on")}
                    onClick={() => setGender(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Keep showDeptMap referenced for lint clarity when tab/manual overlap */}
      {showDeptMap ? null : null}

      <div className="fb-reach-card">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            {t("boost.audienceSize", { defaultValue: "Audience size (estimated)" })}
          </p>
          <p className="text-sm font-bold text-slate-900 mt-0.5 capitalize">
            {estimatedSize === "large"
              ? t("boost.reachLarge", { defaultValue: "Large" })
              : estimatedSize === "small"
                ? t("boost.reachSmall", { defaultValue: "Small" })
                : t("boost.reachMedium", { defaultValue: "Medium" })}
          </p>
          {estimatedLabel ? (
            <p className="text-xs text-slate-500 mt-0.5">{estimatedLabel}</p>
          ) : (
            <p className="text-xs text-slate-400 mt-0.5">
              {t("boost.estimateDisclaimer", { defaultValue: "Estimate only — results are not guaranteed." })}
            </p>
          )}
        </div>
        <div className="fb-reach-dots" aria-hidden>
          {[1, 2, 3].map((n) => (
            <span key={n} className={cn("fb-dot", n <= sizeDots && "on")} />
          ))}
        </div>
      </div>
    </div>
  );
});
