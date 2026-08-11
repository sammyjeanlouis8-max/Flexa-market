import UIKit
import WebKit
import UserNotifications

private let kWebsite = URL(string: "https://flexamarket.com")!

final class WebViewController: UIViewController {

    // MARK: – Properties

    private var webView: WKWebView!
    private let spinner = UIActivityIndicatorView(style: .large)
    private var offlineView: OfflineView?

    // MARK: – Lifecycle

    override func viewDidLoad() {
        super.viewDidLoad()
        setupWebView()
        setupSpinner()
        requestPushPermission()
        loadSite()

        // APNs token often arrives AFTER the first page load completes.
        // Listen for it here so we can inject it whenever it appears.
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleApnsTokenNotification(_:)),
            name: .apnsTokenReceived,
            object: nil
        )
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    @objc private func handleApnsTokenNotification(_ notification: Notification) {
        guard let token = notification.object as? String else { return }
        injectPushToken(token)
    }

    // MARK: – Setup

    private func setupWebView() {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        // Allow file/camera pickers to work inside WKWebView
        config.preferences.setValue(true, forKey: "allowFileAccessFromFileURLs")

        // Intercept console.log for debugging
        let script = WKUserScript(
            source: """
            window.__iosWebView = true;
            """,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: false
        )
        config.userContentController.addUserScript(script)

        webView = WKWebView(frame: view.bounds, configuration: config)
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        webView.scrollView.contentInsetAdjustmentBehavior = .always

        // Custom user agent keeps Stripe happy
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
        var request = URLRequest(url: kWebsite)
        request.cachePolicy = .useProtocolCachePolicy
        webView.load(request)
    }

    // MARK: – Push Notifications

    private func requestPushPermission() {
        UNUserNotificationCenter.current().requestAuthorization(
            options: [.alert, .badge, .sound]
        ) { granted, _ in
            guard granted else { return }
            DispatchQueue.main.async {
                UIApplication.shared.registerForRemoteNotifications()
            }
        }
    }

    func injectPushToken(_ token: String) {
        let js = """
        (function(){
          window.__apnsToken = \(jsonString(token));
          if (typeof window.__onApnsToken === 'function')
            window.__onApnsToken(\(jsonString(token)));
        })();
        """
        webView.evaluateJavaScript(js, completionHandler: nil)
    }

    private func jsonString(_ s: String) -> String {
        let data = try? JSONSerialization.data(withJSONObject: s)
        return data.flatMap { String(data: $0, encoding: .utf8) } ?? "\"\(s)\""
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

// MARK: – WKNavigationDelegate

extension WebViewController: WKNavigationDelegate {

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        spinner.startAnimating()
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        spinner.stopAnimating()
        // Inject push token if available
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

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        spinner.stopAnimating()
        showOffline()
    }

    func webView(_ webView: WKWebView,
                 decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.allow)
            return
        }
        // Allow flexamarket.com and Stripe; open everything else in Safari
        let host = url.host ?? ""
        let inApp = host == "flexamarket.com"
            || host.hasSuffix(".flexamarket.com")
            || host == "stripe.com"
            || host.hasSuffix(".stripe.com")
            || url.scheme == "about"
            || url.scheme == "blob"
            || navigationAction.targetFrame == nil
        if inApp || navigationAction.targetFrame != nil && navigationAction.targetFrame!.isMainFrame {
            decisionHandler(.allow)
        } else {
            UIApplication.shared.open(url, options: [:], completionHandler: nil)
            decisionHandler(.cancel)
        }
    }
}

// MARK: – WKUIDelegate (pop-ups, camera)

extension WebViewController: WKUIDelegate {
    func webView(_ webView: WKWebView,
                 createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction,
                 windowFeatures: WKWindowFeatures) -> WKWebView? {
        // Open target=_blank in the same WebView
        if let url = navigationAction.request.url {
            webView.load(URLRequest(url: url))
        }
        return nil
    }
}

// MARK: – Offline View

private final class OfflineView: UIView {
    private let retry: () -> Void

    init(retry: @escaping () -> Void) {
        self.retry = retry
        super.init(frame: .zero)
        setup()
    }
    required init?(coder: NSCoder) { fatalError() }

    private func setup() {
        backgroundColor = UIColor(red: 0.06, green: 0.09, blue: 0.16, alpha: 1)

        let emoji = UILabel()
        emoji.text = "📵"
        emoji.font = .systemFont(ofSize: 64)
        emoji.textAlignment = .center

        let title = UILabel()
        title.text = "Pa gen koneksyon"
        title.font = .boldSystemFont(ofSize: 22)
        title.textColor = .white
        title.textAlignment = .center

        let sub = UILabel()
        sub.text = "Vérifye koneksyon entènèt ou epi eseye ankò."
        sub.font = .systemFont(ofSize: 15)
        sub.textColor = UIColor.white.withAlphaComponent(0.6)
        sub.textAlignment = .center
        sub.numberOfLines = 0

        let btn = UIButton(type: .system)
        btn.setTitle("Eseye ankò", for: .normal)
        btn.titleLabel?.font = .boldSystemFont(ofSize: 17)
        btn.setTitleColor(.white, for: .normal)
        btn.backgroundColor = UIColor(red: 0.98, green: 0.45, blue: 0.09, alpha: 1)
        btn.layer.cornerRadius = 12
        btn.contentEdgeInsets = UIEdgeInsets(top: 14, left: 32, bottom: 14, right: 32)
        btn.addTarget(self, action: #selector(retryTapped), for: .touchUpInside)

        let stack = UIStackView(arrangedSubviews: [emoji, title, sub, btn])
        stack.axis = .vertical
        stack.alignment = .center
        stack.spacing = 16
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
