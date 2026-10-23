// Progress cloud sync: local first, account follows.
// Runs app.js in a VM with stubbed DOM/storage/fetch, like startup.test.cjs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');

const appSource = fs.readFileSync(require.resolve('../app.js'), 'utf8');
const i18nSource = fs.readFileSync(require.resolve('../i18n.js'), 'utf8');
const scopeSource = fs.readFileSync(require.resolve('../data/scope.js'), 'utf8');
const marker = '  window.__boot = boot;';
assert.equal(appSource.split(marker).length, 2, 'boot marker must be unique');
const instrumented = appSource.replace(marker,
  '  window.testProg = { serialize: progSerialize, merge: progMerge, push: progPush, pull: progPull,\n' +
  '    status: progStatusText, sync: function () { return progSync; },\n' +
  '    saveState: saveState,\n' +
  '    getState: function () { return state; }, setState: function (s) { state = s; },\n' +
  '    getPrefs: function () { return prefs; } };\n' + marker);

function stubNode() {
  return {
    innerHTML: '', textContent: '', className: '', inserted: '', removed: false, open: false,
    setAttribute() {}, appendChild() {}, remove() { this.removed = true; },
    insertAdjacentHTML(_pos, html) { this.inserted += html; },
    focus() {},
    classList: { contains() { return false; }, add() {}, remove() {}, toggle() {} },
  };
}

function load({ prefs = {}, progress = null, ls = {}, post = null } = {}) {
  const nodes = {}, calls = [], bodies = [], inits = [];
  const timers = [];
  const store = Object.assign({}, ls);
  const listeners = {};
  const fakeSetTimeout = (fn, ms) => { timers.push({ fn, ms, cleared: false }); return timers.length; };
  const fakeClearTimeout = (id) => { if (timers[id - 1]) timers[id - 1].cleared = true; };
  const context = {
    window: { addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); }, scrollTo() {} },
    console,
    location: { search: '', hash: '#/home', pathname: '/' },
    history: { replaceState() {} },
    document: {
      documentElement: { attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; } },
      hidden: false,
      readyState: 'loading',
      addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
      createElement: () => stubNode(),
      body: { appendChild() {} },
      head: { appendChild() {} },
      getElementById(id) { if (!nodes['#' + id]) nodes['#' + id] = stubNode(); return nodes['#' + id]; },
      querySelectorAll: () => [],
      querySelector(sel) {
        const m = /\[data-role="([^"]+)"\]/.exec(sel);
        if (!m) return null;
        if (!nodes[m[1]]) nodes[m[1]] = stubNode();
        return nodes[m[1]];
      },
    },
    localStorage: {
      getItem: (k) => (k === 'dtt.prefs' ? JSON.stringify(prefs) : (k in store ? store[k] : null)),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
    },
    fetch: (url, init) => {
      calls.push(String(url));
      bodies.push(init && init.body ? String(init.body) : '');
      inits.push(init || {});
      if (post) return post(url, init, { calls, bodies, inits });
      if (/\/api\/progress$/.test(String(url))) {
        if (init && init.method === 'POST') {
          const b = JSON.parse(init.body);
          if (b && b.wipe) progress = { q: b.q || {}, notes: b.notes || {}, days: b.days || {}, goal: b.goal || 20, savedAt: b.savedAt || 0 };
          else progress = Object.assign({}, progress, b);
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, progress }) });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ progress }) });
      }
      return Promise.reject(new Error('unexpected ' + url));
    },
    setTimeout: fakeSetTimeout,
    clearTimeout: fakeClearTimeout,
    setInterval: () => 0, clearInterval: () => {},
    TextEncoder, TextDecoder,
    confirm: () => true,
  };
  vm.runInNewContext(i18nSource, context);
  vm.runInNewContext(scopeSource, context);
  vm.runInNewContext(instrumented, context);
  context.window.__CATALOG = [
    { id: '1.1.01-001', th: '1.1', ch: '1.1.01', thd: 'T', the: 'T', chd: 'C', che: 'C',
      qd: 'Q1', qe: 'Q1', od: ['a', 'b'], oe: ['a', 'b'], ans: [0], pt: 4, t: 'single',
      num: null, img: null, vid: null, cd: '', ce: '' },
    { id: '1.1.01-002', th: '1.1', ch: '1.1.01', thd: 'T', the: 'T', chd: 'C', che: 'C',
      qd: 'Q2', qe: 'Q2', od: ['a', 'b'], oe: ['a', 'b'], ans: [1], pt: 3, t: 'single',
      num: null, img: null, vid: null, cd: '', ce: '' },
  ];
  context.window.__boot();
  const click = (act) => {
    const fakeEl = { getAttribute: (k) => (k === 'data-act' ? act : null), classList: { contains: () => false } };
    listeners.click.forEach((fn) => fn({ target: { closest: (sel) => (String(sel).includes('[data-act]') ? fakeEl : null) } }));
  };
  return { context, nodes, calls, bodies, inits, store, listeners, timers, click };
}

