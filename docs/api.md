# Content API and Admin API

Every HTTP route MagicMail registers, with request and response examples. The admin permissions that gate them are listed in the [README](https://github.com/Schero94/Magic-Mail#permissions).

Part of the [MagicMail documentation](https://schero94.github.io/Magic-Mail/). Start with the [README](https://github.com/Schero94/Magic-Mail#readme) for install and quick start.

- [Content API](#content-api)
- [Admin API](#admin-api)

## Content API

| Method | Path                                                            | Auth      | Purpose                                                                       |
| ------ | --------------------------------------------------------------- | --------- | ----------------------------------------------------------------------------- |
| `POST` | `/api/magic-mail/send`                                          | API token | Send through the router with all [send options](./sending.md#send-options)    |
| `POST` | `/api/magic-mail/send-message`                                  | API token | Simple email: `to`, `cc`, `bcc`, `subject`, `message`/`text`/`html`, template |
| `GET`  | `/api/magic-mail/track/open/:emailId/:recipientHash`            | public    | Open-tracking pixel                                                           |
| `GET`  | `/api/magic-mail/track/click/:emailId/:linkHash/:recipientHash` | public    | Click redirect                                                                |
| `POST` | `/api/magic-mail/webhooks/sendgrid/:accountId`                  | signature | SendGrid delivery events ([details](./delivery.md#bounces-and-complaints))    |
| `POST` | `/api/magic-mail/webhooks/mailgun/:accountId`                   | signature | Mailgun delivery events ([details](./delivery.md#bounces-and-complaints))     |

### The API token rule

The send routes accept **API tokens only**. Create a _Custom_ token under **Settings → API Tokens** that allows only **Magic-mail → controller → `send`** (and `sendMessage` if you use it). Never enable these actions for the _Public_ or _Authenticated_ role: a users-permissions request is rejected with 403 even if the role has the permission.

To let users-permissions roles send as well (the pre-4.0 behaviour):

```javascript
// config/plugins.js
module.exports = () => ({
  'magic-mail': {
    config: { contentApi: { allowUserRoles: true } },
  },
});
```

With user roles allowed, the email log is always attributed to the authenticated user and a body `userId` is ignored. With an API token, `userId` must be the id or documentId of an existing users-permissions user (else 400).

The body is validated strictly: unknown fields, `path`/`href` attachments and invalid addresses return 400. Both send routes share a budget of 60 requests per minute per token, counted across all Strapi instances (see [Running several instances](./configuration.md#running-several-instances-railway-replicas-pm2-cluster)).

### Example: send

```bash
curl -X POST https://cms.example.com/api/magic-mail/send \
  -H "Authorization: Bearer $MAGIC_MAIL_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "customer@example.com",
    "templateId": 100,
    "templateData": { "user": { "firstName": "Ada" } },
    "type": "transactional"
  }'
```

```json
{
  "success": true,
  "accountUsed": "Transactional SMTP",
  "messageId": "<…@example.com>",
  "emailId": "…"
}
```

### Example: send-message

```bash
curl -X POST https://cms.example.com/api/magic-mail/send-message \
  -H "Authorization: Bearer $MAGIC_MAIL_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "to": "customer@example.com", "subject": "Your code", "message": "Your code is 123456." }'
```

The response has the same shape as `/send`.

### Errors

Errors use Strapi's envelope:

```json
{
  "data": null,
  "error": { "status": 400, "name": "ValidationError", "message": "…", "details": {} }
}
```

| Status | When                                                                                                                                                                          |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 400    | Invalid or unknown fields, invalid addresses, `userId` of a missing user, a recipient domain that fails the [recipient checks](./delivery.md#recipient-checks-before-sending) |
| 401    | Invalid or expired token                                                                                                                                                      |
| 403    | No token, a token without the action, or a users-permissions caller while `allowUserRoles` is false                                                                           |
| 429    | More than 60 send requests per minute (`TooManyRequestsError`, `Retry-After` header)                                                                                          |
| 500    | Delivery failed (no account could send, or the provider rejected the email)                                                                                                   |

## Admin API

All admin routes live under `/magic-mail` on the Strapi server (not `/api`), require an authenticated administrator (admin JWT) and the capability shown. The admin UI uses them; you can call them with an admin token for automation.

| Area               | Routes                                                                                                                                                                                                                                                                | Capability                                                    |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Accounts           | `GET /accounts`, `GET /accounts/:accountId`                                                                                                                                                                                                                           | `read`                                                        |
|                    | `POST /accounts`, `PUT /accounts/:accountId`, `DELETE /accounts/:accountId`                                                                                                                                                                                           | `manage`                                                      |
|                    | `POST /accounts/:accountId/test`, `POST /test-strapi-service`, `POST /accounts/:accountId/check` (read-only connection check of a Brevo or Amazon SES account, no email is sent)                                                                                      | `test-send`                                                   |
|                    | `POST /accounts/:accountId/webhook-token` with `{ "action": "reveal" \| "rotate" }` (Brevo webhook token; admin browser sessions only, admin API tokens get 403; 10 per minute; audit log line)                                                                       | `manage`                                                      |
| Routing rules      | `GET /routing-rules`, `GET /routing-rules/:ruleId`                                                                                                                                                                                                                    | `read`                                                        |
|                    | `POST /routing-rules`, `PUT /routing-rules/:ruleId`, `DELETE /routing-rules/:ruleId`                                                                                                                                                                                  | `manage`                                                      |
| OAuth              | `GET /oauth/<gmail\|microsoft\|yahoo>/auth`, `POST /oauth/create-account`, `POST /oauth/reconnect/:accountId`                                                                                                                                                         | `manage`                                                      |
|                    | `GET /oauth/<provider>/callback`                                                                                                                                                                                                                                      | public, signed single-use state                               |
| Templates          | `GET /designer/templates`, `GET /designer/templates/:id`, `GET /designer/templates/:id/versions`, `GET /designer/templates/:id/download`, `POST /designer/render/:templateReferenceId`, `POST /designer/export`, `GET /designer/stats`, `GET /designer/editor-config` | `read`                                                        |
|                    | `POST /designer/templates`, `PUT`/`DELETE /designer/templates/:id`, `POST /designer/templates/:id/duplicate`, `POST /designer/import`, version restore/delete routes                                                                                                  | `manage`                                                      |
|                    | `POST /designer/templates/:id/test-send`                                                                                                                                                                                                                              | `test-send`                                                   |
|                    | `GET`/`PUT /designer/core/:coreEmailType`                                                                                                                                                                                                                             | `read`/`manage` + users-permissions email-template permission |
|                    | `GET /designer/core-designs` / `PUT /designer/core/:coreEmailType/design` (`reset-password`, `email-confirmation`, `admin-forgot-password`; the last one only for super admins, otherwise 403; each design reports `usable`, `problem`, `checkedAt` and `editable`)   | `read`/`manage` + users-permissions email-template permission |
|                    | `GET /designer/templates/:id/provider-html`                                                                                                                                                                                                                           | `read`                                                        |
| Provider templates | `GET /provider-templates`, `GET /provider-templates/:key`, `POST /provider-templates/sync` (read-only at the provider, 6 per minute per admin)                                                                                                                        | `read`                                                        |
|                    | `PUT /provider-templates/:key/settings`, `POST /provider-templates/:key/copy`                                                                                                                                                                                         | `manage`                                                      |
|                    | `POST /provider-templates/:key/test-send`                                                                                                                                                                                                                             | `test-send`                                                   |
| Analytics          | `GET /analytics/stats`, `GET /analytics/emails`, `GET /analytics/emails/:emailId`, `GET /analytics/users/:userId`                                                                                                                                                     | `read`                                                        |
|                    | `DELETE /analytics/emails/:emailId`, `DELETE /analytics/emails`                                                                                                                                                                                                       | `manage`                                                      |
|                    | `GET /analytics/debug` (only with `MAGIC_MAIL_ENABLE_DEBUG_ENDPOINT=true`, never in production)                                                                                                                                                                       | `read`                                                        |
| Outbox             | `GET /outbox`, `GET /outbox/:documentId`, `GET /analytics/queue-stats`                                                                                                                                                                                                | `queue.read`                                                  |
|                    | `POST /outbox/:documentId/retry`, `POST /outbox/:documentId/discard`, `POST /outbox/:documentId/mark-sent`, `DELETE /outbox`                                                                                                                                          | `queue.manage`                                                |
| Settings           | `GET /settings` / `PUT /settings`                                                                                                                                                                                                                                     | `read` / `manage`                                             |
| Bounces            | `GET /accounts/:accountId/bounce-monitor`, `GET /suppressions`                                                                                                                                                                                                        | `read`                                                        |
|                    | `POST /accounts/:accountId/bounce-monitor/test`, `POST /accounts/:accountId/bounce-monitor/check` (10 per minute), `DELETE /suppressions/:documentId`, `POST /suppressions/remove-address`                                                                            | `manage`                                                      |

Test sends and connection checks (`/accounts/:accountId/test`, `/accounts/:accountId/check`, `/test-strapi-service`, `/designer/templates/:id/test-send`, `/provider-templates/:key/test-send`) share a limit of 10 per minute per admin. `PUT /provider-templates/:key/settings` takes `{ "fallbackTemplateReferenceId": number | null }`, `{ "locales": { "de": "brevo:welcome-de" } }` (replaces the language versions, `{}` clears them) or both. `POST /provider-templates/:key/test-send` also accepts an optional `language` (for example `de-AT`) to test a language version; without it the admin's interface language is used.

The connection check answers `{ "ok": true, "provider": "ses", "details": { "region": "eu-west-1", "sandbox": true, "sendingEnabled": true, "sendQuota": { … } } }` or `{ "ok": false, "provider": "brevo", "code": "BREVO_IP_NOT_AUTHORIZED", "hintCode": "BREVO_IP_NOT_AUTHORIZED", "hint": "…" }`. The details never contain personal data (no account owner, address or company).

Delivery webhooks on the Content API (public, verified per provider, 600 requests per minute): `POST /api/magic-mail/webhooks/sendgrid/:accountId`, `/mailgun/:accountId`, `/brevo/:accountId` (webhook token), `/ses/:accountId` (SNS signature and topic ARN). They answer `200 { "received": true }`, `401` for an unknown account, a missing secret or a bad signature or token, `400` for a malformed body. `:key` is a provider template key such as `sendgrid:welcome-email` (URL-encode the colon as `%3A` if your client requires it). The provider-template routes are described in the [sending guide](./sending.md#provider-templates-sendgrid-mailgun-brevo-amazon-ses).

### Example: create a routing rule

```http
POST /magic-mail/routing-rules
Authorization: Bearer <admin JWT>
Content-Type: application/json

{
  "name": "Marketing campaigns",
  "matchType": "emailType",
  "matchValue": "marketing",
  "accountName": "Marketing SendGrid",
  "fallbackAccountName": "Transactional SMTP",
  "priority": 50,
  "isActive": true
}
```

```json
{
  "data": {
    "documentId": "…",
    "name": "Marketing campaigns",
    "matchType": "emailType",
    "priority": 50,
    "…": "…"
  },
  "message": "Routing rule created successfully"
}
```

`matchType` is one of `emailType`, `recipient`, `subject`, `template`, `custom`. An unknown `accountName` or `fallbackAccountName` returns 400.

### Example: list accounts

```http
GET /magic-mail/accounts
```

```json
{
  "data": [
    {
      "documentId": "…",
      "name": "Transactional SMTP",
      "provider": "smtp",
      "fromEmail": "noreply@example.com",
      "isActive": true,
      "isPrimary": true,
      "priority": 9,
      "dailyLimit": 500,
      "hourlyLimit": 0,
      "emailsSentToday": 128,
      "totalEmailsSent": 18342
    }
  ],
  "meta": { "count": 1 }
}
```

Credentials are never returned. `GET /accounts/:accountId` returns `********` for each stored secret; send that exact value back in `PUT` to keep a secret. Changing provider, `host`, `port`, `user`, `clientId`, `tenantId`, `domain` or `allowInsecure` requires the secrets again (400 otherwise, with the fields in `details.config`).

### Example: delivery log

```http
GET /magic-mail/analytics/emails?search=order&deliveryStatus=sent&page=1&pageSize=25
```

```json
{
  "success": true,
  "data": [
    {
      "emailId": "…",
      "recipient": "user01@example.com",
      "subject": "Your order #1001 has shipped",
      "deliveryStatus": "sent",
      "openCount": 0,
      "clickCount": 0
    }
  ],
  "pagination": { "page": 1, "pageSize": 25, "pageCount": 1, "total": 1 }
}
```

`search` looks in recipient, subject and template name; `pageSize` is capped at 100.
