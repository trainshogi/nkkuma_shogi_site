// shogi.js — 局面・指し手・棋譜の文字列(コマドリ Web)
//
// 局面は { ban: { '76': { side: 'sente'|'gote', kind: 'fu' } }, hands: { sente: {fu:1}, gote: {} }, teban }。
// 升の鍵は「筋 + 段」の2文字(サーバの startPos と同じ)。
// 駒の鍵もサーバと同じ: fu ky ke gi ki ka hi ou / to ny nk ng um ry。

export const KINDS = ['fu', 'ky', 'ke', 'gi', 'ki', 'ka', 'hi', 'ou', 'to', 'ny', 'nk', 'ng', 'um', 'ry'];
export const PROMOTE = { fu: 'to', ky: 'ny', ke: 'nk', gi: 'ng', ka: 'um', hi: 'ry' };
export const BASE = { to: 'fu', ny: 'ky', nk: 'ke', ng: 'gi', um: 'ka', ry: 'hi' };
export const HAND_ORDER = ['hi', 'ka', 'ki', 'gi', 'ke', 'ky', 'fu'];
export const KANJI = { fu: '歩', ky: '香', ke: '桂', gi: '銀', ki: '金', ka: '角', hi: '飛', ou: '玉',
  to: 'と', ny: '成香', nk: '成桂', ng: '成銀', um: '馬', ry: '龍' };
const SFEN_LETTER = { fu: 'P', ky: 'L', ke: 'N', gi: 'S', ki: 'G', ka: 'B', hi: 'R', ou: 'K' };
const LETTER_KIND = { P: 'fu', L: 'ky', N: 'ke', S: 'gi', G: 'ki', B: 'ka', R: 'hi', K: 'ou' };
const ZEN = ['', '１', '２', '３', '４', '５', '６', '７', '８', '９'];
const KAN = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

// 手合割(Android kif/Handicap.kt の表の写し。python-shogi の HANDYCAP_SFENS と同じ)
export const HANDICAP_SFENS = {
  '平手': 'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1',
  '香落ち': 'lnsgkgsn1/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL w - 1',
  '右香落ち': '1nsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL w - 1',
  '角落ち': 'lnsgkgsnl/1r7/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL w - 1',
  '飛車落ち': 'lnsgkgsnl/7b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL w - 1',
  '飛香落ち': 'lnsgkgsn1/7b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL w - 1',
  '二枚落ち': 'lnsgkgsnl/9/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL w - 1',
  '三枚落ち': 'lnsgkgsn1/9/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL w - 1',
  '四枚落ち': '1nsgkgsn1/9/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL w - 1',
  '五枚落ち': '2sgkgsn1/9/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL w - 1',
  '左五枚落ち': '1nsgkgs2/9/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL w - 1',
  '六枚落ち': '2sgkgs2/9/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL w - 1',
  '八枚落ち': '3gkg3/9/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL w - 1',
  '十枚落ち': '4k4/9/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL w - 1',
};
// 画面に並べる順(Android と同じ: 落とした枚数の多い順、そのあと「そのほか」)
export const HANDICAP_MAIN = ['十枚落ち', '八枚落ち', '六枚落ち', '四枚落ち', '二枚落ち', '飛香落ち', '飛車落ち', '角落ち', '香落ち'];
export const HANDICAP_OTHER = ['五枚落ち', '左五枚落ち', '三枚落ち', '右香落ち'];

export function emptyPos() { return { ban: {}, hands: { sente: {}, gote: {} }, teban: 'sente' }; }

export function clonePos(p) {
  const ban = {};
  for (const k in p.ban) ban[k] = { side: p.ban[k].side, kind: p.ban[k].kind };
  return { ban, hands: { sente: { ...p.hands.sente }, gote: { ...p.hands.gote } }, teban: p.teban };
}

