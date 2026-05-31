import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
  Pressable, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApi } from "@/hooks/useApi";
import { useColors } from "@/hooks/useColors";

const STEPS = ["Enfòmasyon", "Veyikil", "Dokiman", "Soumèt"];
const VEHICLE_TYPES = [
  { id: "motorcycle", label: "Moto", icon: "...", emoji: "🏍️" },
  { id: "car", label: "Machin", icon: "...", emoji: "🚗" },
  { id: "bicycle", label: "Bisiklèt", icon: "...", emoji: "🚲" },
  { id: "truck", label: "Kamyon", icon: "...", emoji: "🚛" },
];
const HAITI_CITIES = ["Port-au-Prince","Cap-Haïtien","Pétionville","Delmas","Jacmel","Gonaïves","Les Cayes","Saint-Marc","Croix-des-Bouquets","Carrefour"];

export default function DriverApplyScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { request } = useApi();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [existing, setExisting] = useState<any>(null);
  const [checking, setChecking] = useState(true);

  // Step 1 fields
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");

  // Step 2 fields
  const [vehicleType, setVehicleType] = useState("motorcycle");
  const [vehicleBrand, setVehicleBrand] = useState("");
  const [vehicleModel, setVehicleModel] = useState("");
  const [vehicleColor, setVehicleColor] = useState("");
  const [plateNumber, setPlateNumber] = useState("");

  // Step 3 fields
  const [licensePhoto, setLicensePhoto] = useState("");
  const [vehiclePhoto, setVehiclePhoto] = useState("");
  const [selfiePhoto, setSelfiePhoto] = useState("");

  useEffect(() => {
    request<any>("/delivery/application").then((d) => { if (d) setExisting(d); }).catch(() => {}).finally(() => setChecking(false));
  }, []);

  const pickImage = async (setter: (v: string) => void, label: string) => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") { Alert.alert("Pèmisyon", "Pèmisyon foto obligatwa."); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    if (result.canceled || !result.assets[0]) return;
    try {
      const formData = new FormData();
      formData.append("file", { uri: result.assets[0].uri, name: `${label}.jpg`, type: "image/jpeg" } as any);
      const data = await request<{ objectPath?: string; url?: string }>("/upload", {
        method: "POST", body: formData, headers: { "Content-Type": "multipart/form-data" },
      });
      setter(data?.objectPath ?? data?.url ?? result.assets[0].uri);
    } catch { setter(result.assets[0].uri); }
  };

  const handleSubmit = async () => {
    if (!fullName || !phone || !city || !vehicleType) { Alert.alert("Ranpli tout chan yo"); return; }
    setSubmitting(true);
    try {
      await request("/delivery/apply", {
        method: "POST",
        body: JSON.stringify({
          fullName, phone, city, address,
          vehicleType, vehicleBrand, vehicleModel, vehicleColor, plateNumber,
          licensePhoto, vehiclePhoto, selfiePhoto,
        }),
      });
      Alert.alert("✅ Aplikasyon Soumèt!", "Ekip FlexaMarket ap revize aplikasyon ou nan 24-48h.", [
        { text: "OK", onPress: () => router.back() }
      ]);
    } catch (e: any) {
      Alert.alert("Erè", e?.message ?? "Pa ka soumèt aplikasyon.");
    } finally { setSubmitting(false); }
  };

  if (checking) return <View style={[styles.container, { backgroundColor: colors.background }]}><ActivityIndicator style={{ flex: 1 }} color={colors.primary} /></View>;

  if (existing) {
    const statusColor = existing.status === "approved" ? "#22C55E" : existing.status === "rejected" ? "#EF4444" : "#F59E0B";
    const statusLabel = existing.status === "approved" ? "✅ Apwouve" : existing.status === "rejected" ? "❌ Refize" : "⏳ Annatant";
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: topPad + 10, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}><Feather name="arrow-left" size={22} color={colors.foreground} /></TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Aplikasyon Chofè</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={[styles.centered, { flex: 1 }]}>
          <View style={[styles.statusCard, { backgroundColor: colors.card, borderColor: statusColor }]}>
            <Text style={[styles.statusBig, { color: statusColor }]}>{statusLabel}</Text>
            <Text style={[styles.statusSub, { color: colors.mutedForeground }]}>
              {existing.status === "approved"
                ? "Ou se chofè FM ofisyèl! Telechaje Expo Go pou wè dashboard ou."
                : existing.status === "rejected"
                ? "Aplikasyon ou refize. Korije epi reaplike."
                : "Ekip la ap revize aplikasyon ou. Ou ap resevwa yon notifikasyon."}
            </Text>
            {existing.status === "approved" && (
              <Pressable style={[styles.primaryBtn, { backgroundColor: colors.primary }]} onPress={() => router.push("/driver-dashboard")}>
                <Text style={styles.primaryBtnText}>Ale Dashboard Chofè</Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={[styles.container, { backgroundColor: colors.background }]} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 10, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => step > 0 ? setStep(s => s - 1) : router.back()} style={styles.headerBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Postuler Chofè FM</Text>
        <Text style={[styles.stepCounter, { color: colors.mutedForeground }]}>{step + 1}/{STEPS.length}</Text>
      </View>

      {/* Progress */}
      <View style={[styles.progressBar, { backgroundColor: colors.card }]}>
        {STEPS.map((s, i) => (
          <View key={s} style={[styles.progressStep, { backgroundColor: i <= step ? colors.primary : colors.border }]} />
        ))}
      </View>
      <View style={styles.stepLabels}>
        {STEPS.map((s, i) => (
          <Text key={s} style={[styles.stepLabel, { color: i === step ? colors.primary : colors.mutedForeground }]}>{s}</Text>
        ))}
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 100, gap: 16 }}>
        {step === 0 && (
          <View style={{ gap: 12 }}>
            <Text style={[styles.stepTitle, { color: colors.foreground }]}>📋 Enfòmasyon Pèsonèl</Text>
            {[
              { label: "Non Konplè *", value: fullName, setter: setFullName, placeholder: "Jan Louis..." },
              { label: "Telefòn *", value: phone, setter: setPhone, placeholder: "+509...", keyType: "phone-pad" as any },
              { label: "Adres Konplè", value: address, setter: setAddress, placeholder: "Ri Lamarre, #12..." },
            ].map((f) => (
              <View key={f.label} style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{f.label}</Text>
                <TextInput style={[styles.fieldInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
                  value={f.value} onChangeText={f.setter} placeholder={f.placeholder} placeholderTextColor={colors.mutedForeground} keyboardType={f.keyType} />
              </View>
            ))}
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Vil Operasyon *</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 4 }}>
                <View style={styles.cityRow}>
                  {HAITI_CITIES.map((c) => (
                    <TouchableOpacity key={c} style={[styles.cityChip, { borderColor: city === c ? colors.primary : colors.border, backgroundColor: city === c ? colors.primary + "18" : colors.background }]}
                      onPress={() => setCity(c)}>
                      <Text style={[styles.cityChipText, { color: city === c ? colors.primary : colors.foreground }]}>{c}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </View>
          </View>
        )}

        {step === 1 && (
          <View style={{ gap: 12 }}>
            <Text style={[styles.stepTitle, { color: colors.foreground }]}>🚗 Enfòmasyon Veyikil</Text>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Tip Veyikil *</Text>
            <View style={styles.vehicleGrid}>
              {VEHICLE_TYPES.map((v) => (
                <TouchableOpacity key={v.id} onPress={() => setVehicleType(v.id)}
                  style={[styles.vehicleCard, { borderColor: vehicleType === v.id ? colors.primary : colors.border, backgroundColor: vehicleType === v.id ? colors.primary + "12" : colors.card }]}>
                  <Text style={styles.vehicleEmoji}>{v.emoji}</Text>
                  <Text style={[styles.vehicleLabel, { color: vehicleType === v.id ? colors.primary : colors.foreground }]}>{v.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {[
              { label: "Mak (Brand)", value: vehicleBrand, setter: setVehicleBrand, placeholder: "Honda, Yamaha..." },
              { label: "Modèl", value: vehicleModel, setter: setVehicleModel, placeholder: "CG125, CB300..." },
              { label: "Koulè", value: vehicleColor, setter: setVehicleColor, placeholder: "Blan, Nwa, Wouj..." },
              { label: "Nimewo Plak", value: plateNumber, setter: setPlateNumber, placeholder: "AA-1234..." },
            ].map((f) => (
              <View key={f.label} style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{f.label}</Text>
                <TextInput style={[styles.fieldInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
                  value={f.value} onChangeText={f.setter} placeholder={f.placeholder} placeholderTextColor={colors.mutedForeground} />
              </View>
            ))}
          </View>
        )}

        {step === 2 && (
          <View style={{ gap: 14 }}>
            <Text style={[styles.stepTitle, { color: colors.foreground }]}>📄 Dokiman</Text>
            {[
              { label: "📄 Lisans Konduit", value: licensePhoto, setter: setLicensePhoto, hint: "Foto devan lisans ou" },
              { label: "🚗 Foto Veyikil", value: vehiclePhoto, setter: setVehiclePhoto, hint: "Foto klè devan veyikil ou" },
              { label: "🤳 Selfie", value: selfiePhoto, setter: setSelfiePhoto, hint: "Foto ou tèt nou souri" },
            ].map((doc) => (
              <TouchableOpacity key={doc.label} onPress={() => pickImage(doc.setter, doc.label)}
                style={[styles.docUpload, { borderColor: doc.value ? colors.primary : colors.border, backgroundColor: colors.card }]}>
                {doc.value ? (
                  <Image source={{ uri: doc.value }} style={styles.docPreview} contentFit="cover" />
                ) : (
                  <View style={styles.docEmpty}>
                    <Feather name="upload" size={28} color={colors.mutedForeground} />
                    <Text style={[styles.docLabel, { color: colors.foreground }]}>{doc.label}</Text>
                    <Text style={[styles.docHint, { color: colors.mutedForeground }]}>{doc.hint}</Text>
                  </View>
                )}
                {doc.value && (
                  <View style={[styles.docCheck, { backgroundColor: "#22C55E" }]}>
                    <Feather name="check" size={14} color="#fff" />
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}

        {step === 3 && (
          <View style={{ gap: 14 }}>
            <Text style={[styles.stepTitle, { color: colors.foreground }]}>✅ Revize ak Soumèt</Text>
            <View style={[styles.summaryBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {[
                { label: "Non", val: fullName },
                { label: "Telefòn", val: phone },
                { label: "Vil", val: city },
                { label: "Veyikil", val: `${vehicleType} · ${vehicleBrand} ${vehicleModel}`.trim() },
                { label: "Plak", val: plateNumber || "—" },
              ].map((r) => (
                <View key={r.label} style={styles.summaryRow}>
                  <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>{r.label}</Text>
                  <Text style={[styles.summaryVal, { color: colors.foreground }]}>{r.val || "—"}</Text>
                </View>
              ))}
            </View>
            <View style={[styles.termsBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Feather name="info" size={16} color={colors.primary} />
              <Text style={[styles.termsText, { color: colors.mutedForeground }]}>
                Lè ou soumèt, ou dakò ak règleman chofè FlexaMarket. Komisyon platfòm: 20% pa livrezon.
              </Text>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Bottom nav */}
      <View style={[styles.bottomBar, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: insets.bottom + 16 }]}>
        {step < 3 ? (
          <Pressable style={[styles.nextBtn, { backgroundColor: colors.primary }]}
            onPress={() => setStep(s => s + 1)}>
            <Text style={styles.nextBtnText}>{step === 2 ? "Revize" : "Kontinye"}</Text>
            <Feather name="arrow-right" size={18} color="#fff" />
          </Pressable>
        ) : (
          <Pressable style={[styles.nextBtn, { backgroundColor: "#22C55E", opacity: submitting ? 0.7 : 1 }]}
            onPress={handleSubmit} disabled={submitting}>
            {submitting ? <ActivityIndicator color="#fff" /> : <><Feather name="send" size={18} color="#fff" /><Text style={styles.nextBtnText}>Soumèt Aplikasyon</Text></>}
          </Pressable>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  headerBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  stepCounter: { fontSize: 13, fontFamily: "Inter_500Medium" },
  progressBar: { flexDirection: "row", padding: 16, gap: 6 },
  progressStep: { flex: 1, height: 4, borderRadius: 2 },
  stepLabels: { flexDirection: "row", paddingHorizontal: 16, marginTop: -8, marginBottom: 4 },
  stepLabel: { flex: 1, fontSize: 10, fontFamily: "Inter_500Medium", textAlign: "center" },
  centered: { alignItems: "center", justifyContent: "center", padding: 32 },
  statusCard: { borderRadius: 20, borderWidth: 2, padding: 28, alignItems: "center", gap: 12, width: "100%" },
  statusBig: { fontSize: 26, fontFamily: "Inter_700Bold" },
  statusSub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 22 },
  primaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 12, marginTop: 8 },
  primaryBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" },
  stepTitle: { fontSize: 18, fontFamily: "Inter_700Bold", marginBottom: 4 },
  fieldGroup: { gap: 4 },
  fieldLabel: { fontSize: 12, fontFamily: "Inter_500Medium" },
  fieldInput: { height: 44, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, fontSize: 14, fontFamily: "Inter_400Regular" },
  cityRow: { flexDirection: "row", gap: 8 },
  cityChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  cityChipText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  vehicleGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  vehicleCard: { width: "47%", borderRadius: 14, borderWidth: 2, padding: 16, alignItems: "center", gap: 6 },
  vehicleEmoji: { fontSize: 32 },
  vehicleLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  docUpload: { borderRadius: 14, borderWidth: 2, borderStyle: "dashed", height: 100, alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden" },
  docEmpty: { alignItems: "center", gap: 4 },
  docLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  docHint: { fontSize: 11, fontFamily: "Inter_400Regular" },
  docPreview: { width: "100%", height: "100%" },
  docCheck: { position: "absolute", top: 8, right: 8, width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  summaryBox: { borderRadius: 14, borderWidth: 1, padding: 16, gap: 10 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between" },
  summaryLabel: { fontSize: 13, fontFamily: "Inter_400Regular" },
  summaryVal: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  termsBox: { flexDirection: "row", gap: 10, borderRadius: 12, borderWidth: 1, padding: 14, alignItems: "flex-start" },
  termsText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 18 },
  bottomBar: { padding: 16, borderTopWidth: 1 },
  nextBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, height: 52, borderRadius: 14 },
  nextBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
});
