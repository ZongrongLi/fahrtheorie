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
  '  window.testHandlePaidReturn = handlePaidReturn;\n  window.testDoCheckout = doCheckout;\n  window.testRefreshQuota = refreshQuota;\n  window.testPaddleEvent = paddleEvent;\n' + marker);

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
    setTimeout, clearTimeout, setInterval, clearInterval,
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
  assert.equal(JSON.parse(bodies[0]).transaction_id, 'txn_abc123');
  assert.equal(typeof JSON.parse(bodies[0]).lang, 'string', 'verify carries the site language for localized errors');
});

/* Observed live from the sandbox API on 2026-09-18: Paddle puts _ptxn FIRST and keeps our
   params after it, i.e. ?_ptxn=txn_...&dtt_paid=1&provider=paddle — not the appended form. */
test('Paddle return URL verifies when _ptxn comes first', () => {
  const { calls, bodies } = paidReturn('?_ptxn=txn_01m2v47p7stwy9hda2nhnzr21p&dtt_paid=1&provider=paddle');
  assert.deepEqual(calls, ['https://dtt-backend.tiancai110a.workers.dev/api/paddle/verify']);
  assert.equal(JSON.parse(bodies[0]).transaction_id, 'txn_01m2v47p7stwy9hda2nhnzr21p');
  assert.equal(typeof JSON.parse(bodies[0]).lang, 'string', 'verify carries the site language for localized errors');
});

