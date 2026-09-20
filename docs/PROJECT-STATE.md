# Project state snapshot

Snapshot date: 2026-09-20 (Europe/Berlin). Live build: **v72**.

## Where things live

| What | Location |
|---|---|
| Live site | https://fahrtheorie.homes (GitHub Pages) |
| Source repo | https://github.com/ZongrongLi/fahrtheorie (branch `main`) |
| Video assets | https://github.com/Zongrongli/fahrtheorie-media (branch `master`, 251 mp4, served via jsDelivr) |
| Backend | https://dtt-backend.tiancai110a.workers.dev (Cloudflare Worker + KV) |
| Backend source | sibling folder `dtt-backend/` in the AutoClaw workspace (**not** a git repo; snapshots only) |

## v59 - v63: making the Paddle channel actually work

| Build | Commit | What |
|---|---|---|
| v59 | `483c3eb` | Open the Paddle checkout through Paddle.js instead of navigating to `checkout.url` |
| v60 | `f1cdba8` | The unlock entry shows both providers; it used to hard-jump to Stripe |
| v61 | `f9db7fd` | Load Paddle.js from `cdn.paddle.com/paddle/v2/paddle.js` (the documented `/2.0/` path answers 403) |
| v62 | `c55c07f` | Fix the environment probes; `Paddle.Environment.set()` from the token prefix |
| v63 | `862eba7` | `checkout.completed` posts the transaction id to `/api/paddle/verify` |
| v64 | `7fe6a61` | The Paddle button says "WeChat Pay / local methods", not Alipay (Alipay needs Paddle approval; a test now blocks re-promising it) |
| v65 | `c3b3f35` | The unlock dialog names the currency this buyer will be charged in, now that the backend picks one per country so WeChat Pay can appear |
| v66 | `81dd00f` | Paid state syncs from the server in both directions - an account reset server-side no longer stays "paid" in the browser forever |
| v67 | `423ab6b` | A dedicated WeChat Pay entry that asks the backend for a CNY transaction, instead of guessing from the visitor IP |
| v68 | `1da3a71` | The plain Paddle button no longer says WeChat Pay - it opens a EUR transaction, where Paddle never offers WeChat |
| v69 | `26d5c55` + `faa4ffc` | Refund and withdrawal policy removed on the owner's instruction, with its links, terms section, dialog notice and both i18n keys |
| v70 | `d6f2c32` | After a Paddle checkout completes or closes, the client re-reads `/api/me` for up to 30s so a paid account updates without a manual refresh |
| v71 | `146984b` | The checkout opens with the account email prefilled, and the WeChat entry pins the country to China, so the buyer lands straight on the payment step |
| v72 | `5702f67` | Button count follows Stripe's real PayPal capability: while it is off, Paddle stays as the only PayPal route; once on, the Stripe label gains PayPal and the Paddle entry drops out |

Why this was needed: Paddle's `transaction.checkout.url` means "open the checkout on this page"
and requires Paddle.js - it is not a post-payment redirect like Stripe's session URL. Verified
against the Paddle sandbox: the first attempt loaded `buy.paddle.com` (production) for a sandbox
transaction and Paddle rendered "Something went wrong"; after `Paddle.Environment.set('sandbox')`
the overlay came from `sandbox-buy.paddle.com` and a real test-card payment completed.

Also required on the account side (found live, not in our code): **Checkout settings -> Default
payment link** must be set, or `POST /transactions` fails with
`transaction_default_checkout_url_not_set`. And a newly created price defaults to a recurring
period - it has to be edited to one-time.

Backend changes shipped with this (`dtt-backend/worker.js`, deployed):

- `GET /api/pay-methods` now returns `paddle_token` (the client-side token) so the front end can
  initialise Paddle.js; empty means the old redirect behaviour remains.
- Paddle webhook verification accepts the multiple `h1` values Paddle sends during secret rotation,
  rejects timestamps outside a tolerance window (`PADDLE_WEBHOOK_TOLERANCE`, default 300s), and both
  providers now compare signatures in constant time.
- `transaction.billed` (manual invoice, awaiting payment) no longer unlocks; only `paid` / `completed`.

