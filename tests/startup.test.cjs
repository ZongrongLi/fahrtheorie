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
  '  window.testHandlePaidReturn = handlePaidReturn;\n  window.testDoCheckout = doCheckout;\n  window.testRefreshQuota = refreshQuota;\n' + marker);

function stubNode() {
  return {
    innerHTML: '', textContent: '', className: '', inserted: '', removed: false,
    setAttribute() {}, appendChild() {}, remove() { this.removed = true; },
    insertAdjacentHTML(_pos, html) { this.inserted += html; },
    classList: { contains() { return false; }, add() {}, remove() {}, toggle() {} },
  };
}

function load({ prefs = {}, payMethods, search = '', checkout, me, meFail = false } = {}) {
  const nodes = {}, calls = [], bodies = [], scripts = [], listeners = {};
  const nav = [];
  const context = {
    window: {},
    console,
    location: {
      search, hash: '#/home', pathname: '/',
      get href() { return ''; }, set href(v) { nav.push(String(v)); },
    },
    history: { replaceState() {} },
    document: {
      documentElement: { attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; } },
      readyState: 'loading',
      addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
      createElement: () => { const n = stubNode(); scripts.push(n); return n; },
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
    localStorage: { getItem: (k) => (k === 'dtt.prefs' ? JSON.stringify(prefs) : null), setItem() {} },
    fetch: (url, init) => {
      calls.push(String(url));
      bodies.push(init && init.body ? String(init.body) : '');
      // 回跳类请求只断言"发了什么"，响应直接失败：verifyPayment 的 catch 会静默收尾，不级联刷新
      if (String(url).includes('/verify')) return Promise.reject(new Error('assert-request-only'));
      if (/\/api\/me$/.test(String(url))) {
        if (meFail) return Promise.reject(new Error('offline'));
        return Promise.resolve({ ok: true, json: () => Promise.resolve(me || {}) });
      }
      if (/\/checkout$|\/paddle\/checkout$/.test(String(url)) && checkout) {
        return Promise.resolve({ json: () => Promise.resolve(checkout) });
      }
      if (!payMethods) return Promise.reject(new Error('offline'));
      return Promise.resolve({ json: () => Promise.resolve(payMethods) });
    },
    setTimeout, clearTimeout,
  };
  vm.runInNewContext(i18nSource, context);
  vm.runInNewContext(instrumented, context);
  return { context, nodes, calls, bodies, scripts, nav, listeners };
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

/* Observed live from the sandbox API on 2026-09-18: Paddle puts _ptxn FIRST and keeps our
   params after it, i.e. ?_ptxn=txn_...&dtt_paid=1&provider=paddle — not the appended form. */
test('Paddle return URL verifies when _ptxn comes first', () => {
  const { calls, bodies } = paidReturn('?_ptxn=txn_01m2v47p7stwy9hda2nhnzr21p&dtt_paid=1&provider=paddle');
  assert.deepEqual(calls, ['https://dtt-backend.tiancai110a.workers.dev/api/paddle/verify']);
  assert.deepEqual(JSON.parse(bodies[0]), { transaction_id: 'txn_01m2v47p7stwy9hda2nhnzr21p' });
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

/* Paddle's transaction.checkout.url is a "open the checkout on this page" URL that needs
   Paddle.js, not a post-payment redirect. So the Paddle button must drive the overlay with the
   transaction id we created; only Stripe may navigate away. */
const PADDLE_JS = 'https://cdn.paddle.com/paddle/v2/paddle.js'; // /2.0/paddle.js answers 403 - verified 2026-09-18
const PADDLE_OK = { provider: 'paddle', url: 'https://fahrtheorie.homes/?_ptxn=txn_new&dtt_paid=1&provider=paddle', id: 'txn_new' };

test('the Paddle button opens the Paddle.js overlay instead of navigating away', async () => {
  const opened = [], inits = [];
  const { context, nav } = load({
    prefs: signedIn,
    payMethods: { providers: { stripe: false, paddle: true }, paddle_token: 'test_ctk_1' },
    checkout: PADDLE_OK,
  });
  context.window.Paddle = { Initialize(o) { inits.push(o); }, Checkout: { open(o) { opened.push(o); } } };
  context.window.testShowUnlock();          // the button only exists after /api/pay-methods resolved
  await tick();
  context.window.testDoCheckout('paddle');
  await tick();
  assert.equal(JSON.stringify(inits), JSON.stringify([{ token: 'test_ctk_1' }]), 'Paddle.js must be initialised with the client-side token');
  assert.equal(JSON.stringify(opened), JSON.stringify([{ transactionId: 'txn_new' }]), 'the overlay must open for our transaction');
  assert.deepEqual(nav, [], 'the customer must not be sent away from the site');
});

test('Paddle.js is lazy-loaded once and opens the overlay when it arrives', async () => {
  const opened = [];
  const { context, scripts, nav } = load({
    prefs: signedIn,
    payMethods: { providers: { stripe: false, paddle: true }, paddle_token: 'test_ctk_2' },
    checkout: PADDLE_OK,
  });
  context.window.testShowUnlock();
  await tick();
  context.window.testDoCheckout('paddle');
  await tick();
  const pd = scripts.filter((s) => String(s.src || '').indexOf(PADDLE_JS) === 0);
  assert.equal(pd.length, 1, 'exactly one Paddle.js script must be injected');
  assert.equal(JSON.stringify(opened), '[]', 'nothing opens before the script has loaded');
  context.window.Paddle = { Initialize() {}, Checkout: { open(o) { opened.push(o); } } };
  pd[0].onload();
  await tick();
  assert.equal(JSON.stringify(opened), JSON.stringify([{ transactionId: 'txn_new' }]));
  assert.deepEqual(nav, []);
});

test('a missing client-side token falls back to the returned checkout URL', async () => {
  const { context, nav, scripts } = load({
    prefs: signedIn,
    payMethods: { providers: { stripe: false, paddle: true } },
    checkout: PADDLE_OK,
  });
  context.window.testDoCheckout('paddle');
  await tick();
  assert.deepEqual(scripts.filter((s) => /cdn\.paddle\.com/.test(String(s.src || ''))), [], 'no Paddle.js without a token');
  assert.deepEqual(nav, [PADDLE_OK.url], 'without a token the old redirect behaviour must remain');
});

test('Stripe still redirects to its hosted checkout session', async () => {
  const { context, nav } = load({
    prefs: signedIn,
    payMethods: { providers: { stripe: true, paddle: false } },
    checkout: { provider: 'stripe', url: 'https://checkout.stripe.com/c/pay/cs_test_9', id: 'cs_test_9' },
  });
  context.window.testDoCheckout('stripe');
  await tick();
  assert.deepEqual(nav, ['https://checkout.stripe.com/c/pay/cs_test_9']);
});

/* With two providers live, the unlock entry must offer the choice instead of hard-jumping to
   Stripe. Observed on production: a signed-in visitor clicking "Unlock unlimited AI" landed on
   checkout.stripe.com and never saw the Paddle option. This drives the real document handler. */
function clickAct(listeners, act) {
  const el = {
    getAttribute: (k) => (k === 'data-act' ? act : null),
    classList: { contains() { return false; } },
    closest(sel) { return sel.indexOf('data-act') >= 0 ? el : null; },
  };
  const event = { target: { closest: (sel) => (sel.indexOf('data-act') >= 0 ? el : null) }, preventDefault() {} };
  (listeners.click || []).forEach((fn) => fn(event));
}

test('the unlock entry opens the provider chooser when Paddle is available', async () => {
  const { nodes, nav, listeners } = load({
    prefs: signedIn,
    payMethods: { providers: { stripe: true, paddle: true }, paddle_token: 'test_ctk_3' },
  });
  assert.ok(listeners.click && listeners.click.length, 'the app must register a document click handler');
  clickAct(listeners, 'unlock-open');
  await tick();
  assert.deepEqual(nav, [], 'clicking unlock must not navigate to Stripe on its own');
  const box = nodes['pay-btns'];
  assert.ok(box, 'the chooser dialog must render');
  assert.match(box.inserted, /data-provider="stripe"/);
  assert.match(box.inserted, /data-provider="paddle"/);
});

/* Paddle.js defaults to the production environment, so a sandbox transaction opened without
   switching it lands on buy.paddle.com and Paddle renders "Something went wrong".
   The client-side token prefix carries the environment, so use it. */
function paddleProbe(token) {
  const envs = [], opened = [];
  const { context, nodes } = load({
    prefs: signedIn,
    payMethods: { providers: { stripe: false, paddle: true }, paddle_token: token },
    checkout: PADDLE_OK,
  });
  context.window.Paddle = {
    Environment: { set(v) { envs.push(v); } },
    Initialize() {},
    Checkout: { open(o) { opened.push(o.transactionId); } },
  };
  context.window.testShowUnlock();
  return { context, nodes, envs, opened };
}

async function probePaddle(token) {
  const probe = paddleProbe(token);
  await tick();                 // payCache is filled by the dialog's /api/pay-methods call
  probe.context.window.testDoCheckout('paddle');
  await tick();
  return probe;
}

test('a test_ client-side token selects the Paddle sandbox environment', async () => {
  const { envs, opened } = await probePaddle('test_ctk_env1');
  assert.deepEqual(envs, ['sandbox'], 'Paddle.js must be pointed at sandbox before opening');
  assert.deepEqual(opened, ['txn_new']);
});

test('a live_ client-side token selects the production environment', async () => {
  const { envs } = await probePaddle('live_ctk_env2');
  assert.deepEqual(envs, ['production']);
});

/* Payment is not finished until our backend unlocks the account: Paddle hands the result back
   through the Initialize eventCallback, so checkout.completed must trigger /api/paddle/verify.
   Proven necessary by a real sandbox payment that completed on Paddle's side (status completed,
   custom_data.uid intact) while the account stayed unlimited:false. */
test('checkout.completed verifies the transaction with our backend', async () => {
  const init = [];
  const { context, calls, bodies } = load({
    prefs: signedIn,
    payMethods: { providers: { stripe: false, paddle: true }, paddle_token: 'test_ctk_evt' },
    checkout: PADDLE_OK,
  });
  context.window.Paddle = {
    Environment: { set() {} },
    Initialize(o) { init.push(o); },
    Checkout: { open() {} },
  };
  context.window.testShowUnlock();
  await tick();
  context.window.testDoCheckout('paddle');
  await tick();
  assert.equal(init.length, 1, 'Paddle.js must be initialised once');
  assert.equal(typeof init[0].eventCallback, 'function', 'an eventCallback must be registered');

  calls.length = 0; bodies.length = 0;
  init[0].eventCallback({ event: 'checkout.completed', data: { id: 'txn_new' } });
  await tick();
  assert.deepEqual(calls, ['https://dtt-backend.tiancai110a.workers.dev/api/paddle/verify']);
  assert.deepEqual(JSON.parse(bodies[0]), { transaction_id: 'txn_new' });
});

test('unrelated Paddle events do not trigger a verification', async () => {
  const init = [];
  const { context, calls } = load({
    prefs: signedIn,
    payMethods: { providers: { stripe: false, paddle: true }, paddle_token: 'test_ctk_evt2' },
    checkout: PADDLE_OK,
  });
  context.window.Paddle = { Environment: { set() {} }, Initialize(o) { init.push(o); }, Checkout: { open() {} } };
  context.window.testShowUnlock();
  await tick();
  context.window.testDoCheckout('paddle');
  await tick();
  calls.length = 0;
  init[0].eventCallback({ event: 'checkout.start', data: {} });
  init[0].eventCallback({ event: 'theme.changed' });
  await tick();
  assert.deepEqual(calls, [], 'only checkout.completed may call the verifier');
});

/* Paddle only offers WeChat Pay when the transaction is in CNY/USD, so the backend now picks a
   settlement currency per visitor and reports it as `paddle_currency`. A buyer who will be charged
   in something other than the price currency must be told in the dialog, not surprised by it. */
test('a visitor who will be charged in a local currency is told so before paying', async () => {
  const { context, nodes } = load({
    prefs: signedIn,
    payMethods: {
      providers: { stripe: true, paddle: true },
      price: { cents: 500, currency: 'eur', name: 'Unlimited AI (one-off)' },
      paddle_token: 'test_ctk_cur', paddle_currency: 'CNY',
    },
  });
  context.window.testShowUnlock();
  await tick();
  assert.match(nodes['pay-note'].textContent, /CNY/,
    'the dialog must name the currency this buyer will actually be charged in');
});

test('no settlement-currency hint when the buyer pays in the price currency', async () => {
  const { context, nodes } = load({
    prefs: signedIn,
    payMethods: {
      providers: { stripe: true, paddle: true },
      price: { cents: 500, currency: 'eur', name: 'Unlimited AI (one-off)' },
      paddle_token: 'test_ctk_cur', paddle_currency: '',
    },
  });
  context.window.testShowUnlock();
  await tick();
  assert.equal(nodes['pay-note'].textContent, context.window.I18N.zh['pay.note'],
    'a German buyer must not be shown a CNY hint');
});

/* The backend is the only source of truth for "has this account paid". The client used to flip
   prefs.unlimited to true and never back, so an account reset server-side kept showing as paid in
   the browser forever. */
const paidPrefs = { apiBase: 'https://dtt-backend.tiancai110a.workers.dev', token: 'tok', unlimited: true };

test('an account that is no longer paid on the server stops showing as paid', async () => {
  const { context } = load({ prefs: paidPrefs, me: { user: 'a', uid: 'u1', left: 19, unlimited: false } });
  context.window.testRefreshQuota();
  await tick();
  assert.equal(context.window.testPrefs.unlimited, false,
    'a reset account must not stay unlocked in the browser');
});

test('a paid account stays unlocked when the server confirms it', async () => {
  const { context } = load({ prefs: paidPrefs, me: { user: 'a', uid: 'u1', left: 19, unlimited: true } });
  context.window.testRefreshQuota();
  await tick();
  assert.equal(context.window.testPrefs.unlimited, true);
});

test('an unreachable /api/me must not lock out a paying user', async () => {
  const { context } = load({ prefs: paidPrefs, meFail: true });
  context.window.testRefreshQuota();
  await tick();
  assert.equal(context.window.testPrefs.unlimited, true,
    'a failed request is not evidence that the account stopped being paid');
});
