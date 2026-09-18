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
const LEGAL_PAGES = ['privacy.html', 'terms.html', 'refunds.html'];

function packs() {
  const saved = global.window;
  global.window = {};
  delete require.cache[require.resolve('../i18n.js')];
  require('../i18n.js');
  const out = global.window.I18N;
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

test('refund policy strings exist in every pack', () => {
  const I = packs();
  for (const lang of LANGS) {
    assert.ok(I[lang]['legal.refunds'], `${lang} lacks legal.refunds`);
    assert.ok(I[lang]['ai.refundNote'], `${lang} lacks ai.refundNote`);
    assert.notEqual(I[lang]['legal.terms'], I[lang]['legal.refunds'],
      `${lang}: terms and refunds labels must not read the same`);
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
  assert.ok(/CATALOGUE_DATE = "2025-04-01"/.test(app), 'catalogue date constant must be kept');
});

test('the unlock dialog states the withdrawal terms before payment', () => {
  const app = read('app.js');
  const dialog = app.slice(app.indexOf('function showUnlock'), app.indexOf('function showUnlock') + 2600);
  assert.ok(dialog.includes('t("ai.refundNote")'), 'unlock dialog must show the refund note');
  assert.ok(dialog.includes('href="refunds.html"'), 'unlock dialog must link the refund page');
});

test('every legal page exists, cross-links the other two and points home', () => {
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

test('the refund page covers the withdrawal window in zh, en and de', () => {
  const html = read('refunds.html');
  assert.ok(html.includes('14 天'), 'Chinese 14-day window');
  assert.ok(html.includes('14 days'), 'English 14-day window');
  assert.ok(html.includes('Widerruf'), 'German withdrawal wording');
  assert.ok(html.includes('数字内容') && html.includes('digital content'), 'immediate-delivery clause');
});

test('rail footer and About page link all three legal pages', () => {
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
