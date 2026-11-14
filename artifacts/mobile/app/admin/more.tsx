import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { FlexaControlShell } from "@/components/admin/FlexaControlShell";
import { useAdminControl } from "@/context/AdminControlContext";
import { MORE_MODULES, type AdminModuleDef } from "@/lib/adminModules";
import { getCanonicalRole, hasMinRole } from "@/lib/adminAccess";
import colors from "@/constants/colors";

function moduleVisible(
  mod: AdminModuleDef,
  role: ReturnType<typeof getCanonicalRole>,
  can: (p: string) => boolean,
  isSuper: boolean,
): boolean {
  if (mod.superAdminOnly && !isSuper) return false;
  if (mod.hideFromModerator && role === "moderator") return false;
  if (mod.hideFromSupport && role === "support") return false;
  if (mod.minRole && !hasMinRole({ role }, mod.minRole)) return false;
  if (mod.perm && !can(mod.perm) && !isSuper) return false;
  return true;
}

export default function AdminMore() {
  const router = useRouter();
  const { role, can, isSuperAdmin, roleLabel, me } = useAdminControl();
  const modules = useMemo(
    () => MORE_MODULES.filter((m) => moduleVisible(m, role, can, isSuperAdmin)),
    [role, can, isSuperAdmin],
  );

  return (
    <FlexaControlShell activeTab="more">
      <ScrollView contentContainerStyle={styles.pad}>
        <Text style={styles.title}>Command Center</Text>
        <Text style={styles.sub}>
          {roleLabel}
          {me?.scopeLevel ? ` · ${me.scopeLevel}` : ""}
        </Text>
        {modules.map((m) => (
          <Pressable
            key={m.slug}
            style={styles.row}
            onPress={() => router.push(m.href as any)}
          >
            <View style={[styles.icon, { backgroundColor: m.color }]}>
              <Feather name={m.icon} size={18} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{m.title}</Text>
              <Text style={styles.desc}>{m.desc}</Text>
            </View>
            <Feather name="chevron-right" size={18} color="#94A3B8" />
          </Pressable>
        ))}
      </ScrollView>
    </FlexaControlShell>
  );
}

const styles = StyleSheet.create({
  pad: { padding: 16, paddingBottom: 40, gap: 8 },
  title: { fontSize: 22, fontWeight: "900", color: "#0F172A" },
  sub: { color: "#64748B", marginBottom: 8 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 12,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  rowTitle: { fontWeight: "800", color: "#0F172A" },
  desc: { fontSize: 11, color: "#64748B", marginTop: 2 },
});