test('Paddle return URL still verifies when the id is appended after a second ?', () => {
  const { calls, bodies } = paidReturn('?dtt_paid=1&provider=paddle?_ptxn=txn_xyz789');
  assert.match(calls[0], /\/api\/paddle\/verify$/);
  assert.equal(JSON.parse(bodies[0]).transaction_id, 'txn_xyz789');
  assert.equal(typeof JSON.parse(bodies[0]).lang, 'string', 'verify carries the site language for localized errors');
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

test('the unlock entry opens a single-button Stripe chooser even when Paddle is listed', async () => {
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
  assert.equal(/data-provider="paddle"/.test(box.inserted), false,
    'Paddle is gone from the dialog, Stripe is the only way to pay');
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
  assert.deepEqual(calls, [
    'https://dtt-backend.tiancai110a.workers.dev/api/paddle/verify',
    'https://dtt-backend.tiancai110a.workers.dev/api/me',
  ], 'verify first, then keep watching the account so nobody has to refresh by hand');
  assert.equal(JSON.parse(bodies[0]).transaction_id, 'txn_new');
  assert.equal(typeof JSON.parse(bodies[0]).lang, 'string', 'verify carries the site language for localized errors');
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
  assert.equal(nodes['pay-note'].textContent, context.window.I18N.zh['pay.note'],
    'Stripe charges the price currency, so the CNY hint must not show');
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

/* A Chinese buyer may be sitting on a European VPN, so the IP cannot decide whether WeChat Pay is
   offered. The dialog shows an explicit entry that asks the backend for a CNY transaction. */
const wechatMethods = {
  providers: { stripe: true, paddle: true },
  price: { cents: 500, currency: 'eur', name: 'Unlimited AI (one-off)' },
  paddle_token: 'test_ctk_wc', paddle_currency: '', paddle_wechat_currencies: ['CNY', 'USD'],
};

/* stripe_paypal:true = PayPal is live on Stripe, so the one button names it. Hoisted: used above. */
const stripePaypalMethods = Object.assign({}, wechatMethods, { stripe_paypal: true });

function clickPay(listeners, attrs) {
  const el = {
    getAttribute: (k) => (k === 'data-act' ? 'pay' : (attrs[k] || null)),
    classList: { contains() { return false; } },
    closest(sel) { return sel.indexOf('data-act') >= 0 ? el : null; },
  };
  const event = { target: { closest: (sel) => (sel.indexOf('data-act') >= 0 ? el : null) }, preventDefault() {} };
  (listeners.click || []).forEach((fn) => fn(event));
}

test('the chooser shows exactly one Stripe button and no Paddle entries', async () => {
  const { context, nodes } = load({ prefs: signedIn, payMethods: wechatMethods });
  context.window.testShowUnlock();
  await tick();
  const inserted = nodes['pay-btns'].inserted;
  assert.equal((inserted.match(/data-act="pay"/g) || []).length, 1, 'one payment button, not two');
  assert.match(inserted, /data-provider="stripe"/, 'that button goes to Stripe');
  assert.equal(/data-provider="paddle"/.test(inserted), false, 'the Paddle entries are gone');
  assert.equal(/data-currency=/.test(inserted), false, 'no per-currency entry is needed any more');
  assert.equal(/data-method=/.test(inserted), false,
    'the buyer picks card/PayPal inside the Stripe checkout, the site must not pin one method');
});

test('clicking the button opens a plain Stripe session so the checkout lists every live method', async () => {
  const STRIPE_OK = { provider: 'stripe', id: 'cs_test_9', url: 'https://checkout.stripe.com/c/pay/cs_test_9' };
  const { context, listeners, calls, bodies } = load({
    prefs: signedIn, payMethods: stripePaypalMethods, checkout: STRIPE_OK,
  });
  context.window.testShowUnlock();
  await tick();
  calls.length = 0; bodies.length = 0;
  clickPay(listeners, { 'data-provider': 'stripe' });
  await tick();
  const i = calls.findIndex((c) => /\/api\/checkout$/.test(c));
  assert.ok(i >= 0, 'the Stripe checkout endpoint must be called');
  const sent5 = JSON.parse(bodies[i]);
  assert.equal('method' in sent5, false, 'no method is forced, so Stripe offers card + PayPal (+ later Alipay/WeChat)');
  assert.equal(typeof sent5.locale, 'string', 'checkout sends the site language as Stripe locale');
  assert.equal(typeof sent5.lang, 'string', 'checkout sends lang for localized errors');
});

/* Paddle can report the checkout as finished before its own API says the transaction is paid, and
   the webhook may be what actually unlocks. Either way the buyer must not have to refresh by hand,
   so a payment attempt keeps re-reading /api/me until the account flips. */
test('a payment that is not confirmed yet keeps re-checking instead of leaving the buyer stuck', async () => {
  const { context, calls } = load({
    prefs: signedIn,
    payMethods: { providers: { paddle: true }, paddle_token: 'test_ctk_poll' },
    checkout: PADDLE_OK,
    me: { user: 'a', uid: 'u1', left: 19, unlimited: false },
  });
  context.window.testShowUnlock();
  await tick();
  context.window.Paddle = { Environment: { set() {} }, Initialize() {}, Checkout: { open() {} } };
  context.window.testDoCheckout('paddle');
  await tick();
  calls.length = 0;
  context.window.testPaddleEvent({ event: 'checkout.completed', data: { id: 'txn_poll_1' } });
  await tick();
  assert.ok(calls.some((c) => /\/api\/me$/.test(c)),
    'the client must re-read the account after the checkout reports done');
});

test('closing the checkout also starts the re-check, because the webhook may be the only signal', async () => {
  const { context, calls } = load({
    prefs: signedIn,
    payMethods: { providers: { paddle: true }, paddle_token: 'test_ctk_closed' },
    checkout: PADDLE_OK,
    me: { user: 'a', uid: 'u1', left: 19, unlimited: true },
  });
  context.window.testShowUnlock();
  await tick();
  context.window.Paddle = { Environment: { set() {} }, Initialize() {}, Checkout: { open() {} } };
  context.window.testDoCheckout('paddle');
  await tick();
  calls.length = 0;
  context.window.testPaddleEvent({ event: 'checkout.closed', data: {} });
  await tick();
  assert.ok(calls.some((c) => /\/api\/me$/.test(c)), 'closing without a client-side confirm must still re-check');
  assert.equal(context.window.testPrefs.unlimited, true, 'a webhook unlock must reach the UI');
});

test('browsing without paying does not start any polling', async () => {
  const { context, calls } = load({
    prefs: signedIn,
    payMethods: { providers: { paddle: true }, paddle_token: 'test_ctk_idle' },
  });
  context.window.testShowUnlock();
  await tick();
  calls.length = 0;
  await new Promise((r) => setTimeout(r, 250));
  assert.deepEqual(calls, [], 'no checkout opened means no repeated account reads');
});

test('with PayPal live the single button names PayPal instead of pretending only card exists', async () => {
  const { context, nodes } = load({ prefs: signedIn, payMethods: stripePaypalMethods });
  context.window.testShowUnlock();
  await tick();
  const inserted = nodes['pay-btns'].inserted;
  assert.equal((inserted.match(/data-act="pay"/g) || []).length, 1, 'still one button');
  assert.match(inserted, new RegExp(context.window.I18N.zh['pay.stripePaypal'].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    'the button must name PayPal now that Stripe can deliver it');
});

test('without Stripe PayPal the button must not say PayPal', async () => {
  const { context, nodes } = load({ prefs: signedIn, payMethods: wechatMethods });
  context.window.testShowUnlock();
  await tick();
  assert.equal(/PayPal/i.test(nodes['pay-btns'].inserted), false,
    'never advertise PayPal that Stripe has not enabled');
  assert.match(nodes['pay-btns'].inserted, /data-act="pay" data-provider="stripe"/);
});

test('a Stripe-only backend still gets the button and a Paddle-only backend does not', async () => {
  const onlyStripe = { providers: { stripe: true, paddle: false }, stripe_paypal: true };
  const a = load({ prefs: signedIn, payMethods: onlyStripe });
  a.context.window.testShowUnlock();
  await tick();
  assert.equal((a.nodes['pay-btns'].inserted.match(/data-act="pay"/g) || []).length, 1);

  const onlyPaddle = { providers: { stripe: false, paddle: true }, paddle_token: 'ctk' };
  const b = load({ prefs: signedIn, payMethods: onlyPaddle });
  b.context.window.testShowUnlock();
  await tick();
  assert.equal(/data-act="pay"/.test(b.nodes['pay-btns'].inserted), false,
    'without Stripe there is nothing to pay with, so no button is promised');
});
