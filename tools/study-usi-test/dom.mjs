// study.html の <script> をそのまま node で走らせるための最小DOM。
// 実ページのコードを1行も書き換えずに読み込むのが目的(写しを作らない)。
import fs from 'fs';

class El {
  constructor(tag, id) {
    this.tagName = (tag || 'div').toUpperCase();
    this.id = id || '';
    this._children = [];
    this._cls = new Set();
    this._attrs = {};
    this.textContent = '';
    this.value = '';
    this.hidden = false;
    this.disabled = false;
    this.style = {};
    this.offsetTop = 0; this.offsetHeight = 10; this.scrollTop = 0; this.clientHeight = 100;
    this.listeners = {};
    const self = this;
    this.classList = {
      add: (...c) => c.forEach(x => self._cls.add(x)),
      remove: (...c) => c.forEach(x => self._cls.delete(x)),
      contains: c => self._cls.has(c),
      toggle: (c, on) => { const v = on === undefined ? !self._cls.has(c) : !!on;
                           if (v) self._cls.add(c); else self._cls.delete(c); return v; },
    };
  }
  get className() { return [...this._cls].join(' '); }
  set className(v) { this._cls = new Set(String(v).split(/\s+/).filter(Boolean)); }
  set innerHTML(v) { this._html = v; if (v === '') this._children = []; }
  get innerHTML() { return this._html || ''; }
  appendChild(c) { this._children.push(c); return c; }
  addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); }
  removeEventListener() {}
  querySelector() { return null; }
  querySelectorAll() { return []; }
  closest() { return null; }
  setAttribute(k, v) { this._attrs[k] = String(v); }
  getAttribute(k) { return this._attrs[k] === undefined ? null : this._attrs[k]; }
  scrollIntoView() {}
  focus() {}
}

export function run(htmlPath, { hash = '', search = '', storage = {} } = {}) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const m = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  let src = m[m.length - 1][1];
  // テスト用に内部を1つだけ外へ出す(ページ側のコードは変えない)
  const tail = src.lastIndexOf('})();');
  src = src.slice(0, tail) +
    'globalThis.__t = { viewer: viewer, toSfen: toSfen, parseSfen: parseSfen, ' +
    'parseKif: parseKif, startPosFor: startPosFor, loadUsiMoves: loadUsiMoves, el: $, ' +
    'showPositionLabel: showPositionLabel, ' +
    'parseUsiPosition: (typeof parseUsiPosition === "function" ? parseUsiPosition : null), ' +
    'HANDICAP_SFENS: (typeof HANDICAP_SFENS !== "undefined" ? HANDICAP_SFENS : null), ' +
    'handicapNameFor: (typeof handicapNameFor === "function" ? handicapNameFor : null) };\n' +
    src.slice(tail);

  const els = {};
  const doc = {
    getElementById: id => (els[id] = els[id] || new El('div', id)),
    createElement: t => new El(t),
    querySelector: () => new El('div'),
    querySelectorAll: () => [],
    addEventListener: () => {},
  };
  const win = {
    document: doc,
    location: { hash, search, origin: 'https://shogi.nkkuma.tokyo', pathname: '/study.html' },
    localStorage: {
      getItem: k => (k in storage ? storage[k] : null),
      setItem: (k, v) => { storage[k] = String(v); },
    },
    addEventListener: () => {},
    URLSearchParams, JSON, Math, Number, String, Array, Date, RegExp, Object, isNaN,
    fetch: () => Promise.reject(new Error('no network in test')),
    setTimeout, clearTimeout, encodeURIComponent, decodeURIComponent, alert: () => {},
    open: () => {}, console,
  };
  win.window = win;
  const f = new Function('window', 'document', 'location', 'localStorage', 'globalThis',
                         'with (window) { ' + src + ' }');
  f(win, doc, win.location, win.localStorage, globalThis);
  const t = globalThis.__t;
  t.els = els;
  return t;
}
