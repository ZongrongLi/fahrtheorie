# Project state snapshot

Snapshot date: 2026-09-18 (Europe/Berlin). Live build: **v58**.

## Where things live

| What | Location |
|---|---|
| Live site | https://fahrtheorie.homes (GitHub Pages) |
| Source repo | https://github.com/ZongrongLi/fahrtheorie (branch `main`) |
| Video assets | https://github.com/Zongrongli/fahrtheorie-media (branch `master`, 251 mp4, served via jsDelivr) |
| Backend | https://dtt-backend.tiancai110a.workers.dev (Cloudflare Worker + KV) |
| Backend source | sibling folder `dtt-backend/` in the AutoClaw workspace (**not** a git repo — only a local copy plus the 2026-09-18 snapshot) |

## v58 changelog (2026-09-18)

Commit `03bab23`.

1. **Dedicated refund and withdrawal policy** (`refunds.html`, zh + en + a German
   `Widerrufsbelehrung` annex). Paddle review asks for privacy + terms + refund pages as
   three separate URLs; the refund rules previously lived only inside `terms.html`.
2. **Withdrawal notice before payment.** The unlock dialog now states the 14-day window and
   that generating the first AI explanation ends the withdrawal right (key `ai.refundNote`),
   and links the policy. The dialog is the only place a buyer sees before Stripe/Paddle.
3. **Legal links everywhere they are needed**: rail footer, home footer (the rail is hidden
   below 768px, so phones had no legal links at all) and the About card. `legal.terms` no
   longer reads "and refunds" now that refunds has its own page, so the three labels stay
   distinct in all ten languages.
4. **Site icons**: `favicon.svg`, `favicon.png`, `favicon.ico`, `apple-touch-icon.png` and
   `theme-color`, linked from all four HTML pages. `https://fahrtheorie.homes/favicon.ico`
   was a 404 before.
5. **Rail footer and tab title follow the interface language** (`rail.bankVersion`,
   `rail.counts`, `document.title`), which removes the last always-Chinese text in the
   sidebar and fixes the browser tab for de/ar/ru/... users.
6. **`tests/legal.test.cjs`** (9 checks): pack alignment, legal cross-links, the pre-payment
   withdrawal notice and the manual version triple (`?v=NN` + rail badge + About badge).

i18n is now 325 keys x 10 packs, aligned and free of empty values.
Packs `de/ru/tr/uk/pl/ro/vi/ar` are machine translated; German was spot-checked manually.
Note: the `de` pack still carries the English `app.name` ("German Theory Trainer"), so the
German tab title reads in English.

## Verification evidence

- `node --check app.js ai.js i18n.js` passes.
- `tests/startup.test.cjs` 5 passed, `tests/ai-lang.test.cjs` 6 passed, `tests/legal.test.cjs` 9 passed.
- `dtt-backend`: `node test.mjs` -> 53 passed (backend untouched in v58).
- Browser (local 8123 and live): German UI renders `Katalog 2025-04-01 / Klasse B 1264 ·
  gesamt 2413 / build v58` and `Datenschutzerklärung · Nutzungsbedingungen · Widerruf &
  Erstattung`; the unlock dialog shows the withdrawal note; Arabic UI sets `lang="ar"
  dir="rtl"`; the 390x844 mobile view exposes the three legal links in the home footer.
- Live: `https://fahrtheorie.homes` serves `build v58`; md5 of `app.js`, `i18n.js`,
  `index.html`, `refunds.html`, `privacy.html`, `terms.html` and the four icon files matches
  the local files byte for byte; `/favicon.ico` returns 200 `image/vnd.microsoft.icon`;
  TLS `CN=fahrtheorie.homes`, expires 2026-12-16.
- Screenshots (outside this repo): `~/Documents/Codex/2026-09-17/users-zongrongli-openclaw-autoclaw-workspace-fahrtheorie-2/outputs/dtt_v58_*.png`
  — `de`, `unlock_de`, `refunds`, `ar`, `mobile`, `live_de`, `live_refunds`.
- Pre-change whole-tree snapshot (also outside this repo):
  `~/Documents/Codex/2026-09-17/users-zongrongli-openclaw-autoclaw-workspace-fahrtheorie-2/work/backups/2026-09-18-1713-pre-v58/`
  (website exported from commit `ad04de9` + a copy of the backend folder),
  indexed by `work/backups/README.md` next to it.

## Open items

1. Stripe still runs on a test key. Live key and live webhook pending account activation.
2. Paddle: no account yet. All three policy pages now exist, so the review can be submitted
   once an account and a `pri_` price id exist.
3. Donation QR code / link not supplied yet.
4. Native-speaker review for the eight machine-translated packs.
5. `dtt-backend/` has no git history — only the 2026-09-18 snapshot. Worth a private repo.

## Local development

```bash
# serve with media + AI proxy
ROOT=$PWD HOST=127.0.0.1 PORT=8123 PROXY_TARGET=http://127.0.0.1:2099 \
python3 /Users/zongrongli/.openclaw-autoclaw/workspace/dtt_serve.py

# front-end tests
node tests/startup.test.cjs && node tests/ai-lang.test.cjs && node tests/legal.test.cjs

# release: bump ?v=NN in index.html (7 places), rail-foot badge, and the About page string
git add -A && git commit -m "build vNN: ..." && git push origin main
```

Backend deploy and secrets: see `../dtt-backend/README.md`.
