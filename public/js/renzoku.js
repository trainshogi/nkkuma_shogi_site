/* 連続写真→棋譜化（β / フェーズ0プロトタイプ）
 *
 * 1手ごとに撮った写真列を既存の認識APIに順番に流し、局面列の差分から
 * 合法手マッチングで指し手列を復元して、消費時間込みのKIFを組み立てる。
 *
 * 設計メモ:
 * - 持ち駒は認識結果を使わず、初期局面から駒数保存則で自前トラッキングする
 *   （実データ診断で判明した誤認識源の筆頭「駒箱の写り込み」の影響を受けないため）
 * - 局面表示は kyokumen.js の盤面図レンダラを流用する
 * - 復元不能な遷移が出たらそこで打ち切り、そこまでのKIFを出す（黙って捏造しない）
 */
(function () {
  'use strict';

  var API_URL = 'https://api.nkkuma.tokyo/recognize';
  var API_KEY = '__API_KEY__';
  var PIYO_SAVE_URL = 'https://us-central1-shogiban2kif.cloudfunctions.net/save_kif';

  // ===== 将棋の基礎データ =====
  var KANJI = { fu: '歩', ky: '香', ke: '桂', gi: '銀', ki: '金', ka: '角', hi: '飛', ou: '玉',
                to: 'と', ny: '成香', nk: '成桂', ng: '成銀', um: '馬', ry: '龍' };
  var PROMOTE = { fu: 'to', ky: 'ny', ke: 'nk', gi: 'ng', ka: 'um', hi: 'ry' };
  var BASE = { to: 'fu', ny: 'ky', nk: 'ke', ng: 'gi', um: 'ka', ry: 'hi' };
  var GOLD_LIKE = { ki: 1, to: 1, ny: 1, nk: 1, ng: 1 };
  var ZEN_SUJI = ['０', '１', '２', '３', '４', '５', '６', '７', '８', '９'];
  var KAN_DAN = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

  // 平手初期配置
  function hirateBan() {
    var b = {};
    var back = ['ky', 'ke', 'gi', 'ki', 'ou', 'ki', 'gi', 'ke', 'ky'];
    for (var s = 1; s <= 9; s++) {
      b[String(s) + '1'] = 'v' + back[s - 1];
      b[String(s) + '3'] = 'vfu';
      b[String(s) + '7'] = ' fu';
      b[String(s) + '9'] = ' ' + back[s - 1];
    }
    b['82'] = 'vhi'; b['22'] = 'vka';
    b['28'] = ' hi'; b['88'] = ' ka';
    return b;
  }

  function emptyHands() { return { sente: {}, gote: {} }; }

  function cloneBan(b) { var o = {}; for (var k in b) { o[k] = b[k]; } return o; }
  function cloneHands(h) {
    return { sente: JSON.parse(JSON.stringify(h.sente)), gote: JSON.parse(JSON.stringify(h.gote)) };
  }

  function pieceAt(ban, s, d) {
    var v = ban[String(s) + String(d)];
    return (!v || v === ' * ') ? null : v;
  }
  function ownerOf(code) { return code.charAt(0) === 'v' ? 'gote' : 'sente'; }
  function kindOf(code) { return code.substr(1); }
  function mark(side) { return side === 'sente' ? ' ' : 'v'; }

  // ===== 合法手（擬似）生成 =====
  // 観測局面とのマッチングが目的なので、二歩・打ち歩詰め・自殺手は検査しない
  var STEPS = {
    fu: [[0, -1]],
    ke: [[-1, -2], [1, -2]],
    gi: [[0, -1], [-1, -1], [1, -1], [-1, 1], [1, 1]],
    ki: [[0, -1], [-1, -1], [1, -1], [-1, 0], [1, 0], [0, 1]],
    ou: [[0, -1], [-1, -1], [1, -1], [-1, 0], [1, 0], [0, 1], [-1, 1], [1, 1]]
  };
  var SLIDES = {
    ky: [[0, -1]],
    ka: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
    hi: [[0, -1], [0, 1], [-1, 0], [1, 0]]
  };
  var EXTRA_STEPS = { um: STEPS.ou, ry: STEPS.ou }; // 斜め/直進はSLIDES側で塞ぐので玉型でよい

  function destsFor(ban, s, d, code) {
    var side = ownerOf(code);
    var kind = kindOf(code);
    var sign = side === 'sente' ? 1 : -1;
    var out = [];
    var steps = GOLD_LIKE[kind] ? STEPS.ki : STEPS[kind];
    var i, ns, nd, hit;
    if (steps) {
      for (i = 0; i < steps.length; i++) {
        ns = s + steps[i][0] * sign; nd = d + steps[i][1] * sign;
        if (ns < 1 || ns > 9 || nd < 1 || nd > 9) { continue; }
        hit = pieceAt(ban, ns, nd);
        if (hit && ownerOf(hit) === side) { continue; }
        out.push([ns, nd]);
      }
    }
    var slideKind = kind === 'um' ? 'ka' : (kind === 'ry' ? 'hi' : kind);
    if (SLIDES[slideKind] && (kind === slideKind || kind === 'um' || kind === 'ry')) {
      var dirs = SLIDES[slideKind];
      for (i = 0; i < dirs.length; i++) {
        ns = s; nd = d;
        for (;;) {
          ns += dirs[i][0] * sign; nd += dirs[i][1] * sign;
          if (ns < 1 || ns > 9 || nd < 1 || nd > 9) { break; }
          hit = pieceAt(ban, ns, nd);
          if (hit && ownerOf(hit) === side) { break; }
          out.push([ns, nd]);
          if (hit) { break; }
        }
      }
    }
    if (kind === 'um' || kind === 'ry') {
      var ex = EXTRA_STEPS[kind];
      for (i = 0; i < ex.length; i++) {
        ns = s + ex[i][0]; nd = d + ex[i][1];
        if (ns < 1 || ns > 9 || nd < 1 || nd > 9) { continue; }
        hit = pieceAt(ban, ns, nd);
        if (hit && ownerOf(hit) === side) { continue; }
        // SLIDES側と重複しても matching 用途では実害なし
        out.push([ns, nd]);
      }
    }
    return out;
  }

  function inZone(side, dan) { return side === 'sente' ? dan <= 3 : dan >= 7; }
  function mustPromote(side, kind, dan) {
    if (kind === 'fu' || kind === 'ky') { return side === 'sente' ? dan === 1 : dan === 9; }
    if (kind === 'ke') { return side === 'sente' ? dan <= 2 : dan >= 8; }
    return false;
  }
  function canDrop(side, kind, dan) {
    if (kind === 'fu' || kind === 'ky') { return side === 'sente' ? dan !== 1 : dan !== 9; }
    if (kind === 'ke') { return side === 'sente' ? dan > 2 : dan < 8; }
    return true;
  }

  // 手番側の全候補手 [{from:[s,d]|null, to:[s,d], kind, promote}]
  function genMoves(pos) {
    var side = pos.teban;
    var out = [];
    var s, d, code, kind, dests, i, td, prom;
    for (s = 1; s <= 9; s++) {
      for (d = 1; d <= 9; d++) {
        code = pieceAt(pos.ban, s, d);
        if (!code || ownerOf(code) !== side) { continue; }
        kind = kindOf(code);
        dests = destsFor(pos.ban, s, d, code);
        for (i = 0; i < dests.length; i++) {
          td = dests[i][1];
          prom = PROMOTE[kind] && (inZone(side, td) || inZone(side, d));
          if (!mustPromote(side, kind, td)) {
            out.push({ from: [s, d], to: dests[i], kind: kind, promote: false });
          }
          if (prom) {
            out.push({ from: [s, d], to: dests[i], kind: kind, promote: true });
          }
        }
      }
    }
    var hand = pos.hands[side];
    for (kind in hand) {
      if (!hand[kind]) { continue; }
      for (s = 1; s <= 9; s++) {
        for (d = 1; d <= 9; d++) {
          if (pieceAt(pos.ban, s, d)) { continue; }
          if (!canDrop(side, kind, d)) { continue; }
          out.push({ from: null, to: [s, d], kind: kind, promote: false });
        }
      }
    }
    return out;
  }

  function applyMove(pos, m) {
    var side = pos.teban;
    var ban = cloneBan(pos.ban);
    var hands = cloneHands(pos.hands);
    var toKey = String(m.to[0]) + String(m.to[1]);
    var cap = pieceAt(ban, m.to[0], m.to[1]);
    if (cap) {
      var capKind = BASE[kindOf(cap)] || kindOf(cap);
      hands[side][capKind] = (hands[side][capKind] || 0) + 1;
    }
    if (m.from) {
      delete ban[String(m.from[0]) + String(m.from[1])];
      ban[toKey] = mark(side) + (m.promote ? PROMOTE[m.kind] : m.kind);
    } else {
      hands[side][m.kind] -= 1;
      if (!hands[side][m.kind]) { delete hands[side][m.kind]; }
      ban[toKey] = mark(side) + m.kind;
    }
    return { ban: ban, hands: hands, teban: side === 'sente' ? 'gote' : 'sente' };
  }

  // ===== 局面の比較 =====
  function normBan(b) {
    var o = {};
    for (var k in b) { if (b[k] && b[k] !== ' * ') { o[k] = b[k]; } }
    return o;
  }
  function diffCells(a, b) {
    var na = normBan(a), nb = normBan(b);
    var seen = {}, out = [], k;
    for (k in na) { seen[k] = 1; if (na[k] !== nb[k]) { out.push(k); } }
    for (k in nb) { if (!seen[k] && na[k] !== nb[k]) { out.push(k); } }
    return out;
  }

  // ===== 手順復元（スティッチャ） =====
  // frames: [{ban, hands|null, ts}] 認識済み局面列。frames[0]が開始局面。
  // opts: { firstMover: 'sente'|'gote' }
  // 返り値: { plies: [...], positions: [...], stoppedAt: null|frameIdx, startPos }
  function stitch(frames, opts) {
    var start = {
      ban: cloneBan(frames[0].ban),
      hands: frames[0].hands ? cloneHands(frames[0].hands) : emptyHands(),
      teban: opts.firstMover || 'sente'
    };
    var cur = { ban: cloneBan(start.ban), hands: cloneHands(start.hands), teban: start.teban };
    var plies = [];
    var positions = [cur];
    var stoppedAt = null;
    var prevTs = frames[0].ts;

    function tryStep(obs) {
      var moves = genMoves(cur);
      var best = null, i, next, mis;
      for (i = 0; i < moves.length; i++) {
        next = applyMove(cur, moves[i]);
        mis = diffCells(next.ban, obs).length;
        if (!best || mis < best.mis) { best = { move: moves[i], next: next, mis: mis }; }
        if (mis === 0) { break; }
      }
      return best;
    }

    for (var f = 1; f < frames.length; f++) {
      var obs = frames[f].ban;
      if (diffCells(cur.ban, obs).length === 0) { continue; } // 重複フレーム

      var best = tryStep(obs);
      if (best && best.mis === 0) {
        pushPly(best.move, best.next, frames[f], []);
        continue;
      }

      // 2手ブリッジ（キーフレームを1枚読み飛ばした場合）
      var bridged = null;
      var m1s = genMoves(cur);
      outer:
      for (var a = 0; a < m1s.length; a++) {
        var mid = applyMove(cur, m1s[a]);
        var m2s = genMoves(mid);
        for (var b = 0; b < m2s.length; b++) {
          var fin = applyMove(mid, m2s[b]);
          if (diffCells(fin.ban, obs).length === 0) {
            bridged = { m1: m1s[a], mid: mid, m2: m2s[b], fin: fin };
            break outer;
          }
        }
      }
      if (bridged) {
        pushPly(bridged.m1, bridged.mid, frames[f], ['写真の読み飛ばしを補完した手（要確認）']);
        pushPly(bridged.m2, bridged.fin, frames[f], ['写真の読み飛ばしを補完した手（要確認）']);
        continue;
      }

      // 許容誤差つき採用（認識ノイズ想定・2マスまで）
      if (best && best.mis <= 2) {
        pushPly(best.move, best.next, frames[f],
          ['認識と' + best.mis + 'マス不一致（この手の前後を要確認）']);
        continue;
      }

      stoppedAt = f;
      break;
    }

    function pushPly(move, next, frame, warnings) {
      var sec = Math.max(0, Math.round(((frame.ts || prevTs) - prevTs) / 1000));
      prevTs = frame.ts || prevTs;
      plies.push({ move: move, side: cur.teban, sec: sec, warnings: warnings, frameIdx: frame.idx });
      cur = next;
      positions.push(cur);
    }

    return { plies: plies, positions: positions, stoppedAt: stoppedAt, startPos: start };
  }

  // ===== KIF生成 =====
  function moveToKifStr(ply, prevTo) {
    var m = ply.move;
    var kind = m.promote === undefined ? m.kind : m.kind; // kindは移動前の駒種
    var dispKind = m.from ? kindAtSource(ply) : m.kind;
    var same = prevTo && prevTo[0] === m.to[0] && prevTo[1] === m.to[1];
    var s = same ? '同　' : ZEN_SUJI[m.to[0]] + KAN_DAN[m.to[1]];
    s += KANJI[dispKind];
    if (m.promote) { s += '成'; }
    if (!m.from) { s += '打'; }
    else { s += '(' + String(m.from[0]) + String(m.from[1]) + ')'; }
    return s;
  }
  // 移動元の駒種（成駒を動かした場合は成駒名で表記する）
  function kindAtSource(ply) { return ply.srcKind || ply.move.kind; }

  function fmtTime(sec) {
    var m = Math.floor(sec / 60), s = sec % 60;
    return (m < 10 ? ' ' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }
  function fmtTotal(sec) {
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return p(h) + ':' + p(m) + ':' + p(s);
  }

  function handLine(hands, side) {
    var order = ['hi', 'ka', 'ki', 'gi', 'ke', 'ky', 'fu'];
    var kans = ['', '', '二', '三', '四', '五', '六', '七', '八', '九', '十',
                '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八'];
    var parts = [];
    for (var i = 0; i < order.length; i++) {
      var n = hands[side][order[i]] || 0;
      if (n > 0) { parts.push(KANJI[order[i]].charAt(0) + kans[n]); }
    }
    return parts.length ? parts.join('　') + '　' : 'なし';
  }

  function isHirate(pos) {
    if (Object.keys(pos.hands.sente).length || Object.keys(pos.hands.gote).length) { return false; }
    return diffCells(pos.ban, hirateBan()).length === 0 && pos.teban === 'sente';
  }

  function bodHeader(pos) {
    var t = '後手の持駒：' + handLine(pos.hands, 'gote') + '\n';
    t += '  ９ ８ ７ ６ ５ ４ ３ ２ １\n+---------------------------+\n';
    var kans = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
    for (var i = 0; i < 9; i++) {
      t += '|';
      for (var j = 0; j < 9; j++) {
        var koma = pos.ban[String(9 - j) + String(i + 1)];
        if (koma && koma !== ' * ') {
          var k = kindOf(koma);
          // BODは1文字表記（成香=杏 等）
          var one = { to: 'と', ny: '杏', nk: '圭', ng: '全', um: '馬', ry: '龍' }[k] || KANJI[k];
          t += koma.charAt(0) + one;
        } else { t += ' ・'; }
      }
      t += '|' + kans[i] + '\n';
    }
    t += '+---------------------------+\n';
    t += '先手の持駒：' + handLine(pos.hands, 'sente') + '\n';
    t += pos.teban === 'sente' ? '先手番\n' : '後手番\n';
    return t;
  }

  function buildKif(res, meta) {
    var t = '';
    t += '開始日時：' + (meta.date || '') + '\n';
    t += '棋戦：連続写真からの復元棋譜\n';
    t += '先手：' + (meta.sente || '先手') + '\n';
    t += '後手：' + (meta.gote || '後手') + '\n';
    if (isHirate(res.startPos)) {
      t += '手合割：平手\n';
    } else {
      t += bodHeader(res.startPos);
    }
    t += '手数----指手---------消費時間--\n';
    var totals = { sente: 0, gote: 0 };
    var prevTo = null;
    for (var i = 0; i < res.plies.length; i++) {
      var ply = res.plies[i];
      totals[ply.side] += ply.sec;
      var num = String(i + 1);
      while (num.length < 4) { num = ' ' + num; }
      t += num + ' ' + moveToKifStr(ply, prevTo) +
           '   (' + fmtTime(ply.sec) + '/' + fmtTotal(totals[ply.side]) + ')\n';
      prevTo = ply.move.to;
    }
    return t;
  }

  // ===== 認識API =====
  function buildFormData(blob) {
    var fd = new FormData();
    fd.append('upfile', blob);
    fd.append('hidden_rotate', '0');
    fd.append('hidden_sengo', '0');
    fd.append('mode', 'all');
    fd.append('model', 'v2');
    fd.append('waku', 'v2');
    fd.append('mochi_crop', 'v2');
    fd.append('mochi_ocr', '1');
    fd.append('mochi_postproc', '0');
    fd.append('joint', '0'); // 時系列整合はフロント側で取るため単発補正は切る
    return fd;
  }

  function recognizeBlob(blob, attempt) {
    var controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, 32000) : null;
    return fetch(API_URL, {
      method: 'POST',
      headers: { 'x-api-key': API_KEY },
      body: buildFormData(blob),
      cache: 'no-store',
      signal: controller ? controller.signal : undefined
    }).then(function (res) {
      if (timer) { clearTimeout(timer); }
      if (res.status === 503 && attempt === 0) { return recognizeBlob(blob, 1); }
      if (!res.ok) { throw new Error('HTTP ' + res.status); }
      return res.json();
    }).catch(function (err) {
      if (timer) { clearTimeout(timer); }
      if (attempt === 0) { return recognizeBlob(blob, 1); }
      throw err;
    });
  }

  function compress(file) {
    return new Promise(function (resolve, reject) {
      /* global Compressor */
      new Compressor(file, {
        quality: 0.9, maxWidth: 2000, maxHeight: 2000,
        success: resolve, error: reject
      });
    });
  }

  // EXIFの撮影時刻（なければファイルの更新時刻）
  function photoTime(file) {
    return new Promise(function (resolve) {
      /* global EXIF */
      if (typeof EXIF === 'undefined') { return resolve(file.lastModified); }
      try {
        EXIF.getData(file, function () {
          var t = EXIF.getTag(this, 'DateTimeOriginal');
          if (t) {
            var m = t.match(/^(\d{4}):(\d\d):(\d\d) (\d\d):(\d\d):(\d\d)$/);
            if (m) {
              return resolve(new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime());
            }
          }
          resolve(file.lastModified);
        });
      } catch (e) { resolve(file.lastModified); }
    });
  }

  // 後手側から撮影した場合の180度回転
  function rotate180(result) {
    var ban = {};
    for (var k in result.ban_result) {
      var v = result.ban_result[k];
      if (!v || v === ' * ') { continue; }
      var nk = String(10 - Number(k.charAt(0))) + String(10 - Number(k.charAt(1)));
      ban[nk] = (v.charAt(0) === 'v' ? ' ' : 'v') + v.substr(1);
    }
    return {
      ban_result: ban,
      sente_mochi: result.gote_mochi,
      gote_mochi: result.sente_mochi,
      teban: result.teban
    };
  }

  function apiHands(result) {
    function conv(m) {
      var o = {};
      for (var k in (m || {})) {
        o[k] = (m[k] === '' || m[k] === 1) ? 1 : Number(m[k]);
      }
      return o;
    }
    return { sente: conv(result.sente_mochi), gote: conv(result.gote_mochi) };
  }

  // ===== UI =====
  var state = { files: [], frames: [], result: null, viewPly: 0 };
  function $(id) { return document.getElementById(id); }

  function setStep(n) { document.body.setAttribute('data-step', String(n)); }

  function renderThumbs() {
    var wrap = $('thumbs');
    wrap.innerHTML = '';
    state.files.forEach(function (f, i) {
      var d = document.createElement('div');
      d.className = 'thumb';
      var img = document.createElement('img');
      img.src = URL.createObjectURL(f);
      img.onload = function () { URL.revokeObjectURL(img.src); };
      var n = document.createElement('span');
      n.textContent = String(i + 1);
      d.appendChild(img); d.appendChild(n);
      wrap.appendChild(d);
    });
    $('file-count').textContent = state.files.length + '枚';
  }

  function toKyokumenShape(pos) {
    function m(h) { var o = {}; for (var k in h) { o[k] = h[k]; } return o; }
    return { ban_result: pos.ban, sente_mochi: m(pos.hands.sente), gote_mochi: m(pos.hands.gote), teban: pos.teban };
  }

  function showPosition(i) {
    state.viewPly = i;
    var pos = state.result.positions[i];
    var cv = window.Kyokumen.render(toKyokumenShape(pos));
    cv.style.maxWidth = '100%'; cv.style.height = 'auto';
    var host = $('board-view');
    host.innerHTML = '';
    host.appendChild(cv);
    $('ply-label').textContent = i === 0 ? '開始局面' : i + '手目まで';
    var items = document.querySelectorAll('#move-list li');
    for (var k = 0; k < items.length; k++) {
      items[k].classList.toggle('active', k === i - 1);
    }
  }

  function renderResult() {
    var res = state.result;
    var list = $('move-list');
    list.innerHTML = '';
    var prevTo = null;
    res.plies.forEach(function (ply, i) {
      var li = document.createElement('li');
      var label = (i + 1) + ' ' + (ply.side === 'sente' ? '▲' : '△') + moveToKifStr(ply, prevTo);
      prevTo = ply.move.to;
      li.textContent = label;
      if (ply.warnings.length) {
        li.classList.add('warn');
        li.title = ply.warnings.join(' / ');
      }
      li.addEventListener('click', function () { showPosition(i + 1); });
      list.appendChild(li);
    });

    var warns = res.plies.reduce(function (acc, p, i) {
      p.warnings.forEach(function (w) { acc.push((i + 1) + '手目: ' + w); });
      return acc;
    }, []);
    if (res.stoppedAt !== null) {
      warns.push('※ ' + (res.stoppedAt + 1) + '枚目の写真で手順を復元できず、そこで打ち切りました（' +
                 res.plies.length + '手目まで出力）');
    }
    $('warnings').innerHTML = '';
    warns.forEach(function (w) {
      var d = document.createElement('div');
      d.textContent = '⚠️ ' + w;
      $('warnings').appendChild(d);
    });
    $('warnings').hidden = warns.length === 0;

    var kif = buildKif(res, { date: new Date().toLocaleString('ja-JP') });
    $('kif-out').value = kif;
    showPosition(res.plies.length);
    setStep(3);
  }

  function runRecognition() {
    if (state.files.length < 2) { alert('写真を2枚以上（開始局面＋各手）選んでください'); return; }
    setStep(2);
    var total = state.files.length;
    var frames = [];
    var rotate = $('opt-camera').value === 'gote';

    var chain = Promise.resolve();
    state.files.forEach(function (file, idx) {
      chain = chain.then(function () {
        $('progress-label').textContent = '認識中… ' + (idx + 1) + ' / ' + total + ' 枚';
        $('progress-bar').style.width = Math.round(idx / total * 100) + '%';
        return Promise.all([compress(file), photoTime(file)]).then(function (r) {
          return recognizeBlob(r[0], 0).then(function (json) {
            if (rotate) { json = rotate180(json); }
            frames.push({
              ban: json.ban_result || {},
              hands: idx === 0 ? apiHands(json) : null, // 持ち駒は開始局面のみ信用し以降は自前トラッキング
              ts: r[1],
              idx: idx
            });
          });
        });
      });
    });

    chain.then(function () {
      $('progress-bar').style.width = '100%';
      state.frames = frames;
      state.result = stitch(frames, { firstMover: $('opt-first').value });
      renderResult();
    }).catch(function (err) {
      console.error(err);
      alert('認識に失敗しました: ' + err.message + '\n通信環境を確認してもう一度お試しください');
      setStep(1);
    });
  }

  function copyKif() {
    var ta = $('kif-out');
    ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    if (navigator.clipboard) { navigator.clipboard.writeText(ta.value).catch(function () {}); }
    $('btn-copy').textContent = 'コピーしました';
    setTimeout(function () { $('btn-copy').textContent = 'KIFをコピー'; }, 1500);
  }

  function saveKif() {
    var blob = new Blob([$('kif-out').value], { type: 'text/plain' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'kifu_' + Date.now() + '.kif';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  function openPiyo() {
    fetch(PIYO_SAVE_URL + '?message=' + encodeURIComponent($('kif-out').value))
      .then(function (res) {
        if (!res.ok) { throw new Error('save_kif failed'); }
        return res.text();
      })
      .then(function (data) { location.href = 'piyoshogi://?url=' + data; })
      .catch(function () { alert('連携に失敗しました。'); });
  }

  function init() {
    if (!$('file-input')) { return; } // テスト実行など、ページ外での読み込み
    $('file-input').addEventListener('change', function (e) {
      state.files = Array.prototype.slice.call(e.target.files);
      renderThumbs();
      $('btn-start').disabled = state.files.length < 2;
    });
    $('btn-start').addEventListener('click', runRecognition);
    $('btn-copy').addEventListener('click', copyKif);
    $('btn-save').addEventListener('click', saveKif);
    $('btn-piyo').addEventListener('click', openPiyo);
    $('btn-prev').addEventListener('click', function () {
      if (state.viewPly > 0) { showPosition(state.viewPly - 1); }
    });
    $('btn-next').addEventListener('click', function () {
      if (state.viewPly < state.result.positions.length - 1) { showPosition(state.viewPly + 1); }
    });
    $('btn-share-final').addEventListener('click', function () {
      window.Kyokumen.share(toKyokumenShape(state.result.positions[state.viewPly]));
    });
    $('btn-retry-all').addEventListener('click', function () {
      state.files = []; state.frames = []; state.result = null;
      $('file-input').value = '';
      renderThumbs();
      $('btn-start').disabled = true;
      setStep(1);
    });
    setStep(1);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else { init(); }

  // ===== 開発用: 合成対局でスティッチャを自己テスト =====
  function selfTest() {
    var moves = [
      { from: [7, 7], to: [7, 6], kind: 'fu', promote: false },   // ▲7六歩
      { from: [3, 3], to: [3, 4], kind: 'fu', promote: false },   // △3四歩
      { from: [8, 8], to: [2, 2], kind: 'ka', promote: true },    // ▲2二角成
      { from: [3, 1], to: [2, 2], kind: 'gi', promote: false },   // △同銀
      { from: null,   to: [4, 5], kind: 'ka', promote: false },   // ▲4五角打
      { from: null,   to: [8, 8], kind: 'ka', promote: false },   // △8八角打
      { from: [8, 9], to: [7, 7], kind: 'ke', promote: false },   // ▲7七桂
      { from: [8, 8], to: [9, 9], kind: 'ka', promote: true }     // △9九角成
    ];
    var pos = { ban: hirateBan(), hands: emptyHands(), teban: 'sente' };
    var frames = [{ ban: cloneBan(pos.ban), hands: cloneHands(pos.hands), ts: 0, idx: 0 }];
    moves.forEach(function (m, i) {
      pos = applyMove(pos, m);
      frames.push({ ban: cloneBan(pos.ban), hands: null, ts: (i + 1) * 15000, idx: i + 1 });
    });
    // 重複フレームと読み飛ばしも検査: 5手目の後を複製、6手目のフレームを削除
    frames.splice(6, 0, { ban: cloneBan(frames[5].ban), hands: null, ts: 76000, idx: 99 });
    frames.splice(7, 1); // △8八角打 のフレームを欠落させる → 2手ブリッジで復元されるはず

    var res = stitch(frames, { firstMover: 'sente' });
    var kif = buildKif(res, { date: 'selftest' });
    var expects = ['７六歩(77)', '３四歩(33)', '２二角成(88)', '同　銀(31)',
                   '４五角打', '８八角打', '７七桂(89)', '９九角成(88)'];
    var ok = res.plies.length === 8 && res.stoppedAt === null;
    expects.forEach(function (e) { if (kif.indexOf(e) === -1) { ok = false; console.error('missing:', e); } });
    // ノイズ耐性: 1マス誤認識を注入
    var noisy = frames.map(function (f) { return { ban: cloneBan(f.ban), hands: f.hands, ts: f.ts, idx: f.idx }; });
    noisy[3].ban['55'] = ' fu'; // ありえない歩を1枚
    var res2 = stitch(noisy, { firstMover: 'sente' });
    var warned = res2.plies.some(function (p) { return p.warnings.length > 0; });
    return { ok: ok, kif: kif, plies: res.plies.length, noisyOk: res2.plies.length === 8 && warned };
  }

  window.Renzoku = { stitch: stitch, buildKif: buildKif, selfTest: selfTest,
                     _hirate: hirateBan, _apply: applyMove, _gen: genMoves };
})();
