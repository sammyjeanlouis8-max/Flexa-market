import assert from "node:assert/strict";
import { describe, it } from "node:test";

/**
 * Token format gate used by registerExpoPushToken.
 * Backend requires Expo-format tokens (not raw FCM).
 */
function isExpoPushToken(token: string): boolean {
  return token.startsWith("ExponentPushToken") || token.startsWith("Expo");
}

describe("pushToken format", () => {
  it("accepts Expo push token formats", () => {
    assert.equal(isExpoPushToken("ExponentPushToken[abc]"), true);
    assert.equal(isExpoPushToken("ExpoPushToken[abc]"), true);
  });

  it("rejects raw FCM / empty tokens", () => {
    assert.equal(isExpoPushToken("fcm:raw-device-token"), false);
    assert.equal(isExpoPushToken(""), false);
    assert.equal(isExpoPushToken("apns:deadbeef"), false);
  });
});
