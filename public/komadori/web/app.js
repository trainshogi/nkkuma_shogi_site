// app.js — コマドリ Web(Android Chrome)の画面。設計: web-android/設計-2026-09-30.md
//
// 準備 → 置く(固定→枠→向き) → 3,2,1 → 記録中 → 対局おわり → 送る → 読んでいる → 結果
//   結果 → 確かめる / 盤で直す / 映像で確かめる / 渡す / X・Facebook
// 状態は st に持ち、DOM から読まない(向きが変わっても今の手・段を保って組み直す)。
import * as R from './recorder.js';
import * as A from './api.js';
import {
  HANDICAP_SFENS, HANDICAP_MAIN, HANDICAP_OTHER, PROMOTE, BASE, KANJI,
  parseSfen, fromServerPos, toSfen, positionsOf, moveToUsi, usiToMove, applyMove, moveLabel,
  senteRate, evalSummary, decorateKif,
} from './shogi.js';
import { Board, renderHand, pieceSrc } from './board.js';
import * as M from './moves.js';
import * as H from './handoff.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sq = (a) => String(a[0]) + String(a[1]);
const HIRATE = '平手';
const isHc = () => st.meta.handicap !== HIRATE;
const sideName = (side, hc) => (side === 'sente' ? (hc ? '下手' : '先手') : (hc ? '上手' : '後手'));
const track = (name, params) => { try { window.gtag && window.gtag('event', name, params || {}); } catch (e) { /* noop */ } };

