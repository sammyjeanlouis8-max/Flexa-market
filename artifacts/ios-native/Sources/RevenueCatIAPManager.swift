import Foundation
import UIKit
import RevenueCat

final class RevenueCatIAPManager {
    static let shared = RevenueCatIAPManager()
    private var configured = false
    private var userId: String?
    private let identificationQueue = DispatchQueue(label: "com.flexamarket.revenuecat.identification")

    private let productIds: [String: String] = [
        "standard": "com.flexamarket.subscription.standard.monthly",
        "premium": "com.flexamarket.subscription.premium.monthly",
        "vip": "com.flexamarket.subscription.vip.monthly"
    ]

    private init() {}

    @discardableResult
    func configure() throws -> Bool {
        guard !configured else { return true }
        guard let key = Bundle.main.object(forInfoDictionaryKey: "RevenueCatApiKey") as? String,
              !key.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              !key.contains("$(") else {
            throw NSError(domain: "FlexaRevenueCat", code: 1,
                          userInfo: [NSLocalizedDescriptionKey: "REVENUECAT_IOS_API_KEY is required to enable Apple subscriptions."])
        }
        Purchases.configure(withAPIKey: key)
        configured = true
        return true
    }

    func identify(userId: Int, completion: @escaping (Result<Void, Error>) -> Void) {
        identificationQueue.async {
            do { try self.configure() } catch { completion(.failure(error)); return }
            let id = String(userId)
            guard userId > 0 else {
                completion(.failure(NSError(domain: "FlexaRevenueCat", code: 2,
                                        userInfo: [NSLocalizedDescriptionKey: "Invalid RevenueCat user id."])))
                return
            }
            if self.userId == id { completion(.success(())); return }
            let finished = DispatchSemaphore(value: 0)
            var loginError: Error?
            Purchases.shared.logIn(id) { [weak self] _, _, error in
                loginError = error
                if error == nil { self?.userId = id }
                finished.signal()
            }
            finished.wait()
            if let loginError { completion(.failure(loginError)) } else { completion(.success(())) }
        }
    }

    func logout(completion: @escaping () -> Void) {
        identificationQueue.async {
            guard self.configured, self.userId != nil else { completion(); return }
            let finished = DispatchSemaphore(value: 0)
            Purchases.shared.logOut { [weak self] _, _ in
                self?.userId = nil
                finished.signal()
            }
            finished.wait()
            completion()
        }
    }

    func products(completion: @escaping (Result<[[String: String]], Error>) -> Void) {
        do { try configure() } catch { completion(.failure(error)); return }
        Purchases.shared.getOfferings { [weak self] offerings, error in
            if let error = error { completion(.failure(error)); return }
            let packages = offerings?.current?.availablePackages ?? []
            let result = packages.compactMap { package -> [String: String]? in
                guard let manager = self else { return nil }
                let plan = manager.productIds.first(where: { $0.value == package.storeProduct.productIdentifier })?.key
                guard let plan else { return nil }
                return ["plan": plan, "identifier": package.storeProduct.productIdentifier,
                        "priceString": package.storeProduct.localizedPriceString,
                        "title": package.storeProduct.localizedTitle]
            }
            completion(.success(result))
        }
    }

    func purchase(plan: String, expectedUserId: Int, completion: @escaping (Result<Bool, Error>) -> Void) {
        identificationQueue.async {
            guard self.userId == String(expectedUserId), expectedUserId > 0 else {
                completion(.failure(NSError(domain: "FlexaRevenueCat", code: 3,
                                            userInfo: [NSLocalizedDescriptionKey: "Identify the signed-in user before purchasing."])))
                return
            }
            let offeringsDone = DispatchSemaphore(value: 0)
            var offerings: Offerings?
            var offeringsError: Error?
            Purchases.shared.getOfferings { value, error in
                offerings = value
                offeringsError = error
                offeringsDone.signal()
            }
            offeringsDone.wait()
            if let offeringsError { completion(.failure(offeringsError)); return }
            guard let productId = self.productIds[plan],
                  let package = offerings?.current?.availablePackages.first(where: { $0.storeProduct.productIdentifier == productId }) else {
                completion(.failure(NSError(domain: "FlexaRevenueCat", code: 4,
                                            userInfo: [NSLocalizedDescriptionKey: "Subscription product is unavailable."])))
                return
            }
            // Identify/logout cannot run while this queue is waiting for the
            // StoreKit transaction, and this check is immediately before it.
            guard self.userId == String(expectedUserId) else {
                completion(.failure(NSError(domain: "FlexaRevenueCat", code: 3,
                                            userInfo: [NSLocalizedDescriptionKey: "RevenueCat user changed before purchase."])))
                return
            }
            let purchaseDone = DispatchSemaphore(value: 0)
            var purchaseResult: Result<Bool, Error> = .success(false)
            Purchases.shared.purchase(package: package) { _, _, error, userCancelled in
                if userCancelled || (error as NSError?)?.code == 1 {
                    purchaseResult = .success(false)
                } else if let error {
                    purchaseResult = .failure(error)
                } else {
                    purchaseResult = .success(true)
                }
                purchaseDone.signal()
            }
            purchaseDone.wait()
            completion(purchaseResult)
        }
    }

    func restore(expectedUserId: Int, completion: @escaping (Result<Void, Error>) -> Void) {
        identificationQueue.async {
            guard self.userId == String(expectedUserId), expectedUserId > 0 else {
                completion(.failure(NSError(domain: "FlexaRevenueCat", code: 3,
                                            userInfo: [NSLocalizedDescriptionKey: "Identify the signed-in user before restoring purchases."])))
                return
            }
            let restoreDone = DispatchSemaphore(value: 0)
            var restoreError: Error?
            Purchases.shared.restorePurchases { _, error in
                restoreError = error
                restoreDone.signal()
            }
            restoreDone.wait()
            if let restoreError { completion(.failure(restoreError)) }
            else { completion(.success(())) }
        }
    }

    func openManageSubscriptions() {
        guard let url = URL(string: "https://apps.apple.com/account/subscriptions") else { return }
        DispatchQueue.main.async { UIApplication.shared.open(url) }
    }
}