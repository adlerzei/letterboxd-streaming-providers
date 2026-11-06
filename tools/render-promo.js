// Renders promo/small-promo-tile.html into the 440x280 Chrome Web Store small
// promo tile. The screenshot is taken without transparency, then saved as a
// 24-bit PNG (no alpha channel) as the store requires.
// Usage: node tools/render-promo.js   (requires Playwright with Chromium)
const { chromium } = require('playwright');
const path = require('path');

const promoDir = path.join(__dirname, '..', 'promo');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 440, height: 280 } });
  await page.goto('file://' + path.join(promoDir, 'small-promo-tile.html'));
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: path.join(promoDir, 'small-promo-tile.png') });
  await browser.close();
})();
