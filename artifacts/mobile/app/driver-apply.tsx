/**
 * Driver application — Haiti residential + work zones via GET /delivery/driver/zones,
 * draft PUT /delivery/application/draft, submit POST /delivery/apply.
 */
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { AppHeader } from "@/components/shell/AppHeader";
import colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { apiRequest } from "@/lib/request";

const VEHICLES = ["moto", "car", "compact", "suv", "van", "truck", "other"] as const;

type ZonesPayload = {
  country?: string;
  departments?: string[] | Record<string, string[]>;
  communesByDepartment?: Record<string, string[]>;
};

function parseWorkZones(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return raw ? [raw] : [];
    }
  }
  return [];
}

function departmentNames(zones: ZonesPayload | null): string[] {
  if (!zones) return [];
  const byDept = zones.communesByDepartment;
  if (byDept && typeof byDept === "object") return Object.keys(byDept);
  if (zones.departments && typeof zones.departments === "object" && !Array.isArray(zones.departments)) {
    return Object.keys(zones.departments);
  }
  if (Array.isArray(zones.departments)) return zones.departments.map(String);
  return [];
}

function communesFor(zones: ZonesPayload | null, department: string): string[] {
  if (!zones || !department) return [];
  if (zones.communesByDepartment?.[department]) return zones.communesByDepartment[department];
  if (
    zones.departments &&
    typeof zones.departments === "object" &&
    !Array.isArray(zones.departments)
  ) {
    return zones.departments[department] || [];
  }
  return [];
}

