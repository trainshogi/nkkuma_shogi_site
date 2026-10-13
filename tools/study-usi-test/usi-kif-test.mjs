// public/js/usi-kif.js(大会の係のページが QR を KIF に直す)が、study.html と同じ KIF を書くか。
//   使い方: cd tools/study-usi-test && node usi-kif-test.mjs   (python-shogi は要らない)
//   正解は study.html の parseUsiPosition(dom.mjs で実ページの JS をそのまま走らせる)。
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { run } from './dom.mjs';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUB = path.join(HERE, '..', '..', 'public');
const win = {};
new Function('window', fs.readFileSync(path.join(PUB, 'js', 'usi-kif.js'), 'utf8'))(win);
const U = win.UsiKif;
let pass = 0, fail = 0;
const check = (label, cond, detail) => { if (cond) pass++; else { fail++; console.log('NG', label, detail || ''); } };

// 1) 手合割の表が study.html と同じ
const study = run(path.join(PUB, 'study.html'));
check('手合割の表', JSON.stringify(study.HANDICAP_SFENS) === JSON.stringify(U.HANDICAP_SFENS));

// 2) 同じ USI から同じ KIF
const games = [
  'position startpos moves 7g7f 3c3d 8h2b+ 3a2b B*4e 2b3c 4e3d 3c3d',
  'position startpos moves 7g7f 8c8d 2g2f 8d8e 8h7g 3c3d 7i8h 2b7g+ 8h7g B*4e',
  'position startpos moves 2g2f 8c8d 2f2e 8d8e 2e2d 2c2d 2h2d 8e8f 8g8f 8b8f 2d2c+ 8f8g+ 2c3b 8g7h 3b4a 7h6i',
  'position startpos moves 9g9f 1c1d 9f9e 1d1e 9e9d 9c9d 9i9d 1e1f 9d9c+ 1f1g+ 9c9b 1g1h',
  '7g7f 3c3d 2g2f',
];
for (const [name, sfen] of Object.entries(U.HANDICAP_SFENS)) {
  if (name === '平手') continue;
  games.push('position sfen ' + sfen + ' moves 5a4b 7g7f 4b3b 2g2f');
}
for (const g of games) {
  for (const form of ['url', 'underscore', 'space']) {
    const frag = g.split(' ').join('_');
    const input = form === 'url' ? 'https://shogi.nkkuma.tokyo/study.html#u=' + frag
                : form === 'underscore' ? frag : encodeURIComponent(g);
    const r = U.read(input);
    const t = run(path.join(PUB, 'study.html'), { hash: '#u=' + frag });
    const want = t.el('kif-in').value;
    check(g.slice(0, 40) + ' / ' + form, !r.error && r.kif === want, r.error || ('\n' + r.kif + '\n---\n' + want));
    check(g.slice(0, 40) + ' 手数', r.plies === t.viewer.plies.length);
  }
}
// 3) 読めないもの
check('QR でない URL', !!U.read('https://example.com/').error);
check('途中図', !!U.read('position sfen 4k4/9/9/9/9/9/9/9/4K4 b G 1 moves G*5b').error);
check('壊れた手', !!U.read('position startpos moves 7g7f zz').error);
check('動かす駒がない', !!U.read('position startpos moves 5e5d').error);
console.log(`usi-kif: ${pass} ok, ${fail} ng`);
process.exit(fail ? 1 : 0);
