import UIKit
import WebKit
import UserNotifications

private let kWebsite = URL(string: "https://flexamarket.com")!

final class WebViewController: UIViewController {

    private var webView: WKWebView!
    private let spinner = UIActivityIndicatorView(style: .large)
    private var offlineView: OfflineView?

    override func viewDidLoad() {
        super.viewDidLoad()
        setupWebView()
        setupSpinner()
        loadSite()

        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleApnsTokenNotification(_:)),
            name: .apnsTokenReceived,
            object: nil
        )
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleOpenURL(_:)),
            name: .openURL,
            object: nil
        )
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
        // Avoid WKWebView retain cycle with message handler
        webView?.configuration.userContentController
            .removeScriptMessageHandler(forName: "requestPushPermission")
    }

    // MARK: – APNs token received from AppDelegate

    @objc private func handleApnsTokenNotification(_ notification: Notification) {
        guard let token = notification.object as? String else { return }
        injectPushToken(token)
    }

    // MARK: – Deep-link URL from NotificationDelegate

    @objc private func handleOpenURL(_ notification: Notification) {
        guard let url = notification.userInfo?["url"] as? URL else { return }
        webView?.load(URLRequest(url: url))
    }

    // MARK: – WebView setup

    private func setupWebView() {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true

        let controller = config.userContentController

        // ── Inject flags BEFORE any page script runs ──────────────────────
        // 1. Mark this as the iOS native WebView so the website disables its
        //    own web-push path (isPushSupported returns false).
        // 2. Unregister any cached service workers that might have been left
        //    from a previous web-push session — avoids implicit permission
        //    conflicts with the native APNs flow.
        let bootstrap = WKUserScript(source: """
            window.__iosWebView = true;
            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.getRegistrations().then(function(rs) {
                    rs.forEach(function(r) { r.unregister(); });
                });
            }
        """, injectionTime: .atDocumentStart, forMainFrameOnly: false)
        controller.addUserScript(bootstrap)

        // ── Message handler: website asks Swift to request push permission ─
        // The website calls:
        //   window.webkit.messageHandlers.requestPushPermission.postMessage({})
        // Swift receives it here and calls requestAuthorization + registerForRemoteNotifications.
        // This ensures only ONE party triggers the native permission dialog.
        controller.add(ScriptMessageProxy(delegate: self),
                       name: "requestPushPermission")

        webView = WKWebView(frame: view.bounds, configuration: config)
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        webView.scrollView.contentInsetAdjustmentBehavior = .always
        webView.customUserAgent =
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) " +
            "AppleWebKit/605.1.15 (KHTML, like Gecko) " +
            "FlexaMarket/1.0 Mobile/15E148 Safari/604.1"

        view.addSubview(webView)
        view.backgroundColor = UIColor(red: 0.06, green: 0.09, blue: 0.16, alpha: 1)
    }

    private func setupSpinner() {
        spinner.color = .white
        spinner.hidesWhenStopped = true
        spinner.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(spinner)
        NSLayoutConstraint.activate([
            spinner.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            spinner.centerYAnchor.constraint(equalTo: view.centerYAnchor),
        ])
        spinner.startAnimating()
    }

    // MARK: – Loading

    private func loadSite() {
        offlineView?.removeFromSuperview()
        offlineView = nil
        webView.load(URLRequest(url: kWebsite))
    }

    // MARK: – Push token injection

    func injectPushToken(_ token: String) {
        guard let js = try? JSONSerialization.data(withJSONObject: token),
              let tokenJson = String(data: js, encoding: .utf8) else { return }
        let script = """
        (function(){
          window.__apnsToken = \(tokenJson);
          if (typeof window.__onApnsToken === 'function')
            window.__onApnsToken(\(tokenJson));
        })();
        """
        webView?.evaluateJavaScript(script, completionHandler: nil)
    }

    // MARK: – Offline UI

    private func showOffline() {
        guard offlineView == nil else { return }
        let ov = OfflineView { [weak self] in self?.loadSite() }
        ov.frame = view.bounds
        ov.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(ov)
        offlineView = ov
    }
}

// MARK: – Push permission (triggered by website JS)

extension WebViewController: WKScriptMessageHandler {
    func userContentController(_ userContentController: WKUserContentController,
                               didReceive message: WKScriptMessage) {
        guard message.name == "requestPushPermission" else { return }

        // Use async/await + @MainActor — correct way for Swift 6 runtime on iOS 26
        Task { @MainActor in
            let center = UNUserNotificationCenter.current()
            let settings = await center.notificationSettings()
            // Only show dialog if the user hasn't decided yet
            guard settings.authorizationStatus == .notDetermined else {
                // Already decided — if granted, just register for token
                if settings.authorizationStatus == .authorized {
                    UIApplication.shared.registerForRemoteNotifications()
                }
                return
            }
            guard let granted = try? await center.requestAuthorization(
                options: [.alert, .badge, .sound]) else { return }
            if granted {
                UIApplication.shared.registerForRemoteNotifications()
            }
        }
    }
}

