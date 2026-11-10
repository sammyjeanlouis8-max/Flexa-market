/**
 * Super-admin manual Expo/FCM push campaign composer — /push/manual-send.
 * Does not claim physical-device delivery verification.
 */
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";
import { AdminShell, adminStyles } from "@/components/AdminShell";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { isSuperAdminUser } from "@/lib/adminRoles";
import { fetchPushManualRecipients, postPushManualSend } from "@/lib/phase3mApis";

export default function AdminPushCampaignsScreen() {
  const router = useRouter();
  const { token, user, isLoading } = useAuth();
  const { t } = useLanguage();
  const [eligible, setEligible] = useState<number | null>(null);
  const [audience, setAudience] = useState<"all" | "country" | "user">("all");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [url, setUrl] = useState("/");
  const [country, setCountry] = useState("Haiti");
  const [userId, setUserId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const data = await fetchPushManualRecipients({ token });
      setEligible(data.totalEligibleUsers);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("adminLoadErr"));
    } finally {
      setRefreshing(false);
    }
  }, [token, t]);

  useFocusEffect(
    useCallback(() => {
      if (!isLoading && !token) {
        router.replace("/auth/login");
        return;
      }
      if (token && !isSuperAdminUser(user)) {
        router.replace("/admin");
        return;
      }
      if (token) void load();
    }, [isLoading, token, user, router, load]),
  );

  const send = async () => {
    if (!token) return;
    if (!title.trim() || !message.trim()) {
      Alert.alert(t("adminPushCampaigns"), t("adminPushRequired"));
      return;
    }
    setBusy(true);
    try {
      const res = await postPushManualSend(
        {
          audience,
          title: title.trim(),
          message: message.trim(),
          url: url.trim() || "/",
          ...(audience === "country" ? { country: country.trim() } : {}),
          ...(audience === "user" ? { userId: Number(userId) } : {}),
        },
        { token },
      );
      Alert.alert(
        t("adminPushCampaigns"),
        `users=${res.acceptedUsers ?? "?"} devices=${res.acceptedDevices ?? "?"} inApp=${res.inAppStored ?? "?"}`,
      );
    } catch (e) {
      Alert.alert(t("adminPushCampaigns"), e instanceof Error ? e.message : "failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminShell
      title={t("adminPushCampaigns")}
      error={error}
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        void load();
      }}
    >
      <Text style={adminStyles.cardSub}>{t("adminPushNote")}</Text>
      <View style={adminStyles.card}>
        <Text style={adminStyles.cardTitle}>
          {t("adminPushEligible")}: {eligible ?? "—"}
        </Text>
      </View>
      <View style={adminStyles.row}>
        {(["all", "country", "user"] as const).map((a) => (
          <Pressable
            key={a}
            style={[adminStyles.btnGhost, audience === a && adminStyles.btn]}
            onPress={() => setAudience(a)}
          >
            <Text style={audience === a ? adminStyles.btnText : adminStyles.btnGhostText}>
              {a}
            </Text>
          </Pressable>
        ))}
      </View>
      <View style={adminStyles.card}>
        <TextInput
          style={adminStyles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="Title (≤80)"
          placeholderTextColor="#94A3B8"
          maxLength={80}
        />
        <TextInput
          style={[adminStyles.input, { minHeight: 90, textAlignVertical: "top" }]}
          value={message}
          onChangeText={setMessage}
          placeholder="Message (≤240)"
          placeholderTextColor="#94A3B8"
          multiline
          maxLength={240}
        />
        <TextInput
          style={adminStyles.input}
          value={url}
          onChangeText={setUrl}
          placeholder="/notifications"
          placeholderTextColor="#94A3B8"
          autoCapitalize="none"
        />
        {audience === "country" ? (
          <TextInput
            style={adminStyles.input}
            value={country}
            onChangeText={setCountry}
            placeholder="Country"
            placeholderTextColor="#94A3B8"
          />
        ) : null}
        {audience === "user" ? (
          <TextInput
            style={adminStyles.input}
            value={userId}
            onChangeText={setUserId}
            placeholder="User ID"
            placeholderTextColor="#94A3B8"
            keyboardType="number-pad"
          />
        ) : null}
        <Pressable
          style={adminStyles.btn}
          disabled={busy}
          onPress={() =>
            Alert.alert(t("adminPushCampaigns"), t("adminPushConfirm"), [
              { text: t("cancel"), style: "cancel" },
              { text: t("ok"), onPress: () => void send() },
            ])
          }
        >
          <Text style={adminStyles.btnText}>{t("adminPushSend")}</Text>
        </Pressable>
      </View>
    </AdminShell>
  );
}
