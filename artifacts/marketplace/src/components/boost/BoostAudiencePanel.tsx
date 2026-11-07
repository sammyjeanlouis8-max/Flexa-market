import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { COUNTRY_FLAGS } from "@/lib/countries";
import { HAITI_COMMUNES_BY_DEPARTMENT, HAITI_DEPARTMENTS } from "@/lib/haitiCommunes";
import { HaitiDepartmentsMap } from "./HaitiDepartmentsMap";
import { MobileSelect } from "@/components/ui/mobile-select";

export type AudienceTab = "automatic" | "manual" | "map";
export type MapTool = "areas" | "radius";

const RADIUS_OPTIONS = [5, 10, 20, 25, 50] as const;

type Props = {
  country: string;
  audienceType: "advantage_plus" | "custom";
  onAudienceType: (v: "advantage_plus" | "custom") => void;
  audState: string;
  setAudState: (v: string) => void;
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
};

export function BoostAudiencePanel({
  country,
  audienceType,
  onAudienceType,
  audState,
  setAudState,
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
}: Props) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<AudienceTab>(audienceType === "custom" ? "manual" : "automatic");
  const [mapTool, setMapTool] = useState<MapTool>("areas");
  const [cityQuery, setCityQuery] = useState("");
  const isHaiti = country === "Haiti";
  const flag = COUNTRY_FLAGS[country] ?? "🌍";

  const communes = useMemo(() => {
    if (!isHaiti || !audState) return [];
    return HAITI_COMMUNES_BY_DEPARTMENT[audState] ?? [];
  }, [isHaiti, audState]);

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
    if (audCities.includes(city)) setAudCities(audCities.filter((c) => c !== city));
    else setAudCities([...audCities, city]);
  };

  const toggleDepartment = (dept: string) => {
    if (audState === dept) {
      setAudState("");
      setAudCities([]);
      return;
    }
    setAudState(dept);
    setAudCities([]);
    onAudienceType("custom");
  };

  const sizeDots = estimatedSize === "large" ? 3 : estimatedSize === "medium" ? 2 : 1;

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

      {tab === "manual" && (
        <div className="space-y-3">
          {isHaiti ? (
            <>
              <label className="fb-label">{t("boost.department")}</label>
              <MobileSelect
                value={audState}
                onValueChange={(v) => { setAudState(v); setAudCities([]); }}
                placeholder={t("boost.selectDepartment")}
                options={HAITI_DEPARTMENTS.map((d) => ({ value: d, label: d }))}
                data-testid="select-audience-state"
              />
              <label className="fb-label">{t("boost.commune")}</label>
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
                {!audState && (
                  <p className="text-xs text-slate-500 px-1 py-2">
                    {t("boost.selectDepartmentFirst", { defaultValue: "Select a department to see communes." })}
                  </p>
                )}
              </div>
            </>
          ) : (
            <p className="text-xs text-slate-500">
              {t("boost.manualNonHaiti", {
                defaultValue: "Use city tags and radius to target buyers in your country.",
              })}
            </p>
          )}

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
        </div>
      )}

      {tab === "map" && (
        <div className="space-y-3">
          {isHaiti ? (
            <>
              <HaitiDepartmentsMap
                selected={audState ? [audState] : []}
                onToggle={toggleDepartment}
              />
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

              {mapTool === "radius" && (
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

              {(audState || audCities.length > 0) && (
                <div className="fb-selected-tags">
                  <span className="text-xs font-semibold text-slate-500">
                    {t("boost.selectedAreas", { defaultValue: "Selected areas" })} ({audState ? 1 : 0}{(audCities.length ? ` · ${audCities.length}` : "")})
                  </span>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {audState && (
                      <span className="fb-tag">
                        {audState}
                        <button type="button" onClick={() => { setAudState(""); setAudCities([]); }}>×</button>
                      </span>
                    )}
                    {audCities.map((c) => (
                      <span key={c} className="fb-tag">
                        {mapTool === "radius" ? `${c} (${audRadiusKm} km)` : c}
                        <button type="button" onClick={() => toggleCity(c)}>×</button>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="fb-auto-card">
              <p className="text-sm font-semibold">
                {t("boost.mapCenteredOn", { defaultValue: "Map centered on" })} {country}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {t("boost.mapNonHaitiHint", {
                  defaultValue: "Department map is available for Haiti. Use Manual targeting for other countries.",
                })}
              </p>
            </div>
          )}
        </div>
      )}

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
}
