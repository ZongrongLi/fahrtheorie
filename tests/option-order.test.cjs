// Regression tests: the option order must no longer match the catalogue order
// (the catalogue lists the correct answers first; the real exam rotates them).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');

const appSource = fs.readFileSync(require.resolve('../app.js'), 'utf8');
const aiSource = fs.readFileSync(require.resolve('../ai.js'), 'utf8');
const i18nSource = fs.readFileSync(require.resolve('../i18n.js'), 'utf8');
const dataSource = fs.readFileSync(require.resolve('../data/questions.js'), 'utf8');

const marker = '  window.__boot = boot;';
assert.equal(appSource.split(marker).length, 2, 'boot marker must be unique');
const instrumented = appSource.replace(marker,
  '  window.testQOrder = qOrder;\n' +
  '  window.testOrdKey = ordKey;\n' +
  '  window.testOrderPos = orderPos;\n' +
  '  window.testOrderLetter = orderLetter;\n' +
  '  window.testShuffleOrder = shuffleOrder;\n' +
  '  window.testOpenSession = openSession;\n' + marker);

function fakeNode() {
  return {
    innerHTML: '', textContent: '', className: '', value: '', style: {}, attrs: {},
    setAttribute(k, v) { this.attrs[k] = v; },
    getAttribute(k) { return this.attrs[k]; },
    addEventListener() {}, appendChild() {}, remove() {},
    insertAdjacentHTML() {}, querySelector() { return null; }, querySelectorAll() { return []; },
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
  };
}

function loadApp() {
  const context = {
    console, setTimeout, clearTimeout, Promise,
    window: {}, document: null, localStorage: null,
    location: { hash: '#/home', search: '', pathname: '/', href: '' },
    history: { replaceState() {} },
    navigator: {}, fetch: () => Promise.reject(new Error('no network in tests')),
  };
  context.window = context;
  context.document = {
    documentElement: { attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; } },
    readyState: 'loading', addEventListener() {},
    querySelector() { return null; }, querySelectorAll() { return []; },
    getElementById() { return null; }, createElement() { return fakeNode(); },
    head: { appendChild() {} }, body: { appendChild() {} },
  };
  const store = {};
  context.localStorage = {
    getItem(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem(k, v) { store[k] = String(v); },
    removeItem(k) { delete store[k]; },
  };
  vm.runInNewContext(dataSource, context);
  vm.runInNewContext(i18nSource, context);
  vm.runInNewContext(instrumented, context);
  return { context, questions: context.window.__CATALOG };
}

test('every displayed order is a permutation and the shuffle stays unbiased', () => {
  const { context, questions } = loadApp();
  let optioned = 0;
  const groups = new Map();
  for (const q of questions) {
    const n = (q.oe || q.od || []).length;
    if (!n) continue;
    optioned++;
    const ord = context.window.testQOrder(q);
    assert.equal(ord.length, n, q.id + ': order length');
    assert.equal(ord.slice().sort((a, b) => a - b).join(','), Array.from({ length: n }, (_, i) => i).join(','), q.id + ': permutation');
    for (let i = 0; i < n; i++) {
      assert.equal(ord[context.window.testOrderPos(q, i)], i, q.id + ': position mapping');
    }
    const key = n + '|' + q.ans.join(',');
    if (!groups.has(key)) groups.set(key, { n, k: q.ans.length, count: 0, first: 0, ident: 0, posOf0: {} });
    const g = groups.get(key);
    g.count++;
    if (q.ans.indexOf(ord[0]) >= 0) g.first++;
    if (ord.every((v, i) => v === i)) g.ident++;
    ord.forEach((orig, p) => { if (orig === 0) g.posOf0[p] = (g.posOf0[p] || 0) + 1; });
  }
  assert.ok(optioned > 0, 'the catalogue needs option questions');

  /* The 3-option groups are large enough to catch a systematic bias. A correct answer
     in the first slot must show up with the probability the true ratio implies (1/3 for
     single choice, 2/3 when two of three are correct), and canonical option 0 must be
     spread evenly over all three slots. The catalogue order itself must still be allowed
     to occur: forbidding it biases precisely the first slot, which was the v93 bug. */
  let checked = 0;
  for (const g of groups.values()) {
    if (g.count < 30) continue;
    checked++;
    const expected = g.k / g.n;
    const firstRatio = g.first / g.count;
    assert.ok(Math.abs(firstRatio - expected) < 0.1,
      `group n${g.n} k${g.k}: first slot holds a correct answer ${(firstRatio * 100).toFixed(1)}%, expected about ${(expected * 100).toFixed(1)}%`);
    const identRatio = g.ident / g.count;
    const expectedIdent = 1 / (g.n === 3 ? 6 : 2);
    assert.ok(Math.abs(identRatio - expectedIdent) < 0.18,
      `group n${g.n} k${g.k}: catalogue order occurs ${(identRatio * 100).toFixed(1)}% of the time, expected about ${(expectedIdent * 100).toFixed(1)}%`);
    if (g.n === 3) {
      for (let p = 0; p < 3; p++) {
        const ratio = (g.posOf0[p] || 0) / g.count;
        assert.ok(ratio > 0.22 && ratio < 0.45,
          `group n3 k${g.k}: canonical option 0 lands in slot ${p} ${(ratio * 100).toFixed(1)}% of the time, expected about 33.3%`);
      }
    }
  }
  assert.ok(checked >= 3, `expected several large groups, only checked ${checked}`);
});

