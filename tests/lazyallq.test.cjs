// Regression: data/questions.js ships Class B only (1236 = 1262 heuristic minus 26
// proven non-B, see data/scope.js); the other 1171 questions live in
// data/questions-more.js and are fetched only when the scope switch says "all".
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');

const html = fs.readFileSync(require.resolve('../index.html'), 'utf8');
const appSource = fs.readFileSync(require.resolve('../app.js'), 'utf8');
const i18nSource = fs.readFileSync(require.resolve('../i18n.js'), 'utf8');

const marker = '  window.__boot = boot;';
assert.equal(appSource.split(marker).length, 2, 'boot marker must be unique');
const instrumented = appSource.replace(marker,
  '  window.testCat = { all: function () { return CAT_ALL; }, by: function () { return BY; }, ensureAllQ: ensureAllQ };\n' + marker);

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
  vm.runInNewContext(i18nSource, context);
  vm.runInNewContext(instrumented, context);
  return { context, scripts };
}

const B = [{ id: '1.1.01-001', th: '1.1', ch: '1.1.01', thd: 'T', the: 'T', chd: 'C', che: 'C', qd: 'Q', qe: 'Q', od: ['a'], oe: ['a'], ans: [0], pt: 4, t: 'single', num: null, cd: '', ce: '' }];

test('index.html ships only the Class B catalog', () => {
  assert.ok(/<script[^>]+data\/questions\.js/.test(html), 'the B catalog stays eager-loaded');
  assert.ok(!/questions-more\.js/.test(html), 'the rest must not be a static script tag');
});

test('app.js can fetch data/questions-more.js on demand', () => {
  assert.ok(appSource.includes('function ensureAllQ()'), 'ensureAllQ present');
  assert.ok(appSource.includes('"data/questions-more.js"'), 'points at data/questions-more.js');
  assert.ok(appSource.includes('window.__ensureAllQ = ensureAllQ'), 'exposed on window');
});

test('the two shipped catalogs add up, with no id in both', () => {
  const bctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(require.resolve('../data/questions.js'), 'utf8'), bctx);
  const mctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(require.resolve('../data/questions-more.js'), 'utf8'), mctx);
  const b = bctx.window.__CATALOG, more = mctx.window.__CATALOG_MORE;
  assert.ok(Array.isArray(b) && Array.isArray(more), 'both files must define their array');
  assert.equal(b.length, 1236, 'Class B count');
  assert.equal(more.length, 1171, 'other classes count');
  assert.equal(bctx.window.__CATALOG_ALL_COUNT, 2407, 'declared total');
  assert.equal(b.length + more.length, bctx.window.__CATALOG_ALL_COUNT, 'parts must add up to the total');
  const seen = new Set(b.map((q) => q.id));
  for (const q of more) assert.ok(!seen.has(q.id), 'id appears in both files: ' + q.id);
});

test('scope "b" boots without fetching the rest', () => {
  const { context, scripts } = load({ scope: 'b' });
  context.window.__CATALOG = B;
  context.window.__CATALOG_ALL_COUNT = 2407;
  context.window.__boot();
  assert.ok(!scripts.some((s) => String(s.src).includes('questions-more')),
    'B learners must not download the other 1171 questions');
  assert.equal(context.window.testCat.all().length, 1);
});

test('scope "all" boots and pulls the rest, then merges it into CAT_ALL', async () => {
  const { context, scripts } = load({ scope: 'all' });
  context.window.__CATALOG = B;
  context.window.__CATALOG_ALL_COUNT = 2407;
  context.window.__boot();
  const tag = scripts.find((s) => String(s.src).includes('questions-more'));
  assert.ok(tag, 'switching to all classes must fetch data/questions-more.js');
  assert.match(String(tag.src), /^data\/questions-more\.js/);
  context.window.__CATALOG_MORE = [{ id: '2.8.01-209', th: '2.8', ch: '2.8.01', thd: 'T', the: 'T', chd: 'C', che: 'C', qd: 'Q', qe: 'Q', od: ['a'], oe: ['a'], ans: [0], pt: 2, t: 'single', num: null, cd: '', ce: '' }];
  tag.onload();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(context.window.testCat.all().length, 2, 'the extra questions must land in CAT_ALL');
  assert.ok(context.window.testCat.by()['2.8.01-209'], 'and be reachable by id');
  assert.equal(context.window.__CATALOG_ALL_COUNT, 2);
});

test('data/scope.js excludes exactly the 26 proven non-B questions', () => {
  const scopeSrc = fs.readFileSync(require.resolve('../data/scope.js'), 'utf8');
  const mctx = { window: {} };
  vm.runInNewContext(scopeSrc, mctx);
  const notb = mctx.window.__NOTB;
  assert.ok(notb && typeof notb === 'object', 'scope.js must define window.__NOTB');
  assert.equal(Object.keys(notb).length, 26, 'exactly the 26 proven non-B');
  const bctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(require.resolve('../data/questions.js'), 'utf8'), bctx);
  const qctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(require.resolve('../data/questions-more.js'), 'utf8'), qctx);
  const b = bctx.window.__CATALOG, more = qctx.window.__CATALOG_MORE;
  for (const q of b) assert.ok(!notb[q.id], q.id + ' ships in the B file but is mapped non-B');
  for (const id of Object.keys(notb)) {
    assert.ok(!b.some((q) => q.id === id), id + ' must not ship in questions.js');
    assert.ok(more.some((q) => q.id === id), id + ' must ship in questions-more.js');
  }
  // spot checks: pure truck/bike content stays out, Grundstoff stays in
  for (const id of ['2.2.22-115', '2.1.03-112', '2.2.04-103']) {
    assert.ok(notb[id], id + ' is proven non-B and must stay out of Class B');
  }
  for (const id of ['2.1.01-101', '1.4.40-013', '1.1.01-001']) {
    assert.ok(!notb[id], id + ' must not be mapped non-B');
  }
});