## v65 (docs only): the webhook path is now the primary one

Until the signing secret was installed, every Paddle notification was rejected. That is not
hypothetical: the EUR 5 sandbox payment the site owner made came back `completed` on Paddle's side
while the account stayed `unlimited:false`, because both deliveries failed
(`transaction.paid` / `transaction.completed`, 3 attempts each). The browser callback (v63) is what
finally unlocked it, and that only works if the buyer's tab is still open.

Installed `PADDLE_WEBHOOK_SECRET` on the Worker (secret value in `~/paddle_sandbox`, never in the
repo or `wrangler.toml`) and re-verified the endpoint against the live deployment:

| Request | Result |
|---|---|
| no `Paddle-Signature` header | `400 bad signature header` |
| `h1` of 64 zeros | `400 bad signature` |
| `h1` signed with the real secret | `200 {"ok":true}` |
| valid signature, `ts` an hour old | `400 stale` |
| rotation header, forged `h1` first then valid | `200 {"ok":true}` |
| no secret configured at all | `503 webhook not configured` (fail closed) |

A validly signed event for an unknown `uid` returns `200` and writes nothing - KV stayed at the
8-key baseline, so the webhook cannot mint accounts.

Replaying the two dead notifications from the Paddle dashboard flipped `transaction.completed` to
**Delivered** on the first attempt and the account went `unlimited:true` with `paidAt` set, which is
the end-to-end proof that the server side path works without a browser.

`worker.js` also lost a redundant `if (secret) { ... }` wrapper around the signature checks in both
webhook handlers (dead code directly after a guard that already returns when the secret is missing;
it read as if verification were optional). Behaviour is unchanged - `node test.mjs` 66/66 before and
after - and the worker was redeployed (version `dd132d9a`).

## v69 (backend only): returning buyers skip the details form

Deployed as Worker version `89c8a482`; no front-end file changed, so the live build stays **v68**.

Paddle requires an email and a country because it is the Merchant of Record - it issues the invoice
and needs the country for VAT and for which methods are lawful. Those fields cannot be removed from
Paddle's own checkout, but they can be prefilled: `POST /transactions` accepts `customer_id` and
`address_id`, and when both are present the details step disappears entirely.

Verified against the live deployment: a repeat order came back as `txn_01m2w8z8st0shnxvdjc7ejmkwp`
carrying both ids, and its checkout rendered with **no email, country or postcode field** - just a
"Pay EUR 5.00" button.

The two ids are captured at payment time, from both paths that mark an account paid
(`/api/paddle/verify` and the signed webhook), and stored on the user as `paddleCustomer` /
`paddleAddress`. No new API permission was needed - the transaction we are already allowed to read
carries them.

One deliberate exception: passing `address_id` also pins the country, which would lock out exactly
the people who need to change it. So when the buyer clicks the WeChat entry (which asks for CNY),
only the email is prefilled and the country dropdown stays on screen.

## v69: the refund and withdrawal policy was removed - by the owner, on purpose

`refunds.html`, its links in the rail / home footer / About card / both legal pages, the refund
section in `terms.html`, the pre-payment withdrawal notice in the unlock dialog, and the two i18n
keys (`legal.refunds`, `ai.refundNote`) are all gone - 327 keys back down to **325 x 10 packs**.

The reason is a real gap, not a style choice: there is no refund endpoint, and nothing revokes
`unlimited` after a refund, so "unused unlocks are fully refundable within 14 days, processed in 3
working days" was a promise with nothing behind it.

**Do not re-add it as a "completeness" fix.** The owner was told the two consequences and accepted
them anyway: the EU 14-day withdrawal right for digital content sold to German consumers is
statutory, so not informing buyers can stretch the window to as long as 12 months rather than
removing it; and Paddle's website approval asks the site to link terms / privacy / refund pages,
which is the basis on which this sandbox domain was approved. If refunds ever come back, they come
back only together with a refund API call and access revocation.

`tests/legal.test.cjs` now guards the opposite direction: it fails if any shipped page carries
refund wording (title and heading included - the first pass missed those), if `refunds.html`
reappears, or if either i18n key comes back.

