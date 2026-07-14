/* 局面画像の生成・保存・シェア（独立モジュール）
 * 認識結果JSON { ban_result, sente_mochi, gote_mochi, teban } から
 * 盤面図PNG（透かし入り）を作る。新旧どちらのUIからも使える。
 *   Kyokumen.render(result) -> canvas
 *   Kyokumen.save(result)         PNGをダウンロード
 *   Kyokumen.share(result)        Web Share API（画像付き）/ 非対応なら保存+Xポスト画面
 */
(function () {
  'use strict';

  var SITE_URL = 'https://shogi.nkkuma.tokyo/';
  var SHARE_TEXT = '将棋盤の写真からこの局面を読み取りました #将棋';
  var WATERMARK = 'shogi.nkkuma.tokyo ─ 盤面写真から棋譜化';

  var KANJI = { fu: '歩', ky: '香', ke: '桂', gi: '銀', ki: '金', ka: '角', hi: '飛', ou: '玉',
                to: 'と', ny: '杏', nk: '圭', ng: '全', um: '馬', ry: '龍' };
  var PROMOTED = { to: 1, ny: 1, nk: 1, ng: 1, um: 1, ry: 1 };
  var HAND_ORDER = ['hi', 'ka', 'ki', 'gi', 'ke', 'ky', 'fu'];
  var KANSUJI = ['', '', '二', '三', '四', '五', '六', '七', '八', '九', '十',
                 '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八'];
  var FILE_NUMS = ['９', '８', '７', '６', '５', '４', '３', '２', '１'];
  var RANK_NUMS = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];

  var SERIF = '"Hiragino Mincho ProN", "Yu Mincho", "MS Mincho", serif';
  var SANS = '"Hiragino Sans", "Yu Gothic", Meiryo, sans-serif';

  function handText(mark, label, mochi, isTeban) {
    var parts = [];
    for (var i = 0; i < HAND_ORDER.length; i++) {
      var code = HAND_ORDER[i];
      if (code in mochi) {
        var n = (mochi[code] === '' || mochi[code] === 1) ? 1 : Number(mochi[code]);
        if (n > 0) { parts.push(KANJI[code] + KANSUJI[n]); }
      }
    }
    var text = mark + label + '持駒：' + (parts.length ? parts.join('　') : 'なし');
    return isTeban ? text + '（手番）' : text;
  }

  function render(result) {
    var scale = 2; // Retina向けに2倍で描く
    var M = 10;          // 外周マージン
    var cell = 40;       // マス1辺
    var board = cell * 9;
    var fileH = 20;      // 筋番号の行
    var rankW = 18;      // 段番号の列
    var handH = 30;      // 持駒の行
    var wmH = 22;        // 透かしの行
    var W = M + board + rankW + M;
    var H = M + handH + fileH + board + handH + wmH;
    var bx = M, by = M + handH + fileH;

    var cv = document.createElement('canvas');
    cv.width = W * scale;
    cv.height = H * scale;
    var ctx = cv.getContext('2d');
    ctx.scale(scale, scale);

    // 背景・盤
    ctx.fillStyle = '#fdf8ec';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#eec96a';
    ctx.fillRect(bx, by, board, board);

    // 罫線
    ctx.strokeStyle = '#40331a';
    var i;
    for (i = 0; i <= 9; i++) {
      ctx.lineWidth = (i === 0 || i === 9) ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(bx + i * cell, by);
      ctx.lineTo(bx + i * cell, by + board);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(bx, by + i * cell);
      ctx.lineTo(bx + board, by + i * cell);
      ctx.stroke();
    }
    // 星
    ctx.fillStyle = '#40331a';
    [[3, 3], [6, 3], [3, 6], [6, 6]].forEach(function (p) {
      ctx.beginPath();
      ctx.arc(bx + p[0] * cell, by + p[1] * cell, 2.5, 0, Math.PI * 2);
      ctx.fill();
    });

    // 筋・段番号
    ctx.fillStyle = '#555';
    ctx.font = '12px ' + SANS;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (i = 0; i < 9; i++) {
      ctx.fillText(FILE_NUMS[i], bx + i * cell + cell / 2, by - fileH / 2);
      ctx.fillText(RANK_NUMS[i], bx + board + rankW / 2, by + i * cell + cell / 2);
    }

    // 駒（ban_resultのキーは "<筋><段>"、値は ' fu'（先手）/'vfu'（後手）/' * '）
    var ban = result.ban_result || {};
    ctx.font = 'bold 24px ' + SERIF;
    for (var suji = 1; suji <= 9; suji++) {
      for (var dan = 1; dan <= 9; dan++) {
        var code = ban[String(suji) + String(dan)];
        if (!code || code === ' * ') { continue; }
        var koma = code.substr(1);
        var kanji = KANJI[koma];
        if (!kanji) { continue; }
        var cx = bx + (9 - suji) * cell + cell / 2;
        var cy = by + (dan - 1) * cell + cell / 2 + 1;
        ctx.fillStyle = PROMOTED[koma] ? '#c22' : '#1a1208';
        if (code.charAt(0) === 'v') {
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(Math.PI);
          ctx.fillText(kanji, 0, 0);
          ctx.restore();
        } else {
          ctx.fillText(kanji, cx, cy);
        }
      }
    }

    // 持駒（上=後手、下=先手。手番側に（手番）を付ける）
    ctx.fillStyle = '#222';
    ctx.font = '15px ' + SANS;
    ctx.textAlign = 'left';
    ctx.fillText(handText('△', '後手', result.gote_mochi || {}, result.teban === 'gote'),
                 bx, M + handH / 2);
    ctx.fillText(handText('▲', '先手', result.sente_mochi || {}, result.teban === 'sente'),
                 bx, by + board + handH / 2);

    // 透かし
    ctx.fillStyle = '#999';
    ctx.font = '11px ' + SANS;
    ctx.textAlign = 'right';
    ctx.fillText(WATERMARK, bx + board + rankW, H - wmH / 2);

    return cv;
  }

  function toBlob(result) {
    return new Promise(function (resolve, reject) {
      var cv = render(result);
      if (cv.toBlob) {
        cv.toBlob(function (b) { b ? resolve(b) : reject(new Error('toBlob failed')); }, 'image/png');
      } else {
        reject(new Error('toBlob unsupported'));
      }
    });
  }

  function fileName() {
    var d = new Date();
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return 'kyokumen_' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) +
           '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()) + '.png';
  }

  function download(blob) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName();
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  // どちらのページにも依存しない簡易トースト
  function toast(msg) {
    var t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = 'position:fixed;left:50%;bottom:40px;transform:translateX(-50%);' +
      'background:rgba(30,30,30,.92);color:#fff;padding:10px 18px;border-radius:8px;' +
      'font-size:14px;z-index:9999;max-width:90%;text-align:center;';
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 3500);
  }

  function save(result) {
    toBlob(result).then(download).catch(function () {
      toast('画像の生成に失敗しました');
    });
  }

  function share(result) {
    return toBlob(result).then(function (blob) {
      var file = new File([blob], 'kyokumen.png', { type: 'image/png' });
      // スマホ: OSの共有シートに画像付きで渡す（X/LINE等を選べる）
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        return navigator.share({ files: [file], text: SHARE_TEXT + ' ' + SITE_URL })
          .catch(function (err) {
            if (err && err.name === 'AbortError') { return; } // ユーザーがキャンセル
            throw err;
          });
      }
      // PC等: 画像を保存してXのポスト画面を開く（画像は手動添付）
      download(blob);
      window.open('https://twitter.com/intent/tweet?text=' + encodeURIComponent(SHARE_TEXT) +
                  '&url=' + encodeURIComponent(SITE_URL), '_blank', 'noopener');
      toast('局面画像を保存しました。ポストに添付してください');
    }).catch(function () {
      toast('共有に失敗しました');
    });
  }

  window.Kyokumen = { render: render, save: save, share: share };
})();
