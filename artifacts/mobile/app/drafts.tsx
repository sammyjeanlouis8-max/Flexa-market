/**
 * Native drafts hub:
 * - Client sell draft (AsyncStorage)
 * - Booster campaign drafts from GET /booster/campaigns
 * No server listing-draft table exists.
 */
import { Feather } from "@expo/vector-icons";
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
import { useAuth } from "@/context/AuthContext";
import {
  loadVideoUploadSession,
  saveVideoUploadSession,
  type VideoUploadSession,
} from "@/lib/chunkedVideoUpload";
import { fetchBoosterCampaigns, type BoostCampaign } from "@/lib/sellerApi";
import { clearSellDraft, loadSellDraft, type SellDraft } from "@/lib/sellDrafts";

export default function DraftsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, isLoading: authLoading } = useAuth();
  const [sellDraft, setSellDraft] = useState<SellDraft | null>(null);
  const [videoSession, setVideoSession] = useState<VideoUploadSession | null>(null);
  const [campaigns, setCampaigns] = useState<BoostCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (mode === "refresh") setRefreshing(true);
      else setLoading(true);
      try {
        const [draft, session] = await Promise.all([
          loadSellDraft(),
          loadVideoUploadSession(),
        ]);
        setSellDraft(draft);
        setVideoSession(session);
        if (token) {
          const all = await fetchBoosterCampaigns({ token }).catch(() => []);
          setCampaigns(all.filter((c) => String(c.status).toLowerCase() === "draft"));
        } else {
          setCampaigns([]);
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token],
  );

  useFocusEffect(
    useCallback(() => {
      if (!authLoading && !token) {
        router.replace("/auth/login");
        return;
      }
      void load("initial");
    }, [authLoading, token, router, load]),
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.topBar}>
        <Pressable
          style={styles.back}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/sell"))}
        >
          <Feather name="arrow-left" size={22} color="#0F172A" />
        </Pressable>
        <Text style={styles.title}>Drafts</Text>
        <Pressable style={styles.back} onPress={() => router.push("/boost-create")}>
          <Feather name="plus" size={18} color="#0F172A" />
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator color="#F97316" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={campaigns}
          keyExtractor={(item) => String(item.id)}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load("refresh")}
              tintColor="#F97316"
            />
          }
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
          ListHeaderComponent={
            <View style={{ gap: 10, marginBottom: 12 }}>
              <Text style={styles.section}>Product draft</Text>
              {sellDraft?.title || sellDraft?.description ? (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>{sellDraft.title || "Untitled listing"}</Text>
                  <Text style={styles.meta}>
                    Saved {sellDraft.updatedAt ? new Date(sellDraft.updatedAt).toLocaleString() : ""}
                  </Text>
                  <View style={styles.row}>
                    <Pressable
                      style={styles.btn}
                      onPress={() => router.push("/(tabs)/sell")}
                      testID="btn-resume-sell-draft"
                    >
                      <Text style={styles.btnText}>Resume</Text>
                    </Pressable>
                    <Pressable
                      style={styles.ghost}
                      onPress={async () => {
                        await clearSellDraft();
                        setSellDraft(null);
                      }}
                    >
                      <Text style={styles.ghostText}>Delete</Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <Text style={styles.empty}>No product draft saved on this device.</Text>
              )}
              <Text style={styles.section}>Interrupted video upload</Text>
              {videoSession ? (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>
                    {videoSession.purpose === "boost" ? "Boost video" : "Product video"}
                  </Text>
                  <Text style={styles.meta}>
                    {videoSession.receivedChunkIndices.length}/{videoSession.totalChunks} chunks ·
                    resume from Sell or Campaign draft
                  </Text>
                  <View style={styles.row}>
                    <Pressable
                      style={styles.btn}
                      onPress={() =>
                        router.push(
                          videoSession.purpose === "boost" ? "/boost-create" : "/(tabs)/sell",
                        )
                      }
                    >
                      <Text style={styles.btnText}>Resume</Text>
                    </Pressable>
                    <Pressable
                      style={styles.ghost}
                      onPress={async () => {
                        await saveVideoUploadSession(null);
                        setVideoSession(null);
                      }}
                    >
                      <Text style={styles.ghostText}>Discard</Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <Text style={styles.empty}>No interrupted video upload.</Text>
              )}
              <Text style={styles.section}>Campaign drafts</Text>
              <Text style={styles.note}>
                Paid boost launch stays blocked on Android. Drafts do not charge the wallet.
              </Text>
            </View>
          }
          ListEmptyComponent={<Text style={styles.empty}>No campaign drafts.</Text>}
          renderItem={({ item }) => (
            <Pressable
              style={styles.card}
              onPress={() =>
                Alert.alert(
                  "Draft campaign",
                  `${item.title || item.plan || `#${item.id}`} is saved as draft.`,
                )
              }
            >
              <Text style={styles.cardTitle}>
                {item.title || item.plan || `Campaign #${item.id}`}
              </Text>
              <Text style={styles.meta}>status: draft</Text>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F8FAFC" },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
  },
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
  title: { fontSize: 17, fontWeight: "800", color: "#0F172A" },
  section: { fontWeight: "800", color: "#0F172A" },
  note: { color: "#64748B", fontSize: 12, lineHeight: 18 },
  empty: { color: "#94A3B8", marginVertical: 8 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 8,
    gap: 6,
  },
  cardTitle: { fontWeight: "800", color: "#0F172A" },
  meta: { color: "#64748B", fontSize: 12 },
  row: { flexDirection: "row", gap: 8, marginTop: 4 },
  btn: {
    backgroundColor: "#F97316",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  btnText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  ghost: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  ghostText: { color: "#DC2626", fontWeight: "700", fontSize: 13 },
});
