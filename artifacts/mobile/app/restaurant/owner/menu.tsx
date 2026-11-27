import { useLocalSearchParams } from "expo-router";
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
import { useFocusEffect } from "expo-router";
import { RestaurantShell } from "@/components/restaurant/RestaurantShell";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import {
  addDailyMenuItem,
  fetchDailyMenu,
  fetchDishModels,
  formatMoney,
  type DailyMenuItem,
  type DishModel,
} from "@/lib/restaurantApi";
import { restaurantTheme as T } from "@/lib/restaurantTheme";

export default function OwnerMenuScreen() {
  const { t } = useLanguage();
  const { token } = useAuth();
  const { rid } = useLocalSearchParams<{ rid?: string }>();
  const restaurantId = Number(rid) || 0;
  const [items, setItems] = useState<DailyMenuItem[]>([]);
  const [dishes, setDishes] = useState<DishModel[]>([]);
  const [menuDate, setMenuDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDish, setSelectedDish] = useState<number | null>(null);
  const [price, setPrice] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!restaurantId) return;
    setError(null);
    try {
      const [menu, models] = await Promise.all([
        fetchDailyMenu(restaurantId, undefined, { token }),
        fetchDishModels(restaurantId, { token }),
      ]);
      setItems(menu.items || []);
      setMenuDate(menu.menuDate || "");
      setDishes(models);
    } catch (e: any) {
      setError(e?.message || t("restaurant_loadError"));
    }
  }, [restaurantId, token, t]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load().finally(() => setLoading(false));
    }, [load]),
  );

  async function addItem() {
    if (!selectedDish || !token) return;
    const dish = dishes.find((d) => d.id === selectedDish);
    if (!dish) return;
    if (!dish.photos?.length) {
      setError(t("restaurant_foodImageRequired") || "Food image required before publishing to daily menu.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await addDailyMenuItem(
        restaurantId,
        {
          dishModelId: dish.id,
          name: dish.name,
          description: dish.description,
          photos: dish.photos,
          price: Number(price) || dish.price,
          currency: dish.currency || "USD",
          allergens: dish.allergens,
        },
        { token },
      );
      setSelectedDish(null);
      setPrice("");
      await load();
    } catch (e: any) {
      setError(e?.message || "Could not add item");
    } finally {
      setSaving(false);
    }
  }

  return (
    <RestaurantShell title={t("restaurant_dailyMenu") || "Daily menu"} subtitle={t("restaurant_dailyMenuSubtitle") || menuDate} scroll={false}>
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
        ) : (
          <>
            <Text style={styles.section}>{t("restaurant_addToMenu") || "Add from dish models"}</Text>
            {dishes.map((d) => (
              <Pressable
                key={d.id}
                style={[styles.card, selectedDish === d.id && styles.cardOn]}
                onPress={() => {
                  setSelectedDish(d.id);
                  setPrice(String(d.price));
                }}
              >
                <Text style={styles.title}>{d.name}</Text>
                <Text style={styles.muted}>
                  {formatMoney(d.price, d.currency)}
                  {!d.photos?.length ? " · missing image" : ""}
                </Text>
              </Pressable>
            ))}
            {selectedDish ? (
              <View style={styles.card}>
                <TextInput
                  value={price}
                  onChangeText={setPrice}
                  placeholder="Price"
                  placeholderTextColor={T.muted}
                  keyboardType="decimal-pad"
                  style={styles.input}
                />
                <Pressable style={[styles.btn, saving && { opacity: 0.6 }]} disabled={saving} onPress={() => void addItem()}>
                  <Text style={styles.btnText}>{t("restaurant_addToDailyMenu") || "Add to today's menu"}</Text>
                </Pressable>
              </View>
            ) : null}

            <Text style={styles.section}>
              {t("restaurant_todaysMenu") || "Today's menu"} ({items.length})
            </Text>
            {items.length === 0 ? (
              <Text style={styles.muted}>{t("restaurant_emptyMenu") || "No items on today's menu."}</Text>
            ) : (
              items.map((it) => (
                <View key={it.id} style={styles.card}>
                  <Text style={styles.title}>{it.name}</Text>
                  <Text style={styles.muted}>
                    {formatMoney(it.price, it.currency)}
                    {it.soldOut ? " · sold out" : ""}
                  </Text>
                </View>
              ))
            )}
            {error ? <Text style={styles.err}>{error}</Text> : null}
          </>
        )}
      </ScrollView>
    </RestaurantShell>
  );
}

const styles = StyleSheet.create({
  section: { fontSize: 15, fontWeight: "800", color: T.ink, marginBottom: 8, marginTop: 4 },
  card: {
    backgroundColor: T.white,
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  cardOn: { borderColor: T.accent, backgroundColor: "rgba(26,107,71,0.06)" },
  title: { fontWeight: "800", color: T.ink },
  muted: { marginTop: 4, fontSize: 12, color: T.muted },
  input: {
    backgroundColor: T.mintSoft,
    borderRadius: 12,
    padding: 12,
    color: T.ink,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
    marginBottom: 8,
  },
  btn: {
    backgroundColor: T.accent,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
  },
  btnText: { color: T.white, fontWeight: "900" },
  err: { color: "#b91c1c", marginTop: 8 },
});
