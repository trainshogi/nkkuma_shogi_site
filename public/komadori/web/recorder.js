// recorder.js — ブラウザで対局を録って送る(コマドリ Web)
//
// ■ 録画の作り(アプリ komadori-android live/LiveTapeWriter.kt・LiveTapeTuning と同じ値)
//   4 コマ/秒、長辺 720(拡大しない)、300kbps、キーフレーム 1 秒ごと、音なし。
//   カメラの映像を 250ms ごとに canvas へ写し、WebCodecs の H.264 エンコーダに渡す。
//   時刻は「何枚目 × 250ms」。サーバの EventExtract は 時刻 = 番号 / fps で読むので間隔をそろえる。
//   mp4 は fragmented(mp4-muxer)。途中で落ちても、書き終えた断片までは読める。
//   本番 /uploads で、アプリの見本テープを包み直したものが元と同じ手順で読めることを確かめた(2026-09-30)。
//
// ■ 先手が下になるよう画素を回して焼く(アプリの竹と同じ)。答えがあればサーバへ 'sente_near'。
//
// ■ 端末に残す(OPFS): 断片を 30 秒ぶんためて 1 ファイルずつ書いて閉じる。
//   タブが落ちても次に開いたとき「送っていない録画」として送れる。OPFS が無ければメモリ。
export const API_BASE = 'https://p02rzz43dl.execute-api.ap-northeast-1.amazonaws.com';
export const TAPE = { fps: 4, longSide: 720, bitrate: 300000, keyEverySec: 1 };
const FLUSH_SEC = 30;
const MAX_ENCODE_QUEUE = 8;
const REC_KEY = 'komadoriWebRec';
const OPFS_DIR = 'komadori-web-rec';
const AVC = ['avc1.42001f', 'avc1.4d001f', 'avc1.640028'];

export function supportCheck() {
  if (!window.isSecureContext || !(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) return 'camera';
  if (typeof window.VideoEncoder !== 'function' || typeof window.VideoFrame !== 'function' || !window.Mp4Muxer) return 'encoder';
  return null;
}
const hasOpfs = () => !!(navigator.storage && navigator.storage.getDirectory);

export function loadRec() { try { return JSON.parse(localStorage.getItem(REC_KEY) || 'null'); } catch (e) { return null; } }
function saveRec(r) { try { localStorage.setItem(REC_KEY, JSON.stringify(r)); } catch (e) { /* 残せなくても録画は続ける */ } }
export function clearRec() { try { localStorage.removeItem(REC_KEY); } catch (e) { /* noop */ } }

function encoderConfig(codec, w, h) {
  return { codec, width: w, height: h, bitrate: TAPE.bitrate, framerate: TAPE.fps, latencyMode: 'quality', avc: { format: 'avc' } };
}
async function pickCodec(w, h) {
  for (const c of AVC) {
    const cfg = encoderConfig(c, w, h);
    try { const r = await window.VideoEncoder.isConfigSupported(cfg); if (r && r.supported) return cfg; } catch (e) { /* 次へ */ }
  }
  return null;
}
function tapeSize(vw, vh, rot) {
  const s = Math.min(1, TAPE.longSide / Math.max(vw, vh));
  const even = (x) => Math.max(2, Math.round(x * s / 2) * 2);
  const w = even(vw); const h = even(vh);
  return rot % 180 === 0 ? { w, h } : { w: h, h: w };
}

// ---- 置き場 ----
class Store {
  constructor(id) { this.id = id; this.memory = []; this.dir = null; this.parts = 0; this.bytes = 0; }
  async open() {
    if (!hasOpfs()) return this;
    try {
      const root = await navigator.storage.getDirectory();
      const d = await root.getDirectoryHandle(OPFS_DIR, { create: true });
      this.dir = await d.getDirectoryHandle(this.id, { create: true });
      if (navigator.storage.persist) navigator.storage.persist().catch(() => {});
    } catch (e) { this.dir = null; }
    return this;
  }
  async write(chunks) {
    const blob = new Blob(chunks, { type: 'video/mp4' });
    if (!blob.size) return;
    this.bytes += blob.size;
    if (!this.dir) { this.memory.push(blob); this.parts++; return; }
    const name = 'part-' + String(this.parts + 1).padStart(5, '0') + '.bin';
    try {
      const fh = await this.dir.getFileHandle(name, { create: true });
      const w = await fh.createWritable();
      await w.write(blob); await w.close();
      this.parts++;
    } catch (err) {
      console.warn('opfs write failed', err);
      this.dir = null; this.memory.push(blob); this.parts++;
    }
  }
  async toBlob() {
    if (!this.dir) return new Blob(this.memory, { type: 'video/mp4' });
    const files = await listParts(this.dir);
    return new Blob(files.concat(this.memory), { type: 'video/mp4' });
  }
}
async function listParts(dir) {
  const names = [];
  for await (const n of dir.keys()) if (/^part-\d+\.bin$/.test(n)) names.push(n);
  names.sort();
  return Promise.all(names.map(async (n) => (await dir.getFileHandle(n)).getFile()));
}
export async function openSavedBlob(id) {
  if (!hasOpfs()) return null;
  try {
    const root = await navigator.storage.getDirectory();
    const d = await (await root.getDirectoryHandle(OPFS_DIR)).getDirectoryHandle(id);
    const files = await listParts(d);
    return files.length ? new Blob(files, { type: 'video/mp4' }) : null;
  } catch (e) { return null; }
}
export async function removeSaved(id) {
  if (!hasOpfs() || !id) return;
  try { const root = await navigator.storage.getDirectory(); await (await root.getDirectoryHandle(OPFS_DIR)).removeEntry(id, { recursive: true }); } catch (e) { /* noop */ }
}

// ---- カメラ ----
let stream = null;
export async function openCamera(video) {
  stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false,
  });
  video.srcObject = stream;
  await video.play().catch(() => {});
  if (!video.videoWidth) await new Promise((r) => video.addEventListener('loadedmetadata', r, { once: true }));
  return stream;
}
export function closeCamera() { if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; } }
export function cameraOpen() { return !!stream; }

