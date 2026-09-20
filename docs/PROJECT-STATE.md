# Project state snapshot

Snapshot date: 2026-09-19 (Europe/Berlin). Live build: **v72**.

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

## Current payment state

| Provider | State |
|---|---|
| Stripe | **test key** (`pk_test`/`sk_test`) + test webhook. A live key exists in `~/stripe_s` and the live webhook is already built and installed (`STRIPE_WEBHOOK_SECRET`, endpoint `we_1UHg4lLq2GeVvCtZnhPHYlIY`), but the account is **not activated** - 0 bank accounts and an empty `individual.verification` - so the key was deliberately not swapped: a live session cannot be paid and the buy button would just error |
| Paddle | **sandbox** (`PADDLE_ENV=sandbox`, `test_` client token, webhook secret installed and delivering); live account not started |

So both buttons on the live site are test-mode. Switching to real money needs: Stripe account
activation + live key + live webhook, and a Paddle live account (self-serve signup, then
identity verification; individuals are accepted) with a live price rebuilt and its own
default-payment-link step.

## Verification evidence

- Front end: `node tests/startup.test.cjs` 33, `tests/ai-lang.test.cjs` 6, `tests/legal.test.cjs` 11 -> **51 passed, 0 failed**
- v69 verified live: `refunds.html` returns 404 and zero refund words remain in `index.html`, `app.js`,
  `i18n.js`, `privacy.html`, `terms.html`; all five files md5-match local
- Backend: `dtt-backend` `node test.mjs` -> **89 passed, 0 failed** (was 53 before this work)
- Real sandbox payment on the live site: transaction `txn_01m2v6755skgkrrxnnzvwh3nb2`,
  status `completed`, EUR 5.00, `custom_data.uid` preserved end to end;
  `POST /api/paddle/verify` with that id returned `{"ok":true,"unlimited":true,"provider":"paddle"}`,
  `GET /api/me` then showed `unlimited:true`, and a second account verifying the same transaction
  got **403**. Screenshots: `outputs/dtt_v62_*.png`, `dtt_v61_paddle_overlay.png`.
- Live site serves `build v66`; `app.js` contains `eventCallback` and the v2 CDN URL.
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

## Open items

1. Stripe live key + live webhook (blocked on account activation).
2. Paddle live account, live price, live client-side token, then flip `PADDLE_ENV` and redeploy.
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
5. WeChat Pay still needs a **live** Paddle account before a real payment can complete; in the sandbox
   the button renders and the QR appears, but there is no real WeChat settlement to scan.
6. A CN integer price via `unit_price_overrides` (¥38.48 reads badly next to "€5").
7. Native-speaker review for the eight machine-translated packs.

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

Backend deploy and secrets: see `../dtt-backend/README.md` and `../dtt-backend/PADDLE-ONBOARDING.md`.
