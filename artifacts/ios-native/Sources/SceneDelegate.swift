import UIKit
import UserNotifications

class SceneDelegate: UIResponder, UIWindowSceneDelegate {

    var window: UIWindow?

    func scene(
        _ scene: UIScene,
        willConnectTo session: UISceneSession,
        options connectionOptions: UIScene.ConnectionOptions
    ) {
        guard let windowScene = scene as? UIWindowScene else { return }

        let window = UIWindow(windowScene: windowScene)
        window.rootViewController = WebViewController()
        self.window = window
        window.makeKeyAndVisible()
    }

    func sceneDidBecomeActive(_ scene: UIScene) {
        // Clear the app icon badge whenever the user opens the app.
        // NOTE: do NOT use UNUserNotificationCenter here — any call into the
        // notification center at launch crashes on this device family (see
        // builds 73-77 and 81). The deprecated UIApplication API is safe.
        Beacon.send("scene-active-before-badge-clear")
        DispatchQueue.main.async {
            UIApplication.shared.applicationIconBadgeNumber = 0
            Beacon.send("scene-active-badge-cleared")
        }
    }
}