// MARK: – WKScriptMessageHandler proxy (breaks retain cycle)

/// WKUserContentController retains its message handlers strongly.
/// This lightweight proxy holds a weak reference to the real delegate.
private final class ScriptMessageProxy: NSObject, WKScriptMessageHandler {
    weak var delegate: WKScriptMessageHandler?
    init(delegate: WKScriptMessageHandler) { self.delegate = delegate }
    func userContentController(_ c: WKUserContentController,
                               didReceive message: WKScriptMessage) {
        delegate?.userContentController(c, didReceive: message)
    }
}

// MARK: – WKNavigationDelegate

extension WebViewController: WKNavigationDelegate {

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        spinner.startAnimating()
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        spinner.stopAnimating()
        // If we already have a token (e.g. user re-opened app), inject it now
        if let token = NotificationDelegate.shared.apnsToken {
            injectPushToken(token)
        }
    }

    func webView(_ webView: WKWebView,
                 didFailProvisionalNavigation navigation: WKNavigation!,
                 withError error: Error) {
        spinner.stopAnimating()
        showOffline()
    }

    func webView(_ webView: WKWebView,
                 didFail navigation: WKNavigation!,
                 withError error: Error) {
        spinner.stopAnimating()
        showOffline()
    }

    func webView(_ webView: WKWebView,
                 decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { decisionHandler(.allow); return }
        let host = url.host ?? ""
        let inApp = host == "flexamarket.com"
            || host.hasSuffix(".flexamarket.com")
            || host == "stripe.com"
            || host.hasSuffix(".stripe.com")
            || url.scheme == "about"
            || url.scheme == "blob"
        if inApp || (navigationAction.targetFrame?.isMainFrame == true) {
            decisionHandler(.allow)
        } else {
            UIApplication.shared.open(url, options: [:], completionHandler: nil)
            decisionHandler(.cancel)
        }
    }
}

// MARK: – WKUIDelegate

extension WebViewController: WKUIDelegate {
    func webView(_ webView: WKWebView,
                 createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction,
                 windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url {
            webView.load(URLRequest(url: url))
        }
        return nil
    }
}

// MARK: – Offline View

private final class OfflineView: UIView {
    private let retry: () -> Void
    init(retry: @escaping () -> Void) { self.retry = retry; super.init(frame: .zero); setup() }
    required init?(coder: NSCoder) { fatalError() }

    private func setup() {
        backgroundColor = UIColor(red: 0.06, green: 0.09, blue: 0.16, alpha: 1)

        let emoji = UILabel(); emoji.text = "📵"
        emoji.font = .systemFont(ofSize: 64); emoji.textAlignment = .center

        let title = UILabel()
        title.text = "Pa gen koneksyon"
        title.font = .boldSystemFont(ofSize: 22)
        title.textColor = .white; title.textAlignment = .center

        let sub = UILabel()
        sub.text = "Vérifye koneksyon entènèt ou epi eseye ankò."
        sub.font = .systemFont(ofSize: 15)
        sub.textColor = UIColor.white.withAlphaComponent(0.6)
        sub.textAlignment = .center; sub.numberOfLines = 0

        var cfg = UIButton.Configuration.filled()
        cfg.title = "Eseye ankò"
        cfg.contentInsets = NSDirectionalEdgeInsets(top: 14, leading: 32, bottom: 14, trailing: 32)
        cfg.cornerStyle = .fixed; cfg.background.cornerRadius = 12
        cfg.baseBackgroundColor = UIColor(red: 0.98, green: 0.45, blue: 0.09, alpha: 1)
        cfg.baseForegroundColor = .white
        cfg.titleTextAttributesTransformer = UIConfigurationTextAttributesTransformer { a in
            var o = a; o.font = .boldSystemFont(ofSize: 17); return o
        }
        let btn = UIButton(configuration: cfg)
        btn.addTarget(self, action: #selector(retryTapped), for: .touchUpInside)

        let stack = UIStackView(arrangedSubviews: [emoji, title, sub, btn])
        stack.axis = .vertical; stack.alignment = .center; stack.spacing = 16
        stack.translatesAutoresizingMaskIntoConstraints = false
        addSubview(stack)
        NSLayoutConstraint.activate([
            stack.centerXAnchor.constraint(equalTo: centerXAnchor),
            stack.centerYAnchor.constraint(equalTo: centerYAnchor, constant: -40),
            stack.leadingAnchor.constraint(greaterThanOrEqualTo: leadingAnchor, constant: 32),
            stack.trailingAnchor.constraint(lessThanOrEqualTo: trailingAnchor, constant: -32),
        ])
    }
    @objc private func retryTapped() { retry() }
}
