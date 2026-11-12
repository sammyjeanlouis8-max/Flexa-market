/**
 * Canonical Android notification channel IDs.
 * Must stay aligned with api-server `lib/pushChannels.ts`.
 */
export const PUSH_CHANNELS = {
  DEFAULT: "default",
  MESSAGES: "flexa-messages",
  ORDERS: "orders",
  ADMIN: "admin-broadcast",
  TV: "flexa-tv",
  SYSTEM: "system",
} as const;

export type PushChannelId = (typeof PUSH_CHANNELS)[keyof typeof PUSH_CHANNELS];

export const ALL_PUSH_CHANNEL_IDS: PushChannelId[] = Object.values(PUSH_CHANNELS);
