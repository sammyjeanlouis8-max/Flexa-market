import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth";
import { useSocket } from "@/hooks/useSocket";
import {
  MapPin, Bike, Car, RefreshCw, Wifi, WifiOff, Users,
  ChevronLeft, Phone, Star, Shield,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface LiveDriver {
  id: number;
  userId: number;
  name: string | null;
  avatar: string | null;
  phone: string | null;
  latitude: number | null;
  longitude: number | null;
  lastLocationAt: string | null;
  isOnline: boolean | null;
  commune: string | null;
  zone: string | null;
  vehicleType: string | null;
  vehicleBrand: string | null;
  vehicleModel: string | null;
  vehicleColor: string | null;
  licensePlateNumber: string | null;
  rating: number | null;
  deliveryCount: number | null;
  status: string | null;
  country: string | null;
}

// Map Haiti/DR bbox → SVG 560×360 coords
function toSvgCoords(lat: number, lng: number): [number, number] {
  const svgW = 560;
  const svgH = 360;
  const latMin = 17.8; const latMax = 20.2;
  const lngMin = -74.6; const lngMax = -68.5;
  const x = Math.max(8, Math.min(svgW - 8, ((lng - lngMin) / (lngMax - lngMin)) * svgW));
  const y = Math.max(8, Math.min(svgH - 8, ((latMax - lat) / (latMax - latMin)) * svgH));
  return [x, y];
}

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  return `${Math.floor(secs / 3600)}h ago`;
}

// ── Haiti + DR outline SVG (approximate) ─────────────────────────────────────
function HaitiMapBg() {
  // Haiti (western part of Hispaniola)
  const haitiPath = "M 55 200 C 65 180 80 165 95 155 C 110 145 120 140 135 138 C 150 136 165 138 180 135 C 195 132 205 128 215 120 C 225 112 230 105 240 100 C 250 95 260 92 270 90 C 280 88 290 88 300 90 C 310 92 318 97 325 103 C 332 109 336 116 340 123 C 344 130 345 137 343 144 C 341 151 336 157 330 162 C 324 167 317 170 310 172 C 303 174 295 174 288 176 C 281 178 275 182 270 187 C 265 192 262 198 258 204 C 254 210 249 215 243 219 C 237 223 230 225 223 226 C 216 227 208 226 201 224 C 194 222 188 218 182 215 C 176 212 170 209 164 207 C 158 205 151 204 145 204 C 139 204 133 205 127 207 C 121 209 115 213 109 216 C 103 219 97 221 91 222 C 85 223 79 222 74 219 C 69 216 65 211 62 206 C 59 201 58 196 55 200Z";
  // Dominican Republic (eastern part)
  const drPath = "M 340 123 C 355 115 370 110 385 108 C 400 106 415 107 430 110 C 445 113 458 119 470 127 C 482 135 492 145 498 156 C 504 167 505 179 501 190 C 497 201 488 210 477 216 C 466 222 453 224 440 224 C 427 224 414 221 402 216 C 390 211 379 204 370 196 C 361 188 354 179 348 170 C 342 161 338 152 336 143 C 334 134 334 126 340 123Z";
  return (
    <>
      <path d={haitiPath} fill="#dce8f0" stroke="#a0b4c0" strokeWidth="1.5" />
      <path d={drPath} fill="#e8f0dc" stroke="#a0b4c0" strokeWidth="1.5" />
      {/* City labels */}
      {[
        [215, 168, "Port-au-Prince"],
        [248, 155, "Pétionville"],
        [270, 145, "Delmas"],
        [112, 195, "Jérémie"],
        [152, 152, "St-Marc"],
        [200, 130, "Cap-Haïtien"],
        [440, 170, "Santo Domingo"],
        [390, 145, "Santiago"],
      ].map(([x, y, label], i) => (
        <text key={i} x={x} y={y} fontSize="7" fill="#5a7888" fontWeight="600" fontFamily="sans-serif" textAnchor="middle">
          {label as string}
        </text>
      ))}
    </>
  );
}

