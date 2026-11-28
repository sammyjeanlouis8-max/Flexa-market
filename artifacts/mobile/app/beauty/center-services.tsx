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
  createBeautyService,
  fetchMyBeautyBusiness,
  formatBeautyMoney,
  updateBeautyService,
  type BeautyService,
} from "@/lib/beautyApi";
import { beautyTheme as T } from "@/lib/beautyTheme";

export default function BeautyCenterServicesScreen() {
  const { t } = useLanguage();
  const { token } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ businessId?: string }>();
  const businessId = Number(params.businessId);

  const [services, setServices] = useState<BeautyService[]>([]);
  const [currency, setCurrency] = useState("USD");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [duration, setDuration] = useState("60");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!Number.isFinite(businessId) || businessId <= 0) {
      setError(t("beauty_notFound"));
      return;
    }
    setError(null);
    const data = await fetchMyBeautyBusiness(businessId, { token });
    setServices(data.services || []);
    setCurrency(data.business.currency || "USD");
  }, [businessId, token, t]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load()
        .catch((e: Error) => setError(e.message || t("beauty_loadError")))
        .finally(() => setLoading(false));
    }, [load, t]),
  );

  async function addService() {
    if (!token || !name.trim()) return;
    const dollars = Number(price);
    if (!Number.isFinite(dollars) || dollars < 0) {
      setError(t("beauty_invalidPrice"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const created = await createBeautyService(
        businessId,
        {
          name: name.trim(),
          priceMinor: Math.round(dollars * 100),
          durationMinutes: Math.max(5, Math.floor(Number(duration) || 60)),
          currency,
        },
        { token },
      );
      setServices((prev) => [...prev, created]);
      setName("");
      setPrice("");
      setDuration("60");
    } catch (e: any) {
      setError(e?.message || t("beauty_saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(svc: BeautyService) {
    if (!token) return;
    try {
      const next = svc.status === "active" ? "inactive" : "active";
      const updated = await updateBeautyService(businessId, svc.id, { status: next }, { token });
      setServices((prev) => prev.map((s) => (s.id === svc.id ? updated : s)));
    } catch (e: any) {
      setError(e?.message || t("beauty_saveFailed"));
    }
  }

  if (!Number.isFinite(businessId) || businessId <= 0) {
    return (
      <BeautyShell title={t("beauty_services")} scroll>
        <Text style={styles.muted}>{t("beauty_notFound")}</Text>
        <Pressable style={styles.btn} onPress={() => router.push("/beauty/center" as any)}>
          <Text style={styles.btnText}>{t("beauty_tabCenter")}</Text>
        </Pressable>
      </BeautyShell>
    );
  }

  return (
    <BeautyShell title={t("beauty_services")} subtitle={t("beauty_servicesManage")} scroll={false}>
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
          <Text style={styles.label}>{t("beauty_addService")}</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder={t("beauty_serviceName")}
            placeholderTextColor={T.muted}
          />
          <View style={styles.row}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              value={price}
              onChangeText={setPrice}
              placeholder={t("beauty_price")}
              placeholderTextColor={T.muted}
              keyboardType="decimal-pad"
            />
            <TextInput
              style={[styles.input, { flex: 1 }]}
              value={duration}
              onChangeText={setDuration}
              placeholder={t("beauty_durationMin")}
              placeholderTextColor={T.muted}
              keyboardType="number-pad"
            />
          </View>
          <Pressable style={[styles.btn, saving && { opacity: 0.6 }]} disabled={saving} onPress={() => void addService()}>
            {saving ? <ActivityIndicator color={T.white} /> : <Text style={styles.btnText}>{t("beauty_save")}</Text>}
          </Pressable>
        </View>

        {loading ? (
          <ActivityIndicator color={T.accent} style={{ marginTop: 24 }} />
        ) : error ? (
          <Text style={styles.err}>{error}</Text>
        ) : services.length === 0 ? (
          <Text style={styles.muted}>{t("beauty_noServices")}</Text>
        ) : (
          services.map((svc) => (
            <View key={svc.id} style={styles.card}>
              <View style={styles.rowBetween}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.title}>{svc.name}</Text>
                  <Text style={styles.muted}>
                    {formatBeautyMoney(svc.price, svc.currency)} · {svc.durationMinutes} min · {svc.status}
                  </Text>
                </View>
                <Pressable style={styles.outlineBtn} onPress={() => void toggleActive(svc)}>
                  <Text style={styles.outlineBtnText}>
                    {svc.status === "active" ? t("beauty_deactivate") : t("beauty_activate")}
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
  row: { flexDirection: "row", gap: 8 },
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
