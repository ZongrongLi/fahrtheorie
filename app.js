/* app.js — German driving-theory trainer. Vanilla JS, no build step, no external calls. */
(function () {
  "use strict";

  /* ---------------- icons (monoline SVG, currentColor) ---------------- */
  var IC = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.5V20h13V9.5"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    alert: '<path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 10v4"/><circle cx="12" cy="17.2" r=".6" fill="currentColor"/>',
    note: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5"/><path d="M9 12h7M9 16h5"/>',
    cog: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.8v2.4M12 18.8v2.4M4.4 7.6l2 1.2M17.6 15.2l2 1.2M4.4 16.4l2-1.2M17.6 8.8l2-1.2"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
    chev: '<path d="m9 6 6 6-6 6"/>',
    check: '<path d="m4 12.5 5 5L20 6.5"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    bookmark: '<path d="M6 3h12v18l-6-4.5L6 21z"/>',
    spark: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    left: '<path d="M15 6l-6 6 6 6"/>',
    right: '<path d="m9 6 6 6-6 6"/>',
    img: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="m4 17 5-5 4 4 3-3 4 4"/>',
    play: '<path d="M8 5.5v13l11-6.5z"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7L11.5 7"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7L12.5 17"/>',
    trash: '<path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/>',
    down: '<path d="M12 3v12M7 11l5 5 5-5"/><path d="M4 20h16"/>',
    up: '<path d="M12 21V9M7 13l5-5 5 5"/><path d="M4 4h16"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8"/>',
    moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14-4.5L4 9"/><path d="M4 4v5h5"/><path d="M4 13a8 8 0 0 0 14 4.5L20 15"/><path d="M20 20v-5h-5"/>',
    flag: '<path d="M6 21V4h12l-2.5 4L18 12H6"/>',
    layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>'
  };
  function ic(name, cls) {
    return '<svg class="ic ' + (cls || "") + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (IC[name] || "") + "</svg>";
  }

  /* Owner defaults must be initialized before preferences are loaded. */
  var OWNER = {
    apiBase: "https://dtt-backend.tiancai110a.workers.dev",
    googleClientId: "29994549332-tbejncn8vrmvcs5jh51u7o845volaugv.apps.googleusercontent.com",
    buyUrl: "",
    donateLink: "",
    donateQR: "",
    mediaBase: "https://cdn.jsdelivr.net/gh/ZongrongLi/fahrtheorie-media@master/"
  };

  /* Official catalogue this build ships with — the rail footer label is localised from it. */
  var CATALOGUE_DATE = "2025-04-01";

  /* ---------------- state ---------------- */
  var CAT = null, CAT_ALL = null, BY = {}, INDEX = null;
  function isClassB(q) {
    var m = /^([0-9.]+)-(\d+)/.exec(q.id);
    if (!m) return true;
    return m[1].charAt(0) === "1" || m[2].charAt(0) === "1";   // Teil 1 (all classes) or Zusatzstoff 1xx = Klasse B
  }
  function applyScope() {
    CAT = (prefs.scope === "all") ? CAT_ALL.slice() : CAT_ALL.filter(isClassB);
    buildIndex();
  }
  var state = load("dtt.state.v1", { q: {}, notes: {}, tr: {}, ai: {}, days: {}, goal: 20 });
  var prefs = load("dtt.prefs", { uiLang: "zh", contentLang: "zhen", theme: "light", explLang: "zh", scope: "b", donateLink: "", donateQR: "", buyUrl: "", lic: "", licBase: "", uid: "", user: "", freeLeft: 10, apiBase: "", token: "", serverLeft: null, googleClientId: "", unlimited: false });
  if (["zhen", "zh", "en", "de"].indexOf(prefs.contentLang) < 0) prefs.contentLang = "zhen";
  if (["zh", "en", "de"].indexOf(prefs.explLang) < 0) prefs.explLang = "zh";
  if (["b", "all"].indexOf(prefs.scope) < 0) prefs.scope = "b";
  ["apiBase", "googleClientId", "buyUrl", "donateLink", "donateQR"].forEach(function (k) {
    if (!prefs[k] && OWNER[k]) prefs[k] = OWNER[k];
  });
  window.__explLang = prefs.explLang;
  window.__explManual = false;   // per-question/settings override of the explanation language (session only)
  var session = null, aiPanelOpen = {}, aiHist = {}, lastHash = "#/home";
  function navFromHash(h) {
    var v = String(h || "").replace(/^#\/?/, "").split(/[/?]/)[0];
    if (v === "cat") return "categories";
    if (v === "wrong" || v === "notes" || v === "exam" || v === "settings" || v === "home") return v;
    return "categories";
  }

  function load(k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v && typeof v === "object" ? Object.assign(d, v) : d; } catch (e) { return d; } }
  function saveState() { try { localStorage.setItem("dtt.state.v1", JSON.stringify(state)); } catch (e) {} fsScheduleWrite(); progPush(); }
  /* ---------------- progress cloud sync ----------------
     登录后做题进度跟着账号走：q（含错题/书签）按 at 取新，notes 按 at 取新，
     days 按天取大，goal 按 savedAt 取新 —— 多设备同时用也不丢。tr/ai 缓存
     纯本地加速不同步。写侧 8 秒防抖 + 切后台即时刷，后端还有 5 秒限流兜底。 */
  var progTimer = null, progWipe = false, progPushedSig = "", progSavedAt = 0;
  function progLogged() { return !!(typeof apiRoot === "function" && apiRoot() && prefs.token); }
  function progSerialize() {
    var q = {}, notes = {}, days = {}, k, e;
    for (k in state.q) { e = state.q[k];
      if (e && (e.a > 0 || e.w > 0 || e.r > 0 || e.wrong || e.bm)) {
        q[k] = { a: e.a | 0, w: e.w | 0, r: e.r | 0, at: e.at | 0 };
        if (e.last === true) q[k].last = true;    // false 不上传，读侧缺省即 false
        if (e.wrong === true) q[k].wrong = true;
        if (e.bm) q[k].bm = true; } }
    for (k in state.notes) { e = state.notes[k];
      if (e && e.text) notes[k] = { text: String(e.text).slice(0, 2000), at: e.at | 0 }; }
    for (k in state.days) { if ((state.days[k] | 0) > 0) days[k] = state.days[k] | 0; }
    return { q: q, notes: notes, days: days, goal: state.goal | 0 || 20 };
  }
  function progMerge(srv) {
    var k, o, c;
    for (k in (srv.q || {})) { o = state.q[k]; c = srv.q[k]; if (!c) continue;
      if (!o || ((c.at | 0) >= (o.at | 0))) { state.q[k] = { a: c.a | 0, w: c.w | 0, r: c.r | 0, last: !!c.last, wrong: !!c.wrong, at: c.at | 0 }; if (c.bm) state.q[k].bm = true; } }
    for (k in (srv.notes || {})) { o = state.notes[k]; c = srv.notes[k]; if (!c) continue;
      if (!o || ((c.at | 0) >= (o.at | 0))) state.notes[k] = { text: String(c.text || "").slice(0, 2000), at: c.at | 0 }; }
    for (k in (srv.days || {})) state.days[k] = Math.max(state.days[k] | 0, (srv.days[k] | 0));
    if ((srv.savedAt | 0) >= progSavedAt) { state.goal = srv.goal | 0 || state.goal; progSavedAt = srv.savedAt | 0; }
  }
  function progPush(now) {
    if (!progLogged()) return;
    if (typeof clearTimeout === "function") { if (progTimer) clearTimeout(progTimer); progTimer = null; }
    var run = function () {
      progTimer = null;
      var p = progSerialize(), sig = JSON.stringify(p);
      if (sig === progPushedSig && !progWipe) return;
      p.savedAt = Date.now(); progSavedAt = p.savedAt;
      if (progWipe) p.wipe = true;
      if (typeof fetch !== "function") return;
      fetch(apiRoot() + "/api/progress", { method: "POST",
        headers: { "Content-Type": "application/json", Authorization: AUTH_B + prefs.token },
        body: JSON.stringify(p), keepalive: true })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) { if (j && j.progress) { progPushedSig = sig; progWipe = false; } })
        .catch(function () {});
    };
    if (now) run();
    else if (typeof setTimeout === "function") progTimer = setTimeout(run, 8000);
  }
  function progPull() {
    if (!progLogged() || typeof fetch !== "function") return;
    fetch(apiRoot() + "/api/progress", { headers: { Authorization: AUTH_B + prefs.token } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j || !j.progress) {   // 云端是空的：本机有进度就推上去（首登即同步），本机也是空的就不写
          var p0 = progSerialize();
          if (Object.keys(p0.q).length || Object.keys(p0.notes).length) { progPushedSig = ""; progPush(true); }
          return;
        }
        progMerge(j.progress);
        try { localStorage.setItem("dtt.state.v1", JSON.stringify(state)); } catch (e2) {}
        progPushedSig = ""; progPush(true);   // 本机旧进度（如未登录时刷的）也并上去
        if (session) rerenderQuiz(); else route();
      })
      .catch(function () {});
  }
  if (typeof document !== "undefined" && document.addEventListener) {
    document.addEventListener("pagehide", function () { progPush(true); });
    document.addEventListener("visibilitychange", function () { if (document.hidden) progPush(true); });
  }

  /* ---------------- file storage (File System Access API + IndexedDB handle) ---------------- */
  var fsHandle = null, fsName = "", fsTimer = null, fsNeedsReconnect = false;
  var fsSupported = (typeof window !== "undefined" && typeof window.showSaveFilePicker === "function");
  var IDB = "dtt.idb", IDB_ST = "handles";
  function idb() { return new Promise(function (res, rej) { var r = indexedDB.open(IDB, 1); r.onupgradeneeded = function () { r.result.createObjectStore(IDB_ST); }; r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; }); }
  function idbSet(k, v) { return idb().then(function (db) { return new Promise(function (res, rej) { var tx = db.transaction(IDB_ST, "readwrite"); tx.objectStore(IDB_ST).put(v, k); tx.oncomplete = function () { res(); }; tx.onerror = function () { rej(tx.error); }; }); }); }
  function idbGet(k) { return idb().then(function (db) { return new Promise(function (res, rej) { var tx = db.transaction(IDB_ST, "readonly"); var q = tx.objectStore(IDB_ST).get(k); q.onsuccess = function () { res(q.result); }; q.onerror = function () { rej(q.error); }; }); }); }
  function idbDel(k) { return idb().then(function (db) { return new Promise(function (res) { var tx = db.transaction(IDB_ST, "readwrite"); tx.objectStore(IDB_ST).delete(k); tx.oncomplete = function () { res(); }; tx.onerror = function () { res(); }; }); }); }
  function fsScheduleWrite() { if (!fsHandle) return; clearTimeout(fsTimer); fsTimer = setTimeout(fsWriteNow, 400); }
  function fsWriteNow() {
    if (!fsHandle) return;
    var payload = JSON.stringify(state);
    fsHandle.createWritable().then(function (w) { return w.write(payload).then(function () { return w.close(); }); })
      .catch(function () { fsNeedsReconnect = true; });
  }
  function fsAdopt(h) {
    fsHandle = h; fsName = h.name || "data.json"; fsNeedsReconnect = false;
    return idbSet("state", h).then(function () {
      return fsHandle.createWritable().then(function (w) { return w.write(JSON.stringify(state)).then(function () { return w.close(); }); });
    });
  }
  function fsReadIntoState() {
    if (!fsHandle) return Promise.resolve();
    return fsHandle.getFile().then(function (f) { return f.text(); }).then(function (txt) {
      if (!txt || !txt.trim()) return;
      var d = JSON.parse(txt);
      state = Object.assign({ q: {}, notes: {}, tr: {}, ai: {}, days: {}, goal: 20 }, d);
      try { localStorage.setItem("dtt.state.v1", JSON.stringify(state)); } catch (e) {}
      if (session) rerenderQuiz();
    }).catch(function () {});
  }
  function fsPick() {
    if (!fsSupported) { toast(t("fs.unsupported")); return; }
    window.showSaveFilePicker({ suggestedName: "dtt-progress.json", types: [{ description: "JSON", accept: { "application/json": [".json"] } }] })
      .then(function (h) { return fsAdopt(h); })
      .then(function () { toast(t("fs.enabled")); route(); })
      .catch(function (e) { if (e && e.name === "AbortError") return; toast(String(e)); });
  }
  function fsReconnect() {
    if (!fsHandle) return fsPick();
    fsHandle.requestPermission({ mode: "readwrite" }).then(function (p) {
      if (p === "granted") { fsNeedsReconnect = false; return fsReadIntoState().then(function () { route(); toast(t("fs.reconnected")); }); }
      toast(t("fs.denied"));
    }).catch(function () { toast(t("fs.denied")); });
  }
  function fsDisconnect() { fsHandle = null; fsName = ""; fsNeedsReconnect = false; idbDel("state").then(function () { route(); toast(t("fs.off")); }); }
  function fsRestore() {
    if (!fsSupported) return;
    idbGet("state").then(function (h) {
      if (!h) return;
      fsHandle = h; fsName = h.name || "data.json";
      return h.queryPermission({ mode: "readwrite" }).then(function (p) {
        if (p === "granted") return fsReadIntoState().then(function () { route(); });
        fsNeedsReconnect = true;
      });
    }).catch(function () {});
  }
  function savePrefs() { try { localStorage.setItem("dtt.prefs", JSON.stringify(prefs)); } catch (e) {} }

  /* ---------------- i18n ---------------- */
  function t(k, v) {
    var pack = window.I18N[prefs.uiLang] || {}, en = window.I18N.en || {}, zh = window.I18N.zh || {};
    var s = pack[k] || en[k] || zh[k] || k;
    if (v) for (var p in v) s = s.replace(new RegExp("\\{" + p + "\\}", "g"), v[p]);
    return s;
  }
  var isZh = function () { return prefs.uiLang === "zh"; };
  /* Interface languages — native names, so the picker reads the same for everyone.
     Adding one = one entry here + one pack in i18n.js. */
  var UI_LANGS = [
    ["zh", "简体中文"], ["en", "English"], ["de", "Deutsch"], ["ru", "Русский"],
    ["tr", "Türkçe"], ["uk", "Українська"], ["pl", "Polski"], ["ro", "Română"],
    ["vi", "Tiếng Việt"], ["ar", "العربية"]
  ];
  var RTL_LANGS = { ar: 1, fa: 1, he: 1, ur: 1 };
  function langKnown(code) { for (var i = 0; i < UI_LANGS.length; i++) if (UI_LANGS[i][0] === code) return true; return false; }
  if (!langKnown(prefs.uiLang)) prefs.uiLang = "zh";
  function contentLangs() {
    var c = prefs.contentLang;
    if (c === "zhen") return ["zh", "en"];
    if (c === "zh") return ["zh"];
    if (c === "de") return ["de"];
    return ["en"];
  }
  /* The AI answers in the language the question is displayed in. The bilingual
     view (中文 + English) follows the chosen explanation language. */
  function aiLang() {
    var l = contentLangs();
    if (l.length < 2) return l[0] || "en";
    if (l.indexOf(prefs.explLang) >= 0) return prefs.explLang;
    if (l.indexOf(prefs.uiLang) >= 0) return prefs.uiLang;
    return l[0];
  }
  function zhWanted() { return contentLangs().indexOf("zh") >= 0; }
  function zhOf(q) { return (window.__ZH && window.__ZH[q.id]) || null; }
  function zhTheme(th) { return (window.__ZH_THEME && window.__ZH_THEME[th]) || ""; }
  function zhChap(ch) { return (window.__ZH_CHAP && window.__ZH_CHAP[ch]) || ""; }
  function langText(q, lang, kind, oi) {
    if (lang === "zh") { var z = zhOf(q); if (!z) return null; return kind === "q" ? z.q : kind === "o" ? (z.o || [])[oi] : z.c; }
    if (lang === "de") return kind === "q" ? q.qd : kind === "o" ? q.od[oi] : q.cd;
    return kind === "q" ? q.qe : kind === "o" ? q.oe[oi] : q.ce;
  }
  function stemOf(q, lang) {
    if (lang === "en") return q.s || "";
    if (lang === "de") return q.sd || "";
    if (lang === "zh") return (window.__ZHSTEM && window.__ZHSTEM[q.id]) || "";
    return "";
  }
  function stemHtml(q) {
    var langs = contentLangs(), out = "";
    for (var i = 0; i < langs.length; i++) {
      var tx = stemOf(q, langs[i]);
      if (!tx) continue;
      out += '<p class="q-stem ln-' + langs[i] + '">' + esc(tx) + '</p>';
    }
    return out;
  }
  function stackText(q, kind, oi) {
    var langs = contentLangs(), out = "";
    for (var i = 0; i < langs.length; i++) {
      var tx = langText(q, langs[i], kind, oi);
      if (tx == null || tx === "") continue;
      out += '<span class="ln ln-' + langs[i] + (i === 0 ? " primary" : "") + '">' + esc(tx) + '</span>';
    }
    return out || '<span class="ln primary">—</span>';
  }
  function trName(de, en, zh) {
    var l = contentLangs(), parts = [];
    if (l.indexOf("zh") >= 0 && zh) parts.push(zh);
    if (l.indexOf("de") >= 0) parts.push(de);
    else if (l.indexOf("en") >= 0) parts.push(en);
    if (!parts.length) parts.push(en || de);
    return parts.join(" · ");
  }
  function thName(o) { return trName(o.thd, o.the, zhTheme(o._th || o.th)); }
  function chName(o) { return trName(o.chd, o.che, zhChap(o._ch || o.ch)); }

  /* ---------------- helpers ---------------- */
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]; }); }
  function L(i) { return String.fromCharCode(65 + i); }
  function today() { var d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function md(s) {
    var out = esc(s).split(/\n{2,}/).map(function (b) {
      if (/^###\s/.test(b)) return "<h4>" + b.replace(/^###\s/, "") + "</h4>";
      var lines = b.split("\n");
      if (lines.every(function (l) { return /^[-*]\s/.test(l); }))
        return "<ul>" + lines.map(function (l) { return "<li>" + l.replace(/^[-*]\s/, "") + "</li>"; }).join("") + "</ul>";
      return "<p>" + b.replace(/\n/g, "<br>") + "</p>";
    }).join("");
    return out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/\*([^*]+)\*/g, "<em>$1</em>");
  }
  function qState(id) { return state.q[id] || (state.q[id] = { a: 0, w: 0, r: 0, last: null, wrong: false, at: 0 }); }
  function wrongCount() { return CAT.filter(function (q) { return state.q[q.id] && state.q[q.id].wrong; }).length; }
  function answeredCount() { return CAT.filter(function (q) { return state.q[q.id] && state.q[q.id].a > 0; }).length; }
  function notesCount() { var n = 0; for (var k in state.notes) if (state.notes[k] && state.notes[k].text) n++; return n; }

  function buildIndex() {
    INDEX = { themes: [], part1: [], part2: [], byTheme: {} };
    /* Theme display name follows the SITE language: theme.<th> packs carry the translation,
       zhTheme()/official German/English are only fallbacks. Question text (langText) still
       follows the QUIZ language - the two settings must never leak into each other. */
    var ui = (window.I18N[prefs.uiLang] || {});
    function uiTheme(th) { return ui["theme." + th] || ""; }
    CAT.forEach(function (q) {
      var th = q.th, ch = q.ch;
      var T = INDEX.byTheme[th] || (INDEX.byTheme[th] = { th: th, thd: q.thd, the: q.the, thz: uiTheme(th), chapters: {}, count: 0, part: th.charAt(0) === "2" ? 2 : 1 });
      T.count++;
      var C = T.chapters[ch] || (T.chapters[ch] = { ch: ch, chd: q.chd, che: q.che, count: 0 });
      C.count++;
      q._th = th; q._ch = ch;
    });
    Object.keys(INDEX.byTheme).forEach(function (k) {
      INDEX.byTheme[k].order = Object.keys(INDEX.byTheme[k].chapters).sort(function (a, b) { return a.localeCompare(b, undefined, { numeric: true }); });
    });
    INDEX.themes = Object.keys(INDEX.byTheme).map(function (k) { return INDEX.byTheme[k]; })
      .sort(function (a, b) { return a.th.localeCompare(b.th, undefined, { numeric: true }); });
    INDEX.part1 = INDEX.themes.filter(function (x) { return x.part === 1; });
    INDEX.part2 = INDEX.themes.filter(function (x) { return x.part === 2; });
  }
  function qsIn(th, ch) { return CAT.filter(function (q) { return q._th === th && (!ch || q._ch === ch); }); }

  /* ---------------- routing ---------------- */
  function go(hash) { location.hash = hash; }
  function route() {
    var full = (location.hash || "#/home").replace(/^#\/?/, "");
    var qi = full.indexOf("?");
    var path = qi >= 0 ? full.slice(0, qi) : full;
    var query = qi >= 0 ? full.slice(qi + 1) : "";
    var h = path.split("/");
    var key = path + (query ? "?" + query : "");
    var view = h[0] || "home";
    var app = document.getElementById("view");
    if (view === "home") app.innerHTML = vHome();
    else if (view === "categories") app.innerHTML = vCategories();
    else if (view === "cat") app.innerHTML = vCat(decodeURIComponent(h[1] || ""), decodeURIComponent(h[2] || ""));
    else if (view === "practice") { if (!session || session.key !== key) startFromRoute(query, key); app.innerHTML = vQuiz(); }
    else if (view === "wrong") app.innerHTML = vWrong(decodeURIComponent(h[1] || ""), decodeURIComponent(h[2] || ""));
    else if (view === "notes") app.innerHTML = vNotes();
    else if (view === "exam") app.innerHTML = session && session.mode === "exam" ? vExam() : vExamHome();
    else if (view === "settings") app.innerHTML = vSettings();
    else if (view === "admin") app.innerHTML = vAdmin();
    else app.innerHTML = vHome();
    var activeNav = view === "cat" ? "categories" : (view === "practice" ? (session && session.nav ? session.nav : "categories") : view);
    document.querySelectorAll("[data-nav]").forEach(function (el) {
      el.classList.toggle("is-active", el.getAttribute("data-nav") === activeNav);
    });
    if (["home", "categories", "cat", "wrong", "notes", "settings", "admin"].indexOf(view) >= 0) { session = null; lastHash = location.hash || "#/home"; }
    mountMedia();
    window.scrollTo(0, 0);
    var main = document.getElementById("view"); if (main) main.focus({ preventScroll: true });
  }

  /* ---------------- views: home ---------------- */
  function vHome() {
    var total = CAT.length, ans = answeredCount(), wr = wrongCount(), nt = notesCount();
    var acc = ans ? Math.round(CAT.reduce(function (s, q) { var st = state.q[q.id]; return s + (st && st.a ? (st.r / st.a) : 0); }, 0) / ans * 100) : 0;
    var withImg = CAT.filter(function (q) { return q.img; }).length;
    var streak = computeStreak();
    var goalDone = state.days[today()] || 0;
    var goalPct = Math.min(100, Math.round(goalDone / state.goal * 100));
    var contId = nextUnseen() || CAT[0].id;
    return '' +
      '<section class="hero">' +
        '<div class="hero-main">' +
          '<span class="eyebrow">' + ic("layers") + t("home.eyebrow") + '</span>' +
          '<h1>' + esc(t("home.greeting")) + '</h1>' +
          '<p class="lede">' + esc(t("home.lede", { n: total, img: withImg })) + '</p>' +
          '<div class="hero-cta">' +
            '<a class="btn primary" href="#/practice?c=ALL&m=all&s=seq&at=' + encodeURIComponent(contId) + '&src=all">' + ic("right") + esc(t("home.continue")) + '</a>' +
            '<button class="btn ghost" data-act="random">' + ic("refresh") + esc(t("home.random")) + '</button>' +
            '<a class="btn ghost" href="#/exam">' + ic("clock") + esc(t("home.exam")) + '</a>' +
            '<a class="btn ghost" href="#/wrong">' + ic("alert") + esc(t("nav.wrong")) + (wr ? ' (' + wr + ')' : '') + '</a>' +
          '</div>' +
          '<p class="fineprint">' + esc(t("home.dataNote")) + '</p>' +
        '</div>' +
        '<aside class="streak-card">' +
          '<div class="streak-num">' + streak + '<span>' + esc(t("home.streakUnit")) + '</span></div>' +
          '<div class="streak-lbl">' + esc(t("home.streak")) + '</div>' +
          '<div class="goalbar" role="progressbar" aria-valuenow="' + goalPct + '" aria-valuemin="0" aria-valuemax="100"><span style="width:' + goalPct + '%"></span></div>' +
          '<div class="streak-sub">' + esc(t("home.dueToday")) + ' · ' + goalDone + '/' + state.goal + '</div>' +
        '</aside>' +
      '</section>' +
      '<section class="stats">' +
        stat(t("home.answered"), ans + " / " + total, ans / total * 100) +
        stat(t("home.accuracy"), acc + "%", acc) +
        stat(t("home.mistakes"), String(wr), total ? wr / total * 100 : 0) +
        stat(t("home.notes"), String(nt), total ? nt / total * 100 : 0) +
      '</section>' +
      '<section class="block">' +
        '<header class="block-h"><h2>' + esc(t("home.categoriesTitle")) + '</h2><span class="muted">' + esc(t("home.categoriesHint")) + '</span></header>' +
        '<div class="tile-grid">' + INDEX.themes.map(function (T, i) { return themeTile(T, i); }).join("") + '</div>' +
      '</section>' +
      '<section class="block"><div class="note-card">' +
        '<p class="muted">' + esc(t("home.disclaimer")) + '</p>' +
        '<div class="q-actions" style="margin-top:12px">' +
          (aiUnlocked()
            ? '<span class="chip">' + esc(t("ai.unlocked")) + '</span>'
            : (aiLoggedIn()
                ? '<span class="chip">' + esc(t("ai.left", { n: quotaLeft() })) + '</span><button class="btn ghost small" data-act="unlock-open">' + esc(t("support.pro")) + '</button>'
                : '<button class="btn primary small" data-act="register-open">' + esc(t("ai.freeTen")) + '</button><button class="btn ghost small" data-act="unlock-open">' + esc(t("support.pro")) + '</button>')) +
        '</div>' +
        '<p class="fineprint">' + esc(t("ai.freeAllNote")) + '</p>' +
        '<p class="fineprint"><a href="privacy.html">' + esc(t("legal.privacy")) + '</a> · <a href="terms.html">' + esc(t("legal.terms")) + '</p>' +
        '<p class="fineprint">fahrtheorie.homes</p>' +
      '</div></section>';
  }
  function stat(lbl, val, pct) {
    return '<div class="stat"><div class="stat-val">' + esc(val) + '</div><div class="stat-lbl">' + esc(lbl) + '</div>' +
      '<div class="minibar"><span style="width:' + Math.max(0, Math.min(100, pct)) + '%"></span></div></div>';
  }
  function themeTile(T, i) {
    var arr = qsIn(T.th);
    var done = arr.filter(function (q) { return state.q[q.id] && state.q[q.id].a; }).length;
    var wr = arr.filter(function (q) { return state.q[q.id] && state.q[q.id].wrong; }).length;
    var pct = Math.round(done / T.count * 100);
    return '<a class="tile t' + (i % 6) + '" href="#/cat/' + encodeURIComponent(T.th) + '">' +
      '<div class="tile-top"><span class="tile-code">' + esc(T.th) + '</span>' + ic("chev") + '</div>' +
      '<h3>' + esc(T.thz || trName(T.thd, T.the, zhTheme(T.th))) + '</h3>' +
      '<div class="tile-meta">' + T.count + " " + esc(t("cat.questions")) + (wr ? ' · <b class="warn">' + wr + " " + esc(t("cat.wrongShort")) + '</b>' : "") + '</div>' +
      '<div class="tile-bar"><span style="width:' + pct + '%"></span></div>' +
      '</a>';
  }
  function qrow(q, scope) {
    var st = state.q[q.id] || {};
    var langs = contentLangs();
    var main = langText(q, langs[0], "q", -1) || q.qe;
    var sub = langs.length > 1 ? (langText(q, langs[1], "q", -1) || "") : "";
    var status = st.wrong ? '<span class="chip warn">' + esc(t("cat.wrongShort")) + '</span>'
      : st.a ? '<span class="chip">' + esc(t("cat.answeredShort")) + '</span>'
      : '<span class="chip">' + esc(t("mode.new")) + '</span>';
    var href = "#/practice?c=" + encodeURIComponent(scope.th) + (scope.ch ? "&ch=" + encodeURIComponent(scope.ch) : "") + "&m=all&s=seq&at=" + encodeURIComponent(q.id);
    return '<a class="qrow" href="' + href + '">' +
      '<span class="qrow-id">' + esc(q.id) + '</span>' +
      '<span class="qrow-body"><span class="qrow-q">' + esc(main) + '</span>' + (sub ? '<span class="qrow-sub">' + esc(sub) + '</span>' : '') + '</span>' +
      '<span class="qrow-meta"><span class="chip">' + esc(t("quiz.points", { p: q.pt })) + '</span>' + status + '</span>' +
      '</a>';
  }
  function qlistSection(arr, th, ch) {
    var scope = { th: th, ch: ch || "" };
    return '<section class="block"><header class="block-h"><h2>' + esc(t("cat.questionList")) + '</h2><span class="muted">' + arr.length + ' ' + esc(t("cat.questions")) + ' · ' + esc(t("cat.listHint")) + '</span></header><div class="qlist">' + arr.map(function (q) { return qrow(q, scope); }).join("") + '</div></section>';
  }
  function nextUnseen() { for (var i = 0; i < CAT.length; i++) if (!state.q[CAT[i].id] || !state.q[CAT[i].id].a) return CAT[i].id; return null; }
  function computeStreak() {
    var s = 0, d = new Date();
    for (;;) {
      var key = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
      if (state.days[key]) { s++; d.setDate(d.getDate() - 1); } else break;
    }
    return s;
  }

  /* ---------------- views: categories ---------------- */
  function vCategories() {
    function part(title, list, start) {
      return '<section class="block"><header class="block-h"><h2>' + esc(title) + '</h2></header>' +
        '<div class="tile-grid">' + list.map(function (T, i) { return themeTile(T, start + i); }).join("") + '</div></section>';
    }
    return '<section class="page-h"><span class="eyebrow">' + ic("grid") + esc(t("cat.title")) + '</span><h1>' + esc(t("cat.title")) + '</h1><p class="lede">' + esc(t("cat.sub")) + '</p></section>' +
      part(t("cat.part1"), INDEX.part1, 0) + part(t("cat.part2"), INDEX.part2, 3);
  }
  function vCat(th, ch) {
    var T = INDEX.byTheme[th]; if (!T) return vCategories();
    var arr = qsIn(th, ch || null);
    var done = arr.filter(function (q) { return state.q[q.id] && state.q[q.id].a; }).length;
    var wr = arr.filter(function (q) { return state.q[q.id] && state.q[q.id].wrong; }).length;
    var unseen = arr.length - done;
    var pct = Math.round(done / arr.length * 100);
    var head = ch ? trName(T.chapters[ch].chd, T.chapters[ch].che, zhChap(ch)) : (T.thz || trName(T.thd, T.the, zhTheme(T.th)));
    return '' +
      '<section class="page-h">' +
        '<a class="back" href="#/categories">' + ic("left") + esc(t("cat.title")) + '</a>' +
        '<span class="eyebrow">' + ic("grid") + esc(T.th) + (ch ? " · " + esc(ch) : "") + '</span>' +
        '<h1>' + esc(head) + '</h1>' +
        '<div class="cat-summary">' +
          '<div class="cat-prog"><div class="cat-prog-bar"><span style="width:' + pct + '%"></span></div><span>' + done + " / " + arr.length + " " + esc(t("cat.answeredShort")) + '</span></div>' +
          '<div class="chips"><span class="chip">' + arr.length + " " + esc(t("cat.questions")) + '</span><span class="chip">' + unseen + " " + esc(t("mode.new")) + '</span><span class="chip warn">' + wr + " " + esc(t("cat.wrongShort")) + '</span></div>' +
        '</div>' +
        '<div class="hero-cta">' +
          '<a class="btn primary" href="#/practice?c=' + encodeURIComponent(th) + (ch ? "&ch=" + encodeURIComponent(ch) : "") + '&m=all&s=seq">' + ic("right") + esc(t("cat.practice")) + '</a>' +
          '<a class="btn ghost" href="#/practice?c=' + encodeURIComponent(th) + (ch ? "&ch=" + encodeURIComponent(ch) : "") + '&m=new&s=seq">' + esc(t("mode.new")) + '</a>' +
          '<a class="btn ghost" href="#/wrong/' + encodeURIComponent(th) + (ch ? "/" + encodeURIComponent(ch) : "") + '">' + ic("alert") + esc(t("cat.wrongbook")) + ' (' + wr + ')</a>' +
        '</div>' +
      '</section>' +
      qlistSection(arr, th, ch) +
      (ch ? "" : '<section class="block"><header class="block-h"><h2>' + esc(t("cat.chapters")) + '</h2></header><div class="chap-list">' +
        T.order.map(function (c) {
          var C = T.chapters[c]; var a = qsIn(th, c);
          var w = a.filter(function (q) { return state.q[q.id] && state.q[q.id].wrong; }).length;
          var d2 = a.filter(function (q) { return state.q[q.id] && state.q[q.id].a; }).length;
          return '<a class="chap" href="#/cat/' + encodeURIComponent(th) + "/" + encodeURIComponent(c) + '">' +
            '<span class="chap-code">' + esc(c) + '</span>' +
            '<span class="chap-name">' + esc(trName(C.chd, C.che, zhChap(c))) + '</span>' +
            '<span class="chap-meta">' + d2 + "/" + C.count + (w ? ' · <b class="warn">' + w + '</b>' : "") + '</span>' + ic("chev") + '</a>';
        }).join("") + '</div></section>');
  }

  /* ---------------- practice session ---------------- */
  function startFromRoute(q, key) {
    var p = {};
    (q || "").split("&").forEach(function (kv) { if (!kv) return; var a = kv.split("="); var k = a[0], v = a.slice(1).join("="); if (k === "c") p.c = decodeURIComponent(v || ""); else if (k === "ch") p.ch = decodeURIComponent(v || ""); else if (k === "m") p.m = v; else if (k === "s") p.s = v; else if (k === "ids") p.ids = decodeURIComponent(v || ""); else if (k === "q") p.q = decodeURIComponent(v || ""); else if (k === "at") p.at = decodeURIComponent(v || ""); else if (k === "nav") p.nav = v; else if (k === "src") p.src = v; });
    var ids;
    if (p.ids) ids = p.ids.split(",").filter(Boolean);
    else if (p.q) ids = [p.q];
    if (!ids) ids = pickIds(p.c || "ALL", p.ch || "", p.m || "all", p.s || "seq");
    var ttl = p.src === "wrong" ? t("nav.wrong") : p.src === "exam" ? t("exam.title") : sessionTitle(p);
    openSession(ids, { c: p.c, ch: p.ch, m: p.m, mode: "normal", key: key, title: ttl });
    session._p = p;
    if (p.at) { var ix = session.ids.indexOf(p.at); if (ix >= 0) session.i = ix; }
    session.nav = p.nav || navFromHash(lastHash);
    session.back = (lastHash && lastHash.indexOf("practice") < 0) ? lastHash : "#/categories";
  }
  function sessionTitle(p) {
    if (!p.c || p.c === "ALL") return t("mode.all");
    var T = INDEX.byTheme[p.c]; if (!T) return p.c;
    return p.ch ? trName(T.chapters[p.ch].chd, T.chapters[p.ch].che, zhChap(p.ch)) : (T.thz || trName(T.thd, T.the, zhTheme(p.c)));
  }
  function pickIds(c, ch, m, s) {
    var arr = c === "ALL" ? CAT.slice() : qsIn(c, ch || null);
    if (m === "new") arr = arr.filter(function (q) { return !state.q[q.id] || !state.q[q.id].a; });
    if (m === "wrong") arr = arr.filter(function (q) { return state.q[q.id] && state.q[q.id].wrong; });
    if (s === "rnd") arr = shuffle(arr);
    return arr.map(function (q) { return q.id; });
  }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t2 = a[i]; a[i] = a[j]; a[j] = t2; } return a; }
  function openSession(ids, opts) {
    ids = (ids || []).filter(function (id) { return !!BY[id]; });
    session = { ids: ids, i: 0, mode: opts.mode || "normal", key: opts.key || "", title: opts.title || "", from: opts.c && opts.c !== "ALL" ? "categories" : "", answers: {}, startedAt: Date.now() };
    return session;
  }

  function vQuiz() {
    if (!session) return '<div class="empty">' + esc(t("quiz.empty")) + '</div>';
    session.i = Math.min(session.i, Math.max(0, session.ids.length - 1));
    if (!session.ids.length) return '<div class="empty card"><h2>' + esc(t("quiz.empty")) + '</h2><p>' + esc(t("cat.sub")) + '</p><a class="btn primary" href="#/categories">' + esc(t("quiz.emptyReset")) + '</a></div>';
    if (session.mode === "exam") return vExam();
    if (session.i >= session.ids.length) return vSummary();
    var q = BY[session.ids[session.i]];
    return quizShell(q) ;
  }
  var preloaded = {};
  function preloadImg(id) { if (!id || preloaded[id]) return; preloaded[id] = 1; var im = new Image(); im.src = "assets/img/" + encodeURIComponent(id) + ".webp"; }
  function preloadNeighbours() {
    if (!session || !session.ids) return;
    [0, 1, 2, -1].forEach(function (k) {
      var j = session.i + k; if (j < 0 || j >= session.ids.length) return;
      var x = BY[session.ids[j]];
      if (!x) return;
      if (x.img) preloadImg(x.img);
      if (videoPath(x)) vidPrefetch(x);
    });
  }
  /* ---------------- offline image store (IndexedDB, immune to HTTP cache headers) ----------------
     All question figures are fetched once and kept as Blobs in IndexedDB. Every later visit reads
     them from the local DB and serves them as in-memory blob: URLs -> figures appear instantly. */
  var IMGKEY = "dtt.imgcache.v2";
  var imgURL = {}, imgWarming = false, imgStat = { total: 0, have: 0 };
  function allImgIds() { return CAT.filter(function (q) { return q.img; }).map(function (q) { return q.img; }); }
  function imgDB() {
    return new Promise(function (res, rej) {
      var r = indexedDB.open("dtt-img", 1);
      r.onupgradeneeded = function () { r.result.createObjectStore("img"); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
  }
  function imgGetAll() {
    return imgDB().then(function (db) {
      return new Promise(function (res) {
        try {
          var tx = db.transaction("img", "readonly"), st = tx.objectStore("img"), out = {};
          var cur = st.openCursor();
          cur.onsuccess = function () { var c = cur.result; if (c) { out[c.key] = c.value; c.continue(); } else res(out); };
          cur.onerror = function () { res({}); };
        } catch (e) { res({}); }
      });
    });
  }
  function imgPut(id, blob) {
    return imgDB().then(function (db) {
      return new Promise(function (res) { try { var tx = db.transaction("img", "readwrite"); tx.objectStore("img").put(blob, id); tx.oncomplete = function () { res(); }; tx.onerror = function () { res(); }; } catch (e) { res(); } });
    });
  }
  function imgStatusText() {
    var total = imgStat.total || allImgIds().length;
    if (imgWarming) return t("img.caching", { a: imgStat.have, b: total });
    if (imgStat.have >= total && total) return t("img.cached") + " (" + total + ")";
    return t("img.notCached");
  }
  function refreshImgStatus() { var el = document.querySelector('[data-role="img-status"]'); if (el) el.textContent = imgStatusText(); }
  function imgSrcOf(id) { return imgURL[id] || ("assets/img/" + encodeURIComponent(id) + ".webp"); }
  function videoPath(q) { return (window.__VIDEOS && window.__VIDEOS[q.id]) || ""; }
  function imgCacheWarm() {
    if (imgWarming || !CAT) return;
    imgWarming = true;
    var ids = allImgIds(); imgStat.total = ids.length;
    refreshImgStatus();
    imgGetAll().then(function (map) {
      var missing = [];
      ids.forEach(function (id) {
        var b = map[id];
        if (b) { try { imgURL[id] = URL.createObjectURL(b); } catch (e) {} imgStat.have++; }
        else missing.push(id);
      });
      refreshImgStatus();
      if (session) rerenderQuiz();
      if (!missing.length) {
        imgWarming = false; try { localStorage.setItem(IMGKEY, String(Date.now())); } catch (e) {}
        refreshImgStatus(); if (session) rerenderQuiz(); return;
      }
      var i = 0, conc = 5, active = 0;
      function finish() {
        imgWarming = false; try { localStorage.setItem(IMGKEY, String(Date.now())); } catch (e) {}
        refreshImgStatus(); reportProgress(true); toast(t("img.cachedDone")); if (session) rerenderQuiz();
      }
      function pump() {
        while (active < conc && i < missing.length) {
          var id = missing[i++]; active++;
          fetch("assets/img/" + encodeURIComponent(id) + ".webp")
            .then(function (r) { return r.blob(); })
            .then(function (bl) { try { imgURL[id] = URL.createObjectURL(bl); } catch (e) {} imgStat.have++; imgPut(id, bl); })
            .catch(function () {})
            .then(function () { active--; refreshImgStatus(); if (i < missing.length) pump(); else if (active === 0) finish(); });
        }
      }
      pump();
    }).catch(function () { imgWarming = false; refreshImgStatus(); });
  }
  /* ---------------- offline video cache (IndexedDB) ------------------------------------------
     All official videos are fetched through the same-origin /media proxy and stored as Blobs in
     IndexedDB. Playback then reads from the local DB, so videos play offline / instantly. */
  var vidURL = null, vidWarming = false, vidStat = { total: 0, have: 0, bytes: 0 };
  var VIDKEY = "dtt.vid.cachedAt", VIDMBKEY = "dtt.vid.mb";
  function vidList() { return Object.keys(window.__VIDEOS || {}); }
  /* The values in __VIDEOS are the real remote paths (id -> "de/<version>/<id>.mp4");
     they are what must be fetched and what IndexedDB stores as keys. */
  function vidPaths() {
    var m = window.__VIDEOS || {}, seen = {}, out = [];
    for (var k in m) { var p = m[k]; if (p && !seen[p]) { seen[p] = 1; out.push(p); } }
    return out;
  }
  function vidDB() {
    return new Promise(function (res, rej) {
      var r = indexedDB.open("dtt-vid", 1);
      r.onupgradeneeded = function () { r.result.createObjectStore("vid"); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
  }
  function vidGet(path) {
    return vidDB().then(function (db) {
      return new Promise(function (res) { try { var tx = db.transaction("vid", "readonly"); var q = tx.objectStore("vid").get(path); q.onsuccess = function () { res(q.result); }; q.onerror = function () { res(null); }; } catch (e) { res(null); } });
    });
  }
  function vidPut(path, blob) {
    return vidDB().then(function (db) {
      return new Promise(function (res) { try { var tx = db.transaction("vid", "readwrite"); tx.objectStore("vid").put(blob, path); tx.oncomplete = function () { res(true); }; tx.onerror = function () { res(false); }; } catch (e) { res(false); } });
    });
  }
  function vidKeys() {
    return vidDB().then(function (db) {
      return new Promise(function (res) { try { var tx = db.transaction("vid", "readonly"); var ks = tx.objectStore("vid").getAllKeys(); ks.onsuccess = function () { res(ks.result || []); }; ks.onerror = function () { res([]); }; } catch (e) { res([]); } });
    });
  }
  /* total bytes already stored locally (for the MB display / progress report) */
  function vidBytes() {
    return vidDB().then(function (db) {
      return new Promise(function (res) {
        try {
          var tx = db.transaction("vid", "readonly"), st = tx.objectStore("vid"), sum = 0;
          var cur = st.openCursor();
          cur.onsuccess = function () { var c = cur.result; if (c) { var b = c.value; if (b && b.size) sum += b.size; c.continue(); } else res(sum); };
          cur.onerror = function () { res(sum); };
        } catch (e) { res(0); }
      });
    });
  }
  function vidStatusText() {
    var total = vidStat.total || vidList().length;
    if (vidWarming) return t("vid.caching", { a: vidStat.have, b: total });
    if (total && vidStat.have >= total) return t("vid.cached") + " (" + total + ", " + Math.round(vidStat.bytes / 1048576) + "MB)";
    return t("vid.notCached");
  }
  function refreshVidStatus() { var el = document.querySelector('[data-role="vid-status"]'); if (el) el.textContent = vidStatusText(); }
  function mediaURL(path) {
    var b = (OWNER && OWNER.mediaBase) || "";
    return (b ? b.replace(/\/?$/, "/") : "/media/") + path;
  }
  function mountMedia() {
    var v = document.querySelector("video[data-vpath]");
    if (!v || v.dataset.mounted) return;
    v.dataset.mounted = "1";
    var path = v.getAttribute("data-vpath");
    var setSrc = function (u) { v.src = u; try { v.load(); } catch (e) {} };
    vidGet(path).then(function (b) {
      if (b) setSrc(URL.createObjectURL(b));
      else setSrc(mediaURL(path));
    }).catch(function () { setSrc(mediaURL(path)); });
  }
  var lastReport = 0;
  function reportProgress(force) {
    var now = Date.now();
    if (!force && now - lastReport < 5000) return;
    lastReport = now;
    try {
      fetch("/__progress", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videos: { have: vidStat.have, total: vidStat.total, mb: Math.round(vidStat.bytes / 1048576) },
                               images: { have: imgStat.have, total: imgStat.total }, warming: vidWarming, at: new Date().toISOString() }) });
    } catch (e) {}
  }
  function vidCacheOne(path, quiet) {
    return fetch(mediaURL(path))
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.blob(); })
      .then(function (bl) { if (!quiet) { vidStat.bytes += bl.size; vidStat.have++; refreshVidStatus(); reportProgress(); } return vidPut(path, bl); })
      .catch(function () {});
  }
  function vidPrefetch(q) {
    if (!q) return;
    var pth = videoPath(q);
    if (!pth) return;
    vidGet(pth).then(function (b) { if (!b) vidCacheOne(pth, true); }).catch(function () {});
  }
  function vidWarm() {
    if (vidWarming || !window.__VIDEOS) return;
    vidWarming = true;
    var all = vidPaths(); vidStat.total = all.length;
    refreshVidStatus();
    vidKeys().then(function (have) {
      var set = {}; have.forEach(function (k) { set[k] = 1; });
      var missing = all.filter(function (k) { return !set[k]; });
      vidStat.have = all.length - missing.length;
      if (vidStat.total && vidStat.have >= vidStat.total) { try { var mb0 = parseInt(localStorage.getItem(VIDMBKEY) || "0", 10) || 0; if (mb0) vidStat.bytes = mb0 * 1048576; } catch (e) {} }
      refreshVidStatus();
      reportProgress(true);
      if (!missing.length) {
        vidWarming = false; try { localStorage.setItem(VIDKEY, String(Date.now())); } catch (e) {}
        refreshVidStatus();
        vidBytes().then(function (b) { vidStat.bytes = b; try { localStorage.setItem(VIDMBKEY, String(Math.round(b / 1048576))); } catch (e2) {} refreshVidStatus(); reportProgress(true); });
        return;
      }
      var i = 0, conc = 2, active = 0;
      function finish() { vidWarming = false; try { localStorage.setItem(VIDKEY, String(Date.now())); localStorage.setItem(VIDMBKEY, String(Math.round(vidStat.bytes / 1048576))); } catch (e) {} refreshVidStatus(); reportProgress(true); toast(t("vid.cachedDone")); }
      function pump() {
        while (active < conc && i < missing.length) {
          var pp = missing[i++]; active++;
          vidCacheOne(pp).then(function () { active--; if (i < missing.length) pump(); else if (active === 0) finish(); });
        }
      }
      pump();
    }).catch(function () { vidWarming = false; });
  }
  function quizShell(q) {
    preloadNeighbours();
    var st = state.q[q.id] || {};
    var done = session.ids.filter(function (id) { var x = session.answers[id]; return x && x.submitted; }).length;
    var pct = Math.round(done / session.ids.length * 100);
    var note = (state.notes[q.id] && state.notes[q.id].text) || "";
    return '' +
      '<section class="quiz">' +
        '<header class="quiz-top">' +
          '<button class="iconbtn" data-act="exit" title="' + esc(t("quiz.back")) + '">' + ic("left") + '</button>' +
          '<button class="iconbtn" data-act="home" title="' + esc(t("nav.home")) + '">' + ic("home") + '</button>' +
          '<div class="quiz-title"><strong>' + esc(session.title) + '</strong><span class="muted">' + esc(t("quiz.of", { i: session.i + 1, n: session.ids.length })) + '</span></div>' +
          '<div class="quiz-count">' + done + "/" + session.ids.length + '</div>' +
        '</header>' +
        '<div class="progress' + (session.mode) + '"><span style="width:' + pct + '%"></span></div>' +
        questionCard(q, note) +
      '</section>';
  }

  function questionCard(q, note) {
    var a = session.answers[q.id] || (session.answers[q.id] = { sel: [], val: "", submitted: false, correct: false });
    var meta = '<div class="q-meta">' +
      '<span class="qid">' + esc(q.id) + '</span>' +
      '<span class="chip">' + esc(t("quiz.points", { p: q.pt })) + '</span>' +
      '<span class="chip">' + esc(t("quiz." + q.t)) + '</span>' +
      (q.vid ? '<span class="chip">' + ic("img") + esc(t("quiz.videoBadge")) + '</span>' : "") +
      '<button class="iconbtn' + (state.q[q.id] && state.q[q.id].wrong ? " on" : "") + '" data-act="wrong-add" title="' + esc(state.q[q.id] && state.q[q.id].wrong ? t("quiz.inWrong") : t("quiz.addWrong")) + '">' + ic("alert") + '</button>' +
      '<button class="iconbtn' + (state.q[q.id] && state.q[q.id].bm ? " on" : "") + '" data-act="bm" title="' + esc(t("quiz.bookmark")) + '">' + ic("bookmark") + '</button>' +
      '</div>' +
      '<div class="q-tags"><a href="#/cat/' + encodeURIComponent(q._th) + '">' + esc(thName(q)) + '</a> · <a href="#/cat/' + encodeURIComponent(q._th) + '/' + encodeURIComponent(q._ch) + '">' + esc(chName(q)) + '</a></div>';

    var text = '<div class="q-text">' + stackText(q, "q", -1) + '</div>' + stemHtml(q) + (zhWanted() && !zhOf(q) ? '<p class="muted zh-missing">' + esc(t("quiz.zhMissing")) + '</p>' : "");

    var img = "";
    var vp = videoPath(q);
    if (vp) {
      img = '<figure class="q-fig q-vid">' +
        '<video controls preload="auto" playsinline poster="' + (q.img ? imgSrcOf(q.img) : "") + '" data-vpath="' + vp + '" onerror="this.closest(\'figure\').classList.add(\'novid\')"></video>' +
        (q.img ? '<img class="vid-fallback" src="' + imgSrcOf(q.img) + '" alt="' + esc(t("quiz.imgAlt")) + '">' : "") +
        '<figcaption>' + esc(t("quiz.videoBadge")) + ' · ' + esc(q.id) + '</figcaption>' +
        '<div class="vid-hint">' + esc(t("quiz.videoHint")) + '</div>' +
        '</figure>';
    } else if (q.img) img = '<figure class="q-fig loading"><img src="' + imgSrcOf(q.img) + '" alt="' + esc(t("quiz.imgAlt")) + '" decoding="async" fetchpriority="high" onload="this.parentNode.classList.remove(\'loading\')" onerror="this.closest(\'figure\').classList.add(\'broken\')"><figcaption>' + esc(t("quiz.imgAlt")) + ' · ' + esc(q.id) + '</figcaption></figure>';

    var opts = "";
    if (q.t === "num") {
      opts = '<div class="num-input"><label for="num-' + esc(q.id) + '">' + esc(t("quiz.numberHint")) + '</label>' +
        '<input id="num-' + esc(q.id) + '" type="number" inputmode="numeric" data-role="numinput" value="' + esc(a.val) + '"' + (a.submitted ? " disabled" : "") + ' placeholder="0"></div>';
    } else {
      opts = '<ul class="opts' + (q.t === "multi" ? " multi" : "") + '">' + q.oe.map(function (o, i) {
        var on = a.sel.indexOf(i) >= 0;
        var cls = "opt" + (on ? " on" : "");
        if (a.submitted) { if (q.ans.indexOf(i) >= 0) cls += " right"; else if (on) cls += " bad"; }
        return '<li class="' + cls + '" data-act="opt" data-i="' + i + '" role="button" tabindex="0" aria-pressed="' + on + '">' +
          '<span class="box" aria-hidden="true">' + (q.t === "multi" ? ic("check") : "") + '</span>' +
          '<span class="opt-body">' + stackText(q, "o", i) + '</span>' +
          '<span class="badge-k">' + L(i) + '</span></li>';
      }).join("") + '</ul>';
    }

    var atFirst = session.i <= 0;
    var prevBtn = '<button class="btn ghost" data-act="prev"' + (atFirst ? ' disabled aria-disabled="true"' : '') + '>' + ic("left") + esc(t("quiz.prev")) + '</button>';
    var actions = a.submitted
      ? '<div class="q-actions">' + prevBtn + '<button class="btn primary" data-act="next">' + esc(session.i + 1 >= session.ids.length ? t("quiz.finish") : t("quiz.next")) + ic("right") + '</button>' +
        '<button class="btn ghost" data-act="reveal-ai">' + ic("spark") + esc(t("quiz.ai")) + '</button></div>'
      : '<div class="q-actions">' + prevBtn + '<button class="btn primary" data-act="submit">' + esc(t("quiz.submit")) + '</button>' +
        '<button class="btn ghost" data-act="reveal">' + esc(t("quiz.reveal")) + '</button>' +
        '<button class="btn ghost" data-act="next">' + esc(session.i + 1 >= session.ids.length ? t("quiz.finish") : t("quiz.next")) + ic("right") + '</button>' +
        '<span class="kbd-hint"><kbd>←/→</kbd> ' + esc(t("quiz.kbdNav")) + ' · <kbd>1-4</kbd> ' + esc(t("quiz.kbdOpts")) + ' · <kbd>↵</kbd> ' + esc(t("quiz.kbdSubmit")) + '</span></div>';

    var fb = a.submitted ? feedbackBlock(q, a) : "";

    return '<article class="q-card" data-qid="' + esc(q.id) + '">' + meta + text + img + opts + actions + fb + aiBlock(q, a) + noteBlock(q.id, note) + '</article>';
  }

  function feedbackBlock(q, a) {
    var ok = a.correct;
    var your = q.t === "num" ? (a.val || "—") : (a.sel.length ? a.sel.sort(function (x, y) { return x - y; }).map(L).join(", ") : "—");
    var right = q.t === "num" ? (q.num == null ? "—" : q.num) : q.ans.map(L).join(", ");
    return '<div class="feedback ' + (ok ? "ok" : "no") + '" role="status">' +
      '<div class="fb-head">' + (ok ? ic("check") + esc(t("quiz.correct")) : ic("x") + esc(t("quiz.wrong"))) + '</div>' +
      '<div class="fb-row"><span>' + esc(t("quiz.yourAnswer")) + '</span><b>' + esc(your) + '</b></div>' +
      (ok ? "" : '<div class="fb-row"><span>' + esc(t("quiz.correctAnswer")) + '</span><b class="good">' + esc(right) + '</b></div>') +
      '<div class="fb-exp"><h4>' + esc(t("quiz.explanation")) + '</h4>' + explSwitch(q) + explainHTML(q) + "</div>" +
      (q.u ? '<a class="src" href="' + esc(q.u) + '" target="_blank" rel="noopener noreferrer">' + ic("link") + esc(t("quiz.source")) + '</a>' : "") +
      '</div>';
  }
  function explAvail(q) {
    var z = zhOf(q), a = [];
    if (z && z.c) a.push("zh");
    if (q.ce) a.push("en");
    if (q.cd) a.push("de");
    return a;
  }
  function explText(q, lang) {
    if (lang === "zh") { var z = zhOf(q); return (z && z.c) || ""; }
    if (lang === "de") return q.cd || "";
    return q.ce || "";
  }
  /* Official explanation follows the QUIZ language: a single-language quiz always explains in that
     language (unless the reader just overrode it via the switch/settings this session). The stored
     explLang only governs bilingual mode. */
  function explEffective(q) {
    var a = explAvail(q);
    if (window.__explManual && a.indexOf(prefs.explLang) >= 0) return prefs.explLang;
    var l = contentLangs();
    if (l.length === 1 && explText(q, l[0])) return l[0];
    return a.indexOf(prefs.explLang) >= 0 ? prefs.explLang : (a[0] || "en");
  }
  function explSwitch(q) {
    var a = explAvail(q); if (a.length < 2) return "";
    var LBL = { zh: t("lang.zh"), en: t("lang.en"), de: t("lang.de") };
    var eff = explEffective(q);
    return '<div class="seg expl-switch" role="group" aria-label="' + esc(t("quiz.explLang")) + '">' +
      a.map(function (v) { return '<button class="seg-btn' + (eff === v ? " on" : "") + '" data-act="expl-lang" data-val="' + v + '">' + esc(LBL[v]) + "</button>"; }).join("") + "</div>";
  }
  function explainHTML(q) {
    var eff = explEffective(q), tx = explText(q, eff);
    if (!tx) tx = explText(q, "en") || explText(q, "de") || explText(q, "zh");
    var html = '<div class="md">' + md(tx) + "</div>";
    if (eff === "zh") html += '<p class="fineprint">' + esc(t("quiz.mtNote")) + "</p>";
    return html;
  }

  function noteBlock(id, note) {
    return '<details class="panel" data-role="notepanel"' + (note ? " open" : "") + '>' +
      '<summary>' + ic("note") + esc(t("quiz.notes")) + '<span class="muted" data-role="notetag">' + (note ? esc(t("common.saved")) : esc(t("quiz.noNote"))) + '</span></summary>' +
      '<textarea data-role="noteta" rows="3" placeholder="' + esc(t("quiz.addNote")) + '">' + esc(note) + '</textarea>' +
      '<div class="panel-actions"><button class="btn small primary" data-act="savenote">' + esc(t("quiz.save")) + '</button></div>' +
      '</details>';
  }

  function aiSeed(q) {
    if (aiHist[q.id]) return aiHist[q.id];
    var hist = [];
    var c = state.ai[q.id];
    if (c && c.text && c.lang && c.lang !== aiLang()) c = null;   // cached in another language -> regenerate
    if (c && c.text) {
      hist.push({ role: "assistant", text: c.text });
      (c.qa || []).forEach(function (p) { hist.push({ role: "user", text: p.q }); hist.push({ role: "assistant", text: p.a }); });
    }
    aiHist[q.id] = hist;
    return hist;
  }
  function aiHas(q) { var c = state.ai[q.id]; return !!(c && c.text && (!c.lang || c.lang === aiLang())); }
  function aiGenerate(q) {
    if (!q) return;
    var hist = aiHist[q.id] || (aiHist[q.id] = []);
    if (hist.length) return;
    var offline = window.AI.answerLocal(q, "", aiLang(), true);
    hist.push({ role: "assistant", text: t("ai.generating") });
    if (session) rerenderQuiz();
    var done = function (txt) {
      var out = txt || offline;
      var c = state.ai[q.id] || (state.ai[q.id] = {});
      c.text = out; c.at = Date.now(); c.lang = aiLang(); c.qa = []; saveState();
      aiHist[q.id] = [{ role: "assistant", text: out }];
      if (session) rerenderQuiz();
    };
    if (window.AI.hasLLM()) {
      window.AI.chat(q, [], window.AI.askText(aiLang()), aiLang()).then(function (r) { done(r); }, function () { done(offline); });
    } else {
      setTimeout(function () { done(offline); }, 200);
    }
  }
  function aiBlock(q, a) {
    var hist = aiSeed(q);
    var open = aiPanelOpen[q.id] !== false;
    var off = !window.AI.hasLLM();
    var msgs = hist.map(function (m) { return '<div class="msg ' + m.role + '"><div class="bubble md">' + (m.role === "assistant" ? md(m.text) : esc(m.text)) + '</div></div>'; }).join("");
    return '<details class="panel ai" data-role="aipanel"' + (open ? " open" : "") + '>' +
      '<summary>' + ic("spark") + esc(t("ai.panelTitle")) +
        '<span class="badge-ai ' + (aiUnlocked() ? "on" : "off") + '">' + esc(quotaBadge()) + '</span></summary>' +
      '<p class="ai-hint">' + esc(aiHas(q) ? t("ai.generated") : t("ai.notGenerated")) + '</p>' +
      (aiUnlocked() ? '' : (!aiLoggedIn()
        ? '<div class="unlock-card">' +
            '<div class="unlock-h">' + ic("spark") + esc(t("login.title")) + '</div>' +
            '<p class="muted">' + esc(t("login.text")) + '</p>' +
            '<div class="q-actions"><button class="btn primary small" data-act="register-open">' + esc(t("auth.registerBtn")) + '</button>' +
            '<button class="btn ghost small" data-act="login-open">' + esc(t("auth.loginBtn")) + '</button>' +
            '<button class="btn ghost small" data-act="unlock-open">' + esc(t("ai.buy")) + '</button></div>' +
            '<p class="fineprint">' + esc(t("ai.freeAllNote")) + '</p>' +
        '<p class="fineprint">fahrtheorie.homes</p>' +
            '<p class="fineprint">' + esc(t("login.note")) + '</p>' +
          '</div>'
        : '<div class="unlock-card">' +
            '<div class="unlock-h">' + ic("spark") + esc(t("ai.unlockTitle")) + '</div>' +
            '<p class="muted">' + esc(t("ai.quotaText", { n: quotaLeft(), name: prefs.user })) + '</p>' +
            '<div class="q-actions">' +
              '<button class="btn primary small" data-act="unlock-open">' + esc(t("ai.buy")) + '</button>' +
              '<button class="btn ghost small" data-act="logout">' + esc(t("login.logout")) + '</button>' +
            '</div>' +
            '<p class="fineprint">' + esc(t("ai.freeNote")) + '</p>' +
          '</div>')) +
      (aiHas(q) ? '' : '<div class="q-actions"><button class="btn primary small" data-act="ai-gen">' + ic("spark") + esc(t("ai.generate")) + '</button><span class="muted">' + esc(t("ai.generateHint")) + '</span></div>') +
      '<div class="quick"' + (aiHas(q) ? '' : ' style="display:none"') + '>' +
        qk(1) + qk(2) + qk(3) +
        '<button class="pill" data-act="ai-again">' + esc(t("ai.regenerate")) + '</button>' +
        (isZh() ? '<button class="pill" data-act="translate">' + esc(t("ai.translate")) + '</button>' : "") +
      '</div>' +
      '<div class="msgs" data-role="msgs">' + msgs + '</div>' +
      '<form class="ai-form" data-role="aiform"><input type="text" data-role="aiinput" placeholder="' + esc(t("ai.placeholder")) + '" autocomplete="off"><button class="btn primary small" type="submit">' + esc(t("ai.send")) + '</button></form>' +
      (off ? '<p class="fineprint">' + esc(t("ai.noKey")) + ' <a href="#/settings">' + esc(t("ai.configCta")) + '</a></p>' : "") +
      '</details>';
  }
  function qk(n) { return '<button class="pill" data-act="quick" data-q="' + n + '">' + esc(t("ai.quick" + n)) + '</button>'; }

  function vSummary() {
    var n = session.ids.length, c = 0; session.ids.forEach(function (id) { if (session.answers[id] && session.answers[id].correct) c++; });
    var wr = session.ids.filter(function (id) { return state.q[id] && state.q[id].wrong; });
    return '<section class="empty card done"><div class="done-ring">' + Math.round(c / n * 100) + '%</div>' +
      '<h2>' + esc(t("quiz.done")) + '</h2><p class="lede">' + esc(t("quiz.doneStats", { n: n, c: c })) + '</p>' +
      '<div class="q-actions center">' +
        (wr.length ? '<a class="btn primary" href="#/practice?ids=' + encodeURIComponent(wr.join(",")) + '">' + esc(t("quiz.againWrong")) + '</a>' : "") +
        '<button class="btn ghost" data-act="restart">' + esc(t("quiz.restart")) + '</button>' +
        '<a class="btn ghost" href="#/categories">' + esc(t("quiz.backToCats")) + '</a>' +
      '</div></section>';
  }

  /* ---------------- practice: answer logic ---------------- */
  function submitCurrent() {
    var q = BY[session.ids[session.i]]; var a = session.answers[q.id];
    if (!q || !a || a.submitted) return;
    if (q.t === "num") { if (!String(a.val).trim()) return toast(t("quiz.typeNumber")); }
    else if (!a.sel.length) return toast(t("quiz.selectAtLeastOne"));
    grade(q, a);
    rerenderQuiz();
  }
  function revealCurrent() {
    var q = BY[session.ids[session.i]]; var a = session.answers[q.id];
    if (!q || !a || a.submitted) return;
    grade(q, a);
    rerenderQuiz();
  }
  function grade(q, a) {
    a.submitted = true;
    var ok;
    if (q.t === "num") ok = String(a.val).trim() === String(q.num).trim();
    else ok = a.sel.length === q.ans.length && a.sel.every(function (i) { return q.ans.indexOf(i) >= 0; });
    a.correct = ok;
    var st = qState(q.id);
    st.a++; st.at = Date.now(); st.last = ok;
    if (ok) { st.r++; if (st.wrong) { st.wrong = false; } }
    else { st.w++; st.wrong = true; }
    state.days[today()] = (state.days[today()] || 0) + 1;
    saveState();
  }
  function onOpt(i) {
    var q = BY[session.ids[session.i]]; var a = session.answers[q.id];
    if (a.submitted) return;
    if (q.t === "multi") { var k = a.sel.indexOf(i); if (k >= 0) a.sel.splice(k, 1); else a.sel.push(i); }
    else a.sel = [i];
    rerenderQuiz();
  }
  function rerenderQuiz() { var app = document.getElementById("view"); app.innerHTML = session.mode === "exam" ? vExam() : vQuiz(); if (session.mode !== "exam") preloadNeighbours(); mountMedia(); }

  /* ---------------- exam ---------------- */
  function vExamHome() {
    return '<section class="page-h"><span class="eyebrow">' + ic("clock") + esc(t("exam.title")) + '</span><h1>' + esc(t("exam.title")) + '</h1><p class="lede">' + esc(t("exam.sub", { n: 30 })) + '</p>' +
      '<div class="hero-cta"><button class="btn primary" data-act="exam-start">' + ic("clock") + esc(t("exam.start")) + '</button></div>' +
      '<div class="note-card"><h4>' + esc(t("exam.grading")) + '</h4><p>' + esc(t("exam.passLine", { p: "≤ 10" })) + '</p></div></section>';
  }
  function vExam() {
    var now = Date.now(); var left = Math.max(0, session.durationMs - (now - session.startedAt));
    if (left <= 0 && !session.graded) gradeExam();
    if (session.graded) return vExamResult();
    var q = BY[session.ids[session.i]];
    var a = session.answers[q.id] || (session.answers[q.id] = { sel: [], val: "", submitted: false, correct: false });
    var answered = session.ids.filter(function (id) { return session.answers[id] && (session.answers[id].sel.length || session.answers[id].val !== ""); }).length;
    var mm = String(Math.floor(left / 60000)).padStart(2, "0"), ss = String(Math.floor(left % 60000 / 1000)).padStart(2, "0");

    var opts = q.t === "num"
      ? '<div class="num-input"><label>' + esc(t("quiz.numberHint")) + '</label><input type="number" data-role="numinput" value="' + esc(a.val) + '"></div>'
      : '<ul class="opts' + (q.t === "multi" ? " multi" : "") + '">' + q.oe.map(function (o, i) {
          var on = a.sel.indexOf(i) >= 0;
          return '<li class="opt' + (on ? " on" : "") + '" data-act="opt" data-i="' + i + '" role="button" tabindex="0" aria-pressed="' + on + '">' +
            '<span class="box">' + (q.t === "multi" ? ic("check") : "") + '</span><span class="opt-body">' + stackText(q, "o", i) + '</span><span class="badge-k">' + L(i) + '</span></li>';
        }).join("") + '</ul>';
    return '<section class="quiz exam"><header class="quiz-top">' +
      '<button class="iconbtn" data-act="exam-abort" title="' + esc(t("exam.abort")) + '">' + ic("x") + '</button>' +
      '<div class="quiz-title"><strong>' + esc(t("exam.title")) + '</strong><span class="muted">' + esc(t("exam.answeredCount", { a: answered, n: 30 })) + '</span></div>' +
      '<div class="timer" data-role="timer">' + ic("clock") + mm + ':' + ss + '</div></header>' +
      '<div class="progress"><span style="width:' + Math.round(answered / 30 * 100) + '%"></span></div>' +
      '<article class="q-card"><div class="q-meta"><span class="qid">' + esc(q.id) + '</span><span class="chip">' + esc(t("quiz.points", { p: q.pt })) + '</span><span class="chip">' + esc(t("quiz." + q.t)) + '</span></div>' +
      '<div class="q-text">' + stackText(q, "q", -1) + '</div>' + stemHtml(q) +
      (videoPath(q) ? '<figure class="q-fig q-vid"><video controls preload="auto" playsinline poster="' + (q.img ? imgSrcOf(q.img) : "") + '" data-vpath="' + videoPath(q) + '" onerror="this.closest(\'figure\').classList.add(\'novid\')"></video>' + (q.img ? '<img class="vid-fallback" src="' + imgSrcOf(q.img) + '" alt="' + esc(t("quiz.imgAlt")) + '">' : "") + '</figure>' : (q.img ? '<figure class="q-fig"><img src="' + imgSrcOf(q.img) + '" alt="' + esc(t("quiz.imgAlt")) + '" loading="lazy"></figure>' : "")) + opts +
      '<div class="q-actions"><button class="btn ghost" data-act="prev">' + esc(t("quiz.prev")) + '</button>' +
      '<button class="btn primary" data-act="next-exam">' + esc(session.i + 1 >= 30 ? t("exam.grade") : t("quiz.next")) + ic("right") + '</button>' +
      '<button class="btn ghost" data-act="exam-grade">' + esc(t("exam.grade")) + '</button></div></article></section>';
  }
  function gradeExam() {
    session.graded = true;
    var err = 0, total = 0;
    session.ids.forEach(function (id) {
      var q = BY[id], a = session.answers[id]; total += q.pt;
      var ok = a && (q.t === "num" ? String(a.val).trim() === String(q.num).trim() : (a.sel.length === q.ans.length && a.sel.every(function (i) { return q.ans.indexOf(i) >= 0; })));
      if (!ok) { err += q.pt; }
      if (a && (a.sel.length || a.val !== "")) { var st = qState(id); st.a++; st.at = Date.now(); st.last = !!ok; if (ok) st.r++; else { st.w++; st.wrong = true; } }
    });
    session.err = err; session.total = total; saveState();
  }
  function vExamResult() {
    var pass = session.err <= 10;
    return '<section class="empty card"><div class="done-ring ' + (pass ? "good" : "bad") + '">' + (session.total - session.err) + '<span>/' + session.total + '</span></div>' +
      '<h2>' + esc(pass ? t("exam.passed") : t("exam.failed")) + '</h2>' +
      '<p class="lede">' + esc(t("exam.errorPoints")) + ': ' + session.err + ' · ' + esc(t("exam.passLine", { p: "≤ 10" })) + '</p>' +
      '<div class="q-actions center"><a class="btn primary" href="#/practice?ids=' + encodeURIComponent(session.ids.join(",")) + '&src=exam">' + esc(t("exam.review")) + '</a>' +
      '<button class="btn ghost" data-act="exam-start">' + esc(t("exam.newExam")) + '</button></div></section>';
  }

  /* ---------------- wrong book ---------------- */
  function vWrong(th, ch) {
    var arr = CAT.filter(function (q) { return state.q[q.id] && state.q[q.id].wrong; });
    if (th) arr = arr.filter(function (q) { return q._th === th && (!ch || q._ch === ch); });
    var byTheme = {};
    arr.forEach(function (q) { (byTheme[q._th] = byTheme[q._th] || []).push(q); });
    var head = '<section class="page-h"><span class="eyebrow">' + ic("alert") + esc(t("wrong.title")) + '</span><h1>' + esc(t("wrong.title")) + '</h1><p class="lede">' + esc(t("wrong.sub")) + '</p>' +
      '<div class="chips"><a class="chip' + (!th ? " on" : "") + '" href="#/wrong">' + esc(t("wrong.allCats")) + '</a>' +
      INDEX.themes.filter(function (T) { return arr.some(function (q) { return q._th === T.th; }); }).map(function (T) {
        return '<a class="chip' + (th === T.th ? " on" : "") + '" href="#/wrong/' + encodeURIComponent(T.th) + '">' + esc(T.thz || trName(T.thd, T.the, zhTheme(T.th))) + '</a>';
      }).join("") + '</div>';
    if (!arr.length) return head + '<div class="empty card"><h2>' + esc(t("wrong.empty")) + '</h2><a class="btn primary" href="#/categories">' + esc(t("wrong.emptyAction")) + '</a></div></section>';
    return head +
      '<div class="hero-cta"><a class="btn primary" href="#/practice?ids=' + encodeURIComponent(arr.map(function (q) { return q.id; }).join(",")) + '&src=wrong">' + ic("refresh") + esc(t("wrong.retryAll")) + '</a><span class="muted">' + esc(t("wrong.count", { n: arr.length })) + '</span></div>' +
      '<div class="wrong-list">' + arr.map(function (q) {
        var st = state.q[q.id];
        return '<div class="wrong-row"><a class="wr-main" href="#/practice?ids=' + encodeURIComponent(arr.map(function (x) { return x.id; }).join(",")) + '&at=' + encodeURIComponent(q.id) + '&src=wrong">' +
          '<span class="qid">' + esc(q.id) + '</span><span class="wr-text">' + esc(q.qe) + '</span>' +
          '<span class="wr-meta">' + esc(thName(q)) + ' · ' + esc(st.w > 0 ? t("wrong.wrongTimes", { n: st.w }) : t("wrong.manual")) + '</span></a>' +
          '<button class="iconbtn" data-act="unwrong" data-id="' + esc(q.id) + '" title="' + esc(t("wrong.remove")) + '">' + ic("trash") + '</button></div>';
      }).join("") + '</div></section>';
  }

  /* ---------------- notes ---------------- */
  function vNotes() {
    var ids = Object.keys(state.notes).filter(function (id) { return state.notes[id] && state.notes[id].text && BY[id]; });
    var head = '<section class="page-h"><span class="eyebrow">' + ic("note") + esc(t("notes.title")) + '</span><h1>' + esc(t("notes.title")) + '</h1><p class="lede">' + esc(t("notes.sub")) + '</p></section>';
    if (!ids.length) return head + '<div class="empty card"><h2>' + esc(t("notes.empty")) + '</h2><a class="btn primary" href="#/categories">' + esc(t("notes.emptyAction")) + '</a></div>';
    return head + '<div class="muted note-count">' + esc(t("notes.count", { n: ids.length })) + '</div><div class="note-list">' + ids.map(function (id) {
      var q = BY[id];
      return '<article class="note-row"><header><span class="qid">' + esc(q.id) + '</span><span class="wr-meta">' + esc(thName(q)) + '</span><a class="btn small ghost" href="#/practice?c=ALL&m=all&s=seq&at=' + encodeURIComponent(id) + '&src=all">' + esc(t("notes.jump")) + '</a></header>' +
        '<p class="note-q">' + esc(q.qe) + '</p><div class="note-body">' + esc(state.notes[id].text) + '</div></article>';
    }).join("") + '</div></section>';
  }

  /* ---------------- settings ---------------- */
  var LIC_BASE = "";   // owner: your AI proxy base URL (optional legacy path)
  function licBase() { return prefs.licBase || LIC_BASE; }
  function aiUnlocked() { return !!(prefs.unlimited || (prefs.lic && licBase())); }

  function vSettings() {
    var img = CAT.filter(function (q) { return q.img; }).length;
    return '<section class="page-h"><span class="eyebrow">' + ic("cog") + esc(t("settings.title")) + '</span><h1>' + esc(t("settings.title")) + '</h1></section>' +
      card(t("settings.appearance"),
        langField(t("settings.uiLang"), "ui", uiOptions(), prefs.uiLang) +
        langField(t("settings.contentLang"), "content", contentOptions(), prefs.contentLang) +
        '<p class="fineprint">' + esc(t("settings.langNote")) + '</p>' +
        seg(t("quiz.explLang"), "expllang", [["zh", t("lang.zh")], ["en", t("lang.en")], ["de", t("lang.de")]], prefs.explLang) +
        seg(t("settings.theme"), "theme", [["light", t("settings.themeLight")], ["dark", t("settings.themeDark")]], prefs.theme) +
        seg(t("settings.scope"), "scope", [["b", t("scope.b") + " (" + (CAT_ALL ? CAT_ALL.filter(isClassB).length : 0) + ")"], ["all", t("scope.all") + " (" + (CAT_ALL ? CAT_ALL.length : 0) + ")"]], prefs.scope) +
        '<p class="fineprint">' + esc(t("scope.hint")) + '</p>') +
      card(t("settings.data"), '<p><strong>' + esc(t("settings.dataInfo", { n: CAT.length, img: img })) + '</strong></p>' +
        '<p class="muted">' + esc(t("home.dataNote")) + '</p>' +
        '<div class="q-actions"><button class="btn ghost small" data-act="export">' + ic("down") + esc(t("settings.export")) + '</button>' +
        '<label class="btn ghost small">' + ic("up") + esc(t("settings.import")) + '<input type="file" accept="application/json" data-role="import" hidden></label>' +
        '<button class="btn ghost small danger" data-act="reset">' + ic("trash") + esc(t("settings.reset")) + '</button></div>') +
      card(t("settings.about"), '<p class="muted">' + esc(t("settings.aboutText")) + '</p><p class="muted">' + esc(t("home.disclaimer")) + '</p>' +
        '<p class="fineprint"><a href="privacy.html">' + esc(t("legal.privacy")) + '</a> · <a href="terms.html">' + esc(t("legal.terms")) + '</p>' +
        '<p class="fineprint">build v80 · <a href="#/admin">' + esc(t("admin.entry")) + '</a></p>');
  }

  function vAdmin() {
    var ai = window.AI.cfg();
    return '<section class="page-h"><span class="eyebrow">' + ic("cog") + esc(t("admin.title")) + '</span><h1>' + esc(t("admin.title")) + '</h1><p class="lede">' + esc(t("admin.hint")) + '</p></section>' +
      card(t("admin.cache"),
        '<div class="q-actions"><button class="btn ghost small" data-act="img-cache">' + ic("img") + esc(t("img.cacheNow")) + '</button><span class="muted" data-role="img-status">' + esc(imgStatusText()) + '</span></div>' +
        '<div class="q-actions" style="margin-top:12px"><button class="btn ghost small" data-act="vid-cache">' + ic("play") + esc(t("vid.cacheNow")) + '</button><span class="muted" data-role="vid-status">' + esc(vidStatusText()) + '</span></div>') +
      card(t("settings.dataFile"),
        '<p class="muted">' + esc(t("settings.dataFileHint")) + '</p>' +
        '<p><strong data-role="fs-status">' + esc(fsStatusText()) + '</strong></p>' +
        '<div class="q-actions"><button class="btn primary small" data-act="fs-pick">' + esc(t("fs.pick")) + '</button>' +
        '<button class="btn ghost small" data-act="fs-reconnect">' + esc(t("fs.reconnect")) + '</button>' +
        '<button class="btn ghost small" data-act="fs-forget">' + esc(t("fs.disconnect")) + '</button></div>') +
      card(t("settings.ai"),
        '<p class="muted">' + esc(t("settings.aiHint")) + '</p>' +
        field(t("settings.aiEndpoint"), "ai-base", ai.base || "", "/v1") +
        field(t("settings.aiKey"), "ai-key", ai.key || "", "sk-…", "password") +
        '<div class="q-actions"><button class="btn primary small" data-act="ai-save">' + esc(t("settings.aiSave")) + '</button>' +
        '<button class="btn ghost small" data-act="ai-clear">' + esc(t("settings.aiClear")) + '</button>' +
        '<span class="muted" data-role="ai-status">' + esc(window.AI.hasLLM() ? t("ai.llmBadge") : t("ai.offlineBadge")) + '</span></div>') +
      card(t("settings.support"),
        '<p class="muted">' + esc(t("support.hint")) + '</p>' +
        field(t("support.link"), "sp-link", prefs.donateLink || "", "https://ko-fi.com/yourname") +
        '<div class="field"><span class="field-lbl">' + esc(t("support.qr")) + '</span><div class="q-actions">' +
          '<label class="btn ghost small">' + esc(t("support.upload")) + '<input type="file" accept="image/*" data-role="sp-qr" hidden></label>' +
          '<span class="muted">' + esc(prefs.donateQR ? t("support.qrSet") : t("support.qrNone")) + '</span>' +
        '</div></div>' +
        '<div class="q-actions"><button class="btn primary small" data-act="sp-save">' + esc(t("common.saved")) + '</button>' +
        (prefs.donateQR ? '<button class="btn ghost small danger" data-act="sp-clear">' + esc(t("support.clear")) + '</button>' : "") + '</div>' +
        '<hr class="md-sep">' +
        '<p class="muted">' + esc(t("support.proHint")) + '</p>' +
        field(t("support.buy"), "sp-buy", prefs.buyUrl || "", "https://buy.stripe.com/...") +
        field(t("support.licBase"), "sp-licbase", prefs.licBase || "", "https://your-proxy.workers.dev/v1") +
        field(t("admin.apiBase"), "sp-api", prefs.apiBase || "", "https://dtt-backend.<you>.workers.dev") +
        field(t("admin.googleId"), "sp-gid", prefs.googleClientId || "", "xxxxxxxx.apps.googleusercontent.com") +
        '<div class="q-actions"><button class="btn ghost small" data-act="sp-save">' + esc(t("common.saved")) + '</button></div>') +
      '<div class="q-actions"><a class="btn ghost small" href="#/settings">' + esc(t("admin.back")) + '</a></div>';
  }
  function showSupport() {
    closeModal();
    var qr = prefs.donateQR || "", link = prefs.donateLink || "";
    var m = document.createElement("div");
    m.className = "modal-mask";
    m.setAttribute("data-act", "close-modal");
    m.innerHTML = '<div class="modal"><h3>' + esc(t("support.title")) + '</h3>' +
      (qr ? '<img class="qr" src="' + qr + '" alt="QR">' : '<p class="muted">' + esc(t("support.noQR")) + '</p>') +
      (link ? '<p><a href="' + esc(link) + '" target="_blank" rel="noopener">' + esc(link) + '</a></p>' : "") +
      '<div class="q-actions center"><button class="btn primary small" data-act="close-modal">' + esc(t("common.close")) + '</button></div></div>';
    document.body.appendChild(m);
  }
  function closeModal() { var m = document.querySelector(".modal-mask"); if (m) m.remove(); }
  function aiLoggedIn() { return !!(prefs.uid && prefs.user); }
  function quotaLeft() {
    if (typeof prefs.serverLeft === "number") return prefs.serverLeft;
    return (typeof prefs.freeLeft === "number") ? prefs.freeLeft : 10;
  }
  function apiRoot() { return (prefs.apiBase || "").replace(/\/$/, ""); }
  function refreshQuota() {
    if (!apiRoot() || !prefs.token) return;
    fetch(apiRoot() + "/api/me", { headers: { Authorization: "Bearer " + prefs.token } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j || typeof j.left !== "number") return;
        prefs.serverLeft = j.left;
        /* 付款状态以服务器为准，两个方向都要同步。之前只往 true 翻、从不翻回 false，
           所以后台把账号重置成未购之后，浏览器会永远显示已解锁。请求失败走 catch，
           不动 unlimited —— 查不到不等于没付款，不能把付过的人锁在外面。 */
        if ("unlimited" in j) prefs.unlimited = j.unlimited === true;
        savePrefs();
        if (session) rerenderQuiz();
      })
      .catch(function () {});
  }
  function applyServerAI() {
    if (apiRoot() && prefs.token) localStorage.setItem("dtt.ai", JSON.stringify({ base: apiRoot() + "/v1", model: "auto", key: prefs.token }));
  }
  function quotaBadge() { return aiUnlocked() ? t("ai.llmBadge") : (aiLoggedIn() ? t("ai.left", { n: quotaLeft() }) : t("ai.freeBadge")); }
  function syncUser() { window.__DTT_USER = aiLoggedIn() ? { id: prefs.uid, name: prefs.user } : null; }
  function aiGate() {
    if (aiUnlocked()) return true;
    if (!aiLoggedIn()) { showLogin(); return false; }
    if (quotaLeft() <= 0) { showUnlock(); return false; }
    if (typeof prefs.serverLeft === "number" || (apiRoot() && prefs.token)) return true;  // 服务端计数
    prefs.freeLeft = quotaLeft() - 1; savePrefs();
    return true;
  }
  function finishLogin(name, j) {
    if (!prefs.uid) prefs.uid = "u" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    prefs.user = name;
    if (j) { prefs.token = j.token || ""; prefs.serverLeft = (typeof j.left === "number") ? j.left : 10; applyServerAI(); }
    else if (typeof prefs.freeLeft !== "number") prefs.freeLeft = 10;
    savePrefs(); syncUser(); closeModal(); applyTheme(); renderTopbar();
    toast(t("login.ok", { n: quotaLeft() }));
    progPull();
    if (window.__pendingPay) { window.__pendingPay = false; showUnlock(); return true; }
    if (session) rerenderQuiz(); else route();
    return true;
  }
  function doLogin(name) {
    name = String(name || "").trim();
    if (!name) { toast(t("login.need")); return false; }
    if (apiRoot()) {
      return fetch(apiRoot() + "/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name }) })
        .then(function (r) { return r.json(); })
        .then(function (j) { if (!j || j.error) { toast(String((j && j.error) || t("auth.failLogin"))); return false; } return finishLogin(j.user || name, j); })
        .catch(function () { toast(t("err.backendLocal")); return finishLogin(name, null); });
    }
    return finishLogin(name, null);
  }
  function authVal(role) { var el = document.querySelector('[data-role="' + role + '"]'); return el ? String(el.value || "").trim() : ""; }
  function showLogin() { showAuth("login"); }
  function showAuth(mode) {
    closeModal();
    var reg = mode === "register", server = !!apiRoot();
    var m = document.createElement("div");
    m.className = "modal-mask"; m.setAttribute("data-act", "close-modal");
    m.innerHTML = '<div class="modal"><h3>' + esc(reg ? t("auth.registerTitle") : t("auth.loginTitle")) + '</h3>' +
      '<p class="muted">' + esc(server ? (reg ? t("auth.registerText") : t("auth.loginText")) : t("auth.localNote")) + '</p>' +
      (server
        ? '<input class="lic-input" data-role="a-email" type="email" placeholder="' + esc(t("auth.email")) + '" style="width:100%;box-sizing:border-box;margin-bottom:8px" autocomplete="email">' +
          '<input class="lic-input" data-role="a-pass" type="password" placeholder="' + esc(t("auth.pass")) + '" style="width:100%;box-sizing:border-box" autocomplete="' + (reg ? "new-password" : "current-password") + '">'
        : '<input class="lic-input" data-role="a-name" placeholder="' + esc(t("login.field")) + '" style="width:100%;box-sizing:border-box" autocomplete="username" value="' + esc(prefs.user || "") + '">') +
      '<div class="q-actions center" style="margin-top:14px">' +
        '<button class="btn primary small" data-act="' + (reg ? "do-register" : "do-login") + '">' + esc(reg ? t("auth.registerBtn") : t("auth.loginBtn")) + '</button>' +
        '<button class="btn ghost small" data-act="close-modal">' + esc(t("login.skip")) + '</button>' +
      '</div>' +
      (server ? '<p class="fineprint"><button class="pill" data-act="auth-switch" data-val="' + (reg ? "login" : "register") + '">' + esc(reg ? t("auth.haveAccount") : t("auth.noAccount")) + '</button></p>' : '') +
      (server && prefs.googleClientId ? '<div class="gsi-wrap" data-role="gsi" style="margin-top:12px"></div>' : '') +
      (server && !prefs.googleClientId ? '<p class="fineprint" style="margin-top:10px">' + esc(t("auth.googleNeedId")) + '</p>' : '') +
      '<p class="fineprint">' + esc(t("ai.freeAllNote")) + '</p>' +
      '<p class="fineprint">' + esc(t("login.note")) + '</p>' +
    '</div>';
    document.body.appendChild(m);
    if (server && prefs.googleClientId) mountGoogleAuth();
  }
  function mountGoogleAuth() {
    var cid = prefs.googleClientId, box = document.querySelector('[data-role="gsi"]');
    if (!cid || !box) return;
    var render = function () {
      try {
        google.accounts.id.initialize({
          client_id: cid,
          callback: function (resp) {
            if (!resp || !resp.credential) return;
            authPost("/api/google", { credential: resp.credential })
              .then(function (j) { if (!j || j.error) toast(String((j && j.error) || t("auth.googleFail"))); else finishLogin(j.user, j); })
              .catch(function () { toast(t("err.backend")); });
          }
        });
        google.accounts.id.renderButton(box, { theme: "outline", size: "large", text: "continue_with", width: 250 });
      } catch (e) { box.innerHTML = '<p class="fineprint">' + esc(t("auth.googleBlocked")) + '</p>'; }
    };
    if (window.google && window.google.accounts && window.google.accounts.id) { render(); return; }
    var sc = document.createElement("script");
    sc.src = "https://accounts.google.com/gsi/client";
    sc.async = true; sc.defer = true;
    sc.onload = render;
    sc.onerror = function () { box.innerHTML = '<p class="fineprint">' + esc(t("auth.googleBlocked")) + '</p>'; };
    document.head.appendChild(sc);
  }
  function authPost(path, payload) {
    return fetch(apiRoot() + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      .then(function (r) { return r.json(); });
  }
  function unlockKeyFrom(role) { var el = document.querySelector('[data-role="' + role + '"]'); return el ? String(el.value || "").trim() : ""; }
  var AUTH_B = "Bea" + "rer ";
  var payCache = null;
  function payInfo(cb) {
    if (payCache) { cb(payCache); return; }
    if (!apiRoot()) { cb(null); return; }
    fetch(apiRoot() + "/api/pay-methods")
      .then(function (r) { return r.json(); })
      .then(function (j) { payCache = j || {}; cb(payCache); })
      .catch(function () { cb(null); });
  }
  function doCheckout(provider, currency, method) {
    if (!apiRoot() || !prefs.token) { showUnlock(); return; }
    var isPaddle = provider === "paddle";
    toast(t("pay.creating"));
    // Stripe 四个按钮各带各的 method，后端按 stripe_methods 门控：没开通的直接 400，不许诺付不了的方式。
    // currency 只给 Paddle 用：买家自己点"微信支付"时点名要人民币，不能拿 IP 猜他的国家。
    var payload = {};
    if (isPaddle && currency) payload = { currency: currency };
    else if (!isPaddle && method) payload = { method: method };
    if (!isPaddle) { payload.locale = prefs.uiLang; payload.lang = prefs.uiLang; }
    fetch(apiRoot() + (isPaddle ? "/api/paddle/checkout" : "/api/checkout"), {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: AUTH_B + prefs.token },
      body: JSON.stringify(payload)
    })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j || j.error) { toast(String((j && j.error) || t("pay.fail"))); return; }
        // Paddle's checkout.url opens the overlay on this page and needs Paddle.js; only Stripe redirects.
        var ctk = (payCache && payCache.paddle_token) || "";
        if (isPaddle && j.id && ctk) { paddleCheckout(ctk, j, paddleCustomer(currency)); return; }
        if (j.url) { location.href = j.url; }
        else toast(t("pay.fail"));
      })
      .catch(function () { toast(t("err.backend")); showUnlock(); });
  }
  /* Paddle.js is only fetched when someone actually pays with Paddle. */
  var paddleLoaded = false, paddleInited = false, paddleQueue = [], paddleTxn = "";
  /* 结账页说"付完了"不等于服务端已经认账：Paddle 自己的交易状态可能还慢几秒，
     真正解锁的也可能是后台 webhook。所以付完之后要自己继续回头看账号状态，
     不能让人手动刷新页面。只在真的开过结账流程之后才轮询，光逛不付款不产生请求。 */
  var payWatchTimer = null;
  function watchPaid() {
    if (payWatchTimer || !apiRoot() || !prefs.token) return;
    var tries = 0;
    var check = function () {
      if (tries++ > 14) { clearInterval(payWatchTimer); payWatchTimer = null; return; }
      fetch(apiRoot() + "/api/me", { headers: { Authorization: AUTH_B + prefs.token } })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) {
          if (!j || j.unlimited !== true) return;
          clearInterval(payWatchTimer); payWatchTimer = null;
          prefs.unlimited = true;
          if (typeof j.left === "number") prefs.serverLeft = j.left;
          savePrefs(); closeModal(); toast(t("pay.done"));
          if (session) rerenderQuiz(); else route();
        })
        .catch(function () {});
    };
    check();
    payWatchTimer = setInterval(check, 2000);
  }
  function paddleEvent(ev) {
    var name = (ev && ev.event) || "";
    var d = (ev && ev.data) || {};
    if (name.indexOf("checkout.completed") >= 0) {
      var id = String(d.id || d.transactionId || d.transaction_id || paddleTxn || "");
      if (id) verifyPayment({ transaction_id: id });
      watchPaid();
      return;
    }
    if (name.indexOf("checkout.closed") >= 0) watchPaid();
  }
  function paddleRun(token, txnId, customer) {
    if (!window.Paddle || !window.Paddle.Checkout || !txnId) return false;
    if (!paddleInited) {
      // Paddle.js defaults to production; the token prefix says which side to talk to.
      var env = /^test_/.test(token) ? "sandbox" : "production";
      if (window.Paddle.Environment && window.Paddle.Environment.set) window.Paddle.Environment.set(env);
      window.Paddle.Initialize({ token: token, eventCallback: paddleEvent });
      paddleInited = true;
    }
    paddleTxn = txnId;
    var open = { transactionId: txnId };
    if (customer) open.customer = customer;
    window.Paddle.Checkout.open(open);
    return true;
  }
  /* Paddle 允许调用方预填结账页，不需要任何 API 权限。点"微信支付"的人已经表明自己从中国付款，
     所以直接把国家定成中国 —— 否则 Paddle 按 IP 填德国，德国要邮编、而且微信根本不会出现。
     选中国的买家看不到邮编字段（实测），所以这条路只剩扫码一步。 */
  function paddleCustomer(currency) {
    var c = {};
    var email = String(prefs.user || "");
    if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) c.email = email;
    if (String(currency || "").toUpperCase() === "CNY") c.address = { countryCode: "CN" };
    return Object.keys(c).length ? c : null;
  }
  function paddleCheckout(token, info, customer) {
    if (paddleRun(token, info.id, customer)) return;
    paddleQueue.push({ token: token, id: info.id, url: info.url, customer: customer });
    if (paddleLoaded) return;
    paddleLoaded = true;
    var sc = document.createElement("script");
    sc.src = "https://cdn.paddle.com/paddle/v2/paddle.js";
    sc.async = true; sc.defer = true;
    sc.onload = function () {
      var q = paddleQueue; paddleQueue = [];
      q.forEach(function (it) { if (!paddleRun(it.token, it.id, it.customer) && it.url) location.href = it.url; });
    };
    sc.onerror = function () {
      var q = paddleQueue; paddleQueue = [];
      q.forEach(function (it) { if (it.url) location.href = it.url; });
    };
    document.head.appendChild(sc);
  }
  function verifyPayment(payload) {
    if (!apiRoot() || !prefs.token || !payload) return;
    var isPaddle = !!payload.transaction_id;
    fetch(apiRoot() + (isPaddle ? "/api/paddle/verify" : "/api/verify-payment"), {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: AUTH_B + prefs.token }, body: JSON.stringify(Object.assign({ lang: prefs.uiLang }, payload))
    })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (j && j.unlimited) { prefs.unlimited = true; savePrefs(); closeModal(); toast(t("pay.done")); refreshQuota(); }
        else if (j && j.error) toast(String(j.error));
        try { history.replaceState(null, "", location.pathname + location.hash); } catch (e) {}
        if (session) rerenderQuiz(); else route();
      })
      .catch(function () {});
  }
  function handlePaidReturn() {
    var q = (location.search || "");
    if (q.indexOf("dtt_paid=1") < 0) return;
    var ptx = /_ptxn=([^&]+)/.exec(q) || /transaction_id=([^&]+)/.exec(q);
    if (ptx) { verifyPayment({ transaction_id: decodeURIComponent(ptx[1]) }); return; }
    var m = /session_id=([^&]+)/.exec(q);
    if (m) verifyPayment({ session_id: decodeURIComponent(m[1]) });
  }
  function unlockApply(key) {
    if (!key) { toast(t("support.licNeed")); return false; }
    if (apiRoot() && prefs.token) {
      return fetch(apiRoot() + "/api/unlock", { method: "POST", headers: { "Content-Type": "application/json", Authorization: AUTH_B + prefs.token }, body: JSON.stringify({ code: key }) })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (!j || j.error) { toast(String((j && j.error) || "解锁码无效")); return false; }
          prefs.unlimited = true; savePrefs(); closeModal(); toast(t("ai.unlockOk"));
          refreshQuota(); if (session) rerenderQuiz(); else route();
          return true;
        })
        .catch(function () { toast(t("err.backend")); return false; });
    }
    if (!licBase()) { toast(t("ai.needOwner")); return false; }
    prefs.lic = key; savePrefs();
    localStorage.setItem("dtt.ai", JSON.stringify({ base: licBase(), model: "auto", key: key }));
    closeModal();
    toast(t("ai.unlockOk"));
    if (session) rerenderQuiz(); else route();
    return true;
  }
  function showUnlock() {
    closeModal();
    var m = document.createElement("div");
    m.className = "modal-mask";
    m.setAttribute("data-act", "close-modal");
    m.innerHTML = '<div class="modal"><h3>' + esc(t("ai.unlockTitle")) + '</h3>' +
      '<p class="muted">' + esc(t("ai.unlockText")) + '</p>' +
      '<div class="q-actions center" data-role="pay-btns">' +
        (prefs.buyUrl ? '<a class="btn primary" href="' + esc(prefs.buyUrl) + '" target="_blank" rel="noopener">' + esc(t("ai.buy")) + '</a>' : '') +
        '<span class="muted" data-role="pay-loading">' + esc(t("pay.checking")) + '</span>' +
      '</div>' +
      '<p class="fineprint" data-role="pay-note"></p>' +
      '<div class="q-actions center" style="margin-top:14px"><button class="btn ghost small" data-act="close-modal">' + esc(t("common.close")) + '</button></div>' +
    '</div>';
    document.body.appendChild(m);
    if (!prefs.token) {
      window.__pendingPay = true;
      var gload = document.querySelector('[data-role="pay-loading"]');
      if (gload) gload.remove();
      var gbox = document.querySelector('[data-role="pay-btns"]');
      if (gbox) gbox.insertAdjacentHTML("afterbegin",
        '<button class="btn primary" data-act="register-open">' + esc(t("auth.registerBtn")) + '</button>' +
        '<button class="btn ghost" data-act="login-open">' + esc(t("auth.loginBtn")) + '</button>');
      var gnote = document.querySelector('[data-role="pay-note"]');
      if (gnote) gnote.textContent = t("pay.needLogin");
      return;
    }
    payInfo(function (info) {
      var box = document.querySelector('[data-role="pay-btns"]');
      var load = document.querySelector('[data-role="pay-loading"]');
      if (load) load.remove();
      if (!box) return;
      var prov = (info && info.providers) || {};
      var btns = "";
      var paypalReady = info && info.stripe_paypal === true;
      /* 一个按钮，一次 Stripe 收银台。收银台里能选什么由 Stripe 的动态支付方式说了算：
         现在有银行卡和 PayPal，Stripe 批下支付宝/微信后它们自己就会出现，这里不用再改。
         所以只需要管住文案 —— 没开通 PayPal 就不能写 PayPal（2026-09-20 实测 PayPal 已开通）。 */
      if (prov.stripe) btns += '<button class="btn primary" data-act="pay" data-provider="stripe">' + esc(t(paypalReady ? "pay.stripePaypal" : "pay.stripe")) + '</button>';
      var note = document.querySelector('[data-role="pay-note"]');
      if (btns) {
        box.insertAdjacentHTML("afterbegin", btns);
        if (note) note.textContent = t("pay.note");
      }
      else if (note) note.textContent = t("support.noBuy");
    });
  }
  function downscale(file, cb) {
    var fr = new FileReader();
    fr.onload = function () {
      var im = new Image();
      im.onload = function () {
        var w = Math.min(420, im.width), c = document.createElement("canvas");
        c.width = w; c.height = Math.round(im.height * w / im.width);
        c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
        cb(c.toDataURL("image/png"));
      };
      im.src = fr.result;
    };
    fr.readAsDataURL(file);
  }
  function card(title, body) { return '<section class="card settings-card"><h2>' + esc(title) + '</h2>' + body + '</section>'; }
  function fsStatusText() {
    if (!fsSupported) return t("fs.unsupportedShort");
    if (!fsHandle) return t("fs.none");
    return (fsNeedsReconnect ? t("fs.needReconnect") : t("fs.on")) + " · " + fsName;
  }
  function seg(label, name, opts, cur) {
    return '<div class="field"><span class="field-lbl">' + esc(label) + '</span><div class="seg" role="group" data-seg="' + name + '">' +
      opts.map(function (o) { return '<button type="button" class="seg-btn' + (cur === o[0] ? " on" : "") + '" data-val="' + esc(o[0]) + '">' + esc(o[1]) + '</button>'; }).join("") + '</div></div>';
  }
  function field(label, name, val, ph, type) {
    return '<label class="field"><span class="field-lbl">' + esc(label) + '</span><input type="' + (type || "text") + '" data-role="' + name + '" value="' + esc(val) + '" placeholder="' + esc(ph || "") + '" autocomplete="off" spellcheck="false"></label>';
  }

  /* ---------------- toast ---------------- */
  var toastTimer;
  function toast(msg) {
    var el = document.getElementById("toast");
    el.textContent = msg; el.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { el.classList.remove("show"); }, 2600);
  }

  /* ---------------- AI interaction ---------------- */
  function quickText(n) { return n === 1 ? t("ai.quick1") : n === 2 ? t("ai.quick2") : t("ai.quick3"); }
  function aiAsk(q, text) {
    var hist = aiHist[q.id] || (aiHist[q.id] = []);
    hist.push({ role: "user", text: text });
    var container = document.querySelector('[data-role="msgs"]');
    if (container) { container.insertAdjacentHTML("beforeend", '<div class="msg user"><div class="bubble md">' + esc(text) + "</div></div>"); container.insertAdjacentHTML("beforeend", '<div class="msg assistant" data-role="pending"><div class="bubble md"><span class="typing">' + esc(t("ai.thinking")) + "</span></div></div>"); container.scrollTop = container.scrollHeight; }
    function done(answer) {
      var p = document.querySelector('[data-role="pending"]'); if (p) p.remove();
      hist.push({ role: "assistant", text: answer });
      var cc = state.ai[q.id] || (state.ai[q.id] = {});
      cc.lang = aiLang(); cc.qa = cc.qa || []; cc.qa.push({ q: text, a: answer }); saveState();
      if (container) { container.insertAdjacentHTML("beforeend", '<div class="msg assistant"><div class="bubble md">' + md(answer) + "</div></div>"); container.scrollTop = container.scrollHeight; }
    }
    if (window.AI.hasLLM()) {
      window.AI.chat(q, hist.slice(0, -1), text, aiLang())
        .then(function (r) { done(r || "(empty)"); })
        .catch(function (e) {
          var base = window.AI.answerLocal(q, text, aiLang());
          done((e && e.kind === "http" ? t("ai.errHttp", { msg: e.msg }) + "\n\n" : "") + base);
        });
    } else {
      setTimeout(function () { done(window.AI.answerLocal(q, text, aiLang())); }, 180);
    }
  }
  function aiTranslate(q) {
    var key = q.id;
    if (state.tr[key]) { appendAssistant(state.tr[key]); return; }
    appendAssistant('<span class="typing">' + esc(t("ai.translating")) + "</span>", true);
    var payload = (q.t === "num" ? q.qe : q.qe + "\n" + q.oe.map(function (o, i) { return L(i) + ". " + o; }).join("\n")) + "\n\n" + (q.ce || "");
    window.AI.translate(payload, "Simplified Chinese").then(function (r) {
      state.tr[key] = r; saveState(); replaceLastAssistant(md(r));
    }).catch(function () { replaceLastAssistant('<em>' + esc(t("ai.translateFail")) + "</em>"); });
  }
  function appendAssistant(html, raw) {
    var c = document.querySelector('[data-role="msgs"]'); if (!c) return;
    c.insertAdjacentHTML("beforeend", '<div class="msg assistant" data-role="tmp"><div class="bubble md">' + (raw ? html : esc(html)) + "</div></div>"); c.scrollTop = c.scrollHeight;
  }
  function replaceLastAssistant(html) { var c = document.querySelector('[data-role="tmp"]'); if (c) { c.innerHTML = '<div class="bubble md">' + html + "</div>"; c.removeAttribute("data-role"); c.scrollTop = 0; } }

  /* ---------------- events ---------------- */
  document.addEventListener("click", function (e) {
    var segBtn = e.target.closest("[data-seg] .seg-btn");
    if (segBtn) { var name = segBtn.closest("[data-seg]").getAttribute("data-seg"); var key = name === "uilang" ? "uiLang" : name === "contentlang" ? "contentLang" : name === "expllang" ? "explLang" : name === "scope" ? "scope" : "theme"; prefs[key] = segBtn.getAttribute("data-val"); if (key === "explLang") { window.__explLang = prefs.explLang; window.__explManual = true; } if (key === "contentLang") window.__explManual = false; savePrefs(); applyTheme(); buildIndex(); if (key === "scope") { applyScope(); route(); } else { document.getElementById("view").innerHTML = vSettings(); } return; }

    var el = e.target.closest("[data-act]:not(select)"); if (!el) return;
    var act = el.getAttribute("data-act");
    if (act === "ui-lang") { prefs.uiLang = el.getAttribute("data-val"); savePrefs(); aiHist = {}; refresh(); return; }
    if (act === "content-lang") { prefs.contentLang = el.getAttribute("data-val"); savePrefs(); aiHist = {}; refresh(); return; }
    if (act === "expl-lang") { prefs.explLang = el.getAttribute("data-val"); window.__explLang = prefs.explLang; window.__explManual = true; savePrefs(); aiHist = {}; refresh(); return; }
    if (act === "toggle-theme") { prefs.theme = prefs.theme === "dark" ? "light" : "dark"; savePrefs(); applyTheme(); renderTopbar(); return; }
    if (act === "opt") return onOpt(parseInt(el.getAttribute("data-i"), 10));
    if (act === "submit") return submitCurrent();
    if (act === "reveal") return revealCurrent();
    if (act === "next") { session.i++; rerenderQuiz(); return; }
    if (act === "prev") { if (session.i <= 0) return; session.i = Math.max(0, session.i - 1); rerenderQuiz(); return; }
    if (act === "next-exam") { if (session.i + 1 >= 30) return gradeAndShowExam(); session.i++; rerenderQuiz(); return; }
    if (act === "exam-grade") return gradeAndShowExam();
    if (act === "exam-start") { startExam(); return; }
    if (act === "exam-abort") { if (confirm(t("exam.confirmAbort"))) { session = null; go("#/exam"); } return; }
    if (act === "exit") {
      var cq = (session && session.ids) ? BY[session.ids[session.i]] : null;
      // came from a category question list -> return exactly there; otherwise -> this question's category list
      if (session && session.back && session.back.indexOf("#/cat/") === 0) { go(session.back); return; }
      if (cq && cq._th) { go("#/cat/" + encodeURIComponent(cq._th) + "/" + encodeURIComponent(cq._ch)); return; }
      go("#/categories"); return;
    }
    if (act === "home") { go("#/home"); return; }
    if (act === "restart") { var p = session._p || {}; session = null; go("#/practice?c=" + encodeURIComponent(p.c || "ALL") + "&m=" + (p.m || "all") + "&s=rnd"); return; }
    if (act === "wrong-add") {
      var wq = currentQ(); if (!wq) return;
      var ws = qState(wq.id); ws.wrong = !ws.wrong; ws.at = Date.now(); saveState();
      rerenderQuiz();
      toast(ws.wrong ? t("quiz.addedWrong") : t("quiz.removedWrong"));
      return;
    }
    if (act === "bm") { var q = currentQ(); var st = qState(q.id); st.bm = !st.bm; st.at = Date.now(); saveState(); rerenderQuiz(); toast(st.bm ? t("quiz.bookmarked") : t("quiz.unbookmarked")); return; }
    if (act === "savenote") { var qq = currentQ(); var ta = document.querySelector('[data-role="noteta"]'); var txt = ta ? ta.value.trim() : ""; state.notes[qq.id] = { text: txt, at: Date.now() }; saveState(); toast(t("common.saved")); var tg = document.querySelector('[data-role="notetag"]'); if (tg) tg.textContent = txt ? t("common.saved") : t("quiz.noNote"); return; }
    if (act === "reveal-ai") { var pnl = document.querySelector('[data-role="aipanel"]'); if (pnl) { pnl.open = true; var inq = pnl.querySelector('[data-role="aiinput"]'); if (inq) inq.focus(); } return; }
    if (act === "quick") { if (!aiGate()) return; return aiAsk(currentQ(), quickText(parseInt(el.getAttribute("data-q"), 10))); }
    if (act === "ai-gen") { if (!aiGate()) return; aiGenerate(currentQ()); return; }
    if (act === "ai-again") { if (!aiGate()) return; var qq0 = currentQ(); if (state.ai[qq0.id]) { delete state.ai[qq0.id]; saveState(); } aiHist[qq0.id] = []; rerenderQuiz(); aiGenerate(qq0); return; }
    if (act === "translate") return aiTranslate(currentQ());
    if (act === "random") { go("#/practice?c=ALL&m=all&s=rnd"); return; }
    if (act === "unwrong") { var id = el.getAttribute("data-id"); var s = qState(id); s.wrong = false; s.at = Date.now(); saveState(); route(); toast(t("wrong.mastered")); return; }
    if (act === "export") { exportData(); return; }
    if (act === "reset") { if (confirm(t("settings.resetConfirm"))) { state = { q: {}, notes: {}, tr: {}, ai: {}, days: {}, goal: 20 }; progSavedAt = Date.now(); progWipe = true; saveState(); toast(t("settings.resetDone")); route(); } return; }
    if (act === "ai-save") { var base = val("ai-base"), key = val("ai-key"), model = "auto"; localStorage.setItem("dtt.ai", JSON.stringify({ base: base, key: key, model: model })); var s2 = document.querySelector('[data-role="ai-status"]'); if (s2) s2.textContent = window.AI.hasLLM() ? t("ai.llmBadge") : t("ai.offlineBadge"); toast(t("settings.aiSaved")); return; }
    if (act === "ai-clear") { localStorage.removeItem("dtt.ai"); document.getElementById("view").innerHTML = vSettings(); toast(t("settings.aiClear")); return; }
    if (act === "pay") { doCheckout(el.getAttribute("data-provider"), el.getAttribute("data-currency"), el.getAttribute("data-method")); return; }
    if (act === "buy" || act === "unlock-open") { showUnlock(); return; }   // the dialog lists every live provider
    if (act === "login-open") { showAuth("login"); return; }
    if (act === "register-open") { showAuth("register"); return; }
    if (act === "auth-switch") { showAuth(el.getAttribute("data-val")); return; }
    if (act === "do-register") {
      var re_ = authVal("a-email"), rp_ = authVal("a-pass");
      if (!re_ || !rp_) { toast(t("auth.needBoth")); return; }
      authPost("/api/register", { email: re_, password: rp_ })
        .then(function (j) { if (!j || j.error) toast(String((j && j.error) || t("auth.failRegister"))); else finishLogin(j.user, j); })
        .catch(function () { toast(t("err.backend")); });
      return;
    }
    if (act === "do-login") {
      if (apiRoot()) {
        var le_ = authVal("a-email"), lp_ = authVal("a-pass");
        if (!le_ || !lp_) { toast(t("auth.needBoth")); return; }
        authPost("/api/login", { email: le_, password: lp_ })
          .then(function (j) { if (!j || j.error) toast(String((j && j.error) || t("auth.failLogin"))); else finishLogin(j.user, j); })
          .catch(function () { toast(t("err.backend")); });
        return;
      }
      doLogin(authVal("a-name")); return;
    }
    if (act === "logout") { var hadToken = !!prefs.token; prefs.user = ""; prefs.uid = ""; prefs.lic = ""; prefs.token = ""; prefs.serverLeft = null; savePrefs(); syncUser(); try { localStorage.removeItem("dtt.ai"); } catch (e) {} if (hadToken) { state = { q: {}, notes: {}, tr: {}, ai: {}, days: {}, goal: 20 }; progSavedAt = 0; progPushedSig = ""; try { localStorage.setItem("dtt.state.v1", JSON.stringify(state)); } catch (e2) {} } if (session) rerenderQuiz(); else route(); renderTopbar(); toast(t("login.bye")); return; }
    if (act === "ai-unlock2") { unlockApply(unlockKeyFrom("lk2")); return; }
    if (act === "ai-unlock") { unlockApply(unlockKeyFrom("lkey")); return; }
    if (act === "support") { showSupport(); return; }
    if (act === "close-modal") { if (el.classList.contains("modal-mask") && e.target !== el) return; window.__pendingPay = false; closeModal(); return; }
    if (act === "sp-save") { prefs.donateLink = val("sp-link"); prefs.buyUrl = val("sp-buy"); if (document.querySelector('[data-role="sp-api"]')) prefs.apiBase = val("sp-api"); if (document.querySelector('[data-role="sp-gid"]')) prefs.googleClientId = val("sp-gid"); savePrefs(); document.getElementById("view").innerHTML = vSettings(); toast(t("common.saved")); return; }
    if (act === "sp-clear") { prefs.donateQR = ""; savePrefs(); document.getElementById("view").innerHTML = vSettings(); return; }
    if (act === "lic-enable") {
      prefs.donateLink = val("sp-link"); prefs.buyUrl = val("sp-buy"); prefs.lic = val("sp-lic"); prefs.licBase = val("sp-licbase"); savePrefs();
      if (prefs.lic && prefs.licBase) { localStorage.setItem("dtt.ai", JSON.stringify({ base: prefs.licBase, model: "auto", key: prefs.lic })); toast(t("support.licOn")); }
      else toast(t("support.licNeed"));
      document.getElementById("view").innerHTML = vSettings(); return;
    }
    if (act === "img-cache") { imgCacheWarm(); return; }
    if (act === "vid-cache") { vidWarm(); return; }
    if (act === "fs-pick") { fsPick(); return; }
    if (act === "fs-reconnect") { fsReconnect(); return; }
    if (act === "fs-forget") { fsDisconnect(); return; }
  });
  function val(role) { var el = document.querySelector('[data-role="' + role + '"]'); return el ? el.value.trim() : ""; }
  function currentQ() { return BY[session.ids[session.i]]; }

  document.addEventListener("input", function (e) {
    if (e.target.matches('[data-role="numinput"]')) { var q = currentQ(); if (q && session.answers[q.id]) session.answers[q.id].val = e.target.value; }
  });
  document.addEventListener("submit", function (e) {
    if (e.target.matches('[data-role="aiform"]')) { e.preventDefault(); if (!aiGate()) return; var inp = e.target.querySelector('[data-role="aiinput"]'); var txt = inp.value.trim(); if (!txt) return; inp.value = ""; aiAsk(currentQ(), txt); }
  });
  document.addEventListener("change", function (e) {
    if (e.target.matches("select[data-lang]")) {
      var kind = e.target.getAttribute("data-lang");
      prefs[kind === "ui" ? "uiLang" : "contentLang"] = e.target.value;
      if (!langKnown(prefs.uiLang)) prefs.uiLang = "zh";
      if (kind !== "ui") window.__explManual = false;
      savePrefs(); aiHist = {}; applyTheme(); buildIndex();
      toast(kind === "ui" ? langPickerName(prefs.uiLang) : t("lang." + prefs.contentLang));
      refresh();
      return;
    }
    if (e.target.matches('[data-role="sp-qr"]')) {
      var f = e.target.files[0]; if (!f) return;
      downscale(f, function (d) { prefs.donateQR = d; savePrefs(); document.getElementById("view").innerHTML = vSettings(); toast(t("support.qrSet")); });
      return;
    }
    if (e.target.matches('[data-role="import"]')) {
      var f = e.target.files[0]; if (!f) return; var r = new FileReader();
      r.onload = function () { try { var d = JSON.parse(r.result); if (!d || typeof d !== "object") throw 0; state = Object.assign({ q: {}, notes: {}, tr: {}, ai: {}, days: {}, goal: 20 }, d); progSavedAt = Date.now(); progWipe = true; saveState(); toast(t("settings.importDone")); route(); } catch (err) { toast(t("settings.importFail")); } };
      r.readAsText(f);
    }
  });
  document.addEventListener("toggle", function (e) {
    if (e.target.matches('[data-role="aipanel"]')) { var q = currentQ(); if (q) aiPanelOpen[q.id] = e.target.open; }
  }, true);
  document.addEventListener("keydown", function (e) {
    if (e.target.matches("input,textarea")) { if (e.key === "Enter" && e.target.matches('[data-role="aiinput"]')) return; return; }
    if (!session || location.hash.indexOf("practice") < 0) return;
    var q = BY[session.ids[session.i]]; var a = session.answers[q.id]; if (!q || !a) return;
    if (/^[1-9]$/.test(e.key)) { var i = parseInt(e.key, 10) - 1; if (i < q.oe.length) onOpt(i); }
    if (e.key === "ArrowLeft") { e.preventDefault(); if (session.i > 0) { session.i--; rerenderQuiz(); } return; }
    if (e.key === "ArrowRight") { e.preventDefault(); if (session.i + 1 < session.ids.length) { session.i++; rerenderQuiz(); } return; }
    if (e.key === "Enter") { e.preventDefault(); if (a.submitted) { session.i++; rerenderQuiz(); } else submitCurrent(); }
  });

  function gradeAndShowExam() { gradeExam(); clearInterval(window.__examTick); rerenderQuiz(); }
  function startExam() {
    var ids = shuffle(CAT.filter(function (q) { return q.t !== "num"; })).slice(0, 30).map(function (q) { return q.id; });
    session = { ids: ids, i: 0, mode: "exam", answers: {}, startedAt: Date.now(), durationMs: 45 * 60 * 1000, graded: false };
    if (location.hash === "#/exam") route(); else go("#/exam");
    clearInterval(window.__examTick);
    window.__examTick = setInterval(function () {
      var tl = document.querySelector('[data-role="timer"]'); if (!tl) { clearInterval(window.__examTick); return; }
      var left = Math.max(0, session.durationMs - (Date.now() - session.startedAt));
      tl.innerHTML = ic("clock") + String(Math.floor(left / 60000)).padStart(2, "0") + ":" + String(Math.floor(left % 60000 / 1000)).padStart(2, "0");
      if (left <= 0) { clearInterval(window.__examTick); gradeAndShowExam(); }
    }, 1000);
  }
  function exportData() {
    var blob = new Blob([JSON.stringify(state)], { type: "application/json" });
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "dtt-progress.json"; a.click(); URL.revokeObjectURL(a.href);
  }

  function applyTheme() {
    var root = document.documentElement;
    if (!root || !root.setAttribute) return;
    root.setAttribute("data-theme", prefs.theme);
    root.setAttribute("lang", prefs.uiLang || "zh");
    root.setAttribute("dir", RTL_LANGS[prefs.uiLang] ? "rtl" : "ltr");
  }
  function localizeStatic() {
    if (!document.querySelectorAll) return;
    document.querySelectorAll("[data-i18n]").forEach(function (el) { el.textContent = t(el.getAttribute("data-i18n")); });
    document.querySelectorAll("[data-i18n-title]").forEach(function (el) { el.setAttribute("title", t(el.getAttribute("data-i18n-title"))); });
    try { document.title = t("app.name") + " · fahrtheorie.homes"; } catch (e) {}
    localizeRailFoot();
  }
  /* Rail footer numbers live in static HTML, so they are re-labelled once the bank is ready. */
  function localizeRailFoot() {
    var v = document.querySelector('[data-role="rail-version"]');
    var c = document.querySelector('[data-role="rail-counts"]');
    if (!v || !c) return;
    if (!CAT_ALL || !CAT_ALL.length) return;
    v.textContent = t("rail.bankVersion", { d: CATALOGUE_DATE });
    c.textContent = t("rail.counts", { b: CAT_ALL.filter(isClassB).length, a: CAT_ALL.length });
  }
  function contentOptions() {
    return [["zhen", t("lang.zhen")], ["zh", t("lang.zh")], ["en", t("lang.en")], ["de", t("lang.de")]];
  }
  function uiOptions() { return UI_LANGS.map(function (o) { return [o[0], o[1]]; }); }
  function langPickerName(code) { for (var i = 0; i < UI_LANGS.length; i++) if (UI_LANGS[i][0] === code) return UI_LANGS[i][1]; return code; }
  /* Language dropdown, used in the top bar and in Settings. */
  function langPicker(act, label, opts, cur) {
    return '<label class="langsel"><select data-lang="' + esc(act) + '" aria-label="' + esc(label) + '" title="' + esc(label) + '">' +
      opts.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (cur === o[0] ? " selected" : "") + '>' + esc(o[1]) + '</option>'; }).join("") +
      '</select>' + ic("chev", "chev") + '</label>';
  }
  function langField(label, act, opts, cur) {
    return '<div class="field"><span class="field-lbl">' + esc(label) + '</span>' + langPicker(act, label, opts, cur) + '</div>';
  }
  function renderTopbar() {
    localizeStatic();
    var c = document.getElementById("topcontrols"); if (!c) return;
    c.innerHTML =
      (aiLoggedIn()
        ? '<span class="chip">' + esc(prefs.user) + '</span><button class="btn ghost small" data-act="logout">' + esc(t("login.logout")) + '</button>'
        : '<button class="btn ghost small" data-act="login-open">' + esc(t("auth.loginBtn")) + '</button><button class="btn primary small auth-reg" data-act="register-open">' + esc(t("auth.registerBtn")) + '</button>') +
      '<span class="langwrap"><span class="langtag">' + esc(t("settings.contentLang")) + '</span>' +
      langPicker("content", t("settings.contentLang"), contentOptions(), prefs.contentLang) + '</span>' +
      '<span class="langwrap"><span class="langtag">' + esc(t("settings.uiLang")) + '</span>' +
      langPicker("ui", t("settings.uiLang"), uiOptions(), prefs.uiLang) + '</span>' +
      '<button class="iconbtn" data-act="toggle-theme" title="' + esc(t("settings.theme")) + '" aria-label="' + esc(t("settings.theme")) + '">' + ic(prefs.theme === "dark" ? "sun" : "moon") + '</button>';
  }
  function refresh() {
    if (session && session.mode === "exam") { rerenderQuiz(); }
    else if (session && location.hash.indexOf("practice") >= 0) { rerenderQuiz(); }
    else { route(); }
    renderTopbar();
  }

  /* ---------------- boot ---------------- */
  function boot() {
    if (window.__booted) return; window.__booted = true;
    applyTheme();
    var shell = document.getElementById("boot");
    try {
      if (!window.__CATALOG || !window.__CATALOG.length) throw new Error("no catalog");
      CAT_ALL = window.__CATALOG;
      BY = {}; CAT_ALL.forEach(function (q) { BY[q.id] = q; });
      applyScope();
    } catch (e) {
      if (shell) shell.innerHTML = '<div class="empty card"><h2>' + esc(t("common.loadFail")) + '</h2><p class="muted">' + esc(t("common.loadFailHint")) + '</p><button class="btn primary" onclick="location.reload()">' + esc(t("common.retry")) + '</button></div>';
      return;
    }
    if (shell) shell.remove();
    document.getElementById("app").hidden = false;
    renderTopbar();
    route();
    window.addEventListener("hashchange", route);
    fsRestore();
    syncUser();
    handlePaidReturn();
    window.__dttAfterAI = refreshQuota;
    if (apiRoot() && prefs.token) { applyServerAI(); refreshQuota(); progPull(); }  // 已登录直接同步：光刷新不重登也要拉云端（v79 补）
    setTimeout(imgCacheWarm, 800);
    setTimeout(vidWarm, 12000);
    setTimeout(function(){ reportProgress(true); }, 13000);
  }
  applyTheme();
  localizeStatic();
  window.__boot = boot;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
