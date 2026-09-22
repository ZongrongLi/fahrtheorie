// Regression: data/zh.js (280KB) must be lazy-loaded, not shipped in the initial HTML.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { test } = require('node:test');

const html = fs.readFileSync(require.resolve('../index.html'), 'utf8');
const app = fs.readFileSync(require.resolve('../app.js'), 'utf8');
const ai = fs.readFileSync(require.resolve('../ai.js'), 'utf8');

test('index.html does not eager-load data/zh.js', () => {
  assert.ok(!/<script[^>]+data\/zh\.js/.test(html),
    'zh.js must not be a static <script> in index.html');
});

test('app.js injects data/zh.js on demand and re-renders', () => {
  assert.ok(app.includes('function ensureZh()'), 'ensureZh loader present');
  assert.ok(app.includes('"data/zh.js"'), 'ensureZh points at data/zh.js');
  assert.ok(app.includes('function needZh()'), 'needZh gate present');
  assert.ok(app.includes('window.__ensureZh = ensureZh'), 'ensureZh exposed for ai.js');
});

test('the other data scripts are still eager-loaded', () => {
  for (const f of ['data/questions.js', 'data/videos.js', 'i18n.js', 'ai.js', 'app.js']) {
    assert.ok(new RegExp('<script[^>]+' + f.replace('.', '\\.').replace('/', '\\/')).test(html),
      f + ' must stay a static <script>');
  }
});

test('ai.js waits for zh translations before a Chinese prompt', () => {
  assert.ok(ai.includes('window.__ensureZh'), 'chat() awaits ensureZh for zh');
});
