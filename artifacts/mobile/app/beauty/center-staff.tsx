import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { BeautyShell } from "@/components/beauty/BeautyShell";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import {
  createBeautyProfessional,
  fetchMyBeautyBusiness,
  updateBeautyProfessional,
  type BeautyProfessional,
} from "@/lib/beautyApi";
import { beautyTheme as T } from "@/lib/beautyTheme";

export default function BeautyCenterStaffScreen() {
  const { t } = useLanguage();
  const { token } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ businessId?: string }>();
  const businessId = Number(params.businessId);

  const [staff, setStaff] = useState<BeautyProfessional[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("staff");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!Number.isFinite(businessId) || businessId <= 0) {
      setError(t("beauty_notFound"));
      return;
    }
    setError(null);
    const data = await fetchMyBeautyBusiness(businessId, { token });
    setStaff((data.professionals || []) as BeautyProfessional[]);
  }, [businessId, token, t]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load()
        .catch((e: Error) => setError(e.message || t("beauty_loadError")))
        .finally(() => setLoading(false));
    }, [load, t]),
  );

  async function addStaff() {
    if (!token || !fullName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const created = await createBeautyProfessional(
        businessId,
        { fullName: fullName.trim(), role: role.trim() || "staff" },
        { token },
      );
      setStaff((prev) => [...prev, created]);
      setFullName("");
      setRole("staff");
    } catch (e: any) {
      setError(e?.message || t("beauty_saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(pro: BeautyProfessional) {
    if (!token) return;
    try {
      const updated = await updateBeautyProfessional(
        businessId,
        pro.id,
        { isActive: !pro.isActive },
        { token },
      );
      setStaff((prev) => prev.map((p) => (p.id === pro.id ? updated : p)));
    } catch (e: any) {
      setError(e?.message || t("beauty_saveFailed"));
    }
  }

  if (!Number.isFinite(businessId) || businessId <= 0) {
    return (
      <BeautyShell title={t("beauty_staff")} scroll>
        <Text style={styles.muted}>{t("beauty_notFound")}</Text>
        <Pressable style={styles.btn} onPress={() => router.push("/beauty/center" as any)}>
          <Text style={styles.btnText}>{t("beauty_tabCenter")}</Text>
        </Pressable>
      </BeautyShell>
    );
  }

  return (
    <BeautyShell title={t("beauty_staff")} subtitle={t("beauty_staffManage")} scroll={false}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load()
                .catch((e: Error) => setError(e.message))
                .finally(() => setRefreshing(false));
            }}
            tintColor={T.accent}
          />
        }
        contentContainerStyle={{ paddingBottom: 28 }}
      >
        <View style={styles.form}>
          <Text style={styles.label}>{t("beauty_addStaff")}</Text>
          <TextInput
            style={styles.input}
            value={fullName}
            onChangeText={setFullName}
            placeholder={t("beauty_staffName")}
            placeholderTextColor={T.muted}
          />
          <TextInput
            style={styles.input}
            value={role}
            onChangeText={setRole}
            placeholder={t("beauty_staffRole")}
            placeholderTextColor={T.muted}
          />
          <Pressable style={[styles.btn, saving && { opacity: 0.6 }]} disabled={saving} onPress={() => void addStaff()}>
            {saving ? <ActivityIndicator color={T.white} /> : <Text style={styles.btnText}>{t("beauty_save")}</Text>}
          </Pressable>
        </View>

        {loading ? (
          <ActivityIndicator color={T.accent} style={{ marginTop: 24 }} />
        ) : error ? (
          <Text style={styles.err}>{error}</Text>
        ) : staff.length === 0 ? (
          <Text style={styles.muted}>{t("beauty_noStaff")}</Text>
        ) : (
          staff.map((pro) => (
            <View key={pro.id} style={styles.card}>
              <View style={styles.rowBetween}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.title}>{pro.fullName}</Text>
                  <Text style={styles.muted}>
                    {[pro.role, pro.isActive === false ? t("beauty_inactive") : t("beauty_active")]
                      .filter(Boolean)
                      .join(" · ")}
                  </Text>
                </View>
                <Pressable style={styles.outlineBtn} onPress={() => void toggleActive(pro)}>
                  <Text style={styles.outlineBtnText}>
                    {pro.isActive === false ? t("beauty_activate") : t("beauty_deactivate")}
                  </Text>
                </Pressable>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </BeautyShell>
  );
}

const styles = StyleSheet.create({
  form: {
    backgroundColor: T.white,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
    gap: 8,
  },
  label: { fontWeight: "800", color: T.ink, fontSize: 14 },
  input: {
    backgroundColor: T.blushSoft,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: T.ink,
  },
  rowBetween: { flexDirection: "row", alignItems: "center", gap: 8 },
  card: {
    backgroundColor: T.white,
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  title: { fontWeight: "800", color: T.ink, fontSize: 15 },
  muted: { color: T.muted, fontSize: 12, marginTop: 4 },
  btn: {
    backgroundColor: T.accent,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    alignSelf: "flex-start",
  },
  btnText: { color: T.white, fontWeight: "800", fontSize: 13 },
  outlineBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  outlineBtnText: { color: T.ink, fontWeight: "700", fontSize: 12 },
  err: { color: "#b91c1c", marginTop: 8 },
});
