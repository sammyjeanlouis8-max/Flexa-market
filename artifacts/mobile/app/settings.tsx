import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMarketplace } from "@/context/MarketplaceContext";
import { COUNTRY_FLAGS, SUPPORTED_COUNTRIES } from "@/lib/countries";

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { country, setCountry } = useMarketplace();
  const [open, setOpen] = useState(false);

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.topBar}>
        <Pressable
          style={styles.back}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
        >
          <Feather name="arrow-left" size={22} color="#0F172A" />
        </Pressable>
        <Text style={styles.title}>Settings</Text>
        <View style={{ width: 40 }} />
      </View>

      <Pressable style={styles.row} onPress={() => setOpen(true)}>
        <View>
          <Text style={styles.label}>Marketplace country</Text>
          <Text style={styles.value}>
            {COUNTRY_FLAGS[country] ?? ""} {country}
          </Text>
        </View>
        <Feather name="chevron-right" size={18} color="#94A3B8" />
      </Pressable>

      <Pressable style={[styles.row, { marginTop: 10 }]} onPress={() => router.push("/edit-profile")}>
        <View>
          <Text style={styles.label}>Account</Text>
          <Text style={styles.value}>Edit profile</Text>
        </View>
        <Feather name="chevron-right" size={18} color="#94A3B8" />
      </Pressable>

      <Pressable style={[styles.row, { marginTop: 10 }]} onPress={() => router.push("/addresses")}>
        <View>
          <Text style={styles.label}>Delivery</Text>
          <Text style={styles.value}>Address book</Text>
        </View>
        <Feather name="chevron-right" size={18} color="#94A3B8" />
      </Pressable>

      <Pressable
        style={[styles.row, { marginTop: 10 }]}
        onPress={() => router.push("/language-picker")}
      >
        <View>
          <Text style={styles.label}>Preferences</Text>
          <Text style={styles.value}>Language</Text>
        </View>
        <Feather name="chevron-right" size={18} color="#94A3B8" />
      </Pressable>

      <Pressable
        style={[styles.row, { marginTop: 10 }]}
        onPress={() => router.push("/security")}
      >
        <View>
          <Text style={styles.label}>Security</Text>
          <Text style={styles.value}>Password & delete account</Text>
        </View>
        <Feather name="chevron-right" size={18} color="#94A3B8" />
      </Pressable>

      <Pressable
        style={[styles.row, { marginTop: 10 }]}
        onPress={() => router.push("/kyc")}
      >
        <View>
          <Text style={styles.label}>Identity (KYC)</Text>
          <Text style={styles.value}>Seller verification documents</Text>
        </View>
        <Feather name="chevron-right" size={18} color="#94A3B8" />
      </Pressable>

      <Pressable
        style={[styles.row, { marginTop: 10 }]}
        onPress={() => router.push("/store-manager")}
      >
        <View>
          <Text style={styles.label}>Store manager</Text>
          <Text style={styles.value}>Invite helper · manage access</Text>
        </View>
        <Feather name="chevron-right" size={18} color="#94A3B8" />
      </Pressable>

      <Pressable
        style={[styles.row, { marginTop: 10 }]}
        onPress={() => router.push("/help")}
      >
        <View>
          <Text style={styles.label}>Help</Text>
          <Text style={styles.value}>Help Center & Support</Text>
        </View>
        <Feather name="chevron-right" size={18} color="#94A3B8" />
      </Pressable>

      <Pressable
        style={[styles.row, { marginTop: 10 }]}
        onPress={() => router.push("/legal/privacy")}
      >
        <View>
          <Text style={styles.label}>Legal</Text>
          <Text style={styles.value}>Privacy, Terms, EULA</Text>
        </View>
        <Feather name="chevron-right" size={18} color="#94A3B8" />
      </Pressable>

      <Pressable
        style={[styles.row, { marginTop: 10 }]}
        onPress={() => router.push("/track/FM-")}
      >
        <View>
          <Text style={styles.label}>Guest tracking</Text>
          <Text style={styles.value}>Track with FM- number</Text>
        </View>
        <Feather name="chevron-right" size={18} color="#94A3B8" />
      </Pressable>

      <Text style={styles.hint}>
        Guests browse listings for the selected country. Signed-in shoppers use
        their account country from the DigitalOcean backend.
      </Text>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <Text style={styles.sheetTitle}>Select country</Text>
            <FlatList
              data={SUPPORTED_COUNTRIES}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.countryRow}
                  onPress={async () => {
                    await setCountry(item);
                    setOpen(false);
                  }}
                >
                  <Text style={styles.flag}>{COUNTRY_FLAGS[item]}</Text>
                  <Text style={styles.countryName}>{item}</Text>
                  {item === country ? (
                    <Feather name="check" size={18} color="#F97316" />
                  ) : null}
                </Pressable>
              )}
            />
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F8FAFC", paddingHorizontal: 16 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  title: { fontSize: 18, fontWeight: "800", color: "#0F172A" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 16,
  },
  label: { fontSize: 12, fontWeight: "700", color: "#94A3B8", marginBottom: 4 },
  value: { fontSize: 16, fontWeight: "700", color: "#0F172A" },
  hint: {
    marginTop: 12,
    fontSize: 13,
    lineHeight: 19,
    color: "#64748B",
  },
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(15,23,42,0.4)",
  },
  sheet: {
    maxHeight: "70%",
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 16,
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0F172A",
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  countryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E2E8F0",
  },
  flag: { fontSize: 22 },
  countryName: { flex: 1, fontSize: 16, color: "#0F172A" },
});
