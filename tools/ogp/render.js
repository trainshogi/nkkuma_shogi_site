// シェア画像（1200×630）を書き出す: node tools/ogp/render.js
// cards.html の .card をひとつずつ撮って public/img/ogp/<id>.png に置く
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

(async () => {
  const out = path.join(__dirname, '../../public/img/ogp');
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1300, height: 2200 } });
  await page.goto('file://' + path.join(__dirname, 'cards.html'));
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
  for (const card of await page.$$('.card')) {
    const id = await card.getAttribute('id');
    await card.screenshot({ path: path.join(out, id + '.png') });
    console.log('wrote', id + '.png');
  }
  await browser.close();
})();
