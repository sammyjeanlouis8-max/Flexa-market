import UIKit
import UserNotifications

final class NotificationDelegate: NSObject, UNUserNotificationCenterDelegate {

    static let shared = NotificationDelegate()
    private override init() { super.init() }

    var apnsToken: String?
    // A tap may arrive before SceneDelegate has created the WebView.
    var pendingNotificationURL: URL?
    private var lastNotificationKey: String?

    func handleNotificationResponse(_ response: UNNotificationResponse) {
        guard response.actionIdentifier == UNNotificationDefaultActionIdentifier,
              let value = response.notification.request.content.userInfo["url"] as? String,
              let base = URL(string: "https://flexamarket.com"),
              let url = URL(string: value, relativeTo: base)?.absoluteURL,
              url.scheme == "https", url.user == nil, url.password == nil,
              url.host == base.host else { return }
        let key = response.notification.request.identifier
            + ":" + String(response.notification.date.timeIntervalSince1970)
        DispatchQueue.main.async {
            guard self.lastNotificationKey != key else { return }
            self.lastNotificationKey = key
            self.pendingNotificationURL = url
            NotificationCenter.default.post(name: .openURL, object: nil)
        }
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .sound, .badge])
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        handleNotificationResponse(response)
        completionHandler()
    }
}

extension Notification.Name {
    static let openURL = Notification.Name("FlexaMarket.openURL")
}
