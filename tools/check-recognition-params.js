#!/usr/bin/env node
/* 写真→棋譜の3ページ(index / classic / beta)が認識APIに送るパラメータが
 * 揃っているかを機械的に確かめる。台帳は docs/RECOGNITION_PARAMS.md。
 *
 *   node tools/check-recognition-params.js
 *
 * 依存なし。ズレていたら終了コード1で違いを出す。
 * 「片方だけ直してもう片方が置いていかれる」(PR#83 で index だけ waku=v2 になり
 * classic が旧UNetのまま残った、のような事故)を次に繰り返さないための門番。 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const PAGES = [
  { name: 'index   (index.html / site.js)', file: 'public/js/site.js' },
  { name: 'classic (classic.html / main_apigw.js)', file: 'public/js/main_apigw.js' },
  { name: 'beta    (beta.html / site-beta.js)', file: 'public/js/site-beta.js' },
];

// beta.html には認識設定のトグルが無いので state.* は初期値のまま使われる。
// その初期値を site-beta.js から読み取って実効値に直す。
const STATE_KEYS = {
  'state.modelVersion': 'modelVersion',
  'state.wakuVersion': 'wakuVersion',
  'state.mochiCropVersion': 'mochiCropVersion',
};
const BOOL_STATE = {
  "state.mochiOcr ? '1' : '0'": 'mochiOcr',
  "state.mochiPostproc ? '1' : '0'": 'mochiPostproc',
  "state.joint ? '1' : '0'": 'joint',
};

// エンジン設定として一致していないといけないフィールド。
// hidden_rotate / hidden_sengo は画面の入力(classicは<form>由来)なので対象外。
const ENGINE_FIELDS = ['mode', 'model', 'decoder', 'waku', 'mochi_crop', 'mochi_ocr', 'mochi_postproc', 'joint'];

function stateDefaults(text) {
  const d = {};
  for (const [expr, key] of Object.entries(STATE_KEYS)) {
    const m = new RegExp(`\\b${key}\\s*:\\s*'([^']+)'`).exec(text);
    if (m) d[expr] = m[1];
  }
  for (const [expr, key] of Object.entries(BOOL_STATE)) {
    const m = new RegExp(`\\b${key}\\s*:\\s*(true|false)`).exec(text);
    if (m) d[expr] = m[1] === 'true' ? '1' : '0';
  }
  return d;
}

function fieldsOf(text) {
  const out = {};
  // 値は同じ行の中だけを見る(改行や括弧をまたがせない)。
  // またがせると `formdata.set('upfile',blobdata)` のように行末が `;` でない行が
  // 次の行を丸ごと飲み込んでしまう。
  const re = /(?:fd\.append|formdata\.set)\(\s*'([a-z_]+)'\s*,\s*([^;()\n]+?)\s*\)\s*;/g;
  const defaults = stateDefaults(text);
  let m;
  while ((m = re.exec(text)) !== null) {
    const key = m[1];
    if (key === 'upfile') continue;
    const raw = m[2].trim();
    const lit = /^'(.*)'$/.exec(raw);
    out[key] = lit ? lit[1] : (defaults[raw] !== undefined ? defaults[raw] : `(不明: ${raw})`);
  }
  return out;
}

const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const table = PAGES.map((p) => ({ ...p, fields: fieldsOf(read(p.file)) }));

let bad = 0;
console.log('認識APIパラメータ (エンジン設定は3ページ同値であること)\n');
const width = Math.max(...ENGINE_FIELDS.map((f) => f.length));
for (const f of ENGINE_FIELDS) {
  const vals = table.map((t) => t.fields[f] === undefined ? '(未送信)' : t.fields[f]);
  const ok = new Set(vals).size === 1 && vals[0] !== '(未送信)';
  if (!ok) bad++;
  console.log(`  ${ok ? 'OK ' : 'NG '} ${f.padEnd(width)} : ${vals.map((v, i) => `${PAGES[i].name.split(' ')[0]}=${v}`).join('  ')}`);
}

// hidden_sengo は「文字列 'true' のときだけ先手番」。index/beta は固定なのでここも見る。
for (const t of table) {
  if (t.file.includes('main_apigw')) continue; // classic はフォーム由来なので対象外
  const v = t.fields['hidden_sengo'];
  const ok = v === 'true';
  if (!ok) bad++;
  console.log(`  ${ok ? 'OK ' : 'NG '} ${'hidden_sengo'.padEnd(width)} : ${t.name.split(' ')[0]}=${v}  (docs/REBUILD_SPEC.md §2.1 で 'true' 固定)`);
}

if (bad) {
  console.error(`\n${bad}件ズレています。docs/RECOGNITION_PARAMS.md を見て3ファイルを同時に直してください。`);
  process.exit(1);
}
console.log('\nすべて一致。');
