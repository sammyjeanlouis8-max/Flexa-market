/**
 * Super-admin broadcast email + SMS composers — verified /admin/broadcast-* APIs.
 */
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";
import { AdminShell, adminStyles } from "@/components/AdminShell";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { isSuperAdminUser } from "@/lib/adminRoles";
import {
  fetchBroadcastEmailRecipients,
  fetchBroadcastSmsRecipients,
  postBroadcastEmail,
  postBroadcastSms,
} from "@/lib/phase3mApis";

export default function AdminBroadcastScreen() {
  const router = useRouter();
  const { token, user, isLoading } = useAuth();
  const { t } = useLanguage();
  const [mode, setMode] = useState<"email" | "sms">("email");
  const [emailCount, setEmailCount] = useState<number | null>(null);
  const [smsCount, setSmsCount] = useState<number | null>(null);
  const [twilio, setTwilio] = useState<boolean | null>(null);
  const [subject, setSubject] = useState("");
  const [htmlBody, setHtmlBody] = useState("");
  const [testEmail, setTestEmail] = useState("");
  const [smsMessage, setSmsMessage] = useState("");
  const [testPhone, setTestPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const [email, sms] = await Promise.all([
        fetchBroadcastEmailRecipients({ token }),
        fetchBroadcastSmsRecipients({ token }),
      ]);
      setEmailCount(email.total);
      setSmsCount(sms.total);
      setTwilio(!!sms.twilioConfigured);
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

  const sendEmail = async (test: boolean) => {
    if (!token) return;
    if (!subject.trim() || !htmlBody.trim()) {
      Alert.alert(t("adminBroadcast"), t("adminBroadcastEmailRequired"));
      return;
    }
    setBusy(true);
    try {
      const res = await postBroadcastEmail(
        {
          subject: subject.trim(),
          htmlBody: htmlBody.trim(),
          ...(test ? { testEmail: testEmail.trim() } : {}),
        },
        { token },
      );
      Alert.alert(t("adminBroadcast"), `${res.mode || "ok"} · sent=${res.sent ?? "?"}`);
    } catch (e) {
      Alert.alert(t("adminBroadcast"), e instanceof Error ? e.message : "failed");
    } finally {
      setBusy(false);
    }
  };

  const sendSms = async (test: boolean) => {
    if (!token) return;
    if (!smsMessage.trim()) {
      Alert.alert(t("adminBroadcast"), t("adminBroadcastSmsRequired"));
      return;
    }
    setBusy(true);
    try {
      const res = await postBroadcastSms(
        {
          message: smsMessage.trim(),
          ...(test ? { testPhone: testPhone.trim() } : {}),
        },
        { token },
      );
      Alert.alert(
        t("adminBroadcast"),
        `${res.mode || "ok"} · sent=${res.sent ?? "?"} failed=${res.failed ?? 0}`,
      );
    } catch (e) {
      Alert.alert(t("adminBroadcast"), e instanceof Error ? e.message : "failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminShell
      title={t("adminBroadcast")}
      error={error}
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        void load();
      }}
    >
      <Text style={adminStyles.cardSub}>{t("adminBroadcastNote")}</Text>
      <View style={adminStyles.row}>
        <Pressable
          style={[adminStyles.btnGhost, mode === "email" && adminStyles.btn]}
          onPress={() => setMode("email")}
        >
          <Text style={mode === "email" ? adminStyles.btnText : adminStyles.btnGhostText}>
            Email ({emailCount ?? "—"})
          </Text>
        </Pressable>
        <Pressable
          style={[adminStyles.btnGhost, mode === "sms" && adminStyles.btn]}
          onPress={() => setMode("sms")}
        >
          <Text style={mode === "sms" ? adminStyles.btnText : adminStyles.btnGhostText}>
            SMS ({smsCount ?? "—"})
          </Text>
        </Pressable>
      </View>

      {mode === "email" ? (
        <View style={adminStyles.card}>
          <Text style={adminStyles.cardTitle}>{t("adminBroadcastEmail")}</Text>
          <TextInput
            style={adminStyles.input}
            value={subject}
            onChangeText={setSubject}
            placeholder="Subject"
            placeholderTextColor="#94A3B8"
          />
          <TextInput
            style={[adminStyles.input, { minHeight: 120, textAlignVertical: "top" }]}
            value={htmlBody}
            onChangeText={setHtmlBody}
            placeholder="<p>HTML body</p>"
            placeholderTextColor="#94A3B8"
            multiline
          />
          <TextInput
            style={adminStyles.input}
            value={testEmail}
            onChangeText={setTestEmail}
            placeholder="test@example.com"
            placeholderTextColor="#94A3B8"
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <View style={adminStyles.row}>
            <Pressable
              style={adminStyles.btnGhost}
              disabled={busy}
              onPress={() => void sendEmail(true)}
            >
              <Text style={adminStyles.btnGhostText}>{t("adminBroadcastTest")}</Text>
            </Pressable>
            <Pressable
              style={adminStyles.btn}
              disabled={busy}
              onPress={() =>
                Alert.alert(t("adminBroadcast"), t("adminBroadcastConfirmAll"), [
                  { text: t("cancel"), style: "cancel" },
                  { text: t("ok"), onPress: () => void sendEmail(false) },
                ])
              }
            >
              <Text style={adminStyles.btnText}>{t("adminBroadcastSendAll")}</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={adminStyles.card}>
          <Text style={adminStyles.cardTitle}>{t("adminBroadcastSms")}</Text>
          <Text style={adminStyles.cardSub}>
            Twilio: {twilio == null ? "…" : twilio ? "configured" : "NOT configured"}
          </Text>
          <TextInput
            style={[adminStyles.input, { minHeight: 100, textAlignVertical: "top" }]}
            value={smsMessage}
            onChangeText={setSmsMessage}
            placeholder="SMS message (max 1600)"
            placeholderTextColor="#94A3B8"
            multiline
            maxLength={1600}
          />
          <TextInput
            style={adminStyles.input}
            value={testPhone}
            onChangeText={setTestPhone}
            placeholder="+509…"
            placeholderTextColor="#94A3B8"
            keyboardType="phone-pad"
          />
          <View style={adminStyles.row}>
            <Pressable
              style={adminStyles.btnGhost}
              disabled={busy}
              onPress={() => void sendSms(true)}
            >
              <Text style={adminStyles.btnGhostText}>{t("adminBroadcastTest")}</Text>
            </Pressable>
            <Pressable
              style={adminStyles.btn}
              disabled={busy}
              onPress={() =>
                Alert.alert(t("adminBroadcast"), t("adminBroadcastConfirmAll"), [
                  { text: t("cancel"), style: "cancel" },
                  { text: t("ok"), onPress: () => void sendSms(false) },
                ])
              }
            >
              <Text style={adminStyles.btnText}>{t("adminBroadcastSendAll")}</Text>
            </Pressable>
          </View>
        </View>
      )}
    </AdminShell>
  );
}
