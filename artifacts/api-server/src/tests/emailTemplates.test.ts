import { describe, it, expect } from "vitest";
import {
  welcomeEmail,
  orderPlacedBuyerEmail,
  orderSoldSellerEmail,
  escrowReleasedSellerEmail,
  returnRequestedSellerEmail,
  returnStatusBuyerEmail,
  accountRestrictedEmail,
  passwordChangedEmail,
  crashAlertEmail,
  kycStatusEmail,
} from "../lib/emailTemplates";

describe("emailTemplates", () => {
  it("welcomeEmail generates correct subject and contains user name", () => {
    const { subject, html, text } = welcomeEmail("Jean Paul");
    expect(subject).toContain("Byenveni");
    expect(html).toContain("Jean Paul");
    expect(text).toContain("Jean Paul");
    expect(html).toContain("flexamarket.com");
    expect(html).toContain("<!DOCTYPE html>");
  });

  it("welcomeEmail handles special characters in name", () => {
    const { html } = welcomeEmail("Réseau & Co");
    expect(html).toContain("Réseau & Co");
  });

  it("orderPlacedBuyerEmail includes all required fields", () => {
    const { subject, html, text } = orderPlacedBuyerEmail({
      buyerName: "Marie",
      orderId: 1234,
      listingTitle: "iPhone 13 Pro",
      amount: 450.00,
      sellerName: "Bob Vendeur",
    });
    expect(subject).toContain("1234");
    expect(html).toContain("1234");
    expect(html).toContain("iPhone 13 Pro");
    expect(html).toContain("450.00");
    expect(html).toContain("Bob Vendeur");
    expect(text).toContain("iPhone 13 Pro");
  });

  it("orderSoldSellerEmail includes correct data", () => {
    const { subject, html, text } = orderSoldSellerEmail({
      sellerName: "Bob",
      orderId: 999,
      listingTitle: "Samsung Galaxy S24",
      amount: 320.50,
      buyerName: "Alice Achetè",
    });
    expect(subject).toContain("999");
    expect(html).toContain("Samsung Galaxy S24");
    expect(html).toContain("320.50");
    expect(html).toContain("Alice Achetè");
    expect(text).toContain("320.50");
  });

  it("escrowReleasedSellerEmail shows correct amount", () => {
    const { subject, html, text } = escrowReleasedSellerEmail({
      sellerName: "Vandè A",
      orderId: 555,
      listingTitle: "Laptop Dell",
      amount: 850.00,
    });
    expect(subject).toContain("850.00");
    expect(html).toContain("850.00");
    expect(html).toContain("555");
    expect(text).toContain("850.00");
  });

  it("returnRequestedSellerEmail includes reason and order info", () => {
    const { subject, html, text } = returnRequestedSellerEmail({
      sellerName: "Vandè",
      orderId: 77,
      listingTitle: "Kamera Canon",
      reason: "not_as_described",
      returnId: 12,
    });
    expect(subject).toContain("77");
    expect(html).toContain("not_as_described");
    expect(html).toContain("Kamera Canon");
    expect(text).toContain("not_as_described");
  });

  it("returnStatusBuyerEmail handles seller_accepted status", () => {
    const { subject, html } = returnStatusBuyerEmail({
      buyerName: "Achetè",
      orderId: 88,
      listingTitle: "Bag Louis Vuitton",
      status: "seller_accepted",
    });
    expect(subject).toContain("88");
    // Template shows the translated Haitian Creole label, not the raw status key
    expect(html).toContain("Aksepte pa vandè");
    expect(html).toContain("Bag Louis Vuitton");
  });

  it("returnStatusBuyerEmail handles refunded status with stripe card", () => {
    const { html, text } = returnStatusBuyerEmail({
      buyerName: "Achetè",
      orderId: 88,
      listingTitle: "Bag",
      status: "refunded",
      refundAmount: 150.00,
      refundMethod: "stripe_card",
    });
    expect(html).toContain("150.00");
    expect(html).toContain("kat");
    expect(text).toContain("150.00");
  });

  it("returnStatusBuyerEmail handles refunded status with wallet", () => {
    const { html } = returnStatusBuyerEmail({
      buyerName: "Achetè",
      orderId: 88,
      listingTitle: "Bag",
      status: "refunded",
      refundAmount: 75.50,
      refundMethod: "wallet",
    });
    expect(html).toContain("75.50");
    expect(html).toContain("pòtfèy");
  });

  it("accountRestrictedEmail includes reason and duration", () => {
    const { subject, html, text } = accountRestrictedEmail({
      name: "Itilizatè Test",
      reason: "spam",
      durationLabel: "7 days",
    });
    expect(subject).toContain("restriksyone");
    expect(html).toContain("spam");
    expect(html).toContain("7 days");
    expect(text).toContain("spam");
  });

  it("passwordChangedEmail includes user name", () => {
    const { subject, html } = passwordChangedEmail("Alice");
    expect(subject).toContain("Modpas");
    expect(html).toContain("Alice");
  });

  it("crashAlertEmail includes type and environment", () => {
    const { subject, html, text } = crashAlertEmail({
      type: "uncaughtException",
      message: "Cannot read property 'x' of undefined",
      stack: "Error: ...\n  at Object.<anonymous>",
      env: "production",
    });
    expect(subject).toContain("PRODUCTION");
    expect(subject).toContain("uncaughtException");
    expect(html).toContain("Cannot read property");
    expect(html).toContain("Error:");
    expect(text).toContain("uncaughtException");
  });

  it("crashAlertEmail works without stack trace", () => {
    const { html } = crashAlertEmail({
      type: "unhandledRejection",
      message: "Promise rejected",
      env: "development",
    });
    expect(html).toContain("Promise rejected");
    expect(html).toContain("DEVELOPMENT");
  });

  it("kycStatusEmail handles approved status", () => {
    const { subject, html } = kycStatusEmail({ name: "Jean", status: "approved" });
    expect(subject).toContain("verifye");
    expect(html).toContain("Jean");
    expect(html).toContain("apwouve");
  });

  it("kycStatusEmail handles rejected status with reason", () => {
    const { html } = kycStatusEmail({
      name: "Marie",
      status: "rejected",
      rejectionReason: "Dokiman flou, pa klè",
    });
    expect(html).toContain("Dokiman flou");
    expect(html).toContain("refize");
  });

  it("all templates produce valid HTML structure", () => {
    const templates = [
      welcomeEmail("Test"),
      orderPlacedBuyerEmail({ buyerName: "B", orderId: 1, listingTitle: "T", amount: 10, sellerName: "S" }),
      orderSoldSellerEmail({ sellerName: "S", orderId: 1, listingTitle: "T", amount: 10, buyerName: "B" }),
      escrowReleasedSellerEmail({ sellerName: "S", orderId: 1, listingTitle: "T", amount: 10 }),
      accountRestrictedEmail({ name: "U", reason: "spam", durationLabel: "3 days" }),
      passwordChangedEmail("U"),
      kycStatusEmail({ name: "U", status: "approved" }),
    ];
    for (const tpl of templates) {
      expect(tpl.html).toContain("<!DOCTYPE html>");
      expect(tpl.html).toContain("</html>");
      expect(tpl.html).toContain("FLEXA");
      expect(tpl.subject.length).toBeGreaterThan(5);
      expect(tpl.text.length).toBeGreaterThan(10);
    }
  });
});
