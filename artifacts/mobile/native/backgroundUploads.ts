import { NativeModules, Platform } from "react-native";
import { requireOptionalNativeModule } from "expo";
import type { FlexaUploadMessage } from "./backgroundUploadProtocol";
export { parseFlexaUploadMessage } from "./backgroundUploadProtocol";
export type { FlexaUploadMessage } from "./backgroundUploadProtocol";

export interface FlexaUploadNativeModule {
  handle(message: FlexaUploadMessage): Promise<Record<string, unknown>>;
}

const nativeModule = requireOptionalNativeModule<FlexaUploadNativeModule>(
  "FlexaBackgroundUpload",
) ?? (NativeModules.FlexaBackgroundUpload as FlexaUploadNativeModule | undefined);

/** Expo Go deliberately reports unsupported: this capability needs the native module. */
export const hasNativeBackgroundUploads =
  Platform.OS === "android" && typeof nativeModule?.handle === "function";

export async function dispatchFlexaUpload(
  message: FlexaUploadMessage,
): Promise<Record<string, unknown>> {
  if (!hasNativeBackgroundUploads || !nativeModule) {
    throw new Error("Native background uploads are unavailable in this build.");
  }
  return nativeModule.handle(message);
}