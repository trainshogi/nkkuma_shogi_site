// komadori-web-recorder.js — ブラウザで対局を撮って、止めたら棋譜にする(komadori/web.html)
//
// Android の Chrome 向け。アプリの竹と同じ「軽い録画」をブラウザで作り、止めたあとに
// 動画ページ(video.html)と同じ /uploads へ送る。結果の表示は video.html に任せる
// (localStorage の videoKifuJob に jobId を置いて /video.html?resume=1 へ移る)。
//
// ■ 録画の作り(アプリ komadori-android live/LiveTapeWriter.kt・LiveTapeTuning と同じ値)
//   ・4 コマ/秒、長辺 720(拡大はしない)、300kbps、キーフレーム 1 秒ごと、音なし。
//   ・カメラの映像を 250ms ごとに canvas へ写し、WebCodecs の H.264 エンコーダに渡す。
//     時刻は「何枚目 × 250ms」。サーバの EventExtract は 時刻 = 番号 / fps で読むので、
//     間隔をそろえておく(画面が隠れて撮れなかったあいだは、その分だけ詰まる)。
//   ・mp4 は fragmented(mp4-muxer)。途中で落ちても、書き終えた断片までは読める。
//
// ■ 端末に残す(OPFS)
//   断片を 30 秒ぶんためて、OPFS に 1 ファイルずつ書いて閉じる。閉じたファイルは
//   タブが落ちても残るので、次に開いたとき「送っていない録画」として送れる。
//   OPFS が無いブラウザではメモリに持つ(タブが落ちたら消える)。
//
// ■ 文言: です・ます。精度の数字・「AI」・「無料」は書かない。
(function () {
  'use strict';

  var API_BASE = 'https://p02rzz43dl.execute-api.ap-northeast-1.amazonaws.com';
  var TAPE = { fps: 4, longSide: 720, bitrate: 300000, keyEverySec: 1 };
  var FLUSH_SEC = 30;                     // OPFS へ書いて閉じる間隔
  var MAX_ENCODE_QUEUE = 8;               // これより詰まったら、その1枚は書かない
  var REC_KEY = 'komadoriWebRec';         // 送っていない録画の目録
  var JOB_KEY = 'videoKifuJob';           // video.html と共有(結果を取りに戻る鍵)
  var OPFS_DIR = 'komadori-web-rec';
  var AVC_CANDIDATES = ['avc1.42001f', 'avc1.4d001f', 'avc1.640028'];

  function $(id) { return document.getElementById(id); }
  function show(id, on) { var el = $(id); if (el) { el.hidden = !on; } }
  function setScreen(name) { document.body.setAttribute('data-screen', name); }

  // ---- 目録(localStorage) ----
  function loadRec() {
    try { return JSON.parse(localStorage.getItem(REC_KEY) || 'null'); } catch (e) { return null; }
  }
  function saveRec(rec) {
    try { localStorage.setItem(REC_KEY, JSON.stringify(rec)); } catch (e) {}
  }
  function clearRec() {
    try { localStorage.removeItem(REC_KEY); } catch (e) {}
  }

  // ---- 使えるかの確認 ----
  function hasCamera() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }
  function hasEncoder() {
    return typeof window.VideoEncoder === 'function' && typeof window.VideoFrame === 'function';
  }
  function hasOpfs() {
    return !!(navigator.storage && navigator.storage.getDirectory);
  }
  function pickCodec(w, h) {
    var i = 0;
    function next() {
      if (i >= AVC_CANDIDATES.length) { return Promise.resolve(null); }
      var cfg = encoderConfig(AVC_CANDIDATES[i++], w, h);
      return window.VideoEncoder.isConfigSupported(cfg)
        .then(function (r) { return (r && r.supported) ? cfg : next(); })
        .catch(next);
    }
    return next();
  }
  function encoderConfig(codec, w, h) {
    return {
      codec: codec, width: w, height: h,
      bitrate: TAPE.bitrate, framerate: TAPE.fps,
      latencyMode: 'quality', avc: { format: 'avc' }
    };
  }

  // 長辺を 720 に収める(拡大しない)。エンコーダのために偶数へ丸める
  function tapeSize(vw, vh) {
    var s = Math.min(1, TAPE.longSide / Math.max(vw, vh));
    return { w: Math.max(2, Math.round(vw * s / 2) * 2), h: Math.max(2, Math.round(vh * s / 2) * 2) };
  }

  // ---- 端末の置き場(OPFS かメモリ) ----
  function Store(id) {
    this.id = id;
    this.memory = [];      // OPFS が無いときの置き場(Blob の列)
    this.dir = null;
    this.parts = 0;
    this.bytes = 0;
  }
  Store.prototype.open = function () {
    var self = this;
    if (!hasOpfs()) { return Promise.resolve(self); }
    return navigator.storage.getDirectory()
      .then(function (root) { return root.getDirectoryHandle(OPFS_DIR, { create: true }); })
      .then(function (d) { return d.getDirectoryHandle(self.id, { create: true }); })
      .then(function (d) { self.dir = d; return self; })
      .catch(function () { self.dir = null; return self; });
  };
  Store.prototype.write = function (chunks) {
    var self = this;
    var blob = new Blob(chunks, { type: 'video/mp4' });
    if (!blob.size) { return Promise.resolve(); }
    self.bytes += blob.size;
    if (!self.dir) { self.memory.push(blob); self.parts++; return Promise.resolve(); }
    var name = 'part-' + String(self.parts + 1).padStart(5, '0') + '.bin';
    return self.dir.getFileHandle(name, { create: true })
      .then(function (fh) { return fh.createWritable(); })
      .then(function (w) { return w.write(blob).then(function () { return w.close(); }); })
      .then(function () { self.parts++; })
      .catch(function (err) {
        // 書けなければメモリへ逃がす(録画は止めない)
        console.warn('opfs write failed', err);
        self.dir = null;
        self.memory.push(blob);
        self.parts++;
      });
  };
  // 送るための 1 本の Blob。OPFS のファイルは中身を読み込まずに参照だけつなぐ
  Store.prototype.toBlob = function () {
    var self = this;
    if (!self.dir) { return Promise.resolve(new Blob(self.memory, { type: 'video/mp4' })); }
    return listParts(self.dir).then(function (files) {
      return new Blob(files.concat(self.memory), { type: 'video/mp4' });
    });
  };

  function listParts(dir) {
    var names = [];
    var it = dir.keys();
    function step() {
      return it.next().then(function (r) {
        if (r.done) { return; }
        if (/^part-\d+\.bin$/.test(r.value)) { names.push(r.value); }
        return step();
      });
    }
    return step().then(function () {
      names.sort();
      return Promise.all(names.map(function (n) {
        return dir.getFileHandle(n).then(function (fh) { return fh.getFile(); });
      }));
    });
  }
  function openSavedBlob(id) {
    if (!hasOpfs()) { return Promise.resolve(null); }
    return navigator.storage.getDirectory()
      .then(function (root) { return root.getDirectoryHandle(OPFS_DIR); })
      .then(function (d) { return d.getDirectoryHandle(id); })
      .then(listParts)
      .then(function (files) {
        if (!files.length) { return null; }
        return new Blob(files, { type: 'video/mp4' });
      })
      .catch(function () { return null; });
  }
  function removeSaved(id) {
    if (!hasOpfs() || !id) { return Promise.resolve(); }
    return navigator.storage.getDirectory()
      .then(function (root) { return root.getDirectoryHandle(OPFS_DIR); })
      .then(function (d) { return d.removeEntry(id, { recursive: true }); })
      .catch(function () {});
  }

  // ---- 録画 ----
  var rec = null;   // 録画中の状態
  var stream = null;
  var wakeLock = null;

  function requestWakeLock() {
    if (!('wakeLock' in navigator)) { return; }
    navigator.wakeLock.request('screen').then(function (l) { wakeLock = l; }).catch(function () {});
  }
  function releaseWakeLock() {
    if (wakeLock) { wakeLock.release().catch(function () {}); wakeLock = null; }
  }

  function openCamera() {
    return navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    }).then(function (s) {
      stream = s;
      var v = $('preview');
      v.srcObject = s;
      return v.play().catch(function () {}).then(function () { return waitVideoSize(v); });
    });
  }
  function waitVideoSize(v) {
    return new Promise(function (resolve) {
      if (v.videoWidth) { return resolve(); }
      v.addEventListener('loadedmetadata', function () { resolve(); }, { once: true });
    });
  }
  function closeCamera() {
    if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; }
  }

  function startRecording() {
    var v = $('preview');
    var size = tapeSize(v.videoWidth, v.videoHeight);
    return pickCodec(size.w, size.h).then(function (cfg) {
      if (!cfg) { throw new Error('no-encoder'); }
      var id = 'rec-' + Date.now();
      var store = new Store(id);
      return store.open().then(function () {
        var pending = [];
        var pendingBytes = 0;
        var lastFlush = Date.now();
        var flushing = Promise.resolve();
        function flush() {
          if (!pending.length) { return flushing; }
          var chunks = pending; pending = []; pendingBytes = 0;
          lastFlush = Date.now();
          flushing = flushing.then(function () { return store.write(chunks); }).then(function () {
            saveRec({ id: id, startedAt: rec ? rec.startedAt : Date.now(), frames: rec ? rec.frames : 0,
                      bytes: store.bytes, opfs: !!store.dir, sent: false });
          });
          return flushing;
        }
        var muxer = new window.Mp4Muxer.Muxer({
          target: new window.Mp4Muxer.StreamTarget({
            onData: function (data, position) {
              // 断片(moof)の頭で区切る。書いて閉じたファイルは断片の切れ目で終わる
              var isMoof = data.byteLength >= 8 && data[4] === 0x6d && data[5] === 0x6f &&
                           data[6] === 0x6f && data[7] === 0x66;
              if (isMoof && Date.now() - lastFlush >= FLUSH_SEC * 1000) { flush(); }
              pending.push(data.slice());
              pendingBytes += data.byteLength;
            }
          }),
          video: { codec: 'avc', width: size.w, height: size.h, frameRate: TAPE.fps },
          fastStart: 'fragmented',
          minFragmentDuration: 2
        });
        var failed = null;
        var encoder = new window.VideoEncoder({
          output: function (chunk, meta) { muxer.addVideoChunk(chunk, meta); },
          error: function (e) { failed = e; console.error('encoder error', e); }
        });
        encoder.configure(cfg);

        var canvas = document.createElement('canvas');
        canvas.width = size.w; canvas.height = size.h;
        var ctx = canvas.getContext('2d', { alpha: false });
        var step = 1e6 / TAPE.fps;
        var keyEvery = Math.max(1, Math.round(TAPE.keyEverySec * TAPE.fps));

        rec = {
          id: id, startedAt: Date.now(), frames: 0, dropped: 0, gaps: 0,
          store: store, encoder: encoder, muxer: muxer, flush: flush,
          failed: function () { return failed; }, timer: null, size: size, codec: cfg.codec,
          bytes: function () { return store.bytes + pendingBytes; }
        };
        saveRec({ id: id, startedAt: rec.startedAt, frames: 0, bytes: 0, opfs: !!store.dir, sent: false });

        function tick() {
          if (failed || !stream) { return; }
          if (document.hidden || v.readyState < 2 || !v.videoWidth) { return; }
          if (encoder.encodeQueueSize > MAX_ENCODE_QUEUE) { rec.dropped++; return; }
          // 向きが変わっても縦横比を保って収める(黒い余白)
          var vw = v.videoWidth, vh = v.videoHeight;
          var s = Math.min(size.w / vw, size.h / vh);
          var dw = vw * s, dh = vh * s;
          if (dw < size.w - 1 || dh < size.h - 1) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, size.w, size.h); }
          ctx.drawImage(v, (size.w - dw) / 2, (size.h - dh) / 2, dw, dh);
          var frame = new window.VideoFrame(canvas, { timestamp: rec.frames * step, duration: step });
          encoder.encode(frame, { keyFrame: rec.frames % keyEvery === 0 });
          frame.close();
          rec.frames++;
        }
        rec.timer = setInterval(tick, 1000 / TAPE.fps);
        requestWakeLock();
        return rec;
      });
    });
  }

  function stopRecording() {
    var r = rec;
    if (!r) { return Promise.resolve(null); }
    clearInterval(r.timer);
    releaseWakeLock();
    return r.encoder.flush().catch(function () {}).then(function () {
      try { r.encoder.close(); } catch (e) {}
      try { r.muxer.finalize(); } catch (e) { console.warn('finalize', e); }
      return r.flush();
    }).then(function () {
      saveRec({ id: r.id, startedAt: r.startedAt, frames: r.frames, bytes: r.store.bytes,
                opfs: !!r.store.dir, sent: false, stoppedAt: Date.now() });
      return r.store.toBlob();
    }).then(function (blob) {
      rec = null;
      return { id: r.id, blob: blob, frames: r.frames, startedAt: r.startedAt };
    });
  }

  // ---- 送る(video.html と同じ /uploads) ----
  function withRetry(fn, times) {
    return fn().catch(function (err) {
      if (times <= 1) { throw err; }
      return new Promise(function (res) { setTimeout(res, 3000); }).then(function () {
        return withRetry(fn, times - 1);
      });
    });
  }
  function upload(blob, name, onProgress) {
    return withRetry(function () {
      return fetch(API_BASE + '/uploads', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ fileName: name, contentType: 'video/mp4', fileSizeBytes: blob.size })
      }).then(function (res) {
        if (!res.ok) { throw new Error('送る準備ができませんでした (HTTP ' + res.status + ')'); }
        return res.json();
      });
    }, 3).then(function (up) {
      var partSize = up.partSizeBytes;
      var etags = [];
      var chain = Promise.resolve();
      up.parts.forEach(function (part, i) {
        chain = chain.then(function () {
          onProgress(i / up.parts.length);
          var piece = blob.slice(i * partSize, Math.min((i + 1) * partSize, blob.size));
          return withRetry(function () {
            return fetch(part.url, { method: 'PUT', body: piece }).then(function (res) {
              if (!res.ok) { throw new Error('送れませんでした (HTTP ' + res.status + ')'); }
              var etag = res.headers.get('ETag');
              if (!etag) { throw new Error('送れたかどうかを確かめられませんでした'); }
              etags.push({ partNumber: part.partNumber, etag: etag });
            });
          }, 3);
        });
      });
      return chain.then(function () {
        onProgress(1);
        return withRetry(function () {
          return fetch(API_BASE + '/uploads/complete', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ jobId: up.jobId, uploadId: up.uploadId, parts: etags })
          }).then(function (res) {
            if (!res.ok) { throw new Error('送り終えられませんでした (HTTP ' + res.status + ')'); }
            return up.jobId;
          });
        }, 3);
      });
    });
  }

  function fileName(startedAt) {
    var d = new Date(startedAt || Date.now());
    function p(n) { return String(n).padStart(2, '0'); }
    return 'komadori-web-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' +
           p(d.getHours()) + p(d.getMinutes()) + '.mp4';
  }

  function sendAndOpen(blob, id, startedAt) {
    setScreen('send');
    show('send-error', false);
    $('send-label').textContent = '送っています…';
    $('send-bar').style.width = '0%';
    $('send-size').textContent = fmtSize(blob.size);
    var name = fileName(startedAt);
    return upload(blob, name, function (f) {
      $('send-bar').style.width = Math.round(f * 100) + '%';
    }).then(function (jobId) {
      try {
        localStorage.setItem(JOB_KEY, JSON.stringify({ jobId: jobId, name: name, startedAt: Date.now() }));
      } catch (e) {}
      clearRec();
      return removeSaved(id).then(function () {
        $('send-label').textContent = '送りました。棋譜の画面へ移ります…';
        location.href = '/video.html?resume=1';
      });
    }).catch(function (err) {
      console.error(err);
      $('send-label').textContent = '送れませんでした。';
      $('send-error-msg').textContent = (err && err.message) || '';
      show('send-error', true);
      pendingSend = { blob: blob, id: id, startedAt: startedAt };
    });
  }
  var pendingSend = null;

  // ---- 表示 ----
  function fmtSize(bytes) {
    if (bytes >= 1073741824) { return (bytes / 1073741824).toFixed(2) + ' GB'; }
    return (bytes / 1048576).toFixed(1) + ' MB';
  }
  function fmtElapsed(ms) {
    var s = Math.floor(ms / 1000);
    var h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), ss = s % 60;
    function p(n) { return String(n).padStart(2, '0'); }
    return (h ? h + ':' + p(m) : m) + ':' + p(ss);
  }
  var hudTimer = null;
  function startHud() {
    hudTimer = setInterval(function () {
      if (!rec) { return; }
      $('rec-time').textContent = fmtElapsed(Date.now() - rec.startedAt);
      $('rec-size').textContent = fmtSize(rec.bytes());
      if (rec.failed()) {
        $('rec-warn').textContent = '録画が止まりました。「対局おわり」を押すと、ここまでの分を送れます。';
        show('rec-warn', true);
      }
    }, 1000);
  }
  function stopHud() { clearInterval(hudTimer); hudTimer = null; }

  function showUnsupported(reason) {
    setScreen('start');
    $('unsupported-reason').textContent = reason;
    show('unsupported', true);
    $('btn-camera').disabled = true;
  }

  // ---- 画面の動き ----
  function init() {
    setScreen('start');
    if (!window.isSecureContext || !hasCamera()) {
      showUnsupported('このブラウザではカメラを使えません。');
      return;
    }
    if (!hasEncoder() || !window.Mp4Muxer) {
      showUnsupported('このブラウザでは録画を作れません。Android の Chrome を新しくしてからお試しください。');
      return;
    }

    // 送っていない録画
    var saved = loadRec();
    if (saved && saved.id && !saved.sent) {
      openSavedBlob(saved.id).then(function (blob) {
        if (!blob || !blob.size) { clearRec(); return; }
        var mins = Math.max(1, Math.round((saved.frames || 0) / TAPE.fps / 60));
        $('saved-info').textContent = '約' + mins + '分・' + fmtSize(blob.size);
        show('saved-box', true);
        $('btn-saved-send').onclick = function () { sendAndOpen(blob, saved.id, saved.startedAt); };
        $('btn-saved-drop').onclick = function () {
          if (!confirm('送っていない録画を消します。よろしいですか。')) { return; }
          removeSaved(saved.id).then(function () { clearRec(); show('saved-box', false); });
        };
      });
    }

    $('btn-camera').addEventListener('click', function () {
      $('btn-camera').disabled = true;
      openCamera().then(function () {
        setScreen('camera');
      }).catch(function (err) {
        console.error(err);
        $('btn-camera').disabled = false;
        alert('カメラを開けませんでした。ブラウザの設定で、このサイトのカメラを「許可」にしてください。');
      });
    });

    $('btn-back').addEventListener('click', function () {
      closeCamera();
      $('btn-camera').disabled = false;
      setScreen('start');
    });

    $('btn-rec').addEventListener('click', function () {
      $('btn-rec').disabled = true;
      startRecording().then(function () {
        setScreen('recording');
        startHud();
      }).catch(function (err) {
        console.error(err);
        $('btn-rec').disabled = false;
        if (err && err.message === 'no-encoder') {
          alert('この端末では録画を作れませんでした。スマホのカメラで撮った動画を、動画から棋譜にするページで送ってください。');
        } else {
          alert('録画を始められませんでした。もう一度お試しください。');
        }
      });
    });

    $('btn-stop').addEventListener('click', function () {
      if (!confirm('対局を終えて、棋譜にしますか。録画はここで止まります。')) { return; }
      $('btn-stop').disabled = true;
      stopHud();
      stopRecording().then(function (done) {
        closeCamera();
        if (!done || !done.blob.size) {
          alert('録画が空でした。もう一度お試しください。');
          location.reload();
          return;
        }
        return sendAndOpen(done.blob, done.id, done.startedAt);
      });
    });

    $('btn-resend').addEventListener('click', function () {
      if (pendingSend) { sendAndOpen(pendingSend.blob, pendingSend.id, pendingSend.startedAt); }
    });

    // 画面が隠れたら、戻ったときに画面を点けたままにし直す
    document.addEventListener('visibilitychange', function () {
      if (!rec) { return; }
      if (document.hidden) {
        rec.gaps++;
        rec.flush();   // 隠れる前に手元の分を書いておく
      } else {
        requestWakeLock();
        if (rec.gaps) {
          $('rec-warn').textContent = '画面が消えていたあいだは撮れていません。対局中は、この画面のままにしてください。';
          show('rec-warn', true);
        }
      }
    });

    window.addEventListener('beforeunload', function (e) {
      if (rec) { e.preventDefault(); e.returnValue = ''; }
    });
  }

  // 手元の確かめ用(localhost のときだけ)
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    window.__komadoriWebRecorder = { TAPE: TAPE, AVC_CANDIDATES: AVC_CANDIDATES, tapeSize: tapeSize };
  }

  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); } else { init(); }
})();
