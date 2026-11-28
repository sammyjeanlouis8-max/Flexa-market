import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { BeautyShell } from "@/components/beauty/BeautyShell";
import { NativePhotoField } from "@/components/media/NativePhotoField";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import {
  createBeautyService,
  fetchMyBeautyBusiness,
  formatBeautyMoney,
  updateBeautyService,
  type BeautyService,
} from "@/lib/beautyApi";
import { isHttpsImageUrl } from "@/lib/nativePhotoPicker";
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
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [imageError, setImageError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editImages, setEditImages] = useState<string[]>([]);
  const [editImageError, setEditImageError] = useState(false);

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
    const imageUrl = imageUrls.find(isHttpsImageUrl) || "";
    if (!imageUrl) {
      setImageError(true);
      setError(t("beauty_serviceImageRequired") || "A service image is required before publishing.");
      return;
    }
    setSaving(true);
    setError(null);
    setImageError(false);
    try {
      const created = await createBeautyService(
        businessId,
        {
          name: name.trim(),
          priceMinor: Math.round(dollars * 100),
          durationMinutes: Math.max(5, Math.floor(Number(duration) || 60)),
          currency,
          imageUrl,
          status: "active",
        },
        { token },
      );
      setServices((prev) => [...prev, created]);
      setName("");
      setPrice("");
      setDuration("60");
      setImageUrls([]);
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
      if (next === "active" && !isHttpsImageUrl(svc.imageUrl)) {
        setError(t("beauty_serviceImageRequired") || "Add a valid image before activating this service.");
        startEdit(svc);
        return;
      }
      const updated = await updateBeautyService(businessId, svc.id, { status: next }, { token });
      setServices((prev) => prev.map((s) => (s.id === svc.id ? updated : s)));
    } catch (e: any) {
      setError(e?.message || t("beauty_saveFailed"));
    }
  }

  function startEdit(svc: BeautyService) {
    setEditingId(svc.id);
    setEditImages(svc.imageUrl && isHttpsImageUrl(svc.imageUrl) ? [svc.imageUrl] : []);
    setEditImageError(false);
  }

  async function saveEdit() {
    if (!token || !editingId) return;
    const imageUrl = editImages.find(isHttpsImageUrl) || "";
    if (!imageUrl) {
      setEditImageError(true);
      setError(t("beauty_serviceImageRequired") || "A service image is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await updateBeautyService(
        businessId,
        editingId,
        { imageUrl, status: "active" },
        { token },
      );
      setServices((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      setEditingId(null);
      setEditImages([]);
    } catch (e: any) {
      setError(e?.message || t("beauty_saveFailed"));
    } finally {
      setSaving(false);
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
          <NativePhotoField
            token={token}
            value={imageUrls}
            onChange={(urls) => {
              setImageUrls(urls);
              if (urls.length) setImageError(false);
            }}
            max={1}
            allowsEditing
            aspect={[1, 1]}
            required
            showError={imageError}
            label={t("beauty_serviceImage") || "Service / model photo"}
            helpText={t("beauty_serviceImageHelp") || "Hairstyle or service photo required."}
            testID="beauty-service-photo"
          />
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
                <View style={{ flexDirection: "row", gap: 10, flex: 1, alignItems: "center" }}>
                  {svc.imageUrl ? (
                    <Image source={{ uri: svc.imageUrl }} style={styles.thumb} />
                  ) : (
                    <View style={[styles.thumb, styles.thumbEmpty]} />
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.title}>{svc.name}</Text>
                    <Text style={styles.muted}>
                      {formatBeautyMoney(svc.price, svc.currency)} · {svc.durationMinutes} min · {svc.status}
                      {!svc.imageUrl ? ` · ${t("restaurant_missingImage") || "missing image"}` : ""}
                    </Text>
                  </View>
                </View>
                <Pressable style={styles.outlineBtn} onPress={() => void toggleActive(svc)}>
                  <Text style={styles.outlineBtnText}>
                    {svc.status === "active" ? t("beauty_deactivate") : t("beauty_activate")}
                  </Text>
                </Pressable>
              </View>
              {editingId === svc.id ? (
                <View style={{ marginTop: 10 }}>
                  <NativePhotoField
                    token={token}
                    value={editImages}
                    onChange={(urls) => {
                      setEditImages(urls);
                      if (urls.length) setEditImageError(false);
                    }}
                    max={1}
                    allowsEditing
                    aspect={[1, 1]}
                    required
                    showError={editImageError}
                    label={t("beauty_editServiceImage") || "Edit service photo"}
                    testID={`beauty-service-edit-${svc.id}`}
                  />
                  <View style={styles.row}>
                    <Pressable style={[styles.btn, { flex: 1 }, saving && { opacity: 0.6 }]} disabled={saving} onPress={() => void saveEdit()}>
                      <Text style={styles.btnText}>{t("beauty_save")}</Text>
                    </Pressable>
                    <Pressable style={styles.outlineBtn} onPress={() => setEditingId(null)}>
                      <Text style={styles.outlineBtnText}>{t("nativePhoto_cancel") || "Cancel"}</Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <Pressable style={[styles.outlineBtn, { marginTop: 8, alignSelf: "flex-start" }]} onPress={() => startEdit(svc)}>
                  <Text style={styles.outlineBtnText}>{t("beauty_editPhoto") || "Edit photo"}</Text>
                </Pressable>
              )}
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
  thumb: { width: 48, height: 48, borderRadius: 10, backgroundColor: T.blushSoft },
  thumbEmpty: { borderWidth: StyleSheet.hairlineWidth, borderColor: T.line },
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
