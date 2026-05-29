import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { BODY_STYLE_LABELS, getColorHex, type VehicleBodyStyle } from "@/lib/vehicleCatalog";

interface Props {
  brand: string;
  model: string;
  year: string;
  color: string;
  bodyStyle: VehicleBodyStyle | "";
  vehicleType: string;
  adminImageUrl?: string | null;
}

// ── SVG Silhouettes ────────────────────────────────────────────────────────────

function SedanSvg({ fill, isWhite }: { fill: string; isWhite: boolean }) {
  const stroke = isWhite ? "#9CA3AF" : "rgba(0,0,0,0.25)";
  return (
    <svg viewBox="0 0 280 110" className="w-full h-full" aria-hidden>
      {/* Shadow */}
      <ellipse cx="140" cy="103" rx="118" ry="6" fill="rgba(0,0,0,0.12)" />
      {/* Body */}
      <path d="M18 78 C18 72 25 62 35 58 L52 46 L72 34 L208 34 L228 46 L245 58 C255 62 262 72 262 78 L262 88 L18 88 Z" fill={fill} stroke={stroke} strokeWidth="1.8" />
      {/* Roof */}
      <path d="M78 34 L92 13 L188 13 L202 34 Z" fill={fill} stroke={stroke} strokeWidth="1.8" />
      {/* Windshield */}
      <path d="M86 34 L97 16 L140 16 L140 34 Z" fill="rgba(173,216,230,0.55)" stroke={stroke} strokeWidth="1.2" />
      {/* Rear window */}
      <path d="M140 34 L140 16 L183 16 L194 34 Z" fill="rgba(173,216,230,0.55)" stroke={stroke} strokeWidth="1.2" />
      {/* Center pillar */}
      <line x1="140" y1="13" x2="140" y2="34" stroke={stroke} strokeWidth="2.5" />
      {/* Door line */}
      <line x1="140" y1="34" x2="140" y2="86" stroke={stroke} strokeWidth="1.5" strokeOpacity="0.5" />
      {/* Rear wheel */}
      <circle cx="72" cy="88" r="21" fill="#374151" />
      <circle cx="72" cy="88" r="13" fill="#6B7280" />
      <circle cx="72" cy="88" r="6" fill="#9CA3AF" />
      {/* Front wheel */}
      <circle cx="208" cy="88" r="21" fill="#374151" />
      <circle cx="208" cy="88" r="13" fill="#6B7280" />
      <circle cx="208" cy="88" r="6" fill="#9CA3AF" />
      {/* Headlight */}
      <ellipse cx="255" cy="64" rx="9" ry="5" fill="rgba(255,255,200,0.9)" stroke={stroke} strokeWidth="1" />
      {/* Taillight */}
      <ellipse cx="25" cy="64" rx="9" ry="5" fill="rgba(255,80,80,0.85)" stroke={stroke} strokeWidth="1" />
      {/* Door handle */}
      <rect x="100" y="60" width="14" height="4" rx="2" fill={stroke} fillOpacity="0.4" />
      <rect x="165" y="60" width="14" height="4" rx="2" fill={stroke} fillOpacity="0.4" />
      {/* Bumper highlights */}
      <path d="M262 78 L262 88" stroke={stroke} strokeWidth="2" />
      <path d="M18 78 L18 88" stroke={stroke} strokeWidth="2" />
    </svg>
  );
}

