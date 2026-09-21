// Notifications bell: renders for logged-in users, polls, badges, jumps to the question.
// Runs app.js in a VM with stubbed DOM/storage/fetch, like progress.test.cjs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');

const appSource = fs.readFileSync(require.resolve('../app.js'), 'utf8');
const i18nSource = fs.readFileSync(require.resolve('../i18n.js'), 'utf8');

function stubNode() {
  return {
    innerHTML: '', textContent: '', hidden: false, removed: false, open: false, value: '',
    setAttribute() {}, appendChild() {}, remove() { this.removed = true; },
    replaceWith() { this.removed = true; },
    insertAdjacentHTML(_pos, html) { this.innerHTML += html; },
    querySelector() { return null; },
    scrollIntoView() {},
    focus() {},
    classList: { contains() { return false; }, add() {}, remove() {}, toggle() {} },
  };
}

const NOTIFS = [
  { id: 'n1', kind: 'mention', from: 'b@c.com', qid: '1.1.02-001', cid: 'm1', ts: 1000, read: false },
  { id: 'n2', kind: 'welcome', from: '', qid: '', cid: '', ts: 500, read: false },
];

function load({ prefs = {} } = {}) {
  const nodes = {}, calls = [], bodies = [], appended = [];
  const store = {};
  const listeners = {};
  const context = {
    window: { addEventListener() {}, scrollTo() {} },
    console,
    location: { search: '', hash: '#/home', pathname: '/' },
    history: { replaceState() {} },
    document: {
      documentElement: { attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; } },
      hidden: false,
      readyState: 'loading',
      addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
      createElement: () => {
        const n = stubNode(); let h = '';
        Object.defineProperty(n, 'innerHTML', { get: () => h, set: (v) => { h = v; n.firstChild = { innerHTML: v }; } });
        return n;
      },
      body: { appendChild(n) { appended.push(n); } },
      head: { appendChild() {} },
      getElementById(id) { if (!nodes['#' + id]) nodes['#' + id] = stubNode(); return nodes['#' + id]; },
      querySelectorAll: () => [],
      querySelector(sel) {
        const m = /\[data-role="([^"]+)"\]/.exec(sel);
        if (!m) return null;
        if (m[1] === 'notifpanel') { const live = appended.filter(Boolean); return live.length ? live[live.length - 1] : null; }
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
      if (/\/api\/notifications$/.test(String(url)) && (!init || init.method !== 'POST'))
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ notifications: NOTIFS, unread: 2 }) });
      if (/\/api\/notifications$/.test(String(url)))
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, marked: 2 }) });
      if (/\/api\/me$/.test(String(url)))
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ user: 'a@b.c', uid: 'u1', left: 10 }) });
      if (/\/api\/progress$/.test(String(url)))
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ progress: null }) });
      return Promise.reject(new Error('unexpected ' + url));
    },
    setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
    TextEncoder, TextDecoder,
    confirm: () => true,
  };
  vm.runInNewContext(i18nSource, context);
  vm.runInNewContext(appSource, context);
  context.window.__CATALOG = [
    { id: '1.1.02-001', th: '1.1', ch: '1.1.02', thd: 'T', the: 'T', chd: 'C', che: 'C',
      qd: 'Q1', qe: 'Q1', od: ['a', 'b'], oe: ['a', 'b'], ans: [0], pt: 4, t: 'single',
      num: null, img: null, vid: null, cd: '', ce: '' },
  ];
  context.window.__boot();
  const click = (act, attrs = {}) => {
    const fakeEl = { getAttribute: (k) => (k === 'data-act' ? act : (attrs[k] === undefined ? null : attrs[k])), classList: { contains: () => false } };
    listeners.click.forEach((fn) => fn({ target: { closest: (sel) => (String(sel).includes('[data-act]') ? fakeEl : (String(sel).includes('notifpanel') ? null : null)) } }));
  };
  return { context, nodes, calls, bodies, appended, store, listeners, click };
}

const tick = () => new Promise((r) => setTimeout(r, 20));
const signedIn = { apiBase: 'https://dtt-backend.tiancai110a.workers.dev', token: 'tok', uid: 'u1', user: 'a@b.c', uiLang: 'en', contentLang: 'all' };

test('bell renders for logged-in users and boot polls notifications', async () => {
  const t = load({ prefs: signedIn });
  await tick();
  assert.match(t.nodes['#topcontrols'].innerHTML, /data-act="notif-toggle"/, 'topbar has the bell');
  assert.ok(t.calls.some((u) => /\/api\/notifications$/.test(u)), 'boot fetches notifications');
  assert.equal(t.nodes['bellbadge'].textContent, '2', 'badge shows unread count');
  assert.equal(t.nodes['bellbadge'].hidden, false, 'badge visible');
});

test('guests get no bell and no notification fetch', async () => {
  const t = load({ prefs: {} });
  await tick();
  assert.doesNotMatch(t.nodes['#topcontrols'].innerHTML, /data-act="notif-toggle"/, 'no bell for guests');
  assert.ok(!t.calls.some((u) => /\/api\/notifications$/.test(u)), 'no fetch for guests');
});

test('opening the bell appends the panel with mention text', async () => {
  const t = load({ prefs: signedIn });
  await tick();
  t.click('notif-toggle');
  assert.equal(t.appended.length, 1, 'panel appended to body');
  assert.match(t.appended[0].innerHTML, /mentioned you on question/, 'mention renders in UI language');
  assert.match(t.appended[0].innerHTML, /Welcome to German Theory Trainer/, 'welcome renders');
});

test('opening a notification jumps to the question', async () => {
  const t = load({ prefs: signedIn });
  await tick();
  t.click('notif-toggle');
  t.click('notif-open', { 'data-qid': '1.1.02-001', 'data-id': 'n1' });
  assert.equal(t.context.location.hash, '#/practice?ids=1.1.02-001', 'hash jumps to the question');
  assert.ok(t.bodies.some((b) => b.includes('"read":["n1"]')), 'single notification marked read');
});

test('mark-all-read posts all:true', async () => {
  const t = load({ prefs: signedIn });
  await tick();
  t.click('notif-toggle');
  t.click('notif-read-all');
  await tick();
  assert.ok(t.bodies.some((b) => b.includes('"all":true')), 'mark-all posts all:true');
});
