// Guards the legal pages, the release "version triple" and the icon wiring.
// Run: node tests/legal.test.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const exists = f => fs.existsSync(path.join(ROOT, f));

const LANGS = ['zh', 'en', 'de', 'ru', 'tr', 'uk', 'pl', 'ro', 'vi', 'ar'];
const LEGAL_PAGES = ['privacy.html', 'terms.html'];

function packs() {
  const saved = global.window;
  global.window = {};
  /* i18n.js carries English (default + fallback); the other 9 packs are split into
     i18n-more.js and lazy-loaded by app.js ensureI18n(). These guards are about the
     content of the packs, so they read both files. */
  for (const f of ['../i18n.js', '../i18n-more.js']) {
    delete require.cache[require.resolve(f)];
    require(f);
  }
  const out = Object.assign({}, global.window.I18N_MORE, global.window.I18N);
  global.window = saved;
  assert.ok(out, 'i18n.js must expose window.I18N');
  return out;
}

test('all 10 UI packs expose the same key set and no empty strings', () => {
  const I = packs();
  assert.deepEqual(Object.keys(I).sort(), [...LANGS].sort(), 'pack list changed');
  const base = Object.keys(I.zh);
  for (const lang of LANGS) {
    const keys = Object.keys(I[lang]);
    assert.equal(keys.length, base.length, `${lang} key count differs`);
    assert.deepEqual(keys.filter(k => !(k in I.zh)), [], `${lang} has extra keys`);
    assert.deepEqual(base.filter(k => !(k in I[lang])), [], `${lang} misses keys`);
    assert.deepEqual(keys.filter(k => !String(I[lang][k]).trim()), [], `${lang} has empty values`);
  }
});

/* The refund promise was removed on the owner's instruction: there is no refund endpoint and no
   way to revoke an unlock after a refund, so "always refundable" was an unfunded promise.
   This guard keeps it from creeping back through a translation or a stray link. */
test('no refund promise survives anywhere', () => {
  assert.equal(exists('refunds.html'), false, 'refunds.html must stay deleted');
  for (const f of ['index.html', 'app.js', 'privacy.html', 'terms.html']) {
    const src = read(f);
    assert.equal(src.includes('refunds.html'), false, `${f} must not link the refund page`);
    // a page title or heading can carry the same promise without any link at all
    assert.equal(/退款|refund|撤回|Widerruf|erstatt/i.test(src), false, `${f} still carries refund wording`);
  }
  const I = packs();
  for (const lang of LANGS) {
    assert.equal(I[lang]['legal.refunds'], undefined, `${lang} must not carry legal.refunds`);
    assert.equal(I[lang]['ai.refundNote'], undefined, `${lang} must not carry ai.refundNote`);
    const offenders = Object.keys(I[lang]).filter(k => /退款|撤回|refund|Widerruf|erstatt/i.test(I[lang][k]));
    assert.deepEqual(offenders, [], `${lang} still promises refunds in: ${offenders}`);
  }
});

/* One button, one Stripe Checkout: the buyer picks card/PayPal (/Alipay/WeChat once Stripe approves
   them) inside Stripe's own dynamic method list, so the site must not name any method Stripe has not
   turned on. The button wording follows the only capability the backend still reports (stripe_paypal),
   and the dead Paddle/WeChat/CNY keys are gone from every pack - nobody may re-add a second button
   by "just" reusing an old label. */
test('the single button only promises what Stripe can deliver, and no dead labels survive', () => {
  const I = packs();
  for (const lang of LANGS) {
    assert.equal(I[lang]['pay.paddle'], undefined, `${lang}: dead Paddle label must stay deleted`);
    assert.equal(I[lang]['pay.wechat'], undefined, `${lang}: dead WeChat label must stay deleted`);
    assert.equal(I[lang]['pay.paddleLocal'], undefined, `${lang}: dead currency-note label must stay deleted`);
    assert.equal(I[lang]['pay.sCard'], undefined, `${lang}: dead per-method label must stay deleted`);
    const plain = I[lang]['pay.stripe'];
    const pp = I[lang]['pay.stripePaypal'];
    assert.ok(plain && pp, `${lang} lacks the Stripe button labels`);
    assert.match(pp, /paypal/i, `${lang}: the PayPal-live label must name PayPal`);
    assert.equal(/wechat|微信|alipay|支付宝/i.test(pp), false,
      `${lang}: the button must not name WeChat/Alipay - Stripe shows them itself once approved`);
    assert.notEqual(plain, pp, `${lang}: the two Stripe labels must differ`);
    assert.ok(I[lang]['pay.note'], `${lang} lacks pay.note`);
  }
});

