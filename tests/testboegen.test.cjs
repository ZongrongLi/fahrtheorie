const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');

function load() {
  const context = { window: {} };
  vm.createContext(context);
  for (const file of ['data/questions.js', 'data/scope.js', 'data/testboegen.js', 'data/testboegen-i18n.js']) {
    vm.runInContext(fs.readFileSync(require.resolve('../' + file), 'utf8'), context);
  }
  return context.window;
}

test('the 10 imported Testbogen are complete 110-point official-structure sets', () => {
  const window = load();
  const by = {};
  window.__CATALOG.forEach((q) => { by[q.id] = q; });
  (window.__TESTBOEGEN_EXTRA || []).forEach((q) => { by[q.id] = q; });
  assert.equal(window.__TESTBOEGEN.length, 10);
  const numbers = window.__TESTBOEGEN.map((s) => s.nr);
  assert.equal(numbers.join(','), '1,2,3,4,5,6,7,8,9,10');

  for (const sheet of window.__TESTBOEGEN) {
    assert.equal(sheet.ids.length, 30, `sheet ${sheet.nr} needs 30 questions`);
    assert.equal(new Set(sheet.ids).size, 30, `sheet ${sheet.nr} repeats a question`);
    let total = 0, basic = 0, specific = 0;
    for (const id of sheet.ids) {
      const q = by[id];
      assert.ok(q, `sheet ${sheet.nr}: missing question ${id}`);
      total += q.pt;
      if (String(q.th).indexOf('1.') === 0) basic++; else specific++;
      if (q.t === 'num') {
        assert.notEqual(q.num, null, `${id}: numeric question without answer`);
      } else {
        assert.ok(Array.isArray(q.ans) && q.ans.length > 0, `${id}: no correct answers`);
        assert.ok(Array.isArray(q.od) && q.od.length >= 2, `${id}: bad option list`);
        assert.ok(q.ans.every((i) => i >= 0 && i < q.od.length), `${id}: answer index out of range`);
      }
    }
    assert.equal(total, 110, `sheet ${sheet.nr} totals ${total} points`);
    assert.equal(basic, 20, `sheet ${sheet.nr} has ${basic} basic questions`);
    assert.equal(specific, 10, `sheet ${sheet.nr} has ${specific} specific questions`);
  }
});

test('the new parent question has English question and option text', () => {
  const window = load();
  const q = (window.__TESTBOEGEN_EXTRA || []).find((x) => x.id === '2.2.11-001-M');
  assert.ok(q, 'the new parent question is imported');
  assert.match(q.qe, /Why must you be especially attentive/);
  assert.equal(q.oe.length, 3);
  assert.match(q.oe[0], /traffic is backing up/);
  assert.match(q.ce, /All three answers are correct/);
  assert.match(q.qd, /Warum müssen Sie/);
});
