/**
 * Flexa TV CMS — programs list + live broadcast controls via verified /admin/tv/* APIs.
 */
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";
import { AdminShell, adminStyles } from "@/components/AdminShell";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { canAccessAdminCenter, isSuperAdminUser } from "@/lib/adminRoles";
import {
  createAdminTvProgram,
  deleteAdminTvProgram,
  fetchAdminTvPrograms,
  fetchAdminTvViewers,
  postAdminTvBroadcast,
} from "@/lib/phase3mApis";

export default function AdminTvCmsScreen() {
  const router = useRouter();
  const { token, user, isLoading } = useAuth();
  const { t } = useLanguage();
  const [programs, setPrograms] = useState<any[] | null>(null);
  const [viewers, setViewers] = useState<any | null>(null);
  const [title, setTitle] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const [progs, v] = await Promise.all([
        fetchAdminTvPrograms({ token }),
        fetchAdminTvViewers({ token }).catch(() => null),
      ]);
      setPrograms(progs);
      setViewers(v);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("adminLoadErr"));
      setPrograms((p) => p ?? []);
    } finally {
      setRefreshing(false);
    }
  }, [token, t]);

  useFocusEffect(
    useCallback(() => {
      if (!isLoading && !token) {
        router.replace("/auth/login");
        return;
      }
      if (token && !canAccessAdminCenter(user) && !user?.isAdmin && !isSuperAdminUser(user)) {
        router.replace("/admin");
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
      title={t("adminTvCms")}
      loading={programs === null && !error}
      error={error}
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        void load();
      }}
    >
      <Text style={adminStyles.cardSub}>{t("adminTvCmsNote")}</Text>
      <View style={adminStyles.card}>
        <Text style={adminStyles.cardTitle}>
          {t("adminTvBroadcast")}: {viewers?.state ?? "—"} · viewers={viewers?.viewerCount ?? "—"}
        </Text>
        <View style={[adminStyles.row, { marginTop: 8, flexWrap: "wrap" }]}>
          <Pressable
            style={adminStyles.btnGhost}
            onPress={() => token && void postAdminTvBroadcast("pause", { token }).then(load)}
          >
            <Text style={adminStyles.btnGhostText}>Pause</Text>
          </Pressable>
          <Pressable
            style={adminStyles.btnGhost}
            onPress={() => token && void postAdminTvBroadcast("stop", { token }).then(load)}
          >
            <Text style={adminStyles.btnGhostText}>Stop</Text>
          </Pressable>
        </View>
      </View>

      <View style={adminStyles.card}>
        <Text style={adminStyles.cardTitle}>{t("adminTvAddProgram")}</Text>
        <TextInput
          style={adminStyles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="Title"
          placeholderTextColor="#94A3B8"
        />
        <TextInput
          style={adminStyles.input}
          value={videoUrl}
          onChangeText={setVideoUrl}
          placeholder="https://… video URL"
          placeholderTextColor="#94A3B8"
          autoCapitalize="none"
        />
        <Pressable
          style={[adminStyles.btn, { marginTop: 8, alignSelf: "flex-start" }]}
          onPress={() => {
            if (!token || !title.trim() || !videoUrl.trim()) return;
            void createAdminTvProgram(
              { title: title.trim(), videoUrl: videoUrl.trim(), isActive: true },
              { token },
            )
              .then(() => {
                setTitle("");
                setVideoUrl("");
                return load();
              })
              .catch((e) => Alert.alert(t("adminTvCms"), e.message));
          }}
        >
          <Text style={adminStyles.btnText}>{t("save")}</Text>
        </Pressable>
      </View>

      {(programs ?? []).map((p) => (
        <View key={p.id} style={adminStyles.card}>
          <Text style={adminStyles.cardTitle}>{p.title || `Program #${p.id}`}</Text>
          <Text style={adminStyles.cardSub} numberOfLines={2}>
            {[p.category, p.videoUrl || p.videoKey, p.isActive === false ? "inactive" : "active"]
              .filter(Boolean)
              .join(" · ")}
          </Text>
          <View style={[adminStyles.row, { marginTop: 8, flexWrap: "wrap" }]}>
            <Pressable
              style={adminStyles.btn}
              onPress={() =>
                token &&
                void postAdminTvBroadcast("play", { token, programId: p.id })
                  .then(load)
                  .catch((e) => Alert.alert(t("adminTvCms"), e.message))
              }
            >
              <Text style={adminStyles.btnText}>Play</Text>
            </Pressable>
            <Pressable
              style={[adminStyles.btn, adminStyles.danger]}
              onPress={() =>
                token &&
                Alert.alert(t("adminTvCms"), t("adminTvDeleteConfirm"), [
                  { text: t("cancel"), style: "cancel" },
                  {
                    text: t("ok"),
                    style: "destructive",
                    onPress: () =>
                      void deleteAdminTvProgram(p.id, { token })
                        .then(load)
                        .catch((e) => Alert.alert(t("adminTvCms"), e.message)),
                  },
                ])
              }
            >
              <Text style={adminStyles.btnText}>Delete</Text>
            </Pressable>
          </View>
        </View>
      ))}
      {programs?.length === 0 ? <Text style={adminStyles.empty}>{t("adminEmpty")}</Text> : null}
    </AdminShell>
  );
}
