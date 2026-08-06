/**
 * Branded HTML email templates for FlexaMarket transactional emails.
 * All templates use inline styles for maximum email-client compatibility.
 * Language: English only.
 */

const PRIMARY   = "#f97316";
const BG        = "#0f172a";
const CARD      = "#1e293b";
const TEXT      = "#f1f5f9";
const MUTED     = "#94a3b8";
const SUCCESS   = "#22c55e";
const WARNING   = "#f59e0b";
const DANGER    = "#ef4444";

function base(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:${BG};font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${BG};padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <!-- Header -->
        <tr>
          <td style="background:${CARD};border-radius:12px 12px 0 0;padding:28px 32px;border-bottom:1px solid #334155;">
            <span style="font-size:22px;font-weight:800;color:${PRIMARY};">FLEXA</span>
            <span style="font-size:22px;font-weight:800;color:${TEXT};">MARKET</span>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="background:${CARD};padding:32px;">
            ${bodyHtml}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#0f172a;border-radius:0 0 12px 12px;padding:20px 32px;text-align:center;">
            <p style="margin:0;font-size:12px;color:${MUTED};">
              © ${new Date().getFullYear()} FlexaMarket · All rights reserved.<br/>
              If you did not expect this email, please ignore it.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function h1(text: string, color = TEXT): string {
  return `<h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:${color};">${text}</h1>`;
}

function p(text: string, color = TEXT): string {
  return `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${text.startsWith("<") ? TEXT : color};">${text}</p>`;
}

function badge(text: string, color: string): string {
  return `<span style="display:inline-block;padding:4px 12px;border-radius:9999px;background:${color}22;color:${color};font-size:12px;font-weight:600;border:1px solid ${color}44;">${text}</span>`;
}

function orderCard(label: string, value: string): string {
  return `<tr>
    <td style="padding:10px 0;font-size:14px;color:${MUTED};border-bottom:1px solid #334155;">${label}</td>
    <td style="padding:10px 0;font-size:14px;color:${TEXT};font-weight:600;text-align:right;border-bottom:1px solid #334155;">${value}</td>
  </tr>`;
}

function ctaButton(text: string, url: string, color = PRIMARY): string {
  return `<div style="text-align:center;margin:24px 0;">
    <a href="${url}" style="display:inline-block;padding:14px 32px;background:${color};color:#fff;font-size:15px;font-weight:700;text-decoration:none;border-radius:8px;">${text}</a>
  </div>`;
}

function divider(): string {
  return `<div style="height:1px;background:#334155;margin:24px 0;"></div>`;
}

// ─── DELIVERY CREATED (BUYER) ─────────────────────────────────────────────────

export function deliveryCreatedEmail(opts: {
  buyerName: string;
  trackingNumber: string;
  trackingUrl: string;
  deliveryCity: string;
  deliveryMethod: string;
}): { subject: string; html: string; text: string } {
  const methodLabel = opts.deliveryMethod === "motorcycle" ? "🏍️ Motorcycle" : opts.deliveryMethod === "car" ? "🚗 Car" : "🛵 Delivery";
  const subject = `📦 Your delivery is on its way — ${opts.trackingNumber}`;
  const html = base(subject, `
    ${h1("Delivery Confirmed! 📦", SUCCESS)}
    ${p(`Hello <strong style="color:${TEXT};">${opts.buyerName}</strong>, your order will be delivered by Flexa Market.`)}
    ${divider()}
    <div style="background:#1a2744;border-radius:12px;padding:24px;text-align:center;margin:20px 0;border:1px solid #334155;">
      <p style="margin:0 0 8px;font-size:12px;color:${MUTED};text-transform:uppercase;letter-spacing:2px;font-weight:600;">Your Tracking Number</p>
      <p style="margin:0;font-size:28px;font-weight:800;color:${PRIMARY};font-family:monospace;letter-spacing:3px;">${opts.trackingNumber}</p>
      <p style="margin:8px 0 0;font-size:12px;color:${MUTED};">Save this number — you can track your order at any time</p>
    </div>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
      ${orderCard("Delivery Method", methodLabel)}
      ${orderCard("Destination", opts.deliveryCity)}
      ${orderCard("Status", badge("Looking for a driver...", WARNING))}
    </table>
    ${p("You will receive a notification as soon as a driver accepts your order.", MUTED)}
    ${ctaButton("🔍 Track Your Order", opts.trackingUrl, PRIMARY)}
  `);
  const text = `Delivery confirmed! Tracking number: ${opts.trackingNumber}. Track your order: ${opts.trackingUrl}`;
  return { subject, html, text };
}

// ─── DELIVERY STATUS UPDATE ────────────────────────────────────────────────────

export function deliveryStatusEmail(opts: {
  buyerName: string;
  trackingNumber: string;
  trackingUrl: string;
  statusLabel: string;
  statusEmoji: string;
  detail: string;
}): { subject: string; html: string; text: string } {
  const subject = `${opts.statusEmoji} ${opts.statusLabel} — ${opts.trackingNumber}`;
  const html = base(subject, `
    ${h1(`${opts.statusEmoji} ${opts.statusLabel}`, SUCCESS)}
    ${p(`Hello <strong style="color:${TEXT};">${opts.buyerName}</strong>, there is an update on your delivery.`)}
    ${divider()}
    <div style="background:#1a2744;border-radius:12px;padding:20px;margin:20px 0;border-left:4px solid ${SUCCESS};">
      <p style="margin:0 0 4px;font-size:12px;color:${MUTED};text-transform:uppercase;letter-spacing:1px;">Tracking #</p>
      <p style="margin:0 0 12px;font-size:18px;font-weight:700;color:${TEXT};font-family:monospace;">${opts.trackingNumber}</p>
      <p style="margin:0;font-size:14px;color:${TEXT};line-height:1.6;">${opts.detail}</p>
    </div>
    ${ctaButton("🔍 View Tracking Now", opts.trackingUrl, SUCCESS)}
  `);
  const text = `${opts.statusLabel}: ${opts.detail} — Track: ${opts.trackingUrl}`;
  return { subject, html, text };
}

// ─── DELIVERY COMPLETED ────────────────────────────────────────────────────────

export function deliveryCompletedEmail(opts: {
  recipientName: string;
  trackingNumber: string;
  isSeller: boolean;
  amountUsd?: number;
  deliveryCity: string;
}): { subject: string; html: string; text: string } {
  const subject = `✅ Delivery #${opts.trackingNumber} complete!`;
  const html = base(subject, `
    ${h1("Delivery Complete! ✅", SUCCESS)}
    ${p(`Hello <strong style="color:${TEXT};">${opts.recipientName}</strong>!`)}
    ${divider()}
    <div style="background:#14532d;border-radius:12px;padding:24px;text-align:center;margin:20px 0;">
      <div style="font-size:48px;margin-bottom:12px;">✅</div>
      <p style="margin:0 0 4px;font-size:14px;color:#86efac;font-weight:600;">
        ${opts.isSeller ? "Your order was delivered successfully!" : "Your package was received successfully!"}
      </p>
      ${opts.isSeller && opts.amountUsd ? `
      <p style="margin:12px 0 0;font-size:32px;font-weight:800;color:${SUCCESS};">+$${opts.amountUsd.toFixed(2)}</p>
      <p style="margin:4px 0 0;font-size:12px;color:#86efac;">Added to your FM wallet</p>
      ` : ""}
    </div>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
      ${orderCard("Tracking #", opts.trackingNumber)}
      ${orderCard("Delivery City", opts.deliveryCity)}
      ${orderCard("Status", badge("DELIVERED ✓", SUCCESS))}
    </table>
    ${ctaButton(opts.isSeller ? "View Wallet" : "View Your Order", opts.isSeller ? "https://flexamarket.com/wallet" : "https://flexamarket.com/orders", SUCCESS)}
  `);
  const text = `Delivery ${opts.trackingNumber} complete! ${opts.isSeller && opts.amountUsd ? `$${opts.amountUsd.toFixed(2)} added to your wallet.` : "Package received."}`;
  return { subject, html, text };
}

// ─── WELCOME ─────────────────────────────────────────────────────────────────

export function welcomeEmail(name: string): { subject: string; html: string; text: string } {
  const subject = "Welcome to FlexaMarket! 🎉";
  const html = base(subject, `
    ${h1("Welcome, " + name + "! 🎉")}
    ${p("Your account has been created successfully. You can now buy, sell, and discover the best deals in your country.")}
    ${divider()}
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="padding:16px;background:#1e3a5f;border-radius:8px;border-left:4px solid ${PRIMARY};">
          <p style="margin:0;font-size:14px;color:${TEXT};font-weight:600;">Next steps:</p>
          <ul style="margin:8px 0 0 16px;padding:0;color:${MUTED};font-size:13px;line-height:1.8;">
            <li>Complete your profile</li>
            <li>Verify your phone number</li>
            <li>Place your first order</li>
            <li>Post your first listing</li>
          </ul>
        </td>
      </tr>
    </table>
    ${ctaButton("Go to FlexaMarket", "https://flexamarket.com")}
  `);
  const text = `Welcome, ${name}! Your FlexaMarket account has been created successfully. Visit https://flexamarket.com to get started.`;
  return { subject, html, text };
}

// ─── ORDER PLACED (BUYER) ────────────────────────────────────────────────────

export function orderPlacedBuyerEmail(opts: {
  buyerName: string;
  orderId: number;
  listingTitle: string;
  amount: number;
  sellerName: string;
}): { subject: string; html: string; text: string } {
  const subject = `Order #${opts.orderId} confirmed ✅`;
  const html = base(subject, `
    ${h1("Order Confirmed! ✅", SUCCESS)}
    ${p(`Your payment has been received. Seller <strong style="color:${TEXT};">${opts.sellerName}</strong> will prepare your order.`)}
    ${divider()}
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
      ${orderCard("Order number", "#" + opts.orderId)}
      ${orderCard("Item", opts.listingTitle)}
      ${orderCard("Amount", "$" + opts.amount.toFixed(2))}
      ${orderCard("Seller", opts.sellerName)}
      ${orderCard("Escrow status", badge("Funds secured", SUCCESS))}
    </table>
    ${p(`Your funds are held in escrow and will be released only when you confirm delivery. If there is an issue, you can open a return request within 30 days.`, MUTED)}
    ${ctaButton("View Your Order", "https://flexamarket.com/orders")}
  `);
  const text = `Order #${opts.orderId} confirmed. Item: ${opts.listingTitle}. Amount: $${opts.amount.toFixed(2)}. Seller: ${opts.sellerName}.`;
  return { subject, html, text };
}

// ─── ORDER SOLD (SELLER) ─────────────────────────────────────────────────────

export function orderSoldSellerEmail(opts: {
  sellerName: string;
  orderId: number;
  listingTitle: string;
  amount: number;
  buyerName: string;
}): { subject: string; html: string; text: string } {
  const subject = `Sale #${opts.orderId} — ${opts.listingTitle} 🛍️`;
  const html = base(subject, `
    ${h1("You made a sale! 🛍️", PRIMARY)}
    ${p(`<strong style="color:${TEXT};">${opts.buyerName}</strong> purchased <strong style="color:${TEXT};">${opts.listingTitle}</strong>. Please prepare the order and ship it to the buyer.`)}
    ${divider()}
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
      ${orderCard("Order number", "#" + opts.orderId)}
      ${orderCard("Item", opts.listingTitle)}
      ${orderCard("Amount you will receive", "$" + opts.amount.toFixed(2))}
      ${orderCard("Buyer", opts.buyerName)}
      ${orderCard("Status", badge("Ready to ship", WARNING))}
    </table>
    ${p(`Funds are in escrow — they will be released to your FM wallet once the buyer confirms delivery.`, MUTED)}
    ${ctaButton("View Your Order", "https://flexamarket.com/orders")}
  `);
  const text = `Sale #${opts.orderId}: ${opts.listingTitle} for $${opts.amount.toFixed(2)}. Buyer: ${opts.buyerName}. Please prepare the order.`;
  return { subject, html, text };
}

// ─── ORDER SHIPPED ───────────────────────────────────────────────────────────

export function orderShippedEmail(opts: {
  buyerName: string;
  orderId: number;
  listingTitle: string;
  trackingNumber?: string;
}): { subject: string; html: string; text: string } {
  const subject = `Order #${opts.orderId} shipped 📦`;
  const html = base(subject, `
    ${h1("Your Order Has Been Shipped! 📦")}
    ${p(`The seller has shipped <strong style="color:${TEXT};">${opts.listingTitle}</strong>. It's on its way to you.`)}
    ${opts.trackingNumber ? `
    <div style="background:#1e3a5f;border-radius:8px;padding:16px;margin-bottom:16px;border-left:4px solid ${PRIMARY};">
      <p style="margin:0 0 4px;font-size:12px;color:${MUTED};text-transform:uppercase;letter-spacing:1px;">Tracking Number</p>
      <p style="margin:0;font-size:18px;font-weight:700;color:${TEXT};font-family:monospace;">${opts.trackingNumber}</p>
    </div>` : ""}
    ${p("Once you receive your order, please confirm delivery so the seller can receive payment.", MUTED)}
    ${ctaButton("Confirm Delivery", "https://flexamarket.com/orders/" + opts.orderId)}
  `);
  const text = `Order #${opts.orderId} (${opts.listingTitle}) has been shipped.${opts.trackingNumber ? " Tracking: " + opts.trackingNumber : ""} Confirm delivery at https://flexamarket.com/orders/${opts.orderId}`;
  return { subject, html, text };
}

// ─── ESCROW RELEASED / ORDER COMPLETED ───────────────────────────────────────

export function escrowReleasedSellerEmail(opts: {
  sellerName: string;
  orderId: number;
  listingTitle: string;
  amount: number;
}): { subject: string; html: string; text: string } {
  const subject = `💰 $${opts.amount.toFixed(2)} added to your wallet — Order #${opts.orderId}`;
  const html = base(subject, `
    ${h1("Payment Released! 💰", SUCCESS)}
    ${p(`Escrow for order <strong style="color:${TEXT};">#${opts.orderId}</strong> (${opts.listingTitle}) has been released. Funds have been added to your FM wallet.`)}
    <div style="background:#14532d;border-radius:12px;padding:24px;text-align:center;margin:20px 0;">
      <p style="margin:0 0 4px;font-size:13px;color:#86efac;text-transform:uppercase;letter-spacing:1px;">Amount Received</p>
      <p style="margin:0;font-size:36px;font-weight:800;color:${SUCCESS};">$${opts.amount.toFixed(2)}</p>
    </div>
    ${ctaButton("View Wallet", "https://flexamarket.com/wallet")}
  `);
  const text = `$${opts.amount.toFixed(2)} added to your FM wallet for order #${opts.orderId} (${opts.listingTitle}).`;
  return { subject, html, text };
}

// ─── RETURN REQUESTED (SELLER) ───────────────────────────────────────────────

export function returnRequestedSellerEmail(opts: {
  sellerName: string;
  orderId: number;
  listingTitle: string;
  reason: string;
  returnId: number;
}): { subject: string; html: string; text: string } {
  const subject = `⚠️ Return request for order #${opts.orderId}`;
  const html = base(subject, `
    ${h1("A buyer has requested a return", WARNING)}
    ${p(`The buyer has requested a return for <strong style="color:${TEXT};">${opts.listingTitle}</strong>.`)}
    ${divider()}
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
      ${orderCard("Order", "#" + opts.orderId)}
      ${orderCard("Item", opts.listingTitle)}
      ${orderCard("Reason", opts.reason)}
    </table>
    ${p("You have 72 hours to accept or decline this request. If you do not respond, an admin will handle it.", MUTED)}
    ${ctaButton("Respond to Return Request", "https://flexamarket.com/orders/" + opts.orderId)}
  `);
  const text = `Buyer requested a return for order #${opts.orderId} (${opts.listingTitle}). Reason: ${opts.reason}. Respond at https://flexamarket.com/orders/${opts.orderId}`;
  return { subject, html, text };
}

// ─── RETURN STATUS UPDATE (BUYER) ────────────────────────────────────────────

export function returnStatusBuyerEmail(opts: {
  buyerName: string;
  orderId: number;
  listingTitle: string;
  status: "seller_accepted" | "seller_rejected" | "refunded" | "admin_rejected";
  refundAmount?: number;
  refundMethod?: "stripe_card" | "wallet";
  note?: string;
}): { subject: string; html: string; text: string } {
  const statusMap: Record<string, { label: string; icon: string; color: string; body: string }> = {
    seller_accepted: { label: "Accepted by seller", icon: "✅", color: SUCCESS, body: "The seller has accepted your return request. Ship the item back and notify the seller once it has been sent." },
    seller_rejected: { label: "Declined by seller", icon: "❌", color: DANGER, body: "The seller has declined your return request. You can escalate to an admin for review." },
    refunded: {
      label: "Refund approved",
      icon: "💰",
      color: SUCCESS,
      body: opts.refundMethod === "stripe_card"
        ? `A refund of $${opts.refundAmount?.toFixed(2)} will appear on your card within 5 business days.`
        : `$${opts.refundAmount?.toFixed(2)} has been added to your FM wallet.`,
    },
    admin_rejected: { label: "Declined by admin", icon: "🚫", color: DANGER, body: opts.note ? `Admin declined your request. Reason: ${opts.note}` : "Admin declined your return request after review." },
  };
  const info = statusMap[opts.status] ?? statusMap.seller_rejected;
  const subject = `${info.icon} Return for order #${opts.orderId} — ${info.label}`;
  const html = base(subject, `
    ${h1(info.icon + " " + info.label, info.color)}
    ${badge(opts.listingTitle, PRIMARY)}
    <br/><br/>
    ${p(info.body)}
    ${opts.note && opts.status !== "admin_rejected" ? p(`Note: ${opts.note}`, MUTED) : ""}
    ${ctaButton("View Order", "https://flexamarket.com/orders/" + opts.orderId)}
  `);
  const text = `Return for order #${opts.orderId}: ${info.label}. ${info.body}`;
  return { subject, html, text };
}

// ─── ACCOUNT RESTRICTED ──────────────────────────────────────────────────────

export function accountRestrictedEmail(opts: {
  name: string;
  reason: string;
  durationLabel: string;
}): { subject: string; html: string; text: string } {
  const subject = "⚠️ Your FlexaMarket account has been restricted";
  const html = base(subject, `
    ${h1("Your Account Has Been Restricted ⚠️", WARNING)}
    ${p(`The account for <strong style="color:${TEXT};">${opts.name}</strong> has been restricted for a period of <strong style="color:${TEXT};">${opts.durationLabel}</strong>.`)}
    <div style="background:#451a03;border-radius:8px;padding:16px;margin:16px 0;border-left:4px solid ${WARNING};">
      <p style="margin:0 0 4px;font-size:12px;color:#fcd34d;text-transform:uppercase;">Reason</p>
      <p style="margin:0;font-size:14px;color:${TEXT};">${opts.reason}</p>
    </div>
    ${p("During the restriction period, you cannot post listings, send messages, or make transactions. If you believe this is a mistake, please contact support.", MUTED)}
    ${ctaButton("Contact Support", "https://flexamarket.com/support")}
  `);
  const text = `Your account has been restricted for ${opts.durationLabel}. Reason: ${opts.reason}. Contact support if you need help.`;
  return { subject, html, text };
}

// ─── PASSWORD CHANGED ─────────────────────────────────────────────────────────

export function passwordChangedEmail(name: string): { subject: string; html: string; text: string } {
  const subject = "🔐 Your password has been changed";
  const html = base(subject, `
    ${h1("Password Changed 🔐")}
    ${p(`The password for your FlexaMarket account (<strong style="color:${TEXT};">${name}</strong>) has been changed successfully.`)}
    ${p("If you <strong>did not</strong> make this change, sign in immediately and change your password, or contact support.", MUTED)}
    ${divider()}
    ${ctaButton("Contact Support", "https://flexamarket.com/support", DANGER)}
  `);
  const text = `The password for FlexaMarket account ${name} has been changed. If you did not do this, contact support immediately.`;
  return { subject, html, text };
}

// ─── CRASH ALERT (ADMIN ONLY) ────────────────────────────────────────────────

export function crashAlertEmail(opts: {
  type: string;
  message: string;
  stack?: string;
  env: string;
}): { subject: string; html: string; text: string } {
  const subject = `🚨 [${opts.env.toUpperCase()}] Server crash: ${opts.type}`;
  const html = base(subject, `
    ${h1("🚨 Server Error Detected", DANGER)}
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
      ${orderCard("Type", opts.type)}
      ${orderCard("Environment", opts.env)}
      ${orderCard("Time", new Date().toISOString())}
    </table>
    <div style="background:#1a1a1a;border-radius:8px;padding:16px;margin:16px 0;">
      <p style="margin:0 0 8px;font-size:12px;color:${DANGER};text-transform:uppercase;">Error Message</p>
      <p style="margin:0;font-size:13px;color:${TEXT};font-family:monospace;">${opts.message}</p>
    </div>
    ${opts.stack ? `
    <div style="background:#1a1a1a;border-radius:8px;padding:16px;margin:8px 0;overflow:hidden;">
      <p style="margin:0 0 8px;font-size:12px;color:${MUTED};text-transform:uppercase;">Stack Trace</p>
      <pre style="margin:0;font-size:11px;color:${MUTED};white-space:pre-wrap;font-family:monospace;">${opts.stack.slice(0, 2000)}</pre>
    </div>` : ""}
  `);
  const text = `[${opts.env}] Server crash: ${opts.type}\n${opts.message}\n${opts.stack ?? ""}`;
  return { subject, html, text };
}

// ─── KYC STATUS UPDATE ───────────────────────────────────────────────────────

export function kycStatusEmail(opts: {
  name: string;
  status: "approved" | "rejected";
  rejectionReason?: string;
}): { subject: string; html: string; text: string } {
  const approved = opts.status === "approved";
  const subject = approved ? "✅ Identity Verified — FlexaMarket" : "❌ Identity Verification Declined";
  const html = base(subject, `
    ${h1(approved ? "Identity Verified! ✅" : "Verification Declined ❌", approved ? SUCCESS : DANGER)}
    ${p(approved
      ? `Congratulations, <strong style="color:${TEXT};">${opts.name}</strong>! Your KYC has been approved. You can now make large transfers and use all platform features.`
      : `Your verification request for <strong style="color:${TEXT};">${opts.name}</strong> could not be approved.`
    )}
    ${!approved && opts.rejectionReason ? `
    <div style="background:#450a0a;border-radius:8px;padding:16px;margin:16px 0;border-left:4px solid ${DANGER};">
      <p style="margin:0 0 4px;font-size:12px;color:#fca5a5;text-transform:uppercase;">Reason</p>
      <p style="margin:0;font-size:14px;color:${TEXT};">${opts.rejectionReason}</p>
    </div>
    ${p("You can submit new documents after correcting the issue.", MUTED)}` : ""}
    ${ctaButton(approved ? "Go to Wallet" : "Submit Again", approved ? "https://flexamarket.com/wallet" : "https://flexamarket.com/kyc")}
  `);
  const text = approved
    ? `Your KYC has been approved, ${opts.name}. You can now make large transfers.`
    : `KYC declined: ${opts.rejectionReason ?? "Documents not clear enough"}. Submit again at https://flexamarket.com/kyc`;
  return { subject, html, text };
}
