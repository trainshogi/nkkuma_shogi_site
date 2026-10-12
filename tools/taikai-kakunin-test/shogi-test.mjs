// public/js/taikai-shogi.js(運営の確認ページの盤まわり)の確かめ。
//   使い方: node tools/taikai-kakunin-test/shogi-test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUB = path.join(HERE, '..', '..', 'public');
const win = {};
new Function('window', fs.readFileSync(path.join(PUB, 'js', 'usi-kif.js'), 'utf8'))(win);
new Function('window', fs.readFileSync(path.join(PUB, 'js', 'taikai-shogi.js'), 'utf8'))(win);
const S = win.TaikaiShogi;
let pass = 0, fail = 0;
const check = (label, cond, detail) => { if (cond) pass++; else { fail++; console.log('NG', label, detail ?? ''); } };

// 1) 実際の対局の手が全部通る(角換わり・成り・打ち・取った成駒を打つ)
const game = '7g7f 3c3d 8h2b+ 3a2b B*4e 2b3c 4e3d 3c3d 2g2f B*5e 1g1f 5e9i+ 2f2e L*2b'.split(' ');
const r = S.replay('平手', game);
check('実戦が最後まで', r.bad === 0 && r.labels.length === game.length, r.bad);
check('1 手目の名前', r.labels[0] === '▲７六歩', r.labels[0]);
check('成った手', r.labels.includes('▲２二角成'), r.labels.join(' '));
check('打った手', r.labels.includes('△５五角打') && r.labels.includes('△９九角成') && r.labels.includes('△２二香打'), r.labels.join(' '));
check('KIF が書ける', /^#KIF version=2\.0 encoding=UTF-8\r\n/.test(S.toKif({ teai: '平手', usis: game, sente: '山田', gote: '佐藤', end: '投了' }) || ''));
const k = S.toKif({ teai: '平手', usis: ['7g7f', '3c3d'], sente: '山田', gote: '佐藤', end: '投了', event: '千駄ヶ谷 秋の大会', memo: '決勝' });
check('KIF の中身', k === ['#KIF version=2.0 encoding=UTF-8', '棋戦：千駄ヶ谷 秋の大会', '備考：決勝', '手合割：平手', '先手：山田', '後手：佐藤',
  '手数----指手---------消費時間--', '   1 ７六歩(77)', '   2 ３四歩(33)', '   3 投了', ''].join('\r\n'), JSON.stringify(k));
const kk = S.toKif({ teai: '香落ち', usis: ['5a4b'], sente: '下の人', gote: '上の人' });
check('駒落ちは下手・上手', kk.includes('下手：下の人') && kk.includes('上手：上の人') && kk.includes('手合割：香落ち'), kk);

// 2) 合わない手で止まる
check('動けない升', S.replay('平手', ['7g7e']).bad === 1);
check('相手の駒', S.replay('平手', ['3c3d']).bad === 1);
check('飛び越え', S.replay('平手', ['8h2b']).bad === 1);
check('成れない所で成る', S.replay('平手', ['7g7f+']).bad === 1);
check('2 手目で止まる', S.replay('平手', ['7g7f', '7g7f']).bad === 2);
check('持っていない駒', S.replay('平手', ['P*5e']).bad === 1);
const takeFu = ['7g7f', '3c3d', '8h2b+', '3a2b', 'B*4e', '2b3c', '4e3d', '3c3d', '1g1f', '1c1d'];
check('歩を取って持つ', S.replay('平手', takeFu).positions[10].hands.sente.fu === 1);
check('二歩', S.replay('平手', takeFu.concat(['P*7e'])).bad === 11);

// 3) 盤を触って指す: 行ける升・成り
const p0 = S.startPos('平手');
check('歩の行き先', JSON.stringify(S.destinations(p0, '77')) === JSON.stringify(['76']));
check('桂は跳べない(味方)', S.destinations(p0, '89').length === 0);
check('相手の駒は動かせない', S.destinations(p0, '33').length === 0);
check('飛車', S.destinations(p0, '28').sort().join() === '18,38,48,58,68,78');
const after = S.replay('平手', ['7g7f', '3c3d']).positions[2];
check('角の成り(選ぶ)', S.promotion(after, '88', '22') === 'may');
check('角の行き先', S.destinations(after, '88').includes('22') && !S.destinations(after, '88').includes('11'));
// 9 筋の歩を 1 段目へ(行き所のない駒になるので成るしかない)
const p1 = win.UsiKif.parseSfen('4k4/P8/9/9/9/9/9/9/4K4', 'b', 'N');
check('歩の 1 段目は成るしかない', S.promotion(p1, '92', '91') === 'must');
check('桂は 1・2 段目に打てない', S.dropTargets(p1, 'ke').every((t) => Number(t[1]) >= 3));
check('局面なしの読み', S.plain('3a2b') === '３一→２二' && S.plain('8h2b+') === '８八→２二成' && S.plain('B*4e') === '４五に角打');
check('USI', S.moveUsi('77', '76', false) === '7g7f' && S.moveUsi('88', '22', true) === '8h2b+' && S.dropUsi('ka', '55') === 'B*5e');

console.log(`pass ${pass} / fail ${fail}`);
process.exit(fail ? 1 : 0);
