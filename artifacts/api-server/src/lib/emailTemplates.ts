/**
 * Branded HTML email templates for FlexaMarket transactional emails.
 * All templates use inline styles for maximum email-client compatibility.
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
              © ${new Date().getFullYear()} FlexaMarket · Tout dwa rezève.<br/>
              Si ou pa t'ap tann email sa, ignore li.
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

// ─── WELCOME ─────────────────────────────────────────────────────────────────

export function welcomeEmail(name: string): { subject: string; html: string; text: string } {
  const subject = "Byenveni sou FlexaMarket! 🎉";
  const html = base(subject, `
    ${h1("Byenveni, " + name + "! 🎉")}
    ${p("Kont ou kreye avèk siksè. Ou ka kòmanse achte, vann, epi jwenn pi bon ofè yo nan peyi ou.")}
    ${divider()}
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="padding:16px;background:#1e3a5f;border-radius:8px;border-left:4px solid ${PRIMARY};">
          <p style="margin:0;font-size:14px;color:${TEXT};font-weight:600;">Pwochen etap yo:</p>
          <ul style="margin:8px 0 0 16px;padding:0;color:${MUTED};font-size:13px;line-height:1.8;">
            <li>Konplete pwofil ou</li>
            <li>Verifye nimewo telefòn ou</li>
            <li>Pase premye kòmand ou</li>
            <li>Mete premye annons ou</li>
          </ul>
        </td>
      </tr>
    </table>
    ${ctaButton("Ale sou FlexaMarket", "https://flexamarket.com")}
  `);
  const text = `Byenveni, ${name}! Kont FlexaMarket ou kreye avèk siksè. Ale sou https://flexamarket.com pou kòmanse.`;
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
  const subject = `Kòmand #${opts.orderId} konfime ✅`;
  const html = base(subject, `
    ${h1("Kòmand ou konfime! ✅", SUCCESS)}
    ${p(`Nou resevwa peman ou. Vandè a <strong style="color:${TEXT};">${opts.sellerName}</strong> pral prepare kòmand ou a.`)}
    ${divider()}
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
      ${orderCard("Nimewo kòmand", "#" + opts.orderId)}
      ${orderCard("Pwodui", opts.listingTitle)}
      ${orderCard("Montan", "$" + opts.amount.toFixed(2))}
      ${orderCard("Vandè", opts.sellerName)}
      ${orderCard("Estati eskwo", badge("Fon bloke an sekirite", SUCCESS))}
    </table>
    ${p(`Fon yo bloke nan eskwo epi y'ap libere sèlman lè ou konfime livrezon an. Si gen pwoblèm, ou ka ouvri demann retou nan 30 jou.`, MUTED)}
    ${ctaButton("Wè Kòmand Ou", "https://flexamarket.com/orders")}
  `);
  const text = `Kòmand #${opts.orderId} konfime. Pwodui: ${opts.listingTitle}. Montan: $${opts.amount.toFixed(2)}. Vandè: ${opts.sellerName}.`;
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
  const subject = `Vant #${opts.orderId} — ${opts.listingTitle} 🛍️`;
  const html = base(subject, `
    ${h1("Ou fè yon vant! 🛍️", PRIMARY)}
    ${p(`<strong style="color:${TEXT};">${opts.buyerName}</strong> achte <strong style="color:${TEXT};">${opts.listingTitle}</strong>. Prepare kòmand lan epi voye li bay achetè a.`)}
    ${divider()}
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
      ${orderCard("Nimewo kòmand", "#" + opts.orderId)}
      ${orderCard("Pwodui", opts.listingTitle)}
      ${orderCard("Montan ou pral resevwa", "$" + opts.amount.toFixed(2))}
      ${orderCard("Achetè", opts.buyerName)}
      ${orderCard("Estati", badge("Prepare pou ekspedye", WARNING))}
    </table>
    ${p(`Fon yo nan eskwo — y'ap libere nan pòtfèy FM ou depi achetè a konfime livrezon an.`, MUTED)}
    ${ctaButton("Wè Kòmand Ou", "https://flexamarket.com/orders")}
  `);
  const text = `Vant #${opts.orderId}: ${opts.listingTitle} pou $${opts.amount.toFixed(2)}. Achetè: ${opts.buyerName}. Prepare kòmand lan.`;
  return { subject, html, text };
}

// ─── ORDER SHIPPED ───────────────────────────────────────────────────────────

export function orderShippedEmail(opts: {
  buyerName: string;
  orderId: number;
  listingTitle: string;
  trackingNumber?: string;
}): { subject: string; html: string; text: string } {
  const subject = `Kòmand #${opts.orderId} ekspedye 📦`;
  const html = base(subject, `
    ${h1("Kòmand ou ekspedye! 📦")}
    ${p(`Vandè a ekspedye <strong style="color:${TEXT};">${opts.listingTitle}</strong>. Li sou chemen ou.`)}
    ${opts.trackingNumber ? `
    <div style="background:#1e3a5f;border-radius:8px;padding:16px;margin-bottom:16px;border-left:4px solid ${PRIMARY};">
      <p style="margin:0 0 4px;font-size:12px;color:${MUTED};text-transform:uppercase;letter-spacing:1px;">Nimewo Traking</p>
      <p style="margin:0;font-size:18px;font-weight:700;color:${TEXT};font-family:monospace;">${opts.trackingNumber}</p>
    </div>` : ""}
    ${p("Depi ou resevwa kòmand lan, souple konfime livrezon an pou vandè a resevwa peman an.", MUTED)}
    ${ctaButton("Konfime Livrezon", "https://flexamarket.com/orders/" + opts.orderId)}
  `);
  const text = `Kòmand #${opts.orderId} (${opts.listingTitle}) ekspedye.${opts.trackingNumber ? " Traking: " + opts.trackingNumber : ""} Konfime livrezon nan https://flexamarket.com/orders/${opts.orderId}`;
  return { subject, html, text };
}

// ─── ESCROW RELEASED / ORDER COMPLETED ───────────────────────────────────────

export function escrowReleasedSellerEmail(opts: {
  sellerName: string;
  orderId: number;
  listingTitle: string;
  amount: number;
}): { subject: string; html: string; text: string } {
  const subject = `💰 $${opts.amount.toFixed(2)} ajoute nan pòtfèy ou — Kòmand #${opts.orderId}`;
  const html = base(subject, `
    ${h1("Peman libere! 💰", SUCCESS)}
    ${p(`Eskwo kòmand <strong style="color:${TEXT};">#${opts.orderId}</strong> (${opts.listingTitle}) libere. Fon yo ajoute nan pòtfèy FM ou.`)}
    <div style="background:#14532d;border-radius:12px;padding:24px;text-align:center;margin:20px 0;">
      <p style="margin:0 0 4px;font-size:13px;color:#86efac;text-transform:uppercase;letter-spacing:1px;">Montan Resevwa</p>
      <p style="margin:0;font-size:36px;font-weight:800;color:${SUCCESS};">$${opts.amount.toFixed(2)}</p>
    </div>
    ${ctaButton("Wè Pòtfèy", "https://flexamarket.com/wallet")}
  `);
  const text = `$${opts.amount.toFixed(2)} ajoute nan pòtfèy FM ou pou kòmand #${opts.orderId} (${opts.listingTitle}).`;
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
  const subject = `⚠️ Demann retou pou kòmand #${opts.orderId}`;
  const html = base(subject, `
    ${h1("Yon achetè mande retou", WARNING)}
    ${p(`Achetè a mande retou pou <strong style="color:${TEXT};">${opts.listingTitle}</strong>.`)}
    ${divider()}
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
      ${orderCard("Kòmand", "#" + opts.orderId)}
      ${orderCard("Pwodui", opts.listingTitle)}
      ${orderCard("Rezon", opts.reason)}
    </table>
    ${p("Ou gen 72 èdtan pou aksepte oswa refize demann sa a. Si ou pa reponn, admin pral trete li.", MUTED)}
    ${ctaButton("Reponn Demann Retou", "https://flexamarket.com/orders/" + opts.orderId)}
  `);
  const text = `Achetè a mande retou pou kòmand #${opts.orderId} (${opts.listingTitle}). Rezon: ${opts.reason}. Reponn nan https://flexamarket.com/orders/${opts.orderId}`;
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
    seller_accepted: { label: "Aksepte pa vandè", icon: "✅", color: SUCCESS, body: "Vandè a aksepte demann retou ou. Voye pwodui a tounen epi notifye vandè a lè ou ekspedye li." },
    seller_rejected: { label: "Refize pa vandè", icon: "❌", color: DANGER, body: "Vandè a refize demann retou ou. Ou ka eskalasyon bay admin pou revizyon." },
    refunded: {
      label: "Ranbousman apwouve",
      icon: "💰",
      color: SUCCESS,
      body: opts.refundMethod === "stripe_card"
        ? `Ranbousman $${opts.refundAmount?.toFixed(2)} ap parèt sou kat ou nan 5 jou ouvrab.`
        : `$${opts.refundAmount?.toFixed(2)} ajoute nan pòtfèy FM ou.`,
    },
    admin_rejected: { label: "Refize pa admin", icon: "🚫", color: DANGER, body: opts.note ? `Admin refize demann ou. Rezon: ${opts.note}` : "Admin refize demann retou ou apre revizyon." },
  };
  const info = statusMap[opts.status] ?? statusMap.seller_rejected;
  const subject = `${info.icon} Retou kòmand #${opts.orderId} — ${info.label}`;
  const html = base(subject, `
    ${h1(info.icon + " " + info.label, info.color)}
    ${badge(opts.listingTitle, PRIMARY)}
    <br/><br/>
    ${p(info.body)}
    ${opts.note && opts.status !== "admin_rejected" ? p(`Note: ${opts.note}`, MUTED) : ""}
    ${ctaButton("Wè Kòmand", "https://flexamarket.com/orders/" + opts.orderId)}
  `);
  const text = `Retou kòmand #${opts.orderId}: ${info.label}. ${info.body}`;
  return { subject, html, text };
}

// ─── ACCOUNT RESTRICTED ──────────────────────────────────────────────────────

export function accountRestrictedEmail(opts: {
  name: string;
  reason: string;
  durationLabel: string;
}): { subject: string; html: string; text: string } {
  const subject = "⚠️ Kont FlexaMarket ou restriksyone";
  const html = base(subject, `
    ${h1("Kont ou restriksyone ⚠️", WARNING)}
    ${p(`Kont <strong style="color:${TEXT};">${opts.name}</strong> restriksyone pou yon peryòd <strong style="color:${TEXT};">${opts.durationLabel}</strong>.`)}
    <div style="background:#451a03;border-radius:8px;padding:16px;margin:16px 0;border-left:4px solid ${WARNING};">
      <p style="margin:0 0 4px;font-size:12px;color:#fcd34d;text-transform:uppercase;">Rezon</p>
      <p style="margin:0;font-size:14px;color:${TEXT};">${opts.reason}</p>
    </div>
    ${p("Pandan restriksyon an, ou paka pibliye annons, voye mesaj, oswa fè tranzaksyon. Si ou kwè sa se yon erè, kontakte sipò.", MUTED)}
    ${ctaButton("Kontakte Sipò", "https://flexamarket.com/support")}
  `);
  const text = `Kont ou restriksyone pou ${opts.durationLabel}. Rezon: ${opts.reason}. Kontakte sipò si ou bezwen èd.`;
  return { subject, html, text };
}

// ─── PASSWORD CHANGED ─────────────────────────────────────────────────────────

export function passwordChangedEmail(name: string): { subject: string; html: string; text: string } {
  const subject = "🔐 Modpas ou chanje";
  const html = base(subject, `
    ${h1("Modpas ou chanje 🔐")}
    ${p(`Modpas kont FlexaMarket ou (<strong style="color:${TEXT};">${name}</strong>) chanje avèk siksè.`)}
    ${p("Si <strong>ou pa</strong> fè chanjman sa a, konekte imedyatman epi chanje modpas ou, oswa kontakte sipò.", MUTED)}
    ${divider()}
    ${ctaButton("Kontakte Sipò", "https://flexamarket.com/support", DANGER)}
  `);
  const text = `Modpas kont FlexaMarket ${name} chanje. Si ou pa fè sa, kontakte sipò imedyatman.`;
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
      ${orderCard("Tip", opts.type)}
      ${orderCard("Anviwonman", opts.env)}
      ${orderCard("Lè", new Date().toISOString())}
    </table>
    <div style="background:#1a1a1a;border-radius:8px;padding:16px;margin:16px 0;">
      <p style="margin:0 0 8px;font-size:12px;color:${DANGER};text-transform:uppercase;">Mesaj Erè</p>
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
  const subject = approved ? "✅ Identite ou verifye — FlexaMarket" : "❌ Verifikasyon identite refize";
  const html = base(subject, `
    ${h1(approved ? "Identite ou verifye! ✅" : "Verifikasyon refize ❌", approved ? SUCCESS : DANGER)}
    ${p(approved
      ? `Felisitasyon, <strong style="color:${TEXT};">${opts.name}</strong>! KYC ou apwouve. Ou ka kounye a fè gwo transfè ak itilize tout fonksyon platfòm nan.`
      : `Demann verifikasyon ou pou <strong style="color:${TEXT};">${opts.name}</strong> pa ka apwouve.`
    )}
    ${!approved && opts.rejectionReason ? `
    <div style="background:#450a0a;border-radius:8px;padding:16px;margin:16px 0;border-left:4px solid ${DANGER};">
      <p style="margin:0 0 4px;font-size:12px;color:#fca5a5;text-transform:uppercase;">Rezon</p>
      <p style="margin:0;font-size:14px;color:${TEXT};">${opts.rejectionReason}</p>
    </div>
    ${p("Ou ka soumèt nouvo dokiman apre ou korije pwoblèm lan.", MUTED)}` : ""}
    ${ctaButton(approved ? "Ale sou Pòtfèy" : "Soumèt Ankò", approved ? "https://flexamarket.com/wallet" : "https://flexamarket.com/kyc")}
  `);
  const text = approved
    ? `KYC ou apwouve, ${opts.name}. Ou ka kounye a fè gwo transfè.`
    : `KYC refize: ${opts.rejectionReason ?? "Dokiman pa ase klè"}. Soumèt ankò sou https://flexamarket.com/kyc`;
  return { subject, html, text };
}


// ─── PASSWORD RESET ──────────────────────────────────────────────────────────

export function passwordResetEmail(opts: {
  name: string;
  resetUrl: string;
  expiresMinutes: number;
}): { subject: string; html: string; text: string } {
  const subject = "Reyajiste modpas FlexaMarket ou";
  const html = base(subject, `
    ${h1("Reyajiste modpas ou", PRIMARY)}
    ${p(`Bonjou ${opts.name}, nou resevwa yon demand pou reyajiste modpas kont FlexaMarket ou.`)}
    ${p(`Klike sou bouton an pi ba a pou chwazi yon nouvo modpas. Lyen sa a ap ekspire nan ${opts.expiresMinutes} minit.`)}
    ${ctaButton("Reyajiste modpas mwen", opts.resetUrl)}
    ${divider()}
    ${p("Si ou pa t mande pou reyajiste modpas la, ou ka inyore email sa a — modpas ou pa pral chanje.", MUTED)}
    ${p("Pou sekirite, lyen an se yon sèl-itilize. Si ou bezwen yon lòt, fè demand lan ankò sou paj koneksyon an.", MUTED)}
  `);
  const text = `Bonjou ${opts.name},

Nou resevwa yon demand pou reyajiste modpas kont FlexaMarket ou.

Klike sou lyen sa a pou chwazi yon nouvo modpas (li ekspire nan ${opts.expiresMinutes} minit):
${opts.resetUrl}

Si ou pa t mande sa, ou ka inyore email sa a — modpas ou pa pral chanje.`;
  return { subject, html, text };
}
