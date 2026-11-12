/**
 * Flexa Chat Pro Max — conversation thread
 * GET/POST /api/conversations/:id/messages + Socket.IO realtime + polling fallback.
 */
import { Feather } from "@expo/vector-icons";
import { Audio, ResizeMode, Video } from "expo-av";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import {
  createOffer,
} from "@/lib/offersApi";
import {
  fetchConversations,
  fetchMessages,
  formatMessageTime,
  sendMessage,
  translateMessage,
  uploadChatMedia,
  type ChatMessage,
  type Conversation,
} from "@/lib/chatApi";
import {
  ABUSE_REASONS,
  blockUser,
  submitAbuseReport,
} from "@/lib/safetyApi";
import {
  emitStopTyping,
  emitTyping,
  getChatSocket,
  joinConversation,
  leaveConversation,
  onNewMessage,
  onStopTyping,
  onTyping,
  presenceJoin,
} from "@/lib/chatSocket";

function mediaUri(msg: ChatMessage): string | null {
  const raw = msg.imageUrl || msg.mediaUrl;
  if (!raw) return null;
  if (raw.startsWith("http")) return raw;
  if (raw.startsWith("/")) return `https://flexamarket.com${raw}`;
  return raw;
}

export default function ChatThreadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const convId = Number(id);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, user, isLoading: authLoading } = useAuth();
  const { lang } = useLanguage();

  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [meta, setMeta] = useState<Conversation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [peerTyping, setPeerTyping] = useState(false);
  const [translations, setTranslations] = useState<Record<number, string>>({});
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [recordingBusy, setRecordingBusy] = useState(false);
  const [offerAmount, setOfferAmount] = useState("");
  const [showOffer, setShowOffer] = useState(false);
  const [messagingBlocked, setMessagingBlocked] = useState(false);
  const [showReportForm, setShowReportForm] = useState(false);
  const [reportReason, setReportReason] = useState<(typeof ABUSE_REASONS)[number]["key"]>("harassment");
  const [reportBusy, setReportBusy] = useState(false);
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);

  const loadMeta = useCallback(async () => {
    if (!token || !Number.isFinite(convId)) return;
    try {
      const list = await fetchConversations({ token });
      setMeta(list.find((c) => c.id === convId) ?? null);
    } catch {
      /* thread still usable without header meta */
    }
  }, [token, convId]);

  const loadMessages = useCallback(
    async (mode: "initial" | "silent" = "initial") => {
      if (!token || !Number.isFinite(convId)) return;
      if (mode === "initial") setError(null);
      try {
        const rows = await fetchMessages(convId, { token });
        setMessages(rows);
        setError(null);
      } catch (e) {
        if (mode === "initial") {
          setError(e instanceof Error ? e.message : "Could not load chat");
          setMessages((prev) => prev ?? []);
        }
      }
    },
    [token, convId],
  );

  useEffect(() => {
    if (!authLoading && !token) {
      router.replace("/auth/login");
      return;
    }
    if (!token || !Number.isFinite(convId)) return;

    void loadMeta();
    void loadMessages("initial");
    if (user?.id) presenceJoin(user.id);
    getChatSocket().connect();
    joinConversation(convId);

    const offNew = onNewMessage((msg) => {
      if (Number(msg?.conversationId) !== convId) return;
      setMessages((prev) => {
        const list = prev ?? [];
        if (list.some((m) => m.id === msg.id)) return list;
        if (
          msg.clientMessageId &&
          list.some((m) => m.clientMessageId === msg.clientMessageId)
        ) {
          return list.map((m) =>
            m.clientMessageId === msg.clientMessageId ? { ...m, ...msg } : m,
          );
        }
        return [...list, msg as ChatMessage];
      });
    });

    const offTyping = onTyping((data) => {
      if (data.convId !== convId) return;
      if (user?.id && data.userId === user.id) return;
      setPeerTyping(true);
    });
    const offStop = onStopTyping((data) => {
      if (data.convId !== convId) return;
      setPeerTyping(false);
    });

    const poll = setInterval(() => {
      void loadMessages("silent");
    }, 12000);

    return () => {
      leaveConversation(convId);
      offNew();
      offTyping();
      offStop();
      clearInterval(poll);
      if (user?.id) emitStopTyping(convId, user.id);
    };
  }, [authLoading, token, user?.id, convId, router, loadMeta, loadMessages]);

  useEffect(() => {
    if (!messages?.length) return;
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated: true });
    });
  }, [messages?.length, peerTyping]);

  const onChangeDraft = (text: string) => {
    setDraft(text);
    if (!user?.id || !Number.isFinite(convId)) return;
    emitTyping(convId, user.id);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      emitStopTyping(convId, user.id);
    }, 1200);
  };

  const runBlock = async (openReport: boolean) => {
    if (!token || !meta?.otherUserId) return;
    try {
      await blockUser(meta.otherUserId, { token, report: false });
      setMessagingBlocked(true);
      Alert.alert("Blocked", "You will no longer be able to message each other.");
      if (openReport) setShowReportForm(true);
    } catch (e) {
      Alert.alert("Block failed", e instanceof Error ? e.message : "Could not block user");
    }
  };

  const openSafetyMenu = () => {
    if (!meta?.otherUserId) return;
    Alert.alert(
      meta.otherUserName || "User",
      "Safety options",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Block",
          style: "destructive",
          onPress: () => void runBlock(false),
        },
        {
          text: "Block and report",
          style: "destructive",
          onPress: () => void runBlock(true),
        },
      ],
    );
  };

  const onSend = async () => {
    if (!token || !user || !Number.isFinite(convId) || messagingBlocked) return;
    const content = draft.trim();
    if (!content || sending) return;
    const clientMessageId = `c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const optimistic: ChatMessage = {
      id: -Date.now(),
      conversationId: convId,
      senderId: user.id,
      senderName: user.name,
      senderAvatar: user.avatarUrl ?? null,
      content,
      messageType: "text",
      mediaUrl: null,
      imageUrl: null,
      isRead: false,
      clientMessageId,
      createdAt: new Date().toISOString(),
    };
    setDraft("");
    setMessages((prev) => [...(prev ?? []), optimistic]);
    setSending(true);
    emitStopTyping(convId, user.id);
    try {
      const saved = await sendMessage(
        convId,
        {
          content,
          messageType: "text",
          clientMessageId,
          replyToMessageId: replyTo?.id && replyTo.id > 0 ? replyTo.id : undefined,
        },
        { token },
      );
      setReplyTo(null);
      setMessages((prev) =>
        (prev ?? []).map((m) =>
          m.clientMessageId === clientMessageId ? saved : m,
        ),
      );
    } catch (e) {
      setMessages((prev) =>
        (prev ?? []).filter((m) => m.clientMessageId !== clientMessageId),
      );
      setDraft(content);
      Alert.alert("Send failed", e instanceof Error ? e.message : "Could not send");
    } finally {
      setSending(false);
    }
  };

  const sendMedia = async (
    localUri: string,
    messageType: "image" | "video" | "audio",
    contentType: string,
    fileName: string,
  ) => {
    if (!token || !user || !Number.isFinite(convId) || messagingBlocked) return;
    setSending(true);
    try {
      const url = await uploadChatMedia(localUri, {
        token,
        contentType,
        fileName,
      });
      const clientMessageId = `m-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const saved = await sendMessage(
        convId,
        {
          content: "",
          messageType,
          imageUrl: messageType === "image" ? url : undefined,
          mediaUrl: url,
          clientMessageId,
          replyToMessageId: replyTo?.id && replyTo.id > 0 ? replyTo.id : undefined,
        },
        { token },
      );
      setReplyTo(null);
      setMessages((prev) => {
        const list = prev ?? [];
        if (list.some((m) => m.id === saved.id)) return list;
        return [...list, saved];
      });
    } catch (e) {
      Alert.alert("Send failed", e instanceof Error ? e.message : "Could not send media");
    } finally {
      setSending(false);
    }
  };

  const onPickImage = async () => {
    if (!token || sending) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Allow photo access to send images.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    await sendMedia(
      asset.uri,
      "image",
      asset.mimeType || "image/jpeg",
      asset.fileName || "chat.jpg",
    );
  };

  const onPickVideo = async () => {
    if (!token || sending) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Allow media access to send videos.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["videos"],
      quality: 0.7,
      videoMaxDuration: 60,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    await sendMedia(
      asset.uri,
      "video",
      asset.mimeType || "video/mp4",
      asset.fileName || "chat.mp4",
    );
  };

  const toggleRecording = async () => {
    if (recordingBusy || sending) return;
    try {
      if (recording) {
        setRecordingBusy(true);
        await recording.stopAndUnloadAsync();
        const uri = recording.getURI();
        setRecording(null);
        setRecordingBusy(false);
        if (uri) {
          await sendMedia(uri, "audio", "audio/m4a", "voice.m4a");
        }
        return;
      }
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Permission needed", "Allow microphone access for voice messages.");
        return;
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await rec.startAsync();
      setRecording(rec);
    } catch (e) {
      setRecording(null);
      setRecordingBusy(false);
      Alert.alert("Voice", e instanceof Error ? e.message : "Recording failed");
    }
  };

  const playAudio = async (uri: string) => {
    try {
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }
      const { sound } = await Audio.Sound.createAsync({ uri });
      soundRef.current = sound;
      await sound.playAsync();
    } catch {
      Alert.alert("Playback", "Could not play voice message");
    }
  };

  const onSendOffer = async () => {
    if (messagingBlocked) {
      Alert.alert("Blocked", "Messaging is blocked between these users.");
      return;
    }
    if (!token || !meta?.listingId) {
      Alert.alert("Offer", "This chat is not linked to a product listing.");
      return;
    }
    const amount = Number(offerAmount);
    if (!(amount > 0)) {
      Alert.alert("Offer", "Enter a valid offer amount");
      return;
    }
    setSending(true);
    try {
      const offer = await createOffer(
        { listingId: meta.listingId, amount, message: "Offer from chat" },
        { token },
      );
      const clientMessageId = `o-${Date.now()}`;
      await sendMessage(
        convId,
        {
          content: `Private offer: $${amount.toFixed(2)} (offer #${offer.id}). Public price unchanged.`,
          messageType: "text",
          clientMessageId,
        },
        { token },
      );
      setShowOffer(false);
      setOfferAmount("");
      await loadMessages("silent");
      Alert.alert("Offer sent", "The seller can accept, reject, or counter in Offers.");
    } catch (e) {
      Alert.alert("Offer failed", e instanceof Error ? e.message : "Could not create offer");
    } finally {
      setSending(false);
    }
  };

  const onTranslate = async (msg: ChatMessage) => {
    if (!token || !msg.content?.trim()) return;
    if (translations[msg.id]) {
      setTranslations((prev) => {
        const next = { ...prev };
        delete next[msg.id];
        return next;
      });
      return;
    }
    const result = await translateMessage(msg.id, lang, { token });
    if (!result) {
      Alert.alert("Translate", "Translation is unavailable right now.");
      return;
    }
    setTranslations((prev) => ({ ...prev, [msg.id]: result.translatedText }));
  };

  const myId = user?.id;
  const title = meta?.otherUserName || "Chat";
  const subtitle = meta?.listingTitle;

  const data = useMemo(() => messages ?? [], [messages]);

  return (
    <KeyboardAvoidingView
      style={[styles.root, { paddingTop: insets.top }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={0}
    >
      <View style={styles.topBar}>
        <Pressable
          style={styles.back}
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace("/(tabs)/inbox")
          }
        >
          <Feather name="arrow-left" size={22} color="#0F172A" />
        </Pressable>
        <View style={styles.headerMeta}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {meta?.listingId ? (
          <Pressable
            style={styles.back}
            onPress={() => router.push(`/listing/${meta.listingId}`)}
          >
            <Feather name="shopping-bag" size={18} color="#0F172A" />
          </Pressable>
        ) : null}
        {meta?.otherUserId ? (
          <Pressable style={styles.back} onPress={openSafetyMenu} accessibilityLabel="More options">
            <Feather name="more-vertical" size={18} color="#0F172A" />
          </Pressable>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      {messages === null && !error ? (
        <ActivityIndicator color="#F97316" style={{ marginTop: 40 }} />
      ) : error && !messages?.length ? (
        <View style={styles.centered}>
          <Text style={styles.error}>{error}</Text>
          <Pressable style={styles.retry} onPress={() => void loadMessages("initial")}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={data}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{
            paddingHorizontal: 12,
            paddingBottom: 12,
            flexGrow: 1,
            justifyContent: "flex-end",
          }}
          ListEmptyComponent={
            <Text style={styles.empty}>Say hello — this chat is empty.</Text>
          }
          ListFooterComponent={
            peerTyping ? (
              <Text style={styles.typing}>typing…</Text>
            ) : (
              <View style={{ height: 4 }} />
            )
          }
          renderItem={({ item }) => {
            const mine = item.senderId === myId;
            const media = mediaUri(item);
            const deleted = item.isDeleted;
            const parent =
              item.replyToMessageId != null
                ? (messages ?? []).find((m) => m.id === item.replyToMessageId)
                : null;
            return (
              <View style={[styles.bubbleWrap, mine ? styles.mine : styles.theirs]}>
                <Pressable
                  onLongPress={() => {
                    setReplyTo(item);
                    if (!mine && item.messageType === "text" && item.content) {
                      void onTranslate(item);
                    }
                  }}
                  style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}
                >
                  {parent ? (
                    <Text style={[styles.replyPreview, mine && styles.replyPreviewMine]} numberOfLines={2}>
                      ↩ {parent.content || parent.messageType}
                    </Text>
                  ) : null}
                  {deleted ? (
                    <Text style={styles.deleted}>Message deleted</Text>
                  ) : item.messageType === "image" && media ? (
                    <Image source={{ uri: media }} style={styles.msgImage} contentFit="cover" />
                  ) : item.messageType === "video" && media ? (
                    <Video
                      source={{ uri: media }}
                      style={styles.msgVideo}
                      useNativeControls
                      resizeMode={ResizeMode.CONTAIN}
                    />
                  ) : item.messageType === "audio" && media ? (
                    <Pressable
                      style={styles.audioBtn}
                      onPress={() => void playAudio(media)}
                    >
                      <Feather name="play" size={16} color={mine ? "#fff" : "#0F172A"} />
                      <Text style={[styles.msgText, mine && styles.msgTextMine]}>
                        Voice message
                      </Text>
                    </Pressable>
                  ) : (
                    <Text style={[styles.msgText, mine && styles.msgTextMine]}>
                      {item.content || ""}
                    </Text>
                  )}
                  {translations[item.id] ? (
                    <Text style={styles.translated}>{translations[item.id]}</Text>
                  ) : null}
                  <Text style={[styles.msgTime, mine && styles.msgTimeMine]}>
                    {formatMessageTime(item.createdAt)}
                    {mine ? (item.isRead ? " · Read" : " · Sent") : ""}
                  </Text>
                </Pressable>
              </View>
            );
          }}
        />
      )}

      {replyTo ? (
        <View style={styles.replyBar}>
          <Text style={styles.replyBarText} numberOfLines={1}>
            Replying to: {replyTo.content || replyTo.messageType}
          </Text>
          <Pressable onPress={() => setReplyTo(null)}>
            <Feather name="x" size={16} color="#64748B" />
          </Pressable>
        </View>
      ) : null}

      {showOffer ? (
        <View style={styles.offerBar}>
          <TextInput
            style={styles.offerInput}
            value={offerAmount}
            onChangeText={setOfferAmount}
            placeholder="Offer amount (USD)"
            placeholderTextColor="#94A3B8"
            keyboardType="decimal-pad"
          />
          <Pressable style={styles.offerSend} onPress={() => void onSendOffer()}>
            <Text style={styles.offerSendText}>Send offer</Text>
          </Pressable>
          <Pressable onPress={() => setShowOffer(false)}>
            <Feather name="x" size={18} color="#64748B" />
          </Pressable>
        </View>
      ) : null}

      {messagingBlocked ? (
        <View style={[styles.blockedBanner, { paddingBottom: Math.max(insets.bottom, 14) }]}>
          <Text style={styles.blockedText}>
            You blocked this user. Previous messages stay visible. Unblock in Settings to message again.
          </Text>
        </View>
      ) : (
        <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 10) }]}>
          <Pressable style={styles.attach} onPress={() => void onPickImage()} disabled={sending}>
            <Feather name="image" size={18} color="#0F172A" />
          </Pressable>
          <Pressable style={styles.attach} onPress={() => void onPickVideo()} disabled={sending}>
            <Feather name="video" size={18} color="#0F172A" />
          </Pressable>
          <Pressable
            style={[styles.attach, recording && styles.attachRec]}
            onPress={() => void toggleRecording()}
            disabled={sending || recordingBusy}
          >
            <Feather name="mic" size={18} color={recording ? "#fff" : "#0F172A"} />
          </Pressable>
          <Pressable style={styles.attach} onPress={() => setShowOffer(true)} disabled={sending}>
            <Feather name="tag" size={18} color="#0F172A" />
          </Pressable>
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={onChangeDraft}
            placeholder={recording ? "Recording… tap mic to send" : "Type a message"}
            placeholderTextColor="#94A3B8"
            multiline
            maxLength={4000}
            editable={!recording}
          />
          <Pressable
            style={[styles.send, (!draft.trim() || sending) && styles.sendDisabled]}
            onPress={() => void onSend()}
            disabled={!draft.trim() || sending}
          >
            {sending ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Feather name="send" size={18} color="#fff" />
            )}
          </Pressable>
        </View>
      )}

      {showReportForm && meta?.otherUserId ? (
        <View style={styles.reportOverlay}>
          <View style={styles.reportCard}>
            <Text style={styles.reportTitle}>Report abuse</Text>
            <Text style={styles.reportSub}>
              Block is already active. Submit only if you want moderation to review.
            </Text>
            {ABUSE_REASONS.map((r) => (
              <Pressable
                key={r.key}
                style={styles.reportReason}
                onPress={() => setReportReason(r.key)}
              >
                <Feather
                  name={reportReason === r.key ? "check-circle" : "circle"}
                  size={18}
                  color={reportReason === r.key ? "#F97316" : "#94A3B8"}
                />
                <Text style={styles.reportReasonText}>{r.label}</Text>
              </Pressable>
            ))}
            <View style={styles.reportActions}>
              <Pressable style={styles.reportCancel} onPress={() => setShowReportForm(false)}>
                <Text style={styles.reportCancelText}>Close</Text>
              </Pressable>
              <Pressable
                style={styles.reportSubmit}
                disabled={reportBusy}
                onPress={() => {
                  if (!token || !meta.otherUserId) return;
                  setReportBusy(true);
                  const label = ABUSE_REASONS.find((r) => r.key === reportReason)?.label ?? "Other";
                  void submitAbuseReport(
                    { targetType: "user", targetId: meta.otherUserId, reason: label },
                    { token },
                  )
                    .then(() => {
                      setShowReportForm(false);
                      Alert.alert("Report submitted", "Moderation will review this report.");
                    })
                    .catch((e) => {
                      Alert.alert(
                        "Report failed",
                        e instanceof Error
                          ? `${e.message}. You can try again without creating a duplicate.`
                          : "Could not submit. Try again.",
                      );
                    })
                    .finally(() => setReportBusy(false));
                }}
              >
                {reportBusy ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.reportSubmitText}>Submit report</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F1F5F9" },
  blockedBanner: {
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
  },
  blockedText: {
    textAlign: "center",
    color: "#64748B",
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
  },
  reportOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15,23,42,0.45)",
    justifyContent: "flex-end",
  },
  reportCard: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 16,
    gap: 8,
  },
  reportTitle: { fontSize: 17, fontWeight: "800", color: "#0F172A" },
  reportSub: { fontSize: 12, color: "#64748B", marginBottom: 6, lineHeight: 17 },
  reportReason: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 },
  reportReasonText: { fontSize: 15, fontWeight: "600", color: "#0F172A" },
  reportActions: { flexDirection: "row", gap: 10, marginTop: 8 },
  reportCancel: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  reportCancelText: { fontWeight: "700", color: "#475569" },
  reportSubmit: {
    flex: 1,
    backgroundColor: "#F97316",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  reportSubmitText: { fontWeight: "700", color: "#FFFFFF" },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  headerMeta: { flex: 1, minWidth: 0 },
  title: { fontSize: 16, fontWeight: "800", color: "#0F172A" },
  subtitle: { fontSize: 12, color: "#F97316", fontWeight: "600", marginTop: 1 },
  centered: { alignItems: "center", paddingTop: 48, gap: 12 },
  error: { color: "#B91C1C", fontWeight: "600" },
  retry: {
    backgroundColor: "#F97316",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  retryText: { color: "#fff", fontWeight: "800" },
  empty: { textAlign: "center", color: "#94A3B8", marginVertical: 24 },
  typing: {
    alignSelf: "flex-start",
    color: "#64748B",
    fontSize: 12,
    fontStyle: "italic",
    marginLeft: 8,
    marginBottom: 4,
  },
  bubbleWrap: { marginVertical: 4, maxWidth: "82%" },
  mine: { alignSelf: "flex-end" },
  theirs: { alignSelf: "flex-start" },
  bubble: {
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 6,
  },
  bubbleMine: { backgroundColor: "#F97316", borderBottomRightRadius: 4 },
  bubbleTheirs: {
    backgroundColor: "#FFFFFF",
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  msgText: { color: "#0F172A", fontSize: 15, lineHeight: 21 },
  msgTextMine: { color: "#FFFFFF" },
  deleted: { color: "#94A3B8", fontStyle: "italic", fontSize: 13 },
  translated: {
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(148,163,184,0.5)",
    fontSize: 13,
    color: "#334155",
    fontStyle: "italic",
  },
  msgImage: { width: 220, height: 220, borderRadius: 12 },
  msgVideo: { width: 220, height: 160, borderRadius: 12, backgroundColor: "#0F172A" },
  audioBtn: { flexDirection: "row", alignItems: "center", gap: 8 },
  replyPreview: {
    fontSize: 12,
    color: "#64748B",
    marginBottom: 6,
    fontStyle: "italic",
  },
  replyPreviewMine: { color: "rgba(255,255,255,0.85)" },
  msgTime: {
    alignSelf: "flex-end",
    fontSize: 10,
    color: "#94A3B8",
    marginTop: 4,
  },
  msgTimeMine: { color: "rgba(255,255,255,0.8)" },
  replyBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#FFF7ED",
    borderTopWidth: 1,
    borderTopColor: "#FED7AA",
  },
  replyBarText: { flex: 1, color: "#9A3412", fontSize: 12, fontWeight: "600" },
  offerBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
  },
  offerInput: {
    flex: 1,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 12,
    color: "#0F172A",
  },
  offerSend: {
    height: 40,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "#0F172A",
    alignItems: "center",
    justifyContent: "center",
  },
  offerSendText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 6,
    paddingHorizontal: 8,
    paddingTop: 8,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
  },
  attach: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 4,
  },
  attachRec: { backgroundColor: "#EF4444", borderColor: "#EF4444" },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#0F172A",
    fontSize: 15,
  },
  send: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F97316",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  sendDisabled: { backgroundColor: "#FDBA74" },
});