const tick = () => new Promise((r) => setTimeout(r, 20));
const signedIn = { apiBase: 'https://dtt-backend.tiancai110a.workers.dev', token: 'tok', uid: 'u1', user: 'a@b.c' };

test('login pulls cloud progress and merges it over the local one', async () => {
  const P = load({ prefs: signedIn, progress: {
    q: { '1.1.01-001': { a: 5, w: 0, r: 5, last: true, wrong: false, at: 2000 } },
    notes: {}, days: { '2026-09-21': 9 }, goal: 20, savedAt: 2000 } });
  P.context.window.testProg.setState({ q: { '1.1.01-001': { a: 2, w: 1, r: 1, last: false, wrong: true, at: 1000 } },
    notes: {}, tr: {}, ai: {}, days: {}, goal: 20 });
  P.context.window.testProg.pull();
  await tick();
  const st = P.context.window.testProg.getState();
  assert.equal(st.q['1.1.01-001'].a, 5, 'newer cloud answer wins by timestamp');
  assert.equal(st.days['2026-09-21'], 9);
  const gets = P.calls.filter((c) => /\/api\/progress$/.test(c));
  const posts = P.bodies.filter((b) => b && b.includes('1.1.01-001'));
  assert.ok(gets.length >= 1, 'pull hits GET');
  assert.equal(JSON.parse(posts[0]).q['1.1.01-001'].a, 5, 'merged state is pushed back');
});

test('logout with a backend account drops the local progress, guests keep theirs', () => {
  const P = load({ prefs: Object.assign({}, signedIn) });
  P.context.window.testProg.setState({ q: { '1.1.01-001': { a: 4, w: 0, r: 4, last: true, wrong: false, at: 100 } },
    notes: {}, tr: {}, ai: {}, days: {}, goal: 20 });
  P.click('logout');
  assert.equal(JSON.stringify(P.context.window.testProg.getState().q), '{}', 'backend logout must not leak progress into the next account');
  assert.equal(P.store['dtt.state.v1'] !== undefined && JSON.parse(P.store['dtt.state.v1']).q['1.1.01-001'], undefined);

  const G = load({ prefs: { user: 'local', uid: 'ux' } });
  G.context.window.testProg.setState({ q: { '1.1.01-001': { a: 4, w: 0, r: 4, last: true, wrong: false, at: 100 } },
    notes: {}, tr: {}, ai: {}, days: {}, goal: 20 });
  G.click('logout');
  assert.equal(G.context.window.testProg.getState().q['1.1.01-001'].a, 4, 'local-only users must not lose their only copy');
});

test('serialize prunes untouched entries so uploads stay small', () => {
  const P = load({ prefs: signedIn });
  P.context.window.testProg.setState({
    q: { e0: { a: 0, w: 0, r: 0, last: null, wrong: false, at: 0 },
         e1: { a: 2, w: 0, r: 2, last: true, wrong: false, at: 10 },
         e2: { a: 0, w: 0, r: 0, last: null, wrong: true, at: 11 },
         e3: { a: 0, w: 0, r: 0, last: null, wrong: false, at: 12, bm: true } },
    notes: { n: { text: 'x'.repeat(5000), at: 5 } }, tr: { big: 'nope' }, ai: { big: 'nope' }, days: {}, goal: 20 });
  const p = P.context.window.testProg.serialize();
  assert.equal(p.q.e0, undefined, 'never-touched entries are dropped');
  assert.equal(p.q.e1.a, 2);
  assert.equal(p.q.e2.wrong, true, 'wrong-only entries survive');
  assert.equal(p.q.e3.bm, true, 'bookmark-only entries survive');
  assert.ok(p.notes.n.text.length <= 16384, 'notes are capped');
  assert.equal(JSON.stringify(p).includes('nope'), false, 'translation/AI caches never leave the device');
});

