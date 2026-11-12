/**
 * Android Photo Picker / system media picker wrapper.
 *
 * Play Photo & Video Permissions policy: one-time / infrequent picks must use
 * the system picker and must NOT request READ_MEDIA_* or legacy storage access.
 * expo-image-picker's launchImageLibraryAsync uses the Android Photo Picker on
 * modern devices when media-library permission is not requested.
 */
import * as ImagePicker from "expo-image-picker";

export type SystemMediaAsset = {
  uri: string;
  mimeType?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  width?: number;
  height?: number;
  duration?: number | null;
};

export type SystemMediaPickResult =
  | { canceled: true; assets: [] }
  | { canceled: false; assets: SystemMediaAsset[] };

export type SystemMediaPickOptions = {
  mediaTypes: Array<"images" | "videos">;
  allowsMultipleSelection?: boolean;
  selectionLimit?: number;
  quality?: number;
  allowsEditing?: boolean;
  aspect?: [number, number];
  videoMaxDuration?: number;
};

/**
 * Open the system picker without requesting broad media-library access.
 * Cancellation (user dismisses picker) returns canceled:true — not an error.
 */
export async function pickSystemMedia(
  options: SystemMediaPickOptions,
): Promise<SystemMediaPickResult> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: options.mediaTypes,
    allowsMultipleSelection: options.allowsMultipleSelection ?? false,
    selectionLimit: options.selectionLimit,
    quality: options.quality ?? 0.8,
    allowsEditing: options.allowsEditing ?? false,
    aspect: options.aspect,
    videoMaxDuration: options.videoMaxDuration,
    // Prefer Android Photo Picker path (do not force legacy ACTION_GET_CONTENT).
    legacy: false,
  });

  if (result.canceled || !result.assets?.length) {
    return { canceled: true, assets: [] };
  }

  return {
    canceled: false,
    assets: result.assets.map((a) => ({
      uri: a.uri,
      mimeType: a.mimeType,
      fileName: a.fileName,
      fileSize: a.fileSize,
      width: a.width,
      height: a.height,
      duration: a.duration,
    })),
  };
}
