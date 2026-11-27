import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  BadgeCheck,
  Bike,
  CalendarClock,
  Clock,
  Heart,
  Info,
  MapPin,
  Phone,
  Plus,
  Share2,
  Shield,
  ShoppingBag,
  Star,
  Store,
  UtensilsCrossed,
} from "lucide-react";
import { RestaurantPageGate } from "@/components/restaurant/RestaurantPageGate";
import { RestaurantEmpty, RestaurantNotice } from "@/components/restaurant/RestaurantShell";
import {
  availabilityLabelKey,
  businessTypeLabelKey,
  createRestaurantReservation,
  fetchDailyMenu,
  fetchDishOptions,
  fetchRestaurant,
  formatMoney,
  type DailyMenuItem,
  type DishOptionGroup,
  type Restaurant,
} from "@/lib/restaurantApi";
import { cartTotals, getRestaurantCart, upsertCartLine, type RestaurantCartState } from "@/lib/restaurantCart";
import { useAuth } from "@/contexts/auth";
import { addDaysYmd } from "@/lib/restaurantScheduleClient";
import { cn } from "@/lib/utils";

type Tab = "menu" | "info" | "photos" | "about";

export default function RestaurantDetail() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [, params] = useRoute("/restaurant/:id");
  const [, setLocation] = useLocation();
  const id = Number(params?.id);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [items, setItems] = useState<DailyMenuItem[]>([]);
  const [menuDate, setMenuDate] = useState<"today" | "tomorrow">("today");
  const [tab, setTab] = useState<Tab>("menu");
  const [category, setCategory] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [cart, setCart] = useState<RestaurantCartState | null>(null);
  const [customizeItem, setCustomizeItem] = useState<DailyMenuItem | null>(null);
  const [optionGroups, setOptionGroups] = useState<DishOptionGroup[]>([]);
  const [selectedOptions, setSelectedOptions] = useState<Record<number, number[]>>({});
  const [customizeNotes, setCustomizeNotes] = useState("");


  useEffect(() => {
    setCart(getRestaurantCart());
  }, []);

  useEffect(() => {
    if (!Number.isFinite(id)) return;
    let cancelled = false;
    setLoading(true);
    fetchRestaurant(id)
      .then((r) => {
        if (!cancelled) {
          setRestaurant(r);
          setError(null);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setRestaurant(null);
          setError(err.message);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!restaurant) return;
    let cancelled = false;
    const tz = restaurant.timezone || "America/Port-au-Prince";
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const date = menuDate === "today" ? today : addDaysYmd(today, 1);
    fetchDailyMenu(id, date)
      .then((menu) => {
        if (!cancelled) setItems(menu.items);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, [id, restaurant, menuDate]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const item of items) if (item.category) set.add(item.category);
    return ["all", ...Array.from(set)];
  }, [items]);

  const filteredItems = useMemo(
    () => (category === "all" ? items : items.filter((i) => (i.category || "").toLowerCase() === category.toLowerCase())),
    [items, category],
  );

  const totals = cartTotals(
    cart && cart.restaurantId === id ? cart : null,
    restaurant?.deliveryFee || 0,
  );

  async function openCustomize(item: DailyMenuItem, mode: "order" | "reserve") {
    if (!restaurant) return;
    if (mode === "order" && !item.orderableNow) {
      setActionMsg(t("restaurant.notOrderableNow", { defaultValue: "This meal is not available to order right now." }));
      return;
    }
    if (!item.dishModelId) {
      addToCart(item, mode);
      return;
    }
    try {
      const groups = await fetchDishOptions(restaurant.id, item.dishModelId);
      if (!groups.length) {
        addToCart(item, mode);
        return;
      }
      setCustomizeItem(item);
      setOptionGroups(groups);
      const initial: Record<number, number[]> = {};
      for (const g of groups) {
        initial[g.id] = g.required && g.options[0] && !g.options[0].soldOut ? [g.options[0].id] : [];
      }
      setSelectedOptions(initial);
    } catch {
      addToCart(item, mode);
    }
  }

  function toggleOption(group: DishOptionGroup, optionId: number) {
    setSelectedOptions((prev) => {
      const cur = prev[group.id] || [];
      const multi = group.maxSelect > 1;
      if (multi) {
        const has = cur.includes(optionId);
        let next = has ? cur.filter((id) => id !== optionId) : [...cur, optionId];
        if (next.length > group.maxSelect) next = next.slice(-group.maxSelect);
        return { ...prev, [group.id]: next };
      }
      return { ...prev, [group.id]: cur.includes(optionId) ? [] : [optionId] };
    });
  }

  function addToCart(
    item: DailyMenuItem,
    mode: "order" | "reserve",
    extras?: { optionIds?: number[]; optionLabels?: string[]; priceDelta?: number; notes?: string },
  ) {
    if (!restaurant) return;
    if (mode === "order" && !item.orderableNow) {
      setActionMsg(t("restaurant.notOrderableNow", { defaultValue: "This meal is not available to order right now." }));
      return;
    }
    const next = upsertCartLine(
      { id: restaurant.id, name: restaurant.name },
      {
        dailyMenuItemId: item.id,
        name: item.name,
        price: item.price + (extras?.priceDelta || 0),
        currency: item.currency,
        quantity: 1,
        photo: item.photos?.[0] || null,
        availableFrom: item.availableFrom,
        availableUntil: item.availableUntil,
        optionIds: extras?.optionIds,
        optionLabels: extras?.optionLabels,
        notes: extras?.notes,
        mode,
      },
    );
    setCart(next);
    setCustomizeItem(null);
    setCustomizeNotes("");
    setActionMsg(
      mode === "reserve"
        ? t("restaurant.addedReserve", { defaultValue: "Added for reservation." })
        : t("restaurant.addedCart", { defaultValue: "Added to cart." }),
    );
  }

  function confirmCustomize() {
    if (!customizeItem) return;
    for (const g of optionGroups) {
      const picked = selectedOptions[g.id] || [];
      if (g.required && picked.length < Math.max(1, g.minSelect)) {
        setActionMsg(t("restaurant.selectRequiredOptions", { defaultValue: `Select required options for ${g.name}` }));
        return;
      }
      if (picked.length < g.minSelect) {
        setActionMsg(t("restaurant.selectMinOptions", { defaultValue: `Select at least ${g.minSelect} for ${g.name}` }));
        return;
      }
    }
    const optionIds: number[] = [];
    const optionLabels: string[] = [];
    let priceDelta = 0;
    for (const g of optionGroups) {
      for (const oid of selectedOptions[g.id] || []) {
        const opt = g.options.find((o) => o.id === oid);
        if (!opt || opt.soldOut) continue;
        optionIds.push(oid);
        optionLabels.push(opt.name);
        priceDelta += Number(opt.priceDelta) || 0;
      }
    }
    addToCart(customizeItem, "order", { optionIds, optionLabels, priceDelta, notes: customizeNotes.trim() || undefined });
  }

  async function quickReserve(item: DailyMenuItem) {
    if (!user) {
      setActionMsg(t("common.loginRequired", { defaultValue: "Sign in to reserve." }));
      return;
    }
    setBusyId(item.id);
    setActionMsg(null);
    try {
      const reservation = await createRestaurantReservation(id, {
        dailyMenuItemId: item.id,
        quantity: 1,
        fulfillment: "pickup",
        reservationTime: item.availableFrom,
      });
      setActionMsg(`${t("restaurant.reserve")}: #${reservation.id} · ${reservation.reservationDate}`);
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : "Reservation failed");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <RestaurantPageGate>
        <div className="min-h-dvh bg-[hsl(152,22%,97%)] p-4">
          <div className="mx-auto max-w-3xl animate-pulse space-y-3">
            <div className="h-56 rounded-2xl bg-neutral-200" />
            <div className="h-28 rounded-2xl bg-white" />
            <div className="h-40 rounded-2xl bg-white" />
          </div>
        </div>
      </RestaurantPageGate>
    );
  }

  if (error || !restaurant) {
    return (
      <RestaurantPageGate>
        <div className="mx-auto max-w-3xl p-4">
          <RestaurantEmpty title={t("restaurant.notFound")} body={error ?? ""} action={<Link href="/restaurant">{t("restaurant.backDiscover")}</Link>} />
        </div>
      </RestaurantPageGate>
    );
  }

  const open = restaurant.openNow ?? restaurant.isOpenNow;
  const typeLabel = t(`restaurant.${businessTypeLabelKey(restaurant.businessType)}`);
  const locationLine =
    restaurant.serviceArea
    || restaurant.publicPickupAddress
    || restaurant.streetAddress
    || `${restaurant.city}, ${restaurant.country}`;
  const photos = [
    restaurant.coverUrl,
    restaurant.logoUrl,
    ...items.flatMap((i) => i.photos || []),
  ].filter(Boolean) as string[];

  return (
    <RestaurantPageGate>
      <div className="min-h-dvh bg-[hsl(152,22%,97%)] pb-28">
        {/* Hero */}
        <div className="relative mx-auto max-w-3xl">
          <div className="relative h-56 overflow-hidden bg-[hsl(152,30%,20%)] sm:h-72 sm:rounded-b-3xl">
            {restaurant.coverUrl ? (
              <img src={restaurant.coverUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-white/40">
                <UtensilsCrossed className="h-16 w-16" />
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-black/25" />
            <div className="absolute left-3 top-3 flex items-center gap-2">
              <Link
                href="/restaurant"
                className="flex h-10 w-10 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur"
                aria-label={t("restaurant.backDiscover")}
              >
                <ArrowLeft className="h-5 w-5" />
              </Link>
              <span className="rounded-full bg-[hsl(152,55%,28%)] px-2.5 py-1 text-[11px] font-bold text-white">
                {typeLabel}
              </span>
            </div>
            <div className="absolute right-3 top-3 flex gap-2">
              <button type="button" className="flex h-10 w-10 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur" aria-label="Share">
                <Share2 className="h-4 w-4" />
              </button>
              <button type="button" className="flex h-10 w-10 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur" aria-label="Favorite">
                <Heart className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Overlapping info card */}
          <div className="relative z-10 -mt-10 px-3 sm:px-4">
            <div className="rounded-2xl border border-black/5 bg-white p-4 shadow-[0_12px_30px_rgba(15,40,30,0.12)]">
              <div className="flex gap-3">
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-2xl border border-black/5 bg-[hsl(152,40%,92%)]">
                  {restaurant.logoUrl ? (
                    <img src={restaurant.logoUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-[hsl(152,55%,28%)]">
                      <Store className="h-6 w-6" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-xl font-extrabold tracking-tight text-[hsl(152,30%,12%)]">{restaurant.name}</h1>
                    {(restaurant.identityVerifiedBadge || restaurant.identityStatus === "verified") && (
                      <BadgeCheck className="h-5 w-5 text-[hsl(152,55%,32%)]" />
                    )}
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                        open ? "bg-[hsl(152,50%,90%)] text-[hsl(152,55%,25%)]" : "bg-neutral-100 text-neutral-500",
                      )}
                    >
                      {open ? t("restaurant.openNow") : t("restaurant.closed", { defaultValue: "Closed" })}
                    </span>
                  </div>
                  <p className="mt-1 flex items-center gap-1 text-sm font-semibold">
                    <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                    {restaurant.avgRating > 0 ? restaurant.avgRating.toFixed(1) : "—"}
                    <span className="font-normal text-muted-foreground">({restaurant.ratingCount})</span>
                    {restaurant.cuisineTags?.[0] && (
                      <span className="font-normal text-muted-foreground">· {restaurant.cuisineTags.join(" · ")}</span>
                    )}
                  </p>
                  <p className="mt-1 flex items-start gap-1 text-xs text-muted-foreground">
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[hsl(152,45%,35%)]" />
                    {locationLine}
                  </p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-4 gap-2 border-t border-black/5 pt-3 text-center">
                <QuickStat icon={Store} label={typeLabel} />
                <QuickStat
                  icon={ShoppingBag}
                  label={t("restaurant.pickup")}
                  muted={restaurant.fulfillment === "delivery"}
                />
                <QuickStat
                  icon={Bike}
                  label={t("restaurant.delivery")}
                  muted={restaurant.fulfillment === "pickup"}
                />
                <QuickStat
                  icon={Clock}
                  label={
                    restaurant.estimatedPrepMinutes
                      ? `${restaurant.estimatedPrepMinutes} min`
                      : "—"
                  }
                />
              </div>

              {restaurant.addressPrivacyNote && (
                <div className="mt-3 flex gap-2 rounded-xl bg-[hsl(152,45%,95%)] px-3 py-2 text-xs text-[hsl(152,45%,22%)]">
                  <Shield className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>{t("restaurant.homeKitchenPrivacy", { defaultValue: restaurant.addressPrivacyNote })}</p>
                </div>
              )}

              {(restaurant.fulfillment === "delivery" || restaurant.fulfillment === "both") && (
                <RestaurantNotice>
                  {t("restaurant.deliveryDisclaimer", {
                    defaultValue: restaurant.deliveryDisclaimer || "Delivery is arranged and managed by this restaurant.",
                  })}
                </RestaurantNotice>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                {restaurant.phone && (
                  <a href={`tel:${restaurant.phone}`} className="inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-bold">
                    <Phone className="h-3.5 w-3.5" /> {t("restaurant.call", { defaultValue: "Call" })}
                  </a>
                )}
                <Link href="/support" className="inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-bold">
                  {t("restaurant.message", { defaultValue: "Message" })}
                </Link>
                <button type="button" className="inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-bold">
                  {t("restaurant.report", { defaultValue: "Report" })}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs — no general Reviews feed */}
        <div className="mx-auto mt-4 max-w-3xl px-3 sm:px-4">
          <div className="flex gap-1 overflow-x-auto border-b border-black/5">
            {(["menu", "info", "photos", "about"] as Tab[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={cn(
                  "shrink-0 px-3 py-2.5 text-sm font-bold",
                  tab === key
                    ? "border-b-2 border-[hsl(152,55%,28%)] text-[hsl(152,55%,22%)]"
                    : "text-muted-foreground",
                )}
              >
                {t(`restaurant.tab${key[0].toUpperCase()}${key.slice(1)}`, {
                  defaultValue: key[0].toUpperCase() + key.slice(1),
                })}
              </button>
            ))}
          </div>

          {actionMsg && (
            <p className="mt-3 rounded-xl border border-[hsl(152,40%,80%)] bg-[hsl(152,45%,96%)] px-3 py-2 text-sm">{actionMsg}</p>
          )}

          {tab === "menu" && (
            <div className="mt-4 space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMenuDate("today")}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-xs font-bold",
                    menuDate === "today" ? "bg-[hsl(152,55%,28%)] text-white" : "bg-white border",
                  )}
                >
                  {t("restaurant.today", { defaultValue: "Today" })}
                </button>
                <button
                  type="button"
                  onClick={() => setMenuDate("tomorrow")}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-xs font-bold",
                    menuDate === "tomorrow" ? "bg-[hsl(152,55%,28%)] text-white" : "bg-white border",
                  )}
                >
                  {t("restaurant.tomorrow", { defaultValue: "Tomorrow" })}
                </button>
                {restaurant.acceptsReservations && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[hsl(152,45%,94%)] px-3 py-1.5 text-xs font-bold text-[hsl(152,55%,28%)]">
                    <CalendarClock className="h-3.5 w-3.5" />
                    {t("restaurant.reserveFood", { defaultValue: "Reserve Food" })}
                  </span>
                )}
              </div>

              <div className="-mx-1 flex gap-2 overflow-x-auto px-1">
                {categories.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCategory(c)}
                    className={cn(
                      "shrink-0 rounded-full px-3 py-1.5 text-xs font-bold capitalize",
                      category === c ? "bg-[hsl(152,55%,28%)] text-white" : "bg-white border",
                    )}
                  >
                    {c === "all" ? t("restaurant.catAll", { defaultValue: "All" }) : c}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <h2 className="text-base font-extrabold">{t("restaurant.todayMenu")}</h2>
                {filteredItems.some((i) => i.orderableNow) && (
                  <span className="rounded-full bg-[hsl(152,50%,90%)] px-2 py-0.5 text-[10px] font-bold uppercase text-[hsl(152,55%,25%)]">
                    {t("restaurant.availAvailableNow")}
                  </span>
                )}
              </div>

              {filteredItems.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("restaurant.emptyMenu", { defaultValue: "No meals on this menu yet." })}</p>
              ) : (
                <ul className="space-y-3">
                  {filteredItems.map((item) => (
                    <li key={item.id} className="flex gap-3 rounded-2xl border border-black/5 bg-white p-3 shadow-sm">
                      <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-[hsl(152,25%,92%)]">
                        {item.photos?.[0] ? (
                          <img src={item.photos[0]} alt="" className="h-full w-full object-cover" />
                        ) : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-extrabold text-[hsl(152,30%,12%)]">{item.name}</p>
                            {item.description && (
                              <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{item.description}</p>
                            )}
                          </div>
                          <p className="shrink-0 text-sm font-extrabold text-[hsl(152,55%,28%)]">
                            {formatMoney(item.price, item.currency)}
                          </p>
                        </div>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {item.availableFrom} – {item.availableUntil}
                          {" · "}
                          {t(`restaurant.${availabilityLabelKey(item.availability)}`)}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {item.orderableNow && menuDate === "today" ? (
                            <button
                              type="button"
                              onClick={() => void openCustomize(item, "order")}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[hsl(152,55%,28%)] text-white"
                              aria-label={t("restaurant.addToCart", { defaultValue: "Add to cart" })}
                            >
                              <Plus className="h-4 w-4" />
                            </button>
                          ) : item.acceptsReservations && restaurant.acceptsReservations ? (
                            <button
                              type="button"
                              disabled={busyId === item.id}
                              onClick={() => {
                                void openCustomize(item, "reserve");
                                void quickReserve(item);
                              }}
                              className="inline-flex items-center gap-1 rounded-full border border-[hsl(152,40%,70%)] bg-[hsl(152,45%,96%)] px-3 py-1.5 text-[11px] font-bold text-[hsl(152,55%,28%)] disabled:opacity-60"
                            >
                              <CalendarClock className="h-3.5 w-3.5" />
                              {t("restaurant.reserveForTomorrow", { defaultValue: "Reserve for Tomorrow" })}
                            </button>
                          ) : (
                            <span className="text-xs font-semibold text-muted-foreground">
                              {t(`restaurant.${availabilityLabelKey(item.availability)}`)}
                            </span>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {tab === "info" && (
            <div className="mt-4 space-y-3 rounded-2xl border border-black/5 bg-white p-4 text-sm">
              <p className="flex items-start gap-2"><Info className="mt-0.5 h-4 w-4" />{restaurant.description || t("restaurant.noDescription", { defaultValue: "No description yet." })}</p>
              <p className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4" />{locationLine}</p>
              <p className="flex items-start gap-2"><Clock className="mt-0.5 h-4 w-4" />
                {restaurant.hours?.length
                  ? restaurant.hours.map((h) => (
                      <span key={h.weekday} className="mr-2 inline-block text-xs">
                        {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][h.weekday]}: {h.isClosed ? "Closed" : `${h.openTime}–${h.closeTime}`}
                      </span>
                    ))
                  : "—"}
              </p>
            </div>
          )}

          {tab === "photos" && (
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {photos.length === 0 ? (
                <p className="col-span-full text-sm text-muted-foreground">{t("restaurant.noPhotos", { defaultValue: "No photos yet." })}</p>
              ) : (
                photos.slice(0, 12).map((src, i) => (
                  <img key={`${src}-${i}`} src={src} alt="" className="aspect-square rounded-xl object-cover" loading="lazy" />
                ))
              )}
            </div>
          )}

          {tab === "about" && (
            <div className="mt-4 space-y-3 rounded-2xl border border-black/5 bg-white p-4 text-sm">
              <RestaurantNotice>{t("restaurant.identityBadgeNote")}</RestaurantNotice>
              <RestaurantNotice>{t("restaurant.freeLaunchNote")}</RestaurantNotice>
              <p className="text-muted-foreground">{restaurant.description}</p>
            </div>
          )}
        </div>

        {/* Sticky cart bar */}
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-black/5 bg-white/95 p-3 backdrop-blur">
          <div className="mx-auto flex max-w-3xl gap-2">
            <button
              type="button"
              onClick={() => setLocation("/restaurant/cart")}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl border-2 border-[hsl(152,55%,28%)] py-3 text-sm font-extrabold text-[hsl(152,55%,28%)]"
            >
              <ShoppingBag className="h-4 w-4" />
              {t("restaurant.viewCart", { defaultValue: "View Cart" })} ({totals.itemCount})
            </button>
            <button
              type="button"
              onClick={() => setLocation(totals.itemCount ? "/restaurant/checkout" : "/restaurant/cart")}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[hsl(152,55%,28%)] py-3 text-sm font-extrabold text-white"
            >
              <CalendarClock className="h-4 w-4" />
              {t("restaurant.reserveFood", { defaultValue: "Reserve Food" })}
            </button>
          </div>
        </div>

        {customizeItem && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center">
            <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-4 shadow-xl">
              <div className="mb-3 flex items-start justify-between gap-2">
                <div>
                  <p className="font-extrabold">{customizeItem.name}</p>
                  <p className="text-sm text-[hsl(152,55%,28%)]">{formatMoney(customizeItem.price, customizeItem.currency)}</p>
                </div>
                <button type="button" onClick={() => setCustomizeItem(null)} className="text-sm font-bold text-muted-foreground">
                  {t("common.close", { defaultValue: "Close" })}
                </button>
              </div>
              {customizeItem.allergens ? (
                <p className="mb-2 text-xs text-muted-foreground">
                  {t("restaurant.allergens")}: {customizeItem.allergens}
                </p>
              ) : null}
              <div className="space-y-3">
                {optionGroups.map((g) => (
                  <fieldset key={g.id} className="rounded-xl border p-3">
                    <legend className="px-1 text-sm font-bold">
                      {g.name}{g.required ? " *" : ""}
                    </legend>
                    <div className="mt-1 space-y-1">
                      {g.options.map((o) => (
                        <label key={o.id} className={cn("flex items-center gap-2 text-sm", o.soldOut && "opacity-40")}>
                          <input
                            type={g.maxSelect > 1 ? "checkbox" : "radio"}
                            name={`group-${g.id}`}
                            disabled={o.soldOut}
                            checked={(selectedOptions[g.id] || []).includes(o.id)}
                            onChange={() => toggleOption(g, o.id)}
                          />
                          <span className="flex-1">{o.name}</span>
                          {o.priceDelta ? (
                            <span className="text-xs font-semibold">+{formatMoney(o.priceDelta, customizeItem.currency)}</span>
                          ) : null}
                          {o.soldOut ? <span className="text-[10px] uppercase">{t("restaurant.availSoldOut")}</span> : null}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                ))}
              </div>
              <textarea
                className="mt-3 w-full rounded-xl border px-3 py-2 text-sm"
                rows={2}
                value={customizeNotes}
                placeholder={t("restaurant.orderNotesPlaceholder")}
                onChange={(e) => setCustomizeNotes(e.target.value)}
              />
              <button
                type="button"
                onClick={confirmCustomize}
                className="mt-3 w-full rounded-2xl bg-[hsl(152,55%,28%)] py-3 text-sm font-extrabold text-white"
              >
                {t("restaurant.addToCart")}
              </button>
            </div>
          </div>
        )}
      </div>
    </RestaurantPageGate>
  );
}

function QuickStat({
  icon: Icon,
  label,
  muted,
}: {
  icon: typeof Store;
  label: string;
  muted?: boolean;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-1", muted && "opacity-40")}>
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[hsl(152,40%,95%)] text-[hsl(152,55%,28%)]">
        <Icon className="h-4 w-4" />
      </span>
      <span className="line-clamp-2 text-[10px] font-semibold leading-tight text-muted-foreground">{label}</span>
    </div>
  );
}
