# Tracking, bounces and the outbox

Open and click tracking, bounce and complaint handling, recipient checks, and the outbox with retries.

Part of the [MagicMail documentation](https://schero94.github.io/Magic-Mail/). Start with the [README](https://github.com/Schero94/Magic-Mail#readme) for install and quick start.

- [Tracking, privacy and retention](#tracking-privacy-and-retention)
- [Bounces and complaints](#bounces-and-complaints)
- [Retries and the outbox](#retries-and-the-outbox)

## Tracking, privacy and retention

Open tracking adds a 1×1 pixel; click tracking rewrites `<a href>` links to a redirect. Both are on by default (**Settings → MagicMail → Plugin Settings**) and can be turned off per email with `enableTracking: false` or `skipLinkTracking: true`.

**Public URL.** Tracking URLs use the _Tracking base URL_ setting, then `server.url`, then `server.absoluteUrl`, plus your REST prefix (`api.rest.prefix`, default `/api`), for example `https://cms.example.com/api/magic-mail/track/click/...`. In production a loopback host (`localhost`, `127.0.0.1`, `0.0.0.0`) is never used: without a public URL, emails are sent **untracked** and one warning is logged.

**Never tracked.** Authentication and one-time-token links (password reset, confirmation, magic links, OAuth, parameters such as `token`, `code`, `key`, `signature`, `session`, long random values), `mailto:` and `tel:` links, and links beyond `maxLinksPerEmail` (100). Emails sent through the Content API are click-tracked only for hosts in `tracking.allowedLinkHosts` (none by default).

**What is stored.** Open and click events store the IP truncated to /24 (IPv4) or /48 (IPv6) and at most 512 characters of user agent; no location. Only Koa's `request.ip` is used, so behind a reverse proxy enable [`server.proxy`](https://docs.strapi.io/cms/configurations/server), otherwise every recipient shares the proxy's address.

**Retention.** Every 6 hours MagicMail deletes events older than `tracking.eventRetentionDays` (90) and tracked links older than `tracking.linkTtlDays` (180; expired links then show the fallback page). `tracking.logRetentionDays` optionally deletes old email logs with their events and links. Logs contain personal data (recipient addresses); you can also delete them with **Analytics → Clear All** or with `DELETE /magic-mail/analytics/emails?olderThan=<ISO date>`.

**Rate limit.** The tracking routes allow 300 requests per minute and IP (counted across all instances, see [Running several instances](./configuration.md#running-several-instances-railway-replicas-pm2-cluster)). Above that, opens and clicks are no longer recorded but recipients still get the pixel and the redirect; only above 3,000 per minute is a plain-text 429 returned.

**Signing.** Tracking hashes are signed with `MAGIC_MAIL_TRACKING_SECRET`, falling back to `MAGIC_MAIL_ENCRYPTION_KEY`. To rotate, keep the old values in `MAGIC_MAIL_TRACKING_SECRET_PREVIOUS` (comma-separated) while old emails matter.

Mention open and click tracking in your privacy notice.

## Bounces and complaints

SendGrid and Mailgun can tell MagicMail when a message bounced or a recipient marked it as spam. The webhooks are off until you save a verification key on the account.

**SendGrid**

1. In SendGrid open **Settings → Mail Settings → Event Webhook**, enable **Signed Event Webhook** and copy the verification key.
2. Edit the SendGrid account in MagicMail, paste the key into **Signed Event Webhook verification key** and save.
3. Copy the **Webhook URL** shown in the wizard (`https://<your-strapi>/api/magic-mail/webhooks/sendgrid/<accountId>`) into the SendGrid Event Webhook and select **Bounced**, **Dropped** and **Spam Reports**.

**Mailgun**

1. In Mailgun copy the **HTTP webhook signing key** (**Settings → API Security**).
2. Edit the Mailgun account in MagicMail, paste it into **HTTP webhook signing key** and save.
3. Add the **Webhook URL** (`https://<your-strapi>/api/magic-mail/webhooks/mailgun/<accountId>`) in Mailgun for **Permanent Failure** and **Spam Complaints**.

**What happens.** Every request is verified with the provider signature (SendGrid ECDSA over the raw body, Mailgun HMAC-SHA256) and a one-hour timestamp window; replays are ignored. A bounce sets the email log to **Bounced** with a reason code such as `MAILGUN_BOUNCE_550`, a complaint to **Complaint**. Provider messages and addresses are not stored. Temporary failures are ignored because the provider keeps retrying.

**For other plugins.** MagicMail emits `magic-mail.delivery.bounced` and `magic-mail.delivery.complained` on `strapi.eventHub` with `{ provider, messageId, reasonCode }`; `messageId` is the id `send()` returned. You can also ask:

```js
const events = await strapi
  .plugin('magic-mail')
  .service('delivery-webhooks')
  .getDeliveryEvents([messageId]); // [{ messageId, bounced, complained, reasonCode }]
```

The URL uses the default REST prefix `/api`; adjust it if you changed `api.rest.prefix`. Behind a reverse proxy, enable `server.proxy` so the rate limit (600 requests per minute and IP) sees the real client address. SMTP, Gmail, Microsoft 365 and Yahoo accounts have no bounce webhook; use [bounce monitoring](#bounce-monitoring-mailbox) for them.

### Bounce monitoring (mailbox)

SMTP, Gmail, Microsoft 365 and Yahoo accounts have no webhook. Their bounces arrive later as a report in the sending mailbox ("Address not found", "Undeliverable", "Mail delivery failed"). MagicMail can read those reports and mark the matching email as **Bounced** or **Deferred**. It is off by default and turned on per account in the account wizard (step **Settings → Bounce monitoring**).

| Account                  | How MagicMail reads bounces                                | What the owner does                                                                                                                                                    |
| ------------------------ | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SMTP                     | IMAP, by default with the SMTP login                       | Turn it on. Enter an IMAP host if it is not the SMTP host with `smtp.` replaced by `imap.`.                                                                            |
| Gmail / Google Workspace | Gmail API (`gmail.readonly`) **or** IMAP with app password | API: click **Grant read access for bounce monitoring** and approve the new scope. IMAP: enable IMAP for the mailbox and create an app password (needs 2-step sign-in). |
| Microsoft 365 / Outlook  | Microsoft Graph (`Mail.Read`)                              | Click **Grant read access** and approve `Mail.Read`. In tenants without user consent, an admin grants it once in Entra ID.                                             |
| Yahoo                    | IMAP with app password                                     | Create a Yahoo app password and enter it.                                                                                                                              |
| SendGrid, Mailgun        | Webhooks (see above)                                       | Nothing new.                                                                                                                                                           |

**How it works.**

- Every send path (inline, failover and outbox retries) sets one stable `Message-ID` per mail. It is stored on the email log, and bounce reports return it.
- A worker checks each enabled mailbox every 5 minutes (**Plugin Settings → Bounce check interval**, 1 to 60). A database lease makes sure only one Strapi instance reads a mailbox at a time.
- Each run reads only new messages: IMAP remembers `UIDVALIDITY` and the last UID, Gmail the `historyId`, Graph the last received time. The first run looks back 3 days. One run reads at most 500 headers and downloads at most 100 reports of up to 1 MB. IMAP connections time out after 15 seconds and idle sockets after 60; API calls after 20 seconds.
- Reports are parsed as RFC 3464 delivery status notifications (Gmail, Exchange, Postfix and others). Exim-style bounces without a status part are recognised through `X-Failed-Recipients`. Auto-replies and normal mail are ignored.
- A report is matched to the email log by the original `Message-ID`, then by the `X-MagicMail-Outbox` header, and only then by recipient and account within 7 days (marked as a weak match).
- `5.x.x` sets the log to **Bounced**. `4.x.x` (for example `4.4.1`, a domain that does not answer yet) sets it to **Deferred**, and the final `5.x.x` report later turns it into **Bounced**.
- Only reason codes such as `DNS_NXDOMAIN` or `SMTP_550_5_1_1` are stored. Message bodies, diagnostic text and full addresses are never stored or logged. Each report is processed once.
- The mailbox is opened read-only. With **Move processed bounce reports** turned on (IMAP only), handled reports go to the folder `Magic Mail/Bounces`.

**For other plugins.** Mailbox bounces emit the same events as the webhooks, `magic-mail.delivery.bounced` and `magic-mail.delivery.deferred`, with `{ provider: 'mailbox', messageId, reasonCode }`. `messageId` has no angle brackets, as in the webhook events: the provider id when the provider returned one (Gmail API), otherwise the `Message-ID` MagicMail set.

**In the admin.** The account wizard shows the last check, the result and the totals, with **Test connection** and **Check now**. **Analytics** filters the delivery log by **Bounced** or **Deferred** and shows the reason under the badge.

### Recipient checks before sending

These run before any provider is contacted and answer with `400 ValidationError`. Such a send is never failed over or queued.

| Check                                                                                                         | Default                                   | Error `details.reason`                             |
| ------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | -------------------------------------------------- |
| Well-known typo domains (`googelmail.com`, `gmial.com`, `gmx.ed`, `web.ed`, `t-onlien.de`, `outlok.com`, ...) | on                                        | `RECIPIENT_DOMAIN_TYPO`, with `details.suggestion` |
| Reserved test domains (`.test`, `.invalid`, `.example`, `.localhost`, `example.com/.net/.org`)                | rejected in production, allowed otherwise | `INVALID_RECIPIENT_DOMAIN`                         |
| Domain without mail server (MX lookup, 3 s timeout, 1 h cache; DNS errors let the mail through)               | off                                       | `INVALID_RECIPIENT_DOMAIN`                         |
| Suppression list (addresses with a permanent bounce)                                                          | off                                       | `MAGIC_MAIL_RECIPIENT_SUPPRESSED`                  |

The suppression list stores a keyed hash of the address plus a masked form (`j***@example.com`). Entries are listed and removed in **Plugin Settings → Bounces and recipient checks**.

## Retries and the outbox

MagicMail can retry mails that were not sent: up to 3 retries per mail (after 1, 5 and 15 minutes), kept in a database outbox that is safe with several replicas and pm2 workers. It is **off by default**. Without one of the two switches below, `send()` behaves exactly as before: same code path, same result, same errors.

### Turning it on

- **Per send:** pass `queue: true`. The mail is prepared (template, sanitizing, tracking, delivery log) and stored; a worker sends it within about a second.

  ```javascript
  const result = await strapi
    .plugin('magic-mail')
    .service('email-router')
    .send(
      { to: 'user@example.com', subject: 'Welcome', templateReferenceId: 'welcome' },
      {
        queue: true,
        idempotencyKey: 'signup-42:welcome', // optional: the same key is queued once
        notAfter: new Date(Date.now() + 60 * 60 * 1000), // optional: never send later than this
      }
    );
  // { success: true, queued: true, status: 'pending', outboxId, emailId, accountUsed: null, messageId: null }
  ```

  The Content API accepts the same optional fields: `POST /api/magic-mail/send` with `"queue": true` and `"idempotencyKey": "..."` (letters, digits, `. _ : -`, up to 128 characters). A repeated key returns the first row with `duplicate: true`. Keys are scoped by caller: each API token (and, with `contentApi.allowUserRoles`, each user) has its own key space, so one integration can never suppress or read another's mail with a guessed key. Server code shares one key space per `source` (default `service`); pass `idempotencyScope` to separate callers there too.

- **For failed sends (owner setting):** _Settings → MagicMail → Plugin Settings → Retries and outbox → Queue failed sends_. A send still runs inline with failover as before. When it fails, the error is classified:

| Outcome                                                                                                       | What happens                                                                 | The caller sees                                                     |
| ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| No provider accepted the mail (SMTP 4xx, refused connection, auth, HTTP 401/403/408/429/503)                  | Stored as `pending`, retried after 1, 5, 15 minutes                          | `{ success: true, queued: true, status: 'pending', outboxId, ... }` |
| No account free (none active, every account over quota)                                                       | Stored as `pending`, retried at the next quota hour without using up a retry | same                                                                |
| The provider **may** have accepted it (connection lost after the message was sent, HTTP 500/502/504, timeout) | Stored as `uncertain`, **never re-sent automatically**                       | the original error, unchanged, with `error.magicMailOutboxId`       |
| Permanent refusal (SMTP 5xx, HTTP 400/404/413/422, invalid input)                                             | Not stored                                                                   | the original error, unchanged                                       |

Sends to an explicit account (`accountName`, admin account test) and test sends are never captured. Native Strapi emails (password reset, confirmation) follow the same rules; when no MagicMail account can take them they still go to the original Strapi provider first, as before. If that provider fails too, the mail is captured only when every MagicMail account is over its quota (a later quota hour can deliver it). With no active MagicMail account at all the worker could never send it, so the provider's error reaches Strapi unchanged, as in 4.3. `queue: false` turns capture off for one call.

**"Retries per mail"** (1 to 10, default 3) is the number of retries after the first try. A `queue: true` mail gets the first try plus that many retries.

> **Magic Link and other callers with their own fallback.** With _Queue failed sends_ on, a temporary failure resolves as queued instead of throwing, so a caller's own fallback (for example Magic Link's fallback to another provider) no longer runs, and the mail can arrive minutes later. Login links and codes expire. Call `send(..., { queue: false })` for such mails, or pass `notAfter` set to the token expiry: MagicMail never sends a queued mail after `notAfter` (it ends as `failed` / `EXPIRED`).

### What "uncertain" means

A message can be lost in the gap between "the provider has it" and "we were told so". SMTP connections that drop after the message was transmitted, and HTTP APIs that answer 500, 502 or 504 or time out after the request was sent (503 means the request was not handled, RFC 9110 15.6.4, and is retried), may or may not have delivered it. None of the supported providers offers an idempotency key (SendGrid v3 Mail Send, Mailgun messages, Microsoft Graph sendMail, Gmail users.messages.send), so a retry could send a duplicate. MagicMail therefore records these as `uncertain` and leaves the decision to a person. Every queued attempt uses the same `Message-ID` and an `X-MagicMail-Outbox` header, which helps to find the mail in the provider's log and lets some mail clients collapse an accidental duplicate (a mitigation, not a guarantee).

For SMTP the stage is known exactly: a private logger watches nodemailer's transaction log for the server's `354` reply to `DATA` (it keeps a yes/no flag only, never the text). A drop before `354` is safe to retry; a drop after it is uncertain, whatever system code (`ECONNRESET`, `EHOSTUNREACH`, ...) the socket reported. For HTTP providers a network error counts as "not accepted" only when it proves the connect phase (refused connection, failed DNS lookup, connect timeout, or an unreachable host raised by `connect()`); any other network error is uncertain.

Recording the result is just as careful. If the database write that marks a mail `sent` fails after the provider accepted it, MagicMail retries the write a few times and otherwise leaves the claim to expire, so the mail ends as `uncertain`, never as `pending`. Any error after a provider was contacted that did not come from the provider itself (database, bookkeeping) is treated as uncertain.

### The Outbox tab

**MagicMail → Outbox** lists pending, retrying, failed, uncertain, sent and discarded mails with recipient, subject, attempts, next try or last error code. Per row:

- **Details:** the error history (time, account, error code, class). The provider's error text and the mail content are never stored or shown.
- **Retry now:** sends it again within seconds. A pending mail keeps its remaining automatic retries; a failed or uncertain mail gets one more attempt. For an uncertain mail the dialog states the duplicate risk.
- **Mark as sent:** for an uncertain mail after checking the provider's log. Nothing is sent.
- **Discard:** the mail is not sent and its content is deleted.

Reading needs `plugin::magic-mail.queue.read`, the actions need `plugin::magic-mail.queue.manage` (see [Permissions](https://github.com/Schero94/Magic-Mail#permissions)). `GET /magic-mail/analytics/queue-stats` returns counts per status, the age of the oldest pending mail, retries and failures for 24 hours and 7 days, an attempts histogram, the top error codes and the average queue latency.

### Events

`strapi.eventHub` emits `magic-mail.queue.enqueued`, `.retry-scheduled`, `.sent`, `.failed`, `.uncertain`, `.discarded` and `.resolved` after each write, with `{ outboxId, emailId, status, attempts, maxAttempts, code, errorClass, accountName, source }`. No addresses, subjects or content. A failing listener never changes the outbox.

### Storage, privacy and retention

- Table `magic_mail_outbox` (content type `plugin::magic-mail.outbox-message`, hidden in the Content Manager). The prepared mail is stored **encrypted** (AES-256-GCM, own subkey of `MAGIC_MAIL_ENCRYPTION_KEY`, bound to its row); `MAGIC_MAIL_ENCRYPTION_KEY_PREVIOUS` keeps queued mails readable during a key rotation.
- The content is deleted when the mail is sent or discarded. Failed and uncertain mails keep it for 14 days (so they can still be retried), then the row stays without content until it is 30 days old. Sent and discarded rows are removed after 7 days.
- Mails larger than `queue.maxPayloadBytes` (default 10 MiB of prepared JSON, at most 20 MiB) are not queued: `queue: true` fails with a validation error, a failed send is not captured and throws as before.
- `strapi.plugin('magic-mail').service('queue').forgetRecipient(address)` deletes the queued mails of one recipient (GDPR erasure).

### Configuration

```javascript
// config/plugins.js
module.exports = () => ({
  'magic-mail': {
    config: {
      queue: {
        worker: true, // false: this process never sends queued mail (e.g. web-only replicas)
        pollIntervalMs: 10_000, // plus up to 50 % jitter
        batchSize: 5, // mails claimed per poll
        concurrency: 2, // parallel queued sends per process
        leaseMs: 180_000, // claim timeout; above the bounded send time (30 s connect + 60 s socket, 30 s OAuth token refresh)
        backoffMs: [60_000, 300_000, 900_000], // wait before retry 1, 2, 3 (+/- jitterRatio)
        jitterRatio: 0.2,
        maxAgeHours: 24, // default notAfter
        maxPayloadBytes: 10 * 1024 * 1024,
        maxDispatchPerMinute: 120, // queued sends per minute across ALL processes
        retention: { sentDays: 7, unresolvedDays: 14, rowDays: 30 },
      },
    },
  },
});
```

| Key                              | Default                   | Allowed                               | Effect                                           |
| -------------------------------- | ------------------------- | ------------------------------------- | ------------------------------------------------ |
| `queue.worker`                   | `true`                    | boolean                               | `false`: this process never sends queued mail    |
| `queue.pollIntervalMs`           | `10000`                   | 1000 to 3600000                       | Poll interval, plus up to 50 % jitter            |
| `queue.batchSize`                | `5`                       | 1 to 100                              | Mails claimed per poll                           |
| `queue.concurrency`              | `2`                       | 1 to 20                               | Parallel queued sends per process                |
| `queue.leaseMs`                  | `180000`                  | 30000 to 3600000                      | Claim timeout; must exceed the bounded send time |
| `queue.backoffMs`                | `[60000, 300000, 900000]` | 1 to 10 values, 1000 to 86400000 each | Wait before retry 1, 2, 3, ...                   |
| `queue.jitterRatio`              | `0.2`                     | 0 to 0.9                              | Random spread of each wait                       |
| `queue.maxAgeHours`              | `24`                      | 1 to 720                              | Default `notAfter` of a queued mail              |
| `queue.maxPayloadBytes`          | `10485760` (10 MiB)       | 1024 to 20971520                      | Larger mails are not queued                      |
| `queue.maxDispatchPerMinute`     | `120`                     | 1 to 100000                           | Queued sends per minute across all processes     |
| `queue.retention.sentDays`       | `7`                       | 1 to 3650                             | Remove sent and discarded rows                   |
| `queue.retention.unresolvedDays` | `14`                      | 1 to 3650                             | Keep the content of failed and uncertain mails   |
| `queue.retention.rowDays`        | `30`                      | 1 to 3650                             | Remove failed and uncertain rows                 |

Invalid values stop Strapi at startup with a message naming the key.

### Several instances (Railway, pm2)

The outbox needs nothing beyond the [multi-instance setup](./configuration.md#running-several-instances-railway-replicas-pm2-cluster): one database and identical secrets (`MAGIC_MAIL_ENCRYPTION_KEY` must be the same everywhere, or a worker can not read a mail queued on another replica).

- **Every process runs a worker.** With 2 replicas x `pm2 -i 4` that is 8 workers. They claim mails with `SELECT ... FOR UPDATE SKIP LOCKED` on PostgreSQL (MySQL 8 the same inside a transaction; SQLite and older MySQL/MariaDB a conditional update per row), so no mail is claimed twice. Every later write is fenced by the claim token.
- **Load:** idle, each process runs one indexed query every 10 to 15 seconds (about 40 per minute for 8 processes). At 20 to 30 mails per minute the default `batchSize`/`concurrency` leaves ample headroom; `maxDispatchPerMinute` keeps a backlog after an outage from eating the hourly account quota live traffic needs.
- **Crashes and deploys:** a process killed after claiming but before sending gives the mail back after `leaseMs`; one killed while a provider had the mail turns it `uncertain` (no automatic re-send). Rolling deploys therefore never lose or double-send a queued mail, but can leave an uncertain one to check.
- **Optional split:** set `queue.worker: false` through an environment-based config on replicas that should only serve HTTP. At least one process must keep the worker on.
- **Connection pool:** the worker uses the same Strapi pool; the `processes x pool.max` rule above still applies.
- **MySQL:** statements with `SKIP LOCKED` are unsafe for statement-based replication; use row-based replication (`binlog_format=ROW`, the MySQL 8 default). `max_allowed_packet` must exceed about 1.4x `maxPayloadBytes`.

### Limits

- Retries are evaluated against the routing rules at retry time, prefer another account than the one that failed last (the same one if it is the only one), and never replace an explicitly requested account.
- The worker does not use the original Strapi email provider as a fallback. That is why a native Strapi mail is not captured when no MagicMail account exists at all.
- Queued OAuth sends (Gmail, Microsoft, Yahoo) bound the token refresh to 30 seconds and re-check the claim after it, right before the provider request. A process that lost its claim during a slow refresh does not send.
- Inline failover between accounts uses the same strict rules as the queue. Up to 4.4.0 it also moved on after a connection lost after DATA and after HTTP 500/502, which in rare cases delivered a mail twice (see [Migration notes](./upgrading.md#migration-notes)).
- Outbox indexes are declared through Strapi's content-type `indexes` key, which Strapi 5 supports but does not document (tested on 5.62); a test pins it.
