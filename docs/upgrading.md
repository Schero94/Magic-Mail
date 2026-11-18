# Upgrading MagicMail

What to do when you upgrade from an older release.

Part of the [MagicMail documentation](https://schero94.github.io/Magic-Mail/). Start with the [README](https://github.com/Schero94/Magic-Mail#readme) for install and quick start.

- [Migration notes](#migration-notes)

## Migration notes

The full list is in [CHANGELOG.md](../CHANGELOG.md). Upgrade one minor or major at a time and read each step.

### Upgrading to the release with provider templates

Nothing to do. A new collection `magic_mail_provider_templates` is created on start, and nothing changes for projects without a SendGrid or Mailgun account. Sends without a provider template produce the same provider requests as in the release with the SendGrid EU region and the safer SendGrid/Mailgun send paths. To sync SendGrid templates, the API key needs **Template Engine → Read Access** in addition to **Mail Send**.

### Upgrading to the next release (after 4.4.0)

1. **Stricter failover.** A send whose account fails with HTTP 500/502/504, a network error after the request was sent, or an SMTP connection lost or timed out after the server's `354` reply now throws instead of trying the next account, because that provider may already have delivered it. SMTP `4xx` replies (also `451` after DATA) and HTTP 408 now fail over. Check the provider before re-sending such a mail; with _Queue failed sends_ on, it appears in the Outbox as uncertain.
2. **Packaging.** `@strapi/design-system`, `@strapi/icons` and `react-intl` are optional peers instead of dependencies, and `@strapi/utils` is a dependency. Nothing to do in a standard Strapi project; the admin build uses Strapi's own copies.
3. **Delivery webhooks.** New optional columns are created on start (email log `deliveryConfirmedAt`, `lastDeliveryEventAt`); no column is dropped or renamed. `deliveryStatus` gains the value `blocked` and email events gain `delivered`, `blocked`, `dropped` and `resubscribe`; code that switches on them should handle the new values. A SendGrid block or a sender-side drop is no longer recorded as a hard bounce and no longer emits `magic-mail.delivery.bounced`: listen to `magic-mail.delivery.blocked` / `.dropped` if you need them. Analytics now counts bounced, deferred and blocked mail as sent, so **Sent** and the bounce rate change for existing data. See [Bounces and complaints](./delivery.md#bounces-and-complaints) for the optional events to enable.

### Upgrading to 4.4

1. Nothing changes until you pass `queue: true` or switch on _Queue failed sends_.
2. Roles that had `read` get `queue.read`, roles that had `manage` get `queue.manage`, once at startup. Remove them in the role editor if a role should not see failed mails.
3. Callers with their own fallback (for example Magic Link) should send with `queue: false` or a `notAfter`, or their fallback no longer runs while _Queue failed sends_ is on.
4. Several instances need the same `MAGIC_MAIL_ENCRYPTION_KEY` to send mails queued by another instance.
5. MySQL: `SKIP LOCKED` is unsafe for statement-based replication; use row-based replication.

### Upgrading to 4.3

No action for a single instance. For several instances read [Running several instances](./configuration.md#running-several-instances-railway-replicas-pm2-cluster): one database, identical `APP_KEYS`, `MAGIC_MAIL_ENCRYPTION_KEY`, `MAGIC_MAIL_TRACKING_SECRET` and `MAGIC_MAIL_OAUTH_STATE_SECRET`, and `server.proxy.koa: true` behind a proxy.

### Upgrading to 4.0.0

4.0.0 is a major release with security and correctness changes. **Back up the database first**: credentials are re-encrypted in a format 3.x cannot read, and two legacy routing-rule columns are dropped. The full list with migration notes is in [CHANGELOG.md](../CHANGELOG.md).

Breaking changes and what to do:

1. **Node.js 22.12+** and **`@strapi/plugin-users-permissions`** are required. Peer ranges are `^5.57.0`.
2. **Encryption key everywhere but development/test.** Set `MAGIC_MAIL_ENCRYPTION_KEY` for staging too. The constant fallback key is gone.
3. **Email only.** The non-email messaging routes and service methods are removed and `/send` no longer accepts `phoneNumber` (both already in 3.1.0); `/send-message` no longer accepts `channel` (400 for unknown fields).
4. **Content API needs API tokens.** Switch callers to an API token, or set `contentApi.allowUserRoles: true`. `userId` must reference an existing user.
5. **Admin capabilities.** Grant `read`, `manage` and `test-send` in addition to `access` ([permission guide](./permission-migration.md)).
6. **Attachments:** replace `path`/`href` with `content`.
7. **`from` and headers:** `from` must be the sending account's address; custom headers must be `X-*` or one of the allowed names.
8. **Explicit `accountName` is never replaced**; a template's category now sets the email type when `type` is omitted.
9. **Tracking needs a public URL.** Set _Tracking base URL_ or `server.url`; Content-API emails are click-tracked only for `tracking.allowedLinkHosts`; links expire after 180 days, events after 90 days, IPs are truncated.
10. **Secrets:** the placeholder is `********`; changing host, user, provider or OAuth client requires the secret again.
11. **OAuth:** in production the redirect URI comes from `server.url` (public `https`). Authorizations in progress during the upgrade must be restarted.
12. **Users & Permissions templates** need the users-permissions email-template permissions and only accept the listed placeholders.
13. **Visual designer:** add the CSP directives and the Media Library upload permission.
14. **Removed:** provider `ses` (never had an adapter), two legacy messaging columns of the routing-rule table (names in the changelog), the admin keep-alive polling.
