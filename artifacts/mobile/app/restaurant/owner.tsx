import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { RestaurantShell } from "@/components/restaurant/RestaurantShell";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import {
  fetchOwnerStats,
  fetchRestaurantOrders,
  fetchRestaurants,
  formatMoney,
  patchOrderStatus,
  statusLabel,
  updateFoodTruckLocation,
  updateRestaurant,
  type Order,
  type OwnerStats,
  type Restaurant,
} from "@/lib/restaurantApi";
import { restaurantTheme as T } from "@/lib/restaurantTheme";

const OWNER_LINKS = [
  { path: "orders", titleKey: "restaurant_orders", bodyKey: "restaurant_myOrdersSubtitle" },
  { path: "reservations", titleKey: "restaurant_reservations", bodyKey: "restaurant_myReservationsSubtitle" },
  { path: "menu", titleKey: "restaurant_dailyMenu", bodyKey: "restaurant_dailyMenuSubtitle" },
  { path: "dishes", titleKey: "restaurant_dishModels", bodyKey: "restaurant_dishModelsSubtitle" },
  { path: "settings", titleKey: "restaurant_businessHours", bodyKey: "restaurant_deliverySettings" },
  { path: "identity", titleKey: "restaurant_identityVerification", bodyKey: "restaurant_identityVerificationSubtitle" },
  { path: "food-safety", titleKey: "restaurant_foodSafetyQuiz", bodyKey: "restaurant_foodSafetySubtitle" },
] as const;

