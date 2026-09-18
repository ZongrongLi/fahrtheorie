# Project state snapshot

Snapshot date: 2026-09-18 (Europe/Berlin). Live build: **v63**.

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

## Current payment state

| Provider | State |
|---|---|
| Stripe | **test key** (`pk_test`/`sk_test`) + test webhook; live account still not activated |
| Paddle | **sandbox** (`PADDLE_ENV=sandbox`, `test_` client token); live account not started |

So both buttons on the live site are test-mode. Switching to real money needs: Stripe account
activation + live key + live webhook, and a Paddle live account (self-serve signup, then
identity verification; individuals are accepted) with a live price rebuilt and its own
default-payment-link step.

## Verification evidence

- Front end: `node tests/startup.test.cjs` 18, `tests/ai-lang.test.cjs` 6, `tests/legal.test.cjs` 9 -> **33 passed, 0 failed**
- Backend: `dtt-backend` `node test.mjs` -> **63 passed, 0 failed** (was 53 before this work)
- Real sandbox payment on the live site: transaction `txn_01m2v6755skgkrrxnnzvwh3nb2`,
  status `completed`, EUR 5.00, `custom_data.uid` preserved end to end;
  `POST /api/paddle/verify` with that id returned `{"ok":true,"unlimited":true,"provider":"paddle"}`,
  `GET /api/me` then showed `unlimited:true`, and a second account verifying the same transaction
  got **403**. Screenshots: `outputs/dtt_v62_*.png`, `dtt_v61_paddle_overlay.png`.
- Live site serves `build v63`; `app.js` contains `eventCallback` and the v2 CDN URL.
- KV cleaned afterwards: the two throwaway accounts (6 keys) were deleted, back to the 8-key baseline.

## Open items

1. Stripe live key + live webhook (blocked on account activation).
2. Paddle live account, live price, live client-side token, then flip `PADDLE_ENV` and redeploy.
3. Paddle webhook is not registered yet - the unlock currently relies on the browser callback.
   Register `transaction.paid` + `transaction.completed` on the live account and set
   `PADDLE_WEBHOOK_SECRET` so a closed tab still unlocks.
4. Refund handling: we never revoke `unlimited` (Paddle refunds arrive as `adjustment.*`).
5. Native-speaker review for the eight machine-translated packs.

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
