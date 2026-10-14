// kifu-paper.js — 棋譜を B5 の紙に刷る(検討室)。
//
// ■ アプリ 1.4.9 の「紙に印刷」と同じ形
//   komadori の ios/Komadori/KifuPaperPDF.swift(Android は KifuPaperPdf.kt)の寸法を
//   そのまま写した。紙は JIS B5 縦 = 516×729pt(182×257mm)。座標の単位はすべて pt。
//   - 指導の紙(lesson): 見出し・6段の指し手・図2つ・「ひとこと」「署名」の欄。
//       盤で手を選んでいれば左にその手の局面(途中図)、右に投了図。QR は右上へ。
//       選んでいなければ左に投了図、右に大きな QR。
//   - 記録用紙の形(recordSheet): 将棋の棋譜用紙の並び。表は1列 25 行 × 3列 = 150 手。
//       棋譜に無い欄(名前・段・時刻・昼休など)は空けておき、手で書き足す。
//
// ■ 刷り方
//   紙を SVG で組んで <body> の末尾の #kifu-print に置き、window.print() を呼ぶ。
//   印刷のときだけ #kifu-print を出し、ほかは隠す(@media print)。
//   PDF にするのも、印刷の画面の「PDF に保存」から。
//
// 呼び方: KifuPaper.print(paper, 'lesson' | 'recordSheet')。paper の形は study.html の buildPaper を見る。
// QR は /js/vendor/qrcode.min.js(qrcode-generator)を使う。読み込まれていなければ QR を載せない。
(function () {
  'use strict';

  var PAGE_W = 516, PAGE_H = 729, M = 28;
  var CW = PAGE_W - M * 2;
  var ROW = 16, COLUMNS = 6, FOOTER = 18, COMMENT = 58, CELL = 22;
  var SMALL_QR = 84, LARGE_QR = 150;
  var LOWER_BOTTOM = PAGE_H - M - FOOTER;
  var DIAGRAM_H = 17 + 14 + 11 + CELL * 9 + 5 + 12;
  var SANS = '"Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic","Noto Sans JP",Meiryo,sans-serif';
  var MINCHO = '"Hiragino Mincho ProN","Yu Mincho","Noto Serif JP",serif';
  var GRAY = '#555', MID = '#999', LIGHT = '#aaa';

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  // 字の幅の見積もり(半角は 0.55、ほかは 1 字ぶん)。印刷の前に測れないので、これで組む
  function tw(s, size) {
    var w = 0;
    for (var i = 0; i < s.length; i++) { w += s.charCodeAt(i) < 0x2000 ? 0.55 : 1; }
    return w * size;
  }
  function fitted(s, size, width) {
    var natural = tw(s, size);
    return natural > width ? Math.max(5, size * width / natural) : size;
  }
  function wrap(s, size, width) {
    var lines = [], cur = '';
    for (var i = 0; i < s.length; i++) {
      var ch = s.charAt(i);
      if (ch === '\n') { lines.push(cur); cur = ''; continue; }
      if (cur && tw(cur + ch, size) > width) { lines.push(cur); cur = ''; }
      cur += ch;
    }
    if (cur || !lines.length) { lines.push(cur); }
    return lines;
  }
  var LINE_GAP = 1.4;

  // ---- SVG の部品 ----
  function textTop(x, top, s, size, o) {
    o = o || {};
    return '<text x="' + x + '" y="' + (top + size * 0.88).toFixed(2) + '" font-size="' + size +
      '" fill="' + (o.fill || '#000') + '"' + (o.anchor ? ' text-anchor="' + o.anchor + '"' : '') +
      (o.bold ? ' font-weight="bold"' : '') + (o.family ? " font-family='" + o.family + "'" : '') +
      '>' + esc(s) + '</text>';
  }
  // 枠の縦の真ん中に1行(center なら横も真ん中)
  function textMid(s, size, rx, ry, rw, rh, o) {
    o = o || {};
    var x = o.center ? rx + rw / 2 : rx;
    return '<text x="' + x.toFixed(2) + '" y="' + (ry + rh / 2).toFixed(2) +
      '" dominant-baseline="central" font-size="' + size.toFixed(2) + '" fill="' + (o.fill || '#000') + '"' +
      (o.center ? ' text-anchor="middle"' : '') + '>' + esc(s) + '</text>';
  }
  function ln(x1, y1, x2, y2, w, color) {
    return '<line x1="' + x1.toFixed(2) + '" y1="' + y1.toFixed(2) + '" x2="' + x2.toFixed(2) +
      '" y2="' + y2.toFixed(2) + '" stroke="' + (color || '#000') + '" stroke-width="' + (w || 0.5) + '"/>';
  }
  function rule(x1, y1, x2, y2) { return ln(x1, y1, x2, y2, 0.5, '#666'); }
  function frame(x, y, w, h) {
    return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h +
      '" fill="none" stroke="#000" stroke-width="0.9"/>';
  }
  function qr(text, x, y, size) {
    if (!text || typeof window.qrcode !== 'function') { return ''; }
    var q;
    try { q = window.qrcode(0, 'M'); q.addData(text); q.make(); } catch (e) { return ''; }
    var n = q.getModuleCount(), c = size / n, d = '';
    for (var r = 0; r < n; r++) {
      for (var k = 0; k < n; k++) {
        if (q.isDark(r, k)) {
          d += 'M' + (x + k * c).toFixed(2) + ' ' + (y + r * c).toFixed(2) +
               'h' + c.toFixed(2) + 'v' + c.toFixed(2) + 'h-' + c.toFixed(2) + 'z';
        }
      }
    }
    return '<path d="' + d + '" fill="#000" shape-rendering="crispEdges"/>';
  }
  function footer(p, page, count) {
    var t = p.footer + (count > 1 ? '　' + page + ' / ' + count : '');
    return textTop(PAGE_W / 2, PAGE_H - M - 10, t, 8, { fill: '#888', anchor: 'middle' });
  }
  function svgPage(body) {
    return '<div class="kp-page"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + PAGE_W + ' ' + PAGE_H +
      '" width="182mm" height="257mm" font-family=\'' + SANS + '\'>' +
      '<rect width="' + PAGE_W + '" height="' + PAGE_H + '" fill="#fff"/>' + body + '</svg></div>';
  }

  // ---- 指導の紙 ----
  function headerLines(p) {
    var qrOnTop = !!(p.qrUrl && p.extra);
    var width = qrOnTop ? CW - SMALL_QR - 12 : CW;
    var notes = [];
    p.notes.forEach(function (n) { notes.push(wrap('※' + n, 8.5, width)); });
    var title = wrap(p.title, 18, width), sub = wrap(p.subtitle, 11, width);
    var h = title.length * 18 * LINE_GAP + 6 + sub.length * 11 * LINE_GAP + 4;
    notes.forEach(function (ls) { h += ls.length * 8.5 * LINE_GAP + 1; });
    if (qrOnTop) { h = Math.max(h, SMALL_QR + 12); }
    return { qrOnTop: qrOnTop, title: title, sub: sub, notes: notes, height: h + 12, rule: M + h + 4 };
  }

  function drawHeader(p, hl) {
    var out = '', y = M;
    hl.title.forEach(function (l) { out += textTop(M, y, l, 18, { bold: true }); y += 18 * LINE_GAP; });
    y += 6;
    hl.sub.forEach(function (l) { out += textTop(M, y, l, 11, { fill: GRAY }); y += 11 * LINE_GAP; });
    y += 4;
    hl.notes.forEach(function (ls) {
      ls.forEach(function (l) { out += textTop(M, y, l, 8.5, { fill: GRAY }); y += 8.5 * LINE_GAP; });
      y += 1;
    });
    if (hl.qrOnTop) {
      var qx = PAGE_W - M - SMALL_QR;
      out += qr(p.qrUrl, qx, M, SMALL_QR);
      out += textTop(qx + SMALL_QR / 2, M + SMALL_QR + 2, '読むと棋譜が開きます', 7, { fill: GRAY, anchor: 'middle' });
    }
    out += ln(M, hl.rule, PAGE_W - M, hl.rule, 0.5, LIGHT);
    return out;
  }

  function layoutPages(count, firstCapacity) {
    var firstRows = Math.max(1, Math.min(firstCapacity, Math.ceil(count / COLUMNS)));
    var restRows = Math.max(1, Math.floor((PAGE_H - M * 2 - FOOTER) / ROW));
    var pages = [{ from: 0, to: Math.min(count, firstRows * COLUMNS), rows: firstRows }];
    var next = pages[0].to;
    while (next < count) {
      var end = Math.min(count, next + restRows * COLUMNS);
      pages.push({ from: next, to: end, rows: restRows });
      next = end;
    }
    return pages;
  }

  function drawMoves(moves, page, top) {
    var out = '', width = CW / COLUMNS;
    for (var i = page.from; i < page.to; i++) {
      var local = i - page.from;
      var x = M + Math.floor(local / page.rows) * width;
      var y = top + (local % page.rows) * ROW;
      out += textTop(x + 18, y + 2.5, String(i + 1), 8, { fill: '#888', anchor: 'end' });
      out += textTop(x + 21, y, moves[i], fitted(moves[i], 11, width - 22));
    }
    var used = Math.min(COLUMNS, Math.ceil((page.to - page.from) / page.rows));
    for (var col = 1; col < Math.max(1, used); col++) {
      var lx = M + col * width - 3;
      out += ln(lx, top, lx, top + page.rows * ROW, 0.5, '#d9d9d9');
    }
    return out;
  }

  var RANKS = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
  function drawDiagram(d, x, top, width) {
    var out = '', y = top, board = CELL * 9;
    var bx = x + (width - board) / 2 - 5;
    out += textTop(x + width / 2, y, d.title, 11, { bold: true, anchor: 'middle' });
    y += 17;
    out += textTop(x, y, d.goteHand, 9);
    y += 14;
    for (var c = 0; c < 9; c++) {
      out += textTop(bx + c * CELL + CELL / 2, y, String(9 - c), 7.5, { fill: '#888', anchor: 'middle' });
    }
    y += 11;
    for (var r = 0; r < 9; r++) {
      out += textTop(bx + board + 7, y + r * CELL + 6, RANKS[r], 7.5, { fill: '#888', anchor: 'middle' });
    }
    if (d.highlight) {
      out += '<rect x="' + (bx + (9 - d.highlight[0]) * CELL) + '" y="' + (y + (d.highlight[1] - 1) * CELL) +
        '" width="' + CELL + '" height="' + CELL + '" fill="#e0e0e0"/>';
    }
    for (var i = 0; i <= 9; i++) {
      var o = i * CELL, w = (i === 0 || i === 9) ? 1.2 : 0.5;
      out += ln(bx + o, y, bx + o, y + board, w) + ln(bx, y + o, bx + board, y + o, w);
    }
    for (var rr = 0; rr < 9; rr++) {
      for (var cc = 0; cc < 9; cc++) {
        var cell = d.board[rr][cc];
        if (!cell) { continue; }
        var cx = bx + cc * CELL + CELL / 2, cy = y + rr * CELL + CELL / 2;
        out += '<text x="' + cx + '" y="' + cy + '" dominant-baseline="central" text-anchor="middle" font-size="15"' +
          " font-weight=\"bold\" font-family='" + MINCHO + "'" +
          (cell.gote ? ' transform="rotate(180 ' + cx + ' ' + cy + ')"' : '') + '>' + esc(cell.k) + '</text>';
      }
    }
    y += board + 5;
    out += textTop(x, y, d.senteHand, 9);
    return out;
  }

  function drawComment(top) {
    var x = M, w = CW, h = COMMENT, split = x + w * 0.68;
    return '<rect x="' + x + '" y="' + top + '" width="' + w + '" height="' + h +
      '" rx="4" fill="none" stroke="#808080" stroke-width="0.8"/>' +
      textTop(x + 8, top + 6, 'ひとこと', 9.5) +
      ln(x + 8, top + h - 10, split - 8, top + h - 10, 0.5, '#bfbfbf') +
      ln(split, top + 6, split, top + h - 6, 0.5, '#ccc') +
      textTop(split + 8, top + 6, '署名', 9.5, { fill: GRAY });
  }

  function drawLower(p, movesBottom) {
    var out = '', commentTop = LOWER_BOTTOM - COMMENT;
    if (p.diagram || p.qrUrl) {
      var y = movesBottom + Math.max(12, (commentTop - movesBottom - DIAGRAM_H) / 2);
      var half = (CW - 20) / 2, rightX = M + half + 20;
      if (p.extra) {
        out += drawDiagram(p.extra, M, y, half);
        if (p.diagram) { out += drawDiagram(p.diagram, rightX, y, half); }
      } else if (p.diagram) {
        out += drawDiagram(p.diagram, M, y, half);
      }
      if (!p.extra && p.qrUrl) {
        var qx = rightX + (half - LARGE_QR) / 2;
        out += qr(p.qrUrl, qx, y + 14, LARGE_QR);
        var cy = y + 14 + LARGE_QR + 8;
        p.qrCaption.split('\n').forEach(function (l) {
          out += textTop(rightX + half / 2, cy, l, 9, { fill: GRAY, anchor: 'middle' });
          cy += 9 * LINE_GAP;
        });
      }
    }
    return out + drawComment(commentTop);
  }

  function renderLesson(p) {
    var hl = headerLines(p);
    var movesTop = M + hl.height;
    var room = LOWER_BOTTOM - COMMENT - 12 - movesTop;
    if (p.diagram || p.qrUrl) { room -= DIAGRAM_H + 12; }
    var pages = layoutPages(p.moves.length, Math.max(1, Math.floor(room / ROW)));
    return pages.map(function (page, index) {
      var body = '';
      if (index === 0) {
        body += drawHeader(p, hl) + drawMoves(p.moves, page, movesTop) +
                drawLower(p, movesTop + page.rows * ROW);
      } else {
        body += drawMoves(p.moves, page, M);
      }
      return svgPage(body + footer(p, index + 1, pages.length));
    });
  }

  // ---- 記録用紙の形 ----
  var S_ROW = 20, S_FIRST_ROWS = 25, S_HEAD = 16, S_TOP_ROW = 19, S_MID_ROW = 13.5, S_QR = 44;
  var S_GRID_TOP = M + S_TOP_ROW * 4 + S_MID_ROW * 4;
  var S_REST_TOP = M + 18;
  var S_REST_ROWS = Math.max(1, Math.floor((LOWER_BOTTOM - S_REST_TOP - S_HEAD) / S_ROW));
  var GROUP = CW / 3;
  var S_COLS = [56, GROUP / 2 - 56, 56, GROUP / 2 - 56];
  var BLANK = MID;

  // 「12分05秒」「1時間02分」
  function duration(sec) {
    var t = Math.max(0, Math.round(sec));
    var h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
    var two = function (n) { return (n < 10 ? '0' : '') + n; };
    return h > 0 ? h + '時間' + two(m) + '分' : m + '分' + two(s) + '秒';
  }
  // 「0:05」「1:02:03」
  function clock(sec) {
    if (!(sec > 0)) { return '0:00'; }
    var t = Math.floor(sec), s = t % 60, m = Math.floor(t / 60) % 60, h = Math.floor(t / 3600);
    var two = function (n) { return (n < 10 ? '0' : '') + n; };
    return h > 0 ? h + ':' + two(m) + ':' + two(s) : m + ':' + two(s);
  }
  function isSente(i, s) { return (i % 2 === 0) === s.firstIsSente; }
  function runningTotals(s) {
    var sum = { s: 0, g: 0 };
    return s.spent.map(function (v, i) {
      if (v == null) { return null; }
      var k = isSente(i, s) ? 's' : 'g';
      sum[k] += v;
      return sum[k];
    });
  }
  function sideTotal(s, sente) {
    var known = s.spent.filter(function (v, i) { return v != null && isSente(i, s) === sente; });
    return known.length ? known.reduce(function (a, b) { return a + b; }, 0) : null;
  }
  function vertical(text, rx, ry, rw, rh) {
    var out = '', step = 10, y = ry + rh / 2 - text.length * step / 2;
    for (var i = 0; i < text.length; i++) {
      out += textMid(text.charAt(i), 8.5, rx, y, rw, step, { center: true, fill: GRAY });
      y += step;
    }
    return out;
  }

  function drawSheetHeader(p) {
    var s = p.sheet, out = '', right = PAGE_W - M;
    var top = M, row = S_TOP_ROW, x = M;
    // 上の段: 対局者・棋戦名・対局場所・開始〜夕休
    out += vertical('対局者', x, top, 18, row * 4);
    x += 18;
    out += rule(x, top, x, top + row * 4);
    [['▲', s.senteName], ['△', s.goteName]].forEach(function (pl, k) {
      var y = top + k * row * 2;
      out += textMid(pl[0], 11, x, y, 20, row * 2, { center: true });
      if (pl[1]) { out += textMid(pl[1], fitted(pl[1], 13, 110), x + 26, y, 110, row * 2); }
      out += textMid('段', 8, x + 138, y + row, 10, row, { fill: GRAY });
      out += rule(x + 20, y, x + 20, y + row * 2);
    });
    out += rule(x, top + row * 2, x + 150, top + row * 2);
    x += 150;
    out += rule(x, top, x, top + row * 4);
    out += vertical('棋戦名', x, top, 18, row * 3);
    out += rule(x + 18, top, x + 18, top + row * 3);
    out += ln(x + 18, top + row * 1.5, x + 132, top + row * 1.5, 0.4, MID);
    if (s.event) { out += textMid(s.event, fitted(s.event, 9.5, 108), x + 22, top, 108, row * 1.5); }
    out += rule(x, top + row * 3, x + 132, top + row * 3);
    out += textMid('対局場所', 8.5, x + 4, top + row * 3, 42, row, { fill: GRAY });
    out += rule(x + 46, top + row * 3, x + 46, top + row * 4);
    if (s.place) { out += textMid(s.place, fitted(s.place, 9, 82), x + 49, top + row * 3, 82, row); }
    x += 132;
    out += rule(x, top, x, top + row * 4);
    var times = [
      s.startTime ? ['開始', s.date + '　' + s.startTime, ''] : ['開始', s.date, '　　時　　分'],
      s.endTime ? ['終了', s.endDate + '　' + s.endTime, ''] : ['終了', '', '　　年　　月　　日　時　分'],
      ['昼休', '', '　時　　分～　　時　　分'],
      ['夕休', '', '　時　　分～　　時　　分']
    ];
    times.forEach(function (t, k) {
      var y = top + k * row;
      out += textMid(t[0], 8.5, x, y, 26, row, { center: true, fill: GRAY });
      var filled = tw(t[1], 9);
      if (t[1]) { out += textMid(t[1], 9, x + 32, y, filled, row); }
      if (t[2]) { out += textMid(t[2], 9, x + 32 + filled, y, 120, row, { fill: BLANK }); }
      if (k > 0) { out += rule(x, y, right, y); }
    });
    out += rule(x + 26, top, x + 26, top + row * 4);
    out += frame(M, top, CW, row * 4);

    // 中の段: 手合割・持時間・消費時間 / 備考 / 手数・戦型・記録係
    var mid = top + row * 4, small = S_MID_ROW, height = small * 4;
    x = M;
    [['手合割', s.handicap], ['持時間', s.timeLimit]].forEach(function (f, k) {
      var y = mid + k * small;
      out += textMid(f[0], 8.5, x, y, 52, small, { center: true, fill: GRAY });
      if (f[1]) { out += textMid(f[1], fitted(f[1], 9, 80), x + 56, y, 80, small); }
      else if (k === 1) { out += textMid('各　　　時間', 9, x + 56, y, 80, small, { fill: BLANK }); }
      out += rule(x, y + small, x + 140, y + small);
    });
    out += textMid('消費時間', 8.5, x, mid + small * 2, 52, small * 2, { center: true, fill: GRAY });
    [['▲', sideTotal(s, true)], ['△', sideTotal(s, false)]].forEach(function (t, k) {
      var known = t[1] != null;
      out += textMid(t[0] + (known ? '　' + duration(t[1]) : '　　時間　　分'), 9,
                     x + 56, mid + small * (2 + k), 80, small, { fill: known ? '#000' : BLANK });
    });
    out += ln(x + 52, mid + small * 3, x + 140, mid + small * 3, 0.4, MID);
    out += rule(x + 52, mid, x + 52, mid + height);
    x += 140;
    out += rule(x, mid, x, mid + height);
    out += textMid('備', 8.5, x + 3, mid + 2, 12, 11, { center: true, fill: GRAY });
    out += textMid('考', 8.5, x + 3, mid + 13, 12, 11, { center: true, fill: GRAY });
    var qrWidth = p.qrUrl ? S_QR + 8 : 0;
    if (p.notes.length) {
      var noteW = 180 - 20 - qrWidth, ny = mid + 3, maxY = mid + height - 16;
      p.notes.forEach(function (n) {
        wrap('※' + n, 7, noteW).forEach(function (l) {
          if (ny + 7 > maxY) { return; }
          out += textTop(x + 18, ny, l, 7, { fill: GRAY });
          ny += 7 * 1.3;
        });
      });
    }
    out += textMid('昼休前△　　　分・夕休前△　　　分', 7, x + 6, mid + height - 13, 170, 12, { fill: BLANK });
    if (p.qrUrl) { out += qr(p.qrUrl, x + 180 - S_QR - 4, mid + 5, S_QR); }
    x += 180;
    out += rule(x, mid, x, mid + height);
    var third = height / 3;
    var result = s.plies + '　手　　' + (s.winner || '　') + '　勝';
    var senkei = s.senkei || '▲　　　　△';
    [['手数', result, true], ['戦型', senkei, !!s.senkei], ['記録係', s.recorder, true]].forEach(function (f, k) {
      var y = mid + k * third;
      out += textMid(f[0], 8.5, x, y, 40, third, { center: true, fill: GRAY });
      if (f[1]) {
        out += textMid(f[1], f[2] ? fitted(f[1], 9.5, 92) : 9, x + 46, y, 92, third, { fill: f[2] ? '#000' : BLANK });
      }
      if (k > 0) { out += rule(x, y, right, y); }
    });
    out += rule(x + 40, mid, x + 40, mid + height);
    out += frame(M, mid, CW, height);
    return out;
  }

  function drawSheetGrid(p, page, top) {
    var s = p.sheet, out = '';
    var first = s.firstIsSente ? '▲' : '△', second = s.firstIsSente ? '△' : '▲';
    var height = S_HEAD + page.rows * S_ROW;
    var totals = runningTotals(s);
    for (var g = 0; g < 3; g++) {
      var x0 = M + g * GROUP, x = x0;
      S_COLS.forEach(function (w, c) {
        if (c % 2 === 0) {
          out += textMid(c === 0 ? first : second, 10, x, top, w, S_HEAD, { center: true });
        } else {
          out += ln(x, top + S_HEAD, x + w, top, 0.4, '#666');
          out += textTop(x + 1.5, top + 1, '消費', 5, { fill: GRAY });
          out += textTop(x + w - 1.5, top + S_HEAD - 6.5, '通計', 5, { fill: GRAY, anchor: 'end' });
        }
        x += w;
      });
      for (var r = 0; r < page.rows; r++) {
        var y = top + S_HEAD + r * S_ROW;
        for (var side = 0; side < 2; side++) {
          var index = page.from + g * page.rows * 2 + r * 2 + side;
          var cx = x0 + (side === 0 ? 0 : S_COLS[0] + S_COLS[1]);
          out += ln(cx + S_COLS[0], y + S_ROW, cx + S_COLS[0] + S_COLS[1], y, 0.4, '#8c8c8c');
          out += textTop(cx + 2, y + 1.5, String(index + 1), 5.5, { fill: MID });
          if (index >= p.moves.length) { continue; }
          var mv = p.moves[index].replace(/^[▲△]/, '');
          var size = fitted(mv, 10.5, S_COLS[0] - 12);
          out += textMid(mv, size, cx + 3, y, S_COLS[0], S_ROW, { center: true });
          var spent = s.spent[index], total = totals[index];
          if (spent != null && total != null) {
            var cl = cx + S_COLS[0];
            out += textTop(cl + 1.5, y + 1.5, clock(spent), 5.5);
            out += textTop(cl + S_COLS[1] - 1.5, y + S_ROW - 7, clock(total), 5.5, { anchor: 'end' });
          }
        }
        out += rule(x0, y, x0 + GROUP, y);
      }
      var lx = x0;
      for (var c = 0; c < S_COLS.length - 1; c++) {
        lx += S_COLS[c];
        out += rule(lx, top, lx, top + height);
      }
      out += ln(x0 + GROUP, top, x0 + GROUP, top + height, 0.9);
    }
    return out + frame(M, top, CW, height);
  }

  function renderSheet(p) {
    var pages = [{ from: 0, to: S_FIRST_ROWS * 6, rows: S_FIRST_ROWS }];
    var next = S_FIRST_ROWS * 6;
    while (next < p.moves.length) {
      pages.push({ from: next, to: next + S_REST_ROWS * 6, rows: S_REST_ROWS });
      next += S_REST_ROWS * 6;
    }
    return pages.map(function (page, index) {
      var body = index === 0
        ? drawSheetHeader(p) + drawSheetGrid(p, page, S_GRID_TOP)
        : textTop(M, M, p.title, 10, { fill: GRAY }) + drawSheetGrid(p, page, S_REST_TOP);
      return svgPage(body + footer(p, index + 1, pages.length));
    });
  }

  // ---- 刷る ----
  var CSS =
    '#kifu-print{display:none}' +
    '@page{size:182mm 257mm;margin:0}' +
    '@media print{' +
      'html,body{margin:0!important;padding:0!important;background:#fff!important}' +
      'body>*:not(#kifu-print){display:none!important}' +
      '#kifu-print{display:block}' +
      '.kp-page{width:182mm;height:257mm;overflow:hidden;break-after:page;page-break-after:always}' +
      '.kp-page:last-child{break-after:auto;page-break-after:auto}' +
      '.kp-page svg{display:block}' +
    '}';

  function root() {
    var el = document.getElementById('kifu-print');
    if (!el) {
      var st = document.createElement('style');
      st.textContent = CSS;
      document.head.appendChild(st);
      el = document.createElement('div');
      el.id = 'kifu-print';
      document.body.appendChild(el);
    }
    return el;
  }

  function render(paper, style) {
    return style === 'recordSheet' ? renderSheet(paper) : renderLesson(paper);
  }

  function print(paper, style) {
    root().innerHTML = render(paper, style).join('');
    // PDF に保存したときのファイル名になる。子どもの名前は載せない(アプリと同じ)
    var title = document.title;
    document.title = style === 'recordSheet' ? '記録用紙' : '棋譜の紙';
    var restore = function () { document.title = title; window.removeEventListener('afterprint', restore); };
    window.addEventListener('afterprint', restore);
    window.print();
    // afterprint が来ない端末もあるので、少し待って戻す
    setTimeout(restore, 1500);
  }

  window.KifuPaper = { render: render, print: print };
})();
