import Foundation

/// Only the documented MonCash payment origins get the in-app Safari handoff.
/// Exact hosts prevent suffix/lookalike domains from being trusted.
enum HostedPaymentPolicy {
    private static let hosts: Set<String> = [
        "button.digicelgroup.com",
        "moncashbutton.digicelgroup.com",
        "sandbox.moncashbutton.digicelgroup.com"
    ]

    static func accepts(_ url: URL) -> Bool {
        guard url.scheme?.lowercased() == "https",
              url.user == nil, url.password == nil,
              url.port == nil || url.port == 443,
              let host = url.host?.lowercased() else { return false }
        return hosts.contains(host)
    }
}