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
  createBeautyPortfolioItem,
  deleteBeautyPortfolioItem,
  fetchMyBeautyBusiness,
} from "@/lib/beautyApi";
import { isHttpsImageUrl } from "@/lib/nativePhotoPicker";
import { beautyTheme as T } from "@/lib/beautyTheme";

type PortfolioItem = {
  id: number;
  title?: string;
  description?: string;
  mediaUrl?: string;
  mediaType?: string;
  status?: string;
};

export default function BeautyCenterPortfolioScreen() {
  const { t } = useLanguage();
  const { token } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ businessId?: string }>();
  const businessId = Number(params.businessId);

  const [items, setItems] = useState<PortfolioItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [photoError, setPhotoError] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!Number.isFinite(businessId) || businessId <= 0) {
      setError(t("beauty_notFound"));
      return;
    }
    setError(null);
    const data = await fetchMyBeautyBusiness(businessId, { token });
    setItems((data.portfolio || []) as PortfolioItem[]);
  }, [businessId, token, t]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load()
        .catch((e: Error) => setError(e.message || t("beauty_loadError")))
        .finally(() => setLoading(false));
    }, [load, t]),
  );

  async function publish() {
    if (!token) return;
    const mediaUrl = photos.find(isHttpsImageUrl);
    if (!mediaUrl) {
      setPhotoError(true);
      setError(t("beauty_portfolioImageRequired") || "At least one portfolio photo is required.");
      return;
    }
    setSaving(true);
    setError(null);
    setPhotoError(false);
    try {
      await createBeautyPortfolioItem(
        businessId,
        {
          title: title.trim() || t("beauty_portfolioDefaultTitle") || "Work sample",
          description: description.trim(),
          mediaType: "photo",
          mediaUrl,
          status: "published",
        },
        { token },
      );
      setTitle("");
      setDescription("");
      setPhotos([]);
      await load();
    } catch (e: any) {
      setError(e?.message || t("beauty_saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function removeItem(id: number) {
    if (!token) return;
    try {
      await deleteBeautyPortfolioItem(businessId, id, { token });
      setItems((prev) => prev.filter((x) => x.id !== id));
    } catch (e: any) {
      setError(e?.message || t("beauty_saveFailed"));
    }
  }

  if (!Number.isFinite(businessId) || businessId <= 0) {
    return (
      <BeautyShell title={t("beauty_portfolio") || "Portfolio"} scroll>
        <Text style={styles.muted}>{t("beauty_notFound")}</Text>
        <Pressable style={styles.btn} onPress={() => router.push("/beauty/center" as any)}>
          <Text style={styles.btnText}>{t("beauty_tabCenter")}</Text>
        </Pressable>
      </BeautyShell>
    );
  }

  return (
    <BeautyShell
      title={t("beauty_portfolio") || "Portfolio"}
      subtitle={t("beauty_portfolioManage") || "Hairstyle & haircut models"}
      scroll={false}
    >
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
          <Text style={styles.label}>{t("beauty_addPortfolio") || "Add model / gallery photo"}</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder={t("beauty_portfolioTitle") || "Title (e.g. Box braids)"}
            placeholderTextColor={T.muted}
          />
          <TextInput
            style={[styles.input, { minHeight: 72 }]}
            value={description}
            onChangeText={setDescription}
            placeholder={t("beauty_portfolioDesc") || "Description"}
            placeholderTextColor={T.muted}
            multiline
          />
          <NativePhotoField
            token={token}
            value={photos}
            onChange={(urls) => {
              setPhotos(urls);
              if (urls.length) setPhotoError(false);
            }}
            max={1}
            allowsEditing
            required
            showError={photoError}
            label={t("beauty_portfolioPhoto") || "Model photo"}
            helpText={t("beauty_portfolioPhotoHelp") || "Required. Gallery or camera."}
            testID="beauty-portfolio-photo"
          />
          <Pressable style={[styles.btn, saving && { opacity: 0.6 }]} disabled={saving} onPress={() => void publish()}>
            {saving ? <ActivityIndicator color={T.white} /> : <Text style={styles.btnText}>{t("beauty_publish") || "Publish"}</Text>}
          </Pressable>
        </View>

        {loading ? (
          <ActivityIndicator color={T.accent} style={{ marginTop: 24 }} />
        ) : error ? (
          <Text style={styles.err}>{error}</Text>
        ) : items.length === 0 ? (
          <Text style={styles.muted}>{t("beauty_noPortfolio") || "No portfolio photos yet."}</Text>
        ) : (
          items.map((item) => (
            <View key={item.id} style={styles.card}>
              {item.mediaUrl ? <Image source={{ uri: item.mediaUrl }} style={styles.media} /> : null}
              <Text style={styles.title}>{item.title || t("beauty_portfolioDefaultTitle") || "Work sample"}</Text>
              {item.description ? <Text style={styles.muted}>{item.description}</Text> : null}
              <Pressable style={styles.outlineBtn} onPress={() => void removeItem(item.id)}>
                <Text style={styles.outlineBtnText}>{t("nativePhoto_remove") || "Remove"}</Text>
              </Pressable>
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
  btn: {
    backgroundColor: T.accent,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
  },
  btnText: { color: T.white, fontWeight: "900" },
  card: {
    backgroundColor: T.white,
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
    gap: 8,
  },
  media: { width: "100%", height: 180, borderRadius: 12, backgroundColor: T.blushSoft },
  title: { fontWeight: "800", color: T.ink },
  muted: { color: T.muted, fontSize: 13 },
  err: { color: "#b91c1c", marginTop: 12 },
  outlineBtn: {
    alignSelf: "flex-start",
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  outlineBtnText: { fontWeight: "800", color: T.ink, fontSize: 12 },
});
