/**
 * Android: system Photo Picker (PickVisualMedia) via expo-image-picker —
 * no READ_MEDIA_* / storage permission. Falls back to the system file picker
 * (expo-document-picker) when Photo Picker is unavailable.
 * iOS: existing image library / document flows; library permission only when required.
 */
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { Alert, Linking, Platform } from "react-native";
import { persistPickedFile } from "./persistPickedFile";

export type PickedMedia = {
  uri: string;
  mimeType?: string | null;
  fileName?: string | null;
  width?: number | null;
  height?: number | null;
  duration?: number | null;
  /** How the asset was obtained */
  source: "photo-picker" | "file-picker" | "library";
};

export type PickMediaKind = "images" | "videos" | "all";

export type PickMediaOptions = {
  kind?: PickMediaKind;
  /** Max assets to return (enforced in-app; fallback pickers may ignore). */
  selectionLimit?: number;
  quality?: number;
  allowsEditing?: boolean;
  aspect?: [number, number];
  videoMaxDuration?: number;
  /** Copy into app documents so drafts remain readable after restart. */
  persist?: boolean;
  persistPrefix?: string;
  /** Shown when iOS library permission is denied. */
  permissionMessage?: string;
};

function mimeForKind(kind: PickMediaKind): string | string[] {
  if (kind === "images") return ["image/*"];
  if (kind === "videos") return ["video/*"];
  return ["image/*", "video/*"];
}

function mediaTypesForKind(kind: PickMediaKind): ImagePicker.MediaType[] {
  if (kind === "images") return ["images"];
  if (kind === "videos") return ["videos"];
  return ["images", "videos"];
}

function openSettingsHint() {
  Alert.alert(
    "Permission needed",
    "Photo access is turned off. You can still use the system picker on Android, or enable Photos in Settings on iOS.",
    [
      { text: "Not now", style: "cancel" },
      { text: "Open Settings", onPress: () => void Linking.openSettings() },
    ],
  );
}

async function ensureIosLibraryAccess(message?: string): Promise<boolean> {
  if (Platform.OS !== "ios") return true;
  const current = await ImagePicker.getMediaLibraryPermissionsAsync();
  if (current.granted || current.accessPrivileges === "limited") return true;
  const asked = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (asked.granted || asked.accessPrivileges === "limited") return true;
  if (asked.canAskAgain === false) {
    openSettingsHint();
  } else {
    Alert.alert(
      "Permission needed",
      message || "Allow photo library access to attach media.",
    );
  }
  return false;
}

async function fromDocumentPicker(
  kind: PickMediaKind,
  selectionLimit: number,
): Promise<PickedMedia[]> {
  const result = await DocumentPicker.getDocumentAsync({
    type: mimeForKind(kind),
    multiple: selectionLimit > 1,
    copyToCacheDirectory: true,
  });
  if (result.canceled || !result.assets?.length) return [];
  // Enforce limit in app code — fallback pickers may ignore selectionLimit.
  return result.assets.slice(0, selectionLimit).map((a) => ({
    uri: a.uri,
    mimeType: a.mimeType,
    fileName: a.name,
    source: "file-picker" as const,
  }));
}

async function fromImagePicker(
  opts: PickMediaOptions,
  selectionLimit: number,
): Promise<PickedMedia[]> {
  const kind = opts.kind ?? "images";
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: mediaTypesForKind(kind),
    allowsMultipleSelection: selectionLimit > 1,
    selectionLimit,
    quality: opts.quality ?? 0.85,
    allowsEditing: opts.allowsEditing ?? false,
    aspect: opts.aspect,
    videoMaxDuration: opts.videoMaxDuration,
  });
  if (result.canceled || !result.assets?.length) return [];
  return result.assets.slice(0, selectionLimit).map((a) => ({
    uri: a.uri,
    mimeType: a.mimeType,
    fileName: a.fileName,
    width: a.width,
    height: a.height,
    duration: a.duration,
    source: Platform.OS === "android" ? ("photo-picker" as const) : ("library" as const),
  }));
}

