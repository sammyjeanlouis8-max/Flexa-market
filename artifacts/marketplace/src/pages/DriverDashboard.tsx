import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/auth";
import { useLocation } from "wouter";
import {
  Truck, MapPin, ChevronRight, Loader2, RefreshCw, Wallet, User, Bell,
  Package, CheckCircle2, Power,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { DRIVER_BRAND, formatHtg } from "@/lib/driverBrand";

const apiGet = (url: string) =>
  fetch(url, {
    headers: { Authorization: `Bearer ${localStorage.getItem("flexamarket_token")}` },
  }).then((r) => r.json());

type ZonesPayload = {
  communesByDepartment?: Record<string, string[]>;
  departments?: Record<string, string[]> | string[];
};

type StatsResponse = {
  driver: {
    id: number;
    userId: number;
    status: string;
    country: string | null;
    city: string | null;
    commune: string | null;
    department: string | null;
    workZones?: string[] | string | null;
    vehicleType: string | null;
    rating: number;
    deliveryCount: number;
    earningsTotal: number;
    isOnline: boolean;
    facePhotoFront?: string | null;
    photoFront?: string | null;
  };
  stats?: {
    deliveriesToday: number;
    earningsTodayHtg: number;
    earningsWeekHtg: number;
    earningsMonthHtg: number;
    availableCount: number;
    activeCount: number;
    currency: string;
  };
};

function parseZones(raw: string[] | string | null | undefined): string[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string" && raw.trim().startsWith("[")) {
    try {
      const p = JSON.parse(raw);
      return Array.isArray(p) ? p.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

export default function DriverDashboard() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { t } = useTranslation();
  const { toast } = useToast();

  const { data, isLoading, refetch, isFetching } = useQuery<StatsResponse>({
    queryKey: ["/delivery/driver/stats"],
    queryFn: () => apiGet("/api/delivery/driver/stats"),
    enabled: !!user,
    refetchInterval: 30000,
  });

  const { data: zonesData } = useQuery<ZonesPayload>({
    queryKey: ["/delivery/driver/zones"],
    queryFn: () => apiGet("/api/delivery/driver/zones"),
    enabled: !!user,
    staleTime: 60 * 60 * 1000,
  });

  const communesByDepartment = useMemo(() => {
    if (zonesData?.communesByDepartment) return zonesData.communesByDepartment;
    if (zonesData?.departments && !Array.isArray(zonesData.departments)) {
      return zonesData.departments as Record<string, string[]>;
    }
    return {} as Record<string, string[]>;
  }, [zonesData]);

  const departmentOptions = useMemo(
    () => Object.keys(communesByDepartment).sort((a, b) => a.localeCompare(b, "fr")),
    [communesByDepartment],
  );

  const driver = data?.driver;
  const stats = data?.stats;

  const [online, setOnline] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [selDepartment, setSelDepartment] = useState("");
  const [selCommunes, setSelCommunes] = useState<string[]>([]);
  const [zoneSaving, setZoneSaving] = useState(false);

  useEffect(() => {
    if (!driver) return;
    setOnline(Boolean(driver.isOnline));
    setSelDepartment(driver.department ?? "");
    const wz = parseZones(driver.workZones);
    setSelCommunes(wz.length ? wz : driver.commune ? [driver.commune] : []);
  }, [driver?.id, driver?.isOnline, driver?.department, driver?.commune, driver?.workZones]);

  const communeOptions = selDepartment ? communesByDepartment[selDepartment] ?? [] : [];

  async function patchDriver(body: Record<string, unknown>) {
    const res = await fetch("/api/delivery/driver/location", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("flexamarket_token")}`,
      },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error || "Request failed");
    return json;
  }

  async function toggleOnline() {
    if (!driver || driver.status !== "active") {
      toast({
        title: t("driverDash.notApproved", { defaultValue: "Driver account not active" }),
        variant: "destructive",
      });
      return;
    }
    setToggling(true);
    try {
      const next = !online;
      await patchDriver({ isOnline: next });
      setOnline(next);
      toast({
        title: next
          ? t("driverDash.nowOnline", { defaultValue: "You are available for deliveries" })
          : t("driverDash.nowOffline", { defaultValue: "You are offline" }),
      });
      refetch();
    } catch (e: any) {
      toast({ title: e?.message || "Error", variant: "destructive" });
    } finally {
      setToggling(false);
    }
  }

  function toggleCommune(commune: string) {
    setSelCommunes((prev) =>
      prev.includes(commune) ? prev.filter((c) => c !== commune) : [...prev, commune],
    );
  }

  async function saveZone() {
    if (!selDepartment) {
      toast({
        title: t("driverDash.selectDepartment", { defaultValue: "Select a department" }),
        variant: "destructive",
      });
      return;
    }
    setZoneSaving(true);
    try {
      await patchDriver({
        department: selDepartment,
        workZones: selCommunes,
        communes: selCommunes,
      });
      toast({
        title: t("driverDash.zoneSaved", { defaultValue: "Work zone saved" }),
      });
      refetch();
    } catch (e: any) {
      toast({ title: e?.message || "Error", variant: "destructive" });
    } finally {
      setZoneSaving(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: DRIVER_BRAND.success }} />
        <p className="text-sm text-muted-foreground">{t("driverDash.loading", { defaultValue: "Loading driver dashboard…" })}</p>
      </div>
    );
  }

  if (!driver) {
    return (
      <div className="max-w-lg mx-auto px-4 py-12 text-center space-y-4">
        <p className="font-bold text-foreground">
          {t("driverDash.notDriver", { defaultValue: "You are not an approved Flexa Market driver." })}
        </p>
        <Button onClick={() => setLocation("/delivery/apply")} style={{ background: DRIVER_BRAND.primary }} className="text-white">
          {t("driverDash.apply", { defaultValue: "Apply to become a driver" })}
        </Button>
      </div>
    );
  }

  const greetingName = user?.name?.split(" ")[0] || t("driverDash.driver", { defaultValue: "Driver" });
  const avatarSrc = driver.facePhotoFront || driver.photoFront || user?.avatar || undefined;
  const deliveriesToday = stats?.deliveriesToday ?? 0;
  const earningsToday = stats?.earningsTodayHtg ?? 0;
  const availableCount = stats?.availableCount ?? 0;

  const menuItems = [
    {
      key: "available",
      label: t("driverDash.availableDeliveries", { defaultValue: "Available Deliveries" }),
      href: "/delivery/deliveries",
      badge: availableCount > 0 ? availableCount : null,
      icon: Package,
    },
    {
      key: "mine",
      label: t("driverDash.myDeliveries", { defaultValue: "My Deliveries" }),
      href: "/delivery/deliveries?tab=mine",
      badge: stats?.activeCount ? stats.activeCount : null,
      icon: Truck,
    },
    {
      key: "earnings",
      label: t("driverDash.myEarnings", { defaultValue: "My Earnings" }),
      href: "/driver/dashboard#earnings",
      badge: null,
      icon: Wallet,
    },
    {
      key: "profile",
      label: t("driverDash.driverProfile", { defaultValue: "Driver Profile" }),
      href: "/profile/edit",
      badge: null,
      icon: User,
    },
  ];

  return (
    <div className="max-w-lg mx-auto px-4 py-5 pb-28 space-y-4" data-testid="driver-dashboard">
      {/* Brand strip */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <img src="/flexa-logo-v2.png" alt="Flexa Market" className="h-9 w-9 rounded-xl object-cover shrink-0" />
          <div className="min-w-0">
            <p className="font-black text-sm text-foreground truncate">Flexa Market</p>
            <span
              className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
              style={{ background: "#ea580c" }}
            >
              {t("driverDash.driverBadge", { defaultValue: "Driver" })}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => refetch()} disabled={isFetching} aria-label="Refresh">
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setLocation("/messages")} aria-label="Notifications">
            <Bell className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Profile + availability */}
      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm flex items-center gap-3">
        <Avatar className="h-14 w-14 border-2" style={{ borderColor: DRIVER_BRAND.softBorder }}>
          <AvatarImage src={avatarSrc} alt="" />
          <AvatarFallback style={{ background: DRIVER_BRAND.soft, color: DRIVER_BRAND.success }}>
            {greetingName.slice(0, 1).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="font-black text-foreground truncate">
            {t("driverDash.greeting", { name: greetingName, defaultValue: `Good work, ${greetingName}!` })}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {online
              ? t("driverDash.availableForDelivery", { defaultValue: "You are available for delivery" })
              : t("driverDash.offlineHint", { defaultValue: "You are offline — new jobs are hidden" })}
          </p>
        </div>
        <button
          type="button"
          onClick={toggleOnline}
          disabled={toggling}
          className="relative h-8 w-14 rounded-full transition-colors shrink-0"
          style={{ background: online ? DRIVER_BRAND.success : "hsl(var(--muted))" }}
          aria-pressed={online}
          data-testid="driver-online-toggle"
        >
          <span
            className="absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all flex items-center justify-center"
            style={{ left: online ? "1.75rem" : "0.25rem" }}
          >
            {toggling ? <Loader2 className="h-3 w-3 animate-spin" /> : <Power className="h-3 w-3 text-muted-foreground" />}
          </span>
        </button>
      </div>

      {/* Today stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border p-4" style={{ background: DRIVER_BRAND.soft, borderColor: DRIVER_BRAND.softBorder }}>
          <Truck className="h-5 w-5 mb-2" style={{ color: DRIVER_BRAND.success }} />
          <p className="text-2xl font-black text-foreground">{deliveriesToday}</p>
          <p className="text-xs font-semibold text-muted-foreground">
            {t("driverDash.deliveriesToday", { defaultValue: "Deliveries today" })}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <Wallet className="h-5 w-5 mb-2" style={{ color: DRIVER_BRAND.success }} />
          <p className="text-xl font-black text-foreground leading-tight">{formatHtg(earningsToday)}</p>
          <p className="text-xs font-semibold text-muted-foreground mt-1">
            {t("driverDash.earningsToday", { defaultValue: "Earnings today" })}
          </p>
        </div>
      </div>

      {/* Work zone selector */}
      <div className="rounded-2xl border border-border bg-card p-4 space-y-3 shadow-sm" data-testid="work-zone-selector">
        <h2 className="text-sm font-bold text-foreground">
          {t("driverDash.chooseWorkZone", { defaultValue: "Choose your work zone" })}
        </h2>

        <label className="block space-y-1.5">
          <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
            {t("driverDash.department", { defaultValue: "Department" })}
          </span>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-base" aria-hidden>🇭🇹</span>
            <select
              className="w-full h-11 rounded-xl border border-border bg-background pl-10 pr-3 text-sm font-semibold"
              value={selDepartment}
              onChange={(e) => {
                setSelDepartment(e.target.value);
                setSelCommunes([]);
              }}
              data-testid="department-select"
            >
              <option value="">{t("driverDash.selectDepartment", { defaultValue: "Select a department" })}</option>
              {departmentOptions.map((dep) => (
                <option key={dep} value={dep}>{dep}</option>
              ))}
            </select>
          </div>
        </label>

        {selDepartment && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground uppercase tracking-wide">
              <MapPin className="h-3.5 w-3.5" />
              {t("driverDash.communes", { defaultValue: "Communes" })}
              <span className="font-normal normal-case">
                ({t("driverDash.multiSelect", { defaultValue: "select one or more" })})
              </span>
            </div>
            <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
              {communeOptions.map((c) => {
                const active = selCommunes.includes(c);
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => toggleCommune(c)}
                    className="rounded-full px-3 py-1.5 text-xs font-bold border transition-colors"
                    style={
                      active
                        ? { background: DRIVER_BRAND.primary, color: "#fff", borderColor: DRIVER_BRAND.primary }
                        : undefined
                    }
                    data-testid={`commune-chip-${c}`}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <Button
          className="w-full h-11 font-bold rounded-xl text-white"
          style={{ background: DRIVER_BRAND.primary }}
          disabled={zoneSaving || !selDepartment}
          onClick={saveZone}
          data-testid="save-work-zone"
        >
          {zoneSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
          {t("driverDash.setZone", { defaultValue: "Set work zone" })}
        </Button>
      </div>

      {/* Menu */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
        {menuItems.map((item, idx) => {
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setLocation(item.href)}
              className={`w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-muted/40 ${
                idx < menuItems.length - 1 ? "border-b border-border/70" : ""
              }`}
            >
              <span
                className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: DRIVER_BRAND.soft, color: DRIVER_BRAND.success }}
              >
                <Icon className="h-4.5 w-4.5" />
              </span>
              <span className="flex-1 font-bold text-sm text-foreground">{item.label}</span>
              {item.badge != null && (
                <span className="min-w-[1.25rem] h-5 px-1.5 rounded-full bg-red-500 text-white text-[10px] font-black flex items-center justify-center">
                  {item.badge}
                </span>
              )}
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          );
        })}
      </div>

      {/* Earnings snapshot */}
      <div id="earnings" className="rounded-2xl border border-border bg-card p-4 space-y-3 scroll-mt-20">
        <h2 className="text-sm font-bold text-foreground">
          {t("driverDash.earningsOverview", { defaultValue: "Earnings overview" })}
        </h2>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-muted/40 p-2.5">
            <p className="text-[10px] font-bold text-muted-foreground uppercase">{t("driverDash.today", { defaultValue: "Today" })}</p>
            <p className="text-sm font-black mt-1">{formatHtg(stats?.earningsTodayHtg)}</p>
          </div>
          <div className="rounded-xl bg-muted/40 p-2.5">
            <p className="text-[10px] font-bold text-muted-foreground uppercase">{t("driverDash.week", { defaultValue: "Week" })}</p>
            <p className="text-sm font-black mt-1">{formatHtg(stats?.earningsWeekHtg)}</p>
          </div>
          <div className="rounded-xl bg-muted/40 p-2.5">
            <p className="text-[10px] font-bold text-muted-foreground uppercase">{t("driverDash.month", { defaultValue: "Month" })}</p>
            <p className="text-sm font-black mt-1">{formatHtg(stats?.earningsMonthHtg)}</p>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          {t("driverDash.earningsNote", {
            defaultValue: "HTG amounts use the live exchange rate for display. Wallet credits remain on the existing payout rules.",
          })}
        </p>
      </div>
    </div>
  );
}