// 今の1枚(盤をさがす・確かめる用)。長辺 1280 の JPEG
export function grabStill(video, longSide = 1280) {
  const s = Math.min(1, longSide / Math.max(video.videoWidth, video.videoHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(video.videoWidth * s); c.height = Math.round(video.videoHeight * s);
  c.getContext('2d').drawImage(video, 0, 0, c.width, c.height);
  return new Promise((res) => c.toBlob((b) => res({ blob: b, width: c.width, height: c.height }), 'image/jpeg', 0.9));
}

// ---- 録画 ----
let wakeLock = null;
export function requestWakeLock() {
  if (!('wakeLock' in navigator)) return;
  navigator.wakeLock.request('screen').then((l) => { wakeLock = l; }).catch(() => {});
}
function releaseWakeLock() { if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; } }

let rec = null;
export function recording() { return rec; }

// rotation: 先手を下にするための時計回りの角度(0 / 90 / 180 / 270)。meta は目録に残す(手合割・名前など)
export async function startRecording(video, rotation, meta) {
  const rot = ((rotation % 360) + 360) % 360;
  const size = tapeSize(video.videoWidth, video.videoHeight, rot);
  const cfg = await pickCodec(size.w, size.h);
  if (!cfg) throw new Error('no-encoder');
  const id = 'rec-' + Date.now();
  const store = await new Store(id).open();
  let pending = []; let pendingBytes = 0; let lastFlush = Date.now(); let flushing = Promise.resolve();
  const snapshot = () => ({ id, startedAt: r.startedAt, frames: r.frames, bytes: store.bytes, opfs: !!store.dir, sent: false, meta });
  const flush = () => {
    if (!pending.length) return flushing;
    const chunks = pending; pending = []; pendingBytes = 0; lastFlush = Date.now();
    flushing = flushing.then(() => store.write(chunks)).then(() => saveRec(snapshot()));
    return flushing;
  };
  const muxer = new window.Mp4Muxer.Muxer({
    target: new window.Mp4Muxer.StreamTarget({
      onData(data, position) { // fragmented は後ろへ足すだけなので position は使わない(mp4-muxer は 2 引数の関数を求める)
        void position;
        // 断片(moof)の頭で区切る。書いて閉じたファイルは断片の切れ目で終わる
        const isMoof = data.byteLength >= 8 && data[4] === 0x6d && data[5] === 0x6f && data[6] === 0x6f && data[7] === 0x66;
        if (isMoof && Date.now() - lastFlush >= FLUSH_SEC * 1000) flush();
        pending.push(data.slice()); pendingBytes += data.byteLength;
      },
    }),
    video: { codec: 'avc', width: size.w, height: size.h, frameRate: TAPE.fps },
    fastStart: 'fragmented',
    minFragmentDuration: 2,
  });
  let failed = null;
  const encoder = new window.VideoEncoder({
    output: (chunk, m) => muxer.addVideoChunk(chunk, m),
    error: (e) => { failed = e; console.error('encoder error', e); },
  });
  encoder.configure(cfg);
  const canvas = document.createElement('canvas');
  canvas.width = size.w; canvas.height = size.h;
  const ctx = canvas.getContext('2d', { alpha: false });
  const step = 1e6 / TAPE.fps;
  const keyEvery = Math.max(1, Math.round(TAPE.keyEverySec * TAPE.fps));
  const r = rec = {
    id, startedAt: Date.now(), frames: 0, dropped: 0, gaps: 0, store, encoder, muxer, flush, meta, rotation: rot,
    failed: () => failed, bytes: () => store.bytes + pendingBytes, timer: null,
  };
  saveRec(snapshot());
  const tick = () => {
    if (failed || !stream) return;
    if (document.hidden || video.readyState < 2 || !video.videoWidth) return;
    if (encoder.encodeQueueSize > MAX_ENCODE_QUEUE) { r.dropped++; return; }
    const vw = video.videoWidth; const vh = video.videoHeight;
    // 回したあとの縦横で収める(向きが途中で変わっても縦横比は保つ)
    const rw = rot % 180 === 0 ? vw : vh; const rh = rot % 180 === 0 ? vh : vw;
    const s = Math.min(size.w / rw, size.h / rh);
    ctx.save();
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, size.w, size.h);
    ctx.translate(size.w / 2, size.h / 2);
    ctx.rotate(rot * Math.PI / 180);
    ctx.drawImage(video, -vw * s / 2, -vh * s / 2, vw * s, vh * s);
    ctx.restore();
    const frame = new window.VideoFrame(canvas, { timestamp: r.frames * step, duration: step });
    encoder.encode(frame, { keyFrame: r.frames % keyEvery === 0 });
    frame.close();
    r.frames++;
  };
  r.timer = setInterval(tick, 1000 / TAPE.fps);
  requestWakeLock();
  return r;
}

