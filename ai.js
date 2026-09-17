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
    "1.1": { zh: "危险学：识别交通中的潜在危险并提前应对（防御性驾驶）。", en: "Hazard theory: spotting potential dangers in traffic and reacting early (defensive driving).", tip: "把每个场景都当作『下一秒可能出事』来预判。", tipEn: "Assume the worst-case next move and prepare for it." },
    "1.2": { zh: "交通中的行为：速度、车距、超车、并线、路口与高速上的正确操作。", en: "Behaviour in traffic: speed, distance, overtaking, lane changes and correct action at junctions and on the motorway.", tip: "先判断『谁优先、我能否被看见』，再决定动作。", tipEn: "Ask who has priority and whether you are visible before you act." },
    "1.3": { zh: "路权与先行权：路权标志、右先左、让行、进入环岛等规则。", en: "Priority and right of way: priority signs, right-before-left, give way, entering roundabouts.", tip: "无标志路口默认『右先左（rechts vor links）』。", tipEn: "Unmarked junction: default is right before left." },
    "1.4": { zh: "交通标志：危险、管制、指示标志的形状与颜色含义。", en: "Road signs: shape and colour meaning of warning, regulatory and direction signs.", tip: "红圈=禁止/限制，蓝底圆=指令，三角=警告。", tipEn: "Red ring = prohibition, blue circle = order, triangle = warning." },
    "1.5": { zh: "环境保护：节油驾驶、噪音与尾气、生态友好的行车方式。", en: "Environmental protection: fuel-saving driving, noise and emissions, eco-friendly driving.", tip: "高挡低转、提前松油门滑行最省油。", tipEn: "High gear, low revs, roll off early — that saves fuel." },
    "1.7": { zh: "车辆技术：与安全相关的车辆构造与功能。", en: "Vehicle technology: safety-relevant construction and function of the vehicle.", tip: "把问题和「安全系统如何帮你」联系起来。", tipEn: "Link the question to how the safety system helps you." },
    "1.8": { zh: "驾驶人的适合性与能力：身体、心理与法律层面的前提。", en: "Driver qualification and ability: physical, mental and legal preconditions.", tip: "问自己：什么会削弱我的驾驶能力？", tipEn: "Ask what reduces your fitness to drive." },
    "2.1": { zh: "危险学（B 照补充）：更贴近小汽车的具体危险情境。", en: "Hazard theory (Class B supplement): concrete danger situations for cars.", tip: "情境题先找『最安全、最克制的操作』。", tipEn: "In a situation question, pick the safest, most restrained action." },
    "2.2": { zh: "交通行为（B 照补充）：小汽车在各类情形下的具体驾驶规则。", en: "Behaviour in traffic (Class B): concrete driving rules for cars in many situations.", tip: "注意题目里的数字（速度、距离、时间）。", tipEn: "Watch the numbers in the question (speed, distance, time)." },
    "2.4": { zh: "交通标志（含补充）：更多标志组合与解读。", en: "Road signs (with supplement): more sign combinations and how to read them.", tip: "分两层读标志：形状决定类别，内容决定含义。", tipEn: "Read signs in two layers: shape = class, content = meaning." },
    "2.5": { zh: "环境保护（补充）：法规与实操层面的环保驾驶。", en: "Environmental protection (supplement): eco-driving in law and practice.", tip: "节能 = 少刹车 + 平顺加速。", tipEn: "Eco-driving = fewer brakes + smooth acceleration." },
    "2.6": { zh: "车辆运行规定：载重、拖挂、装载、证件与营运相关规则。", en: "Rules on operating vehicles: loads, trailers, loading, documents and operation.", tip: "涉及数值时严格按法规原文判断。", tipEn: "With regulated values, follow the letter of the rule." },
    "2.7": { zh: "车辆技术（补充）：制动、灯光、轮胎、电子辅助等。", en: "Vehicle technology (supplement): brakes, lights, tyres, electronic aids.", tip: "把部件和它『防止哪种事故』对应起来。", tipEn: "Map each component to the accident it prevents." },
    "2.8": { zh: "驾驶人适合性（货车相关补充）。", en: "Driver qualification (truck-related supplement).", tip: "关注作息、身体状态与法律责任。", tipEn: "Think rest, fitness and legal responsibility." }
  };

  function kbFor(q) {
    return KB[q.th] || KB[q.th.split(".")[0] + ".0"] || null;
  }

  /* ---------- Offline explanation engine ---------- */
  function optionLine(q, i, lang) {
    var txt;
    if (lang === "zh") { var z = window.__ZH && window.__ZH[q.id]; txt = (z && z.o && z.o[i]) ? z.o[i] : q.oe[i]; }
    else if (lang === "de") txt = q.od[i];
    else txt = q.oe[i];
    var ok = q.ans.indexOf(i) >= 0;
    return "- **" + letter(i) + ".** " + txt + "  —  " + (ok ? (lang === "zh" ? "✓ 正确" : "✓ correct") : (lang === "zh" ? "✗ 错误" : "✗ wrong"));
  }

  function officialAnswerText(q, lang) {
    if (q.t === "num") return q.num == null ? "—" : String(q.num);
    if (!q.ans.length) return "—";
    return q.ans.map(function (i) { return letter(i); }).join(lang === "zh" ? "、" : ", ");
  }

  function answerLocal(q, query, uiLang, contentLang, skipOfficial) {
    var zh = uiLang === "zh";
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
      out.push((zh ? "### 关于选项 " : "### About option ") + letter(asked));
      out.push(optionLine(q, asked, zh ? "zh" : "en"));
      out.push(ok
        ? (zh ? "这个选项是**正确答案**之一。" : "This option is part of the **correct answer**.")
        : (zh ? "这个选项**不是**正确答案。" : "This option is **not** correct."));
    }

    // 2) Official explanation (authoritative) — skipped when it is already shown above
    if (!skipOfficial) {
      var comment = pickComment(q, contentLang);
      out.push((zh ? "### 官方解释（权威来源）" : "### Official explanation (authoritative)"));
      out.push(comment.primary || (zh ? "（该题在官方题库中没有文字解释。）" : "(No written official explanation for this question.)"));
      if (comment.secondary) {
        out.push(zh ? "*原文（" + comment.secondaryLabel + "）：*" : "*Original (" + comment.secondaryLabel + "):*");
        out.push(comment.secondary);
      }
    }

    // 3) Option-by-option analysis (choice questions only)
    if (q.od && q.od.length) {
      out.push(zh ? "### 选项逐个分析" : "### Option-by-option");
      for (var i = 0; i < q.oe.length; i++) out.push(optionLine(q, i, zh ? "zh" : "en"));
      out.push((zh ? "正确答案：" : "Correct answer: ") + "**" + officialAnswerText(q, zh ? "zh" : "en") + "**");
    } else if (q.t === "num") {
      out.push(zh ? "### 答案" : "### Answer");
      out.push((zh ? "本题为数字题，正确答案为 **" : "This is a number-entry question. The correct value is **") + (q.num == null ? "—" : q.num) + "**.");
    }

    // 4) Knowledge point + memory tip
    var kb = kbFor(q);
    out.push(zh ? "### 知识点" : "### Knowledge point");
    out.push((zh ? kb ? kb.zh : "" : kb ? kb.en : "") || (zh ? "主题：" : "Theme: ") + (zh ? q.thd : q.the) + " · " + (zh ? q.chd : q.che));
    if (kb) out.push((zh ? "**记忆提示：** " : "**Memory tip:** ") + (zh ? kb.tip : kb.tipEn));

    // 5) Query-specific flourishes
    if (hasQ) {
      if (/why|为什么|为啥|原因/.test(ql) && !out.length) { /* handled above */ }
      if (/trick|mnemonic|记忆|口诀|技巧/.test(ql)) {
        out.push(zh ? "### 记忆口诀" : "### Mnemonic");
        out.push(kb ? (zh ? kb.tip : kb.tipEn) : (zh ? "把正确选项和它的安全理由绑在一起记。" : "Tie the correct options to the safety reason behind them."));
      }
      if (/考点|考什么|testing|knowledge|知识点/.test(ql)) {
        out.push(zh ? "### 考查点" : "### What it tests");
        out.push((zh ? "本题属于「" : "This belongs to “") + (zh ? q.thd : q.the) + " / " + (zh ? q.chd : q.che) + (zh ? "」，分值 " : "”, worth ") + q.pt + (zh ? " 分。" : " points."));
      }
    }
    return out.filter(Boolean).join("\n\n");
  }

  function pickComment(q, contentLang) {
    var lang = (typeof window.__explLang === "string") ? window.__explLang : contentLang;
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

  function sysPrompt(q, uiLang, contentLang) {
    var zh = uiLang === "zh";
    var lines = [];
    lines.push(zh
      ? "你是一名德国驾照理论考试（Führerschein Theorieprüfung）的辅导老师。请用简体中文、清晰、准确地解释这道题，帮助学员理解规则与考点。不要编造法条；如不确定请说明。只输出最终讲解正文，不要输出思考过程或自我对话；结构：正确答案 / 逐项为什么 / 记忆要点。"
      : "You are a tutor for the German driving-theory exam (Führerschein Theorieprüfung). Explain this question clearly and accurately in English. Do not invent rules; say so when unsure. Return only the final explanation — no reasoning or self-talk; structure: correct answer / why each option / memory tip.");
    lines.push("");
    lines.push((zh ? "题号：" : "ID: ") + q.id + " · " + (zh ? q.thd : q.the) + " / " + (zh ? q.chd : q.che) + " · " + q.pt + (zh ? "分" : " pts"));
    lines.push((zh ? "题干（德）：" : "Question (DE): ") + q.qd);
    lines.push((zh ? "题干（英）：" : "Question (EN): ") + q.qe);
    if (q.s) lines.push((zh ? "句子主语（英）：" : "Sentence stem (EN): ") + q.s);
    if (q.sd) lines.push((zh ? "句子主语（德）：" : "Sentence stem (DE): ") + q.sd);
    if (q.oe.length) {
      for (var i = 0; i < q.oe.length; i++) {
        lines.push(letter(i) + ". DE: " + q.od[i] + " | EN: " + q.oe[i]);
      }
      lines.push((zh ? "正确答案：" : "Correct answer: ") + officialAnswerText(q, "en"));
    } else {
      lines.push((zh ? "数字题，正确答案：" : "Number question, correct answer: ") + (q.num == null ? "—" : q.num));
    }
    lines.push((zh ? "官方解释（英）：" : "Official explanation (EN): ") + (q.ce || ""));
    if (contentLang === "de") lines.push((zh ? "官方解释（德）：" : "Official explanation (DE): ") + (q.cd || ""));
    return lines.join("\n");
  }

  function chat(q, history, query, uiLang, contentLang) {
    var c = cfg();
    if (!hasLLM()) return Promise.reject({ kind: "nokey" });
    var msgs = [{ role: "system", content: sysPrompt(q, uiLang, contentLang) }];
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
    hasLLM: hasLLM, cfg: cfg, kbFor: kbFor, officialAnswerText: officialAnswerText
  };
})();
