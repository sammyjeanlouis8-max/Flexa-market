import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { BeautyShell } from "@/components/beauty/BeautyShell";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import {
  createBeautyAppointment,
  fetchBeautyAvailability,
  fetchBeautyBusiness,
  formatBeautyMoney,
  type BeautyBusiness,
  type BeautyService,
} from "@/lib/beautyApi";
import { beautyTheme as T } from "@/lib/beautyTheme";

function todayYmd(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function addDaysYmd(base: string, days: number): string {
  const d = new Date(`${base}T12:00:00`);
  d.setDate(d.getDate() + days);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export default function BeautyBookScreen() {
  const { t } = useLanguage();
  const { token, user } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ businessId?: string; serviceId?: string }>();
  const businessId = Number(params.businessId);
  const initialServiceId = Number(params.serviceId) || 0;

  const [biz, setBiz] = useState<BeautyBusiness | null>(null);
  const [serviceId, setServiceId] = useState(initialServiceId);
  const [professionalId, setProfessionalId] = useState<number | null>(null);
  const [date, setDate] = useState(todayYmd());
  const [slots, setSlots] = useState<string[]>([]);
  const [slot, setSlot] = useState<string | null>(null);
  const [serviceLocation, setServiceLocation] = useState("at_business");
  const [paymentMode, setPaymentMode] = useState<"full" | "deposit" | "pay_at_location">("pay_at_location");
  const [notes, setNotes] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState(user?.phone || "");
  const [loading, setLoading] = useState(true);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const services = biz?.services || [];
  const selectedService: BeautyService | undefined = useMemo(
    () => services.find((s) => s.id === serviceId) || services[0],
    [services, serviceId],
  );

  const loadBiz = useCallback(async () => {
    if (!Number.isFinite(businessId)) return;
    setError(null);
    const row = await fetchBeautyBusiness(businessId, { token });
    setBiz(row);
    if (!serviceId && row.services?.[0]) setServiceId(row.services[0].id);
    if (row.homeServiceAvailable && row.serviceLocationMode === "at_customer") {
      setServiceLocation("at_customer");
    }
  }, [businessId, token, serviceId]);

  useEffect(() => {
    setLoading(true);
    void loadBiz()
      .catch((e: Error) => setError(e.message || t("beauty_notFound")))
      .finally(() => setLoading(false));
  }, [loadBiz, t]);

  const loadSlots = useCallback(async () => {
    if (!selectedService || !Number.isFinite(businessId)) return;
    setSlotsLoading(true);
    setSlot(null);
    try {
      const data = await fetchBeautyAvailability(
        {
          businessId,
          serviceId: selectedService.id,
          date,
          professionalId,
          serviceLocation,
        },
        { token },
      );
      setSlots(data.slots || []);
    } catch (e: any) {
      setSlots([]);
      setError(e?.message || t("beauty_loadError"));
    } finally {
      setSlotsLoading(false);
    }
  }, [businessId, selectedService, date, professionalId, serviceLocation, token, t]);

  useEffect(() => {
    if (!selectedService) return;
    void loadSlots();
  }, [loadSlots, selectedService]);

  async function submit() {
    if (!selectedService || !slot || !token) return;
    setSubmitting(true);
    setError(null);
    setMsg(null);
    try {
      if (serviceLocation === "at_customer" && !address.trim()) {
        setError(t("beauty_addressRequired"));
        return;
      }
      const result = await createBeautyAppointment(
        {
          businessId,
          serviceId: selectedService.id,
          startsAt: slot,
          professionalId,
          serviceLocation,
          customerName: user?.name || undefined,
          customerPhone: phone.trim() || undefined,
          customerNotes: notes.trim() || undefined,
          customerAddress: address.trim() || undefined,
          paymentMode,
          idempotencyKey: `mobile-${businessId}-${selectedService.id}-${slot}`,
        },
        { token },
      );
      setMsg(t("beauty_bookedSuccess"));
      setTimeout(() => {
        router.replace("/beauty/my-appointments" as any);
      }, 600);
      void result;
    } catch (e: any) {
      setError(e?.message || t("beauty_bookFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  const dateOptions = [0, 1, 2, 3, 4, 5, 6].map((d) => addDaysYmd(todayYmd(), d));

  return (
    <BeautyShell title={t("beauty_bookTitle")} subtitle={biz?.name} scroll={false}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 32 }}>
        {loading ? (
          <ActivityIndicator color={T.accent} style={{ marginTop: 24 }} />
        ) : error && !biz ? (
          <Text style={styles.err}>{error}</Text>
        ) : !biz || !selectedService ? (
          <Text style={styles.muted}>{t("beauty_notFound")}</Text>
        ) : (
          <>
            <Text style={styles.label}>{t("beauty_services")}</Text>
            <View style={styles.wrap}>
              {services.map((svc) => {
                const active = svc.id === selectedService.id;
                return (
                  <Pressable
                    key={svc.id}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => setServiceId(svc.id)}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {svc.name} · {formatBeautyMoney(svc.price, svc.currency)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {(biz.professionals || []).length > 0 ? (
              <>
                <Text style={styles.label}>{t("beauty_staff")}</Text>
                <View style={styles.wrap}>
                  <Pressable
                    style={[styles.chip, professionalId == null && styles.chipActive]}
                    onPress={() => setProfessionalId(null)}
                  >
                    <Text style={[styles.chipText, professionalId == null && styles.chipTextActive]}>
                      {t("beauty_anyPro")}
                    </Text>
                  </Pressable>
                  {(biz.professionals || []).map((pro) => {
                    const active = professionalId === pro.id;
                    return (
                      <Pressable
                        key={pro.id}
                        style={[styles.chip, active && styles.chipActive]}
                        onPress={() => setProfessionalId(pro.id)}
                      >
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>{pro.fullName}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            ) : null}

            {biz.homeServiceAvailable ? (
              <>
                <Text style={styles.label}>{t("beauty_location")}</Text>
                <View style={styles.wrap}>
                  {(["at_business", "at_customer"] as const).map((loc) => {
                    const active = serviceLocation === loc;
                    return (
                      <Pressable
                        key={loc}
                        style={[styles.chip, active && styles.chipActive]}
                        onPress={() => setServiceLocation(loc)}
                      >
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>
                          {loc === "at_business" ? t("beauty_atBusiness") : t("beauty_atCustomer")}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            ) : null}

            <Text style={styles.label}>{t("beauty_date")}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
              {dateOptions.map((d) => {
                const active = date === d;
                return (
                  <Pressable
                    key={d}
                    style={[styles.chip, active && styles.chipActive, { marginRight: 8 }]}
                    onPress={() => setDate(d)}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{d.slice(5)}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <Text style={styles.label}>{t("beauty_time")}</Text>
            {slotsLoading ? (
              <ActivityIndicator color={T.accent} />
            ) : slots.length === 0 ? (
              <Text style={styles.muted}>{t("beauty_noSlots")}</Text>
            ) : (
              <View style={styles.wrap}>
                {slots.map((s) => {
                  const active = slot === s;
                  const label = new Date(s).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
                  return (
                    <Pressable
                      key={s}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => setSlot(s)}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}

            <Text style={styles.label}>{t("beauty_paymentMode")}</Text>
            <View style={styles.wrap}>
              {([
                ["pay_at_location", "beauty_payAtLocation"],
                ["full", "beauty_payFull"],
                ["deposit", "beauty_payDeposit"],
              ] as const).map(([mode, key]) => {
                const active = paymentMode === mode;
                return (
                  <Pressable
                    key={mode}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => setPaymentMode(mode)}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{t(key)}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.label}>{t("beauty_phone")}</Text>
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              placeholder="+509…"
              placeholderTextColor={T.muted}
              keyboardType="phone-pad"
            />

            {serviceLocation === "at_customer" ? (
              <>
                <Text style={styles.label}>{t("beauty_address")}</Text>
                <TextInput
                  style={styles.input}
                  value={address}
                  onChangeText={setAddress}
                  placeholder={t("beauty_address")}
                  placeholderTextColor={T.muted}
                />
              </>
            ) : null}

            <Text style={styles.label}>{t("beauty_notes")}</Text>
            <TextInput
              style={[styles.input, { minHeight: 80, textAlignVertical: "top" }]}
              value={notes}
              onChangeText={setNotes}
              multiline
              placeholder={t("beauty_notesPlaceholder")}
              placeholderTextColor={T.muted}
            />

            {error ? <Text style={styles.err}>{error}</Text> : null}
            {msg ? <Text style={styles.ok}>{msg}</Text> : null}

            <Pressable
              style={[styles.submit, (!slot || submitting) && styles.submitDisabled]}
              disabled={!slot || submitting}
              onPress={() => void submit()}
            >
              {submitting ? (
                <ActivityIndicator color={T.white} />
              ) : (
                <Text style={styles.submitText}>{t("beauty_confirmBooking")}</Text>
              )}
            </Pressable>
          </>
        )}
      </ScrollView>
    </BeautyShell>
  );
}

const styles = StyleSheet.create({
  label: { fontWeight: "800", color: T.ink, fontSize: 13, marginTop: 14, marginBottom: 8 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: T.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  chipActive: { backgroundColor: T.accent, borderColor: T.accent },
  chipText: { color: T.ink, fontWeight: "700", fontSize: 12 },
  chipTextActive: { color: T.white },
  input: {
    backgroundColor: T.white,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: T.ink,
  },
  submit: {
    marginTop: 20,
    backgroundColor: T.accent,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  submitDisabled: { opacity: 0.5 },
  submitText: { color: T.white, fontWeight: "800", fontSize: 15 },
  muted: { color: T.muted, fontSize: 13 },
  err: { color: "#b91c1c", marginTop: 10 },
  ok: { color: T.accent, marginTop: 10, fontWeight: "700" },
});
