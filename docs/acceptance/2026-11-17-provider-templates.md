# Acceptance: provider templates (SendGrid, Mailgun)

Branch `feat/provider-templates` (PR #20) against `main`. It was developed stacked on `fix/provider-send-paths` (PR #23, SendGrid EU region and safer SendGrid/Mailgun send paths), which shipped as 4.7.0; #20 was then re-applied on top of 4.7.0. Planned release: 4.8.0.

**Status: SendGrid accepted, Mailgun spec-verified only.** On 2026-11-18 every SendGrid check passed against the real SendGrid API (sends in sandbox mode only) and the Event Webhook was tested end to end; see [Live suite](#live-suite) and [SendGrid full integration](#sendgrid-full-integration-2026-11-18). Mailgun has not run against the real API yet (no Mailgun credentials); it is verified against the official OpenAPI specification and with tests. On 2026-11-19 the maintainer approved releasing on this basis; #23 shipped as 4.7.0 and this branch was re-applied on top of it (StrictMode admin tests for the provider-template screens added). The SendGrid live suite passed again on the re-applied branch (48 tests, 30 passed, 0 failed, 18 skipped; account clean afterwards).

## Scope

The P1 plan in the workbench (`docs/plans/2026-11-16-strapi-rfc-opportunities.md`), following Strapi RFC [#27752](https://github.com/strapi/strapi/discussions/27752):

- read-only sync of templates
- preview, detected variables and test send
- sending with the same `data` object
- routing to the accounts that have the template
- strict errors, with an opt-in local fallback
- a design choice for the core emails, with payload v1
- copy and convert between template formats
- name re-match
- security and privacy rules
- no raw provider ids on the public Content API

## Evidence

### 1. Old features unchanged

| Check                        | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Golden provider payloads     | `tests/golden-send-payloads.test.js`, 9 tests. Recorded **before** any send code changed (commit `dc80386` after the rebase, the first commit of the branch). Covers local-template sends through SendGrid and Mailgun (with and without tracking, marketing and high priority), SMTP/nodemailer, a plain HTML send, and the users-permissions password-reset mail through the provider wrapper for SendGrid, Mailgun and SMTP. Re-recorded once on top of #23 (see [Stacked on #23](#stacked-on-23-2026-11-18)); otherwise unchanged at the end of the branch. |
| Existing suites              | `npm test` on the stacked branch (2026-11-18): 693 tests, 690 passed, 0 failures, 3 skipped (PostgreSQL multi-process tests without `MAGIC_MAIL_TEST_PG_URL`, the same 3 as before). One timing test that was already there (`rate limiter does not sweep...`) can fail when the machine is under heavy load; it passes alone and in CI.                                                                                                                                                                                                                        |
| Browser regression (phase A) | Accounts, routing, templates, designer, analytics, outbox and plugin settings at 1440 px, light and dark, on SQLite and PostgreSQL. Every screen loads, document overflow is 0 and there are 0 plugin console messages. Without a SendGrid or Mailgun account, nothing new is visible: no provider section, no Design column and no Convert section.                                                                                                                                                                                                            |

### 2. Unit, integration and contract tests

| Suite                                          | Tests                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/provider-template-utils.test.js`        | 51: variable detection; Mustache to Handlebars and back; plain-JSON conversion; time budgets on 50 000-character adversarial inputs                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `tests/provider-templates-units.test.js`       | 9: core payload v1, user allowlist, link building, the core-mail capture (TTL, size bound, single use), provider API helpers, key slugs, HTML copy design, admin controller (key validation, test-send default recipient, the convert route)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `tests/provider-templates-integration.test.js` | 22, against fake SendGrid and Mailgun HTTP servers: paginated sync, EU base URLs, Mailgun domain and account scope, a domain-only key, 429/401 during sync (previous rows kept), deleted and unpublished templates, name re-match, removed accounts, the same `data` as `dynamic_template_data` / `t:variables` (and the same visible Mustache output), subject rules, 16 KB and 1 MB limits, cyclic data, failover on 429 only between accounts that have the template, an explicit account without the template, raw ids and combinations rejected, the public Content API schema rejecting `providerTemplate`, the opt-in fallback (400: fallback; 500: no fallback; stale: fallback), core mails through the wrapper (payload v1, strict, designer fallback), copy and convert |
| `tests/provider-templates-contract.test.js`    | 8. Checks 20 recorded exchanges against the official OpenAPI documents, each as a request and as a fake response. Also: the pinning checksums, the 3 listed spec deviations, 4 negative checks (the checker catches a wrong key, a bad parameter, an undocumented form field and an unknown host) and the live-suite switches `sandbox_mode` / `o:testmode`                                                                                                                                                                                                                                                                                                                                                                                                                        |

Pinned specs (SHA-256 of the official source file):

- SendGrid: `twilio/sendgrid-oai` at commit `51a0dee5a218634f0775cdc589e3d728136674de`
  - `tsg_templates_v3.json`: `d38d9f0c…`
  - `tsg_mail_v3.json`: `1bf9b256…`
- Mailgun: API reference bundle `mailgun.json`, retrieved 2026-11-17: `3bf29afd…`

Spec deviations, each re-checked by the live suite:

1. The SendGrid spec types template ids as 36-character UUIDs. Dynamic template ids are `d-` plus 32 hex characters.
2. The Mailgun spec marks `subject` as required on messages. Its own field description says it is not required with a template that has a Subject header.
3. Already in 4.5.0 and unchanged here (locked by the golden tests): top-level `custom_args` is sent as an object, while the spec says string.

### 3. Browser acceptance

Host setup:

- Evidence run on commit `29ea4c9` (branch rebased onto main 4.5.1), 2026-11-17, Node 22. Isolated Strapi 5.62.0 host on port 1395, admin built from the packed tarball of this branch. The installed `dist/server/index.js` was compared with the tarball and the branch build: identical.
- React, react-dom, styled-components and react-router-dom are each installed once (deduped).
- Synthetic data only: `example.test` accounts and fixed synthetic templates.
- Secrets are random (`.env`, mode 600, never printed).
- Egress is blocked by a preload. Only loopback is allowed, and the four provider hosts are redirected to the local fake servers. 0 egress attempts were recorded.
- SQLite and PostgreSQL 16.
- Scripts and raw results stay outside the repository (scratch directory); screenshots were checked before use.

| Phase                                                                                         | SQLite                                                                                                                                            | PostgreSQL |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| A: regression and "nothing new without a provider account"                                    | pass                                                                                                                                              | pass       |
| B: all new click paths, light and dark, measurements at 1440/768/390/320 (52 measured states) | pass                                                                                                                                              | pass       |
| C: de, fr, es, pt at 1440 and 320 (list and dialog): no ICU or message-id leaks, no overflow  | pass                                                                                                                                              | pass       |
| Read-only role (access + read + users-permissions read)                                       | API: list, detail and sync 200; test-send, fallback, copy and core-design 403; anonymous 401. UI: no Send test, Copy, fallback or Design actions. | same       |
| Forced states (`page.route`, UI only)                                                         | load error with Try again, retry recovers; empty list with the next step and a Sync button; account error notice                                  | n/a        |
| Plugin console messages (errors and warnings)                                                 | 0                                                                                                                                                 | 0          |

Measurements:

- Document overflow is 0 and no element is outside the viewport in every measured state.
- `lowContrast` hits are white text on the existing brand gradients (page header, gradient buttons, dialog header). `measure.js` cannot see gradients; the contrast was checked by eye on the screenshots. These elements already existed.
- `smallTargets`: the Design-dialog checkbox box is 20 × 20 px (DS `Checkbox`). Its label is part of the same control and can be clicked, so this is the WCAG 2.5.8 equivalent-target exception.

Keyboard:

- Escape closes the dialogs, and focus returns to the "Open <template>" button.
- Focus stays on the fallback select while it saves.

Console noise classified as core or host, never as the plugin:

- `useRBAC` object warning
- React Router future-flag warning, also on the login page
- the host CSP blocking `editor.unlayer.com` (documented CSP)
- the host's missing favicon

### Click paths (first-time editor, counted from the plugin entry page)

| #   | Task                                       | Interactions        | Steps                                                                                                                                       |
| --- | ------------------------------------------ | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | See provider templates                     | 1                   | Email Templates tab (the list syncs itself when older than 10 minutes)                                                                      |
| 2   | Sync provider templates                    | 2                   | Email Templates tab, Sync                                                                                                                   |
| 3   | Preview a provider template                | 2                   | Email Templates tab, Open                                                                                                                   |
| 4   | Send a test to yourself                    | 3                   | Email Templates tab, Open, Send test                                                                                                        |
| 5   | Set a fallback template                    | 3                   | Email Templates tab, Open, choose fallback (saved immediately)                                                                              |
| 6   | Copy as Magic Mail template                | 3 (+1 confirmation) | Email Templates tab, Open, Copy; Copy anyway appears only when logic does not carry over; then the designer opens                           |
| 7   | Send a core email with a provider template | 4                   | Email Templates tab, Core emails tab, Design, pick the template, Save. Opening and picking in the select counts as one choice; 5 raw clicks |
| 8   | Convert a local template for a provider    | 3                   | Email Templates tab, Code snippets, Convert for SendGrid or Mailgun                                                                         |

Every path stays within the four-interaction rule.

### Unauthenticated reachability probes (2026-11-17T20:46Z)

No credentials were sent. Every documented path on SendGrid US and EU and on Mailgun US and EU answered 401. An unknown SendGrid path also answers 401, so for SendGrid this proves only that the hosts are reachable. An unknown Mailgun path answers 404, which weakly confirms the Mailgun paths and both regions. This says nothing about request bodies or behaviour.

## Stacked on #23 (2026-11-18)

PR #20 was rebased onto `fix/provider-send-paths` (#23 head `596ef01`, which already contains main 4.6.1). What changed in #20:

- `server/src/utils/provider-api.js` re-exports `SENDGRID_REGIONS`, `resolveSendGridRegion` and `sendGridApiBaseUrl` from #23's `server/src/utils/sendgrid-region.js`; #20's copy of the region table is gone. `account-manager.js` keeps #23's `assertSendGridRegion` next to #22's `normalizeApiProviderConfig`; the account wizard keeps one SendGrid region field (#23's; #20's identical copy removed); translations keep both sides' keys.
- The Mailgun 16 KB send-options check runs once on every send, after the `v:magicmail_*`, `o:tag` and tracking options (#23). #20's earlier `template &&` check is removed. A template send above the limit still fails with `MAGIC_MAIL_PROVIDER_TEMPLATE_TOO_LARGE` (fallback-safe, nothing sent); other sends keep #23's `MAGIC_MAIL_MESSAGE_TOO_LARGE`. The SendGrid 30 MB check works the same way (decimal 30 000 000 bytes, #23). Headers are never dropped or shortened.
- A duplicate `mailgunOptionBytes` helper from the auto-merge was removed.
- The OpenAPI specs (`mailgun.json`, `sendgrid-mail.json`) and `tests/helpers/openapi-contract.js` / `extract-openapi.js` were byte-identical (SHA-256) and exist once; #20 adds only `sendgrid-templates.json`.
- Golden fixtures re-recorded once. Only fields #23 adds on purpose changed; stripping them gives the previous fixtures exactly:

| Fixture                                   | Added by #23                                                                                                               |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `local-sendgrid.json`                     | `custom_args.magicmail_id`; `tracking_settings.click_tracking/open_tracking.enable=false` (Magic Mail tracks both)         |
| `plain-sendgrid.json`                     | `custom_args.magicmail_id`; `tracking_settings.open_tracking.enable=false` (pixel only, no links)                          |
| `core-reset-sendgrid.json`                | `custom_args.magicmail_id`; `tracking_settings.open_tracking.enable=false`                                                 |
| `local-sendgrid-untracked.json`           | `custom_args.magicmail_id` (tracking off, so no tracking switches)                                                         |
| `local-mailgun.json`                      | `o:tracking-opens=no`, `o:tracking-clicks=no`, `v:magicmail_email_type`, `v:magicmail_priority`, `v:magicmail_id`, `o:tag` |
| `core-reset-mailgun.json`                 | `o:tracking-opens=no`, `v:magicmail_email_type`, `v:magicmail_priority`, `v:magicmail_id`, `o:tag`                         |
| `local-mailgun-untracked.json`            | `v:magicmail_email_type`, `v:magicmail_priority`, `v:magicmail_id`, `o:tag`                                                |
| `local-smtp.json`, `core-reset-smtp.json` | unchanged                                                                                                                  |

The fake delivery log in the golden and provider-template harnesses now returns alphanumeric documentIds like Strapi (`golddoc1` and `logdoc1` instead of `log-1`): #23 sends only ids matching `/^[A-Za-z0-9]{1,64}$/`, so the old fake id silently suppressed `magicmail_id`.

- New regression test: template sends carry `custom_args.magicmail_id` / `v:magicmail_*` / `o:tag`, get no provider tracking switches, and template data that fits 16 KB alone but not with the metadata is refused before any request; exactly 16 KB is accepted.
- Browser smoke findings, fixed: the provider-template preview iframe showed black text on the dark canvas in dark mode (now a light email canvas in both themes); the account wizard logged Radix's "Missing Description" warning when it opened (pre-existing on main, now `aria-describedby={undefined}` like the other plugin dialogs).

Gate on the final head (Node 22.23.1): `npm run lint`, `npm run format:check`, `npm test` (693/690 pass, 3 skipped), `npm run test:multi-instance` (49/46 pass, 3 skipped: PostgreSQL), `npm run build`, `npm run verify`, `npm run verify:runtime`, and `npm ci --ignore-scripts` with npm 10.9.8 and npm 11.21.2: all pass.

Browser smoke (2026-11-18T14:54Z, final bundle):

- Isolated Strapi 5.62.0 host on 127.0.0.1:1397, SQLite, random secrets (mode 600, deleted at teardown), plugin installed from the packed tarball of this branch (installed `dist/` identical to the branch build). React 18.3.1, react-dom 18.3.1, styled-components 6.6.0 and react-router-dom 6.30.6 once each (deduped).
- Egress blocked by a preload; the four provider hosts redirected to local fake SendGrid/Mailgun servers with synthetic templates. 0 blocked server-side egress attempts; the browser's only blocked request was core's `api.github.com` release check.
- Account wizard: SendGrid account with region **EU** saved as `region: "eu"`, a Global one as `"us"`; Mailgun domain `mg.example.test/v3` shows the inline error and keeps Continue disabled; `https://MG.example.test/` is saved as `mg.example.test`.
- Provider templates: auto-sync and Sync (the EU account read `api.eu.sendgrid.com`), preview dialog, test sends through SendGrid US, SendGrid EU and Mailgun (requests carried `template_id` / `template` plus #23's `magicmail_id`, `v:magicmail_*` and `o:tag`), Copy as Magic Mail template, fallback select, Core emails design (password reset and email confirmation set to provider templates). Escape closes the dialog and focus returns to its Open button.
- Matrix 1440 and 390, light and dark: templates list, provider dialog, Core emails tab, design dialog, wizard SendGrid region and Mailgun domain steps (24 measured states). Document overflow 0, nothing outside the viewport, no clipped text, no small targets. Inner scroll only in the existing tab strip and wizard stepper at 390. `lowContrast` hits are white text on the existing brand gradients (checked on the screenshots), as before.
- Console: 0 plugin messages. Remaining messages also appear on native pages (React Router future flag, `useRBAC`, `adminApi` reducerPath, core's blocked `api.github.com`) or come from the host CSP (`editor.unlayer.com` in the designer).
- Host and fake servers stopped; `.env`, `creds.json`, auth state and database deleted.

## Live suite

`npm run test:live` runs the opt-in suites in one command (`node --test --test-concurrency=1 tests/live/*.live.test.js`):

- `tests/live/provider-send.live.test.js`: #23's send paths
- `tests/live/provider-templates.live.test.js`: the provider-template flows
- `tests/live/sendgrid-account.live.test.js`: the rest of the SendGrid integration (added 2026-11-18)

All three read only `~/.config/magic-mail-live/.env` and never print values. `LIVE_PROVIDERS` (environment or that file: `sendgrid`, `mailgun` or `sendgrid,mailgun`) selects the providers; by default every provider whose variables are complete runs. Tests of an unselected provider are skipped with the reason. `tests/helpers/live-env.js` forces `mail_settings.sandbox_mode.enable = true` on every SendGrid `/v3/mail/send` and `o:testmode=yes` on every Mailgun `messages` request, including the account connection test, and allows only the four provider hosts. Without the file, the template suite fails its first test with the path.

`tests/live/provider-templates.live.test.js` covers:

- sync and pagination (page size 1 compared with one page)
- variable detection
- strict template sends
- unknown key and a provider-unknown template
- the Mailgun 16 KB boundary and the SendGrid 1 MB bound
- rate-limit headers
- EU when configured
- the spec deviations above, through real sends

| Date       | Provider          | Command                                     | Result                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------- | ----------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-17 | SendGrid, Mailgun | `npm run test:live`                         | **not run**: `~/.config/magic-mail-live/.env` does not exist (test 1 fails by design, 10 skipped)                                                                                                                                                                                                                                                                                                    |
| 2026-11-18 | SendGrid, Mailgun | `npm run test:live` (26 tests)              | **not run**: the file still does not exist. Checked with `HOME` pointing at an empty directory: send suite 15 skipped with the path, template suite test 1 fails with the path, 10 skipped, exit 1                                                                                                                                                                                                   |
| 2026-11-18 | SendGrid          | `LIVE_PROVIDERS=sendgrid npm run test:live` | First run at `c08f7c3`: 36 tests, 18 passed, 1 failed, 17 skipped. **SG-9 failed**: a cc display name `"Ops, Live"` arrived as `ops,  Live`. Cause: `send()` split recipient strings at every comma and lower-cased the pieces (also on `main` 4.6.1, every provider). Fixed on #23 (`4901bc7`, offline regression tests for SendGrid, Mailgun, SMTP, Gmail, Outlook and Yahoo); #20 rebased onto it |
| 2026-11-18 | SendGrid          | `LIVE_PROVIDERS=sendgrid npm run test:live` | At `0c13394` (after the rebase): 36 tests, **19 passed, 0 failed**, 17 skipped (all Mailgun tests, SG-2 without an EU subuser key, EU region)                                                                                                                                                                                                                                                        |
| 2026-11-18 | SendGrid          | `LIVE_PROVIDERS=sendgrid npm run test:live` | With `sendgrid-account.live.test.js`: 48 tests, **30 passed, 0 failed**, 18 skipped (the same plus the SendGrid EU test). No value from the credentials file appeared in the output                                                                                                                                                                                                                  |
| 2026-11-18 | SendGrid          | `LIVE_PROVIDERS=sendgrid npm run test:live` | After the Mail Send hint fix (#20 rebased onto `2b02744`): 48 tests, **30 passed, 0 failed**, 18 skipped. Account clean afterwards (1 key, 1 template, Event Webhook settings identical to the saved ones)                                                                                                                                                                                           |

## SendGrid full integration (2026-11-18)

Real SendGrid API, account with a full-access key, US region (`api.sendgrid.com`). Every send ran in sandbox mode: SendGrid validates the request and answers 200 without delivering. The account has no verified sender; sandbox mode accepts the unverified `SENDGRID_FROM`. Sandbox sends produce no events, so the Event Webhook was proven with SendGrid's own test event plus payloads signed with a local key.

### Sending (real API, sandbox)

| Check                                                                                                                                                                       | Result                                                                                                                                                                                                                                                          |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| to/cc/bcc de-duplication (SG-1), display names incl. a comma inside quotes (SG-9)                                                                                           | pass                                                                                                                                                                                                                                                            |
| `reply_to` (single, quoted name with a comma) and `reply_to_list`                                                                                                           | pass                                                                                                                                                                                                                                                            |
| attachment plus inline `cid` image                                                                                                                                          | pass                                                                                                                                                                                                                                                            |
| caller headers: `X-SG-ID` stripped, custom `X-` header kept (SG-3)                                                                                                          | pass                                                                                                                                                                                                                                                            |
| `custom_args`: `magicmail_id`, `email_type`, `priority`                                                                                                                     | pass                                                                                                                                                                                                                                                            |
| categories, `send_at`                                                                                                                                                       | not used by Magic Mail (asserted absent)                                                                                                                                                                                                                        |
| tracking: Magic Mail tracks everything / opens only / nothing → both switched off / only `open_tracking` off / `tracking_settings` absent                                   | pass                                                                                                                                                                                                                                                            |
| size precheck above 30 MB: refused before any request                                                                                                                       | pass                                                                                                                                                                                                                                                            |
| 200 without `X-Message-Id` (sandbox) logged as success                                                                                                                      | pass                                                                                                                                                                                                                                                            |
| 400: `SendGrid API request failed: 400` with field names (`template_id`, `subject`, `content`, `personalizations.0.dynamic_template_data`), no provider text, not ambiguous | pass. A normal send cannot reach a SendGrid 400 because Magic Mail validates first; a template row with a malformed id does. Observation: a well-formed but unknown `d-…` id got 400 in most runs but 200 in two sandbox runs, so it is not used as the trigger |
| 401 wrong key: mapped message and hint                                                                                                                                      | pass                                                                                                                                                                                                                                                            |
| 429                                                                                                                                                                         | not forced (would abuse the account quota); rate-limit headers are present on list calls                                                                                                                                                                        |

### Account wizard (real API)

| Check                                                                | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| connection test with the full key, US host                           | pass; the test mail went out in sandbox mode (asserted)                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| invalid key                                                          | `SendGrid API request failed: 401`, hint `SENDGRID_UNAUTHORIZED`                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| temporary restricted key with only `mail.send`                       | connection test passes; template sync reports `AUTH`                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| temporary restricted key with only `templates.read` (no `mail.send`) | connection test fails. SendGrid answers **401**, not 403, for a valid key without the Mail Send scope. First run: the wizard showed the "key rejected" hint (`SENDGRID_UNAUTHORIZED`). **Fixed on #23 (`2b02744`):** after a SendGrid 401/403 the test makes one read-only `GET /v3/scopes` (200 for this key) and now shows `SENDGRID_MISSING_MAIL_SEND`; the request log of the test is exactly `POST /v3/mail/send 401`, `GET /v3/scopes 200`. The key is deleted in the same test and `GET` returns 404 |
| EU region                                                            | not testable: the account has no EU regional subuser                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

### Provider templates (real API)

| Check                                                                                                                                                                                    | Result |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| sync incl. pagination (page size 1), variable detection and preview on the configured template                                                                                           | pass   |
| sandbox template send (`template_id`), unknown key refused in the plugin, 1 MB data bound                                                                                                | pass   |
| temporary template: no version → `unpublished`; first active version → `ok`, preview and `name` variable; second active version → new `activeVersion`, variable `order.id`, send uses it | pass   |
| deleted and re-created under the same name → `matchedByName`, same key, new id, send uses the new id; deleted again → `missing`, send refused before any request                         | pass   |

### Suppression lists (real API, read only)

`GET /v3/suppression/{bounces,blocks,spam_reports,invalid_emails}?limit=1` and `GET /v3/tracking_settings`: 200, nothing written. Magic Mail does not call these endpoints; its suppression list is fed by the Event Webhook.

### Objects created at SendGrid and deleted

| Object                                                                                                                                    | Created | Deleted and checked                                                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------- |
| restricted API keys `magic-mail-live-<run>-mail.send` and `-templates.read` (one pair per run of `sendgrid-account.live.test.js`, 5 runs) | yes     | yes: `DELETE` 204, `GET` 404, no `magic-mail-live-*` key left (account back to its 1 key)           |
| dynamic templates `magic-mail-live-<run>-template` (2 per run) with their versions                                                        | yes     | yes: `DELETE` 204, `GET` 404, no `magic-mail-live-*` template left (account back to its 1 template) |
| Event Webhook `magic-mail-live-acceptance` (signed)                                                                                       | yes     | yes: signing turned off, webhook deleted (204)                                                      |

Event Webhook settings before and after, compared with a saved `GET` of `/v3/user/webhooks/event/settings`, `/settings/all` and `/settings/signed`: before, no webhook, disabled, no signing key; after the run, all three responses are **identical** to the saved ones.

### Event Webhook end to end

Setup:

- Isolated Strapi 5.62.0 host on `127.0.0.1:1471`, Node 22.23.1, SQLite, random secrets in `.env`, egress blocked by the preload (0 outbound attempts logged).
- Plugin installed from `npm pack` of `0c13394` (4.6.1 tarball).
- Two SendGrid accounts with dummy API keys (the host never calls SendGrid): A with SendGrid's verification key, B with a local P-256 key.
- 11 synthetic email logs (`@example.test`); setting "Block hard-bounced recipients" on.
- A local filter proxy forwarded only `POST /api/magic-mail/webhooks/sendgrid/<account A>` and answered 404 to everything else. A cloudflared quick tunnel pointed at that proxy and was stopped right after the run. One unknown external `GET` reached the fresh tunnel and got 404.

| Check                                                                                               | Result                                                                                                                   |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| unsigned POST through the tunnel                                                                    | 401                                                                                                                      |
| SendGrid's real test event (`POST /v3/user/webhooks/event/test` 204), signed, 11 events, 3719 bytes | 200: signature verified, 8 delivery events parsed (processed, open and click are ignored), none matched a log (fake ids) |
| real test event replayed unchanged                                                                  | 200, nothing processed twice                                                                                             |
| real test event with one byte changed                                                               | 401                                                                                                                      |
| real signature on account B (other key)                                                             | 401                                                                                                                      |
| B: wrong signature, missing headers, garbage signature, timestamp 2 h old, timestamp 2 h ahead      | 401 each                                                                                                                 |
| B: delivered / duplicate `sg_event_id`                                                              | confirmed once; the duplicate created no second event                                                                    |
| B: deferred / hard bounce 5.1.1 / blocked / dropped "Bounced Address" / dropped "Expired"           | `deferred` / `bounced` + suppressed / `blocked`, not suppressed / `bounced` + suppressed / `failed`                      |
| B: spam report / unsubscribe / unsubscribe then group_resubscribe                                   | complained, not suppressed (`suppressComplaints` off) / unsubscribed / unsubscribed then resubscribed                    |
| B: newer delivered and older deferred in one batch; later delivered and deferred on a bounced log   | delivered wins; bounced stays bounced                                                                                    |
| B: bounce of a cc recipient                                                                         | log unchanged (primary only), event with masked address, address suppressed                                              |
| B: 768 KB batch / 1 MiB minus 2 KB                                                                  | 200 / 200                                                                                                                |
| B: above 1 MiB with `Content-Length` / chunked without it                                           | 413 / 413                                                                                                                |

**Finding:** SendGrid's test event does not match any log, but its `bounce` and `dropped: Bounced Address` events still put SendGrid's sample address (`e***@test.com`) on the suppression list. Unmatched hard bounces are suppressed by design (the address bounced), so pressing "Test your integration" in SendGrid adds that sample address. This is harmless but visible in the list. Not changed here.

Teardown: tunnel, proxy and host stopped; host `.env`, database, captured requests and local keys deleted.

## Not covered in this release

- Brevo, Amazon SES, and SMTP/OAuth accounts (these have no hosted templates).
- Per-locale template maps.
- Queueing provider-template mails in the outbox.
- Open and click tracking for provider-rendered bodies.
- Rate-limit (429) handling was not forced against the live APIs; it is covered by the fake-server and contract suites.
- Mailgun against the real API (credentials pending), SendGrid EU regional subusers (no EU subuser in the test account).