function SuvSvg({ fill, isWhite }: { fill: string; isWhite: boolean }) {
  const stroke = isWhite ? "#9CA3AF" : "rgba(0,0,0,0.25)";
  return (
    <svg viewBox="0 0 280 115" className="w-full h-full" aria-hidden>
      <ellipse cx="140" cy="108" rx="122" ry="6" fill="rgba(0,0,0,0.12)" />
      {/* Body */}
      <path d="M15 80 L15 55 L22 45 L50 38 L230 38 L258 45 L265 55 L265 80 L265 92 L15 92 Z" fill={fill} stroke={stroke} strokeWidth="1.8" />
      {/* Roof */}
      <path d="M50 38 L50 12 L230 12 L230 38 Z" fill={fill} stroke={stroke} strokeWidth="1.8" />
      {/* Windshield */}
      <path d="M55 38 L55 15 L138 15 L138 38 Z" fill="rgba(173,216,230,0.55)" stroke={stroke} strokeWidth="1.2" />
      {/* Rear glass */}
      <path d="M142 38 L142 15 L225 15 L225 38 Z" fill="rgba(173,216,230,0.55)" stroke={stroke} strokeWidth="1.2" />
      {/* Center pillar */}
      <line x1="140" y1="12" x2="140" y2="92" stroke={stroke} strokeWidth="2.5" />
      {/* B pillar */}
      <line x1="80" y1="12" x2="80" y2="92" stroke={stroke} strokeWidth="1.5" strokeOpacity="0.4" />
      <line x1="200" y1="12" x2="200" y2="92" stroke={stroke} strokeWidth="1.5" strokeOpacity="0.4" />
      {/* Rear wheel */}
      <circle cx="70" cy="92" r="23" fill="#374151" />
      <circle cx="70" cy="92" r="15" fill="#6B7280" />
      <circle cx="70" cy="92" r="7" fill="#9CA3AF" />
      {/* Front wheel */}
      <circle cx="210" cy="92" r="23" fill="#374151" />
      <circle cx="210" cy="92" r="15" fill="#6B7280" />
      <circle cx="210" cy="92" r="7" fill="#9CA3AF" />
      {/* Headlight */}
      <rect x="253" y="55" width="14" height="8" rx="3" fill="rgba(255,255,200,0.9)" stroke={stroke} strokeWidth="1" />
      {/* Taillight */}
      <rect x="13" y="55" width="14" height="8" rx="3" fill="rgba(255,80,80,0.85)" stroke={stroke} strokeWidth="1" />
      {/* Roof rack */}
      <rect x="55" y="9" width="170" height="4" rx="2" fill={stroke} fillOpacity="0.3" />
      {/* Ground clearance line */}
      <path d="M15 85 L265 85" stroke={stroke} strokeWidth="1" strokeOpacity="0.2" strokeDasharray="4 3" />
    </svg>
  );
}

function PickupSvg({ fill, isWhite }: { fill: string; isWhite: boolean }) {
  const stroke = isWhite ? "#9CA3AF" : "rgba(0,0,0,0.25)";
  return (
    <svg viewBox="0 0 300 115" className="w-full h-full" aria-hidden>
      <ellipse cx="150" cy="108" rx="132" ry="6" fill="rgba(0,0,0,0.12)" />
      {/* Cab */}
      <path d="M18 85 L18 55 L28 44 L55 35 L150 35 L158 44 L162 55 L162 85 Z" fill={fill} stroke={stroke} strokeWidth="1.8" />
      {/* Cab roof */}
      <path d="M55 35 L55 12 L150 12 L158 35 Z" fill={fill} stroke={stroke} strokeWidth="1.8" />
      {/* Windshield */}
      <path d="M60 35 L60 15 L148 15 L155 35 Z" fill="rgba(173,216,230,0.55)" stroke={stroke} strokeWidth="1.2" />
      {/* Bed */}
      <path d="M162 55 L162 75 L282 75 L282 55 L265 45 L162 45 Z" fill={fill} stroke={stroke} strokeWidth="1.8" />
      {/* Bed floor */}
      <rect x="163" y="74" width="118" height="5" rx="1" fill={stroke} fillOpacity="0.3" />
      {/* Bed rails */}
      <rect x="163" y="44" width="2" height="32" fill={stroke} fillOpacity="0.3" />
      <rect x="280" y="44" width="2" height="32" fill={stroke} fillOpacity="0.3" />
      {/* Rear wheel */}
      <circle cx="70" cy="88" r="22" fill="#374151" />
      <circle cx="70" cy="88" r="14" fill="#6B7280" />
      <circle cx="70" cy="88" r="6" fill="#9CA3AF" />
      {/* Front wheel */}
      <circle cx="228" cy="88" r="22" fill="#374151" />
      <circle cx="228" cy="88" r="14" fill="#6B7280" />
      <circle cx="228" cy="88" r="6" fill="#9CA3AF" />
      {/* Headlight */}
      <ellipse cx="22" cy="60" rx="7" ry="5" fill="rgba(255,255,200,0.9)" stroke={stroke} strokeWidth="1" />
      {/* Taillight */}
      <rect x="277" y="57" width="6" height="10" rx="2" fill="rgba(255,80,80,0.85)" stroke={stroke} strokeWidth="1" />
    </svg>
  );
}

