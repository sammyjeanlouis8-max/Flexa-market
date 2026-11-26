import { useLanguage } from "@/context/LanguageContext";
import { useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { WholesaleGate } from "@/components/wholesale/WholesaleGate";
import { WholesaleShell } from "@/components/wholesale/WholesaleShell";
import { useAuth } from "@/context/AuthContext";
import {
  fetchWholesaleProduct,
  patchWholesaleProduct,
  type WholesaleProduct,
} from "@/lib/wholesaleApi";
import { wholesaleTheme as T } from "@/lib/wholesaleTheme";

export default function WholesaleSellerEditScreen() {
  const { t } = useLanguage();
  const { id: idParam } = useLocalSearchParams<{ id: string }>();
  const id = Number(idParam);
  const { token } = useAuth();

  const [product, setProduct] = useState<WholesaleProduct | null>(null);
  const [title, setTitle] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [stockQuantity, setStockQuantity] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !Number.isSafeInteger(id) || id <= 0) {
      setLoading(false);
      setError(t("wholesale_failedLoad"));
      return;
    }
    let alive = true;
    setLoading(true);
    setError(null);
    fetchWholesaleProduct(id, { token })
      .then((p) => {
        if (!alive) return;
        setProduct(p);
        setTitle(p.title);
        setUnitPrice(String(p.unitPrice));
        setStockQuantity(String(p.stockQuantity));
      })
      .catch((e: any) => {
        if (alive) setError(e?.message || t("wholesale_failedLoad"));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [token, id, t]);

  const save = async () => {
    if (!token || !product) return;
    const trimmed = title.trim();
    if (trimmed.length < 3) {
      setNotice("Title must be at least 3 characters.");
      return;
    }
    const price = Number(unitPrice);
    const stock = Math.floor(Number(stockQuantity));
    if (!Number.isFinite(price) || price <= 0) {
      setNotice("Enter a valid unit price.");
      return;
    }
    if (!Number.isFinite(stock) || stock < 0) {
      setNotice("Enter a valid stock quantity.");
      return;
    }
    setSaving(true);
    setNotice(null);
    try {
      const updated = await patchWholesaleProduct(
        id,
        { title: trimmed, unitPrice: price, stockQuantity: stock },
        { token },
      );
      setProduct(updated);
      setTitle(updated.title);
      setUnitPrice(String(updated.unitPrice));
      setStockQuantity(String(updated.stockQuantity));
      setNotice("Changes saved.");
    } catch (e: any) {
      setNotice(e?.message || "Could not save changes.");
    } finally {
      setSaving(false);
    }
  };

  const warehouseName =
    product?.warehouse?.name ?? product?.warehouseName ?? "—";

  return (
    <WholesaleGate>
      <WholesaleShell title={t("wholesale_editTitle")} subtitle={`#${idParam || id}`}>
        {loading ? (
          <ActivityIndicator color={T.accent} />
        ) : error ? (
          <Text style={styles.error}>{error}</Text>
        ) : product ? (
          <View style={styles.card}>
            <Text style={styles.label}>{t("wholesale_formTitle")}</Text>
            <TextInput
              value={title}
              onChangeText={(v) => {
                setTitle(v);
                setNotice(null);
              }}
              style={styles.input}
              maxLength={160}
              editable={!saving}
              testID="wholesale-edit-title"
            />

            <Text style={styles.label}>
              {t("wholesale_unitPrice")} ({product.currency})
            </Text>
            <TextInput
              value={unitPrice}
              onChangeText={(v) => {
                setUnitPrice(v);
                setNotice(null);
              }}
              style={styles.input}
              keyboardType="decimal-pad"
              editable={!saving}
              testID="wholesale-edit-price"
            />

            <Text style={styles.label}>{t("wholesale_stock")}</Text>
            <TextInput
              value={stockQuantity}
              onChangeText={(v) => {
                setStockQuantity(v);
                setNotice(null);
              }}
              style={styles.input}
              keyboardType="number-pad"
              editable={!saving}
              testID="wholesale-edit-stock"
            />

            <Text style={styles.depot}>
              {t("wholesale_depot")} · {warehouseName}
            </Text>

            <Pressable
              style={[styles.save, saving && styles.saveDisabled]}
              onPress={() => void save()}
              disabled={saving}
              testID="wholesale-edit-save"
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
        {notice ? (
          <Text style={styles.notice} accessibilityRole="text">
            {notice}
          </Text>
        ) : null}
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
    gap: 6,
  },
  label: { marginTop: 8, fontSize: 13, fontWeight: "700", color: T.ink },
  input: {
    marginTop: 4,
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
  depot: { marginTop: 12, fontSize: 13, color: T.muted, fontWeight: "600" },
  save: {
    marginTop: 16,
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
