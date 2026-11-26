import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { wholesaleTheme as T } from "@/lib/wholesaleTheme";
import { WholesaleGate } from "./WholesaleGate";
import { WholesaleShell } from "./WholesaleShell";

type Item = { title: string; meta: string; href?: string; badge?: string };

/** Shared native list/stat page for wholesale routes. */
export function WholesaleSimplePage({
  title,
  subtitle,
  items = [],
  stats,
  empty,
  emptyBody,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  items?: Item[];
  stats?: { label: string; value: string | number }[];
  empty?: string;
  emptyBody?: string;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  const router = useRouter();
  const showEmpty = items.length === 0 && !children;

  return (
    <WholesaleGate>
      <WholesaleShell title={title} subtitle={subtitle}>
        {stats?.length ? (
          <View style={styles.stats}>
            {stats.map((s) => (
              <View key={s.label} style={styles.stat}>
                <Text style={styles.statLabel}>{s.label}</Text>
                <Text style={styles.statValue}>{s.value}</Text>
              </View>
            ))}
          </View>
        ) : null}
        {children}
        {showEmpty ? (
          <View style={styles.empty}>
            <Feather name="home" size={28} color={T.accent} />
            <Text style={styles.emptyTitle}>{empty || "Nothing here yet"}</Text>
            <Text style={styles.emptyBody}>
              {emptyBody ||
                "Flexa Wholesale is chat-only — negotiate depot pickup with sellers. No Buy Now or cart."}
            </Text>
            {actions ? <View style={styles.actionsWrap}>{actions}</View> : null}
          </View>
        ) : (
          <>
            {items.length > 0 ? (
              <View style={styles.list}>
                {items.map((item, i) => (
                  <Pressable
                    key={`${item.title}-${i}`}
                    style={styles.row}
                    onPress={() => item.href && router.push(item.href as any)}
                    disabled={!item.href}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.rowTitle} numberOfLines={1}>
                        {item.title}
                      </Text>
                      <Text style={styles.rowMeta} numberOfLines={1}>
                        {item.meta}
                      </Text>
                    </View>
                    {item.badge ? (
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>{item.badge}</Text>
                      </View>
                    ) : null}
                  </Pressable>
                ))}
              </View>
            ) : null}
            {actions ? <View style={styles.actionsBelow}>{actions}</View> : null}
          </>
        )}
      </WholesaleShell>
    </WholesaleGate>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 14 },
  stat: {
    flexGrow: 1,
    minWidth: "45%",
    backgroundColor: T.white,
    borderRadius: 14,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: T.muted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  statValue: { marginTop: 4, fontSize: 24, fontWeight: "800", color: T.accent },
  list: { gap: 8 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: T.white,
    borderRadius: 12,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  rowTitle: { fontSize: 14, fontWeight: "700", color: T.ink },
  rowMeta: { marginTop: 2, fontSize: 12, color: T.muted },
  badge: {
    backgroundColor: T.accentSoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeText: { fontSize: 10, fontWeight: "800", color: T.accent, textTransform: "uppercase" },
  empty: {
    alignItems: "center",
    paddingVertical: 36,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: T.line,
    borderRadius: 16,
    backgroundColor: T.white,
  },
  emptyTitle: { marginTop: 10, fontSize: 15, fontWeight: "800", color: T.ink },
  emptyBody: { marginTop: 6, fontSize: 13, color: T.muted, textAlign: "center", lineHeight: 18 },
  actionsWrap: { marginTop: 16, width: "100%", gap: 8 },
  actionsBelow: { marginTop: 16, gap: 8 },
});