## v70: payment no longer needs a manual refresh

`checkout.completed` can arrive before Paddle's own API marks the transaction paid, and sometimes the
webhook is the only thing that unlocks. The client used to fire one verify and stop, so a buyer whose
verify got a 402 sat looking at a locked UI until they refreshed by hand. `watchPaid()` now re-reads
`/api/me` immediately and then every 2s for up to 30s, on both `checkout.completed` and
`checkout.closed`, and stops as soon as the account flips. Nothing polls if no checkout was opened.

## v71: the WeChat path no longer shows a form at all

Paddle geolocates its checkout from the visitor IP, so a Chinese buyer on a European IP landed on a
**German** form - which demands a postcode, and with country = Germany Paddle never offers WeChat.
That is why "I chose WeChat and still got card".

`Paddle.Checkout.open()` accepts a `customer` object - `customer.email` and
`customer.address.countryCode` - and this needs **no API permission at all**, unlike creating a
customer or address (both `forbidden` for our keys). So the account email is always prefilled, and
the WeChat entry additionally pins the country to `CN`.

Verified on the live site: clicking 微信支付 now opens directly on the Payment step with the WeChat
Pay button visible - no email field, no country dropdown, no postcode (`outputs/
dtt_v71_wechat_direct_no_form.png`). Also measured: for country = China Paddle does not render a
postcode field at all, so the remaining fields on a first purchase are email plus country only.

The ordinary Paddle entry deliberately does **not** force a country - a German buyer stays on their
geolocated country and keeps PayPal and card.

## v72: the button list is now driven by what the providers can actually do

PayPal cannot be merged into the WeChat button. Paddle builds its method list from the checkout's
country and currency, and those two sets are mutually exclusive - measured with both USD and CNY
priced transactions at country = China: **WeChat Pay plus card only, PayPal is not offered at all**.
One checkout carries one country, so one button can only ever offer one of the two.

Stripe was checked too: its test-mode checkout offers card / Klarna / Bancontact / MB WAY and
**no PayPal**, and `GET /v1/account` on this account shows no `paypal_payments` capability at all
(`charges_enabled:false` - the account is not activated). So deleting the Paddle button today would
have removed PayPal from the site entirely.

`/api/pay-methods` now reports `stripe_paypal`, read from the Stripe account capability and cached
10 minutes, with a `STRIPE_PAYPAL = on|off` override in `wrangler.toml` in case Stripe renames the
field. The chooser reacts to it: PayPal is named on the Stripe button only when Stripe can deliver
it, and the Paddle "local methods" button disappears by itself once that is true. The WeChat entry
stays either way because Stripe cannot offer WeChat.

Verified live by temporarily forcing the flag on: the dialog collapsed to exactly two buttons -
"银行卡 / Apple Pay / PayPal (Stripe)" and "微信支付 (中国, ¥ 人民币)" - then the override was removed
and the endpoint is back to real detection (`stripe_paypal: false`).

## 2026-09-20: Stripe went live

The owner submitted Stripe identity verification himself and put `sk_live_…` into `~/stripe_s`. Same day
the account flipped to `charges_enabled: true / payouts_enabled: true` with "no outstanding tasks".
I then - **in this order** - created the live webhook first and only then swapped the key, so there was
never a window where live payments could arrive with nothing to verify them:

- live webhook endpoint `we_1UHg4lLq2GeVvCtZnhPHYlIY`, event `checkout.session.completed`, installed as
  Worker secret `STRIPE_WEBHOOK_SECRET`; signature handling re-checked against the running worker
  (no header 400 / forged 400 / valid 200)
- `STRIPE_SECRET_KEY` replaced with the live key, deployed (Worker `71657322`), and `/api/checkout`
  verified to return `cs_live_` sessions
- a live Price `price_1UHgDOLq2GeVvCtZFOV4AvjQ` (EUR 5.00, `lookup_key=dtt_unlimited`) was created as a
  spare; the code still builds prices inline, so nothing depends on it
- side effect worth stating: the test-card hole (`4242…` unlocking for free) is closed

