# 德国驾照理论刷题 · German Theory Trainer

德国驾照理论考试刷题应用：分类刷题、错题本、笔记、AI 讲解、图片题与视频题，
**10 种界面语言**（下拉框切换，含阿拉伯语 RTL）+ 题目中/英/德显示切换，**AI 讲解语言跟随题目语言**。
学习进度存浏览器本地；账号、AI 额度、支付走 Cloudflare Worker 后端。线上：https://fahrtheorie.homes（当前 build v58）。

- 题库：官方目录（2025-04-01 版，2026 年 9 月仍为最新），默认只显示 **B 照 1264 题**，可切换「全部车型 2413 题」
- 单页应用，**无构建步骤**；前端纯静态（GitHub Pages），账号/AI/支付由 Cloudflare Worker + KV 提供（见 `../../dtt-backend/`）；学习进度仍只存用户浏览器
- 代码 MIT 开源；题库内容的版权见下方「版权与合规」（重要）

---

## 一分钟跑起来

**方式 A：直接打开**
双击 `index.html` 即可（数据以本地脚本加载，图片为相对路径）。

**方式 B：本地静态服务器（推荐，视频题也能用）**
```bash
cd <项目目录>
python3 /path/to/dtt_serve.py     # 见「本地增强服务」，带 /v1 AI 代理与 /media 视频代理
# 打开 http://127.0.0.1:8123/
```

**方式 C：部署到公网**（适合商用/分享）
把本目录当作静态站点上传即可：

| 平台 | 做法 | 备注 |
|---|---|---|
| Cloudflare Pages / Netlify / Vercel | 直接连接仓库或拖拽上传目录 | 免费额度足够；可绑自有域名 |
| GitHub Pages | 推到仓库 → Settings → Pages | 免费，静态 |
| 任意对象存储 + CDN | 上传目录，开启静态网站 | 注意设置正确 Content-Type |

> 站点体积约 **43 MB**（图片 + 题目/译文随站分发；251 个视频已迁独立仓库走 jsDelivr CDN，不占本站体积），在常见静态托管免费额度内。

---

## 架构与数据流（零存储成本的关键）

```
浏览器
 ├── data/questions.js   题库（德语原文 + 英文 + 正确答案 + 官方解释 + 图片/视频索引 + 主语）
 ├── data/zh.js          中文译文（题干 / 选项 / 官方解释 / 主语）+ 主题章节中文名
 ├── data/videos.js      251 道视频题的官方视频路径
 ├── assets/img/*.webp   769 张官方配图（本地）
 └── 用户数据（不经过任何服务器）
       ├── localStorage         做题记录 / 错题本 / 笔记 / 收藏 / 偏好 / AI 缓存
       ├── IndexedDB("dtt-img") 图片离线缓存（首次访问后从本地读，秒开）
       ├── IndexedDB("dtt-vid") 视频离线缓存（可选，约 400MB）
       └── 可选：本地 JSON 文件（File System Access API，自动写入）
```

**为什么不用买存储**：题目、图片随站点分发（CDN 免费额度内）；**每个用户的进度存在他自己的浏览器里**，
服务端不落任何数据。换设备/换浏览器时，用户用「导出/导入 JSON」或「数据文件」迁移。

---

## AI 讲解：两种模式（都可以不花服务器钱）

AI 面板**默认不生成**，点「让 AI 讲解这道题」才调用模型，结果**缓存**在本地。

1. **自带 Key（BYO）**：设置 → AI → 填任意 OpenAI 兼容接口 + Key。费用用户自理，你零成本。
2. **付费解锁（可选商业化）**：设置 → 支持与解锁 → 填「解锁密钥 + 解锁后的 AI 接口地址」。
   做法：用 **Cloudflare Worker**（免费额度）做一个小代理，里面存**你的** Key，校验密钥后转发。
   前端只拿到解锁密钥，拿不到你的 API Key。

