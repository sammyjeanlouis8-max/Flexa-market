/**
 * Reusable native photo field: Gallery / Camera sheet, preview, replace/remove,
 * upload progress, retry. Used by Restaurant + Beauty owner forms.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useLanguage } from "@/context/LanguageContext";
import {
  isHttpsImageUrl,
  presentPhotoSourceMenu,
  uploadPickedPhoto,
  type NativePhotoPickerCopy,
  type NativePickedPhoto,
} from "@/lib/nativePhotoPicker";

export type NativePhotoItem = {
  key: string;
  /** Remote Wasabi/CDN URL once uploaded */
  url?: string | null;
  localUri?: string | null;
  status: "pending" | "uploading" | "done" | "error";
  progress: number;
  error?: string | null;
};

type Props = {
  token: string | null | undefined;
  value: string[];
  onChange: (urls: string[]) => void;
  max?: number;
  required?: boolean;
  showError?: boolean;
  label?: string;
  helpText?: string;
  allowsEditing?: boolean;
  aspect?: [number, number];
  multiple?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function NativePhotoField({
  token,
  value,
  onChange,
  max = 1,
  required = false,
  showError = false,
  label,
  helpText,
  allowsEditing = false,
  aspect,
  multiple = false,
  style,
  testID,
}: Props) {
  const { t } = useLanguage();
  const [items, setItems] = useState<NativePhotoItem[]>(() =>
    (value || []).filter(Boolean).map((url) => ({
      key: uid(),
      url,
      status: "done" as const,
      progress: 100,
    })),
  );
  const aborts = useRef<Map<string, AbortController>>(new Map());

  // Keep previews in sync when the parent loads/clears remote URLs (e.g. settings fetch).
  // Do not clobber in-flight uploads.
  useEffect(() => {
    const remote = (value || []).filter(isHttpsImageUrl);
    const busy = items.some((i) => i.status === "uploading" || i.status === "pending" || i.status === "error");
    if (busy) return;
    const currentDone = items
      .filter((i) => i.status === "done" && isHttpsImageUrl(i.url))
      .map((i) => String(i.url));
    const same =
      remote.length === currentDone.length && remote.every((u, i) => u === currentDone[i]);
    if (same) return;
    setItems(
      remote.map((url) => ({
        key: uid(),
        url,
        status: "done" as const,
        progress: 100,
      })),
    );
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const copy: Partial<NativePhotoPickerCopy> = useMemo(
    () => ({
      title: t("nativePhoto_add") || "Add photo",
      gallery: t("nativePhoto_gallery") || "Choose from Gallery",
      camera: t("nativePhoto_camera") || "Take Photo",
      cancel: t("nativePhoto_cancel") || "Cancel",
      permPhotos: t("nativePhoto_permPhotos") || "Allow photo access to continue.",
      permCamera: t("nativePhoto_permCamera") || "Camera access is required to take a photo.",
    }),
    [t],
  );

  const doneUrls = items
    .filter((i) => i.status === "done" && isHttpsImageUrl(i.url))
    .map((i) => i.url!) as string[];

  const syncUrls = (next: NativePhotoItem[]) => {
    const urls = next
      .filter((i) => i.status === "done" && isHttpsImageUrl(i.url))
      .map((i) => String(i.url));
    // de-dupe
    const unique = Array.from(new Set(urls));
    onChange(unique);
  };

  const uploadOne = async (item: NativePhotoItem, photo: NativePickedPhoto) => {
    if (!token) {
      setItems((prev) =>
        prev.map((x) =>
          x.key === item.key
            ? { ...x, status: "error", error: t("nativePhoto_signIn") || "Sign in required" }
            : x,
        ),
      );
      return;
    }
    const ctrl = new AbortController();
    aborts.current.set(item.key, ctrl);
    setItems((prev) =>
      prev.map((x) =>
        x.key === item.key ? { ...x, status: "uploading", progress: 0, error: null, localUri: photo.localUri } : x,
      ),
    );
    try {
      const uploaded = await uploadPickedPhoto(photo, {
        token,
        signal: ctrl.signal,
        onProgress: (p) => {
          setItems((prev) =>
            prev.map((x) => (x.key === item.key ? { ...x, progress: p.percent } : x)),
          );
        },
      });
      setItems((prev) => {
        const next = prev.map((x) =>
          x.key === item.key
            ? { ...x, status: "done" as const, progress: 100, url: uploaded.url, error: null }
            : x,
        );
        syncUrls(next);
        return next;
      });
    } catch (e: any) {
      if (ctrl.signal.aborted) return;
      setItems((prev) =>
        prev.map((x) =>
          x.key === item.key
            ? {
                ...x,
                status: "error",
                error: e?.message || t("nativePhoto_uploadFailed") || "Upload failed",
              }
            : x,
        ),
      );
    } finally {
      aborts.current.delete(item.key);
    }
  };

  const addPhotos = async () => {
    const remaining = Math.max(0, max - items.length);
    if (remaining <= 0) return;
    const picked = await presentPhotoSourceMenu({
      multiple: multiple || max > 1,
      selectionLimit: remaining,
      allowsEditing: allowsEditing && max === 1,
      aspect,
      copy,
    });
    if (!picked.length) return;

    const fresh: NativePhotoItem[] = picked.map((p) => ({
      key: uid(),
      localUri: p.localUri,
      status: "pending" as const,
      progress: 0,
    }));
    setItems((prev) => [...prev, ...fresh].slice(0, max));
    for (let i = 0; i < picked.length; i++) {
      await uploadOne(fresh[i], picked[i]);
    }
  };

  const removeAt = (key: string) => {
    aborts.current.get(key)?.abort();
    aborts.current.delete(key);
    setItems((prev) => {
      const next = prev.filter((x) => x.key !== key);
      syncUrls(next);
      return next;
    });
  };

  const retry = async (item: NativePhotoItem) => {
    if (!item.localUri) {
      // Re-pick
      const picked = await presentPhotoSourceMenu({
        multiple: false,
        selectionLimit: 1,
        allowsEditing,
        aspect,
        copy,
      });
      if (!picked[0]) return;
      await uploadOne(item, picked[0]);
      return;
    }
    await uploadOne(item, {
      localUri: item.localUri,
      mimeType: "image/jpeg",
      fileName: "retry.jpg",
    });
  };

  const invalid = required && showError && doneUrls.length < 1;
  const busy = items.some((i) => i.status === "uploading" || i.status === "pending");

  return (
    <View style={[styles.wrap, invalid && styles.wrapError, style]} testID={testID}>
      {label ? <Text style={[styles.label, invalid && styles.labelError]}>{label}</Text> : null}
      {helpText ? <Text style={styles.help}>{helpText}</Text> : null}
      {invalid ? (
        <Text style={styles.errorText}>
          {t("nativePhoto_required") || "At least one valid photo is required before publishing."}
        </Text>
      ) : null}

      <View style={styles.row}>
        {items.map((item) => (
          <View key={item.key} style={styles.thumbWrap}>
            <Image
              source={{ uri: item.url || item.localUri || undefined }}
              style={styles.thumb}
              resizeMode="cover"
            />
            {item.status === "uploading" || item.status === "pending" ? (
              <View style={styles.overlay}>
                <ActivityIndicator color="#fff" />
                <Text style={styles.pct}>{Math.round(item.progress)}%</Text>
              </View>
            ) : null}
            {item.status === "error" ? (
              <View style={styles.overlay}>
                <Text style={styles.errMini}>{t("nativePhoto_failed") || "Failed"}</Text>
                <Pressable onPress={() => void retry(item)} style={styles.retryBtn}>
                  <Text style={styles.retryText}>{t("nativePhoto_retry") || "Retry"}</Text>
                </Pressable>
              </View>
            ) : null}
            <Pressable
              style={styles.remove}
              onPress={() => removeAt(item.key)}
              accessibilityLabel={t("nativePhoto_remove") || "Remove"}
            >
              <Text style={styles.removeText}>×</Text>
            </Pressable>
          </View>
        ))}

        {items.length < max ? (
          <Pressable
            style={[styles.addThumb, invalid && styles.addThumbError, busy && { opacity: 0.7 }]}
            onPress={() => void addPhotos()}
            disabled={busy && max === 1}
            testID={testID ? `${testID}-add` : undefined}
          >
            <Text style={styles.addPlus}>＋</Text>
            <Text style={styles.addLabel}>{t("nativePhoto_add") || "Add photo"}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 12,
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: "transparent",
    backgroundColor: "transparent",
  },
  wrapError: {
    borderColor: "#C62828",
    backgroundColor: "rgba(198,40,40,0.06)",
  },
  label: {
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 4,
    color: "#1A1A1A",
  },
  labelError: { color: "#C62828" },
  help: { fontSize: 12, color: "#6B7280", marginBottom: 8 },
  errorText: { fontSize: 12, color: "#C62828", fontWeight: "600", marginBottom: 8 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  thumbWrap: {
    width: 92,
    height: 92,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#E5E7EB",
  },
  thumb: { width: "100%", height: "100%" },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  pct: { color: "#fff", fontSize: 11, fontWeight: "700" },
  errMini: { color: "#fff", fontSize: 11, fontWeight: "700" },
  retryBtn: {
    marginTop: 2,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: "#fff",
  },
  retryText: { fontSize: 11, fontWeight: "800", color: "#111" },
  remove: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(0,0,0,0.65)",
    alignItems: "center",
    justifyContent: "center",
  },
  removeText: { color: "#fff", fontSize: 16, fontWeight: "700", lineHeight: 18 },
  addThumb: {
    width: 92,
    height: 92,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "#9CA3AF",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    backgroundColor: "#F9FAFB",
  },
  addThumbError: { borderColor: "#C62828" },
  addPlus: { fontSize: 22, color: "#374151", fontWeight: "600" },
  addLabel: { fontSize: 10, fontWeight: "700", color: "#4B5563", textAlign: "center", paddingHorizontal: 4 },
});
