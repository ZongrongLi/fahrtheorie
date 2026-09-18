# Project state snapshot

Snapshot date: 2026-09-18 (Europe/Berlin). Live build: **v57**.

## Where things live

| What | Location |
|---|---|
| Live site | https://fahrtheorie.homes (GitHub Pages) |
| Source repo | https://github.com/ZongrongLi/fahrtheorie (branch `main`) |
| Video assets | https://github.com/ZongrongLi/fahrtheorie-media (branch `master`, 251 mp4, served via jsDelivr) |
| Backend | https://dtt-backend.tiancai110a.workers.dev (Cloudflare Worker + KV) |
| Backend source | sibling folder `dtt-backend/` in the AutoClaw workspace |

## v57 changelog (2026-09-18)

Commit `d07f25b` — feature work; commit `ad05a39` — README refresh.

1. **AI answers follow the question language.** `aiLang()` in `app.js` derives the answer
   language from the displayed question: single-language question -> that language;
   bilingual view -> `explLang` -> `uiLang` -> first language. Cached answers are tagged
   with `lang` in `state.ai[id]` and regenerated when the language changes.
   The offline engine in `ai.js` takes a single language argument and the LLM system
   prompt pins the output language. Question text and official explanations are sent
   in the target language.
2. **Language pickers became dropdowns.** The top bar and Settings now render native
   `<select data-lang>` controls: question display (4 options) and interface language
   (10 options: zh, en, de, ru, tr, uk, pl, ro, vi, ar). Arabic switches the document to
   `dir="rtl"`. `t()` falls back through pack -> en -> zh -> key.
3. **Sign-in refreshes immediately.** `finishLogin()` and logout now re-render the top bar,
   so the header switches to the signed-in state without a manual reload.
4. **Incidental fixes.** Unlock requests sent a hardcoded `Authorization: "***"` header;
   they now send the real bearer token. Remaining hardcoded zh/en UI strings were moved
   into i18n keys. 14 new keys bring every pack to 321 aligned keys.

Language packs `de/ru/tr/uk/pl/ro/vi/ar` are machine translated; German was spot-checked
manually. The other packs still want a native-speaker review.

## Verification evidence

- `node --check app.js ai.js` passes.
- `node tests/startup.test.cjs` -> 5 passed. `node tests/ai-lang.test.cjs` -> 6 passed.
- `dtt-backend`: `node test.mjs` -> 53 passed.
- Browser check: with the question language set to German the generated explanation was
  German (cached with `lang: "de"`); switching to Chinese regenerated a Chinese
  explanation (`lang: "zh"`). Arabic UI set `lang="ar" dir="rtl"` with a correct mirrored
  layout.
- Sign-in check: a throwaway account showed the signed-in header without a reload.
  The temporary KV records were deleted afterwards.
- Live check: `https://fahrtheorie.homes` serves `build v57`, `app.js` contains `aiLang()`,
  `i18n.js` ships 10 packs. TLS certificate is `CN=fahrtheorie.homes`, issued 2026-09-17,
  expiring 2026-12-16.

## Open items

1. Stripe still runs on a test key. Live key and live webhook pending account activation.
2. Paddle: no account yet. A refund policy page is still missing (privacy and terms exist);
   Paddle review needs all three.
3. Donation QR code / link not supplied yet.
4. Native-speaker review for the eight machine-translated packs.

## Local development

```bash
# serve with media + AI proxy
ROOT=$PWD HOST=127.0.0.1 PORT=8123 PROXY_TARGET=http://127.0.0.1:2099 \
python3 /Users/zongrongli/.openclaw-autoclaw/workspace/dtt_serve.py

# front-end tests
node tests/startup.test.cjs && node tests/ai-lang.test.cjs

# release: bump ?v=NN in index.html (7 places), rail-foot badge, and the About page string
git add -A && git commit -m "build vNN: ..." && git push origin main
```

Backend deploy and secrets: see `../dtt-backend/README.md`.
