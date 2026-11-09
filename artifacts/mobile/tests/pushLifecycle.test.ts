import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isExpoPushTokenFormat,
  planLogoutTokenCleanup,
  planTokenRegistration,
} from "../lib/pushLifecycle.ts";

describe("pushLifecycle", () => {
  it("validates Expo token formats", () => {
    assert.equal(isExpoPushTokenFormat("ExponentPushToken[abc]"), true);
    assert.equal(isExpoPushTokenFormat("ExpoPushToken[abc]"), true);
    assert.equal(isExpoPushTokenFormat("fcm:raw"), false);
    assert.equal(isExpoPushTokenFormat(null), false);
  });

  it("plans logout unregister only when JWT clears and token exists", () => {
    const plan = planLogoutTokenCleanup({
      previousJwt: "jwt-old",
      nextJwt: null,
      expoToken: "ExponentPushToken[x]",
    });
    assert.equal(plan.shouldUnregister, true);
    assert.equal(plan.authJwtToUse, "jwt-old");

    assert.equal(
      planLogoutTokenCleanup({
        previousJwt: "jwt-old",
        nextJwt: "jwt-new",
        expoToken: "ExponentPushToken[x]",
      }).shouldUnregister,
      false,
    );

    assert.equal(
      planLogoutTokenCleanup({
        previousJwt: "jwt-old",
        nextJwt: null,
        expoToken: null,
      }).shouldUnregister,
      false,
    );
  });

  it("plans registration only when Firebase, permission, token, and JWT are ready", () => {
    assert.equal(
      planTokenRegistration({
        expoToken: "ExponentPushToken[x]",
        authJwt: "jwt",
        permissionGranted: true,
        firebaseConfiguredForPackage: true,
      }).shouldRegister,
      true,
    );
    assert.equal(
      planTokenRegistration({
        expoToken: "ExponentPushToken[x]",
        authJwt: "jwt",
        permissionGranted: true,
        firebaseConfiguredForPackage: false,
      }).reason,
      "firebase_android_app_missing",
    );
    assert.equal(
      planTokenRegistration({
        expoToken: "ExponentPushToken[x]",
        authJwt: null,
        permissionGranted: true,
        firebaseConfiguredForPackage: true,
      }).reason,
      "user_not_authenticated",
    );
  });
});
