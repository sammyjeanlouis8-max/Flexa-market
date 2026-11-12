/**
 * Product / video moderation queue — approve, reject, suspend.
 */
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";
import { AdminShell, adminStyles } from "@/components/AdminShell";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import {
  decideModeration,
  fetchAdminModeration,
  fetchAdminModerationOverview,
} from "@/lib/adminApi";
import { canModerate } from "@/lib/adminRoles";

export default function AdminModerationScreen() {
  const router = useRouter();
  const { token, user, isLoading } = useAuth();
  const { t } = useLanguage();
  const [status, setStatus] = useState("pending");
  const [contentType, setContentType] = useState("");
  const [q, setQ] = useState("");
  const [overview, setOverview] = useState<any>(null);
  const [items, setItems] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const [ov, list] = await Promise.all([
        fetchAdminModerationOverview({ token }).catch(() => null),
        fetchAdminModeration({
          token,
          status,
          q: q.trim() || undefined,
          contentType: contentType || undefined,
        }),
      ]);
      setOverview(ov);
      setItems(list.items);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("adminLoadErr"));
      setItems((p) => p ?? []);
    } finally {
      setRefreshing(false);
    }
  }, [token, status, contentType, q, t]);

  useFocusEffect(
    useCallback(() => {
      if (!isLoading && !token) {
        router.replace("/auth/login");
        return;
      }
      if (token && !canModerate(user)) {
        router.replace("/admin");
        return;
      }
      if (token) void load();
    }, [isLoading, token, user, router, load]),
  );

  const decide = (id: number, decision: "approve" | "reject" | "suspend") => {
    if (!token) return;
    const run = (reason?: string) =>
      void decideModeration(id, decision, { token, reason })
        .then(() => load())
        .catch((e) => Alert.alert(t("adminModeration"), e instanceof Error ? e.message : "Error"));
    if (decision === "reject" || decision === "suspend") {
      Alert.prompt?.(
        t("adminModeration"),
        t("adminModerationReason"),
        [
          { text: t("cancel"), style: "cancel" },
          { text: t("ok"), onPress: (reason?: string) => run(reason) },
        ],
      );
      // Android may lack Alert.prompt — fallback
      if (!(Alert as any).prompt) {
        Alert.alert(t("adminModeration"), `${decision}?`, [
          { text: t("cancel"), style: "cancel" },
          { text: t("ok"), onPress: () => run(decision) },
        ]);
      }
      return;
    }
    run();
  };

  return (
    <AdminShell
      title={t("adminModeration")}
      loading={items === null && !error}
      error={error}
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        void load();
      }}
    >
      {overview ? (
        <View style={adminStyles.metricGrid}>
          <View style={adminStyles.metric}>
            <Text style={adminStyles.metricVal}>{overview.pendingReviews ?? overview.pendingProducts ?? "—"}</Text>
            <Text style={adminStyles.metricLabel}>{t("adminPending")}</Text>
          </View>
          <View style={adminStyles.metric}>
            <Text style={adminStyles.metricVal}>{overview.pendingVideos ?? "—"}</Text>
            <Text style={adminStyles.metricLabel}>{t("adminPendingVideos")}</Text>
          </View>
        </View>
      ) : null}

      <TextInput
        style={adminStyles.search}
        value={q}
        onChangeText={setQ}
        onSubmitEditing={() => void load()}
        placeholder={t("adminSearchListings")}
        placeholderTextColor="#94A3B8"
      />
      <View style={[adminStyles.row, { flexWrap: "wrap" }]}>
        {["pending", "rejected", "approved"].map((s) => (
          <Pressable
            key={s}
            style={[adminStyles.chip, status === s && adminStyles.chipOn]}
            onPress={() => setStatus(s)}
          >
            <Text style={[adminStyles.chipText, status === s && adminStyles.chipTextOn]}>{s}</Text>
          </Pressable>
        ))}
        {["", "product", "video"].map((c) => (
          <Pressable
            key={c || "all"}
            style={[adminStyles.chip, contentType === c && adminStyles.chipOn]}
            onPress={() => setContentType(c)}
          >
            <Text style={[adminStyles.chipText, contentType === c && adminStyles.chipTextOn]}>
              {c || t("allCategories")}
            </Text>
          </Pressable>
        ))}
      </View>

      {(items ?? []).map((item) => (
        <View key={item.id} style={adminStyles.card}>
          <Text style={adminStyles.cardTitle}>{item.title}</Text>
          <Text style={adminStyles.cardSub}>
            #{item.id} · {item.moderationStatus || status} · {item.country || "—"}
            {item.sellerName ? ` · ${item.sellerName}` : ""}
          </Text>
          <View style={[adminStyles.row, { marginTop: 8, flexWrap: "wrap" }]}>
            <Pressable style={adminStyles.btn} onPress={() => decide(item.id, "approve")}>
              <Text style={adminStyles.btnText}>{t("adminApprove")}</Text>
            </Pressable>
            <Pressable style={adminStyles.btnGhost} onPress={() => decide(item.id, "reject")}>
              <Text style={adminStyles.btnGhostText}>{t("adminReject")}</Text>
            </Pressable>
            <Pressable
              style={[adminStyles.btn, adminStyles.danger]}
              onPress={() => decide(item.id, "suspend")}
            >
              <Text style={adminStyles.btnText}>{t("adminSuspend")}</Text>
            </Pressable>
          </View>
        </View>
      ))}
      {items?.length === 0 ? <Text style={adminStyles.empty}>{t("adminEmpty")}</Text> : null}
    </AdminShell>
  );
}
