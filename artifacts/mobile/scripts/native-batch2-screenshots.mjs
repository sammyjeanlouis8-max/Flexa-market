/**
 * Batch 2 side-by-side screenshots: website vs native Expo app.
 */
import { chromium } from "playwright";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const OUT = process.env.OUT_DIR || "/opt/cursor/artifacts/native-batch2";
const REPO_OUT =
  process.env.REPO_OUT ||
  "/agent/repos/Flexa-market/artifacts/mobile/releases/native-batch2-screens";
const WEB = "https://flexamarket.com";
const APP = process.env.APP_BASE || "http://127.0.0.1:8081";
const VW = 390;
const VH = 844;

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(REPO_OUT, { recursive: true });

const SCREENS = [
  { id: "01_login", label: "1 Login", webPath: "/auth/login", appPath: "/auth/login" },
  { id: "02_register", label: "2 Register", webPath: "/auth/register", appPath: "/auth/register" },
  { id: "03_account", label: "3 Account", webPath: "/settings", appPath: "/profile" },
  {
    id: "04_orders",
    label: "4 My Orders",
    webPath: "/orders",
    appPath: "/batch2-preview/orders",
  },
  {
    id: "05_order_detail",
    label: "5 Order details",
    webPath: "/orders",
    appPath: "/batch2-preview/order-detail",
  },
  {
    id: "06_tracking",
    label: "6 Delivery tracking",
    webPath: "/",
    appPath: "/batch2-preview/tracking",
    note: "Website public track vs native delivery tracking UI",
  },
  {
    id: "07_favorites",
    label: "7 Favorites",
    webPath: "/saved",
    appPath: "/batch2-preview/favorites",
  },
  {
    id: "08_addresses",
    label: "8 Addresses",
    webPath: "/settings/addresses",
    appPath: "/batch2-preview/addresses",
  },
  {
    id: "09_inbox",
    label: "9 Inbox",
    webPath: "/messages",
    appPath: "/batch2-preview/inbox",
  },
  {
    id: "10_notifications",
    label: "10 Notifications",
    webPath: "/settings/notifications",
    appPath: "/batch2-preview/notifications",
  },
];

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
    font = ImageFont.load_default(); small = font
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
      await shot(page, APP + s.appPath, appFile);
      sideBySide(webFile, appFile, pairFile, s.label);
      fs.copyFileSync(webFile, path.join(REPO_OUT, path.basename(webFile)));
      fs.copyFileSync(appFile, path.join(REPO_OUT, path.basename(appFile)));
      report.push({ id: s.id, label: s.label, status: "captured", note: s.note || null });
      console.log("OK", s.id);
    } catch (e) {
      report.push({ id: s.id, label: s.label, status: "failed", error: String(e?.message || e) });
      console.error("FAIL", s.id, e);
    }
  }

  const reportPath = path.join(OUT, "report.json");
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        batch: 2,
        platform: "Expo web preview of shared React Native app (Android + iOS)",
        build: "local Expo bundler + https://flexamarket.com",
        viewport: `${VW}x${VH}@2x`,
        capturedAt: new Date().toISOString(),
        screens: report,
      },
      null,
      2,
    ),
  );
  fs.copyFileSync(reportPath, path.join(REPO_OUT, "report.json"));
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
