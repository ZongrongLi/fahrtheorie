/* ai.js — "AI discussion & explanation".
   Two engines behind one API:
     1. Offline explanation engine  — always available, built entirely from the
        official catalogue data (official explanation + option analysis +
        a small thematic knowledge base). Nothing is invented.
     2. Optional LLM (OpenAI-compatible) — used for free-form chat and for
        Chinese translation when the user configured an endpoint.
   The hosted preview ships a strict CSP, so the LLM engine only works when the
   site is opened outside that preview; the offline engine always works. */
(function () {
  var letter = function (i) { return String.fromCharCode(65 + i); };

  /* Thematic knowledge base — safe, general driving knowledge keyed by theme
     number. Used to frame the discussion; never used to fabricate answers. */
  var KB = {
    "1.1": { zh: "危险学：识别交通中的潜在危险并提前应对（防御性驾驶）。", en: "Hazard theory: spotting potential dangers in traffic and reacting early (defensive driving).", tip: "把每个场景都当作『下一秒可能出事』来预判。", tipEn: "Assume the worst-case next move and prepare for it.", de: "Gefahrenlehre: Potenzielle Gefahren im Verkehr frühzeitig erkennen und vorausschauend handeln.", tipDe: "Rechne immer mit den Fehlern anderer – fahre stets vorausschauend!" },
    "1.2": { zh: "交通中的行为：速度、车距、超车、并线、路口与高速上的正确操作。", en: "Behaviour in traffic: speed, distance, overtaking, lane changes and correct action at junctions and on the motorway.", tip: "先判断『谁优先、我能否被看见』，再决定动作。", tipEn: "Ask who has priority and whether you are visible before you act.", de: "Verhalten im Straßenverkehr: Geschwindigkeit, Abstand, Überholen, Fahrstreifenwechsel sowie Verhalten an Kreuzungen und auf der Autobahn.", tipDe: "Halber Tacho als Mindestabstand – schaffe dir immer ein Sicherheitspolster." },
    "1.3": { zh: "路权与先行权：路权标志、右先左、让行、进入环岛等规则。", en: "Priority and right of way: priority signs, right-before-left, give way, entering roundabouts.", tip: "无标志路口默认『右先左（rechts vor links）』。", tipEn: "Unmarked junction: default is right before left.", de: "Vorfahrt und Vorrang: Vorfahrtsschilder, Rechts vor Links, Vorfahrt gewähren und Einfahren in den Kreisverkehr.", tipDe: "Rechts vor Links gilt immer dann, wenn kein Schild die Vorfahrt regelt." },
    "1.4": { zh: "交通标志：危险、管制、指示标志的形状与颜色含义。", en: "Road signs: shape and colour meaning of warning, regulatory and direction signs.", tip: "红圈=禁止/限制，蓝底圆=指令，三角=警告。", tipEn: "Red ring = prohibition, blue circle = order, triangle = warning.", de: "Verkehrszeichen: Bedeutung von Form und Farbe bei Gefahr-, Vorschrift- und Richtzeichen.", tipDe: "Rot umrandeter Kreis verbietet, blaues Schild gebietet, Dreieck warnt." },
    "1.5": { zh: "环境保护：节油驾驶、噪音与尾气、生态友好的行车方式。", en: "Environmental protection: fuel-saving driving, noise and emissions, eco-friendly driving.", tip: "高挡低转、提前松油门滑行最省油。", tipEn: "High gear, low revs, roll off early — that saves fuel.", de: "Umweltschutz: Kraftstoffsparend fahren, Lärm und Emissionen vermeiden, umweltschonend unterwegs sein.", tipDe: "Früh hochschalten und vorausschauend rollen lassen spart Sprit und Geld." },
    "1.7": { zh: "车辆技术：与安全相关的车辆构造与功能。", en: "Vehicle technology: safety-relevant construction and function of the vehicle.", tip: "把问题和「安全系统如何帮你」联系起来。", tipEn: "Link the question to how the safety system helps you.", de: "Fahrzeugtechnik: Sicherheitsrelevanter Aufbau und Funktionsweise deines Fahrzeugs.", tipDe: "Technik schützt dich nur, wenn Reifen, Bremsen und Beleuchtung intakt sind." },
    "1.8": { zh: "驾驶人的适合性与能力：身体、心理与法律层面的前提。", en: "Driver qualification and ability: physical, mental and legal preconditions.", tip: "问自己：什么会削弱我的驾驶能力？", tipEn: "Ask what reduces your fitness to drive.", de: "Eignung und Befähigung: Körperliche, geistige und rechtliche Voraussetzungen für das Führen von Kraftfahrzeugen.", tipDe: "Fahre nur fit und ausgeruht – Alkohol, Drogen und Ablenkung sind tabu!" },
    "2.1": { zh: "危险学（B 照补充）：更贴近小汽车的具体危险情境。", en: "Hazard theory (Class B supplement): concrete danger situations for cars.", tip: "情境题先找『最安全、最克制的操作』。", tipEn: "In a situation question, pick the safest, most restrained action.", de: "Gefahrenlehre (Zusatzstoff Klasse B): Konkrete Gefahrensituationen beim Fahren mit dem Pkw.", tipDe: "Toter Winkel und nasse Fahrbahn: Verlangsame rechtzeitig dein Tempo!" },
    "2.2": { zh: "交通行为（B 照补充）：小汽车在各类情形下的具体驾驶规则。", en: "Behaviour in traffic (Class B): concrete driving rules for cars in many situations.", tip: "注意题目里的数字（速度、距离、时间）。", tipEn: "Watch the numbers in the question (speed, distance, time).", de: "Verhalten im Straßenverkehr (Klasse B): Konkrete Fahrregeln für Pkw in vielfältigen Verkehrssituationen.", tipDe: "Immer Schulterblick und Blinker setzen, bevor du die Spur wechselst." },
    "2.4": { zh: "交通标志（含补充）：更多标志组合与解读。", en: "Road signs (with supplement): more sign combinations and how to read them.", tip: "分两层读标志：形状决定类别，内容决定含义。", tipEn: "Read signs in two layers: shape = class, content = meaning.", de: "Verkehrszeichen (mit Zusatzstoff): Spezielle Schilderkombinationen richtig lesen und beachten.", tipDe: "Zusatzschilder direkt unter dem Zeichen bestimmen, für wen oder wann es gilt." },
    "2.5": { zh: "环境保护（补充）：法规与实操层面的环保驾驶。", en: "Environmental protection (supplement): eco-driving in law and practice.", tip: "节能 = 少刹车 + 平顺加速。", tipEn: "Eco-driving = fewer brakes + smooth acceleration.", de: "Umweltschutz (Zusatzstoff): Energiesparendes und umweltbewusstes Fahren in Vorschrift und Praxis.", tipDe: "Unnötigen Ballast ausladen und regelmäßig den Reifendruck kontrollieren." },
    "2.6": { zh: "车辆运行规定：载重、拖挂、装载、证件与营运相关规则。", en: "Rules on operating vehicles: loads, trailers, loading, documents and operation.", tip: "涉及数值时严格按法规原文判断。", tipEn: "With regulated values, follow the letter of the rule.", de: "Vorschriften über den Betrieb von Fahrzeugen: Ladung, Anhänger, Beladung, Papiere und Betrieb.", tipDe: "Bei Zahlenwerten gilt der Wortlaut der Vorschrift." },
    "2.7": { zh: "车辆技术（补充）：制动、灯光、轮胎、电子辅助等。", en: "Vehicle technology (supplement): brakes, lights, tyres, electronic aids.", tip: "把部件和它『防止哪种事故』对应起来。", tipEn: "Map each component to the accident it prevents.", de: "Fahrzeugtechnik (Zusatzstoff): Bremsen, Licht, Reifen, elektronische Assistenzsysteme.", tipDe: "Ordne jedem Bauteil zu, welchen Unfall es verhindert." },
    "2.8": { zh: "驾驶人适合性（货车相关补充）。", en: "Driver qualification (truck-related supplement).", tip: "关注作息、身体状态与法律责任。", tipEn: "Think rest, fitness and legal responsibility.", de: "Fahrerqualifikation (Zusatzstoff für Lkw).", tipDe: "Achte auf Ruhezeiten, Fitness und rechtliche Verantwortung." }
  };

  function kbFor(q) {
    return KB[q.th] || KB[q.th.split(".")[0] + ".0"] || null;
  }

  /* ---------- tiny phrase table: the offline engine speaks zh / en / de ---------- */
  var STR = {
    aboutOption: { zh: "### 关于选项 ", en: "### About option ", de: "### Zu Option " },
    isCorrect: { zh: "这个选项是**正确答案**之一。", en: "This option is part of the **correct answer**.", de: "Diese Option gehört zur **richtigen Antwort**." },
    notCorrect: { zh: "这个选项**不是**正确答案。", en: "This option is **not** correct.", de: "Diese Option ist **nicht** richtig." },
    officialHead: { zh: "### 官方解释（权威来源）", en: "### Official explanation (authoritative)", de: "### Offizielle Erklärung (maßgeblich)" },
    noOfficial: { zh: "（该题在官方题库中没有文字解释。）", en: "(No written official explanation for this question.)", de: "(Zu dieser Frage gibt es keine offizielle Textbegründung.)" },
    originalLabel: { zh: "原文", en: "Original", de: "Originaltext" },
    optionHead: { zh: "### 选项逐个分析", en: "### Option-by-option", de: "### Option für Option" },
    correctHead: { zh: "正确答案：", en: "Correct answer: ", de: "Richtige Antwort: " },
    answerHead: { zh: "### 答案", en: "### Answer", de: "### Antwort" },
    numExplain: { zh: "本题为数字题，正确答案为 **", en: "This is a number-entry question. The correct value is **", de: "Dies ist eine Zahleneingabe; der richtige Wert ist **" },
    knowledgeHead: { zh: "### 知识点", en: "### Knowledge point", de: "### Kernaussage" },
    themeLabel: { zh: "主题：", en: "Theme: ", de: "Thema: " },
    memoryTip: { zh: "**记忆提示：** ", en: "**Memory tip:** ", de: "**Eselsbrücke:** " },
    mnemonicHead: { zh: "### 记忆口诀", en: "### Mnemonic", de: "### Eselsbrücke" },
    mnemonicFallback: { zh: "把正确选项和它的安全理由绑在一起记。", en: "Tie the correct options to the safety reason behind them.", de: "Verknüpfe die richtigen Optionen mit dem Sicherheitsgrund dahinter." },
    testsHead: { zh: "### 考查点", en: "### What it tests", de: "### Was hier geprüft wird" },
    belongsTo: { zh: "本题属于「", en: "This belongs to “", de: "Diese Frage gehört zu „" },
    belongsToMid: { zh: "」，分值 ", en: "”, worth ", de: "“ und zählt " },
    belongsToEnd: { zh: " 分。", en: " points.", de: " Punkte." },
    ok: { zh: "✓ 正确", en: "✓ correct", de: "✓ richtig" },
    bad: { zh: "✗ 错误", en: "✗ wrong", de: "✗ falsch" },
    answerSep: { zh: "、", en: ", ", de: ", " },
    langName: { zh: "简体中文", en: "English", de: "Deutsch" }
  };
  function S(key, lang) { var v = STR[key]; return (v && (v[lang] || v.en)) || ""; }
  function themeName(q, lang) {
    if (lang === "zh") return (window.__ZH_THEME && window.__ZH_THEME[q.th]) || q.thd;
    return lang === "de" ? q.thd : q.the;
  }
  function chapterName(q, lang) {
    if (lang === "zh") return (window.__ZH_CHAP && window.__ZH_CHAP[q.ch]) || q.chd;
    return lang === "de" ? q.chd : q.che;
  }
  function askFor(lang) {
    if (lang === "zh") return "请用简体中文讲解这道题：为什么正确选项是对的、其他选项错在哪里，最后给一条记忆要点。";
    if (lang === "de") return "Erkläre diese Frage auf Deutsch: warum die richtigen Optionen stimmen, was an den anderen falsch ist, und zum Schluss eine Eselsbrücke.";
    return "Explain this question in English: why the correct options are right, where the others are wrong, and a memory tip at the end.";
  }

  /* ---------- Offline explanation engine ---------- */
  function optionLine(q, i, lang) {
    var txt;
    if (lang === "zh") { var z = window.__ZH && window.__ZH[q.id]; txt = (z && z.o && z.o[i]) ? z.o[i] : q.oe[i]; }
    else if (lang === "de") txt = q.od[i];
    else txt = q.oe[i];
    var ok = q.ans.indexOf(i) >= 0;
    return "- **" + letter(i) + ".** " + txt + "  —  " + (ok ? S("ok", lang) : S("bad", lang));
  }

  function officialAnswerText(q, lang) {
    if (q.t === "num") return q.num == null ? "—" : String(q.num);
    if (!q.ans.length) return "—";
    return q.ans.map(function (i) { return letter(i); }).join(S("answerSep", lang));
  }

  function answerLocal(q, query, lang, skipOfficial) {
    var zh = lang === "zh";
    var hasQ = query && query.trim().length > 0;
    var ql = hasQ ? query.toLowerCase() : "";
    var out = [];

    // 1) Direct option question: "why is B wrong", "A", etc.
    var asked = null;
    if (hasQ) {
      var m = ql.match(/(?:^|[^a-z])([a-d])(?:[^a-z]|$)/);
      if (m) asked = m[1].toUpperCase().charCodeAt(0) - 65;
    }
    if (asked != null && q.oe && q.oe[asked] != null) {
      var ok = q.ans.indexOf(asked) >= 0;
      out.push(S("aboutOption", lang) + letter(asked));
      out.push(optionLine(q, asked, lang));
      out.push(ok ? S("isCorrect", lang) : S("notCorrect", lang));
    }

    // 2) Official explanation (authoritative) — skipped when it is already shown above
    if (!skipOfficial) {
      var comment = pickComment(q, lang);
      out.push(S("officialHead", lang));
      out.push(comment.primary || S("noOfficial", lang));
      if (comment.secondary) {
        out.push(zh ? "*" + S("originalLabel", lang) + "（" + comment.secondaryLabel + "）：*"
                    : "*" + S("originalLabel", lang) + " (" + comment.secondaryLabel + "):*");
        out.push(comment.secondary);
      }
    }

    // 3) Option-by-option analysis (choice questions only)
    if (q.od && q.od.length) {
      out.push(S("optionHead", lang));
      for (var i = 0; i < q.oe.length; i++) out.push(optionLine(q, i, lang));
      out.push(S("correctHead", lang) + "**" + officialAnswerText(q, lang) + "**");
    } else if (q.t === "num") {
      out.push(S("answerHead", lang));
      out.push(S("numExplain", lang) + (q.num == null ? "—" : q.num) + "**.");
    }

    // 4) Knowledge point + memory tip
    var kb = kbFor(q);
    out.push(S("knowledgeHead", lang));
    var kbText = kb ? (zh ? kb.zh : (lang === "de" ? kb.de : kb.en)) : "";
    out.push(kbText || S("themeLabel", lang) + themeName(q, lang) + " · " + chapterName(q, lang));
    if (kb) out.push(S("memoryTip", lang) + (zh ? kb.tip : (lang === "de" ? kb.tipDe : kb.tipEn)));

    // 5) Query-specific flourishes
    if (hasQ) {
      if (/trick|mnemonic|记忆|口诀|技巧|eselsbrücke|merksatz/i.test(ql)) {
        out.push(S("mnemonicHead", lang));
        out.push(kb ? (zh ? kb.tip : (lang === "de" ? kb.tipDe : kb.tipEn)) : S("mnemonicFallback", lang));
      }
      if (/考点|考什么|testing|knowledge|知识点|geprüft/i.test(ql)) {
        out.push(S("testsHead", lang));
        out.push(S("belongsTo", lang) + themeName(q, lang) + " / " + chapterName(q, lang) + S("belongsToMid", lang) + q.pt + S("belongsToEnd", lang));
      }
    }
    return out.filter(Boolean).join("\n\n");
  }

  function pickComment(q, lang) {
    var de = q.cd, en = q.ce, z = window.__ZH && window.__ZH[q.id];
    var zh = z ? z.c : "";
    if (lang === "zh") return { primary: zh || en || de, secondary: "", secondaryLabel: "" };
    if (lang === "de") return { primary: de || en, secondary: "", secondaryLabel: "" };
    return { primary: en || de, secondary: "", secondaryLabel: "" };
  }

  /* ---------- Optional LLM ---------- */
  var AI_DEFAULT = { base: "/v1", model: "auto", key: "" };
  function cfg() {
    var c = {};
    try { c = JSON.parse(localStorage.getItem("dtt.ai") || "{}") || {}; } catch (e) { c = {}; }
    if (!c.base) c.base = AI_DEFAULT.base;
    if (c.base === AI_DEFAULT.base) c.model = AI_DEFAULT.model;  // local gateway: always "auto"
    else if (!c.model) c.model = AI_DEFAULT.model;
    return c;
  }
  function hasLLM() { var c = cfg(); return !!(c.base && c.model); }
  function authHeaders(c) {
    var h = { "Content-Type": "application/json" };
    if (c.key) h["Authorization"] = "Bearer " + c.key;
    var u = window.__DTT_USER;
    if (u && u.id) { h["X-DTT-User"] = u.id; h["X-DTT-Token"] = u.id; }
    return h;
  }

  function sysPrompt(q, lang) {
    var name = S("langName", lang) || "English";
    var lines = [];
    lines.push("You are a tutor for the German driving-theory exam (Führerschein Theorieprüfung). "
      + "Write the ENTIRE answer in " + name + " — exactly the language the learner is reading the question in. "
      + "Never switch to another language, not even if the question text, the official explanation or the learner's own question is written in a different language. "
      + (lang === "zh" ? "用简体中文回答。" : lang === "de" ? "Antworte auf Deutsch." : "Answer in English.")
      + " Explain clearly and accurately, help the learner understand the rule and what is being tested. "
      + "Do not invent laws; say so when unsure. Output only the final explanation — no reasoning or self-talk; "
      + "structure: correct answer / why each option / memory tip.");
    lines.push("");
    lines.push("ID: " + q.id + " · " + themeName(q, lang) + " / " + chapterName(q, lang) + " · " + q.pt + " pts");
    lines.push("Question (DE): " + q.qd);
    /* 题面/选项/解释都带上德语原文（官方权威），再加一份「读者语言」的对照。
       德语读者不需要英文翻译（德语就是原文），中文读者优先用中文译文 —— 只留
       必要的那一份，prompt 少一截，上游输入 token 也就少一截。 */
    var zt = (lang === "zh" && window.__ZH && window.__ZH[q.id]) || null;
    if (lang !== "de") lines.push("Question (" + (zt ? "ZH" : "EN") + "): " + (zt && zt.q ? zt.q : q.qe));
    if (q.sd) lines.push("Sentence stem (DE): " + q.sd);
    if (q.s && lang !== "de") lines.push("Sentence stem (EN): " + q.s);
    if (q.oe.length) {
      for (var i = 0; i < q.oe.length; i++) {
        var alt = "";
        if (lang !== "de") alt = " | " + (zt && zt.o && zt.o[i] ? "ZH: " + zt.o[i] : "EN: " + q.oe[i]);
        lines.push(letter(i) + ". DE: " + q.od[i] + alt);
      }
      lines.push("Correct answer: " + officialAnswerText(q, "en"));
    } else {
      lines.push("Number question, correct answer: " + (q.num == null ? "—" : q.num));
    }
    if (q.cd) lines.push("Official explanation (DE): " + q.cd);
    if (q.ce && lang !== "de") lines.push("Official explanation (EN): " + q.ce);
    lines.push("");
    lines.push("Answer language for every reply: " + name + ".");
    return lines.join("\n");
  }

  function chat(q, history, query, lang) {
    var c = cfg();
    if (!hasLLM()) return Promise.reject({ kind: "nokey" });
    /* 中文题面翻译是懒加载的（data/zh.js，280KB）。要用中文提问就先等它到位，
       否则 prompt 里的题目会退回英文，而模型被要求用中文回答，质量会掉。 */
    if (lang === "zh" && window.__ensureZh) {
      return window.__ensureZh().then(function () { return chat(q, history, query, lang); });
    }
    var msgs = [{ role: "system", content: sysPrompt(q, lang) }];
    (history || []).slice(-8).forEach(function (m) {
      msgs.push({ role: m.role === "assistant" ? "assistant" : "user", content: m.text });
    });
    msgs.push({ role: "user", content: query });
    return fetch(c.base.replace(/\/$/, "") + "/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + c.key },
      body: JSON.stringify({ model: c.model, messages: msgs, temperature: 0.3, max_tokens: 1400, stream: false })
    }).then(function (r) {
      if (!r.ok) return r.text().then(function (t) { throw { kind: "http", msg: r.status + " " + t.slice(0, 160) }; });
      return r.json();
    }).then(function (j) {
      if (typeof j.dtt_left === "number" && window.__DTT_USER) { try { window.__dttAfterAI && window.__dttAfterAI(); } catch (e) {} }
      return (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || "";
    });
  }

  function translate(text, target) {
    var c = cfg();
    if (!hasLLM()) return Promise.reject({ kind: "nokey" });
    return fetch(c.base.replace(/\/$/, "") + "/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + c.key },
      body: JSON.stringify({
        model: c.model, temperature: 0, max_tokens: 1200, stream: false,
        messages: [
          { role: "system", content: "You are a precise translator. Translate the user text into " + (target || "Simplified Chinese") + ". Return only the translation, keep line breaks, do not add notes." },
          { role: "user", content: text }
        ]
      })
    }).then(function (r) {
      if (!r.ok) return r.text().then(function (t) { throw { kind: "http", msg: r.status + " " + t.slice(0, 160) }; });
      return r.json();
    }).then(function (j) { return (j.choices && j.choices[0] && j.choices[0].message.content) || ""; });
  }

  window.AI = {
    answerLocal: answerLocal, chat: chat, translate: translate,
    hasLLM: hasLLM, cfg: cfg, kbFor: kbFor, officialAnswerText: officialAnswerText,
    askText: askFor, langName: function (lang) { return S("langName", lang); }
  };
})();