### Two things still open on Stripe, and neither is code

1. **PayPal is connected, provisioning pending (2026-09-20 evening).** The owner enabled PayPal at
   Settings -> Payments -> payment methods (true URL: `/settings/payment_methods` with underscore;
   the hyphenated `/settings/payment-methods` bounces to `/dashboard`), chose
   "settle PayPal income to the Stripe balance (recommended)" so payouts keep flowing to the existing
   bank, clicked through "Connect to PayPal", and completed the PayPal-side account linking himself
   (agent never touches PayPal credentials). Dashboard now reads PayPal enabled (16 enabled / 20 disabled,
   was 15 / 21). BUT `GET /v1/account` still lists no `paypal_payments` capability at all - full key list
   re-checked twice, ~40 minutes apart - so `/api/pay-methods` still returns `stripe_paypal:false` and the
   site still shows three buttons. No code change needed: the v72 gate flips by itself once the API reports
   the capability (worker cache is 10 minutes). If it is still absent after ~24h, check the dashboard for a
   follow-up step or a PayPal-side pending approval before touching code.
   The front end is already capability-gated (v72): the moment `stripe_paypal` turns true the Stripe
   button gains PayPal and the Paddle button disappears, with no release. Until then the Paddle button
   is PayPal's only route and must stay.
2. **Payout bank decision (2026-09-20 evening): keep Stripe as is.** The dashboard's money-management
   page shows the payout account is Revolut ending 7724 (EUR, default) - found at
   Settings -> "Linked accounts and payouts" -> `/settings/money-management` (the older guesses
   `/settings/payouts`, `/settings/account`, `/account_details` all bounce or miss). The owner decided:
   Stripe keeps this account, no change; the C24 account is reserved for Paddle live later.

### How I was driving his browser, and why it cost me

The Stripe/Paddle dashboards needed his logged-in session, which `agent-browser` (a separate Playwright
browser) does not have. What works is the CDP layer under `jev-ultrafast`
(`/Users/zongrongli/tools/jev-ultrafast`, run with `uv run --env-file .env`):
`from browser_harness.helpers import cdp`, then `Target.createTarget` / `Target.attachToTarget`
(filter to `type == "page"` or `Page.navigate` fails) / `Runtime.evaluate`. That daemon controls his
real Chrome, so the session is there.

Three limits that bit me: `Page.captureScreenshot` always times out on this daemon (tried 5s and 60s),
so I never saw a single page; Chrome suspends background tabs, so reading an existing one often returns
0 characters and looks empty; and several plausible Stripe routes (`/settings/payment-methods`,
`/account_details`, `/settings/account/bank_accounts`) bounce to `/dashboard`. Blind to the visuals, I
burned a lot of turns guessing selectors and then drew the wrong PayPal conclusion from the API.
**For any heavy React admin, ask for a screenshot first.**

## Current payment state

| Provider | State |
|---|---|
| Stripe | **LIVE** since 2026-09-20: `STRIPE_SECRET_KEY` is the `sk_live_` key and `/api/checkout` returns `cs_live_` sessions. Live webhook `we_1UHg4lLq2GeVvCtZnhPHYlIY` is installed as `STRIPE_WEBHOOK_SECRET`. Re-verified against the running worker on 2026-09-20, all four states: missing `Stripe-Signature` -> 400, forged `v1` -> 400, correctly HMAC-signed + fresh `ts` -> `{"ok":true}` 200, correctly signed + `ts` 10000s old -> `{"error":"stale"}` 400. The self-test event referenced a non-existent session and a non-existent uid, and KV still holds exactly 8 keys afterwards, so it unlocked nothing. The test-card unlock hole is closed. PayPal is **connected but still provisioning**: dashboard reads enabled since 2026-09-20 evening, yet `GET /v1/account` still has no `paypal_payments` capability, so `stripe_paypal` is still false. The v72 gate flips with no release once the API catches up. Until then, the Paddle button remains PayPal's only route |
| Paddle | **sandbox** (`PADDLE_ENV=sandbox`, `test_` client token, webhook secret installed and delivering); live account not started |