test('leaving the page flushes progress immediately instead of waiting for the debounce', async () => {
  const P = load({ prefs: signedIn });
  P.context.window.testProg.setState({ q: { '1.1.01-001': { a: 1, w: 0, r: 1, last: true, wrong: false, at: 50 } },
    notes: {}, tr: {}, ai: {}, days: {}, goal: 20 });
  assert.ok(P.listeners.pagehide && P.listeners.pagehide.length, 'pagehide flush must be registered');
  P.listeners.pagehide.forEach((fn) => fn());
  await tick();
  const idx = P.calls.findIndex((c, i) => /\/api\/progress$/.test(c) && (P.bodies[i] || '').includes('savedAt'));
  assert.ok(idx >= 0, 'exactly one immediate push, no polling loop');
  assert.equal(JSON.parse(P.bodies[idx]).q['1.1.01-001'].a, 1);
});

test('a 200 response without the submitted question is not accepted as saved', async () => {
  let posts = 0;
  const P = load({
    prefs: signedIn,
    progress: { q: {}, notes: {}, days: {}, goal: 20, savedAt: 1 },
    post: (_url, init) => {
      posts++;
      if (!init || init.method !== 'POST') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ progress: null }) });
      }
      /* Simulate the dangerous server reply: success status, but the submitted answer is absent. */
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({
        ok: true, progress: { q: {}, notes: {}, days: {}, goal: 20, savedAt: 2 },
      }) });
    },
  });
  P.context.window.testProg.setState({ q: { '1.1.01-001': { a: 1, w: 0, r: 1, last: true, wrong: false, at: 50 } },
    notes: {}, tr: {}, ai: {}, days: { '2026-10-23': 1 }, goal: 20 });
  P.context.window.testProg.push(true);
  await tick();
  assert.ok(posts >= 2, 'the failed acknowledgement must schedule a retry');
  assert.equal(P.context.window.testProg.sync().state, 'failed');
  assert.match(P.context.window.testProg.status(), /not saved|retrying/i);
});

test('a server-side 200 with only a throttled reply never displays as synced', async () => {
  let posts = 0;
  const P = load({
    prefs: signedIn,
    progress: { q: {}, notes: {}, days: {}, goal: 20, savedAt: 1 },
    post: (_url, init) => {
      if (!init || init.method !== 'POST') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ progress: null }) });
      }
      posts++;
      const sent = JSON.parse(init.body);
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({
        ok: true, throttled: true, progress: sent,
      }) });
    },
  });
  P.context.window.testProg.setState({ q: { '1.1.01-001': { a: 1, w: 0, r: 1, last: true, wrong: false, at: 50 } },
    notes: {}, tr: {}, ai: {}, days: {}, goal: 20 });
  P.context.window.testProg.push(true);
  await tick();
  assert.ok(posts >= 1);
  assert.equal(P.context.window.testProg.sync().state, 'failed');
  assert.doesNotMatch(P.context.window.testProg.status(), /synced/i);
});