最小代理示例（Cloudflare Worker，思路）：
```js
export default {
  async fetch(req, env) {
    const body = await req.json();
    const key = (req.headers.get("authorization") || "").replace("Bearer ", "");
    if (!(await env.LICENSES.get(key))) return new Response("unauthorized", { status: 401 });
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${env.OPENAI_KEY}` },
      body: JSON.stringify(body),
    });
    return new Response(r.body, { headers: { "content-type": "application/json", "access-control-allow-origin": "*" } });
  },
};
```
解锁密钥可用 **Stripe Payment Link / Gumroad / Lemon Squeezy** 售卖（一次性 €5），付款后发密钥。

**打赏**：设置 → 支持与解锁 → 上传收款二维码 / 填赞助链接，应用内「显示二维码」即可。


### 免费额度与「登录送 10 次」（需要 Worker 侧计数）

前端已经实现：未登录时点 AI → 弹出登录（邮箱/昵称即可）→ 得到 10 次免费额度；用完后弹解锁（€5）。
**但纯静态站点上的次数可以被清缓存重置**，真正可靠的计数必须在你的 AI 代理里做：

```js
// Cloudflare Worker（KV 存计数）——略
const id = req.headers.get("x-dtt-user") || "anon";
if (!licence || !(await env.KV.get("lic:" + licence))) {
  const used = parseInt((await env.KV.get("used:" + id)) || "0", 10);
  if (used >= 10) return new Response(JSON.stringify({ error: "quota" }), { status: 402 });
  await env.KV.put("used:" + id, String(used + 1));
}
```
前端每次调用都会带 `X-DTT-User`；把它接到真正登录（Clerk / Supabase Auth / Google 登录）后，
就能做到「登录送 10 次、按账号计数、不可重置」。

---

## 版权与合规（**商用前必读**）

- **代码**：本仓库代码以 **MIT** 授权，可自由使用、修改、再分发。
- **题库内容**：题目、答案、官方解释、图片、视频的版权属于 **TÜV | DEKRA arge tp 21**（官方目录权利方），
  本数据集整理自公开仓库。**这些内容不随代码一起授权。**
- 因此：
  - 「开源代码」没问题；**把题库数据一并公开分发（尤其收费）存在法律风险**。
  - 想商业化，建议走合规路线：与权利方/官方内容方取得授权，或只分发**代码 + 示例数据**，由使用者自行导入合法数据。
  - 或者把收费对象定位为**你自己的服务**（AI 代理额度、托管、更新维护），题库仍免费提供并附免责声明。
  - 本项目仅用于个人学习，请以官方最新题库与驾校教材为准。

---

## 目录结构

```
index.html            入口（外壳：顶栏 / 侧栏 / 移动底栏 / 视图容器）
styles.css            全部样式（设计令牌、明暗主题、响应式、弹窗）
app.js                应用逻辑（路由、刷题、错题本、笔记、模拟考试、设置、缓存、支持/解锁）
i18n.js               界面文案（10 个语言包：zh/en/de/ru/tr/uk/pl/ro/vi/ar，键名一一对齐）
ai.js                 AI 双引擎（离线讲解 + 可选大模型）
privacy.html          隐私政策（中/英）
terms.html            服务条款（中/英）
favicon.svg|png|ico   站点图标；apple-touch-icon.png 给 iOS
data/questions.js     题库数据
data/zh.js            中文译文 + 中文主语
data/videos.js        视频题路径索引
assets/img/*.webp     769 张官方配图
assets/fonts/*.woff2  自托管字体
tests/*.test.cjs      前端自测（startup / ai-lang / legal）
dtt_serve.py（可选）  本地增强服务：静态托管 + /v1 AI 代理 + /media 视频代理
```

## 修改指南

| 想改什么 | 改哪里 |
|---|---|
| 界面文案 / 翻译 | `i18n.js`（10 个语言包，键名必须逐个对齐；改完跑下面的自检命令） |
| 配色 / 圆角 / 间距 | `styles.css` 顶部 `:root` 与 `html[data-theme="dark"]` |
| 默认题库范围 / 语言 | `app.js` 里 `prefs` 的初始值（`scope` / `uiLang` / `contentLang`） |
| 题库内容 | 替换 `data/questions.js`（字段：`id/qd/qe/od/oe/ans/t/num/cd/ce/img/s/sd/th/ch/pt`） |
| 中文译文 | 替换 `data/zh.js`（`window.__ZH` / `__ZHTHEME` / `__ZHCHAP` / `__ZHSTEM`） |
| 视频路径 | `data/videos.js`（键=题号，值=相对 `/media/` 的路径） |
| AI 默认接口 | `ai.js` 的 `AI_DEFAULT` |
| 打赏/解锁入口 | 设置 → 支持与解锁（存于浏览器偏好，可写入 `app.js` 默认值） |

## 发布前自检

版本号是手工三件套，漏一处就会出现缓存与界面不一致：

1. `index.html` 里 7 处 `?v=NN`（stylesheet + 6 个 script）
2. `index.html` 侧栏 `rail-foot` 的 `build vNN`
3. `app.js` 设置页「关于」里的 `build vNN`

```bash
node --check app.js ai.js i18n.js
node tests/startup.test.cjs && node tests/ai-lang.test.cjs && node tests/legal.test.cjs

# 10 个语言包键数一致、无缺漏、无空值（legal.test.cjs 也覆盖这条）
node -e "global.window={};require('./i18n.js');var I=window.I18N,b=Object.keys(I.zh);Object.keys(I).forEach(function(l){var k=Object.keys(I[l]);console.log(l,k.length,'miss',b.filter(function(x){return !(x in I[l])}).length,'extra',k.filter(function(x){return !(x in I.zh)}).length)})"

git add -A && git commit -m "build vNN: ..." && git push origin main   # push 即上线 GitHub Pages
```

`tests/legal.test.cjs` 额外盯住：三件套版本号一致、两个法务页（隐私/条款）互相链接、
侧栏与首页页脚的法律链接、图标文件存在且被引用，以及**页面上不许再出现任何退款承诺**
（没有退款接口、也无法在退款后收回已解锁，所以这类文案一律不留）。

## 质量说明

- 状态覆盖：题库加载失败有错误态+重试；无题/无错题/无笔记有独立空态；AI 请求失败自动回退离线讲解。
- 响应式：≥768px 左侧导航；<768px 固定底部标签栏；断点 640 / 760 / 767。
- 无障碍：语义化标签、`aria-*`、键盘可达（←/→ 切题、1-4 选选项、Enter 提交）、可见焦点、`prefers-reduced-motion`。
- 离线：图片/视频可全量缓存到 IndexedDB，之后断网可用；学习数据可导出/导入或存本地文件。

## 许可

- 代码：MIT（见 `LICENSE`）
- 内容：见 `NOTICE`（版权不属于本项目，不随 MIT 授权）
