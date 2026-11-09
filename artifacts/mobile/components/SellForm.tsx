import { StateView } from "@/components/StateView";
import { useAuth } from "@/context/AuthContext";
import { useMarketplace } from "@/context/MarketplaceContext";
import { useAndroidBack } from "@/hooks/useAndroidBack";
import { usePhotoPicker } from "@/hooks/usePhotoPicker";
import { apiFetch, resolveMediaUrl } from "@/lib/api";
import { citiesForCountry } from "@/lib/cities";
import { countryFlag } from "@/lib/countries";
import { uploadListingImage, type LocalSellImage } from "@/lib/imageUpload";
import { clearSellDraft, loadSellDraft, saveSellDraft } from "@/lib/sellDraft";
import {
  CONDITIONS,
  CURRENCIES,
  MAX_IMAGES,
  carriersForCountry,
  defaultDeliveryForCountry,
  defaultSellForm,
  validateSellForm,
  type SellFormValues,
} from "@/lib/sellValidation";
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type Props = {
  mode: "create" | "edit";
  listingId?: number;
};

function makeIdempotencyKey(): string {
  return `sell_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function SellForm({ mode, listingId }: Props) {
  const { token, user, isLoading: authLoading } = useAuth();
  const { categories, country } = useMarketplace();
  const { pickImages, takePhoto } = usePhotoPicker();
  useAndroidBack();

  const [form, setForm] = useState<SellFormValues>(defaultSellForm);
  const [images, setImages] = useState<LocalSellImage[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [loadingListing, setLoadingListing] = useState(mode === "edit");
  const [draftNote, setDraftNote] = useState<string | null>(null);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sellerCountry = user?.country || country;
  const cities = useMemo(() => citiesForCountry(sellerCountry), [sellerCountry]);
  const selectedCategory = categories.find((c) => c.id === form.categoryId);
  const subcategories = selectedCategory?.children ?? [];
  const isHaiti = sellerCountry === "Haiti";
  const isDR = sellerCountry === "Dominican Republic";

  const patch = useCallback((partial: Partial<SellFormValues>) => {
    setForm((prev) => ({ ...prev, ...partial }));
  }, []);

  // Restore draft (create only) or load listing for edit.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (mode === "create") {
        const draft = await loadSellDraft();
        if (cancelled || !draft) return;
        setForm(draft.form);
        setImages(
          draft.images.map((img) => ({
            ...img,
            status: img.remoteUrl ? "uploaded" : "pending",
            progress: img.remoteUrl ? 100 : 0,
          })) as LocalSellImage[],
        );
        setDraftNote("Draft restored");
        return;
      }
      if (!token || !listingId) return;
      setLoadingListing(true);
      try {
        const res = await apiFetch(`/listings/${listingId}`, { token, auth: true });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Could not load listing.");
        if (cancelled) return;
        if (!data.isOwner) throw new Error("You can only edit your own listings.");
        const cat = categories.find((c) => c.slug === data.categorySlug);
        const sub = cat?.children?.find((c) => c.slug === data.subcategorySlug);
        setForm({
          ...defaultSellForm(),
          title: data.title || "",
          description: data.description || "",
          price: String(data.price ?? ""),
          currency: (data.currency || "USD") as SellFormValues["currency"],
          categoryId: cat?.id ?? null,
          subcategoryId: sub?.id ?? null,
          condition: (data.condition || "good") as SellFormValues["condition"],
          location: data.location || data.city || "",
          city: data.city || "",
          stockQuantity: data.stockQuantity != null ? String(data.stockQuantity) : "",
          shippingCost: data.shippingCost != null ? String(data.shippingCost) : "",
          shippingCarriers: Array.isArray(data.shippingCarriers) ? data.shippingCarriers : [],
          deliveryMethod: data.deliveryMethod ?? defaultDeliveryForCountry(sellerCountry),
          weightLbs: data.weightLbs != null ? String(data.weightLbs) : "",
          packageLengthIn: data.packageLengthIn != null ? String(data.packageLengthIn) : "",
          packageWidthIn: data.packageWidthIn != null ? String(data.packageWidthIn) : "",
          packageHeightIn: data.packageHeightIn != null ? String(data.packageHeightIn) : "",
          itemSize: data.itemSize || "",
        });
        setImages(
          (Array.isArray(data.images) ? data.images : []).map((url: string, idx: number) => ({
            id: `remote_${idx}_${url}`,
            localUri: resolveMediaUrl(url) || url,
            mimeType: "image/jpeg",
            fileName: `existing-${idx}.jpg`,
            remoteUrl: url,
            status: "uploaded" as const,
            progress: 100,
          })),
        );
      } catch (e: any) {
        if (!cancelled) Alert.alert("Error", e?.message || "Failed to load listing.");
      } finally {
        if (!cancelled) setLoadingListing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, listingId, token, categories, sellerCountry]);

  // Autosave draft on create.
  useEffect(() => {
    if (mode !== "create") return;
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => {
      void saveSellDraft(form, images).then(() => setDraftNote("Draft saved"));
    }, 1200);
    return () => {
      if (draftTimer.current) clearTimeout(draftTimer.current);
    };
  }, [form, images, mode]);

  useEffect(() => {
    if (mode === "create" && isHaiti && !form.deliveryMethod) {
      patch({ deliveryMethod: "motorcycle" });
    }
  }, [mode, isHaiti, form.deliveryMethod, patch]);

  async function addFromPicker() {
    const next = await pickImages(images.length);
    if (next.length) setImages((prev) => [...prev, ...next].slice(0, MAX_IMAGES));
  }

  async function addFromCamera() {
    const next = await takePhoto(images.length);
    if (next.length) setImages((prev) => [...prev, ...next].slice(0, MAX_IMAGES));
  }

  function removeImage(id: string) {
    setImages((prev) => prev.filter((img) => img.id !== id));
  }

  async function ensureUploads(authToken: string): Promise<string[]> {
    const urls: string[] = [];
    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      if (img.remoteUrl) {
        urls.push(img.remoteUrl);
        continue;
      }
      setImages((prev) =>
        prev.map((p) => (p.id === img.id ? { ...p, status: "uploading", progress: 5, error: undefined } : p)),
      );
      try {
        const remoteUrl = await uploadListingImage(img, authToken, (progress) => {
          setImages((prev) =>
            prev.map((p) => (p.id === img.id ? { ...p, status: "uploading", progress } : p)),
          );
        });
        setImages((prev) =>
          prev.map((p) =>
            p.id === img.id ? { ...p, remoteUrl, status: "uploaded", progress: 100 } : p,
          ),
        );
        urls.push(remoteUrl);
      } catch (e: any) {
        const message = e?.message || "Upload failed";
        setImages((prev) =>
          prev.map((p) => (p.id === img.id ? { ...p, status: "error", error: message, progress: 0 } : p)),
        );
        throw new Error(`Photo ${i + 1}: ${message}`);
      }
    }
    return urls;
  }

  async function retryFailedUploads() {
    if (!token) return;
    const failed = images.filter((img) => img.status === "error" && !img.remoteUrl);
    for (const img of failed) {
      try {
        const remoteUrl = await uploadListingImage(img, token, (progress) => {
          setImages((prev) =>
            prev.map((p) => (p.id === img.id ? { ...p, status: "uploading", progress, error: undefined } : p)),
          );
        });
        setImages((prev) =>
          prev.map((p) =>
            p.id === img.id ? { ...p, remoteUrl, status: "uploaded", progress: 100 } : p,
          ),
        );
      } catch (e: any) {
        setImages((prev) =>
          prev.map((p) =>
            p.id === img.id ? { ...p, status: "error", error: e?.message || "Retry failed" } : p,
          ),
        );
      }
    }
  }

  async function onSubmit() {
    if (!token || !user) {
      router.push("/auth/login");
      return;
    }
    setSubmitMessage(null);
    const validation = validateSellForm(form, {
      imageCount: images.length,
      country: user.country || sellerCountry,
      isEdit: mode === "edit",
    });
    setErrors(validation);
    if (Object.keys(validation).length > 0) {
      Alert.alert("Check the form", Object.values(validation)[0] || "Fix validation errors.");
      return;
    }

    setSubmitting(true);
    try {
      const imageUrls = await ensureUploads(token);
      const price = Number(form.price);
      const stockRaw = form.stockQuantity.trim();
      const payload: Record<string, unknown> = {
        title: form.title.trim(),
        description: form.description.trim(),
        price,
        currency: form.currency,
        categoryId: form.categoryId,
        subcategoryId: form.subcategoryId || undefined,
        condition: form.condition,
        location: form.location.trim(),
        city: form.city.trim() || undefined,
        images: imageUrls,
        stockQuantity: stockRaw ? Number(stockRaw) : null,
        itemSize: form.itemSize.trim() || undefined,
      };

      if (isHaiti) {
        payload.deliveryMethod = form.deliveryMethod || "motorcycle";
        payload.shippingCost = null;
        payload.shippingCarriers = [];
      } else if (isDR) {
        payload.deliveryMethod = form.deliveryMethod; // null = carrier, or self_delivery
        if (form.deliveryMethod === "self_delivery") {
          payload.shippingCost = null;
          payload.shippingCarriers = [];
        } else {
          payload.shippingCost = form.shippingCost.trim() ? Number(form.shippingCost) : 0;
          payload.shippingCarriers = form.shippingCarriers.length
            ? form.shippingCarriers
            : carriersForCountry(sellerCountry);
        }
      } else {
        payload.deliveryMethod = null;
        payload.shippingCost = form.shippingCost.trim() ? Number(form.shippingCost) : 0;
        payload.shippingCarriers = form.shippingCarriers.length
          ? form.shippingCarriers
          : carriersForCountry(sellerCountry);
        if (form.weightLbs.trim()) payload.weightLbs = Number(form.weightLbs);
        if (form.packageLengthIn.trim()) payload.packageLengthIn = Number(form.packageLengthIn);
        if (form.packageWidthIn.trim()) payload.packageWidthIn = Number(form.packageWidthIn);
        if (form.packageHeightIn.trim()) payload.packageHeightIn = Number(form.packageHeightIn);
      }

      const idempotencyKey = makeIdempotencyKey();
      const path = mode === "edit" && listingId ? `/listings/${listingId}` : "/listings";
      const method = mode === "edit" ? "PUT" : "POST";
      const res = await apiFetch(path, {
        method,
        token,
        headers: mode === "create" ? { "Idempotency-Key": idempotencyKey } : undefined,
        body: JSON.stringify(
          mode === "create" ? { ...payload, idempotencyKey } : payload,
        ),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Save failed (${res.status})`);
      }

      if (mode === "create") await clearSellDraft();
      const moderation = data.moderationStatus || "pending";
      const msg =
        moderation === "approved"
          ? "Listing published."
          : moderation === "rejected"
            ? `Listing rejected: ${data.moderationReason || data.rejectionCode || "see details"}`
            : "Listing submitted for moderation.";
      setSubmitMessage(msg);
      Alert.alert("Flexa Market", msg, [
        {
          text: "OK",
          onPress: () => {
            if (data.id) router.replace(`/listing/${data.id}`);
            else router.replace("/my-listings");
          },
        },
      ]);
    } catch (e: any) {
      Alert.alert("Could not save listing", e?.message || "Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (authLoading || loadingListing) {
    return (
      <SafeAreaView style={styles.safe}>
        <StateView loading />
      </SafeAreaView>
    );
  }

  if (!token || !user) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.pad}>
          <Text style={styles.brand}>Flexa Market</Text>
          <Text style={styles.title}>Sell</Text>
          <Text style={styles.muted}>Sign in with your seller account to create listings.</Text>
          <Pressable style={styles.primary} onPress={() => router.push("/auth/login")}>
            <Text style={styles.primaryText}>Sign in</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (!user.country) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.pad}>
          <Text style={styles.brand}>Flexa Market</Text>
          <Text style={styles.title}>Country required</Text>
          <Text style={styles.muted}>
            Your account needs a marketplace country before you can publish listings (existing business
            rule).
          </Text>
          <Pressable style={styles.primary} onPress={() => router.push("/country-picker")}>
            <Text style={styles.primaryText}>Set country</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.topBar}>
        <Pressable
          style={styles.iconBtn}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
        >
          <Feather name="arrow-left" size={20} color="#F8FAFC" />
        </Pressable>
        <Text style={styles.brand}>Flexa Market</Text>
        <Pressable style={styles.iconBtn} onPress={() => router.push("/my-listings")}>
          <Feather name="list" size={18} color="#F8FAFC" />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{mode === "edit" ? "Edit listing" : "Sell an item"}</Text>
        <Text style={styles.sub}>
          Seller: {user.name} · {countryFlag(user.country)} {user.country}
          {draftNote && mode === "create" ? ` · ${draftNote}` : ""}
        </Text>

        <Text style={styles.label}>Photos ({images.length}/{MAX_IMAGES})</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photos}>
          {images.map((img) => (
            <View key={img.id} style={styles.photoCard}>
              <Image source={{ uri: img.localUri }} style={styles.photo} contentFit="cover" />
              {img.status === "uploading" ? (
                <View style={styles.photoOverlay}>
                  <ActivityIndicator color="#fff" />
                  <Text style={styles.photoProgress}>{Math.round(img.progress)}%</Text>
                </View>
              ) : null}
              {img.status === "error" ? (
                <View style={styles.photoOverlay}>
                  <Text style={styles.photoError}>Failed</Text>
                </View>
              ) : null}
              <Pressable style={styles.photoRemove} onPress={() => removeImage(img.id)}>
                <Feather name="x" size={14} color="#fff" />
              </Pressable>
            </View>
          ))}
          {images.length < MAX_IMAGES ? (
            <View style={styles.addCol}>
              <Pressable style={styles.addPhoto} onPress={() => void addFromPicker()}>
                <Feather name="image" size={20} color="#F97316" />
                <Text style={styles.addPhotoText}>Gallery</Text>
              </Pressable>
              <Pressable style={styles.addPhoto} onPress={() => void addFromCamera()}>
                <Feather name="camera" size={20} color="#F97316" />
                <Text style={styles.addPhotoText}>Camera</Text>
              </Pressable>
            </View>
          ) : null}
        </ScrollView>
        {errors.images ? <Text style={styles.error}>{errors.images}</Text> : null}
        {images.some((i) => i.status === "error") ? (
          <Pressable onPress={() => void retryFailedUploads()}>
            <Text style={styles.link}>Retry failed uploads</Text>
          </Pressable>
        ) : null}

        <Field label="Title" error={errors.title}>
          <TextInput
            style={styles.input}
            value={form.title}
            onChangeText={(title) => patch({ title })}
            placeholder="What are you selling?"
            placeholderTextColor="#64748B"
          />
        </Field>
        <Field label="Description" error={errors.description}>
          <TextInput
            style={[styles.input, styles.textarea]}
            value={form.description}
            onChangeText={(description) => patch({ description })}
            placeholder="Describe condition, brand, size…"
            placeholderTextColor="#64748B"
            multiline
          />
        </Field>

        <View style={styles.row2}>
          <View style={{ flex: 1 }}>
            <Field label="Price" error={errors.price}>
              <TextInput
                style={styles.input}
                value={form.price}
                onChangeText={(price) => patch({ price })}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor="#64748B"
              />
            </Field>
          </View>
          <View style={{ width: 110 }}>
            <Field label="Currency">
              <View style={styles.chipRow}>
                {CURRENCIES.map((c) => (
                  <Pressable
                    key={c}
                    style={[styles.chip, form.currency === c && styles.chipActive]}
                    onPress={() => patch({ currency: c })}
                  >
                    <Text style={[styles.chipText, form.currency === c && styles.chipTextActive]}>{c}</Text>
                  </Pressable>
                ))}
              </View>
            </Field>
          </View>
        </View>

        <Field label="Condition" error={errors.condition}>
          <View style={styles.chipRow}>
            {CONDITIONS.map((c) => (
              <Pressable
                key={c}
                style={[styles.chip, form.condition === c && styles.chipActive]}
                onPress={() => patch({ condition: c })}
              >
                <Text style={[styles.chipText, form.condition === c && styles.chipTextActive]}>
                  {c.replace("_", " ")}
                </Text>
              </Pressable>
            ))}
          </View>
        </Field>

        <Field label="Category" error={errors.categoryId}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {categories.map((cat) => (
              <Pressable
                key={cat.id}
                style={[styles.chip, form.categoryId === cat.id && styles.chipActive]}
                onPress={() => patch({ categoryId: cat.id, subcategoryId: null })}
              >
                <Text style={[styles.chipText, form.categoryId === cat.id && styles.chipTextActive]}>
                  {cat.icon ? `${cat.icon} ` : ""}
                  {cat.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </Field>

        {subcategories.length > 0 ? (
          <Field label="Subcategory">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              <Pressable
                style={[styles.chip, !form.subcategoryId && styles.chipActive]}
                onPress={() => patch({ subcategoryId: null })}
              >
                <Text style={[styles.chipText, !form.subcategoryId && styles.chipTextActive]}>None</Text>
              </Pressable>
              {subcategories.map((sub) => (
                <Pressable
                  key={sub.id}
                  style={[styles.chip, form.subcategoryId === sub.id && styles.chipActive]}
                  onPress={() => patch({ subcategoryId: sub.id })}
                >
                  <Text style={[styles.chipText, form.subcategoryId === sub.id && styles.chipTextActive]}>
                    {sub.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </Field>
        ) : null}

        <Field label="Location" error={errors.location}>
          <TextInput
            style={styles.input}
            value={form.location}
            onChangeText={(location) => patch({ location })}
            placeholder="Neighborhood / area"
            placeholderTextColor="#64748B"
          />
        </Field>

        {cities.length > 0 ? (
          <Field label="City">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {cities.map((city) => (
                <Pressable
                  key={city}
                  style={[styles.chip, form.city === city && styles.chipActive]}
                  onPress={() => patch({ city, location: form.location || city })}
                >
                  <Text style={[styles.chipText, form.city === city && styles.chipTextActive]}>{city}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </Field>
        ) : null}

        <Field label="Inventory (optional)" error={errors.stockQuantity}>
          <TextInput
            style={styles.input}
            value={form.stockQuantity}
            onChangeText={(stockQuantity) => patch({ stockQuantity })}
            keyboardType="number-pad"
            placeholder="Leave blank for single item"
            placeholderTextColor="#64748B"
          />
        </Field>

        {isHaiti ? (
          <Field label="Local delivery">
            <View style={styles.chipRow}>
              {(["motorcycle", "car", "bus"] as const).map((m) => (
                <Pressable
                  key={m}
                  style={[styles.chip, form.deliveryMethod === m && styles.chipActive]}
                  onPress={() => patch({ deliveryMethod: m })}
                >
                  <Text style={[styles.chipText, form.deliveryMethod === m && styles.chipTextActive]}>{m}</Text>
                </Pressable>
              ))}
            </View>
          </Field>
        ) : null}

        {isDR ? (
          <Field label="Delivery">
            <View style={styles.chipRow}>
              <Pressable
                style={[styles.chip, form.deliveryMethod == null && styles.chipActive]}
                onPress={() => patch({ deliveryMethod: null })}
              >
                <Text style={[styles.chipText, form.deliveryMethod == null && styles.chipTextActive]}>
                  Carrier
                </Text>
              </Pressable>
              <Pressable
                style={[styles.chip, form.deliveryMethod === "self_delivery" && styles.chipActive]}
                onPress={() => patch({ deliveryMethod: "self_delivery" })}
              >
                <Text
                  style={[
                    styles.chipText,
                    form.deliveryMethod === "self_delivery" && styles.chipTextActive,
                  ]}
                >
                  Self delivery
                </Text>
              </Pressable>
            </View>
          </Field>
        ) : null}

        {!isHaiti && form.deliveryMethod !== "self_delivery" ? (
          <>
            <Field label="Shipping cost" error={errors.shippingCost}>
              <TextInput
                style={styles.input}
                value={form.shippingCost}
                onChangeText={(shippingCost) => patch({ shippingCost })}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor="#64748B"
              />
            </Field>
            <Field label="Carriers">
              <View style={styles.chipRow}>
                {carriersForCountry(sellerCountry).map((carrier) => {
                  const active = form.shippingCarriers.includes(carrier);
                  return (
                    <Pressable
                      key={carrier}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() =>
                        patch({
                          shippingCarriers: active
                            ? form.shippingCarriers.filter((c) => c !== carrier)
                            : [...form.shippingCarriers, carrier],
                        })
                      }
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>{carrier}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </Field>
          </>
        ) : null}

        {errors.country ? <Text style={styles.error}>{errors.country}</Text> : null}
        {submitMessage ? <Text style={styles.success}>{submitMessage}</Text> : null}

        <Pressable
          style={[styles.primary, submitting && styles.disabled]}
          disabled={submitting}
          onPress={() => void onSubmit()}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryText}>{mode === "edit" ? "Save changes" : "Submit listing"}</Text>
          )}
        </Pressable>
        <Text style={styles.note}>
          Listings follow existing moderation and eligibility rules. Digital goods / boost purchases stay
          blocked on Android until Play Billing compliance is verified.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0B1220" },
  pad: { padding: 20, gap: 10 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
  },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  brand: { fontSize: 16, fontWeight: "800", color: "#F8FAFC" },
  content: { padding: 16, paddingBottom: 48, gap: 4 },
  title: { fontSize: 22, fontWeight: "800", color: "#F97316" },
  sub: { color: "#94A3B8", marginBottom: 12, fontSize: 13 },
  muted: { color: "#94A3B8", fontSize: 14 },
  field: { marginBottom: 10 },
  label: { color: "#CBD5E1", fontSize: 13, fontWeight: "700", marginBottom: 6 },
  input: {
    backgroundColor: "#0F172A",
    borderWidth: 1,
    borderColor: "#1E293B",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: "#F8FAFC",
    fontSize: 15,
  },
  textarea: { minHeight: 100, textAlignVertical: "top" },
  row2: { flexDirection: "row", gap: 10 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#1E293B",
    backgroundColor: "#0F172A",
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  chipActive: { backgroundColor: "#F97316", borderColor: "#F97316" },
  chipText: { color: "#94A3B8", fontSize: 12, fontWeight: "600", textTransform: "capitalize" },
  chipTextActive: { color: "#fff" },
  photos: { gap: 10, paddingVertical: 4 },
  photoCard: {
    width: 96,
    height: 96,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#1E293B",
  },
  photo: { width: "100%", height: "100%" },
  photoOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  photoProgress: { color: "#fff", fontSize: 11, marginTop: 4 },
  photoError: { color: "#FCA5A5", fontSize: 11, fontWeight: "700" },
  photoRemove: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  addCol: { gap: 8 },
  addPhoto: {
    width: 96,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#334155",
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  addPhotoText: { color: "#F97316", fontSize: 12, fontWeight: "700" },
  error: { color: "#FCA5A5", fontSize: 12, marginTop: 4 },
  success: { color: "#86EFAC", fontSize: 13, marginVertical: 8 },
  link: { color: "#F97316", fontWeight: "700", marginBottom: 8 },
  primary: {
    marginTop: 12,
    backgroundColor: "#F97316",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  primaryText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  disabled: { opacity: 0.65 },
  note: { marginTop: 14, color: "#64748B", fontSize: 12, lineHeight: 18 },
});
