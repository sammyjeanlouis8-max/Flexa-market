import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useMarketplace } from "@/context/MarketplaceContext";
import { COUNTRY_FLAGS, SUPPORTED_COUNTRIES } from "@/lib/countries";
import {
  fetchMyBlocks,
  fetchMyHides,
  unblockUser,
  unhideListing,
  unhideSellerListings,
} from "@/lib/safetyApi";

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token } = useAuth();
  const { country, setCountry } = useMarketplace();
  const [open, setOpen] = useState(false);
  const [blocked, setBlocked] = useState<Array<{ id: number; name: string; avatar: string | null }>>([]);
  const [hiddenListings, setHiddenListings] = useState<
    Array<{ id: number; listingId: number; title: string; image: string | null }>
  >([]);
  const [hiddenSellers, setHiddenSellers] = useState<
    Array<{ id: number; sellerId: number; sellerName: string; sellerAvatar: string | null }>
  >([]);
  const [loadingSafety, setLoadingSafety] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const loadSafety = useCallback(async () => {
    if (!token) {
      setBlocked([]);
      setHiddenListings([]);
      setHiddenSellers([]);
      return;
    }
    setLoadingSafety(true);
    try {
      const [blocks, hides] = await Promise.all([
        fetchMyBlocks({ token }),
        fetchMyHides({ token }),
      ]);
      setBlocked(blocks);
      setHiddenListings(hides.listings);
      setHiddenSellers(hides.sellers);
    } catch {
      /* keep previous */
    } finally {
      setLoadingSafety(false);
    }
  }, [token]);

  useEffect(() => {
    void loadSafety();
  }, [loadSafety]);

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.topBar}>
        <Pressable
          style={styles.back}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
        >
          <Feather name="arrow-left" size={22} color="#0F172A" />
        </Pressable>
        <Text style={styles.title}>Settings</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        <Pressable style={styles.row} onPress={() => setOpen(true)}>
          <View>
            <Text style={styles.label}>Marketplace country</Text>
            <Text style={styles.value}>
              {COUNTRY_FLAGS[country] ?? ""} {country}
            </Text>
          </View>
          <Feather name="chevron-right" size={18} color="#94A3B8" />
        </Pressable>

        <Pressable style={[styles.row, { marginTop: 10 }]} onPress={() => router.push("/edit-profile")}>
          <View>
            <Text style={styles.label}>Account</Text>
            <Text style={styles.value}>Edit profile</Text>
          </View>
          <Feather name="chevron-right" size={18} color="#94A3B8" />
        </Pressable>

        <Pressable style={[styles.row, { marginTop: 10 }]} onPress={() => router.push("/addresses")}>
          <View>
            <Text style={styles.label}>Delivery</Text>
            <Text style={styles.value}>Address book</Text>
          </View>
          <Feather name="chevron-right" size={18} color="#94A3B8" />
        </Pressable>

        <Pressable
          style={[styles.row, { marginTop: 10 }]}
          onPress={() => router.push("/language-picker")}
        >
          <View>
            <Text style={styles.label}>Preferences</Text>
            <Text style={styles.value}>Language</Text>
          </View>
          <Feather name="chevron-right" size={18} color="#94A3B8" />
        </Pressable>

        <Text style={styles.section}>Blocked users</Text>
        {!token ? (
          <Text style={styles.hint}>Sign in to manage blocked accounts.</Text>
        ) : loadingSafety ? (
          <ActivityIndicator color="#F97316" style={{ marginVertical: 16 }} />
        ) : blocked.length === 0 ? (
          <Text style={styles.hint}>You have not blocked anyone.</Text>
        ) : (
          blocked.map((b) => (
            <View key={b.id} style={styles.safetyRow}>
              {b.avatar ? (
                <Image source={{ uri: b.avatar }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback]}>
                  <Feather name="user" size={16} color="#64748B" />
                </View>
              )}
              <Text style={styles.safetyName} numberOfLines={1}>{b.name}</Text>
              <Pressable
                style={styles.actionBtn}
                disabled={busyKey === `unblock:${b.id}`}
                onPress={() => {
                  if (!token) return;
                  setBusyKey(`unblock:${b.id}`);
                  void unblockUser(b.id, { token })
                    .then(() => setBlocked((prev) => prev.filter((x) => x.id !== b.id)))
                    .catch((e) => Alert.alert("Error", e instanceof Error ? e.message : "Unblock failed"))
                    .finally(() => setBusyKey(null));
                }}
              >
                <Text style={styles.actionText}>Unblock</Text>
              </Pressable>
            </View>
          ))
        )}

        <Text style={styles.section}>Hidden products</Text>
        {!token ? (
          <Text style={styles.hint}>Sign in to restore hidden products across devices.</Text>
        ) : loadingSafety ? null : hiddenListings.length === 0 && hiddenSellers.length === 0 ? (
          <Text style={styles.hint}>You have not hidden any products.</Text>
        ) : (
          <>
            {hiddenListings.map((h) => (
              <View key={`l-${h.id}`} style={styles.safetyRow}>
                {h.image ? (
                  <Image source={{ uri: h.image }} style={styles.thumb} />
                ) : (
                  <View style={[styles.thumb, styles.avatarFallback]}>
                    <Feather name="package" size={16} color="#64748B" />
                  </View>
                )}
                <Text style={styles.safetyName} numberOfLines={2}>{h.title}</Text>
                <Pressable
                  style={styles.actionBtn}
                  disabled={busyKey === `listing:${h.listingId}`}
                  onPress={() => {
                    if (!token) return;
                    setBusyKey(`listing:${h.listingId}`);
                    void unhideListing(h.listingId, { token })
                      .then(() => setHiddenListings((prev) => prev.filter((x) => x.listingId !== h.listingId)))
                      .catch((e) => Alert.alert("Error", e instanceof Error ? e.message : "Restore failed"))
                      .finally(() => setBusyKey(null));
                  }}
                >
                  <Text style={styles.actionText}>Show</Text>
                </Pressable>
              </View>
            ))}
            {hiddenSellers.map((h) => (
              <View key={`s-${h.id}`} style={styles.safetyRow}>
                {h.sellerAvatar ? (
                  <Image source={{ uri: h.sellerAvatar }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, styles.avatarFallback]}>
                    <Feather name="shopping-bag" size={16} color="#64748B" />
                  </View>
                )}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.safetyName} numberOfLines={1}>{h.sellerName}</Text>
                  <Text style={styles.safetySub}>All products from this seller</Text>
                </View>
                <Pressable
                  style={styles.actionBtn}
                  disabled={busyKey === `seller:${h.sellerId}`}
                  onPress={() => {
                    if (!token) return;
                    setBusyKey(`seller:${h.sellerId}`);
                    void unhideSellerListings(h.sellerId, { token })
                      .then(() => setHiddenSellers((prev) => prev.filter((x) => x.sellerId !== h.sellerId)))
                      .catch((e) => Alert.alert("Error", e instanceof Error ? e.message : "Restore failed"))
                      .finally(() => setBusyKey(null));
                  }}
                >
                  <Text style={styles.actionText}>Show</Text>
                </Pressable>
              </View>
            ))}
          </>
        )}

        <Text style={styles.hint}>
          Guests browse listings for the selected country. Signed-in shoppers use
          their account country from the DigitalOcean backend. Orders stay available
          even when a product is hidden or a chat partner is blocked.
        </Text>
      </ScrollView>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <Text style={styles.sheetTitle}>Select country</Text>
            <FlatList
              data={SUPPORTED_COUNTRIES}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.countryRow}
                  onPress={() => {
                    setCountry(item);
                    setOpen(false);
                  }}
                >
                  <Text style={styles.countryLabel}>
                    {COUNTRY_FLAGS[item] ?? ""} {item}
                  </Text>
                  {country === item ? <Feather name="check" size={18} color="#F97316" /> : null}
                </Pressable>
              )}
            />
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F8FAFC", paddingHorizontal: 12 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  title: { fontSize: 18, fontWeight: "800", color: "#0F172A" },
  row: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  label: { fontSize: 15, fontWeight: "700", color: "#0F172A" },
  value: { fontSize: 12, color: "#64748B", marginTop: 2 },
  section: {
    marginTop: 22,
    marginBottom: 8,
    marginHorizontal: 4,
    fontSize: 12,
    fontWeight: "800",
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  safetyRow: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#E2E8F0" },
  thumb: { width: 40, height: 40, borderRadius: 10, backgroundColor: "#E2E8F0" },
  avatarFallback: { alignItems: "center", justifyContent: "center" },
  safetyName: { flex: 1, fontSize: 14, fontWeight: "600", color: "#0F172A" },
  safetySub: { fontSize: 11, color: "#64748B", marginTop: 2 },
  actionBtn: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  actionText: { fontSize: 12, fontWeight: "700", color: "#0F172A" },
  hint: {
    marginTop: 10,
    marginHorizontal: 4,
    fontSize: 12,
    lineHeight: 18,
    color: "#64748B",
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.35)",
    justifyContent: "flex-end",
  },
  sheet: {
    maxHeight: "70%",
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 16,
  },
  sheetTitle: { fontSize: 16, fontWeight: "800", marginBottom: 8, color: "#0F172A" },
  countryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  countryLabel: { fontSize: 15, fontWeight: "600", color: "#0F172A" },
});
