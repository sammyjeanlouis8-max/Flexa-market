import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { HAITI_DEPARTMENTS } from "@/lib/haitiCommunes";

/**
 * Department polygons for Haiti (viewBox 0 0 400 320).
 * Paths approximate official department boundaries for interactive targeting UI.
 * Delivery matching uses the department name identifiers, not pixel geometry.
 */
const DEPT_META: Record<string, { path: string; cx: number; cy: number; label: string }> = {
  "Nord-Ouest": {
    path: "M42,48 L110,30 L124,78 L88,102 L48,92 Z",
    cx: 84, cy: 66, label: "Nord-Ouest",
  },
  Nord: {
    path: "M110,30 L176,24 L198,62 L162,92 L124,78 Z",
    cx: 154, cy: 54, label: "Nord",
  },
  "Nord-Est": {
    path: "M176,24 L248,36 L236,82 L198,62 Z",
    cx: 214, cy: 50, label: "Nord-Est",
  },
  Artibonite: {
    path: "M88,102 L162,92 L184,132 L146,172 L92,152 Z",
    cx: 136, cy: 130, label: "Artibonite",
  },
  Centre: {
    path: "M162,92 L236,82 L252,132 L194,164 L184,132 Z",
    cx: 206, cy: 120, label: "Centre",
  },
  Ouest: {
    path: "M92,152 L146,172 L170,204 L130,252 L74,224 L68,180 Z",
    cx: 116, cy: 200, label: "Ouest",
  },
  Nippes: {
    path: "M74,224 L130,252 L116,282 L68,266 Z",
    cx: 98, cy: 254, label: "Nippes",
  },
  Sud: {
    path: "M68,266 L116,282 L106,310 L44,294 L38,270 Z",
    cx: 74, cy: 288, label: "Sud",
  },
  "Grand'Anse": {
    path: "M24,250 L68,266 L38,270 L18,280 L14,258 Z",
    cx: 36, cy: 264, label: "Grand'Anse",
  },
  "Sud-Est": {
    path: "M130,252 L170,204 L204,226 L178,272 L130,282 Z",
    cx: 162, cy: 246, label: "Sud-Est",
  },
};

type Props = {
  selected: string[];
  onToggle: (department: string) => void;
  className?: string;
  invalid?: boolean;
};

export function HaitiDepartmentsMap({ selected, onToggle, className, invalid }: Props) {
  const { t } = useTranslation();
  return (
    <div
      className={cn("fb-map-frame", invalid && "fb-map-frame-invalid", className)}
      data-testid="haiti-departments-map"
      aria-invalid={invalid || undefined}
    >
      <svg viewBox="0 0 400 320" className="w-full h-auto" role="img" aria-label={t("boost.haitiMapAria", { defaultValue: "Haiti departments map" })}>
        <defs>
          <linearGradient id="fb-map-sea" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#dbeafe" />
            <stop offset="100%" stopColor="#eff6ff" />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="400" height="320" fill="url(#fb-map-sea)" rx="16" />
        {(HAITI_DEPARTMENTS as readonly string[]).map((dept) => {
          const meta = DEPT_META[dept];
          if (!meta) return null;
          const on = selected.includes(dept);
          return (
            <g
              key={dept}
              className="fb-map-dept"
              onClick={() => onToggle(dept)}
              style={{ cursor: "pointer" }}
              role="button"
              aria-pressed={on}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onToggle(dept);
                }
              }}
            >
              <path
                d={meta.path}
                fill={on ? "#7c3aed" : "#ffffff"}
                stroke={on ? "#5b21b6" : "#94a3b8"}
                strokeWidth={on ? 2.2 : 1.4}
                className="transition-colors"
              />
              {on ? (
                <g transform={`translate(${meta.cx}, ${meta.cy - 6})`} pointerEvents="none">
                  <circle r="8" fill="#ffffff" />
                  <path
                    d="M-3.2,0.2 L-1.1,2.6 L3.6,-2.4"
                    fill="none"
                    stroke="#7c3aed"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </g>
              ) : (
                <text
                  x={meta.cx}
                  y={meta.cy}
                  textAnchor="middle"
                  fontSize="9"
                  fontWeight={600}
                  fill="#334155"
                  pointerEvents="none"
                >
                  {meta.label}
                </text>
              )}
              {on && (
                <text
                  x={meta.cx}
                  y={meta.cy + 16}
                  textAnchor="middle"
                  fontSize="8"
                  fontWeight={700}
                  fill="#ffffff"
                  pointerEvents="none"
                >
                  {meta.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
