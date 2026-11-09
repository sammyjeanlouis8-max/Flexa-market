import { createLocalImage, type LocalSellImage } from "@/lib/imageUpload";
import { MAX_IMAGES } from "@/lib/sellValidation";
import * as ImagePicker from "expo-image-picker";
import { useCallback } from "react";
import { Alert, Platform } from "react-native";

/**
 * Android Photo Picker / system gallery picker.
 * Uses the system gallery picker only — no broad media-library permission
 * prompts. READ_MEDIA_* remain blocked in app.json for Play compliance.
 */
export function usePhotoPicker() {
  const pickImages = useCallback(async (alreadyCount: number): Promise<LocalSellImage[]> => {
    const remaining = MAX_IMAGES - alreadyCount;
    if (remaining <= 0) {
      Alert.alert("Photo limit", `You can add up to ${MAX_IMAGES} photos.`);
      return [];
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      selectionLimit: remaining,
      quality: 1,
      exif: false,
      // Prefer system picker path on modern Android without broad media permission.
      ...(Platform.OS === "android" ? { legacy: false } : {}),
    });

    if (result.canceled || !result.assets?.length) return [];

    const accepted: LocalSellImage[] = [];
    for (const asset of result.assets) {
      if (!asset.uri) continue;
      const mime = asset.mimeType || "image/jpeg";
      if (!mime.startsWith("image/")) {
        Alert.alert("Invalid file", "Only image files can be attached to a listing.");
        continue;
      }
      if (typeof asset.fileSize === "number" && asset.fileSize > 25 * 1024 * 1024) {
        Alert.alert("File too large", "Choose an image under 25 MB (it will be compressed before upload).");
        continue;
      }
      accepted.push(
        createLocalImage({
          uri: asset.uri,
          mimeType: mime,
          fileName: asset.fileName,
          fileSize: asset.fileSize,
        }),
      );
      if (accepted.length >= remaining) break;
    }
    return accepted;
  }, []);

  const takePhoto = useCallback(async (alreadyCount: number): Promise<LocalSellImage[]> => {
    if (alreadyCount >= MAX_IMAGES) {
      Alert.alert("Photo limit", `You can add up to ${MAX_IMAGES} photos.`);
      return [];
    }
    const cam = await ImagePicker.requestCameraPermissionsAsync();
    if (!cam.granted) {
      Alert.alert("Camera permission", "Camera access is needed to take product photos.");
      return [];
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 1,
      exif: false,
    });
    if (result.canceled || !result.assets?.[0]?.uri) return [];
    const asset = result.assets[0];
    return [
      createLocalImage({
        uri: asset.uri,
        mimeType: asset.mimeType || "image/jpeg",
        fileName: asset.fileName,
        fileSize: asset.fileSize,
      }),
    ];
  }, []);

  return { pickImages, takePhoto };
}
