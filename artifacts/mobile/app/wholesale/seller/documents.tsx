import * as ImagePicker from "expo-image-picker";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { WholesaleGate } from "@/components/wholesale/WholesaleGate";
import { WholesaleShell } from "@/components/wholesale/WholesaleShell";
import { useAuth } from "@/context/AuthContext";
import { uploadLocalFile } from "@/lib/mediaUpload";
import {
  createSellerDocument,
  deleteSellerDocument,
  fetchSellerDocuments,
} from "@/lib/wholesaleApi";
import { wholesaleTheme as T } from "@/lib/wholesaleTheme";

type Row = Awaited<ReturnType<typeof fetchSellerDocuments>>[number];

export default function SellerDocumentsScreen() {
  const { token } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      setRows(await fetchSellerDocuments({ token }));
    } catch (e: any) {
      setError(e?.message || "Failed to load documents");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const upload = async () => {
    if (!token) return;
    if (!title.trim()) {
      setError("Enter a document title first");
      return;
    }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Allow photo access to upload verification documents.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.9,
    });
    if (result.canceled || !result.assets[0]) return;
    try {
      const asset = result.assets[0];
      const up = await uploadLocalFile(asset.uri, {
        token,
        contentType: asset.mimeType || "image/jpeg",
        fileName: asset.fileName || `doc-${Date.now()}.jpg`,
      });
      await createSellerDocument({ title: title.trim(), fileUrl: up.url, docType: "business" }, { token });
      setTitle("");
      await load();
    } catch (e: any) {
      setError(e?.message || "Upload failed");
    }
  };

  return (
    <WholesaleGate>
      <WholesaleShell title="Documents" subtitle="Business docs for warehouse verification">
        <View style={styles.invite}>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="Document title"
            placeholderTextColor={T.muted}
          />
          <Pressable style={styles.btn} onPress={() => void upload()}>
            <Text style={styles.btnText}>Upload</Text>
          </Pressable>
        </View>
        {loading ? (
          <ActivityIndicator color={T.accent} />
        ) : error ? (
          <Text style={styles.error}>{error}</Text>
        ) : rows.length === 0 ? (
          <Text style={styles.empty}>No documents uploaded.</Text>
        ) : (
          <View style={styles.list}>
            {rows.map((r) => (
              <View key={r.id} style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.title}>{r.title}</Text>
                  <Text style={styles.meta}>{r.docType} · {r.status}</Text>
                </View>
                <Pressable onPress={() => token && void deleteSellerDocument(r.id, { token }).then(load)}>
                  <Text style={styles.remove}>Delete</Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}
      </WholesaleShell>
    </WholesaleGate>
  );
}

const styles = StyleSheet.create({
  invite: { flexDirection: "row", gap: 8, marginBottom: 14 },
  input: {
    flex: 1,
    backgroundColor: T.white,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: T.ink,
  },
  btn: { backgroundColor: T.accent, borderRadius: 10, paddingHorizontal: 14, justifyContent: "center" },
  btnText: { color: T.white, fontWeight: "800" },
  list: { gap: 8 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: T.white,
    borderRadius: 12,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  title: { fontSize: 14, fontWeight: "700", color: T.ink },
  meta: { fontSize: 12, color: T.muted },
  remove: { color: T.danger, fontWeight: "700" },
  empty: { color: T.muted },
  error: { color: T.danger, fontWeight: "700" },
});
