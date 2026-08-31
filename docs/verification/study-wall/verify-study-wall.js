// 検討室「壁」検証スクリプト: 3局面まで無料→4局面目ロック→意思表明、を実ブラウザで踏み、
// 各状態のスクショと、GA4送信内容・/eval呼び出し回数を記録する。
//
// 使い方(検品の再現手順):
//   1) cd public && python3 -m http.server 3000   # /eval のCORS許可オリジンが localhost:3000 のため
//   2) npm i puppeteer-core                        # Chrome本体は /Applications のものを使う
//   3) node scripts/verify-study-wall.js 出力ディレクトリ
// 期待値は末尾のログ出力コメント参照(/eval 4回 = 無料3局面 + 調べ済み局面の再検討1回)
const puppeteer = require('puppeteer-core');

const KIF = `手合割：平手
手数----指手---------消費時間--
   1 ７六歩(77)
   2 ３四歩(33)
   3 ２六歩(27)
   4 ８四歩(83)
   5 ２五歩(26)
   6 ８五歩(84)`;

const OUT = process.argv[2] || '.';

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 430, height: 1600, deviceScaleFactor: 2 });

  const gaEvents = [];   // {en, dl, params}
  const evalCalls = [];  // POST /eval の回数
  page.on('request', (req) => {
    const u = req.url();
    if (u.includes('execute-api') && u.includes('/eval') && req.method() === 'POST') {
      evalCalls.push(u);
    }
    if (u.includes('google-analytics.com/g/collect')) {
      const url = new URL(u);
      const p = url.searchParams;
      const rec = { en: p.get('en'), dl: p.get('dl'), ep: {} };
      for (const [k, v] of p) { if (k.startsWith('ep.') || k.startsWith('epn.')) rec.ep[k] = v; }
      // POSTボディに複数イベントが入る形式も拾う
      const body = req.postData();
      if (body) rec.body = body;
      gaEvents.push(rec);
    }
  });

  await page.goto('http://localhost:3000/study.html', { waitUntil: 'networkidle2' });

  // 棋譜を読み込む
  await page.evaluate((kif) => { document.getElementById('kif-in').value = kif; }, KIF);
  await page.click('#btn-load');
  await page.waitForSelector('#viewer:not([hidden])');
  await page.evaluate(() => document.getElementById('study-panel').scrollIntoView({ block: 'center' }));
  await page.screenshot({ path: OUT + '/01-loaded-quota3.png' });
  console.log('quota(load):', await page.$eval('#study-quota', (e) => e.textContent));

  async function evalAt(moveIndex, shot) {
    if (moveIndex != null) {
      await page.evaluate((i) => {
        document.querySelectorAll('#move-list li')[i].click();
      }, moveIndex);
    }
    await page.click('#btn-study');
    // 検討完了(ボタンが元の文言に戻り、busyが解ける)を待つ
    await page.waitForFunction(
      () => document.getElementById('btn-study').textContent === '候補手を調べる' &&
            !document.getElementById('btn-study').disabled,
      { timeout: 30000 }
    );
    await page.evaluate(() => document.getElementById('study-panel').scrollIntoView({ block: 'center' }));
    if (shot) await page.screenshot({ path: OUT + '/' + shot });
    console.log('quota:', await page.$eval('#study-quota', (e) => e.textContent),
                '| wall hidden:', await page.$eval('#wall-box', (e) => e.hidden),
                '| evalCalls:', evalCalls.length);
  }

  await evalAt(null, null);          // 1局面目: 最終局面(6手目)
  await evalAt(2, '02-quota1.png');  // 2局面目: 3手目
  await evalAt(0, '03-quota0.png');  // 3局面目: 1手目

  // 4局面目: 5手目 → 壁が出て /eval は呼ばれないはず
  await page.evaluate(() => { document.querySelectorAll('#move-list li')[4].click(); });
  await page.click('#btn-study');
  await new Promise((r) => setTimeout(r, 600));
  await page.evaluate(() => document.getElementById('wall-box').scrollIntoView({ block: 'center' }));
  await page.screenshot({ path: OUT + '/04-wall.png' });
  console.log('WALL shown:', !(await page.$eval('#wall-box', (e) => e.hidden)),
              '| evalCalls total:', evalCalls.length);

  // 調べ済み局面の再検討は通る(枠は増えない)
  await page.evaluate(() => { document.querySelectorAll('#move-list li')[0].click(); });
  await evalAt(null, null);
  console.log('re-eval of studied position allowed, evalCalls:', evalCalls.length);

  // もう一度壁に当ててから意思表明を押す
  await page.evaluate(() => { document.querySelectorAll('#move-list li')[4].click(); });
  await page.click('#btn-study');
  await new Promise((r) => setTimeout(r, 300));
  await page.click('#btn-wall-intent');
  await new Promise((r) => setTimeout(r, 600));
  await page.evaluate(() => document.getElementById('wall-box').scrollIntoView({ block: 'center' }));
  await page.screenshot({ path: OUT + '/05-intent-done.png' });
  console.log('intent button hidden:', await page.$eval('#btn-wall-intent', (e) => e.hidden),
              '| thanks shown:', !(await page.$eval('#wall-intent-done', (e) => e.hidden)));

  await new Promise((r) => setTimeout(r, 1500)); // GAビーコン送出待ち
  console.log('\n--- GA4 events ---');
  for (const g of gaEvents) {
    console.log(JSON.stringify(g));
  }
  console.log('\n--- /eval calls:', evalCalls.length, '(期待値: 4 = 無料3 + 再検討1) ---');
  await browser.close();
})();
