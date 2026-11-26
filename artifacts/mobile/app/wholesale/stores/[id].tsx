import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { WholesaleGate } from "@/components/wholesale/WholesaleGate";
import { WholesaleShell } from "@/components/wholesale/WholesaleShell";
import { useLanguage } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";
import {
  fetchWarehouses,
  fetchWholesaleProducts,
  formatMoney,
  startWholesaleChat,
  type WholesaleProduct,
  type WholesaleWarehouse,
} from "@/lib/wholesaleApi";
import { wholesaleTheme as T } from "@/lib/wholesaleTheme";

export default function WholesaleStoreScreen() {
  const { t } = useLanguage();
  const { id } = useLocalSearchParams<{ id: string }>();
  const depotId = Number(id);
  const { token } = useAuth();
  const router = useRouter();
  const [depot, setDepot] = useState<WholesaleWarehouse | null>(null);
  const [products, setProducts] = useState<WholesaleProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chatting, setChatting] = useState(false);

  const onChat = async () => {
    if (!token || !depot || chatting) return;
    const first = products[0];
    if (!first) {
      Alert.alert("Chat", "No listings yet — open a product to chat with this seller.");
      return;
    }
    setChatting(true);
    try {
      const conv = await startWholesaleChat(
        {
          sellerId: depot.sellerId,
          productId: first.id,
          productTitle: first.title,
          qty: first.minOrderQty || 1,
        },
        { token },
      );
      router.push(`/chat/${conv.id}`);
    } catch (e: any) {
      Alert.alert("Chat", e?.message || t("wholesale_chatFailed"));
    } finally {
      setChatting(false);
    }
  };

  useEffect(() => {
    if (!token) return;
    if (!Number.isFinite(depotId) || depotId <= 0) {
      setLoading(false);
      setError(t("wholesale_depotNotFound"));
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetchWarehouses({ admin: true, verified: false }, { token }),
      fetchWholesaleProducts({ warehouseId: depotId, limit: 40 }, { token }),
    ])
      .then(([warehouses, rows]) => {
        if (cancelled) return;
        const match = warehouses.find((w) => w.id === depotId) ?? null;
        setDepot(match);
        setProducts(rows);
        setError(match ? null : t("wholesale_depotNotFound"));
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, depotId, t]);

  return (
    <WholesaleGate>
      <WholesaleShell
        title={depot?.sellerName || depot?.name || t("wholesale_depot")}
        subtitle={
          depot
            ? `${depot.name} · ${depot.city}, ${depot.country}`
            : t("wholesale_loadingDepot")
        }
        headerRight={
          depot ? (
            <Pressable
              style={[styles.chatBtn, chatting && { opacity: 0.7 }]}
              onPress={() => void onChat()}
              disabled={chatting}
            >
              <Feather name="message-circle" size={14} color={T.forest} />
              <Text style={styles.chatBtnText}>Chat</Text>
            </Pressable>
          ) : undefined
        }
      >
        {error && !loading ? (
          <View style={styles.errorBox}>
            <Text style={styles.error}>{error}</Text>
            <Pressable onPress={() => router.push("/wholesale/warehouses")}>
              <Text style={styles.link}>{t("wholesale_backDepots")}</Text>
            </Pressable>
          </View>
        ) : null}

        {loading ? (
          <ActivityIndicator color={T.accent} />
        ) : depot ? (
          <>
            <View style={styles.stats}>
              <Stat label="Listings" value={products.length} />
              <Stat label="Country" value={depot.country} />
              <Stat label={t("wholesale_model")} value={t("wholesale_chatOnly")} />
            </View>
            <View style={styles.depotBanner}>
              <Feather name="home" size={16} color={T.accent} />
              <Text style={styles.depotBannerText}>
                {depot.name} · {depot.city}
              </Text>
            </View>
            {products.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>{t("wholesale_emptyTitle")}</Text>
                <Text style={styles.emptyBody}>{t("wholesale_emptyDepotBody")}</Text>
                <Pressable onPress={() => router.push("/wholesale")}>
                  <Text style={styles.link}>{t("wholesale_backCatalog")}</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.list}>
                {products.map((p) => (
                  <Pressable
                    key={p.id}
                    style={styles.row}
                    onPress={() => router.push(`/wholesale/products/${p.id}`)}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.rowTitle} numberOfLines={1}>
                        {p.title}
                      </Text>
                      <Text style={styles.rowMeta} numberOfLines={1}>
                        {formatMoney(p.unitPrice, p.currency)} · min {p.minOrderQty}{" "}
                        {p.wholesaleUnitType}
                      </Text>
                    </View>
                    {p.status ? (
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>{p.status}</Text>
                      </View>
                    ) : null}
                  </Pressable>
                ))}
              </View>
            )}
          </>
        ) : null}
      </WholesaleShell>
    </WholesaleGate>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chatBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: T.white,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
  },
  chatBtnText: { color: T.forest, fontSize: 11, fontWeight: "800" },
  stats: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 14 },
  stat: {
    flexGrow: 1,
    minWidth: "30%",
    backgroundColor: T.white,
    borderRadius: 14,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: T.muted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  statValue: { marginTop: 4, fontSize: 18, fontWeight: "800", color: T.accent },
  depotBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: T.accentSoft,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  depotBannerText: { flex: 1, fontSize: 13, fontWeight: "700", color: T.accent },
  list: { gap: 8 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: T.white,
    borderRadius: 12,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  rowTitle: { fontSize: 14, fontWeight: "700", color: T.ink },
  rowMeta: { marginTop: 2, fontSize: 12, color: T.muted },
  badge: {
    backgroundColor: T.accentSoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeText: { fontSize: 10, fontWeight: "800", color: T.accent, textTransform: "uppercase" },
  empty: {
    alignItems: "center",
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: T.line,
    backgroundColor: T.white,
  },
  emptyTitle: { fontSize: 15, fontWeight: "800", color: T.ink, textAlign: "center" },
  emptyBody: { marginTop: 6, fontSize: 13, color: T.muted, textAlign: "center", lineHeight: 18 },
  errorBox: {
    marginBottom: 14,
    padding: 14,
    borderRadius: 12,
    backgroundColor: "#FEF2F2",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#FECACA",
  },
  error: { color: T.danger, fontWeight: "700", marginBottom: 8 },
  link: { marginTop: 10, fontSize: 13, fontWeight: "800", color: T.accent, textDecorationLine: "underline" },
});