export default function RestaurantOwnerScreen() {
  const { t } = useLanguage();
  const { token, user } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ rid?: string }>();
  const ridParam = Number(params.rid) || 0;

  const [mine, setMine] = useState<Restaurant[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [stats, setStats] = useState<OwnerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [truckLabel, setTruckLabel] = useState("");

  const active = mine.find((r) => (ridParam ? r.id === ridParam : true)) ?? mine[0];

  const load = useCallback(async () => {
    setMsg(null);
    try {
      const list = await fetchRestaurants({ mine: true }, { token });
      setMine(list);
      const current = list.find((r) => (ridParam ? r.id === ridParam : true)) ?? list[0];
      if (current) {
        const [s, o] = await Promise.all([
          fetchOwnerStats(current.id, { token }),
          fetchRestaurantOrders({ restaurantId: current.id }, { token }),
        ]);
        setStats(s);
        setOrders(o.slice(0, 8));
      } else {
        setStats(null);
        setOrders([]);
      }
    } catch (e: any) {
      setMsg(e?.message || t("restaurant_loadError"));
    }
  }, [token, ridParam, t]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load().finally(() => setLoading(false));
    }, [load]),
  );

  async function publish() {
    if (!active || !token) return;
    try {
      const updated = await updateRestaurant(active.id, { publish: true }, { token });
      setMine((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      setMsg(t("restaurant_published") || "Published");
    } catch (e: any) {
      setMsg(e?.message || "Publish failed");
    }
  }

  async function toggleOpen() {
    if (!active || !token) return;
    const updated = await updateRestaurant(
      active.id,
      { temporarilyClosed: !active.temporarilyClosed },
      { token },
    );
    setMine((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
  }

  async function setStatus(id: number, status: string) {
    if (!token) return;
    const updated = await patchOrderStatus(id, status, { token });
    setOrders((prev) => prev.map((o) => (o.id === id ? updated : o)));
    if (active) fetchOwnerStats(active.id, { token }).then(setStats).catch(() => undefined);
  }

  async function publishTruckLocation() {
    if (!active || !token || !truckLabel.trim()) return;
    try {
      const updated = await updateFoodTruckLocation(
        active.id,
        { locationLabel: truckLabel.trim() },
        { token },
      );
      setMine((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      setMsg(t("restaurant_locationUpdated") || "Operating location published");
    } catch (e: any) {
      setMsg(e?.message || "Location update failed");
    }
  }

  const isSuperAdmin = String((user as any)?.role || "").toLowerCase() === "super_admin";

  return (
    <RestaurantShell title={t("restaurant_ownerDashboard")} subtitle={t("restaurant_ownerDashboardSubtitle")} scroll={false}>
      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load().finally(() => setRefreshing(false));
            }}
            tintColor={T.accent}
          />
        }
        contentContainerStyle={{ paddingBottom: 32 }}
      >
        <Text style={styles.note}>{t("restaurant_freeLaunchNote")}</Text>
        <Text style={styles.policy}>{t("restaurant_deliveryManagedByBusiness")}</Text>

        {loading ? (
          <ActivityIndicator color={T.accent} style={{ marginTop: 24 }} />
        ) : !active ? (
          <View style={styles.card}>
            <Text style={styles.title}>{t("restaurant_myRestaurant") || "My restaurant"}</Text>
            <Text style={styles.muted}>{t("restaurant_emptyTitle")}</Text>
            <Pressable style={styles.btn} onPress={() => router.push("/restaurant/add" as any)}>
              <Text style={styles.btnText}>{t("restaurant_addRestaurant")}</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {mine.length > 1 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
                {mine.map((r) => (
                  <Pressable
                    key={r.id}
                    style={[styles.chip, active.id === r.id && styles.chipOn]}
                    onPress={() => router.setParams({ rid: String(r.id) })}
                  >
                    <Text style={[styles.chipText, active.id === r.id && styles.chipTextOn]}>{r.name}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}

            <View style={styles.card}>
              <Text style={styles.title}>{active.name}</Text>
              <Text style={styles.muted}>
                {active.status} · {active.identityStatus}
                {active.foodSafetyCompleted ? " · food safety ✓" : ""}
              </Text>
              <Text style={styles.muted}>
                {active.city}, {active.country} · {active.businessType || "restaurant"}
              </Text>
              <View style={styles.row}>
                <Pressable style={styles.secondary} onPress={() => void toggleOpen()}>
                  <Text style={styles.secondaryText}>
                    {active.temporarilyClosed
                      ? t("restaurant_markOpen") || "Mark open"
                      : t("restaurant_markClosed") || "Temporarily close"}
                  </Text>
                </Pressable>
                {active.status !== "published" ? (
                  <Pressable style={styles.btn} onPress={() => void publish()}>
                    <Text style={styles.btnText}>{t("restaurant_publish") || "Publish"}</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>

            {stats ? (
              <View style={styles.statsRow}>
                <Stat label="New" value={String((stats as any).orders?.new ?? 0)} />
                <Stat label="Preparing" value={String((stats as any).orders?.preparing ?? 0)} />
                <Stat label="Ready" value={String((stats as any).orders?.ready ?? 0)} />
                <Stat
                  label="Rating"
                  value={(stats as any).avgRating ? Number((stats as any).avgRating).toFixed(1) : "—"}
                />
              </View>
            ) : null}

            {active.businessType === "food_truck" ? (
              <View style={styles.card}>
                <Text style={styles.title}>{t("restaurant_truckLocation") || "Food truck location"}</Text>
                <TextInput
                  value={truckLabel}
                  onChangeText={setTruckLabel}
                  placeholder="e.g. Delmas 33 corner"
                  placeholderTextColor={T.muted}
                  style={styles.input}
                />
                <Pressable style={styles.btn} onPress={() => void publishTruckLocation()}>
                  <Text style={styles.btnText}>{t("restaurant_publishLocation") || "Publish location"}</Text>
                </Pressable>
              </View>
            ) : null}

            {OWNER_LINKS.map((l) => (
              <Pressable
                key={l.path}
                style={styles.link}
                onPress={() => router.push(`/restaurant/owner/${l.path}?rid=${active.id}` as any)}
              >
                <Text style={styles.title}>{t(l.titleKey) || l.path}</Text>
                <Text style={styles.muted}>{t(l.bodyKey) || ""}</Text>
              </Pressable>
            ))}

            <Text style={styles.section}>{t("restaurant_incomingOrders") || "Incoming orders"}</Text>
            {orders.length === 0 ? (
              <Text style={styles.muted}>{t("restaurant_noOrders")}</Text>
            ) : (
              orders.map((o) => (
                <View key={o.id} style={styles.card}>
                  <View style={styles.rowBetween}>
                    <Text style={styles.title}>#{o.id}</Text>
                    <Text style={styles.badge}>{statusLabel(o.status)}</Text>
                  </View>
                  <Text style={styles.muted}>
                    {formatMoney(o.total, o.currency)} · {o.fulfillment}
                  </Text>
                  <View style={styles.row}>
                    {["confirmed", "preparing", "ready_for_pickup", "out_for_delivery", "completed"].map((s) => (
                      <Pressable key={s} style={styles.mini} onPress={() => void setStatus(o.id, s)}>
                        <Text style={styles.miniText}>{statusLabel(s)}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ))
            )}

            {isSuperAdmin ? (
              <Pressable
                style={styles.link}
                onPress={() => router.push("/restaurant/admin/countries" as any)}
              >
                <Text style={styles.title}>{t("restaurant_adminCountries") || "Country availability"}</Text>
                <Text style={styles.muted}>{t("restaurant_adminCountriesBody") || "Super Admin regulatory controls"}</Text>
              </Pressable>
            ) : null}
          </>
        )}

        {msg ? <Text style={styles.msg}>{msg}</Text> : null}
        <Pressable style={styles.secondary} onPress={() => router.push("/restaurant/add" as any)}>
          <Text style={styles.secondaryText}>{t("restaurant_addRestaurant")}</Text>
        </Pressable>
      </ScrollView>
    </RestaurantShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statVal}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  note: { fontSize: 12, color: T.muted, marginBottom: 6, lineHeight: 17 },
  policy: { fontSize: 12, color: T.accent, marginBottom: 12, lineHeight: 17 },
  card: {
    backgroundColor: T.white,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  link: {
    backgroundColor: T.white,
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  title: { fontWeight: "800", color: T.ink },
  muted: { marginTop: 4, fontSize: 13, color: T.muted },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10, marginBottom: 4 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  chip: {
    backgroundColor: T.white,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
    marginBottom: 8,
  },
  chipOn: { backgroundColor: T.accent, borderColor: T.accent },
  chipText: { fontSize: 12, fontWeight: "800", color: T.ink },
  chipTextOn: { color: T.white },
  btn: {
    backgroundColor: T.accent,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: "center",
    marginTop: 8,
  },
  btnText: { color: T.white, fontWeight: "900" },
  secondary: {
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
    backgroundColor: T.white,
    alignItems: "center",
    marginTop: 8,
  },
  secondaryText: { fontWeight: "800", color: T.ink },
  input: {
    backgroundColor: T.mintSoft,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
    padding: 12,
    color: T.ink,
    marginTop: 8,
  },
  statsRow: { flexDirection: "row", gap: 8, marginBottom: 10 },
  stat: {
    flex: 1,
    backgroundColor: T.white,
    borderRadius: 12,
    padding: 10,
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  statVal: { fontWeight: "900", color: T.accent, fontSize: 18 },
  statLabel: { fontSize: 10, color: T.muted, marginTop: 2, fontWeight: "700" },
  section: { fontSize: 15, fontWeight: "800", color: T.ink, marginTop: 8, marginBottom: 8 },
  badge: {
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    color: T.accent,
    backgroundColor: "rgba(26,107,71,0.1)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: "hidden",
  },
  mini: {
    backgroundColor: "rgba(26,107,71,0.08)",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  miniText: { fontSize: 10, fontWeight: "800", color: T.accent },
  msg: { color: T.accent, marginTop: 8, fontWeight: "700" },
});
