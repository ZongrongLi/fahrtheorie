/**
 * dtt-backend — Cloudflare Worker
 *  · 账号与额度：POST /api/register  /api/login  /api/google  GET /api/me
 *  · AI 代理：    POST /v1/chat/completions （校验 token → 扣次数 → 转发到上游模型）
 *  · 收款：       Stripe  (+ Paddle)   —— 付款后服务端校验，自动解锁，无需解锁码
 *
 * 存储：KV 命名空间 DTT
 *   key: user:<name>   value: JSON { name, email, uid, token, left, unlimited, created }
 *   key: tok:<token>   value: <name>
 *   key: uid:<uid>     value: <name>          （webhook 用 uid 反查用户）
 *   key: prog:<uid>    value: JSON {q, notes, days, goal, savedAt}  （做题进度云同步，
 *     q[<qid>]={a,w,r,last,wrong,at,bm} 按 at 取新，notes 按 at 取新，days 按天取大，
 *     goal 按 savedAt 取新；单记录 256KB 上限（2413 全量约 190KB，够装），5 秒内重复写 429）
 *
 * 环境变量（wrangler vars / secret）：
 *   UPSTREAM_URL / UPSTREAM_KEY / UPSTREAM_MODEL   上游 OpenAI 兼容模型服务
 *   FREE_TRIES      登录赠送次数（默认 10）
 *   UNLOCK_CODES    可选：逗号分隔的解锁码（后备手段）
 *   SITE_URL        站点地址（Stripe/Paddle 跳回用）
 *   PRICE_CENTS / PRICE_CURRENCY / PRICE_NAME      价格
 *   STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET      Stripe
 *   PADDLE_API_KEY / PADDLE_PRICE_ID / PADDLE_ENV / PADDLE_WEBHOOK_SECRET   Paddle
 *
 * 站长后台：GET /admin   （密码 = 环境变量 ADMIN_PASSWORD）
 *   POST /api/admin/login   {password}          → {token, exp}
 *   GET  /api/admin/users   x-admin-token       → {users, stats}
 *   POST /api/admin/user    {name, left?, unlimited?} → 改额度 / 改付费状态
 */

