/**
 * Native driver application wizard — matches web ApplyForDriver.
 */
import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { friendlyApiError } from "@/i18n/nativeScreens";
import {
  APPLY_BRAND,
  HAITI_COMMUNES_BY_DEPARTMENT,
  HAITI_DEPARTMENTS,
} from "@/lib/haitiCommunes";
import {
  fetchMyDriverApplication,
  saveDriverDraft,
  submitDriverApplication,
  parseWorkZones,
} from "@/lib/driverApi";
import { uploadLocalFile } from "@/lib/mediaUpload";

type WizardStep = 0 | 1 | 2 | 3 | 4 | 5;
type VehicleType = "moto" | "car" | "other" | "";

type FormState = {
  fullName: string;
  dateOfBirth: string;
  phone: string;
  email: string;
  address: string;
  residentialDepartment: string;
  residentialCommune: string;
  vehicleType: VehicleType;
  vehicleBrand: string;
  vehicleModel: string;
  licensePlate: string;
  workDepartment: string;
  workCommunes: string[];
  photoId: string | null;
  photoLicense: string | null;
  photoVehicleDoc: string | null;
  acceptedTerms: boolean;
};

const EMPTY: FormState = {
  fullName: "",
  dateOfBirth: "",
  phone: "",
  email: "",
  address: "",
  residentialDepartment: "",
  residentialCommune: "",
  vehicleType: "",
  vehicleBrand: "",
  vehicleModel: "",
  licensePlate: "",
  workDepartment: "",
  workCommunes: [],
  photoId: null,
  photoLicense: null,
  photoVehicleDoc: null,
  acceptedTerms: false,
};

function splitName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: parts[0] };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("509") && digits.length >= 11) return `+${digits}`;
  if (digits.length === 8) return `+509${digits}`;
  if (raw.trim().startsWith("+")) return raw.trim();
  return digits ? `+509${digits}` : "";
}

function ageFromDob(dob: string): number | null {
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  return (Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000);
}