function TruckSvg({ fill, isWhite }: { fill: string; isWhite: boolean }) {
  const stroke = isWhite ? "#9CA3AF" : "rgba(0,0,0,0.25)";
  return (
    <svg viewBox="0 0 300 120" className="w-full h-full" aria-hidden>
      <ellipse cx="150" cy="113" rx="133" ry="6" fill="rgba(0,0,0,0.12)" />
      {/* Cab */}
      <path d="M12 90 L12 50 L18 35 L55 28 L100 28 L110 50 L110 90 Z" fill={fill} stroke={stroke} strokeWidth="1.8" />
      {/* Cab roof */}
      <path d="M18 35 L55 15 L100 15 L110 28 L100 28 L55 28 L18 35 Z" fill={fill} stroke={stroke} strokeWidth="1.8" />
      {/* Windshield */}
      <path d="M22 35 L58 18 L98 18 L105 35 Z" fill="rgba(173,216,230,0.55)" stroke={stroke} strokeWidth="1.2" />
      {/* Cargo body */}
      <rect x="110" y="28" width="177" height="65" rx="4" fill={fill} stroke={stroke} strokeWidth="1.8" />
      {/* Cargo door lines */}
      <line x1="175" y1="28" x2="175" y2="93" stroke={stroke} strokeWidth="1.2" strokeOpacity="0.4" />
      <line x1="230" y1="28" x2="230" y2="93" stroke={stroke} strokeWidth="1.2" strokeOpacity="0.4" />
      {/* Rear wheels (dual) */}
      <circle cx="240" cy="96" r="21" fill="#374151" />
      <circle cx="240" cy="96" r="13" fill="#6B7280" />
      <circle cx="240" cy="96" r="6" fill="#9CA3AF" />
      {/* Front wheel */}
      <circle cx="55" cy="96" r="21" fill="#374151" />
      <circle cx="55" cy="96" r="13" fill="#6B7280" />
      <circle cx="55" cy="96" r="6" fill="#9CA3AF" />
      {/* Headlight */}
      <rect x="13" y="55" width="8" height="10" rx="3" fill="rgba(255,255,200,0.9)" stroke={stroke} strokeWidth="1" />
      {/* Taillight */}
      <rect x="283" y="55" width="6" height="10" rx="3" fill="rgba(255,80,80,0.85)" stroke={stroke} strokeWidth="1" />
      {/* Exhaust stack */}
      <rect x="100" y="10" width="8" height="22" rx="3" fill="#6B7280" />
    </svg>
  );
}

function MotoSvg({ fill, isWhite }: { fill: string; isWhite: boolean }) {
  const stroke = isWhite ? "#9CA3AF" : "rgba(0,0,0,0.25)";
  return (
    <svg viewBox="0 0 240 110" className="w-full h-full" aria-hidden>
      <ellipse cx="120" cy="104" rx="95" ry="5" fill="rgba(0,0,0,0.12)" />
      {/* Rear wheel */}
      <circle cx="55" cy="82" r="26" fill="#374151" stroke={stroke} strokeWidth="1.5" />
      <circle cx="55" cy="82" r="17" fill="#6B7280" />
      <circle cx="55" cy="82" r="7" fill="#9CA3AF" />
      {/* Front wheel */}
      <circle cx="185" cy="82" r="26" fill="#374151" stroke={stroke} strokeWidth="1.5" />
      <circle cx="185" cy="82" r="17" fill="#6B7280" />
      <circle cx="185" cy="82" r="7" fill="#9CA3AF" />
      {/* Frame */}
      <path d="M55 82 L85 50 L150 50 L185 82" stroke={stroke} strokeWidth="3" fill="none" />
      {/* Swing arm */}
      <path d="M95 68 L55 82" stroke="#6B7280" strokeWidth="4" fill="none" />
      {/* Fork */}
      <path d="M175 55 L185 82" stroke="#6B7280" strokeWidth="4" fill="none" />
      <path d="M168 52 L178 79" stroke="#6B7280" strokeWidth="4" fill="none" />
      {/* Tank */}
      <path d="M90 55 C90 35 155 35 155 55 L150 68 L95 68 Z" fill={fill} stroke={stroke} strokeWidth="1.8" />
      {/* Seat */}
      <path d="M90 57 C90 53 95 51 95 51 L152 51 C156 51 158 53 158 57 L155 60 L90 60 Z" fill={fill} stroke={stroke} strokeWidth="1.5" />
      {/* Engine */}
      <rect x="100" y="68" width="45" height="22" rx="5" fill="#6B7280" stroke={stroke} strokeWidth="1.5" />
      {/* Exhaust */}
      <path d="M100 82 L70 90 L60 90" stroke="#9CA3AF" strokeWidth="4" fill="none" strokeLinecap="round" />
      {/* Handlebars */}
      <line x1="163" y1="50" x2="175" y2="38" stroke="#6B7280" strokeWidth="4" strokeLinecap="round" />
      <line x1="175" y1="38" x2="185" y2="40" stroke="#6B7280" strokeWidth="3.5" strokeLinecap="round" />
      <line x1="175" y1="38" x2="170" y2="42" stroke="#6B7280" strokeWidth="3.5" strokeLinecap="round" />
      {/* Headlight */}
      <ellipse cx="190" cy="68" rx="8" ry="7" fill="rgba(255,255,200,0.9)" stroke={stroke} strokeWidth="1" />
      {/* Taillight */}
      <ellipse cx="45" cy="72" rx="7" ry="5" fill="rgba(255,80,80,0.85)" stroke={stroke} strokeWidth="1" />
    </svg>
  );
}

