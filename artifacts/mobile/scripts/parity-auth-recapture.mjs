/**
 * Corrected parity captures: same account, same screen/state on website + native Expo.
 * Website: UI Sign In + EULA (token-only localStorage seed is NOT enough for many routes).
 * App: separate Playwright context + flexamarket_token in localStorage/AsyncStorage.
 * Rejects WEB captures that land on Sign In / auth gates.
 * Visual 100% PASS is rare — content same-state verification is the first gate.
 */
import { chromium } from "playwright";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const OUT = process.env.OUT_DIR || "/opt/cursor/artifacts/parity-corrected";
const REPO_OUT =
  process.env.REPO_OUT ||
  "/agent/repos/Flexa-market/artifacts/mobile/releases/parity-corrected-screens";
const WEB = "https://flexamarket.com";
const APP = process.env.APP_BASE || "http://127.0.0.1:8081";
const VW = 390;
const VH = 844;
const TOKEN = fs.existsSync("/tmp/fm_token.txt")
  ? fs.readFileSync("/tmp/fm_token.txt", "utf8").trim()
  : "";
const ORDER_ID = process.env.ORDER_ID || "40";
const SUPPORT_ID = process.env.SUPPORT_ID || "1";
const LISTING_ID = process.env.LISTING_ID || "73";
const SELLER_ID = process.env.SELLER_ID || "2";

if (!TOKEN) {
  console.error("Missing /tmp/fm_token.txt — cannot authenticate captures");
  process.exit(1);
}

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(REPO_OUT, { recursive: true });

const CART = [
  {
    listingId: Number(LISTING_ID),
    title: "Ventilateur Oscillant Rechargeable 5400mAh USB-C",
    price: 4,
    currency: "USD",
    image:
      "https://res.cloudinary.com/dvkbgodbk/image/upload/v1780608173/flexa-market/tboq0rvkucjwiwof7gwh.jpg",
    country: "Haiti",
    city: "Port-au-Prince",
    sellerId: Number(SELLER_ID),
    quantity: 1,
  },
];

/** Screens previously invalid or needing same-state re-proof */
const SCREENS = [
  {
    id: "orders_list",
    label: "My Orders (filter=All)",
    webPath: "/orders",
    appPath: "/orders",
    auth: true,
    expectWeb: [/order|my orders|achats|commandes/i],
    expectApp: [/order|my orders/i],
    expectShared: [String(ORDER_ID), "Ventilateur"],
  },
  {
    id: "order_detail",
    label: `Order details #${ORDER_ID}`,
    webPath: `/orders/${ORDER_ID}`,
    appPath: `/orders/${ORDER_ID}`,
    auth: true,
    expectWeb: [/order|BZH|detail|ventilateur/i],
    expectApp: [/order|detail|ventilateur|BZH/i],
    expectShared: [String(ORDER_ID)],
  },
  {
    id: "favorites",
    label: "Favorites / Saved",
    webPath: "/saved",
    appPath: "/favorites",
    auth: true,
    expectWeb: [/saved|favorite|favori/i],
    expectApp: [/favorite|saved/i],
  },
  {
    id: "addresses",
    label: "Addresses",
    webPath: "/settings/addresses",
    appPath: "/addresses",
    auth: true,
    expectWeb: [/address|adresse/i],
    expectApp: [/address/i],
  },
  {
    id: "inbox",
    label: "Inbox / Messages",
    webPath: "/messages",
    appPath: "/inbox",
    auth: true,
    expectWeb: [/message|chat|inbox|conversation/i],
    expectApp: [/chat|inbox|message|buying|selling/i],
  },
  {
    id: "notifications",
    label: "Notifications",
    webPath: "/settings/notifications",
    appPath: "/notifications",
    auth: true,
    expectWeb: [/notif/i],
    expectApp: [/notif/i],
  },
  {
    id: "account_settings",
    label: "Account / Settings (signed-in)",
    webPath: "/settings",
    appPath: "/profile",
    auth: true,
    expectWeb: [/setting|account|profile|profil/i],
    expectApp: [/account|profile/i],
  },
  {
    id: "sell",
    label: "Sell / create listing",
    webPath: "/sell",
    appPath: "/sell",
    auth: true,
    expectWeb: [/sell|list|publish|vendre|titre|title/i],
    expectApp: [/sell|title|publish|photo/i],
  },
  {
    id: "sales",
    label: "Seller sales",
    webPath: "/sales",
    appPath: "/sales",
    auth: true,
    expectWeb: [/sale|earning|order|vente/i],
    expectApp: [/sale|earning|order/i],
  },
  {
    id: "offers",
    label: "Private offers",
    webPath: "/offers",
    appPath: "/offers",
    auth: true,
    expectWeb: [/offer|offre/i],
    expectApp: [/offer/i],
  },
  {
    id: "support",
    label: "Support tickets",
    webPath: "/support",
    appPath: "/support",
    auth: true,
    expectWeb: [/support|ticket|aide/i],
    expectApp: [/support|ticket|flexabot/i],
  },
  {
    id: "support_detail",
    label: `Support ticket #${SUPPORT_ID}`,
    webPath: `/support/${SUPPORT_ID}`,
    appPath: `/support/${SUPPORT_ID}`,
    auth: true,
    expectWeb: [/support|ticket|pwoblèm|kont|message/i],
    expectApp: [/support|ticket|reply|message/i],
  },
  {
    id: "edit_profile",
    label: "Edit profile",
    webPath: "/profile/edit",
    appPath: "/edit-profile",
    auth: true,
    expectWeb: [/edit|profile|profil|name|non/i],
    expectApp: [/edit|profile|name|phone/i],
  },
  {
    id: "chatbot",
    label: "FlexaBot",
    webPath: "/chatbot",
    appPath: "/chatbot",
    auth: true,
    expectWeb: [/flexabot|chat|ask|bot/i],
    expectApp: [/flexabot|ask|order|delivery/i],
  },
  {
    id: "cart_populated",
    label: "Cart (listing 73 seeded)",
    webPath: "/cart",
    appPath: "/cart",
    auth: true,
    seedCart: true,
    expectWeb: [/cart|panier|ventilateur|checkout|\$4/i],
    expectApp: [/cart|ventilateur|checkout|\$4/i],
  },
  {
    id: "pdp_gallery_0",
    label: "PDP gallery image 1/N",
    webPath: `/listings/${LISTING_ID}`,
    appPath: `/listing/${LISTING_ID}`,
    auth: false,
    expectWeb: [/ventilateur|listing|\$4/i],
    expectApp: [/ventilateur|listing|\$4/i],
  },
  {
    id: "tracking",
    label: "Delivery tracking",
    webPath: `/delivery/tracking/${ORDER_ID}`,
    appPath: `/delivery-tracking?orderId=${ORDER_ID}`,
    auth: true,
    expectWeb: [/track|delivery|livraison|status/i],
    expectApp: [/track|delivery|status|driver|pin/i],
  },
  {
    id: "my_listings",
    label: "My listings",
    webPath: "/sell",
    appPath: "/my-listings",
    auth: true,
    note: "Web may not have a distinct /my-listings URL; capture signed-in sell hub",
    expectWeb: [/sell|list|listing|vendre/i],
    expectApp: [/listing|my listings|create/i],
  },
];

