/**
 * Native job detail — apply / claim using verified backend routes.
 */
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
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
import { applyToJob, claimJob, fetchJob, type Job } from "@/lib/jobsApi";

export default function JobDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const jobId = Number(id);
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cover, setCover] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!token || !Number.isFinite(jobId)) return;
    try {
      setJob(await fetchJob(jobId, { token }));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Job not found");
    }
  };

  useEffect(() => {
    void load();
  }, [token, jobId]);

  const onApply = async () => {
    if (!token) return;
    setBusy(true);
    try {
      await applyToJob(jobId, { coverLetter: cover, whatsapp }, { token });
      Alert.alert("Applied", "Your application was submitted.");
      await load();
    } catch (e) {
      Alert.alert("Apply failed", e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  };

  const onClaim = async () => {
    if (!token) return;
    setBusy(true);
    try {
      await claimJob(jobId, { token });
      Alert.alert("Claimed", "You claimed this job.");
      await load();
    } catch (e) {
      Alert.alert("Claim failed", e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  };

  const isPoster = job && user?.id === job.posterId;

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.topBar}>
        <Pressable
          style={styles.back}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/jobs"))}
        >
          <Feather name="arrow-left" size={22} color="#0F172A" />
        </Pressable>
        <Text style={styles.title}>Job details</Text>
        <View style={{ width: 40 }} />
      </View>

      {!job && !error ? (
        <ActivityIndicator color="#F97316" style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {job ? (
            <>
              <Text style={styles.heading}>{job.title}</Text>
              <Text style={styles.meta}>
                {[job.status, job.location, job.country, job.budget != null ? `$${job.budget}` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
              <Text style={styles.body}>{job.description}</Text>
              <Text style={styles.meta}>Posted by {job.posterName || `#${job.posterId}`}</Text>

              {!isPoster && job.status === "open" ? (
                <View style={{ marginTop: 16, gap: 8 }}>
                  <Text style={styles.label}>Cover letter</Text>
                  <TextInput
                    style={[styles.input, { minHeight: 90, textAlignVertical: "top" }]}
                    value={cover}
                    onChangeText={setCover}
                    multiline
                    placeholder="Why you're a fit"
                    placeholderTextColor="#94A3B8"
                  />
                  <Text style={styles.label}>WhatsApp (optional)</Text>
                  <TextInput
                    style={styles.input}
                    value={whatsapp}
                    onChangeText={setWhatsapp}
                    placeholder="+509…"
                    placeholderTextColor="#94A3B8"
                  />
                  <Pressable
                    style={[styles.btn, busy && { opacity: 0.7 }]}
                    onPress={onApply}
                    disabled={busy}
                    testID="btn-job-apply"
                  >
                    <Text style={styles.btnText}>Apply</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.btnGhost, busy && { opacity: 0.7 }]}
                    onPress={onClaim}
                    disabled={busy}
                  >
                    <Text style={styles.btnGhostText}>Claim job</Text>
                  </Pressable>
                </View>
              ) : null}
            </>
          ) : null}
        </ScrollView>
      )}
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
  error: { color: "#B91C1C", fontWeight: "600" },
  heading: { fontSize: 22, fontWeight: "800", color: "#0F172A" },
  meta: { color: "#64748B", marginTop: 6, fontSize: 13 },
  body: { color: "#0F172A", marginTop: 14, lineHeight: 22 },
  label: { fontWeight: "700", color: "#0F172A", marginTop: 4 },
  input: {
    borderWidth: 1, borderColor: "#E2E8F0", backgroundColor: "#fff", borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 11, color: "#0F172A",
  },
  btn: { backgroundColor: "#F97316", borderRadius: 12, paddingVertical: 13, alignItems: "center" },
  btnText: { color: "#fff", fontWeight: "800" },
  btnGhost: {
    borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 12, paddingVertical: 12, alignItems: "center",
  },
  btnGhostText: { color: "#0F172A", fontWeight: "700" },
});
