// ためた棋譜(大会の係が、対局者の QR から開いた棋譜をこの端末にためておく箱)。
//
// ■ 何のためか
//   コマドリの QR は study.html#u=<USI> で、棋譜はリンクの中にしかない(# 以降は
//   サーバーに届かない)。大会の係が何局も QR を読むとき、1 局ずつメールするのは手間なので、
//   読んだ分を端末にため、あとでまとめて自分のメールへ送れるようにする。
//
// ■ 決めたこと(オーナー 2026-10-11)
//   ログインもサーバー保存も作らない。棋譜は localStorage(この端末のこのブラウザ)だけに置く。
//   送るのは端末の共有(Web Share)かメールアプリ(mailto)で、このページからはどこへも送らない。
//
// ■ ファイルの形
//   柿木 KIF 仕様 §2 で「.kifu は UTF-8」。ブラウザは Shift-JIS(.kif)を書けないので、
//   UTF-8 の .kifu にする(iOS の KifExport が cp932 にできない字のときに落ちる組と同じ)。
//
// study.html と collect.html の両方から読む。グローバルは window.KifuBox ひとつ。
(function () {
  'use strict';

  var KEY = 'kifuBox';
  var MAIL_KEY = 'kifuBoxMailTo';

  function read() {
    try {
      var a = JSON.parse(localStorage.getItem(KEY) || '[]');
      return Array.isArray(a) ? a : [];
    } catch (e) { return []; }
  }
  // 書けなかった(容量・プライベートブラウズ)ことは呼び手に返す。黙って「ためました」と言わない
  function write(list) {
    try { localStorage.setItem(KEY, JSON.stringify(list)); return true; }
    catch (e) { return false; }
  }

  // 同じ QR を 2 回読んだら、2 局にしない。指し手の列(区切りの違いは無視)で見分ける
  function sameKey(usi) {
    return String(usi || '').split(/[_\s]+/).filter(Boolean).join(' ');
  }
  function find(usi) {
    var k = sameKey(usi);
    var list = read();
    for (var i = 0; i < list.length; i++) {
      if (sameKey(list[i].usi) === k) { return list[i]; }
    }
    return null;
  }

  // 局を足す(同じ棋譜なら、メモだけ直す)。返り値 { ok, item, index, existed }
  function save(entry) {
    var list = read();
    var k = sameKey(entry.usi);
    for (var i = 0; i < list.length; i++) {
      if (sameKey(list[i].usi) === k) {
        list[i].memo = entry.memo || '';
        return { ok: write(list), item: list[i], index: i, existed: true };
      }
    }
    var item = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      usi: entry.usi,
      kif: entry.kif,         // 手合割と指し手(study.html が #u= から作ったもの)
      plies: entry.plies || 0,
      memo: entry.memo || '',
      savedAt: Date.now()
    };
    list.push(item);
    return { ok: write(list), item: item, index: list.length - 1, existed: false };
  }

  function update(id, memo) {
    var list = read();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) { list[i].memo = memo; return write(list); }
    }
    return false;
  }
  function remove(id) {
    return write(read().filter(function (x) { return x.id !== id; }));
  }
  function clear() {
    try { localStorage.removeItem(KEY); return true; } catch (e) { return false; }
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function stamp(ms, sep) {
    var d = new Date(ms);
    return d.getFullYear() + sep + pad(d.getMonth() + 1) + sep + pad(d.getDate());
  }
  function clock(ms) {
    var d = new Date(ms);
    return pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  // ためた 1 局 → .kifu の中身。対局日時は分からないので書かない(読んだ時刻を対局日と偽らない)。
  // メモは「備考」に入れる(KIF 仕様にある欄。回戦・卓の欄は仕様に無い)
  function toKifu(item) {
    var lines = String(item.kif || '').split('\n');
    var head = [], moves = [];
    lines.forEach(function (l) {
      if (/^\s*\d+\s/.test(l)) { moves.push(l); } else if (l.trim()) { head.push(l); }
    });
    var out = ['#KIF version=2.0 encoding=UTF-8'];
    var memo = String(item.memo || '').replace(/[\r\n]+/g, ' ').trim();
    if (memo) { out.push('備考：' + memo); }
    out = out.concat(head);
    out.push('手数----指手---------消費時間--');
    out = out.concat(moves);
    return out.join('\r\n') + '\r\n';
  }

  // ファイル名: メモ_読んだ日.kifu。メモが無ければ「棋譜n」。ファイル名に使えない字は「-」に
  function fileName(item, n) {
    var base = String(item.memo || '').trim() || ('棋譜' + n);
    base = base.replace(/[\\\/:*?"<>|\r\n\t]+/g, '-').replace(/\s+/g, '_').slice(0, 40);
    return base + '_' + stamp(item.savedAt, '') + '.kifu';
  }

  function getMailTo() {
    try { return localStorage.getItem(MAIL_KEY) || ''; } catch (e) { return ''; }
  }
  function setMailTo(v) {
    try { localStorage.setItem(MAIL_KEY, v); } catch (e) {}
  }

  window.KifuBox = {
    list: read, find: find, save: save, update: update, remove: remove, clear: clear,
    toKifu: toKifu, fileName: fileName, stamp: stamp, clock: clock,
    getMailTo: getMailTo, setMailTo: setMailTo
  };
})();
