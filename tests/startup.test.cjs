const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');

// Run the complete application initialization without starting DOM rendering.
// Expose preferences only inside the test VM; production exports stay unchanged.
const source = fs.readFileSync(require.resolve('../app.js'), 'utf8');
const marker = '  window.__boot = boot;';
assert.equal(source.split(marker).length, 2);
function initialize(savedPrefs = {}) {
  const listeners = {};
  const context = {
    window: {},
    document: {
      readyState: 'loading',
      addEventListener(type, fn) { listeners[type] = fn; },
    },
    localStorage: {
      getItem(key) { return key === 'dtt.prefs' ? JSON.stringify(savedPrefs) : null; },
    },
  };
  vm.runInNewContext(source.replace(marker, '  window.testPrefs = prefs;\n' + marker), context);
  assert.equal(typeof context.window.__boot, 'function');
  assert.equal(listeners.DOMContentLoaded, context.window.__boot);
  return context.window.testPrefs;
}

test('new visitors get the default backend before boot is registered', () => {
  assert.equal(initialize().apiBase, 'https://dtt-backend.tiancai110a.workers.dev');
});
test('empty saved backend gets the owner default', () => {
  assert.equal(initialize({ apiBase: '' }).apiBase, 'https://dtt-backend.tiancai110a.workers.dev');
});
test('existing visitor preferences are preserved', () => {
  const prefs = initialize({ apiBase: 'https://example.test', uiLang: 'en', scope: 'all' });
  assert.equal(prefs.apiBase, 'https://example.test');
  assert.equal(prefs.uiLang, 'en');
  assert.equal(prefs.scope, 'all');
});

test('guest checkout is not silently blocked', () => {
  const sourceText = fs.readFileSync(require.resolve('../app.js'), 'utf8');
  assert.equal(sourceText.includes('if (!prefs.token) return;'), false);
  assert.equal(sourceText.includes('window.__pendingPay = true;'), true);
});