function StepProgress({ step }: { step: number }) {
  return (
    <View style={styles.progressRow}>
      {[1, 2, 3, 4].map((n) => {
        const done = step > n;
        const current = step === n;
        return (
          <View key={n} style={styles.progressItem}>
            <View
              style={[
                styles.progressDot,
                (done || current) && {
                  backgroundColor: APPLY_BRAND.success,
                  borderColor: APPLY_BRAND.success,
                },
              ]}
            >
              {done ? (
                <Feather name="check" size={14} color="#fff" />
              ) : (
                <Text style={[styles.progressNum, (done || current) && { color: "#fff" }]}>{n}</Text>
              )}
            </View>
            {n < 4 ? (
              <View
                style={[
                  styles.progressLine,
                  step > n && { backgroundColor: APPLY_BRAND.success },
                ]}
              />
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

export default function DriverApplyScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, user, isLoading: authLoading } = useAuth();
  const { t } = useLanguage();
  const [step, setStep] = useState<WizardStep>(0);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [loadingGate, setLoadingGate] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [existingStatus, setExistingStatus] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<{ id: string; at: string; status: string } | null>(
    null,
  );

  useFocusEffect(
    useCallback(() => {
      if (!authLoading && !token) {
        router.replace("/auth/login");
        return;
      }
      if (!token || !user) return;
      let cancelled = false;
      (async () => {
        setLoadingGate(true);
        try {
          const { application, driver } = await fetchMyDriverApplication({ token });
          if (cancelled) return;
          if (driver?.status === "active") {
            router.replace("/driver-dashboard");
            return;
          }
          if (application) {
            setExistingStatus(application.status);
            if (["pending", "approved"].includes(application.status)) {
              setSubmitted({
                id: `DRV-${String(application.id).padStart(10, "0")}`,
                at: application.updatedAt || application.createdAt || new Date().toISOString(),
                status: application.status,
              });
              setStep(5);
              return;
            }
            const zones = parseWorkZones(application.workZones);
            setForm((prev) => ({
              ...prev,
              fullName:
                [application.firstName, application.lastName].filter(Boolean).join(" ") ||
                prev.fullName ||
                user.name ||
                "",
              dateOfBirth: application.dateOfBirth || prev.dateOfBirth,
              phone: application.callPhone || application.whatsappNumber || prev.phone,
              email:
                application.internetProvider?.includes("@")
                  ? application.internetProvider
                  : prev.email || user.email || "",
              address: application.address || prev.address,
              residentialCommune: application.city || prev.residentialCommune,
              vehicleType:
                application.vehicleType === "car"
                  ? "car"
                  : application.vehicleType === "moto"
                    ? "moto"
                    : application.vehicleType
                      ? "other"
                      : prev.vehicleType,
              vehicleBrand: application.vehicleBrand || prev.vehicleBrand,
              vehicleModel: application.vehicleModel || prev.vehicleModel,
              licensePlate: application.licensePlateNumber || prev.licensePlate,
              workCommunes: zones.length ? zones : prev.workCommunes,
              photoId: application.photoIdSelfie || application.facePhotoHoldingId || prev.photoId,
              photoLicense: application.photoLicenseFront || prev.photoLicense,
              photoVehicleDoc: application.photoVehicleRegistration || prev.photoVehicleDoc,
            }));
          } else {
            setForm((prev) => ({
              ...prev,
              fullName: prev.fullName || user.name || "",
              email: prev.email || user.email || "",
              phone: prev.phone || user.phone || "",
            }));
          }
        } catch {
          /* keep empty form */
        } finally {
          if (!cancelled) setLoadingGate(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [authLoading, token, user, router]),
  );

  const payload = useMemo(() => {
    const { firstName, lastName } = splitName(form.fullName);
    const phone = normalizePhone(form.phone);
    const backendVehicle =
      form.vehicleType === "car"
        ? "car"
        : form.vehicleType === "moto"
          ? "moto"
          : form.vehicleType === "other"
            ? "other"
            : null;
    return {
      firstName,
      lastName,
      dateOfBirth: form.dateOfBirth,
      address: form.address || form.residentialCommune,
      city: form.residentialCommune || form.workCommunes[0] || form.residentialDepartment,
      residentialDepartment: form.residentialDepartment,
      whatsappNumber: phone,
      callPhone: phone,
      email: form.email,
      vehicleType: backendVehicle,
      vehicleBrand: form.vehicleBrand || null,
      vehicleModel: form.vehicleModel || null,
      licensePlateNumber: form.licensePlate || null,
      workZones: form.workCommunes,
      photoIdSelfie: form.photoId,
      facePhotoHoldingId: form.photoId,
      photoLicenseFront: form.photoLicense,
      photoVehicleRegistration: form.photoVehicleDoc,
      hasSmartphone: true,
      hasStableInternet: true,
      hasFastPhone: true,
    };
  }, [form]);

  function validateStep(s: WizardStep): string | null {
    if (s === 1) {
      if (!form.fullName.trim()) return t("driver_apply_errName");
      if (!form.dateOfBirth) return t("driver_apply_errDob");
      const age = ageFromDob(form.dateOfBirth);
      if (age == null || age < 18) return t("driver_apply_errAge");
      if (!normalizePhone(form.phone)) return t("driver_apply_errPhone");
      if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return t("driver_apply_errEmail");
      if (!form.residentialDepartment || !form.residentialCommune) {
        return t("driver_apply_errResidence");
      }
    }
    if (s === 2) {
      if (!form.vehicleType) return t("driver_apply_errVehicle");
      if (!form.workDepartment || form.workCommunes.length === 0) {
        return t("driver_apply_errZones");
      }
    }
    if (s === 3) {
      if (!form.photoId) return t("driver_apply_errId");
      if (form.vehicleType === "car" && !form.photoLicense) return t("driver_apply_errLicense");
      if ((form.vehicleType === "moto" || form.vehicleType === "car") && !form.photoVehicleDoc) {
        return t("driver_apply_errVehicleDoc");
      }
    }
    return null;
  }

  async function goNext() {
    const err = validateStep(step);
    if (err) {
      Alert.alert(t("driver_apply_formTitle"), err);
      return;
    }
    if (!token) return;
    setSaving(true);
    try {
      await saveDriverDraft(payload, { token });
    } catch {
      /* draft optional mid-flow */
    } finally {
      setSaving(false);
    }
    if (step === 4) {
      await submit();
      return;
    }
    setStep((s) => (s + 1) as WizardStep);
  }

  async function submit() {
    if (!form.acceptedTerms) {
      Alert.alert(t("driver_apply_termsTitle"), t("driver_apply_acceptTerms"));
      return;
    }
    if (!token) return;
    setSubmitting(true);
    try {
      const data = await submitDriverApplication(payload, { token });
      setSubmitted({
        id: data.applicationId || `DRV-${data.application?.id}`,
        at: data.application?.updatedAt || new Date().toISOString(),
        status: data.application?.status || "pending",
      });
      setStep(5);
    } catch (e) {
      Alert.alert(t("common_error"), friendlyApiError(e instanceof Error ? e.message : undefined, t));
    } finally {
      setSubmitting(false);
    }
  }

  async function pickDoc(key: "photoId" | "photoLicense" | "photoVehicleDoc") {
    if (!token) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(t("common_error"), t("driver_apply_permPhotos"));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.85,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setUploading(key);
    try {
      const uploaded = await uploadLocalFile(asset.uri, {
        token,
        contentType: asset.mimeType || "image/jpeg",
        fileName: asset.fileName || `${key}.jpg`,
      });
      setForm((f) => ({ ...f, [key]: uploaded.url }));
    } catch (e) {
      Alert.alert(t("common_error"), friendlyApiError(e instanceof Error ? e.message : undefined, t));
    } finally {
      setUploading(null);
    }
  }

  if (loadingGate || authLoading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={APPLY_BRAND.success} size="large" />
      </View>
    );
  }

  if (step === 0) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: "#F8FAFC" }}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
      >
        <View style={[styles.hero, { paddingTop: insets.top + 12 }]}>
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
            style={styles.backLight}
          >
            <Feather name="arrow-left" size={20} color="#fff" />
          </Pressable>
          <Text style={styles.heroBrand}>Flexa Market</Text>
          <Text style={styles.heroTitle}>{t("driver_apply_welcomeTitle")}</Text>
        </View>
        <View style={styles.welcomeCard}>
          <Text style={styles.welcomeSub}>{t("driver_apply_welcomeSubtitle")}</Text>
          {[
            { icon: "dollar-sign" as const, text: t("driver_apply_benefitIncome") },
            { icon: "calendar" as const, text: t("driver_apply_benefitFlex") },
            { icon: "map-pin" as const, text: t("driver_apply_benefitLocal") },
          ].map((b) => (
            <View key={b.text} style={styles.benefitRow}>
              <View style={styles.benefitIcon}>
                <Feather name={b.icon} size={16} color={APPLY_BRAND.success} />
              </View>
              <Text style={styles.benefitText}>{b.text}</Text>
            </View>
          ))}
          <Pressable style={styles.primaryBtn} onPress={() => setStep(1)}>
            <Text style={styles.primaryBtnText}>{t("driver_apply_cta")}</Text>
          </Pressable>
          <Text style={styles.disclaimer}>{t("driver_apply_disclaimer")}</Text>
        </View>
      </ScrollView>
    );
  }

  if (step === 5 && submitted) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: "#F8FAFC" }}
        contentContainerStyle={{
          paddingTop: insets.top + 24,
          paddingHorizontal: 16,
          paddingBottom: insets.bottom + 40,
          gap: 16,
        }}
      >
        <View style={styles.successIcon}>
          <Feather name="check" size={36} color={APPLY_BRAND.success} />
        </View>
        <Text style={styles.successTitle}>{t("driver_apply_submittedTitle")}</Text>
        <Text style={styles.successBody}>{t("driver_apply_submittedBody")}</Text>
        <View style={styles.card}>
          <Text style={styles.fieldLabel}>{t("driver_apply_status")}</Text>
          <View style={styles.pendingPill}>
            <Feather name="clock" size={14} color="#92400E" />
            <Text style={styles.pendingText}>
              {submitted.status === "pending" ? t("driver_apply_pending") : submitted.status}
            </Text>
          </View>
          <Text style={styles.refLine}>
            {t("driver_apply_ref")}: <Text style={styles.refId}>{submitted.id}</Text>
          </Text>
        </View>
        <Pressable style={styles.primaryBtn} onPress={() => router.replace("/")}>
          <Feather name="home" size={16} color="#fff" />
          <Text style={styles.primaryBtnText}>{t("driver_apply_backHome")}</Text>
        </Pressable>
      </ScrollView>
    );
  }

  const titles: Record<number, string> = {
    1: t("driver_apply_stepPersonal"),
    2: t("driver_apply_stepTransport"),
    3: t("driver_apply_stepDocs"),
    4: t("driver_apply_stepReview"),
  };

  const residentialCommunes = form.residentialDepartment
    ? HAITI_COMMUNES_BY_DEPARTMENT[form.residentialDepartment] || []
    : [];
  const workCommunesOptions = form.workDepartment
    ? HAITI_COMMUNES_BY_DEPARTMENT[form.workDepartment] || []
    : [];

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.topBar}>
        <Pressable
          onPress={() => setStep((s) => (s <= 1 ? 0 : ((s - 1) as WizardStep)))}
          style={styles.back}
        >
          <Feather name="arrow-left" size={20} color="#0F172A" />
        </Pressable>
        <Text style={styles.topTitle}>{titles[step]}</Text>
      </View>
      <StepProgress step={step} />
      {existingStatus === "needs_changes" ? (
        <Text style={styles.needsChanges}>{t("driver_apply_needsChanges")}</Text>
      ) : null}

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 100, gap: 12 }}
        keyboardShouldPersistTaps="handled"
      >
        {step === 1 ? (
          <>
            <Field
              label={t("driver_apply_fullName")}
              value={form.fullName}
              onChange={(v) => setForm({ ...form, fullName: v })}
              icon="user"
            />
            <Field
              label={t("driver_apply_dob")}
              value={form.dateOfBirth}
              onChange={(v) => setForm({ ...form, dateOfBirth: v })}
              placeholder="1995-01-15"
            />
            <Field
              label={t("driver_apply_phone")}
              value={form.phone}
              onChange={(v) => setForm({ ...form, phone: v })}
              icon="phone"
              placeholder="+509 …"
              keyboardType="phone-pad"
            />
            <Field
              label={t("driver_apply_email")}
              value={form.email}
              onChange={(v) => setForm({ ...form, email: v })}
              icon="mail"
              keyboardType="email-address"
            />
            <Field
              label={t("driver_apply_address")}
              value={form.address}
              onChange={(v) => setForm({ ...form, address: v })}
            />
            <Text style={styles.fieldLabel}>{t("driver_apply_department")}</Text>
            <ChipRow
              options={[...HAITI_DEPARTMENTS]}
              value={form.residentialDepartment}
              onChange={(v) =>
                setForm({ ...form, residentialDepartment: v, residentialCommune: "" })
              }
            />
            <Text style={styles.fieldLabel}>{t("driver_apply_commune")}</Text>
            <ChipRow
              options={residentialCommunes}
              value={form.residentialCommune}
              onChange={(v) => setForm({ ...form, residentialCommune: v })}
            />
          </>
        ) : null}

        {step === 2 ? (
          <>
            <Text style={styles.fieldLabel}>{t("driver_apply_vehicleType")}</Text>
            <View style={styles.vehicleRow}>
              {(
                [
                  { id: "moto", label: "Moto", icon: "navigation" },
                  { id: "car", label: "Car", icon: "truck" },
                  { id: "other", label: "Other", icon: "more-horizontal" },
                ] as const
              ).map((v) => {
                const active = form.vehicleType === v.id;
                return (
                  <Pressable
                    key={v.id}
                    style={[styles.vehicleCard, active && styles.vehicleActive]}
                    onPress={() => setForm({ ...form, vehicleType: v.id })}
                  >
                    <Feather
                      name={v.icon}
                      size={20}
                      color={active ? APPLY_BRAND.success : "#64748B"}
                    />
                    <Text style={[styles.vehicleLabel, active && { color: APPLY_BRAND.success }]}>
                      {v.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Field
              label={t("driver_apply_brand")}
              value={form.vehicleBrand}
              onChange={(v) => setForm({ ...form, vehicleBrand: v })}
            />
            <Field
              label={t("driver_apply_model")}
              value={form.vehicleModel}
              onChange={(v) => setForm({ ...form, vehicleModel: v })}
            />
            <Field
              label={t("driver_apply_plate")}
              value={form.licensePlate}
              onChange={(v) => setForm({ ...form, licensePlate: v })}
              autoCapitalize="characters"
            />
            <Text style={styles.fieldLabel}>{t("driver_apply_workDept")}</Text>
            <ChipRow
              options={[...HAITI_DEPARTMENTS]}
              value={form.workDepartment}
              onChange={(v) => setForm({ ...form, workDepartment: v, workCommunes: [] })}
            />
            <Text style={styles.fieldLabel}>{t("driver_apply_workCommunes")}</Text>
            <View style={styles.communeWrap}>
              {workCommunesOptions.map((c) => {
                const active = form.workCommunes.includes(c);
                return (
                  <Pressable
                    key={c}
                    onPress={() =>
                      setForm({
                        ...form,
                        workCommunes: active
                          ? form.workCommunes.filter((x) => x !== c)
                          : [...form.workCommunes, c],
                      })
                    }
                    style={[styles.chip, active && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, active && { color: "#fff" }]}>{c}</Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : null}

        {step === 3 ? (
          <>
            <DocSlot
              label={t("driver_apply_docId")}
              hint={t("driver_apply_docIdHint")}
              uploadLabel={t("driver_apply_upload")}
              url={form.photoId}
              uploading={uploading === "photoId"}
              onUpload={() => void pickDoc("photoId")}
              onClear={() => setForm({ ...form, photoId: null })}
            />
            <DocSlot
              label={t("driver_apply_docLicense")}
              hint={form.vehicleType === "car" ? t("driver_apply_docLicenseHint") : t("driver_apply_docLicenseOpt")}
              uploadLabel={t("driver_apply_upload")}
              url={form.photoLicense}
              uploading={uploading === "photoLicense"}
              onUpload={() => void pickDoc("photoLicense")}
              onClear={() => setForm({ ...form, photoLicense: null })}
            />
            <DocSlot
              label={t("driver_apply_docVehicle")}
              hint={t("driver_apply_docVehicleHint")}
              uploadLabel={t("driver_apply_upload")}
              url={form.photoVehicleDoc}
              uploading={uploading === "photoVehicleDoc"}
              onUpload={() => void pickDoc("photoVehicleDoc")}
              onClear={() => setForm({ ...form, photoVehicleDoc: null })}
            />
          </>
        ) : null}

        {step === 4 ? (
          <View style={styles.card}>
            <Text style={styles.reviewTitle}>{t("driver_apply_review")}</Text>
            <ReviewLine label={t("driver_apply_fullName")} value={form.fullName} />
            <ReviewLine label={t("driver_apply_phone")} value={normalizePhone(form.phone)} />
            <ReviewLine
              label={t("driver_apply_address")}
              value={`${form.residentialCommune}, ${form.residentialDepartment}`}
            />
            <ReviewLine label={t("driver_apply_vehicleType")} value={form.vehicleType || "—"} />
            <ReviewLine
              label={t("driver_apply_workCommunes")}
              value={`${form.workDepartment}: ${form.workCommunes.join(", ")}`}
            />
            <View style={styles.termsRow}>
              <Switch
                value={form.acceptedTerms}
                onValueChange={(v) => setForm({ ...form, acceptedTerms: v })}
                trackColor={{ true: APPLY_BRAND.success, false: "#CBD5E1" }}
              />
              <Text style={styles.termsText}>{t("driver_apply_terms")}</Text>
            </View>
          </View>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Pressable
          style={[styles.primaryBtn, (saving || submitting) && { opacity: 0.7 }]}
          disabled={saving || submitting}
          onPress={() => void goNext()}
        >
          {saving || submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryBtnText}>
              {step === 4 ? t("driver_apply_submit") : t("driver_apply_continue")}
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

function Field({
  label,
  value,
  onChange,
  icon,
  placeholder,
  keyboardType,
  autoCapitalize,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  icon?: React.ComponentProps<typeof Feather>["name"];
  placeholder?: string;
  keyboardType?: "default" | "email-address" | "phone-pad";
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
}) {
  return (
    <View>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.inputWrap}>
        {icon ? <Feather name={icon} size={16} color="#94A3B8" style={{ marginRight: 8 }} /> : null}
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor="#94A3B8"
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
        />
      </View>
    </View>
  );
}

function ChipRow({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <View style={styles.communeWrap}>
      {options.map((o) => {
        const active = value === o;
        return (
          <Pressable
            key={o}
            onPress={() => onChange(o)}
            style={[styles.chip, active && styles.chipActive]}
          >
            <Text style={[styles.chipText, active && { color: "#fff" }]}>{o}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function DocSlot({
  label,
  hint,
  uploadLabel,
  url,
  uploading,
  onUpload,
  onClear,
}: {
  label: string;
  hint: string;
  uploadLabel: string;
  url: string | null;
  uploading: boolean;
  onUpload: () => void;
  onClear: () => void;
}) {
  return (
    <View style={styles.docCard}>
      <View style={styles.docHeader}>
        <View style={styles.benefitIcon}>
          <Feather name="file-text" size={18} color={APPLY_BRAND.success} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.docTitle}>{label}</Text>
          <Text style={styles.docHint}>{hint}</Text>
        </View>
        {url ? (
          <Pressable onPress={onClear}>
            <Feather name="trash-2" size={18} color="#EF4444" />
          </Pressable>
        ) : null}
      </View>
      {url ? (
        <Image source={{ uri: url }} style={styles.docPreview} contentFit="cover" />
      ) : (
        <Pressable style={styles.docUpload} onPress={onUpload} disabled={uploading}>
          {uploading ? (
            <ActivityIndicator color={APPLY_BRAND.success} />
          ) : (
            <>
              <Feather name="upload" size={22} color="#64748B" />
              <Text style={styles.docUploadText}>{uploadLabel}</Text>
            </>
          )}
        </Pressable>
      )}
    </View>
  );
}

function ReviewLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.reviewLine}>
      <Text style={styles.reviewLabel}>{label}</Text>
      <Text style={styles.reviewValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F8FAFC", paddingHorizontal: 16 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#F8FAFC" },
  hero: {
    backgroundColor: APPLY_BRAND.primary,
    paddingHorizontal: 20,
    paddingBottom: 48,
    minHeight: 200,
  },
  backLight: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  heroBrand: { color: "rgba(255,255,255,0.9)", fontWeight: "800", fontSize: 13 },
  heroTitle: {
    color: "#fff",
    fontSize: 26,
    fontWeight: "900",
    marginTop: 8,
    letterSpacing: -0.4,
  },
  welcomeCard: {
    marginTop: -28,
    marginHorizontal: 16,
    backgroundColor: "#fff",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 20,
    gap: 14,
  },
  welcomeSub: { fontSize: 14, color: "#64748B", lineHeight: 20 },
  benefitRow: { flexDirection: "row", gap: 12, alignItems: "center" },
  benefitIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: APPLY_BRAND.soft,
    alignItems: "center",
    justifyContent: "center",
  },
  benefitText: { flex: 1, fontSize: 14, fontWeight: "600", color: "#0F172A" },
  disclaimer: { fontSize: 11, color: "#94A3B8", textAlign: "center", lineHeight: 16 },
  primaryBtn: {
    height: 48,
    borderRadius: 14,
    backgroundColor: APPLY_BRAND.primary,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  primaryBtnText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  topBar: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
  },
  topTitle: { fontSize: 18, fontWeight: "900", color: "#0F172A" },
  progressRow: { flexDirection: "row", justifyContent: "center", marginVertical: 8 },
  progressItem: { flexDirection: "row", alignItems: "center" },
  progressDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  progressNum: { fontSize: 12, fontWeight: "900", color: "#64748B" },
  progressLine: { width: 24, height: 2, backgroundColor: "#E2E8F0", marginHorizontal: 4 },
  needsChanges: { color: "#B45309", fontSize: 12, marginBottom: 8 },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: "#475569",
    marginBottom: 8,
    marginTop: 8,
    letterSpacing: 0.2,
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#fff",
    paddingHorizontal: 12,
  },
  input: { flex: 1, fontSize: 15, color: "#0F172A" },
  communeWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#fff",
  },
  chipActive: { backgroundColor: APPLY_BRAND.primary, borderColor: APPLY_BRAND.primary },
  chipText: { fontSize: 12, fontWeight: "800", color: "#0F172A" },
  vehicleRow: { flexDirection: "row", gap: 8 },
  vehicleCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "#E2E8F0",
    backgroundColor: "#fff",
    paddingVertical: 14,
    alignItems: "center",
    gap: 6,
  },
  vehicleActive: { borderColor: APPLY_BRAND.success, backgroundColor: APPLY_BRAND.soft },
  vehicleLabel: { fontSize: 13, fontWeight: "800", color: "#64748B" },
  docCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 12,
    gap: 10,
  },
  docHeader: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  docTitle: { fontSize: 14, fontWeight: "800", color: "#0F172A" },
  docHint: { fontSize: 12, color: "#64748B" },
  docPreview: { width: "100%", height: 160, borderRadius: 12 },
  docUpload: {
    height: 120,
    borderRadius: 12,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: "#CBD5E1",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  docUploadText: { fontSize: 13, color: "#64748B", fontWeight: "600" },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 16,
    gap: 10,
  },
  reviewTitle: { fontSize: 16, fontWeight: "900", color: "#0F172A", marginBottom: 4 },
  reviewLine: { gap: 2 },
  reviewLabel: { fontSize: 11, fontWeight: "700", color: "#64748B", textTransform: "uppercase" },
  reviewValue: { fontSize: 14, fontWeight: "700", color: "#0F172A" },
  termsRow: { flexDirection: "row", gap: 12, alignItems: "flex-start", marginTop: 8 },
  termsText: { flex: 1, fontSize: 13, color: "#334155", lineHeight: 18 },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: "rgba(248,250,252,0.96)",
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
  },
  successIcon: {
    alignSelf: "center",
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: APPLY_BRAND.soft,
    alignItems: "center",
    justifyContent: "center",
  },
  successTitle: { fontSize: 24, fontWeight: "900", textAlign: "center", color: "#0F172A" },
  successBody: { fontSize: 14, color: "#64748B", textAlign: "center", lineHeight: 20 },
  pendingPill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#FFFBEB",
    borderColor: "#FDE68A",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  pendingText: { color: "#92400E", fontWeight: "800", fontSize: 13 },
  refLine: { fontSize: 14, color: "#64748B" },
  refId: { fontFamily: "monospace", fontWeight: "800", color: "#0F172A" },
});
