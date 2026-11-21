/**
 * Batch 3 side-by-side screenshots: website vs native Expo app.
 * Screens are disjoint from batch 1 (shopping) and batch 2 (account/orders).
 */
import { chromium } from "playwright";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const OUT = process.env.OUT_DIR || "/opt/cursor/artifacts/native-batch3";
const REPO_OUT =
  process.env.REPO_OUT ||
  "/agent/repos/Flexa-market/artifacts/mobile/releases/native-batch3-screens";
const WEB = "https://flexamarket.com";
const APP = process.env.APP_BASE || "http://127.0.0.1:8081";
const VW = 390;
const VH = 844;

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(REPO_OUT, { recursive: true });

const SCREENS = [
  {
    id: "01_forgot_password",
    label: "1 Forgot password",
    webPath: "/auth/forgot-password",
    appPath: "/auth/forgot-password",
  },
  {
    id: "02_sell",
    label: "2 Sell / create listing",
    webPath: "/sell",
    appPath: "/batch3-preview/sell",
  },
  {
    id: "03_my_listings",
    label: "3 My listings",
    webPath: "/sell",
    appPath: "/batch3-preview/my-listings",
  },
  {
    id: "04_sales",
    label: "4 Seller sales",
    webPath: "/sales",
    appPath: "/batch3-preview/sales",
  },
  {
    id: "05_offers",
    label: "5 Private offers",
    webPath: "/offers",
    appPath: "/batch3-preview/offers",
  },
  {
    id: "06_support",
    label: "6 Support tickets",
    webPath: "/support",
    appPath: "/batch3-preview/support",
  },
  {
    id: "07_support_detail",
    label: "7 Support ticket detail",
    webPath: "/support",
    appPath: "/batch3-preview/support-detail",
  },
  {
    id: "08_edit_profile",
    label: "8 Edit profile",
    webPath: "/profile/edit",
    appPath: "/batch3-preview/edit-profile",
  },
  {
    id: "09_music",
    label: "9 Flexa Music",
    webPath: "/music",
    appPath: "/music",
  },
  {
    id: "10_chatbot",
    label: "10 FlexaBot",
    webPath: "/chatbot",
    appPath: "/chatbot",
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
      report.push({ id: s.id, label: s.label, status: "captured", note: null });
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
        batch: 3,
        platform: "Expo web preview of shared React Native app (Android + iOS)",
        build: "local Expo bundler + https://flexamarket.com",
        viewport: `${VW}x${VH}@2x`,
        disjointFrom: ["batch1-shopping", "batch2-account-orders"],
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
