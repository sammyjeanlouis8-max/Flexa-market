---
name: iOS 26 removed APIs and launch pitfalls
description: APIs removed in iOS 26, launch-time crash causes, and the working push notification architecture for WKWebView wrapper apps
---

## Rules

**UIButton.contentEdgeInsets removed in iOS 26**
Use `UIButton.Configuration` instead (`UIButton.Configuration.filled()`, set `contentInsets` via `NSDirectionalEdgeInsets`). Deployment target iOS 15+ required (which is already the project minimum).

**WKPreferences private KVC key `allowFileAccessFromFileURLs` unsafe**
Drop `config.preferences.setValue(true, forKey: "allowFileAccessFromFileURLs")` — private API, crashes or is silently ignored on newer iOS.

**Missing UILaunchScreen image crashes on iOS 26**
If `Info.plist` has `UILaunchScreen → UIImageName` referencing an asset that doesn't exist in Assets.xcassets, iOS 26 crashes at launch. Fix: remove the `UIImageName` key or add the missing `.imageset`.

**`UIRequiredDeviceCapabilities: armv7` is stale**
Use `arm64`.

**Direct Swift `requestAuthorization()` calls crash on iOS 26 — use reversed bridge**
All attempts to call `UNUserNotificationCenter.requestAuthorization()` directly from Swift
(closure, DispatchQueue.main.asyncAfter, Task {@MainActor}) crashed on iOS 26 in builds 73–77.
The ONLY working architecture is the reversed bridge:
1. WKUserScript injects `window.__iosWebView = true` + unregisters cached service workers at documentStart
2. `isPushSupported()` in push.ts returns false when `__iosWebView` is set (blocks web-push path)
3. `useExpoPushToken.ts` calls `window.webkit.messageHandlers.requestPushPermission.postMessage({})` when logged in + `__iosWebView`
4. WKScriptMessageHandler receives the message and calls `Task { @MainActor in ... requestAuthorization() ... registerForRemoteNotifications() }`
5. Use a `ScriptMessageProxy` (weak wrapper) to avoid WKUserContentController retain cycle
6. Remove the handler in `deinit` via `removeScriptMessageHandler(forName:)`

**Why:**
Builds 73–77 all crashed when Swift called `requestAuthorization()`. The root cause was likely a conflict between the website's service worker (which iOS 16.4+ WKWebView interprets as a web-push registration) and the native APNs permission call. Even with `isPushSupported()` returning false (preventing new web-push registrations), a cached service worker from a previous session could still conflict. The reversed bridge routes the call through WebKit's own message-passing system which handles the synchronization correctly.

**How to apply:**
See `artifacts/ios-native/Sources/WebViewController.swift` (build 78) for the complete implementation.
Before every build, grep Info.plist for `UIImageName` values and confirm each has a matching `.imageset` in Assets.xcassets.
