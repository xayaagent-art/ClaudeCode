import { chromium } from "playwright";

const OUT = "/home/user/ClaudeCode/design/qa/today";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const page = await ctx.newPage();
await page.goto("http://localhost:3311/today", { waitUntil: "networkidle" });
await page.waitForTimeout(800);

// Long title, and the availability values named in the brief, driven straight
// into the rendered DOM so the real layout has to cope rather than a mock.
await page.evaluate(() => {
  const h1 = document.querySelector("h1");
  if (h1) {
    h1.textContent =
      "Mediterranean Lemon Garlic Chicken with Roasted Vegetables and Herbed Greek Yogurt";
  }
});
await page.screenshot({ path: `${OUT}/edge-long-title.png` });

for (const value of ["100%", "50%"]) {
  await page.evaluate((v) => {
    const el = [...document.querySelectorAll("p")].find((p) => /^\d+%$/.test(p.textContent ?? ""));
    if (el) el.textContent = v;
  }, value);
  await page.screenshot({ path: `${OUT}/edge-${value.replace("%", "")}.png` });
}

console.log("edge cases captured");
await browser.close();
