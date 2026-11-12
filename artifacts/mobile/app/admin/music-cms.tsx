/**
 * Flexa Music CMS — artists verify, playlists, storage stats, track bulk via verified APIs.
 * Paid music checkout remains BLOCKED on Android (separate inventory item).
 */
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";
import { AdminShell, adminStyles } from "@/components/AdminShell";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { isSuperAdminUser } from "@/lib/adminRoles";
import {
  connectAdminMusicProvider,
  disconnectAdminMusicProvider,
  fetchAdminMusicArtists,
  fetchAdminMusicPlaylists,
  fetchAdminMusicProviders,
  fetchAdminMusicStorageStats,
  fetchPublicMusicTracks,
  postAdminMusicBulkAction,
  testAdminMusicProvider,
  verifyAdminMusicArtist,
} from "@/lib/phase3mApis";

const MUSIC_PROVIDERS = ["pixabay", "jamendo", "audiomack"] as const;

export default function AdminMusicCmsScreen() {
  const router = useRouter();
  const { token, user, isLoading } = useAuth();
  const { t } = useLanguage();
  const [artists, setArtists] = useState<any[] | null>(null);
  const [playlists, setPlaylists] = useState<any[]>([]);
  const [tracks, setTracks] = useState<any[]>([]);
  const [stats, setStats] = useState<any | null>(null);
  const [providers, setProviders] = useState<Record<string, boolean>>({});
  const [providerKey, setProviderKey] = useState("");
  const [selectedProvider, setSelectedProvider] = useState<string>("pixabay");
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const [a, p, s, tr, pr] = await Promise.all([
        fetchAdminMusicArtists({ token }),
        fetchAdminMusicPlaylists({ token }).catch(() => []),
        fetchAdminMusicStorageStats({ token }).catch(() => null),
        fetchPublicMusicTracks({ q: q.trim() || undefined }).catch(() => []),
        fetchAdminMusicProviders({ token }).catch(() => ({})),
      ]);
      setArtists(a);
      setPlaylists(p);
      setStats(s);
      setTracks(tr);
      setProviders(pr);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("adminLoadErr"));
      setArtists((x) => x ?? []);
    } finally {
      setRefreshing(false);
    }
  }, [token, t, q]);

  useFocusEffect(
    useCallback(() => {
      if (!isLoading && !token) {
        router.replace("/auth/login");
        return;
      }
      if (token && !(user?.isAdmin || isSuperAdminUser(user))) {
        router.replace("/admin");
        return;
      }
      if (token) void load();
    }, [isLoading, token, user, router, load]),
  );

  return (
    <AdminShell
      title={t("adminMusicCms")}
      loading={artists === null && !error}
      error={error}
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        void load();
      }}
    >
      <Text style={adminStyles.cardSub}>{t("adminMusicCmsNote")}</Text>
      {stats ? (
        <View style={adminStyles.card}>
          <Text style={adminStyles.cardTitle}>{t("adminMusicStorage")}</Text>
          <Text style={adminStyles.cardSub}>{JSON.stringify(stats).slice(0, 220)}</Text>
        </View>
      ) : null}

      <Text style={adminStyles.section}>Providers</Text>
      <View style={adminStyles.card}>
        <Text style={adminStyles.cardSub}>
          Connected:{" "}
          {MUSIC_PROVIDERS.map((p) => `${p}=${providers[p] ? "yes" : "no"}`).join(" · ")}
        </Text>
        <View style={[adminStyles.row, { marginTop: 8, flexWrap: "wrap" }]}>
          {MUSIC_PROVIDERS.map((p) => (
            <Pressable
              key={p}
              style={[adminStyles.btnGhost, selectedProvider === p && adminStyles.btn]}
              onPress={() => setSelectedProvider(p)}
            >
              <Text
                style={
                  selectedProvider === p ? adminStyles.btnText : adminStyles.btnGhostText
                }
              >
                {p}
              </Text>
            </Pressable>
          ))}
        </View>
        <TextInput
          style={adminStyles.input}
          value={providerKey}
          onChangeText={setProviderKey}
          placeholder={`${selectedProvider} API key`}
          placeholderTextColor="#94A3B8"
          autoCapitalize="none"
          secureTextEntry
        />
        <View style={[adminStyles.row, { marginTop: 8, flexWrap: "wrap" }]}>
          <Pressable
            style={adminStyles.btn}
            onPress={() => {
              if (!token || !providerKey.trim()) return;
              void connectAdminMusicProvider(
                { provider: selectedProvider, apiKey: providerKey.trim() },
                { token },
              )
                .then(() => {
                  setProviderKey("");
                  return load();
                })
                .catch((e) => Alert.alert(t("adminMusicCms"), e.message));
            }}
          >
            <Text style={adminStyles.btnText}>Connect</Text>
          </Pressable>
          <Pressable
            style={adminStyles.btnGhost}
            onPress={() => {
              if (!token) return;
              void testAdminMusicProvider(
                { provider: selectedProvider, apiKey: providerKey.trim() || undefined },
                { token },
              )
                .then((r) =>
                  Alert.alert(
                    t("adminMusicCms"),
                    r.message || (r.ok ? "Provider OK" : JSON.stringify(r)),
                  ),
                )
                .catch((e) => Alert.alert(t("adminMusicCms"), e.message));
            }}
          >
            <Text style={adminStyles.btnGhostText}>Test</Text>
          </Pressable>
          <Pressable
            style={[adminStyles.btn, adminStyles.danger]}
            onPress={() => {
              if (!token) return;
              void disconnectAdminMusicProvider({ provider: selectedProvider }, { token })
                .then(load)
                .catch((e) => Alert.alert(t("adminMusicCms"), e.message));
            }}
          >
            <Text style={adminStyles.btnText}>Disconnect</Text>
          </Pressable>
        </View>
      </View>

      <Text style={adminStyles.section}>{t("adminMusicArtists")}</Text>
      {(artists ?? []).slice(0, 40).map((a, idx) => (
        <View key={`${a.name}-${a.user_id ?? idx}`} style={adminStyles.card}>
          <Text style={adminStyles.cardTitle}>{a.name || a.user_name || "Artist"}</Text>
          <Text style={adminStyles.cardSub}>
            tracks={a.track_count ?? "—"} · plays={a.total_plays ?? "—"} ·{" "}
            {a.is_verified ? "verified" : "unverified"}
          </Text>
          <Pressable
            style={[adminStyles.btn, { marginTop: 8, alignSelf: "flex-start" }]}
            onPress={() =>
              token &&
              a.name &&
              void verifyAdminMusicArtist(
                { artist: a.name, is_verified: !a.is_verified },
                { token },
              )
                .then(load)
                .catch((e) => Alert.alert(t("adminMusicCms"), e.message))
            }
          >
            <Text style={adminStyles.btnText}>
              {a.is_verified ? t("adminMusicUnverify") : t("adminMusicVerify")}
            </Text>
          </Pressable>
        </View>
      ))}

      <Text style={adminStyles.section}>{t("adminMusicPlaylists")}</Text>
      {playlists.slice(0, 20).map((pl) => (
        <View key={pl.id} style={adminStyles.card}>
          <Text style={adminStyles.cardTitle}>{pl.title || pl.name || `Playlist #${pl.id}`}</Text>
          <Text style={adminStyles.cardSub}>{pl.description || ""}</Text>
        </View>
      ))}

      <Text style={adminStyles.section}>{t("adminMusicTracks")}</Text>
      <TextInput
        style={adminStyles.search}
        value={q}
        onChangeText={setQ}
        placeholder={t("search")}
        placeholderTextColor="#94A3B8"
        onSubmitEditing={() => void load()}
      />
      {tracks.slice(0, 30).map((tr) => (
        <View key={tr.id} style={adminStyles.card}>
          <Text style={adminStyles.cardTitle}>{tr.title || `Track #${tr.id}`}</Text>
          <Text style={adminStyles.cardSub}>
            {tr.artist || "—"} · {tr.is_active === false ? "inactive" : "active"}
            {tr.is_featured ? " · featured" : ""}
          </Text>
          <View style={[adminStyles.row, { marginTop: 8, flexWrap: "wrap" }]}>
            {(["approve", "reject", "feature", "unfeature"] as const).map((action) => (
              <Pressable
                key={action}
                style={adminStyles.btnGhost}
                onPress={() =>
                  token &&
                  void postAdminMusicBulkAction({ action, ids: [tr.id] }, { token })
                    .then(load)
                    .catch((e) => Alert.alert(t("adminMusicCms"), e.message))
                }
              >
                <Text style={adminStyles.btnGhostText}>{action}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ))}
      {artists?.length === 0 && tracks.length === 0 ? (
        <Text style={adminStyles.empty}>{t("adminEmpty")}</Text>
      ) : null}
    </AdminShell>
  );
}
