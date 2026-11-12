/**
 * Support ticket conversation — customer + staff actions (RBAC server-enforced).
 * Text / image / video only — no voice.
 */
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { Video, ResizeMode } from "expo-av";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { uploadLocalFile } from "@/lib/mediaUpload";
import { pickSystemMedia } from "@/lib/systemMediaPicker";
import {
  claimSupportThread,
  closeSupportThread,
  fetchSupportCustomer,
  fetchSupportThread,
  rateSupportThread,
  releaseSupportThread,
  reopenSupportThread,
  sendSupportMessage,
  setSupportPriority,
  type SupportMessage,
  type SupportThread,
} from "@/lib/supportApi";
import { canAssignSupportTickets, isSupportStaff } from "@/lib/supportRoles";

function mediaAbs(url: string) {
  if (url.startsWith("http")) return url;
  if (url.startsWith("/")) return `https://flexamarket.com${url}`;
  return url;
}

export default function SupportTicketScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const threadId = Number(id);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, user, isLoading: authLoading } = useAuth();
  const { t } = useLanguage();
  const [thread, setThread] = useState<SupportThread | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [customerCtx, setCustomerCtx] = useState<any>(null);
  const [internal, setInternal] = useState(false);
  const staff = isSupportStaff(user);
  const closed = (thread?.status || "").toLowerCase() === "closed";

  const load = useCallback(async () => {
    if (!token || !Number.isFinite(threadId)) return;
    try {
      const data = await fetchSupportThread(threadId, { token });
      setThread(data.thread);
      setMessages(data.messages.filter((m) => !m.isInternal || staff));
      setError(null);
      if (staff) {
        fetchSupportCustomer(threadId, { token })
          .then(setCustomerCtx)
          .catch(() => setCustomerCtx(null));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("supportLoadErr"));
    }
  }, [token, threadId, staff, t]);

  useEffect(() => {
    if (!authLoading && !token) {
      router.replace("/auth/login");
      return;
    }
    void load();
    const poll = setInterval(() => void load(), 10000);
    return () => clearInterval(poll);
  }, [authLoading, token, router, load]);

  const onSend = async () => {
    if (!token || !draft.trim() || sending || closed) return;
    const content = draft.trim();
    setDraft("");
    setSending(true);
    try {
      await sendSupportMessage(
        threadId,
        { content, messageType: "text", isInternal: staff ? internal : false },
        { token },
      );
      await load();
    } catch (e) {
      setDraft(content);
      Alert.alert(t("supportSendFailed"), e instanceof Error ? e.message : "Error");
    } finally {
      setSending(false);
    }
  };

  const uploadAndSend = async (kind: "image" | "video") => {
    if (!token || sending || closed) return;
    const result = await pickSystemMedia({
      mediaTypes: kind === "image" ? ["images"] : ["videos"],
      quality: 0.8,
      videoMaxDuration: 120,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setSending(true);
    setUploadPct(0);
    try {
      const up = await uploadLocalFile(asset.uri, {
        token,
        contentType:
          asset.mimeType || (kind === "image" ? "image/jpeg" : "video/mp4"),
        fileName: asset.fileName || (kind === "image" ? "support.jpg" : "support.mp4"),
        onProgress: (p) => setUploadPct(p.percent),
      });
      await sendSupportMessage(
        threadId,
        {
          content: "",
          messageType: kind,
          mediaUrl: up.url,
          mediaMime: asset.mimeType || undefined,
          mediaSize: asset.fileSize || undefined,
          mediaName: asset.fileName || undefined,
        },
        { token },
      );
      await load();
    } catch (e) {
      Alert.alert(t("supportUploadFailed"), e instanceof Error ? e.message : "Error");
    } finally {
      setSending(false);
      setUploadPct(null);
    }
  };

  const onRate = (rating: number) => {
    if (!token) return;
    void rateSupportThread(threadId, rating, { token })
      .then(() => Alert.alert(t("supportThanks"), t("supportRatingSaved")))
      .catch((e) => Alert.alert(t("supportRate"), e instanceof Error ? e.message : "Error"));
  };

  const runStaff = async (action: string) => {
    if (!token) return;
    try {
      if (action === "claim") await claimSupportThread(threadId, { token });
      if (action === "release") await releaseSupportThread(threadId, { token });
      if (action === "close") await closeSupportThread(threadId, { token });
      if (action === "reopen") await reopenSupportThread(threadId, { token });
      if (action === "high") await setSupportPriority(threadId, "high", { token });
      if (action === "urgent") await setSupportPriority(threadId, "urgent", { token });
      if (action === "normal") await setSupportPriority(threadId, "normal", { token });
      await load();
    } catch (e) {
      Alert.alert(t("supportTitle"), e instanceof Error ? e.message : "Error");
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.root, { paddingTop: insets.top }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.topBar}>
        <Pressable
          style={styles.back}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/support"))}
        >
          <Feather name="arrow-left" size={22} color="#0F172A" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>
            {thread?.subject || t("supportTicket")}
          </Text>
          <Text style={styles.sub}>
            {thread?.ticketRef || `#${threadId}`} · {thread?.status || "open"}
            {thread?.assignedAdminName ? ` · ${thread.assignedAdminName}` : ""}
          </Text>
        </View>
        {thread?.relatedOrderId ? (
          <Pressable style={styles.back} onPress={() => router.push(`/orders/${thread.relatedOrderId}`)}>
            <Feather name="package" size={18} color="#0F172A" />
          </Pressable>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      {staff ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.staffBar}>
          <Chip label={t("supportClaim")} onPress={() => void runStaff("claim")} />
          <Chip label={t("supportRelease")} onPress={() => void runStaff("release")} />
          <Chip label={t("supportClose")} onPress={() => void runStaff("close")} />
          <Chip label={t("supportReopen")} onPress={() => void runStaff("reopen")} />
          <Chip label="P: normal" onPress={() => void runStaff("normal")} />
          <Chip label="P: high" onPress={() => void runStaff("high")} />
          <Chip label="P: urgent" onPress={() => void runStaff("urgent")} />
          {canAssignSupportTickets(user) ? (
            <Chip label={t("supportAdminDesk")} onPress={() => router.push("/support-admin")} />
          ) : null}
        </ScrollView>
      ) : null}

      {staff && customerCtx?.customer ? (
        <View style={styles.ctx}>
          <Text style={styles.ctxTitle}>{customerCtx.customer.name || "Customer"}</Text>
          <Text style={styles.ctxSub}>
            {[customerCtx.customer.email, customerCtx.customer.country].filter(Boolean).join(" · ")}
          </Text>
        </View>
      ) : null}

      {error && !messages.length ? (
        <Text style={styles.error}>{error}</Text>
      ) : (
        <FlatList
          data={messages}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ padding: 12, paddingBottom: 12 }}
          renderItem={({ item }) => {
            const mine = item.senderId === user?.id;
            const agent = Boolean(item.isAdminReply);
            return (
              <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
                {agent && item.senderName ? (
                  <Text style={styles.agentName}>{item.senderName}</Text>
                ) : null}
                {item.isInternal ? <Text style={styles.internal}>{t("supportInternal")}</Text> : null}
                {item.messageType === "image" && item.mediaUrl ? (
                  <Image source={{ uri: mediaAbs(item.mediaUrl) }} style={styles.img} contentFit="cover" />
                ) : item.messageType === "video" && item.mediaUrl ? (
                  <Video
                    source={{ uri: mediaAbs(item.mediaUrl) }}
                    style={styles.video}
                    useNativeControls
                    resizeMode={ResizeMode.CONTAIN}
                  />
                ) : (
                  <Text style={[styles.text, mine && styles.textMine]}>{item.content}</Text>
                )}
              </View>
            );
          }}
          ListFooterComponent={
            !staff ? (
              <View style={styles.rateRow}>
                {closed ? (
                  <Pressable style={styles.reopenBtn} onPress={() => void runStaff("reopen")}>
                    <Text style={styles.reopenText}>{t("supportReopen")}</Text>
                  </Pressable>
                ) : null}
                <Text style={styles.rateLabel}>{t("supportRate")}</Text>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Pressable key={n} onPress={() => onRate(n)}>
                    <Feather name="star" size={18} color="#F97316" />
                  </Pressable>
                ))}
              </View>
            ) : null
          }
        />
      )}

      {uploadPct != null ? (
        <Text style={styles.uploadPct}>{t("supportUploading")}: {uploadPct}%</Text>
      ) : null}

      {!closed ? (
        <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 10) }]}>
          {staff ? (
            <Pressable
              style={[styles.attach, internal && styles.internalOn]}
              onPress={() => setInternal((v) => !v)}
            >
              <Feather name="eye-off" size={16} color={internal ? "#fff" : "#0F172A"} />
            </Pressable>
          ) : null}
          <Pressable style={styles.attach} onPress={() => void uploadAndSend("image")}>
            <Feather name="image" size={18} color="#0F172A" />
          </Pressable>
          <Pressable style={styles.attach} onPress={() => void uploadAndSend("video")}>
            <Feather name="video" size={18} color="#0F172A" />
          </Pressable>
          <View style={[styles.attach, styles.attachDisabled]}>
            <Feather name="mic-off" size={18} color="#94A3B8" />
          </View>
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            placeholder={internal ? t("supportInternalPlaceholder") : t("supportMessagePlaceholder")}
            placeholderTextColor="#94A3B8"
            multiline
          />
          <Pressable
            style={[styles.send, (!draft.trim() || sending) && styles.sendDisabled]}
            onPress={() => void onSend()}
            disabled={!draft.trim() || sending}
          >
            {sending ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Feather name="send" size={16} color="#fff" />
            )}
          </Pressable>
        </View>
      ) : (
        <View style={[styles.closedBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <Text style={styles.closedText}>{t("supportClosed")}</Text>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

function Chip({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.chip} onPress={onPress}>
      <Text style={styles.chipText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F8FAFC" },
  topBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, gap: 4 },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { fontWeight: "800", color: "#0F172A", fontSize: 15 },
  sub: { color: "#64748B", fontSize: 11 },
  staffBar: { paddingHorizontal: 12, gap: 8, paddingVertical: 8 },
  chip: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipText: { fontWeight: "700", fontSize: 12, color: "#0F172A" },
  ctx: {
    marginHorizontal: 12,
    marginBottom: 6,
    backgroundColor: "#EEF2FF",
    borderRadius: 10,
    padding: 10,
  },
  ctxTitle: { fontWeight: "800", color: "#312E81" },
  ctxSub: { color: "#4338CA", fontSize: 12 },
  bubble: { maxWidth: "82%", borderRadius: 14, padding: 10, marginBottom: 8 },
  mine: { alignSelf: "flex-end", backgroundColor: "#F97316" },
  theirs: { alignSelf: "flex-start", backgroundColor: "#fff", borderWidth: 1, borderColor: "#E2E8F0" },
  text: { color: "#0F172A", lineHeight: 20 },
  textMine: { color: "#fff" },
  agentName: { fontWeight: "800", fontSize: 11, color: "#64748B", marginBottom: 4 },
  internal: { fontSize: 10, fontWeight: "800", color: "#B45309", marginBottom: 4 },
  img: { width: 180, height: 180, borderRadius: 10 },
  video: { width: 220, height: 160, borderRadius: 10, backgroundColor: "#0F172A" },
  rateRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 12 },
  rateLabel: { fontWeight: "700", color: "#64748B", marginRight: 4 },
  reopenBtn: {
    backgroundColor: "#0F172A",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginRight: 8,
  },
  reopenText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 6,
    paddingHorizontal: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    backgroundColor: "#fff",
  },
  attach: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  attachDisabled: { opacity: 0.7 },
  internalOn: { backgroundColor: "#B45309" },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 110,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: "#0F172A",
  },
  send: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#F97316",
    alignItems: "center",
    justifyContent: "center",
  },
  sendDisabled: { opacity: 0.5 },
  uploadPct: { textAlign: "center", color: "#64748B", fontSize: 12, paddingVertical: 4 },
  closedBar: { alignItems: "center", paddingTop: 10, backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: "#E2E8F0" },
  closedText: { color: "#64748B", fontWeight: "700" },
  error: { color: "#DC2626", padding: 16 },
});