export function parseSfen(sfen) {
  const [board, turn, hands] = sfen.trim().split(/\s+/);
  const pos = emptyPos();
  board.split('/').forEach((row, r) => {
    let file = 9; let promo = false;
    for (const ch of row) {
      if (ch === '+') { promo = true; continue; }
      if (/\d/.test(ch)) { file -= Number(ch); continue; }
      const up = ch.toUpperCase();
      let kind = LETTER_KIND[up];
      if (promo) kind = PROMOTE[kind];
      pos.ban[String(file) + String(r + 1)] = { side: ch === up ? 'sente' : 'gote', kind };
      file--; promo = false;
    }
  });
  pos.teban = turn === 'w' ? 'gote' : 'sente';
  if (hands && hands !== '-') {
    const re = /(\d*)([PLNSGBRplnsgbr])/g; let m;
    while ((m = re.exec(hands))) {
      const side = m[2] === m[2].toUpperCase() ? 'sente' : 'gote';
      const kind = LETTER_KIND[m[2].toUpperCase()];
      pos.hands[side][kind] = (pos.hands[side][kind] || 0) + (m[1] ? Number(m[1]) : 1);
    }
  }
  return pos;
}

// サーバの startPos({ ban: {'11': 'vky', '17': ' fu'}, hands, teban })
export function fromServerPos(sp) {
  const pos = emptyPos();
  for (const k in (sp && sp.ban) || {}) {
    const v = sp.ban[k];
    if (!v || v.trim() === '') continue;
    pos.ban[k] = { side: v[0] === 'v' ? 'gote' : 'sente', kind: v.slice(1).trim() };
  }
  const h = (sp && sp.hands) || {};
  pos.hands.sente = { ...(h.sente || sp.sente_mochi || {}) };
  pos.hands.gote = { ...(h.gote || sp.gote_mochi || {}) };
  pos.teban = (sp && sp.teban) === 'gote' ? 'gote' : 'sente';
  return pos;
}

export function toSfen(pos, moveNo = 1) {
  const rows = [];
  for (let d = 1; d <= 9; d++) {
    let row = ''; let empty = 0;
    for (let s = 9; s >= 1; s--) {
      const p = pos.ban[String(s) + String(d)];
      if (!p) { empty++; continue; }
      if (empty) { row += empty; empty = 0; }
      const base = BASE[p.kind] || p.kind;
      let l = SFEN_LETTER[base];
      if (p.side === 'gote') l = l.toLowerCase();
      row += (BASE[p.kind] ? '+' : '') + l;
    }
    if (empty) row += empty;
    rows.push(row);
  }
  let hands = '';
  for (const side of ['sente', 'gote']) {
    for (const k of HAND_ORDER) {
      const n = pos.hands[side][k] || 0;
      if (!n) continue;
      const l = side === 'sente' ? SFEN_LETTER[k] : SFEN_LETTER[k].toLowerCase();
      hands += (n > 1 ? n : '') + l;
    }
  }
  return rows.join('/') + ' ' + (pos.teban === 'gote' ? 'w' : 'b') + ' ' + (hands || '-') + ' ' + moveNo;
}

// move: { from: [s,d] | null, to: [s,d], kind, promote }(サーバの plies[].move と同じ形)
export function applyMove(pos, move, side) {
  const p = clonePos(pos);
  const mover = side || p.teban;
  const to = String(move.to[0]) + String(move.to[1]);
  if (!move.from) {
    const k = BASE[move.kind] || move.kind;
    p.hands[mover][k] = Math.max(0, (p.hands[mover][k] || 0) - 1);
    if (!p.hands[mover][k]) delete p.hands[mover][k];
    p.ban[to] = { side: mover, kind: k };
  } else {
    const from = String(move.from[0]) + String(move.from[1]);
    const moving = p.ban[from] || { side: mover, kind: move.kind };
    const cap = p.ban[to];
    if (cap && cap.side !== mover) {
      const base = BASE[cap.kind] || cap.kind;
      if (base !== 'ou') p.hands[mover][base] = (p.hands[mover][base] || 0) + 1;
    }
    delete p.ban[from];
    let kind = moving.kind;
    if (move.promote && PROMOTE[kind]) kind = PROMOTE[kind];
    p.ban[to] = { side: mover, kind };
  }
  p.teban = mover === 'sente' ? 'gote' : 'sente';
  return p;
}

// 開始局面から、手ごとの局面の列(0 = 開始局面、i = i 手目のあと)
export function positionsOf(start, plies) {
  const out = [start];
  let pos = start;
  for (const pl of plies) {
    pos = applyMove(pos, pl.move, pl.side);
    out.push(pos);
  }
  return out;
}