const ICON = {
  send: '<path d="M4 12h12M12 6l6 6-6 6"/><path d="M20 4v16"/>',
  play: '<path d="M7 5l12 7-12 7z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/>',
  x: '<path d="M5 4l14 16M19 4L5 20"/>',
  fb: '<path d="M14 21v-8h3l.5-3.5H14V7.5c0-1 .4-1.7 1.8-1.7H18V2.6C17.5 2.5 16.3 2.4 15 2.4c-2.8 0-4.5 1.6-4.5 4.6v2.5H7.5V13h3v8"/>',
  more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  cam: '<path d="M4 8h3l2-2h6l2 2h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  clock: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
  check: '<path d="M5 12l4 4 10-10"/>',
};
const icon = (k) => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${ICON[k]}</svg>`;

// ---------------------------------------------------------------- 状態
const st = {
  screen: 'prep',
  meta: { handicap: HIRATE, sente: '', gote: '', terminal: null, orientation: null, startedAt: null },
  hcOther: false,
  place: null,            // { step, still, recog, guess, rotation, chosen, err }
  job: null,              // { id, status, final, plies, start, positions, evals, kif, review, frames }
  cur: 0,
  mode: 'wait',           // wait | interim | result | check | pick | fix | video | failed
  check: null,            // { list, i }
  fix: null,              // { ply, sel, hand, dests, promo, busy, err, from }
  video: null,            // { ply, idx }
  note: null,             // 結果の見出しの下に出す 1 行
  flash: new Set(), fixed: new Set(),
  play: null,
  lay: 'phone', short: false,
  sendErr: null,
};

// ---------------------------------------------------------------- 大きさ
function measure() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const land = w > h;
  let lay = 'phone';
  if (land && (w >= 900 || h < 480)) lay = 'tl';
  else if (w >= 600) lay = land ? 'tl' : 'tp';
  st.lay = lay; st.short = lay === 'phone' && h < 560;
  st.low = lay === 'tl' && h < 480; // スマホを横にしたとき
  const app = $('app');
  app.className = lay + (st.short ? ' short' : '') + (st.low ? ' low' : '');
  document.documentElement.style.setProperty('--vh', h + 'px');
}

// 棋譜の画面の盤の大きさ。はみ出したら盤を先に縮めず、形勢 → シェア → 枠ボタンの順に詰める(設計 §5-1)
function fitKv() {
  const el = $('kv');
  if (!el.classList.contains('on')) return;
  const w = window.innerWidth; const h = window.innerHeight;
  const g = st.lay === 'phone' ? 8 : 16;
  let maxS; let minS; let prefer;
  if (st.lay === 'phone') { maxS = w - 2 * g - 14; minS = Math.min(272, maxS); prefer = 300; }
  else if (st.lay === 'tp') { maxS = w - 2 * g - 14 - 224 - 16; minS = 300; prefer = 440; }
  else if (st.low) { maxS = w - 2 * g - 20 - 14 - 300; minS = 200; prefer = 240; }
  else { maxS = w - 2 * g - 260 - 40 - 14 - 340; minS = 240; prefer = 400; }
  maxS = Math.floor(Math.min(maxS, h));
  let S = maxS;
  const apply = () => document.documentElement.style.setProperty('--S', S + 'px');
  const over = () => el.scrollHeight - el.clientHeight;
  const shrink = (floor) => {
    for (let i = 0; i < 5 && over() > 0 && S > floor; i++) { S = Math.max(floor, Math.floor(S - over() / 1.15) - 1); apply(); }
  };
  const levels = [[], ['tight1'], ['tight1', 'tight2']];
  for (const lv of levels) {
    el.classList.remove('tight1', 'tight2');
    for (const c of lv) el.classList.add(c);
    S = maxS; apply();
    shrink(minS);
    if (over() <= 0 && S >= Math.min(prefer, maxS)) break;
  }
  if (over() > 0) shrink(220);
  centerStrip();
}

// ---------------------------------------------------------------- 画面の切り替えと戻る
function show(name, push = true) {
  st.screen = name;
  for (const s of document.querySelectorAll('.screen')) s.classList.toggle('on', s.id === name);
  if (push) { try { history.pushState({ s: name }, ''); } catch (e) { /* noop */ } }
}
window.addEventListener('popstate', () => {
  if (st.screen === 'cam' && R.recording()) { openEndSheet(); history.pushState({ s: 'cam' }, ''); return; }
  closeSheet();
  if (st.screen === 'cam') { leaveCamera(); return; }
  if (st.screen === 'handoff') { show('kv', false); renderKv(); return; }
  if (st.screen === 'kv' && ['check', 'pick', 'fix', 'video'].includes(st.mode)) { toResult(); return; }
});

// ---------------------------------------------------------------- S1 準備
function renderPrep() {
  const hc = isHc();
  const unsent = R.loadRec();
  const shelf = A.loadShelf();
  const sup = R.supportCheck();
  const chips = (st.hcOther ? HANDICAP_OTHER : HANDICAP_MAIN)
    .map((n) => `<button class="chip${st.meta.handicap === n ? ' on' : ''}" data-hc="${n}">${n}</button>`).join('');
  $('prep').innerHTML = `
    <div class="prep-head">
      <h1 class="h1">対局の準備</h1>
      ${shelf.length ? '<button class="btn text" id="p-shelf">前の棋譜</button>' : ''}
      <a href="/komadori/placement.html" target="_blank" rel="noopener">置き方</a>
    </div>
    <div class="prep-body">
      ${sup ? `<div class="resume-box"><span>${sup === 'camera' ? 'カメラを使えません。Android の Chrome で開いてください。' : 'このブラウザでは録画できません。Android の Chrome を新しくしてから開いてください。'}</span></div>` : ''}
      ${unsent && !unsent.sent && unsent.frames > 0 ? `<div class="resume-box"><span>送っていない録画があります(${fmtTime(unsent.frames / R.TAPE.fps)})</span><button class="btn" id="p-resume">送る</button></div>` : ''}
      <p class="prep-q">手合割をえらんでください</p>
      <div class="hc-cards">
        <button class="hc-card${hc ? '' : ' on'}" data-card="hirate">平手<small>▲先手から指します</small></button>
        <button class="hc-card${hc ? ' on' : ''}" data-card="koma">駒落ち<small>${hc ? esc(st.meta.handicap) + '・△上手から' : '上手が駒を落とします'}</small></button>
      </div>
      ${hc ? `<div class="hc-chips">${chips}<button class="hc-more" id="p-more">${st.hcOther ? '‹ おもな駒落ち' : 'そのほかの駒落ち ›'}</button></div>` : ''}
      <div class="prep-preview" id="p-preview"></div>
      <div class="prep-names">
        <label class="name-row"><b>▲ ${sideName('sente', hc)}</b><input id="p-sente" maxlength="20" placeholder="名前(なくてもかまいません)" value="${esc(st.meta.sente)}" autocomplete="off"></label>
        <label class="name-row"><b>△ ${sideName('gote', hc)}</b><input id="p-gote" maxlength="20" placeholder="名前(なくてもかまいません)" value="${esc(st.meta.gote)}" autocomplete="off"></label>
      </div>
    </div>
    <div class="prep-foot">
      <p class="note">画面は点いたままになります。1時間でおよそ135MBを送ります。<a href="/komadori/privacy.html" target="_blank" rel="noopener">送った映像の扱い</a></p>
      <button class="btn big wide" id="p-open"${sup ? ' disabled' : ''}>${icon('cam')}カメラを開く</button>
    </div>`;
  for (const b of $('prep').querySelectorAll('[data-card]')) {
    b.onclick = () => {
      if (b.dataset.card === 'hirate') st.meta.handicap = HIRATE;
      else if (!isHc()) st.meta.handicap = '二枚落ち';
      renderPrep();
    };
  }
  for (const b of $('prep').querySelectorAll('[data-hc]')) b.onclick = () => { st.meta.handicap = b.dataset.hc; renderPrep(); };
  if ($('p-more')) $('p-more').onclick = () => { st.hcOther = !st.hcOther; renderPrep(); };
  $('p-sente').oninput = (e) => { st.meta.sente = e.target.value.trim(); };
  $('p-gote').oninput = (e) => { st.meta.gote = e.target.value.trim(); };
  $('p-open').onclick = openCameraFlow;
  if ($('p-resume')) $('p-resume').onclick = resumeUnsent;
  if ($('p-shelf')) $('p-shelf').onclick = openShelfSheet;
  requestAnimationFrame(renderPrepPreview);
}

function renderPrepPreview() {
  const box = $('p-preview');
  if (!box) return;
  box.innerHTML = '';
  const S = Math.floor(Math.min(box.clientWidth, box.clientHeight) - 14 - 4);
  if (S < 120) return;
  const el = document.createElement('div');
  el.style.setProperty('--S', S + 'px');
  box.appendChild(el);
  const b = new Board(el);
  const pos = parseSfen(HANDICAP_SFENS[st.meta.handicap]);
  const full = parseSfen(HANDICAP_SFENS[HIRATE]);
  const marks = {};
  for (const k in full.ban) if (full.ban[k].side === 'gote' && !pos.ban[k]) marks[k] = 'gone';
  b.render(pos, { marks });
}

// ---------------------------------------------------------------- S2 置く
const video = () => $('cam-video');

async function openCameraFlow() {
  try { await document.documentElement.requestFullscreen({ navigationUI: 'hide' }); } catch (e) { /* 失敗しても収まるように組んである */ }
  st.place = { step: 'fix' };
  show('cam');
  renderCam();
  try {
    await R.openCamera(video());
    layoutStage();
  } catch (err) {
    leaveCamera();
    alertBox('カメラを開けませんでした。Chrome のサイトの設定で、カメラを許可してください。');
    return;
  }
  track('komadori_web_camera');
}

function leaveCamera() {
  R.closeCamera();
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  st.place = null;
  show('prep', false);
  renderPrep();
}

// 映像が実際に映っている四角(object-fit: contain)に、枠と札を載せる台を合わせる
function layoutStage() {
  const v = video(); const stage = $('cam-stage');
  const view = v.parentElement;
  const vw = v.videoWidth || 720; const vh = v.videoHeight || 1280;
  const W = view.clientWidth; const Hh = view.clientHeight;
  const s = Math.min(W / vw, Hh / vh);
  const box = { width: vw * s + 'px', height: vh * s + 'px', left: (W - vw * s) / 2 + 'px', top: (Hh - vh * s) / 2 + 'px' };
  Object.assign(stage.style, box);
  // 向きのピルは映像のふちに。3・2・1 と記録中の帯は映像の枠いっぱいに
  const onEdges = st.place && st.place.step === 'dir';
  Object.assign($('cam-layer').style, onEdges ? box : { width: W + 'px', height: Hh + 'px', left: '0px', top: '0px' });
  $('cam-svg').setAttribute('viewBox', `0 0 ${vw} ${vh}`);
  drawCamSvg();
}

function drawCamSvg() {
  const svg = $('cam-svg'); const v = video();
  const vw = v.videoWidth || 720; const vh = v.videoHeight || 1280;
  const P = st.place;
  let html = '';
  if (P && P.step === 'fix') {
    // 四隅の目安の角かっこ
    const m = 0.1; const L = Math.min(vw, vh) * 0.08;
    const x0 = vw * m; const y0 = vh / 2 - vw * (0.5 - m); const x1 = vw * (1 - m); const y1 = vh / 2 + vw * (0.5 - m);
    const c = (x, y, dx, dy) => `<path class="guide" d="M${x + dx * L},${y} L${x},${y} L${x},${y + dy * L}"/>`;
    html += c(x0, y0, 1, 1) + c(x1, y0, -1, 1) + c(x1, y1, -1, -1) + c(x0, y1, 1, -1);
  }
  const pts = P && P.recog && P.recog.pointsVideo;
  if (pts && P.step !== 'fix' && P.step !== 'search') {
    const rec = st.screen === 'cam' && R.recording();
    html += `<polygon class="quad${rec ? ' rec' : ''}" points="${pts.map((p) => p.join(',')).join(' ')}"/>`;
    if (!rec) for (const p of pts) html += `<circle class="quad-dot" cx="${p[0]}" cy="${p[1]}" r="${Math.min(vw, vh) / 90}"/>`;
    if (P.chosen && P.chosen !== 'unknown') {
      const e = edgeOf(pts, P.chosen);
      html += `<line x1="${e[0][0]}" y1="${e[0][1]}" x2="${e[1][0]}" y2="${e[1][1]}" stroke="#E8763C" stroke-width="6" vector-effect="non-scaling-stroke"/>`;
    }
  }
  svg.innerHTML = html;
}
// 四角の辺(TL,TR,BR,BL)
function edgeOf(p, side) {
  return { top: [p[0], p[1]], right: [p[1], p[2]], bottom: [p[2], p[3]], left: [p[3], p[0]] }[side];
}

function stepsHtml(n) {
  const names = ['固定', '枠', '向き'];
  return `<div class="steps">${names.map((t, i) => `<b class="${i + 1 === n ? 'on' : ''}"><em>${i + 1}</em>${t}</b>`).join('<i></i>')}</div>`;
}

function renderCam() {
  const P = st.place || {};
  const cam = $('cam');
  const side = window.innerWidth > window.innerHeight;
  cam.classList.toggle('side', side);
  cam.classList.toggle('rec', P.step === 'rec');
  const band = $('cam-band');
  const layer = $('cam-layer');
  layer.innerHTML = '';
  if (P.step === 'fix') {
    band.innerHTML = `${stepsHtml(1)}
      <p class="band-q">カメラは固定できましたか?</p>
      <p class="band-note">盤の四隅と、両方の駒台が入るようにしてください</p>
      <div class="band-row"><button class="btn" id="c-fixed">固定できました</button><a class="btn line center" href="/komadori/placement.html" target="_blank" rel="noopener">置き方を見る</a></div>`;
    $('c-fixed').onclick = searchBoard;
  } else if (P.step === 'search') {
    band.innerHTML = `${stepsHtml(2)}<p class="band-q"><span class="dots">盤の枠をさがしています</span></p><p class="band-note">カメラを動かさずにお待ちください</p>`;
  } else if (P.step === 'notfound') {
    band.innerHTML = `${stepsHtml(2)}
      <div style="display:flex;gap:10px;align-items:center"><img class="bird" src="img/bird.png" alt="" style="width:44px"><div><p class="band-q">盤が見つかりませんでした</p><p class="band-note">盤の四隅が映っているか、明るさが足りているかをご確認ください</p></div></div>
      <div class="band-row"><button class="btn" id="c-again">もう一度さがす</button><button class="btn line center" id="c-skip">枠なしで進む</button></div>`;
    $('c-again').onclick = searchBoard;
    $('c-skip').onclick = () => { P.step = 'dir'; P.chosen = null; renderCam(); };
  } else if (P.step === 'frame') {
    const r = P.recog;
    const lines = [];
    const hcName = st.meta.handicap;
    if (r.diffs.length === 0) lines.push(['ok', `${hcName}の初期配置です`]);
    else if (r.diffs.length <= 12) lines.push(['ng', `初期配置とちがう升が ${r.diffs.length} か所あります`]);
    else lines.push(['ng', '初期配置と合わない升が多くあります']);
    if (r.guess) lines.push(['ok', `${sideName('sente', isHc())}は${{ bottom: '手前がわ', top: '画面の上がわ', left: '画面の左がわ', right: '画面の右がわ' }[r.guess]}に見えます`]);
    band.innerHTML = `${stepsHtml(2)}
      <div class="band-check"><div id="c-mini"></div>
        <div style="display:grid;gap:6px;align-content:start;min-width:0"><p class="band-q">この枠でいいですか?</p>
        <ul class="checks">${lines.map(([k, t]) => `<li class="${k}">${k === 'ok' ? '✓' : '!'} <span>${t}</span></li>`).join('')}</ul>
        ${r.diffs.length ? '<p class="band-note">駒を並べ直したら、もう一度さがしてください</p>' : ''}</div></div>
      <div class="band-row"><button class="btn" id="c-go">この枠で進む</button><button class="btn line center" id="c-again">もう一度さがす</button></div>`;
    const mini = new Board($('c-mini'));
    const marks = {}; for (const k of r.diffs) marks[k] = 'diff';
    mini.render(r.norm, { marks });
    $('c-go').onclick = () => { P.step = 'dir'; P.chosen = null; renderCam(); };
    $('c-again').onclick = searchBoard;
  } else if (P.step === 'dir') {
    const who = sideName('sente', isHc());
    band.innerHTML = `${stepsHtml(3)}
      <p class="band-q">${who}(${isHc() ? '駒を全部そろえているほう' : 'さいしょに指す人'})は、どちらがわですか?</p>
      <p class="band-note">映像のふちのボタンで答えてください。録画を${who}が手前になる向きにそろえて送ります。</p>
      <button class="btn text" id="c-back" style="align-self:flex-start">‹ 枠にもどる</button>`;
    $('c-back').onclick = () => { P.step = P.recog ? 'frame' : 'fix'; renderCam(); };
    const guess = P.recog && P.recog.guess;
    const pill = (k, t) => `<button class="edge edge-${k}${guess === k ? ' guess' : ''}${P.chosen === k ? ' chosen' : ''}" data-edge="${k}">${t}</button>`;
    layer.innerHTML = (side ? '' : `<div class="cam-card">${who}は、どちらがわですか?</div>`) +
      pill('top', '画面の上(向こう)') + pill('bottom', '画面の下(手前)') + pill('left', '画面の左') + pill('right', '画面の右') +
      pill('unknown', 'どちらか分かりません');
    for (const b of layer.querySelectorAll('[data-edge]')) {
      b.onclick = () => {
        P.chosen = b.dataset.edge;
        renderCam(); drawCamSvg();
        setTimeout(startCount, 600);
      };
    }
    // 上の札と重ならないよう、上のピルは札の下へ
    const top = layer.querySelector('.edge-top'); if (top && !side) top.style.top = '56px';
  } else if (P.step === 'count') {
    band.innerHTML = `<p class="band-q">数え終わったら指しはじめてください</p>`;
    layer.innerHTML = `<div class="count"><button class="btn text" id="c-stop">やめる</button><b id="c-num">${P.n}</b></div>`;
    $('c-stop').onclick = () => { clearTimeout(P.timer); P.step = 'dir'; P.chosen = null; renderCam(); drawCamSvg(); };
  } else if (P.step === 'rec') {
    band.innerHTML = `<button class="btn big wide" id="c-end">対局おわり</button>`;
    layer.innerHTML = `<div class="rec-top"><span class="rec-dot"></span><span>記録しています</span><span class="t" id="c-time">0:00</span><span class="mb" id="c-mb">0MB</span></div><div class="rec-msgs" id="c-msgs"></div>`;
    $('c-end').onclick = openEndSheet;
    renderRecMsgs();
  }
  // 帯の高さが変わると映像の四角も動くので、枠を載せ直す
  if (video().videoWidth) layoutStage(); else drawCamSvg();
}

// 写真 1 枚を写真の認識に送り、盤の四隅と並びを見る
async function searchBoard() {
  const P = st.place;
  P.step = 'search'; P.recog = null; renderCam();
  try {
    const still = await R.grabStill(video(), 1280);
    const res = await A.recognizeStill(still.blob);
    const r = analyzeRecog(res, still, 0);
    if (!r) { P.step = 'notfound'; renderCam(); return; }
    // 横向きに映っていて、盤の並びだけでは先後が決まらないとき(平手など)は、90° 回した写真でもう一度
    if ((r.rot === 90 || r.rot === 270) && r.ambiguous) {
      const turned = await rotateBlob(still.blob, 90);
      const res2 = await A.recognizeStill(turned).catch(() => null);
      const r2 = res2 ? analyzeRecog(res2, null, 90) : null;
      if (r2 && (r2.rot === 90 || r2.rot === 270) && !r2.ambiguous) { r2.pointsVideo = r.pointsVideo; P.recog = r2; } else P.recog = r;
    } else P.recog = r;
    P.step = 'frame';
    track('komadori_web_board_found', { diffs: P.recog.diffs.length });
  } catch (err) {
    console.warn('recognize', err);
    P.step = 'notfound';
  }
  renderCam();
}

function rotateBlob(blob, deg) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      const q = deg % 180 !== 0;
      c.width = q ? img.height : img.width; c.height = q ? img.width : img.height;
      const x = c.getContext('2d');
      x.translate(c.width / 2, c.height / 2); x.rotate(deg * Math.PI / 180); x.drawImage(img, -img.width / 2, -img.height / 2);
      c.toBlob((b) => resolve(b), 'image/jpeg', 0.9);
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(blob);
  });
}

// 写真の盤(上 = 一段目)を、時計回りに rot 回したら先手が下に来る、という見立てごとに初期配置と比べる。
// pre: 写真をすでに何度回して送ったか(2 回目)。返す rot は元の映像に対する角度
function analyzeRecog(res, still, pre) {
  if (!res || !Array.isArray(res.points) || res.points.length !== 4 || !res.ban_result) return null;
  const got = {};
  for (const k in res.ban_result) {
    const v = res.ban_result[k];
    if (!v || v.trim() === '*' || v.trim() === '') continue;
    got[k] = { side: v[0] === 'v' ? 'gote' : 'sente', kind: v.slice(1).trim() };
  }
  const exp = parseSfen(HANDICAP_SFENS[st.meta.handicap]).ban;
  const f = {
    0: (s, d) => [s, d], 90: (s, d) => [d, 10 - s], 180: (s, d) => [10 - s, 10 - d], 270: (s, d) => [10 - d, s],
  };
  const hyps = [0, 90, 180, 270].map((r) => {
    const norm = {};
    for (const k in got) {
      const [s, d] = f[r](Number(k[0]), Number(k[1]));
      const side = r === 180 ? (got[k].side === 'sente' ? 'gote' : 'sente') : got[k].side;
      norm[String(s) + String(d)] = { side, kind: got[k].kind };
    }
    let score = 0; const diffs = [];
    const sideTrusted = r === 0 || r === 180;
    for (let s = 1; s <= 9; s++) for (let d = 1; d <= 9; d++) {
      const k = String(s) + String(d); const e = exp[k]; const g = norm[k];
      if (!e && !g) { score += sideTrusted ? 3 : 1; continue; }
      if (!e || !g) { diffs.push(k); continue; }
      score += 1;
      const kindOk = (BASE[g.kind] || g.kind) === e.kind || (e.kind === 'ou' && g.kind === 'gyoku');
      if (sideTrusted) {
        if (kindOk) score += 1; else diffs.push(k);
        if (g.side === e.side) score += 1;
      }
    }
    // 横向きでは駒の字と向きを信じない(占めているかどうかだけ)。升ごとの満点を 1 にそろえて比べる
    return { r, score: sideTrusted ? score / 3 : score, diffs, norm };
  });
  hyps.sort((a, b) => b.score - a.score);
  const best = hyps[0];
  // 反対向き(180° ちがい)と差がないなら、先後は並びからは決まらない
  const opposite = hyps.find((h) => h.r === (best.r + 180) % 360);
  const ambiguous = !opposite || Math.abs(best.score - opposite.score) < 1.5;
  const rot = (best.r + pre) % 360;
  const pos = { ban: best.norm, hands: { sente: res.sente_mochi || {}, gote: res.gote_mochi || {} }, teban: 'sente' };
  let pointsVideo = null;
  if (still) {
    const v = video(); const kx = (v.videoWidth || still.width) / still.width; const ky = (v.videoHeight || still.height) / still.height;
    pointsVideo = res.points.map((p) => [p[0] * kx, p[1] * ky]);
  }
  const guessOf = { 0: 'bottom', 180: 'top', 90: 'right', 270: 'left' };
  return {
    rot, ambiguous, diffs: best.diffs, norm: pos, pointsVideo,
    guess: ambiguous && (rot === 90 || rot === 270) ? null : guessOf[rot],
  };
}

function startCount() {
  const P = st.place;
  if (!P || P.step !== 'dir') return;
  const ch = P.chosen;
  P.rotation = { bottom: 0, top: 180, right: 90, left: 270, unknown: 0 }[ch];
  st.meta.orientation = ch === 'unknown' ? null : 'sente_near';
  R.requestWakeLock();
  P.step = 'count'; P.n = 3; renderCam();
  const tick = () => {
    P.n--;
    if (P.n <= 0) { beginRecording(); return; }
    const el = $('c-num'); if (el) el.textContent = P.n;
    P.timer = setTimeout(tick, 1000);
  };
  P.timer = setTimeout(tick, 1000);
}

async function beginRecording() {
  const P = st.place;
  try {
    st.meta.startedAt = Date.now();
    await R.startRecording(video(), P.rotation, { ...st.meta });
  } catch (err) {
    console.error(err);
    P.step = 'dir'; renderCam();
    alertBox('録画をはじめられませんでした。Chrome を新しくしてから、もう一度お試しください。');
    return;
  }
  P.step = 'rec'; P.msgs = [{ id: 'hint', text: '対局中は棋譜が出ません。終わってから読みます', ttl: Date.now() + 5000 }];
  if (!('wakeLock' in navigator)) P.msgs.push({ id: 'wake', text: '画面が自動で消えないよう、端末の設定をご確認ください', close: true });
  renderCam();
  track('komadori_web_record_start', { handicap: st.meta.handicap, orientation: st.meta.orientation || 'unknown' });
  clearInterval(P.clock);
  P.clock = setInterval(recTick, 500);
}

let hiddenAt = null;
document.addEventListener('visibilitychange', () => {
  const P = st.place;
  if (!P || P.step !== 'rec') return;
  if (document.hidden) hiddenAt = Date.now();
  else if (hiddenAt) {
    const gap = (Date.now() - hiddenAt) / 1000; hiddenAt = null;
    if (gap >= 2) { P.msgs.push({ id: 'gap' + Date.now(), text: `${fmtTime(gap)} のあいだ撮れていません`, close: true }); renderRecMsgs(); }
  }
});

function recTick() {
  const r = R.recording(); const P = st.place;
  if (!r || !P) return;
  const t = $('c-time'); if (t) t.textContent = fmtTime((Date.now() - r.startedAt) / 1000);
  const mb = $('c-mb'); if (mb) mb.textContent = Math.round(r.bytes() / 1e6) + 'MB';
  const before = P.msgs.length;
  P.msgs = P.msgs.filter((m) => !m.ttl || m.ttl > Date.now());
  if (P.msgs.length !== before) renderRecMsgs();
  if (r.failed()) { P.msgs.push({ id: 'fail', text: '録画が止まりました。「対局おわり」を押して、ここまでを送ってください' }); renderRecMsgs(); clearInterval(P.clock); }
}
function renderRecMsgs() {
  const el = $('c-msgs'); const P = st.place;
  if (!el || !P) return;
  el.innerHTML = P.msgs.map((m) => `<div class="rec-msg"><span>${esc(m.text)}</span>${m.close ? `<button data-close="${m.id}" aria-label="閉じる">×</button>` : ''}</div>`).join('');
  for (const b of el.querySelectorAll('[data-close]')) b.onclick = () => { P.msgs = P.msgs.filter((m) => m.id !== b.dataset.close); renderRecMsgs(); };
}

function openEndSheet() {
  const opts = [['投了', ''], ['中断', ''], ['持将棋', ''], ['千日手', ''], ['', '棋譜だけ残す<small>終局を書きません</small>']];
  openSheet(`<h2>この対局を終わりにしますか</h2>
    ${opts.map(([t, label]) => `<button class="opt" data-term="${t}">${label || t}</button>`).join('')}
    <hr><button class="cancel" data-close>やめる</button>`, (sheet) => {
    for (const b of sheet.querySelectorAll('[data-term]')) b.onclick = () => { closeSheet(); finishRecording(b.dataset.term || null); };
  });
}

async function finishRecording(terminal) {
  const P = st.place;
  clearInterval(P && P.clock);
  st.meta.terminal = terminal;
  const out = await R.stopRecording();
  R.closeCamera();
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  track('komadori_web_record_stop', { sec: out ? Math.round(out.frames / R.TAPE.fps) : 0, terminal: terminal || 'none' });
  if (!out || !out.blob.size) { st.place = null; show('prep'); renderPrep(); alertBox('録画が空でした。もう一度お試しください。'); return; }
  st.place = null;
  sendTape(out.blob, out.id, out.startedAt, { ...st.meta });
}

// ---------------------------------------------------------------- S5 送る
async function sendTape(blob, recId, startedAt, meta) {
  st.meta = { ...st.meta, ...meta };
  show('send');
  const total = blob.size;
  const box = $('send-box');
  let last = Date.now(); let lastN = 0;
  const draw = (n, stalled) => {
    box.innerHTML = `<p class="h1">映像を送っています</p>
      <div class="bar"><i style="width:${Math.round(100 * n / total)}%"></i></div>
      <p class="send-num">${(n / 1e6).toFixed(0)}MB / ${(total / 1e6).toFixed(0)}MB</p>
      <p class="note">${stalled ? '通信が止まっています。電波のよい場所でお待ちください' : '送り終わるまで、このページを開いたままにしてください'}</p>`;
  };
  draw(0, false);
  const stallTimer = setInterval(() => { if (Date.now() - last > 10000) draw(lastN, true); }, 2000);
  try {
    const jobId = await R.upload(blob, R.recordingFileName(startedAt), st.meta, (p) => { lastN = p * total; last = Date.now(); draw(lastN, false); });
    clearInterval(stallTimer);
    await R.removeSaved(recId); R.clearRec();
    A.saveShelfItem({ jobId, meta: st.meta, createdAt: startedAt || Date.now() });
    track('komadori_web_sent', { mb: Math.round(total / 1e6) });
    openJob(jobId, st.meta);
  } catch (err) {
    clearInterval(stallTimer);
    box.innerHTML = `<img class="bird" src="img/bird.png" alt=""><p class="h1">送れませんでした</p><p class="note">${esc(err.message)}。録画はこの端末に残っています。</p>
      <button class="btn wide" id="s-retry" style="max-width:320px">もう一度送る</button>`;
    $('s-retry').onclick = () => sendTape(blob, recId, startedAt, meta);
  }
}

async function resumeUnsent() {
  const saved = R.loadRec();
  if (!saved) return;
  const blob = await R.openSavedBlob(saved.id);
  if (!blob) { R.clearRec(); renderPrep(); alertBox('録画を読み出せませんでした。'); return; }
  sendTape(blob, saved.id, saved.startedAt, saved.meta || {});
}

// ---------------------------------------------------------------- 棋譜の画面(読んでいる・結果)
let board = null;
let pollTimer = null;

function openJob(jobId, meta) {
  st.meta = { ...st.meta, ...(meta || {}) };
  st.job = { id: jobId, status: 'STARTING', final: false, plies: [], start: startOfMeta(), evals: null, kif: '', review: [] };
  st.job.positions = [st.job.start];
  st.cur = 0; st.mode = 'wait'; st.note = null; st.flash = new Set(); st.fixed = new Set();
  show('kv');
  renderKv();
  poll();
}
function startOfMeta() { return parseSfen(HANDICAP_SFENS[st.meta.handicap] || HANDICAP_SFENS[HIRATE]); }

async function poll() {
  clearTimeout(pollTimer);
  const job = st.job;
  if (!job) return;
  let data = null;
  try { data = await A.getJob(job.id); } catch (e) { /* 次で */ }
  if (st.job !== job) return;
  let wait = 4000;
  if (data) {
    job.status = data.status;
    const done = data.status === 'SUCCEEDED';
    if (data.status === 'FAILED' || data.status === 'TIMED_OUT' || data.status === 'ABORTED') {
      if (!data.kifReady) { st.mode = 'failed'; renderKv(); return; }
    }
    if (data.kifReady && data.result) {
      const wasFinal = job.final;
      applyResult(data.result, done || data.status === 'FAILED');
      if (job.final && !wasFinal) { track('komadori_web_kifu', { plies: job.plies.length }); }
      if (job.final && (st.mode === 'wait' || st.mode === 'interim')) st.mode = 'result';
      else if (!job.final) st.mode = 'interim';
    }
    if (done && data.evalsReady) { renderKv(); return; }
    if (job.final) wait = 6000;
  }
  renderKv();
  pollTimer = setTimeout(poll, wait);
}

function applyResult(res, final) {
  const job = st.job;
  const before = job.plies.map((p) => moveToUsi(p.move));
  job.plies = res.plies || [];
  job.start = res.startPos ? fromServerPos(res.startPos) : startOfMeta();
  job.positions = positionsOf(job.start, job.plies);
  job.evals = Array.isArray(res.evals) && res.evals.length ? res.evals : null;
  job.kif = res.kif || '';
  job.review = job.plies.map((p, i) => (p.trace && p.trace.origin === 'interpolated' ? i + 1 : 0)).filter(Boolean);
  const wasInterim = !job.final && before.length > 0;
  if (final && wasInterim) {
    st.flash = new Set(job.plies.map((p, i) => (i < before.length && moveToUsi(p.move) !== before[i] ? i + 1 : 0)).filter(Boolean));
    setTimeout(() => { st.flash = new Set(); renderKv(); }, 3200);
  }
  const follow = st.cur >= before.length || st.mode === 'wait';
  job.final = job.final || final;
  if (follow || st.cur > job.plies.length) st.cur = job.plies.length;
  const hc = isHc();
  job.game = {
    startSfen: toSfen(job.start, 1), isHirate: toSfen(job.start, 1) === HANDICAP_SFENS[HIRATE],
    usiMoves: job.plies.map((p) => moveToUsi(p.move)),
  };
  job.kifOut = decorateKif(job.kif, { handicap: st.meta.handicap, sente: st.meta.sente, gote: st.meta.gote, terminal: st.meta.terminal, plies: job.plies.length });
  void hc;
}

function toResult() {
  st.mode = 'result'; st.check = null; st.fix = null; st.video = null;
  renderKv();
}

function kvBoardSkeleton() {
  const kv = $('kv');
  if (kv.dataset.built) return;
  kv.dataset.built = '1';
  kv.innerHTML = `
    <div class="kv-head"><h1 class="h1" id="kv-title"></h1><span id="kv-tag"></span><span class="sp"></span>
      <button class="icon-btn" id="kv-more" aria-label="そのほか">${icon('more')}</button></div>
    <div class="kv-info" id="kv-info"></div>
    <div id="hand-gote"></div>
    <div class="kv-board"><div id="kv-bd"></div><div class="kv-photo" id="kv-photo" hidden></div></div>
    <div id="hand-sente"></div>
    <div class="kv-strip" id="kv-strip"></div>
    <div class="kv-list" id="kv-list"></div>
    <div class="kv-right"><div class="kv-eval" id="kv-eval"></div><div class="kv-panel" id="kv-panel"></div></div>`;
  board = new Board($('kv-bd'));
  board.onSquare = (s, d) => onBoardSquare(s, d);
  board.grid.addEventListener('click', (ev) => {
    if (st.mode === 'fix') return;
    const r = board.grid.getBoundingClientRect();
    stopPlay();
    goto(st.cur + (ev.clientX - r.left < r.width / 2 ? -1 : 1));
  });
  $('kv-more').onclick = openMoreSheet;
}

function goto(n) {
  const N = st.job ? st.job.plies.length : 0;
  st.cur = Math.max(0, Math.min(N, n));
  if (st.mode === 'video') st.video.ply = Math.max(1, st.cur);
  renderKv();
}

function renderKv() {
  kvBoardSkeleton();
  const job = st.job;
  if (!job) return;
  const N = job.plies.length;
  const hc = isHc();
  const kv = $('kv');
  // 見出し
  const title = $('kv-title'); const tag = $('kv-tag');
  if (st.mode === 'failed') title.textContent = '棋譜を作れませんでした';
  else if (!N && !job.final) title.textContent = '棋譜を読んでいます';
  else if (!job.final) title.textContent = `ここまで ${N} 手を読みました`;
  else title.textContent = `${N}手の棋譜ができました`;
  tag.innerHTML = !job.final && N ? `<span class="tag">${icon('clock').replace('class="ico"', 'class="ico" style="width:14px;height:14px"')}途中</span>` : '';
  $('kv-more').hidden = !job.final;
  $('kv-info').innerHTML = `<p class="h1">${esc(title.textContent)}</p>${tag.innerHTML ? '<p>' + tag.innerHTML + '</p>' : ''}
    <p>▲${esc(st.meta.sente || sideName('sente', hc))} 対 △${esc(st.meta.gote || sideName('gote', hc))}${hc ? '(' + esc(st.meta.handicap) + ')' : ''}<br>${fmtDate(st.meta.startedAt)}</p>`;

  // 盤
  const fixing = st.mode === 'fix' && st.fix;
  const showPly = fixing ? st.fix.ply - 1 : st.cur;
  const pos = job.positions[showPly] || job.start;
  const last = !fixing && showPly > 0 ? job.plies[showPly - 1].move : null;
  const marks = {};
  if (fixing) {
    if (st.fix.sel) marks[sq(st.fix.sel)] = 'sel';
    for (const t of st.fix.dests || []) marks[sq(t)] = 'dot';
  }
  board.render(pos, { last, marks });
  board.el.classList.toggle('dim', st.mode === 'wait');
  // 持ち駒
  const who = (side) => (side === 'sente' ? '▲' : '△') + (st.meta[side] || sideName(side, hc));
  const handTap = fixing ? (side) => (k) => onHandTap(side, k) : () => null;
  renderHand($('hand-gote'), pos.hands.gote, 'gote', who('gote'), fixing ? handTap('gote') : null);
  renderHand($('hand-sente'), pos.hands.sente, 'sente', who('sente'), fixing ? handTap('sente') : null);
  if (fixing && st.fix.hand) {
    const el = $('hand-' + st.fix.hand.side).querySelector(`[data-kind="${st.fix.hand.kind}"]`);
    if (el) el.classList.add('sel');
  }
  if (job.final && st.mode === 'result' && st.lay === 'phone') {
    const b = document.createElement('button');
    b.className = 'kh-extra'; b.textContent = '映像で確かめる ›';
    b.onclick = () => openVideo(Math.max(1, st.cur));
    $('hand-sente').appendChild(b);
  }
  // 映像
  renderPhoto();
  // 棋譜の帯・一覧
  renderMoves();
  // 形勢
  renderEval();
  // 下の操作
  renderPanel();
  kv.dataset.mode = st.mode;
  requestAnimationFrame(fitKv);
}

function plyText(i, opts) {
  const job = st.job; const p = job.plies[i - 1];
  const prev = i > 1 ? job.plies[i - 2].move : null;
  return moveLabel(p.move, p.side, prev, opts);
}

function renderMoves() {
  const job = st.job; const N = job.plies.length;
  const warn = new Set(job.review);
  const strip = $('kv-strip'); const list = $('kv-list');
  let s = `<button class="mchip${st.cur === 0 ? ' cur' : ''}" data-ply="0">開始</button>`;
  let l = `<div class="krow${st.cur === 0 ? ' cur' : ''}" data-ply="0"><span class="n"></span><span>開始局面</span><small></small></div>`;
  for (let i = 1; i <= N; i++) {
    const cls = (st.cur === i ? ' cur' : '') + (warn.has(i) ? ' warn' : '') + (st.flash.has(i) ? ' flash' : '') + (st.fixed.has(i) ? ' fixed' : '');
    const q = warn.has(i) ? '<span class="qmark" title="映像になかった手">?</span>' : '';
    s += `<button class="mchip${cls}" data-ply="${i}"><small>${i}</small>${plyText(i, { from: false })}${q}</button>`;
    const r = job.evals && job.evals[i] ? senteRate(job.evals[i]) : null;
    l += `<div class="krow${cls}" data-ply="${i}"><span class="n">${i}</span><span>${plyText(i, { from: false })} ${q}</span><small>${r == null ? '' : r + '%'}</small></div>`;
  }
  strip.innerHTML = s; list.innerHTML = l;
  const pick = (ev) => { const t = ev.target.closest('[data-ply]'); if (!t) return; stopPlay(); if (st.mode === 'fix') return; goto(Number(t.dataset.ply)); };
  strip.onclick = pick; list.onclick = pick;
  centerStrip();
}
function centerStrip() {
  for (const box of [$('kv-strip'), $('kv-list')]) {
    if (!box) continue;
    const c = box.querySelector('.cur');
    if (!c) continue;
    if (box.id === 'kv-strip') box.scrollLeft = c.offsetLeft - box.clientWidth / 2 + c.offsetWidth / 2;
    else box.scrollTop = c.offsetTop - box.clientHeight / 2 + c.offsetHeight / 2;
  }
}

function renderEval() {
  const el = $('kv-eval'); const job = st.job;
  const hide = st.mode === 'wait' || st.mode === 'failed' || (st.lay === 'phone' && ['check', 'fix', 'pick', 'video'].includes(st.mode));
  el.hidden = hide;
  if (hide) return;
  if (!job.final || !job.evals) {
    el.innerHTML = `<div class="eval-graph wait">${job.final ? '<span class="dots">形勢を読んでいます</span>' : '形勢は、読み終わってから出ます'}</div><div class="eval-line"></div>`;
    return;
  }
  const ev = job.evals; const N = job.plies.length;
  const val = (e) => (!e ? 0 : e.mate != null ? (e.mate > 0 ? 1500 : -1500) : Math.max(-1500, Math.min(1500, e.cp || 0)));
  const pts = ev.slice(0, N + 1).map((e, i) => [N ? (i / N) * 100 : 0, 50 - (val(e) / 1500) * 46]);
  const line = pts.map((p) => p[0].toFixed(2) + ',' + p[1].toFixed(2)).join(' ');
  const e = ev[st.cur];
  const cx = N ? (st.cur / N) * 100 : 0; const cy = 50 - (val(e) / 1500) * 46;
  const pos = job.positions[st.cur];
  let rec = '';
  if (e && e.bestmove && e.bestmove !== 'resign' && e.bestmove !== 'win') {
    try {
      const m = usiToMove(e.bestmove, pos);
      rec = moveLabel(m, pos.teban, st.cur > 0 ? job.plies[st.cur - 1].move : null);
    } catch (err) { rec = ''; }
  }
  let pv = '';
  if (e && Array.isArray(e.pv) && e.pv.length > 1) {
    let p = pos; let prev = st.cur > 0 ? job.plies[st.cur - 1].move : null; const out = [];
    for (const u of e.pv.slice(0, 4)) {
      try { const m = usiToMove(u, p); out.push(moveLabel(m, p.teban, prev, { from: false })); p = applyMove(p, m, p.teban); prev = m; } catch (err) { break; }
    }
    pv = '読み筋 ' + out.join(' ');
  }
  el.innerHTML = `<div class="eval-graph" id="kv-graph">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none"><line class="mid" x1="0" y1="50" x2="100" y2="50" vector-effect="non-scaling-stroke"/>
      <polygon class="area" points="0,50 ${line} 100,50"/><polyline class="ln" points="${line}"/></svg>
      <span style="position:absolute;left:calc(${cx}% - 6px);top:calc(${cy}% - 6px);width:12px;height:12px;border-radius:50%;border:2px solid var(--primary);background:var(--surface);box-sizing:border-box"></span></div>
    <div class="eval-line"><b>${evalSummary(e) || ''}</b>${rec ? `<span>次の推奨手 ${rec}</span>` : ''}</div>
    ${st.lay !== 'phone' && pv ? `<div class="eval-pv">${pv}</div>` : ''}`;
  const g = $('kv-graph');
  if (g) g.onclick = (ev2) => { const r = g.getBoundingClientRect(); stopPlay(); goto(Math.round(((ev2.clientX - r.left) / r.width) * N)); };
}

function renderPanel() {
  const el = $('kv-panel'); const job = st.job; const N = job.plies.length;
  // スマホを横にしたとき(高さ 480 未満)は、右の列もスマホの操作の列で詰める
  const phone = st.lay === 'phone' || window.innerHeight < 480;
  const roomy = st.lay !== 'phone' ? window.innerHeight >= 480 : window.innerHeight >= 740;
  let html = '';
  const nav = st.lay === 'tl' ? `<div class="nav4"><button data-go="first" aria-label="最初">|◀</button><button data-go="-1" aria-label="1手戻る">◀</button><button data-go="1" aria-label="1手進む">▶</button><button data-go="last" aria-label="最後">▶|</button><span>${st.cur} / ${N}</span></div>` : '';
  const curMove = st.lay !== 'phone' && st.cur > 0 ? `<p class="move" style="margin:0">${st.cur}手目 ${plyText(st.cur)}${job.review.includes(st.cur) ? ' <span class="qmark">?</span>' : ''}</p>` : '';
  if (st.mode === 'failed') {
    html = `<div class="center-box"><img class="bird" src="img/bird.png" alt=""><p class="h1">棋譜を作れませんでした</p>
      <p class="note">盤の四隅が映っているか、明るさが足りているかをご確認のうえ、もう一度撮ってください。</p>
      <button class="btn" data-act="new">新しい対局を撮る</button></div>`;
  } else if (st.mode === 'wait') {
    html = `<div style="display:flex;gap:12px;align-items:center;justify-content:center;padding-top:8px"><img class="bird" src="img/bird.png" alt="" style="width:48px">
      <div><p class="h1 dots">棋譜を読んでいます</p><p class="note">対局の長さによって数分かかります。このページを開いたままお待ちください</p></div></div>`;
  } else if (st.mode === 'interim') {
    html = `${curMove}${nav}<p class="note">最後まで読むと、手が変わることがあります</p><p class="note dots" style="text-align:center;font-size:15px">読み終わるまでお待ちください</p>`;
  } else if (st.mode === 'result') {
    const n = job.review.length;
    const primary = n ? `<button class="btn wide" data-act="check">確認する(${n}件)</button>` : `<button class="btn wide" data-act="handoff">渡す</button>`;
    const playing = !!st.play;
    const done = st.note ? `<p class="msg">${esc(st.note)}</p>` : '';
    if (phone) {
      const five = !roomy;
      html = `${done}${primary}
        <div class="acts${five ? '' : ' three'}">
          <button class="act" data-act="handoff" aria-label="ほかのアプリ・サイトへ渡す">${icon('send')}渡す先</button>
          <button class="act" data-act="play" aria-label="盤で再生">${icon(playing ? 'pause' : 'play')}${playing ? '止める' : '盤で再生'}</button>
          <button class="act" data-act="pick" aria-label="手を選んで直す">${icon('edit')}直す</button>
          ${five ? `<button class="act" data-act="x" aria-label="X でシェア">${icon('x')}X</button><button class="act" data-act="fb" aria-label="Facebook でシェア">${icon('fb')}Facebook</button>` : ''}
        </div>
        ${five ? '' : `<div class="share-row"><button class="btn line center" data-act="x">${icon('x')}X でシェア</button><button class="btn line center" data-act="fb">${icon('fb')}Facebook でシェア</button></div>`}`;
    } else {
      html = `${curMove}${nav}${done}${primary}
        <div class="lines">
          <button class="btn line" data-act="handoff">${icon('send')}ほかのアプリ・サイトへ渡す</button>
          <button class="btn line" data-act="play">${icon(playing ? 'pause' : 'play')}${playing ? '再生を止める' : '盤で再生'}</button>
          <button class="btn line" data-act="pick">${icon('edit')}手を選んで直す</button>
        </div>
        <div class="share-row"><button class="btn line center" data-act="x">${icon('x')}X でシェア</button><button class="btn line center" data-act="fb">${icon('fb')}Facebook でシェア</button></div>
        <p class="note" style="font-size:12px">X・Facebook には、盤と棋譜が見えるページのリンクを載せます</p>`;
    }
  } else if (st.mode === 'check') {
    const c = st.check; const ply = c.list[c.i];
    html = `<div class="ask">
      <div class="ask-top"><span>確認 ${c.i + 1} / ${c.list.length}</span><span><button class="btn text" data-act="video">映像で確かめる ›</button><button class="btn text" data-act="later">あとで</button></span></div>
      <p class="ask-q">${ply}手目、<span class="move">${plyText(ply)}</span> だと思うのですが</p>
      <p class="ask-why"><span class="qmark">?</span>映像になかった手です。前後の局面からつなぎました</p>
      <div class="ask-btns"><button class="btn" data-act="ok">正しい</button><button class="btn line" data-act="fixthis">盤で直す</button></div></div>`;
  } else if (st.mode === 'pick') {
    html = `<div class="ask"><div class="ask-top"><span>直したい手をえらんでください</span><button class="btn text" data-act="later">やめる</button></div>
      <p class="ask-q">${st.cur > 0 ? `${st.cur}手目 <span class="move">${plyText(st.cur)}</span>` : '棋譜の帯から手を選んでください'}</p>
      <button class="btn wide" data-act="fixcur"${st.cur > 0 ? '' : ' disabled'}>この手を直す</button></div>`;
  } else if (st.mode === 'fix') {
    const f = st.fix;
    const p = job.plies[f.ply - 1];
    let body = '';
    if (f.busy) body = `<p class="msg dots">続きを読み直しています</p>`;
    else if (f.promo) {
      const k = f.promo.kind; const side = p.side;
      const img = (kind) => `<img src="${pieceSrc(kind, side)}" alt="" class="${side === 'gote' ? 'gote' : ''}" style="${side === 'gote' ? 'transform:rotate(180deg)' : ''}">`;
      body = `<p class="ask-q">成りますか?</p><div class="promo"><button class="btn line center" data-act="promo1">${img(PROMOTE[k])}成る</button><button class="btn line center" data-act="promo0">${img(k)}成らない</button></div>`;
    } else {
      body = `<p class="ask-q">${f.ply}手目(${p.side === 'sente' ? '▲' : '△'})の正しい手を、盤で指してください</p>
        <p class="note">いまは <span class="move" style="font-size:14px">${plyText(f.ply)}</span> になっています。${f.sel || f.hand ? '行き先の升を押してください' : '動かす駒か、持ち駒を押してください'}</p>`;
    }
    html = `<div class="ask"><div class="ask-top"><span>盤で直す</span><button class="btn text" data-act="unfix"${f.busy ? ' disabled' : ''}>やめる</button></div>
      ${body}${f.err ? `<p class="msg err">${esc(f.err)}</p>` : ''}</div>`;
  } else if (st.mode === 'video') {
    html = renderVideoPanel();
  }
  el.innerHTML = html;
  for (const b of el.querySelectorAll('[data-act]')) b.onclick = () => onAct(b.dataset.act);
  for (const b of el.querySelectorAll('[data-go]')) {
    b.onclick = () => {
      const g = b.dataset.go; stopPlay();
      goto(g === 'first' ? 0 : g === 'last' ? N : st.cur + Number(g));
    };
  }
  for (const b of el.querySelectorAll('[data-vi]')) b.onclick = () => { st.video.idx = Number(b.dataset.vi); renderKv(); };
}

function onAct(a) {
  const job = st.job;
  if (a === 'check') { st.check = { list: job.review.slice(), i: 0 }; st.mode = 'check'; st.cur = st.check.list[0]; pushMode(); renderKv(); }
  else if (a === 'handoff') openHandoff();
  else if (a === 'play') togglePlay();
  else if (a === 'pick') { st.mode = 'pick'; if (st.cur === 0) st.cur = 1; pushMode(); renderKv(); }
  else if (a === 'x' || a === 'fb') shareSns(a);
  else if (a === 'later') toResult();
  else if (a === 'ok') nextCheck();
  else if (a === 'fixthis') startFix(st.check.list[st.check.i]);
  else if (a === 'fixcur') startFix(st.cur);
  else if (a === 'unfix') { st.fix = null; st.mode = st.check ? 'check' : 'result'; renderKv(); }
  else if (a === 'promo1' || a === 'promo0') submitFix(a === 'promo1');
  else if (a === 'video') openVideo(st.check ? st.check.list[st.check.i] : st.cur);
  else if (a === 'unvideo') { st.mode = st.video.back; st.video = null; renderKv(); }
  else if (a === 'new') { st.job = null; clearTimeout(pollTimer); show('prep'); renderPrep(); }
}
function pushMode() { try { history.pushState({ s: 'kv', m: st.mode }, ''); } catch (e) { /* noop */ } }

function nextCheck() {
  const c = st.check;
  c.i++;
  if (c.i >= c.list.length) {
    st.note = '確認がおわりました';
    st.check = null; st.mode = 'result'; st.cur = st.job.plies.length;
    renderKv();
    setTimeout(() => { if (st.note === '確認がおわりました') { st.note = null; if (st.mode === 'result') renderKv(); } }, 2500);
    return;
  }
  st.cur = c.list[c.i];
  renderKv();
}

function togglePlay() {
  if (st.play) { stopPlay(); renderKv(); return; }
  const N = st.job.plies.length;
  if (st.cur >= N) st.cur = 0;
  st.play = setInterval(() => {
    if (st.cur >= N) { stopPlay(); renderKv(); return; }
    st.cur++; renderKv();
  }, 1000);
  renderKv();
}
function stopPlay() { if (st.play) { clearInterval(st.play); st.play = null; } }

// ---- 盤で直す(S8)
function startFix(ply) {
  if (!ply) return;
  stopPlay();
  st.fix = { ply, sel: null, hand: null, dests: [], promo: null, busy: false, err: null };
  st.mode = 'fix'; st.cur = ply;
  pushMode();
  renderKv();
}
function fixPos() { return st.job.positions[st.fix.ply - 1]; }
function fixSide() { return st.job.plies[st.fix.ply - 1].side; }

function onBoardSquare(s, d) {
  if (st.mode !== 'fix' || !st.fix || st.fix.busy || st.fix.promo) return;
  const f = st.fix; const pos = fixPos(); const side = fixSide();
  const here = pos.ban[String(s) + String(d)];
  const isDest = (f.dests || []).some((t) => t[0] === s && t[1] === d);
  if (isDest && (f.sel || f.hand)) {
    if (f.hand) { f.move = { from: null, to: [s, d], kind: f.hand.kind, promote: false }; submitFix(false); return; }
    const piece = pos.ban[sq(f.sel)];
    const pr = M.promotion(piece.kind, side, f.sel, [s, d]);
    f.move = { from: f.sel, to: [s, d], kind: piece.kind, promote: false };
    if (pr.must) { submitFix(true); return; }
    if (pr.can) { f.promo = { kind: piece.kind }; renderKv(); return; }
    submitFix(false); return;
  }
  if (here && here.side === side) {
    f.sel = [s, d]; f.hand = null; f.err = null;
    f.dests = M.destinations(pos, [s, d]);
  } else { f.sel = null; f.hand = null; f.dests = []; }
  renderKv();
}
function onHandTap(side, kind) {
  const f = st.fix;
  if (!f || f.busy || f.promo || side !== fixSide()) return;
  f.hand = { side, kind }; f.sel = null; f.err = null;
  f.dests = M.dropTargets(fixPos(), kind, side);
  renderKv();
}

async function submitFix(promote) {
  const f = st.fix; const job = st.job;
  const p = job.plies[f.ply - 1];
  const move = { ...f.move, promote: !!promote };
  f.promo = null;
  const t = p.frameIdx != null ? p.frameIdx : (p.trace && p.trace.t);
  if (t == null) { f.err = 'この手は映像の時刻が分からないため、直せません。'; renderKv(); return; }
  f.busy = true; f.err = null; renderKv();
  track('komadori_web_fix', { ply: f.ply });
  try {
    const res = await A.correct(job.id, { t, from: move.from, to: move.to, kind: move.kind, promote: move.promote, ply: f.ply });
    const before = job.plies.map((x) => moveToUsi(x.move));
    applyResult(res.result || res, true);
    const changed = job.plies.map((x, i) => (moveToUsi(x.move) !== before[i] ? i + 1 : 0)).filter(Boolean);
    st.fixed = new Set(changed.length ? changed : [f.ply]);
    setTimeout(() => { st.fixed = new Set(); if (st.screen === 'kv') renderKv(); }, 30000);
    if (res.evalsRecomputing) { job.evals = null; clearTimeout(pollTimer); pollTimer = setTimeout(poll, 5000); }
    st.note = `${f.ply}手目を直しました。そのあとの手も読み直しました`;
    st.fix = null; st.cur = Math.min(job.plies.length, st.cur);
    if (st.check) {
      st.check.list = st.check.list.filter((x) => x !== st.cur && job.review.includes(x));
      if (st.check.i >= st.check.list.length) { st.check = null; st.mode = 'result'; } else { st.mode = 'check'; st.cur = st.check.list[st.check.i]; }
    } else st.mode = 'result';
  } catch (err) {
    f.busy = false;
    f.err = err.code === 422 ? 'この手は反映できませんでした。駒と行き先をご確認のうえ、もう一度指してください。' : (err.message || '直せませんでした');
    f.sel = null; f.hand = null; f.dests = [];
  }
  renderKv();
}

// ---- 映像で確かめる(S9)
async function openVideo(ply) {
  const job = st.job;
  st.video = { ply: Math.max(1, ply), idx: null, back: st.mode === 'video' ? 'result' : st.mode };
  st.mode = 'video';
  st.cur = st.video.ply;
  pushMode();
  renderKv();
  if (!job.frames) {
    job.frames = await A.getFrames(job.id) || { frames: [] };
    renderKv();
  }
}
function nearestFrame(t) {
  const fr = st.job.frames && st.job.frames.frames;
  if (!fr || !fr.length || t == null) return -1;
  let best = 0;
  for (let i = 1; i < fr.length; i++) if (Math.abs(fr[i].t - t) < Math.abs(fr[best].t - t)) best = i;
  return best;
}
function renderVideoPanel() {
  const job = st.job; const v = st.video;
  const p = job.plies[v.ply - 1];
  const fr = job.frames && job.frames.frames;
  let thumbs = '';
  if (!job.frames) thumbs = '<p class="note dots">映像を読み込んでいます</p>';
  else if (!fr.length) thumbs = '<p class="note">この棋譜には映像の写真がありません</p>';
  else {
    const c = v.idx != null ? v.idx : nearestFrame(p.frameIdx);
    const from = Math.max(0, Math.min(fr.length - 5, c - 2));
    thumbs = `<div class="thumbs">${fr.slice(from, from + 5).map((f, j) => `<button data-vi="${from + j}" class="${from + j === c ? 'on' : ''}"><img src="${esc(f.url)}" alt="" loading="lazy"></button>`).join('')}</div>`;
  }
  return `<div class="ask"><div class="ask-top"><span>${v.ply}手目 <b>${plyText(v.ply)}</b> の映像</span><button class="btn text" data-act="unvideo">盤にもどる</button></div>${thumbs}</div>`;
}
function renderPhoto() {
  const box = $('kv-photo'); const v = st.video;
  if (st.mode !== 'video' || !v || !st.job.frames || !st.job.frames.frames.length) { box.hidden = true; box.innerHTML = ''; return; }
  const job = st.job; const fr = job.frames.frames;
  const p = job.plies[v.ply - 1];
  const i = v.idx != null ? v.idx : nearestFrame(p.frameIdx);
  const f = fr[i];
  box.hidden = false;
  if (box.dataset.url === f.url) return;
  box.dataset.url = f.url;
  const cap = `<span class="cap">実際の映像 ${fmtTime(f.t)}</span>`;
  const pts = job.frames.points;
  const img = new Image();
  img.crossOrigin = null;
  img.onload = () => {
    if (box.dataset.url !== f.url) return;
    if (!pts) { box.innerHTML = ''; box.appendChild(img); box.insertAdjacentHTML('beforeend', cap); return; }
    // 盤の四角(と駒台の少し)を切り出す
    const xs = pts.map((q) => q[0]); const ys = pts.map((q) => q[1]);
    const x0 = Math.min(...xs); const x1 = Math.max(...xs); const y0 = Math.min(...ys); const y1 = Math.max(...ys);
    const m = Math.max(x1 - x0, y1 - y0) * 0.06;
    const sx = Math.max(0, x0 - m); const sy = Math.max(0, y0 - m);
    const sw = Math.min(img.naturalWidth - sx, x1 - x0 + 2 * m); const sh = Math.min(img.naturalHeight - sy, y1 - y0 + 2 * m);
    const c = document.createElement('canvas'); c.width = 600; c.height = 600;
    const x = c.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, 600, 600);
    const s = Math.min(600 / sw, 600 / sh);
    x.drawImage(img, sx, sy, sw, sh, (600 - sw * s) / 2, (600 - sh * s) / 2, sw * s, sh * s);
    box.innerHTML = ''; box.appendChild(c); box.insertAdjacentHTML('beforeend', cap);
  };
  img.src = f.url;
}

// ---------------------------------------------------------------- S10 渡す
function openHandoff() {
  stopPlay();
  const job = st.job; const g = job.game;
  const el = $('handoff');
  el.innerHTML = `<div class="kv-head"><button class="icon-btn" id="h-back" aria-label="もどる">${icon('back')}</button><h1 class="h1">ほかのアプリ・サイトへ</h1></div>
    <div class="ho-list" id="h-list">${H.GROUPS.map((gr, gi) => `<div class="ho-group"><h3>${gr.title}</h3>${gr.lead ? `<p class="lead">${gr.lead}</p>` : ''}
      ${gr.items.map((it) => `<button class="ho-row" data-id="${it.id}"><span class="l">${it.label}</span><span class="w" id="w-${it.id}">${it.way}</span></button>`).join('')}
      <p class="ho-note" id="n-${gi}" hidden></p></div>`).join('')}</div>
    <p class="ho-foot">${H.DIRECT_LIMIT}</p>`;
  show('handoff');
  $('h-back').onclick = () => history.back();
  const kifName = kifFileName();
  for (const b of el.querySelectorAll('[data-id]')) {
    b.onclick = async () => {
      const gi = H.GROUPS.findIndex((gr) => gr.items.some((x) => x.id === b.dataset.id));
      const it = H.GROUPS[gi].items.find((x) => x.id === b.dataset.id);
      const note = $('n-' + gi);
      for (const n of el.querySelectorAll('.ho-note')) n.hidden = true;
      track('komadori_web_handoff', { to: it.id });
      let text = it.note;
      if (it.act === 'link') {
        const url = H.linkUrl(it.id, g);
        if (it.id === 'piyo') {
          const cut = H.piyoAppCut(g);
          if (cut != null) text += ` 反則の手の手前(${cut}手目)までを渡しました。`;
          location.href = url;
          text += ' 開かないときは、Google Playでぴよ将棋を入れるか、ぴよ将棋wで開いてください。';
        } else window.open(url, '_blank', 'noopener');
      } else if (it.act === 'copy' || it.act === 'copyopen') {
        const ok = await H.copyText(job.kifOut);
        const w = $('w-' + it.id); w.textContent = ok ? 'コピーしました' : 'コピーできませんでした'; w.classList.add('done');
        setTimeout(() => { w.textContent = it.way; w.classList.remove('done'); }, 1500);
        if (it.act === 'copyopen') window.open(it.url, '_blank', 'noopener');
      } else if (it.act === 'share') {
        const r = await H.shareFile(H.kifFile(job.kifOut, kifName));
        if (r === 'downloaded') text = 'ダウンロードに保存しました(' + kifName + ')。相手のアプリやパソコンで開いてください。';
        if (r === 'cancel') return;
      } else if (it.act === 'qr') {
        openSheet(`<h2>相手のスマホで読んでください</h2><div class="qr-box">${H.qrSvg(H.studyUrl(g))}</div><p class="note" style="text-align:center">カメラで読むと、ブラウザでこの一局が開きます</p><button class="cancel" data-close>閉じる</button>`);
        return;
      }
      note.textContent = text; note.hidden = false;
    };
  }
}

function shareSns(which) {
  const job = st.job; const hc = isHc();
  const urls = H.shareUrls(job.game, { plies: job.plies.length, sente: st.meta.sente, gote: st.meta.gote, hc });
  track('komadori_web_share', { to: which });
  window.open(which === 'x' ? urls.x : urls.facebook, '_blank', 'noopener');
}

function kifFileName() {
  const d = new Date(st.meta.startedAt || Date.now());
  const p = (n) => String(n).padStart(2, '0');
  return `komadori-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.kif`;
}

// ---------------------------------------------------------------- ⋯・前の棋譜
function openMoreSheet() {
  openSheet(`<h2>この棋譜</h2>
    <button class="opt" data-m="names">名前を直す</button>
    <button class="opt" data-m="save">KIFを保存</button>
    <button class="opt" data-m="video">映像で確かめる</button>
    <button class="opt" data-m="new">新しい対局を撮る</button>
    <hr><button class="cancel" data-close>閉じる</button>`, (sheet) => {
    for (const b of sheet.querySelectorAll('[data-m]')) {
      b.onclick = () => {
        const m = b.dataset.m; closeSheet();
        if (m === 'save') H.shareFile(H.kifFile(st.job.kifOut, kifFileName()));
        else if (m === 'video') openVideo(Math.max(1, st.cur));
        else if (m === 'new') onAct('new');
        else if (m === 'names') openNamesSheet();
      };
    }
  });
}
function openNamesSheet() {
  const hc = isHc();
  openSheet(`<h2>名前を直す</h2>
    <input id="n-s" maxlength="20" placeholder="▲${sideName('sente', hc)}の名前" value="${esc(st.meta.sente)}">
    <input id="n-g" maxlength="20" placeholder="△${sideName('gote', hc)}の名前" value="${esc(st.meta.gote)}">
    <button class="btn" id="n-ok">決める</button><button class="cancel" data-close>やめる</button>`, () => {
    $('n-ok').onclick = () => {
      st.meta.sente = $('n-s').value.trim(); st.meta.gote = $('n-g').value.trim();
      A.updateShelfItem(st.job.id, { meta: st.meta });
      closeSheet();
      const j = st.job;
      j.kifOut = decorateKif(j.kif, { handicap: st.meta.handicap, sente: st.meta.sente, gote: st.meta.gote, terminal: st.meta.terminal, plies: j.plies.length });
      renderKv();
    };
  });
}
function openShelfSheet() {
  const list = A.loadShelf();
  openSheet(`<h2>前の棋譜</h2><p class="note" style="margin:0 4px 4px">このブラウザで撮った棋譜です</p>
    ${list.map((x) => `<button class="opt" data-job="${esc(x.jobId)}">${fmtDate(x.createdAt)}<small>${esc(x.meta && (x.meta.sente || x.meta.gote) ? '▲' + (x.meta.sente || '') + ' 対 △' + (x.meta.gote || '') : (x.meta && x.meta.handicap) || '')}</small></button>`).join('')}
    <hr><button class="cancel" data-close>閉じる</button>`, (sheet) => {
    for (const b of sheet.querySelectorAll('[data-job]')) {
      b.onclick = () => {
        const it = list.find((x) => x.jobId === b.dataset.job);
        closeSheet();
        openJob(it.jobId, { ...(it.meta || {}), startedAt: (it.meta && it.meta.startedAt) || it.createdAt });
      };
    }
  });
}

// ---------------------------------------------------------------- シート
function openSheet(html, bind) {
  const back = $('sheet');
  back.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">${html}</div>`;
  back.hidden = false;
  back.onclick = (e) => { if (e.target === back || e.target.hasAttribute('data-close')) closeSheet(); };
  if (bind) bind(back.firstElementChild);
}
function closeSheet() { const b = $('sheet'); b.hidden = true; b.innerHTML = ''; }
function alertBox(text) { openSheet(`<p style="margin:8px 4px">${esc(text)}</p><button class="btn" data-close>閉じる</button>`); }

