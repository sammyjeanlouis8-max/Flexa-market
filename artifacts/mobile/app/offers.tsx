import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { AppHeader } from "@/components/shell/AppHeader";
import colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { acceptOffer, counterOffer, fetchOffers, rejectOffer, type Offer } from "@/lib/offersApi";

export default function OffersScreen() {
  const router = useRouter();
  const { token, user } = useAuth();
  const [sent, setSent] = useState<Offer[]>([]);
  const [received, setReceived] = useState<Offer[]>([]);
  const [tab, setTab] = useState<"received" | "sent">("received");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await fetchOffers({ token });
      setSent(data.sent || []);
      setReceived(data.received || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!token) {
    return (
      <View style={styles.root}>
        <AppHeader title="Offers" showBrand={false} showBack />
        <View style={styles.center}>
          <Text style={styles.msg}>Sign in to manage offers.</Text>
          <Pressable style={styles.btn} onPress={() => router.push("/auth/login")}>
            <Text style={styles.btnText}>Log in</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const rows = tab === "received" ? received : sent;

  return (
    <View style={styles.root}>
      <AppHeader title="Offers & Promotions" showBrand={false} showBack />
      <View style={styles.tabs}>
        {(["received", "sent"] as const).map((t) => (
          <Pressable key={t} style={[styles.tab, tab === t && styles.tabOn]} onPress={() => setTab(t)}>
            <Text style={[styles.tabText, tab === t && styles.tabTextOn]}>{t}</Text>
          </Pressable>
        ))}
      </View>
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.flexaGreen} />
      ) : error ? (
        <Text style={styles.msg}>{error}</Text>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(o) => String(o.id)}
          contentContainerStyle={{ padding: 12, gap: 10 }}
          ListEmptyComponent={<Text style={styles.msg}>No {tab} offers.</Text>}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.title}>{item.listingTitle || `Listing #${item.listingId}`}</Text>
              <Text style={styles.meta}>
                ${Number(item.amount).toFixed(2)} · {item.status}
              </Text>
              {tab === "received" && item.status === "pending" ? (
                <View style={styles.actions}>
                  <Pressable
                    onPress={() =>
                      void acceptOffer(item.id, { token })
                        .then(load)
                        .catch((e) => Alert.alert("Accept failed", String(e.message || e)))
                    }
                  >
                    <Text style={styles.link}>Accept</Text>
                  </Pressable>
                  <Pressable
                    onPress={() =>
                      void rejectOffer(item.id, { token })
                        .then(load)
                        .catch((e) => Alert.alert("Reject failed", String(e.message || e)))
                    }
                  >
                    <Text style={[styles.link, { color: "#EF4444" }]}>Reject</Text>
                  </Pressable>
                  <Pressable
                    onPress={() =>
                      void counterOffer(item.id, Number(item.amount) * 1.05, undefined, { token })
                        .then(load)
                        .catch((e) => Alert.alert("Counter failed", String(e.message || e)))
                    }
                  >
                    <Text style={styles.link}>Counter +5%</Text>
                  </Pressable>
                </View>
              ) : null}
              <Text style={styles.meta}>
                {user?.id === item.sellerId ? `Buyer #${item.buyerId}` : `Seller #${item.sellerId}`}
              </Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#FFFFFF" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  tabs: { flexDirection: "row", gap: 8, padding: 12 },
  tab: { flex: 1, borderRadius: 10, borderWidth: 1, borderColor: "#E2E8F0", paddingVertical: 10, alignItems: "center" },
  tabOn: { backgroundColor: colors.flexaGreen, borderColor: colors.flexaGreen },
  tabText: { fontWeight: "700", color: "#334155", textTransform: "capitalize" },
  tabTextOn: { color: "#FFF" },
  card: { borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 14, padding: 14, gap: 4 },
  title: { fontWeight: "800", color: "#0F172A" },
  meta: { color: "#64748B", fontSize: 13 },
  actions: { flexDirection: "row", gap: 14, marginTop: 8 },
  link: { color: colors.flexaOrange, fontWeight: "800" },
  msg: { textAlign: "center", color: "#64748B", marginTop: 24 },
  btn: { backgroundColor: colors.flexaGreen, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 20 },
  btnText: { color: "#FFF", fontWeight: "800" },
});
