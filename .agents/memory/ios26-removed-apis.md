---
name: iOS 26 removed APIs and launch pitfalls
description: APIs removed in iOS 26 and launch-time crash causes found across builds 66–68
---

## Rules

**UIButton.contentEdgeInsets removed in iOS 26**
Use `UIButton.Configuration` instead (`UIButton.Configuration.filled()`, set `contentInsets` via `NSDirectionalEdgeInsets`). Deployment target iOS 15+ required (which is already the project minimum).

**WKPreferences private KVC key `allowFileAccessFromFileURLs` unsafe**
Drop `config.preferences.setValue(true, forKey: "allowFileAccessFromFileURLs")` — private API, crashes or is silently ignored on newer iOS.

**Missing UILaunchScreen image crashes on iOS 26**
If `Info.plist` has `UILaunchScreen → UIImageName` referencing an asset that doesn't exist in Assets.xcassets, iOS 26 crashes at launch (older iOS silently ignored the missing image). Fix: remove the `UIImageName` key or add the missing `.imageset`.

**`UIRequiredDeviceCapabilities: armv7` is stale**
Use `arm64` — armv7 (32-bit) devices haven't been supported since iPhone 5s. Leaving `armv7` can cause App Store validation warnings.

**`requestAuthorization` must NOT be called from `viewDidLoad`**
On iOS 26, calling `UNUserNotificationCenter.current().requestAuthorization(options:completionHandler:)` in `viewDidLoad` crashes the app at launch. The window is not yet key when `viewDidLoad` fires in the scene lifecycle. Fix: move the call to `viewDidAppear(_:)` with a `DispatchQueue.main.asyncAfter(deadline: .now() + 1.0)` delay. This was the root cause of builds 66–70 crashing on a device that previously worked.

**Why:**
Build 66 crashed on `contentEdgeInsets`. Build 67 fixed that but still crashed because `LaunchLogo` imageset was referenced but never created — only `LaunchBackground.colorset` exists in the catalog. Build 68 fixed the missing image ref and armv7. Builds 69–72 were isolation tests that narrowed the remaining crash to `requestAuthorization` in `viewDidLoad`. Build 73 fixed it by moving to `viewDidAppear`.

**How to apply:**
Before every build, grep Info.plist for `UIImageName` values and confirm each one has a matching `.imageset` folder in Assets.xcassets. Run `find artifacts/ios-native/Assets.xcassets -type d -name "*.imageset"` to list what exists.