Stripe is real money now. Paddle is still sandbox (`PADDLE_ENV=sandbox`, `test_` client token), so its
two buttons still take test cards and test WeChat. Going live on Paddle needs the live account
(self-serve signup, then identity verification; individuals are accepted), a live price rebuilt, its
own default-payment-link step, and **its own webhook destination plus a second signing secret** - the
sandbox secret cannot verify live traffic and fail-closed would turn live payments into 503s.

One correction worth keeping: `GET /v1/account?expand[]=external_accounts` reported 0 bank accounts
while the dashboard said payouts were active with no outstanding tasks. Trust the dashboard here -
that API expansion is not a reliable "no bank configured" signal.

## Verification evidence

- Front end: `node tests/startup.test.cjs` 33, `tests/ai-lang.test.cjs` 6, `tests/legal.test.cjs` 12 -> **51 passed, 0 failed**.
  Run the three files individually - `node --test tests/` (directory form) does not work in this repo.
- v69 verified live: `refunds.html` returns 404 and zero refund words remain in `index.html`, `app.js`,
  `i18n.js`, `privacy.html`, `terms.html`; all five files md5-match local
- Backend: `dtt-backend` `node test.mjs` -> **89 passed, 0 failed** (was 53 before this work)
- Real sandbox payment on the live site: transaction `txn_01m2v6755skgkrrxnnzvwh3nb2`,
  status `completed`, EUR 5.00, `custom_data.uid` preserved end to end;
  `POST /api/paddle/verify` with that id returned `{"ok":true,"unlimited":true,"provider":"paddle"}`,
  `GET /api/me` then showed `unlimited:true`, and a second account verifying the same transaction
  got **403**. Screenshots: `outputs/dtt_v62_*.png`, `dtt_v61_paddle_overlay.png`.
- Live site served `build v66` at the time of that check; **as of 2026-09-20 it serves `build v72`**, and all ten
  shipped files (`app.js i18n.js index.html styles.css privacy.html terms.html favicon.svg favicon.ico favicon.png
  apple-touch-icon.png`) md5-match local. `/api/pay-methods` live returns `stripe_paypal:false`,
  `paddle_wechat_currencies:["CNY","USD"]`, both providers on.
- v66 bug: `refreshQuota()` only ever did `if (j.unlimited === true) prefs.unlimited = true`, never the
  other way, so `prefs.unlimited` was sticky - clearing an account in KV changed nothing on screen. Now
  the server value is mirrored both ways, while a failed `/api/me` leaves the flag alone (a network
  error must not lock out someone who paid). Verified live by seeding `unlimited:true` into
  localStorage and reloading: the client rewrote it to `false`.
  ⚠️ When clearing a paid account, clearing KV is **not** enough on its own - the client cache used to
  win. Test it through the UI, not just through `/api/me`.
- v65 release triple checked live: 7 x `?v=65` in `index.html`, `build v65` in the rail and in About,
  plus `styles.css?v=65` on all three legal pages; 10 key files md5-identical to local; i18n at
  **326 keys x 10 packs**, no gaps and no empty values.
