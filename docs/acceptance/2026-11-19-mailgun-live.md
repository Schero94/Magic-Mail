# Acceptance: Mailgun against the real API (2026-11-19)

Branch `fix/mailgun-template-preflight` against `main` (4.9.0). Real Mailgun account, US region (`api.mailgun.net`), one sandbox sending domain, one authorized sandbox recipient (the maintainer's own inbox). Credentials only from `~/.config/magic-mail-live/.env`, never printed; every log and request record below is masked (domain, keys, addresses).

**Status: Mailgun sending, provider templates and the Mailgun webhook accepted against the real API**, with the open points listed under [Not proven live](#not-proven-live).

## 1. Mailgun accepts a send with a template it does not have

Observed on the real API before the fix (4.9.0 send path):

| Step                                                                                                   | Result                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /v3/{domain}/messages` with `template=<name that does not exist>`                                | `200 {"message":"Queued"}`; Magic Mail 4.9.0 logs the mail as **Sent**                                                                                                              |
| same in test mode (`o:testmode=yes`)                                                                   | event `delivered`, code 650 "Delivered in test mode" (the template is not evaluated)                                                                                                |
| same without test mode                                                                                 | event `failed`, `severity: temporary`, `reason: generic`, delivery-status code **621** "Template not found", `retry-seconds: 600`, retried every 10 minutes (attempts 1, 2, 3 seen) |
| `GET /v3/{domain}/templates/{name}?active=yes` and `GET /v4/templates/{name}?active=yes`, unknown name | `404 {"message":"template not found"}` (both scopes)                                                                                                                                |
| `GET /v3/{domain}/templates/{name}?active=yes` for a template created without a version                | `200` with `template` but **no `version`**                                                                                                                                          |

Docs: [Mailgun templates API](https://documentation.mailgun.com/docs/mailgun/api-reference/send/mailgun/templates) and the OpenAPI bundle behind it (`GET /v3/{domain_name}/templates/{template_name}` and `GET /v4/templates/{template_name}`, path parameter is the template **name**, query `active`, responses 200/401/404/500), retrieved 2026-11-19. The docs do not say what `active` returns for a template without a version; the live answer above is the evidence.

Fix: `sendViaMailgun` checks the template before a template send (`utils/provider-api.js` `checkMailgunTemplate`, 5 s timeout, fixed hosts only). 404 or no active version → `MAGIC_MAIL_PROVIDER_TEMPLATE_UNAVAILABLE` before any message request (pre-dispatch: the next account with the template may send; fallback-safe: the configured local fallback template applies). Positive results are cached 60 s per account, region, domain, scope and template; parallel sends share one check. Network, timeout, 401/403, 429 and 5xx of the check log a warning and the send goes ahead.

## 2. Live suite

`set -a; . ~/.config/magic-mail-live/.env; set +a; LIVE_PROVIDERS=mailgun npm run test:live`

| Code                | Result                                                                                                                                                                                                                                   |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `main` 4.9.0        | 15 Mailgun tests, **14 passed, 1 failed**: the ghost-template assertion expected a 4xx from Mailgun and got `200 Queued`                                                                                                                 |
| this branch (final) | 63 tests, **15 passed, 0 failed**, 48 skipped (other providers not selected, no EU domain). The ghost template now fails with `MAGIC_MAIL_PROVIDER_TEMPLATE_UNAVAILABLE`, no `messages` request is sent, and the real check answered 404 |

All live-suite sends run with `o:testmode=yes`. The output contains no key, domain or address (checked with a literal search for each value).

## 3. Webhook end to end

Setup:

- Strapi 5.63.0 (JavaScript app, SQLite, admin panel off) with this branch's `npm run build` output, created under the plugin checkout for the run and deleted afterwards. One Mailgun account with the real API key and the real HTTP webhook signing key; **Block hard-bounced recipients** on.
- A local filter proxy forwarded only `POST /api/magic-mail/webhooks/mailgun/<accountId>` and answered 404 to everything else. A `cloudflared` quick tunnel pointed at the proxy.
- Before any change, `GET /v3/domains/{domain}/webhooks` (`{"webhooks":{}}`) and `GET /v1/webhooks` (account-level, `{"webhooks":[]}`) were saved. Then `POST /v3/domains/{domain}/webhooks` created `delivered`, `permanent_fail` and `temporary_fail` with the tunnel URL (200 each).

| Check                                                                                                      | Result                                                                                                                                                                                                                                                                    |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| unsigned POST, locally and through the tunnel                                                              | 401                                                                                                                                                                                                                                                                       |
| any other path or method through the tunnel                                                                | 404 (proxy)                                                                                                                                                                                                                                                               |
| real send with a deleted template through the fixed send path                                              | `MAGIC_MAIL_PROVIDER_TEMPLATE_UNAVAILABLE`, no `messages` request, email log **failed**                                                                                                                                                                                   |
| real send (no test mode) with a deleted template, pre-send check switched off to reproduce 4.9.0           | Mailgun `200 Queued`; real signed `temporary_fail` webhook (code 621) within 1 s → **200**, signature verified with the signing key, email log **Deferred**, no suppression                                                                                               |
| the same message's Mailgun retry 10 minutes later, after the host was rebuilt with the new webhook mapping | real signed webhook → **200**, email log **Deferred** with the new code `MAILGUN_TEMPLATE_NOT_FOUND`, a second email event, no suppression                                                                                                                                |
| real 621 retry of an earlier probe message without `magicmail_id`                                          | 200, counted as unmatched, nothing changed                                                                                                                                                                                                                                |
| real signed webhook re-posted unchanged                                                                    | 200, nothing processed twice (still one email event)                                                                                                                                                                                                                      |
| real webhook with the `signature` changed in one character                                                 | **401**                                                                                                                                                                                                                                                                   |
| real webhook with the `token` changed in one character                                                     | **401**                                                                                                                                                                                                                                                                   |
| real webhook with the `signature` object removed                                                           | **401**                                                                                                                                                                                                                                                                   |
| test-mode template send through the host                                                                   | real signed `delivered` webhook (code 650, `is-test-mode: true`) → 200, email log `deliveryConfirmedAt` set, status stays **Sent**                                                                                                                                        |
| test-mode sends of the live suite (no log in this host)                                                    | 5 signed `delivered` webhooks → 200, unmatched                                                                                                                                                                                                                            |
| real template send to the authorized recipient                                                             | Mailgun `failed`, `severity: permanent`, `reason: espblock`, `550 5.7.40` (the recipient's provider refused the sandbox sender), `delivery-status.bounce-type: soft`; Mailgun did **not** add the address to its bounce list (`GET /v3/{domain}/bounces/<address>` → 404) |

The `espblock` result exposed a webhook bug: 4.9.0 maps every permanent Mailgun failure except `suppress-*` and `old` to a hard bounce and, with **Block hard-bounced recipients** on, suppresses the address, so one ESP block would have blocked the recipient on every account. Now: `espblock` → **Blocked**, never suppressed; `bounce-type: soft` → **Bounced** but not suppressed; code 621 → `MAILGUN_TEMPLATE_NOT_FOUND` (Deferred while temporary, Failed when permanent), never suppressed. Covered by `tests/webhook-outcomes.test.js` "Mailgun severity and bounce type: only permanent hard bounces suppress" with the payload shapes observed here (fails on 4.9.0).

Real sends without test mode: 2 (the deleted-template send, not delivered; one template send, refused by the recipient's provider). Subjects were "Magic Mail live test (can be deleted)".

Teardown: the three domain webhooks deleted (200 each); `GET /v3/domains/{domain}/webhooks` and `GET /v1/webhooks` afterwards are byte-identical to the saved responses. Tunnel, proxy and host stopped; host `.env`, SQLite database and captured bodies deleted. The domain's templates are unchanged (only the synthetic `MAILGUN_TEMPLATE`); a version-less template created to observe the `active=yes` answer was deleted right away.

## Not proven live

- **The `permanent_fail` webhook.** Mailgun recorded the `espblock` permanent failure, but no `permanent_fail` post reached the tunnel within 10 minutes, while `temporary_fail` and `delivered` posts did. The cause is unknown. The permanent mapping is covered by tests with the observed event shape only. A hard bounce (`bounce-type: hard`) could not be produced: a sandbox domain only sends to authorized recipients.
- **The final event after Mailgun stops retrying a 621.** Mailgun retried every 600 s; the run ended before Mailgun gave up. The final permanent event is expected to carry reason `old` (never suppressed); with code 621 it is mapped to Failed either way.
- **The first two test-mode sends**, about 15 s after the webhooks were created, produced no webhook; every later test-mode send did. Treat the first seconds after creating a Mailgun webhook as unreliable.
- **Account-level templates** (`/v4/templates/{name}`): the account has none; the live 404 for an unknown name is the only live evidence. The 200 path is covered by the fake-server tests.
- **EU region**: no EU domain configured.
