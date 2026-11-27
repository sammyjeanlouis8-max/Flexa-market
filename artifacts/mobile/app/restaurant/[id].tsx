import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { RestaurantContactBar } from "@/components/restaurant/RestaurantContactBar";
import { RestaurantShell } from "@/components/restaurant/RestaurantShell";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import {
  fetchDailyMenu,
  fetchDishOptions,
  fetchRestaurant,
  formatMoney,
  type DailyMenuItem,
  type DishOptionGroup,
  type Restaurant,
} from "@/lib/restaurantApi";
import { upsertCartLine } from "@/lib/restaurantCart";
import { isFavorite } from "@/lib/restaurantFavorites";
import { restaurantTheme as T } from "@/lib/restaurantTheme";

export default function RestaurantDetailScreen() {
  const { t } = useLanguage();
  const { token } = useAuth();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const restaurantId = Number(id);

  const [row, setRow] = useState<Restaurant | null>(null);
  const [items, setItems] = useState<DailyMenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [fav, setFav] = useState(false);

  const [customize, setCustomize] = useState<DailyMenuItem | null>(null);
  const [groups, setGroups] = useState<DishOptionGroup[]>([]);
  const [selected, setSelected] = useState<Record<number, number[]>>({});
  const [notes, setNotes] = useState("");

  const load = useCallback(async () => {
    if (!Number.isFinite(restaurantId)) return;
    setError(null);
    const r = await fetchRestaurant(restaurantId, { token });
    setRow(r);
    const menu = await fetchDailyMenu(restaurantId, undefined, { token });
    setItems(menu.items || []);
  }, [restaurantId, token]);

  useEffect(() => {
    setLoading(true);
    void load()
      .catch((e: Error) => setError(e.message || t("restaurant_notFound")))
      .finally(() => setLoading(false));
    if (Number.isFinite(restaurantId)) {
      void isFavorite(restaurantId).then(setFav);
    }
  }, [load, t, restaurantId]);

  async function openCustomize(item: DailyMenuItem) {
    setMsg(null);
    if (!item.orderableNow) {
      setMsg(t("restaurant_notOrderableNow") || "Not available right now.");
      return;
    }
    if (!item.dishModelId || !row) {
      await addLine(item);
      return;
    }
    try {
      const g = await fetchDishOptions(row.id, item.dishModelId, { token });
      if (!g.length) {
        await addLine(item);
        return;
      }
      setCustomize(item);
      setGroups(g);
      const initial: Record<number, number[]> = {};
      for (const group of g) {
        initial[group.id] =
          group.required && group.options[0] && !group.options[0].soldOut ? [group.options[0].id] : [];
      }
      setSelected(initial);
      setNotes("");
    } catch {
      await addLine(item);
    }
  }

  async function addLine(
    item: DailyMenuItem,
    extras?: { optionIds?: number[]; optionLabels?: string[]; priceDelta?: number; notes?: string },
  ) {
    if (!row) return;
    await upsertCartLine(
      { id: row.id, name: row.name },
      {
        dailyMenuItemId: item.id,
        name: item.name,
        price: item.price + (extras?.priceDelta || 0),
        currency: item.currency,
        quantity: 1,
        photo: item.photos?.[0] || null,
        optionIds: extras?.optionIds,
        optionLabels: extras?.optionLabels,
        notes: extras?.notes,
        mode: "order",
      },
    );
    setCustomize(null);
    setMsg(t("restaurant_addedCart") || "Added to cart.");
  }

  async function confirmCustomize() {
    if (!customize) return;
    for (const g of groups) {
      const picked = selected[g.id] || [];
      if (g.required && picked.length < Math.max(1, g.minSelect)) {
        setMsg(`Select required options for ${g.name}`);
        return;
      }
    }
    const optionIds: number[] = [];
    const optionLabels: string[] = [];
    let priceDelta = 0;
    for (const g of groups) {
      for (const oid of selected[g.id] || []) {
        const opt = g.options.find((o) => o.id === oid);
        if (!opt || opt.soldOut) continue;
        optionIds.push(oid);
        optionLabels.push(opt.name);
        priceDelta += Number(opt.priceDelta) || 0;
      }
    }
    await addLine(customize, { optionIds, optionLabels, priceDelta, notes: notes.trim() || undefined });
  }

  function toggleOption(group: DishOptionGroup, optionId: number) {
    setSelected((prev) => {
      const cur = prev[group.id] || [];
      if (group.maxSelect > 1) {
        const has = cur.includes(optionId);
        let next = has ? cur.filter((x) => x !== optionId) : [...cur, optionId];
        if (next.length > group.maxSelect) next = next.slice(-group.maxSelect);
        return { ...prev, [group.id]: next };
      }
      return { ...prev, [group.id]: cur.includes(optionId) ? [] : [optionId] };
    });
  }

  return (
    <RestaurantShell title={row?.name} subtitle={row ? `${row.city}, ${row.country}` : undefined} scroll={false}>
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
      >
        {loading ? (
          <ActivityIndicator color={T.accent} />
        ) : error || !row ? (
          <Text style={styles.err}>{error || t("restaurant_notFound")}</Text>
        ) : (
          <>
            <Text style={styles.note}>{t("restaurant_deliveryManagedByBusiness")}</Text>
            <RestaurantContactBar
              restaurant={row}
              saved={fav}
              onSavedChange={setFav}
              onViewMenu={() => {
                /* menu is below — keep scroll natural */
              }}
              onReserve={() => setMsg(t("restaurant_reserveHint") || "Choose a meal to reserve.")}
            />
            <Text style={styles.body}>{row.description || t("restaurant_noDescription") || ""}</Text>
            <Text style={styles.section}>{t("restaurant_todayMenu") || "Today's menu"}</Text>
            {items.length === 0 ? (
              <Text style={styles.muted}>{t("restaurant_emptyMenu") || "No meals yet."}</Text>
            ) : (
              items.map((item) => (
                <View key={item.id} style={styles.card}>
                  <View style={styles.cardRow}>
                    <View style={styles.thumb}>
                      {item.photos?.[0] ? <Image source={{ uri: item.photos[0] }} style={styles.thumbImg} /> : null}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardTitle}>{item.name}</Text>
                      <Text style={styles.price}>{formatMoney(item.price, item.currency)}</Text>
                      {item.allergens ? <Text style={styles.muted}>{item.allergens}</Text> : null}
                      <Pressable
                        style={[styles.addBtn, !item.orderableNow && styles.addDisabled]}
                        disabled={!item.orderableNow}
                        onPress={() => void openCustomize(item)}
                      >
                        <Text style={styles.addText}>{t("restaurant_addToCart") || "Add"}</Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              ))
            )}
            {msg ? <Text style={styles.msg}>{msg}</Text> : null}
            <Pressable style={styles.cartBar} onPress={() => router.push("/restaurant/cart" as any)}>
              <Text style={styles.cartBarText}>{t("restaurant_viewCart") || "View cart"}</Text>
            </Pressable>
          </>
        )}
      </ScrollView>

      <Modal visible={!!customize} animationType="slide" transparent>
        <View style={styles.modalWrap}>
          <View style={styles.modal}>
            <Text style={styles.cardTitle}>{customize?.name}</Text>
            {groups.map((g) => (
              <View key={g.id} style={styles.group}>
                <Text style={styles.groupTitle}>
                  {g.name}{g.required ? " *" : ""}
                </Text>
                {g.options.map((o) => (
                  <Pressable
                    key={o.id}
                    disabled={o.soldOut}
                    onPress={() => toggleOption(g, o.id)}
                    style={styles.optRow}
                  >
                    <Text style={{ flex: 1, opacity: o.soldOut ? 0.4 : 1 }}>
                      {(selected[g.id] || []).includes(o.id) ? "☑ " : "☐ "}
                      {o.name}
                      {o.priceDelta ? ` (+${formatMoney(o.priceDelta, customize?.currency || "USD")})` : ""}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ))}
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder={t("restaurant_orderNotesPlaceholder") || "Special instructions"}
              placeholderTextColor={T.muted}
              style={styles.input}
            />
            <Pressable style={styles.addBtn} onPress={() => void confirmCustomize()}>
              <Text style={styles.addText}>{t("restaurant_addToCart") || "Add to cart"}</Text>
            </Pressable>
            <Pressable onPress={() => setCustomize(null)} style={{ marginTop: 10 }}>
              <Text style={{ textAlign: "center", color: T.muted, fontWeight: "700" }}>
                {t("common_close") || "Close"}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </RestaurantShell>
  );
}

const styles = StyleSheet.create({
  note: { fontSize: 12, color: T.accent, marginBottom: 6, lineHeight: 17 },
  favBtn: {
    alignSelf: "flex-start",
    marginBottom: 10,
    backgroundColor: T.white,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  favText: { fontWeight: "800", color: T.accent, fontSize: 13 },
  body: { fontSize: 14, color: T.ink, lineHeight: 20, marginBottom: 12 },
  section: { fontSize: 16, fontWeight: "800", color: T.ink, marginBottom: 8 },
  card: {
    backgroundColor: T.white,
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  cardRow: { flexDirection: "row", gap: 12 },
  thumb: { width: 80, height: 80, borderRadius: 12, backgroundColor: "rgba(26,107,71,0.08)", overflow: "hidden" },
  thumbImg: { width: "100%", height: "100%" },
  cardTitle: { fontWeight: "800", color: T.ink, fontSize: 15 },
  price: { color: T.accent, fontWeight: "800", marginTop: 2 },
  muted: { color: T.muted, fontSize: 12, marginTop: 2 },
  addBtn: {
    marginTop: 8,
    alignSelf: "flex-start",
    backgroundColor: T.accent,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    minHeight: 36,
    justifyContent: "center",
  },
  addDisabled: { opacity: 0.4 },
  addText: { color: T.white, fontWeight: "800", fontSize: 12 },
  cartBar: {
    marginTop: 16,
    backgroundColor: T.forest,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
  },
  cartBarText: { color: T.white, fontWeight: "900" },
  msg: { marginTop: 8, color: T.accent, fontWeight: "700" },
  err: { color: "#b91c1c" },
  modalWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  modal: {
    backgroundColor: T.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    maxHeight: "85%",
  },
  group: { marginTop: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: T.line, borderRadius: 12, padding: 10 },
  groupTitle: { fontWeight: "800", marginBottom: 6, color: T.ink },
  optRow: { paddingVertical: 8 },
  input: {
    marginTop: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
    borderRadius: 12,
    padding: 12,
    color: T.ink,
  },
});
