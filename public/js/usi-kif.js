// コマドリの QR(study.html#u=<USI>)を読んで、KIF に直す。大会の係のページ(taikai/kifu.html)用。
//
// ■ study.html との関係
//   study.html の parseUsiPosition と同じ読み方・同じ KIF の書き方をする。
//   手合割の表は study.html の HANDICAP_SFENS(= python-shogi の HANDYCAP_SFENS の写し、
//   iOS の Handicap.swift とも同じ)と 1 文字ずつ同じ。表と出力がずれていないかは
//   tools/study-usi-test/usi-kif-test.mjs が study.html と突き合わせて確かめる。
//
// ■ 受ける形
//   https://shogi.nkkuma.tokyo/study.html#u=position_sfen_…_moves_7g7f_…  (QR の中身そのまま)
//   position sfen … moves …   /   position startpos moves …   /   7g7f_3c3d …(指し手だけ)
//   区切りは `_` でも空白でも %20 でもよい。
(function () {
  'use strict';

  var KANJI_1 = { fu: '歩', ky: '香', ke: '桂', gi: '銀', ki: '金', ka: '角', hi: '飛', ou: '玉',
                  to: 'と', ny: '杏', nk: '圭', ng: '全', um: '馬', ry: '龍' };
  var PROMOTE = { fu: 'to', ky: 'ny', ke: 'nk', gi: 'ng', ka: 'um', hi: 'ry' };
  var BASE = { to: 'fu', ny: 'ky', nk: 'ke', ng: 'gi', um: 'ka', ry: 'hi' };
  var USI_KIND = { P: 'fu', L: 'ky', N: 'ke', S: 'gi', G: 'ki', B: 'ka', R: 'hi', K: 'ou' };
  var ZEN_SUJI = ['０', '１', '２', '３', '４', '５', '６', '７', '８', '９'];
  var KAN_DAN = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

  var HANDICAP_SFENS = {
    '平手':       'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1',
    '香落ち':     'lnsgkgsn1/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL w - 1',
    '右香落ち':   '1nsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL w - 1',
    '角落ち':     'lnsgkgsnl/1r7/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL w - 1',
    '飛車落ち':   'lnsgkgsnl/7b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL w - 1',
    '飛香落ち':   'lnsgkgsn1/7b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL w - 1',
    '二枚落ち':   'lnsgkgsnl/9/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL w - 1',
    '三枚落ち':   'lnsgkgsn1/9/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL w - 1',
    '四枚落ち':   '1nsgkgsn1/9/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL w - 1',
    '五枚落ち':   '2sgkgsn1/9/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL w - 1',
    '左五枚落ち': '1nsgkgs2/9/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL w - 1',
    '六枚落ち':   '2sgkgs2/9/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL w - 1',
    '八枚落ち':   '3gkg3/9/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL w - 1',
    '十枚落ち':   '4k4/9/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL w - 1'
  };
  var HANDICAP_BY_BOARD = {};
  for (var n in HANDICAP_SFENS) {
    HANDICAP_BY_BOARD[HANDICAP_SFENS[n].split(' ').slice(0, 3).join(' ')] = n;
  }

  function parseSfen(board, turn, hand) {
    var rows = board.split('/');
    if (rows.length !== 9) { return null; }
    var ban = {};
    for (var d = 1; d <= 9; d++) {
      var row = rows[d - 1], s = 9;
      for (var i = 0; i < row.length; i++) {
        var c = row.charAt(i);
        if (/[1-9]/.test(c)) { s -= Number(c); continue; }
        var promoted = false;
        if (c === '+') { promoted = true; i++; c = row.charAt(i); }
        var kind = USI_KIND[c.toUpperCase()];
        if (!kind || s < 1) { return null; }
        if (promoted) { kind = PROMOTE[kind]; if (!kind) { return null; } }
        ban[String(s) + String(d)] = (c === c.toUpperCase() ? ' ' : 'v') + kind;
        s--;
      }
      if (s !== 0) { return null; }
    }
    var hands = { sente: {}, gote: {} };
    if (hand !== '-') {
      var num = '';
      for (var j = 0; j < hand.length; j++) {
        var h = hand.charAt(j);
        if (/[0-9]/.test(h)) { num += h; continue; }
        var hk = USI_KIND[h.toUpperCase()];
        if (!hk) { return null; }
        hands[h === h.toUpperCase() ? 'sente' : 'gote'][hk] = num ? Number(num) : 1;
        num = '';
      }
    }
    return { ban: ban, hands: hands, teban: turn === 'w' ? 'gote' : 'sente' };
  }

  function apply(pos, m) {
    var side = pos.teban;
    var ban = {}, k;
    for (k in pos.ban) { ban[k] = pos.ban[k]; }
    var hands = JSON.parse(JSON.stringify(pos.hands));
    var toKey = String(m.to[0]) + String(m.to[1]);
    var cap = ban[toKey];
    if (cap) {
      var capKind = BASE[cap.substr(1)] || cap.substr(1);
      hands[side][capKind] = (hands[side][capKind] || 0) + 1;
    }
    if (m.from) {
      delete ban[String(m.from[0]) + String(m.from[1])];
      ban[toKey] = (side === 'sente' ? ' ' : 'v') + (m.promote ? PROMOTE[m.kind] : m.kind);
    } else {
      hands[side][m.kind] = (hands[side][m.kind] || 0) - 1;
      if (!hands[side][m.kind]) { delete hands[side][m.kind]; }
      ban[toKey] = (side === 'sente' ? ' ' : 'v') + m.kind;
    }
    return { ban: ban, hands: hands, teban: side === 'sente' ? 'gote' : 'sente' };
  }

  // QR の URL でも USI でも受ける。読めたら USI(区切りは空白)を返す
  function extractUsi(text) {
    var t = String(text || '').trim();
    var m = t.match(/#u=([^\s]+)/);
    if (m) { t = m[1]; }
    else if (/^https?:\/\//i.test(t)) { return null; }
    try { t = decodeURIComponent(t); } catch (e) { return null; }
    return t.split(/[_\s]+/).filter(Boolean).join(' ');
  }

  // 返り値: { usi, teai, plies, kif, last } / 読めなければ { error }
  function read(text) {
    var usi = extractUsi(text);
    if (!usi) { return { error: 'コマドリの QR ではないようです。' }; }
    var t = usi.split(' ');
    var i = 0;
    if (t[i] && t[i].toLowerCase() === 'position') { i++; }
    var start = null, declared = false;
    var head = (t[i] || '').toLowerCase();
    if (head === 'startpos') {
      i++; declared = true;
      start = parseSfen.apply(null, HANDICAP_SFENS['平手'].split(' '));
    } else if (head === 'sfen') {
      i++;
      if (t.length < i + 3 || !/^[bw]$/.test(t[i + 1])) { return { error: '開始局面が読めませんでした。' }; }
      start = parseSfen(t[i], t[i + 1], t[i + 2]);
      if (!start) { return { error: '開始局面が読めませんでした。' }; }
      i += 3;
      if (/^\d+$/.test(t[i] || '')) { i++; }
      declared = true;
    } else {
      start = parseSfen.apply(null, HANDICAP_SFENS['平手'].split(' '));
    }
    if (t[i] && t[i].toLowerCase() === 'moves') { i++; }
    var mvs = t.slice(i);
    if (!mvs.length && !declared) { return { error: '指し手が読めませんでした。' }; }
    // 手合割の名前が付く開始局面のときだけ KIF にする(study.html と同じ決め方)
    var teai = HANDICAP_BY_BOARD[boardKey(start)] || null;
    if (!teai) { return { error: '途中の局面から始まる棋譜は、KIF にできません。' }; }
    var pos = start, lines = [], last = '';
    for (var k = 0; k < mvs.length; k++) {
      var s = mvs[k], m = { promote: false }, mm;
      if ((mm = s.match(/^([A-Z])\*([1-9])([a-i])$/))) {
        m.from = null;
        m.kind = USI_KIND[mm[1]];
        m.to = [Number(mm[2]), mm[3].charCodeAt(0) - 96];
        if (!m.kind || !(pos.hands[pos.teban][m.kind] > 0)) { return { error: (k + 1) + '手目が読めませんでした。' }; }
      } else if ((mm = s.match(/^([1-9])([a-i])([1-9])([a-i])(\+?)$/))) {
        m.from = [Number(mm[1]), mm[2].charCodeAt(0) - 96];
        m.to = [Number(mm[3]), mm[4].charCodeAt(0) - 96];
        m.promote = mm[5] === '+';
        var v = pos.ban[String(m.from[0]) + String(m.from[1])];
        if (!v) { return { error: (k + 1) + '手目が読めませんでした。' }; }
        m.kind = v.substr(1);
      } else {
        return { error: (k + 1) + '手目が読めませんでした。' };
      }
      var jp = ZEN_SUJI[m.to[0]] + KAN_DAN[m.to[1]] + (KANJI_1[m.kind] || '') + (m.promote ? '成' : '');
      lines.push('   ' + (k + 1) + ' ' + jp + (m.from ? '(' + m.from[0] + m.from[1] + ')' : '打'));
      last = (pos.teban === 'sente' ? '▲' : '△') + jp + (m.from ? '' : '打');
      pos = apply(pos, m);
    }
    return { usi: usi, teai: teai, plies: mvs.length, last: last,
             kif: ['手合割：' + teai].concat(lines).join('\n') };
  }

  // 盤・手番・持駒の 3 欄(手数を除く)
  function boardKey(p) {
    var rows = [];
    for (var d = 1; d <= 9; d++) {
      var row = '', empty = 0;
      for (var s = 9; s >= 1; s--) {
        var v = p.ban[String(s) + String(d)];
        if (!v) { empty++; continue; }
        if (empty) { row += empty; empty = 0; }
        var k = v.substr(1), base = BASE[k] || k, plus = BASE[k] ? '+' : '';
        var letter = { fu: 'P', ky: 'L', ke: 'N', gi: 'S', ki: 'G', ka: 'B', hi: 'R', ou: 'K' }[base];
        row += plus + (v.charAt(0) === 'v' ? letter.toLowerCase() : letter);
      }
      if (empty) { row += empty; }
      rows.push(row);
    }
    var hand = '';
    ['sente', 'gote'].forEach(function (side) {
      ['hi', 'ka', 'ki', 'gi', 'ke', 'ky', 'fu'].forEach(function (k) {
        var c = p.hands[side][k] || 0;
        if (!c) { return; }
        var l = { fu: 'P', ky: 'L', ke: 'N', gi: 'S', ki: 'G', ka: 'B', hi: 'R' }[k];
        hand += (c > 1 ? c : '') + (side === 'sente' ? l : l.toLowerCase());
      });
    });
    return rows.join('/') + ' ' + (p.teban === 'sente' ? 'b' : 'w') + ' ' + (hand || '-');
  }

  // parseSfen・apply・boardKey は運営の確認ページ(taikai/kakunin.html)が盤を作るのにも使う
  window.UsiKif = { read: read, extractUsi: extractUsi, HANDICAP_SFENS: HANDICAP_SFENS,
                   parseSfen: parseSfen, apply: apply, boardKey: boardKey };
})();
