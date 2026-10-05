// api.js — サーバとのやりとり(コマドリ Web)
//
//   ・棋譜: GET /jobs/{jobId}(鍵なし)。RUNNING のあいだに kifReady なら途中の棋譜(仮棋譜)。
//   ・映像のコマ: GET /jobs/{jobId}/frames(盤の四隅 points と、時刻つきの写真)
//   ・直す: POST /jobs/{jobId}/correct { pin: { t, from, to, kind, promote } }
//   ・盤をさがす: 写真認識 API(β版の写真ページ site-beta.js と同じ送り方・同じ鍵)
import { API_BASE } from './recorder.js';

export async function getJob(jobId) {
  const res = await fetch(API_BASE + '/jobs/' + encodeURIComponent(jobId), { cache: 'no-store' });
  if (res.status === 404) return { status: 'STARTING' };
  if (!res.ok) throw new Error('状態を確かめられませんでした (HTTP ' + res.status + ')');
  return res.json();
}

export async function getFrames(jobId) {
  try {
    const res = await fetch(API_BASE + '/jobs/' + encodeURIComponent(jobId) + '/frames', { cache: 'no-store' });
    return res.ok ? res.json() : null;
  } catch (e) { return null; }
}

export async function correct(jobId, pin) {
  const res = await fetch(API_BASE + '/jobs/' + encodeURIComponent(jobId) + '/correct', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pin }),
  });
  const body = await res.json().catch(() => ({}));
  if (res.status === 422) { const e = new Error('pin_not_applied'); e.code = 422; throw e; }
  if (!res.ok) throw new Error('直せませんでした (HTTP ' + res.status + ')');
  return body;
}

const RECOGNIZE_URL = 'https://scv8fb0ca0.execute-api.ap-northeast-1.amazonaws.com/alpha/recognize';
// Web 版だけの鍵(写真ページとは別の上限)。デプロイ時に注入(deploy-s3.yml)
const RECOGNIZE_KEY = '__WEB_KOMADORI_API_KEY__';

// 1枚の写真から盤の四隅と局面を読む。返り値 { points, ban_result, sente_mochi, gote_mochi }
export async function recognizeStill(blob, attempt = 0) {
  const fd = new FormData();
  fd.append('upfile', blob, 'still.jpg');
  fd.append('hidden_rotate', '0');
  fd.append('hidden_sengo', 'true');
  fd.append('mode', 'all');
  fd.append('model', 'v3');
  fd.append('decoder', '1');
  fd.append('waku', 'v2');
  fd.append('mochi_crop', 'v2');
  fd.append('mochi_ocr', '1');
  fd.append('mochi_postproc', '0');
  fd.append('joint', '0');
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 32000);
  try {
    const res = await fetch(RECOGNIZE_URL, { method: 'POST', headers: { 'x-api-key': RECOGNIZE_KEY }, body: fd, cache: 'no-store', signal: ctl.signal });
    clearTimeout(timer);
    // 429 は混み合い(使用量の上限)。やり直さずにそのまま伝える
    if (res.status === 429) { const e = new Error('busy'); e.busy = true; throw e; }
    if (res.status === 503 && attempt === 0) return recognizeStill(blob, 1);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  } catch (err) {
    clearTimeout(timer);
    if (attempt === 0 && !err.busy) return recognizeStill(blob, 1);
    throw err;
  }
}

// ---- 前の棋譜(このブラウザだけに残す一覧) ----
const SHELF_KEY = 'komadoriWebShelf';
export function loadShelf() { try { return JSON.parse(localStorage.getItem(SHELF_KEY) || '[]'); } catch (e) { return []; } }
export function saveShelfItem(item) {
  const list = loadShelf().filter((x) => x.jobId !== item.jobId);
  list.unshift({ ...item, updatedAt: Date.now() });
  try { localStorage.setItem(SHELF_KEY, JSON.stringify(list.slice(0, 50))); } catch (e) { /* noop */ }
}
export function updateShelfItem(jobId, patch) {
  const list = loadShelf();
  const i = list.findIndex((x) => x.jobId === jobId);
  if (i < 0) return;
  list[i] = { ...list[i], ...patch, updatedAt: Date.now() };
  try { localStorage.setItem(SHELF_KEY, JSON.stringify(list)); } catch (e) { /* noop */ }
}
export function removeShelfItem(jobId) {
  try { localStorage.setItem(SHELF_KEY, JSON.stringify(loadShelf().filter((x) => x.jobId !== jobId))); } catch (e) { /* noop */ }
}
