import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLanguage } from "@/context/LanguageContext";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { WholesaleGate } from "@/components/wholesale/WholesaleGate";
import { WholesaleShell } from "@/components/wholesale/WholesaleShell";
import { useAuth } from "@/context/AuthContext";
import {
  wholesaleSellerSettings,
  type WholesaleSellerSettings,
} from "@/lib/wholesaleApi";
import { wholesaleTheme as T } from "@/lib/wholesaleTheme";

const LOCAL_KEY = "flexa_wholesale_seller_settings";

const DEFAULTS: WholesaleSellerSettings = {
  company: "",
  chatAuto: true,
  showStock: true,
};

export default function WholesaleSellerSettingsScreen() {
  const { t } = useLanguage();
  const { token } = useAuth();
  const [values, setValues] = useState<WholesaleSellerSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [usedLocal, setUsedLocal] = useState(false);

  useEffect(() => {
    if (!token) return;
    let alive = true;
    setLoading(true);
    setError(null);
    wholesaleSellerSettings({ token })
      .then(async (settings) => {
        if (!alive) return;
        setValues(settings);
        setUsedLocal(false);
        await AsyncStorage.setItem(LOCAL_KEY, JSON.stringify(settings)).catch(() => {});
      })
      .catch(async () => {
        if (!alive) return;
        try {
          const raw = await AsyncStorage.getItem(LOCAL_KEY);
          if (raw) {
            const parsed = JSON.parse(raw) as WholesaleSellerSettings;
            setValues({
              company: String(parsed.company ?? ""),
              chatAuto: !!parsed.chatAuto,
              showStock: !!parsed.showStock,
            });
          } else {
            setValues({ ...DEFAULTS });
          }
          setUsedLocal(true);
        } catch {
          if (alive) {
            setValues({ ...DEFAULTS });
            setUsedLocal(true);
          }
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [token]);

  const save = async () => {
    if (!token || !values) return;
    setSaving(true);
    setNotice(null);
    const payload: WholesaleSellerSettings = {
      company: values.company.trim().slice(0, 160),
      chatAuto: values.chatAuto,
      showStock: values.showStock,
    };
    try {
      const saved = await wholesaleSellerSettings({ token }, payload);
      setValues(saved);
      setUsedLocal(false);
      await AsyncStorage.setItem(LOCAL_KEY, JSON.stringify(saved)).catch(() => {});
      setNotice("Changes saved.");
    } catch {
      try {
        await AsyncStorage.setItem(LOCAL_KEY, JSON.stringify(payload));
        setValues(payload);
        setUsedLocal(true);
        setNotice("Saved locally on this device.");
      } catch {
        setNotice("Could not save settings.");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <WholesaleGate>
      <WholesaleShell
        title={t("wholesale_sellerSettingsTitle")}
        subtitle={t("wholesale_sellerSettingsHint")}
      >
        {loading ? (
          <ActivityIndicator color={T.accent} />
        ) : error ? (
          <Text style={styles.error}>{error}</Text>
        ) : values ? (
          <View style={styles.card}>
            <Text style={styles.label}>Company name</Text>
            <TextInput
              value={values.company}
              onChangeText={(company) => {
                setValues((v) => (v ? { ...v, company } : v));
                setNotice(null);
              }}
              style={styles.input}
              maxLength={160}
              editable={!saving}
              placeholder="Your wholesale company"
              placeholderTextColor={T.muted}
              testID="wholesale-settings-company"
            />

            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Auto-reply in chat</Text>
              <Switch
                value={values.chatAuto}
                onValueChange={(chatAuto) => {
                  setValues((v) => (v ? { ...v, chatAuto } : v));
                  setNotice(null);
                }}
                disabled={saving}
                trackColor={{ false: T.line, true: T.accentSoft }}
                thumbColor={values.chatAuto ? T.accent : T.muted}
              />
            </View>

            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Show stock to buyers</Text>
              <Switch
                value={values.showStock}
                onValueChange={(showStock) => {
                  setValues((v) => (v ? { ...v, showStock } : v));
                  setNotice(null);
                }}
                disabled={saving}
                trackColor={{ false: T.line, true: T.accentSoft }}
                thumbColor={values.showStock ? T.accent : T.muted}
              />
            </View>

            {usedLocal ? (
              <Text style={styles.hint}>Using device prefs until the server syncs.</Text>
            ) : null}

            <Pressable
              style={[styles.save, saving && styles.saveDisabled]}
              onPress={() => void save()}
              disabled={saving}
              testID="wholesale-settings-save"
            >
              {saving ? (
                <ActivityIndicator color={T.white} />
              ) : (
                <Text style={styles.saveText}>{t("wholesale_saveChanges")}</Text>
              )}
            </Pressable>
          </View>
        ) : (
          <Text style={styles.error}>{t("wholesale_failedLoad")}</Text>
        )}
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      </WholesaleShell>
    </WholesaleGate>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: T.white,
    borderRadius: 16,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  label: { fontSize: 13, fontWeight: "700", color: T.ink },
  input: {
    marginTop: 6,
    height: 44,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
    backgroundColor: T.mintSoft,
    paddingHorizontal: 12,
    fontSize: 15,
    fontWeight: "600",
    color: T.ink,
  },
  switchRow: {
    marginTop: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  switchLabel: { flex: 1, fontSize: 14, fontWeight: "700", color: T.ink },
  hint: { marginTop: 12, fontSize: 12, color: T.muted },
  save: {
    marginTop: 20,
    height: 44,
    borderRadius: 12,
    backgroundColor: T.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  saveDisabled: { opacity: 0.7 },
  saveText: { color: T.white, fontWeight: "800", fontSize: 15 },
  notice: { marginTop: 12, fontSize: 13, fontWeight: "700", color: T.accent },
  error: { color: T.danger, fontWeight: "700" },
});
