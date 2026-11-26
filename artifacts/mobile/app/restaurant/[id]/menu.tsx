/**
 * Meni Chak Jou — build today's (or selected) daily menu from scratch or dish models.
 */
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { RestaurantGate } from "@/components/restaurant/RestaurantGate";
import { RestaurantShell } from "@/components/restaurant/RestaurantShell";
import { useAuth } from "@/context/AuthContext";
import {
  createDailyMenuItem,
  deleteDailyMenuItem,
  fetchDailyMenu,
  fetchDishModels,
  importDishModelToDailyMenu,
  updateDailyMenuItem,
} from "@/lib/restaurantApi";
import { todayYmd } from "@/lib/restaurantHours";
import { restaurantTheme as T } from "@/lib/restaurantTheme";
import type { DailyMenuItem, DishCategory, DishModel } from "@/lib/restaurantTypes";

export default function DailyMenuScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const restaurantId = Number(id);
  const { token } = useAuth();
  const [menuDate, setMenuDate] = useState(todayYmd());
  const [items, setItems] = useState<DailyMenuItem[]>([]);
  const [models, setModels] = useState<DishModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [category, setCategory] = useState<DishCategory>("main");

  const load = useCallback(async () => {
    if (!token || !Number.isFinite(restaurantId)) return;
    setLoading(true);
    setError(null);
    try {
      const [menu, dishes] = await Promise.all([
        fetchDailyMenu(restaurantId, menuDate, { token }),
        fetchDishModels(restaurantId, { token }),
      ]);
      setItems(menu);
      setModels(dishes);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [token, restaurantId, menuDate]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const toggleSoldOut = async (item: DailyMenuItem) => {
    if (!token) return;
    try {
      const updated = await updateDailyMenuItem(
        restaurantId,
        item.id,
        { soldOut: !item.soldOut, available: item.soldOut ? true : item.available },
        { token },
      );
      setItems((prev) => prev.map((x) => (x.id === item.id ? updated : x)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    }
  };

  const toggleAvailable = async (item: DailyMenuItem) => {
    if (!token) return;
    try {
      const updated = await updateDailyMenuItem(
        restaurantId,
        item.id,
        { available: !item.available },
        { token },
      );
      setItems((prev) => prev.map((x) => (x.id === item.id ? updated : x)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    }
  };

  const adjustPrice = async (item: DailyMenuItem, nextPrice: string) => {
    if (!token) return;
    const n = Number(nextPrice);
    if (!Number.isFinite(n) || n < 0) return;
    try {
      const updated = await updateDailyMenuItem(restaurantId, item.id, { price: n }, { token });
      setItems((prev) => prev.map((x) => (x.id === item.id ? updated : x)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Price update failed");
    }
  };

  const onImport = async (modelId: number) => {
    if (!token) return;
    setSaving(true);
    try {
      await importDishModelToDailyMenu(restaurantId, modelId, menuDate, { token });
      setImportOpen(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setSaving(false);
    }
  };

  const onCreate = async () => {
    if (!token) return;
    if (!name.trim() || !price.trim() || Number.isNaN(Number(price))) {
      setError("Name and price required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createDailyMenuItem(
        restaurantId,
        {
          menuDate,
          name: name.trim(),
          description: description.trim() || null,
          price: Number(price),
          category,
          available: true,
          soldOut: false,
        },
        { token },
      );
      setCreateOpen(false);
      setName("");
      setDescription("");
      setPrice("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed");
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (itemId: number) => {
    if (!token) return;
    try {
      await deleteDailyMenuItem(restaurantId, itemId, { token });
      setItems((prev) => prev.filter((x) => x.id !== itemId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  };

  return (
    <RestaurantGate>
      <RestaurantShell title="Meni Chak Jou" subtitle={`Daily menu · ${menuDate}`}>
        <View style={styles.dateRow}>
          <Text style={styles.dateLabel}>Menu date (YYYY-MM-DD)</Text>
          <TextInput
            style={styles.dateInput}
            value={menuDate}
            onChangeText={setMenuDate}
            onEndEditing={() => void load()}
            placeholder="2026-11-26"
            placeholderTextColor="#94A3B8"
            autoCapitalize="none"
          />
        </View>

        <View style={styles.toolbar}>
          <Pressable style={styles.toolBtn} onPress={() => setImportOpen(true)}>
            <Feather name="download" size={14} color={T.forest} />
            <Text style={styles.toolText}>Import from Dish Model</Text>
          </Pressable>
          <Pressable style={[styles.toolBtn, styles.toolPrimary]} onPress={() => setCreateOpen(true)}>
            <Feather name="plus" size={14} color={T.white} />
            <Text style={[styles.toolText, { color: T.white }]}>Add item</Text>
          </Pressable>
        </View>

        {loading ? (
          <ActivityIndicator color={T.accent} />
        ) : items.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Empty daily menu</Text>
            <Text style={styles.emptyBody}>Import a Modèl Manje or add a dish for this date.</Text>
          </View>
        ) : (
          items.map((item) => (
            <View key={item.id} style={styles.card}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.meta}>
                  {item.category} · {item.currency}
                </Text>
                <View style={styles.priceRow}>
                  <Text style={styles.priceLabel}>Price</Text>
                  <TextInput
                    style={styles.priceInput}
                    defaultValue={String(item.price)}
                    keyboardType="decimal-pad"
                    onEndEditing={(e) => void adjustPrice(item, e.nativeEvent.text)}
                  />
                </View>
                <View style={styles.switches}>
                  <View style={styles.switchItem}>
                    <Text style={styles.switchLabel}>Available</Text>
                    <Switch
                      value={item.available && !item.soldOut}
                      onValueChange={() => void toggleAvailable(item)}
                      trackColor={{ false: "#CBD5E1", true: T.accentSoft }}
                      thumbColor={item.available ? T.forest : "#F8FAFC"}
                    />
                  </View>
                  <View style={styles.switchItem}>
                    <Text style={styles.switchLabel}>Sold out</Text>
                    <Switch
                      value={item.soldOut}
                      onValueChange={() => void toggleSoldOut(item)}
                      trackColor={{ false: "#CBD5E1", true: "#FECACA" }}
                      thumbColor={item.soldOut ? T.danger : "#F8FAFC"}
                    />
                  </View>
                </View>
              </View>
              <Pressable onPress={() => void onDelete(item.id)} hitSlop={8}>
                <Feather name="trash-2" size={16} color={T.danger} />
              </Pressable>
            </View>
          ))
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Modal visible={importOpen} transparent animationType="fade">
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Import from Modèl Manje</Text>
              {models.length === 0 ? (
                <Text style={styles.emptyBody}>No dish models yet — create some first.</Text>
              ) : (
                models.map((m) => (
                  <Pressable
                    key={m.id}
                    style={styles.importRow}
                    onPress={() => void onImport(m.id)}
                    disabled={saving}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.name}>{m.name}</Text>
                      <Text style={styles.meta}>
                        {m.currency} {m.price.toFixed(2)}
                      </Text>
                    </View>
                    <Feather name="plus-circle" size={18} color={T.forest} />
                  </Pressable>
                ))
              )}
              <Pressable style={styles.cancel} onPress={() => setImportOpen(false)}>
                <Text style={styles.cancelText}>Close</Text>
              </Pressable>
            </View>
          </View>
        </Modal>

        <Modal visible={createOpen} transparent animationType="slide">
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Add daily menu item</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Dish name"
                placeholderTextColor="#94A3B8"
              />
              <TextInput
                style={[styles.input, { minHeight: 60, textAlignVertical: "top" }]}
                value={description}
                onChangeText={setDescription}
                placeholder="Description"
                placeholderTextColor="#94A3B8"
                multiline
              />
              <TextInput
                style={styles.input}
                value={price}
                onChangeText={setPrice}
                placeholder="Price"
                placeholderTextColor="#94A3B8"
                keyboardType="decimal-pad"
              />
              <View style={styles.cats}>
                {(["main", "appetizer", "drink", "dessert", "side", "other"] as DishCategory[]).map(
                  (c) => (
                    <Pressable
                      key={c}
                      style={[styles.cat, category === c && styles.catOn]}
                      onPress={() => setCategory(c)}
                    >
                      <Text style={[styles.catText, category === c && styles.catTextOn]}>{c}</Text>
                    </Pressable>
                  ),
                )}
              </View>
              <View style={styles.modalActions}>
                <Pressable style={styles.cancel} onPress={() => setCreateOpen(false)}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.save, saving && { opacity: 0.7 }]}
                  disabled={saving}
                  onPress={() => void onCreate()}
                >
                  {saving ? (
                    <ActivityIndicator color={T.white} />
                  ) : (
                    <Text style={styles.saveText}>Save</Text>
                  )}
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      </RestaurantShell>
    </RestaurantGate>
  );
}

const styles = StyleSheet.create({
  dateRow: { marginBottom: 12 },
  dateLabel: { fontSize: 12, fontWeight: "800", color: T.forest, marginBottom: 6 },
  dateInput: {
    backgroundColor: T.white,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: T.line,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontWeight: "700",
    color: T.ink,
  },
  toolbar: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 },
  toolBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: T.mint,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
  },
  toolPrimary: { backgroundColor: T.forest },
  toolText: { fontSize: 12, fontWeight: "800", color: T.forest },
  card: {
    flexDirection: "row",
    gap: 10,
    backgroundColor: T.white,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  name: { fontSize: 15, fontWeight: "800", color: T.ink },
  meta: { fontSize: 12, color: T.muted, fontWeight: "600", marginTop: 2 },
  priceRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  priceLabel: { fontSize: 12, fontWeight: "700", color: T.muted },
  priceInput: {
    minWidth: 72,
    borderWidth: 1,
    borderColor: T.line,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontWeight: "800",
    color: T.forest,
    backgroundColor: T.mintSoft,
  },
  switches: { flexDirection: "row", gap: 16, marginTop: 8 },
  switchItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  switchLabel: { fontSize: 11, fontWeight: "700", color: T.muted },
  empty: { paddingVertical: 28, alignItems: "center" },
  emptyTitle: { fontSize: 15, fontWeight: "800", color: T.ink },
  emptyBody: { marginTop: 6, fontSize: 12, color: T.muted, textAlign: "center" },
  error: { color: T.danger, fontWeight: "600", marginTop: 8 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: T.mintSoft,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 18,
    maxHeight: "80%",
  },
  modalTitle: { fontSize: 17, fontWeight: "800", color: T.ink, marginBottom: 12 },
  importRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: T.white,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  input: {
    backgroundColor: T.white,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: T.line,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontWeight: "600",
    color: T.ink,
    marginBottom: 8,
  },
  cats: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 },
  cat: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: T.white,
    borderWidth: 1,
    borderColor: T.line,
  },
  catOn: { backgroundColor: T.mint, borderColor: T.accent },
  catText: { fontSize: 12, fontWeight: "700", color: T.muted },
  catTextOn: { color: T.forest },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 8 },
  cancel: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: T.white,
    borderWidth: 1,
    borderColor: T.line,
    marginTop: 8,
  },
  cancelText: { fontWeight: "800", color: T.ink },
  save: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: T.forest,
  },
  saveText: { fontWeight: "800", color: T.white },
});
