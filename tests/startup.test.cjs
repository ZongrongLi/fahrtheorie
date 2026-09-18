// Regression tests for the site boot and the unlock / sign-in handoff.
// The app is a plain browser IIFE, so it runs in a VM with a tiny DOM stub.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');

const appSource = fs.readFileSync(require.resolve('../app.js'), 'utf8');
const i18nSource = fs.readFileSync(require.resolve('../i18n.js'), 'utf8');
const marker = '  window.__boot = boot;';
assert.equal(appSource.split(marker).length, 2, 'boot marker must be unique');
const instrumented = appSource.replace(marker,
  '  window.testPrefs = prefs;\n  window.testShowUnlock = showUnlock;\n' +
  '  window.testHandlePaidReturn = handlePaidReturn;\n' + marker);

function stubNode() {
  return {
    innerHTML: '', textContent: '', className: '', inserted: '', removed: false,
    setAttribute() {}, appendChild() {}, remove() { this.removed = true; },
    insertAdjacentHTML(_pos, html) { this.inserted += html; },
    classList: { contains() { return false; } },
  };
}

function load({ prefs = {}, payMethods, search = '' } = {}) {
  const nodes = {}, calls = [], bodies = [];
  const context = {
    window: {},
    console,
    location: { search, hash: '#/home', pathname: '/', href: '' },
    history: { replaceState() {} },
    document: {
      documentElement: { attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; } },
      readyState: 'loading',
      addEventListener() {},
      createElement: () => stubNode(),
      body: { appendChild() {} },
      getElementById: () => null,
      querySelectorAll: () => [],
      querySelector(sel) {
        const m = /\[data-role="([^"]+)"\]/.exec(sel);
        if (!m) return null;
        if (!nodes[m[1]]) nodes[m[1]] = stubNode();
        return nodes[m[1]];
      },
    },
    localStorage: { getItem: (k) => (k === 'dtt.prefs' ? JSON.stringify(prefs) : null), setItem() {} },
    fetch: (url, init) => {
      calls.push(String(url));
      bodies.push(init && init.body ? String(init.body) : '');
      // 回跳类请求只断言"发了什么"，响应直接失败：verifyPayment 的 catch 会静默收尾，不级联刷新
      if (String(url).includes('/verify')) return Promise.reject(new Error('assert-request-only'));
      if (!payMethods) return Promise.reject(new Error('offline'));
      return Promise.resolve({ json: () => Promise.resolve(payMethods) });
    },
    setTimeout, clearTimeout,
  };
  vm.runInNewContext(i18nSource, context);
  vm.runInNewContext(instrumented, context);
  return { context, nodes, calls, bodies };
}

const tick = () => new Promise((r) => setTimeout(r, 20));

test('new visitors get the default backend before boot is registered', () => {
  const { context } = load();
  assert.equal(context.window.testPrefs.apiBase, 'https://dtt-backend.tiancai110a.workers.dev');
  assert.equal(typeof context.window.__boot, 'function');
});

test('existing visitor preferences are preserved', () => {
  const { context } = load({ prefs: { apiBase: 'https://example.test', uiLang: 'en' } });
  assert.equal(context.window.testPrefs.apiBase, 'https://example.test');
  assert.equal(context.window.testPrefs.uiLang, 'en');
});

test('guest checkout offers sign-in instead of hanging on "checking"', () => {
  const { context, nodes, calls } = load();
  context.window.testShowUnlock();
  assert.deepEqual(calls, [], 'guests must not hit the payment API');
  assert.equal(nodes['pay-loading'].removed, true, 'the endless spinner must be removed');
  assert.match(nodes['pay-btns'].inserted, /data-act="register-open"/);
  assert.match(nodes['pay-btns'].inserted, /data-act="login-open"/);
  assert.equal(nodes['pay-note'].textContent, context.window.I18N.zh['pay.needLogin']);
  assert.equal(context.window.__pendingPay, true, 'sign-in must resume checkout');
});

test('signed-in visitors see the real payment providers', async () => {
  const { context, nodes, calls } = load({
    prefs: { apiBase: 'https://dtt-backend.tiancai110a.workers.dev', token: 'tok' },
    payMethods: { providers: { stripe: true, paddle: false } },
  });
  context.window.testShowUnlock();
  await tick();
  assert.equal(calls.length, 1);
  assert.match(calls[0], /\/api\/pay-methods$/);
  assert.match(nodes['pay-btns'].inserted, /data-provider="stripe"/);
  assert.equal(nodes['pay-note'].textContent, context.window.I18N.zh['pay.note']);
});

test('the app ships a visible sign-in entry and resumable checkout', () => {
  assert.equal(appSource.includes('if (!prefs.token) return;'), false);
  assert.match(appSource, /data-act="login-open"/);
  assert.match(appSource, /window\.__pendingPay = true;/);
  assert.match(appSource, /window\.__pendingPay = false; showUnlock\(\);/);
});

/* Paddle hands the transaction id back by appending `_ptxn=` to the checkout return URL.
   Our return URL already carries a query string, so both `&_ptxn=` and a second `?_ptxn=`
   have to resolve to the same verify call. These pin the seam before a real sandbox run. */
const signedIn = { apiBase: 'https://dtt-backend.tiancai110a.workers.dev', token: 'tok' };

function paidReturn(search) {
  const { context, calls, bodies } = load({ prefs: signedIn, payMethods: null, search });
  context.window.testHandlePaidReturn();
  return { calls, bodies };
}

test('Paddle return URL verifies the transaction', () => {
  const { calls, bodies } = paidReturn('?dtt_paid=1&provider=paddle&_ptxn=txn_abc123');
  assert.deepEqual(calls, ['https://dtt-backend.tiancai110a.workers.dev/api/paddle/verify']);
  assert.deepEqual(JSON.parse(bodies[0]), { transaction_id: 'txn_abc123' });
});

test('Paddle return URL still verifies when the id is appended after a second ?', () => {
  const { calls, bodies } = paidReturn('?dtt_paid=1&provider=paddle?_ptxn=txn_xyz789');
  assert.match(calls[0], /\/api\/paddle\/verify$/);
  assert.deepEqual(JSON.parse(bodies[0]), { transaction_id: 'txn_xyz789' });
});

test('a plain visit never triggers a payment verification', () => {
  assert.deepEqual(paidReturn('').calls, []);
  assert.deepEqual(paidReturn('?dtt_paid=1&session_id=cs_test_1').calls,
    ['https://dtt-backend.tiancai110a.workers.dev/api/verify-payment']);
});
