import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/auth";
import {
  Truck, Bike, Car, User, Loader2, MapPin, AlertCircle, Clock,
  ShieldCheck, Navigation,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface DeliveryPriceResult {
  distanceKm: number;
  distanceMiles: number;
  currency: string;
  feeLocal: number;
  feeUsd: number;
  driverEarningsLocal: number;
  driverEarningsUsd: number;
  platformFeeLocal: number;
  platformFeeUsd: number;
  pricePerKm: number;
  exchangeRate: number;
  cityResolved: boolean;
  etaMinutes?: number;
  usedRoadDistance?: boolean;
  isSameCommune?: boolean;
  pricingTier?: string;
}

interface DeliveryFeeCardProps {
  productPriceUsd: number;
  sellerCity: string;
  buyerCity: string;
  country: string;
  onMethodChange?: (method: string, feeUsd: number) => void;
  compact?: boolean;
}

const METHODS = [
  { key: "motorcycle", label: "Moto",     icon: Bike, hint: "Rapid, bon mache" },
  { key: "car",        label: "Machin",   icon: Car,  hint: "Pou gwo pake" },
  { key: "self",       label: "Pa Vandè", icon: User, hint: "Vandè livre li" },
];

function formatEta(minutes: number): string {
  if (minutes <= 0) return "";
  if (minutes < 60) return `~${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `~${h}h ${m}min` : `~${h}h`;
}

export default function DeliveryFeeCard({
  productPriceUsd, sellerCity, buyerCity, country, onMethodChange, compact = false,
}: DeliveryFeeCardProps) {
  const { token } = useAuth();
  const [method, setMethod] = useState("motorcycle");
  const [price, setPrice] = useState<DeliveryPriceResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchPrice = useCallback(async (m: string) => {
    if (!sellerCity || !buyerCity) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/delivery/calculate-price", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ sellerCity, buyerCity, country, method: m, listingPriceUsd: productPriceUsd }),
      });
      if (res.ok) {
        const data = await res.json();
        setPrice(data);
        onMethodChange?.(m, data.feeUsd ?? 0);
      } else {
        setError("Kalkil pri echwe");
      }
    } catch {
      setError("Kalkil pri echwe");
    } finally {
      setLoading(false);
    }
  }, [sellerCity, buyerCity, country, token]);

  useEffect(() => { fetchPrice(method); }, [fetchPrice, method]);

  const handleMethod = (m: string) => {
    setMethod(m);
    fetchPrice(m);
  };

  const total = productPriceUsd + (price?.feeUsd ?? 0);

  if (compact) {
    return (
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground flex items-center gap-1">
          <Truck className="h-3.5 w-3.5" />
          Livrezon ({method === "self" ? "Vandè" : method === "motorcycle" ? "Moto" : "Machin"})
        </span>
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        ) : (
          <span className="font-semibold text-foreground">
            {price?.feeUsd === 0 ? "Gratis" : `+$${price?.feeUsd?.toFixed(2) ?? "—"}`}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 bg-primary/5 border-b border-border">
        <Truck className="h-4 w-4 text-primary" />
        <span className="font-bold text-sm">Metòd Livrezon</span>
        <div className="ml-auto flex items-center gap-1.5">
          {price?.usedRoadDistance && (
            <Badge className="text-[10px] bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200 dark:border-blue-700/30 gap-1">
              <Navigation className="h-2.5 w-2.5" /> Wout reyèl
            </Badge>
          )}
          {price && !price.cityResolved && (
            <Badge variant="secondary" className="text-[10px] gap-0.5">
              <AlertCircle className="h-2.5 w-2.5" /> Estimasyon
            </Badge>
          )}
        </div>
      </div>

      {/* Method selector */}
      <div className="grid grid-cols-3 gap-2 p-3">
        {METHODS.map(({ key, label, icon: Icon, hint }) => (
          <button
            key={key}
            type="button"
            onClick={() => handleMethod(key)}
            className={`flex flex-col items-center gap-1 p-3 rounded-xl border text-center transition-all ${
              method === key
                ? "border-primary bg-primary/10 text-primary"
                : "border-border hover:border-primary/40 text-muted-foreground"
            }`}
          >
            <Icon className="h-5 w-5" />
            <span className="text-xs font-bold">{label}</span>
            <span className="text-[9px] opacity-60">{hint}</span>
          </button>
        ))}
      </div>

      {/* Distance + ETA info */}
      {price && price.distanceKm > 0 && (
        <div className="px-4 pb-2 space-y-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3 shrink-0" />
            <span className="font-medium text-foreground">{sellerCity}</span>
            <span>→</span>
            <span className="font-medium text-foreground">{buyerCity}</span>
            <span>·</span>
            <span>{price.distanceKm.toFixed(1)} km</span>
            <span className="text-[10px] opacity-70">({price.distanceMiles.toFixed(1)} mi)</span>
          </div>
          {price.etaMinutes && price.etaMinutes > 0 && (
            <div className="flex items-center gap-1.5 text-xs">
              <Clock className="h-3 w-3 text-primary shrink-0" />
              <span className="text-muted-foreground">Tan estimasyon:</span>
              <span className="font-bold text-foreground">{formatEta(price.etaMinutes)}</span>
              <span className="text-[10px] text-muted-foreground/60">(trajet + 15min pou ranmase)</span>
            </div>
          )}
        </div>
      )}

      {/* Price breakdown */}
      <div className="px-4 pb-4 space-y-2">
        {loading ? (
          <div className="flex justify-center py-3">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <p className="text-xs text-destructive text-center py-2">{error}</p>
        ) : price ? (
          <>
            <div className="space-y-1.5 text-sm">
              {/* Product price */}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Pwodwi</span>
                <span className="font-semibold">${productPriceUsd.toFixed(2)}</span>
              </div>

              {/* Delivery fee */}
              <div className="flex justify-between">
                <span className="text-muted-foreground flex items-center gap-1">
                  Livrezon
                  {price.currency !== "USD" && price.feeLocal > 0 && (
                    <span className="text-[10px] opacity-60">
                      ({price.feeLocal.toLocaleString()} {price.currency})
                    </span>
                  )}
                </span>
                <span className={`font-semibold ${price.feeUsd === 0 ? "text-green-600" : "text-foreground"}`}>
                  {price.feeUsd === 0 ? "Gratis" : `+$${price.feeUsd.toFixed(2)}`}
                </span>
              </div>

              {/* Formula / tier note */}
              {price.feeUsd > 0 && (
                <div className="text-[10px] text-muted-foreground/70 text-right">
                  {price.isSameCommune
                    ? `Menm komin · Frè flat ${
                        price.pricingTier === "same_commune_light" ? "$10 (lejè)" :
                        price.pricingTier === "same_commune_medium" ? "$15 (mwayen)" :
                        "$20 (lou/chè)"
                      }`
                    : `$4 / 7 km · ${price.distanceKm.toFixed(1)} km`
                  }
                </div>
              )}

              {/* Driver earnings (85%) */}
              {price.feeUsd > 0 && (
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block shrink-0" />
                    Chauffè resevwa (85%)
                  </span>
                  <span className="font-semibold text-foreground">
                    ${price.driverEarningsUsd.toFixed(2)}
                    {price.currency !== "USD" && (
                      <span className="text-[10px] text-muted-foreground ml-1">
                        ({price.driverEarningsLocal.toLocaleString()} {price.currency})
                      </span>
                    )}
                  </span>
                </div>
              )}

              {/* Platform fee (15%) */}
              {price.feeUsd > 0 && (
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-orange-400 inline-block shrink-0" />
                    Platfòm Flexa (15%)
                  </span>
                  <span className="text-muted-foreground">
                    ${price.platformFeeUsd.toFixed(2)}
                  </span>
                </div>
              )}
            </div>

            {/* Total */}
            <div className="border-t border-border pt-2 mt-2">
              <div className="flex justify-between items-center">
                <span className="font-bold text-sm">Total</span>
                <span className="text-xl font-black text-primary">${total.toFixed(2)}</span>
              </div>
              {price.currency !== "USD" && price.feeUsd > 0 && (
                <p className="text-[10px] text-muted-foreground text-right mt-0.5">
                  1 USD = {price.exchangeRate} {price.currency}
                </p>
              )}
            </div>

            {/* Security note */}
            <div className="flex items-start gap-1.5 text-[10px] text-muted-foreground/70 pt-1 border-t border-border/50">
              <ShieldCheck className="h-3 w-3 text-primary/60 shrink-0 mt-0.5" />
              Pri kalkile an sekirite pa sèvè. Pa gen modifikasyon manual posib.
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

// ── Standalone price estimator (for listing detail page) ─────────────────────

interface PriceEstimatorProps {
  sellerCity: string;
  country: string;
}

export function DeliveryPriceEstimator({ sellerCity, country }: PriceEstimatorProps) {
  const { token } = useAuth();
  const [buyerCity, setBuyerCity] = useState("");
  const [method, setMethod] = useState("motorcycle");
  const [price, setPrice] = useState<DeliveryPriceResult | null>(null);
  const [loading, setLoading] = useState(false);

  const DELIVERY_COUNTRIES = ["Haiti", "Dominican Republic"];
  if (!DELIVERY_COUNTRIES.includes(country)) return null;

  const estimate = async () => {
    if (!buyerCity.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/delivery/calculate-price", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ sellerCity, buyerCity, country, method }),
      });
      if (res.ok) setPrice(await res.json());
    } finally { setLoading(false); }
  };

  return (
    <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
      <h3 className="font-bold text-sm flex items-center gap-2">
        <Truck className="h-4 w-4 text-primary" /> Kalkile Pri Livrezon
        <span className="text-[10px] font-normal text-muted-foreground ml-auto">Menm komin $10-20 · Inter-vil $4/7km</span>
      </h3>
      <div className="flex gap-2">
        <input
          value={buyerCity}
          onChange={e => setBuyerCity(e.target.value)}
          placeholder="Vil ou (adr. livrezon)"
          className="flex-1 border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-background"
        />
        <Button size="sm" onClick={estimate} disabled={loading || !buyerCity.trim()} className="rounded-xl">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Kalkile"}
        </Button>
      </div>
      <div className="flex gap-2">
        {[
          { key: "motorcycle", label: "🏍 Moto" },
          { key: "car",        label: "🚗 Machin" },
        ].map(m => (
          <button
            key={m.key}
            type="button"
            onClick={() => { setMethod(m.key); setPrice(null); }}
            className={`flex-1 py-1.5 rounded-lg border text-xs font-semibold transition-all ${method === m.key ? "border-primary bg-primary/10 text-primary" : "border-border"}`}
          >
            {m.label}
          </button>
        ))}
      </div>
      {price && (
        <div className="bg-primary/5 rounded-xl p-3 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Distans</span>
            <span className="font-semibold">{price.distanceKm.toFixed(1)} km</span>
          </div>
          {price.etaMinutes && price.etaMinutes > 0 && (
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" /> Tan estimasyon
              </span>
              <span className="font-bold">{formatEta(price.etaMinutes)}</span>
            </div>
          )}
          <div className="flex justify-between font-bold border-t border-border/50 pt-1">
            <span>Frè Livrezon</span>
            <span className="text-primary">
              {price.feeLocal.toLocaleString()} {price.currency}
              <span className="text-xs font-normal text-muted-foreground ml-1">(≈${price.feeUsd.toFixed(2)})</span>
            </span>
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Chauffè resevwa (85%)</span>
            <span className="font-semibold text-emerald-600">${price.driverEarningsUsd.toFixed(2)}</span>
          </div>
          {price.usedRoadDistance && (
            <p className="text-[10px] text-blue-600 flex items-center gap-1">
              <Navigation className="h-2.5 w-2.5" /> Distans wout reyèl (OSRM)
            </p>
          )}
          {!price.cityResolved && (
            <p className="text-[10px] text-amber-600">* Distans estimasyon (vil pa jwenn egzakteman)</p>
          )}
        </div>
      )}
    </div>
  );
}
