// Regression tests: a Chinese AI question used to freeze the whole page.
// ai.js chat() awaited window.__ensureZh() and then re-entered chat() with no
// state change, so with a defined __ensureZh (app.js always defines it) the
// promise chain recursed forever in the microtask queue: no fetch was ever
// issued and the main thread starved, which looked like "the page froze".
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');

const aiSource = fs.readFileSync(require.resolve('../ai.js'), 'utf8');
const i18nSource = fs.readFileSync(require.resolve('../i18n.js'), 'utf8');

const QUESTION = {
  id: '1.1.02-001', th: '1.1', ch: '1.1.02', the: 'Hazard theory', che: 'Dangers', thd: 'Gefahrenlehre', chd: 'Gefahren',
  pt: 3, t: 'mc', qd: 'Womit muessen Sie rechnen?', qe: 'What must you expect?',
  od: ['Mit einem Fussgaenger', 'Mit einem Radfahrer'], oe: ['With a pedestrian', 'With a cyclist'],
  ans: [0], cd: 'Weil Fussgaenger die Fahrbahn queren koennen.', ce: 'Because pedestrians may cross the road.',
  s: '', sd: '', num: null,
};
const ZH = { '1.1.02-001': { q: '中文题干', o: ['中文选项'], c: '中文解释' } };

/* Mirrors the real page: app.js always assigns window.__ensureZh; data/zh.js is
   what actually sets window.__ZH once it has loaded. */
function load(zhLoaded, loadResult) {
  const requests = [];
  let ensureCalls = 0;
  const context = {
    window: {},
    console,
    localStorage: { getItem: (k) => (k === 'dtt.ai' ? JSON.stringify({ base: 'https://ai.test/v1', model: 'auto', key: 'k' }) : null), setItem() {} },
    fetch: (url, opts) => { requests.push({ url: String(url), body: JSON.parse(opts.body) }); return Promise.resolve({ ok: true, json: () => Promise.resolve({ choices: [{ message: { content: 'x' } }] }) }); },
    setTimeout, clearTimeout, Promise,
  };
  context.window.__ZH = zhLoaded ? ZH : undefined;
  context.window.__ensureZh = function () {
    ensureCalls++;
    return Promise.resolve(loadResult).then(function (ok) { if (ok) context.window.__ZH = ZH; return ok; });
  };
  vm.runInNewContext(i18nSource, context);
  vm.runInNewContext(aiSource, context);
  return { context, requests, ensureCalls: () => ensureCalls };
}

test('Chinese AI question with the pack already loaded goes straight to the network', { timeout: 5000 }, async () => {
  const { context, requests, ensureCalls } = load(true, true);
  const out = await context.window.AI.chat(QUESTION, [], '为什么？', 'zh');
  assert.equal(out, 'x');
  assert.equal(requests.length, 1);                      // exactly one upstream call
  assert.equal(ensureCalls(), 0);                        // nothing to wait for
  assert.match(requests[0].body.messages[0].content, /中文题干/);
});

test('Chinese AI question waits for the lazy pack exactly once', { timeout: 5000 }, async () => {
  const { context, requests, ensureCalls } = load(false, true);
  const out = await context.window.AI.chat(QUESTION, [], '为什么？', 'zh');
  assert.equal(out, 'x');
  assert.equal(requests.length, 1);
  assert.equal(ensureCalls(), 1);                        // one wait, never a second
  assert.match(requests[0].body.messages[0].content, /中文题干/);
});

test('a failed pack load still answers instead of looping forever', { timeout: 5000 }, async () => {
  const { context, requests, ensureCalls } = load(false, false);
  const out = await context.window.AI.chat(QUESTION, [], 'why?', 'zh');
  assert.equal(out, 'x');
  assert.equal(requests.length, 1);
  assert.equal(ensureCalls(), 1);
  assert.match(requests[0].body.messages[0].content, /What must you expect\?/);   // English fallback, no hang
});

test('a second Chinese question does not wait for the pack again', { timeout: 5000 }, async () => {
  const { context, requests, ensureCalls } = load(false, false);
  await context.window.AI.chat(QUESTION, [], 'why?', 'zh');
  await context.window.AI.chat(QUESTION, [], 'and again?', 'zh');
  assert.equal(requests.length, 2);
  assert.equal(ensureCalls(), 1);
});

test('English and German questions never touch the zh loader', { timeout: 5000 }, async () => {
  for (const lang of ['en', 'de']) {
    const { context, requests, ensureCalls } = load(false, true);
    await context.window.AI.chat(QUESTION, [], 'why?', lang);
    assert.equal(requests.length, 1);
    assert.equal(ensureCalls(), 0);
  }
});
