/**
 * Side-by-side screenshots: website vs native Expo app (web preview).
 * Seeds auth token + cart for checkout steps.
 */
import { chromium } from "playwright";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const OUT = process.env.OUT_DIR || "/opt/cursor/artifacts/native-batch1";
const REPO_OUT =
  process.env.REPO_OUT ||
  "/agent/repos/Flexa-market/artifacts/mobile/releases/native-batch1-screens";
const WEB = "https://flexamarket.com";
const APP = process.env.APP_BASE || "http://127.0.0.1:8081";
const VW = 390;
const VH = 844;
const TOKEN = fs.existsSync("/tmp/fm_token.txt")
  ? fs.readFileSync("/tmp/fm_token.txt", "utf8").trim()
  : "";

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(REPO_OUT, { recursive: true });

const listingId = process.env.LISTING_ID || "73";
const sellerId = process.env.SELLER_ID || "2";

const CART = [
  {
    listingId: Number(listingId),
    title: "Ventilateur Oscillant Rechargeable 5400mAh USB-C",
    price: 4,
    currency: "USD",
    image:
      "https://res.cloudinary.com/dvkbgodbk/image/upload/v1780608173/flexa-market/tboq0rvkucjwiwof7gwh.jpg",
    country: "Haiti",
    city: "Port-au-Prince",
    sellerId: Number(sellerId),
    quantity: 1,
  },
];

const SCREENS = [
  { id: "01_home", label: "1 Home", webPath: "/", appPath: "/", auth: false },
  {
    id: "02_categories",
    label: "2 Categories",
    webPath: "/categories/electronics",
    appPath: "/categories?slug=electronics",
    auth: false,
  },
  {
    id: "03_search",
    label: "3 Search results",
    webPath: "/search?q=ventilateur",
    appPath: "/search?q=ventilateur",
    auth: false,
  },
  {
    id: "04_product",
    label: "4 Product details",
    webPath: `/listings/${listingId}`,
    appPath: `/listing/${listingId}`,
    auth: false,
  },
  {
    id: "05_seller",
    label: "5 Seller storefront",
    webPath: `/profile/${sellerId}`,
    appPath: `/seller/${sellerId}`,
    auth: false,
  },
  { id: "06_cart", label: "6 Cart", webPath: "/cart", appPath: "/cart", auth: true },
  {
    id: "07_checkout_address",
    label: "7 Checkout address",
    webPath: "/cart",
    appPath: "/checkout-steps-preview?step=address",
    auth: true,
    note: "Website cart checkout sheet vs native address step",
  },
  {
    id: "08_checkout_shipping",
    label: "8 Shipping options",
    webPath: "/cart",
    appPath: "/checkout-steps-preview?step=shipping",
    auth: true,
    note: "Native shipping method step",
  },
  {
    id: "09_checkout_payment",
    label: "9 Payment selection",
    webPath: "/cart",
    appPath: "/checkout-steps-preview?step=payment",
    auth: true,
    note: "Native Stripe-only payment step",
  },
  {
    id: "10_confirmation",
    label: "10 Order confirmation",
    webPath: "/checkout/success",
    appPath:
      "/checkout-success?listingTitle=Test%20order&amount=25&deliveryTotal=5&browserResult=success",
    auth: false,
  },
];

async function seedApp(page, { withAuth }) {
  await page.goto(APP + "/", { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.evaluate(
    ({ token, cart, withAuth }) => {
      try {
        localStorage.setItem("flexamarket_marketplace_country", "Haiti");
        localStorage.setItem("flexamarket_cart", JSON.stringify(cart));
        if (withAuth && token) {
          localStorage.setItem("flexamarket_token", token);
        } else {
          localStorage.removeItem("flexamarket_token");
        }
      } catch (_) {}
    },
    { token: TOKEN, cart: CART, withAuth },
  );
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
}

async function shot(page, url, file) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(2800);
  await page.screenshot({ path: file, fullPage: false });
}

function sideBySide(webFile, appFile, outFile, label) {
  const py = `
from PIL import Image, ImageDraw, ImageFont
web = Image.open(${JSON.stringify(webFile)}).convert("RGB")
app = Image.open(${JSON.stringify(appFile)}).convert("RGB")
gap, header = 24, 64
w = web.width + app.width + gap * 3
h = max(web.height, app.height) + header + gap * 2
canvas = Image.new("RGB", (w, h), "#0F172A")
draw = ImageDraw.Draw(canvas)
try:
    font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 22)
    small = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 14)
except Exception:
    font = ImageFont.load_default()
    small = font
draw.text((gap, 16), ${JSON.stringify(label)}, fill="#FFFFFF", font=font)
draw.text((gap, 44), "Website (left)  ·  Native RN Expo web preview (right)  ·  390x844", fill="#94A3B8", font=small)
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

  for (const s of SCREENS) {
    const webFile = path.join(OUT, `${s.id}_web.png`);
    const appFile = path.join(OUT, `${s.id}_app.png`);
    const pairFile = path.join(OUT, `${s.id}_side_by_side.png`);
    try {
      await shot(page, WEB + s.webPath, webFile);
      await seedApp(page, { withAuth: !!s.auth });
      await page.goto(APP + s.appPath, {
        waitUntil: "domcontentloaded",
        timeout: 90000,
      });
      await page.waitForTimeout(3200);
      const dismiss = page.getByText("Dismiss");
      if (await dismiss.count()) {
        await dismiss.first().click().catch(() => {});
        await page.waitForTimeout(500);
      }
      await page.screenshot({ path: appFile, fullPage: false });
      sideBySide(webFile, appFile, pairFile, s.label);
      report.push({
        id: s.id,
        label: s.label,
        status: "captured",
        note: s.note || null,
        pair: pairFile,
      });
      console.log("OK", s.id);
    } catch (e) {
      report.push({
        id: s.id,
        label: s.label,
        status: "failed",
        error: String(e?.message || e),
      });
      console.error("FAIL", s.id, e);
    }
  }

  const reportPath = path.join(OUT, "report.json");
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        platform: "Expo web preview of shared React Native app (Android + iOS)",
        build: "local Expo bundler http://127.0.0.1:8081 + https://flexamarket.com",
        viewport: `${VW}x${VH}@2x`,
        authSeeded: Boolean(TOKEN),
        capturedAt: new Date().toISOString(),
        screens: report,
      },
      null,
      2,
    ),
  );
  fs.copyFileSync(reportPath, path.join(REPO_OUT, "report.json"));
  // also copy individual app/web shots into repo
  for (const f of fs.readdirSync(OUT)) {
    if (f.endsWith(".png")) {
      fs.copyFileSync(path.join(OUT, f), path.join(REPO_OUT, f));
    }
  }
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