test('rail footer labels are localised and keep their placeholders', () => {
  const I = packs();
  for (const lang of LANGS) {
    assert.ok(I[lang]['rail.bankVersion'].includes('{d}'), `${lang} rail.bankVersion needs {d}`);
    assert.ok(I[lang]['rail.counts'].includes('{b}') && I[lang]['rail.counts'].includes('{a}'),
      `${lang} rail.counts needs {b} and {a}`);
  }
  const index = read('index.html');
  assert.ok(index.includes('data-role="rail-version"'), 'index.html needs the rail version slot');
  assert.ok(index.includes('data-role="rail-counts"'), 'index.html needs the rail counts slot');
  const app = read('app.js');
  assert.ok(app.includes('function localizeRailFoot'), 'app.js must localise the rail footer');
  assert.ok(/CATALOGUE_DATE = "2026-04-01"/.test(app), 'catalogue date constant must be kept');
});

test('the unlock dialog makes no refund promise', () => {
  const app = read('app.js');
  const dialog = app.slice(app.indexOf('function showUnlock'), app.indexOf('function showUnlock') + 2600);
  assert.equal(/refund|退款|撤回|refundNote/i.test(dialog), false, 'the dialog must not promise refunds');
});

test('every legal page exists, cross-links the other one and points home', () => {
  for (const page of LEGAL_PAGES) assert.ok(exists(page), `${page} missing`);
  for (const page of LEGAL_PAGES) {
    const html = read(page);
    for (const other of LEGAL_PAGES) {
      if (other !== page) assert.ok(html.includes(`href="${other}"`), `${page} must link ${other}`);
    }
    assert.ok(html.includes('href="/"'), `${page} must link home`);
    assert.ok(/mailto:tiancai110a@gmail\.com/.test(html), `${page} needs a contact address`);
  }
});

test('the terms page keeps its sections numbered after the refund section was dropped', () => {
  const html = read('terms.html');
  const nums = [...html.matchAll(/<h2>(\d+)\./g)].map(m => Number(m[1]));
  assert.deepEqual(nums, [1, 2, 3, 4, 5], `terms sections must run 1..5 without gaps: ${nums}`);
});

test('rail footer and About page link both legal pages', () => {
  const index = read('index.html');
  const foot = index.slice(index.indexOf('rail-foot'), index.indexOf('</nav>'));
  for (const page of LEGAL_PAGES) {
    assert.ok(foot.includes(`href="${page}"`), `rail footer must link ${page}`);
    assert.ok(foot.includes(`data-i18n="legal.`), 'rail footer legal links must be localised');
  }
  const about = read('app.js');
  for (const page of LEGAL_PAGES) {
    assert.ok(about.includes(`<a href="${page}">`), `About page must link ${page}`);
  }
  // the rail is hidden below 768px, so the home footer must carry the same links for phones
  const homeLinks = (about.match(/class="fineprint"><a href="privacy\.html"/g) || []).length;
  assert.ok(homeLinks >= 2, `home + About must both list the legal links, found ${homeLinks}`);
});

test('release triple: asset versions, rail badge and About badge all agree', () => {
  const index = read('index.html');
  const versions = new Set([...index.matchAll(/\?v=(\d+)/g)].map(m => m[1]));
  assert.equal(versions.size, 1, `index.html mixes versions: ${[...versions]}`);
  const build = [...versions][0];
  assert.ok(index.includes(`build v${build}`), 'index.html rail badge must match ?v=');
  assert.ok(read('app.js').includes(`build v${build}`), 'About badge must match ?v=');
  for (const page of LEGAL_PAGES) {
    const sheet = [...read(page).matchAll(/styles\.css\?v=(\d+)/g)].map(m => m[1]);
    assert.deepEqual([...new Set(sheet)], [build], `${page} stylesheet version must match`);
  }
});

test('favicon and apple-touch icons are shipped and referenced', () => {
  for (const f of ['favicon.svg', 'favicon.ico', 'favicon.png', 'apple-touch-icon.png']) {
    assert.ok(exists(f), `${f} missing`);
    assert.ok(fs.statSync(path.join(ROOT, f)).size > 0, `${f} is empty`);
  }
  for (const page of ['index.html', ...LEGAL_PAGES]) {
    const html = read(page);
    assert.ok(html.includes('favicon.svg'), `${page} lacks an icon link`);
    assert.ok(html.includes('apple-touch-icon.png'), `${page} lacks an apple-touch icon`);
  }
});

/* The dialog renders exactly one payment button (data-act="pay" data-provider="stripe") and no
   per-method / per-currency entries: Stripe's checkout lists card + PayPal itself today and adds
   Alipay/WeChat on its own once approved. The note is the plain pay.note - no currency hint. */
