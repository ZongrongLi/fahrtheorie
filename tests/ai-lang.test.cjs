// Regression tests: the AI explanation must follow the language of the question.
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

function load(zw = { '1.1.02-001': { q: '中文题干', o: ['中文选项'], c: '中文解释' } }) {
  const requests = [];
  const context = {
    window: { __ZH: zw },
    console,
    localStorage: { getItem: (k) => (k === 'dtt.ai' ? JSON.stringify({ base: 'https://ai.test/v1', model: 'auto', key: 'k' }) : null), setItem() {} },
    fetch: (url, opts) => { requests.push({ url: String(url), body: JSON.parse(opts.body) }); return Promise.resolve({ ok: true, json: () => Promise.resolve({ choices: [{ message: { content: 'x' } }] }) }); },
    setTimeout, clearTimeout, Promise,
  };
  vm.runInNewContext(i18nSource, context);
  vm.runInNewContext(aiSource, context);
  return { context, requests };
}

test('offline engine answers in German for a German question', () => {
  const { context } = load();
  const out = context.window.AI.answerLocal(QUESTION, '', 'de', true);
  assert.match(out, /Richtige Antwort/);
  assert.match(out, /richtig/);
  assert.match(out, /Mit einem Fussgaenger/);
  assert.doesNotMatch(out, /[一-龥]/);            // no Chinese leftovers
});

test('offline engine answers in Chinese for a Chinese question', () => {
  const { context } = load();
  const out = context.window.AI.answerLocal(QUESTION, '', 'zh', true);
  assert.match(out, /中文选项/);
  assert.match(out, /正确答案/);
  assert.doesNotMatch(out, /Correct answer/);
});

test('offline engine answers in English for an English question', () => {
  const { context } = load();
  const out = context.window.AI.answerLocal(QUESTION, '', 'en', true);
  assert.match(out, /With a pedestrian/);
  assert.match(out, /Correct answer/);
  assert.match(out, /Hazard theory/);
  assert.doesNotMatch(out, /[一-龥]/);
});

test('the LLM call is told to answer in the language of the question', async () => {
  const { context, requests } = load();
  await context.window.AI.chat(QUESTION, [], 'why?', 'de');
  const system = requests[0].body.messages[0].content;
  assert.match(system, /Deutsch/);
  assert.match(system, /Antworte auf Deutsch/);
  assert.match(system, /Question \(DE\)/);
  assert.equal(requests[0].body.messages[requests[0].body.messages.length - 1].content, 'why?');
});

test('the LLM call switches to Chinese when the question is shown in Chinese', async () => {
  const { context, requests } = load();
  await context.window.AI.chat(QUESTION, [], 'why?', 'zh');
  const system = requests[0].body.messages[0].content;
  assert.match(system, /简体中文/);
  assert.match(system, /用简体中文回答/);
});

test('the canned first prompt matches the target language', () => {
  const { context } = load();
  assert.match(context.window.AI.askText('de'), /Deutsch/);
  assert.match(context.window.AI.askText('zh'), /简体中文/);
  assert.match(context.window.AI.askText('en'), /English/);
});

test('the German prompt carries no redundant English translation (token diet)', async () => {
  const { context, requests } = load();
  await context.window.AI.chat(QUESTION, [], 'warum?', 'de');
  const system = requests[0].body.messages[0].content;
  assert.doesNotMatch(system, /Question \(EN\)/);
  assert.doesNotMatch(system, /Sentence stem \(EN\)/);
  assert.doesNotMatch(system, /EN: /);
  assert.doesNotMatch(system, /Official explanation \(EN\)/);
  assert.match(system, /Question \(DE\): Womit muessen Sie rechnen\?/);
  assert.match(system, /Official explanation \(DE\): Weil Fussgaenger/);
});

test('the Chinese prompt uses the Chinese translation instead of the English one', async () => {
  const { context, requests } = load();
  await context.window.AI.chat(QUESTION, [], '为什么?', 'zh');
  const system = requests[0].body.messages[0].content;
  assert.match(system, /Question \(ZH\): 中文题干/);
  assert.match(system, /ZH: 中文选项/);
  assert.doesNotMatch(system, /Question \(EN\)/);
});
