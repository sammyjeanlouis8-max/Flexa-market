/**
 * Flexa Restaurant Hub — auto nearby by GPS, commune filter, manual search.
 */
import { Feather } from "@expo/vector-icons";
import * as Location from "expo-location";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { RestaurantCard } from "@/components/restaurant/RestaurantCard";
import { RestaurantGate } from "@/components/restaurant/RestaurantGate";
import { RestaurantShell } from "@/components/restaurant/RestaurantShell";
import { useAuth } from "@/context/AuthContext";
import {
  HAITI_COMMUNES_BY_DEPARTMENT,
  HAITI_DEPARTMENTS,
} from "@/lib/haitiCommunes";
import { fetchRestaurants } from "@/lib/restaurantApi";
import { restaurantTheme as T } from "@/lib/restaurantTheme";
import type { Restaurant } from "@/lib/restaurantTypes";

type Mode = "nearby" | "commune" | "search";

export default function RestaurantHubScreen() {
  const { token, user } = useAuth();
  const [mode, setMode] = useState<Mode>("nearby");
  const [q, setQ] = useState("");
  const [draftQ, setDraftQ] = useState("");
  const [openNow, setOpenNow] = useState(false);
  const [offersDelivery, setOffersDelivery] = useState(false);
  const [commune, setCommune] = useState(user?.city?.trim() || "");
  const [department, setDepartment] = useState<string>("Ouest");
  const [communePickerOpen, setCommunePickerOpen] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locStatus, setLocStatus] = useState<"idle" | "loading" | "ready" | "denied">("idle");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [list, setList] = useState<Restaurant[]>([]);
  const [metaNote, setMetaNote] = useState<string>("");

  const communes = useMemo(
    () => HAITI_COMMUNES_BY_DEPARTMENT[department] || [],
    [department],
  );

  const ensureLocation = useCallback(async () => {
    if (coords) return coords;
    setLocStatus("loading");
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setLocStatus("denied");
        return null;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setCoords(next);
      setLocStatus("ready");
      // Best-effort reverse geocode → suggest commune
      try {
        const places = await Location.reverseGeocodeAsync({
          latitude: next.lat,
          longitude: next.lng,
        });
        const city = places[0]?.city || places[0]?.subregion || places[0]?.district;
        if (city && !commune) setCommune(city);
      } catch {
        /* optional */
      }
      return next;
    } catch {
      setLocStatus("denied");
      return null;
    }
  }, [coords, commune]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      let latLng = coords;
      if (mode === "nearby") {
        latLng = (await ensureLocation()) || coords;
      }

      const rows = await fetchRestaurants(
        {
          q: mode === "search" ? q.trim() || undefined : undefined,
          openNow,
          offersDelivery,
          commune: mode === "commune" && commune.trim() ? commune.trim() : undefined,
          nearby: mode === "nearby" && !!latLng,
          lat: latLng?.lat,
          lng: latLng?.lng,
          radiusKm: 20,
        },
        { token },
      );
      setList(rows);

      if (mode === "nearby" && latLng) {
        setMetaNote(`Tou pre ou · rèyon 20 km${commune ? ` · sijesyon: ${commune}` : ""}`);
      } else if (mode === "commune" && commune) {
        setMetaNote(`Komin: ${commune}`);
      } else if (mode === "search" && q.trim()) {
        setMetaNote(`Rechèch: “${q.trim()}”`);
      } else {
        setMetaNote("Tout restoran pibliye");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load restaurants");
      setList([]);
    } finally {
      setLoading(false);
    }
  }, [
    token,
    mode,
    q,
    openNow,
    offersDelivery,
    commune,
    coords,
    ensureLocation,
  ]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const runSearch = () => {
    setMode("search");
    setQ(draftQ.trim());
  };

  return (
    <RestaurantGate>
      <RestaurantShell
        title="Discover Restaurants"
        subtitle="Komin ou · tou pre ou · rechèch manyèl"
      >
        <View style={styles.modeRow}>
          <ModeChip
            label="Tou pre"
            icon="navigation"
            active={mode === "nearby"}
            onPress={() => {
              setMode("nearby");
            }}
            testID="restaurant-mode-nearby"
          />
          <ModeChip
            label="Komin mwen"
            icon="map-pin"
            active={mode === "commune"}
            onPress={() => {
              setMode("commune");
              if (!commune) setCommunePickerOpen(true);
            }}
            testID="restaurant-mode-commune"
          />
          <ModeChip
            label="Rechèch"
            icon="search"
            active={mode === "search"}
            onPress={() => setMode("search")}
            testID="restaurant-mode-search"
          />
        </View>

        <View style={styles.searchRow}>
          <Feather name="search" size={16} color={T.muted} />
          <TextInput
            style={styles.search}
            value={draftQ}
            onChangeText={setDraftQ}
            onSubmitEditing={runSearch}
            placeholder="Non restoran, cuisine, komin…"
            placeholderTextColor="#94A3B8"
            returnKeyType="search"
            testID="restaurant-search"
          />
          <Pressable style={styles.searchBtn} onPress={runSearch} testID="restaurant-search-btn">
            <Text style={styles.searchBtnText}>Search</Text>
          </Pressable>
        </View>

        {mode === "commune" ? (
          <Pressable
            style={styles.communeBtn}
            onPress={() => setCommunePickerOpen(true)}
            testID="restaurant-pick-commune"
          >
            <Feather name="map-pin" size={16} color={T.forest} />
            <Text style={styles.communeBtnText} numberOfLines={1}>
              {commune || "Chwazi komin ou"}
            </Text>
            <Feather name="chevron-down" size={16} color={T.muted} />
          </Pressable>
        ) : null}

        {mode === "nearby" && locStatus === "denied" ? (
          <Text style={styles.locWarn}>
            GPS pa otorize — chwazi “Komin mwen” oswa itilize bouton Search.
          </Text>
        ) : null}

        <View style={styles.filters}>
          <Pressable
            style={[styles.filterChip, openNow && styles.filterChipOn]}
            onPress={() => setOpenNow((v) => !v)}
          >
            <Text style={[styles.filterText, openNow && styles.filterTextOn]}>Open Now</Text>
          </Pressable>
          <Pressable
            style={[styles.filterChip, offersDelivery && styles.filterChipOn]}
            onPress={() => setOffersDelivery((v) => !v)}
          >
            <Text style={[styles.filterText, offersDelivery && styles.filterTextOn]}>
              Offers Delivery
            </Text>
          </Pressable>
          <Pressable style={styles.filterChip} onPress={() => void load()}>
            <Feather name="refresh-cw" size={12} color={T.forest} />
            <Text style={[styles.filterText, { color: T.forest }]}>Refresh</Text>
          </Pressable>
        </View>

        {metaNote ? <Text style={styles.metaNote}>{metaNote}</Text> : null}

        {loading || (mode === "nearby" && locStatus === "loading") ? (
          <ActivityIndicator color={T.accent} style={{ marginTop: 24 }} />
        ) : error ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Couldn’t load restaurants</Text>
            <Text style={styles.emptyBody}>{error}</Text>
            <Pressable style={styles.retry} onPress={() => void load()}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : list.length === 0 ? (
          <View style={styles.empty}>
            <Feather name="coffee" size={28} color={T.accentSoft} />
            <Text style={styles.emptyTitle}>Pa gen restoran isit la</Text>
            <Text style={styles.emptyBody}>
              Eseye yon lòt komin, elaji rechèch la, oswa retire filtè Open Now.
            </Text>
          </View>
        ) : (
          list.map((r) => <RestaurantCard key={r.id} restaurant={r} />)
        )}

        <Modal visible={communePickerOpen} transparent animationType="slide">
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Chwazi komin</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                <View style={{ flexDirection: "row", gap: 6 }}>
                  {HAITI_DEPARTMENTS.map((d) => (
                    <Pressable
                      key={d}
                      style={[styles.deptChip, department === d && styles.deptOn]}
                      onPress={() => setDepartment(d)}
                    >
                      <Text style={[styles.deptText, department === d && styles.deptTextOn]}>{d}</Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
              <ScrollView style={{ maxHeight: 320 }}>
                {communes.map((c) => (
                  <Pressable
                    key={c}
                    style={styles.communeRow}
                    onPress={() => {
                      setCommune(c);
                      setMode("commune");
                      setCommunePickerOpen(false);
                    }}
                  >
                    <Text style={styles.communeRowText}>{c}</Text>
                    {commune === c ? <Feather name="check" size={16} color={T.forest} /> : null}
                  </Pressable>
                ))}
              </ScrollView>
              <Pressable style={styles.closeModal} onPress={() => setCommunePickerOpen(false)}>
                <Text style={styles.closeModalText}>Fèmen</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      </RestaurantShell>
    </RestaurantGate>
  );
}

function ModeChip({
  label,
  icon,
  active,
  onPress,
  testID,
}: {
  label: string;
  icon: React.ComponentProps<typeof Feather>["name"];
  active: boolean;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      style={[styles.modeChip, active && styles.modeChipOn]}
      onPress={onPress}
      testID={testID}
    >
      <Feather name={icon} size={13} color={active ? T.white : T.forest} />
      <Text style={[styles.modeText, active && styles.modeTextOn]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  modeRow: { flexDirection: "row", gap: 8, marginBottom: 10 },
  modeChip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: T.white,
    borderWidth: 1,
    borderColor: T.line,
  },
  modeChipOn: { backgroundColor: T.forest, borderColor: T.forest },
  modeText: { fontSize: 11, fontWeight: "800", color: T.forest },
  modeTextOn: { color: T.white },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: T.white,
    borderRadius: 12,
    paddingLeft: 12,
    paddingRight: 6,
    paddingVertical: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
    marginBottom: 10,
  },
  search: { flex: 1, fontSize: 14, color: T.ink, fontWeight: "600", paddingVertical: 8 },
  searchBtn: {
    backgroundColor: T.forest,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
  },
  searchBtnText: { color: T.white, fontWeight: "800", fontSize: 12 },
  communeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: T.mint,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 10,
  },
  communeBtnText: { flex: 1, fontWeight: "800", color: T.forest, fontSize: 13 },
  locWarn: { color: T.warn, fontSize: 12, fontWeight: "600", marginBottom: 8 },
  filters: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: T.white,
    borderWidth: 1,
    borderColor: T.line,
  },
  filterChipOn: { backgroundColor: T.mint, borderColor: T.accentSoft },
  filterText: { fontSize: 12, fontWeight: "700", color: T.muted },
  filterTextOn: { color: T.forest },
  metaNote: { fontSize: 12, color: T.muted, fontWeight: "600", marginBottom: 10 },
  empty: { alignItems: "center", paddingVertical: 40, paddingHorizontal: 16, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: "800", color: T.ink, marginTop: 8 },
  emptyBody: { fontSize: 13, color: T.muted, textAlign: "center", lineHeight: 18 },
  retry: {
    marginTop: 10,
    backgroundColor: T.forest,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  retryText: { color: T.white, fontWeight: "800", fontSize: 13 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: T.mintSoft,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 16,
    maxHeight: "80%",
  },
  modalTitle: { fontSize: 17, fontWeight: "800", color: T.ink, marginBottom: 10 },
  deptChip: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: T.white,
    borderWidth: 1,
    borderColor: T.line,
  },
  deptOn: { backgroundColor: T.forest, borderColor: T.forest },
  deptText: { fontSize: 11, fontWeight: "700", color: T.muted },
  deptTextOn: { color: T.white },
  communeRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: T.line,
  },
  communeRowText: { flex: 1, fontSize: 14, fontWeight: "700", color: T.ink },
  closeModal: {
    marginTop: 12,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: T.white,
    borderWidth: 1,
    borderColor: T.line,
  },
  closeModalText: { fontWeight: "800", color: T.ink },
});
