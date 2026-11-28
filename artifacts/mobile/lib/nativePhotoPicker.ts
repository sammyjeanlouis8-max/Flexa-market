/**
 * Shared native photo pick + compress + upload for Restaurant / Beauty / Sell.
 * Android: system Photo Picker (no READ_MEDIA_*). iOS: PHPicker / camera.
 * Never uses HTML file inputs. Never exposes Wasabi credentials.
 */
import { Alert, Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { uploadLocalFile, type UploadProgress, type UploadResult } from "./mediaUpload";

export type NativePickedPhoto = {
  localUri: string;
  mimeType: string;
  fileName: string;
  width?: number;
  height?: number;
};

export type NativePhotoPickerCopy = {
  title?: string;
  gallery: string;
  camera: string;
  cancel: string;
  permPhotos: string;
  permCamera: string;
};

const DEFAULT_COPY: NativePhotoPickerCopy = {
  title: "Add photo",
  gallery: "Choose from Gallery",
  camera: "Take Photo",
  cancel: "Cancel",
  permPhotos: "Allow photo access to continue. You can also take a photo with the camera.",
  permCamera: "Camera access is required to take a photo.",
};

export type PickPhotosOptions = {
  multiple?: boolean;
  selectionLimit?: number;
  allowsEditing?: boolean;
  aspect?: [number, number];
  quality?: number;
  /** Max edge length after compress (default 1600). */
  maxEdge?: number;
  copy?: Partial<NativePhotoPickerCopy>;
};

function guessName(uri: string, fallback: string): string {
  const base = uri.split("?")[0].split("/").pop() || fallback;
  return base.includes(".") ? base : `${fallback}.jpg`;
}

function mimeFromUri(uri: string, fallback = "image/jpeg"): string {
  const lower = uri.toLowerCase().split("?")[0];
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".heic") || lower.endsWith(".heif")) return "image/heic";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  return fallback;
}

/**
 * Compress + normalize orientation via manipulateAsync (saves JPEG).
 * HEIC / large PNGs become JPEG for stable Wasabi uploads.
 */
export async function preparePhotoForUpload(
  asset: ImagePicker.ImagePickerAsset,
  opts?: { maxEdge?: number; compress?: number },
): Promise<NativePickedPhoto> {
  const maxEdge = opts?.maxEdge ?? 1600;
  const compress = opts?.compress ?? 0.78;
  const w = asset.width || 0;
  const h = asset.height || 0;
  const longest = Math.max(w, h);
  const actions: ImageManipulator.Action[] = [];
  if (longest > maxEdge && longest > 0) {
    if (w >= h) actions.push({ resize: { width: maxEdge } });
    else actions.push({ resize: { height: maxEdge } });
  }
  const result = await ImageManipulator.manipulateAsync(
    asset.uri,
    actions,
    {
      compress,
      format: ImageManipulator.SaveFormat.JPEG,
    },
  );
  return {
    localUri: result.uri,
    mimeType: "image/jpeg",
    fileName: guessName(result.uri, "photo").replace(/\.(heic|heif|png|webp)$/i, ".jpg"),
    width: result.width,
    height: result.height,
  };
}

async function ensureLibraryPermission(copy: NativePhotoPickerCopy): Promise<boolean> {
  // Android Photo Picker / iOS PHPicker: skip broad library permission on Android.
  if (Platform.OS === "ios") {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(copy.title || "Photos", copy.permPhotos);
      return false;
    }
  }
  return true;
}

async function ensureCameraPermission(copy: NativePhotoPickerCopy): Promise<boolean> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) {
    Alert.alert(copy.title || "Camera", copy.permCamera);
    return false;
  }
  return true;
}

export async function pickFromGallery(
  options: PickPhotosOptions = {},
): Promise<NativePickedPhoto[]> {
  const copy = { ...DEFAULT_COPY, ...options.copy };
  if (!(await ensureLibraryPermission(copy))) return [];

  const multiple = !!options.multiple;
  const limit = Math.max(1, options.selectionLimit ?? (multiple ? 8 : 1));
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsMultipleSelection: multiple,
    selectionLimit: multiple ? limit : 1,
    quality: options.quality ?? 0.85,
    allowsEditing: !multiple && !!options.allowsEditing,
    aspect: options.aspect,
    exif: false,
  });
  if (result.canceled || !result.assets?.length) return [];

  const prepared: NativePickedPhoto[] = [];
  const seen = new Set<string>();
  for (const asset of result.assets.slice(0, limit)) {
    const key = `${asset.assetId || ""}:${asset.uri}:${asset.fileSize || 0}`;
    if (seen.has(key)) continue;
    seen.add(key);
    prepared.push(await preparePhotoForUpload(asset, { maxEdge: options.maxEdge }));
  }
  return prepared;
}

export async function captureFromCamera(
  options: PickPhotosOptions = {},
): Promise<NativePickedPhoto[]> {
  const copy = { ...DEFAULT_COPY, ...options.copy };
  if (!(await ensureCameraPermission(copy))) return [];

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ["images"],
    quality: options.quality ?? 0.85,
    allowsEditing: !!options.allowsEditing,
    aspect: options.aspect,
    exif: false,
  });
  if (result.canceled || !result.assets?.[0]) return [];
  return [await preparePhotoForUpload(result.assets[0], { maxEdge: options.maxEdge })];
}

/**
 * Shows Gallery / Camera / Cancel, then returns prepared local photos (not uploaded).
 */
export function presentPhotoSourceMenu(
  options: PickPhotosOptions = {},
): Promise<NativePickedPhoto[]> {
  const copy = { ...DEFAULT_COPY, ...options.copy };
  return new Promise((resolve) => {
    Alert.alert(copy.title || "Add photo", undefined, [
      {
        text: copy.gallery,
        onPress: () => {
          void pickFromGallery(options).then(resolve);
        },
      },
      {
        text: copy.camera,
        onPress: () => {
          void captureFromCamera(options).then(resolve);
        },
      },
      {
        text: copy.cancel,
        style: "cancel",
        onPress: () => resolve([]),
      },
    ]);
  });
}

export async function uploadPickedPhoto(
  photo: NativePickedPhoto,
  opts: {
    token: string;
    onProgress?: (p: UploadProgress) => void;
    signal?: AbortSignal;
    fileName?: string;
  },
): Promise<UploadResult> {
  return uploadLocalFile(photo.localUri, {
    token: opts.token,
    contentType: photo.mimeType || "image/jpeg",
    fileName: opts.fileName || photo.fileName || "photo.jpg",
    onProgress: opts.onProgress,
    signal: opts.signal,
    timeoutMs: 60_000,
  });
}

export function isHttpsImageUrl(url: string | null | undefined): boolean {
  const u = String(url || "").trim();
  if (!u) return false;
  if (!/^https?:\/\//i.test(u)) return false;
  if (/^(data:|blob:|file:)/i.test(u)) return false;
  return true;
}

export { mimeFromUri };