export default function AdminDriversLiveMap() {
  const { token, user } = useAuth();
  const [, navigate]    = useLocation();
  const socket          = useSocket();

  const [drivers, setDrivers]       = useState<LiveDriver[]>([]);
  const [loading, setLoading]       = useState(true);
  const [selected, setSelected]     = useState<LiveDriver | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  // Local GPS state updated via socket
  const [gpsMap, setGpsMap]         = useState<Map<number, { lat: number; lng: number; updatedAt: string }>>(new Map());

  const fetchDrivers = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/admin/drivers/live", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setDrivers(data.drivers ?? []);
        setLastRefresh(new Date());
      }
    } catch {/* */} finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!user?.isAdmin && !user?.isSuperAdmin) { navigate("/"); return; }
    fetchDrivers();
    const interval = setInterval(fetchDrivers, 30000);
    return () => clearInterval(interval);
  }, [fetchDrivers]);

  // Listen for real-time GPS updates from any driver via admin socket room
  useEffect(() => {
    const unsub = socket.onAdminDriverUpdate((data) => {
      setGpsMap(prev => {
        const next = new Map(prev);
        next.set(data.userId, { lat: data.lat, lng: data.lng, updatedAt: data.updatedAt });
        return next;
      });
    });
    return () => { unsub(); };
  }, []);

  // Merge DB driver data with real-time GPS from socket
  const driversWithGps = drivers.map(d => {
    const live = gpsMap.get(d.userId);
    if (live) return { ...d, latitude: live.lat, longitude: live.lng, lastLocationAt: live.updatedAt };
    return d;
  });

  const withGps    = driversWithGps.filter(d => d.latitude != null && d.longitude != null);
  const withoutGps = driversWithGps.filter(d => d.latitude == null || d.longitude == null);

  if (!user?.isAdmin && !user?.isSuperAdmin) return null;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1 as any)}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-black text-foreground flex items-center gap-2">
            <MapPin className="h-6 w-6 text-green-500" />
            Live Driver Map
          </h1>
          <p className="text-sm text-muted-foreground">
            {driversWithGps.length} online drivers · {withGps.length} with GPS · Last refresh: {lastRefresh.toLocaleTimeString()}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchDrivers}
          className="flex items-center gap-2"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Online Drivers", value: driversWithGps.length, icon: Users, color: "text-green-500 bg-green-50 dark:bg-green-950/30" },
          { label: "GPS Active",     value: withGps.length,        icon: Wifi,  color: "text-blue-500 bg-blue-50 dark:bg-blue-950/30" },
          { label: "No GPS",         value: withoutGps.length,     icon: WifiOff, color: "text-orange-500 bg-orange-50 dark:bg-orange-950/30" },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className={`rounded-2xl border p-4 flex items-center gap-3 ${color}`}>
            <Icon className="h-6 w-6 shrink-0" />
            <div>
              <p className="text-2xl font-black">{value}</p>
              <p className="text-xs font-semibold opacity-70">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Map */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
        <div className="bg-muted/50 px-4 py-3 border-b flex items-center justify-between">
          <h2 className="font-bold text-sm text-foreground">Haiti / Dominican Republic</h2>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full bg-green-500" /> Online with GPS</span>
            <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full bg-orange-400" /> Online, no GPS</span>
          </div>
        </div>
        <div className="relative bg-[#e8eaed] w-full overflow-hidden" style={{ paddingTop: "64.3%" }}>
          <svg
            viewBox="0 0 560 360"
            className="absolute inset-0 w-full h-full"
            preserveAspectRatio="xMidYMid meet"
          >
            {/* Background ocean */}
            <rect width="560" height="360" fill="#c8dff0" />
            <HaitiMapBg />

            {/* Drivers WITHOUT GPS — orange dot at commune center */}
            {withoutGps.map(d => (
              <g key={d.id}>
                <circle cx={180 + Math.sin(d.userId) * 30} cy={170 + Math.cos(d.userId) * 20} r="7" fill="#fb923c" opacity="0.7" stroke="white" strokeWidth="1.5" />
                <text x={180 + Math.sin(d.userId) * 30} y={165 + Math.cos(d.userId) * 20} fontSize="6" fill="#7c3" textAnchor="middle" fontFamily="sans-serif">
                  {d.vehicleType === "moto" ? "🏍" : "🚗"}
                </text>
              </g>
            ))}

            {/* Drivers WITH GPS — positioned from real coordinates */}
            {withGps.map(d => {
              const [x, y] = toSvgCoords(d.latitude!, d.longitude!);
              const isSelected = selected?.userId === d.userId;
              return (
                <g key={d.id} onClick={() => setSelected(isSelected ? null : d)} style={{ cursor: "pointer" }}>
                  {/* Accuracy pulse */}
                  <circle cx={x} cy={y} r={isSelected ? 20 : 14} fill="#22c55e" opacity={isSelected ? 0.3 : 0.15} />
                  {/* Main dot */}
                  <circle cx={x} cy={y} r={isSelected ? 11 : 9} fill="#22c55e" stroke="white" strokeWidth={isSelected ? 2.5 : 1.5} />
                  {/* Vehicle icon */}
                  <text x={x} y={y + 4} fontSize="8" textAnchor="middle">
                    {d.vehicleType === "moto" ? "🏍" : "🚗"}
                  </text>
                  {/* Name label */}
                  {isSelected && (
                    <text x={x} y={y - 15} fontSize="7" fill="#166534" fontWeight="700" fontFamily="sans-serif" textAnchor="middle">
                      {(d.name ?? "Driver").split(" ")[0]}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      {/* Driver list */}
      <div className="space-y-3">
        <h2 className="font-black text-foreground flex items-center gap-2">
          <Users className="h-5 w-5 text-muted-foreground" />
          All Online Drivers
        </h2>
        {loading && (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-8 w-8 text-muted-foreground animate-spin" />
          </div>
        )}
        {!loading && driversWithGps.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <WifiOff className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="font-semibold">No drivers online right now</p>
          </div>
        )}
        {driversWithGps.map(d => {
          const hasGps = d.latitude != null && d.longitude != null;
          const isSel  = selected?.userId === d.userId;
          return (
            <div
              key={d.id}
              onClick={() => setSelected(isSel ? null : d)}
              className={`rounded-2xl border p-4 flex items-center gap-4 cursor-pointer transition-all ${
                isSel ? "border-green-400 bg-green-50 dark:bg-green-950/20 shadow-md" : "border-border bg-card hover:bg-accent"
              }`}
            >
              {/* Avatar */}
              <div className="relative shrink-0">
                <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-green-200 shadow">
                  <Avatar className="w-full h-full">
                    <AvatarImage src={d.avatar ?? undefined} className="object-cover" />
                    <AvatarFallback className="bg-green-100 text-green-700 font-black">
                      {d.name?.[0]?.toUpperCase() ?? "D"}
                    </AvatarFallback>
                  </Avatar>
                </div>
                <div className={`absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-white ${hasGps ? "bg-green-500" : "bg-orange-400"}`} />
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-black text-foreground truncate">{d.name ?? "Unknown Driver"}</p>
                  {d.vehicleType === "moto" ? <Bike className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <Car className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                  {d.rating != null && d.rating > 0 && (
                    <span className="flex items-center gap-0.5 text-xs font-bold text-yellow-600">
                      <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                      {d.rating.toFixed(1)}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {[d.vehicleBrand, d.vehicleModel, d.vehicleColor].filter(Boolean).join(" · ") || "Vehicle info pending"}
                  {d.licensePlateNumber && <span className="ml-1 font-mono font-bold">· {d.licensePlateNumber}</span>}
                </p>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  {d.commune && (
                    <Badge variant="secondary" className="text-[10px] py-0 h-4">
                      <MapPin className="h-2.5 w-2.5 mr-0.5" />{d.commune}
                    </Badge>
                  )}
                  <span className={`text-[10px] font-semibold flex items-center gap-1 ${hasGps ? "text-green-600" : "text-orange-500"}`}>
                    {hasGps ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                    {hasGps ? `GPS ${timeAgo(d.lastLocationAt)}` : "No GPS"}
                  </span>
                </div>
              </div>

              {/* GPS coords + actions */}
              <div className="shrink-0 text-right space-y-1">
                {hasGps && (
                  <a
                    href={`https://www.google.com/maps?q=${d.latitude},${d.longitude}`}
                    target="_blank" rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-600 hover:underline"
                  >
                    <MapPin className="h-3 w-3" />
                    Open in Maps
                  </a>
                )}
                {d.phone && (
                  <a
                    href={`tel:${d.phone}`}
                    onClick={e => e.stopPropagation()}
                    className="flex items-center gap-1 text-[10px] font-bold text-green-600 hover:underline justify-end"
                  >
                    <Phone className="h-3 w-3" />
                    {d.phone}
                  </a>
                )}
                <div className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  d.status === "active" ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"
                }`}>
                  {d.status ?? "active"}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
