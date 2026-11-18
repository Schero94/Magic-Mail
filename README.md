<p align="center">
  <img src="https://raw.githubusercontent.com/Schero94/Magic-Mail/main/docs/site/img/icon.svg" alt="MagicMail icon" width="96" height="96" />
</p>

# MagicMail for Strapi 5

Send every Strapi email through the right account: several SMTP and API accounts, routing rules, quotas, failover that never doubles a mail, an outbox with retries, templates and delivery tracking, all inside the Strapi admin.

[![npm version](https://img.shields.io/npm/v/strapi-plugin-magic-mail.svg)](https://www.npmjs.com/package/strapi-plugin-magic-mail)
[![npm downloads](https://img.shields.io/npm/dm/strapi-plugin-magic-mail.svg)](https://www.npmjs.com/package/strapi-plugin-magic-mail)
[![CI build status](https://img.shields.io/github/actions/workflow/status/Schero94/Magic-Mail/ci.yml?branch=main&label=CI&logo=github)](https://github.com/Schero94/Magic-Mail/actions/workflows/ci.yml?query=branch%3Amain)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/Schero94/Magic-Mail/blob/main/LICENSE)
[![Strapi 5.57+](https://img.shields.io/badge/Strapi-5.57%2B-4945FF.svg)](https://github.com/Schero94/Magic-Mail#compatibility)
[![Documentation site](https://img.shields.io/badge/docs-project%20site-6d4aff.svg)](https://schero94.github.io/Magic-Mail/)

Live docs: https://schero94.github.io/Magic-Mail/

Your code keeps calling `strapi.plugin('email').service('email').send()`. Strapi's password-reset mail and every Users & Permissions mail go through MagicMail without changes. MagicMail picks the account, reserves its quota, logs the mail and tells you what happened to it.

MagicMail sends email only. It is MIT licensed, with no license key, tiers or usage limits.

## What you get

- **Six providers.** Gmail, Microsoft 365 and Yahoo with OAuth 2.0, any SMTP server (optional DKIM), SendGrid and Mailgun. Credentials are encrypted with AES-256-GCM and never reach the browser.
- **Routing rules.** Choose the account by email type, recipient, subject, template or a custom value, with a fallback account per rule.
- **Quotas and safe failover.** Hourly and daily limits per account, reserved atomically. When an account fails, the next one is tried only if the error proves the provider did not take the mail, so a mail is never delivered twice by failover.
- **Outbox with retries.** Opt-in per send or for every failed send: 3 retries by default (after 1, 5 and 15 minutes, configurable from 1 to 10), idempotency keys, and an Outbox tab where you retry, discard or mark uncertain mails as sent.
- **Delivery webhooks.** Signed SendGrid and Mailgun webhooks record bounces, blocks, complaints, deferrals, deliveries and unsubscribes on the delivery log, feed the suppression list and emit events other plugins can listen to.
- **Templates.** A visual editor (Unlayer) or plain HTML and text, Mustache variables, versions with restore, import and export, plus the Users & Permissions reset and confirmation mails.
- **Analytics.** A delivery log with server-side search, open and click tracking with truncated IPs and configurable retention.
- **Several instances.** Railway replicas or pm2 workers on one database work without sticky sessions or Redis.
- **Admin in five languages.** English, German, French, Spanish and Portuguese, in light and dark mode.

## What's new

- **Mailgun domains are checked when you save the account.** A pasted `https://` or trailing slash is removed for you; a value that is not a domain name is flagged right in the form instead of failing later when mail is sent.
- **Failed account tests say what to fix:** wrong API key, missing Mail Send permission, unverified sender, wrong Mailgun region, or a sandbox recipient that is not authorized yet.
- **Clearer key setup:** the wizard recommends keys that can only send mail (SendGrid Custom Access with Mail Send, Mailgun Domain Sending Key).
- **SendGrid and Mailgun webhooks record more outcomes:** deferred, delivered and provider unsubscribes, besides bounces and complaints ([setup](https://github.com/Schero94/Magic-Mail/blob/main/docs/delivery.md#bounces-and-complaints)).
- **Provider hard bounces feed the suppression list** when _Block hard-bounced recipients_ is on.
- **Analytics counts bounces** again, and SendGrid blocks are no longer shown as bounces.
- **SendGrid batches up to 768 KB are accepted** (limit 1 MB, `webhooks.maxBodyBytes`).

## Contents

- [What's new](#whats-new)
- [Screenshots](#screenshots)
- [Quick start](#quick-start)
- [Compatibility](#compatibility)
- [Sending email](#sending-email)
- [Permissions](#permissions)
- [Environment variables](#environment-variables)
- [Security and privacy](#security-and-privacy)
- [Documentation](#documentation)
- [Contributing](#contributing)

## Screenshots

All screenshots show synthetic data (`example.test` addresses) on an isolated Strapi 5.62.0 host, captured at 1080 px wide and 2x pixel density so the text stays readable in a narrow column.

**Email accounts**: status, provider, priority, today's usage against the daily limit, total sent and last use, with edit, test and delete per account.

![Email accounts: stat cards and a table of three accounts (SMTP, SendGrid, Mailgun) with status, provider, priority, usage today against the daily limit, total sent and last used](https://raw.githubusercontent.com/Schero94/Magic-Mail/main/docs/site/img/readme/accounts.webp)

**Routing rules**: rules in evaluation order with match type and value, target and fallback account, and priority.

![Routing rules: five rules in evaluation order with status, match type, match value, target account with fallback, and priority](https://raw.githubusercontent.com/Schero94/Magic-Mail/main/docs/site/img/readme/routing-rules.webp)

**Outbox**: mails waiting for a retry, failed for good, or uncertain, with attempts and the next try or last error code. Retry, mark as sent and discard per row.

![Outbox: two retrying mails, one uncertain mail with the code ECONNECTION and one failed mail with SMTP_550, with attempts, queue time and row actions](https://raw.githubusercontent.com/Schero94/Magic-Mail/main/docs/site/img/readme/outbox.webp)

**Templates**: Reference ID, category and status; edit in the visual or HTML editor, download, duplicate, code snippets, test send.

![Email templates: totals, the custom and core email tabs, and a table of four templates with ID, name, category, status and actions](https://raw.githubusercontent.com/Schero94/Magic-Mail/main/docs/site/img/readme/templates.webp)

**Analytics**: totals and the delivery log with server-side search, delivery status, opens and clicks per email.

![Analytics: sent, opened, clicked and bounced totals and the delivery log with recipient, subject, status, template, time, opens and clicks](https://raw.githubusercontent.com/Schero94/Magic-Mail/main/docs/site/img/readme/analytics.webp)

**Dark mode**: every screen follows the Strapi admin theme.

![Analytics in dark mode with the same totals and delivery log](https://raw.githubusercontent.com/Schero94/Magic-Mail/main/docs/site/img/readme/analytics-dark.webp)

More screens (account wizard, outbox details, template editor, settings, mobile) are in the [gallery on the docs site](https://schero94.github.io/Magic-Mail/#gallery).

## Quick start

About a minute in an existing Strapi 5 project:

```bash
npm install strapi-plugin-magic-mail
# yarn add strapi-plugin-magic-mail  |  pnpm add strapi-plugin-magic-mail
```

```javascript
// config/plugins.js (config/plugins.ts: export default () => ({ ... }))
module.exports = () => ({
  'magic-mail': { enabled: true },
});
```

```bash
# Outside development and test MagicMail needs an encryption key. Generate it once and keep it.
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# .env
MAGIC_MAIL_ENCRYPTION_KEY=<the generated value>
```

```bash
npm run build
npm run develop
```

Open **MagicMail → Email Accounts**, click **Add account**, pick a provider (see [Provider setup](https://github.com/Schero94/Magic-Mail/blob/main/docs/sending.md#provider-setup)) and use the account's **Test** action with your own address. From now on every `strapi.plugin('email')` call goes through MagicMail.

Keep the encryption key stable: without it the stored account credentials cannot be read. Super admins see MagicMail right away; other roles need the [permissions](#permissions) `access` and `read`.

## Compatibility

| MagicMail | Strapi                                     | Node.js                                           | Databases                                                                                |
| --------- | ------------------------------------------ | ------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 4.x       | `^5.57.0` (acceptance host: Strapi 5.62.0) | `>=22.12.0 <=26.x.x` (CI runs Node 22, 24 and 26) | PostgreSQL, MySQL 8, SQLite. Several processes: PostgreSQL tested, MySQL not load-tested |
| 3.1       | `^5.57.0`                                  | `>=20.19.0 <=26.x.x`                              | as Strapi                                                                                |

- Peer dependencies: `@strapi/strapi`, `@strapi/plugin-users-permissions` (every default Strapi app has it; the email log links to its users), `react`, `react-dom`, `react-router-dom` and `styled-components` as in a `create-strapi-app` project. `@strapi/design-system`, `@strapi/icons` and `react-intl` are optional peers, which the Strapi admin provides.
- The packed plugin installs with npm into a Strapi 5.62.0 project without plugin warnings, and its admin builds there (checked 2026-11-17). The yarn 1 and pnpm install check dates from Strapi 5.61.
- The minimum Strapi version is 5.57.0, the first release whose admin ships Design System 2.2.4, the version the MagicMail admin uses. CI also installs that floor (Strapi 5.57.0 with Design System 2.2.4) and runs the tests and the build against it.

## Sending email

MagicMail wraps the provider of `@strapi/email` at startup, so existing code keeps working:

```javascript
await strapi.plugin('email').service('email').send({
  to: 'user@example.com',
  subject: 'Welcome to Example Shop',
  text: 'Thanks for signing up!',
  html: '<h1>Welcome!</h1><p>Thanks for signing up!</p>',
});
```

Both `send()` and `sendTemplatedEmail()` are routed, including Strapi's admin password-reset email and the Users & Permissions emails. When no MagicMail account is active, or every eligible account is over its quota, the mail goes through the Strapi email provider you configured before. Once a MagicMail account has attempted delivery, an error is returned instead, so nothing goes out twice.

Need a specific account, a template or the outbox? Use the router service:

```javascript
await strapi.plugin('magic-mail').service('email-router').send({
  to: 'customer@example.com',
  subject: 'Order confirmation',
  html: '<h1>Your order #12345</h1>',
  accountName: 'Transactional SMTP', // case-insensitive; never replaced by another account
  type: 'transactional',
});
// → { success: true, accountUsed: 'Transactional SMTP', messageId: '<…>', emailId: '…' }
```

All send options, attachments, unsubscribe headers, provider setup, routing rules and templates: [Sending guide](https://github.com/Schero94/Magic-Mail/blob/main/docs/sending.md). HTTP routes: [API reference](https://github.com/Schero94/Magic-Mail/blob/main/docs/api.md).

## Permissions

MagicMail registers six admin actions under **Settings → Administration Panel → Roles → Plugins → MagicMail**:

| Action                            | Grants                                                                                                          |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `plugin::magic-mail.access`       | The MagicMail menu entry and page. No API access by itself                                                      |
| `plugin::magic-mail.read`         | Read accounts, routing rules, templates, analytics and settings; render and export templates; the settings link |
| `plugin::magic-mail.manage`       | Create, update and delete accounts, rules, templates, logs and settings; OAuth setup                            |
| `plugin::magic-mail.test-send`    | Send test emails (account test, Strapi-service test, template test); 10 per minute per admin                    |
| `plugin::magic-mail.queue.read`   | The Outbox tab and queue statistics (no mail content)                                                           |
| `plugin::magic-mail.queue.manage` | Retry, discard, mark as sent and delete outbox mails                                                            |

Typical roles:

- **Read-only:** `access` + `read`
- **Editor:** `access` + `read` + `manage`
- **Tester:** `access` + `read` + `test-send`

When upgrading to 4.4, every role that already had `read` gets `queue.read` and every role with `manage` gets `queue.manage`, once at startup. Super admins always have both.

Editing the Users & Permissions templates also needs the users-permissions email-template permissions; uploading images in the visual editor needs _Media Library → Create (upload)_. Details: [permission migration guide](https://github.com/Schero94/Magic-Mail/blob/main/docs/permission-migration.md).

## Environment variables

| Variable                              | Required                                                 | Purpose                                                                         |
| ------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `MAGIC_MAIL_ENCRYPTION_KEY`           | yes, unless `NODE_ENV` is unset, `development` or `test` | Credential encryption key (32+ bytes). Keep it stable and backed up             |
| `MAGIC_MAIL_ENCRYPTION_KEY_PREVIOUS`  | no                                                       | Previous key during a rotation (decrypt only; saving an account re-encrypts it) |
| `MAGIC_MAIL_OAUTH_STATE_SECRET`       | no                                                       | OAuth state signing secret (default: derived from the encryption key)           |
| `MAGIC_MAIL_TRACKING_SECRET`          | no                                                       | Tracking hash secret (default: derived from the encryption key)                 |
| `MAGIC_MAIL_TRACKING_SECRET_PREVIOUS` | no                                                       | Comma-separated old tracking secrets that stay valid                            |
| `URL`                                 | no                                                       | Legacy override of the OAuth callback base URL (default: `server.url`)          |
| `MAGIC_MAIL_ENABLE_DEBUG_ENDPOINT`    | no                                                       | `true` enables `GET /magic-mail/analytics/debug` outside production             |

Without `MAGIC_MAIL_ENCRYPTION_KEY`, a development key derived from `ADMIN_JWT_SECRET`/`APP_KEYS` is used only when `NODE_ENV` is unset, `development` or `test`; rotating those secrets then makes stored credentials unreadable. Any other environment (for example `staging`) refuses to start without the key.

Also set Strapi's `server.url` to your public URL (OAuth redirects, tracking links) and `server.proxy.koa: true` behind a reverse proxy.

Every plugin config key, the admin settings and the multi-instance setup are in the [configuration guide](https://github.com/Schero94/Magic-Mail/blob/main/docs/configuration.md).

## Security and privacy

- **Credentials.** SMTP passwords, API keys, OAuth tokens and DKIM keys are encrypted with AES-256-GCM (key derived from `MAGIC_MAIL_ENCRYPTION_KEY` with HKDF). The admin API returns the placeholder `********` instead of a secret, and changing the host, user, provider or OAuth client requires the secret again.
- **Admin routes.** Every route needs an authenticated administrator plus the capability listed in [Permissions](#permissions). `access` only shows the menu entry.
- **Content API.** The send routes accept API tokens only (users-permissions roles only with `contentApi.allowUserRoles`), reject unknown fields, file-path and URL attachments, and share 60 requests per minute per token across all instances. Never enable them for the _Public_ role.
- **What goes out.** HTML is sanitised, `from` is pinned to the sending account's address, custom headers are allowlisted, and SMTP requires TLS 1.2 or newer with certificate checks (unless `allowInsecure` is set on a non-production or loopback host).
- **OAuth.** Callbacks are public but use a signed, single-use state with PKCE, bound to the admin who started the flow and stored in the database.
- **Webhooks.** SendGrid and Mailgun requests are verified with the provider signature and a one-hour timestamp window; replays are ignored and bodies are capped (1 MiB by default). Provider messages are not stored; addresses only as a keyed hash plus a masked form (suppression list) or a masked form (events for cc/bcc recipients).
- **Tracking.** Open and click events keep IPs truncated to /24 or /48 and no location, and expire after 90 days (links after 180 days). Authentication links are never tracked. Mention tracking in your privacy notice.
- **Outbox.** Queued mails are stored encrypted and deleted once sent or discarded; the admin API and the Outbox tab never show mail content. `forgetRecipient(address)` removes a recipient's queued mails.
- **Logs.** MagicMail's log lines carry error names and codes, not recipient addresses or message content.
- **Third parties.** Mails go only to the providers you configure. The visual template editor loads Unlayer's editor in the admin's browser (see [the visual editor and privacy](https://github.com/Schero94/Magic-Mail/blob/main/docs/sending.md#the-visual-editor-unlayer-and-privacy)); the plain HTML editor needs no third party.
- **Supply chain.** Releases are published from GitHub Actions with npm provenance.

**Reporting a vulnerability:** use [GitHub private vulnerability reporting](https://github.com/Schero94/Magic-Mail/security/advisories/new). Please do not open a public issue for security problems.

---

## Documentation

| Guide                                                                                                         | What it covers                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Docs site](https://schero94.github.io/Magic-Mail/)                                                           | Overview, screenshot gallery, install, outbox, several instances                                                                                            |
| [Sending, providers, routing and templates](https://github.com/Schero94/Magic-Mail/blob/main/docs/sending.md) | Send options, attachments, Gmail/Microsoft 365/Yahoo/SMTP/SendGrid/Mailgun setup, routing rules, quotas, failover, templates, the visual editor and its CSP |
| [Tracking, bounces and the outbox](https://github.com/Schero94/Magic-Mail/blob/main/docs/delivery.md)         | Open and click tracking, retention, bounce webhooks and mailbox monitoring, recipient checks, retries and the outbox                                        |
| [Content API and Admin API](https://github.com/Schero94/Magic-Mail/blob/main/docs/api.md)                     | Every route with request, response and error examples                                                                                                       |
| [Configuration and several instances](https://github.com/Schero94/Magic-Mail/blob/main/docs/configuration.md) | Every config key, admin settings, account fields, service API, Railway replicas and pm2 clusters                                                            |
| [Troubleshooting and FAQ](https://github.com/Schero94/Magic-Mail/blob/main/docs/troubleshooting.md)           | Mail not received, OAuth errors, 400/403/429 responses, CSP, DMARC                                                                                          |
| [Live webhook checks](https://github.com/Schero94/Magic-Mail/blob/main/docs/live-webhook-checks.md)           | Checking the SendGrid and Mailgun webhooks against your real accounts: test buttons, a real bounce, what to expect                                          |
| [Upgrading](https://github.com/Schero94/Magic-Mail/blob/main/docs/upgrading.md)                               | Migration notes for every release since 4.0.0                                                                                                               |
| [Permission migration](https://github.com/Schero94/Magic-Mail/blob/main/docs/permission-migration.md)         | Granting the 4.x admin capabilities                                                                                                                         |
| [Changelog](https://github.com/Schero94/Magic-Mail/blob/main/CHANGELOG.md)                                    | Every release                                                                                                                                               |

## Contributing

Bug reports, fixes and documentation improvements are welcome.

- **Bug?** [Open a bug report](https://github.com/Schero94/Magic-Mail/issues/new?template=bug-report.yml) with your Strapi, Node.js and MagicMail versions and the `[magic-mail]` log lines (remove addresses and secrets first).
- **Idea?** [Open a feature request](https://github.com/Schero94/Magic-Mail/issues/new?template=feature-request.yml).
- **Security issue?** See [Security and privacy](#security-and-privacy).

Development setup:

```bash
npm ci --ignore-scripts
npm run lint
npm run format:check
npm test
npm run build
npm run verify
npm run verify:runtime
```

`npm run test:multi-instance` runs the multi-process suite (set `MAGIC_MAIL_TEST_PG_URL` for PostgreSQL). `npm run watch` (or `npm run watch:link` with yalc) rebuilds the admin and the server bundle on change. CI runs the same checks on Node 22 and 24 for every pull request and every push to `main`. Use [Conventional Commits](https://www.conventionalcommits.org/) (`fix:`, `feat:`, `docs:`); releases are cut from `main` by semantic-release.

**Dependency audits.** Run `npm audit` from your Strapi project root to check the complete installed tree; npm applies overrides from the root project only. MagicMail validates every request with its own zod (`^4.6.7`) and bounds all collections. Strapi itself ships other zod copies inside `@strapi/*` packages; if `npm audit` in your project reports one of them, the fix comes with a Strapi update.

**Maintenance status.** Actively maintained. Releases follow semantic versioning and support the Strapi 5 line.

**Languages.** The admin UI is available in English, German, French, Spanish and Portuguese.

## License

MIT License, Copyright © 2025 Schero D. See [LICENSE](https://github.com/Schero94/Magic-Mail/blob/main/LICENSE).

Built with [Strapi](https://strapi.io), [Nodemailer](https://nodemailer.com), [Unlayer](https://unlayer.com) / [react-email-editor](https://github.com/unlayer/react-email-editor), [Heroicons](https://heroicons.com) and [styled-components](https://styled-components.com).
