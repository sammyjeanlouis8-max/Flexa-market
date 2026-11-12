/**
 * Native Support Center — tickets, ETA from server, FlexaBot, FAQ knowledge.
 */
import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import {
  createSupportThread,
  fetchSupportAvailability,
  fetchSupportKnowledge,
  fetchSupportThreads,
  lookupSupportTicketByRef,
  type KnowledgeItem,
  type SupportAvailability,
  type SupportThread,
} from "@/lib/supportApi";
import { isSupportStaff } from "@/lib/supportRoles";

export default function SupportHomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, user, isLoading: authLoading } = useAuth();
  const { t } = useLanguage();
  const [rows, setRows] = useState<SupportThread[] | null>(null);
  const [availability, setAvailability] = useState<SupportAvailability | null>(null);
  const [faq, setFaq] = useState<KnowledgeItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [creating, setCreating] = useState(false);
  const [refQuery, setRefQuery] = useState("");
  const staff = isSupportStaff(user);

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!token) return;
      if (mode === "refresh") setRefreshing(true);
      else setError(null);
      try {
        const [data, avail, knowledge] = await Promise.all([
          fetchSupportThreads({ token }),
          fetchSupportAvailability({ token }).catch(() => null),
          fetchSupportKnowledge({ token }).catch(() => []),
        ]);
        setRows(data);
        setAvailability(avail);
        setFaq(knowledge.slice(0, 8));
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : t("supportLoadErr"));
        setRows((prev) => prev ?? []);
      } finally {
        setRefreshing(false);
      }
    },
    [token, t],
  );

  useFocusEffect(
    useCallback(() => {
      if (!authLoading && !token) {
        router.replace("/auth/login");
        return;
      }
      if (token) void load("initial");
    }, [authLoading, token, router, load]),
  );

  const onCreate = async () => {
    if (!token) return;
    if (subject.trim().length < 3 || !message.trim()) {
      Alert.alert(t("supportTicket"), t("supportCreateValidation"));
      return;
    }
    setCreating(true);
    try {
      const thread = await createSupportThread(
        { subject: subject.trim(), message: message.trim() },
        { token },
      );
      setOpen(false);
      setSubject("");
      setMessage("");
      const ref = thread.ticketRef || `#${thread.id}`;
      const eta = thread.estimatedResponseLabel
        ? `\n${t("supportEta")}: ${thread.estimatedResponseLabel}`
        : "";
      Alert.alert(
        t("supportTicketCreated"),
        `${t("supportTicketNumber")}: ${ref}${eta}\n${t("supportConfirmHint")}`,
        [
          {
            text: t("ok"),
            onPress: () => router.push(`/support/${thread.id}`),
          },
        ],
      );
      void load("refresh");
    } catch (e) {
      Alert.alert(t("supportCreateFailed"), e instanceof Error ? e.message : "Error");
    } finally {
      setCreating(false);
    }
  };

  const onLookup = async () => {
    if (!token || !refQuery.trim()) return;
    try {
      const hit = await lookupSupportTicketByRef(refQuery.trim(), { token });
      router.push(`/support/${hit.id}`);
    } catch (e) {
      Alert.alert(t("supportLookup"), e instanceof Error ? e.message : t("supportNotFound"));
    }
  };

  const etaLabel =
    availability?.estimatedResponse?.label ||
    (availability?.estimatedResponse?.minutesMax
      ? `~${availability.estimatedResponse.minutesMax} min`
      : null);

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.topBar}>
        <Pressable
          style={styles.back}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
        >
          <Feather name="arrow-left" size={22} color="#0F172A" />
        </Pressable>
        <Text style={styles.title}>{t("supportTitle")}</Text>
        <Pressable style={styles.add} onPress={() => setOpen(true)}>
          <Feather name="plus" size={20} color="#fff" />
        </Pressable>
      </View>

      {staff ? (
        <Pressable style={styles.staffCard} onPress={() => router.push("/support-agent")}>
          <Feather name="headphones" size={18} color="#0F172A" />
          <Text style={styles.staffText}>{t("supportAgentDesk")}</Text>
          <Feather name="chevron-right" size={16} color="#94A3B8" />
        </Pressable>
      ) : null}

      <Pressable style={styles.botCard} onPress={() => router.push("/chatbot")}>
        <Feather name="cpu" size={20} color="#F97316" />
        <View style={{ flex: 1 }}>
          <Text style={styles.botTitle}>{t("flexabotTitle")}</Text>
          <Text style={styles.botSub}>{t("flexabotHint")}</Text>
        </View>
        <Feather name="chevron-right" size={18} color="#94A3B8" />
      </Pressable>

      {availability ? (
        <View style={styles.etaCard}>
          <Text style={styles.etaTitle}>{t("supportAvailability")}</Text>
          <Text style={styles.etaBody}>
            {availability.agentsOnline > 0
              ? `${availability.agentsOnline} ${t("supportAgentsOnline")}`
              : t("supportAgentsOffline")}
            {etaLabel ? ` · ${t("supportEta")}: ${etaLabel}` : ""}
          </Text>
          <Text style={styles.etaNote}>{t("supportEtaNote")}</Text>
        </View>
      ) : null}

      <View style={styles.lookupRow}>
        <TextInput
          style={styles.lookupInput}
          value={refQuery}
          onChangeText={setRefQuery}
          placeholder={t("supportLookupPlaceholder")}
          placeholderTextColor="#94A3B8"
          autoCapitalize="characters"
        />
        <Pressable style={styles.lookupBtn} onPress={() => void onLookup()}>
          <Text style={styles.lookupBtnText}>{t("supportLookup")}</Text>
        </Pressable>
      </View>

      <Text style={styles.note}>{t("supportMediaNote")}</Text>

      {rows === null && !error ? (
        <ActivityIndicator color="#F97316" style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={rows ?? []}
          keyExtractor={(item) => String(item.id)}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load("refresh")}
              tintColor="#F97316"
            />
          }
          ListHeaderComponent={
            <View style={{ gap: 10, marginBottom: 8 }}>
              {error ? <Text style={styles.error}>{error}</Text> : null}
              {faq.length ? (
                <View>
                  <Text style={styles.section}>{t("supportFaq")}</Text>
                  {faq.map((item, i) => (
                    <Pressable
                      key={`${item.slug || item.title}-${i}`}
                      style={styles.faqRow}
                      onPress={() =>
                        Alert.alert(item.title, item.body.slice(0, 800), [
                          item.deepLink
                            ? {
                                text: t("open"),
                                onPress: () => router.push(item.deepLink as any),
                              }
                            : undefined,
                          { text: t("ok") },
                        ].filter(Boolean) as any)
                      }
                    >
                      <Text style={styles.faqTitle}>{item.title}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
              <Text style={styles.section}>{t("supportMyTickets")}</Text>
            </View>
          }
          ListEmptyComponent={<Text style={styles.empty}>{t("supportNoTickets")}</Text>}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => router.push(`/support/${item.id}`)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {item.subject}
                </Text>
                <Text style={styles.rowSub}>
                  {item.ticketRef || `#${item.id}`} · {item.status || "open"}
                  {item.priority && item.priority !== "normal" ? ` · ${item.priority}` : ""}
                </Text>
              </View>
              <Feather name="chevron-right" size={16} color="#94A3B8" />
            </Pressable>
          )}
        />
      )}

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { paddingBottom: insets.bottom + 16 }]}>
            <Text style={styles.modalTitle}>{t("supportNewTicket")}</Text>
            <TextInput
              style={styles.input}
              value={subject}
              onChangeText={setSubject}
              placeholder={t("supportSubject")}
              placeholderTextColor="#94A3B8"
            />
            <TextInput
              style={[styles.input, styles.textarea]}
              value={message}
              onChangeText={setMessage}
              placeholder={t("supportMessage")}
              placeholderTextColor="#94A3B8"
              multiline
            />
            <View style={styles.modalActions}>
              <Pressable style={styles.cancel} onPress={() => setOpen(false)}>
                <Text style={styles.cancelText}>{t("cancel")}</Text>
              </Pressable>
              <Pressable
                style={[styles.create, creating && { opacity: 0.6 }]}
                onPress={() => void onCreate()}
                disabled={creating}
              >
                {creating ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.createText}>{t("supportSubmit")}</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F8FAFC" },
  topBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, marginBottom: 8 },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, textAlign: "center", fontSize: 18, fontWeight: "800", color: "#0F172A" },
  add: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F97316",
    alignItems: "center",
    justifyContent: "center",
  },
  staffCard: {
    marginHorizontal: 16,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#FEF3C7",
    borderRadius: 12,
    padding: 12,
  },
  staffText: { flex: 1, fontWeight: "800", color: "#0F172A" },
  botCard: {
    marginHorizontal: 16,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 14,
  },
  botTitle: { fontWeight: "800", color: "#0F172A" },
  botSub: { color: "#64748B", fontSize: 12, marginTop: 2 },
  etaCard: {
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: "#ECFDF5",
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  etaTitle: { fontWeight: "800", color: "#047857", fontSize: 13 },
  etaBody: { color: "#065F46", fontSize: 13 },
  etaNote: { color: "#059669", fontSize: 11 },
  lookupRow: {
    marginHorizontal: 16,
    marginBottom: 8,
    flexDirection: "row",
    gap: 8,
  },
  lookupInput: {
    flex: 1,
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    color: "#0F172A",
  },
  lookupBtn: {
    backgroundColor: "#0F172A",
    borderRadius: 10,
    paddingHorizontal: 12,
    justifyContent: "center",
  },
  lookupBtnText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  note: { marginHorizontal: 16, marginBottom: 8, color: "#94A3B8", fontSize: 12 },
  section: { fontWeight: "800", color: "#0F172A", marginBottom: 6, fontSize: 14 },
  faqRow: {
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 10,
    marginBottom: 6,
  },
  faqTitle: { fontWeight: "700", color: "#0F172A", fontSize: 13 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 12,
    marginBottom: 8,
  },
  rowTitle: { fontWeight: "800", color: "#0F172A" },
  rowSub: { color: "#64748B", fontSize: 12, marginTop: 2 },
  empty: { textAlign: "center", color: "#94A3B8", marginTop: 24 },
  error: { color: "#DC2626", marginBottom: 8 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(15,23,42,0.45)", justifyContent: "flex-end" },
  modalCard: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 16,
    gap: 10,
  },
  modalTitle: { fontWeight: "900", fontSize: 17, color: "#0F172A" },
  input: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: "#0F172A",
  },
  textarea: { minHeight: 110, textAlignVertical: "top" },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 4 },
  cancel: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
  },
  cancelText: { fontWeight: "700", color: "#64748B" },
  create: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    backgroundColor: "#F97316",
    alignItems: "center",
    justifyContent: "center",
  },
  createText: { fontWeight: "800", color: "#fff" },
});