export default function DriverApplyScreen() {
  const router = useRouter();
  const { token, user, isLoading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [applicationId, setApplicationId] = useState<string | null>(null);
  const [adminNote, setAdminNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zones, setZones] = useState<ZonesPayload | null>(null);
  const [picker, setPicker] = useState<"residentialDept" | "residentialCommune" | "workDept" | null>(
    null,
  );
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    residentialDepartment: "",
    residentialCommune: "",
    workDepartment: "",
    workCommunes: [] as string[],
    whatsappNumber: "",
    callPhone: "",
    vehicleType: "moto",
    vehicleBrand: "",
    vehicleModel: "",
    licensePlateNumber: "",
  });

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const depts = useMemo(() => departmentNames(zones), [zones]);
  const residentialCommunes = useMemo(
    () => communesFor(zones, form.residentialDepartment),
    [zones, form.residentialDepartment],
  );
  const workCommunesOptions = useMemo(
    () => communesFor(zones, form.workDepartment),
    [zones, form.workDepartment],
  );

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [zonesRes, appRes] = await Promise.all([
        apiRequest<ZonesPayload>("/delivery/driver/zones", { token }).catch(() => null),
        apiRequest<any>("/driver/my-application", { token }),
      ]);
      if (zonesRes) setZones(zonesRes);

      const app = appRes.application;
      if (app) {
        setStatus(app.status);
        setAdminNote(app.adminNote || app.rejectionReason || null);
        const id =
          appRes.applicationId ||
          (app.id != null ? `DRV-${String(app.id).padStart(10, "0")}` : null);
        setApplicationId(id);
        const wz = parseWorkZones(app.workZones);
        let inferredWorkDept = "";
        if (wz.length && zonesRes) {
          for (const dept of departmentNames(zonesRes)) {
            const communes = communesFor(zonesRes, dept);
            if (wz.some((c) => communes.includes(c))) {
              inferredWorkDept = dept;
              break;
            }
          }
        }
        let inferredResDept = app.residentialDepartment || "";
        if (!inferredResDept && app.city && zonesRes) {
          for (const dept of departmentNames(zonesRes)) {
            if (communesFor(zonesRes, dept).includes(String(app.city))) {
              inferredResDept = dept;
              break;
            }
          }
        }
        setForm((f) => ({
          ...f,
          firstName: app.firstName || f.firstName,
          lastName: app.lastName || f.lastName,
          residentialCommune: app.city || f.residentialCommune,
          residentialDepartment: inferredResDept || f.residentialDepartment,
          workCommunes: wz.length ? wz : f.workCommunes,
          workDepartment: inferredWorkDept || f.workDepartment,
          vehicleType: app.vehicleType || f.vehicleType,
          vehicleBrand: app.vehicleBrand || f.vehicleBrand,
          vehicleModel: app.vehicleModel || f.vehicleModel,
          licensePlateNumber: app.licensePlateNumber || f.licensePlateNumber,
          callPhone: app.callPhone || f.callPhone,
          whatsappNumber: app.whatsappNumber || f.whatsappNumber,
        }));
      } else {
        setStatus(null);
        setApplicationId(null);
        const name = (user?.name || "").split(" ");
        setForm((f) => ({
          ...f,
          firstName: name[0] || "",
          lastName: name.slice(1).join(" ") || "",
          callPhone: user?.phone || "",
          whatsappNumber: user?.phone || "",
        }));
      }
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load application");
    } finally {
      setLoading(false);
    }
  }, [token, user]);

  useFocusEffect(
    useCallback(() => {
      if (!authLoading && !token) {
        router.replace("/auth/login");
        return;
      }
      if (token) void load();
    }, [authLoading, token, router, load]),
  );

  const buildPayload = () => {
    const commune = form.residentialCommune.trim();
    return {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      city: commune || form.workCommunes[0] || form.residentialDepartment,
      residentialDepartment: form.residentialDepartment,
      whatsappNumber: form.whatsappNumber.trim(),
      callPhone: form.callPhone.trim() || form.whatsappNumber.trim(),
      vehicleType: form.vehicleType,
      vehicleBrand: form.vehicleBrand.trim() || null,
      vehicleModel: form.vehicleModel.trim() || null,
      licensePlateNumber: form.licensePlateNumber.trim() || null,
      workZones: form.workCommunes,
      address: commune || form.residentialDepartment || "—",
      hasSmartphone: true,
      hasStableInternet: true,
      hasFastPhone: true,
    };
  };

  const saveDraft = async () => {
    if (!token) return;
    setBusy(true);
    try {
      const res = await apiRequest<any>("/delivery/application/draft", {
        token,
        method: "PUT",
        body: buildPayload(),
      });
      if (res.applicationId) setApplicationId(res.applicationId);
      if (res.application?.status) setStatus(res.application.status);
      Alert.alert("Draft saved");
      await load();
    } catch (e) {
      Alert.alert("Save failed", e instanceof Error ? e.message : "Try again");
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (!token) return;
    if (!form.firstName.trim() || !(form.callPhone || form.whatsappNumber)) {
      Alert.alert("Missing fields", "First name and phone are required.");
      return;
    }
    if (!form.residentialDepartment || !form.residentialCommune) {
      Alert.alert("Residence required", "Select your residential department and commune.");
      return;
    }
    if (!form.workDepartment || form.workCommunes.length === 0) {
      Alert.alert("Work zones required", "Select a work department and at least one commune.");
      return;
    }
    setBusy(true);
    try {
      const res = await apiRequest<any>("/delivery/apply", {
        token,
        method: "POST",
        body: buildPayload(),
      });
      if (res.applicationId) setApplicationId(res.applicationId);
      if (res.application?.status) setStatus(res.application.status);
      Alert.alert("Submitted", "Your driver application is under review.");
      await load();
    } catch (e) {
      Alert.alert("Submit failed", e instanceof Error ? e.message : "Try again");
    } finally {
      setBusy(false);
    }
  };

  const locked = status === "pending" || status === "approved";

  const toggleWorkCommune = (c: string) => {
    if (locked) return;
    setForm((f) => {
      const has = f.workCommunes.includes(c);
      return {
        ...f,
        workCommunes: has ? f.workCommunes.filter((x) => x !== c) : [...f.workCommunes, c],
      };
    });
  };

  const pickerOptions =
    picker === "residentialDept" || picker === "workDept"
      ? depts
      : picker === "residentialCommune"
        ? residentialCommunes
        : [];

  return (
    <View style={styles.root}>
      <AppHeader title="Apply as driver" showBack />
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.flexaGreen} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          {error ? <Text style={styles.err}>{error}</Text> : null}
          {status || applicationId ? (
            <View style={styles.statusCard}>
              {status ? <Text style={styles.status}>Status: {status}</Text> : null}
              {applicationId ? (
                <Text style={styles.appId}>Application ID: {applicationId}</Text>
              ) : null}
              {adminNote ? <Text style={styles.note}>{adminNote}</Text> : null}
              {status === "approved" ? (
                <Pressable style={styles.btn} onPress={() => router.push("/driver-dashboard")}>
                  <Text style={styles.btnText}>Open driver dashboard</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          <Text style={styles.label}>First name</Text>
          <TextInput
            style={styles.input}
            editable={!locked}
            value={form.firstName}
            onChangeText={(v) => set("firstName", v)}
          />
          <Text style={styles.label}>Last name</Text>
          <TextInput
            style={styles.input}
            editable={!locked}
            value={form.lastName}
            onChangeText={(v) => set("lastName", v)}
          />

          <Text style={styles.label}>Residential department</Text>
          <Pressable
            style={styles.select}
            disabled={locked}
            onPress={() => setPicker("residentialDept")}
          >
            <Text style={styles.selectText}>
              {form.residentialDepartment || "Select department"}
            </Text>
            <Feather name="chevron-down" size={18} color="#64748B" />
          </Pressable>

          <Text style={styles.label}>Residential commune</Text>
          <Pressable
            style={styles.select}
            disabled={locked || !form.residentialDepartment}
            onPress={() => setPicker("residentialCommune")}
          >
            <Text style={styles.selectText}>
              {form.residentialCommune || "Select commune"}
            </Text>
            <Feather name="chevron-down" size={18} color="#64748B" />
          </Pressable>

          <Text style={styles.label}>Work department</Text>
          <Pressable
            style={styles.select}
            disabled={locked}
            onPress={() => setPicker("workDept")}
          >
            <Text style={styles.selectText}>{form.workDepartment || "Select department"}</Text>
            <Feather name="chevron-down" size={18} color="#64748B" />
          </Pressable>

          <Text style={styles.label}>Work communes</Text>
          <Text style={styles.hint}>
            Separate from your residential address. Choose where you want to accept deliveries.
          </Text>
          <View style={styles.chips}>
            {workCommunesOptions.map((c) => {
              const on = form.workCommunes.includes(c);
              return (
                <Pressable
                  key={c}
                  disabled={locked}
                  style={[styles.chip, on && styles.chipOn]}
                  onPress={() => toggleWorkCommune(c)}
                >
                  <Text style={[styles.chipText, on && { color: "#fff" }]}>{c}</Text>
                </Pressable>
              );
            })}
            {!form.workDepartment ? (
              <Text style={styles.hint}>Select a work department first.</Text>
            ) : workCommunesOptions.length === 0 ? (
              <Text style={styles.hint}>No communes available.</Text>
            ) : null}
          </View>

          <Text style={styles.label}>WhatsApp</Text>
          <TextInput
            style={styles.input}
            editable={!locked}
            value={form.whatsappNumber}
            onChangeText={(v) => set("whatsappNumber", v)}
            keyboardType="phone-pad"
          />
          <Text style={styles.label}>Call phone</Text>
          <TextInput
            style={styles.input}
            editable={!locked}
            value={form.callPhone}
            onChangeText={(v) => set("callPhone", v)}
            keyboardType="phone-pad"
          />

          <Text style={styles.label}>Vehicle type</Text>
          <View style={styles.chips}>
            {VEHICLES.map((v) => (
              <Pressable
                key={v}
                disabled={locked}
                style={[styles.chip, form.vehicleType === v && styles.chipOn]}
                onPress={() => set("vehicleType", v)}
              >
                <Text style={[styles.chipText, form.vehicleType === v && { color: "#fff" }]}>
                  {v}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.label}>Vehicle brand</Text>
          <TextInput
            style={styles.input}
            editable={!locked}
            value={form.vehicleBrand}
            onChangeText={(v) => set("vehicleBrand", v)}
          />
          <Text style={styles.label}>Vehicle model</Text>
          <TextInput
            style={styles.input}
            editable={!locked}
            value={form.vehicleModel}
            onChangeText={(v) => set("vehicleModel", v)}
          />
          <Text style={styles.label}>License plate</Text>
          <TextInput
            style={styles.input}
            editable={!locked}
            value={form.licensePlateNumber}
            onChangeText={(v) => set("licensePlateNumber", v)}
            autoCapitalize="characters"
          />

          {!locked ? (
            <View style={{ gap: 10, marginTop: 16 }}>
              <Pressable
                style={[styles.btnGhost, busy && { opacity: 0.6 }]}
                onPress={() => void saveDraft()}
                disabled={busy}
              >
                <Text style={styles.btnGhostText}>Save draft</Text>
              </Pressable>
              <Pressable
                style={[styles.btn, busy && { opacity: 0.6 }]}
                onPress={() => void submit()}
                disabled={busy}
              >
                <Text style={styles.btnText}>{busy ? "Working…" : "Submit application"}</Text>
              </Pressable>
            </View>
          ) : null}
        </ScrollView>
      )}

      <Modal
        visible={picker != null}
        animationType="slide"
        transparent
        onRequestClose={() => setPicker(null)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setPicker(null)} />
        <View style={styles.modalSheet}>
          <Text style={styles.modalTitle}>
            {picker === "residentialDept"
              ? "Residential department"
              : picker === "residentialCommune"
                ? "Residential commune"
                : "Work department"}
          </Text>
          <ScrollView>
            {pickerOptions.map((o) => (
              <Pressable
                key={o}
                style={styles.modalRow}
                onPress={() => {
                  if (picker === "residentialDept") {
                    setForm((f) => ({
                      ...f,
                      residentialDepartment: o,
                      residentialCommune: "",
                    }));
                  } else if (picker === "residentialCommune") {
                    set("residentialCommune", o);
                  } else if (picker === "workDept") {
                    setForm((f) => ({ ...f, workDepartment: o, workCommunes: [] }));
                  }
                  setPicker(null);
                }}
              >
                <Text style={styles.modalRowText}>{o}</Text>
              </Pressable>
            ))}
            {pickerOptions.length === 0 ? (
              <Text style={styles.hint}>No options available</Text>
            ) : null}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.light.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  err: { color: colors.light.destructive, marginBottom: 8 },
  statusCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.light.border,
    padding: 12,
    marginBottom: 12,
    gap: 6,
  },
  status: { fontWeight: "800", color: colors.light.text, textTransform: "capitalize" },
  appId: { fontWeight: "700", color: "#334155", fontSize: 13 },
  note: { marginTop: 6, color: "#92400E" },
  label: { fontSize: 12, fontWeight: "700", color: "#94A3B8", marginTop: 10, marginBottom: 4 },
  hint: { fontSize: 12, color: "#64748B", marginBottom: 8 },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.light.border,
    borderRadius: 12,
    height: 46,
    paddingHorizontal: 12,
    color: colors.light.text,
  },
  select: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.light.border,
    borderRadius: 12,
    height: 46,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  selectText: { color: colors.light.text, flex: 1, fontSize: 15 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 12,
    height: 34,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.light.border,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  chipOn: { backgroundColor: colors.flexaGreen, borderColor: colors.flexaGreen },
  chipText: { fontWeight: "700", color: colors.light.text, textTransform: "capitalize" },
  btn: {
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.flexaGreen,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  btnText: { color: "#fff", fontWeight: "800" },
  btnGhost: {
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.light.border,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  btnGhostText: { fontWeight: "800", color: colors.light.text },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(15,23,42,0.45)" },
  modalSheet: {
    maxHeight: "55%",
    backgroundColor: "#fff",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 16,
  },
  modalTitle: { fontSize: 17, fontWeight: "800", color: "#0F172A", marginBottom: 8 },
  modalRow: {
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E2E8F0",
  },
  modalRowText: { fontSize: 15, color: "#0F172A" },
});
