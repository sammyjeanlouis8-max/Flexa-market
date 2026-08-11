import UIKit
import UserNotifications

/// Singleton that holds the APNs token and handles foreground notifications.
final class NotificationDelegate: NSObject, UNUserNotificationCenterDelegate {

    static let shared = NotificationDelegate()
    private override init() {
        super.init()
        UNUserNotificationCenter.current().delegate = self
    }

    var apnsToken: String?

    // Show notification banner even when app is in foreground
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .sound, .badge])
    }

    // Handle tap on notification
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        let userInfo = response.notification.request.content.userInfo
        if let urlString = userInfo["url"] as? String,
           let url = URL(string: urlString) {
            // Post to the active WebViewController
            NotificationCenter.default.post(
                name: .openURL,
                object: nil,
                userInfo: ["url": url]
            )
        }
        completionHandler()
    }
}

extension Notification.Name {
    static let openURL = Notification.Name("FlexaMarket.openURL")
}