export function moveToUsi(m) {
  const rank = (d) => String.fromCharCode(96 + d);
  if (!m.from) return SFEN_LETTER[BASE[m.kind] || m.kind] + '*' + m.to[0] + rank(m.to[1]);
  return String(m.from[0]) + rank(m.from[1]) + String(m.to[0]) + rank(m.to[1]) + (m.promote ? '+' : '');
}

export function usiToMove(usi, pos) {
  const file = (c) => Number(c);
  const rank = (c) => c.charCodeAt(0) - 96;
  if (usi[1] === '*') {
    return { from: null, to: [file(usi[2]), rank(usi[3])], kind: LETTER_KIND[usi[0]], promote: false };
  }
  const from = [file(usi[0]), rank(usi[1])];
  const to = [file(usi[2]), rank(usi[3])];
  const p = pos.ban[String(from[0]) + String(from[1])];
  return { from, to, kind: p ? p.kind : 'fu', promote: usi[4] === '+' };
}

// 「▲７六歩(77)」。prev は直前の手(「同」にする)
export function moveLabel(m, side, prev, opts = {}) {
  const mark = side === 'gote' ? '△' : '▲';
  const same = prev && prev.to[0] === m.to[0] && prev.to[1] === m.to[1];
  const sq = same ? '同　' : ZEN[m.to[0]] + KAN[m.to[1]];
  const name = KANJI[m.kind] || '';
  let tail = '';
  if (!m.from) tail = '打';
  else if (m.promote) tail = '成';
  const from = (m.from && opts.from !== false) ? '(' + m.from[0] + m.from[1] + ')' : '';
  return (opts.mark === false ? '' : mark) + sq + name + tail + from;
}

// 形勢: 先手の勝ちやすさ(%)。Android EvalGraph と同じ k=600 のシグモイド
export function senteRate(e) {
  if (!e) return null;
  if (e.mate != null) return e.mate > 0 ? 100 : 0;
  if (e.cp == null) return null;
  return Math.round(100 / (1 + Math.exp(-e.cp / 600)));
}

export function evalSummary(e) {
  if (!e) return '';
  if (e.mate != null) return e.mate > 0 ? '▲詰みあり' : '△詰みあり';
  const r = senteRate(e);
  if (r == null) return '';
  return r >= 50 ? '先手 ' + r + '%' : '後手 ' + (100 - r) + '%';
}

// 手合割と名前と終局を KIF に書き込む(サーバの KIF の頭と尻だけを替える)
export function decorateKif(kif, opts) {
  const lines = String(kif || '').split('\n');
  const isHandicap = opts.handicap && opts.handicap !== '平手';
  const senteLabel = isHandicap ? '下手' : '先手';
  const goteLabel = isHandicap ? '上手' : '後手';
  const out = [];
  let sawHandicap = false;
  for (const line of lines) {
    if (/^先手：|^下手：/.test(line)) { out.push(senteLabel + '：' + (opts.sente || '')); continue; }
    if (/^後手：|^上手：/.test(line)) { out.push(goteLabel + '：' + (opts.gote || '')); continue; }
    if (/^手合割：/.test(line)) { out.push('手合割：' + (opts.handicap || '平手')); sawHandicap = true; continue; }
    if (/^手数----/.test(line) && !sawHandicap) { out.push('手合割：' + (opts.handicap || '平手')); sawHandicap = true; }
    out.push(line);
  }
  while (out.length && out[out.length - 1].trim() === '') out.pop();
  if (opts.terminal && opts.plies != null) {
    const n = opts.plies;
    out.push(String(n + 1).padStart(4, ' ') + ' ' + opts.terminal);
    // 次に指すはずだった側 = 投了した側。駒落ちは上手(△)から指す
    const firstIsSente = !isHandicap;
    const loserIsSente = (n % 2 === 0) === firstIsSente;
    const win = (s) => (s ? senteLabel : goteLabel);
    if (opts.terminal === '投了') out.push('まで' + n + '手で' + win(!loserIsSente) + 'の勝ち');
    else out.push('まで' + n + '手で' + opts.terminal);
  }
  return out.join('\n') + '\n';
}