// ---------------------------------------------------------------- 小物
function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600); const m = Math.floor((sec % 3600) / 60); const s = sec % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0');
}
function fmtDate(t) {
  if (!t) return '';
  const d = new Date(t);
  return `${d.getMonth() + 1}月${d.getDate()}日 ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// ---------------------------------------------------------------- はじまり
function relayout() {
  measure();
  if (st.screen === 'cam') { renderCam(); layoutStage(); }
  if (st.screen === 'prep') renderPrepPreview();
  if (st.screen === 'kv') renderKv();
}
let rT = null;
window.addEventListener('resize', () => { clearTimeout(rT); rT = setTimeout(relayout, 80); });
if (window.visualViewport) window.visualViewport.addEventListener('resize', () => { clearTimeout(rT); rT = setTimeout(relayout, 80); });
window.addEventListener('beforeunload', (e) => { if (R.recording()) { e.preventDefault(); e.returnValue = ''; } });
video().addEventListener('loadedmetadata', layoutStage);

measure();
try { history.replaceState({ s: 'prep' }, ''); } catch (e) { /* noop */ }
// #job=<id> で前の棋譜を開く(クエリにしないのは、アクセスログに残さないため)
const jobParam = (location.hash.match(/^#job=([\w-]+)/) || [])[1];
if (jobParam) {
  const it = A.loadShelf().find((x) => x.jobId === jobParam);
  openJob(jobParam, it ? { ...(it.meta || {}), startedAt: (it.meta && it.meta.startedAt) || it.createdAt } : {});
} else {
  show('prep', false);
  renderPrep();
}
// 確かめ用(ローカルの見本だけ): window.__komadori
window.__komadori = { st, openJob, renderKv, show, renderCam, applyResult, analyzeRecog };
void KANJI;