function ScooterSvg({ fill, isWhite }: { fill: string; isWhite: boolean }) {
  const stroke = isWhite ? "#9CA3AF" : "rgba(0,0,0,0.25)";
  return (
    <svg viewBox="0 0 220 110" className="w-full h-full" aria-hidden>
      <ellipse cx="110" cy="104" rx="88" ry="5" fill="rgba(0,0,0,0.12)" />
      {/* Rear wheel */}
      <circle cx="45" cy="82" r="23" fill="#374151" stroke={stroke} strokeWidth="1.5" />
      <circle cx="45" cy="82" r="14" fill="#6B7280" />
      <circle cx="45" cy="82" r="6" fill="#9CA3AF" />
      {/* Front wheel */}
      <circle cx="175" cy="82" r="23" fill="#374151" stroke={stroke} strokeWidth="1.5" />
      <circle cx="175" cy="82" r="14" fill="#6B7280" />
      <circle cx="175" cy="82" r="6" fill="#9CA3AF" />
      {/* Step-through body */}
      <path d="M45 75 L55 50 L80 45 L80 70 L140 70 L140 45 L160 45 L175 75 Z" fill={fill} stroke={stroke} strokeWidth="1.8" />
      {/* Front fairing */}
      <path d="M145 45 L160 30 L175 35 L175 55 L160 52 L145 50 Z" fill={fill} stroke={stroke} strokeWidth="1.5" />
      {/* Windscreen */}
      <path d="M152 45 L165 32 L172 36 L162 50 Z" fill="rgba(173,216,230,0.55)" stroke={stroke} strokeWidth="1" />
      {/* Floor board */}
      <rect x="80" y="68" width="60" height="8" rx="3" fill={stroke} fillOpacity="0.25" />
      {/* Seat */}
      <path d="M78 45 C78 38 82 35 90 35 L135 35 C143 35 145 38 145 45 L140 48 L80 48 Z" fill={fill} stroke={stroke} strokeWidth="1.5" />
      {/* Under-seat storage (delivery box) */}
      <rect x="50" y="56" width="30" height="22" rx="4" fill={stroke} fillOpacity="0.2" stroke={stroke} strokeWidth="1.2" />
      {/* Headlight */}
      <ellipse cx="178" cy="56" rx="8" ry="6" fill="rgba(255,255,200,0.9)" stroke={stroke} strokeWidth="1" />
      {/* Taillight */}
      <ellipse cx="40" cy="70" rx="7" ry="4" fill="rgba(255,80,80,0.85)" stroke={stroke} strokeWidth="1" />
      {/* Handlebars */}
      <line x1="158" y1="42" x2="168" y2="30" stroke="#6B7280" strokeWidth="3.5" strokeLinecap="round" />
      <line x1="168" y1="30" x2="178" y2="33" stroke="#6B7280" strokeWidth="3" strokeLinecap="round" />
      <line x1="168" y1="30" x2="162" y2="35" stroke="#6B7280" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function VehicleSvg({ bodyStyle, color }: { bodyStyle: VehicleBodyStyle | ""; color: string | null }) {
  const fill = color ?? "#9CA3AF";
  const isWhite = fill === "#D1D5DB" || fill === "#E5E7EB" || fill === "#FFFFFF";
  const resolved = (bodyStyle || "sedan") as VehicleBodyStyle;
  switch (resolved) {
    case "suv":     return <SuvSvg fill={fill} isWhite={isWhite} />;
    case "pickup":  return <PickupSvg fill={fill} isWhite={isWhite} />;
    case "truck":   return <TruckSvg fill={fill} isWhite={isWhite} />;
    case "moto":    return <MotoSvg fill={fill} isWhite={isWhite} />;
    case "scooter": return <ScooterSvg fill={fill} isWhite={isWhite} />;
    default:        return <SedanSvg fill={fill} isWhite={isWhite} />;
  }
}

// ── Preview Card ───────────────────────────────────────────────────────────────

export default function VehiclePreviewCard({ brand, model, year, color, bodyStyle, vehicleType, adminImageUrl }: Props) {
  const [imgError, setImgError] = useState(false);
  const [imgLoading, setImgLoading] = useState(false);

  const colorHex = getColorHex(color);
  const hasSelection = !!(brand || bodyStyle || vehicleType);
  const styleLabel = bodyStyle ? BODY_STYLE_LABELS[bodyStyle] : null;

  const showAdminImg = adminImageUrl && !imgError;

  useEffect(() => {
    if (adminImageUrl) {
      setImgError(false);
      setImgLoading(true);
    }
  }, [adminImageUrl]);

  return (
    <div className="rounded-2xl border border-border bg-gradient-to-b from-card to-muted/30 overflow-hidden shadow-sm">
      {/* Vehicle visualization */}
      <div className="relative p-4 pb-2 min-h-[140px] flex items-center justify-center bg-gradient-to-b from-muted/20 to-transparent">
        {/* Color bg circle glow */}
        {colorHex && (
          <div
            className="absolute inset-0 opacity-[0.07] transition-all duration-500"
            style={{ background: `radial-gradient(ellipse at center, ${colorHex} 0%, transparent 70%)` }}
          />
        )}

        {showAdminImg ? (
          <div className="relative w-full aspect-video max-h-36 flex items-center justify-center">
            {imgLoading && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            )}
            <img
              src={adminImageUrl!}
              alt={`${brand} ${model}`}
              className={`w-full h-full object-contain transition-opacity duration-300 ${imgLoading ? "opacity-0" : "opacity-100"}`}
              onLoad={() => setImgLoading(false)}
              onError={() => { setImgError(true); setImgLoading(false); }}
            />
          </div>
        ) : (
          <div className={`w-full max-w-[260px] transition-all duration-500 ${hasSelection ? "opacity-100 scale-100" : "opacity-40 scale-95"}`}>
            <VehicleSvg bodyStyle={bodyStyle} color={colorHex} />
          </div>
        )}

        {/* Empty state */}
        {!hasSelection && (
          <div className="absolute inset-0 flex items-center justify-center text-center px-4">
            <p className="text-xs text-muted-foreground/60 font-medium">
              Chwazi tip veyikil ou pou wè preview
            </p>
          </div>
        )}
      </div>

      {/* Info strip */}
      <div className="px-4 pb-4 pt-1 space-y-2">
        {/* Brand + model */}
        {(brand || model) ? (
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-bold text-sm text-foreground truncate">
                {[brand, model].filter(Boolean).join(" ") || "—"}
              </p>
              {year && (
                <p className="text-xs text-muted-foreground">{year}</p>
              )}
            </div>
            {styleLabel && (
              <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                {styleLabel}
              </span>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic">Mak / Modèl poko chwazi</p>
        )}

        {/* Color swatch row */}
        {color && (
          <div className="flex items-center gap-2">
            <div
              className="h-4 w-4 rounded-full border border-border shrink-0 shadow-sm"
              style={{ background: colorHex ?? "#9CA3AF" }}
            />
            <span className="text-xs text-muted-foreground capitalize">{color}</span>
          </div>
        )}

        {/* Status chips */}
        <div className="flex flex-wrap gap-1 pt-0.5">
          {brand && (
            <span className="text-[10px] font-semibold bg-green-500/10 text-green-600 dark:text-green-400 px-2 py-0.5 rounded-full">
              ✓ {brand}
            </span>
          )}
          {model && (
            <span className="text-[10px] font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-full">
              ✓ {model}
            </span>
          )}
          {colorHex && (
            <span className="text-[10px] font-semibold bg-primary/10 text-primary px-2 py-0.5 rounded-full">
              ✓ Koulè
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