- Second real sandbox payment `txn_01m2v9tjseke6hm6f1ff9sbfdg` (EUR 5.00, `completed`,
  `custom_data.uid` = the payer's uid) unlocked **through the webhook alone** after the retry.
- KV cleaned afterwards: the two throwaway accounts (6 keys) were deleted, back to the 8-key baseline.
- ⚠️ **2026-09-20 tooling trap, and it invalidates older "verified clean" claims**: `wrangler kv key list` /
  `get` / `delete` without **`--remote`** read the local `.wrangler/state` miniflare directory and return `[]`
  **without erroring** - so "I deleted it and checked with `key list`" can be a completely empty confirmation.
  Re-checked both ways on 2026-09-20 (`--remote` and the Cloudflare REST
  `/storage/kv/namespaces/f69474f8…/keys`): the namespace really holds **8 keys** - three each for the two real
  accounts (`389006500@qq.com`, `tiancai110a@gmail.com`) plus two stale `uid:`/`tok:` keys left when the
  owner's own account was recreated (both point at the same email, harmless). **No throwaway account survives.**
  `user:389006500@qq.com` currently has **no `unlimited` field**, so the owner can pay again - which matches what
  the live UI does. Always pass `--remote` (or use REST) when checking or clearing KV.

## Open items

0. Stripe: get PayPal approved in the dashboard, and settle the payout bank (C24 or keep the current
   one). Both are dashboard actions for the owner, not code. Then confirm the chooser really collapsed
   to two buttons - v72 should do it on its own.

1. ~~Stripe live key + live webhook (blocked on account activation)~~ **done 2026-09-20** - see the section above.
2. Paddle live account, live price, live client-side token, then flip `PADDLE_ENV` and redeploy. Owner said next round.
3. ~~Paddle webhook is not registered~~ - done for sandbox. **The live account still needs its own
   destination + `PADDLE_WEBHOOK_SECRET`**; the sandbox secret will not verify live traffic, and
   fail-closed means live payments would then 503 rather than unlock.
4. Refund handling: we never revoke `unlimited` (Paddle refunds arrive as `adjustment.*`).
5. ~~WeChat Pay cannot appear~~ **fixed in v65.** Paddle only offers it for `country = CN` **and** a
   `CNY`/`USD` transaction, and the checkout call used to send no currency, so every transaction
   inherited the EUR price. `paddleCurrency()` now maps the visitor's country (`request.cf.country`)
   through `PADDLE_LOCAL_CURRENCIES` (default `CN:CNY`); everything else still sends no currency at
   all, so German buyers are unaffected - verified live, `paddle_currency` is `""` from a German IP.
   Proof it works end to end: with the mapping temporarily set to `DE:CNY`, a real
   `/api/paddle/checkout` produced `txn_01m2w5cdr39d9s9f15gpn67ytg` stored as CNY 3848, and that
   transaction's checkout page rendered the WeChat Pay button
   (`outputs/dtt_v65_real_cny_wechat.png`).
   Still open: a CN integer price via `unit_price_overrides` (¥38.48 reads badly), and Alipay, which
   needs separate Paddle approval and is not in the toggle list at all.
6. WeChat Pay still needs a **live** Paddle account before a real payment can complete; in the sandbox
   the button renders and the QR appears, but there is no real WeChat settlement to scan.
7. Native-speaker review for the eight machine-translated packs.

## Local development

```bash
# serve with media + AI proxy
ROOT=$PWD HOST=127.0.0.1 PORT=8123 PROXY_TARGET=http://127.0.0.1:2099 \
python3 /Users/zongrongli/.openclaw-autoclaw/workspace/dtt_serve.py

# front-end tests
node tests/startup.test.cjs && node tests/ai-lang.test.cjs && node tests/legal.test.cjs

# release: bump ?v=NN in index.html (7 places) + rail-foot badge + the About page string in app.js,
#         and styles.css?v=NN on privacy.html and terms.html. `?v=64` contains "v=64", not "v64", so a
#         plain "v64" search-replace silently misses all 7 cache params - the test catches it, don't rely on eyes.
git add -A && git commit -m "build vNN: ..." && git push origin main

# after pushing: confirm the remote really moved, then diff local vs live file by file
git -C /Users/zongrongli/.openclaw-autoclaw/workspace/projects/website-6c66368f96582c8c2689b361 fetch -q origin && \
  git -C /Users/zongrongli/.openclaw-autoclaw/workspace/projects/website-6c66368f96582c8c2689b361 rev-list --count origin/main..HEAD   # 0
curl -s https://fahrtheorie.homes/ | grep -o 'build v[0-9]*'
for f in app.js i18n.js index.html styles.css privacy.html terms.html; do l=$(md5 -q "$f"); r=$(curl -s "https://fahrtheorie.homes/$f" | md5 -q); [ "$l" = "$r" ] && echo "$f MATCH" || echo "$f DIFF"; done

# KV: always pass --remote, or wrangler reads .wrangler/state and reports an empty namespace
npx wrangler kv key list --binding DTT --remote
```

Backend deploy and secrets: see `../dtt-backend/README.md` and `../dtt-backend/PADDLE-ONBOARDING.md`.
