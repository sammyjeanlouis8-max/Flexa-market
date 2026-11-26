/**
 * My Restaurant / Owner Dashboard — gate Add Restaurant behind KYC.
 */
import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { RestaurantCard } from "@/components/restaurant/RestaurantCard";
import { RestaurantGate } from "@/components/restaurant/RestaurantGate";
import { RestaurantShell } from "@/components/restaurant/RestaurantShell";
import { useAuth } from "@/context/AuthContext";
import {
  canPublishRestaurant,
  mapKycToRestaurantVerification,
} from "@/lib/restaurantAccess";
import { fetchMyRestaurants } from "@/lib/restaurantApi";
import { restaurantTheme as T } from "@/lib/restaurantTheme";
import type { Restaurant } from "@/lib/restaurantTypes";

export default function RestaurantOwnerScreen() {
  const { token, user } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [list, setList] = useState<Restaurant[]>([]);
  const [error, setError] = useState<string | null>(null);

  const verification = mapKycToRestaurantVerification(user?.kycStatus);
  const verified = canPublishRestaurant(user);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchMyRestaurants({ token });
      setList(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load your restaurants");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const onAdd = () => {
    if (!verified) {
      router.push("/restaurant/verify" as never);
      return;
    }
    router.push("/restaurant/add" as never);
  };

  return (
    <RestaurantGate>
      <RestaurantShell title="My Restaurant" subtitle="Owner dashboard · Meni Chak Jou">
        <View style={styles.statusCard}>
          <View style={styles.statusIcon}>
            <Feather
              name={verified ? "check-circle" : "shield"}
              size={20}
              color={verified ? T.open : T.warn}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.statusTitle}>
              {verification === "verified"
                ? "Identity verified"
                : verification === "pending_review"
                  ? "Verification pending review"
                  : verification === "rejected"
                    ? "Verification rejected"
                    : "Identity not verified"}
            </Text>
            <Text style={styles.statusBody}>
              {verified
                ? "You can create and publish restaurants."
                : "Verify your passport or ID card before publishing a restaurant."}
            </Text>
          </View>
          {!verified ? (
            <Pressable style={styles.verifyBtn} onPress={() => router.push("/restaurant/verify" as never)}>
              <Text style={styles.verifyBtnText}>Verify</Text>
            </Pressable>
          ) : null}
        </View>

        <Pressable style={styles.addBtn} onPress={onAdd} testID="restaurant-add-cta">
          <Feather name="plus" size={18} color={T.white} />
          <Text style={styles.addBtnText}>Add Restaurant</Text>
          <Feather name="chevron-right" size={16} color="rgba(255,255,255,0.7)" />
        </Pressable>

        {loading ? (
          <ActivityIndicator color={T.accent} style={{ marginTop: 24 }} />
        ) : error ? (
          <Text style={styles.error}>{error}</Text>
        ) : list.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No restaurant yet</Text>
            <Text style={styles.emptyBody}>
              Create your kitchen profile, hours, and today’s daily menu.
            </Text>
          </View>
        ) : (
          list.map((r) => (
            <View key={r.id}>
              <RestaurantCard restaurant={r} />
              <View style={styles.ownerActions}>
                <Pressable
                  style={styles.action}
                  onPress={() => router.push(`/restaurant/${r.id}/edit` as never)}
                >
                  <Feather name="edit-3" size={14} color={T.forest} />
                  <Text style={styles.actionText}>Edit</Text>
                </Pressable>
                <Pressable
                  style={styles.action}
                  onPress={() => router.push(`/restaurant/${r.id}/dishes` as never)}
                >
                  <Feather name="book" size={14} color={T.forest} />
                  <Text style={styles.actionText}>Modèl Manje</Text>
                </Pressable>
                <Pressable
                  style={styles.action}
                  onPress={() => router.push(`/restaurant/${r.id}/menu` as never)}
                >
                  <Feather name="calendar" size={14} color={T.forest} />
                  <Text style={styles.actionText}>Meni Chak Jou</Text>
                </Pressable>
              </View>
            </View>
          ))
        )}
      </RestaurantShell>
    </RestaurantGate>
  );
}

const styles = StyleSheet.create({
  statusCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: T.white,
    borderRadius: 14,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
    marginBottom: 12,
  },
  statusIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: T.mint,
    alignItems: "center",
    justifyContent: "center",
  },
  statusTitle: { fontSize: 14, fontWeight: "800", color: T.ink },
  statusBody: { marginTop: 2, fontSize: 12, color: T.muted, lineHeight: 16 },
  verifyBtn: {
    backgroundColor: T.forest,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  verifyBtnText: { color: T.white, fontWeight: "800", fontSize: 12 },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: T.forest,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  addBtnText: { flex: 1, color: T.white, fontSize: 15, fontWeight: "800" },
  empty: { paddingVertical: 28, alignItems: "center", gap: 6 },
  emptyTitle: { fontSize: 16, fontWeight: "800", color: T.ink },
  emptyBody: { fontSize: 13, color: T.muted, textAlign: "center" },
  error: { color: T.danger, marginTop: 12, fontWeight: "600" },
  ownerActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: -4,
    marginBottom: 14,
  },
  action: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: T.mint,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
  },
  actionText: { fontSize: 12, fontWeight: "700", color: T.forest },
});
