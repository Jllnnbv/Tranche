#!/usr/bin/env node
/**
 * Playwright Live Capture Script for Ambagan Marketing Video
 *
 * Launches (or connects to) the Ambagan Next.js app on http://localhost:3000,
 * signs a valid `tranche_session` cookie using SESSION_SECRET from `.env.local`,
 * and records 3 choreographed 1480×1024 retina video clips + high-DPI snapshots:
 *   1. hero.mp4       — Landing page, smooth scroll to "How Ambagan Works", Start Saving modal
 *   2. contract.mp4   — Dashboard pool cards & Group E-Contract with cryptographic signature flow
 *   3. dashboard.mp4  — Group Dashboard (Antipolo Trip), GCash/Stellar payment flow & On-Chain receipt
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn, execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, "../..");
const CAPTURES_DIR = path.resolve(__dirname, "../public/captures");
const RAW_DIR = path.resolve(__dirname, "../.raw-recordings");

fs.mkdirSync(CAPTURES_DIR, { recursive: true });
fs.mkdirSync(RAW_DIR, { recursive: true });

// Read SESSION_SECRET from ../.env.local
function getSessionSecret() {
  const envPath = path.join(APP_ROOT, ".env.local");
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, "utf8");
    const match = content.match(/^SESSION_SECRET=(.+)$/m);
    if (match && match[1]) return match[1].trim();
  }
  return "39b9e4fe63d2483b921fda7668bc6d102add268b0cc36c1c21ab09463097b8f8";
}

function createSignedSessionToken(userId, secret) {
  const exp = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;
  const payload = Buffer.from(JSON.stringify({ uid: userId, exp })).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

async function isServerUp(url) {
  try {
    const res = await fetch(`${url}/login`, { redirect: "manual" });
    return res.status > 0 && res.status < 500;
  } catch {
    return false;
  }
}

async function ensureNextServer() {
  const baseUrl = "http://localhost:3000";
  if (await isServerUp(baseUrl)) {
    console.log(`Using already running Next.js server on ${baseUrl}`);
    return { proc: null, baseUrl };
  }

  console.log("Starting Next.js dev server on http://localhost:3000...");
  const proc = spawn("pnpm", ["dev"], {
    cwd: APP_ROOT,
    stdio: "pipe",
    env: { ...process.env, PORT: "3000" },
  });

  for (let i = 0; i < 60; i++) {
    if (await isServerUp(baseUrl)) {
      console.log(`Next.js server is ready on ${baseUrl}!`);
      return { proc, baseUrl };
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("Timed out waiting for Next.js server on port 3000");
}

function findChromeExecutable() {
  const candidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return undefined;
}

function transcodeToMp4(inputWebm, outputMp4) {
  execSync(
    `ffmpeg -y -i "${inputWebm}" -c:v libx264 -pix_fmt yuv420p -preset fast -crf 17 -r 60 -an "${outputMp4}"`,
    { stdio: "ignore" }
  );
}

async function smoothScroll(page, targetY, durationMs = 1400) {
  await page.evaluate(
    async ({ y, ms }) => {
      const startY = window.scrollY;
      const diff = y - startY;
      const start = performance.now();
      await new Promise((resolve) => {
        function step(now) {
          const elapsed = now - start;
          const t = Math.min(1, elapsed / ms);
          // easeInOutCubic
          const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
          window.scrollTo(0, startY + diff * ease);
          if (t < 1) requestAnimationFrame(step);
          else resolve();
        }
        requestAnimationFrame(step);
      });
    },
    { y: targetY, ms: durationMs }
  );
}

async function recordClip(browser, name, baseUrl, token, actionsFn) {
  console.log(`Recording Playwright clip: ${name}...`);
  const clipRawDir = path.join(RAW_DIR, name);
  fs.mkdirSync(clipRawDir, { recursive: true });

  const context = await browser.newContext({
    viewport: { width: 1480, height: 1024 },
    deviceScaleFactor: 2,
    recordVideo: {
      dir: clipRawDir,
      size: { width: 1480, height: 1024 },
    },
  });

  await context.addCookies([
    {
      name: "tranche_session",
      value: token,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);

  const page = await context.newPage();
  const video = page.video();

  await actionsFn(page, baseUrl);

  await context.close();
  const webmPath = await video.path();
  const mp4Path = path.join(CAPTURES_DIR, `${name}.mp4`);
  transcodeToMp4(webmPath, mp4Path);
  console.log(`Saved ${mp4Path}`);
}

async function main() {
  const secret = getSessionSecret();
  // Julianna's user ID from data/users.json
  const token = createSignedSessionToken("76724fe8-1c64-443e-b3c1-f07675a0a3fa", secret);

  const { proc, baseUrl } = await ensureNextServer();

  try {
    const execPath = findChromeExecutable();
    const browser = await chromium.launch({
      headless: true,
      ...(execPath ? { executablePath: execPath } : {}),
    });

    // CLIP 1: Hero & "How Ambagan Works" + Start Saving Modal (~7.5s)
    await recordClip(browser, "hero", baseUrl, token, async (page, url) => {
      await page.goto(`${url}/`, { waitUntil: "networkidle" });
      await page.waitForTimeout(1200);
      await page.screenshot({ path: path.join(CAPTURES_DIR, "hero-top.png") });

      // Smooth scroll down to "How Ambagan Works" diagram & 3 step cards
      await smoothScroll(page, 940, 1800);
      await page.waitForTimeout(1600);
      await page.screenshot({ path: path.join(CAPTURES_DIR, "hero-how.png") });

      // Smooth scroll back up & trigger Start Saving modal
      await smoothScroll(page, 0, 1200);
      await page.waitForTimeout(500);
      await page.click(".lp-primary").catch(() => {});
      await page.waitForTimeout(1600);
      await page.screenshot({ path: path.join(CAPTURES_DIR, "hero-modal.png") });
    });

    // CLIP 2: Group Pool Dashboard & E-Contract Signing (~7.5s)
    await recordClip(browser, "contract", baseUrl, token, async (page, url) => {
      await page.goto(`${url}/dashboard`, { waitUntil: "networkidle" });
      await page.waitForTimeout(1400);
      await page.screenshot({ path: path.join(CAPTURES_DIR, "dashboard-overview.png") });

      await page.goto(`${url}/contract?plan=antipolo-trip`, { waitUntil: "networkidle" });
      await page.waitForTimeout(1400);
      await page.screenshot({ path: path.join(CAPTURES_DIR, "contract-top.png") });

      // Scroll through the programmable split terms & signatories
      await smoothScroll(page, 620, 1600);
      await page.waitForTimeout(1300);
      await smoothScroll(page, 1180, 1400);
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(CAPTURES_DIR, "contract-signatories.png") });
    });

    // CLIP 3: Group Dashboard (Antipolo Trip) + Live GCash/Stellar Payment Flow (~7.5s)
    await recordClip(browser, "dashboard", baseUrl, token, async (page, url) => {
      await page.goto(`${url}/group?plan=antipolo-trip`, { waitUntil: "networkidle" });
      await page.waitForTimeout(1600);
      await page.screenshot({ path: path.join(CAPTURES_DIR, "group-dashboard.png") });

      // Navigate to Payment checkout for Antipolo Trip
      await page.goto(`${url}/pay?plan=antipolo-trip`, { waitUntil: "networkidle" });
      await page.waitForTimeout(1100);
      await page.screenshot({ path: path.join(CAPTURES_DIR, "pay-method.png") });

      // Click Continue to Review -> Authorize Payment -> Success Receipt
      const buttons = await page.locator("button").all();
      for (const b of buttons) {
        const txt = (await b.textContent()) || "";
        if (/review|continue/i.test(txt)) {
          await b.click().catch(() => {});
          break;
        }
      }
      await page.waitForTimeout(1000);
      await page.screenshot({ path: path.join(CAPTURES_DIR, "pay-review.png") });

      // Jump to success view to guarantee crisp confirmation & receipt capture
      await page.goto(`${url}/pay?plan=antipolo-trip&view=success`, { waitUntil: "networkidle" });
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(CAPTURES_DIR, "pay-success.png") });

      await page.goto(`${url}/pay?plan=antipolo-trip&view=receipt`, { waitUntil: "networkidle" });
      await page.waitForTimeout(1400);
      await page.screenshot({ path: path.join(CAPTURES_DIR, "pay-receipt.png") });
    });

    await browser.close();
  } finally {
    if (proc) {
      proc.kill("SIGTERM");
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
