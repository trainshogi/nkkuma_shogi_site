/* 将棋盤認識サイト α版 — 新枠認識エンジン(shogiapi-green/Lambda)を叩く
 * site.js のコピーに「検出枠(points)の写真上オーバーレイ表示」を追加したもの。
 * 本採用が決まったら site.js に統合して本ファイルは削除する */
(function () {
  'use strict';

  // ===== 定数 =====
  var API_URL = 'https://scv8fb0ca0.execute-api.ap-northeast-1.amazonaws.com/alpha/recognize';
  var API_KEY = '__ALPHA_API_KEY__';
  var PIYO_SAVE_URL = 'https://us-central1-shogiban2kif.cloudfunctions.net/save_kif';
  var KENTO_URL = 'https://www.kento-shogi.com/?initpos=';

  // 持駒の種類（chips表示順: 歩香桂銀金角飛）
  var HAND_KOMA = ['fu', 'ky', 'ke', 'gi', 'ki', 'ka', 'hi'];
  var HAND_KANJI = ['歩', '香', '桂', '銀', '金', '角', '飛'];
  var HAND_MAX = { fu: 18, ky: 4, ke: 4, gi: 4, ki: 4, ka: 2, hi: 2 };

  // パレット用の駒コード
  var SENTE_KOMA = [' fu', ' ky', ' ke', ' gi', ' ki', ' ka', ' hi', ' ou',
                    ' to', ' ny', ' nk', ' ng', ' um', ' ry'];
  var GOTE_KOMA = ['vfu', 'vky', 'vke', 'vgi', 'vki', 'vka', 'vhi', 'vou',
                   'vto', 'vny', 'vnk', 'vng', 'vum', 'vry'];
  var PROMOTED = ['to', 'ny', 'nk', 'ng', 'um', 'ry'];

  // ===== util.js から移植（出力互換） =====
  function alphabet2kanji(koma) {
    var alphabet = ['* ', 'fu', 'ky', 'ke', 'gi', 'ki', 'ka', 'hi', 'ou', 'to', 'ny', 'nk', 'ng', 'um', 'ry'];
    var kanji    = ['・', '歩', '香', '桂', '銀', '金', '角', '飛', '玉', 'と', '杏', '圭', '全', '馬', '龍'];
    return kanji[alphabet.indexOf(koma)];
  }

  function int2kanji(kazu) {
    var kansuuji = ['', '', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八'];
    return kansuuji[kazu];
  }

  function sort_mochigoma(mochi) {
    var sorted = {};
    if ('hi' in mochi) { sorted['hi'] = mochi['hi']; }
    if ('ka' in mochi) { sorted['ka'] = mochi['ka']; }
    if ('ki' in mochi) { sorted['ki'] = mochi['ki']; }
    if ('gi' in mochi) { sorted['gi'] = mochi['gi']; }
    if ('ke' in mochi) { sorted['ke'] = mochi['ke']; }
    if ('ky' in mochi) { sorted['ky'] = mochi['ky']; }
    if ('fu' in mochi) { sorted['fu'] = mochi['fu']; }
    return sorted;
  }

  function json_to_kif(result_json) {
    var kansuuji    = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
    var tebans      = { 'sente': '先手番', 'gote': '後手番' };
    var kif_text    = '';
    var ban_result  = result_json['ban_result'];
    var sente_mochi = sort_mochigoma(result_json['sente_mochi']);
    var gote_mochi  = sort_mochigoma(result_json['gote_mochi']);
    var teban       = result_json['teban'];
    var koma, i, j;

    kif_text += '後手の持駒：';
    for (koma in gote_mochi) { kif_text += alphabet2kanji(koma) + int2kanji(gote_mochi[koma]) + '　'; }
    kif_text += '\n';
    kif_text += '  ９ ８ ７ ６ ５ ４ ３ ２ １\n';
    kif_text += '+---------------------------+\n';

    // i = 行番号 // j = 列番号
    for (i = 0; i < 9; i++) {
      kif_text += '|';
      for (j = 0; j < 9; j++) {
        koma = ban_result[String(9 - j) + String(i + 1)];
        if (koma) { kif_text += koma.charAt(0) + alphabet2kanji(koma.substr(1)); }
        else      { kif_text += ' ・'; }
      }
      kif_text += '|' + kansuuji[i] + '\n';
    }

    kif_text += '+---------------------------+\n';
    kif_text += '先手の持駒：';
    for (koma in sente_mochi) { kif_text += alphabet2kanji(koma) + int2kanji(sente_mochi[koma]) + '　'; }
    kif_text += '\n';

    kif_text += '\n';
    kif_text += tebans[teban];
    return kif_text;
  }

  function json_to_sfen(result_json) {
    var tebans      = { 'sente': 'b', 'gote': 'w' };
    var komas       = {};
    var kifkomas    = [' * ', ' fu', ' ky', ' ke', ' gi', ' ki', ' ka', ' hi', ' ou',
                       ' to', ' ny', ' nk', ' ng', ' um', ' ry',
                       'vfu', 'vky', 'vke', 'vgi', 'vki', 'vka', 'vhi', 'vou',
                       'vto', 'vny', 'vnk', 'vng', 'vum', 'vry'];
    var sfenkomas   = ['1', 'P', 'L', 'N', 'S', 'G', 'B', 'R', 'K',
                       '+P', '+L', '+N', '+S', '+B', '+R',
                       'p', 'l', 'n', 's', 'g', 'b', 'r', 'k',
                       '+p', '+l', '+n', '+s', '+b', '+r'];
    var i, j, koma, koma_kazu, space;
    for (i = 0; i < 29; i++) { komas[kifkomas[i]] = sfenkomas[i]; }
    var kif_text    = '';
    var ban_result  = result_json['ban_result'];
    var sente_mochi = sort_mochigoma(result_json['sente_mochi']);
    var gote_mochi  = sort_mochigoma(result_json['gote_mochi']);
    var teban       = result_json['teban'];

    // i = 行番号 // j = 列番号
    for (i = 0; i < 9; i++) {
      var before_koma = '';
      for (j = 0; j < 9; j++) {
        var tmpkoma = ban_result[String(9 - j) + String(i + 1)];
        if (tmpkoma) { koma = komas[tmpkoma]; }
        else         { koma = komas[' * ']; }
        if ((before_koma == '1') && (koma == '1')) {
          space = String(Number(kif_text.slice(-1)) + 1);
          kif_text = kif_text.slice(0, -1);
          kif_text += space;
        } else {
          kif_text += koma;
        }
        before_koma = koma;
      }
      kif_text += '/';
    }
    // 最後のスライスを消す
    kif_text = kif_text.slice(0, -1);

    // 手番
    kif_text += ' ' + tebans[teban];

    // 持ち駒
    kif_text += ' ';
    for (koma in sente_mochi) {
      koma_kazu = String(sente_mochi[koma]);
      if (koma_kazu == '1') { koma_kazu = ''; }
      kif_text += koma_kazu + komas[' ' + koma];
    }
    for (koma in gote_mochi) {
      koma_kazu = String(gote_mochi[koma]);
      if (koma_kazu == '1') { koma_kazu = ''; }
      kif_text += koma_kazu + komas['v' + koma];
    }
    if (kif_text.slice(-1) == ' ') { kif_text += '-'; }

    // 何手目
    kif_text += ' 1';

    return kif_text;
  }

  function sfen_to_kento(sfen) {
    return sfen.split('+').join('%2B');
  }

  // ===== 状態 =====
  var state = {
    result: null,        // APIレスポンスと同形 { ban_result, sente_mochi, gote_mochi, teban }
    photoUrl: null,      // objectURL
    blob: null,          // 圧縮後Blob
    selectedPos: null,   // 編集中のマス "<筋><段>"
    points: null,        // α: 検出した盤枠の4隅 [[x,y]×4]（アップロード画像のピクセル座標）
    wakuVersion: 'v2',      // α: 枠検出のバージョン切替（v1=旧UNet / v2=新エンジン）
    modelVersion: 'v2',     // α: 駒認識モデル切替（v1/v2/v3。API推奨はv2）
    mochiCropVersion: 'v2', // α: 持ち駒認識エンジン（v1=旧 / v2=新・盤周囲タイル検出。API推奨はv2）
    mochiOcr: true,         // α: 持ち駒の個数数字OCR（アプリ画面向け。API推奨は1）
    mochiPostproc: false,   // α: 持ち駒を駒数保存則で補正（実験的・実物写真では既定OFF推奨）
    joint: false            // α: 統合整合ソルバ（持ち駒×保存則で盤面も補正。model=v1/v2のみ有効・既定OFF）
  };

  var els = {};
  function $(id) { return document.getElementById(id); }

  function setState(s) { document.body.setAttribute('data-state', s); }

  // ===== トースト =====
  var toastTimer = null;
  function toast(msg) {
    var t = els.toast;
    t.textContent = msg;
    t.hidden = false;
    if (toastTimer) { clearTimeout(toastTimer); }
    toastTimer = setTimeout(function () { t.hidden = true; }, 2000);
  }

  // ===== 盤描画 =====
  function isPromoted(koma) {
    return PROMOTED.indexOf(koma.substr(1)) !== -1;
  }

  function renderBoard() {
    var r = state.result;
    var board = els.board;
    board.innerHTML = '';
    // ban_result: キー "<筋><段>" 筋9..1, 段1..9。表示は i段(1..9) × j筋(9..1)
    for (var i = 0; i < 9; i++) {         // 段
      for (var j = 0; j < 9; j++) {       // 列（左=9筋 ... 右=1筋）
        var pos = String(9 - j) + String(i + 1);
        var koma = r.ban_result[pos];
        var sq = document.createElement('div');
        sq.className = 'sq';
        sq.setAttribute('data-pos', pos);
        if (!koma || koma === ' * ') {
          sq.classList.add('empty');
          sq.textContent = '・';
        } else {
          sq.textContent = alphabet2kanji(koma.substr(1));
          if (koma.charAt(0) === 'v') { sq.classList.add('gote'); }
          if (isPromoted(koma)) { sq.classList.add('promoted'); }
        }
        if (state.selectedPos === pos) { sq.classList.add('selected'); }
        board.appendChild(sq);
      }
    }
    renderStars();
    renderHand('gote');
    renderHand('sente');
  }

  function renderStars() {
    var board = els.board;
    var pts = [[33.333, 33.333], [66.666, 33.333], [33.333, 66.666], [66.666, 66.666]];
    for (var k = 0; k < pts.length; k++) {
      var d = document.createElement('div');
      d.className = 'star';
      d.setAttribute('aria-hidden', 'true');
      d.style.left = pts[k][0] + '%';
      d.style.top = pts[k][1] + '%';
      board.appendChild(d);
    }
  }

  function renderHand(side) {
    var container = document.querySelector('.hand[data-hand="' + side + '"]');
    container.innerHTML = '';
    var mochi = side === 'sente' ? state.result.sente_mochi : state.result.gote_mochi;
    for (var i = 0; i < HAND_KOMA.length; i++) {
      var code = HAND_KOMA[i];
      var cnt = 0;
      if (code in mochi) {
        cnt = mochi[code] === '' ? 1 : Number(mochi[code]);
      }
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip' + (cnt === 0 ? ' zero' : '');
      chip.setAttribute('data-side', side);
      chip.setAttribute('data-koma', code);
      var koma = document.createElement('span');
      koma.className = 'koma';
      koma.textContent = HAND_KANJI[i];
      var c = document.createElement('span');
      c.className = 'cnt';
      c.textContent = '×' + cnt;
      chip.appendChild(koma);
      chip.appendChild(c);
      container.appendChild(chip);
    }
  }

  function renderNums() {
    var files = els.fileNums;
    files.innerHTML = '';
    var f = ['9', '8', '7', '6', '5', '4', '3', '2', '1'];
    for (var i = 0; i < 9; i++) {
      var s = document.createElement('span');
      s.textContent = f[i];
      files.appendChild(s);
    }
    var ranks = els.rankNums;
    ranks.innerHTML = '';
    var r = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
    for (var j = 0; j < 9; j++) {
      var sr = document.createElement('span');
      sr.textContent = r[j];
      ranks.appendChild(sr);
    }
  }

  function renderTeban() {
    var t = state.result.teban;
    var btns = document.querySelectorAll('.seg-btn');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('active', btns[i].getAttribute('data-teban') === t);
    }
  }

  function renderAll() {
    renderNums();
    renderBoard();
    renderTeban();
  }

  // ===== 盤マス編集 =====
  function openPalette(pos) {
    state.selectedPos = pos;
    var cur = state.result.ban_result[pos];
    var pal = els.palette;
    pal.innerHTML = '';

    // 行1: 空マス
    var row1 = document.createElement('div');
    row1.className = 'palette-row';
    row1.appendChild(makePcell(' * ', cur));
    pal.appendChild(row1);

    // 行2: 先手14駒
    var row2 = document.createElement('div');
    row2.className = 'palette-row';
    for (var i = 0; i < SENTE_KOMA.length; i++) {
      row2.appendChild(makePcell(SENTE_KOMA[i], cur));
    }
    pal.appendChild(row2);

    // 行3: 後手14駒
    var row3 = document.createElement('div');
    row3.className = 'palette-row';
    for (var g = 0; g < GOTE_KOMA.length; g++) {
      row3.appendChild(makePcell(GOTE_KOMA[g], cur));
    }
    pal.appendChild(row3);

    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'btn palette-close';
    close.textContent = '閉じる';
    close.addEventListener('click', closePalette);
    pal.appendChild(close);

    pal.hidden = false;
    renderBoard(); // ハイライト反映
  }

  function makePcell(code, cur) {
    var cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'pcell';
    if (code === ' * ') {
      cell.classList.add('empty');
      cell.textContent = '空';
    } else {
      cell.textContent = alphabet2kanji(code.substr(1));
      if (code.charAt(0) === 'v') { cell.classList.add('gote'); }
      if (isPromoted(code)) { cell.classList.add('promoted'); }
    }
    var curNorm = (!cur || cur === ' * ') ? ' * ' : cur;
    if (curNorm === code) { cell.classList.add('current'); }
    cell.addEventListener('click', function () { applyPiece(code); });
    return cell;
  }

  function applyPiece(code) {
    var pos = state.selectedPos;
    if (code === ' * ') {
      delete state.result.ban_result[pos];
    } else {
      state.result.ban_result[pos] = code;
    }
    closePalette();
  }

  function closePalette() {
    els.palette.hidden = true;
    state.selectedPos = null;
    renderBoard();
  }

  // ===== 持駒編集 =====
  function bumpMochi(side, code) {
    var key = side === 'sente' ? 'sente_mochi' : 'gote_mochi';
    var mochi = state.result[key];
    var cur = 0;
    if (code in mochi) {
      cur = mochi[code] === '' ? 1 : Number(mochi[code]);
    }
    var max = HAND_MAX[code];
    var next = (cur + 1) % (max + 1);
    if (next === 0) {
      delete mochi[code];
    } else {
      mochi[code] = next;
    }
    renderHand(side);
  }

  // ===== 手番 =====
  function setTeban(t) {
    state.result.teban = t;
    renderTeban();
  }

  // ===== 出力 =====
  function currentText() {
    return els.format.value === 'sfen'
      ? json_to_sfen(state.result)
      : json_to_kif(state.result);
  }

  function execCopy(string) {
    var tmp = document.createElement('div');
    var pre = document.createElement('pre');
    pre.style.webkitUserSelect = 'auto';
    pre.style.userSelect = 'auto';
    tmp.appendChild(pre).textContent = string;
    var s = tmp.style;
    s.position = 'fixed';
    s.right = '200%';
    document.body.appendChild(tmp);
    document.getSelection().selectAllChildren(tmp);
    var result = document.execCommand('copy');
    document.body.removeChild(tmp);
    return result;
  }

  function doCopy() {
    var text = currentText();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        toast('コピーしました');
      }, function () {
        fallbackCopy(text);
      });
    } else {
      fallbackCopy(text);
    }
  }

  function fallbackCopy(text) {
    if (execCopy(text)) { toast('コピーしました'); }
    else { toast('このブラウザでは対応していません'); }
  }

  function doSave() {
    var text = currentText();
    var isKif = els.format.value !== 'sfen';
    var filename = isKif ? 'kyokumen.kif' : 'kyokumen.txt';
    var blob = new Blob([text], { type: 'text/plain' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.target = '_blank';
    a.download = filename;
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  // ===== 検討アプリ連携 =====
  function jumpKento() {
    var url = KENTO_URL + sfen_to_kento(json_to_sfen(state.result));
    window.open(url, '_blank');
  }

  function jumpPiyo() {
    var kif = json_to_kif(state.result);
    fetch(PIYO_SAVE_URL + '?message=' + encodeURIComponent(kif))
      .then(function (res) {
        if (!res.ok) { throw new Error('save_kif failed'); }
        return res.text();
      })
      .then(function (data) {
        location.href = 'piyoshogi://?url=' + data;
      })
      .catch(function (err) {
        console.error(err);
        alert('連携に失敗しました。');
      });
  }

  // ===== 共有ボタン =====
  function setupShare() {
    var text = '写真1枚で簡単KIF作成！';
    var via = 'nkkuma_service';
    var url = location.href;
    var x = $('share-x');
    if (x) {
      x.href = 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(text) +
        '&url=' + encodeURIComponent(url) + '&via=' + via;
      x.target = '_blank';
      x.rel = 'noopener';
    }
    var fb = $('share-fb');
    if (fb) {
      fb.href = 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(url);
      fb.target = '_blank';
      fb.rel = 'noopener';
    }
  }

  // ===== α: 検出枠オーバーレイ =====
  // points はアップロードした（圧縮後の）画像のピクセル座標。プレビューも同じ画像を
  // 表示しているので、naturalWidth/Height の viewBox でそのまま重ねられる
  function renderFrame() {
    var old = document.getElementById('frame-overlay');
    if (old) { old.remove(); }
    if (!state.points || state.points.length !== 4 || !els.photo.naturalWidth) { return; }
    var w = els.photo.naturalWidth, h = els.photo.naturalHeight;
    var svgns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(svgns, 'svg');
    svg.id = 'frame-overlay';
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    svg.setAttribute('preserveAspectRatio', 'none');
    var poly = document.createElementNS(svgns, 'polygon');
    poly.setAttribute('points', state.points.map(function (p) { return p[0] + ',' + p[1]; }).join(' '));
    svg.appendChild(poly);
    state.points.forEach(function (p) {
      var c = document.createElementNS(svgns, 'circle');
      c.setAttribute('cx', p[0]); c.setAttribute('cy', p[1]);
      c.setAttribute('r', Math.max(6, w * 0.012));
      svg.appendChild(c);
    });
    document.querySelector('.photo-wrap').appendChild(svg);
  }

  function clearFrame() {
    state.points = null;
    var old = document.getElementById('frame-overlay');
    if (old) { old.remove(); }
  }

  // ===== 画像選択・圧縮 =====
  function clearPhoto() {
    if (state.photoUrl) { URL.revokeObjectURL(state.photoUrl); state.photoUrl = null; }
    state.blob = null;
    els.photo.removeAttribute('src');
    clearFrame();
  }

  function onFileSelected(file) {
    if (!file) { return; }
    if (!file.type || file.type.indexOf('image/') !== 0) {
      toast('画像ファイルを選んでください');
      return;
    }
    new Compressor(file, {
      quality: 0.9,
      maxWidth: 2000,
      maxHeight: 2000,
      success: function (blob) {
        clearPhoto();
        state.blob = blob;
        state.photoUrl = URL.createObjectURL(blob);
        els.photo.src = state.photoUrl;
        setState('photo');
      },
      error: function (err) {
        console.error(err);
        toast('この画像は読み込めませんでした');
      }
    });
  }

  // ===== API 呼び出し =====
  // multipartを毎回作り直す(FormData/Blobは1リクエストで消費されるため、
  // リトライ時に使い回すと空ボディになる)
  function buildFormData() {
    var fd = new FormData();
    fd.append('upfile', state.blob);
    fd.append('hidden_rotate', '0');
    fd.append('hidden_sengo', '0');       // API仕様更新: 手番は0固定(先手基準)
    fd.append('mode', 'all');             // API仕様更新: mode 必須
    fd.append('model', state.modelVersion); // v1/v2/v3 の駒認識モデル切替(API推奨v2)
    fd.append('waku', state.wakuVersion);   // 枠検出 v1/v2
    fd.append('mochi_crop', state.mochiCropVersion); // 持ち駒認識エンジン v1/v2(API推奨v2)
    fd.append('mochi_ocr', state.mochiOcr ? '1' : '0'); // 持ち駒個数OCR(API推奨1)
    fd.append('mochi_postproc', state.mochiPostproc ? '1' : '0'); // 持ち駒の駒数保存則補正(実験的)
    fd.append('joint', state.joint ? '1' : '0'); // 統合整合ソルバ(持ち駒で盤面も補正。model=v3では無視される)
    return fd;
  }

  // コールドスタート時、初回が最大30秒→API Gatewayの30sタイムアウトで503になり得る。
  // その場合のみ1回だけ自動リトライする(2回目はウォーム済で通る想定)。
  function postRecognize(attempt) {
    // ブラウザ側でも30sで打ち切ってやり直せるようAbortControllerで制御
    var controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, 32000) : null;

    return fetch(API_URL, {
      method: 'POST',
      headers: { 'x-api-key': API_KEY },
      body: buildFormData(),
      cache: 'no-store',
      signal: controller ? controller.signal : undefined
    }).then(function (res) {
      if (timer) { clearTimeout(timer); }
      // 503(コールドスタート起因のタイムアウト)は1回だけリトライ
      if (res.status === 503 && attempt === 0) {
        return postRecognize(1);
      }
      if (!res.ok) { throw new Error('HTTP ' + res.status); }
      return res.json();
    }).catch(function (err) {
      if (timer) { clearTimeout(timer); }
      // ネットワーク中断/タイムアウト(abort)も初回のみリトライ
      if (attempt === 0) { return postRecognize(1); }
      throw err;
    });
  }

  function recognize() {
    if (!state.blob) { return; }
    setState('busy');
    postRecognize(0)
      .then(function (data) {
        applyResult(data);
      })
      .catch(function (err) {
        console.error(err);
        setState('error');
      });
  }

  function applyResult(data) {
    state.result = {
      ban_result: data.ban_result || {},
      sente_mochi: data.sente_mochi || {},
      gote_mochi: data.gote_mochi || {},
      teban: data.teban || 'sente'
    };
    state.points = (data.points && data.points.length === 4) ? data.points : null;
    state.selectedPos = null;
    els.palette.hidden = true;
    renderAll();
    renderFrame();
    setState('done');
  }

  // ===== リセット =====
  function resetAll() {
    clearPhoto();
    state.result = null;
    state.selectedPos = null;
    els.palette.hidden = true;
    els.fileInput.value = '';
    setState('empty');
  }

  // ===== 初期化 =====
  function init() {
    els.fileInput = $('file-input');
    els.photo = $('photo');
    els.board = $('board');
    els.palette = $('palette');
    els.fileNums = document.querySelector('.file-nums');
    els.rankNums = document.querySelector('.rank-nums');
    els.format = $('format');
    els.toast = $('toast');

    // ファイル入力
    els.fileInput.addEventListener('change', function () {
      onFileSelected(els.fileInput.files[0]);
    });

    $('btn-camera').addEventListener('click', function () {
      els.fileInput.setAttribute('capture', 'environment');
      els.fileInput.click();
    });
    $('btn-library').addEventListener('click', function () {
      els.fileInput.removeAttribute('capture');
      els.fileInput.click();
    });

    $('btn-convert').addEventListener('click', recognize);
    $('btn-retry').addEventListener('click', recognize);

    // α: 枠検出 v1/v2 トグル
    var wakuBtns = document.querySelectorAll('.waku-toggle .seg-btn');
    for (var w = 0; w < wakuBtns.length; w++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          state.wakuVersion = btn.getAttribute('data-waku');
          for (var k = 0; k < wakuBtns.length; k++) { wakuBtns[k].classList.remove('active'); }
          btn.classList.add('active');
        });
      })(wakuBtns[w]);
    }

    // α: joint（統合整合ソルバ）はmodel=v1/v2でのみ有効なため、v3選択中は操作不能にする
    function updateJointAvailability() {
      var row = $('joint-solver-row');
      var chk = $('joint-solver');
      if (!row || !chk) { return; }
      var disabled = state.modelVersion === 'v3';
      chk.disabled = disabled;
      row.style.opacity = disabled ? 0.45 : '';
    }

    // α: 駒認識モデル v1/v2/v3 トグル
    var modelBtns = document.querySelectorAll('.model-toggle .seg-btn');
    for (var m = 0; m < modelBtns.length; m++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          state.modelVersion = btn.getAttribute('data-model');
          for (var k = 0; k < modelBtns.length; k++) { modelBtns[k].classList.remove('active'); }
          btn.classList.add('active');
          updateJointAvailability();
        });
      })(modelBtns[m]);
    }
    updateJointAvailability();

    // α: 持ち駒認識エンジン v1/v2 トグル
    var mochiCropBtns = document.querySelectorAll('.mochi-crop-toggle .seg-btn');
    for (var mc = 0; mc < mochiCropBtns.length; mc++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          state.mochiCropVersion = btn.getAttribute('data-mochi-crop');
          for (var k = 0; k < mochiCropBtns.length; k++) { mochiCropBtns[k].classList.remove('active'); }
          btn.classList.add('active');
        });
      })(mochiCropBtns[mc]);
    }

    // α: 持ち駒OCR（mochi_ocr）チェックボックス
    var mochiOcrChk = $('mochi-ocr');
    if (mochiOcrChk) {
      mochiOcrChk.checked = state.mochiOcr;
      mochiOcrChk.addEventListener('change', function () {
        state.mochiOcr = mochiOcrChk.checked;
      });
    }

    // α: 持ち駒補正（mochi_postproc）チェックボックス
    var mochiChk = $('mochi-postproc');
    if (mochiChk) {
      mochiChk.checked = state.mochiPostproc;
      mochiChk.addEventListener('change', function () {
        state.mochiPostproc = mochiChk.checked;
      });
    }

    // α: 統合整合ソルバ（joint）チェックボックス
    var jointChk = $('joint-solver');
    if (jointChk) {
      jointChk.checked = state.joint;
      jointChk.addEventListener('change', function () {
        state.joint = jointChk.checked;
      });
    }

    function reselect() {
      els.fileInput.removeAttribute('capture');
      els.fileInput.click();
    }
    $('btn-reselect').addEventListener('click', reselect);
    $('btn-reselect-err').addEventListener('click', reselect);

    $('btn-reset').addEventListener('click', resetAll);

    // 盤クリック（委譲）
    els.board.addEventListener('click', function (e) {
      var sq = e.target.closest('.sq');
      if (!sq) { return; }
      openPalette(sq.getAttribute('data-pos'));
    });

    // 持駒クリック（委譲）
    document.querySelector('.board-unit').addEventListener('click', function (e) {
      var chip = e.target.closest('.chip');
      if (!chip) { return; }
      bumpMochi(chip.getAttribute('data-side'), chip.getAttribute('data-koma'));
    });

    // 手番セグメント
    var segBtns = document.querySelectorAll('.seg-btn');
    for (var i = 0; i < segBtns.length; i++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          setTeban(btn.getAttribute('data-teban'));
        });
      })(segBtns[i]);
    }

    // 出力
    $('btn-copy').addEventListener('click', doCopy);
    $('btn-save').addEventListener('click', doSave);
    $('btn-piyo').addEventListener('click', jumpPiyo);
    $('btn-kento').addEventListener('click', jumpKento);
    $('btn-faq').addEventListener('click', function () { location.href = './faq.html'; });

    setupShare();

    // 使い方オーバーレイ（自動では出さない。ボタンでのみ開閉）
    var howto = $('howto-modal');
    function openHowto() { howto.hidden = false; $('btn-howto-close').focus(); }
    function closeHowto() { howto.hidden = true; $('btn-howto').focus(); }
    $('btn-howto').addEventListener('click', openHowto);
    $('btn-howto-close').addEventListener('click', closeHowto);
    howto.addEventListener('click', function (e) {
      if (e.target.getAttribute('data-close')) { closeHowto(); }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !howto.hidden) { closeHowto(); }
    });

    // デバッグフック（本番でも無害）
    window.__debugSetResult = function (json) { applyResult(json); };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
