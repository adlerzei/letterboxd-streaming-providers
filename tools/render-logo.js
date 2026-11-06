// Renders extension/icons/logo.svg into the PNG icons used by the extension.
// Usage: node tools/render-logo.js   (requires Playwright with Chromium)
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const iconsDir = path.join(__dirname, '..', 'extension', 'icons');
const svg = fs.readFileSync(path.join(iconsDir, 'logo.svg'), 'utf8');
const targets = { 'logo_final.png': 524, 'logo_final_128.png': 128, 'logo_final_48.png': 48, 'logo_final_32.png': 32 };

(async () => {
  const browser = await chromium.launch();
  for (const [file, size] of Object.entries(targets)) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    const sized = svg.replace('width="512" height="512"', `width="${size}" height="${size}"`);
    await page.setContent(`<html><body style="margin:0;background:transparent">${sized}</body></html>`);
    await page.screenshot({ path: path.join(iconsDir, file), omitBackground: true });
    await page.close();
  }
  await browser.close();
})();
