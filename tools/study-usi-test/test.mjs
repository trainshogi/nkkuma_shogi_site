// study.html の #u=(USI)まわりの検証。**正解は python-shogi**。
//
//   使い方: cd tools/study-usi-test && node test.mjs
//   前提:   node と python-shogi(`pip install python-shogi`)
//   仕組み: gen.py が手合割14種の対局(乱数だが種は固定)を作り、
//           各局面のSFENを python-shogi の値で書き出す。
//           それを study.html の中身(dom.mjs が実ページのJSをそのまま読む)に
//           #u= で流し込み、1局面ずつ突き合わせる。写しは作らない。
import { execFileSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { run } from './dom.mjs';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const P = process.env.STUDY || path.join(HERE, '..', '..', 'public', 'study.html');
const cases = JSON.parse(execFileSync('python3', [path.join(HERE, 'gen.py')],
                                      { encoding: 'utf8', maxBuffer: 1 << 24 }));
let pass = 0, fail = 0;
const bad = [];
function check(label, cond, detail) {
  if (cond) { pass++; } else { fail++; bad.push(label + (detail ? ' :: ' + detail : '')); }
}

// 1) #u= に position sfen … moves … を渡し、全局面を python-shogi と突き合わせる
for (const c of cases) {
  for (const sep of ['_', '%20']) {
    const usi = 'position sfen ' + c.startSfen + ' moves ' + c.moves.join(' ');
    const frag = sep === '_' ? usi.split(' ').join('_') : encodeURIComponent(usi);
    const t = run(P, { hash: '#u=' + frag });
    const v = t.viewer;
    if (!v.positions) { check(`${c.name}/${sep} 読めた`, false, 'positions=null'); continue; }
    check(`${c.name}/${sep} 手数`, v.positions.length === c.sfens.length,
          `${v.positions.length} != ${c.sfens.length}`);
    let allSame = true, firstDiff = '';
    for (let i = 0; i < Math.min(v.positions.length, c.sfens.length); i++) {
      const got = t.toSfen(v.positions[i], i + 1);
      if (got !== c.sfens[i]) {
        allSame = false;
        if (!firstDiff) firstDiff = `ply ${i}: got ${got} / want ${c.sfens[i]}`;
      }
    }
    check(`${c.name}/${sep} 全局面一致`, allSame, firstDiff);
  }
}

// 2) 開始局面(0手)だけの #u= も開ける
for (const c of cases) {
  const t = run(P, { hash: '#u=' + ('position sfen ' + c.startSfen + ' moves').split(' ').join('_') });
  check(`${c.name} 0手`, t.viewer.positions && t.viewer.positions.length === 1,
        JSON.stringify(t.viewer.positions && t.viewer.positions.length));
  check(`${c.name} 0手のSFEN`, t.viewer.positions &&
        t.toSfen(t.viewer.positions[0], 1) === c.startSfen);
}

// 3) 貼り付け欄に書き戻すKIFが、同じ一局に読み直せる(往復)
for (const c of cases) {
  const usi = ('position sfen ' + c.startSfen + ' moves ' + c.moves.join(' ')).split(' ').join('_');
  const t = run(P, { hash: '#u=' + usi });
  const kif = t.el('kif-in').value;
  check(`${c.name} KIFの手合割`, kif.split('\n')[0] === '手合割：' + c.name, kif.split('\n')[0]);
  const re = t.parseKif(kif);
  check(`${c.name} KIF読み直し`, !re.error, re.error);
  // ページの「この棋譜を検討する」に流し込んで、盤が同じ一局になるか見る
  const t2 = run(P);
  t2.el('kif-in').value = kif;
  t2.el('btn-load').listeners.click[0]();
  const v2 = t2.viewer;
  let ok2 = !!v2.positions && v2.positions.length === c.sfens.length;
  let d2 = ok2 ? '' : `len ${v2.positions && v2.positions.length} != ${c.sfens.length}`;
  if (ok2) for (let i = 0; i < c.sfens.length; i++) {
    const got = t2.toSfen(v2.positions[i], i + 1);
    if (got !== c.sfens[i]) { ok2 = false; d2 = d2 || `ply ${i}: ${got} != ${c.sfens[i]}`; }
  }
  check(`${c.name} KIF往復で同じ一局`, ok2, d2);
}

// 4) 旧来の #u=(指し手だけ)が今までどおり平手で並ぶ
{
  const hirate = cases.find(c => c.name === '平手');
  const t = run(P, { hash: '#u=' + hirate.moves.join('_') });
  let same = t.viewer.positions && t.viewer.positions.length === hirate.sfens.length;
  if (same) for (let i = 0; i < hirate.sfens.length; i++) {
    if (t.toSfen(t.viewer.positions[i], i + 1) !== hirate.sfens[i]) same = false;
  }
  check('旧形式 #u=(指し手だけ) 互換', same);
  check('旧形式 KIFは手合割：平手', t.el('kif-in').value.split('\n')[0] === '手合割：平手');
  const t2 = run(P, { hash: '#u=' + ('position startpos moves ' + hirate.moves.join(' ')).split(' ').join('_') });
  let same2 = t2.viewer.positions && t2.viewer.positions.length === hirate.sfens.length;
  if (same2) for (let i = 0; i < hirate.sfens.length; i++) {
    if (t2.toSfen(t2.viewer.positions[i], i + 1) !== hirate.sfens[i]) same2 = false;
  }
  check('position startpos moves … も同じ', same2);
}

// 5) 壊れた入力は false(平手のふりをしない)
{
  const bads = [
    'position_sfen_lnsgkgsnl_w_-_1_moves_7g7f',              // 盤が9段でない
    'position_sfen_2sgkgs2/9/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL_x_-_1_moves_7g7f', // 手番が不正
    'position_sfen_2sgkgs2/9/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL_w_-_1_moves_9z9z', // 指し手が不正
    'position_sfen_2sgkgs2/9/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL_w_-_1_moves_1a1b', // 空マスから動かす
  ];
  for (const b of bads) {
    const t = run(P, { hash: '#u=' + b });
    check('壊れた入力を拒む: ' + b.slice(0, 40), !t.viewer.positions);
  }
}

// 6) 駒落ちで開始局面に手合割名が出る / 平手では出ない
{
  const t = run(P, { hash: '#u=' + 'position_sfen_2sgkgs2/9/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL_w_-_1_moves' });
  check('開始局面ラベル(六枚落ち)', t.el('ply-label').textContent.indexOf('六枚落ち') >= 0,
        t.el('ply-label').textContent);
  const t2 = run(P, { hash: '#u=7g7f' });
  check('開始局面ラベル(平手は名乗らない)', t2.viewer.startName === '平手');
}

// 7) 途中図(手合割の名前が付かない開始局面)は KIF を書き戻さない
{
  const mid = 'lnsgkgsnl/1r5b1/ppppppppp/9/9/2P6/PP1PPPPPP/1B5R1/LNSGKGSNL w - 4';
  const t = run(P, { hash: '#u=' + ('position sfen ' + mid + ' moves 3c3d').split(' ').join('_') });
  check('途中図から並ぶ', !!t.viewer.positions && t.viewer.positions.length === 2);
  check('途中図の開始局面が一致', t.toSfen(t.viewer.positions[0], 1) === mid.replace(/ 4$/, ' 1'));
  check('途中図ではKIFを書き戻さない', t.el('kif-in').value === '', JSON.stringify(t.el('kif-in').value));
}

// 8) 貼り付け欄(SFEN)に position sfen … moves … を丸ごと入れても手順が並ぶ
{
  const c = cases.find(x => x.name === '二枚落ち');
  const t = run(P);
  t.el('sfen-in').value = 'position sfen ' + c.startSfen + ' moves ' + c.moves.join(' ');
  const handler = t.el('btn-load-sfen').listeners.click[0];
  handler();
  check('SFEN欄に手順つきを貼る', t.viewer.positions.length === c.sfens.length,
        String(t.viewer.positions && t.viewer.positions.length));
}

// 9) 形勢グラフの断り書き(駒落ちだけ言い方を変える)
{
  const t = run(P, { hash: '#u=' + 'position_sfen_2sgkgs2/9/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL_w_-_1_moves' });
  check('駒落ちの形勢注記', /下手有利/.test(t.el('eval-note').textContent) &&
        /目安/.test(t.el('eval-note').textContent), t.el('eval-note').textContent);
  const t2 = run(P, { hash: '#u=7g7f' });
  check('平手の形勢注記は元のまま',
        t2.el('eval-note').textContent === '形勢グラフ（調べた局面から埋まっていきます。上＝先手有利）',
        t2.el('eval-note').textContent);
}

// 10) ?sfen= に手順つきのUSIが来ても並ぶ
{
  const c = cases.find(x => x.name === '香落ち');
  const usi = 'position sfen ' + c.startSfen + ' moves ' + c.moves.join(' ');
  const t = run(P, { search: '?sfen=' + encodeURIComponent(usi) });
  check('?sfen= に手順つきUSI', !!t.viewer.positions &&
        t.viewer.positions.length === c.sfens.length,
        String(t.viewer.positions && t.viewer.positions.length));
  // 局面だけの ?sfen= は今までどおり
  const t2 = run(P, { search: '?sfen=' + encodeURIComponent(c.startSfen) });
  check('?sfen= 局面だけは従来どおり', !!t2.viewer.positions &&
        t2.viewer.positions.length === 1 &&
        t2.toSfen(t2.viewer.positions[0], 1) === c.startSfen);
}

// 11) 検討API(EvalServiceStack)の入口検査を、駒落ちの全局面が通るか
//     (lambda/evaluate/index.mjs の条件をそのまま写して手元で当てる。通信はしない)
{
  const okSfen = (sfen) => typeof sfen === 'string' && sfen.length <= 200 &&
    /^[a-zA-Z0-9+\/\- ]+$/.test(sfen) && sfen.split('/').length === 9;
  let allOk = true, ng = '';
  for (const c of cases) {
    const usi = ('position sfen ' + c.startSfen + ' moves ' + c.moves.join(' ')).split(' ').join('_');
    const t = run(P, { hash: '#u=' + usi });
    for (let i = 0; i < t.viewer.positions.length; i++) {
      const sfen = t.toSfen(t.viewer.positions[i], i + 1);
      if (!okSfen(sfen)) { allOk = false; ng = ng || `${c.name} ply${i}: ${sfen}`; }
    }
  }
  check('検討APIの入口検査を全局面が通る', allOk, ng);
}

console.log(`pass ${pass} / fail ${fail}`);
if (bad.length) { console.log('--- NG ---'); bad.forEach(b => console.log(' ' + b)); process.exit(1); }
