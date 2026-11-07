import { cn } from "@/lib/utils";
import { HAITI_DEPARTMENTS } from "@/lib/haitiCommunes";

/** Approximate centroids for pins (viewBox 0 0 400 320). */
const DEPT_META: Record<string, { path: string; cx: number; cy: number; label: string }> = {
  "Nord-Ouest": {
    path: "M48,42 L118,28 L128,72 L96,98 L52,88 Z",
    cx: 88, cy: 62, label: "Nord-Ouest",
  },
  Nord: {
    path: "M118,28 L178,22 L198,58 L168,88 L128,72 Z",
    cx: 158, cy: 52, label: "Nord",
  },
  "Nord-Est": {
    path: "M178,22 L248,34 L238,78 L198,58 Z",
    cx: 214, cy: 48, label: "Nord-Est",
  },
  Artibonite: {
    path: "M96,98 L168,88 L186,128 L148,168 L98,148 Z",
    cx: 140, cy: 128, label: "Artibonite",
  },
  Centre: {
    path: "M168,88 L238,78 L252,128 L198,158 L186,128 Z",
    cx: 208, cy: 118, label: "Centre",
  },
  Ouest: {
    path: "M98,148 L148,168 L168,198 L132,248 L78,220 L72,178 Z",
    cx: 118, cy: 198, label: "Ouest",
  },
  Nippes: {
    path: "M78,220 L132,248 L118,278 L72,262 Z",
    cx: 100, cy: 252, label: "Nippes",
  },
  Sud: {
    path: "M72,262 L118,278 L108,308 L48,292 L42,268 Z",
    cx: 78, cy: 286, label: "Sud",
  },
  "Grand'Anse": {
    path: "M28,248 L72,262 L42,268 L22,278 L18,258 Z",
    cx: 38, cy: 262, label: "Grand'Anse",
  },
  "Sud-Est": {
    path: "M132,248 L168,198 L198,220 L178,268 L132,278 Z",
    cx: 160, cy: 242, label: "Sud-Est",
  },
};

type Props = {
  selected: string[];
  onToggle: (department: string) => void;
  className?: string;
};

export function HaitiDepartmentsMap({ selected, onToggle, className }: Props) {
  return (
    <div className={cn("fb-map-frame", className)}>
      <svg viewBox="0 0 400 320" className="w-full h-auto" role="img" aria-label="Haiti departments map">
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
            <g key={dept} className="fb-map-dept" onClick={() => onToggle(dept)} style={{ cursor: "pointer" }}>
              <path
                d={meta.path}
                fill={on ? "#7c3aed" : "#ffffff"}
                stroke={on ? "#5b21b6" : "#94a3b8"}
                strokeWidth={on ? 2.2 : 1.4}
                className="transition-colors"
              />
              <text
                x={meta.cx}
                y={meta.cy}
                textAnchor="middle"
                fontSize="9"
                fontWeight={on ? 700 : 600}
                fill={on ? "#fff" : "#334155"}
                pointerEvents="none"
              >
                {meta.label}
              </text>
              {on && (
                <circle cx={meta.cx} cy={meta.cy - 14} r="5" fill="#2563eb" stroke="#fff" strokeWidth="1.5" />
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
