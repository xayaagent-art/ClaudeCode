// Rasterises the development fixtures with the Chromium that ships in this
// environment. Run with: npm run fixture:render
//
// Outputs:
//   public/fixtures/trader-joes-receipt.png  — fed through the real vision pipeline
//   public/icons/icon-{192,512,maskable-512}.png — PWA icons
//
// The generated files are committed, so contributors do not need Playwright
// unless they are changing the fixtures themselves.

import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdir } from "node:fs/promises";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

const ICON_HTML = (size, maskable) => `
<!doctype html><meta charset="utf-8">
<style>
  html,body{margin:0;padding:0}
  .plate{
    width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;
    background:#3f6b4e;${maskable ? "" : `border-radius:${Math.round(size * 0.22)}px;`}
  }
  svg{width:${Math.round(size * (maskable ? 0.5 : 0.58))}px;height:auto}
</style>
<div class="plate">
  <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M8 18h32l-2.8 18.4A4 4 0 0 1 33.3 40H14.7a4 4 0 0 1-3.9-3.6L8 18Z"
      stroke="#fafaf7" stroke-width="3" stroke-linejoin="round"/>
    <path d="M17 18 22 7.6M31 18 26 7.6" stroke="#fafaf7" stroke-width="3" stroke-linecap="round"/>
  </svg>
</div>`;

// CHROMIUM_PATH lets environments that already ship a browser skip the
// Playwright download (e.g. `/opt/pw-browsers/chromium`).
const executablePath = process.env.CHROMIUM_PATH || undefined;
const browser = await chromium.launch(executablePath ? { executablePath } : {});
try {
  const page = await browser.newPage({ deviceScaleFactor: 2 });

  await mkdir(join(root, "public", "fixtures"), { recursive: true });
  await page.goto(`file://${join(root, "fixtures", "trader-joes-receipt.html")}`);
  await page.setViewportSize({ width: 420, height: 1000 });
  await page.locator("body").screenshot({
    path: join(root, "public", "fixtures", "trader-joes-receipt.png"),
  });
  console.log("wrote public/fixtures/trader-joes-receipt.png");

  await mkdir(join(root, "public", "icons"), { recursive: true });
  const icons = [
    { size: 192, maskable: false, name: "icon-192.png" },
    { size: 512, maskable: false, name: "icon-512.png" },
    { size: 512, maskable: true, name: "icon-maskable-512.png" },
  ];
  for (const icon of icons) {
    const iconPage = await browser.newPage({ viewport: { width: icon.size, height: icon.size } });
    await iconPage.setContent(ICON_HTML(icon.size, icon.maskable));
    await iconPage.locator(".plate").screenshot({ path: join(root, "public", "icons", icon.name) });
    await iconPage.close();
    console.log(`wrote public/icons/${icon.name}`);
  }
} finally {
  await browser.close();
}
