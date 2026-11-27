import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { getApiBase } from "@/lib/api";
import {
  buildDirectionsHref,
  buildTelHref,
  buildWhatsAppHref,
  restaurantHasPublicLocation,
} from "@/lib/restaurantContact";
import type { Restaurant } from "@/lib/restaurantApi";
import { toggleFavorite } from "@/lib/restaurantFavorites";
import { restaurantTheme as T } from "@/lib/restaurantTheme";

type Props = {
  restaurant: Restaurant;
  saved: boolean;
  onSavedChange: (saved: boolean) => void;
  onReserve?: () => void;
  onViewMenu?: () => void;
};

export function RestaurantContactBar({
  restaurant,
  saved,
  onSavedChange,
  onReserve,
  onViewMenu,
}: Props) {
  const { t } = useLanguage();
  const { token, user } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tel = restaurant.phone ? buildTelHref(restaurant.phone) : null;
  const wa = restaurant.whatsapp
    ? buildWhatsAppHref(
        restaurant.whatsapp,
        `Hello ${restaurant.name} — I found you on Flexa Restaurant.`,
      )
    : null;
  const canDirections = restaurantHasPublicLocation(restaurant);
  const directions = canDirections
    ? buildDirectionsHref({
        latitude: restaurant.latitude,
        longitude: restaurant.longitude,
        label:
          restaurant.publicPickupAddress
          || (restaurant.businessType === "home_kitchen" ? null : restaurant.streetAddress)
          || `${restaurant.city}, ${restaurant.country}`,
      })
    : null;
  const open = restaurant.openNow ?? restaurant.isOpenNow;

  async function openUrl(url: string | null) {
    if (!url) return;
    // Do not gate on canOpenURL — iOS returns false for tel:/whatsapp without LSApplicationQueriesSchemes.
    try {
      await Linking.openURL(url);
    } catch {
      setError(t("restaurant_openLinkFailed") || "Could not open this link on your device.");
    }
  }

  async function startMessage() {
    if (!token) {
      router.push("/login" as any);
      return;
    }
    if (!restaurant.ownerId) {
      setError("Messaging unavailable");
      return;
    }
    if (Number(user?.id) === Number(restaurant.ownerId)) {
      setError("You cannot message your own business.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${getApiBase()}/restaurants/${restaurant.id}/conversations`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: "{}",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not start chat");
      router.push(`/chat/${data.id}` as any);
    } catch (e: any) {
      setError(e?.message || "Could not start chat");
    } finally {
      setBusy(false);
    }
  }

  const actions = [
    tel
      ? { key: "call", label: t("restaurant_call") || "Call", onPress: () => void openUrl(tel) }
      : null,
    {
      key: "message",
      label: t("restaurant_message") || "Message",
      onPress: () => void startMessage(),
      disabled: busy,
    },
    wa
      ? { key: "whatsapp", label: "WhatsApp", onPress: () => void openUrl(wa) }
      : null,
    directions
      ? {
          key: "directions",
          label: t("restaurant_directions") || "Directions",
          onPress: () => void openUrl(directions),
        }
      : null,
    {
      key: "save",
      label: saved ? t("restaurant_saved") || "Saved" : t("restaurant_save") || "Save",
      onPress: () => {
        void toggleFavorite(restaurant.id).then((ids) => onSavedChange(ids.includes(restaurant.id)));
      },
    },
  ].filter(Boolean) as Array<{ key: string; label: string; onPress: () => void; disabled?: boolean }>;

  return (
    <View style={styles.wrap} testID="restaurant-contact-bar">
      <View style={styles.statusRow}>
        <View style={[styles.dot, open ? styles.dotOpen : styles.dotClosed]} />
        <Text style={[styles.statusText, open ? styles.openText : styles.closedText]}>
          {open ? t("restaurant_openNow") || "Open" : t("restaurant_closed") || "Closed"}
        </Text>
        <Text style={styles.hint}> · Contact available</Text>
      </View>

      <View style={styles.row}>
        {actions.map((a) => (
          <Pressable
            key={a.key}
            style={[styles.circleWrap, a.disabled && { opacity: 0.5 }]}
            disabled={a.disabled}
            onPress={a.onPress}
            testID={`restaurant-contact-${a.key}`}
          >
            <View style={styles.circle}>
              <Text style={styles.circleGlyph}>
                {a.key === "call"
                  ? "☎"
                  : a.key === "message"
                    ? "💬"
                    : a.key === "whatsapp"
                      ? "WA"
                      : a.key === "directions"
                        ? "📍"
                        : saved
                          ? "♥"
                          : "♡"}
              </Text>
            </View>
            <Text style={styles.label} numberOfLines={1}>
              {a.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <Pressable style={styles.primary} onPress={onViewMenu} testID="restaurant-view-menu">
        <Text style={styles.primaryText}>{t("restaurant_viewMenuOrder") || "View Menu & Order"}</Text>
      </Pressable>
      {restaurant.acceptsReservations !== false ? (
        <Pressable style={styles.secondary} onPress={onReserve} testID="restaurant-reserve-table">
          <Text style={styles.secondaryText}>{t("restaurant_reserveTable") || "Reserve a Table"}</Text>
        </Pressable>
      ) : null}
      {error ? <Text style={styles.err}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 14 },
  statusRow: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  dotOpen: { backgroundColor: T.accent },
  dotClosed: { backgroundColor: T.muted },
  statusText: { fontSize: 12, fontWeight: "800" },
  openText: { color: T.accent },
  closedText: { color: T.muted },
  hint: { fontSize: 11, color: T.muted },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 12 },
  circleWrap: { width: 64, alignItems: "center" },
  circle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#e8f2ec",
    alignItems: "center",
    justifyContent: "center",
  },
  circleGlyph: { fontSize: 16, fontWeight: "800", color: T.accent },
  label: { marginTop: 6, fontSize: 11, fontWeight: "700", color: T.ink, textAlign: "center" },
  primary: {
    backgroundColor: T.accent,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 8,
  },
  primaryText: { color: T.white, fontWeight: "900" },
  secondary: {
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.accent,
    backgroundColor: T.white,
  },
  secondaryText: { color: T.accent, fontWeight: "900" },
  err: { color: "#b91c1c", marginTop: 8, fontSize: 12 },
});
