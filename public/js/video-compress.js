// video-compress.js — アップロード前のブラウザ内動画圧縮
//
// 目的: 大きな対局動画(数百MB〜GB)を 720p 相当 / H.264 / 音声なし に変換してから
// アップロードする。サーバ側の主コスト(HEVCデコード)と2GB上限とアップロード時間を
// まとめて軽くする。認識精度に関わるので、向き(回転)は必ず正立に直し、長辺を1280へ
// 収めるだけでフレームレートは維持する。
//
// 依存(いずれもリポジトリに同梱・CDN直リンクなし):
//   - MP4Box (js/vendor/mp4box.all.min.js)   … 入力の分離(デコード用サンプル抽出)
//   - Mp4Muxer (js/vendor/mp4-muxer.min.js)   … 出力mp4のボックス化
//   - WebCodecs (VideoDecoder / VideoEncoder / VideoFrame) … ブラウザ標準
//
// どれか一つでも欠ける / コーデック非対応 / 途中エラーのときは compress() が reject し、
// 呼び出し側は現行の「元ファイルを直接アップロード」へフォールバックする。
(function () {
  'use strict';

  var DEFAULTS = {
    longEdge: 1280,          // 長辺をここに収める(縦横どちらでも)。超えなければ等倍
    // ビットレートは目標画素数×fpsから概算(将棋盤の細部を潰しすぎない係数)。
    bitsPerPixelPerFrame: 0.14,
    minBitrate: 2000000,     // 2 Mbps
    maxBitrate: 8000000,     // 8 Mbps
    keyframeIntervalSec: 2
  };

  function hasWebCodecs() {
    return typeof window.VideoEncoder === 'function' &&
           typeof window.VideoDecoder === 'function' &&
           typeof window.VideoFrame === 'function' &&
           typeof window.EncodedVideoChunk === 'function';
  }
  function hasLibs() {
    return typeof window.MP4Box !== 'undefined' &&
           typeof window.Mp4Muxer !== 'undefined' &&
           getDataStream() != null;
  }
  function getDataStream() {
    // mp4box.all は DataStream をグローバルに出す。念のため両方を見る。
    return window.DataStream || (window.MP4Box && window.MP4Box.DataStream) || null;
  }
  function isSupported() { return hasWebCodecs() && hasLibs(); }

  function even(n) { n = Math.round(n); return n % 2 === 0 ? n : n - 1; }
  function tick() { return new Promise(function (r) { setTimeout(r, 0); }); }

  // tkhd の変換行列から表示回転角(0/90/180/270)を求める。
  function rotationFromMatrix(m) {
    if (!m || m.length < 9) { return 0; }
    // m[0]=a, m[1]=b (16.16固定小数だが、角度はatan2の比なので係数は不問)
    var deg = Math.round(Math.atan2(m[1], m[0]) * 180 / Math.PI);
    deg = ((deg % 360) + 360) % 360;
    // 直角に丸める
    return Math.round(deg / 90) % 4 * 90;
  }

  // stsd の avcC/hvcC 等から VideoDecoder 用 description(ボックスヘッダ8byte除去)を作る。
  function descriptionFromTrak(trak) {
    var DS = getDataStream();
    var entries = trak.mdia.minf.stbl.stsd.entries;
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      var box = e.avcC || e.hvcC || e.hev1 || e.vpcC || e.av1C;
      if (box) {
        var s = new DS(undefined, 0, DS.BIG_ENDIAN);
        box.write(s);
        return new Uint8Array(s.buffer, 8); // size(4)+type(4) を除いた中身
      }
    }
    return null; // description無しでもデコードできるコーデックもある
  }

  // 入力ファイルを分割してMP4Boxへ流し込み、映像トラックのサンプルを集める。
  function demux(file) {
    return new Promise(function (resolve, reject) {
      var mp4 = window.MP4Box.createFile();
      var track = null;
      var samples = [];
      var done = false;
      var appended = false;

      function finish() {
        if (done) { return; }
        done = true;
        if (!track) { reject(new Error('映像トラックが見つかりません')); return; }
        resolve({ mp4: mp4, track: track, samples: samples });
      }

      mp4.onError = function (e) { if (!done) { done = true; reject(new Error('分離に失敗: ' + e)); } };
      mp4.onReady = function (info) {
        track = (info.videoTracks && info.videoTracks[0]) || null;
        if (!track) { mp4.onError('no video track'); return; }
        mp4.setExtractionOptions(track.id, null, { nbSamples: 500 });
        mp4.start();
      };
      mp4.onSamples = function (id, user, list) {
        for (var i = 0; i < list.length; i++) {
          var s = list[i];
          samples.push({
            data: s.data, cts: s.cts, dur: s.duration,
            isSync: !!s.is_sync, timescale: s.timescale
          });
        }
        mp4.releaseUsedSamples(id, list[list.length - 1].number);
        if (appended && track && samples.length >= track.nb_samples) { finish(); }
      };

      var CHUNK = 16 * 1024 * 1024;
      var offset = 0;
      function pump() {
        if (offset >= file.size) {
          appended = true;
          mp4.flush();
          // moovが末尾でも、ここまでで全サンプルが出ているはず。取りこぼしの保険。
          setTimeout(finish, 0);
          return;
        }
        var start = offset;
        var end = Math.min(offset + CHUNK, file.size);
        offset = end;
        file.slice(start, end).arrayBuffer().then(function (buf) {
          buf.fileStart = start;               // 実際のスライス先頭オフセット
          mp4.appendBuffer(buf);
          pump();
        }).catch(reject);
      }
      pump();
    });
  }

  function pickEncoderCodec(width, height, fps, bitrate) {
    // High → Main → Baseline の順に、この解像度で使える avc プロファイルを探す。
    var candidates = ['avc1.640028', 'avc1.4d0028', 'avc1.42e028'];
    var base = { width: width, height: height, framerate: fps, bitrate: bitrate,
                 avc: { format: 'avc' } };
    return (function next(i) {
      if (i >= candidates.length) { return Promise.resolve(null); }
      var cfg = Object.assign({ codec: candidates[i] }, base);
      return window.VideoEncoder.isConfigSupported(cfg).then(function (r) {
        return (r && r.supported) ? cfg : next(i + 1);
      }).catch(function () { return next(i + 1); });
    })(0);
  }

  // 本体。成功で mp4 Blob を resolve、非対応/失敗で reject(=呼び出し側でフォールバック)。
  function compress(file, onProgress, opts) {
    var o = Object.assign({}, DEFAULTS, opts || {});
    if (!isSupported()) { return Promise.reject(new Error('WebCodecs/依存ライブラリ非対応')); }
    onProgress = onProgress || function () {};

    var decoder = null, encoder = null, muxer = null;
    var canvas = null, ctx = null;
    var closed = false;

    function cleanup() {
      if (closed) { return; }
      closed = true;
      try { if (decoder && decoder.state !== 'closed') { decoder.close(); } } catch (e) {}
      try { if (encoder && encoder.state !== 'closed') { encoder.close(); } } catch (e) {}
    }

    return demux(file).then(function (dm) {
      var track = dm.track;
      var trak = dm.mp4.getTrackById(track.id);
      var rot = rotationFromMatrix(trak && trak.tkhd && trak.tkhd.matrix);

      // fps はサンプル数と尺から。尺不明時は30にフォールバック。
      var durSec = track.duration && track.timescale ? track.duration / track.timescale : 0;
      var fps = durSec > 0 ? Math.max(1, Math.round(track.nb_samples / durSec)) : 30;

      // コーデック情報(コーデック描画に必要な coded 寸法は最初のフレームで確定する)
      var decCfg = {
        codec: track.codec,
        codedWidth: track.video ? track.video.width : track.track_width,
        codedHeight: track.video ? track.video.height : track.track_height
      };
      var desc = descriptionFromTrak(trak);
      if (desc) { decCfg.description = desc; }

      return window.VideoDecoder.isConfigSupported(decCfg).then(function (sup) {
        if (!sup || !sup.supported) {
          throw new Error('この動画のコーデックはブラウザで変換できません: ' + track.codec);
        }
        return { dm: dm, track: track, rot: rot, fps: fps, decCfg: decCfg, o: o, onProgress: onProgress };
      });
    }).then(function (c) {
      return runTranscode(c, function setHandles(d, e, m, cv, cx) {
        decoder = d; encoder = e; muxer = m; canvas = cv; ctx = cx;
      });
    }).then(function (blob) {
      cleanup();
      return blob;
    }).catch(function (err) {
      cleanup();
      throw err;
    });
  }

  function runTranscode(c, setHandles) {
    return new Promise(function (resolve, reject) {
      var track = c.track, rot = c.rot, fps = c.fps, o = c.o, onProgress = c.onProgress;
      var total = track.nb_samples || c.dm.samples.length;
      var samples = c.dm.samples;

      var target = null;         // {w,h} 初回フレームで確定
      var canvas = null, ctx = null;
      var muxer = null, encoder = null;
      var encInput = 0, encoded = 0, keyEvery = Math.max(1, Math.round(fps * o.keyframeIntervalSec));
      var decodeError = null;

      var decoder = new window.VideoDecoder({
        output: function (frame) {
          try {
            if (!target) { setupEncoder(frame); }
            drawUpright(frame);
            var vf = new window.VideoFrame(canvas, {
              timestamp: frame.timestamp,
              duration: frame.duration || Math.round(1e6 / fps)
            });
            encoder.encode(vf, { keyFrame: (encInput % keyEvery === 0) });
            encInput++;
            vf.close();
          } catch (e) {
            decodeError = e;
          } finally {
            frame.close();
          }
        },
        error: function (e) { decodeError = e; }
      });
      decoder.configure(c.decCfg);

      function setupEncoder(frame) {
        var fw = frame.displayWidth, fh = frame.displayHeight;
        var uw = (rot % 180 === 0) ? fw : fh;   // 正立時の寸法
        var uh = (rot % 180 === 0) ? fh : fw;
        var scale = Math.min(1, o.longEdge / Math.max(uw, uh)); // 拡大はしない
        var tw = even(uw * scale), th = even(uh * scale);
        tw = Math.max(2, tw); th = Math.max(2, th);
        target = { w: tw, h: th };

        canvas = document.createElement('canvas');
        canvas.width = tw; canvas.height = th;
        ctx = canvas.getContext('2d', { alpha: false });

        var pixels = tw * th;
        var bitrate = Math.round(pixels * fps * o.bitsPerPixelPerFrame);
        bitrate = Math.max(o.minBitrate, Math.min(o.maxBitrate, bitrate));

        muxer = new window.Mp4Muxer.Muxer({
          target: new window.Mp4Muxer.ArrayBufferTarget(),
          video: { codec: 'avc', width: tw, height: th },
          fastStart: 'in-memory',   // moovを先頭へ(サーバ/ストリーミングに優しい)
          firstTimestampBehavior: 'offset'
        });
        encoder = new window.VideoEncoder({
          output: function (chunk, meta) {
            muxer.addVideoChunk(chunk, meta);
            encoded++;
            onProgress(Math.min(99, Math.round(encoded / total * 100)));
          },
          error: function (e) { decodeError = e; }
        });

        // isConfigSupported で選んだcodecを使う(同期にできないのでここで確定)
        // setupEncoder は初回フレーム時=デコード開始後なので、事前選定した cfg を使う。
        encoder.configure(c.encCfg);
        setHandles(decoder, encoder, muxer, canvas, ctx);
      }

      function drawUpright(frame) {
        var fw = frame.displayWidth, fh = frame.displayHeight;
        var s = target.w / ((rot % 180 === 0) ? fw : fh); // 正立幅に対する倍率
        ctx.save();
        ctx.translate(target.w / 2, target.h / 2);
        if (rot) { ctx.rotate(rot * Math.PI / 180); }
        ctx.drawImage(frame, -fw * s / 2, -fh * s / 2, fw * s, fh * s);
        ctx.restore();
      }

      // エンコーダ codec を先に確定してから駆動する
      var tw0, th0;
      // 事前に代表寸法でcodecを選ぶ(実寸は初回フレームで最終決定するが、profile/levelは共通)
      var probeW = c.decCfg.codedWidth || 1280, probeH = c.decCfg.codedHeight || 720;
      var uw0 = (rot % 180 === 0) ? probeW : probeH;
      var uh0 = (rot % 180 === 0) ? probeH : probeW;
      var sc0 = Math.min(1, o.longEdge / Math.max(uw0, uh0));
      tw0 = even(uw0 * sc0); th0 = even(uh0 * sc0);
      var pix0 = Math.max(2, tw0) * Math.max(2, th0);
      var br0 = Math.max(o.minBitrate, Math.min(o.maxBitrate, Math.round(pix0 * fps * o.bitsPerPixelPerFrame)));

      pickEncoderCodec(Math.max(2, tw0), Math.max(2, th0), fps, br0).then(function (cfg) {
        if (!cfg) { throw new Error('H.264エンコーダを構成できません'); }
        c.encCfg = cfg;
        return drive();
      }).then(function () {
        resolve(new Blob([muxer.target.buffer], { type: 'video/mp4' }));
      }).catch(reject);

      function drive() {
        var i = 0;
        function step() {
          if (decodeError) { return Promise.reject(decodeError); }
          if (i >= samples.length) {
            return decoder.flush()
              .then(function () { if (decodeError) { throw decodeError; } return encoder.flush(); })
              .then(function () { muxer.finalize(); });
          }
          var s = samples[i++];
          decoder.decode(new window.EncodedVideoChunk({
            type: s.isSync ? 'key' : 'delta',
            timestamp: Math.round(s.cts * 1e6 / s.timescale),
            duration: Math.round(s.dur * 1e6 / s.timescale),
            data: s.data
          }));
          s.data = null; // 使い終わったサンプルは解放
          // デコードキューが溜まりすぎないよう間引く(進捗UIにも制御を返す)
          if (decoder.decodeQueueSize > 24 || (i % 60 === 0)) {
            return tick().then(step);
          }
          return step();
        }
        return step();
      }
    });
  }

  window.VideoCompress = { isSupported: isSupported, compress: compress, DEFAULTS: DEFAULTS };
})();
