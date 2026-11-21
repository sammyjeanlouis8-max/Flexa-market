/**
 * Flexa Chat — native conversation thread (iOS / Android).
 * + opens Camera/Gallery; voice uses a persistent outbox with actionable statuses;
 * long-press opens an action sheet without native text selection.
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
  AppState,
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
  fetchConversations,
  fetchMessages,
  formatBubbleClock,
  formatMessageTime,
  sendMessage,
  translateMessage,
  uploadChatMedia,
  type ChatMessage,
  type Conversation,
} from "@/lib/chatApi";
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
import {
  enqueueVoiceRecording,
  listVoiceOutbox,
  removeVoiceOutbox,
  updateVoiceOutbox,
  type VoiceOutboxItem,
} from "@/lib/voiceOutbox";
import { checkOnline, subscribeNetwork, startNetworkPolling } from "@/lib/networkStatus";

/** WhatsApp Android reference palette */
const WA_HEADER = "#075E54";
const WA_BG = "#ECE5DD";
const WA_OUT = "#DCF8C6";
const WA_IN = "#FFFFFF";
const WA_TEAL = "#128C7E";
const ORANGE = "#F97316";
const GREEN = WA_TEAL;
const MINT = WA_OUT;

function mediaUri(msg: ChatMessage): string | null {
  const raw = msg.imageUrl || msg.mediaUrl;
  if (!raw) return null;
  if (raw.startsWith("http")) return raw;
  if (raw.startsWith("/")) return `https://flexamarket.com${raw}`;
  return raw;
}

function normalizeAudioMime(raw?: string | null): string {
  const base = String(raw || "audio/mp4").split(";")[0].trim().toLowerCase();
  if (base === "audio/m4a" || base === "audio/x-m4a") return "audio/mp4";
  if (base.startsWith("audio/")) return base;
  return "audio/mp4";
}

type Row =
  | { kind: "server"; key: string; message: ChatMessage }
  | { kind: "voice"; key: string; item: VoiceOutboxItem };

