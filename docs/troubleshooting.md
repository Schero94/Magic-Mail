# Troubleshooting and FAQ

Symptoms, causes and fixes, plus answers to common questions.

Part of the [MagicMail documentation](https://schero94.github.io/Magic-Mail/). Start with the [README](https://github.com/Schero94/Magic-Mail#readme) for install and quick start.

- [Troubleshooting](#troubleshooting)
- [FAQ](#faq)

## Troubleshooting

**Email not received**

1. Look for `[magic-mail]` warnings and errors in the Strapi log (always logged; set `debug: true` for details).
2. Check the account: active, the **Test** action succeeds, today's usage is below the limit.
3. Check **Analytics**: the log shows status, the account used and, for failures, the error.
4. Check the spam folder; new senders often land there.

**"Could not connect to the mail server"** on an SMTP test: check host, port and TLS (`587` STARTTLS, `465` with _Use SSL/TLS encryption_). Self-signed certificates are rejected unless `allowInsecure` is set on a non-production or loopback host.

**OAuth popup fails or reports a redirect mismatch**

- Register exactly the redirect URI the wizard shows.
- Production: `server.url` must be public `https`.
- Admin on its own host: set `admin.url`.
- Microsoft: all five delegated permissions with admin consent, correct tenant ID, client secret not expired.
- Several Strapi instances: every instance needs the same `MAGIC_MAIL_ENCRYPTION_KEY`, `MAGIC_MAIL_OAUTH_STATE_SECRET` and `APP_KEYS` (an "Invalid state signature" means they differ; compare the fingerprints in the startup log, see [Running several instances](./configuration.md#running-several-instances-railway-replicas-pm2-cluster)).

**Edit wizard says "Stored credentials cannot be decrypted"**: the encryption key changed. Set the old key in `MAGIC_MAIL_ENCRYPTION_KEY_PREVIOUS`, or enter the secrets again.

**Content API returns 403**: use an API token with the `send`/`sendMessage` action; users-permissions roles are rejected unless `contentApi.allowUserRoles` is true.

**Content API returns 400**: the response `details` name the field. Common causes: unknown fields (for example `phoneNumber` or `channel` from 3.x), `path` attachments, a `from` that is not the account's address.

**Links are not tracked**: set _Tracking base URL_ or `server.url` to a public URL; for Content-API sends add the link hosts to `tracking.allowedLinkHosts`. Authentication links are never tracked.

**Visual designer does not load**: add `https://editor.unlayer.com` to `script-src` and `frame-src` (see [Content Security Policy](./sending.md#content-security-policy-for-the-visual-editor)). The **Plain Text** tab works without it.

**DMARC failures with a custom domain**: publish SPF (for example `v=spf1 include:_spf.google.com ~all`), add DKIM (provider or SMTP DKIM config) and a DMARC record. MagicMail always sends from the account's address, which keeps alignment.

**An account test fails with "SendGrid/Mailgun API request failed: <status>"**: the error message now says what to check. API clients get the same as `hintCode` in the response of `POST /magic-mail/accounts/:accountId/test`.

| Provider and status                           | `hintCode`                   | What to check                                                                                                                                                                    |
| --------------------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SendGrid 401                                  | `SENDGRID_UNAUTHORIZED`      | The API key is complete and not deleted.                                                                                                                                         |
| SendGrid 401/403, key valid without Mail Send | `SENDGRID_MISSING_MAIL_SEND` | Give the key the Mail Send permission. SendGrid answers 401 for a valid key without it; MagicMail then makes one read-only `GET /v3/scopes` to tell this apart from a wrong key. |
| SendGrid 403                                  | `SENDGRID_FORBIDDEN`         | The key has the Mail Send permission and the From address is a verified Sender Identity.                                                                                         |
| SendGrid 413                                  | `SENDGRID_PAYLOAD_TOO_LARGE` | Content and attachment size.                                                                                                                                                     |
| Mailgun 401                                   | `MAILGUN_UNAUTHORIZED`       | The key, and the region (an EU domain needs the EU region).                                                                                                                      |
| Mailgun 404                                   | `MAILGUN_DOMAIN_NOT_FOUND`   | The domain name and the region.                                                                                                                                                  |
| Mailgun 400/403 (sandbox domain)              | `MAILGUN_SANDBOX_RECIPIENT`  | The recipient is an authorized recipient of the sandbox domain.                                                                                                                  |
| 429 (both)                                    | `PROVIDER_RATE_LIMITED`      | Wait and try again.                                                                                                                                                              |

**Bounces from SendGrid or Mailgun do not show up**

- The account needs the verification key (SendGrid) or signing key (Mailgun); without it every request gets `401`.
- The URL must reach Strapi from the internet over https, with the account's id and your REST prefix.
- A `413` in the access log means a batch was larger than `webhooks.maxBodyBytes`.
- A warning `N delivery event(s) matched no email log` means events arrived for mail MagicMail did not send or whose log was deleted (also the providers' test events).
- Step-by-step checks with the providers' test buttons and a real bounce: [Live webhook checks](./live-webhook-checks.md).

**"Too many requests"**: the send routes allow 60 requests per minute per token, test sends 10 per minute per admin. Also check provider limits (for example Gmail 500/day for free accounts, 2,000/day for Workspace).

## FAQ

**Do I have to change my existing email code?**
No. MagicMail wraps the provider of `@strapi/email` at startup, so `strapi.plugin('email').service('email').send()` and `sendTemplatedEmail()`, Strapi's admin password reset and the Users & Permissions mails are routed through it. Use the [router service](./sending.md#option-2-the-magicmail-router-service) only when you need its extra options.

**What happens when no account can send?**
For mails sent through the Strapi email service, the email provider you configured before takes over when no MagicMail account is active or every eligible account is over its quota. The router service and the Content API return the error instead. With _Queue failed sends_ on, a mail blocked only by quotas is retried in the next quota hour.

**Can a mail be delivered twice?**
Not because of MagicMail's own retries. Failover tries another account only when the error proves the provider did not take the mail, and the outbox never re-sends an uncertain mail on its own. You decide in the Outbox tab whether to retry it or mark it as sent. Idempotency keys stop the same mail from being queued twice.

**Do I need Redis or sticky sessions for several replicas?**
No. Quotas, rate limits, OAuth flows and the outbox are coordinated through the database. Redis is optional for the rate limiter. See [Running several instances](./configuration.md#running-several-instances-railway-replicas-pm2-cluster).

**Is the outbox on by default?**
No. It stays off until you pass `queue: true` to a send or switch on _Queue failed sends_. Without either, `send()` behaves as before.

**My login or magic-link mails must not arrive late. What should I do?**
Send them with `queue: false`, or pass `notAfter` set to the token expiry. MagicMail never sends a queued mail after `notAfter`.

**Which providers report bounces?**
SendGrid and Mailgun, through signed webhooks you enable per account. SMTP, Gmail, Microsoft 365 and Yahoo accounts have no bounce webhook.

**Does the visual editor send data to a third party?**
The Unlayer editor loads from `editor.unlayer.com` in the browser of each editor user; images go to your Strapi Media Library. The plain HTML and text editor works without Unlayer, and sending templates never needs it.

**Is there a paid version or a license key?**
No. MagicMail is MIT licensed with no tiers or usage limits.
