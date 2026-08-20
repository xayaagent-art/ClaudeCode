import { chromium } from "playwright";

const OUT = "/home/user/ClaudeCode/design/qa/today";
const iteration = process.argv[2] ?? "01";
const BASE = "http://localhost:3311";

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });

async function shoot(name, width, height) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/today`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
  await ctx.close();
}

// Primary QA viewport, then the two other sizes named in the brief.
await shoot(`iteration-${iteration}`, 390, 844);
await shoot(`iteration-${iteration}-393`, 393, 852);
await shoot(`iteration-${iteration}-430`, 430, 932);

// Functional regression: every destination the screen offers must work.
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const results = [];

await page.goto(`${BASE}/today`, { waitUntil: "networkidle" });
const heroHref = await page.locator('a[href^="/recipes/"]').first().getAttribute("href");
await page.goto(`${BASE}${heroHref}`, { waitUntil: "networkidle" });
results.push(["Today hero -> recipe", page.url().includes("/recipes/"), await page.locator("h1").first().textContent()]);

for (const [label, path] of [["Plan", "/plan"], ["Kitchen", "/kitchen"], ["Scan", "/kitchen/scan"], ["Settings", "/settings"]]) {
  const response = await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  results.push([label, response.status() === 200, String(response.status())]);
}

console.log(JSON.stringify(results, null, 2));
await browser.close();