import { ADMIN_HTML } from "./admin-page.js";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type, authorization, x-dtt-user, x-dtt-token",
  "access-control-allow-methods": "POST, GET, OPTIONS",
};
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", ...CORS } });
const rid = () => Math.random().toString(36).slice(2, 12);
const qidOk = (s) => /^[0-9A-Za-z][0-9A-Za-z.\\-]{0,31}$/.test(String(s || ""));
const cleanText = (s) => String(s || "").replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "").trim();
const COMMENT_MAX = 1000, COMMENT_WINDOW_MS = 20000;
const bearer = (req) => (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");

/* ---------- Stripe Checkout locale + buyer-facing error i18n ----------
   Site language (prefs.uiLang) rides in as {locale, lang}. Stripe only accepts its own
   locale list (no uk/ar) -> those fall back to auto. Payment errors default to zh so
   old clients and local tests keep seeing the same strings. */
const STRIPE_LOCALES = new Set(("auto,bg,cs,da,de,el,en,en-GB,es,es-419,et,fi,fil,fr,fr-CA,hr,hu,id,it,ja,ko,lt,lv,ms,mt,nb,nl,pl,pt,pt-BR,ro,ru,sk,sl,sv,th,tr,vi,zh,zh-HK,zh-TW").split(","));
function stripeLocale(l) {
  l = String(l || "").trim();
  if (STRIPE_LOCALES.has(l)) return l;
  const low = l.toLowerCase();
  if (low === "zh" || low.indexOf("zh-") === 0) return "zh";
  if (low === "en" || low.indexOf("en-") === 0) return "en";
  if (STRIPE_LOCALES.has(low)) return low;
  return "auto";
}
const PAY_ERR = {
  needLogin: { zh: "请先登录", en: "Please log in first", de: "Bitte zuerst anmelden", ru: "Сначала войдите", tr: "Önce giriş yapın", uk: "Спочатку увійдіть", pl: "Najpierw się zaloguj", ro: "Conectează-te mai întâi", vi: "Vui lòng đăng nhập trước", ar: "يرجى تسجيل الدخول أولاً" },
  badMethod: { zh: "不支持的支付方式", en: "Unsupported payment method", de: "Zahlungsmethode nicht unterstützt", ru: "Способ оплаты не поддерживается", tr: "Ödeme yöntemi desteklenmiyor", uk: "Спосіб оплати не підтримується", pl: "Nieobsługiwana metoda płatności", ro: "Metodă de plată neacceptată", vi: "Phương thức thanh toán không được hỗ trợ", ar: "طريقة الدفع غير مدعومة" },
  methodOff: { zh: "这个支付方式还没开通，请换一个", en: "This payment method isn't enabled yet, please pick another", de: "Diese Zahlungsmethode ist noch nicht aktiv, bitte wähle eine andere", ru: "Этот способ оплаты пока не включён, выберите другой", tr: "Bu ödeme yöntemi henüz açık değil, lütfen başka birini seçin", uk: "Цей спосіб оплати ще не ввімкнено, виберіть інший", pl: "Ta metoda płatności nie jest jeszcze włączona, wybierz inną", ro: "Această metodă de plată nu este încă activată, alege alta", vi: "Phương thức này chưa được bật, vui lòng chọn cách khác", ar: "طريقة الدفع هذه غير مفعّلة بعد، اختر طريقة أخرى" },
  noOrder: { zh: "缺少订单信息", en: "Missing order info", de: "Bestellinformationen fehlen", ru: "Нет данных о заказе", tr: "Sipariş bilgisi eksik", uk: "Немає даних про замовлення", pl: "Brakuje informacji o zamówieniu", ro: "Lipsesc informațiile comenzii", vi: "Thiếu thông tin đơn hàng", ar: "معلومات الطلب مفقودة" },
  queryFail: { zh: "订单查询失败", en: "Order lookup failed", de: "Abfrage der Bestellung fehlgeschlagen", ru: "Не удалось проверить заказ", tr: "Sipariş sorgulanamadı", uk: "Не вдалося перевірити замовлення", pl: "Nie udało się sprawdzić zamówienia", ro: "Verificarea comenzii a eșuat", vi: "Không tra được đơn hàng", ar: "تعذّر الاستعلام عن الطلب" },
  notPaid: { zh: "尚未支付", en: "Not paid yet", de: "Noch nicht bezahlt", ru: "Пока не оплачено", tr: "Henüz ödenmedi", uk: "Ще не оплачено", pl: "Jeszcze nie opłacone", ro: "Încă neplătit", vi: "Chưa thanh toán", ar: "لم يتم الدفع بعد" },
  mismatch: { zh: "订单与账号不匹配", en: "Order doesn't match this account", de: "Bestellung passt nicht zu diesem Konto", ru: "Заказ не совпадает с аккаунтом", tr: "Sipariş bu hesapla eşleşmiyor", uk: "Замовлення не відповідає цьому акаунту", pl: "Zamówienie nie pasuje do tego konta", ro: "Comanda nu corespunde acestui cont", vi: "Đơn hàng không khớp với tài khoản này", ar: "الطلب لا يطابق هذا الحساب" },
  createFail: { zh: "Stripe 创建订单失败", en: "Could not create the Stripe order", de: "Stripe-Bestellung konnte nicht erstellt werden", ru: "Не удалось создать заказ Stripe", tr: "Stripe siparişi oluşturulamadı", uk: "Не вдалося створити замовлення Stripe", pl: "Nie udało się utworzyć zamówienia Stripe", ro: "Nu s-a putut crea comanda Stripe", vi: "Không tạo được đơn Stripe", ar: "تعذّر إنشاء طلب Stripe" },
};
function payLang(b) { return String((b && (b.lang || b.locale)) || "").trim().toLowerCase(); }
function payErr(b, key) {
  const m = PAY_ERR[key] || null;
  if (!m) return key;
  const l = payLang(b);
  return m[l] || m.zh;
}

/* ---------- Google ID token verification (RS256 against Google JWKS) ---------- */
const b64u = (str) => Uint8Array.from(atob(str.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
let JWKS_CACHE = { at: 0, keys: [] };
async function googleKeys() {
  if (Date.now() - JWKS_CACHE.at < 3600e3 && JWKS_CACHE.keys.length) return JWKS_CACHE.keys;
  const r = await fetch("https://www.googleapis.com/oauth2/v3/certs");
  const j = await r.json();
  JWKS_CACHE = { at: Date.now(), keys: j.keys || [] };
  return JWKS_CACHE.keys;
}
async function verifyGoogle(idToken, clientId) {
  const parts = String(idToken || "").split(".");
  if (parts.length !== 3) throw new Error("bad token");
  const header = JSON.parse(new TextDecoder().decode(b64u(parts[0])));
  const payload = JSON.parse(new TextDecoder().decode(b64u(parts[1])));
  if (clientId && payload.aud !== clientId) throw new Error("audience mismatch");
  if (payload.exp * 1000 < Date.now()) throw new Error("expired");
  if (!["accounts.google.com", "https://accounts.google.com"].includes(payload.iss)) throw new Error("issuer");
  const jwk = (await googleKeys()).find(k => k.kid === header.kid);
  if (!jwk) throw new Error("unknown key");
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64u(parts[2]),
    new TextEncoder().encode(parts[0] + "." + parts[1]));
  if (!ok) throw new Error("bad signature");
  return payload;
}
/* PBKDF2 迭代次数：免费版 Workers 每次调用只有 10ms CPU，100k 次迭代会超限。
 * 新密码用 PBKDF2_ITERS；老记录没写 iters 字段，按 LEGACY_ITERS 校验，登录成功时顺手升级。 */
const PBKDF2_ITERS = 25000;
const LEGACY_ITERS = 100000;
const pwIters = (u) => { const n = parseInt(u && u.iters, 10); return n > 0 ? n : LEGACY_ITERS; };
async function hashPw(pw, salt, iters = PBKDF2_ITERS) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(pw), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: enc.encode(salt), iterations: iters, hash: "SHA-256" }, key, 256);
  return btoa(String.fromCharCode(...new Uint8Array(bits)));
}
/* 定长字符串常量时间比较（防时序侧信道） */
function ctEq(a, b) {
  a = String(a || ""); b = String(b || "");
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
/* webhook 时间戳容忍窗口（秒），防重放；PADDLE/STRIPE_WEBHOOK_TOLERANCE 可覆盖默认 300s */
function webhookFresh(ts, tolerance) {
  const win = Number(tolerance) > 0 ? Number(tolerance) : 300;
  return Number.isFinite(Number(ts)) && Math.abs(Date.now() / 1000 - Number(ts)) <= win;
}
/* 已扣款成功的 Paddle 订单状态。billed = 手动账单已开票待付款，不算付款 */
const PAID_TXN_STATUS = ["completed", "paid"];
async function hmacHex(secret, msg) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
}

/* ---------- users ---------- */
async function getUser(env, name) {
  const raw = await env.DTT.get("user:" + String(name).toLowerCase());
  return raw ? JSON.parse(raw) : null;
}
async function saveUser(env, u) {
  await env.DTT.put("user:" + u.name.toLowerCase(), JSON.stringify(u));
  await env.DTT.put("tok:" + u.token, u.name.toLowerCase());
  await env.DTT.put("uid:" + u.uid, u.name.toLowerCase());
}
async function userByToken(env, token) {
  if (!token) return null;
  const name = await env.DTT.get("tok:" + token);
  return name ? getUser(env, name) : null;
}
async function userByUid(env, uid) {
  if (!uid) return null;
  const name = await env.DTT.get("uid:" + uid);
  return name ? getUser(env, name) : null;
}
function unlocked(env, code) {
  if (!code) return false;
  return String(env.UNLOCK_CODES || "").split(",").map(s => s.trim()).filter(Boolean).includes(code);
}
async function markPaid(env, uid, txn) {
  const u = await userByUid(env, uid);
  if (!u) return false;
  u.unlimited = true;
  u.paidAt = Date.now();
  /* 记下 Paddle 的客户与地址：建单时同时带上这两个 id，结账页的"邮箱 + 国家"表单会整个消失，
     直接进付款页（2026-09-19 沙盒实测）。复购不该再让人填一遍。 */
  if (txn && txn.customer_id) u.paddleCustomer = txn.customer_id;
  if (txn && txn.address_id) u.paddleAddress = txn.address_id;
  await saveUser(env, u);
  return true;
}

