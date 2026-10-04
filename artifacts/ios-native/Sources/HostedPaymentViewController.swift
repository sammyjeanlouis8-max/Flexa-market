import UIKit
import WebKit

/// A separate, ephemeral WebView: no marketplace cookies, native bridges,
/// injected JavaScript, PIN inspection, or external-browser fallback.
final class HostedPaymentViewController: UIViewController, WKNavigationDelegate, WKUIDelegate {
    private let checkoutURL: URL
    private let onClose: () -> Void
    private var paymentWebView: WKWebView!
    private let spinner = UIActivityIndicatorView(style: .medium)
    private let notice = UILabel()
    private var finished = false

    init(url: URL, onClose: @escaping () -> Void) {
        self.checkoutURL = url
        self.onClose = onClose
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is unavailable") }

    override func viewDidLoad() {
        super.viewDidLoad()
        title = "Peman MonCash"
        view.backgroundColor = .systemBackground
        navigationItem.leftBarButtonItem = UIBarButtonItem(
            title: "Retounen", style: .plain, target: self, action: #selector(closeTapped)
        )
        spinner.hidesWhenStopped = true
        navigationItem.rightBarButtonItem = UIBarButtonItem(customView: spinner)
        let appearance = UINavigationBarAppearance()
        appearance.configureWithOpaqueBackground()
        appearance.backgroundColor = .systemBackground
        navigationController?.navigationBar.standardAppearance = appearance
        navigationController?.navigationBar.scrollEdgeAppearance = appearance
        navigationController?.navigationBar.tintColor = UIColor(red: 0.98, green: 0.45, blue: 0.09, alpha: 1)

        notice.text = "PIN lan antre sèlman sou paj ofisyèl MonCash la."
        notice.font = .systemFont(ofSize: 12)
        notice.textColor = .secondaryLabel
        notice.numberOfLines = 0
        notice.textAlignment = .center
        notice.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(notice)

        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        configuration.userContentController = WKUserContentController()
        paymentWebView = WKWebView(frame: .zero, configuration: configuration)
        paymentWebView.navigationDelegate = self
        paymentWebView.uiDelegate = self
        paymentWebView.allowsLinkPreview = false
        paymentWebView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(paymentWebView)
        NSLayoutConstraint.activate([
            notice.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 8),
            notice.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 16),
            notice.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -16),
            paymentWebView.topAnchor.constraint(equalTo: notice.bottomAnchor, constant: 8),
            paymentWebView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            paymentWebView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            paymentWebView.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor)
        ])
        guard HostedPaymentPolicy.accepts(checkoutURL) else {
            showProblem("Lyen peman sa a pa otorize. Peze Retounen.")
            return
        }
        spinner.startAnimating()
        // Exactly one load. Never retry creation, reload a submitted form, or
        // transfer the marketplace's authorization headers into the payment view.
        paymentWebView.load(URLRequest(url: checkoutURL, timeoutInterval: 30))
    }

    @objc private func closeTapped() { finish() }

    private func finish() {
        guard !finished else { return }
        finished = true
        spinner.stopAnimating()
        paymentWebView?.stopLoading()
        onClose()
    }

    private func showProblem(_ text: String) {
        spinner.stopAnimating()
        notice.text = text
        notice.textColor = .systemRed
    }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { decisionHandler(.cancel); return }
        let isMainOrPopup = action.targetFrame == nil || action.targetFrame?.isMainFrame == true
        if !isMainOrPopup {
            // Allow HTTPS provider-owned subframes (e.g. CAPTCHA), but no
            // cleartext or native-app schemes. There are no native bridges.
            decisionHandler(HostedPaymentPolicy.isSecure(url) || url.absoluteString == "about:blank" ? .allow : .cancel)
            return
        }
        if HostedPaymentPolicy.isMerchantReturn(url) {
            decisionHandler(.cancel)
            // This only closes the UI. The original authenticated wallet
            // independently verifies the provider and refreshes its balance.
            finish()
            return
        }
        guard HostedPaymentPolicy.allowsNavigation(url) else {
            decisionHandler(.cancel)
            showProblem("Lyen sa a pa otorize nan peman an. Peze Retounen pou verifye bous ou.")
            return
        }
        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        guard let url = action.request.url else { return nil }
        if HostedPaymentPolicy.isMerchantReturn(url) {
            finish()
        } else if HostedPaymentPolicy.allowsNavigation(url) {
            // Keep target=_blank inside this same screen and preserve a form's
            // original method/body without reading or logging its contents.
            webView.load(action.request)
        } else {
            showProblem("Lyen sa a pa otorize nan peman an. Peze Retounen.")
        }
        return nil
    }

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        spinner.startAnimating()
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        guard !finished, presentedViewController == nil,
              let url = frame.request.url, HostedPaymentPolicy.accepts(url) else {
            completionHandler()
            return
        }
        let alert = UIAlertController(title: "MonCash", message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() })
        present(alert, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        guard !finished, presentedViewController == nil,
              let url = frame.request.url, HostedPaymentPolicy.accepts(url) else {
            completionHandler(false)
            return
        }
        let alert = UIAlertController(title: "MonCash", message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Anile", style: .cancel) { _ in completionHandler(false) })
        alert.addAction(UIAlertAction(title: "Kontinye", style: .default) { _ in completionHandler(true) })
        present(alert, animated: true)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        spinner.stopAnimating()
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!,
                 withError error: Error) { handleFailure(error) }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!,
                 withError error: Error) { handleFailure(error) }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        showProblem("Paj peman an fèmen. Peze Retounen pou verifye bous ou; pa repete yon peman ou deja valide.")
    }

    private func handleFailure(_ error: Error) {
        guard !finished, (error as NSError).code != NSURLErrorCancelled else { return }
        showProblem("Paj peman an pa chaje. Peze Retounen pou verifye bous ou; pa repete yon peman ou deja valide.")
    }
}