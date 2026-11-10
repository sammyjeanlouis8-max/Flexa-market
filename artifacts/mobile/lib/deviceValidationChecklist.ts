/**
 * Local-only Android device validation checklist.
 * Marks are stored on-device; never claims FCM/OTP success without human evidence.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "flexa.phase3s.deviceValidation.v1";

export type DeviceValidationItemId =
  | "signup"
  | "login"
  | "otp"
  | "fcm"
  | "navigation"
  | "seller_upload"
  | "video_upload"
  | "boost_feed"
  | "audio_sync"
  | "checkout"
  | "order_tracking"
  | "seller_ship"
  | "support_chat"
  | "admin_perms"
  | "bg_music";

export type DeviceValidationItem = {
  id: DeviceValidationItemId;
  label: string;
  requiresPhysicalDevice: boolean;
};

export const DEVICE_VALIDATION_ITEMS: DeviceValidationItem[] = [
  { id: "signup", label: "Signup", requiresPhysicalDevice: true },
  { id: "login", label: "Login (email + phone)", requiresPhysicalDevice: true },
  { id: "otp", label: "OTP delivery (SMS/email)", requiresPhysicalDevice: true },
  { id: "fcm", label: "Firebase / Expo push receipt", requiresPhysicalDevice: true },
  { id: "navigation", label: "Native navigation + Android back", requiresPhysicalDevice: true },
  { id: "seller_upload", label: "Seller product photo upload", requiresPhysicalDevice: true },
  { id: "video_upload", label: "Promotional / listing video upload", requiresPhysicalDevice: true },
  { id: "boost_feed", label: "Boost / promo feed (≤2 home)", requiresPhysicalDevice: true },
  { id: "audio_sync", label: "Scroll audio hard-stop", requiresPhysicalDevice: true },
  { id: "checkout", label: "Checkout (wallet / Stripe physical)", requiresPhysicalDevice: true },
  { id: "order_tracking", label: "Order tracking + Haiti PIN", requiresPhysicalDevice: true },
  { id: "seller_ship", label: "Seller ship + label", requiresPhysicalDevice: true },
  { id: "support_chat", label: "Support chat / tickets", requiresPhysicalDevice: true },
  { id: "admin_perms", label: "Admin role gates", requiresPhysicalDevice: true },
  { id: "bg_music", label: "Background music continuity", requiresPhysicalDevice: true },
];

export type DeviceValidationState = {
  checked: Partial<Record<DeviceValidationItemId, boolean>>;
  notes: string;
  updatedAt: string | null;
  /** Always false until a human records device evidence outside this checklist. */
  physicalDeviceVerified: false;
};

const EMPTY: DeviceValidationState = {
  checked: {},
  notes: "",
  updatedAt: null,
  physicalDeviceVerified: false,
};

export async function loadDeviceValidationState(): Promise<DeviceValidationState> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return { ...EMPTY, checked: {} };
    const parsed = JSON.parse(raw) as Partial<DeviceValidationState>;
    return {
      checked: parsed.checked ?? {},
      notes: typeof parsed.notes === "string" ? parsed.notes : "",
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : null,
      physicalDeviceVerified: false,
    };
  } catch {
    return { ...EMPTY, checked: {} };
  }
}

export async function saveDeviceValidationState(
  next: Omit<DeviceValidationState, "physicalDeviceVerified">,
): Promise<DeviceValidationState> {
  const payload: DeviceValidationState = {
    checked: next.checked,
    notes: next.notes,
    updatedAt: new Date().toISOString(),
    physicalDeviceVerified: false,
  };
  await AsyncStorage.setItem(KEY, JSON.stringify(payload));
  return payload;
}
