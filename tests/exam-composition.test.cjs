const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');

const appSource = fs.readFileSync(require.resolve('../app.js'), 'utf8');
const marker = '  window.__boot = boot;';
assert.equal(appSource.split(marker).length, 2, 'boot marker must be unique');
const instrumented = appSource.replace(marker,
  '  window.testExam = { buildExamIds: buildExamIds, examPool: examPool, rules: EXAM_RULES };\n' +
  '  window.testFive = { ids: fivePointPracticeIds, categories: vCategories };\n' + marker);

function stubNode() {
  return {
    innerHTML: '', textContent: '', className: '', inserted: '', removed: false, open: false,
    setAttribute() {}, appendChild() {}, remove() { this.removed = true; },
    insertAdjacentHTML(_pos, html) { this.inserted += html; },
    focus() {},
    classList: { contains() { return false; }, add() {}, remove() {}, toggle() {} },
  };
}

function load() {
  const nodes = {};
  const context = {
    window: { addEventListener() {}, scrollTo() {} },
    console,
    location: { search: '', hash: '#/home', pathname: '/' },
    history: { replaceState() {} },
    document: {
      documentElement: { attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; } },
      hidden: false,
      readyState: 'loading',
      addEventListener() {},
      createElement: () => stubNode(),
      body: { appendChild() {} },
      head: { appendChild() {} },
      getElementById(id) { if (!nodes[id]) nodes[id] = stubNode(); return nodes[id]; },
      querySelectorAll: () => [],
      querySelector(sel) {
        const m = /\[data-role="([^"]+)"\]/.exec(sel);
        return m ? (nodes[m[1]] || (nodes[m[1]] = stubNode())) : null;
      },
    },
    localStorage: {
      getItem: () => null,
      setItem() {},
      removeItem() {},
    },
    fetch: () => Promise.reject(new Error('offline')),
    setTimeout: () => 0,
    clearTimeout() {},
    setInterval: () => 0,
    clearInterval() {},
    TextEncoder,
    TextDecoder,
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../data/questions.js'), 'utf8'), context);
  vm.runInNewContext(fs.readFileSync(require.resolve('../data/scope.js'), 'utf8'), context);
  vm.runInNewContext(fs.readFileSync(require.resolve('../i18n.js'), 'utf8'), context);
  vm.runInNewContext(instrumented, context);
  context.window.__boot();
  return context.window;
}

test('mock exam uses the official Class B chapter and point quotas', () => {
  const window = load();
  const byId = {};
  window.__CATALOG.forEach((q) => { byId[q.id] = q; });
  const expected = {
    '1.1': { n: 8, pts: 32 },
    '1.2': { n: 6, pts: 21 },
    '1.3': { n: 3, pts: 15 },
    '1.4': { n: 2, pts: 6 },
    '1.5': { n: 1, pts: 3 },
    '2.*': { n: 10, pts: 33 },
  };

  for (let run = 0; run < 20; run++) {
    const ids = window.testExam.buildExamIds();
    assert.equal(ids.length, 30);
    assert.equal(new Set(ids).size, 30, 'an exam must not repeat a question');
    const counts = {};
    const points = {};
    let total = 0;
    for (const id of ids) {
      const q = byId[id];
      assert.ok(q, `unknown question ${id}`);
      const key = String(q.th).indexOf('2.') === 0 ? '2.*' : q.th;
      counts[key] = (counts[key] || 0) + 1;
      points[key] = (points[key] || 0) + q.pt;
      total += q.pt;
    }
    for (const key of Object.keys(expected)) {
      assert.equal(counts[key], expected[key].n, `${key} question count`);
      assert.equal(points[key], expected[key].pts, `${key} point sum`);
    }
    assert.equal(total, 110, 'the official Class B exam totals 110 points');
  }
});

test('numeric questions are eligible in the official exam pools', () => {
  const window = load();
  assert.ok(window.testExam.examPool('1.2').some((q) => q.t === 'num'), 'numeric basic questions stay eligible');
  assert.ok(window.testExam.examPool('2.*').some((q) => q.t === 'num'), 'numeric specific questions stay eligible');
});

test('the 20 fixed sets are deterministic and differ from one another', () => {
  const window = load();
  const first = window.testExam.buildExamIds('official-set-1').join(',');
  const again = window.testExam.buildExamIds('official-set-1').join(',');
  const second = window.testExam.buildExamIds('official-set-2').join(',');
  assert.equal(first, again, 'the same set number must produce the same questions');
  assert.notEqual(first, second, 'different set numbers must produce different sets');
});

test('the non-right-of-way five-point focus removes generic other-user-mistake giveaways', () => {
  const window = load();
  const by = {};
  window.__CATALOG.forEach((q) => { by[q.id] = q; });
  const ids = window.testFive.ids();
  assert.equal(ids.length, 60);
  assert.equal(new Set(ids).size, 60, 'the focus must not repeat questions');
  for (const id of [
    '1.1.02-005', '1.1.02-009-B', '1.1.02-040-M', '1.1.02-041-M',
    '1.1.02-042-M', '1.1.02-043-M', '1.1.02-048-M', '1.1.02-050-M',
    '1.1.02-112', '1.1.02-113', '1.1.02-115', '1.1.02-117',
    '1.1.02-119', '1.1.02-134-M', '1.1.02-136-M', '1.1.02-137-M',
    '1.1.02-202-M', '1.1.06-104', '1.1.06-105',
    '1.1.07-009', '1.1.07-017', '1.1.07-136', '1.1.07-146',
    '1.1.07-152-M', '1.1.07-165-M', '1.2.06-004', '1.2.09-127',
    '1.2.09-136-M', '1.2.09-137-M', '1.2.11-110-M',
    '1.4.40-006', '1.4.41-008', '1.4.41-109',
    '2.1.05-104-M', '2.1.07-111', '2.1.07-112', '2.1.07-114-M',
  ]) assert.equal(ids.includes(id), false, `${id} must be excluded from the focus`);
  for (const id of [
    '1.1.03-118', '1.1.05-105', '1.1.06-124', '1.1.07-021',
    '1.2.20-109-M', '1.2.20-111-M', '2.1.07-113-M',
  ]) assert.equal(ids.includes(id), true, `${id} contains a concrete rule and must stay`);
  for (const id of ids) {
    assert.equal(by[id].pt, 5, `${id} must be worth five points`);
    assert.notEqual(by[id].th, '1.3', `${id} must be outside the right-of-way chapter`);
  }
  const html = window.testFive.categories();
  assert.match(html, /src=five&nav=categories/);
  assert.match(html, /60/);
});