test('the top bar labels both language dropdowns so buyers can tell quiz language from site language', () => {
  const app = read('app.js');
  const bar = app.slice(app.indexOf('function renderTopbar'), app.indexOf('function renderTopbar') + 1400);
  assert.ok(bar.includes('class="langwrap"'), 'each dropdown must carry a visible label wrapper');
  assert.ok(bar.includes('t("settings.contentLang")'), 'the quiz-language dropdown must show its name');
  assert.ok(bar.includes('t("settings.uiLang")'), 'the site-language dropdown must show its name');
});

test('only the rail keeps the coffee button, the home copy is gone', () => {
  const app = read('app.js');
  assert.equal(/data-act="support"/.test(app), false, 'no support button may be rendered from app.js');
  assert.equal(app.includes('support.cta'), false, 'the home coffee label must not be rendered any more');
  assert.ok(read('index.html').includes('data-act="support"'), 'the rail coffee button stays');
});

test('every theme name exists in every site-language pack', () => {
  const I = packs();
  const thids = ['1.1','1.2','1.3','1.4','1.5','1.7','1.8','2.1','2.2','2.4','2.5','2.6','2.7','2.8'];
  for (const lang of LANGS) {
    for (const th of thids) {
      const v = I[lang]['theme.' + th];
      assert.ok(v && v.trim(), `${lang} lacks theme.${th}`);
    }
  }
  const names1 = LANGS.map(l => I[l]['theme.1.1']);
  assert.ok(new Set(names1).size >= 9, `theme.1.1 must be translated per site language, got ${[...new Set(names1)]}`);
  assert.equal(I.zh['theme.1.1'], '危险学');
  assert.equal(I.en['theme.1.1'], 'Hazard theory');
  assert.equal(I.de['theme.1.1'], 'Gefahrenlehre');
});

test('theme tiles prefer the site-language name and never the quiz stack', () => {
  const app = read('app.js');
  assert.ok(app.includes('T.thz || trName'), 'tiles must prefer the site-language theme name');
  assert.ok(app.includes('buildIndex()'), 'switching language must rebuild the theme index');
});

test('checkout carries the site language and verify echoes it back', () => {
  const app = read('app.js');
  assert.ok(app.includes('payload.locale = prefs.uiLang'), 'checkout must send the site language as Stripe locale');
  assert.ok(app.includes('payload.lang = prefs.uiLang'), 'checkout must also send lang for localized errors');
  assert.ok(app.includes('Object.assign({ lang: prefs.uiLang }, payload)'), 'verify must send lang for localized errors');
});

test('the quiz-language label says quiz in every pack', () => {
  const I = packs();
  const want = { zh: '刷题语言', en: 'Quiz language', de: 'Übungssprache', ru: 'Язык заданий',
                 tr: 'Test dili', uk: 'Мова завдань', pl: 'Język quizu', ro: 'Limba chestionarului',
                 vi: 'Ngôn ngữ làm bài', ar: 'لغة الاختبار' };
  for (const lang of LANGS) {
    assert.equal(I[lang]['settings.contentLang'], want[lang], `${lang}: quiz-language label wrong`);
    assert.ok(I[lang]['settings.langNote'], `${lang} lacks settings.langNote`);
  }
});

test('fresh visitors default to English, not Chinese', () => {
  const app = read('app.js');
  assert.ok(app.includes('{ uiLang: "en", contentLang: "en"'), 'fresh prefs must default site and quiz language to en');
  assert.ok(app.includes('explLang: "en"'), 'fresh prefs must default explanation language to en');
  assert.equal(/prefs\.uiLang = "zh"/.test(app), false, 'no zh fallback for site language may come back');
  assert.equal(/prefs\.contentLang = "zhen"/.test(app), false, 'no zhen fallback for quiz language may come back');
});

test('the dialog renders one Stripe button, no Paddle, no method or currency entries', () => {
  const app = read('app.js');
  const dialog = app.slice(app.indexOf('function showUnlock'), app.indexOf('function downscale'));
  assert.equal((dialog.match(/data-act="pay"/g) || []).length, 1, 'exactly one payment button in the dialog');
  assert.ok(dialog.includes('data-provider="stripe"'), 'that button goes to Stripe');
  assert.equal(/data-provider="paddle"/.test(dialog), false, 'no Paddle button may come back');
  assert.equal(/data-method=/.test(dialog), false, 'no per-method button: Stripe lists methods itself');
  assert.equal(/data-currency=/.test(dialog), false, 'no per-currency button any more');
  assert.equal(/paddleLocal|stripe_methods/.test(dialog), false, 'no dead gating code may come back');
});
