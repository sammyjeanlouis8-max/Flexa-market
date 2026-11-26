/**
 * Customer-facing restaurant detail + today's daily menu.
 */
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useLocalSearchParams, useFocusEffect } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { RestaurantGate } from "@/components/restaurant/RestaurantGate";
import { RestaurantShell } from "@/components/restaurant/RestaurantShell";
import { useAuth } from "@/context/AuthContext";
import { fetchDailyMenu, fetchRestaurant } from "@/lib/restaurantApi";
import { todayYmd, weekdayLabel } from "@/lib/restaurantHours";
import { restaurantTheme as T } from "@/lib/restaurantTheme";
import type { DailyMenuItem, DishCategory, Restaurant } from "@/lib/restaurantTypes";

const CATEGORY_ORDER: DishCategory[] = ["appetizer", "main", "side", "dessert", "drink", "other"];

function categoryLabel(c: string): string {
  return c.charAt(0).toUpperCase() + c.slice(1);
}

export default function RestaurantDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const restaurantId = Number(id);
  const { token } = useAuth();
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [menu, setMenu] = useState<DailyMenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const menuDate = todayYmd();

  const load = useCallback(async () => {
    if (!token || !Number.isFinite(restaurantId)) return;
    setLoading(true);
    setError(null);
    try {
      const [r, items] = await Promise.all([
        fetchRestaurant(restaurantId, { token }),
        fetchDailyMenu(restaurantId, menuDate, { token }),
      ]);
      setRestaurant(r);
      setMenu(items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load restaurant");
    } finally {
      setLoading(false);
    }
  }, [token, restaurantId, menuDate]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const grouped = useMemo(() => {
    const map = new Map<string, DailyMenuItem[]>();
    for (const item of menu) {
      const key = item.category || "other";
      const arr = map.get(key) ?? [];
      arr.push(item);
      map.set(key, arr);
    }
    const keys = [
      ...CATEGORY_ORDER.filter((c) => map.has(c)),
      ...[...map.keys()].filter((k) => !CATEGORY_ORDER.includes(k as DishCategory)),
    ];
    return keys.map((k) => ({ category: k, items: map.get(k)! }));
  }, [menu]);

  return (
    <RestaurantGate>
      <RestaurantShell
        title={restaurant?.name || "Restaurant"}
        subtitle={restaurant ? `${restaurant.city} · Today's menu` : "Loading…"}
      >
        {loading ? (
          <ActivityIndicator color={T.accent} style={{ marginTop: 24 }} />
        ) : error || !restaurant ? (
          <Text style={styles.error}>{error || "Not found"}</Text>
        ) : (
          <>
            <View style={styles.hero}>
              {restaurant.coverPhotoUrl || restaurant.logoUrl ? (
                <Image
                  source={{ uri: restaurant.coverPhotoUrl || restaurant.logoUrl || undefined }}
                  style={styles.cover}
                  contentFit="cover"
                />
              ) : (
                <View style={[styles.cover, styles.coverPh]}>
                  <Feather name="coffee" size={32} color={T.accentSoft} />
                </View>
              )}
              <View style={styles.badges}>
                <View style={[styles.badge, restaurant.isOpenNow ? styles.open : styles.closed]}>
                  <Text style={styles.badgeText}>{restaurant.isOpenNow ? "Open" : "Closed"}</Text>
                </View>
                {restaurant.offersDelivery ? (
                  <View style={[styles.badge, styles.delivery]}>
                    <Feather name="truck" size={12} color={T.white} />
                    <Text style={styles.badgeText}>Delivery</Text>
                  </View>
                ) : null}
              </View>
            </View>

            {restaurant.bio ? <Text style={styles.bio}>{restaurant.bio}</Text> : null}

            <View style={styles.infoCard}>
              <Row icon="map-pin" text={`${restaurant.addressLine1}, ${restaurant.city}${restaurant.country ? `, ${restaurant.country}` : ""}`} />
              {restaurant.phone ? <Row icon="phone" text={restaurant.phone} /> : null}
              {restaurant.cuisineTags.length ? (
                <Row icon="tag" text={restaurant.cuisineTags.join(" · ")} />
              ) : null}
              {restaurant.offersDelivery && restaurant.deliveryFeeUsd != null ? (
                <Row
                  icon="truck"
                  text={`Delivery fee $${restaurant.deliveryFeeUsd.toFixed(2)}${
                    restaurant.deliveryEtaMinutes ? ` · ~${restaurant.deliveryEtaMinutes} min` : ""
                  }`}
                />
              ) : null}
            </View>

            <Text style={styles.section}>Hours</Text>
            <View style={styles.hoursCard}>
              {restaurant.schedule.map((d) => (
                <View key={d.day} style={styles.hourRow}>
                  <Text style={styles.hourDay}>{weekdayLabel(d.day)}</Text>
                  <Text style={styles.hourTime}>
                    {d.isOpen && d.openTime && d.closeTime
                      ? `${d.openTime} – ${d.closeTime}`
                      : "Closed"}
                  </Text>
                </View>
              ))}
            </View>

            <Text style={styles.section}>Today’s Daily Menu · {menuDate}</Text>
            {grouped.length === 0 ? (
              <View style={styles.emptyMenu}>
                <Text style={styles.emptyTitle}>No dishes published for today</Text>
                <Text style={styles.emptyBody}>Check back later for today’s Meni Chak Jou.</Text>
              </View>
            ) : (
              grouped.map((g) => (
                <View key={g.category} style={{ marginBottom: 14 }}>
                  <Text style={styles.cat}>{categoryLabel(g.category)}</Text>
                  {g.items.map((item) => (
                    <View key={item.id} style={[styles.dish, (item.soldOut || !item.available) && styles.dishOff]}>
                      {item.photoUrl ? (
                        <Image source={{ uri: item.photoUrl }} style={styles.dishPhoto} contentFit="cover" />
                      ) : (
                        <View style={[styles.dishPhoto, styles.dishPhotoPh]}>
                          <Feather name="disc" size={16} color={T.accentSoft} />
                        </View>
                      )}
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.dishName} numberOfLines={1}>
                          {item.name}
                        </Text>
                        {item.description ? (
                          <Text style={styles.dishDesc} numberOfLines={2}>
                            {item.description}
                          </Text>
                        ) : null}
                        <View style={styles.dishMeta}>
                          <Text style={styles.price}>
                            {item.currency} {item.price.toFixed(2)}
                          </Text>
                          {item.soldOut || !item.available ? (
                            <Text style={styles.soldOut}>Sold out</Text>
                          ) : null}
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
              ))
            )}
          </>
        )}
      </RestaurantShell>
    </RestaurantGate>
  );
}

function Row({ icon, text }: { icon: React.ComponentProps<typeof Feather>["name"]; text: string }) {
  return (
    <View style={styles.row}>
      <Feather name={icon} size={14} color={T.accent} />
      <Text style={styles.rowText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: 14, overflow: "hidden", marginBottom: 12 },
  cover: { width: "100%", height: 160 },
  coverPh: { backgroundColor: T.forestDeep, alignItems: "center", justifyContent: "center" },
  badges: { position: "absolute", top: 10, left: 10, flexDirection: "row", gap: 6 },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  open: { backgroundColor: T.open },
  closed: { backgroundColor: "rgba(15,23,42,0.65)" },
  delivery: { backgroundColor: T.forest },
  badgeText: { color: T.white, fontSize: 11, fontWeight: "800" },
  bio: { fontSize: 14, color: T.muted, lineHeight: 20, marginBottom: 12 },
  infoCard: {
    backgroundColor: T.white,
    borderRadius: 12,
    padding: 12,
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
    marginBottom: 14,
  },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  rowText: { flex: 1, fontSize: 13, color: T.ink, fontWeight: "600", lineHeight: 18 },
  section: { fontSize: 15, fontWeight: "800", color: T.ink, marginBottom: 8, marginTop: 4 },
  hoursCard: {
    backgroundColor: T.white,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  hourRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  hourDay: { fontSize: 13, fontWeight: "700", color: T.ink },
  hourTime: { fontSize: 13, color: T.muted, fontWeight: "600" },
  cat: {
    fontSize: 12,
    fontWeight: "800",
    color: T.forest,
    letterSpacing: 0.5,
    marginBottom: 8,
    textTransform: "uppercase",
  },
  dish: {
    flexDirection: "row",
    gap: 10,
    backgroundColor: T.white,
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  dishOff: { opacity: 0.55 },
  dishPhoto: { width: 64, height: 64, borderRadius: 10 },
  dishPhotoPh: { backgroundColor: T.mint, alignItems: "center", justifyContent: "center" },
  dishName: { fontSize: 14, fontWeight: "800", color: T.ink },
  dishDesc: { fontSize: 12, color: T.muted, marginTop: 2, lineHeight: 16 },
  dishMeta: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 },
  price: { fontSize: 13, fontWeight: "800", color: T.forest },
  soldOut: { fontSize: 11, fontWeight: "800", color: T.danger },
  emptyMenu: {
    backgroundColor: T.white,
    borderRadius: 12,
    padding: 20,
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  emptyTitle: { fontSize: 14, fontWeight: "800", color: T.ink },
  emptyBody: { marginTop: 4, fontSize: 12, color: T.muted },
  error: { color: T.danger, fontWeight: "600" },
});
