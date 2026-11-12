/**
 * Native Edit Profile — PUT /api/users/:id, language, password, avatar upload.
 */
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useLanguage, LANGUAGES, type Lang } from "@/context/LanguageContext";
import {
  changePassword,
  patchPreferredLanguage,
  updateUserProfile,
  uploadAvatarImage,
} from "@/lib/profileApi";
import { pickSystemMedia } from "@/lib/systemMediaPicker";

export default function EditProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, user, refreshUser, login, isLoading: authLoading } = useAuth();
  const { lang, setLang, t } = useLanguage();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");
  const [bio, setBio] = useState("");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwdBusy, setPwdBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!authLoading && !token) {
        router.replace("/auth/login");
      }
    }, [authLoading, token, router]),
  );

  useEffect(() => {
    if (!user) return;
    setName(user.name ?? "");
    setPhone(user.phone ?? "");
    setLocation(user.location ?? user.city ?? "");
    setBio(user.bio ?? "");
    const av = (user as { avatar?: string }).avatar || user.avatarUrl || null;
    setAvatar(av);
  }, [user]);

  const onPickAvatar = async () => {
    if (!token) return;
    const result = await pickSystemMedia({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setUploading(true);
    try {
      const url = await uploadAvatarImage(asset.uri, {
        token,
        contentType: asset.mimeType || "image/jpeg",
        fileName: asset.fileName || "avatar.jpg",
      });
      setAvatar(url);
    } catch (e) {
      Alert.alert("Upload failed", e instanceof Error ? e.message : "Could not upload");
    } finally {
      setUploading(false);
    }
  };

  const onSaveProfile = async () => {
    if (!token || !user) return;
    if (!name.trim() || name.trim().length < 2) {
      Alert.alert("Name required", "Please enter your full name (at least 2 characters).");
      return;
    }
    setSaving(true);
    try {
      await updateUserProfile(
        user.id,
        {
          name: name.trim(),
          phone: phone.trim() || undefined,
          location: location.trim() || undefined,
          bio: bio.trim() || undefined,
          avatar: avatar || undefined,
        },
        { token },
      );
      await refreshUser();
      Alert.alert("Saved", "Your profile was updated.");
    } catch (e) {
      Alert.alert("Save failed", e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  const onChangeLanguage = async (code: Lang) => {
    await setLang(code);
    if (!token) return;
    try {
      await patchPreferredLanguage(code, { token });
      await refreshUser();
    } catch {
      /* local lang still applied */
    }
  };

  const onChangePassword = async () => {
    if (!token) return;
    if (newPassword.length < 6) {
      Alert.alert("Password", "New password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert("Password", "New password and confirmation do not match.");
      return;
    }
    setPwdBusy(true);
    try {
      const result = await changePassword(currentPassword, newPassword, { token });
      if (result.token) await login(result.token);
      else await refreshUser();
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      Alert.alert("Password updated", "Use your new password next time you sign in.");
    } catch (e) {
      Alert.alert("Could not change password", e instanceof Error ? e.message : "Error");
    } finally {
      setPwdBusy(false);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.topBar}>
        <Pressable
          style={styles.back}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
        >
          <Feather name="arrow-left" size={22} color="#0F172A" />
        </Pressable>
        <Text style={styles.title}>{t("sEditProfile") || "Edit Profile"}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable style={styles.avatarWrap} onPress={() => void onPickAvatar()}>
          {avatar ? (
            <Image source={{ uri: avatar }} style={styles.avatar} contentFit="cover" />
          ) : (
            <View style={[styles.avatar, styles.avatarEmpty]}>
              <Feather name="user" size={36} color="#94A3B8" />
            </View>
          )}
          <View style={styles.avatarBadge}>
            {uploading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Feather name="camera" size={14} color="#fff" />
            )}
          </View>
        </Pressable>
        <Text style={styles.hint}>Tap to change profile picture</Text>

        <Text style={styles.section}>Profile information</Text>
        <Field label="Full name" value={name} onChangeText={setName} />
        <Field
          label="Phone"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          autoCapitalize="none"
        />
        <Field
          label="Location / city"
          value={location}
          onChangeText={setLocation}
          placeholder="City or neighborhood"
        />
        <Field
          label="Bio"
          value={bio}
          onChangeText={setBio}
          multiline
          placeholder="Short bio"
        />
        <Text style={styles.meta}>
          Email: {user?.email ?? "—"} (change email on the website if needed)
        </Text>
        <Text style={styles.meta}>
          Country: {user?.country ?? "—"} (account country is set at registration)
        </Text>

        <Pressable
          style={[styles.saveBtn, saving && { opacity: 0.7 }]}
          onPress={() => void onSaveProfile()}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveBtnText}>Save changes</Text>
          )}
        </Pressable>

        <Text style={styles.section}>Language</Text>
        <View style={styles.langGrid}>
          {LANGUAGES.map((l) => (
            <Pressable
              key={l.code}
              style={[styles.langChip, lang === l.code && styles.langChipOn]}
              onPress={() => void onChangeLanguage(l.code)}
            >
              <Text style={styles.langFlag}>{l.flag}</Text>
              <Text style={[styles.langText, lang === l.code && styles.langTextOn]}>
                {l.native}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.section}>Account security</Text>
        <Field
          label="Current password"
          value={currentPassword}
          onChangeText={setCurrentPassword}
          secureTextEntry
          autoCapitalize="none"
        />
        <Field
          label="New password"
          value={newPassword}
          onChangeText={setNewPassword}
          secureTextEntry
          autoCapitalize="none"
        />
        <Field
          label="Confirm new password"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
          autoCapitalize="none"
        />
        <Pressable
          style={[styles.secondaryBtn, pwdBusy && { opacity: 0.7 }]}
          onPress={() => void onChangePassword()}
          disabled={pwdBusy}
        >
          {pwdBusy ? (
            <ActivityIndicator color="#0F172A" />
          ) : (
            <Text style={styles.secondaryBtnText}>Update password</Text>
          )}
        </Pressable>
      </ScrollView>
    </View>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  secureTextEntry?: boolean;
  keyboardType?: "default" | "phone-pad";
  autoCapitalize?: "none" | "sentences" | "words";
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{props.label}</Text>
      <TextInput
        style={[styles.input, props.multiline && styles.inputMulti]}
        value={props.value}
        onChangeText={props.onChangeText}
        placeholder={props.placeholder}
        placeholderTextColor="#94A3B8"
        multiline={props.multiline}
        secureTextEntry={props.secureTextEntry}
        keyboardType={props.keyboardType}
        autoCapitalize={props.autoCapitalize ?? "sentences"}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F8FAFC", paddingHorizontal: 16 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  title: { fontSize: 18, fontWeight: "800", color: "#0F172A" },
  avatarWrap: { alignSelf: "center", marginTop: 8 },
  avatar: { width: 96, height: 96, borderRadius: 48 },
  avatarEmpty: {
    backgroundColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarBadge: {
    position: "absolute",
    right: 2,
    bottom: 2,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#F97316",
    alignItems: "center",
    justifyContent: "center",
  },
  hint: {
    textAlign: "center",
    color: "#94A3B8",
    marginTop: 8,
    marginBottom: 16,
    fontSize: 13,
  },
  section: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0F172A",
    marginTop: 8,
    marginBottom: 10,
  },
  field: { marginBottom: 12 },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#94A3B8",
    marginBottom: 6,
  },
  input: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 14,
    color: "#0F172A",
    fontSize: 15,
  },
  inputMulti: { minHeight: 88, paddingTop: 12, textAlignVertical: "top" },
  meta: { color: "#64748B", fontSize: 13, marginBottom: 4 },
  saveBtn: {
    marginTop: 14,
    height: 52,
    borderRadius: 999,
    backgroundColor: "#F97316",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  saveBtnText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  langGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  langChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
  },
  langChipOn: { borderColor: "#F97316", backgroundColor: "#FFF7ED" },
  langFlag: { fontSize: 16 },
  langText: { fontSize: 12, fontWeight: "700", color: "#64748B" },
  langTextOn: { color: "#C2410C" },
  secondaryBtn: {
    height: 48,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
    marginBottom: 16,
  },
  secondaryBtnText: { fontWeight: "800", color: "#0F172A" },
});
