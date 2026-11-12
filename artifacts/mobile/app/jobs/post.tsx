/**
 * Post a job — fee payment via FM wallet only on Android (Play-safe path).
 */
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { createJob, payJobFee } from "@/lib/jobsApi";

export default function PostJobScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, user } = useAuth();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [budget, setBudget] = useState("");
  const [busy, setBusy] = useState(false);

  const onSubmit = async () => {
    if (!token) return;
    if (title.trim().length < 3 || description.trim().length < 10) {
      Alert.alert("Required", "Enter a title and description.");
      return;
    }
    setBusy(true);
    try {
      const created = await createJob(
        {
          title: title.trim(),
          description: description.trim(),
          location: location.trim() || undefined,
          budget: budget.trim() ? Number(budget) : undefined,
        },
        { token },
      );
      const jobId = created.job?.id;
      if (jobId && created.fee) {
        Alert.alert(
          "Posting fee",
          `Fee ${created.fee.amount} ${created.fee.currency}. Pay with FM Wallet? (Card/MonCash are restricted on Android.)`,
          [
            { text: "Later", onPress: () => router.replace(`/jobs/${jobId}`) },
            {
              text: "Pay with wallet",
              onPress: async () => {
                try {
                  await payJobFee(jobId, { token, paymentMethod: "fm_wallet" });
                  Alert.alert("Posted", "Job fee paid from wallet.");
                  router.replace(`/jobs/${jobId}`);
                } catch (e) {
                  Alert.alert("Payment failed", e instanceof Error ? e.message : "Error");
                  router.replace(`/jobs/${jobId}`);
                }
              },
            },
          ],
        );
      } else if (jobId) {
        router.replace(`/jobs/${jobId}`);
      }
    } catch (e) {
      Alert.alert("Could not post", e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.topBar}>
        <Pressable style={styles.back} onPress={() => (router.canGoBack() ? router.back() : router.replace("/jobs"))}>
          <Feather name="arrow-left" size={22} color="#0F172A" />
        </Pressable>
        <Text style={styles.title}>Post a job</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }} keyboardShouldPersistTaps="handled">
        <Text style={styles.note}>
          Posting may require a fee. On Android, payment uses FM Wallet only.
          {user?.country === "Haiti" ? " Haiti posters: country rules from your profile still apply." : ""}
        </Text>
        <Text style={styles.label}>Title</Text>
        <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="Job title" placeholderTextColor="#94A3B8" />
        <Text style={styles.label}>Description</Text>
        <TextInput
          style={[styles.input, { minHeight: 120, textAlignVertical: "top" }]}
          value={description}
          onChangeText={setDescription}
          multiline
          placeholder="Details"
          placeholderTextColor="#94A3B8"
        />
        <Text style={styles.label}>Location</Text>
        <TextInput style={styles.input} value={location} onChangeText={setLocation} placeholder="City / commune" placeholderTextColor="#94A3B8" />
        <Text style={styles.label}>Budget (optional USD)</Text>
        <TextInput style={styles.input} value={budget} onChangeText={setBudget} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor="#94A3B8" />
        <Pressable style={[styles.btn, busy && { opacity: 0.7 }]} onPress={onSubmit} disabled={busy} testID="btn-post-job">
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Create job</Text>}
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F8FAFC" },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12 },
  back: {
    width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center",
    backgroundColor: "#fff", borderWidth: 1, borderColor: "#E2E8F0",
  },
  title: { fontSize: 17, fontWeight: "800", color: "#0F172A" },
  note: { color: "#64748B", fontSize: 12, lineHeight: 17, marginBottom: 12 },
  label: { fontWeight: "700", color: "#0F172A", marginTop: 8, marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: "#E2E8F0", backgroundColor: "#fff", borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 11, color: "#0F172A",
  },
  btn: { marginTop: 16, backgroundColor: "#F97316", borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  btnText: { color: "#fff", fontWeight: "800" },
});
