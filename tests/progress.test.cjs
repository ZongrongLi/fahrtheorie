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
  '    saveState: saveState, syncAt: syncAt,\n' +
  '    getState: function () { return state; }, setState: function (s) { state = s; },\n' +
  '    getPrefs: function () { return prefs; } };\n' +
  '  window.testWrong = { recordAnswer: recordAnswer, revealAnswer: revealAnswer, grade: grade,\n' +
  '    gradeExam: gradeExam, toggleWrong: toggleWrong, wrongView: vWrong,\n' +
  '    startExam: startExam, examResult: vExamResult, examBack: examResultBackLink,\n' +
  '    historyView: vHistory,\n' +
  '    restoreLastExam: restoreLastExam, saveActiveExam: saveActiveExam,\n' +
  '    restoreActiveExam: restoreActiveExam, clearActiveExam: clearActiveExam, route: route,\n' +
  '    testNav: { track: trackNavigation, back: goBack, stack: function () { return navStack.slice(); }, current: function () { return navCurrent; } },\n' +
  '    homeView: vHome, resumeQuestion: resumeQuestion, lastAnswered: lastAnswered,\n' +
  '    getState: function () { return state; }, setState: function (s) { state = s; },\n' +
  '    getSession: function () { return session; }, setSession: function (s) { session = s; } };\n' +
  '  window.testViews = { categories: vCategories, cat: vCat, types: vSingleTypes,\n' +
  '    examHome: vExamHome, examSets: vExamSets, examResult: vExamResult, history: vHistory,\n' +
  '    wrong: vWrong, notes: vNotes, settings: vSettings, admin: vAdmin,\n' +
  '    summary: vSummary, exam: vExam };\n' + marker);

function stubNode() {
  return {
    innerHTML: '', textContent: '', className: '', inserted: '', removed: false, open: false,
    setAttribute() {}, appendChild() {}, remove() { this.removed = true; },
    insertAdjacentHTML(_pos, html) { this.inserted += html; },
    focus() {},
    classList: { contains() { return false; }, add() {}, remove() {}, toggle() {} },
  };
}

