import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Modal,
  Platform, Pressable, RefreshControl, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApi } from "@/hooks/useApi";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

interface CartItem {
  id: number;
  listingId: number;
  quantity: number;
  listing: {
    id: number;
    title: string;
    price: number;
    currency: string;
    images: string[];
    sellerId: number;
    sellerName?: string;
    city?: string;
  };
}

interface SellerGroup {
  sellerId: number;
  sellerName: string;
  items: CartItem[];
  deliveryFee: number;
  deliveryLoading: boolean;
}

const HAITI_CITIES = [
  "Port-au-Prince","Cap-Haïtien","Gonaïves","Les Cayes","Pétionville",
  "Delmas","Jacmel","Saint-Marc","Hinche","Jérémie",
];

export default function CartScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { request, getStorageUrl } = useApi();
  const { user } = useAuth();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const [items, setItems] = useState<CartItem[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [groups, setGroups] = useState<SellerGroup[]>([]);
  const [checkoutVisible, setCheckoutVisible] = useState(false);
  const [checking, setChecking] = useState(false);
  const [success, setSuccess] = useState(false);
  const [confirmedOrders, setConfirmedOrders] = useState<any[]>([]);
  const [promoCode, setPromoCode] = useState("");
  const [promoApplied, setPromoApplied] = useState(false);
  const [shippingName, setShippingName] = useState(user?.name ?? "");
  const [shippingPhone, setShippingPhone] = useState(user?.phone ?? "");
  const [shippingCity, setShippingCity] = useState(user?.city ?? "");
  const [shippingStreet, setShippingStreet] = useState("");
  const [shippingRegion, setShippingRegion] = useState("");

  const fetchCart = useCallback(async () => {
    try {
      const data = await request<CartItem[]>("/cart");
      const list = Array.isArray(data) ? data : [];
      setItems(list);
      setSelected(new Set(list.map((i) => i.id)));
    } catch { }
  }, [request]);

  useEffect(() => {
    setLoading(true);
    fetchCart().finally(() => setLoading(false));
  }, [fetchCart]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchCart();
    setRefreshing(false);
  }, [fetchCart]);

  const groupBySeller = useCallback((cartItems: CartItem[]): SellerGroup[] => {
    const map = new Map<number, SellerGroup>();
    cartItems.filter((i) => selected.has(i.id)).forEach((item) => {
      const sid = item.listing.sellerId;
      if (!map.has(sid)) {
        map.set(sid, {
          sellerId: sid,
          sellerName: item.listing.sellerName ?? `Vendeur #${sid}`,
          items: [],
          deliveryFee: 0,
          deliveryLoading: false,
        });
      }
      map.get(sid)!.items.push(item);
    });
    return Array.from(map.values());
  }, [selected]);

  useEffect(() => {
    setGroups(groupBySeller(items));
  }, [items, selected, groupBySeller]);

  const updateQty = async (itemId: number, delta: number) => {
    const item = items.find((i) => i.id === itemId);
    if (!item) return;
    const newQty = item.quantity + delta;
    if (newQty < 1) { removeItem(itemId); return; }
    try {
      await request(`/cart/${itemId}`, { method: "PATCH", body: JSON.stringify({ quantity: newQty }) });
      setItems((prev) => prev.map((i) => i.id === itemId ? { ...i, quantity: newQty } : i));
    } catch { Alert.alert("Erè", "Pa ka chanje kantite."); }
  };

  const removeItem = async (itemId: number) => {
    try {
      await request(`/cart/${itemId}`, { method: "DELETE" });
      setItems((prev) => prev.filter((i) => i.id !== itemId));
      setSelected((prev) => { const s = new Set(prev); s.delete(itemId); return s; });
    } catch { Alert.alert("Erè", "Pa ka retire atik la."); }
  };

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  };

  const toggleAll = () => {
    if (selected.size === items.length) setSelected(new Set());
    else setSelected(new Set(items.map((i) => i.id)));
  };

  const selectedItems = items.filter((i) => selected.has(i.id));
  const subtotal = selectedItems.reduce((sum, i) => sum + i.listing.price * i.quantity, 0);
  const totalDelivery = groups.reduce((sum, g) => sum + g.deliveryFee, 0);
  const discount = promoApplied ? subtotal * 0.05 : 0;
  const total = Math.max(0, subtotal + totalDelivery - discount);

  const handleCheckout = async () => {
    if (selectedItems.length === 0) { Alert.alert("Panye vid", "Chwazi omwen yon atik."); return; }
    if (!shippingName || !shippingPhone || !shippingCity) {
      Alert.alert("Enfòmasyon manke", "Non, telefòn, ak vil obligatwa."); return;
    }
    setChecking(true);
    try {
      const payload = {
        items: selectedItems.map((i) => ({ listingId: i.listingId, quantity: i.quantity })),
        shippingName, shippingPhone, shippingCity,
        shippingStreet, shippingRegion,
        paymentMethod: "wallet",
        deliveryMethod: "motorcycle",
      };
      const result = await request<any>("/cart/checkout", { method: "POST", body: JSON.stringify(payload) });
      const orders = Array.isArray(result?.orders) ? result.orders : result ? [result] : [];
      setConfirmedOrders(orders);
      setCheckoutVisible(false);
      setSuccess(true);
      await fetchCart();
    } catch (e: any) {
      Alert.alert("Erè Checkout", e?.message ?? "Solde ensifizan oswa erè sèvè.");
    } finally { setChecking(false); }
  };

  if (success) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: topPad + 10, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => { setSuccess(false); router.back(); }} style={styles.headerBtn}>
            <Feather name="x" size={22} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Kòmand Konfime ✅</Text>
          <View style={{ width: 36 }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: 24, alignItems: "center", gap: 16 }}>
          <View style={[styles.successIcon, { backgroundColor: "#22C55E22" }]}>
            <Feather name="check-circle" size={64} color="#22C55E" />
          </View>
          <Text style={[styles.successTitle, { color: colors.foreground }]}>Kòmand ou konfime!</Text>
          <Text style={[styles.successSub, { color: colors.mutedForeground }]}>
            Vandè a ap prepare pakè ou. Ou ka swiv livrezon ou nan seksyon Kòmand yo.
          </Text>
          {confirmedOrders.map((ord, i) => (
            <View key={i} style={[styles.successOrderCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.successOrderId, { color: colors.primary }]}>Kòmand #{ord.id ?? ord.txId ?? i + 1}</Text>
              <Text style={[styles.successOrderSeller, { color: colors.mutedForeground }]}>{ord.sellerName ?? ""}</Text>
            </View>
          ))}
          <Pressable style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
            onPress={() => router.push("/orders")}>
            <Text style={styles.primaryBtnText}>Wè Kòmand mwen</Text>
          </Pressable>
          <Pressable onPress={() => { setSuccess(false); router.push("/"); }}>
            <Text style={[styles.linkText, { color: colors.mutedForeground }]}>Kontinye achte</Text>
          </Pressable>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 10, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>
          Panye ({items.length})
        </Text>
        <TouchableOpacity onPress={toggleAll} style={styles.headerBtn}>
          <Text style={[styles.selectAllText, { color: colors.primary }]}>
            {selected.size === items.length ? "Deselect" : "Tout"}
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centered}><ActivityIndicator color={colors.primary} size="large" /></View>
      ) : items.length === 0 ? (
        <View style={styles.centered}>
          <Feather name="shopping-cart" size={56} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Panye ou vid</Text>
          <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>Ajoute atik pou kòmanse achte</Text>
          <Pressable style={[styles.primaryBtn, { backgroundColor: colors.primary, marginTop: 16 }]}
            onPress={() => router.push("/")}>
            <Text style={styles.primaryBtnText}>Eksplore Mache</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <FlatList
            data={groups}
            keyExtractor={(g) => String(g.sellerId)}
            contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 200 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
            renderItem={({ item: group }) => (
              <View style={[styles.groupCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.groupHeader}>
                  <Feather name="shopping-bag" size={14} color={colors.mutedForeground} />
                  <Text style={[styles.groupSeller, { color: colors.foreground }]}>{group.sellerName}</Text>
                </View>
                {group.items.map((item) => {
                  const imgUrl = item.listing.images?.[0] ? getStorageUrl(item.listing.images[0]) : null;
                  const isSelected = selected.has(item.id);
                  return (
                    <View key={item.id} style={[styles.itemRow, { opacity: isSelected ? 1 : 0.5 }]}>
                      <TouchableOpacity onPress={() => toggleSelect(item.id)} style={[styles.checkbox, { borderColor: isSelected ? colors.primary : colors.border, backgroundColor: isSelected ? colors.primary : "transparent" }]}>
                        {isSelected && <Feather name="check" size={12} color="#fff" />}
                      </TouchableOpacity>
                      {imgUrl ? (
                        <Image source={{ uri: imgUrl }} style={styles.itemImage} contentFit="cover" />
                      ) : (
                        <View style={[styles.itemImage, { backgroundColor: colors.border, alignItems: "center", justifyContent: "center" }]}>
                          <Feather name="image" size={20} color={colors.mutedForeground} />
                        </View>
                      )}
                      <View style={styles.itemInfo}>
                        <Text style={[styles.itemTitle, { color: colors.foreground }]} numberOfLines={2}>{item.listing.title}</Text>
                        <Text style={[styles.itemPrice, { color: colors.primary }]}>${(item.listing.price * item.quantity).toFixed(2)}</Text>
                      </View>
                      <View style={styles.qtyRow}>
                        <TouchableOpacity style={[styles.qtyBtn, { borderColor: colors.border }]} onPress={() => updateQty(item.id, -1)}>
                          <Feather name="minus" size={14} color={colors.foreground} />
                        </TouchableOpacity>
                        <Text style={[styles.qtyText, { color: colors.foreground }]}>{item.quantity}</Text>
                        <TouchableOpacity style={[styles.qtyBtn, { borderColor: colors.border }]} onPress={() => updateQty(item.id, 1)}>
                          <Feather name="plus" size={14} color={colors.foreground} />
                        </TouchableOpacity>
                      </View>
                      <TouchableOpacity onPress={() => removeItem(item.id)} style={styles.deleteBtn}>
                        <Feather name="trash-2" size={16} color="#EF4444" />
                      </TouchableOpacity>
                    </View>
                  );
                })}
                {group.deliveryFee > 0 && (
                  <View style={[styles.deliveryRow, { borderTopColor: colors.border }]}>
                    <Feather name="truck" size={13} color={colors.mutedForeground} />
                    <Text style={[styles.deliveryText, { color: colors.mutedForeground }]}>
                      Livrezon: ${group.deliveryFee.toFixed(2)}
                    </Text>
                  </View>
                )}
              </View>
            )}
            ListFooterComponent={
              <View style={[styles.promoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.promoLabel, { color: colors.foreground }]}>Kòd Promo</Text>
                <View style={styles.promoRow}>
                  <TextInput
                    style={[styles.promoInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
                    placeholder="Antre kòd promo..."
                    placeholderTextColor={colors.mutedForeground}
                    value={promoCode}
                    onChangeText={setPromoCode}
                    autoCapitalize="characters"
                  />
                  <Pressable style={[styles.promoBtn, { backgroundColor: colors.primary }]}
                    onPress={() => {
                      if (promoCode.trim()) { setPromoApplied(true); Alert.alert("✅ Kòd aplike!", "5% reduksyon ajoute."); }
                    }}>
                    <Text style={styles.promoBtnText}>Aplike</Text>
                  </Pressable>
                </View>
              </View>
            }
          />

          {/* Sticky Bottom Bar */}
          <View style={[styles.bottomBar, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.totalRow}>
              <View>
                <Text style={[styles.totalLabel, { color: colors.mutedForeground }]}>
                  {selectedItems.length} atik seleksyone
                </Text>
                {promoApplied && (
                  <Text style={[styles.discountText, { color: "#22C55E" }]}>-${discount.toFixed(2)} promo</Text>
                )}
              </View>
              <Text style={[styles.totalAmount, { color: colors.foreground }]}>${total.toFixed(2)}</Text>
            </View>
            <Pressable
              style={[styles.checkoutBtn, { backgroundColor: selectedItems.length === 0 ? colors.mutedForeground : colors.primary }]}
              disabled={selectedItems.length === 0}
              onPress={() => setCheckoutVisible(true)}>
              <Feather name="credit-card" size={18} color="#fff" />
              <Text style={styles.checkoutBtnText}>Achte ak FM Wallet</Text>
            </Pressable>
          </View>
        </>
      )}

      {/* Checkout Modal */}
      <Modal visible={checkoutVisible} transparent animationType="slide" onRequestClose={() => setCheckoutVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.card }]}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>Detay Livrezon</Text>
              <TouchableOpacity onPress={() => setCheckoutVisible(false)}>
                <Feather name="x" size={20} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {[
                { label: "Non Konplè *", value: shippingName, setter: setShippingName, placeholder: "Jan Louis..." },
                { label: "Telefòn *", value: shippingPhone, setter: setShippingPhone, placeholder: "+509 ...", keyType: "phone-pad" as any },
                { label: "Vil *", value: shippingCity, setter: setShippingCity, placeholder: "Port-au-Prince..." },
                { label: "Adres / Ri", value: shippingStreet, setter: setShippingStreet, placeholder: "Ri Lamarre..." },
                { label: "Rejyon / Depatman", value: shippingRegion, setter: setShippingRegion, placeholder: "Ouest..." },
              ].map((field) => (
                <View key={field.label} style={styles.fieldGroup}>
                  <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{field.label}</Text>
                  <TextInput
                    style={[styles.fieldInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
                    value={field.value}
                    onChangeText={field.setter}
                    placeholder={field.placeholder}
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType={field.keyType}
                  />
                </View>
              ))}

              <View style={[styles.summaryBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <View style={styles.summaryRow}><Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Sous-total</Text><Text style={[styles.summaryVal, { color: colors.foreground }]}>${subtotal.toFixed(2)}</Text></View>
                {totalDelivery > 0 && <View style={styles.summaryRow}><Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Livrezon</Text><Text style={[styles.summaryVal, { color: colors.foreground }]}>${totalDelivery.toFixed(2)}</Text></View>}
                {promoApplied && <View style={styles.summaryRow}><Text style={[styles.summaryLabel, { color: "#22C55E" }]}>Promo -5%</Text><Text style={[styles.summaryVal, { color: "#22C55E" }]}>-${discount.toFixed(2)}</Text></View>}
                <View style={[styles.summaryRow, styles.summaryTotalRow]}><Text style={[styles.summaryTotalLabel, { color: colors.foreground }]}>Total</Text><Text style={[styles.summaryTotalVal, { color: colors.primary }]}>${total.toFixed(2)}</Text></View>
              </View>

              <Text style={[styles.walletNote, { color: colors.mutedForeground }]}>
                💳 Peman ap fèt ak balans FM Wallet ou. Asire ou gen ase fon.
              </Text>

              <Pressable style={[styles.payBtn, { backgroundColor: colors.primary, opacity: checking ? 0.7 : 1 }]}
                onPress={handleCheckout} disabled={checking}>
                {checking
                  ? <ActivityIndicator color="#fff" />
                  : <><Feather name="check-circle" size={18} color="#fff" /><Text style={styles.payBtnText}>Konfime Kòmand — ${total.toFixed(2)}</Text></>}
              </Pressable>
              <View style={{ height: insets.bottom + 16 }} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  headerBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  selectAllText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 32 },
  emptyTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  emptySub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  groupCard: { borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  groupHeader: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderBottomWidth: 1, borderBottomColor: "#0001" },
  groupSeller: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  itemRow: { flexDirection: "row", alignItems: "center", padding: 12, gap: 10 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  itemImage: { width: 64, height: 64, borderRadius: 10 },
  itemInfo: { flex: 1 },
  itemTitle: { fontSize: 13, fontFamily: "Inter_500Medium", lineHeight: 18 },
  itemPrice: { fontSize: 15, fontFamily: "Inter_700Bold", marginTop: 4 },
  qtyRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  qtyBtn: { width: 28, height: 28, borderRadius: 8, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  qtyText: { fontSize: 14, fontFamily: "Inter_600SemiBold", minWidth: 20, textAlign: "center" },
  deleteBtn: { padding: 6 },
  deliveryRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: 1 },
  deliveryText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  promoCard: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 10 },
  promoLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  promoRow: { flexDirection: "row", gap: 8 },
  promoInput: { flex: 1, height: 42, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, fontSize: 14, fontFamily: "Inter_400Regular" },
  promoBtn: { paddingHorizontal: 16, height: 42, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  promoBtnText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  bottomBar: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 16, borderTopWidth: 1, gap: 12 },
  totalRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  totalLabel: { fontSize: 13, fontFamily: "Inter_400Regular" },
  discountText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  totalAmount: { fontSize: 22, fontFamily: "Inter_700Bold" },
  checkoutBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, height: 52, borderRadius: 14 },
  checkoutBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: "90%" },
  modalHandle: { width: 36, height: 4, backgroundColor: "rgba(0,0,0,0.15)", borderRadius: 2, alignSelf: "center", marginBottom: 16 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  fieldGroup: { marginBottom: 12 },
  fieldLabel: { fontSize: 12, fontFamily: "Inter_500Medium", marginBottom: 4 },
  fieldInput: { height: 44, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, fontSize: 14, fontFamily: "Inter_400Regular" },
  summaryBox: { borderRadius: 12, borderWidth: 1, padding: 14, gap: 8, marginVertical: 12 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between" },
  summaryLabel: { fontSize: 13, fontFamily: "Inter_400Regular" },
  summaryVal: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  summaryTotalRow: { borderTopWidth: 1, borderTopColor: "#0002", paddingTop: 8, marginTop: 4 },
  summaryTotalLabel: { fontSize: 15, fontFamily: "Inter_700Bold" },
  summaryTotalVal: { fontSize: 18, fontFamily: "Inter_700Bold" },
  walletNote: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center", marginBottom: 16, lineHeight: 18 },
  payBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, height: 52, borderRadius: 14 },
  payBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
  primaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 28, paddingVertical: 14, borderRadius: 14 },
  primaryBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" },
  linkText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  successIcon: { width: 120, height: 120, borderRadius: 60, alignItems: "center", justifyContent: "center" },
  successTitle: { fontSize: 24, fontFamily: "Inter_700Bold", textAlign: "center" },
  successSub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 22 },
  successOrderCard: { width: "100%", borderRadius: 12, borderWidth: 1, padding: 14, alignItems: "center" },
  successOrderId: { fontSize: 16, fontFamily: "Inter_700Bold" },
  successOrderSeller: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
});
