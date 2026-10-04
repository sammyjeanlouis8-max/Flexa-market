import Foundation

/// Only the documented MonCash payment origins get an isolated payment screen.
/// Exact hosts prevent suffix/lookalike domains from being trusted.
enum HostedPaymentPolicy {
    private static let hosts: Set<String> = [
        "button.digicelgroup.com",
        "moncashbutton.digicelgroup.com",
        "sandbox.moncashbutton.digicelgroup.com"
    ]

    static func accepts(_ url: URL) -> Bool {
        return isSecure(url) && hosts.contains(url.host?.lowercased() ?? "")
    }

    static func isSecure(_ url: URL) -> Bool {
        guard url.scheme?.lowercased() == "https",
              url.user == nil, url.password == nil,
              url.port == nil || url.port == 443,
              url.host != nil else { return false }
        return true
    }

    static func isMerchantReturn(_ url: URL) -> Bool {
        guard isSecure(url), url.host?.lowercased() == "flexamarket.com",
              url.path == "/" || url.path == "/wallet" || url.path.isEmpty,
              let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems else {
            return false
        }
        return items.contains {
            ($0.name == "wallet_topup" && ["paid", "already_processed"].contains($0.value ?? ""))
            || ($0.name == "moncash" && ["cancelled", "error", "pending", "amount_mismatch", "success"].contains($0.value ?? ""))
        }
    }

    static func allowsNavigation(_ url: URL) -> Bool {
        if accepts(url) || isMerchantReturn(url) { return true }
        // Let the real server callback verify the order before intercepting its
        // final redirect. Callback/return query values never grant wallet credit.
        return isSecure(url) && url.host?.lowercased() == "flexamarket.com"
            && ["/api/bazik/return", "/api/moncash/return"].contains(url.path)
    }
}