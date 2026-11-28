import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
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
import { createBeautyBusiness, updateMyBeautyBusiness } from "@/lib/beautyApi";
import { beautyTheme as T } from "@/lib/beautyTheme";

const TYPES = [
  { id: "beauty_studio", labelKey: "beauty_catStudio" },
  { id: "barbershop", labelKey: "beauty_catBarbershop" },
  { id: "independent_beauty", labelKey: "beauty_catIndependent" },
  { id: "independent_barber", labelKey: "beauty_catIndependentBarber" },
  { id: "mobile_beauty", labelKey: "beauty_catMobile" },
  { id: "mobile_barber", labelKey: "beauty_catMobileBarber" },
] as const;

export default function BeautyOnboardingScreen() {
  const { t } = useLanguage();
  const { token, user } = useAuth();
  const router = useRouter();

  const [name, setName] = useState("");
  const [businessType, setBusinessType] = useState("beauty_studio");
  const [description, setDescription] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState(user?.country || "Haiti");
  const [phone, setPhone] = useState("");
  const [logoUrls, setLogoUrls] = useState<string[]>([]);
  const [coverUrls, setCoverUrls] = useState<string[]>([]);
  const [terms, setTerms] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!token) return;
    setError(null);
    if (name.trim().length < 2 || !city.trim() || !country.trim()) {
      setError(t("beauty_onboardingRequired"));
      return;
    }
    if (!terms) {
      setError(t("beauty_termsRequired"));
      return;
    }
    setSubmitting(true);
    try {
      const created = await createBeautyBusiness(
        {
          name: name.trim(),
          businessType,
          description: description.trim(),
          city: city.trim(),
          country: country.trim(),
          phone: phone.trim() || undefined,
          logoUrl: logoUrls[0] || undefined,
          coverUrl: coverUrls[0] || undefined,
          termsAccepted: true,
          onboardingStep: 1,
        },
        { token },
      );
      if (phone.trim() || logoUrls[0] || coverUrls[0]) {
        await updateMyBeautyBusiness(
          created.id,
          {
            phone: phone.trim() || undefined,
            logoUrl: logoUrls[0] || undefined,
            coverUrl: coverUrls[0] || undefined,
          },
          { token },
        ).catch(() => undefined);
      }
      router.replace({ pathname: "/beauty/center", params: { businessId: String(created.id) } } as any);
    } catch (e: any) {
      setError(e?.message || t("beauty_onboardingFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <BeautyShell title={t("beauty_onboardingTitle")} subtitle={t("beauty_onboardingSubtitle")} scroll={false}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 32 }}>
        <Text style={styles.note}>{t("beauty_freeLaunchNote")}</Text>

        <Text style={styles.label}>{t("beauty_businessName")}</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder={t("beauty_businessName")}
          placeholderTextColor={T.muted}
        />

        <Text style={styles.label}>{t("beauty_businessType")}</Text>
        <View style={styles.wrap}>
          {TYPES.map((type) => {
            const active = businessType === type.id;
            return (
              <Pressable
                key={type.id}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => setBusinessType(type.id)}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{t(type.labelKey)}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.label}>{t("beauty_description")}</Text>
        <TextInput
          style={[styles.input, { minHeight: 90, textAlignVertical: "top" }]}
          value={description}
          onChangeText={setDescription}
          multiline
          placeholder={t("beauty_description")}
          placeholderTextColor={T.muted}
        />

        <Text style={styles.label}>{t("beauty_city")}</Text>
        <TextInput
          style={styles.input}
          value={city}
          onChangeText={setCity}
          placeholder={t("beauty_city")}
          placeholderTextColor={T.muted}
        />

        <Text style={styles.label}>{t("beauty_country")}</Text>
        <TextInput
          style={styles.input}
          value={country}
          onChangeText={setCountry}
          placeholder={t("beauty_country")}
          placeholderTextColor={T.muted}
        />

        <Text style={styles.label}>{t("beauty_phone")}</Text>
        <TextInput
          style={styles.input}
          value={phone}
          onChangeText={setPhone}
          placeholder="+509…"
          placeholderTextColor={T.muted}
          keyboardType="phone-pad"
        />

        <NativePhotoField
          token={token}
          value={logoUrls}
          onChange={setLogoUrls}
          max={1}
          allowsEditing
          aspect={[1, 1]}
          label={t("beauty_logo") || "Studio / barbershop logo"}
          testID="beauty-onboarding-logo"
        />
        <NativePhotoField
          token={token}
          value={coverUrls}
          onChange={setCoverUrls}
          max={1}
          allowsEditing
          aspect={[16, 9]}
          label={t("beauty_cover") || "Cover photo"}
          testID="beauty-onboarding-cover"
        />

        <Pressable style={styles.termsRow} onPress={() => setTerms((v) => !v)}>
          <View style={[styles.checkbox, terms && styles.checkboxOn]} />
          <Text style={styles.termsText}>{t("beauty_acceptTerms")}</Text>
        </Pressable>

        {error ? <Text style={styles.err}>{error}</Text> : null}

        <Pressable
          style={[styles.submit, submitting && { opacity: 0.6 }]}
          disabled={submitting}
          onPress={() => void submit()}
        >
          {submitting ? (
            <ActivityIndicator color={T.white} />
          ) : (
            <Text style={styles.submitText}>{t("beauty_createBusiness")}</Text>
          )}
        </Pressable>
      </ScrollView>
    </BeautyShell>
  );
}

const styles = StyleSheet.create({
  note: {
    backgroundColor: "rgba(139,69,87,0.1)",
    borderRadius: 12,
    padding: 10,
    marginBottom: 12,
    color: T.ink,
    fontSize: 12,
    lineHeight: 17,
  },
  label: { fontWeight: "800", color: T.ink, fontSize: 13, marginTop: 12, marginBottom: 8 },
  input: {
    backgroundColor: T.white,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: T.ink,
  },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: T.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  chipActive: { backgroundColor: T.accent, borderColor: T.accent },
  chipText: { color: T.ink, fontWeight: "700", fontSize: 12 },
  chipTextActive: { color: T.white },
  termsRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 16 },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: T.accent,
    backgroundColor: T.white,
  },
  checkboxOn: { backgroundColor: T.accent },
  termsText: { flex: 1, color: T.ink, fontSize: 13, lineHeight: 18 },
  submit: {
    marginTop: 20,
    backgroundColor: T.accent,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  submitText: { color: T.white, fontWeight: "800", fontSize: 15 },
  err: { color: "#b91c1c", marginTop: 12 },
});
