import { useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { WholesaleGate } from "@/components/wholesale/WholesaleGate";
import { WholesaleShell } from "@/components/wholesale/WholesaleShell";
import { useAuth } from "@/context/AuthContext";
import { fetchSellerProfile, patchSellerProfile } from "@/lib/wholesaleApi";
import { wholesaleTheme as T } from "@/lib/wholesaleTheme";

export default function SellerProfileScreen() {
  const { token } = useAuth();
  const [businessName, setBusinessName] = useState("");
  const [bio, setBio] = useState("");
  const [phone, setPhone] = useState("");
  const [website, setWebsite] = useState("");
  const [status, setStatus] = useState("");
  const [plan, setPlan] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const p = await fetchSellerProfile({ token });
      setBusinessName(p.businessName || "");
      setBio(p.bio || "");
      setPhone(p.phone || "");
      setWebsite(p.website || "");
      setStatus(p.verificationStatus);
      setPlan(p.plan);
    } catch (e: any) {
      setError(e?.message || "Failed to load profile");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const save = async () => {
    if (!token) return;
    setSaving(true);
    setError(null);
    setOk(false);
    try {
      await patchSellerProfile(
        {
          businessName: businessName.trim(),
          bio: bio.trim(),
          phone: phone.trim() || null,
          website: website.trim() || null,
        },
        { token },
      );
      setOk(true);
    } catch (e: any) {
      setError(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <WholesaleGate>
      <WholesaleShell title="Seller profile" subtitle={`${plan || "free"} · ${status || "unverified"}`}>
        {loading ? (
          <ActivityIndicator color={T.accent} />
        ) : (
          <View style={styles.form}>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {ok ? <Text style={styles.ok}>Saved.</Text> : null}
            <Text style={styles.label}>Business name</Text>
            <TextInput style={styles.input} value={businessName} onChangeText={setBusinessName} placeholderTextColor={T.muted} />
            <Text style={styles.label}>Bio</Text>
            <TextInput style={[styles.input, { minHeight: 90 }]} value={bio} onChangeText={setBio} multiline placeholderTextColor={T.muted} />
            <Text style={styles.label}>Phone</Text>
            <TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholderTextColor={T.muted} />
            <Text style={styles.label}>Website</Text>
            <TextInput style={styles.input} value={website} onChangeText={setWebsite} autoCapitalize="none" placeholderTextColor={T.muted} />
            <Pressable style={styles.btn} onPress={() => void save()} disabled={saving}>
              <Text style={styles.btnText}>{saving ? "Saving…" : "Save profile"}</Text>
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
  btn: { backgroundColor: T.accent, borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 8 },
  btnText: { color: T.white, fontWeight: "800" },
  error: { color: T.danger, fontWeight: "700" },
  ok: { color: T.accent, fontWeight: "700" },
});