test('the stable practice order is deterministic, keeps canonical answers intact and still allows the catalogue order', () => {
  const { context, questions } = loadApp();
  const q = questions.find((x) => (x.oe || []).length === 3 && x.ans.length === 1);
  const beforeAns = q.ans.slice(), beforeOe = q.oe.slice();
  const a = context.window.testShuffleOrder(q, 'practice');
  const b = context.window.testShuffleOrder(q, 'practice');
  assert.deepEqual(a, b, 'same seed must produce the same order');
  assert.deepEqual(q.ans, beforeAns, 'canonical answer indices must not change');
  assert.deepEqual(q.oe, beforeOe, 'canonical option text must not change');

  /* An identity permutation is a legitimate random outcome. It must not be rewritten,
     because rewriting every identity into a swap removes an entire set of permutations
     from one slot and makes that slot systematically wrong. */
  let identities = 0, threeOption = 0;
  for (const x of questions) {
    if ((x.oe || []).length !== 3) continue;
    threeOption++;
    const ord = context.window.testShuffleOrder(x, 'practice');
    if (ord.every((v, i) => v === i)) identities++;
  }
  assert.ok(threeOption > 100, 'need three-option questions');
  assert.ok(identities > threeOption * 0.08, `identity permutations almost never occur (${identities}/${threeOption})`);
});

test('different exam seeds produce different orders', () => {
  const { context, questions } = loadApp();
  let differed = false;
  for (const q of questions) {
    if ((q.oe || []).length < 3) continue;
    const a = context.window.testShuffleOrder(q, 'exam-a');
    const b = context.window.testShuffleOrder(q, 'exam-b');
    if (JSON.stringify(a) !== JSON.stringify(b)) { differed = true; break; }
  }
  assert.ok(differed, 'at least one question must change order between exam seeds');
});

test('the AI prompt uses the displayed letters, not the catalogue letters', () => {
  const q = {
    id: '1.1.01-001', th: '1.1', ch: '1.1.01', pt: 4,
    qd: 'Frage?', qe: 'Question?', sd: '', s: '',
    od: ['A richtig', 'B richtig', 'C falsch'],
    oe: ['A correct', 'B correct', 'C wrong'],
    ans: [0, 1], t: 'multi', num: null, cd: 'Erklaerung', ce: 'Explanation',
  };
  const order = [2, 0, 1];
  const context = {
    console, setTimeout, clearTimeout, Promise, window: {}, localStorage: null, fetch: () => Promise.reject(new Error('no network')),
  };
  context.window = context;
  const store = { 'dtt.ai': JSON.stringify({ base: 'https://ai.test/v1', model: 'auto', key: 'k' }) };
  context.localStorage = { getItem: (k) => store[k] || null, setItem() {}, removeItem() {} };
  vm.runInNewContext(i18nSource, context);
  vm.runInNewContext(aiSource, context);
  const prompt = context.window.AI.officialAnswerText(q, 'en', order);
  assert.equal(prompt, 'B, C', 'canonical options 0 and 1 sit at displayed positions 1 and 2 after [2,0,1]');
  const local = context.window.AI.answerLocal(q, '', 'en', false, order);
  assert.match(local, /- \*\*A\.\*\* C wrong/, 'option line A must show the first displayed option');
  assert.match(local, /- \*\*B\.\*\* A correct/, 'option line B must show the second displayed option');
  assert.match(local, /Correct answer: \*\*B, C\*\*/, 'the answer letters must follow the displayed order');
});
