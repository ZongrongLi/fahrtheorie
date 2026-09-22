// Regression: i18n.js ships the English pack only (the default + the fallback);
// the other 9 UI packs live in i18n-more.js and load only when the site language needs one.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');

const html = fs.readFileSync(require.resolve('../index.html'), 'utf8');
const appSource = fs.readFileSync(require.resolve('../app.js'), 'utf8');

const marker = '  window.__boot = boot;';
assert.equal(appSource.split(marker).length, 2, 'boot marker must be unique');
const instrumented = appSource.replace(marker,
  '  window.testI18n = { ensure: ensureI18n };\n' + marker);

function stubNode() {
  return {
    innerHTML: '', textContent: '', className: '', inserted: '', removed: false, hidden: false, open: false,
    setAttribute() {}, appendChild() {}, remove() { this.removed = true; },
    insertAdjacentHTML(_pos, h) { this.inserted += h; },
    focus() {}, scrollIntoView() {},
    classList: { contains() { return false; }, add() {}, remove() {}, toggle() {} },
  };
}

function load(prefs) {
  const nodes = {}, scripts = [], listeners = {};
  const context = {
    window: { addEventListener() {}, scrollTo() {} },
    console,
    location: { search: '', hash: '#/home', pathname: '/', href: '' },
    history: { replaceState() {} },
    document: {
      documentElement: { attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; } },
      readyState: 'loading',
      addEventListener(t, fn) { (listeners[t] = listeners[t] || []).push(fn); },
      createElement: () => { const n = stubNode(); scripts.push(n); return n; },
      body: { appendChild() {} },
      head: { appendChild() {} },
      getElementById(id) { if (!nodes['#' + id]) nodes['#' + id] = stubNode(); return nodes['#' + id]; },
      querySelectorAll: () => [],
      querySelector() { return null; },
    },
    localStorage: { getItem: (k) => (k === 'dtt.prefs' ? JSON.stringify(prefs) : null), setItem() {}, removeItem() {} },
    fetch: () => Promise.reject(new Error('offline')),
    setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
    TextEncoder, TextDecoder,
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../i18n.js'), 'utf8'), context);
  vm.runInNewContext(instrumented, context);
  return { context, scripts };
}

const B = [{ id: '1.1.01-001', th: '1.1', ch: '1.1.01', thd: 'T', the: 'T', chd: 'C', che: 'C', qd: 'Q', qe: 'Q', od: ['a'], oe: ['a'], ans: [0], pt: 4, t: 'single', num: null, cd: '', ce: '' }];

test('index.html ships only the English pack', () => {
  assert.ok(/<script[^>]+i18n\.js/.test(html), 'i18n.js stays eager-loaded');
  assert.ok(!/i18n-more\.js/.test(html), 'the other packs must not be a static script tag');
});

test('app.js can fetch i18n-more.js on demand', () => {
  assert.ok(appSource.includes('function ensureI18n()'), 'ensureI18n present');
  assert.ok(appSource.includes('"i18n-more.js"'), 'points at i18n-more.js');
  assert.ok(appSource.includes('window.__ensureI18n = ensureI18n'), 'exposed on window');
});

test('the split kept every pack complete (same key set as English)', () => {
  const ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(require.resolve('../i18n.js'), 'utf8'), ctx);
  vm.runInNewContext(fs.readFileSync(require.resolve('../i18n-more.js'), 'utf8'), ctx);
  const en = ctx.window.I18N.en, more = ctx.window.I18N_MORE;
  const enKeys = Object.keys(en).sort();
  assert.ok(enKeys.length > 300, 'English pack looks truncated: ' + enKeys.length);
  assert.deepEqual(Object.keys(ctx.window.I18N).sort(), ['en'], 'i18n.js must carry English only');
  for (const code of ['zh', 'de', 'ru', 'tr', 'uk', 'pl', 'ro', 'vi', 'ar']) {
    assert.ok(more[code], 'missing pack ' + code);
    assert.deepEqual(Object.keys(more[code]).sort(), enKeys, 'pack ' + code + ' has a different key set');
  }
});

test('an English visitor never downloads the other packs', () => {
  const { context, scripts } = load({ uiLang: 'en', scope: 'b' });
  context.window.__CATALOG = B;
  context.window.__CATALOG_ALL_COUNT = 1;
  context.window.__boot();
  assert.ok(!scripts.some((s) => String(s.src).includes('i18n-more')),
    'English must not pay for the other 9 packs');
});

test('a German visitor pulls the packs before the first render', () => {
  const { context, scripts } = load({ uiLang: 'de', scope: 'b' });
  context.window.__CATALOG = B;
  context.window.__CATALOG_ALL_COUNT = 1;
  const tag = scripts.find((s) => String(s.src).includes('i18n-more'));
  assert.ok(tag, 'a non-English site language must fetch i18n-more.js');
  assert.match(String(tag.src), /^i18n-more\.js/);
});

test('ensureI18n merges the packs into window.I18N once the script lands', async () => {
  const { context, scripts } = load({ uiLang: 'de', scope: 'b' });
  const tag = scripts.find((s) => String(s.src).includes('i18n-more'));
  /* execute the REAL file, not a hand-written stub — the global name must match */
  vm.runInNewContext(fs.readFileSync(require.resolve('../i18n-more.js'), 'utf8'), context);
  tag.onload();
  const ok = await context.window.testI18n.ensure();
  assert.equal(ok, true);
  assert.equal(context.window.I18N.en['nav.home'], 'Home', 'English base is still there');
  assert.equal(context.window.I18N.de['nav.home'], 'Startseite', 'German pack must be merged in');
});
