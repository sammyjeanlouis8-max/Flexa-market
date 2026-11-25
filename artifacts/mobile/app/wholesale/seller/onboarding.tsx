import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { WholesaleGate } from "@/components/wholesale/WholesaleGate";
import { WholesaleShell } from "@/components/wholesale/WholesaleShell";
import { useAuth } from "@/context/AuthContext";
import { fetchSellerProfile, fetchWarehouses, patchSellerProfile } from "@/lib/wholesaleApi";
import { wholesaleTheme as T } from "@/lib/wholesaleTheme";

export default function SellerOnboardingScreen() {
  const { token } = useAuth();
  const router = useRouter();
  const [businessName, setBusinessName] = useState("");
  const [bio, setBio] = useState("");
  const [phone, setPhone] = useState("");
  const [warehouseCount, setWarehouseCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [profile, wh] = await Promise.all([
        fetchSellerProfile({ token }),
        fetchWarehouses({ mine: true, limit: 20 }, { token }),
      ]);
      setBusinessName(profile.businessName || "");
      setBio(profile.bio || "");
      setPhone(profile.phone || "");
      setWarehouseCount(wh.length);
    } catch (e: any) {
      setError(e?.message || "Failed to load onboarding");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const complete = async () => {
    if (!token) return;
    if (!businessName.trim()) {
      setError("Business name is required");
      return;
    }
    if (warehouseCount < 1) {
      setError("Add at least one warehouse before finishing onboarding");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await patchSellerProfile(
        { businessName: businessName.trim(), bio: bio.trim(), phone: phone.trim() || null, onboardingComplete: true },
        { token },
      );
      router.replace("/wholesale/seller");
    } catch (e: any) {
      setError(e?.message || "Could not complete onboarding");
    } finally {
      setSaving(false);
    }
  };

  return (
    <WholesaleGate>
      <WholesaleShell title="Seller onboarding" subtitle="Business profile + verified depot required to sell">
        {loading ? (
          <ActivityIndicator color={T.accent} />
        ) : (
          <View style={styles.form}>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Text style={styles.label}>Business name</Text>
            <TextInput style={styles.input} value={businessName} onChangeText={setBusinessName} placeholderTextColor={T.muted} />
            <Text style={styles.label}>Bio</Text>
            <TextInput style={[styles.input, { minHeight: 80 }]} value={bio} onChangeText={setBio} multiline placeholderTextColor={T.muted} />
            <Text style={styles.label}>Phone</Text>
            <TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholderTextColor={T.muted} />
            <Text style={styles.meta}>Warehouses registered: {warehouseCount}</Text>
            <Pressable style={styles.linkBtn} onPress={() => router.push("/wholesale/seller/warehouse")}>
              <Text style={styles.link}>Add / manage warehouse</Text>
            </Pressable>
            <Pressable style={styles.btn} onPress={() => void complete()} disabled={saving}>
              <Text style={styles.btnText}>{saving ? "Saving…" : "Finish onboarding"}</Text>
            </Pressable>
          </View>
        )}
      </WholesaleShell>
    </WholesaleGate>
  );
}

const styles = StyleSheet.create({
  form: { gap: 8 },
  label: { fontSize: 12, fontWeight: "800", color: T.muted, textTransform: "uppercase" },
  input: {
    backgroundColor: T.white,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: T.ink,
  },
  meta: { color: T.muted, marginTop: 4 },
  linkBtn: { marginVertical: 4 },
  link: { color: T.accent, fontWeight: "700" },
  btn: { backgroundColor: T.accent, borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 8 },
  btnText: { color: T.white, fontWeight: "800" },
  error: { color: T.danger, fontWeight: "700" },
});
