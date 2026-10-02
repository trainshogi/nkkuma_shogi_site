// live.js — 撮っている間の仮棋譜(コマドリ Web)
//
// アプリの梅と同じ考え方で、数秒ごとの写真 1 枚から読んだ盤を、いまの局面から指せる手でつなぐ。
// 見るのは盤の上だけ(駒台は見ない)。1 回の写真から続く手は 4 手まで。
// 手で盤が隠れた写真や、読み違えの多い写真で進めないよう、同じ手が 2 回続けて見えたときだけ足す。
// ここで作るのはあくまで仮。対局のあとで録画をサーバで読み直した棋譜に置きかわる。
import { BASE, applyMove } from './shogi.js';
import { destinations, promotion, dropTargets } from './moves.js';

const MAX_DEPTH = 4;
const SQUARES = [];
for (let s = 1; s <= 9; s++) for (let d = 1; d <= 9; d++) SQUARES.push(String(s) + String(d));

// 写真の認識の ban_result(写真の上 = 一段目)を、時計回りに r 回したら先手が下に来る向きで読み直す。
// r は 0 か 180 だけ(横向きの盤は、写真を 90° 回して送ってから呼ぶ)
export function obsFrom(res, r) {
  if (!res || !res.ban_result || !Array.isArray(res.points) || res.points.length !== 4) return null;
  const out = {};
  for (const k in res.ban_result) {
    const v = res.ban_result[k];
    if (!v || v.trim() === '*' || v.trim() === '') continue;
    let s = Number(k[0]); let d = Number(k[1]);
    let side = v[0] === 'v' ? 'gote' : 'sente';
    if (r === 180) { s = 10 - s; d = 10 - d; side = side === 'sente' ? 'gote' : 'sente'; }
    let kind = v.slice(1).trim();
    if (kind === 'gyoku') kind = 'ou';
    out[String(s) + String(d)] = { side, kind };
  }
  return out;
}

function same(a, b) {
  if (!a || !b) return !a && !b;
  return a.side === b.side && a.kind === b.kind;
}

function miss(pos, obs) {
  let n = 0;
  for (const k of SQUARES) if (!same(pos.ban[k], obs[k])) n++;
  return n;
}

// いまの手番の、focus の升から出るか focus の升へ入る手
function movesTouching(pos, focus) {
  const side = pos.teban; const out = [];
  for (const k in pos.ban) {
    const p = pos.ban[k];
    if (p.side !== side) continue;
    const from = [Number(k[0]), Number(k[1])];
    for (const to of destinations(pos, from)) {
      if (!focus.has(k) && !focus.has(String(to[0]) + String(to[1]))) continue;
      const pr = promotion(p.kind, side, from, to);
      if (pr.can) out.push({ from, to, kind: p.kind, promote: true });
      if (!pr.must) out.push({ from, to, kind: p.kind, promote: false });
    }
  }
  // 持ち駒の数は写真から確かめられない(取ってすぐ打つと、どの駒を打ったか盤に残らない)ので、
  // 持ち駒が 1 枚でもあれば、どの駒でも打てることにする。持っている駒を先に試す
  const hand = pos.hands[side];
  if (Object.values(hand).some((n) => n > 0)) {
    const kinds = ['hi', 'ka', 'ki', 'gi', 'ke', 'ky', 'fu'].sort((a, b) => (hand[b] > 0) - (hand[a] > 0));
    for (const kind of kinds) {
      for (const to of dropTargets(pos, kind, side)) {
        if (focus.has(String(to[0]) + String(to[1]))) out.push({ from: null, to, kind, promote: false });
      }
    }
  }
  return out;
}

const boardKey = (pos) => SQUARES.map((k) => (pos.ban[k] ? pos.ban[k].side[0] + pos.ban[k].kind : '')).join(',');

