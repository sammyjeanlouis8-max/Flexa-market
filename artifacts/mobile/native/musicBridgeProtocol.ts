/**
 * Pure WebView music message protocol — no React Native imports.
 * Covered by Node tests; re-exported from musicBridge.ts for the shell.
 */

export type FlexaMusicAction =
  | "play"
  | "pause"
  | "seek"
  | "load"
  | "queue"
  | "stop";

export interface FlexaMusicTrackPayload {
  id?: number | string;
  title?: string;
  artist?: string;
  url?: string;
  audio_url?: string;
  cover_url?: string | null;
  artwork?: string | null;
  [key: string]: unknown;
}

export interface FlexaMusicMessage {
  type: "flexa-music";
  action: FlexaMusicAction;
  track?: FlexaMusicTrackPayload;
  position?: number;
  queue?: FlexaMusicTrackPayload[];
  url?: string;
}

export interface FlexaMusicNativeEvent {
  type: "flexa-music-native";
  action: string;
  position?: number;
  state?: string;
  error?: string;
  [key: string]: unknown;
}

const ACTIONS = new Set<FlexaMusicAction>([
  "play",
  "pause",
  "seek",
  "load",
  "queue",
  "stop",
]);

function isNonEmptyString(value: unknown, maxLength = 8192): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength;
}

function isTrackPayload(value: unknown): value is FlexaMusicTrackPayload {
  return !!value && typeof value === "object";
}

/**
 * Pure parser — safe for Node tests and the React Native shell.
 */
export function parseFlexaMusicMessage(raw: string): FlexaMusicMessage | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    const message = value as Record<string, unknown>;
    if (message.type !== "flexa-music") return null;
    const action = message.action;
    if (!ACTIONS.has(action as FlexaMusicAction)) return null;

    const parsed: FlexaMusicMessage = {
      type: "flexa-music",
      action: action as FlexaMusicAction,
    };

    if (isTrackPayload(message.track)) parsed.track = message.track as FlexaMusicTrackPayload;
    if (typeof message.position === "number" && Number.isFinite(message.position)) {
      parsed.position = message.position;
    }
    if (isNonEmptyString(message.url, 16_384)) parsed.url = message.url;
    if (Array.isArray(message.queue)) {
      parsed.queue = message.queue.filter(isTrackPayload) as FlexaMusicTrackPayload[];
    }
    return parsed;
  } catch {
    return null;
  }
}

/** Build a JS snippet that notifies the WebView SPA of a native music event. */
export function buildMusicNativeReplyScript(event: FlexaMusicNativeEvent): string {
  return (
    `(function(){try{` +
    `if(typeof window.__flexaMusicNative==="function"){` +
    `window.__flexaMusicNative(${JSON.stringify(event)});` +
    `}` +
    `window.dispatchEvent(new CustomEvent("flexa-music-native",{detail:${JSON.stringify(event)}}));` +
    `}catch(e){}})();true;`
  );
}

/** Snippet that advertises native music capability to the SPA. */
export function buildNativeMusicCapabilityScript(): string {
  return (
    `(function(){try{` +
    `if(location.protocol==="https:"&&(location.hostname==="flexamarket.com"||location.hostname.endsWith(".flexamarket.com"))){` +
    `window.__flexaNativeMusic=true;` +
    `}` +
    `}catch(e){}})();true;`
  );
}