test('a throttled response is retried and only a durable acknowledgement marks the data saved', async () => {
  let posts = 0, durable = false;
  const P = load({
    prefs: signedIn,
    progress: { q: {}, notes: {}, days: {}, goal: 20, savedAt: 1 },
    post: (_url, init) => {
      if (!init || init.method !== 'POST') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ progress: null }) });
      }
      posts++;
      const sent = JSON.parse(init.body);
      if (posts === 1) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({
          ok: true, throttled: true, progress: sent,
        }) });
      }
      durable = true;
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({
        ok: true, progress: sent,
      }) });
    },
  });
  P.context.window.testProg.setState({ q: { '1.1.01-001': { a: 1, w: 0, r: 1, last: true, wrong: false, at: 50 } },
    notes: {}, tr: {}, ai: {}, days: {}, goal: 20 });
  P.context.window.testProg.push(true);
  await new Promise((r) => setTimeout(r, 20));
  P.timers.find((t) => t.ms === 3000).fn();
  await new Promise((r) => setTimeout(r, 20));
  assert.ok(posts >= 2, 'throttled responses must not stop synchronization');
  assert.equal(durable, true, 'the retry reaches a durable write');
  assert.equal(P.context.window.testProg.sync().state, 'ok');
});

test('a large page-hide flush omits keepalive instead of exceeding the browser body limit', async () => {
  const P = load({ prefs: signedIn });
  const q = {};
  for (let i = 0; i < 1116; i++) {
    q['1.1.01-' + (1000 + i)] = { a: 2, w: 0, r: 2, last: true, wrong: false, at: 5000 + i };
  }
  P.context.window.testProg.setState({ q, notes: {}, tr: {}, ai: {}, days: {}, goal: 20 });
  P.listeners.pagehide.forEach((fn) => fn());
  await tick();
  const idx = P.bodies.findIndex((b) => b && b.includes('1.1.01-1000'));
  assert.ok(idx >= 0, 'the full progress snapshot is sent');
  assert.ok(Buffer.byteLength(P.bodies[idx]) > 60 * 1024, 'the regression case is larger than the keepalive budget');
  assert.equal(P.inits[idx].keepalive, undefined, 'large bodies must use a normal fetch');
});

test('coming back online immediately retries instead of waiting for the next edit', async () => {
  let failPosts = true, posts = 0;
  const P = load({
    prefs: signedIn,
    progress: { q: {}, notes: {}, days: {}, goal: 20, savedAt: 1 },
    post: (_url, init) => {
      if (!init || init.method !== 'POST') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ progress: null }) });
      }
      posts++;
      if (failPosts) return Promise.reject(new Error('offline'));
      const sent = JSON.parse(init.body);
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, progress: sent }) });
    },
  });
  P.context.window.testProg.setState({ q: { '1.1.01-001': { a: 1, w: 0, r: 1, last: true, wrong: false, at: 50 } },
    notes: {}, tr: {}, ai: {}, days: {}, goal: 20 });
  P.context.window.testProg.push(true);
  await tick();
  assert.equal(P.context.window.testProg.sync().state, 'failed');
  failPosts = false;
  assert.ok(P.listeners.online && P.listeners.online.length, 'online listener must be registered');
  P.listeners.online.forEach((fn) => fn());
  await tick();
  assert.ok(posts >= 2, 'coming online retries without another user edit');
  assert.equal(P.context.window.testProg.sync().state, 'ok');
});

test('a small page-hide delta still uses keepalive', async () => {
  const P = load({ prefs: signedIn });
  P.context.window.testProg.setState({ q: { '1.1.01-001': { a: 1, w: 0, r: 1, last: true, wrong: false, at: 50 } },
    notes: {}, tr: {}, ai: {}, days: {}, goal: 20 });
  P.listeners.pagehide.forEach((fn) => fn());
  await tick();
  const idx = P.bodies.findIndex((b) => b && b.includes('1.1.01-001'));
  assert.ok(idx >= 0);
  assert.equal(P.inits[idx].keepalive, true);
});

test('continuous edits use a throttle rather than restarting the upload timer forever', () => {
  const P = load({ prefs: signedIn, progress: { q: {}, notes: {}, days: {}, goal: 20, savedAt: 1 } });
  P.context.window.testProg.setState({ q: {}, notes: {}, tr: {}, ai: {}, days: {}, goal: 20 });
  const saveState = P.context.window.testProg.saveState;
  for (let i = 0; i < 5; i++) saveState();
  const uploads = P.timers.filter((timer) => timer.ms === 20000);
  assert.equal(uploads.length, 1, 'repeated edits must share one pending upload timer');
});

