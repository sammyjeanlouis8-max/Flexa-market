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

const GREEN = "#146C43";
const MINT = "#D1FAE5";
const ORANGE = "#F97316";

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
      const pending = await listVoiceOutbox(convId);
      setPendingVoices(pending);
      if (!online) {
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
            mediaUrl = await uploadChatMedia(item.localUri, {
              token,
              contentType: normalizeAudioMime(item.mimeType),
              fileName: item.fileName || "voice.m4a",
            });
            if (cancelledVoiceIds.current.has(item.id)) {
              await removeVoiceOutbox(item.id);
              continue;
            }
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
          await updateVoiceOutbox(item.id, {
            attempts: item.attempts + 1,
            status: "failed",
            lastError: e instanceof Error ? e.message : "Voice delivery failed",
          });
          setPendingVoices(await listVoiceOutbox(convId));
          break;
        } finally {
          setFlushingVoiceId(null);
        }
      }
    } finally {
      voiceFlushBusy.current = false;
    }
  }, [token, user, convId, online]);

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
        setOnline(true);
        void refreshVoiceOutbox().then(() => flushVoiceOutbox());
      }
    });

    return () => {
      leaveConversation(convId);
      offNew();
      offTyping();
      offStop();
      clearInterval(poll);
      appSub.remove();
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

  const onSend = async () => {
    if (!token || !user || !Number.isFinite(convId)) return;
    const content = draft.trim();
    if (!content || sendingText) return;
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
    setSendingText(true);
    emitStopTyping(convId, user.id);
    try {
      const saved = await sendMessage(
        convId,
        { content, messageType: "text", clientMessageId },
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
      if (!uri || !Number.isFinite(convId)) return;
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
      const { sound } = await Audio.Sound.createAsync({ uri });
      soundRef.current = sound;
      await sound.playAsync();
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
                      <Feather name="mic" size={16} color="#fff" />
                      <Text style={[styles.msgText, styles.msgTextMine]} selectable={false}>
                        {copy.voice}
                      </Text>
                    </View>
                    <Text style={[styles.msgTime, styles.msgTimeMine]} selectable={false}>
                      {formatBubbleClock(new Date(pending.createdAt).toISOString())} ·{" "}
                      {voiceStatusLabel(pending)}
                    </Text>
                    <View style={styles.pendingActions}>
                      {failed ? (
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
                      <Feather name="play" size={16} color={mine ? "#fff" : "#0F172A"} />
                      <Text style={[styles.msgText, mine && styles.msgTextMine]} selectable={false}>
                        {copy.voice}
                      </Text>
                    </Pressable>
                  ) : (
                    <Text
                      style={[styles.msgText, mine && styles.msgTextMine]}
                      selectable={false}
                    >
                      {msg.content || ""}
                    </Text>
                  )}
                  {translations[msg.id] ? (
                    <Text style={styles.translated} selectable={false}>
                      {translations[msg.id]}
                    </Text>
                  ) : null}
                  <Text style={[styles.msgTime, mine && styles.msgTimeMine]} selectable={false}>
                    {formatBubbleClock(msg.createdAt) || formatMessageTime(msg.createdAt)}
                    {status ? ` · ${status}` : ""}
                  </Text>
                </Pressable>
              </View>
            );
          }}
        />
      )}

      <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        <Pressable
          style={styles.plus}
          onPress={onPlus}
          disabled={mediaBusy}
          testID="chat-attach"
          accessibilityLabel={copy.attach}
        >
          <Feather name="plus" size={22} color={GREEN} />
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
          placeholderTextColor="#94A3B8"
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
  root: { flex: 1, backgroundColor: "#F1F5F9" },
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
  subtitle: { fontSize: 12, color: ORANGE, fontWeight: "600", marginTop: 1 },
  centered: { alignItems: "center", paddingTop: 48, gap: 12 },
  error: { color: "#B91C1C", fontWeight: "600" },
  retry: {
    backgroundColor: ORANGE,
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
  bubbleMine: { backgroundColor: GREEN, borderBottomRightRadius: 4 },
  bubbleTheirs: {
    backgroundColor: "#FFFFFF",
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  voiceBubble: { minWidth: 168 },
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
  msgTime: {
    alignSelf: "flex-end",
    fontSize: 10,
    color: "#94A3B8",
    marginTop: 4,
  },
  msgTimeMine: { color: "rgba(255,255,255,0.85)" },
  pendingActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    marginTop: 6,
  },
  pendingAction: {
    color: "rgba(255,255,255,0.95)",
    fontSize: 11,
    fontWeight: "700",
    textDecorationLine: "underline",
  },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingHorizontal: 10,
    paddingTop: 8,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
  },
  plus: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: MINT,
    marginBottom: 2,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: "#0F172A",
    fontSize: 15,
  },
  send: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: ORANGE,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  sendDisabled: { backgroundColor: "#FDBA74" },
  sendRecording: { backgroundColor: "#EF4444" },
});