/**
 * Pick existing photos/videos without requesting READ_MEDIA_* on Android.
 * Returns [] on cancel. Throws only on unexpected failures after user selected files.
 */
export async function pickMedia(options: PickMediaOptions = {}): Promise<PickedMedia[]> {
  const kind = options.kind ?? "images";
  const selectionLimit = Math.max(1, Math.min(options.selectionLimit ?? 1, 8));
  const persist = options.persist !== false;

  if (Platform.OS === "ios") {
    const ok = await ensureIosLibraryAccess(options.permissionMessage);
    if (!ok) return [];
  }
  // Android Photo Picker / modern PickVisualMedia: do NOT call
  // requestMediaLibraryPermissionsAsync — that triggers broad gallery prompts.

  let assets: PickedMedia[] = [];
  try {
    assets = await fromImagePicker({ ...options, kind }, selectionLimit);
  } catch (e) {
    // Photo Picker unavailable / OEM gap → system file picker fallback.
    try {
      assets = await fromDocumentPicker(kind, selectionLimit);
    } catch {
      Alert.alert(
        "Could not open picker",
        e instanceof Error ? e.message : "Try again or use a different device.",
      );
      return [];
    }
  }

  // If ImagePicker returned empty without cancel on a device that lacks Photo
  // Picker support, offer document fallback once (Android only).
  if (!assets.length && Platform.OS === "android") {
    // User cancelled — return empty. Callers that need an explicit fallback
    // can call pickMediaWithFileFallback.
  }

  if (!persist || !assets.length) {
    return assets.slice(0, selectionLimit);
  }

  const durable: PickedMedia[] = [];
  for (const a of assets.slice(0, selectionLimit)) {
    const uri = await persistPickedFile(a.uri, {
      fileName: a.fileName,
      mimeType: a.mimeType,
      prefix: options.persistPrefix || kind,
    });
    durable.push({ ...a, uri });
  }
  return durable;
}

/** Force file-picker path (used when Photo Picker failed mid-flow). */
export async function pickMediaWithFileFallback(
  options: PickMediaOptions = {},
): Promise<PickedMedia[]> {
  const kind = options.kind ?? "images";
  const selectionLimit = Math.max(1, Math.min(options.selectionLimit ?? 1, 8));
  const persist = options.persist !== false;
  let assets = await fromDocumentPicker(kind, selectionLimit);
  if (!assets.length) return [];
  if (!persist) return assets.slice(0, selectionLimit);
  const durable: PickedMedia[] = [];
  for (const a of assets.slice(0, selectionLimit)) {
    const uri = await persistPickedFile(a.uri, {
      fileName: a.fileName,
      mimeType: a.mimeType,
      prefix: options.persistPrefix || kind,
    });
    durable.push({ ...a, uri });
  }
  return durable;
}

/**
 * Prefer Photo Picker; if it errors, automatically open the file picker.
 * Cancellation of Photo Picker does not open the fallback.
 */
export async function pickExistingMedia(
  options: PickMediaOptions = {},
): Promise<PickedMedia[]> {
  const kind = options.kind ?? "images";
  const selectionLimit = Math.max(1, Math.min(options.selectionLimit ?? 1, 8));

  if (Platform.OS === "ios") {
    return pickMedia(options);
  }

  try {
    const assets = await fromImagePicker({ ...options, kind }, selectionLimit);
    if (!assets.length) return []; // cancelled
    if (options.persist === false) return assets.slice(0, selectionLimit);
    const durable: PickedMedia[] = [];
    for (const a of assets.slice(0, selectionLimit)) {
      const uri = await persistPickedFile(a.uri, {
        fileName: a.fileName,
        mimeType: a.mimeType,
        prefix: options.persistPrefix || kind,
      });
      durable.push({ ...a, uri });
    }
    return durable;
  } catch {
    return pickMediaWithFileFallback(options);
  }
}
