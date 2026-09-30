// moves.js — 駒の動き(盤で直すときの行き先の点と、ぴよ将棋へ渡す前の反則の見分け)
//
// 見るのは駒の動きと、二歩・行きどころのない駒だけ(Android ShogiRules.isPseudoLegal と同じ線)。
// 王手放置と打ち歩詰めは見ない。指せない手はサーバが 422 で断る。
import { PROMOTE, BASE, usiToMove, applyMove, parseSfen } from './shogi.js';

const GOLD = [[0, -1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1]];
const STEPS = {
  fu: [[0, -1]],
  ke: [[1, -2], [-1, -2]],
  gi: [[0, -1], [1, -1], [-1, -1], [1, 1], [-1, 1]],
  ki: GOLD, to: GOLD, ny: GOLD, nk: GOLD, ng: GOLD,
  ou: [[0, -1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [1, 1], [-1, 1]],
  um: [[0, -1], [1, 0], [-1, 0], [0, 1]],
  ry: [[1, -1], [-1, -1], [1, 1], [-1, 1]],
};
const SLIDES = {
  ky: [[0, -1]],
  ka: [[1, -1], [-1, -1], [1, 1], [-1, 1]],
  um: [[1, -1], [-1, -1], [1, 1], [-1, 1]],
  hi: [[0, -1], [1, 0], [-1, 0], [0, 1]],
  ry: [[0, -1], [1, 0], [-1, 0], [0, 1]],
};
const key = (s, d) => String(s) + String(d);
const onBoard = (s, d) => s >= 1 && s <= 9 && d >= 1 && d <= 9;

// 先手から見た「前」は段が減る向き。筋は先手から見て左が 9。dx は筋の増える向き(先手の左)
function dir(side, dx, dy) { return side === 'sente' ? [dx, dy] : [-dx, -dy]; }

export function destinations(pos, from) {
  const p = pos.ban[key(from[0], from[1])];
  if (!p) return [];
  const out = [];
  const tryAdd = (s, d) => {
    if (!onBoard(s, d)) return false;
    const q = pos.ban[key(s, d)];
    if (q && q.side === p.side) return false;
    out.push([s, d]);
    return !q;
  };
  for (const [dx, dy] of STEPS[p.kind] || []) {
    const [ax, ay] = dir(p.side, dx, dy);
    tryAdd(from[0] + ax, from[1] + ay);
  }
  for (const [dx, dy] of SLIDES[p.kind] || []) {
    const [ax, ay] = dir(p.side, dx, dy);
    let s = from[0] + ax; let d = from[1] + ay;
    while (tryAdd(s, d)) { s += ax; d += ay; }
  }
  return out;
}

// 相手の陣(先手は 1〜3 段)
const inZone = (side, d) => (side === 'sente' ? d <= 3 : d >= 7);
// 行きどころのない段(歩・香は最奥、桂は奥 2 段)
function deadRank(kind, side, d) {
  const far = side === 'sente' ? d : 10 - d;
  if (kind === 'fu' || kind === 'ky') return far === 1;
  if (kind === 'ke') return far <= 2;
  return false;
}

// 成れるか / 成らなければならないか
export function promotion(kind, side, from, to) {
  if (!PROMOTE[kind] || !from) return { can: false, must: false };
  const can = inZone(side, from[1]) || inZone(side, to[1]);
  return { can, must: can && deadRank(kind, side, to[1]) };
}

export function dropTargets(pos, kind, side) {
  const out = [];
  for (let s = 1; s <= 9; s++) {
    let pawn = false;
    if (kind === 'fu') {
      for (let d = 1; d <= 9; d++) { const q = pos.ban[key(s, d)]; if (q && q.side === side && q.kind === 'fu') pawn = true; }
    }
    for (let d = 1; d <= 9; d++) {
      if (pos.ban[key(s, d)] || pawn || deadRank(kind, side, d)) continue;
      out.push([s, d]);
    }
  }
  return out;
}

export function isPseudoLegal(pos, move, side) {
  if (!move.from) {
    const k = BASE[move.kind] || move.kind;
    if (!(pos.hands[side][k] > 0)) return false;
    return dropTargets(pos, k, side).some((t) => t[0] === move.to[0] && t[1] === move.to[1]);
  }
  const p = pos.ban[key(move.from[0], move.from[1])];
  if (!p || p.side !== side) return false;
  if (!destinations(pos, move.from).some((t) => t[0] === move.to[0] && t[1] === move.to[1])) return false;
  const pr = promotion(p.kind, side, move.from, move.to);
  if (move.promote && !pr.can) return false;
  if (!move.promote && pr.must) return false;
  return true;
}

// USI の手順で、最初の反則の手(1 始まり)。なければ 0
export function firstFoul(startSfen, usiMoves) {
  let pos = parseSfen(startSfen);
  for (let i = 0; i < usiMoves.length; i++) {
    const m = usiToMove(usiMoves[i], pos);
    if (!isPseudoLegal(pos, m, pos.teban)) return i + 1;
    pos = applyMove(pos, m, pos.teban);
  }
  return 0;
}