test('a successful durable upload exposes a last-sync time in Settings', async () => {
  const P = load({ prefs: signedIn });
  P.context.window.testProg.setState({ q: { '1.1.01-001': { a: 1, w: 0, r: 1, last: true, wrong: false, at: 50 } },
    notes: {}, tr: {}, ai: {}, days: {}, goal: 20 });
  P.context.window.testProg.push(true);
  await tick();
  assert.equal(P.context.window.testProg.sync().state, 'ok');
  assert.match(P.context.window.testProg.status(), /synced|saved/i);
  assert.match(appSource, /data-role="prog-sync"/, 'Settings must show the synchronization state');
});

test('serialize drops false last/wrong so a full catalog fits the server cap', () => {
  const P = load({ prefs: signedIn });
  const q = {};
  for (let i = 0; i < 2413; i++) q['1.1.01-' + (1000 + i)] = { a: 3, w: 1, r: 2, last: i % 2 === 0, wrong: i % 5 === 0, at: 5000 + i };
  P.context.window.testProg.setState({ q, notes: {}, tr: {}, ai: {}, days: {}, goal: 20 });
  const p = P.context.window.testProg.serialize();
  assert.equal(p.q['1.1.01-1001'].last, undefined, 'false last must not be uploaded');
  assert.equal(p.q['1.1.01-1001'].wrong, undefined, 'false wrong must not be uploaded');
  assert.equal(p.q['1.1.01-1000'].wrong, true, 'true wrong must survive');
  assert.ok(JSON.stringify(p).length < 262144, 'full upload must fit the 256KB cap');
});

test('valid Class B IDs ending in zero are not rejected by the sync scope', () => {
  const P = load({ prefs: signedIn });
  P.context.window.testProg.setState({
    q: {
      '2.1.03-030': { a: 1, w: 0, r: 1, last: true, wrong: false, at: 50 },
      '2.1.07-018': { a: 1, w: 0, r: 1, last: true, wrong: false, at: 51 },
      '2.1.03-112': { a: 1, w: 0, r: 1, last: true, wrong: false, at: 52 },
    },
    notes: {
      '2.1.03-030': { text: 'B note', at: 50 },
      '2.1.03-112': { text: 'non-B note', at: 52 },
    },
    tr: {}, ai: {}, days: {}, goal: 20,
  });
  const p = P.context.window.testProg.serialize();
  assert.ok(p.q['2.1.03-030'], 'a valid B ID ending in zero must upload');
  assert.ok(p.q['2.1.07-018'], 'another valid B ID ending in zero must upload');
  assert.ok(p.notes['2.1.03-030'], 'its note must upload too');
  assert.equal(p.q['2.1.03-112'], undefined, 'the audited non-B exclusion still applies');
  assert.equal(p.notes['2.1.03-112'], undefined, 'the audited non-B note exclusion still applies');
});

test('an already-logged-in boot pulls cloud progress without a fresh login', async () => {
  const cloud = { q: { '1.1.01-002': { a: 4, w: 0, r: 4, last: true, wrong: false, at: 9000 } },
    notes: {}, days: {}, goal: 20, savedAt: 9000 };
  const P = load({ prefs: signedIn, progress: cloud,
    ls: { 'dtt.state.v1': JSON.stringify({ q: { '1.1.01-001': { a: 1, w: 0, r: 1, last: true, wrong: false, at: 100 } },
      notes: {}, tr: {}, ai: {}, days: {}, goal: 20 }) } });
  await tick();
  const st = P.context.window.testProg.getState();
  assert.equal(st.q['1.1.01-002'].a, 4, 'cloud entry arrives on boot');
  assert.equal(st.q['1.1.01-001'].a, 1, 'local entry survives the boot merge');
});

