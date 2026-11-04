import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { NativeScreen } from "@/components/NativeScreen";
import { SignInGate } from "@/components/SignInGate";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { apiFetch } from "@/lib/apiFetch";

export default function EditProfileScreen() {
  const colors = useColors();
  const { token, user, refreshUser } = useAuth();
  const [name, setName] = useState(user?.name ?? "");
  const [bio, setBio] = useState(user?.bio ?? "");
  const [city, setCity] = useState(user?.city ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setName(user?.name ?? "");
    setBio(user?.bio ?? "");
    setCity(user?.city ?? "");
  }, [user]);

  if (!token) {
    return (
      <NativeScreen title="Edit profile" subtitle="Update your public seller profile.">
        <SignInGate message="Sign in to edit your profile." />
      </NativeScreen>
    );
  }

  const save = async () => {
    if (!user?.id) {
      setMessage("Missing user id.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await apiFetch(`/users/${user.id}`, {
        token,
        method: "PUT",
        body: { name: name.trim(), bio, city },
      });
      await refreshUser();
      setMessage("Profile saved.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not save profile");
    } finally {
      setBusy(false);
    }
  };

  return (
    <NativeScreen title="Edit profile" subtitle="Native profile editor using the existing user APIs.">
      <View style={{ gap: 10 }}>
        <Text style={{ color: colors.mutedForeground }}>Name</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          style={[styles.input, { borderColor: colors.border, color: colors.foreground }]}
        />
        <Text style={{ color: colors.mutedForeground }}>City</Text>
        <TextInput
          value={city}
          onChangeText={setCity}
          style={[styles.input, { borderColor: colors.border, color: colors.foreground }]}
        />
        <Text style={{ color: colors.mutedForeground }}>Bio</Text>
        <TextInput
          value={bio}
          onChangeText={setBio}
          multiline
          style={[
            styles.input,
            styles.bio,
            { borderColor: colors.border, color: colors.foreground },
          ]}
        />
        <Pressable
          disabled={busy}
          onPress={() => void save()}
          style={[styles.cta, { backgroundColor: colors.primary, opacity: busy ? 0.6 : 1 }]}
        >
          {busy ? (
            <ActivityIndicator color="#0F172A" />
          ) : (
            <Text style={styles.ctaText}>Save</Text>
          )}
        </Pressable>
        {message ? <Text style={{ color: colors.foreground }}>{message}</Text> : null}
      </View>
    </NativeScreen>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
  },
  bio: { minHeight: 100, textAlignVertical: "top" },
  cta: {
    marginTop: 8,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  ctaText: { color: "#0F172A", fontWeight: "700" },
});
