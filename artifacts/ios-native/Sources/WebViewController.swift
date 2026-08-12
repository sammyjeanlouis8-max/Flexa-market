import UIKit
import WebKit
import UserNotifications

private let kWebsite = URL(string: "https://flexamarket.com")!

final class WebViewController: UIViewController {

    private var webView: WKWebView!
    private let spinner = UIActivityIndicatorView(style: .large)
    private var offlineView: OfflineView?
    /// Prevents repeat permission requests within one app session.
    private var pushHandled = false

    override func viewDidLoad() {
        super.viewDidLoad()
        setupWebView()
        setupSpinner()
        loadSite()

        NotificationCenter.default.addObserver(
            self, selector: #selector(handleApnsToken(_:)),
            name: .apnsTokenReceived, object: nil)
        NotificationCenter.default.addObserver(
            self, selector: #selector(handleOpenURL(_:)),
            name: .openURL, object: nil)
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    @objc private func handleApnsToken(_ n: Notification) {
        if let token = n.object as? String { injectPushToken(token) }
    }

    @objc private func handleOpenURL(_ n: Notification) {
        if let url = n.userInfo?["url"] as? URL {
            webView?.load(URLRequest(url: url))
        }
    }

    // MARK: – WebView setup

    private func setupWebView() {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true

        // Inject before any page script:
        //  1. __iosWebView flag → website disables its own web-push path
        //  2. Unregister any cached service workers to avoid implicit APNs conflicts
        let bootstrap = WKUserScript(source: """
            window.__iosWebView = true;
            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.getRegistrations().then(function(rs) {
                    rs.forEach(function(r) { r.unregister(); });
                });
            }
        """, injectionTime: .atDocumentStart, forMainFrameOnly: false)
        config.userContentController.addUserScript(bootstrap)

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

    // MARK: – Navigation

    private func loadSite() {
        offlineView?.removeFromSuperview()
        offlineView = nil
        webView.load(URLRequest(url: kWebsite))
    }

    // MARK: – Push

    /// Called once per session, after the first page load completes.
    /// By this point the injected JS has already unregistered any cached
    /// service workers, so there is no implicit APNs conflict.
    private func handlePushPermission() {
        guard !pushHandled else { return }
        pushHandled = true

        Task { @MainActor in
            let center = UNUserNotificationCenter.current()
            let settings = await center.notificationSettings()

            switch settings.authorizationStatus {
            case .notDetermined:
                // Show the system permission dialog
                let granted = (try? await center.requestAuthorization(
                    options: [.alert, .badge, .sound])) ?? false
                if granted {
                    UIApplication.shared.registerForRemoteNotifications()
                }

            case .authorized, .provisional, .ephemeral:
                // Permission already granted — just ensure we have a token
                UIApplication.shared.registerForRemoteNotifications()

            case .denied:
                // User previously denied — can't prompt again; they must go to Settings
                break

            @unknown default:
                break
            }
        }
    }

    // MARK: – Token injection

    func injectPushToken(_ token: String) {
        guard let data = try? JSONSerialization.data(withJSONObject: token),
              let json = String(data: data, encoding: .utf8) else { return }
        webView?.evaluateJavaScript("""
        (function(){
          window.__apnsToken = \(json);
          if (typeof window.__onApnsToken === 'function')
            window.__onApnsToken(\(json));
        })();
        """, completionHandler: nil)
    }

    // MARK: – Offline

    private func showOffline() {
        guard offlineView == nil else { return }
        let ov = OfflineView { [weak self] in self?.loadSite() }
        ov.frame = view.bounds
        ov.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(ov)
        offlineView = ov
    }
}

// MARK: – WKNavigationDelegate

extension WebViewController: WKNavigationDelegate {

    func webView(_ webView: WKWebView,
                 didStartProvisionalNavigation _: WKNavigation!) {
        spinner.startAnimating()
    }

    func webView(_ webView: WKWebView, didFinish _: WKNavigation!) {
        spinner.stopAnimating()
        // Inject token if we already have one (app re-open after token was received)
        if let token = NotificationDelegate.shared.apnsToken {
            injectPushToken(token)
        }
        // Request push permission now — service workers are cleared by this point
        handlePushPermission()
    }

    func webView(_ webView: WKWebView,
                 didFailProvisionalNavigation _: WKNavigation!, withError _: Error) {
        spinner.stopAnimating(); showOffline()
    }

    func webView(_ webView: WKWebView,
                 didFail _: WKNavigation!, withError _: Error) {
        spinner.stopAnimating(); showOffline()
    }

    func webView(_ webView: WKWebView,
                 decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { decisionHandler(.allow); return }
        let host = url.host ?? ""
        let inApp = host == "flexamarket.com"
            || host.hasSuffix(".flexamarket.com")
            || host == "stripe.com" || host.hasSuffix(".stripe.com")
            || url.scheme == "about" || url.scheme == "blob"
        if inApp || action.targetFrame?.isMainFrame == true {
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
                 createWebViewWith _: WKWebViewConfiguration,
                 for action: WKNavigationAction,
                 windowFeatures _: WKWindowFeatures) -> WKWebView? {
        if let url = action.request.url { webView.load(URLRequest(url: url)) }
        return nil
    }
}

// MARK: – Offline view

private final class OfflineView: UIView {
    private let retry: () -> Void
    init(retry: @escaping () -> Void) {
        self.retry = retry; super.init(frame: .zero); setup()
    }
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
        cfg.titleTextAttributesTransformer = UIConfigurationTextAttributesTransformer {
            var a = $0; a.font = .boldSystemFont(ofSize: 17); return a
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
