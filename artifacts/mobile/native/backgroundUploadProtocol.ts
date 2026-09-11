export type FlexaUploadAction = "begin" | "append" | "start" | "status" | "cancel";

export interface FlexaUploadMessage {
  type: "flexa-upload";
  requestId: string;
  action: FlexaUploadAction;
  jobId: string;
  [key: string]: unknown;
}

function isNonEmptyString(value: unknown, maxLength = 4096): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength;
}

/**
 * This is deliberately transport-agnostic so it is covered by the Node test
 * suite as well as used by the React Native WebView shell.
 */
export function parseFlexaUploadMessage(raw: string): FlexaUploadMessage | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    const message = value as Record<string, unknown>;
    const action = message.action;
    if (
      message.type !== "flexa-upload" ||
      !isNonEmptyString(message.requestId, 128) ||
      !isNonEmptyString(message.jobId, 128) ||
      !["begin", "append", "start", "status", "cancel"].includes(String(action))
    ) {
      return null;
    }
    return message as FlexaUploadMessage;
  } catch {
    return null;
  }
}