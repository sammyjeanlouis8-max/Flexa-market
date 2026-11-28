import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { MusicShell } from "@/components/music/MusicShell";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { musicTheme } from "@/lib/musicTheme";

export default function MusicProfileScreen() {
  const router = useRouter();
  const { user, token } = useAuth();
  const { t } = useLanguage();

  return (
    <MusicShell showSearch={false}>
      <View style={styles.body}>
        <View style={styles.card}>
          <View style={styles.avatar}>
            <Feather name="user" size={28} color={musicTheme.emerald} />
          </View>
          <Text style={styles.name}>{user?.name || t("music_guest")}</Text>
          <Text style={styles.sub}>
            {token ? t("music_profileSignedIn") : t("music_profileGuest")}
          </Text>
        </View>

        <Pressable style={styles.row} onPress={() => router.push("/music/upload")}>
          <Feather name="upload-cloud" size={20} color={musicTheme.orange} />
          <Text style={styles.rowText}>{t("music_addMusic")}</Text>
          <Feather name="chevron-right" size={18} color={musicTheme.muted} />
        </Pressable>
        <Pressable style={styles.row} onPress={() => router.push("/music/library")}>
          <Feather name="heart" size={20} color={musicTheme.emerald} />
          <Text style={styles.rowText}>{t("music_favorites")}</Text>
          <Feather name="chevron-right" size={18} color={musicTheme.muted} />
        </Pressable>
        <Pressable style={styles.row} onPress={() => router.push("/music/playlists")}>
          <Feather name="list" size={20} color={musicTheme.emerald} />
          <Text style={styles.rowText}>{t("music_chipPlaylists")}</Text>
          <Feather name="chevron-right" size={18} color={musicTheme.muted} />
        </Pressable>
        {!token ? (
          <Pressable style={styles.cta} onPress={() => router.push("/auth/login")}>
            <Text style={styles.ctaText}>{t("music_signIn")}</Text>
          </Pressable>
        ) : null}
      </View>
    </MusicShell>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, padding: 16, gap: 10 },
  card: {
    backgroundColor: musicTheme.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: musicTheme.border,
    padding: 20,
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: musicTheme.secondary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: musicTheme.emerald,
  },
  name: { color: musicTheme.text, fontSize: 18, fontWeight: "800" },
  sub: { color: musicTheme.muted, fontSize: 13, textAlign: "center" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: musicTheme.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: musicTheme.border,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  rowText: { flex: 1, color: musicTheme.text, fontWeight: "700", fontSize: 15 },
  cta: {
    marginTop: 12,
    backgroundColor: musicTheme.orange,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
  },
  ctaText: { color: musicTheme.white, fontWeight: "800" },
});
