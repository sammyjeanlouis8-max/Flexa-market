import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
  Pressable, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApi } from "@/hooks/useApi";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

export default function EditProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { request, getStorageUrl } = useApi();
  const { user, refreshUser } = useAuth();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const [name, setName] = useState(user?.name ?? "");
  const [bio, setBio] = useState(user?.bio ?? "");
  const [location, setLocation] = useState(user?.location ?? "");
  const [avatar, setAvatar] = useState(user?.avatar ?? "");
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [saved, setSaved] = useState(false);

  const [changingPw, setChangingPw] = useState(false);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showPw, setShowPw] = useState(false);

  const avatarUrl = avatar ? getStorageUrl(avatar) : null;

  const profileStrength = (() => {
    let score = 0;
    if (name.trim()) score++;
    if (bio.trim()) score++;
    if (location.trim()) score++;
    if (avatar) score++;
    if (user?.phone) score++;
    if (score >= 5) return { label: "Profil Konplè ✅", color: "#22C55E", pct: 1 };
    if (score >= 3) return { label: "Bon Profil 👍", color: "#F59E0B", pct: score / 5 };
    return { label: "Profil Enkomplet", color: "#EF4444", pct: score / 5 };
  })();

  const pickAvatar = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") { Alert.alert("Pèmisyon", "Pèmisyon galri foto obligatwa."); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true, aspect: [1, 1], quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    if ((asset.fileSize ?? 0) > 10 * 1024 * 1024) { Alert.alert("Foto twò gwo", "Maksimòm 10MB."); return; }
    setUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append("file", { uri: asset.uri, name: "avatar.jpg", type: "image/jpeg" } as any);
      const data = await request<{ objectPath: string; url?: string }>("/storage/upload", {
        method: "POST", body: formData,
        headers: { "Content-Type": "multipart/form-data" },
      });
      if (data?.objectPath) setAvatar(data.objectPath);
      else if (data?.url) setAvatar(data.url);
    } catch (e: any) {
      Alert.alert("Erè Upload", e?.message ?? "Pa ka voye foto.");
    } finally { setUploadingAvatar(false); }
  };

  const saveProfile = async () => {
    if (!name.trim()) { Alert.alert("Non obligatwa"); return; }
    setSaving(true);
    try {
      await request(`/users/${user?.id}`, {
        method: "PUT",
        body: JSON.stringify({ name: name.trim(), bio: bio.trim(), location: location.trim(), avatar }),
      });
      await refreshUser?.();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e: any) {
      Alert.alert("Erè", e?.message ?? "Pa ka sove.");
    } finally { setSaving(false); }
  };

  const changePassword = async () => {
    if (!currentPw || !newPw || !confirmPw) { Alert.alert("Ranpli tout chan yo"); return; }
    if (newPw !== confirmPw) { Alert.alert("Erè", "Nouvo modpas pa matche."); return; }
    if (newPw.length < 8) { Alert.alert("Erè", "Modpas dwe gen omwen 8 karaktè."); return; }
    setChangingPw(true);
    try {
      await request("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
      });
      Alert.alert("✅ Siksè", "Modpas chanje!");
      setCurrentPw(""); setNewPw(""); setConfirmPw("");
    } catch (e: any) {
      Alert.alert("Erè", e?.message ?? "Modpas aktyèl la pa kòrèk.");
    } finally { setChangingPw(false); }
  };

  return (
    <KeyboardAvoidingView style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 10, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Modifye Profil</Text>
        <TouchableOpacity onPress={saveProfile} style={styles.headerBtn} disabled={saving}>
          {saving
            ? <ActivityIndicator color={colors.primary} size="small" />
            : <Text style={[styles.saveText, { color: saved ? "#22C55E" : colors.primary }]}>{saved ? "✅" : "Sove"}</Text>}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32, gap: 20 }}>
        {/* Avatar */}
        <View style={styles.avatarSection}>
          <TouchableOpacity onPress={pickAvatar} style={styles.avatarContainer} disabled={uploadingAvatar}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatarImg} contentFit="cover" />
            ) : (
              <View style={[styles.avatarPlaceholder, { backgroundColor: colors.border }]}>
                <Feather name="user" size={40} color={colors.mutedForeground} />
              </View>
            )}
            <View style={[styles.avatarBadge, { backgroundColor: colors.primary }]}>
              {uploadingAvatar
                ? <ActivityIndicator color="#fff" size="small" />
                : <Feather name="camera" size={16} color="#fff" />}
            </View>
          </TouchableOpacity>
          <Text style={[styles.avatarHint, { color: colors.mutedForeground }]}>Tape pou chanje foto profil</Text>
        </View>

        {/* Profile Strength */}
        <View style={[styles.strengthCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.strengthRow}>
            <Text style={[styles.strengthLabel, { color: colors.foreground }]}>Fòs Profil</Text>
            <Text style={[styles.strengthStatus, { color: profileStrength.color }]}>{profileStrength.label}</Text>
          </View>
          <View style={[styles.strengthBar, { backgroundColor: colors.border }]}>
            <View style={[styles.strengthFill, { backgroundColor: profileStrength.color, width: `${profileStrength.pct * 100}%` as any }]} />
          </View>
        </View>

        {/* Info Fields */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Enfòmasyon Jeneral</Text>
          {[
            { label: "Non Konplè *", value: name, setter: setName, placeholder: "Jan Louis...", multiline: false },
            { label: "Lokalizasyon", value: location, setter: setLocation, placeholder: "Port-au-Prince, Haiti...", multiline: false },
          ].map((f) => (
            <View key={f.label} style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{f.label}</Text>
              <TextInput
                style={[styles.fieldInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
                value={f.value} onChangeText={f.setter} placeholder={f.placeholder}
                placeholderTextColor={colors.mutedForeground}
              />
            </View>
          ))}
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Bio (max 200 karaktè)</Text>
            <TextInput
              style={[styles.bioInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
              value={bio} onChangeText={(v) => setBio(v.slice(0, 200))}
              placeholder="Kèk mo sou ou..." placeholderTextColor={colors.mutedForeground}
              multiline numberOfLines={4} textAlignVertical="top"
            />
            <Text style={[styles.charCount, { color: colors.mutedForeground }]}>{bio.length}/200</Text>
          </View>
        </View>

        {/* Email (read-only) */}
        {user?.email && (
          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Enfòmasyon Kont</Text>
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Imèl</Text>
              <View style={[styles.readonlyField, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <Feather name="mail" size={16} color={colors.mutedForeground} />
                <Text style={[styles.readonlyText, { color: colors.mutedForeground }]}>{user.email}</Text>
                <View style={[styles.verifiedBadge, { backgroundColor: "#22C55E22" }]}>
                  <Text style={{ color: "#22C55E", fontSize: 11, fontFamily: "Inter_600SemiBold" }}>Verifye</Text>
                </View>
              </View>
            </View>
            {user?.phone && (
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Telefòn</Text>
                <View style={[styles.readonlyField, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <Feather name="phone" size={16} color={colors.mutedForeground} />
                  <Text style={[styles.readonlyText, { color: colors.mutedForeground }]}>{user.phone}</Text>
                </View>
              </View>
            )}
          </View>
        )}

        {/* Change Password */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Chanje Modpas</Text>
          {[
            { label: "Modpas Aktyèl", value: currentPw, setter: setCurrentPw },
            { label: "Nouvo Modpas", value: newPw, setter: setNewPw },
            { label: "Konfime Nouvo Modpas", value: confirmPw, setter: setConfirmPw },
          ].map((f) => (
            <View key={f.label} style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{f.label}</Text>
              <View style={styles.pwRow}>
                <TextInput
                  style={[styles.pwInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
                  value={f.value} onChangeText={f.setter}
                  secureTextEntry={!showPw} placeholderTextColor={colors.mutedForeground}
                  placeholder="••••••••"
                />
                <TouchableOpacity onPress={() => setShowPw((s) => !s)} style={styles.pwEye}>
                  <Feather name={showPw ? "eye-off" : "eye"} size={16} color={colors.mutedForeground} />
                </TouchableOpacity>
              </View>
            </View>
          ))}
          <Pressable style={[styles.changePwBtn, { backgroundColor: colors.primary, opacity: changingPw ? 0.7 : 1 }]}
            onPress={changePassword} disabled={changingPw}>
            {changingPw ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.changePwText}>Chanje Modpas</Text>}
          </Pressable>
        </View>

        {/* Save Button */}
        <Pressable style={[styles.saveBtn, { backgroundColor: colors.primary, opacity: saving ? 0.7 : 1 }]}
          onPress={saveProfile} disabled={saving}>
          {saving
            ? <ActivityIndicator color="#fff" />
            : <><Feather name="save" size={18} color="#fff" /><Text style={styles.saveBtnText}>{saved ? "✅ Sove!" : "Sove Chanjman yo"}</Text></>}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  headerBtn: { width: 40, height: 36, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  saveText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  avatarSection: { alignItems: "center", gap: 8 },
  avatarContainer: { position: "relative" },
  avatarImg: { width: 100, height: 100, borderRadius: 50 },
  avatarPlaceholder: { width: 100, height: 100, borderRadius: 50, alignItems: "center", justifyContent: "center" },
  avatarBadge: { position: "absolute", bottom: 2, right: 2, width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  avatarHint: { fontSize: 12, fontFamily: "Inter_400Regular" },
  strengthCard: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 8 },
  strengthRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  strengthLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  strengthStatus: { fontSize: 12, fontFamily: "Inter_500Medium" },
  strengthBar: { height: 6, borderRadius: 3, overflow: "hidden" },
  strengthFill: { height: 6, borderRadius: 3 },
  section: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 12 },
  sectionTitle: { fontSize: 15, fontFamily: "Inter_700Bold", marginBottom: 4 },
  fieldGroup: { gap: 4 },
  fieldLabel: { fontSize: 12, fontFamily: "Inter_500Medium" },
  fieldInput: { height: 44, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, fontSize: 14, fontFamily: "Inter_400Regular" },
  bioInput: { minHeight: 90, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingTop: 10, fontSize: 14, fontFamily: "Inter_400Regular" },
  charCount: { fontSize: 11, fontFamily: "Inter_400Regular", textAlign: "right" },
  readonlyField: { flexDirection: "row", alignItems: "center", gap: 10, height: 44, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12 },
  readonlyText: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular" },
  verifiedBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  pwRow: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 10, overflow: "hidden" },
  pwInput: { flex: 1, height: 44, paddingHorizontal: 12, fontSize: 14, fontFamily: "Inter_400Regular" },
  pwEye: { paddingHorizontal: 12 },
  changePwBtn: { height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  changePwText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  saveBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, height: 52, borderRadius: 14 },
  saveBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
});
