# [4.11.0](https://github.com/Schero94/Magic-Mail/compare/v4.10.2...v4.11.0) (2026-11-26)


### Features

* preview sent emails with their variables, masked at store time, with a View email content permission ([#40](https://github.com/Schero94/Magic-Mail/issues/40)) ([f4a6f39](https://github.com/Schero94/Magic-Mail/commit/f4a6f396b7c6c70e66453b39e5fd4ccfa2c68a49))


### Added

* **Email preview with variables (Analytics).** Click a row in "Recent emails" (or press Enter or Space on a focused cell) to open the email's details in a side sheet with three tabs:
  * **Overview:** delivery status and reason, account and provider, accounts tried, template, attempted and accepted times, opens and clicks.
  * **Preview:** the email as it was sent, in a sandboxed frame (`sandbox=""`, no scripts, no links, strict CSP). Remote images stay blocked until you choose "Load images", so viewing never loads a tracking pixel or reveals the admin's IP. Desktop and mobile width, and a plain-text view.
  * **Variables:** a key and value list of the data the email was rendered with. Nested values expand, long values have "Show more", and hidden values show a "Hidden" badge.
* **How the preview is built.** For each send, Magic Mail now stores the template (documentId plus a hash of the exact content that was rendered, which finds the right version in the version history), the template data and the `{{system.*}}` tags. The preview re-renders with the same Mustache function and the same outbound sanitiser as sending. If that template version no longer exists, the preview says so and still shows the subject and the variables. The subject and account come from the delivery log.
* **Optional exact copy.** The new setting "Store a copy of sent emails" (off by default) also keeps the final HTML and text, Brotli-compressed and capped at 512 KB. The preview then shows it as "Exact copy". It is stored before tracking is added, and the preview removes tracking again in any case.
* **Privacy at store time.** Secrets are masked before anything is written, so the database never holds them:
  * keys that name a secret (password, token, secret, otp, jwt, key, code, reset, confirmation, session, cookie, auth, nonce, ticket, signature, credential, pin, cvv, iban and similar; harmless compounds such as postalCode or countryCode stay readable);
  * values that look like tokens (JWTs, 32+ hex characters, UUIDs, long random strings);
  * URLs with tokens: query parameters such as `code`, `confirmation`, `token`, `loginToken`, `access_token` or `signature`, token-like path segments and fragments. This covers the Strapi reset-password and email-confirmation links and magic links;
  * in the optional copy, the same URLs plus every value that was masked in the variables.
  
  New settings "Always hide these variables" (denylist) and "Never hide these variables" (allowlist) take names or dotted paths. The allowlist never unmasks JWTs or token links.
* **New permission "View email content"** (`plugin::magic-mail.content.read`, section "Email content"). Super Admins have it automatically. Without it, a row still opens the Overview, but Preview and Variables say "No permission" and the API answers 403. Every view of email content writes an `[AUDIT]` server log line (log documentId, admin id, auth strategy; no content, recipient or variable).
* **Retention.** Stored variables and copies are deleted after `emailContentRetentionDays` (setting, default 30, 1 to 365) and never outlive their log (`tracking.logRetentionDays`, single delete and "Clear all" remove them too). The cleanup runs in the existing tracking maintenance job, under a database lease, so one process does it across replicas.
* `GET /magic-mail/analytics/emails/:emailId/content[?images=1]` (admin API, `read` + `content.read`). The content type is private, not in the Content API and not in GraphQL (shadow CRUD stays disabled for every Magic Mail type).
* `npm run test:http`: HTTP tests against a running isolated Strapi host (401, 403, masking, no tracking, Content API and GraphQL closed).

### Changed

* **Analytics list readability.** Rows are visibly clickable; the subject is the row's button. Long template names are shortened with a tooltip. A hint above the list explains what a click shows.
* **Opened / Clicked are honest about tracking.** Each new log records what tracking Magic Mail really added (`metadata.trackingApplied`). When the pixel or the link rewriting was not applied, the cell shows "Not tracked" instead of a misleading "No". When tracking is switched off, or Magic Mail has no public URL for its tracking links, a notice above the list says so and links to the settings. `GET /magic-mail/analytics/stats` returns a new `tracking` object (`openTracking`, `linkTracking`, `publicUrl` booleans).
* `GET /magic-mail/analytics/emails/:emailId` also returns `accountProvider`.

### Migration

* **New table** `magic_mail_email_contents` (content type `plugin::magic-mail.email-content`). Strapi creates it on start; no manual step.
* **New settings columns** on `magic_mail_settings`: `store_email_variables` (default on), `store_full_email` (default off), `email_content_retention_days` (default 30), `variable_denylist`, `variable_allowlist`. Existing rows read the defaults.
* **Grant "View email content"** to every role other than Super Admin that should see the preview; it is not granted automatically.
* **Existing logs** have no stored variables. Their preview says so; nothing is filled in retroactively.
* If your host's admin CSP blocks remote images, "Load images" can only show images from hosts allowed in `img-src` (`config/middlewares.js`, `strapi::security`).
* Mails sent through the Content API only get click tracking for hosts in `tracking.allowedLinkHosts` (unchanged security rule since 4.0). Their Clicked cell now reads "Not tracked".

## [4.10.2](https://github.com/Schero94/Magic-Mail/compare/v4.10.1...v4.10.2) (2026-11-25)


### Bug Fixes

* **admin:** clearer click paths, consistent wording and spacing ([#39](https://github.com/Schero94/Magic-Mail/issues/39)) ([d77ed79](https://github.com/Schero94/Magic-Mail/commit/d77ed796344a72ac9c15382372825142e82a5ae8))


### Fixed

* Outbox: the try count includes the failed direct send of a captured mail. A mail that failed once (for example `SMTP_451`) and was then sent by the queue showed "1 of 3"; it now reads "2 tries, 1 failed". The server's `attempts` still counts queue tries only (API unchanged); the admin adds the first try for `createdVia: capture-on-failure`. Waiting mails read "2 of 4 tries, 2 failed".
* Outbox mail drawer: the "Error history" heading no longer sits on its first card (12px heading gap, 24px between sections), and the drawer body uses the header's 24px padding so title and content share one edge. The version history drawer uses the same padding.
* Outbox mail drawer: "Next try" is shown only while the mail waits for one, and "Not sent after" is hidden once the mail was sent or discarded.

### Changed

* "Source: service" (monospace) reads "Sent by: Plugin service in server code"; the other sources are "Strapi email plugin" and "Content API (API token)".
* English labels use sentence case like the rest of the admin (tabs "Email accounts", "Routing rules", "Email templates"; the routing rule dialog; settings titles; analytics table headers).

## [4.10.1](https://github.com/Schero94/Magic-Mail/compare/v4.10.0...v4.10.1) (2026-11-25)


### Bug Fixes

* security audit 2026-11 (IMAP secret re-entry, GraphQL types off, bounce and CSS ReDoS, forged bounce suppression, webhook scoping) ([#37](https://github.com/Schero94/Magic-Mail/issues/37)) ([678b4c4](https://github.com/Schero94/Magic-Mail/commit/678b4c4cf94886b49a23eebc4e653c09f42e773c))


### Security

Findings of the November 2026 security audit (IDs `MM-SA-*`, each with a regression test in `tests/security-audit-2026-11.test.js` or next to the code it covers).

* **MM-SA-01 (high): changing the bounce-monitoring IMAP host no longer sends a stored secret to the new host.** The rule that a changed server or identity requires the stored secret again only covered `config`. An admin with `manage` could set `bounceMonitor.imap.host` to their own server, and the next poll logged in there with the stored SMTP password ("Use the SMTP login") or IMAP password. When the effective IMAP host or the choice of secret changes, the secret that will be sent must now be entered in the same request. The host the server derives from the account's own SMTP host needs no re-entry.
* **MM-SA-02 (high with `@strapi/plugin-graphql`): the plugin's content types are no longer in the GraphQL schema.** GraphQL generates queries and mutations for every content type except `admin::` ones. Email logs (recipients, subjects), events, link targets, suppressions, templates, routing rules, settings and the outbox were readable with any read-only API token and writable with a full-access token, bypassing the plugin's admin permissions. `register()` now disables GraphQL shadow CRUD for every `plugin::magic-mail.*` type.
* **MM-SA-03 (high when bounce monitoring is on): ReDoS in the bounce parser.** Anyone can mail the monitored mailbox. A fake mailer-daemon message with a long single-line body, or a body of blank lines, blocked the Strapi event loop for minutes (quadratic `domain .* could not be found` and multiline `^\s*` patterns, the first one once per listed recipient). The patterns are bounded and the header scan is line based.
* **MM-SA-04 (medium): a forged delivery report can no longer suppress any address.** With "Block hard-bounced recipients" on, a hand-written RFC 3464 report naming any address put it on the suppression list, so password-reset and confirmation mails to that person were silently dropped. A mailbox report now suppresses only when it refers to a mail Magic Mail sent (outbox header or that mail's random Message-ID) and names one of that mail's recipients. Recipient-only matches are still recorded, but no longer suppress.
* **MM-SA-05 (medium): the outbound CSS check is linear and sees through CSS escapes.** One 100 000-character `style` value in content-API HTML blocked the event loop for about 5 seconds per send. `@\69mport`, `@im/**/port` and `java\73 cript:` also slipped past the check. Comments are removed and escapes resolved before the check, and the pattern has no overlapping quantifiers.
* **MM-SA-06 (medium, admin): core-template validation is linear and as strict as users-permissions.** An unclosed `{{` or `<%=` followed by a long run of whitespace blocked the event loop for minutes in one request. `$${...}` passed although users-permissions rejects every `${...}`. Placeholder decoding at send time was quadratic on unclosed `{{`.
* **MM-SA-07 (low to medium): Brevo and Mailgun events only touch their own account's logs.** Mailgun signs only timestamp and token, and Brevo uses a static bearer token. Whoever held one account's webhook secret could mark mail sent through another account as bounced, emit delivery events for it and suppress its recipient. SendGrid and SES sign the whole payload and still match across accounts, so a shared webhook URL keeps working there.
* **MM-SA-08 (low, admin): the mailbox test is no longer a port scanner.** It answered `CONNECTION_FAILED`, `TIMEOUT` and `TLS_FAILED` for refused, filtered and open non-TLS ports on any host and port. All three now reach the client as `CONNECTION_FAILED`, with the detail in the server log, as the SMTP account test already did.
* **MM-SA-09 (low, admin): template import uses the create rules.** Each imported template is validated like a created one (lengths, no CR/LF in the subject, numeric reference id), with at most 100 per request. Before, a reference id such as `{"$gt": 0}` became a query operator that selected an existing template to overwrite. Failed entries return fixed texts instead of raw error messages.
* **MM-SA-10 (low): linear JWT detection in tracked links.** The JWT pattern in the tracking-link policy was polynomial: about 80 ms per check for an 8 KB link fragment.
* **MM-SA-11 (low): webhook answers no longer reveal account ids.** For a known Mailgun or SES account a malformed body answered 400, while every other id answered 401. Every failure before the request is authenticated now answers 401.
* **MM-SA-12 (low): Microsoft Graph raw downloads are capped while streaming.** Without a `Content-Length`, a large message matching the bounce heuristics was read into memory in full before the 1 MB check.
* Fallback Message-IDs use `crypto.randomBytes` instead of `Math.random()`.

### Migration

* **Bounce monitoring:** saving a new IMAP host, or switching to "Use the SMTP login", now asks for the password that will be used (SMTP or IMAP) again. Turning monitoring on with the suggested host of the SMTP server, and port or TLS changes on the same host, need no re-entry.
* **Suppression from the mailbox:** only reports bound to a sent mail suppress. New email logs keep keyed hashes of every to/cc/bcc address in `metadata.recipientHashes` (HMAC with a purpose key derived from `MAGIC_MAIL_ENCRYPTION_KEY`; cc and bcc addresses are never stored in clear text), so cc and bcc bounces keep suppressing. For mail sent before this version, only reports for the `to` recipients suppress.
* **GraphQL:** Magic Mail types disappear from the GraphQL schema. If you queried them on purpose, use the admin API instead.
* **Brevo and Mailgun:** an event for mail sent through another Magic Mail account is now reported as unmatched. Point each account's webhook at its own URL (`/api/magic-mail/webhooks/<provider>/<accountId>`).
* **Bounce monitor status:** `TIMEOUT` and `TLS_FAILED` are reported as `CONNECTION_FAILED`. Template import returns `error: "Invalid template data"` (with `details`) or `"Import failed"` for a failed entry.

### Verification

* Each finding is reproduced by a regression test that fails on v4.10.0 and passes with this change. MM-SA-01 to MM-SA-09 and MM-SA-11 were also reproduced on v4.10.0 and shown fixed on an isolated Strapi 5.64.0 host built from the packed tarballs (with `@strapi/plugin-graphql` 5.64.0, SQLite, random secrets, outbound connections blocked, local fake SMTP, IMAPS and Mailgun webhook requests, synthetic data). On v4.10.0 the host stalled for about 36 s on one bounce mail (MM-SA-03), 5.5 s on one API send (MM-SA-05) and 6.5 s on one core-template save (MM-SA-06); with this change each took under 60 ms. MM-SA-10 is too small to measure end to end there, and MM-SA-12 needs the Microsoft Graph host; both are covered by their unit tests only.

# [4.10.0](https://github.com/Schero94/Magic-Mail/compare/v4.9.1...v4.10.0) (2026-11-19)


### Features

* admin password reset, startup check and events for provider-template core emails ([#30](https://github.com/Schero94/Magic-Mail/issues/30)) ([cf3ef8a](https://github.com/Schero94/Magic-Mail/commit/cf3ef8a34dc4639c5f1f0a47d2d56a18eb780d59))

## [4.9.1](https://github.com/Schero94/Magic-Mail/compare/v4.9.0...v4.9.1) (2026-11-19)


### Bug Fixes

* **mailgun:** refuse deleted Mailgun templates before sending; no suppression for ESP blocks ([#29](https://github.com/Schero94/Magic-Mail/issues/29)) ([4ac0ba3](https://github.com/Schero94/Magic-Mail/commit/4ac0ba39c5a6c603c199e4e7100c8a01833b1655))


### Added

* **Admin password reset through a provider template.** The admin panel's "Forgot password?" mail is the third core email (`admin-forgot-password`). Magic Mail recognises the `sendTemplatedEmail` call of `@strapi/admin` 5.x and, when a SendGrid or Mailgun template is chosen under **Email Templates → Core emails → Design** (super admins only), sends it with payload v1 `{ user, url, token, adminUrl, serverUrl, meta }`. Strict by default; **send the Strapi admin email instead** is the opt-in fallback. Without a choice nothing changes.
* **Startup check of core-email templates.** About 20 seconds after start (non-blocking) every core email that uses a provider template is checked; a stale template list is synced first. Unsynced or unusable templates, and Mailgun templates without a Subject header (`MAGIC_MAIL_PROVIDER_TEMPLATE_NO_SUBJECT`; core emails do not pass the Strapi subject on), are logged with type, key and code (never values), and the dashboard and Core emails notices name each affected mail with its reason and the time of the check.
* **Events** `magic-mail.provider-template.failed` and `magic-mail.provider-template.fallback` on `strapi.eventHub` with `{ key, code, coreEmailType, fallback? }` (no personal data).
* **`meta.strapiVersion`** in the core-email payload v1 (additive), and a one-time warning per core email when `url` can not be built because the base URL is empty or relative.
* **SendGrid subject for dynamic templates.** A `subject` passed with a SendGrid provider template is copied into `dynamic_template_data.subject` when the data has none, so a template whose subject line is `{{subject}}` renders it (SendGrid ignores the top-level subject for dynamic templates).
* **Test sends** of a provider template used by several core emails include sample values for every one of them.
* **Docs:** what a provider template replaces for core emails (subject, body, shipper email) and how Reply-To is kept; a short hint in the Core emails tab.

### Fixed

* **Mailgun: a template deleted at Mailgun is no longer logged as sent.** Mailgun accepts a send that names a template it does not have (200 "Queued") and drops the message afterwards (event `failed`, delivery-status 621 "Template not found", retried every 10 minutes). Before a template send MagicMail now checks the template at Mailgun (`GET /v3/{domain}/templates/{name}?active=yes`, account-level templates `GET /v4/templates/{name}?active=yes`). A deleted template, or one without an active version, fails with `MAGIC_MAIL_PROVIDER_TEMPLATE_UNAVAILABLE` before any message is sent: another account that still has the template sends instead, else the configured Magic Mail fallback template, else the error is returned and the delivery log row is `failed`. A successful check is cached for 60 seconds per account and template (one extra request per template and minute for bulk sends, parallel sends share one check). If the check itself fails (network, timeout, 401/403, 429, 5xx), the send goes ahead and a warning is logged.
* **Mailgun webhooks: ESP blocks and soft bounces no longer suppress the recipient.** A permanent failure with reason `espblock` (the recipient's provider refused the sender, for example `550 5.7.40`) is now recorded as **Blocked** and never added to the suppression list; Mailgun itself does not put such addresses on its bounce list. A permanent failure that Mailgun classifies as `bounce-type: soft` is still recorded as **Bounced** but not suppressed. Only permanent hard bounces suppress, as before. Template-not-found failures (code 621) get the reason code `MAILGUN_TEMPLATE_NOT_FOUND` (Deferred while Mailgun retries, Failed when final) and never suppress.

### Migration

* Nothing to do. Mailgun template sends make one extra read request per template and minute; the API key needs read access to templates, which provider-template sync already requires. Addresses suppressed earlier because of a Mailgun `espblock` can be removed under **Plugin Settings → Bounces and recipient checks → Suppressed recipients** (source `mailgun`, reason code `MAILGUN_ESPBLOCK_*`).
* Nothing to do. Core-email payload v1 only gains keys (`meta.strapiVersion`); existing keys and the golden SendGrid/Mailgun payloads are unchanged. `GET /designer/core-designs` returns a third entry `admin-forgot-password` and new fields (`problem`, `lastSyncedAt`, `checkedAt`, `editable`). SendGrid template sends with a `subject` and no `subject` in `data` now carry `subject` in `dynamic_template_data`; templates that do not use `{{subject}}` render as before.


# [4.9.0](https://github.com/Schero94/Magic-Mail/compare/v4.8.0...v4.9.0) (2026-11-19)


### Features

* Brevo and Amazon SES accounts, template languages and provider open/click tracking ([#28](https://github.com/Schero94/Magic-Mail/issues/28)) ([b2c8253](https://github.com/Schero94/Magic-Mail/commit/b2c8253a04d5e51af00b425e9853a23f613057ec))


### Added

* **Brevo accounts.** Send through the Brevo transactional API (`api-key` header) with sender, cc/bcc, reply-to, attachments, filtered headers and the `magicmail_id` correlation header. **Check connection** reads the Brevo account without sending and names the cause of a failure (invalid key, IP not authorised, account under validation, no credits). Brevo templates sync like SendGrid and Mailgun templates and are sent with `templateId` and your `data` as `params` (a Brevo template writes `{{ params.name }}`, you pass `name`). Delivery webhooks are authenticated with a random webhook token MagicMail creates per account (**Show webhook token**, **Replace token**).
* **Amazon SES accounts.** Send through the SES v2 API in any commercial or GovCloud region, signed with AWS Signature Version 4 (own implementation, tested against the official AWS SigV4 test suite; no AWS SDK). Credentials are an IAM access key or the server's environment variables (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`). **Check connection** shows sandbox and sending status. SES templates sync and are sent with `TemplateData`. Bounces, complaints, deliveries, delays, rejects and opens/clicks arrive through an SES configuration set → SNS → HTTPS subscription; every SNS message is checked against the configured topic ARN and the SNS signature, and the subscription is confirmed automatically.
* **Language versions for provider templates.** A provider template can map languages (`de`, `fr`, `pt-BR`, …) to other synced templates of the same provider. `send({ providerTemplate, locale })` picks the exact language, then the base language, then the default; without `locale` the recipient's stored locale is used when the users-permissions user type has a `locale` attribute. Core emails use the user's locale and send it as `meta.locale`; test sends use the admin's interface language or `language`. Unusable versions are skipped.
* **Opens and clicks of provider-rendered mails.** New setting **Count provider opens and clicks** (off by default; shown only with a SendGrid, Mailgun, Brevo or SES account). Provider-template sends then ask the provider to track, and the provider's open and click webhook events (SendGrid, Mailgun, Brevo, SES) are counted in Email Analytics, only for those mails, so nothing is counted twice. Clicked links are stored as origin and path only.
* **admin API:** `POST /magic-mail/accounts/:accountId/check` (`test-send`, read-only), `POST /magic-mail/accounts/:accountId/webhook-token` (`manage`, browser sessions only, audit-logged), `locales` in `PUT /magic-mail/provider-templates/:key/settings`, `language` in `POST /magic-mail/provider-templates/:key/test-send`. Content API: `POST /api/magic-mail/webhooks/brevo/:accountId`, `POST /api/magic-mail/webhooks/ses/:accountId`.

### Security

* Brevo webhooks have no provider signature; MagicMail requires a 256-bit random token per account (constant-time comparison, encrypted at rest, revealed only to browser sessions with `manage`, every reveal logged without the token). SNS messages for SES are verified (topic ARN, certificate host `sns.<region>.amazonaws.com` of the topic's region, no redirects, size-capped certificate fetch, SignatureVersion 1 and 2) before anything is processed. AWS credentials are never read from instance-metadata or ECS endpoints. Provider error bodies are never logged or returned; Brevo and SES connection checks return no personal data.

### Migration

* Brevo, Amazon SES, language versions and provider tracking: nothing to do. The email log gets an optional `providerTracking` flag and the settings an optional `providerTracking` switch (off). SendGrid, Mailgun and SMTP requests are unchanged (golden payload tests). `PUT /provider-templates/:key/settings` now accepts `locales`, and `fallbackTemplateReferenceId` is optional there (at least one of the two is required).

### Verification

* **Brevo and Amazon SES are marked Beta in the account wizard.** Both are verified against their official API descriptions (Brevo OpenAPI files, the Amazon SES v2 Smithy model), by contract tests on every request and response, by the 38 official AWS SigV4 test vectors and by integration tests against fake servers built from those descriptions, plus a browser acceptance run on Strapi 5.62.0 (SQLite and PostgreSQL). **They have not yet been tested against the live Brevo and Amazon SES APIs.** Only a live run (`npm run test:live` with the `BREVO_*` and `SES_*` variables) can confirm:
  1. which header Brevo sends for bearer-token webhook authentication (`Authorization: Bearer <token>` is assumed; the custom header `X-Magic-Mail-Webhook-Token` also works);
  2. the wording of Brevo's error messages that select the specific hints (IP not authorised, sender not verified, unknown template); other errors fall back to the hint for their status code;
  3. that Amazon SES accepts the per-message `ConfigurationOverrides.Tracking` field used for provider open and click tracking;
  4. that SES answers `404 NotFoundException` for an unknown template on `SendEmail`;
  5. the verification of a real SNS signing certificate (the tests use self-signed certificates; trust rests on HTTPS to the fixed `sns.<region>.amazonaws.com` host).

# [4.8.0](https://github.com/Schero94/Magic-Mail/compare/v4.7.0...v4.8.0) (2026-11-18)


### Features

* provider templates for SendGrid and Mailgun ([#20](https://github.com/Schero94/Magic-Mail/issues/20)) ([184115d](https://github.com/Schero94/Magic-Mail/commit/184115dde3f513e72bec2343d2dacd9112c324e8))


### Added

* **provider templates:** SendGrid dynamic templates and Mailgun templates (domain and account level) appear read-only under **Email Templates → Provider templates** as soon as a SendGrid or Mailgun account exists. Sync reads them with the stored account key (never writes to the provider), follows the providers' pagination, uses the EU hosts for EU accounts, and refreshes itself when the list is older than 10 minutes. A template whose remote id disappears but whose name still exists on the account (a database moved to another environment) is matched by name.
* **provider templates:** preview dialog with a sandboxed preview, the detected variables, a code example, a test send (to your own admin address by default, with the same sample values as local templates), an optional local fallback template, and **Copy as Magic Mail template** (HTML copy; Handlebars blocks become Mustache sections and anything that does not carry over is listed).
* **sending:** `send({ to, providerTemplate: '<provider>:<slug>', data })` sends a synced template. The same `data` object that local templates render with Mustache is sent as SendGrid `dynamic_template_data` or Mailgun `t:variables`, converted to plain JSON (dates as ISO strings, no functions, no cycles) and checked against the provider limits (Mailgun: 16 KB for all send options; Magic Mail bounds template data to 1 MB). Routing, rules, failover, quotas and logs work as before, but only between accounts that have the template. Strict by default: a missing template or a provider refusal is a clear error; a local fallback template is sent only when it is configured and no provider accepted the message. The log stores the template key and variable names, never the values.
* **core emails:** password reset and email confirmation can use a provider template (**Core emails → Design**). Magic Mail sends the familiar users-permissions names (`URL`, `TOKEN`/`CODE`, `USER`, `SERVER_URL`, `ADMIN_URL`) plus `url` (the finished link), `baseUrl`, `serverUrl`, `adminUrl`, `user`, `token`/`code` and `meta` (`templateKey`, `payloadVersion: 1`, `coreEmailType`). `USER` contains only `id`, `email`, `username`, `firstname`, `lastname`. Optional fallback to the Magic Mail designer version. A red notice on the Core emails tab and the dashboard names core emails whose template is not available.
* **templates:** **Convert for SendGrid or Mailgun** in the code snippets dialog turns a local template's Mustache logic into Handlebars for upload at the provider.
* **admin API:** `GET /magic-mail/provider-templates`, `POST /magic-mail/provider-templates/sync`, `GET /magic-mail/provider-templates/:key`, `POST /magic-mail/provider-templates/:key/test-send`, `PUT /magic-mail/provider-templates/:key/settings`, `POST /magic-mail/provider-templates/:key/copy`, `GET /magic-mail/designer/templates/:id/provider-html`, `GET /magic-mail/designer/core-designs`, `PUT /magic-mail/designer/core/:coreEmailType/design`. Existing permissions: `read` (sync is read-only at the provider and rate limited), `test-send`, `manage`; the core-email routes also need the users-permissions email-template permissions.

### Security

* Provider ids are never accepted from callers, only synced keys. The public Content API send routes do not accept `providerTemplate`.
* Template previews render in a sandboxed iframe without scripts. Provider requests go only to the fixed SendGrid and Mailgun hosts, with timeouts and response size limits; paging URLs from the provider are never requested directly.

### Migration

* Provider templates: nothing to do. A new collection `magic_mail_provider_templates` is created on start; nothing changes for accounts without SendGrid or Mailgun. Sends without a provider template are byte-identical to 4.7.0 (golden payload tests). Provider-template sends are not queued in the outbox in this release.
* To sync SendGrid templates, the SendGrid key also needs **Template Engine → Read Access** (sending alone needs only **Mail Send**).

### Verification

* SendGrid: tested live against the real SendGrid API on 2026-11-18, every send in sandbox mode: template sync with pagination, variable detection and preview, template sends, unknown and malformed template ids, the 1 MB data bound, and the template life cycle with temporary templates (no version, a first and a second active version, deleted and re-created under the same name, deleted for good). Temporary objects were deleted afterwards. The EU host could not be tested live (no EU subuser).
* Mailgun: verified against Mailgun's official OpenAPI specification and with tests, but not yet against the live Mailgun API. Please report anything unexpected.

# [4.7.0](https://github.com/Schero94/Magic-Mail/compare/v4.6.3...v4.7.0) (2026-11-18)


### Features

* **providers:** SendGrid EU region and safer SendGrid/Mailgun send paths ([#23](https://github.com/Schero94/Magic-Mail/issues/23)) ([f949c98](https://github.com/Schero94/Magic-Mail/commit/f949c98f243fb01ebe50f568da9ac9b40b69600d))


### Added

* **SendGrid EU regional subusers.** A SendGrid account now has a region: **Global** (default, `api.sendgrid.com`) or **EU** (`api.eu.sendgrid.com`). If your SendGrid key belongs to an EU regional subuser, open the account, choose region **EU** and save. Existing accounts keep the global host; nothing changes for them. An unknown region is rejected when the account is saved.
* **Mailgun sends carry Magic Mail metadata.** Each Mailgun mail gets the variables `magicmail_email_type`, `magicmail_priority` and `magicmail_id` (the email log id) and one tag with the email type (`transactional`, `marketing` or `notification`), so you can filter Mailgun's logs and webhooks by type. SendGrid mails carry `magicmail_id` as a custom argument. Mailgun shows variables to recipients in the `X-Mailgun-Variables` header; they contain no personal data.

### Fixed

* **Duplicate recipients no longer make SendGrid reject the whole email.** SendGrid refuses a mail when an address appears twice in to, cc or bcc. Magic Mail now sends every address once (the first occurrence wins, compared without case) and drops a cc or bcc list that only repeated other addresses. Other providers are unchanged (Mailgun ignores duplicates itself).
* **SendGrid keeps recipient names.** `Ada Lovelace <ada@example.com>` arrives as "Ada Lovelace" instead of the bare address.
* **The SendGrid connection test names a missing Mail Send permission.** SendGrid answers a key without the Mail Send permission with the same 401 as a wrong key, so the test used to say "SendGrid rejected the API key". After a 401 or 403 the test now makes one read-only call (`GET /v3/scopes`): a valid key without Mail Send gets its own hint (`SENDGRID_MISSING_MAIL_SEND`), a wrong key keeps the old one. Nothing from SendGrid's answer is shown.
* **Oversized emails are rejected before upload with a clear message.** SendGrid accepts less than 30 MB and Mailgun 25 MB per message. Magic Mail now checks the size before calling the provider and answers with a validation error (`MAGIC_MAIL_MESSAGE_TOO_LARGE`) instead of uploading the whole mail and getting a vague rejection. All attachments of one email together may be at most 40 MB raw with every provider (each file stays limited to 25 MB). A provider's own "too large" answer (HTTP 413) gets the same code.
* **Magic Mail turns off Mailgun's and SendGrid's own open/click tracking when it tracks itself, so links are no longer wrapped twice** and opens are not counted twice. Only the part Magic Mail really applied is switched off; when Magic Mail does not track (tracking off, no public URL), the provider's tracking settings apply as before.
* **Clear error when headers are too large for Mailgun.** Mailgun allows 16 KB for all headers and options of one message. A Mailgun message above that is now refused before sending with `MAGIC_MAIL_MESSAGE_TOO_LARGE` instead of a bare Mailgun 400. Custom headers are still sent exactly as before; nothing is dropped or shortened.
* **SendGrid's reserved headers are filtered.** A caller header `X-SG-ID` or `X-SG-EID` used to make SendGrid reject the mail; Magic Mail now drops them like its own reserved headers.
* **Clearer provider failures.** Failed SendGrid and Mailgun calls now carry the provider and, for SendGrid, the names of the rejected fields (for example `personalizations.0.cc`), never the provider's message text (it can contain addresses). The error message stays `SendGrid API request failed: <status>`. The server log names the region. When SendGrid answers 429 with a reset time, a queued retry waits at least until then.

### Verification

* SendGrid: every change above was tested live against the real SendGrid API in sandbox mode on 2026-11-18 (sending, account check, webhooks). The EU host could not be tested live (no EU subuser).
* Mailgun: the changes are verified against Mailgun's official OpenAPI specification and with tests, but not yet against the live Mailgun API. Please report anything unexpected.

### Migration

* If you use a SendGrid EU regional subuser, set that account's region to **EU**.
* If you listen to SendGrid or Mailgun webhooks yourself, you will see the new `magicmail_*` custom arguments / variables and the Mailgun tag.

## [4.6.3](https://github.com/Schero94/Magic-Mail/compare/v4.6.2...v4.6.3) (2026-11-18)


### Bug Fixes

* **admin:** state that the dialogs are labelled by their title ([#27](https://github.com/Schero94/Magic-Mail/issues/27)) ([0435754](https://github.com/Schero94/Magic-Mail/commit/0435754f9154c75c2ee5a3039f93500c87c04555))


### Fixed

* The dialogs and drawers (add or edit account, test email, routing rule, template code snippets, template test send, version history, outbox details) no longer log the Radix warning "Missing `Description` or `aria-describedby={undefined}`" in the browser console. Their title is their accessible name, and they now say so.

### Tests

* `npm run test:admin`: StrictMode tests for every admin entry point (no duplicate requests, no leaked timers, listeners, connections or observers after unmount, no console errors or warnings), also run against React 19 in an informational CI job.

## [4.6.2](https://github.com/Schero94/Magic-Mail/compare/v4.6.1...v4.6.2) (2026-11-18)


### Bug Fixes

* keep display names intact when parsing recipient lists ([#25](https://github.com/Schero94/Magic-Mail/issues/25)) ([0769739](https://github.com/Schero94/Magic-Mail/commit/076973919d4619f333ddce20ed3bb0a7a5e56407))


### Fixed

* **Recipient names with commas, quotes or angle brackets arrive unchanged.** `"Doe, Jane" <jane@example.com>` in to, cc or bcc used to be split at the comma and partly lower-cased, so the recipient saw the name "doe,  Jane" (SMTP, Gmail, Outlook, Yahoo and Mailgun). Addresses are now read with the same RFC 5322 parser the transports use; only the address is lower-cased, never the name. Bare address lists are normalised exactly as before.

## [4.6.1](https://github.com/Schero94/Magic-Mail/compare/v4.6.0...v4.6.1) (2026-11-18)


### Bug Fixes

* **accounts:** Mailgun domain validation, key trimming and actionable test errors ([#22](https://github.com/Schero94/Magic-Mail/issues/22)) ([76c2cf6](https://github.com/Schero94/Magic-Mail/commit/76c2cf69787f3208571c28e5a6d24b8e8cbfeda4))


### Fixed

* **Mailgun domain is checked when you save the account.** Before, a domain such as `https://mg.example.com/` was saved and every mail then failed. Now `https://`, trailing slashes, spaces and capital letters are removed automatically, and a value that is still not a domain name (for example `mg.example.com/v3`) is shown as an error in the account form. API clients get `400 ValidationError` for it.
* **Failed account tests now say what to fix:** wrong or deleted API key, missing Mail Send permission, unverified sender address, wrong Mailgun region or unknown domain, a sandbox recipient that is not authorized yet, message too large, or provider rate limit. The test response adds `hintCode` and `hint`; `message` stays the same.
* **Keys pasted with extra spaces work.** API keys and webhook keys are trimmed when you save, and Mailgun webhooks verify again if the signing key was saved with spaces around it.

### Changed

* **Clearer setup help in the account wizard** (all five languages): SendGrid asks for a key with only the Mail Send permission and reminds you to verify the sender; Mailgun recommends a Domain Sending Key that can only send mail and explains that sandbox domains only deliver to authorized recipients.

### Migration

* No action needed. A Mailgun account whose domain was saved with `https://` or a trailing slash is repaired the next time you save it. If a stored domain is still invalid, the account form shows the error on the Credentials step.

# [4.6.0](https://github.com/Schero94/Magic-Mail/compare/v4.5.1...v4.6.0) (2026-11-18)


### Features

* **webhooks:** record delivery outcomes, feed suppression and fix bounce analytics ([#21](https://github.com/Schero94/Magic-Mail/issues/21)) ([92e09e3](https://github.com/Schero94/Magic-Mail/commit/92e09e348bb57f50c6378dc5c377f99713c55332))


### Added

* **More delivery outcomes from SendGrid and Mailgun.** Besides bounces and spam complaints, the webhooks now record when a mail is delayed (**Deferred**), when the receiving server accepted it (new field `deliveryConfirmedAt`) and when a recipient unsubscribes through the provider (`unsubscribed`). To get them, select the extra events in your provider: SendGrid deferred, delivered, unsubscribe, group unsubscribe and group resubscribe; Mailgun Temporary Failure, Delivered and Unsubscribes. Without them nothing changes. Other plugins can listen to the new events `magic-mail.delivery.deferred`, `.delivered`, `.unsubscribed`, `.resubscribed`, `.blocked` and `.dropped`.
* **Guide for checking the webhooks with your real accounts**: [docs/live-webhook-checks.md](https://github.com/Schero94/Magic-Mail/blob/main/docs/live-webhook-checks.md).

### Fixed

* **Analytics shows bounces again.** The bounce counter and bounce rate were always 0. Bounced mail now counts as sent and as bounced, so **Sent**, the open rate and the bounce rate change for your existing data.
* **Large SendGrid batches are accepted.** SendGrid sends events in batches of up to 768 KB; MagicMail rejected batches above 512 KB, so their bounces were lost. The limit is now 1 MB, configurable with `webhooks.maxBodyBytes` in the plugin config. Every event of a batch is processed (before, events after the first 1000 were dropped).
* **Provider bounces now block further sends.** With **Block hard-bounced recipients** on, a hard bounce reported by SendGrid or Mailgun adds the address to the suppression list, so no other account (for example SMTP failover) mails it again. Spam complaints are added too if you set `webhooks.suppressComplaints: true`.
* **No more false bounces from SendGrid.** A SendGrid block (a temporary refusal, often reputation) and drops for sender-side reasons such as a broken template or an expired send are no longer shown as **Bounced**. They show as **Failed** with a reason code such as `SENDGRID_BLOCKED_500` or `SENDGRID_DROPPED_INVALID_TEMPLATE`. Drops because the address bounced before or is invalid still count as bounces; drops because of a spam report or unsubscribe are recorded as such.
* **One bad cc address no longer marks the whole mail.** A bounce for a cc or bcc recipient is stored as an event for that address; the mail itself keeps its status.
* **Late SendGrid bounces are matched.** Bounces that arrive without SendGrid's message id are matched by MagicMail's own id or the SMTP id when present; events that match no mail are counted in the log instead of disappearing silently.

### Migration

* Nothing to do for most installs. New optional columns are added on start; no data is changed or removed.
* If your code listens to `magic-mail.delivery.bounced`: SendGrid blocks and sender-side drops now arrive as `magic-mail.delivery.blocked` and `.dropped`. If your code checks `deliveryStatus`, it can now also be `blocked` (shown as **Failed** in the admin).

## [4.5.1](https://github.com/Schero94/Magic-Mail/compare/v4.5.0...v4.5.1) (2026-11-17)


### Bug Fixes

* **readme:** make images and links work on the Strapi marketplace ([#18](https://github.com/Schero94/Magic-Mail/issues/18)) ([883e2d9](https://github.com/Schero94/Magic-Mail/commit/883e2d9035111e4f451553e47b539395850746f0))

# [4.5.0](https://github.com/Schero94/Magic-Mail/compare/v4.4.2...v4.5.0) (2026-11-10)


### Features

* **bounces:** monitor sending mailboxes for bounce reports ([#10](https://github.com/Schero94/Magic-Mail/issues/10)) ([c92d1c3](https://github.com/Schero94/Magic-Mail/commit/c92d1c360c467f33024d155601efec3b712c292c))

## 4.5.0 details (written before the release)

### Added

* **bounces:** mailbox bounce monitoring for SMTP, Gmail, Microsoft 365 and Yahoo accounts. Off by default; turned on per account in the wizard. Reads delivery status reports (RFC 3464 plus Exim-style bounces) via IMAP (also Gmail with an app password, `X-GM-RAW` search), the Gmail API (`gmail.readonly`, opt-in re-consent) or Microsoft Graph (`Mail.Read`, opt-in). Runs every 5 minutes (1 to 60) under a database lease with per-mailbox cursors, bounded batches and timeouts. Matches by `Message-ID`, then `X-MagicMail-Outbox`, then recipient and time (weak). `5.x.x` sets the log to `bounced`, `4.x.x` to the new `deferred` status. Stores reason codes only, emits `magic-mail.delivery.bounced` / `.deferred` with `{ provider: 'mailbox', messageId, reasonCode }`. Optional moving of processed reports to `Magic Mail/Bounces`.
* **sending:** every send path sets one stable `Message-ID` per mail (inline, failover and outbox retries), stored on the email log (`messageIdLocal`).
* **sending:** recipient checks before sending. Well-known typo domains (`googelmail.com`, `gmx.ed`, ...) are rejected as `RECIPIENT_DOMAIN_TYPO` with a suggestion. Reserved test domains (`.test`, `.invalid`, `.example`, `.localhost`) are rejected as `INVALID_RECIPIENT_DOMAIN` in production, allowed elsewhere unless configured. Optional MX lookup (off by default). Optional suppression list of hard-bounced recipients (off by default), stored as keyed hashes.
* **admin:** Bounce monitoring section in the account wizard (Test connection, Check now, last check), "Bounces and recipient checks" in Plugin Settings with the suppression list, and a delivery status filter plus bounce reasons in Analytics. Five locales.

**Migration notes.** New columns are created on start: email log `messageIdLocal`, `bouncedAt`, `bounceSource`; account `bounceMonitor`, `bounceMonitorState`; new collection `magic_mail_suppressed_recipients`. The `deliveryStatus` enum gains `bounced` and `deferred`; code that switches on it should handle both. In production, sends to `.test`, `.invalid`, `.example` and `.localhost` addresses now fail with `400 INVALID_RECIPIENT_DOMAIN`; set **Test domains → Allow** (or `allowReservedRecipientDomains: true`) to keep them. Existing OAuth connections keep send-only scopes until the owner grants read access.

### Fixed

* **errors:** validation and not-found errors keep their 4xx status when the host resolves a different `@strapi/utils` copy than `@strapi/core` (for example 5.61.1 hoisted next to core's 5.61.0). Before, core's `instanceof` check failed and the Content API answered `500 Internal Server Error` for invalid input.

## [4.4.2](https://github.com/Schero94/Magic-Mail/compare/v4.4.1...v4.4.2) (2026-11-10)


### Bug Fixes

* **queue:** keep the sender deadline when an admin retries a queued mail ([#9](https://github.com/Schero94/Magic-Mail/issues/9)) ([6e62d62](https://github.com/Schero94/Magic-Mail/commit/6e62d62c217d6112ec9d5560da232667c0184655))

## 4.4.2 details (written before the release)

### Fixed

* **queue:** an admin "Retry now" keeps a deadline the sender set (`send(…, { notAfter })`, for example a Magic Link login link's expiry). Before, a retry extended `notAfter` to at least now + `queue.maxAgeHours`, so a captured login mail could still go out after the link had expired. Once that deadline has passed, the retry answers `409 DEADLINE_PASSED` and the admin shows "The sender set a deadline for this mail and it has passed. It can only be discarded." Rows without a sender deadline behave as before. New private outbox column `notAfterFixed`, created on start.

## [4.4.1](https://github.com/Schero94/Magic-Mail/compare/v4.4.0...v4.4.1) (2026-11-07)


### Bug Fixes

* **failover:** fail over only when the provider did not accept the mail ([#8](https://github.com/Schero94/Magic-Mail/issues/8)) ([8b3d47b](https://github.com/Schero94/Magic-Mail/commit/8b3d47bb7086f37836c729d52fe45f0d8ac52b6a))

# [4.4.0](https://github.com/Schero94/Magic-Mail/compare/v4.3.0...v4.4.0) (2026-11-07)


### Bug Fixes

* **admin:** space the uncertain hint from the error history ([da9f6b5](https://github.com/Schero94/Magic-Mail/commit/da9f6b5bd3cce0f67b075efcdaefab35aeb72ea2))
* **queue:** never claim more rows than the limit on PostgreSQL ([346a41a](https://github.com/Schero94/Magic-Mail/commit/346a41af31f7e8d789426c39b14478a36f1f24cf))
* **queue:** never re-send an accepted mail and scope idempotency keys ([beb80c1](https://github.com/Schero94/Magic-Mail/commit/beb80c193bd33b92191415dddcd01faa3e0a6f56))
* **queue:** retry HTTP 503 as a refused request ([e8249c7](https://github.com/Schero94/Magic-Mail/commit/e8249c75689898bb7b737fc26444e3f4010e875f))


### Features

* **admin:** add Outbox tab and queue settings ([dbc7778](https://github.com/Schero94/Magic-Mail/commit/dbc7778acc060c29ea07f0f2c614108a84aad4b2))
* **queue:** add opt-in outbox with retries, worker and admin API ([bde7aaa](https://github.com/Schero94/Magic-Mail/commit/bde7aaad2ed037a8f7a9e2060dde6b9c93af12f9))
* **queue:** add strict delivery outcome classifier and payload encryption ([77f87f8](https://github.com/Schero94/Magic-Mail/commit/77f87f8d2c4298f011679fc07e514b3800ea12b4))

# [4.3.0](https://github.com/Schero94/Magic-Mail/compare/v4.2.0...v4.3.0) (2026-11-07)


### Bug Fixes

* **content-api:** accept the content-api-token auth strategy on send routes ([4852de8](https://github.com/Schero94/Magic-Mail/commit/4852de8b624264fd1ebf4f5bd4a1f69ab7b448e8))
* **templates:** check reference id changes under the database lease ([96eb050](https://github.com/Schero94/Magic-Mail/commit/96eb0508476bf9acd9476327b9dd65c4187fdee9))


### Features

* **multi-instance:** coordinate replicas and pm2 workers through the database ([d43071a](https://github.com/Schero94/Magic-Mail/commit/d43071a71d1af58a5667efd94e9a2986c461e985))

## 4.4.1 details (written as "Unreleased" before the 4.4.1 release)

### Fixed

* **failover:** inline sends move on to the next account only when the error proves the provider did not accept the message, with the same classifier as the outbox (`utils/delivery-outcome.js`). A connection lost or timed out after the SMTP `354` reply, HTTP 500/502/504 and network errors after the request was sent no longer fail over; they reach the caller (and become `uncertain` outbox rows when _Queue failed sends_ is on). Before, these could deliver a mail twice through two accounts. SMTP `4xx` replies after DATA (for example `451`) and HTTP 408 now fail over; HTTP 401/403/429/503, SMTP 421, refused connections and authentication failures still do.
* **queue:** failed and uncertain outbox rows are removed `queue.retention.rowDays` (30) days after their last state change, as documented. Clearing their content after `unresolvedDays` (14) used to reset that clock, so rows stayed about 44 days.
* **admin:** below 768 px the MagicMail tab bar keeps every section reachable without hidden off-screen tabs: it scrolls in its own region with "Show previous sections" / "Show more sections" edge buttons while tabs are out of view, keeps the active tab centred (also after the Outbox tab appears once its permission is checked) and scrolls a tab reached with the arrow keys into view. From 768 px it is the unchanged Design System tab bar, like native Strapi tabbed screens.
* **logging:** warnings and errors include the error name and code again (for example `[FAILOVER] Account could not send; trying the next account: Error (SMTP_421)`). Strapi's logger prints only the first argument of a log call, so the details passed as extra arguments were dropped. Codes are the code-only form used by the outbox, never the provider's reply text.
* **admin:** the Outbox tab has the same page gutters and spacing below the tabs as the other tabs (it touched the screen edges).

### Changed

* **package:** installs without plugin warnings in a fresh `create-strapi-app@5.61` project with yarn 1, npm 11 and pnpm. `@strapi/utils` (used by the server code) is now a dependency instead of a peer an app only has transitively. `@strapi/design-system`, `@strapi/icons` and `react-intl` are optional peers (`peerDependenciesMeta`) instead of bundled dependencies, so the plugin always uses the admin's own copies; Strapi 5.61 aliases and dedupes the Design System in the admin build. The `react`/`react-dom` peers accept `^18.0.0` like the Strapi 5 plugin template. The minimum Strapi stays 5.57.0, the first release whose admin ships Design System 2.2.4.
* **package:** npm metadata: plain description, homepage `https://schero94.github.io/Magic-Mail/`, `git+https` repository URL, issue tracker and search keywords.

### Migration notes

* Failover is stricter (see Fixed). A send whose first account returns HTTP 500/502/504, or whose SMTP connection drops after the message was transmitted, now throws instead of trying the next account. Check the provider before re-sending such a mail; with _Queue failed sends_ on, it appears in the Outbox as uncertain.

## 4.4.0 details (written as "Unreleased" before the 4.4.0 release)

### Added

* **queue:** opt-in send queue (outbox) with up to 3 retries (1, 5, 15 minutes, +/-20 % jitter), safe with several replicas and pm2 workers on one database. `send(input, { queue: true, idempotencyKey?, notAfter? })` stores the prepared mail and resolves `{ success: true, queued: true, status, outboxId, emailId, accountUsed: null, messageId: null }` (additive keys); the Content API send routes accept optional `queue` and `idempotencyKey`. New owner setting _Queue failed sends_ (default off) captures sends that failed after failover: proven non-acceptance or no capacity resolve as queued, ambiguous outcomes are kept as `uncertain` (never re-sent automatically) and the original error is thrown with `error.magicMailOutboxId`, permanent errors are thrown unchanged. See README "Retries and the outbox".
* **queue:** new content type `plugin::magic-mail.outbox-message` (table `magic_mail_outbox`, hidden) with encrypted payloads, `config.queue` options, admin routes `/magic-mail/outbox` and `/magic-mail/analytics/queue-stats`, events `magic-mail.queue.*`, and retention.
* **admin:** Outbox tab (filter, details with the error history, Retry now, Mark as sent, Discard) and a "Retries and outbox" settings section, in all five languages.
* **rbac:** new actions `plugin::magic-mail.queue.read` and `plugin::magic-mail.queue.manage`.

### Fixed (send queue, before release)

* **queue:** a database error while recording `sent` after the provider accepted a mail no longer re-queues it. The `sent` write is retried three times (0.25, 1, 3 s); if it still fails the claim expires and the mail ends as `uncertain`. Errors after a provider was contacted that did not come from the provider adapter are classified as ambiguous.
* **queue:** a socket error after the SMTP `354` reply is uncertain whatever system code nodemailer keeps in `originalCode` (`EHOSTUNREACH`, `ENETUNREACH`, ...); before, those were treated as "not connected" and re-sent. For fetch-based providers, `EHOSTUNREACH`/`ENETUNREACH` count as not connected only with `syscall: 'connect'`. The same rule decides queue failover between accounts.
* **queue:** a native Strapi mail whose fallback to the Strapi email provider fails is captured only when every MagicMail account is over quota. With no MagicMail account the error reaches Strapi as in 4.3 instead of resolving as queued and expiring after 24 hours.
* **queue:** Content API idempotency keys are scoped per API token (or per user with `contentApi.allowUserRoles`), so callers can no longer suppress each other's mails or read each other's outbox ids with a shared key. New `send()` option `idempotencyScope` for server callers.
* **queue:** _Retry now_ on a pending mail keeps its remaining automatic retries instead of cutting them to one.
* **queue:** queued OAuth sends limit the token refresh request to 30 seconds and re-check the claim before the provider request, so a process whose lease expired during a slow refresh never sends a mail the reaper already marked uncertain.

### Migration notes

* Nothing changes until `queue: true` is passed or _Queue failed sends_ is switched on.
* Roles that had `read` get `queue.read`, roles that had `manage` get `queue.manage`, once at startup. Remove them in the role editor if a role should not see failed mails.
* **Magic Link (and other callers with their own fallback):** with _Queue failed sends_ on, a temporary failure no longer throws, so the caller's fallback does not run and the login mail may arrive minutes later. Magic Link should call `send(..., { queue: false })`, or pass `notAfter` set to the token expiry. This needs a change in strapi-plugin-magic-link.
* All instances need the same `MAGIC_MAIL_ENCRYPTION_KEY` to send mails queued by another instance.
* MySQL: `SKIP LOCKED` is unsafe for statement-based replication; use row-based replication.

### Added (4.3.0)

* **multi-instance:** MagicMail is correct with several Node processes on one database (for example 2 Railway replicas with `pm2 -i 4`), without sticky sessions or Redis. Three plugin tables are created at startup with plain `CREATE TABLE` (PostgreSQL, MySQL, SQLite): `magic_mail_claims` (leases and de-duplication claims), `magic_mail_rate_limits` (shared rate-limit windows) and `magic_mail_oauth_pending` (one row per OAuth flow). Expired rows are removed every five minutes.
* **rate-limit:** limits are counted across all processes. New `rateLimit` plugin config: `store: 'database'` (default), `'redis'` (pass an ioredis or node-redis v4+ client as `rateLimit.redis`; falls back to the database on errors) or `'memory'` (previous per-process limiter).
* **ops:** every process logs short one-way fingerprints of the encryption, tracking and OAuth state secrets at startup, so replicas with different secrets are easy to spot.
* **docs:** README section "Running several instances (Railway replicas, pm2 cluster)" with the required configuration: one database and pool sizing, identical secrets, `proxy.koa`, a pm2 cluster example that starts the Strapi CLI (cluster mode needs a Node.js script, not `npm`) under `pm2-runtime`, Railway replicas, a one-replica first deploy on an empty database, and optional Redis. The Content-API section no longer says the send rate limit is counted per process.

### Fixed

* **oauth:** concurrent OAuth flows on different instances no longer overwrite each other, a consumed state can not become valid again, and a duplicated callback is accepted only once (atomic consume of the flow row). Pending flows from the previous `oauth:pending` store entry are moved once.
* **oauth:** token refreshes run once per account across all processes; others use the stored token, and a rotated refresh token is never overwritten by an older one or by a refresh that started before a reconnect.
* **delivery:** a SendGrid or Mailgun retry that reaches another instance while the first one is still processing is acknowledged without work, so bounce/complaint listeners run once per event.
* **tracking:** open and click counters (email log and link) are incremented with one atomic UPDATE, so parallel opens and link scans are no longer lost.
* **templates:** version numbers, template reference ids, the primary account and account/rule name checks are serialised across processes with a database lease.
* **templates:** saving the Users & Permissions reset-password and confirmation templates at the same time keeps both changes (compare-and-set on the core-store row, duplicate rows removed). The plugin's one-time flags use the same write.
* **jobs:** the quota refresh, the tracking privacy migration, the retention purge and the sensitive-link purge run in one process per interval (database lease) instead of in every process.
* **quota:** hourly and daily windows only move forward, so a replica whose clock lags slightly can no longer reset a window another replica already opened.
* **content-api:** `/api/magic-mail/send` and `/send-message` accept API tokens again. Strapi 5.45+ names the Content-API token strategy `content-api-token` (previously `api-token`), so the `api-token-only` policy rejected every API-token request with 403 "Policy Failed". Both names are accepted; admin tokens (`admin-token`) stay rejected.
* **templates:** changing a template's reference id is checked and written under the same database lease as creating one, so two templates can no longer end up with the same reference id (concurrent saves on two instances); a taken id returns 400.
* **settings:** a settings change made on one instance applies on every instance within about a second (cache revalidated against the row's `updated_at`); the default settings row is created once across processes.

### Migration

No action is needed for a single instance. For several instances, read "Running several instances" in the README: one database, identical `APP_KEYS`, `MAGIC_MAIL_ENCRYPTION_KEY`, `MAGIC_MAIL_TRACKING_SECRET` and `MAGIC_MAIL_OAUTH_STATE_SECRET` on every process, and `server.proxy.koa: true` behind a proxy. The database user needs the `CREATE TABLE` right Strapi already uses. OAuth flows started on a previous version during the deploy may have to be started again.

# [4.2.0](https://github.com/Schero94/Magic-Mail/compare/v4.1.0...v4.2.0) (2026-11-07)


### Bug Fixes

* **delivery:** await eventHub listeners so a failing listener cannot reject unhandled ([ab04820](https://github.com/Schero94/Magic-Mail/commit/ab0482033041be18f9c462179b069e91464376dc))


### Features

* **delivery:** signed SendGrid and Mailgun bounce/complaint webhooks ([bdf13c8](https://github.com/Schero94/Magic-Mail/commit/bdf13c888fbcce5604c30be47cec0173ec7cd389))

## 4.2.0 details (written as "Unreleased" before the 4.2.0 release)

### Added

* **delivery:** signed bounce and complaint webhooks for SendGrid and Mailgun accounts: `POST /api/magic-mail/webhooks/sendgrid/:accountId` (Signed Event Webhook, ECDSA over the raw body) and `POST /api/magic-mail/webhooks/mailgun/:accountId` (HMAC-SHA256 with the HTTP webhook signing key). Off until the verification key or signing key is saved on the account (stored in the encrypted account config; the Mailgun key is masked like other secrets). Requests are checked against a one-hour timestamp window, Mailgun tokens and provider event ids are de-duplicated, the routes are rate limited (600 per minute and IP) and bodies above 512 KB are refused. Responses carry no detail: an unknown account, a missing key and a bad signature all return 401.
* **delivery:** bounces (SendGrid bounce/blocked/dropped, Mailgun permanent failures) set `bounced` and a reason code such as `MAILGUN_BOUNCE_550` on the email log; spam complaints set the new `complained`/`complainedAt` fields. Each event is also stored as an email event. Provider texts and addresses are never stored.
* **delivery:** other plugins can react through `strapi.eventHub` events `magic-mail.delivery.bounced` and `magic-mail.delivery.complained` (`{ provider, messageId, reasonCode }`, no personal data) or ask `strapi.plugin('magic-mail').service('delivery-webhooks').getDeliveryEvents(messageIds)`.
* **admin:** the analytics delivery badge shows "Bounced" and "Complaint". The SendGrid and Mailgun account wizard has an optional webhook section with the key field and the webhook URL to register (shown once the account is saved).

### Fixed

* **delivery:** the email log now stores the real provider message id (`providerMessageId`). SendGrid, Mailgun and Microsoft Graph sends no longer return made-up ids such as `sendgrid-<time>` when the provider gives none; `messageId` is then `null`. Microsoft Graph never returns an id, so it is always `null` there.

# [4.1.0](https://github.com/Schero94/Magic-Mail/compare/v4.0.0...v4.1.0) (2026-11-07)


### Bug Fixes

* **admin:** truncate table names like Magic Link and focus the next version after a delete ([3669dfc](https://github.com/Schero94/Magic-Mail/commit/3669dfcae82fffd33f13740fb46f979a42f920c8))


### Features

* **admin:** use the Magic Link table design for every list ([3bbbc3c](https://github.com/Schero94/Magic-Mail/commit/3bbbc3ccf91912c31c6d0ddd23a2644083858789))

## 4.1.0 details (written as "Unreleased" before the 4.1.0 release)

### Changed

* **admin:** every Magic Mail list (email accounts, routing rules, custom templates, core emails and the analytics delivery log) now uses the same table design as Magic Link: one shared table card with a neutral header band, uppercase column labels, tinted status and category badges, Design System icon buttons for row actions, empty, no-match, loading and error states inside the card, and Design System pagination with "Showing x-y of z". Below 768 px each row becomes a labelled card; the separate mobile card lists are gone. Page headers, stat cards and dialogs keep the Magic Mail look. No API or data changes.
* **admin:** long account names, sender and recipient addresses, rule names, target accounts and template names truncate with an ellipsis and show the full text on hover instead of breaking mid-word on narrow screens.
* **docs:** README and GitHub Pages screenshots retaken with the new tables.

### Fixed

* **admin:** after a single template version is deleted, focus moves to the next version's Restore button (the previous one when the last entry was deleted, the drawer heading when none is left) instead of being lost; "Delete all versions" moves focus to the drawer heading.

# [4.0.0](https://github.com/Schero94/Magic-Mail/compare/v3.1.0...v4.0.0) (2026-11-07)


* build!: harden the supply chain, packaging and release workflow ([5b8954d](https://github.com/Schero94/Magic-Mail/commit/5b8954de4d1c779902f19acdc0dd4646af079784))
* chore(email-only)!: drop legacy messaging columns and traces, document 4.0 hardening ([53d8ef3](https://github.com/Schero94/Magic-Mail/commit/53d8ef350b22a8568f0781cc36ebb5bb9358a4b1))
* fix(email)!: harden the sending path and route all native Strapi mail ([fef71e5](https://github.com/Schero94/Magic-Mail/commit/fef71e59d796d185b953857dba22120c12e575a1))
* fix(security)!: harden accounts, OAuth flows and credential key management ([e443839](https://github.com/Schero94/Magic-Mail/commit/e4438395a1f080569e75f501351ef476af855513))
* fix(templates)!: validate users-permissions templates, fix versioning and settings singleton ([14dd2b1](https://github.com/Schero94/Magic-Mail/commit/14dd2b11c99f517bc2715a23ad26cb06ffd10e5e))
* fix(tracking)!: harden click/open tracking, retention and analytics deletion ([015fc25](https://github.com/Schero94/Magic-Mail/commit/015fc257656cd97d7abc2f98e677e94254833931))


### Bug Fixes

* **admin:** accounts screens keyboard, focus and responsive layout ([0e041b3](https://github.com/Schero94/Magic-Mail/commit/0e041b345fd1131b527c66bea25ad9d0accd013e))
* **admin:** analytics and settings layout, states, focus and touch targets ([4647723](https://github.com/Schero94/Magic-Mail/commit/4647723003485ebd2a81076e3a56c5cf29737d21))
* **admin:** keep routing match-type badges on one line ([74eec23](https://github.com/Schero94/Magic-Mail/commit/74eec23332212260ebe5e64ad4401abdb68fc297))
* **admin:** render account wizard field hints through Field.Root ([759dc0b](https://github.com/Schero94/Magic-Mail/commit/759dc0b252b6476ecb1d65a8b91cdb06d0b3d7ae))
* **admin:** routing rules layout, form hints, focus and account matching ([e48f535](https://github.com/Schero94/Magic-Mail/commit/e48f5355ea22972b3a98cd654deb15def72566fa))
* **admin:** say that the default from email does not change the sender ([f039b0d](https://github.com/Schero94/Magic-Mail/commit/f039b0d9e0f04b0e6b6228c1d659113cf4ca78ea))
* **admin:** template list and editor keyboard, focus, contrast and layout ([2612e5f](https://github.com/Schero94/Magic-Mail/commit/2612e5f748344e1d16901e7dc62e8a8d91f48b96))
* **admin:** use one download icon for both template downloads ([303139d](https://github.com/Schero94/Magic-Mail/commit/303139d32fc71594507570201a6f464658c42098))
* **email:** evaluate equal-priority routing rules in list order ([a368301](https://github.com/Schero94/Magic-Mail/commit/a368301f11d9ef3b645c7f7e920df63eea7572b6))
* **i18n:** use sentence case for all stat card labels ([0c0c42c](https://github.com/Schero94/Magic-Mail/commit/0c0c42c18a4ede629b1616144f57af7d37fd2eb3))
* **oauth:** keep rotated refresh tokens, refresh early and retry once on 401; add editor-config route ([1600773](https://github.com/Schero94/Magic-Mail/commit/160077355d9d2d192325ea83c655fdffaaeb2238))
* **release:** pass the npm token as fallback to Trusted Publishing ([e3a85a6](https://github.com/Schero94/Magic-Mail/commit/e3a85a686635a32327527f073e8df0817662f797))
* resolve all ESLint findings ([7c5d25c](https://github.com/Schero94/Magic-Mail/commit/7c5d25cd6d749de6ec19a679bc4c9a86f9554f51))
* **security:** throttle rate-limit sweeps, key IPv6 by /64, close tracking-URL and log gaps ([a887ca4](https://github.com/Schero94/Magic-Mail/commit/a887ca4076c9cc9253e443ba478f8cd9b3ca422b))


### Features

* **admin:** add dark-mode, i18n and accessibility foundation ([90903e5](https://github.com/Schero94/Magic-Mail/commit/90903e5d00766e16d95102158c997c24b155d3af))
* **admin:** harden the analytics and plugin settings views ([131a8ae](https://github.com/Schero94/Magic-Mail/commit/131a8ae318c1fc0fd079e557a864660ad683013f)), closes [#E2E8F0](https://github.com/Schero94/Magic-Mail/issues/E2E8F0) [#1E293B](https://github.com/Schero94/Magic-Mail/issues/1E293B)
* **admin:** harden the email accounts view and account wizard ([4794fa2](https://github.com/Schero94/Magic-Mail/commit/4794fa2a0460d7ad81d7ce925665b0b7ff02ce3f))
* **admin:** harden the email templates and template editor views ([30e9dcc](https://github.com/Schero94/Magic-Mail/commit/30e9dccb5015147d10be59c098dc3a92b14360d4))
* **admin:** harden the routing rules view ([be8eb62](https://github.com/Schero94/Magic-Mail/commit/be8eb6277697c5f2aa404c97dae7710013eef428))
* **admin:** merge view translations into all five locales ([5b5c55e](https://github.com/Schero94/Magic-Mail/commit/5b5c55ee0d649e5dab5f2e81d449a17150414257))
* **admin:** reconnect existing OAuth accounts from the edit wizard ([bcb810a](https://github.com/Schero94/Magic-Mail/commit/bcb810afa04923d978b3855250193529112a8f9f))
* **email:** support the Mailgun EU region ([cd0a837](https://github.com/Schero94/Magic-Mail/commit/cd0a83717ae0bcb509feeda17a021ec9d04f8078))


### BREAKING CHANGES

* Node.js >=22.12 is required, and
@strapi/plugin-users-permissions ^5.57.0 is now a required peer dependency.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
* the routing-rule attributes whatsappFallback and whatsappPhoneField are removed; Strapi drops the columns magic_mail_routing_rules.whatsapp_fallback and whatsapp_phone_field on the first start of 4.0 (back up the database first if you need them; with database.settings.forceMigration=false they stay and can be dropped manually).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
* users-permissions email templates reject unsupported placeholders, <% %> blocks and ${...} with 400; template versions now store the saved content (v1 = created) instead of the pre-save content; template list filters other than category/isActive/templateReferenceId are ignored; the template test-send response returns data.success instead of data.result. Migration steps are in CHANGELOG.md under [Unreleased].

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
* changing an account's provider/host/port/user/OAuth client/tenant/domain/allowInsecure requires re-entering stored secrets; secrets are shown as the constant "********"; credentials are stored in a v1 format that 3.x can not read and MAGIC_MAIL_ENCRYPTION_KEY is required outside development/test; OAuth needs a public https server.url (or URL) in production and in-flight authorizations must be restarted; Microsoft tenant ids are validated; routing rules must reference existing accounts; provider "ses" is removed; test sends are limited to 10/min per admin; test endpoints return fixed error messages. Migration steps are in CHANGELOG.md under [Unreleased].

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
* tracking needs a public URL (no localhost fallback; mail is
sent untracked otherwise); Content-API sends are click-tracked only for hosts
in tracking.allowedLinkHosts; tracked links expire after 180 days; tracking
events store truncated IPs and are deleted after 90 days; tracking hashes use
MAGIC_MAIL_TRACKING_SECRET / MAGIC_MAIL_ENCRYPTION_KEY (old hashes still
verify); email-log recipient/subject/templateId semantics changed; at most 100
links per email are tracked. See CHANGELOG.md for migration steps.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
* Content-API send routes accept API tokens only unless contentApi.allowUserRoles is true; userId must reference an existing user. /send-message rejects the removed `channel` parameter and validates `to`; the response has no `channel` field. path/href attachments are rejected for every caller and provider (pass `content`). from/replyTo must be valid single addresses (from must match the account) and custom headers are limited to an allowlist. An explicit accountName is never replaced on quota/errors; the template category sets the email type; the global unsubscribe URL requires enableUnsubscribeHeader; defaultFromEmail no longer rewrites from; quota windows are clock-aligned (UTC default) and add two private account fields. Migration steps are in CHANGELOG.md under [Unreleased].

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>

## 4.0.0 details and migration notes (written as "Unreleased" before the 4.0.0 release)

### ⚠ BREAKING CHANGES (platform, packaging and API surface)

* **Node.js 22.12 or later is required** (`engines.node` `>=22.12.0 <=26.x.x`, the server bundle targets `node22`). Strapi 5.61 itself requires Node 22, and the HTML sanitizer (`sanitize-html` 2.18) requires 22.12. Migration: upgrade Node before upgrading the plugin.
* **`@strapi/plugin-users-permissions` `^5.57.0` is a required peer dependency.** The email log has a relation to users-permissions users, which Strapi cannot register without that plugin. Every default Strapi app already includes it. Migration: `npm install @strapi/plugin-users-permissions` if your app removed it.
* **Peer ranges aligned with the host:** `@strapi/utils` `^5.57.0` (was `^5.0.0`), `react-router-dom` `^6.30.3` (was `^6.30.6`, now the same as Strapi's own peer).
* **Admin API permissions are capability based.** Every admin route requires `plugin::magic-mail.read`, `.manage` or `.test-send` in addition to an authenticated admin; `plugin::magic-mail.access` only controls the menu entry. Roles that only had `access` can open the plugin but their API requests are denied. Migration: grant the capabilities as described in [docs/permission-migration.md](./docs/permission-migration.md).
* **MagicMail sends email only.** The non-email messaging transport is removed: the Content API routes `/send-whatsapp`, `/whatsapp/status` and `/whatsapp/check/:phoneNumber`, the matching admin routes and service methods are gone, and `/api/magic-mail/send` no longer accepts `phoneNumber` (strict validation returns 400 for unknown fields). This part already shipped in 3.1.0, which was published as a minor release; it is listed here for users upgrading from 3.0.x. New in this release: `channel` on `/send-message` and the legacy routing-rule columns (see below). Migration: remove these calls and the `phoneNumber` field.
* **Unused runtime dependencies removed** (`form-data`, `striptags`, `yup`, `decode-html`). Code that relied on them being installed transitively through this plugin must declare them itself.

### Features

* **designer:** new `designer` plugin config (`projectId`, `scriptUrl`, `version`) served to the editor by `GET /magic-mail/designer/editor-config` (read permission). The visual designer runs with a pinned Unlayer build, no Unlayer project by default, no Unlayer image hosting, stock images, AI or third-party placeholder images, and uploads images to the Strapi Media Library. The README documents the required CSP directives.
* **admin:** complete translations for English, German (formal), French, Spanish and Portuguese; dark-mode aware colours with WCAG AA contrast, accessible dialogs, labelled controls, unsaved-changes guards, locale-aware dates and numbers, reduced-motion support. The desktop look is unchanged; below 768 px the accounts, routing-rule and analytics tables become card lists, the plugin tab bar scrolls and switches grow to 48x32 touch targets.
* **admin:** keyboard and focus: table row actions react to Enter, Space and Tab (the Design System cell no longer swallows them); every dialog moves focus inside on open, closes with Escape and returns focus to the button that opened it (or to a stable fallback after a delete); plugin pages render inside the admin `main` landmark so *Skip to content* works.
* **admin:** routing-rule form and account wizard hints are rendered and linked to their inputs (they were passed as `Field.Hint` children, which Design System 2.2 ignores); rule account names match case-insensitively, like the router and the server.
* **admin:** tables wrap long values instead of scrolling sideways on desktop widths; stat cards line up with the page edges; contrast fixes for the dark-mode Transactional badge and the Pending delivery status.
* **admin:** the analytics view pages and searches on the server and clears logs in batches; the routing view shows broken account references; account edit shows how many rules reference an account.
* **ci:** pull requests run ESLint, the Prettier check, tests, build, export and bundle verification, `npm pack --dry-run` and a production audit on Node 22 and 24; the Dependabot auto-merge verification runs lint and the format check too.
* **email:** Mailgun EU region. Mailgun accounts take `config.region` (`us` or `eu`, default `us`); `eu` sends through `api.eu.mailgun.net`. The account wizard has a region field, and the server rejects any other value on create and update. Existing accounts without a region keep using `api.mailgun.net`.
* **build:** ESLint 10 flat config (`@eslint/js`, `eslint-plugin-react-hooks` 7, `eslint-config-prettier`) and Prettier, with `lint`, `lint:fix`, `format` and `format:check` scripts.

### Changes

* **admin:** the keep-alive polling (`useAuthRefresh`) is removed. Strapi's admin idle-session lifetime now applies while a MagicMail tab is open.
* **release:** GitHub actions are pinned by commit SHA; the release workflow verifies in a read-only job and publishes from a separate job with npm provenance; dependencies are installed with `--ignore-scripts` and without `--legacy-peer-deps`.
* **deps:** `vite` override raised to `^6.4.5`, the global `undici` override replaced by a scoped `^7.30.2` override for `@semantic-release/github`.

### ⚠ BREAKING CHANGES (sending path)

* **Content API send routes accept API tokens only.** `/api/magic-mail/send` and `/api/magic-mail/send-message` now reject users-permissions roles with 403. Migration: send with an API token, or restore the old behaviour with `config: { contentApi: { allowUserRoles: true } }` for `magic-mail` in `config/plugins.js`. With user roles allowed, the email log is attributed to the authenticated user and a body `userId` is ignored.
* **`userId` must reference an existing user.** API-token requests with a `userId` of a non-existent users-permissions user get a 400. Migration: send the numeric id or documentId of an existing user, or omit `userId`.
* **`channel` removed from `/send-message`.** The parameter is rejected (400) and the response no longer contains `channel`. Migration: drop `channel` from requests and stop reading it from responses.
* **`/send-message` validates `to` as an address list** (same rules as `/send`). Invalid recipients get a 400 before anything is logged.
* **File-path and URL attachments are rejected** for every caller and provider (native Strapi email service, `email-router` service and Content API). Previously SendGrid and Mailgun read `attachment.path` from disk while SMTP rejected it. Migration: read the file yourself and pass `content` (Buffer, or a string with `encoding: 'base64'`). Content-API requests with `path` now fail validation instead of having the path silently removed.
* **`from` and `replyTo` must be valid addresses.** `from` is parsed with RFC 5322 rules and must be one mailbox equal to the sending account's address; only its display name is kept. Content-API requests with any other `from`/`replyTo` format get a 400.
* **Custom headers use an allowlist** (`X-*` except `X-Mailer`, `X-Email-Type`, `X-Priority`, `X-Entity-Ref-ID`, `X-Content-Type-Options`, plus `List-Id`, `Precedence`, `Auto-Submitted`, `In-Reply-To`, `References`), at most 20. Other headers (for example `Return-Path`, `Disposition-Notification-To`, `Resent-*`) are dropped. MagicMail's own headers always win. Migration: rename custom headers to `X-*`.
* **Explicit `accountName` is never replaced.** When the requested account is over quota or fails, the send fails instead of silently using another account. `accountName` lookup is now case-insensitive.
* **Template category drives the email type.** A template with category `marketing` or `notification` sent without `type` is now routed and labelled with that type (marketing mail gets `List-Unsubscribe`/`Precedence: bulk` when an unsubscribe URL is available). Migration: pass `type: 'transactional'` explicitly to keep the old behaviour.
* **Global unsubscribe URL requires the "Unsubscribe header" toggle.** The plugin-wide `unsubscribeUrl` is only applied when `enableUnsubscribeHeader` is on. `{{email}}` in the URL is replaced with the recipient (single-recipient mails only), and `List-Unsubscribe-Post: One-Click` is only sent for https URLs.
* **`plugin-settings.defaultFromEmail` no longer rewrites `from`.** The sender address is always the selected account's address. `defaultFromName` is used as display name when the account has no `fromName` and the caller gave none.
* **Quota windows are clock-aligned (UTC by default)** and reserved atomically before dispatch; the boot-relative hourly timer and local-midnight daily timer are gone. Two private fields (`quotaHourKey`, `quotaDayKey`) are added to the email-account content type (Strapi adds the columns automatically). Configure the zone with `quotaTimezone`.
* **Plugin warnings and errors are always logged** (previously hidden unless `debug: true`). Info and debug output still requires `debug: true`.

### ⚠ BREAKING CHANGES (tracking and analytics)

* **No tracking without a public URL.** Tracking URLs use the *Tracking base URL* setting, then `server.url`, then `server.absoluteUrl`, plus `api.rest.prefix`; the open pixel now honours the setting too. The `http://localhost:1337` fallback is gone: in production a loopback host is never used and mail is sent untracked (one warning). Migration: set *Tracking base URL* or `server.url` to your public URL.
* **Content-API sends are not click-tracked by default.** Mails sent through `/api/magic-mail/send` and `/send-message` only get click tracking for hosts listed in `tracking.allowedLinkHosts` (an API token can no longer mint redirects on your domain to any site). Open tracking is unchanged. Migration: set `config.tracking.allowedLinkHosts: ['example.com']` for `magic-mail` in `config/plugins.js`. When the list is set, it also limits admin/service sends and existing tracked links.
* **Tracked links expire after 180 days** (`tracking.linkTtlDays`) and then show the fallback page; expired link mappings are deleted. Migration: set `linkTtlDays: 0` to keep links forever.
* **Tracking data retention and anonymisation.** Open/click events store the IP truncated to /24 (IPv4) or /48 (IPv6), no `location` and at most 512 characters of user agent; `X-Forwarded-For` is no longer read (enable `server.proxy` behind a proxy). Events older than 90 days are deleted (`tracking.eventRetentionDays`). On first start a one-time migration (`trackingPrivacyMigrationV1`) truncates stored IPs, clears `location` and removes sensitive click URLs from existing events. Optional `tracking.logRetentionDays` deletes old email logs. Migration: set `anonymizeIp: false` or `eventRetentionDays: 0` to keep the old behaviour.
* **New tracking hash secret.** Tracking hashes are signed with `MAGIC_MAIL_TRACKING_SECRET`, else `MAGIC_MAIL_ENCRYPTION_KEY`, else the first app key, instead of the raw `APP_KEYS` string. Links in mails sent before the upgrade keep working (old hashes are still verified), and rotating `APP_KEYS` no longer breaks them. Migration: optionally set `MAGIC_MAIL_TRACKING_SECRET`; when rotating it, keep old values in `MAGIC_MAIL_TRACKING_SECRET_PREVIOUS`.
* **Email log fields.** `recipient` is the first bare address (all recipients are kept in `metadata.recipients`), `subject` is cut to 255 characters, and `templateId` holds the numeric template reference id (a non-numeric requested id is kept in `metadata.requestedTemplateId`). Previously multi-recipient or display-name sends failed to create a log and were sent untracked.
* **At most 100 links per email are tracked** (`tracking.maxLinksPerEmail`); further links stay untracked.
* **Tracking rate limit degrades.** Above 300 requests per minute and IP, opens and clicks are no longer recorded, but the pixel is served and the click redirects; only above 3,000 per minute is a plain-text 429 returned (no JSON envelope).

### ⚠ BREAKING CHANGES (accounts, OAuth, templates, settings)

* **Stored secrets must be re-entered when the endpoint changes.** `PUT /magic-mail/accounts/:id` keeps a stored secret (SMTP password, API key, OAuth client secret, DKIM key) only while provider, `host`, `port`, `user`, `clientId`, `tenantId`, `domain` and `allowInsecure` stay the same. Otherwise a masked or omitted secret is rejected with 400 (`details.config` lists the fields). Changing the provider also requires a complete `config`; old keys of the previous provider are dropped. Migration: send the secret again whenever you change one of these fields.
* **Secret placeholder is a constant.** `GET /magic-mail/accounts/:id` returns `********` for every stored secret instead of `****` plus the last four characters. Only this exact value means "keep"; any other value (also one starting with `****`) is stored as the new secret. An unreadable config returns `credentialsUnreadableReason: "KEY_MISMATCH"` instead of the crypto error text. Migration: API clients that round-tripped the old `****abcd` mask must send `********` (or the real secret).
* **Credential encryption format and key rules.** New ciphertexts use `v1:<iv>:<tag>:<ct>` (AES-256-GCM, 12-byte IV, HKDF-SHA256 subkey). Pre-4.0 blobs still decrypt and are re-encrypted on the next save; 3.x can not read `v1` blobs, so back up the database before upgrading if you might roll back. `MAGIC_MAIL_ENCRYPTION_KEY` is now required whenever `NODE_ENV` is not unset/`development`/`test` (previously only in `production`), and the constant fallback key is gone. Rotation: set the new key in `MAGIC_MAIL_ENCRYPTION_KEY` and the old one in `MAGIC_MAIL_ENCRYPTION_KEY_PREVIOUS`, then save each account.
* **OAuth state signing key.** The state HMAC uses an HKDF subkey of `MAGIC_MAIL_OAUTH_STATE_SECRET`, else `MAGIC_MAIL_ENCRYPTION_KEY`, else the first app key (previously the raw `APP_KEYS` string). States are bound to the admin user who started the flow. Authorizations in progress during the upgrade must be restarted.
* **OAuth redirect URI in production.** The redirect URI comes from `URL` (legacy override) or Strapi's `server.url`/`server.absoluteUrl`; in production it must be public `https`, the `http://localhost:1337` fallback is gone and starting a flow fails with a 400 explaining what to set. Migration: set `server.url` (or `URL`) to the public URL and make sure it matches the redirect URI registered with Google/Microsoft/Yahoo. The `/oauth/<provider>/auth` response now includes `redirectUri`. The callback page no longer redirects to `/admin/plugins/magic-mail?oauth_code=...` when the opener tab is gone; restart the flow from the admin page.
* **Microsoft tenant IDs are validated** (GUID, domain, `common`/`organizations`/`consumers`; letters, digits, `.` and `-` only). `oauth/create-account` no longer accepts `config.domain`.
* **users-permissions email templates need users-permissions permissions.** `GET`/`PUT /magic-mail/designer/core/:type` additionally require *Users & Permissions → Email templates* read/update. Saving converts `{{ KEY }}` to `<%= KEY %>` and rejects `<% %>` blocks, `${...}` and any placeholder other than `URL`, `SERVER_URL`, `ADMIN_URL`, `CODE`, `TOKEN`, `USER`, `USER.email`, `USER.username` (400). Previously `{{URL}}` was saved as `<%URL%>`, which users-permissions does not fill in. Migration: grant the users-permissions template permissions to roles that edit these templates, and re-save templates that contain unsupported placeholders.
* **Users & Permissions is a required peer dependency** (see *platform and packaging* above). Core-template endpoints answer 404 when the plugin is not loaded.
* **Legacy routing-rule columns removed.** The unused attributes `whatsappFallback` and `whatsappPhoneField` are deleted from the routing-rule content type. Strapi drops the columns `magic_mail_routing_rules.whatsapp_fallback` and `whatsapp_phone_field` on the first start of 4.0. Migration: back up the database first if you need those values; with `database.settings.forceMigration: false` the columns stay and can be dropped manually.
* **Routing rules reference existing accounts.** Creating or updating a rule with an `accountName`/`fallbackAccountName` that matches no account (case-insensitive) returns 400. Renaming an account updates the rules that use it; deleting an account deactivates rules that target it and clears it as fallback (`DELETE /accounts/:id` returns the counts in `data`). `GET /routing-rules` is sorted by priority descending (evaluation order).
* **Provider `ses` removed** from the email-account enum (it never had an adapter).
* **Template versions are the saved states.** Version 1 is the created content and each content-changing save adds one version with the new content (previously the old content was snapshotted before every save, duplicating v1). Saves that only change `isActive`/category add no version. Export includes `isActive`; an import keeps it.
* **Template list filters are allowlisted.** `GET /designer/templates?filters[...]` only honours `category`, `isActive` and `templateReferenceId` equality; other filters are ignored.
* **Test sends are rate limited** to 10 per minute per admin across `POST /accounts/:id/test`, `/test-strapi-service` and `/designer/templates/:id/test-send` (429 above).
* **Client-facing error texts.** Account tests and test sends return fixed messages (for example "Could not connect to the mail server. Check host, port and TLS settings.") instead of raw transport errors; `/test-strapi-service` answers 502 on delivery failure and no longer returns the provider `result`; the template test-send response returns `data.success` instead of `data.result`.
* **Content-API send routes carry the `plugin::magic-mail.api-token-only` route policy** in addition to the controller check (403 for users-permissions roles unless `contentApi.allowUserRoles: true`).

### Bug Fixes

* **tracking:** the click-tracking link rewriter is linear-time (no catastrophic backtracking); a crafted 100 KB HTML body could block the event loop for minutes.
* **tracking:** more token-bearing links are excluded from click tracking (any parameter name containing `token`, `secret`, `session`, `signature`, `reset`, ...; names ending in `code`, `key`, `sig`, `otp`, `state`; long random values; URLs with credentials).
* **tracking:** a link is only rewritten after its mapping was stored, so a failed insert never produces a dead link; mappings are stored with bounded concurrency.
* **tracking:** malformed tracking ids are rejected before any database query.
* **analytics:** deleting an email log, or clearing all logs, also deletes its stored link mappings; clear-all reports `hasMore` correctly. `GET /analytics/emails` searches template names too and accepts `deliveryStatus`; `pageSize` is capped at 100.
* **templates:** `{{system.date}}`, `{{system.year}}` and `{{system.unsubscribe}}` are filled by the server (`system.webview` renders empty); callers cannot override them.
* **email:** native interception wraps the `@strapi/email` provider, so `sendTemplatedEmail()` (admin password reset) is routed through MagicMail too.
* **email:** when no active account exists, or every eligible account is over quota, native Strapi emails are sent through the original provider instead of failing. Failures after an account was attempted are returned to the caller and never re-sent.
* **email:** failover tries every eligible account in order (rule account, rule fallback, the accounts of further matching rules, primary, others by priority) and continues on errors that guarantee non-delivery; attempted and skipped accounts are stored on the email log.
* **email:** routing rules with equal priority are evaluated oldest first, the same order the admin list and `GET /routing-rules` show (previously the database order decided).
* **email:** recipient routing rules work with recipient arrays, CSV strings and display names.
* **email:** SendGrid no longer double-encodes base64 attachments and sends `cid` attachments inline; SendGrid, Mailgun and Yahoo now apply custom headers and the aligned sender display name.
* **email:** the outbound HTML sanitizer keeps email layout markup (`<style>` blocks with a CSS filter, `bgcolor`, `align`, `valign`, `role`, `<center>`, `<font>`, `data:image` inline images) while still removing scripts, event handlers and `javascript:` URLs.
* **email:** template rendering no longer decodes HTML entities across the whole body (`decode-html` removed); only Mustache tags are decoded.
* **email:** every email is logged, including text-only mails and mails with `enableTracking: false`.
* **email:** `send()` no longer mutates the caller's object, so reusing it does not leak tracking data between recipients.
* **email:** the account test sends through exactly the tested account (also before activation).
* **email:** SMTP accounts can set `allowInsecure: true` for local mail catchers (honoured outside production or for loopback hosts).
* **email:** Mailgun domains are validated and URL-encoded.
* **tracking:** the one-time sensitive tracking-link purge pages by id and runs again once (`sensitiveLinkPurgeV2`) to catch rows the earlier version skipped.
* **accounts:** clearing Reply-To, description or From name in the edit form clears the stored value; unlimited (0) quotas are kept.
* **accounts:** account test emails escape every interpolated value.
* **oauth:** rotated Microsoft/Yahoo refresh tokens are returned by the refresh helpers (`refreshToken`) so they can be persisted; `buildOAuthBlob()` keeps the previous refresh token when none is returned. New `POST /magic-mail/oauth/reconnect/:accountId` re-authorizes an existing account (start with `GET /oauth/<provider>/auth?accountId=<documentId>`).
* **oauth:** pending PKCE verifiers live in one pruned store entry (abandoned flows no longer leave rows behind; pre-4.0 `oauth:pkce:*` rows are deleted once), and concurrent flows no longer lose each other's entries.
* **oauth:** the callback page posts to the admin panel origin (`admin.absoluteUrl`), so split admin/API hosts work.
* **templates:** saving a users-permissions template no longer crashes when the store entry is empty; numeric template/version lookups use the Query Engine instead of the deprecated `entityService`; concurrent saves get distinct version numbers; downloads use a sanitized file name and a sandbox CSP.
* **settings:** the settings row is created once even for concurrent first sends, duplicate rows from earlier races are removed, and reads are cached for 10 seconds (cleared on update).
* **oauth:** expiring access tokens are refreshed 60 seconds early, rotated refresh tokens are stored (previously dropped by the router, so Microsoft/Yahoo accounts eventually lost access), concurrent sends share one refresh, and a send rejected with HTTP 401 / SMTP `EAUTH` is refreshed and retried exactly once.
* **build:** `npm run watch` and `watch:link` now produce the same esbuild server bundle as `npm run build` (previously the server entry required files that did not exist in `dist`); `verify:runtime` rejects an unbundled server entry.
* **package:** the root `strapi-admin.js`/`strapi-server.js` shims point at `dist` instead of unpublished sources, and README screenshots (about 7 MB) are no longer shipped in the npm tarball.
* **cleanup:** removed the unregistered debug controller (`controllers/test.js`), the unused `service.js`, and unused helpers (`getAccountWithDecryptedConfig`, `resetCounters`, `isLinkTrackingEnabled`, `isOpenTrackingEnabled`, `getTrackingBaseUrl`); the dev integration script no longer calls removed endpoints, asserts they return 404 and prints no part of the admin JWT.

# [3.1.0](https://github.com/Schero94/Magic-Mail/compare/v3.0.4...v3.1.0) (2026-10-15)


### Bug Fixes

* align CI installs with lockfile settings ([657f8cb](https://github.com/Schero94/Magic-Mail/commit/657f8cb8f6ef9b0e35e6c3d52a987c4186d90984))
* keep Magic-Mail tabs in sync with URL ([e3522a6](https://github.com/Schero94/Magic-Mail/commit/e3522a64606bca39065260556d03e56449ae8a2f))
* make release failure notices tolerant of missing labels ([2b2403e](https://github.com/Schero94/Magic-Mail/commit/2b2403e3ad9c30b668b1b6f804373e31af682cee))


### Features

* make Magic-Mail email-only and harden delivery ([906c813](https://github.com/Schero94/Magic-Mail/commit/906c8133e18e54608ba2b621daf4040f579aaa2d))

## [3.0.4](https://github.com/Schero94/Magic-Mail/compare/v3.0.3...v3.0.4) (2026-07-11)


### Bug Fixes

* **admin:** correct dark-mode navigation and free template docs ([557534f](https://github.com/Schero94/Magic-Mail/commit/557534f520cf0b562e031dc27a5c2e93485f3de9))
* **email:** preserve Bcc delivery for Gmail and Microsoft ([ea681ea](https://github.com/Schero94/Magic-Mail/commit/ea681ea87c04c65e69013b048646764f69c0729f))

## [3.0.3](https://github.com/Schero94/Magic-Mail/compare/v3.0.2...v3.0.3) (2026-07-11)


### Bug Fixes

* **admin:** use compact switch in template editor ([710db87](https://github.com/Schero94/Magic-Mail/commit/710db87e3b1db2c4ed3c7a1f75f30cc528574823))
* **admin:** use compact switches in account setup ([0b7abbb](https://github.com/Schero94/Magic-Mail/commit/0b7abbb24668de4199dc2b4cd1ff08f7551b0dc4))
* **admin:** use compact switches in plugin settings ([81b17cf](https://github.com/Schero94/Magic-Mail/commit/81b17cf60b9ae192307380e1177c03eec84868a6))
* **admin:** use compact switches in routing rules ([25e540e](https://github.com/Schero94/Magic-Mail/commit/25e540e0627e7e1b570696bdd5622ee32291faff))
* **admin:** use theme-aware switch card borders ([c04600d](https://github.com/Schero94/Magic-Mail/commit/c04600d4c0f8fe1168c15d5e84824da5511f3cd9))

## [3.0.2](https://github.com/Schero94/Magic-Mail/compare/v3.0.1...v3.0.2) (2026-07-11)


### Bug Fixes

* **admin:** make Test Mode option title and description readable ([ccb605c](https://github.com/Schero94/Magic-Mail/commit/ccb605c0998c4b5d05da309411adf81466b383cc))

## [3.0.1](https://github.com/Schero94/Magic-Mail/compare/v3.0.0...v3.0.1) (2026-07-11)


### Bug Fixes

* **docs:** state MagicMail is fully free and drop remaining tier markers ([47118e5](https://github.com/Schero94/Magic-Mail/commit/47118e55e3ca5cc8c5c8202b55b55f81c8080497))

# [3.0.0](https://github.com/Schero94/Magic-Mail/compare/v2.10.11...v3.0.0) (2026-07-11)


* feat(free)!: make MagicMail fully free and remove all licensing and telemetry ([d713246](https://github.com/Schero94/Magic-Mail/commit/d71324630bd9fb00d838dbbc25581f73e815bb5c))


### Bug Fixes

* **admin:** repair broken admin contracts and toggle accessibility ([e436849](https://github.com/Schero94/Magic-Mail/commit/e436849d404bf66a7093f7b5980f2f7b45bfc26f))
* **delivery:** correct provider adapters, failover accounting and quota atomicity ([755ccfe](https://github.com/Schero94/Magic-Mail/commit/755ccfea866c16cd54dbe7cfcd203421362aa241))
* **domain:** correct account, settings, template, routing and lifecycle contracts ([e81bea9](https://github.com/Schero94/Magic-Mail/commit/e81bea99a942e776265673b813e63772715062d8))
* **security:** close OAuth XSS, duplicate delivery, tracking and sanitization gaps ([e7a1bc9](https://github.com/Schero94/Magic-Mail/commit/e7a1bc9c9514fcb3405ca6155d6b90b970b0a56b))


### BREAKING CHANGES

* The license system is removed. The admin /license/* endpoints,
the license-guard service, the paid-tier feature gates, the license admin pages,
and all device/telemetry pings to the former license server no longer exist.
Every feature (all providers, unlimited accounts, routing rules, templates, and
version history) is available to everyone with no license key or activation.
Existing installations keep working; any stored license key is ignored.

- Server: delete license-guard service, license controller, /license/* routes,
  config/features.js, and every license call site (email-router, accounts,
  oauth, routing-rules, email-designer).
- Admin: delete LicensePage, license Settings page, useLicense hook and
  LicenseGuard; drop the Upgrade/License settings links and the license
  heartbeat; render every tab/feature and template versioning unconditionally;
  remove paywalls and upgrade CTAs; drop license/tier translation keys.
- README: remove the license-validation "additional condition" and tier limits.

## [2.10.11](https://github.com/Schero94/Magic-Mail/compare/v2.10.10...v2.10.11) (2026-04-21)


### Bug Fixes

* **email-designer:** generate duplicate-template refId within int4 range ([d1ecae8](https://github.com/Schero94/Magic-Mail/commit/d1ecae8d657ead41521b08fcad35d9c483f779d9))

## [2.10.10](https://github.com/Schero94/Magic-Mail/compare/v2.10.9...v2.10.10) (2026-04-21)


### Bug Fixes

* **validation:** auto-strip Strapi system metadata before .strict() check ([039b889](https://github.com/Schero94/Magic-Mail/commit/039b889d96d6a076e199bec7497304c6900b8165))

## [2.10.9](https://github.com/Schero94/Magic-Mail/compare/v2.10.8...v2.10.9) (2026-04-21)


### Bug Fixes

* **email-designer:** resolve PUT 500s on template update by whitelisting payload + proper error propagation ([29dd0c0](https://github.com/Schero94/Magic-Mail/commit/29dd0c0f6744a87108323ba511246502c5c3fc84))

## [2.10.8](https://github.com/Schero94/Magic-Mail/compare/v2.10.7...v2.10.8) (2026-04-21)


### Bug Fixes

* **editor:** navigate to newly created templates by templateReferenceId, not DB id ([617dc01](https://github.com/Schero94/Magic-Mail/commit/617dc01106101a7407bcfadbb61bbe49ef8eb43e))

## [2.10.7](https://github.com/Schero94/Magic-Mail/compare/v2.10.6...v2.10.7) (2026-04-21)


### Bug Fixes

* **email-designer:** prioritize templateReferenceId in findById() to match actual admin UI usage ([bcd7a4b](https://github.com/Schero94/Magic-Mail/commit/bcd7a4bd3b9640f8bc58694ec7a81fddb262245f))

## [2.10.6](https://github.com/Schero94/Magic-Mail/compare/v2.10.5...v2.10.6) (2026-04-21)


### Bug Fixes

* **designer:** correct template lookup order so 'Send Test' hits the actual template ([c62c0e4](https://github.com/Schero94/Magic-Mail/commit/c62c0e461d39275dca2a176276d2797c9743a8fd))

## [2.10.5](https://github.com/Schero94/Magic-Mail/compare/v2.10.4...v2.10.5) (2026-04-21)


### Bug Fixes

* **deps:** declare zod ^3.25.76 as direct dependency (was phantom / transitive) ([70f82c4](https://github.com/Schero94/Magic-Mail/commit/70f82c44c8cf80e60e66a632748f724f1df487b2))

## [2.10.4](https://github.com/Schero94/Magic-Mail/compare/v2.10.3...v2.10.4) (2026-04-21)


### Bug Fixes

* **build:** use non-destructured require for zod + @strapi/utils ([054a091](https://github.com/Schero94/Magic-Mail/commit/054a0914b24ef336d56ffd1638ca43dd9a121bee))

## [2.10.3](https://github.com/Schero94/Magic-Mail/compare/v2.10.2...v2.10.3) (2026-04-21)


### Bug Fixes

* **build:** declare @strapi/utils as peerDependency — preventive fix against zod/v4 crash ([7794b3d](https://github.com/Schero94/Magic-Mail/commit/7794b3db99447a9172b9226e5f13b7f0c763fa10))

## [2.10.2](https://github.com/Schero94/Magic-Mail/compare/v2.10.1...v2.10.2) (2026-04-21)


### Bug Fixes

* **rbac:** make plugin::magic-mail.access visible in role editor ([63c80ce](https://github.com/Schero94/Magic-Mail/commit/63c80ce9351d455a96fb7b8637a4abdb5ed2c39e))

## [2.10.1](https://github.com/Schero94/Magic-Mail/compare/v2.10.0...v2.10.1) (2026-04-21)


### Bug Fixes

* **build:** pin @strapi/sdk-plugin to ^5.4.0 — v6 produces broken 23-line stub bundles ([1a40b1a](https://github.com/Schero94/Magic-Mail/commit/1a40b1adebe475009addb06a0fb285b871529f4e))

# [2.10.0](https://github.com/Schero94/Magic-Mail/compare/v2.9.2...v2.10.0) (2026-04-21)


### Bug Fixes

* **accounts:** accept isActive on create + surface Zod field errors through a 400 envelope ([b685746](https://github.com/Schero94/Magic-Mail/commit/b685746e82f4797326027730de9b78e08987d473))
* **accounts:** return 500 -> graceful soft result when account credentials cannot be decrypted ([f6d92d0](https://github.com/Schero94/Magic-Mail/commit/f6d92d060a6da0f69c5bc37a129166b8b190cd0f))
* **deps:** move baileys to optionalDependencies + bump runtime deps ([ac92c5f](https://github.com/Schero94/Magic-Mail/commit/ac92c5fe1442599cd8a8a78b8781b60df8dc72a9)), closes [package.json#exports](https://github.com/package.json/issues/exports)
* **deps:** pin styled-components to ^6.3.9 to avoid npm ci ERESOLVE ([2a84b8b](https://github.com/Schero94/Magic-Mail/commit/2a84b8be2dc328333965235e45b080dbdca0274d))
* **deps:** revert baileys back to dependencies, document protobufjs override for consumers ([9a8726e](https://github.com/Schero94/Magic-Mail/commit/9a8726e2b8bdd908b7a2edc47c885c01695cab82))
* **license:** centralise license-server calls behind fetchWithTimeout (12s + 1 retry) ([f2aba82](https://github.com/Schero94/Magic-Mail/commit/f2aba827db3278cfebbe6cb58723c4b42ac6d554))
* sweep remaining schema/payload mismatches and swallowed validation errors ([91781f5](https://github.com/Schero94/Magic-Mail/commit/91781f574e67fbde1604c7973bb6b5abe7bb3f36))


### Features

* **ui:** redesign Edit/Add Account provider picker for legibility in dark mode ([eb227b4](https://github.com/Schero94/Magic-Mail/commit/eb227b4a3a220352f0f2383a150d92128998d007))

## [2.9.2](https://github.com/Schero94/Magic-Mail/compare/v2.9.1...v2.9.2) (2026-04-20)


### Bug Fixes

* **enduser,tracking:** replace JSON error with branded HTML fallback for broken click-tracking links ([837d926](https://github.com/Schero94/Magic-Mail/commit/837d9265b584811438640f02999677227d40d6d7))

## [2.9.1](https://github.com/Schero94/Magic-Mail/compare/v2.9.0...v2.9.1) (2026-04-20)


### Bug Fixes

* **security:** gate every admin route with hasPermissions (plugin::magic-mail.access) ([dbce0b8](https://github.com/Schero94/Magic-Mail/commit/dbce0b8762818ecbb78f936f32e45558f7fae09c))

# [2.9.0](https://github.com/Schero94/Magic-Mail/compare/v2.8.4...v2.9.0) (2026-04-20)


### Features

* **security:** zod validation, strict from-header, masked secrets, rate-limit ([6328dd1](https://github.com/Schero94/Magic-Mail/commit/6328dd199797c53283f4b45e01443418589f8153))

## [2.8.4](https://github.com/Schero94/Magic-Mail/compare/v2.8.3...v2.8.4) (2026-04-15)


### Bug Fixes

* **rbac:** keep routes functional, only hide UI for unpermitted roles ([ebb9ed3](https://github.com/Schero94/Magic-Mail/commit/ebb9ed32225c1cdabc783fd72d88a8abe0962905))

## [2.8.3](https://github.com/Schero94/Magic-Mail/compare/v2.8.2...v2.8.3) (2026-03-13)


### Bug Fixes

* pass bcc/cc to all email providers ([b4058ce](https://github.com/Schero94/Magic-Mail/commit/b4058ceda478cc8e14a9d96a02b0af6f927b2d92))

## [2.8.2](https://github.com/Schero94/Magic-Mail/compare/v2.8.1...v2.8.2) (2026-02-16)


### Bug Fixes

* restore unmasked licenseKey in API response (needed for license server communication) ([1069633](https://github.com/Schero94/Magic-Mail/commit/10696337c514db6dde42a61604707b8c32aece77))

## [2.8.1](https://github.com/Schero94/Magic-Mail/compare/v2.8.0...v2.8.1) (2026-02-16)


### Bug Fixes

* accept 500 for unconfigured core template in test ([234bdc5](https://github.com/Schero94/Magic-Mail/commit/234bdc5f73fa70af3bbbd9c48cd363330278c88f))

# [2.8.0](https://github.com/Schero94/Magic-Mail/compare/v2.7.0...v2.8.0) (2026-02-16)


### Features

* add endpoint coverage tests for all untested routes ([4fb5b1a](https://github.com/Schero94/Magic-Mail/commit/4fb5b1aa6885b804111753bbad517b4240b64cdc))

# [2.7.0](https://github.com/Schero94/Magic-Mail/compare/v2.6.8...v2.7.0) (2026-02-16)


### Features

* add security exploit tests to test suite ([4442894](https://github.com/Schero94/Magic-Mail/commit/44428945658bf56024c9c9652a933c9e790d0b36))

## [2.6.8](https://github.com/Schero94/Magic-Mail/compare/v2.6.7...v2.6.8) (2026-02-16)


### Bug Fixes

* comprehensive security hardening and bug fixes ([049a71e](https://github.com/Schero94/Magic-Mail/commit/049a71eb135a4fa49d8df38eef879349a7aab2f5))

## [2.6.7](https://github.com/Schero94/Magic-Mail/compare/v2.6.6...v2.6.7) (2026-02-16)


### Bug Fixes

* comprehensive email address normalization and validation ([5c9769c](https://github.com/Schero94/Magic-Mail/commit/5c9769cf5214bbacd6784ca991374d0d50b86e3b))

## [2.6.6](https://github.com/Schero94/Magic-Mail/compare/v2.6.5...v2.6.6) (2026-02-16)


### Bug Fixes

* normalize recipient email to lowercase before sending ([d0c53dd](https://github.com/Schero94/Magic-Mail/commit/d0c53dd9df312cba94117e3a4e3cb8a3e6079f9a))

## [2.6.5](https://github.com/Schero94/Magic-Mail/compare/v2.6.4...v2.6.5) (2026-02-14)


### Bug Fixes

* resolve libsignal git+ssh dependency issue for CI/CD compatibility ([3975015](https://github.com/Schero94/Magic-Mail/commit/3975015c96538bbb694233c94588893735cff582))

## [2.6.4](https://github.com/Schero94/Magic-Mail/compare/v2.6.3...v2.6.4) (2026-02-08)


### Bug Fixes

* dark mode compatibility for LicensePage and LicenseGuard ([21427be](https://github.com/Schero94/Magic-Mail/commit/21427bed9fe461590db8dc4712f8a568d38ccc48)), closes [#4945ff](https://github.com/Schero94/Magic-Mail/issues/4945ff)
* remove TypeScript syntax from JSX file (FeatureText) ([749d2a4](https://github.com/Schero94/Magic-Mail/commit/749d2a491f81f1098bb479aebca7d143b6596ee9))

## [2.6.3](https://github.com/Schero94/Magic-Mail/compare/v2.6.2...v2.6.3) (2026-02-08)


### Bug Fixes

* use props.theme.colors.neutral0 for dark mode card backgrounds ([15df80f](https://github.com/Schero94/Magic-Mail/commit/15df80f4790b39c2b4b0595325fcf1f6326f94a1))

## [2.6.2](https://github.com/Schero94/Magic-Mail/compare/v2.6.1...v2.6.2) (2026-02-07)


### Bug Fixes

* dark/light mode compatibility for entire admin UI ([f373d6f](https://github.com/Schero94/Magic-Mail/commit/f373d6f97f4dfb625a40407e53b261467548b43f))

## [2.6.1](https://github.com/Schero94/Magic-Mail/compare/v2.6.0...v2.6.1) (2026-02-07)


### Bug Fixes

* **admin:** use templateReferenceId for template navigation ([d91f03d](https://github.com/Schero94/Magic-Mail/commit/d91f03da5ca956a7b1540a4671ac7b9962baea10))

# [2.6.0](https://github.com/Schero94/Magic-Mail/compare/v2.5.0...v2.6.0) (2026-01-26)


### Features

* **admin:** add session heartbeat to prevent token expiration ([045a728](https://github.com/Schero94/Magic-Mail/commit/045a728dbe694c028b44a1f89929c7537c5d6e40))

# [2.5.0](https://github.com/Schero94/Magic-Mail/compare/v2.4.0...v2.5.0) (2026-01-25)


### Features

* **whatsapp:** add send test message modal with styled UI ([c3bda11](https://github.com/Schero94/Magic-Mail/commit/c3bda110fc32ebaf1e12eccaf2ee51aca7647ae1))

# [2.4.0](https://github.com/Schero94/Magic-Mail/compare/v2.3.11...v2.4.0) (2026-01-25)


### Features

* v2.4.0 - Major UI improvements and WhatsApp integration ([e5df08e](https://github.com/Schero94/Magic-Mail/commit/e5df08e431ec978706c14d5862d7819bdf89e53d))

## [2.3.11](https://github.com/Schero94/Magic-Mail/compare/v2.3.10...v2.3.11) (2026-01-04)


### Bug Fixes

* use relative paths for menu and settings links ([709849a](https://github.com/Schero94/Magic-Mail/commit/709849a5b7c78813380f1ae62bce137b792a1118))

## [2.3.10](https://github.com/Schero94/Magic-Mail/compare/v2.3.9...v2.3.10) (2026-01-01)


### Bug Fixes

* only replace URLs in href attributes, not in link text ([7bd1054](https://github.com/Schero94/Magic-Mail/commit/7bd10547834317456a689e55c810de9baf4d6b6b))

## [2.3.9](https://github.com/Schero94/Magic-Mail/compare/v2.3.8...v2.3.9) (2026-01-01)


### Bug Fixes

* add findVersionById to support numeric version IDs ([648d5ca](https://github.com/Schero94/Magic-Mail/commit/648d5ca805aa93abaad5e223ba54dea628d547b2))

## [2.3.8](https://github.com/Schero94/Magic-Mail/compare/v2.3.7...v2.3.8) (2026-01-01)


### Bug Fixes

* correct populate syntax for Strapi v5 ([465a6e0](https://github.com/Schero94/Magic-Mail/commit/465a6e04ac6ea848bf55c345cfa7570b6d66676a))

## [2.3.7](https://github.com/Schero94/Magic-Mail/compare/v2.3.6...v2.3.7) (2026-01-01)


### Bug Fixes

* support both templateReferenceId and internal db id lookup ([163529f](https://github.com/Schero94/Magic-Mail/commit/163529f91fa8dd0cac3803797b2fa58a711a4920))

## [2.3.6](https://github.com/Schero94/Magic-Mail/compare/v2.3.5...v2.3.6) (2026-01-01)


### Bug Fixes

* use templateReferenceId for numeric ID lookup ([85aa4d8](https://github.com/Schero94/Magic-Mail/commit/85aa4d83dc08943a20b21ef9a6accc62b43c7445))

## [2.3.5](https://github.com/Schero94/Magic-Mail/compare/v2.3.4...v2.3.5) (2026-01-01)


### Bug Fixes

* use entityService for numeric ID lookup in findById ([94b7cad](https://github.com/Schero94/Magic-Mail/commit/94b7cad283f6d070ee168295d912feae1ae11e88))

## [2.3.4](https://github.com/Schero94/Magic-Mail/compare/v2.3.3...v2.3.4) (2026-01-01)


### Bug Fixes

* resolve documentId from findOne for all template operations ([1c4ff2b](https://github.com/Schero94/Magic-Mail/commit/1c4ff2ba241e986a046d46c0c1c483c2648c2bf5))

## [2.3.3](https://github.com/Schero94/Magic-Mail/compare/v2.3.2...v2.3.3) (2026-01-01)


### Bug Fixes

* findOne supports both numeric id and documentId ([c1b3312](https://github.com/Schero94/Magic-Mail/commit/c1b3312694f633b210eac5728b7a819044f9c163))

## [2.3.2](https://github.com/Schero94/Magic-Mail/compare/v2.3.1...v2.3.2) (2026-01-01)


### Bug Fixes

* improve template import to support email-designer-5 format ([290d31a](https://github.com/Schero94/Magic-Mail/commit/290d31a57b109137f74c547a8c64b90e80e37f29))

## [2.3.1](https://github.com/Schero94/Magic-Mail/compare/v2.3.0...v2.3.1) (2026-01-01)


### Bug Fixes

* JSON encryption + documentId filter + remove emojis from logs ([b1433ce](https://github.com/Schero94/Magic-Mail/commit/b1433ce6a762eaae846de3eb4e76e775956f6214))

# [2.3.0](https://github.com/Schero94/Magic-Mail/compare/v2.2.6...v2.3.0) (2025-12-16)


### Features

* add WhatsApp messaging integration v2.4.0 ([a3e6dca](https://github.com/Schero94/Magic-Mail/commit/a3e6dca51b00782860e6120c71ec6605dd03ef89))

## [2.2.6](https://github.com/Schero94/Magic-Mail/compare/v2.2.5...v2.2.6) (2025-12-14)


### Bug Fixes

* clean up README formatting ([e8f4f45](https://github.com/Schero94/Magic-Mail/commit/e8f4f4530e74fca7b4c4f115d8e3da9ca9e0abdb))

## [2.2.5](https://github.com/Schero94/Magic-Mail/compare/v2.2.4...v2.2.5) (2025-12-14)


### Bug Fixes

* remove source folders from npm package ([d14411f](https://github.com/Schero94/Magic-Mail/commit/d14411f18e424f885cfec1dabe002d2367f6da83))

## [2.2.4](https://github.com/Schero94/Magic-Mail/compare/v2.2.3...v2.2.4) (2025-12-14)


### Bug Fixes

* enable npm provenance with OIDC trusted publishing ([317db0e](https://github.com/Schero94/Magic-Mail/commit/317db0ea6d36b546dbb50a72ae5d14f965a6c0a4))

## [2.2.3](https://github.com/Schero94/Magic-Mail/compare/v2.2.2...v2.2.3) (2025-12-14)


### Bug Fixes

* update release workflow for new npm token requirements ([a4900b4](https://github.com/Schero94/Magic-Mail/commit/a4900b40da2a7e0f95493b9770c45b51ebd787dd))

## [2.2.2](https://github.com/Schero94/Magic-Mail/compare/v2.2.1...v2.2.2) (2025-12-14)


### Bug Fixes

* add debug mode documentation to README ([5fe8e26](https://github.com/Schero94/Magic-Mail/commit/5fe8e26b8b86ee8d5e55e3627b697c8f7fe1c683))

## [2.2.1](https://github.com/Schero94/Magic-Mail/compare/v2.2.0...v2.2.1) (2025-12-14)


### Bug Fixes

* add debug mode for plugin logging ([a95711e](https://github.com/Schero94/Magic-Mail/commit/a95711e9f88ccb20030ce1c05a2cd11ea89bf577))

# [2.2.0](https://github.com/Schero94/Magic-Mail/compare/v2.1.0...v2.2.0) (2025-12-08)


### Features

* enhance pull request template with email-specific sections and provider testing checklist ([6040125](https://github.com/Schero94/Magic-Mail/commit/6040125508af8a2209b3d37693e102f2aeb80325))

# [2.1.0](https://github.com/Schero94/Magic-Mail/compare/v2.0.4...v2.1.0) (2025-12-08)


### Features

* enhance GitHub issue templates with email provider specific fields and feature request template ([bec7d30](https://github.com/Schero94/Magic-Mail/commit/bec7d30de766c041f07c6f07fa2476fe4e285fe7))

## [2.0.4](https://github.com/Schero94/Magic-Mail/compare/v2.0.3...v2.0.4) (2025-12-08)


### Bug Fixes

* add GitHub templates for better open-source collaboration ([d412ece](https://github.com/Schero94/Magic-Mail/commit/d412eceb29455a494b1f839dc55308d783752bbe))

## [2.0.3](https://github.com/Schero94/Magic-Mail/compare/v2.0.2...v2.0.3) (2025-12-04)


### Bug Fixes

* relation filtering for Strapi v5 Document Service API ([03818b4](https://github.com/Schero94/Magic-Mail/commit/03818b49347893c9c88def5b25a2c3a86a308c74))

## [2.0.2](https://github.com/Schero94/Magic-Mail/compare/v2.0.1...v2.0.2) (2025-11-23)


### Bug Fixes

* Readme with real limits ([b861c33](https://github.com/Schero94/Magic-Mail/commit/b861c33956fcc90206e6d825a2664de00e10b84b))

## [2.0.1](https://github.com/Schero94/Magic-Mail/compare/v2.0.0...v2.0.1) (2025-11-23)


### Bug Fixes

* Update readme ([caf4e21](https://github.com/Schero94/Magic-Mail/commit/caf4e217811772d1489d9267f88d9015f95f8b46))

# [2.0.0](https://github.com/Schero94/Magic-Mail/compare/v1.0.5...v2.0.0) (2025-11-23)


### Bug Fixes

* resolve EmailEditor component export ([7fa3368](https://github.com/Schero94/Magic-Mail/commit/7fa3368db66476697894e45c76263d5bc2e58770))
* resolve react-email-editor import issue in production builds ([3c90d35](https://github.com/Schero94/Magic-Mail/commit/3c90d358ed76352bd5494a01e1fb3c110f2d8cef))
* resolve react-email-editor import issue in production builds ([fdb54c3](https://github.com/Schero94/Magic-Mail/commit/fdb54c3c283d897fd4230c721309e86633458d3f))
* Update readme ([965c663](https://github.com/Schero94/Magic-Mail/commit/965c663c9c657c37201cda89e2a2597aa45f88ec))


### BREAKING CHANGES

* Changed from lazy import to static import to fix 'Element type is invalid' error when creating email templates in production environments

# [2.0.0](https://github.com/Schero94/Magic-Mail/compare/v1.0.5...v2.0.0) (2025-11-23)


### Bug Fixes

* resolve EmailEditor component export ([7fa3368](https://github.com/Schero94/Magic-Mail/commit/7fa3368db66476697894e45c76263d5bc2e58770))
* resolve react-email-editor import issue in production builds ([3c90d35](https://github.com/Schero94/Magic-Mail/commit/3c90d358ed76352bd5494a01e1fb3c110f2d8cef))
* resolve react-email-editor import issue in production builds ([fdb54c3](https://github.com/Schero94/Magic-Mail/commit/fdb54c3c283d897fd4230c721309e86633458d3f))


### BREAKING CHANGES

* Changed from lazy import to static import to fix 'Element type is invalid' error when creating email templates in production environments

## [1.0.5](https://github.com/Schero94/Magic-Mail/compare/v1.0.4...v1.0.5) (2025-11-23)


### Bug Fixes

* load email designer without lazy import ([4832fee](https://github.com/Schero94/Magic-Mail/commit/4832fee7f4e213267419aede9ee897135ac64eee))

## [1.0.4](https://github.com/Schero94/Magic-Mail/compare/v1.0.3...v1.0.4) (2025-11-23)


### Bug Fixes

* Correct lazy loading for react-email-editor ([674f7eb](https://github.com/Schero94/Magic-Mail/commit/674f7eb33bf063723302a9ca5836def201ee6418))

## [1.0.3](https://github.com/Schero94/Magic-Mail/compare/v1.0.2...v1.0.3) (2025-11-23)


### Bug Fixes

* Update email designer editor page ([65fdcc0](https://github.com/Schero94/Magic-Mail/commit/65fdcc0feda08ce8d202a81870ccf7fb28d2f40d))

## [1.0.1](https://github.com/Schero94/Magic-Mail/compare/v1.0.0...v1.0.1) (2025-11-23)


### Bug Fixes

* Correct repository URL to Magic-Mail (with hyphen) ([9122f54](https://github.com/Schero94/Magic-Mail/commit/9122f5444809c9099d0788b7f17f4abb591f2b3e))
* Update Node.js to v22 and sync package-lock.json ([3c3f074](https://github.com/Schero94/Magic-Mail/commit/3c3f0743a99c7998c12c24ed2b402bbbf2fd6257))
* Update Node.js version to 22 in semantic-release workflow ([dd24139](https://github.com/Schero94/Magic-Mail/commit/dd241398aeea160d9dbc59f4ae533c0fb4611176))

## [1.0.1](https://github.com/Schero94/Magic-Mail/compare/v1.0.0...v1.0.1) (2025-11-23)


### Bug Fixes

* Correct repository URL to Magic-Mail (with hyphen) ([9122f54](https://github.com/Schero94/Magic-Mail/commit/9122f5444809c9099d0788b7f17f4abb591f2b3e))
* Update Node.js to v22 and sync package-lock.json ([3c3f074](https://github.com/Schero94/Magic-Mail/commit/3c3f0743a99c7998c12c24ed2b402bbbf2fd6257))
* Update Node.js version to 22 in semantic-release workflow ([dd24139](https://github.com/Schero94/Magic-Mail/commit/dd241398aeea160d9dbc59f4ae533c0fb4611176))

## [1.0.1](https://github.com/Schero94/Magic-Mail/compare/v1.0.0...v1.0.1) (2025-11-23)


### Bug Fixes

* Correct repository URL to Magic-Mail (with hyphen) ([1801a22](https://github.com/Schero94/Magic-Mail/commit/1801a228b83aa2ac69c8d93482db753d446ab8cc))
* Update Node.js to v22 and sync package-lock.json ([1e0e0ad](https://github.com/Schero94/Magic-Mail/commit/1e0e0ad4dbddabe6fcee88122f38b3f6852a6c9d))
* Update Node.js version to 22 in semantic-release workflow ([7ed867f](https://github.com/Schero94/Magic-Mail/commit/7ed867f45e1f160c1617dc5c27ebb0b60a9a21a4))