const AUTH_GATE_RE =
  /welcome back|sign in to|please sign in|konekte|eula and terms|don.?t have an account|sign in to access your settings|sign in to contact support/i;

async function seedWeb(page) {
  await page.goto(WEB + "/", { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.evaluate(
    ({ token, cart }) => {
      localStorage.setItem("flexamarket_token", token);
      localStorage.setItem("flexamarket_marketplace_country", "Haiti");
      localStorage.setItem("flexamarket_lang", "en");
      localStorage.setItem("flexamarket_lang_explicit", "1");
      if (cart) localStorage.setItem("flexamarket_cart", JSON.stringify(cart));
    },
    { token: TOKEN, cart: CART },
  );
}

async function seedApp(page, { seedCart }) {
  await page.goto(APP + "/", { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.evaluate(
    ({ token, cart, seedCart }) => {
      localStorage.setItem("flexamarket_token", token);
      localStorage.setItem("flexamarket_marketplace_country", "Haiti");
      if (seedCart) localStorage.setItem("flexamarket_cart", JSON.stringify(cart));
    },
    { token: TOKEN, cart: CART, seedCart: !!seedCart },
  );
}

function isAuthGate(text, url) {
  if (/\/auth\/login/i.test(url)) return true;
  return AUTH_GATE_RE.test(text || "");
}

async function capture(page, url, file) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(3500);
  const text = await page.evaluate(() => document.body?.innerText || "");
  const finalUrl = page.url();
  await page.screenshot({ path: file, fullPage: false });
  return { text, finalUrl };
}

function matchesAny(text, patterns) {
  if (!patterns?.length) return true;
  return patterns.some((re) => re.test(text || ""));
}

function sideBySide(webFile, appFile, outFile, label, meta) {
  const py = `
from PIL import Image, ImageDraw, ImageFont
web = Image.open(${JSON.stringify(webFile)}).convert("RGB")
app = Image.open(${JSON.stringify(appFile)}).convert("RGB")
gap, header = 24, 88
w = web.width + app.width + gap * 3
h = max(web.height, app.height) + header + gap * 2
canvas = Image.new("RGB", (w, h), "#0F172A")
draw = ImageDraw.Draw(canvas)
try:
    font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 20)
    small = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 13)
except Exception:
    font = ImageFont.load_default(); small = font
draw.text((gap, 14), ${JSON.stringify(label)}, fill="#FFFFFF", font=font)
draw.text((gap, 42), ${JSON.stringify(meta)}, fill="#94A3B8", font=small)
draw.text((gap, 62), "Same account · Haiti · EN · 390x844@2x · Expo web = shared RN (not device APK)", fill="#64748B", font=small)
canvas.paste(web, (gap, header))
canvas.paste(app, (gap * 2 + web.width, header))
draw.rectangle([gap, header, gap+54, header+22], fill="#F97316")
draw.text((gap+6, header+4), "WEB", fill="#FFFFFF", font=small)
draw.rectangle([gap*2+web.width, header, gap*2+web.width+54, header+22], fill="#F97316")
draw.text((gap*2+web.width+6, header+4), "APP", fill="#FFFFFF", font=small)
canvas.save(${JSON.stringify(outFile)})
`;
  const r = spawnSync("python3", ["-c", py], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout || "compose failed");
  fs.copyFileSync(outFile, path.join(REPO_OUT, path.basename(outFile)));
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: VW, height: VH },
    deviceScaleFactor: 2,
    userAgent:
      "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36",
  });
  const page = await context.newPage();
  const report = [];

  await seedWeb(page);

  for (const s of SCREENS) {
    const webFile = path.join(OUT, `${s.id}_web.png`);
    const appFile = path.join(OUT, `${s.id}_app.png`);
    const pairFile = path.join(OUT, `${s.id}_side_by_side.png`);
    const row = {
      id: s.id,
      label: s.label,
      webPath: s.webPath,
      appPath: s.appPath,
      platformEvidence: "Expo web preview (shared RN) vs flexamarket.com",
      androidDevice: "BLOCKED — emulator ADB offline",
      iosDevice: "BLOCKED — no iOS simulator in this environment",
      result: "BLOCKED",
      reasons: [],
      note: s.note || null,
    };
    try {
      if (s.auth || s.seedCart) {
        await seedWeb(page);
        if (s.seedCart) {
          await page.evaluate((cart) => {
            localStorage.setItem("flexamarket_cart", JSON.stringify(cart));
          }, CART);
        }
      }
      const web = await capture(page, WEB + s.webPath, webFile);
      if (isAuthGate(web.text, web.finalUrl)) {
        row.result = "BLOCKED";
        row.reasons.push(
          `WEB still auth-gated after token seed (url=${web.finalUrl})`,
        );
      } else if (!matchesAny(web.text, s.expectWeb)) {
        row.result = "FAIL";
        row.reasons.push("WEB content did not match expected screen markers");
      }

      await seedApp(page, { seedCart: s.seedCart });
      const app = await capture(page, APP + s.appPath, appFile);
      if (isAuthGate(app.text, app.finalUrl)) {
        row.result = "BLOCKED";
        row.reasons.push(
          `APP redirected to auth (url=${app.finalUrl}) — token seed failed or route gated`,
        );
      } else if (!matchesAny(app.text, s.expectApp)) {
        if (row.result !== "BLOCKED") row.result = "FAIL";
        row.reasons.push("APP content did not match expected screen markers");
      }

      if (s.expectShared?.length && row.result !== "BLOCKED") {
        for (const needle of s.expectShared) {
          const re = new RegExp(needle, "i");
          if (!re.test(web.text) || !re.test(app.text)) {
            row.result = "FAIL";
            row.reasons.push(
              `Shared identifier missing on one side: ${needle}`,
            );
          }
        }
      }

      if (!row.reasons.length) row.result = "PASS";

      sideBySide(
        webFile,
        appFile,
        pairFile,
        s.label,
        `${s.webPath}  |  ${s.appPath}  ·  result=${row.result}`,
      );
      fs.copyFileSync(webFile, path.join(REPO_OUT, path.basename(webFile)));
      fs.copyFileSync(appFile, path.join(REPO_OUT, path.basename(appFile)));
      row.webFinalUrl = web.finalUrl;
      row.appFinalUrl = app.finalUrl;
      console.log(row.result, s.id, row.reasons.join("; ") || "ok");
    } catch (e) {
      row.result = "BLOCKED";
      row.reasons.push(String(e?.message || e));
      console.error("BLOCKED", s.id, e);
    }
    report.push(row);
  }

  const summary = {
    PASS: report.filter((r) => r.result === "PASS").length,
    FAIL: report.filter((r) => r.result === "FAIL").length,
    BLOCKED: report.filter((r) => r.result === "BLOCKED").length,
    total: report.length,
  };

  const payload = {
    correctedAt: new Date().toISOString(),
    account: "superadmin via FLEXA_TEST_SUPERADMIN (id=1, Haiti)",
    orderId: ORDER_ID,
    supportId: SUPPORT_ID,
    listingId: LISTING_ID,
    viewport: `${VW}x${VH}@2x`,
    summary,
    screens: report,
    priorInvalidComparisonsRetracted: [
      "batch2 04_orders / 05_order_detail — WEB was Sign In",
      "batch2 06_tracking — WEB was Home",
      "batch2 07–10 auth screens — WEB was Sign In / settings gate",
      "batch3 02–08, 10 — WEB was Sign In / support landing / FlexaBot gate",
      "batch1 07–09 checkout — WEB was empty cart",
      "batch1 10 confirmation — WEB was invalid payment session",
    ],
  };

  const reportPath = path.join(OUT, "parity-corrected-report.json");
  fs.writeFileSync(reportPath, JSON.stringify(payload, null, 2));
  fs.copyFileSync(reportPath, path.join(REPO_OUT, "parity-corrected-report.json"));
  console.log("SUMMARY", summary);
  await browser.close();
  if (summary.PASS === 0 && summary.FAIL === 0) process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