function load({ prefs = {}, progress = null, ls = {}, post = null, extras = null } = {}) {
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
  if (extras) context.window.__TESTBOEGEN_EXTRA = extras;
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

test('sync preserves the highest wrong count when another device has newer timestamps', () => {
  const P = load({ prefs: signedIn });
  P.context.window.testProg.setState({
    q: { '1.1.01-001': { a: 3, w: 3, r: 0, last: false, wrong: true, at: 1000 } },
    notes: {}, tr: {}, ai: {}, days: {}, goal: 20,
  });
  P.context.window.testProg.merge({
    q: { '1.1.01-001': { a: 4, w: 1, r: 3, last: true, wrong: false, at: 2000 } },
    notes: {}, days: {}, goal: 20, savedAt: 2000,
  });
  const merged = P.context.window.testProg.getState().q['1.1.01-001'];
  assert.equal(merged.w, 3, 'the higher wrong count must survive a newer record');
  assert.equal(merged.a, 4, 'attempts use the higher counter');
  assert.equal(merged.r, 3, 'correct answers use the higher counter');
  assert.equal(merged.wrong, false, 'the newest answer still controls the active wrong flag');
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

test('serialize carries the exact resume session and question position', () => {
  const P = load({ prefs: signedIn });
  P.context.window.testProg.setState({ q: {}, notes: {}, tr: {}, ai: {}, days: {}, goal: 20 });
  const resume = {
    id: '1.1.01-002',
    hash: '#/practice?ids=1.1.01-002%2C1.1.01-001&src=wrong&at=1.1.01-002',
    at: 300,
  };
  P.store['dtt.resume.v1'] = JSON.stringify(resume);
  assert.equal(JSON.stringify(P.context.window.testProg.serialize().resume), JSON.stringify(resume),
    'the cloud payload must include the exact session hash and current question');
});

test('serialize keeps the wrong-book resume separate from the general resume', () => {
  const P = load({ prefs: signedIn });
  P.context.window.testProg.setState({ q: {}, notes: {}, tr: {}, ai: {}, days: {}, goal: 20 });
  const general = {
    id: '2.2.30-102',
    hash: '#/practice?c=2.2&m=all&s=seq&at=2.2.30-102',
    at: 400,
  };
  const wrong = {
    id: '1.1.01-002',
    hash: '#/practice?ids=1.1.01-002%2C1.1.01-001&src=wrong&at=1.1.01-002',
    at: 300,
  };
  P.store['dtt.resume.v1'] = JSON.stringify(general);
  P.store['dtt.resume.wrong.v1'] = JSON.stringify(wrong);
  const payload = P.context.window.testProg.serialize();
  assert.equal(JSON.stringify(payload.resume), JSON.stringify(general),
    'normal practice keeps its own resume position');
  assert.equal(JSON.stringify(payload.resumeWrong), JSON.stringify(wrong),
    'wrong-book practice keeps a separate resume position');
});

test('a page-hide upload sends a resume-only position change', async () => {
  const P = load({ prefs: signedIn, progress: { q: {}, notes: {}, days: {}, goal: 20, savedAt: 1 } });
  await tick();
  P.store['dtt.resume.v1'] = JSON.stringify({
    id: '1.1.01-002',
    hash: '#/practice?ids=1.1.01-002%2C1.1.01-001&src=wrong&at=1.1.01-002',
    at: 300,
  });
  P.listeners.pagehide.forEach((fn) => fn());
  await tick();
  const upload = P.bodies.map((body) => {
    try { return JSON.parse(body); } catch (e) { return null; }
  }).find((body) => body && body.resume);
  assert.ok(upload, 'a changed resume position must not be discarded by the empty-delta fast path');
  assert.equal(upload.resume.id, '1.1.01-002');
});

test('cloud resume position is installed when the account is opened in another browser', async () => {
  const resume = {
    id: '1.1.01-001',
    hash: '#/practice?ids=1.1.01-002%2C1.1.01-001&src=wrong&at=1.1.01-001',
    at: 500,
  };
  const P = load({ prefs: signedIn, progress: { q: {}, notes: {}, days: {}, goal: 20, savedAt: 500, resume } });
  await tick();
  assert.equal(JSON.stringify(JSON.parse(P.store['dtt.resume.v1'])), JSON.stringify(resume),
    'the newer account resume position must replace the empty local one');
});

test('cloud wrong-book resume is installed without replacing the general resume', async () => {
  const general = {
    id: '2.2.30-102',
    hash: '#/practice?c=2.2&m=all&s=seq&at=2.2.30-102',
    at: 600,
  };
  const wrong = {
    id: '1.1.01-001',
    hash: '#/practice?ids=1.1.01-002%2C1.1.01-001&src=wrong&at=1.1.01-001',
    at: 500,
  };
  const P = load({ prefs: signedIn, progress: {
    q: {}, notes: {}, days: {}, goal: 20, savedAt: 600, resume: general, resumeWrong: wrong,
  } });
  await tick();
  assert.equal(JSON.stringify(JSON.parse(P.store['dtt.resume.v1'])), JSON.stringify(general));
  assert.equal(JSON.stringify(JSON.parse(P.store['dtt.resume.wrong.v1'])), JSON.stringify(wrong),
    'the account must restore the dedicated wrong-book session too');
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

test('a correct practice answer clears the wrong-book flag and keeps its history', () => {
  const P = load();
  const W = P.context.window.testWrong;
  const q = { id: '1.1.01-001', t: 'single', ans: [0], num: null };
  W.setState({ q: {}, notes: {}, tr: {}, ai: {}, days: {}, goal: 20 });
  W.recordAnswer(q, false);
  assert.equal(W.getState().q[q.id].wrong, true, 'a wrong answer enters the wrong book');
  assert.equal(W.getState().q[q.id].w, 1);
  W.grade(q, { sel: [0], val: '', submitted: false, correct: false });
  assert.equal(W.getState().q[q.id].wrong, false, 'a later correct answer removes it');
  assert.equal(W.getState().q[q.id].w, 1, 'the previous mistake count remains available');
  assert.equal(W.getState().q[q.id].r, 1, 'the correct answer is recorded');
});

test('revealing an answer does not count as an answer or enter the wrong book', () => {
  const P = load();
  const W = P.context.window.testWrong;
  W.setState({ q: {}, notes: {}, tr: {}, ai: {}, days: {}, goal: 20 });
  const a = { sel: [], val: '', submitted: false, correct: false };
  assert.equal(W.revealAnswer(a), true);
  assert.equal(a.submitted, true);
  assert.equal(a.revealed, true);
  assert.deepEqual(W.getState().q, {}, 'revealing creates no answer state');
  assert.deepEqual(W.getState().days, {}, 'revealing creates no daily activity');
});

test('a question cleared by a correct answer can be manually added back', () => {
  const P = load();
  const W = P.context.window.testWrong;
  const q = { id: '1.1.01-001', t: 'single', ans: [0], num: null };
  W.setState({ q: { [q.id]: { a: 2, w: 1, r: 1, last: true, wrong: false, at: 1 } },
    notes: {}, tr: {}, ai: {}, days: {}, goal: 20 });
  assert.equal(W.toggleWrong(q.id), true);
  assert.equal(W.getState().q[q.id].wrong, true, 'the manual wrong-book control adds it again');
});

test('a correct mock-exam answer also clears an existing wrong-book flag', () => {
  const P = load();
  const W = P.context.window.testWrong;
  W.setState({ q: { '1.1.01-001': { a: 1, w: 1, r: 0, last: false, wrong: true, at: 1 } },
    notes: {}, tr: {}, ai: {}, days: {}, goal: 20 });
  W.setSession({
    ids: ['1.1.01-001'], i: 0, mode: 'exam',
    answers: { '1.1.01-001': { sel: [0], val: '', submitted: false, correct: false } },
    graded: false,
  });
  W.gradeExam();
  assert.equal(W.getState().q['1.1.01-001'].wrong, false, 'exam grading uses the shared answer rule');
  assert.equal(W.getState().q['1.1.01-001'].r, 1);
});

test('the wrong book exposes mastered mistakes separately and allows adding them back', () => {
  const P = load();
  const W = P.context.window.testWrong;
  W.setState({
    q: {
      '1.1.01-001': { a: 2, w: 1, r: 1, last: false, wrong: true, at: 1 },
      '1.1.01-002': { a: 2, w: 1, r: 1, last: true, wrong: false, at: 2 },
    },
    notes: {}, tr: {}, ai: {}, days: {}, goal: 20,
  });
  const current = W.wrongView('', '', '');
  const mastered = W.wrongView('', '', 'mastered');
  assert.match(current, /Q1/, 'the current tab shows mistakes still to review');
  assert.doesNotMatch(current, /Q2/, 'the current tab hides mastered mistakes');
  assert.match(mastered, /Q2/, 'the mastered tab shows answered mistakes');
  assert.doesNotMatch(mastered, /Q1/, 'the mastered tab hides active mistakes');
  assert.match(mastered, /data-act="wrong-relearn"/, 'mastered mistakes can be added back');
});

test('home continue opens the last answered question instead of the next unseen one', () => {
  const P = load();
  const W = P.context.window.testWrong;
  W.setState({
    q: {
      '1.1.01-001': { a: 1, w: 0, r: 1, last: true, wrong: false, at: 100 },
      '1.1.01-002': { a: 1, w: 1, r: 0, last: false, wrong: true, at: 200 },
    },
    notes: {}, tr: {}, ai: {}, days: {}, goal: 20,
  });
  const home = W.homeView();
  assert.match(home, /at=1\.1\.01-002/, 'the primary button resumes the latest answered question');
  assert.match(home, /c=1\.1/, 'resume stays scoped to that question category');
});

test('home continue prefers the last opened question in this browser', () => {
  const P = load();
  const W = P.context.window.testWrong;
  W.setState({
    q: {
      '1.1.01-001': { a: 1, w: 0, r: 1, last: true, wrong: false, at: 100 },
      '1.1.01-002': { a: 1, w: 0, r: 1, last: true, wrong: false, at: 200 },
    },
    notes: {}, tr: {}, ai: {}, days: {}, goal: 20,
  });
  P.store['dtt.resume.v1'] = JSON.stringify({ id: '1.1.01-001', at: 300 });
  const home = W.homeView();
  assert.match(home, /at=1\.1\.01-001/, 'a merely opened question is remembered too');
});

test('home continue restores the exact saved practice set and source', () => {
  const P = load();
  const W = P.context.window.testWrong;
  W.setState({
    q: {
      '1.1.01-001': { a: 1, w: 1, r: 0, last: false, wrong: true, at: 100 },
      '1.1.01-002': { a: 1, w: 1, r: 0, last: false, wrong: true, at: 200 },
    },
    notes: {}, tr: {}, ai: {}, days: {}, goal: 20,
  });
  const saved = '#/practice?ids=1.1.01-002%2C1.1.01-001&src=wrong&at=1.1.01-001';
  P.store['dtt.resume.v1'] = JSON.stringify({ id: '1.1.01-001', hash: saved, at: 300 });
  const home = W.homeView();
  assert.match(home, /ids=1\.1\.01-002%2C1\.1\.01-001/,
    'resume keeps the original practice set instead of rebuilding a category session');
  assert.match(home, /src=wrong/, 'resume keeps the original wrong-book source');
  assert.match(home, /at=1\.1\.01-001/, 'resume lands on the exact saved question');
});

test('wrong book shows the exact saved wrong-session position', () => {
  const P = load();
  const W = P.context.window.testWrong;
  W.setState({
    q: {
      '1.1.01-001': { a: 1, w: 1, r: 0, last: false, wrong: true, at: 100 },
      '1.1.01-002': { a: 1, w: 1, r: 0, last: false, wrong: true, at: 200 },
    },
    notes: {}, tr: {}, ai: {}, days: {}, goal: 20,
  });
  const saved = '#/practice?ids=1.1.01-001%2C1.1.01-002&src=wrong&at=1.1.01-002';
  P.store['dtt.resume.v1'] = JSON.stringify({
    id: '1.1.01-001',
    hash: '#/practice?c=1.1&m=all&s=seq&at=1.1.01-001',
    at: 400,
  });
  P.store['dtt.resume.wrong.v1'] = JSON.stringify({ id: '1.1.01-002', hash: saved, at: 300 });
  const wrong = W.wrongView('', '', '');
  assert.match(wrong, /class="card wrong-resume"/, 'the wrong book exposes an in-page resume card');
  assert.match(wrong, /Question 2 \/ 2/, 'the card shows the saved position in the wrong session');
  assert.match(wrong, /data-act="resume-wrong"/, 'the card uses its own wrong-book action');
  assert.doesNotMatch(wrong, /data-act="resume-last"/, 'the global resume action must not overwrite the card href');
  assert.match(wrong, /at=1\.1\.01-002/, 'the card keeps the exact saved question');
});

test('wrong book groups active mistakes by their wrong-answer count', () => {
  const P = load();
  const W = P.context.window.testWrong;
  W.setState({
    q: {
      '1.1.01-001': { a: 3, w: 1, r: 2, last: false, wrong: true, at: 100 },
      '1.1.01-002': { a: 4, w: 4, r: 0, last: false, wrong: true, at: 200 },
    },
    notes: {}, tr: {}, ai: {}, days: {}, goal: 20,
  });
  const all = W.wrongView('', '', '');
  assert.match(all, /data-role="wrong-count-filter"/, 'the wrong book exposes a count filter');
  assert.match(all, /value="1"[^>]*>Wrong 1× \(1\)/, 'the filter lists the 1× group');
  assert.match(all, /value="4"[^>]*>Wrong 4× \(1\)/, 'the filter lists the 4× group');
  const four = W.wrongView('', '', '', '4');
  assert.match(four, /Q2/, 'the 4× view keeps a question last answered wrong four times');
  assert.doesNotMatch(four, /Q1/, 'the 4× view excludes other count groups');
  assert.match(four, /&wc=4&at=1\.1\.01-002/, 'a grouped practice URL carries its group key');
});

test('each wrong-count group keeps its own resume card and position', () => {
  const P = load();
  const W = P.context.window.testWrong;
  W.setState({
    q: {
      '1.1.01-001': { a: 3, w: 1, r: 2, last: false, wrong: true, at: 100 },
      '1.1.01-002': { a: 4, w: 4, r: 0, last: false, wrong: true, at: 200 },
    },
    notes: {}, tr: {}, ai: {}, days: {}, goal: 20,
  });
  P.store['dtt.resume.wrong.v1'] = JSON.stringify({
    id: '1.1.01-001',
    hash: '#/practice?ids=1.1.01-001%2C1.1.01-002&src=wrong&at=1.1.01-001',
    at: 300,
  });
  P.store['dtt.resume.wrong.groups.v1'] = JSON.stringify({
    4: {
      id: '1.1.01-002',
      hash: '#/practice?ids=1.1.01-002&src=wrong&wc=4&at=1.1.01-002',
      at: 400,
    },
  });
  const total = W.wrongView('', '', '');
  const four = W.wrongView('', '', '', '4');
  assert.match(total, /Question 1 \/ 2/, 'the total mistake session keeps its own position');
  assert.match(four, /Question 1 \/ 1/, 'the 4× session keeps its own position');
  assert.match(four, /data-act="resume-wrong" data-w="4"/, 'the grouped resume card targets only its group');
});

test('saving total and grouped wrong sessions never overwrites each other', () => {
  const P = load();
  const W = P.context.window.testWrong;
  W.setState({
    q: {
      '1.1.01-001': { a: 1, w: 1, r: 0, last: false, wrong: true, at: 100 },
      '1.1.01-002': { a: 4, w: 4, r: 0, last: false, wrong: true, at: 200 },
    },
    notes: {}, tr: {}, ai: {}, days: {}, goal: 20,
  });
  W.setSession({ ids: ['1.1.01-001', '1.1.01-002'], i: 0, mode: 'normal', answers: {} });
  P.context.location.hash = '#/practice?ids=1.1.01-001%2C1.1.01-002&src=wrong&at=1.1.01-001';
  P.context.window.testProg.syncAt();
  W.setSession({ ids: ['1.1.01-002'], i: 0, mode: 'normal', answers: {} });
  P.context.location.hash = '#/practice?ids=1.1.01-002&src=wrong&wc=4&at=1.1.01-002';
  P.context.window.testProg.syncAt();
  const total = JSON.parse(P.store['dtt.resume.wrong.v1']);
  const groups = JSON.parse(P.store['dtt.resume.wrong.groups.v1']);
  assert.equal(total.id, '1.1.01-001', 'the total mistake session remains at its own question');
  assert.equal(groups['4'].id, '1.1.01-002', 'the 4× session is stored under its own key');
  assert.match(total.hash, /^((?!wc=).)*$/, 'the total session is not tagged as a count group');
});

test('wrong-count resumes upload and merge per group without replacing the total', async () => {
  const total = {
    id: '1.1.01-001',
    hash: '#/practice?ids=1.1.01-001%2C1.1.01-002&src=wrong&at=1.1.01-001',
    at: 300,
  };
  const group = {
    id: '1.1.01-002',
    hash: '#/practice?ids=1.1.01-002&src=wrong&wc=4&at=1.1.01-002',
    at: 400,
  };
  const P = load({ prefs: signedIn, progress: { q: {}, notes: {}, days: {}, goal: 20, savedAt: 1 } });
  P.store['dtt.resume.wrong.v1'] = JSON.stringify(total);
  P.store['dtt.resume.wrong.groups.v1'] = JSON.stringify({ 4: group });
  P.context.window.testProg.push(true);
  await tick();
  const upload = P.bodies.map((body) => {
    try { return JSON.parse(body); } catch (e) { return null; }
  }).find((body) => body && body.resumeWrongGroups);
  assert.ok(upload, 'the grouped resume is included in the cloud payload');
  assert.equal(upload.resumeWrong.id, '1.1.01-001');
  assert.equal(upload.resumeWrongGroups['4'].id, '1.1.01-002');

  const Q = load({ prefs: signedIn, progress: {
    q: {}, notes: {}, days: {}, goal: 20, savedAt: 500, resumeWrong: total,
    resumeWrongGroups: { 4: group },
  } });
  await tick();
  assert.equal(JSON.parse(Q.store['dtt.resume.wrong.v1']).id, '1.1.01-001');
  assert.equal(JSON.parse(Q.store['dtt.resume.wrong.groups.v1'])['4'].id, '1.1.01-002');
});

test('answering a mistake incorrectly again increments its group count', () => {
  const P = load();
  const W = P.context.window.testWrong;
  const q = { id: '1.1.01-001', t: 'single', ans: [0], num: null };
  W.setState({
    q: { [q.id]: { a: 1, w: 1, r: 0, last: false, wrong: true, at: 1 } },
    notes: {}, tr: {}, ai: {}, days: {}, goal: 20,
  });
  W.recordAnswer(q, false);
  assert.equal(W.getState().q[q.id].w, 2, 'another wrong answer moves the question to the 2× group');
  assert.equal(W.getState().q[q.id].wrong, true);
});

test('exam results list wrong questions and link to a wrong-only review', () => {
  const P = load();
  const W = P.context.window.testWrong;
  W.setSession({
    ids: ['1.1.01-001', '1.1.01-002'],
    i: 0,
    mode: 'exam',
    answers: {
      '1.1.01-001': { sel: [0], val: '', submitted: true, correct: true },
      '1.1.01-002': { sel: [0], val: '', submitted: true, correct: false },
    },
    graded: true,
    err: 3,
    total: 7,
    durationMs: 1000,
    startedAt: 1,
  });
  const html = W.examResult();
  assert.match(html, /Q2/, 'the wrong question text is shown in the result');
  assert.match(html, /ids=1\.1\.01-002&src=exam&nav=exam/, 'the primary action reviews only wrong questions');
  assert.match(html, /at=1\.1\.01-002/, 'each wrong row opens that question');
  assert.match(html, /Practise mistakes only/, 'the wrong-only action is explicit');
});

test('exam review keeps a way back to the saved result page', () => {
  const P = load();
  const W = P.context.window.testWrong;
  W.setSession({
    ids: ['1.1.01-001', '1.1.01-002'],
    i: 0,
    mode: 'exam',
    answers: {
      '1.1.01-001': { sel: [0], val: '', submitted: true, correct: true },
      '1.1.01-002': { sel: [0], val: '', submitted: true, correct: false },
    },
    graded: true,
    err: 3,
    total: 7,
    durationMs: 1000,
    startedAt: 1,
  });
  W.examResult();
  W.setSession({
    ids: ['1.1.01-002'], i: 0, mode: 'normal', answers: {}, startedAt: 1, seed: '',
    _p: { src: 'exam' },
  });
  assert.match(W.examBack(), /href="#\/exam\?result=1"/, 'reviewing a mistake exposes the result link');
  W.setSession({ ids: ['1.1.01-002'], i: 0, mode: 'normal', answers: {}, startedAt: 1, seed: '' });
  assert.equal(W.restoreLastExam(), true, 'the result snapshot survives leaving the result page');
  assert.match(W.examResult(), /Q2/, 'the restored result still lists the same wrong question');
});

test('every graded exam is recorded with its score and wrong question IDs', () => {
  const P = load();
  const W = P.context.window.testWrong;
  W.setState({ q: {}, notes: {}, tr: {}, ai: {}, days: {}, goal: 20, exams: [] });
  W.setSession({
    ids: ['1.1.01-001', '1.1.01-002'],
    i: 0,
    mode: 'exam',
    answers: {
      '1.1.01-001': { sel: [0], val: '', submitted: true, correct: true },
      '1.1.01-002': { sel: [0], val: '', submitted: true, correct: false },
    },
    graded: false,
    durationMs: 1000,
    startedAt: 1,
  });
  W.gradeExam();
  const exams = W.getState().exams;
  assert.equal(exams.length, 1);
  assert.equal(exams[0].err, 3);
  assert.equal(exams[0].total, 7);
  assert.equal(exams[0].pass, true);
  assert.equal(exams[0].wrong.map((x) => x.id).join(','), '1.1.01-002');
  const html = W.historyView();
  assert.match(html, /#1/);
  assert.match(html, /Q2/);
  assert.match(html, /nav=history/);
});

test('exam history is serialized and merged through cloud progress', () => {
  const P = load({ prefs: signedIn });
  const exam = {
    at: 1234,
    ids: ['1.1.01-001', '1.1.01-002'],
    wrong: [{ id: '1.1.01-002', sel: [0] }],
    err: 3,
    total: 7,
    pass: true,
    durationMs: 1000,
  };
  P.context.window.testProg.setState({ q: {}, notes: {}, tr: {}, ai: {}, days: {}, goal: 20, exams: [exam] });
  const payload = P.context.window.testProg.serialize();
  assert.equal(payload.exams.map((x) => x.at).join(','), '1234');
  const Q = load({ prefs: signedIn });
  Q.context.window.testProg.setState({ q: {}, notes: {}, tr: {}, ai: {}, days: {}, goal: 20, exams: [] });
  Q.context.window.testProg.merge({ q: {}, notes: {}, days: {}, goal: 20, savedAt: 1, exams: [exam] });
  assert.equal(Q.context.window.testProg.getState().exams[0].wrong[0].id, '1.1.01-002');
});

test('wrong answers on Testbogen-only questions still enter the wrong book', () => {
  const extra = {
    id: '1.1.01-900', th: '1.1', ch: '1.1.01', thd: 'T', the: 'T', chd: 'C', che: 'C',
    qd: 'Q3', qe: 'Q3', od: ['a', 'b'], oe: ['a', 'b'], ans: [0], pt: 4,
    t: 'single', num: null, img: null, vid: null, cd: '', ce: '',
  };
  const P = load({ extras: [extra] });
  const W = P.context.window.testWrong;
  W.setState({
    q: { '1.1.01-900': { a: 1, w: 1, r: 0, last: false, wrong: true, at: 1 } },
    notes: {}, tr: {}, ai: {}, days: {}, goal: 20,
  });
  assert.match(W.wrongView('', '', ''), /Q3/);
});

test('an exam refuses fixed ids that are not in the catalogue', () => {
  const P = load();
  const W = P.context.window.testWrong;
  W.setSession(null);
  W.startExam('bad-set', 1, ['missing-1', 'missing-2']);
  assert.equal(W.getSession(), null);
});

test('an unfinished exam survives leaving the exam route and restores exactly', () => {
  const P = load();
  const W = P.context.window.testWrong;
  const startedAt = Date.now() - 5000;
  W.setSession({
    ids: ['1.1.01-001', '1.1.01-002'],
    i: 1,
    mode: 'exam',
    answers: {
      '1.1.01-001': { sel: [0], val: '', submitted: true, correct: true },
      '1.1.01-002': { sel: [], val: '42', submitted: false, correct: false },
    },
    startedAt,
    durationMs: 45 * 60 * 1000,
    graded: false,
    seed: 'draft-test',
    setNo: 7,
  });
  P.context.location.hash = '#/home';
  W.route();
  assert.equal(W.getSession(), null, 'leaving the exam route clears the in-memory session');

  P.context.location.hash = '#/exam';
  W.route();
  const restored = W.getSession();
  assert.ok(restored, 'returning to the exam route restores the draft');
  assert.equal(restored.i, 1, 'the current question index is preserved');
  assert.equal(restored.setNo, 7, 'the exam set number is preserved');
  assert.equal(restored.startedAt, startedAt, 'the original timer start is preserved');
  assert.equal(restored.answers['1.1.01-001'].sel.join(','), '0');
  assert.equal(restored.answers['1.1.01-002'].val, '42');
});

test('submitting an exam clears its resumable draft', () => {
  const P = load();
  const W = P.context.window.testWrong;
  W.setState({ q: {}, notes: {}, tr: {}, ai: {}, days: {}, goal: 20, exams: [] });
  W.setSession({
    ids: ['1.1.01-001', '1.1.01-002'],
    i: 0,
    mode: 'exam',
    answers: {
      '1.1.01-001': { sel: [0], val: '', submitted: true, correct: true },
      '1.1.01-002': { sel: [0], val: '', submitted: true, correct: false },
    },
    startedAt: Date.now() - 1000,
    durationMs: 45 * 60 * 1000,
    graded: false,
  });
  W.saveActiveExam();
  W.gradeExam();
  assert.equal(P.store['dtt.exam.active.v1'], undefined);
});

test('home exposes an explicit resume button for an unfinished exam', () => {
  const P = load();
  const W = P.context.window.testWrong;
  W.setSession({
    ids: ['1.1.01-001', '1.1.01-002'],
    i: 0,
    mode: 'exam',
    answers: {},
    startedAt: Date.now() - 1000,
    durationMs: 45 * 60 * 1000,
    graded: false,
  });
  W.saveActiveExam();
  W.setSession(null);
  const html = W.homeView();
  assert.match(html, /Resume unfinished exam/);
  assert.match(html, /href="#\/exam"/);
});

test('the in-app back action walks the navigation stack in exact reverse order', () => {
  const P = load();
  const W = P.context.window.testWrong;
  const nav = W.testNav;
  P.context.history.back = undefined;
  P.context.location.hash = '#/home';
  nav.track();
  P.context.location.hash = '#/categories';
  nav.track();
  P.context.location.hash = '#/types';
  nav.track();
  nav.back();
  assert.equal(P.context.location.hash, '#/categories');
  nav.track();
  nav.back();
  assert.equal(P.context.location.hash, '#/home');
});

test('every non-home view exposes a back control', () => {
  const P = load();
  const W = P.context.window.testWrong;
  const V = P.context.window.testViews;
  W.setState({ q: {}, notes: {}, tr: {}, ai: {}, days: {}, goal: 20, exams: [] });
  W.setSession({
    ids: ['1.1.01-001', '1.1.01-002'],
    i: 0,
    mode: 'exam',
    answers: {
      '1.1.01-001': { sel: [0], val: '', submitted: true, correct: true },
      '1.1.01-002': { sel: [0], val: '', submitted: true, correct: false },
    },
    graded: true,
    err: 3,
    total: 7,
    durationMs: 45 * 60 * 1000,
    startedAt: Date.now() - 1000,
  });
  const pages = {
    categories: V.categories(),
    category: V.cat('1.1', '1.1.01'),
    types: V.types(),
    examHome: V.examHome(),
    examSets: V.examSets(),
    examResult: V.examResult(),
    history: V.history(),
    wrong: V.wrong('', '', ''),
    notes: V.notes(),
  };
  for (const [name, html] of Object.entries(pages)) {
    assert.match(html, /data-act="back"/, `${name} must expose back`);
  }
  W.setSession({
    ids: ['1.1.01-001', '1.1.01-002'], i: 0, mode: 'exam', answers: {},
    graded: false, durationMs: 45 * 60 * 1000, startedAt: Date.now() - 1000,
  });
  assert.match(V.exam(), /data-act="back"/, 'in-progress exam must expose back');
  W.setSession({
    ids: ['1.1.01-001', '1.1.01-002'], i: 2, mode: 'normal',
    answers: { '1.1.01-001': { correct: true }, '1.1.01-002': { correct: false } },
  });
  assert.match(V.summary(), /data-act="back"/, 'practice summary must expose back');
});

test('a BFCache pageshow rerenders the page after back navigation', () => {
  const P = load();
  P.context.location.hash = '#/history';
  assert.ok(P.listeners.pageshow && P.listeners.pageshow.length, 'pageshow listener is registered');
  P.listeners.pageshow.forEach((fn) => fn({ persisted: true }));
  assert.match(P.nodes['#view'].innerHTML, /考试历史|Exam history|history\.title/);
});
