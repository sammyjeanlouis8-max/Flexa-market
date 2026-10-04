import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { URL as FileURL } from "node:url";
import { classifyHostedPaymentUrl } from "../security/hostedPaymentPolicy.ts";
import { isTrustedMonCashUrl } from "../security/webviewPolicy.ts";

test("only exact HTTPS MonCash origins are accepted", () => {
  for (const url of [
    "https://button.digicelgroup.com/MonCashPayment/Payment?token=test",
    "https://moncashbutton.digicelgroup.com/MonCashPayment/Payment",
    "https://sandbox.moncashbutton.digicelgroup.com/MonCashPayment/Payment",
    "HTTPS://BUTTON.DIGICELGROUP.COM/pay", "https://button.digicelgroup.com:443/pay",
  ]) {
    assert.equal(classifyHostedPaymentUrl(url), "payment", url);
  }
  for (const url of [
    "http://button.digicelgroup.com/pay", "https://user:pin@button.digicelgroup.com/pay",
    "https://button.digicelgroup.com:8443/pay", "https://button.digicelgroup.com.evil.test/pay",
  ]) assert.equal(isTrustedMonCashUrl(url), false, url);
});

test("verification callbacks must load before the final wallet return closes UI", () => {
  for (const url of [
    "https://flexamarket.com/api/bazik/return?reference=test",
    "https://flexamarket.com/api/moncash/return?transactionId=test",
  ]) assert.equal(classifyHostedPaymentUrl(url), "verify");
  for (const query of [
    "wallet_topup=paid", "wallet_topup=already_processed", "moncash=cancelled",
    "moncash=pending", "moncash=error", "moncash=amount_mismatch", "moncash=success",
  ]) assert.equal(classifyHostedPaymentUrl(`https://flexamarket.com/?${query}`), "return");
  assert.equal(classifyHostedPaymentUrl("https://flexamarket.com/wallet?moncash=success"), "return");
});

test("unknown destinations and schemes cannot escape to a system browser", () => {
  for (const url of [
    "http://flexamarket.com/?wallet_topup=paid", "https://flexamarket.com.evil.test/?moncash=success",
    "https://user@flexamarket.com/?wallet_topup=paid", "https://flexamarket.com:8443/api/bazik/return",
    "https://flexamarket.com/?wallet_topup=unknown", "https://flexamarket.com/admin",
    "https://checkout.stripe.com/pay", "https://attacker.test/pay", "javascript:alert(1)",
    "file:///etc/passwd", "intent://payment", "tel:50912345678", "about:blank",
  ]) assert.equal(classifyHostedPaymentUrl(url), "blocked", url);
});

test("payment view has no app bridge, PIN-reading scripts, external launcher or global cookie deletion", () => {
  const component = readFileSync(new FileURL("../components/HostedPaymentScreen.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(component, /onMessage=|injectedJavaScript=|injectedJavaScriptBeforeContentLoaded=|injectJavaScript\(|Linking\.openURL\(/);
  assert.doesNotMatch(component, /\bincognito\s*(?:=|\/?>)/);
  assert.match(component, /originWhitelist=\{\["\*"\]\}/);
  assert.match(component, /mixedContentMode="never"/);
  assert.match(component, /onRequestClose=\{finish\}/);
  assert.match(component, /onRenderProcessGone=\{\(\) => fail\(\)\}/);
  assert.match(component, /useMemo\(\(\) => \(\{ uri: popupUrl \?\? url \}\)/);
  const app = readFileSync(new FileURL("../App.tsx", import.meta.url), "utf8");
  assert.match(app, /openHostedPayment\(request\.url\)/);
  assert.match(app, /openHostedPayment\(targetUrl\)/);
  assert.doesNotMatch(app, /if \(route === "moncash"[^{}]*\{\s*Linking\.openURL/);
});