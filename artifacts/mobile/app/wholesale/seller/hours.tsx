import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLanguage } from "@/context/LanguageContext";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { WholesaleGate } from "@/components/wholesale/WholesaleGate";
import { WholesaleShell } from "@/components/wholesale/WholesaleShell";
import { wholesaleTheme as T } from "@/lib/wholesaleTheme";

const STORAGE_KEY = "@wholesale/depot-hours";

type HoursForm = {
  monFri: string;
  saturday: string;
  sunday: string;
  notes: string;
};

const DEFAULTS: HoursForm = {
  monFri: "8:00–17:00",
  saturday: "9:00–13:00",
  sunday: "Closed",
  notes: "Pickup only after chat confirmation",
};

export default function WholesaleSellerHoursScreen() {
  const { t } = useLanguage();
  const router = useRouter();
  const [form, setForm] = useState<HoursForm>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        setLoading(true);
        try {
          const raw = await AsyncStorage.getItem(STORAGE_KEY);
          if (raw && alive) {
            const parsed = JSON.parse(raw) as Partial<HoursForm>;
            setForm({ ...DEFAULTS, ...parsed });
          }
        } catch {
          // keep defaults
        } finally {
          if (alive) setLoading(false);
        }
      })();
      return () => {
        alive = false;
      };
    }, []),
  );

  const save = async () => {
    setSaving(true);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(form));
      Alert.alert("Saved", "Depot hours saved on this device.");
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Could not save hours");
    } finally {
      setSaving(false);
    }
  };

  return (
    <WholesaleGate>
      <WholesaleShell title={t("wholesale_hoursTitle")} subtitle={t("wholesale_hoursSubtitle")}>
        {loading ? (
          <ActivityIndicator color={T.accent} />
        ) : (
          <View style={styles.form}>
            <Field
              label="Mon–Fri"
              value={form.monFri}
              onChange={(v) => setForm((f) => ({ ...f, monFri: v }))}
            />
            <Field
              label="Saturday"
              value={form.saturday}
              onChange={(v) => setForm((f) => ({ ...f, saturday: v }))}
            />
            <Field
              label="Sunday"
              value={form.sunday}
              onChange={(v) => setForm((f) => ({ ...f, sunday: v }))}
            />
            <Field
              label="Buyer notes"
              value={form.notes}
              onChange={(v) => setForm((f) => ({ ...f, notes: v }))}
            />
            <Text style={styles.hint}>
              Hours are stored locally for now. Buyers still confirm pickup windows in chat.
            </Text>
            <Pressable
              style={[styles.primary, saving && { opacity: 0.7 }]}
              onPress={() => void save()}
              disabled={saving}
              testID="wholesale-hours-save"
            >
              <Text style={styles.primaryText}>{saving ? "Saving…" : "Save hours"}</Text>
            </Pressable>
            <Pressable style={styles.secondary} onPress={() => router.push("/wholesale/seller/warehouse")}>
              <Text style={styles.secondaryText}>Manage depots</Text>
            </Pressable>
          </View>
        )}
      </WholesaleShell>
    </WholesaleGate>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        style={styles.input}
        placeholderTextColor={T.muted}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  form: {
    backgroundColor: T.white,
    borderRadius: 16,
    padding: 16,
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  label: {
    fontSize: 11,
    fontWeight: "800",
    color: T.muted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 6,
  },
  input: {
    height: 44,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
    paddingHorizontal: 12,
    fontSize: 14,
    color: T.ink,
    backgroundColor: T.mintSoft,
  },
  hint: { fontSize: 12, color: T.muted, lineHeight: 17 },
  primary: {
    backgroundColor: T.accent,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  primaryText: { color: T.white, fontWeight: "800", fontSize: 13 },
  secondary: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  secondaryText: { color: T.ink, fontWeight: "800", fontSize: 13 },
});