/* ---------- 做题进度云同步（只收 B 照） ----------
   只同步 q（做题/错题/书签）+ notes（笔记文字）+ days（每日计数）+ goal；
   tr/ai 缓存不同步（纯本地加速，可重建）。非 B 照题号不上云（站长决定：
   只要 B 照 1264 题；非 B 进度与笔记只留本机 localStorage）。
   合并一律按时间戳/计数取新，多设备同时用也不会丢进度；
   reset/import 用 wipe 整包替换。 */
const PROG_MAX_BYTES = 262144, PROG_WRITE_MS = 5000;
const PROG_Q_MAX = 1600, PROG_NOTES_MAX = 500, PROG_NOTE_MAX = 2000;
const PROG_NOTE_BUDGET = 1024;   // 每人笔记总上限 1KB（UTF-8 字节）；按 at 从新到旧装，装不下旧的被顶掉
const numOr = (v, d) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
function progQidOk(id) { return qidOk(id) && String(id).length <= 64; }
// B 照判定（与前端 isClassB 同口径，Teil 1 或 Zusatzstoff 1xx 即 B 照；
// 格式对不上的未知题号按同步处理，宁可多存不丢进度）
function progIsB(id) {
  const m = /^([0-9.]+)-(\d+)/.exec(String(id || ""));
  if (!m) return true;
  return m[1].charAt(0) === "1" || m[2].charAt(0) === "1";
}
function cleanQ(v) {
  if (!v || typeof v !== "object") return null;
  const o = { a: Math.max(0, Math.min(1e6, Math.floor(numOr(v.a, 0)))),
    w: Math.max(0, Math.min(1e6, Math.floor(numOr(v.w, 0)))),
    r: Math.max(0, Math.min(1e6, Math.floor(numOr(v.r, 0)))),
    at: Math.max(0, Math.min(Date.now() + 864e5, Math.floor(numOr(v.at, 0)))) };
  if (v.last === true) o.last = true;    // false 不存：2413 全量可省约 30KB，读侧按缺省=false 处理
  if (v.wrong === true) o.wrong = true;
  if (v.bm === true) o.bm = true;
  return o;
}
function utf8len(s) { try { return new TextEncoder().encode(String(s)).length; } catch (e) { return String(s).length; } }
function utf8cut(s, n) {   // 按字节截断；尾部不完整序列由 TextDecoder 换成 U+FFFD
  s = String(s);
  if (utf8len(s) <= n) return s;
  try { return new TextDecoder().decode(new TextEncoder().encode(s).slice(0, n)); }
  catch (e) { return s.slice(0, n); }
}
// 笔记总预算：按 at 从新到旧装，遇到装不下的就停（旧的被顶掉）；
// 最新一条本身超标也保留（截断到预算），因为新内容优先。
function fitNotes(notes) {
  const ks = Object.keys(notes || {}).sort((a, b) => ((notes[b] && notes[b].at | 0) - (notes[a] && notes[a].at | 0)));
  const out = {}; let used = 0;
  for (const k of ks) {
    const e = notes[k]; if (!e || !e.text) continue;
    if (used + utf8len(e.text) <= PROG_NOTE_BUDGET) { out[k] = { text: String(e.text), at: e.at | 0 }; used += utf8len(e.text); continue; }
    if (used === 0) out[k] = { text: utf8cut(e.text, PROG_NOTE_BUDGET), at: e.at | 0 };
    break;
  }
  return out;
}
function cleanNote(v) {
  if (!v || typeof v !== "object") return null;
  const text = cleanText(v.text).slice(0, PROG_NOTE_MAX);
  return { text, at: Math.max(0, Math.min(Date.now() + 864e5, Math.floor(numOr(v.at, 0)))) };
}
function cleanProg(b) {
  if (!b || typeof b !== "object") return null;
  const q = {}, notes = {}, days = {};
  let n = 0;
  for (const k of Object.keys(b.q || {})) {
    if (n >= PROG_Q_MAX || !progQidOk(k) || !progIsB(k)) continue;   // 非 B 照不上云
    const c = cleanQ(b.q[k]); if (!c) continue;
    if (!c.a && !c.w && !c.r && !c.wrong && !c.bm) continue;   // 空条目不存，省体积
    q[k] = c; n++;
  }
  n = 0;
  for (const k of Object.keys(b.notes || {})) {
    if (n >= PROG_NOTES_MAX || !progQidOk(k) || !progIsB(k)) continue;   // 非 B 照不上云
    const c = cleanNote(b.notes[k]); if (!c) continue;
    notes[k] = c; n++;
  }
  for (const k of Object.keys(b.days || {})) {
    if (!/^\d{4}-\d{1,2}-\d{1,2}$/.test(k)) continue;
    days[k] = Math.max(0, Math.min(1e6, Math.floor(numOr(b.days[k], 0))));
  }
  return { q, notes: fitNotes(notes), days, goal: Math.max(1, Math.min(1000, Math.floor(numOr(b.goal, 20)))),
    savedAt: Math.max(0, Math.min(Date.now() + 864e5, Math.floor(numOr(b.savedAt, 0)))) };
}
function mergeProg(base, inc) {
  const out = { q: {}, notes: {},
    days: { ...(base.days || {}) }, goal: base.goal || 20, savedAt: base.savedAt || 0 };
  for (const k of Object.keys(base.q || {})) if (progIsB(k)) out.q[k] = base.q[k];   // 存量非 B 顺手 GC
  for (const k of Object.keys(base.notes || {})) if (progIsB(k)) out.notes[k] = base.notes[k];
  for (const k of Object.keys(inc.q || {})) {
    if (!progIsB(k)) continue;
    const o = out.q[k], c = inc.q[k];
    if (!o || (c.at || 0) >= (o.at || 0)) out.q[k] = c;
  }
  for (const k of Object.keys(inc.notes || {})) {
    if (!progIsB(k)) continue;
    const o = out.notes[k], c = inc.notes[k];
    if (!o || (c.at || 0) >= (o.at || 0)) out.notes[k] = c;
  }
  for (const k of Object.keys(inc.days || {})) out.days[k] = Math.max(out.days[k] || 0, inc.days[k]);
  if ((inc.savedAt || 0) >= (out.savedAt || 0)) { out.goal = inc.goal || out.goal; out.savedAt = inc.savedAt; }
  out.notes = fitNotes(out.notes);   // 合并路径也封顶，否则两边各写半边能绕过预算
  return out;
}
async function getProg(env, uid) {
  try { const raw = await env.DTT.get("prog:" + uid); return raw ? JSON.parse(raw) : null; }
  catch (e) { return null; }
}

