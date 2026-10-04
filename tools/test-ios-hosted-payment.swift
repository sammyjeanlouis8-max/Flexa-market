import Foundation

let accepted = [
    "https://button.digicelgroup.com/MonCashPayment/Payment?token=test",
    "https://moncashbutton.digicelgroup.com/MonCashPayment/Payment",
    "https://sandbox.moncashbutton.digicelgroup.com/MonCashPayment/Payment",
    "HTTPS://BUTTON.DIGICELGROUP.COM/MonCashPayment/Payment",
    "https://button.digicelgroup.com:443/MonCashPayment/Payment"
]
let rejected = [
    "http://button.digicelgroup.com/MonCashPayment/Payment",
    "https://button.digicelgroup.com.attacker.invalid/pay",
    "https://attackerbutton.digicelgroup.com/pay",
    "https://user:secret@button.digicelgroup.com/pay",
    "https://user@button.digicelgroup.com/pay",
    "https://button.digicelgroup.com:8443/pay",
    "https://flexamarket.com/wallet",
    "https://checkout.stripe.com/pay",
    "https://attacker.invalid/pay",
    "javascript:alert(1)",
    "file:///etc/passwd"
]
for raw in accepted {
    precondition(HostedPaymentPolicy.accepts(URL(string: raw)!), "Trusted origin rejected")
}
for raw in rejected {
    precondition(!HostedPaymentPolicy.accepts(URL(string: raw)!), "Unsafe origin accepted")
}
let callbacks = [
    "https://flexamarket.com/api/bazik/return?reference=test",
    "https://flexamarket.com/api/moncash/return?transactionId=test"
]
for raw in callbacks {
    let url = URL(string: raw)!
    precondition(HostedPaymentPolicy.allowsNavigation(url), "Verification callback blocked")
    precondition(!HostedPaymentPolicy.isMerchantReturn(url), "Callback closed before verification")
}
let returns = [
    "https://flexamarket.com/?wallet_topup=paid",
    "https://flexamarket.com/?wallet_topup=already_processed",
    "https://flexamarket.com/?moncash=cancelled",
    "https://flexamarket.com/?moncash=pending",
    "https://flexamarket.com/?moncash=error",
    "https://flexamarket.com/?moncash=amount_mismatch",
    "https://flexamarket.com/wallet?moncash=success"
]
for raw in returns {
    let url = URL(string: raw)!
    precondition(HostedPaymentPolicy.isMerchantReturn(url), "Wallet return not recognized")
    precondition(HostedPaymentPolicy.allowsNavigation(url), "Wallet return not accepted")
}
let forbidden = [
    "http://flexamarket.com/?wallet_topup=paid",
    "https://flexamarket.com.attacker.invalid/?wallet_topup=paid",
    "https://user@flexamarket.com/?wallet_topup=paid",
    "https://flexamarket.com:8443/?wallet_topup=paid",
    "https://flexamarket.com/?wallet_topup=unknown",
    "https://flexamarket.com/admin",
    "https://attacker.invalid/?moncash=success",
    "flexamarket://wallet",
    "https://checkout.stripe.com/pay"
]
for raw in forbidden {
    let url = URL(string: raw)!
    precondition(!HostedPaymentPolicy.allowsNavigation(url), "Untrusted navigation accepted")
    precondition(!HostedPaymentPolicy.isMerchantReturn(url), "Untrusted return accepted")
}
print("PASS: \(accepted.count + rejected.count + callbacks.count + returns.count + forbidden.count) payment origin/return cases")