import UIKit
import UserNotifications

extension Notification.Name {
    static let apnsTokenReceived = Notification.Name("apnsTokenReceived")
}

@main
class AppDelegate: UIResponder, UIApplicationDelegate {

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
    ) -> Bool {
        // Build 75: NO registerForRemoteNotifications here
        // Testing whether crash is in Task{@MainActor requestAuthorization} or registerForRemoteNotifications
        Beacon.send("launch-start")
        UNUserNotificationCenter.current().delegate = NotificationDelegate.shared
        Beacon.send("launch-delegate-set")
        return true
    }

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

    func application(_ application: UIApplication,
                     didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        let token = deviceToken.map { String(format: "%02x", $0) }.joined()
        Beacon.send("apns-token-received", String(token.prefix(12)))
        NotificationDelegate.shared.apnsToken = token
        DispatchQueue.main.async {
            NotificationCenter.default.post(name: .apnsTokenReceived, object: token)
        }
    }

    func application(_ application: UIApplication,
                     didFailToRegisterForRemoteNotificationsWithError error: Error) {
        Beacon.send("apns-register-failed", String(describing: error).prefix(200).description)
        print("[Push] Failed: \(error)")
    }
}