/* ---------- admin（站长后台） ---------- */
const ADMIN_TTL_MS = 12 * 3600 * 1000;
const adminSig = (env, exp) => hmacHex(env.ADMIN_PASSWORD, "admin|" + exp);
async function adminOk(env, req) {
  if (!env.ADMIN_PASSWORD) return false;
  const m = /^(\d+)\.([0-9a-f]{64})$/.exec(req.headers.get("x-admin-token") || "");
  if (!m) return false;
  const exp = parseInt(m[1], 10);
  if (!(exp > Date.now())) return false;
  return ctEq(await adminSig(env, exp), m[2]);
}
const pubUser = (u) => ({
  name: u.name, email: u.email || "", uid: u.uid, left: u.left || 0,
  unlimited: u.unlimited === true, google: !!u.google, paid: !!u.paidAt,
  created: u.created || 0, paidAt: u.paidAt || 0,
});
/* 分页把 KV 里所有 user: 前缀的账号捞出来（后台数据量小，够用） */
async function listAllUsers(env, cursor) {
  const out = [];
  let cur = cursor || undefined;
  for (let i = 0; i < 10; i++) {
    const page = await env.DTT.list({ prefix: "user:", limit: 200, cursor: cur });
    for (const k of page.keys) {
      const raw = await env.DTT.get(k.name);
      if (!raw) continue;
      try { out.push(JSON.parse(raw)); } catch (e) { /* 跳过坏记录 */ }
    }
    cur = page.list_complete ? null : page.cursor;
    if (!cur) break;
  }
  return { users: out, cursor: cur || null };
}

/* ---------- payment providers ---------- */
const paddleBase = (env) => (String(env.PADDLE_ENV || "live").toLowerCase() === "sandbox"
  ? "https://sandbox-api.paddle.com" : "https://api.paddle.com");
function price(env) {
  return {
    cents: parseInt(env.PRICE_CENTS || "500", 10),
    currency: String(env.PRICE_CURRENCY || "eur").toLowerCase(),
    name: env.PRICE_NAME || "Unlimited AI (one-off)",
  };
}
/* Stripe 各支付方式的开关以 Dashboard 的 payment method configuration 为准 ——
   那是后台"支付方式"页实际读写的东西。`GET /v1/account` 的 capabilities 根本不列
   paypal（2026-09-20 实测：后台已启用，capabilities 全量里连这个键都没有），
   按它探测会把"已开通"误报成"没开通"。没开通就把方式写进按钮等于许诺一个付不了的方式。
   2026-09-20 live 实测：强制 payment_method_types 开单，card/paypal 成功；
   alipay（EUR 和 CNY 都试过）和 wechat_pay（EUR/CNY，加 client=web 也试过）都被 API 拒绝，
   因为后台还是"待批准"（available:false）。所以按钮必须按这个探测门控：批了才出现。
   探测一次缓存 10 分钟；可用 STRIPE_PAYPAL=on/off 直接指定 PayPal。 */
/* 缓存挂 globalThis：Worker 同 isolate 内跨请求复用；本地测试同进程可直接清零重查。 */
const stripePaypalCache = (globalThis.__dttStripePaypalCache || (globalThis.__dttStripePaypalCache = { at: 0, ok: false, methods: null }));
function stripeMethodOn(entry) {
  const e = entry || {};
  const disp = e.display_preference || {};
  return e.available === true && String(disp.value || "") === "on";
}
async function stripeMethods(env) {
  const forced = String(env.STRIPE_PAYPAL || "").trim().toLowerCase();
  const now = Date.now();
  if (now - stripePaypalCache.at < 600000 && stripePaypalCache.methods) {
    const m = Object.assign({}, stripePaypalCache.methods);
    if (forced === "on" || forced === "true") m.paypal = true;
    if (forced === "off" || forced === "false") m.paypal = false;
    return m;
  }
  let m = { card: false, paypal: false, alipay: false, wechat_pay: false };
  if (env.STRIPE_SECRET_KEY) {
    try {
      const r = await fetch("https://api.stripe.com/v1/payment_method_configurations?limit=100", {
        headers: { authorization: "Bearer " + env.STRIPE_SECRET_KEY },
      });
      if (r.ok) {
        const j = await r.json();
        const list = (j && j.data) || [];
        const cfg = list.find((c) => c && c.is_default) || list.find((c) => c && c.active) || list[0] || {};
        m = { card: stripeMethodOn(cfg.card), paypal: stripeMethodOn(cfg.paypal),
              alipay: stripeMethodOn(cfg.alipay), wechat_pay: stripeMethodOn(cfg.wechat_pay) };
      }
    } catch (e) { /* 探测失败就全关，前端不许诺 */ }
  }
  stripePaypalCache.at = now; stripePaypalCache.methods = m; stripePaypalCache.ok = m.paypal;
  if (forced === "on" || forced === "true") m = Object.assign({}, m, { paypal: true });
  if (forced === "off" || forced === "false") m = Object.assign({}, m, { paypal: false });
  return m;
}
async function stripeHasPaypal(env) {
  return (await stripeMethods(env)).paypal;
}
function payMethods(env) {
  return {
    stripe: !!env.STRIPE_SECRET_KEY,
    paddle: !!(env.PADDLE_API_KEY && env.PADDLE_PRICE_ID),
  };
}

/* Paddle 的微信只在中国 + 交易币种 CNY/USD 时才出现（官方 Countries: CN / Currencies: CNY, USD /
   Platforms: Desktop），沿用商品里的 EUR 就永远看不到。所以按访客国家给这笔交易挑币种。
   映射可配 PADDLE_LOCAL_CURRENCIES="CN:CNY,US:USD"；返回 "" 表示不指定、沿用价格币种。 */
/* 买家自己点"微信支付"时前端会点名要币种，不能只按 IP 猜 —— 中国人常挂欧洲 VPN，IP 是德国的但要用微信。
   只放行 Paddle 微信支持的币种（官方 Currencies: CNY, USD），其余一律忽略，避免被拿来开没配过的币种。 */
