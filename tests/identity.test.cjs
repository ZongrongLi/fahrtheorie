// Public usernames: registration asks for one and mentions never require/leak email.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { test } = require('node:test');

const app = fs.readFileSync(require.resolve('../app.js'), 'utf8');
const i18n = fs.readFileSync(require.resolve('../i18n.js'), 'utf8');

test('every language pack documents @username instead of @email', () => {
  const saved = global.window;
  global.window = {};
  delete require.cache[require.resolve('../i18n.js')];
  require('../i18n.js');
  const packs = global.window.I18N;
  global.window = saved;
  for (const lang of Object.keys(packs)) {
    assert.ok(packs[lang]['auth.username'], `${lang} lacks the username label`);
    assert.ok(packs[lang]['auth.loginField'], `${lang} lacks the login label`);
    assert.doesNotMatch(packs[lang]['discuss.mentionHint'], /@email|@E-Mail|@邮箱/i,
      `${lang} still tells users to mention an email`);
  }
});

test('server registration requires a unique public username while email stays private', () => {
  assert.match(app, /data-role="a-username"/);
  assert.match(app, /data-role="a-email"/);
  assert.match(app, /data-role="a-login"/);
  assert.match(app, /username: ru_, email: re_, password: rp_/);
  assert.match(app, /name: le_, password: lp_/);
  assert.match(app, /credential: pendingGoogleCredential, username: gu_/);
  assert.doesNotMatch(app, /data-role="a-email"[^>]+placeholder[^>]+data-role="a-pass"/);
});

test('an already signed-in browser adopts the server public identity', () => {
  assert.match(app, /var nextUser = String\(j\.user \|\| prefs\.user \|\| ""\)/);
  assert.match(app, /if \(userChanged\) prefs\.user = nextUser/);
  assert.match(app, /if \(userChanged\) renderTopbar\(\)/);
});