test('first login with an empty cloud pushes the local progress up', async () => {
  const P = load({ prefs: signedIn, progress: null,
    ls: { 'dtt.state.v1': JSON.stringify({ q: { '1.1.01-001': { a: 2, w: 1, r: 2, last: true, wrong: true, at: 7000 } },
      notes: { '1.1.01-001': { text: '要让行', at: 7000 } }, tr: {}, ai: {}, days: {}, goal: 20 }) } });
  await tick();
  const posts = P.bodies.filter((b) => b && b.includes('1.1.01-001'));
  assert.ok(posts.length >= 1, 'local progress must be pushed when the cloud is empty');
  const up = JSON.parse(posts[0]);
  assert.equal(up.q['1.1.01-001'].a, 2, 'answered count goes up');
  assert.equal(up.q['1.1.01-001'].wrong, true, 'wrong flag goes up');
  assert.equal(up.notes['1.1.01-001'].text, '要让行', 'note text goes up');
});

test('first login with nothing anywhere writes nothing', async () => {
  const P = load({ prefs: signedIn, progress: null });
  await tick();
  assert.equal(P.bodies.filter((b) => b && b.includes('savedAt')).length, 0, 'no empty record for a fresh device');
});

test('non-B questions never leave the device', async () => {
  const P = load({ prefs: signedIn });
  P.context.window.testProg.setState({
    q: { '1.1.01-001': { a: 2, w: 0, r: 2, last: true, wrong: false, at: 10 },
         '2.1.03-112': { a: 5, w: 5, r: 0, last: false, wrong: true, at: 11 } },
    notes: { '1.1.01-001': { text: 'b note', at: 10 }, '2.1.03-112': { text: 'non-b note', at: 11 } },
    tr: {}, ai: {}, days: {}, goal: 20 });
  const p = P.context.window.testProg.serialize();
  assert.equal(p.q['1.1.01-001'].a, 2, 'B progress uploads');
  assert.equal(p.q['2.1.03-112'], undefined, 'non-B progress stays local');
  assert.equal(p.notes['1.1.01-001'].text, 'b note', 'B note uploads');
  assert.equal(p.notes['2.1.03-112'], undefined, 'non-B note stays local');
  P.context.window.testProg.merge({ q: { '2.1.03-112': { a: 9, w: 0, r: 9, last: true, wrong: false, at: 99999 } },
    notes: { '2.1.03-112': { text: 'cloud note', at: 99999 } }, days: {}, goal: 20, savedAt: 99999 });
  const st = P.context.window.testProg.getState();
  assert.equal(st.q['2.1.03-112'].a, 5, 'cloud non-B must not overwrite local');
  assert.equal(st.notes['2.1.03-112'].text, 'non-b note', 'cloud non-B note must not come down');
});

test('notes are capped at 16KB per person, newest wins', () => {
  const P = load({ prefs: signedIn });
  P.context.window.testProg.setState({
    q: {}, notes: { '1.1.01-001': { text: 'x'.repeat(9000), at: 1000 },
      '1.1.01-002': { text: 'y'.repeat(17000), at: 2000 } }, tr: {}, ai: {}, days: {}, goal: 20 });
  const p = P.context.window.testProg.serialize();
  assert.equal(Object.keys(p.notes).length, 1, 'only the newest note fits in 16KB');
  assert.equal(p.notes['1.1.01-002'].text, 'y'.repeat(16384), 'newest note survives');
  assert.equal(new TextEncoder().encode(Object.values(p.notes).map(n => n.text).join('')).length <= 16384, true, 'total stays within budget');
});

test('note ordering keeps millisecond timestamps instead of truncating to 1970', () => {
  const P = load({ prefs: signedIn });
  const recent = Date.now();
  P.context.window.testProg.setState({
    q: {}, notes: { '1.1.01-001': { text: 'older', at: recent - 1000 },
      '1.1.01-002': { text: 'newer', at: recent } }, tr: {}, ai: {}, days: {}, goal: 20 });
  const p = P.context.window.testProg.serialize();
  assert.equal(p.notes['1.1.01-002'].at, recent, 'milliseconds survive serialization');
});

test('login and progress hooks are wired in the app source', () => {
  assert.match(appSource, /progPull\(\);/, 'finishLogin must pull cloud progress');
  assert.match(appSource, /progPush\(\);/, 'saveState must schedule a push');
  assert.match(appSource, /progWipe = true; saveState\(\);/, 'reset/import must wipe the cloud copy');
});
