// board.js — 盤と持ち駒を描く(コマドリ Web)
//
// 駒と盤の絵は iOS アプリと同じ Shogi Images(久保良介さん・CC0)。後手の駒は先手の絵を 180° 回す。
// 盤の絵は罫線の外側で切ってあるので、外枠の線は CSS で足す。
// 第 n 手を選んだ盤は、n 手目のあとの局面に、指した元から先への矢印を載せる(remake の約束)。
import { HAND_ORDER, KANJI } from './shogi.js';

const IMG = {
  fu: 'fu', ky: 'kyo', ke: 'kei', gi: 'gin', ki: 'kin', ka: 'kaku', hi: 'hi', ou: 'ou', gyoku: 'gyoku',
  to: 'to', ny: 'nkyo', nk: 'nkei', ng: 'ngin', um: 'uma', ry: 'ryu',
};
const BASE_URL = new URL('./img/', import.meta.url).href;
export function pieceSrc(kind, side) {
  // 先手の玉は「玉」、後手は「王」(アプリと同じ)
  const k = kind === 'ou' ? (side === 'gote' ? 'ou' : 'gyoku') : IMG[kind];
  return BASE_URL + 'koma/' + k + '.png';
}

const SVGNS = 'http://www.w3.org/2000/svg';
const KAN = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

// 駒の絵。絵を読めなかった(通信が切れた等)ときは、字の駒に置きかえる
function pieceImg(kind, side) {
  const img = document.createElement('img');
  img.alt = '';
  img.draggable = false;
  if (side === 'gote') img.className = 'gote';
  img.onerror = () => {
    const t = document.createElement('span');
    const name = KANJI[kind] || '';
    t.className = 'kp' + (side === 'gote' ? ' gote' : '') + (name.length > 1 ? ' two' : '') + (/^(to|ny|nk|ng|um|ry)$/.test(kind) ? ' promo' : '');
    t.textContent = name;
    img.replaceWith(t);
  };
  img.src = pieceSrc(kind, side);
  return img;
}

export class Board {
  constructor(el, opts = {}) {
    this.el = el;
    this.opts = opts;
    el.classList.add('kb');
    el.innerHTML = '';
    this.files = document.createElement('div');
    this.files.className = 'kb-files';
    for (let s = 9; s >= 1; s--) { const i = document.createElement('span'); i.textContent = s; this.files.appendChild(i); }
    this.ranks = document.createElement('div');
    this.ranks.className = 'kb-ranks';
    for (let d = 1; d <= 9; d++) { const i = document.createElement('span'); i.textContent = KAN[d]; this.ranks.appendChild(i); }
    this.grid = document.createElement('div');
    this.grid.className = 'kb-grid';
    this.cells = {};
    for (let d = 1; d <= 9; d++) {
      for (let s = 9; s >= 1; s--) {
        const c = document.createElement('div');
        c.className = 'kb-cell';
        c.dataset.sq = String(s) + String(d);
        this.grid.appendChild(c);
        this.cells[c.dataset.sq] = c;
      }
    }
    this.svg = document.createElementNS(SVGNS, 'svg');
    this.svg.setAttribute('class', 'kb-arrows');
    this.svg.setAttribute('viewBox', '0 0 9 9');
    this.svg.setAttribute('preserveAspectRatio', 'none');
    this.grid.appendChild(this.svg);
    const wrap = document.createElement('div');
    wrap.className = 'kb-wrap';
    wrap.appendChild(this.files);
    wrap.appendChild(this.grid);
    wrap.appendChild(this.ranks);
    el.appendChild(wrap);
    this.grid.addEventListener('click', (ev) => {
      const c = ev.target.closest('.kb-cell');
      if (c && this.onSquare) this.onSquare(Number(c.dataset.sq[0]), Number(c.dataset.sq[1]));
    });
  }

  // opts: { last: move, arrows: [{from,to,kind:'main'|'alt'}], marks: {sq: 'dot'|'ring'|'sel'} }
  render(pos, opts = {}) {
    for (const sq in this.cells) {
      const c = this.cells[sq];
      const p = pos.ban[sq];
      c.className = 'kb-cell';
      c.innerHTML = '';
      if (p) {
        c.appendChild(pieceImg(p.kind, p.side));
      }
    }
    const last = opts.last;
    if (last) {
      const to = String(last.to[0]) + String(last.to[1]);
      this.cells[to] && this.cells[to].classList.add('kb-to');
      if (last.from) {
        const from = String(last.from[0]) + String(last.from[1]);
        this.cells[from] && this.cells[from].classList.add('kb-from');
      }
    }
    for (const sq in opts.marks || {}) {
      this.cells[sq] && this.cells[sq].classList.add('kb-mark-' + opts.marks[sq]);
    }
    this.drawArrows(opts.arrows || (last ? [{ from: last.from, to: last.to, kind: 'main' }] : []));
  }

  drawArrows(arrows) {
    while (this.svg.firstChild) this.svg.removeChild(this.svg.firstChild);
    const center = (sq) => [9 - sq[0] + 0.5, sq[1] - 0.5];
    for (const a of arrows) {
      const [x2, y2] = center(a.to);
      if (!a.from) continue; // 打ち駒は矢印なし。行き先の升の色だけ
      const [x1, y1] = center(a.from);
      const dx = x2 - x1; const dy = y2 - y1; const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len; const uy = dy / len;
      const head = a.kind === 'alt' ? 0.28 : 0.36;
      const bx = x2 - ux * head; const by = y2 - uy * head;
      const w = a.kind === 'alt' ? 0.07 : 0.13;
      const line = document.createElementNS(SVGNS, 'line');
      line.setAttribute('x1', x1); line.setAttribute('y1', y1);
      line.setAttribute('x2', bx); line.setAttribute('y2', by);
      line.setAttribute('stroke-width', w);
      line.setAttribute('class', 'kb-arrow ' + (a.kind || 'main'));
      this.svg.appendChild(line);
      const px = -uy * head * 0.62; const py = ux * head * 0.62;
      const tri = document.createElementNS(SVGNS, 'polygon');
      tri.setAttribute('points', `${x2},${y2} ${bx + px},${by + py} ${bx - px},${by - py}`);
      tri.setAttribute('class', 'kb-head ' + (a.kind || 'main'));
      this.svg.appendChild(tri);
    }
  }
}

// 持ち駒の列。side: 'sente' | 'gote'。label: 「▲ 山田」など
export function renderHand(el, hand, side, label, onTap) {
  el.className = 'kh kh-' + side;
  el.innerHTML = '';
  const name = document.createElement('span');
  name.className = 'kh-name';
  name.textContent = label;
  el.appendChild(name);
  const list = document.createElement('span');
  list.className = 'kh-list';
  let any = false;
  for (const k of HAND_ORDER) {
    const n = (hand && hand[k]) || 0;
    if (!n) continue;
    any = true;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'kh-piece';
    b.dataset.kind = k;
    b.appendChild(pieceImg(k, side));
    if (n > 1) { const c = document.createElement('span'); c.className = 'kh-n'; c.textContent = n; b.appendChild(c); }
    if (onTap) b.addEventListener('click', () => onTap(k));
    list.appendChild(b);
  }
  if (!any) { const e = document.createElement('span'); e.className = 'kh-empty'; e.textContent = '持ち駒なし'; list.appendChild(e); }
  el.appendChild(list);
}