// いまの局面から、写真の盤にいちばん近づく手順(0〜4 手)。短い手順から順にさがし、
// 読み違えがふだん並み(good 以下)の手順が見つかったらそこでやめる。
// prefer: 前の写真で見えた手順。盤が同じになる手順が複数あるとき(持ち駒のどれを打ったか等)はこちらを選ぶ。
// 返り値 { seq, pos, miss, miss0, ambiguous }。ambiguous は、盤のちがう局面が同じだけ近いとき
export function follow(start, obs, prefer, good = 0, budgetMs = 150, worstIn = null) {
  const miss0 = miss(start, obs);
  let best = { seq: [], pos: start, miss: miss0, pref: 0 };
  let tie = false; let nodes = 0; let out = false;
  const t0 = Date.now();
  // good より 2 以上悪い手順は使わないので、そこへ届かない枝は見ない
  const worst = worstIn == null ? good + 2 : worstIn;
  const prefLen = (seq) => {
    let n = 0;
    while (prefer && n < prefer.length && n < seq.length && sameMove(prefer[n].move, seq[n].move)) n++;
    return n;
  };
  const walk = (pos, seq, m, depth) => {
    if ((++nodes & 255) === 0 && Date.now() - t0 > budgetMs) out = true;
    if (out) return;
    if (seq.length === depth) {
      const better = m < best.miss || (m === best.miss && seq.length < best.seq.length);
      if (better) { best = { seq, pos, miss: m, pref: prefLen(seq) }; tie = false; } else if (m === best.miss && seq.length === best.seq.length) {
        if (boardKey(pos) !== boardKey(best.pos)) tie = true;
        else { const pl = prefLen(seq); if (pl > best.pref) best = { seq, pos, miss: m, pref: pl }; }
      }
      return;
    }
    // 1 手で変わる升は 2 つまで
    if (m - 2 * (depth - seq.length) > Math.min(best.miss, worst)) return;
    const focus = new Set();
    for (const k of SQUARES) if (!same(pos.ban[k], obs[k])) focus.add(k);
    if (!focus.size) return;
    for (const mv of movesTouching(pos, focus)) {
      const next = applyMove(pos, mv, pos.teban);
      walk(next, seq.concat([{ move: mv, side: pos.teban }]), miss(next, obs), depth);
    }
  };
  if (miss0 > 0) {
    for (let depth = 1; depth <= MAX_DEPTH && !out; depth++) {
      walk(start, [], miss0, depth);
      if (best.seq.length && best.miss <= good) break;
    }
  }
  return { seq: best.seq, pos: best.pos, miss: best.miss, miss0, ambiguous: tie && best.seq.length > 0 };
}

export class LiveDraft {
  constructor(start) {
    this.start = start;
    this.pos = start;
    this.plies = [];      // [{ move, side }]
    this.floor = null;    // 読み違えの升の数の、ふだんの値
    this.pending = null;  // 1 回だけ見えた手順
  }

  // 写真 1 枚ぶん。手を足したら true
  feed(obs) {
    if (!obs) return false;
    const floor = this.floor == null ? 0 : this.floor;
    let r = follow(this.pos, obs, this.pending, floor);
    if (this.floor == null) this.floor = r.miss;
    const usable = (x) => x.seq.length && !x.ambiguous && x.miss <= this.floor + 2 && x.miss < x.miss0;
    let partial = false;
    if (!usable(r) && r.miss0 > this.floor + 2) {
      // 何手も遅れたとき: 升が 4 つ以上(2 手ぶん以上)合う手順があれば、次の写真でも同じに見えたら足して追いつく
      const c = follow(this.pos, obs, this.pending, floor, 150, r.miss0 - 4);
      if (c.seq.length && c.miss <= r.miss0 - 4) { r = c; partial = true; }
    }
    if (!r.seq.length) { this.floor = Math.min(this.floor, r.miss); this.pending = null; return false; }
    if (!partial && !usable(r)) { this.pending = null; return false; }
    // 読み違えがふだん並みで、盤の升が 2 つ以上そろって合うなら、そのまま足す
    let n = 0;
    if (!partial && r.miss <= this.floor && r.miss0 - r.miss >= 2) n = r.seq.length;
    else if (this.pending) {
      // 前に 1 回見えた手順が、今回の手順の頭と同じなら、そこまでを足す
      while (n < this.pending.length && n < r.seq.length && sameMove(this.pending[n].move, r.seq[n].move)) n++;
      if (n < this.pending.length) n = 0;
    }
    if (!n) { this.pending = r.seq; return false; }
    for (const pl of r.seq.slice(0, n)) { this.pos = applyMove(this.pos, pl.move, pl.side); this.plies.push(pl); }
    this.pending = r.seq.length > n ? r.seq.slice(n) : null;
    if (!this.pending && !partial) this.floor = r.miss;
    return true;
  }
}

function sameMove(a, b) {
  const eq = (x, y) => (!x && !y) || (x && y && x[0] === y[0] && x[1] === y[1]);
  return eq(a.from, b.from) && eq(a.to, b.to) && a.kind === b.kind && !!a.promote === !!b.promote;
}