export default function ChatThreadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const convId = Number(id);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, user, isLoading: authLoading } = useAuth();
  const { t, lang } = useLanguage();

  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [meta, setMeta] = useState<Conversation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sendingText, setSendingText] = useState(false);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [peerTyping, setPeerTyping] = useState(false);
  const [translations, setTranslations] = useState<Record<number, string>>({});
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [recordingBusy, setRecordingBusy] = useState(false);
  const [pendingVoices, setPendingVoices] = useState<VoiceOutboxItem[]>([]);
  const [flushingVoiceId, setFlushingVoiceId] = useState<string | null>(null);
  const [online, setOnline] = useState(true);

  const listRef = useRef<FlatList<Row>>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const voiceFlushBusy = useRef(false);
  const cancelledVoiceIds = useRef<Set<string>>(new Set());

  const tr = (key: string, fallback: string) => {
    const value = t(key);
    return !value || value === key ? fallback : value;
  };
  const copy = {
    attach: tr("chatAttach", "Attach"),
    camera: tr("chatCamera", "Camera"),
    gallery: tr("chatGallery", "Gallery"),
    cancel: tr("cancel", "Cancel"),
    permPhotos: tr("chatPermPhotos", "Allow photo access to send images and videos."),
    permCamera: tr("chatPermCamera", "Allow camera access to take a photo."),
    permMic: tr("chatPermMic", "Allow microphone access for voice messages."),
    waitingConnection: tr("chatWaitingConnection", "Waiting for connection"),
    uploading: tr("chatUploading", "Uploading…"),
    sending: tr("chatSending", "Sending…"),
    failed: tr("chatFailed", "Failed"),
    tryAgain: tr("chatTryAgain", "Try again"),
    cancelSend: tr("chatCancelSend", "Cancel send"),
    sent: tr("chatSent", "Sent"),
    delivered: tr("chatDelivered", "Delivered"),
    played: tr("chatPlayed", "Played"),
    copyMsg: tr("chatCopy", "Copy"),
    translate: tr("chatTranslate", "Translate"),
    typeMessage: tr("chatTypeMessage", "Type a message"),
    voice: tr("chatVoice", "Voice message"),
  };

  const loadMeta = useCallback(async () => {
    if (!token || !Number.isFinite(convId)) return;
    try {
      const list = await fetchConversations({ token });
      setMeta(list.find((c) => c.id === convId) ?? null);
    } catch {
      /* header meta optional */
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

  const refreshVoiceOutbox = useCallback(async () => {
    if (!Number.isFinite(convId)) return;
    const rows = await listVoiceOutbox(convId);
    setPendingVoices(rows);
  }, [convId]);

  const flushVoiceOutbox = useCallback(async () => {
    if (!token || !user || !Number.isFinite(convId) || voiceFlushBusy.current) return;
    voiceFlushBusy.current = true;
    try {
      const netOk = await checkOnline(true);
      setOnline(netOk);
      const pending = await listVoiceOutbox(convId);
      setPendingVoices(pending);
      if (!netOk) {
        for (const item of pending) {
          if (item.status !== "waiting_connection") {
            await updateVoiceOutbox(item.id, { status: "waiting_connection" });
          }
        }
        setPendingVoices(await listVoiceOutbox(convId));
        return;
      }

      for (const item of pending) {
        if (cancelledVoiceIds.current.has(item.id)) {
          await removeVoiceOutbox(item.id);
          continue;
        }
        setFlushingVoiceId(item.id);
        try {
          let mediaUrl = item.mediaUrl;
          if (!mediaUrl) {
            await updateVoiceOutbox(item.id, { status: "uploading", lastError: undefined });
            setPendingVoices(await listVoiceOutbox(convId));
            // Same clientMessageId (item.id) is reused on every retry after this upload.
            mediaUrl = await uploadChatMedia(item.localUri, {
              token,
              contentType: normalizeAudioMime(item.mimeType),
              fileName: item.fileName || "voice.m4a",
            });
            if (cancelledVoiceIds.current.has(item.id)) {
              await removeVoiceOutbox(item.id);
              continue;
            }
            // Persist mediaUrl so a later sendMessage retry does not re-upload a new copy.
            await updateVoiceOutbox(item.id, { mediaUrl, status: "sending" });
          } else {
            await updateVoiceOutbox(item.id, { status: "sending", lastError: undefined });
          }
          setPendingVoices(await listVoiceOutbox(convId));

          const saved = await sendMessage(
            convId,
            {
              content: "",
              messageType: "audio",
              mediaUrl,
              clientMessageId: item.id,
            },
            { token },
          );
          await removeVoiceOutbox(item.id);
          setMessages((prev) => {
            const list = prev ?? [];
            if (list.some((m) => m.id === saved.id || m.clientMessageId === item.id)) {
              return list.map((m) =>
                m.clientMessageId === item.id || m.id === saved.id ? saved : m,
              );
            }
            return [...list, saved];
          });
          setPendingVoices(await listVoiceOutbox(convId));
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Voice delivery failed";
          const offline = /network|abort|failed to fetch|offline/i.test(msg);
          await updateVoiceOutbox(item.id, {
            attempts: item.attempts + 1,
            status: offline ? "waiting_connection" : "failed",
            lastError: msg,
          });
          setPendingVoices(await listVoiceOutbox(convId));
          // Continue remaining queue items — do not abort the whole outbox on one failure.
        } finally {
          setFlushingVoiceId(null);
        }
      }
    } finally {
      voiceFlushBusy.current = false;
    }
  }, [token, user, convId]);

  useEffect(() => {
    if (!authLoading && !token) {
      router.replace("/auth/login");
      return;
    }
    if (!token || !Number.isFinite(convId)) return;

    void loadMeta();
    void loadMessages("initial");
    void refreshVoiceOutbox().then(() => flushVoiceOutbox());
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
      if (msg.clientMessageId) {
        void removeVoiceOutbox(String(msg.clientMessageId)).then(refreshVoiceOutbox);
      }
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
      void flushVoiceOutbox();
    }, 12000);

    const appSub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void checkOnline(true).then((ok) => {
          setOnline(ok);
          if (ok) void refreshVoiceOutbox().then(() => flushVoiceOutbox());
        });
      }
    });

    const stopNetPoll = startNetworkPolling(8000);
    const unsubNet = subscribeNetwork((ok) => {
      setOnline(ok);
      if (ok) void flushVoiceOutbox();
    });

    return () => {
      leaveConversation(convId);
      offNew();
      offTyping();
      offStop();
      clearInterval(poll);
      appSub.remove();
      stopNetPoll();
      unsubNet();
      if (user?.id) emitStopTyping(convId, user.id);
    };
  }, [
    authLoading,
    token,
    user?.id,
    convId,
    router,
    loadMeta,
    loadMessages,
    refreshVoiceOutbox,
    flushVoiceOutbox,
  ]);

  useEffect(() => {
    if (!(messages?.length || pendingVoices.length)) return;
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  }, [messages?.length, pendingVoices.length, peerTyping]);

  const onChangeDraft = (text: string) => {
    setDraft(text);
    if (!user?.id || !Number.isFinite(convId)) return;
    emitTyping(convId, user.id);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => emitStopTyping(convId, user.id), 1200);
  };

  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);

  const onSend = async () => {
    if (!token || !user || !Number.isFinite(convId)) return;
    const content = draft.trim();
    if (!content || sendingText) return;
    const clientMessageId = `c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const replyToMessageId = replyTo?.id && replyTo.id > 0 ? replyTo.id : undefined;
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
      replyToMessageId: replyToMessageId ?? null,
      createdAt: new Date().toISOString(),
    };
    setDraft("");
    setReplyTo(null);
    setMessages((prev) => [...(prev ?? []), optimistic]);
    setSendingText(true);
    emitStopTyping(convId, user.id);
    try {
      const saved = await sendMessage(
        convId,
        { content, messageType: "text", clientMessageId, replyToMessageId },
        { token },
      );
      setMessages((prev) =>
        (prev ?? []).map((m) => (m.clientMessageId === clientMessageId ? saved : m)),
      );
    } catch (e) {
      setMessages((prev) => (prev ?? []).filter((m) => m.clientMessageId !== clientMessageId));
      setDraft(content);
      Alert.alert("Send failed", e instanceof Error ? e.message : "Could not send");
    } finally {
      setSendingText(false);
    }
  };

  const sendPickedMedia = async (
    localUri: string,
    messageType: "image" | "video",
    contentType: string,
    fileName: string,
  ) => {
    if (!token || !user || !Number.isFinite(convId)) return;
    setMediaBusy(true);
    try {
      const url = await uploadChatMedia(localUri, { token, contentType, fileName });
      const clientMessageId = `m-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const saved = await sendMessage(
        convId,
        {
          content: "",
          messageType,
          imageUrl: messageType === "image" ? url : undefined,
          mediaUrl: url,
          clientMessageId,
        },
        { token },
      );
      setMessages((prev) => {
        const list = prev ?? [];
        if (list.some((m) => m.id === saved.id)) return list;
        return [...list, saved];
      });
    } catch (e) {
      Alert.alert("Send failed", e instanceof Error ? e.message : "Could not send media");
    } finally {
      setMediaBusy(false);
    }
  };

  const onPickGallery = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(copy.attach, copy.permPhotos);
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images", "videos"],
      quality: 0.8,
      videoMaxDuration: 60,
      allowsMultipleSelection: false,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const isVideo = (asset.type || "").includes("video") || (asset.mimeType || "").startsWith("video/");
    await sendPickedMedia(
      asset.uri,
      isVideo ? "video" : "image",
      asset.mimeType || (isVideo ? "video/mp4" : "image/jpeg"),
      asset.fileName || (isVideo ? "chat.mp4" : "chat.jpg"),
    );
  };

  const onPickCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(copy.camera, copy.permCamera);
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.85,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    await sendPickedMedia(
      asset.uri,
      "image",
      asset.mimeType || "image/jpeg",
      asset.fileName || "camera.jpg",
    );
  };

  const onPlus = () => {
    Alert.alert(copy.attach, undefined, [
      { text: copy.camera, onPress: () => void onPickCamera() },
      { text: copy.gallery, onPress: () => void onPickGallery() },
      { text: copy.cancel, style: "cancel" },
    ]);
  };

  const finishRecordingAndEnqueue = async (rec: Audio.Recording) => {
    setRecordingBusy(true);
    try {
      await rec.stopAndUnloadAsync();
      const uri = rec.getURI();
      setRecording(null);
      // Restore playback mode so received voice notes can play after recording.
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });
      if (!uri || !Number.isFinite(convId)) return;
      // Persist locally first — only remove after server confirms sendMessage.
      const item = await enqueueVoiceRecording({
        conversationId: convId,
        sourceUri: uri,
        mimeType: "audio/mp4",
      });
      setPendingVoices((prev) => [...prev.filter((row) => row.id !== item.id), item]);
      void flushVoiceOutbox();
    } catch (e) {
      Alert.alert("Voice", e instanceof Error ? e.message : "Could not save recording");
    } finally {
      setRecordingBusy(false);
    }
  };

  const toggleRecording = async () => {
    if (recordingBusy) return;
    try {
      if (recording) {
        await finishRecordingAndEnqueue(recording);
        return;
      }
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(copy.attach, copy.permMic);
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
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        playThroughEarpieceAndroid: false,
        shouldDuckAndroid: true,
      });
      const { sound } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: true },
      );
      soundRef.current = sound;
    } catch {
      Alert.alert("Playback", "Could not play voice message");
    }
  };

  const cancelVoice = async (id: string) => {
    cancelledVoiceIds.current.add(id);
    await removeVoiceOutbox(id);
    setPendingVoices((prev) => prev.filter((row) => row.id !== id));
  };

  const onLongPressMessage = (item: ChatMessage) => {
    const buttons: { text: string; onPress?: () => void; style?: "cancel" | "destructive" }[] = [];
    if (!item.isDeleted) {
      buttons.push({
        text: "Reply",
        onPress: () => setReplyTo(item),
      });
    }
    if (item.messageType === "text" && item.content) {
      buttons.push({
        text: copy.copyMsg,
        onPress: () => {
          // Clipboard API not guaranteed; keep translate primary on native.
        },
      });
      if (item.senderId !== user?.id) {
        buttons.push({
          text: copy.translate,
          onPress: () => void onTranslate(item),
        });
      }
    }
    if (item.messageType === "audio") {
      const uri = mediaUri(item);
      if (uri) buttons.push({ text: copy.voice, onPress: () => void playAudio(uri) });
    }
    buttons.push({ text: copy.cancel, style: "cancel" });
    if (buttons.length > 1) Alert.alert("Message", undefined, buttons);
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

  const rows: Row[] = useMemo(() => {
    const server = (messages ?? []).map((message) => ({
      kind: "server" as const,
      key: `m-${message.id}-${message.clientMessageId || ""}`,
      message,
    }));
    const pending = pendingVoices.map((item) => ({
      kind: "voice" as const,
      key: `v-${item.id}`,
      item,
    }));
    return [...server, ...pending];
  }, [messages, pendingVoices]);

  const voiceStatusLabel = (item: VoiceOutboxItem) => {
    if (!online || item.status === "waiting_connection") return copy.waitingConnection;
    if (flushingVoiceId === item.id || item.status === "uploading") return copy.uploading;
    if (item.status === "sending") return copy.sending;
    if (item.status === "failed") return copy.failed;
    return copy.sending;
  };

  return (
    <KeyboardAvoidingView
      style={[styles.root, { paddingTop: insets.top }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "android" ? 0 : 0}
    >
      <View style={styles.topBar}>
        <Pressable
          style={styles.back}
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace("/(tabs)/inbox")
          }
          accessibilityLabel="Back"
        >
          <Feather name="arrow-left" size={22} color="#FFFFFF" />
        </Pressable>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {(title || "?").trim().charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.headerMeta}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : peerTyping ? (
            <Text style={styles.subtitle}>typing…</Text>
          ) : null}
        </View>
        {meta?.listingId ? (
          <Pressable
            style={styles.back}
            onPress={() => router.push(`/webview-listing/${meta.listingId}`)}
            accessibilityLabel="View product"
          >
            <Feather name="shopping-bag" size={18} color="#FFFFFF" />
          </Pressable>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      {messages === null && !error ? (
        <ActivityIndicator color={ORANGE} style={{ marginTop: 40 }} />
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
          data={rows}
          keyExtractor={(item) => item.key}
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
            peerTyping ? <Text style={styles.typing}>typing…</Text> : <View style={{ height: 4 }} />
          }
          renderItem={({ item }) => {
            if (item.kind === "voice") {
              const pending = item.item;
              const busy = flushingVoiceId === pending.id;
              const failed = pending.status === "failed" && !busy;
              return (
                <View style={[styles.bubbleWrap, styles.mine]}>
                  <View style={[styles.bubble, styles.bubbleMine, styles.voiceBubble]}>
                    <View style={styles.audioBtn}>
                      <View style={styles.waPlay}>
                        <Feather name="mic" size={16} color="#075E54" />
                      </View>
                      <Text style={styles.msgText} selectable={false}>
                        {copy.voice}
                      </Text>
                    </View>
                    <Text style={styles.msgTime} selectable={false}>
                      {formatBubbleClock(new Date(pending.createdAt).toISOString())} ·{" "}
                      {voiceStatusLabel(pending)}
                    </Text>
                    <View style={styles.pendingActions}>
                      {failed || pending.status === "waiting_connection" ? (
                        <Pressable onPress={() => void flushVoiceOutbox()} hitSlop={8}>
                          <Text style={styles.pendingAction}>{copy.tryAgain}</Text>
                        </Pressable>
                      ) : null}
                      <Pressable onPress={() => void cancelVoice(pending.id)} hitSlop={8}>
                        <Text style={styles.pendingAction}>{copy.cancelSend}</Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              );
            }

            const msg = item.message;
            const mine = msg.senderId === myId;
            const media = mediaUri(msg);
            const deleted = msg.isDeleted;
            const status =
              mine && msg.id > 0
                ? msg.isListened && msg.messageType === "audio"
                  ? copy.played
                  : msg.isRead
                    ? copy.delivered
                    : copy.sent
                : "";

            return (
              <View style={[styles.bubbleWrap, mine ? styles.mine : styles.theirs]}>
                <Pressable
                  onLongPress={() => onLongPressMessage(msg)}
                  delayLongPress={420}
                  style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}
                >
                  {deleted ? (
                    <Text style={styles.deleted} selectable={false}>
                      Message deleted
                    </Text>
                  ) : msg.messageType === "image" && media ? (
                    <Image source={{ uri: media }} style={styles.msgImage} contentFit="cover" />
                  ) : msg.messageType === "video" && media ? (
                    <Video
                      source={{ uri: media }}
                      style={styles.msgVideo}
                      useNativeControls
                      resizeMode={ResizeMode.CONTAIN}
                    />
                  ) : msg.messageType === "audio" && media ? (
                    <Pressable style={styles.audioBtn} onPress={() => void playAudio(media)}>
                      <View style={styles.waPlay}>
                        <Feather name="play" size={16} color="#075E54" />
                      </View>
                      <View style={styles.waWave}>
                        <View style={styles.waWaveBar} />
                        <View style={[styles.waWaveBar, { height: 14 }]} />
                        <View style={[styles.waWaveBar, { height: 10 }]} />
                        <View style={[styles.waWaveBar, { height: 16 }]} />
                        <View style={[styles.waWaveBar, { height: 8 }]} />
                      </View>
                      <Text style={styles.msgText} selectable={false}>
                        {copy.voice}
                      </Text>
                    </Pressable>
                  ) : (
                    <Text style={styles.msgText} selectable={false}>
                      {msg.content || ""}
                    </Text>
                  )}
                  {translations[msg.id] ? (
                    <Text style={styles.translated} selectable={false}>
                      {translations[msg.id]}
                    </Text>
                  ) : null}
                  <Text style={styles.msgTime} selectable={false}>
                    {formatBubbleClock(msg.createdAt) || formatMessageTime(msg.createdAt)}
                    {status ? ` · ${status}` : ""}
                  </Text>
                </Pressable>
              </View>
            );
          }}
        />
      )}

      {replyTo ? (
        <View style={styles.replyBar}>
          <View style={{ flex: 1 }}>
            <Text style={styles.replyLabel}>Replying to</Text>
            <Text style={styles.replyPreview} numberOfLines={1}>
              {replyTo.messageType === "text"
                ? replyTo.content
                : replyTo.messageType === "audio"
                  ? copy.voice
                  : replyTo.messageType}
            </Text>
          </View>
          <Pressable onPress={() => setReplyTo(null)} hitSlop={8}>
            <Feather name="x" size={18} color="#54656F" />
          </Pressable>
        </View>
      ) : null}

      <View
        style={[
          styles.composer,
          { paddingBottom: Math.max(insets.bottom, Platform.OS === "android" ? 8 : 10) },
        ]}
      >
        <Pressable
          style={styles.plus}
          onPress={onPlus}
          disabled={mediaBusy}
          testID="chat-attach"
          accessibilityLabel={copy.attach}
        >
          <Feather name="plus" size={22} color="#54656F" />
        </Pressable>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={onChangeDraft}
          placeholder={
            recording
              ? "Recording… tap mic to send"
              : mediaBusy
                ? copy.uploading
                : copy.typeMessage
          }
          placeholderTextColor="#8696A0"
          multiline
          maxLength={4000}
          editable={!recording}
        />
        {draft.trim() ? (
          <Pressable
            style={[styles.send, sendingText && styles.sendDisabled]}
            onPress={() => void onSend()}
            disabled={sendingText}
          >
            {sendingText ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Feather name="send" size={18} color="#fff" />
            )}
          </Pressable>
        ) : (
          <Pressable
            style={[styles.send, recording && styles.sendRecording]}
            onPress={() => void toggleRecording()}
            disabled={recordingBusy}
            accessibilityLabel="Record voice"
          >
            <Feather name={recording ? "send" : "mic"} size={18} color="#fff" />
          </Pressable>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: WA_BG },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 8,
    backgroundColor: WA_HEADER,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#128C7E",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  headerMeta: { flex: 1, minWidth: 0 },
  title: { fontSize: 16, fontWeight: "700", color: "#FFFFFF" },
  subtitle: { fontSize: 12, color: "rgba(255,255,255,0.85)", fontWeight: "500", marginTop: 1 },
  centered: { alignItems: "center", paddingTop: 48, gap: 12 },
  error: { color: "#B91C1C", fontWeight: "600" },
  retry: {
    backgroundColor: WA_TEAL,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  retryText: { color: "#fff", fontWeight: "800" },
  empty: { textAlign: "center", color: "#667781", marginVertical: 24 },
  typing: {
    alignSelf: "flex-start",
    color: "#667781",
    fontSize: 12,
    fontStyle: "italic",
    marginLeft: 8,
    marginBottom: 4,
  },
  bubbleWrap: { marginVertical: 2, maxWidth: "82%" },
  mine: { alignSelf: "flex-end" },
  theirs: { alignSelf: "flex-start" },
  bubble: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingTop: 6,
    paddingBottom: 4,
    elevation: 1,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 1,
    shadowOffset: { width: 0, height: 1 },
  },
  bubbleMine: { backgroundColor: WA_OUT, borderTopRightRadius: 0 },
  bubbleTheirs: {
    backgroundColor: WA_IN,
    borderTopLeftRadius: 0,
  },
  voiceBubble: { minWidth: 180 },
  msgText: { color: "#111B21", fontSize: 15, lineHeight: 20 },
  msgTextMine: { color: "#111B21" },
  deleted: { color: "#667781", fontStyle: "italic", fontSize: 13 },
  translated: {
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(0,0,0,0.12)",
    fontSize: 13,
    color: "#3B4A54",
    fontStyle: "italic",
  },
  msgImage: { width: 220, height: 220, borderRadius: 6 },
  msgVideo: { width: 220, height: 160, borderRadius: 6, backgroundColor: "#0F172A" },
  audioBtn: { flexDirection: "row", alignItems: "center", gap: 8, minWidth: 160 },
  waPlay: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#D1D7DB",
  },
  waWave: { flexDirection: "row", alignItems: "flex-end", gap: 2, height: 18 },
  waWaveBar: {
    width: 3,
    height: 12,
    borderRadius: 1,
    backgroundColor: "#8696A0",
  },
  msgTime: {
    alignSelf: "flex-end",
    fontSize: 11,
    color: "#667781",
    marginTop: 2,
  },
  msgTimeMine: { color: "#667781" },
  pendingActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    marginTop: 6,
  },
  pendingAction: {
    color: WA_TEAL,
    fontSize: 11,
    fontWeight: "700",
    textDecorationLine: "underline",
  },
  replyBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: "#F0F2F5",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#D1D7DB",
  },
  replyLabel: { fontSize: 12, fontWeight: "700", color: WA_TEAL },
  replyPreview: { fontSize: 13, color: "#54656F", marginTop: 2 },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 6,
    paddingHorizontal: 6,
    paddingTop: 6,
    backgroundColor: "#F0F2F5",
  },
  plus: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  input: {
    flex: 1,
    minHeight: 42,
    maxHeight: 120,
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: "#111B21",
    fontSize: 15,
  },
  send: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: WA_TEAL,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  sendDisabled: { backgroundColor: "#86C5BC" },
  sendRecording: { backgroundColor: "#EF4444" },
});
