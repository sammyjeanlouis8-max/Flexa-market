import UIKit
import UserNotifications

// Fired on the main thread once Apple returns the APNs device token.
// WebViewController listens for this to inject the token even when
// it arrives after the initial page load finishes.
extension Notification.Name {
    static let apnsTokenReceived = Notification.Name("apnsTokenReceived")
}

@main
class AppDelegate: UIResponder, UIApplicationDelegate {

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
    ) -> Bool {
        // Register for remote notifications (push)
        UNUserNotificationCenter.current().delegate = NotificationDelegate.shared
        return true
    }

    // MARK: UISceneSession Lifecycle

    func application(
        _ application: UIApplication,
        configurationForConnecting connectingSceneSession: UISceneSession,
        options: UIScene.ConnectionOptions
    ) -> UISceneConfiguration {
        return UISceneConfiguration(
            name: "Default Configuration",
            sessionRole: connectingSceneSession.role
        )
    }

    // MARK: Push Notifications

    func application(_ application: UIApplication,
                     didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        let token = deviceToken.map { String(format: "%02x", $0) }.joined()
        NotificationDelegate.shared.apnsToken = token
        // Notify WebViewController — the page may have already loaded before
        // Apple returned this token, so we push it via NotificationCenter.
        DispatchQueue.main.async {
            NotificationCenter.default.post(name: .apnsTokenReceived, object: token)
        }
    }

    func application(_ application: UIApplication,
                     didFailToRegisterForRemoteNotificationsWithError error: Error) {
        print("[Push] Failed to register: \(error)")
    }
}
