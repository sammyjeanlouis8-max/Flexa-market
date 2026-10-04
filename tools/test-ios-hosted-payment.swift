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
print("PASS: \(accepted.count + rejected.count) hosted payment origin cases")