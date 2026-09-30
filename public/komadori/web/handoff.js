// handoff.js — ほかのアプリ・サイトへ渡す(コマドリ Web)
//
// 並びと文はアプリ(komadori-android ui/HandoffDestination.kt)の写し。
// ボタンを置くのは、押したあとの手順が言える相手だけ。Android のアプリでリンク一本で開くのはぴよ将棋だけ。
// URL は公式の文書にある形だけ:
//   ぴよ将棋 / ぴよ将棋w … ?sfen=position startpos moves …
//   KENTO             … ?initpos=<SFEN>&branch=<手>.<手>…&branchFrom=0
//   SHOGI-EXTEND      … /adapter?body=<棋譜>
import { firstFoul } from './moves.js';
import { HANDICAP_SFENS } from './shogi.js';

const OPEN_IN = '将棋所・ShogiGUI・ShogiHomeで開いてください。';

export const GROUPS = [
  {
    title: 'このAndroidのアプリ',
    items: [
      { id: 'piyo', label: 'ぴよ将棋', way: 'リンクで開く', act: 'link', note: 'ぴよ将棋を開きました。この一局が並んでいます。' },
      { id: 'droid', label: 'ShogiDroid2', way: '共有で送る', act: 'share', note: 'KIFを共有の画面に出しました。ShogiDroid2を選ぶと読み込めます。' },
      { id: 'kfa', label: 'Kifu for Android', way: 'KIFをコピー', act: 'copy', note: 'KIFをコピーしました。Kifu for Androidの貼り付けから読み込んでください。' },
      { id: 'log', label: '将棋ログ', way: 'ファイルで送る', act: 'share', note: 'KIFを共有の画面に出しました。将棋ログを選ぶか、ファイルに置いてから読み込んでください。' },
      { id: 'cosmos', label: 'Shogi Cosmos', way: 'KIFをコピー', act: 'copy', note: 'KIFをコピーしました。Shogi Cosmosのクリップボードから読み込んでください。' },
      { id: 'lab', label: '将棋Lab', way: 'ファイルで送る', act: 'share', note: 'KIFを共有の画面に出しました。将棋Labを選ぶか、ファイルに置いてから読み込んでください。' },
    ],
  },
  {
    title: 'ブラウザで開く',
    items: [
      { id: 'piyow', label: 'ぴよ将棋w', way: 'リンクで開く', act: 'link', note: 'ぴよ将棋wを開きました。この一局が並んでいます。' },
      { id: 'kento', label: 'KENTO', way: 'リンクで開く', act: 'link', note: 'KENTOを開きました。この一局が並んでいます。' },
      { id: 'extend', label: 'SHOGI-EXTEND', way: 'リンクで開く', act: 'link', note: 'SHOGI-EXTENDを開きました。そこからぴよ将棋やKENTOへも渡せます。' },
      { id: 'lishogi', label: 'Lishogi', way: 'コピーして開く', act: 'copyopen', url: 'https://lishogi.org/paste', note: 'KIFをコピーして、Lishogiの棋譜の読み込みを開きました。貼って読み込んでください。' },
      { id: 'mito', label: 'みと将棋', way: 'KIFをコピー', act: 'copy', note: 'KIFをコピーしました。ブラウザでみと将棋を開き、貼ってください。' },
    ],
  },
  {
    title: 'パソコンへ届ける',
    lead: '将棋所・ShogiGUI・ShogiHomeは、このAndroidから直接は開けません。KIFをパソコンへ届けてから開きます。',
    items: [
      { id: 'mail', label: 'メールで送る', way: '添付して届ける', act: 'share', note: 'KIFを共有の画面に出しました。メールを選んで送り、パソコンで添付を保存してから、' + OPEN_IN },
      { id: 'drive', label: 'ドライブに置く', way: 'Google Drive', act: 'share', note: 'KIFを共有の画面に出しました。ドライブに置き、パソコンでそのファイルを' + OPEN_IN },
      { id: 'nearby', label: '近くのパソコン', way: 'クイック共有', act: 'share', note: 'KIFを共有の画面に出しました。クイック共有で近くのパソコンへ送り、届いたファイルを' + OPEN_IN },
    ],
  },
  {
    title: '相手のスマホで開く',
    items: [
      { id: 'qr', label: 'QRコード', way: 'QRを出す', act: 'qr', note: '相手のスマホのカメラで読むと、ブラウザでこの一局が開きます。' },
    ],
  },
];

export const DIRECT_LIMIT = '将棋ウォーズ・将棋クエスト・将棋倶楽部24には、こちらから棋譜を渡せません。検討するときは、ぴよ将棋かブラウザに渡してください。';

export function encode(text) {
  return encodeURIComponent(text).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

// game: { startSfen, isHirate, usiMoves }
export function usiLine(game, upto) {
  const moves = upto == null ? game.usiMoves : game.usiMoves.slice(0, upto);
  const head = game.isHirate ? 'position startpos' : 'position sfen ' + game.startSfen;
  return head + (moves.length ? ' moves ' + moves.join(' ') : '');
}

export function studyUrl(game) {
  return 'https://shogi.nkkuma.tokyo/study.html#u=' + usiLine(game).replace(/ /g, '_').replace(/\+/g, '%2B');
}

// ぴよ将棋(アプリ)は反則が 1 手でもあると一局ごと断るので、最初の反則の手前まで渡す(PiyoFoul と同じ)
export function piyoAppCut(game) {
  const foul = firstFoul(game.startSfen, game.usiMoves);
  return foul ? foul - 1 : null;
}

export function linkUrl(id, game) {
  const usi = usiLine(game);
  if (id === 'piyo') {
    const cut = piyoAppCut(game);
    return 'piyoshogi://?sfen=' + encode(usiLine(game, cut == null ? undefined : cut));
  }
  if (id === 'piyow') return 'https://www.studiok-i.net/kifu/?sfen=' + encode(usi);
  if (id === 'kento') {
    return 'https://www.kento-shogi.com/?initpos=' + encode(game.isHirate ? HANDICAP_SFENS['平手'] : game.startSfen) +
      '&branch=' + encode(game.usiMoves.join('.')) + '&branchFrom=0';
  }
  if (id === 'extend') return 'https://www.shogi-extend.com/adapter?body=' + encode(usi);
  return null;
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch (e) { /* 下へ */ }
  const ta = document.createElement('textarea');
  ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
  ta.remove();
  return ok;
}

// KIF は Shift_JIS でなく UTF-8(BOM つき)。将棋所・ShogiGUI・ShogiHome・Android の各アプリが読める形
export function kifFile(kif, name) {
  return new File(['﻿' + kif], name, { type: 'text/plain' });
}

// 共有の画面に出す。出せない端末ではダウンロードに保存して false
export async function shareFile(file) {
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: file.name }); return 'shared'; } catch (e) {
      if (e && e.name === 'AbortError') return 'cancel';
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file); a.download = file.name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return 'downloaded';
}

export function qrSvg(text) {
  const qr = window.qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
}

// X・Facebook に載せる文とリンク
export function shareUrls(game, info) {
  const url = studyUrl(game);
  const names = info.sente || info.gote ? '▲' + (info.sente || '先手') + ' 対 ' + (info.gote || '後手') + '△ ' : '';
  const text = info.plies + '手の棋譜ができました。' + names + '#コマドリ';
  return {
    x: 'https://twitter.com/intent/tweet?text=' + encode(text) + '&url=' + encode(url),
    facebook: 'https://www.facebook.com/sharer/sharer.php?u=' + encode(url),
  };
}