function wechatCurrencies(env) {
  return String(env.PADDLE_WECHAT_CURRENCIES || "CNY,USD")
    .split(",").map((x) => x.trim().toUpperCase()).filter(Boolean);
}
function paddleCurrency(env, req, asked) {
  const ask = String(asked || "").trim().toUpperCase();
  if (ask && wechatCurrencies(env).indexOf(ask) >= 0) return ask;   // 买家主动选的币种优先
  const want = String((req && req.cf && req.cf.country) || "").toUpperCase();
  if (!want) return "";
  const map = {};
  String(env.PADDLE_LOCAL_CURRENCIES || "CN:CNY").split(",").forEach((pair) => {
    const kv = pair.split(":").map((x) => String(x).trim().toUpperCase());
    if (kv.length === 2 && kv[0] && kv[1]) map[kv[0]] = kv[1];
  });
  return map[want] || "";
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    const site = String(env.SITE_URL || url.origin).replace(/\/$/, "");

    /* ---------- register ---------- */
    if (url.pathname === "/api/register" && req.method === "POST") {
      const b = await req.json().catch(() => ({}));
      const email = String(b.email || "").trim().toLowerCase();
      const pw = String(b.password || "");
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "请输入有效的邮箱" }, 400);
      if (pw.length < 6) return json({ error: "密码至少 6 位" }, 400);
      if (await getUser(env, email)) return json({ error: "该邮箱已注册，请直接登录" }, 409);
      const salt = rid() + rid();
      const u = { name: email, email, salt, hash: await hashPw(pw, salt), iters: PBKDF2_ITERS, uid: "u" + rid(),
                  token: "t" + rid() + rid(), left: parseInt(env.FREE_TRIES || "10", 10), created: Date.now() };
      await saveUser(env, u);
      return json({ user: u.name, uid: u.uid, token: u.token, left: u.left, created: true });
    }

    /* ---------- login ---------- */
    if (url.pathname === "/api/login" && req.method === "POST") {
      const b = await req.json().catch(() => ({}));
      const email = String(b.email || "").trim().toLowerCase();
      const pw = String(b.password || "");
      const nick = String(b.name || "").trim();
      const id = email || nick;
      if (!id) return json({ error: "请填邮箱" }, 400);
      let u = await getUser(env, id);
      if (pw) {
        if (!u || !u.hash || !u.salt) return json({ error: "邮箱或密码不正确" }, 401);
        if (!ctEq(await hashPw(pw, u.salt, pwIters(u)), u.hash)) return json({ error: "邮箱或密码不正确" }, 401);
        /* 老记录用 100k 迭代，登录成功时按新参数重算，逐步降本 */
        if (pwIters(u) !== PBKDF2_ITERS) { u.hash = await hashPw(pw, u.salt, PBKDF2_ITERS); u.iters = PBKDF2_ITERS; }
      } else if (!u) {
        u = { name: id, uid: "u" + rid(), token: "t" + rid() + rid(), left: parseInt(env.FREE_TRIES || "10", 10), created: Date.now() };
      }
      if (!u.token) u.token = "t" + rid() + rid();
      await saveUser(env, u);
      return json({ user: u.name, uid: u.uid, token: u.token, left: u.left, unlimited: u.unlimited === true });
    }

    /* ---------- Google sign-in ---------- */
    if (url.pathname === "/api/google" && req.method === "POST") {
      const b = await req.json().catch(() => ({}));
      let p;
      try { p = await verifyGoogle(b.credential, env.GOOGLE_CLIENT_ID); }
      catch (e) { return json({ error: "Google 登录校验失败：" + e.message }, 401); }
      const id = "g:" + p.sub;
      let u = await getUser(env, id);
      if (!u) {
        u = { name: p.email || p.name || id, email: p.email || "", google: p.sub, uid: "u" + rid(),
              token: "t" + rid() + rid(), left: parseInt(env.FREE_TRIES || "10", 10), created: Date.now() };
        await saveUser(env, u);
      }
      if (!u.token) u.token = "t" + rid() + rid();
      await saveUser(env, u);
      return json({ user: u.name, uid: u.uid, token: u.token, left: u.left, unlimited: u.unlimited === true, google: true });
    }

    /* ---------- me ---------- */
    if (url.pathname === "/api/me") {
      const u = await userByToken(env, bearer(req));
      if (!u) return json({ error: "unauthorized" }, 401);
      return json({ user: u.name, uid: u.uid, left: u.left, unlimited: u.unlimited === true });
    }

    /* ---------- 做题进度：拉取 ---------- */
    if (url.pathname === "/api/progress" && req.method === "GET") {
      const u = await userByToken(env, bearer(req));
      if (!u) return json({ error: "unauthorized" }, 401);
      return json({ progress: (await getProg(env, u.uid)) || null });
    }
    /* ---------- 做题进度：合并写入（5 秒内重复写 429，省 KV 写入次数） ---------- */
    if (url.pathname === "/api/progress" && req.method === "POST") {
      const u = await userByToken(env, bearer(req));
      if (!u) return json({ error: "unauthorized" }, 401);
      const b = await req.json().catch(() => null);
      const inc = cleanProg(b);
      if (!inc) return json({ error: "bad progress" }, 400);
      const cur = (await getProg(env, u.uid)) || { q: {}, notes: {}, days: {}, goal: 20, savedAt: 0 };
      if (b && b.wipe === true) {
        inc.savedAt = Math.max(inc.savedAt, Date.now());
        if (JSON.stringify(inc).length > PROG_MAX_BYTES) return json({ error: "progress too large" }, 413);
        await env.DTT.put("prog:" + u.uid, JSON.stringify({ ...inc, writtenAt: Date.now() }));
        return json({ ok: true, progress: inc });
      }
      if (cur.writtenAt && Date.now() - cur.writtenAt < PROG_WRITE_MS) {
        const merged = mergeProg(cur, inc);
        return json({ ok: true, throttled: true, progress: merged });
      }
      const merged = mergeProg(cur, inc);
      if (JSON.stringify(merged).length > PROG_MAX_BYTES) return json({ error: "progress too large" }, 413);
      await env.DTT.put("prog:" + u.uid, JSON.stringify({ ...merged, writtenAt: Date.now() }));
      return json({ ok: true, progress: merged });
    }

    /* ---------- which payment methods are live ---------- */
    if (url.pathname === "/api/pay-methods") {
      const pm = payMethods(env);
      // paddle_token 给前端初始化 Paddle.js（test_/live_ 前缀自带环境）；没配就留空，前端退回跳转
      // paddle_currency 非空 = 这个访客会被按当地币种结算（如 CN → CNY，微信才会出现），前端据此改价格口径
      const sm = pm.stripe ? await stripeMethods(env) : { card: false, paypal: false, alipay: false, wechat_pay: false };
      return json({ providers: pm, price: price(env),
                    paddle_token: pm.paddle ? String(env.PADDLE_CLIENT_TOKEN || "") : "",
                    paddle_currency: pm.paddle ? paddleCurrency(env, req) : "",
                    paddle_wechat_currencies: pm.paddle ? wechatCurrencies(env) : [],
                    stripe_paypal: sm.paypal, stripe_methods: sm });
    }

    /* ---------- Stripe: create Checkout session ---------- */
    if (url.pathname === "/api/checkout" && req.method === "POST") {
      const u = await userByToken(env, bearer(req));
      const b0 = await req.json().catch(() => ({}));
      if (!u) return json({ error: payErr(b0, "needLogin") }, 401);
      if (!env.STRIPE_SECRET_KEY) return json({ error: "未配置收款（STRIPE_SECRET_KEY）" }, 500);
      const p = price(env);
      const b = b0;
      // 前端四个按钮各带各的 method：没通过上面探测的方式点进来，后端直接拦，不让 Stripe 报错吓人。
      const want = String((b && b.method) || "").trim().toLowerCase();
      const allow = want === "" ? null : { card: "card", paypal: "paypal", alipay: "alipay", wechat_pay: "wechat_pay", wechat: "wechat_pay" }[want];
      if (want !== "" && !allow) return json({ error: payErr(b, "badMethod") }, 400);
      if (allow) {
        const sm = await stripeMethods(env);
        const key = allow === "card" ? "card" : allow;
        if (!sm[key]) return json({ error: payErr(b, "methodOff") }, 400);
      }
      const f = new URLSearchParams();
      f.set("mode", "payment");
      f.set("locale", stripeLocale((b && (b.locale || b.lang)) || "auto"));
      if (allow) {
        f.set("payment_method_types[0]", allow);
        if (allow === "wechat_pay") f.set("payment_method_options[wechat_pay][client]", "web");
      }
      f.set("client_reference_id", u.uid);
      f.set("success_url", site + "/?dtt_paid=1&session_id={CHECKOUT_SESSION_ID}");
      f.set("cancel_url", site);
      f.set("line_items[0][quantity]", "1");
      f.set("line_items[0][price_data][currency]", p.currency);
      f.set("line_items[0][price_data][unit_amount]", String(p.cents));
      f.set("line_items[0][price_data][product_data][name]", p.name);
      const r = await fetch("https://api.stripe.com/v1/checkout/sessions", {
        method: "POST",
        headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, "content-type": "application/x-www-form-urlencoded" },
        body: f,
      });
      const j = await r.json();
      if (!r.ok) return json({ error: (j.error && j.error.message) || payErr(b, "createFail") }, 502);
      return json({ provider: "stripe", url: j.url, id: j.id });
    }

    /* ---------- Stripe: verify session → unlock ---------- */
    if (url.pathname === "/api/verify-payment" && req.method === "POST") {
      const u = await userByToken(env, bearer(req));
      const b = await req.json().catch(() => ({}));
      if (!u) return json({ error: payErr(b, "needLogin") }, 401);
      const sid = String(b.session_id || "");
      if (!sid || !env.STRIPE_SECRET_KEY) return json({ error: payErr(b, "noOrder") }, 400);
      const r = await fetch("https://api.stripe.com/v1/checkout/sessions/" + encodeURIComponent(sid), {
        headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY}` },
      });
      const j = await r.json();
      if (!r.ok) return json({ error: payErr(b, "queryFail") }, 502);
      if (j.payment_status !== "paid") return json({ error: payErr(b, "notPaid") }, 402);
      if (j.client_reference_id && j.client_reference_id !== u.uid) return json({ error: payErr(b, "mismatch") }, 403);
      u.unlimited = true;
      u.paidAt = Date.now();
      await saveUser(env, u);
      return json({ ok: true, unlimited: true, user: u.name, provider: "stripe" });
    }

    /* ---------- Paddle: create transaction → hosted checkout url ---------- */
    if (url.pathname === "/api/paddle/checkout" && req.method === "POST") {
      const u = await userByToken(env, bearer(req));
      const body0 = await req.json().catch(() => ({}));
      if (!u) return json({ error: payErr(body0, "needLogin") }, 401);
      if (!env.PADDLE_API_KEY || !env.PADDLE_PRICE_ID) return json({ error: "未配置收款（PADDLE_API_KEY / PADDLE_PRICE_ID）" }, 500);
      const body = body0;
      const asked = String((body && body.currency) || "").trim().toUpperCase();
      const cur = paddleCurrency(env, req, asked);
      /* 传了 address_id 结账页会直接跳到付款步骤，连国家一起钉死。
         点名要微信的人必须还能把国家改成中国，所以这种情况下只填邮箱、不填地址。 */
      const keepAddress = !(asked && wechatCurrencies(env).indexOf(asked) >= 0);
      const r = await fetch(paddleBase(env) + "/transactions", {
        method: "POST",
        headers: { authorization: `Bearer ${env.PADDLE_API_KEY}`, "content-type": "application/json" },
        body: JSON.stringify({
          items: [{ price_id: env.PADDLE_PRICE_ID, quantity: 1 }],
          custom_data: { uid: u.uid },
          checkout: { url: site + "/?dtt_paid=1&provider=paddle" },
          ...(cur ? { currency_code: cur } : {}),   // 不指定时 Paddle 沿用价格里的币种
          // 老买家直接进付款页；只有两个 id 都在时才传（少一个 Paddle 会报错）
          ...(u.paddleCustomer ? { customer_id: u.paddleCustomer } : {}),
          ...(keepAddress && u.paddleCustomer && u.paddleAddress ? { address_id: u.paddleAddress } : {})
        }),
      });
      const j = await r.json();
      if (!r.ok) return json({ error: (j.error && j.error.detail) || (j.error && j.error.code) || "Paddle 创建订单失败" }, 502);
      const tx = j.data || {};
      const href = tx.checkout && tx.checkout.url;
      if (!href) return json({ error: "Paddle 未返回支付链接" }, 502);
      return json({ provider: "paddle", url: href, id: tx.id,
                    currency: String(tx.currency_code || cur || "").toUpperCase() });
    }

    /* ---------- Paddle: verify transaction → unlock ---------- */
    if (url.pathname === "/api/paddle/verify" && req.method === "POST") {
      const u = await userByToken(env, bearer(req));
      const b = await req.json().catch(() => ({}));
      if (!u) return json({ error: payErr(b, "needLogin") }, 401);
      const id = String(b.transaction_id || b.txn || "");
      if (!id || !env.PADDLE_API_KEY) return json({ error: payErr(b, "noOrder") }, 400);
      const r = await fetch(paddleBase(env) + "/transactions/" + encodeURIComponent(id), {
        headers: { authorization: `Bearer ${env.PADDLE_API_KEY}` },
      });
      const j = await r.json();
      if (!r.ok) return json({ error: payErr(b, "queryFail") }, 502);
      const tx = j.data || {};
      if (!PAID_TXN_STATUS.includes(String(tx.status))) return json({ error: payErr(b, "notPaid") }, 402);
      const uid = tx.custom_data && tx.custom_data.uid;
      if (uid && uid !== u.uid) return json({ error: payErr(b, "mismatch") }, 403);
      u.unlimited = true;
      u.paidAt = Date.now();
      if (tx.customer_id) u.paddleCustomer = tx.customer_id;
      if (tx.address_id) u.paddleAddress = tx.address_id;
      await saveUser(env, u);
      return json({ ok: true, unlimited: true, user: u.name, provider: "paddle" });
    }

    /* ---------- Stripe webhook（可选，后台补刀） ---------- */
    if (url.pathname === "/api/stripe/webhook" && req.method === "POST") {
      const raw = await req.text();
      const stripeSecrets = [env.STRIPE_WEBHOOK_SECRET, env.STRIPE_WEBHOOK_SECRET_TEST].filter(Boolean);
      // fail closed：没装签名密钥时任何事件都不可信，否则伪造 POST 就能白嫖解锁
      if (!stripeSecrets.length) return json({ error: "webhook not configured" }, 503);
      const shdr = req.headers.get("stripe-signature") || "";
      const st = (shdr.match(/t=(\d+)/) || [])[1];
      const v1 = (shdr.match(/v1=([0-9a-f]+)/) || [])[1];
      if (!st || !v1) return json({ error: "bad signature header" }, 400);
      let good = false;
      for (const sec of stripeSecrets) { if (ctEq(await hmacHex(sec, st + "." + raw), v1)) { good = true; break; } }
      if (!good) return json({ error: "bad signature" }, 400);
      if (!webhookFresh(st, env.STRIPE_WEBHOOK_TOLERANCE)) return json({ error: "stale" }, 400);
      let ev = {};
      try { ev = JSON.parse(raw); } catch (e) { return json({ error: "bad json" }, 400); }
      const s = (ev.data && ev.data.object) || {};
      if (ev.type === "checkout.session.completed" && s.client_reference_id) await markPaid(env, s.client_reference_id);
      return json({ ok: true });
    }

    /* ---------- Paddle webhook（可选，后台补刀） ---------- */
    if (url.pathname === "/api/paddle/webhook" && req.method === "POST") {
      const raw = await req.text();
      // fail closed：没装签名密钥时任何事件都不可信，否则伪造 POST 就能白嫖解锁
      if (!env.PADDLE_WEBHOOK_SECRET) return json({ error: "webhook not configured" }, 503);
      const phdr = req.headers.get("paddle-signature") || "";
      const pt = (phdr.match(/ts=(\d+)/) || [])[1];
      // 轮换期 Paddle 会同时下发多个 h1（老/新 secret 各签一次），任意一个用当前 secret 验过即有效
      const h1s = [...phdr.matchAll(/h1=([0-9a-f]+)/g)].map(m => m[1]);
      if (!pt || !h1s.length) return json({ error: "bad signature header" }, 400);
      if (!webhookFresh(pt, env.PADDLE_WEBHOOK_TOLERANCE)) return json({ error: "stale" }, 400);
      const expect = await hmacHex(env.PADDLE_WEBHOOK_SECRET, pt + ":" + raw);
      if (!h1s.some(h => ctEq(expect, h))) return json({ error: "bad signature" }, 400);
      let ev = {};
      try { ev = JSON.parse(raw); } catch (e) { return json({ error: "bad json" }, 400); }
      const d = ev.data || {};
      const uid = d.custom_data && d.custom_data.uid;
      if (String(ev.event_type || "").startsWith("transaction.") && uid && PAID_TXN_STATUS.includes(String(d.status))) {
        await markPaid(env, uid, d);
      }
      return json({ ok: true });
    }

    /* ---------- unlock (fallback: code) ---------- */
    if (url.pathname === "/api/unlock" && req.method === "POST") {
      const u = await userByToken(env, bearer(req));
      if (!u) return json({ error: "请先登录" }, 401);
      const b = await req.json().catch(() => ({}));
      const code = String(b.code || "").trim();
      if (!unlocked(env, code)) return json({ error: "解锁码无效" }, 400);
      u.unlimited = true;
      await saveUser(env, u);
      return json({ ok: true, unlimited: true, user: u.name, left: u.left });
    }

    /* ---------- 站长后台页面 ---------- */
    if (url.pathname === "/admin" || url.pathname === "/admin/") {
      return new Response(ADMIN_HTML, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
    }

    /* ---------- admin: 登录换 token ---------- */
    if (url.pathname === "/api/admin/login" && req.method === "POST") {
      if (!env.ADMIN_PASSWORD) return json({ error: "服务端未设置 ADMIN_PASSWORD" }, 500);
      const b = await req.json().catch(() => ({}));
      if (!ctEq(String(b.password || ""), env.ADMIN_PASSWORD)) return json({ error: "密码不正确" }, 401);
      const exp = Date.now() + ADMIN_TTL_MS;
      return json({ token: exp + "." + await adminSig(env, exp), exp });
    }

    /* ---------- admin: 用户列表 ---------- */
    if (url.pathname === "/api/admin/users" && req.method === "GET") {
      if (!(await adminOk(env, req))) return json({ error: "unauthorized" }, 401);
      const got = await listAllUsers(env, url.searchParams.get("cursor"));
      const users = got.users.sort((a, b) => (b.created || 0) - (a.created || 0)).map(pubUser);
      return json({
        users, cursor: got.cursor,
        stats: {
          total: users.length,
          paid: users.filter(u => u.unlimited).length,
          leftSum: users.reduce((s, u) => s + (u.left || 0), 0),
        },
      });
    }

    /* ---------- admin: 改单个用户（剩余次数 / 付费状态） ---------- */
    if (url.pathname === "/api/admin/user" && req.method === "POST") {
      if (!(await adminOk(env, req))) return json({ error: "unauthorized" }, 401);
      const b = await req.json().catch(() => ({}));
      const u = await getUser(env, String(b.name || ""));
      if (!u) return json({ error: "用户不存在" }, 404);
      if (b.left !== undefined && b.left !== null && b.left !== "") {
        const n = parseInt(b.left, 10);
        if (!Number.isFinite(n)) return json({ error: "次数必须是数字" }, 400);
        u.left = Math.max(0, n);
      }
      if (typeof b.unlimited === "boolean") {
        u.unlimited = b.unlimited;
        if (b.unlimited) u.paidAt = u.paidAt || Date.now();
        else delete u.paidAt;
      }
      await saveUser(env, u);
      return json({ ok: true, user: pubUser(u) });
    }

    /* ---------- 留言板：每题讨论 + 回复线程 ----------
       存储（KV，无新绑定）：
         c:<qid>:<cid>   JSON {id,qid,parent,name,uid,ts,text}
         rl:<uid>        上次发言时间戳（60s TTL，20s 内禁连发）
       发言必须登录（Bearer 计到人，顺手防 spam）；查看公开；删除走站长后台。
       只做两层：对回复的回复自动并到顶层回复下（和小红书一样，一个回复下挂一串线程）。 */
    if (url.pathname === "/api/comments" && req.method === "GET") {
      const qid = String(url.searchParams.get("qid") || "");
      if (!qidOk(qid)) return json({ error: "bad qid" }, 400);
      const page = await env.DTT.list({ prefix: "c:" + qid + ":", limit: 200 });
      const out = [];
      for (const k of page.keys) {
        const raw = await env.DTT.get(k.name);
        if (!raw) continue;
        try {
          const c = JSON.parse(raw);
          out.push({ id: c.id, parent: c.parent || "", name: c.name, ts: c.ts, text: c.text });
        } catch (e) { /* 跳过坏记录 */ }
      }
      out.sort((a, b) => a.ts - b.ts);
      return json({ qid, comments: out, more: !page.list_complete });
    }
    if (url.pathname === "/api/comments" && req.method === "POST") {
      const u = await userByToken(env, bearer(req));
      if (!u) return json({ error: "请先登录" }, 401);
      const b = await req.json().catch(() => ({}));
      const qid = String(b.qid || "");
      const text = cleanText(b.text).slice(0, COMMENT_MAX);
      if (!qidOk(qid)) return json({ error: "题目不存在" }, 400);
      if (!text) return json({ error: "内容不能为空" }, 400);
      let parent = "";
      if (b.parent) {
        const praw = await env.DTT.get("c:" + qid + ":" + String(b.parent));
        if (!praw) return json({ error: "回复的留言不存在" }, 400);
        try {
          const pc = JSON.parse(praw);
          parent = pc.parent || pc.id;   // 对回复的回复：并到同一线程下，只留两层
        } catch (e) { return json({ error: "回复的留言不存在" }, 400); }
      }
      const last = await env.DTT.get("rl:" + u.uid);
      if (last && Date.now() - parseInt(last, 10) < COMMENT_WINDOW_MS)
        return json({ error: "发言太快，稍后再试" }, 429);
      const c = { id: "m" + rid(), qid, parent, name: u.name, uid: u.uid, ts: Date.now(), text };
      await env.DTT.put("c:" + qid + ":" + c.id, JSON.stringify(c));
      await env.DTT.put("rl:" + u.uid, String(c.ts), { expirationTtl: 60 });
      return json({ ok: true, comment: { id: c.id, parent: c.parent, name: c.name, ts: c.ts, text: c.text } });
    }
    /* ---------- admin: 删留言 ---------- */
    if (url.pathname === "/api/admin/comment" && req.method === "POST") {
      if (!(await adminOk(env, req))) return json({ error: "unauthorized" }, 401);
      const b = await req.json().catch(() => ({}));
      const qid = String(b.qid || ""), id = String(b.id || "");
      if (!qidOk(qid) || !/^[0-9A-Za-z]{1,24}$/.test(id)) return json({ error: "bad id" }, 400);
      const key = "c:" + qid + ":" + id;
      const existed = await env.DTT.get(key) !== null;
      if (existed) await env.DTT.delete(key);
      return json({ ok: true, deleted: existed });
    }

    /* ---------- AI proxy ---------- */
    if (url.pathname === "/v1/chat/completions" && req.method === "POST") {
      const token = bearer(req);
      const u = await userByToken(env, token);
      if (!u) return json({ error: { message: "需要登录" } }, 401);

      const unlimited = unlocked(env, token) || u.unlimited === true;
      if (!unlimited && u.left <= 0) return json({ error: { message: "免费次数已用完，请解锁" } }, 402);

      const body = await req.json().catch(() => ({}));
      body.model = body.model && body.model !== "auto" ? body.model : (env.UPSTREAM_MODEL || "gpt-4o-mini");
      body.stream = false;

      const r = await fetch((env.UPSTREAM_URL || "https://api.openai.com/v1") + "/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${env.UPSTREAM_KEY}` },
        body: JSON.stringify(body),
      });
      const text = await r.text();
      if (!r.ok) return new Response(text, { status: r.status, headers: { "content-type": "application/json", ...CORS } });

      if (!unlimited) { u.left = Math.max(0, u.left - 1); await saveUser(env, u); }
      const out = JSON.parse(text);
      out.dtt_left = u.left;
      out.dtt_unlimited = unlimited;
      return json(out);
    }

    return json({ error: "not found" }, 404);
  },
};
