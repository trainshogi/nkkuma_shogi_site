// 運営の確認ページ(taikai/kakunin.html)の盤まわり: 指し手の列から局面を作る、盤を触って指せる手を出す、
// 直したあと続きの手が合うかを見る、KIF を書く。
//
// ■ 局面の形
//   js/usi-kif.js と同じ(parseSfen・apply をそのまま使う)。
//   { ban: { '77': ' fu', '33': 'vfu', … }, hands: { sente: { fu: 1 }, gote: {} }, teban: 'sente' | 'gote' }
//   ban の鍵は 筋 + 段(1〜9)、値の 1 文字目は ' ' が先手、'v' が後手。
//
// ■ どこまで確かめるか
//   駒の動き方・自分の駒の上に行かない・飛び駒が駒を越えない・二歩・行き所のない駒・成れる所と成るしかない所。
//   王手を放っておく手・打ち歩詰めは見ない(運営は将棋が分かる人で、映像に映った手をそのまま入れるため)。
//
// 読む順: js/usi-kif.js のあと。グローバルは window.TaikaiShogi ひとつ。
(function () {
  'use strict';

  var U = window.UsiKif;
  var PROMOTE = { fu: 'to', ky: 'ny', ke: 'nk', gi: 'ng', ka: 'um', hi: 'ry' };
  var USI_KIND = { P: 'fu', L: 'ky', N: 'ke', S: 'gi', G: 'ki', B: 'ka', R: 'hi', K: 'ou' };
  var USI_LETTER = { fu: 'P', ky: 'L', ke: 'N', gi: 'S', ki: 'G', ka: 'B', hi: 'R' };
  var NAME = { fu: '歩', ky: '香', ke: '桂', gi: '銀', ki: '金', ka: '角', hi: '飛', ou: '玉',
               to: 'と', ny: '杏', nk: '圭', ng: '全', um: '馬', ry: '龍' };
  var ZEN = ['', '１', '２', '３', '４', '５', '６', '７', '８', '９'];
  var KAN = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  var GOLD = [[0, 1], [-1, 1], [1, 1], [-1, 0], [1, 0], [0, -1]];
  var KING = [[0, 1], [-1, 1], [1, 1], [-1, 0], [1, 0], [0, -1], [-1, -1], [1, -1]];
  var DIAG = [[-1, 1], [1, 1], [-1, -1], [1, -1]];
  var ORTH = [[0, 1], [0, -1], [-1, 0], [1, 0]];
  // [段の向き(前 = +1)] で書いた、駒ごとの 1 歩と、どこまでも進む向き
  var STEPS = {
    fu: [[0, 1]], ke: [[-1, 2], [1, 2]], gi: [[0, 1], [-1, 1], [1, 1], [-1, -1], [1, -1]],
    ki: GOLD, to: GOLD, ny: GOLD, nk: GOLD, ng: GOLD, ou: KING,
    um: ORTH, ry: DIAG
  };
  var SLIDES = { ky: [[0, 1]], ka: DIAG, hi: ORTH, um: DIAG, ry: ORTH };

  function sq(s, d) { return String(s) + String(d); }
  function owner(v) { return v ? (v.charAt(0) === 'v' ? 'gote' : 'sente') : null; }
  function kindOf(v) { return v ? v.substr(1) : null; }
  // 前へ進む向き(段の増える向き)。先手は 1 段目へ向かうので -1
  function fwd(side) { return side === 'sente' ? -1 : 1; }
  // 敵陣の段か(先手は 1〜3、後手は 7〜9)
  function inZone(side, d) { return side === 'sente' ? d <= 3 : d >= 7; }
  // その段に置くと、もう動けない駒か
  function deadEnd(side, kind, d) {
    var r = side === 'sente' ? d : 10 - d; // 相手側から数えた段(1 = いちばん奥)
    if (kind === 'fu' || kind === 'ky') { return r === 1; }
    if (kind === 'ke') { return r <= 2; }
    return false;
  }

  function startPos(teai) {
    var sfen = (U.HANDICAP_SFENS[teai] || U.HANDICAP_SFENS['平手']).split(' ');
    return U.parseSfen(sfen[0], sfen[1], sfen[2]);
  }

  // 盤の駒が行ける升(成る・成らないは別)
  function destinations(pos, from) {
    var v = pos.ban[from];
    var side = owner(v), kind = kindOf(v), out = [];
    if (!v || side !== pos.teban) { return out; }
    var s0 = Number(from.charAt(0)), d0 = Number(from.charAt(1)), f = fwd(side);
    (STEPS[kind] || []).forEach(function (st) {
      var s = s0 + st[0], d = d0 + st[1] * f;
      if (s < 1 || s > 9 || d < 1 || d > 9) { return; }
      if (owner(pos.ban[sq(s, d)]) === side) { return; }
      out.push(sq(s, d));
    });
    (SLIDES[kind] || []).forEach(function (st) {
      for (var s = s0 + st[0], d = d0 + st[1] * f; s >= 1 && s <= 9 && d >= 1 && d <= 9; s += st[0], d += st[1] * f) {
        var o = owner(pos.ban[sq(s, d)]);
        if (o === side) { break; }
        out.push(sq(s, d));
        if (o) { break; }
      }
    });
    return out;
  }

  // 持ち駒を打てる升
  function dropTargets(pos, kind) {
    var side = pos.teban, out = [];
    if (!(pos.hands[side][kind] > 0)) { return out; }
    for (var s = 1; s <= 9; s++) {
      if (kind === 'fu') {
        var nifu = false;
        for (var dd = 1; dd <= 9; dd++) { if (pos.ban[sq(s, dd)] === (side === 'sente' ? ' fu' : 'vfu')) { nifu = true; } }
        if (nifu) { continue; }
      }
      for (var d = 1; d <= 9; d++) {
        if (pos.ban[sq(s, d)] || deadEnd(side, kind, d)) { continue; }
        out.push(sq(s, d));
      }
    }
    return out;
  }

  // 盤の手の成り: 'no'(成れない) / 'may'(選ぶ) / 'must'(成るしかない)
  function promotion(pos, from, to) {
    var side = pos.teban, kind = kindOf(pos.ban[from]);
    if (!PROMOTE[kind]) { return 'no'; }
    if (!inZone(side, Number(from.charAt(1))) && !inZone(side, Number(to.charAt(1)))) { return 'no'; }
    return deadEnd(side, kind, Number(to.charAt(1))) ? 'must' : 'may';
  }

  function toUsiSq(k) { return k.charAt(0) + String.fromCharCode(96 + Number(k.charAt(1))); }
  function fromUsiSq(s, c) { return s + String(c.charCodeAt(0) - 96); }

  function moveUsi(from, to, promote) { return toUsiSq(from) + toUsiSq(to) + (promote ? '+' : ''); }
  function dropUsi(kind, to) { return USI_LETTER[kind] + '*' + toUsiSq(to); }

  // USI の 1 手をこの局面で指せるか。指せれば { from, to, kind, promote }(usi-kif.js apply の形)、だめなら null
  function parseMove(pos, usi) {
    var m = String(usi || '').match(/^([1-9])([a-i])([1-9])([a-i])(\+?)$/);
    if (m) {
      var from = fromUsiSq(m[1], m[2]), to = fromUsiSq(m[3], m[4]);
      if (destinations(pos, from).indexOf(to) < 0) { return null; }
      var p = promotion(pos, from, to), promote = m[5] === '+';
      if ((promote && p === 'no') || (!promote && p === 'must')) { return null; }
      return { from: [Number(from.charAt(0)), Number(from.charAt(1))], to: [Number(to.charAt(0)), Number(to.charAt(1))],
               kind: kindOf(pos.ban[from]), promote: promote };
    }
    m = String(usi || '').match(/^([PLNSGBR])\*([1-9])([a-i])$/);
    if (m) {
      var kind = USI_KIND[m[1]], t = fromUsiSq(m[2], m[3]);
      if (dropTargets(pos, kind).indexOf(t) < 0) { return null; }
      return { from: null, to: [Number(t.charAt(0)), Number(t.charAt(1))], kind: kind, promote: false };
    }
    return null;
  }

  // 「▲７六歩」の形(同 は使わない。直す画面で前の手を見ずに読めるように)
  function label(pos, usi) {
    var m = parseMove(pos, usi);
    if (!m) { return null; }
    var mark = pos.teban === 'sente' ? '▲' : '△';
    return mark + ZEN[m.to[0]] + KAN[m.to[1]] + NAME[m.kind] + (m.promote ? '成' : '') + (m.from ? '' : '打');
  }

  // 局面なしで読める形(合わない手を一覧に出すとき): 「３一→２二」「４五に角打」
  function plain(usi) {
    var m = String(usi || '').match(/^([1-9])([a-i])([1-9])([a-i])(\+?)$/);
    if (m) {
      return ZEN[m[1]] + KAN[m[2].charCodeAt(0) - 96] + '→' + ZEN[m[3]] + KAN[m[4].charCodeAt(0) - 96] + (m[5] ? '成' : '');
    }
    m = String(usi || '').match(/^([PLNSGBR])\*([1-9])([a-i])$/);
    if (m) { return ZEN[m[2]] + KAN[m[3].charCodeAt(0) - 96] + 'に' + NAME[USI_KIND[m[1]]] + '打'; }
    return String(usi || '');
  }

  // 指し手の列を頭から並べる。合わない手が出たら、そこで止める
  // 返り値 { positions: [開始, 1 手後, …], labels: [1 手目, …], bad: 合わなかった手の番号(1 から) | 0 }
  function replay(teai, usis) {
    var pos = startPos(teai), positions = [pos], labels = [];
    for (var i = 0; i < usis.length; i++) {
      var m = parseMove(pos, usis[i]);
      if (!m) { return { positions: positions, labels: labels, bad: i + 1 }; }
      labels.push(label(pos, usis[i]));
      pos = U.apply(pos, m);
      positions.push(pos);
    }
    return { positions: positions, labels: labels, bad: 0 };
  }

  // KIF(UTF-8 の .kifu)。指し手の書き方は usi-kif.js(= study.html)と同じ
  function toKif(o) {
    var sfen = (U.HANDICAP_SFENS[o.teai] || U.HANDICAP_SFENS['平手']);
    var r = U.read('position sfen ' + sfen + ' moves ' + o.usis.join(' '));
    if (r.error) { return null; }
    var lines = r.kif.split('\n');
    var head = lines.filter(function (l) { return !/^\s*\d+\s/.test(l); });
    var moves = lines.filter(function (l) { return /^\s*\d+\s/.test(l); });
    var one = function (v) { return String(v || '').replace(/[\r\n]+/g, ' ').trim(); };
    var handi = o.teai && o.teai !== '平手';
    var out = ['#KIF version=2.0 encoding=UTF-8'];
    if (o.startedAt) { out.push('開始日時：' + o.startedAt); }
    if (one(o.event)) { out.push('棋戦：' + one(o.event)); }
    if (one(o.memo)) { out.push('備考：' + one(o.memo)); }
    out = out.concat(head);
    if (one(o.sente)) { out.push((handi ? '下手' : '先手') + '：' + one(o.sente)); }
    if (one(o.gote)) { out.push((handi ? '上手' : '後手') + '：' + one(o.gote)); }
    out.push('手数----指手---------消費時間--');
    out = out.concat(moves);
    if (o.end) { out.push('   ' + (o.usis.length + 1) + ' ' + o.end); }
    return out.join('\r\n') + '\r\n';
  }

  window.TaikaiShogi = {
    NAME: NAME, startPos: startPos, destinations: destinations, dropTargets: dropTargets, promotion: promotion,
    moveUsi: moveUsi, dropUsi: dropUsi, parseMove: parseMove, label: label, plain: plain, replay: replay, toKif: toKif,
    owner: owner, kindOf: kindOf
  };
})();
