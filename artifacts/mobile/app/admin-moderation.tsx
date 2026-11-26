/**
 * Native admin moderation queue — approve / reject pending listings.
 */
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { friendlyApiError } from "@/i18n/nativeScreens";
import {
  approveModerationItem,
  canAccessAdminHub,
  fetchModerationQueue,
  rejectModerationItem,
  type ModerationItem,
} from "@/lib/adminApi";

export default function AdminModerationScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, user, isLoading: authLoading } = useAuth();
  const { t } = useLanguage();
  const c = colors.light;
  const allowed = canAccessAdminHub(user);

  const [rows, setRows] = useState<ModerationItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!token || !allowed) return;
      if (mode === "refresh") setRefreshing(true);
      else setError(null);
      try {
        const list = await fetchModerationQueue({ token, status: "pending" });
        setRows(list);
        setError(null);
      } catch (e) {
        setError(
          friendlyApiError(e instanceof Error ? e.message : undefined, t) ||
            t("admin_mod_loadError"),
        );
      } finally {
        setRefreshing(false);
      }
    },
    [token, allowed, t],
  );

  useFocusEffect(
    useCallback(() => {
      if (!authLoading && !token) {
        router.replace("/auth/login");
        return;
      }
      if (token && allowed) void load("initial");
    }, [authLoading, token, allowed, router, load]),
  );

  function onApprove(item: ModerationItem) {
    Alert.alert(t("admin_mod_approveTitle"), item.title, [
      { text: t("common_ok"), style: "cancel" },
      {
        text: t("admin_mod_approve"),
        onPress: async () => {
          if (!token) return;
          setBusyId(item.id);
          try {
            await approveModerationItem(item.id, { token });
            await load("refresh");
          } catch (e) {
            Alert.alert(
              t("common_error"),
              friendlyApiError(e instanceof Error ? e.message : undefined, t),
            );
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);
  }

  function onReject(item: ModerationItem) {
    Alert.alert(t("admin_mod_rejectTitle"), item.title, [
      { text: t("common_ok"), style: "cancel" },
      {
        text: t("admin_mod_reject"),
        style: "destructive",
        onPress: async () => {
          if (!token) return;
          setBusyId(item.id);
          try {
            await rejectModerationItem(item.id, t("admin_mod_defaultReject"), { token });
            await load("refresh");
          } catch (e) {
            Alert.alert(
              t("common_error"),
              friendlyApiError(e instanceof Error ? e.message : undefined, t),
            );
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);
  }

  if (!authLoading && token && !allowed) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + 16, backgroundColor: c.background }]}>
        <Text style={styles.denied}>{t("admin_deniedBody")}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8, backgroundColor: c.background }]} testID="admin-moderation">
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.back}>
          <Feather name="arrow-left" size={20} color={c.foreground} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{t("admin_mod_title")}</Text>
          <Text style={styles.sub}>{t("admin_mod_subtitle")}</Text>
        </View>
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={() => void load("initial")}>
            <Text style={styles.retry}>{t("common_retry")}</Text>
          </Pressable>
        </View>
      ) : null}

      {rows == null && !error ? (
        <ActivityIndicator color="#146C43" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={rows ?? []}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 32, gap: 10 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void load("refresh")} tintColor="#146C43" />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="check-circle" size={28} color="#146C43" />
              <Text style={styles.emptyTitle}>{t("admin_mod_empty")}</Text>
            </View>
          }
          renderItem={({ item }) => {
            const busy = busyId === item.id;
            return (
              <View style={styles.card} testID={`mod-item-${item.id}`}>
                <View style={styles.row}>
                  {item.thumbnail ? (
                    <Image source={{ uri: item.thumbnail }} style={styles.thumb} contentFit="cover" />
                  ) : (
                    <View style={[styles.thumb, styles.thumbFallback]}>
                      <Feather name="image" size={18} color="#94A3B8" />
                    </View>
                  )}
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={styles.itemTitle} numberOfLines={2}>
                      {item.title}
                    </Text>
                    <Text style={styles.meta}>
                      {item.sellerName}
                      {item.price != null ? ` · $${Number(item.price).toFixed(2)}` : ""}
                    </Text>
                    {item.moderationRiskLevel ? (
                      <Text style={styles.risk}>
                        {t("admin_mod_risk")}: {item.moderationRiskLevel}
                      </Text>
                    ) : null}
                  </View>
                </View>
                <View style={styles.actions}>
                  <Pressable
                    style={[styles.btn, styles.approveBtn, busy && { opacity: 0.6 }]}
                    disabled={busy}
                    onPress={() => onApprove(item)}
                  >
                    {busy ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.btnText}>{t("admin_mod_approve")}</Text>
                    )}
                  </Pressable>
                  <Pressable
                    style={[styles.btn, styles.rejectBtn, busy && { opacity: 0.6 }]}
                    disabled={busy}
                    onPress={() => onReject(item)}
                  >
                    <Text style={[styles.btnText, { color: "#B91C1C" }]}>{t("admin_mod_reject")}</Text>
                  </Pressable>
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topBar: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, marginBottom: 12 },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  title: { fontSize: 18, fontWeight: "900", color: "#0F172A" },
  sub: { fontSize: 12, color: "#64748B", fontWeight: "600" },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 12,
    gap: 12,
  },
  row: { flexDirection: "row", gap: 12 },
  thumb: { width: 64, height: 64, borderRadius: 10, backgroundColor: "#F1F5F9" },
  thumbFallback: { alignItems: "center", justifyContent: "center" },
  itemTitle: { fontSize: 14, fontWeight: "800", color: "#0F172A" },
  meta: { fontSize: 12, color: "#64748B", fontWeight: "600" },
  risk: { fontSize: 11, color: "#C2410C", fontWeight: "700", textTransform: "capitalize" },
  actions: { flexDirection: "row", gap: 8 },
  btn: { flex: 1, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  approveBtn: { backgroundColor: "#146C43" },
  rejectBtn: { backgroundColor: "#FEF2F2", borderWidth: 1, borderColor: "#FECACA" },
  btnText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  empty: { alignItems: "center", paddingTop: 48, gap: 10 },
  emptyTitle: { fontSize: 14, fontWeight: "700", color: "#64748B" },
  errorBox: { marginHorizontal: 16, marginBottom: 8, padding: 12, backgroundColor: "#FEF2F2", borderRadius: 10 },
  errorText: { color: "#B91C1C", fontWeight: "700", marginBottom: 6 },
  retry: { color: "#146C43", fontWeight: "800" },
  denied: { textAlign: "center", marginTop: 40, paddingHorizontal: 24, color: "#64748B", fontWeight: "700" },
});