export async function stopRecording() {
  const r = rec;
  if (!r) return null;
  clearInterval(r.timer);
  releaseWakeLock();
  await r.encoder.flush().catch(() => {});
  try { r.encoder.close(); } catch (e) { /* noop */ }
  try { r.muxer.finalize(); } catch (e) { console.warn('finalize', e); }
  await r.flush();
  saveRec({ id: r.id, startedAt: r.startedAt, frames: r.frames, bytes: r.store.bytes, opfs: !!r.store.dir, sent: false, meta: r.meta, stoppedAt: Date.now() });
  const blob = await r.store.toBlob();
  rec = null;
  return { id: r.id, blob, frames: r.frames, startedAt: r.startedAt, meta: r.meta };
}

// 画面が隠れたら、手元の分を書いておく。戻ったら画面を点けたままにし直す
document.addEventListener('visibilitychange', () => {
  if (!rec) return;
  if (document.hidden) { rec.gaps++; rec.flush(); } else { requestWakeLock(); }
});

// ---- 送る(video.html と同じ /uploads) ----
async function withRetry(fn, times) {
  for (let i = 0; ; i++) {
    try { return await fn(); } catch (err) {
      if (i >= times - 1) throw err;
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}
function putWithProgress(url, body, onProgress) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('PUT', url);
    x.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded); };
    x.onload = () => {
      if (x.status < 200 || x.status >= 300) return reject(new Error('送れませんでした (HTTP ' + x.status + ')'));
      const etag = x.getResponseHeader('ETag');
      if (!etag) return reject(new Error('送れたかどうかを確かめられませんでした'));
      resolve(etag);
    };
    x.onerror = () => reject(new Error('電波が届かず、送れませんでした'));
    x.send(body);
  });
}
// meta: { handicap, orientation }。onProgress(0..1)
export async function upload(blob, name, meta, onProgress) {
  const body = { fileName: name, contentType: 'video/mp4', fileSizeBytes: blob.size };
  if (meta && meta.handicap && meta.handicap !== '平手') body.handicap = meta.handicap;
  if (meta && meta.orientation) body.orientation = meta.orientation;
  const up = await withRetry(async () => {
    const res = await fetch(API_BASE + '/uploads', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error('送る準備ができませんでした (HTTP ' + res.status + ')');
    return res.json();
  }, 3);
  const partSize = up.partSizeBytes;
  const etags = [];
  let done = 0;
  for (let i = 0; i < up.parts.length; i++) {
    const part = up.parts[i];
    const piece = blob.slice(i * partSize, Math.min((i + 1) * partSize, blob.size));
    const etag = await withRetry(() => putWithProgress(part.url, piece, (n) => onProgress((done + n) / blob.size)), 3);
    done += piece.size;
    etags.push({ partNumber: part.partNumber, etag });
    onProgress(done / blob.size);
  }
  await withRetry(async () => {
    const res = await fetch(API_BASE + '/uploads/complete', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jobId: up.jobId, uploadId: up.uploadId, parts: etags }),
    });
    if (!res.ok) throw new Error('送り終えられませんでした (HTTP ' + res.status + ')');
  }, 3);
  return up.jobId;
}

export function recordingFileName(startedAt) {
  const d = new Date(startedAt || Date.now());
  const p = (n) => String(n).padStart(2, '0');
  return 'komadori-web-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + '.mp4';
}
