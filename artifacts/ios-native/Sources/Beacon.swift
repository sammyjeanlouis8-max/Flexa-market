import Foundation

/// TEMPORARY diagnostic beacon (remove after iOS push is confirmed).
/// Posts a stage marker to the API's in-memory debug log so we can see
/// how far the native app gets before a crash.
enum Beacon {
    static func send(_ stage: String, _ detail: String = "") {
        guard let url = URL(string: "https://flexamarket.com/api/push/apns-debug") else { return }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let body: [String: String] = ["stage": "native-\(stage)", "detail": detail]
        req.httpBody = try? JSONSerialization.data(withJSONObject: body)
        URLSession.shared.dataTask(with: req).resume()
    }
}
