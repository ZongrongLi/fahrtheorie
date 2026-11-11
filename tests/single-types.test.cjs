const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');

function browserContext() {
  const context = { window: {} };
  vm.createContext(context);
  for (const file of ['data/questions.js', 'data/single-types.js', 'i18n.js', 'i18n-more.js']) {
    vm.runInContext(fs.readFileSync(require.resolve('../' + file), 'utf8'), context);
  }
  return context.window;
}

test('the hidden single-choice drill contains 59 valid Class B questions', () => {
  const window = browserContext();
  const byId = {};
  window.__CATALOG.forEach((q) => { byId[q.id] = q; });
  const ids = window.__SINGLE_TRAPS;

  assert.equal(ids.length, 59);
  assert.equal(new Set(ids).size, ids.length, 'trap IDs must be unique');
  for (const id of ids) {
    const q = byId[id];
    assert.ok(q, `missing trap question ${id}`);
    assert.equal(q.t, 'single', `${id} must be single-choice`);
    assert.equal(q.od.length, 3, `${id} must have three options`);
    assert.equal(q.ans.length, 1, `${id} must have one correct answer`);
  }
});

test('the question-type page is wired from home, categories and practice', () => {
  const app = fs.readFileSync(require.resolve('../app.js'), 'utf8');
  const html = fs.readFileSync(require.resolve('../index.html'), 'utf8');

  assert.match(app, /view === "types"\) app\.innerHTML = vSingleTypes\(\)/);
  assert.match(app, /href="#\/types"/);
  assert.match(app, /src=types&nav=types/);
  assert.match(app, /p\.src === "types"/);
  assert.match(html, /data\/single-types\.js\?v=116/);
});
