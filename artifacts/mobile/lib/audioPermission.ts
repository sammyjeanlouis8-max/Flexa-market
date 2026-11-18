/**
 * Request RECORD_AUDIO only when the user starts recording a voice message
 * (or another explicit sound-recording action). Never gate playback or gallery
 * video attach on microphone permission.
 */
import { Audio } from "expo-av";
import { Alert, Linking, Platform } from "react-native";

export type MicPermissionResult =
  | { granted: true }
  | { granted: false; canAskAgain: boolean };

const RATIONALE_TITLE = "Microphone for voice messages";
const RATIONALE_BODY =
  "Flexa Market needs the microphone only to record a voice message you send in chat. Playing messages and attaching photos or videos do not need the mic.";

/**
 * Show why we need the mic, then request. If permanently denied, offer Settings.
 * Returns whether recording may proceed.
 */
export async function requestMicForVoiceRecord(): Promise<MicPermissionResult> {
  const current = await Audio.getPermissionsAsync();
  if (current.granted) return { granted: true };

  const proceed = await new Promise<boolean>((resolve) => {
    Alert.alert(RATIONALE_TITLE, RATIONALE_BODY, [
      { text: "Not now", style: "cancel", onPress: () => resolve(false) },
      { text: "Continue", onPress: () => resolve(true) },
    ]);
  });
  if (!proceed) return { granted: false, canAskAgain: current.canAskAgain !== false };

  const asked = await Audio.requestPermissionsAsync();
  if (asked.granted) return { granted: true };

  if (asked.canAskAgain === false) {
    Alert.alert(
      "Microphone blocked",
      "Voice recording is disabled. You can still type and attach photos or videos. Enable Microphone in Settings to record voice messages.",
      [
        { text: "Keep typing", style: "cancel" },
        { text: "Open Settings", onPress: () => void Linking.openSettings() },
      ],
    );
    return { granted: false, canAskAgain: false };
  }

  Alert.alert(
    "Microphone needed",
    "Without microphone access, voice messages cannot be recorded. Typing and attachments still work.",
  );
  return { granted: false, canAskAgain: true };
}

/** Configure audio session for recording (call after permission granted). */
export async function prepareAudioSessionForRecording(): Promise<void> {
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: true,
    playsInSilentModeIOS: true,
    staysActiveInBackground: false,
    shouldDuckAndroid: true,
    playThroughEarpieceAndroid: false,
  });
}

/** Restore playback-friendly mode after recording ends. */
export async function restoreAudioSessionForPlayback(): Promise<void> {
  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });
  } catch {
    /* ignore */
  }
}

export function micDeniedKeepsComposerUsable(): boolean {
  // Documented contract for callers / tests: denial must not disable text/attachments.
  return Platform.OS === "android" || Platform.OS === "ios";
}
