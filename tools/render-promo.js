// Renders the Chrome Web Store promo tiles from promo/*.html. Screenshots are
// taken without transparency, so they are saved as 24-bit PNGs (no alpha
// channel) as the store requires.
// Usage: node tools/render-promo.js   (requires Playwright with Chromium)
const { chromium } = require('playwright');
const path = require('path');

const promoDir = path.join(__dirname, '..', 'promo');
const tiles = [
  { name: 'small-promo-tile', width: 440, height: 280 },
  { name: 'large-promo-tile', width: 1400, height: 560 },
];

(async () => {
  const browser = await chromium.launch();
  for (const { name, width, height } of tiles) {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.goto('file://' + path.join(promoDir, `${name}.html`));
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: path.join(promoDir, `${name}.png`) });
    await page.close();
  }
  await browser.close();
})();
