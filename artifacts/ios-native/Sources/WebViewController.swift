import UIKit
import WebKit

private let kWebsite = URL(string: "https://flexamarket.com")!

final class WebViewController: UIViewController {

    private var webView: WKWebView!

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.06, green: 0.09, blue: 0.16, alpha: 1)

        let webView = WKWebView(frame: view.bounds)
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        webView.navigationDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        self.webView = webView
        view.addSubview(webView)

        webView.load(URLRequest(url: kWebsite))
    }
}

extension WebViewController: WKNavigationDelegate {
    func webView(_ webView: WKWebView,
                 didFailProvisionalNavigation navigation: WKNavigation!,
                 withError error: Error) {
        // offline — show simple label, no crash risk
        let label = UILabel()
        label.text = "Pa gen koneksyon entènèt"
        label.textColor = .white
        label.textAlignment = .center
        label.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(label)
        NSLayoutConstraint.activate([
            label.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            label.centerYAnchor.constraint(equalTo: view.centerYAnchor),
        ])
    }
}
