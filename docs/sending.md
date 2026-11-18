# Sending email, providers, routing and templates

How to send through MagicMail, how to set up each provider, how routing rules and quotas pick an account, and how templates and the visual editor work.

Part of the [MagicMail documentation](https://schero94.github.io/Magic-Mail/). Start with the [README](https://github.com/Schero94/Magic-Mail#readme) for install and quick start.

- [Sending email](#sending-email)
- [Provider setup](#provider-setup)
- [Routing rules and quotas](#routing-rules-and-quotas)
- [Templates and the visual editor](#templates-and-the-visual-editor)

## Sending email

### Option 1: the Strapi email service (recommended)

MagicMail wraps the provider of `@strapi/email` at startup, so existing code keeps working:

```javascript
await strapi.plugin('email').service('email').send({
  to: 'user@example.com',
  subject: 'Welcome to Example Shop',
  text: 'Thanks for signing up!',
  html: '<h1>Welcome!</h1><p>Thanks for signing up!</p>',
});
```

Both `send()` and `sendTemplatedEmail()` are routed, including Strapi's admin password-reset email and the Users & Permissions emails. MagicMail picks the account (routing rules, then priority), reserves quota, fails over when that is safe, logs the email and updates the statistics.

**Fallback to the original provider.** When no MagicMail account is active, or every eligible account is over its quota, the email is sent through the Strapi email provider you configured before (logged with the account name `strapi-email-provider`). Once a MagicMail account has attempted delivery, an error is returned to the caller and the email is **not** sent again through the original provider, so nothing goes out twice.

### Option 2: the MagicMail router service

Use the router directly when you need its options, for example to force an account:

```javascript
await strapi.plugin('magic-mail').service('email-router').send({
  to: 'customer@example.com',
  subject: 'Order confirmation',
  html: '<h1>Your order #12345</h1>',
  accountName: 'Transactional SMTP', // case-insensitive; never replaced by another account
  type: 'transactional',
  priority: 'high',
});
// → { success: true, accountUsed: 'Transactional SMTP', messageId: '<…>', emailId: '…' }
```

An explicit `accountName` is never swapped for another account: if that account is over quota or fails, the send fails. Router calls never use the Strapi-provider fallback; they get the error.

### Option 3: HTTP

See [Content API](./api.md#content-api) for `POST /api/magic-mail/send` and `/send-message`.

### Send options

The same fields work for the router, the Strapi email service and `POST /api/magic-mail/send`.

| Field                                                | Description                                                                                                                                                                   |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `to`, `cc`, `bcc`                                    | Address, array or comma-separated list (max. 100 `to`, 50 `cc`/`bcc`). Display names allowed                                                                                  |
| `subject`, `text`, `html`                            | `subject` is required unless a template provides it; `text` or `html` is required. HTML is sanitised (no scripts, event handlers or `javascript:` URLs; email layout is kept) |
| `from`                                               | Optional. Must be the sending account's address; only its display name is used                                                                                                |
| `replyTo`                                            | A valid address                                                                                                                                                               |
| `type`                                               | `transactional` (default), `marketing` or `notification`. Without `type`, a template's category is used                                                                       |
| `priority`                                           | `normal` (default), `high` or `low`. `high` adds `X-Priority` and `Importance` headers                                                                                        |
| `accountName`                                        | Force one account                                                                                                                                                             |
| `templateId` / `templateReferenceId`, `templateData` | Render a MagicMail template by its Reference ID with Mustache data (`data` is accepted as an alias of `templateData`)                                                         |
| `unsubscribeUrl`                                     | Per-email unsubscribe URL                                                                                                                                                     |
| `enableTracking: false`, `skipLinkTracking: true`    | Disable open and click tracking, or only click tracking, for this email                                                                                                       |
| `customField`                                        | Value matched by routing rules of type _Custom_                                                                                                                               |
| `headers`                                            | Up to 20 custom headers: `X-*` (except MagicMail's own) plus `List-Id`, `Precedence`, `Auto-Submitted`, `In-Reply-To`, `References`. Others are dropped                       |
| `attachments`                                        | Up to 20, 25 MB each, with `filename`, `content`, `contentType`, `encoding`, `cid`                                                                                            |
| `userId`, `recipientName`                            | Stored on the email log                                                                                                                                                       |

### Attachments

```javascript
await strapi
  .plugin('email')
  .service('email')
  .send({
    to: 'customer@example.com',
    subject: 'Invoice 12345',
    html: '<h1>Your invoice is attached</h1>',
    attachments: [
      {
        filename: 'invoice.pdf',
        content: await fs.promises.readFile(invoicePath), // read the file yourself
        contentType: 'application/pdf',
      },
      { filename: 'receipt.pdf', content: pdfBase64, encoding: 'base64' },
    ],
  });
```

Attachments must carry their `content` (a Buffer, or a string with `encoding`). Attachments with `path` or `href` are rejected for every provider, so MagicMail never reads server files or fetches URLs for a caller. Inline images use `cid`.

### Unsubscribe and bulk headers

- `List-Unsubscribe` is sent for marketing emails that have an unsubscribe URL, and for every email type while **Settings → Unsubscribe header** is on and a URL is available.
- A per-email `unsubscribeUrl` wins. The plugin-wide URL from the settings is used only while the toggle is on; `{{email}}` in it is replaced with the URL-encoded recipient (single-recipient emails only).
- `List-Unsubscribe-Post: List-Unsubscribe=One-Click` (RFC 8058) is only added for `https` URLs.
- Marketing emails get `Precedence: bulk`; notification emails get `Auto-Submitted: auto-generated`.

## Provider setup

### OAuth redirect URI

MagicMail builds the redirect URI from the `URL` environment variable if it is set (legacy override), otherwise from Strapi's `server.url` (or `server.absoluteUrl`):

```
<public URL>/magic-mail/oauth/<gmail|microsoft|yahoo>/callback
```

The account wizard shows the exact value the server uses; register exactly that value with the provider. In production the URL must be public `https`; there is no `localhost` fallback. The `localhost:1337` URIs below are for local development.

The authorization popup reports back to the admin origin (`admin.url`). If the admin runs on its own host, set `admin.url` to that absolute URL. OAuth flows are bound to the admin who started them and stored in the database (one row per flow, consumed once), so the callback may land on any Strapi instance; no sticky sessions are needed.

**Reconnecting an account** (revoked consent, expired refresh token): edit the account and use **Reconnect with &lt;provider&gt;** in the wizard. The provider must return the account's own mailbox. Access tokens are refreshed 60 seconds before they expire and once more if the provider rejects them; rotated refresh tokens are stored.

### Gmail (OAuth 2.0)

1. In the [Google Cloud Console](https://console.cloud.google.com) create or select a project and enable the **Gmail API**.
2. Create an **OAuth client ID** of type _Web application_.
3. Add the redirect URI, for example `http://localhost:1337/magic-mail/oauth/gmail/callback`.
4. In MagicMail choose **Gmail**, paste the client ID and secret, click **Connect with Google** and sign in.

Scopes: `https://www.googleapis.com/auth/gmail.send`, `https://www.googleapis.com/auth/userinfo.email`, `openid`. Mail is sent through the Gmail API.

### Microsoft 365 (OAuth 2.0)

1. In the [Azure portal](https://portal.azure.com) open **Microsoft Entra ID → App registrations → New registration**.
2. Copy the **Application (client) ID** and the **Directory (tenant) ID**.
3. Add a _Web_ redirect URI, for example `http://localhost:1337/magic-mail/oauth/microsoft/callback`.
4. API permissions (Microsoft Graph, _Delegated_): `Mail.Send`, `User.Read`, `offline_access`, `openid`, `email`. Grant admin consent.
5. Under **Certificates & secrets** create a client secret and copy its **Value** (not the secret ID).
6. In MagicMail choose **Microsoft 365**, enter tenant ID, client ID and secret, click **Connect with Microsoft**.

The tenant ID must be a GUID, a domain, `common`, `organizations` or `consumers`. Mail is sent through Microsoft Graph `sendMail`.

### Yahoo Mail (OAuth 2.0)

1. Create an app at [developer.yahoo.com/apps](https://developer.yahoo.com/apps).
2. Redirect URI, for example `http://localhost:1337/magic-mail/oauth/yahoo/callback`.
3. Permissions: **Mail (read/write)** and **OpenID Connect** (scopes `openid email mail-w`).
4. In MagicMail choose **Yahoo Mail**, paste client ID and secret and click **Connect with Yahoo**.

Mail is sent over SMTP with XOAUTH2.

### SMTP

| Field             | Example                                                      |
| ----------------- | ------------------------------------------------------------ |
| Host              | `smtp.example.com`                                           |
| Port              | `587` (STARTTLS) or `465` (turn on _Use SSL/TLS encryption_) |
| Username/password | Mailbox credentials or an app password                       |

Common hosts: Gmail `smtp.gmail.com:587` (app password), Outlook.com `smtp-mail.outlook.com:587`, Microsoft 365 `smtp.office365.com:587`.

TLS 1.2 or newer is required and certificates are verified. For a local mail catcher (Mailpit, MailHog) set `"allowInsecure": true` in the account config; it is honoured outside `NODE_ENV=production`, or for loopback hosts.

Optional DKIM signing (account config):

```json
{
  "dkim": {
    "domainName": "example.com",
    "keySelector": "default",
    "privateKey": "-----BEGIN PRIVATE KEY-----\n..."
  }
}
```

Generate a key with `openssl genrsa -out dkim_private.pem 2048` and publish the public key as a TXT record at `default._domainkey.example.com`.

The provider value `nodemailer` is an alias of `smtp`.

### SendGrid

1. In SendGrid go to **Settings → API Keys → Create API Key**, choose **Custom Access** and grant only **Mail Send**. A Full Access key is not needed: MagicMail only sends mail.
2. In MagicMail choose **SendGrid** and paste the key. The From address must be a verified Sender Identity in SendGrid (single sender or authenticated domain).

### Mailgun

1. In Mailgun create a **Domain Sending Key** for your sending domain (**Sending → Domains → your domain → Domain Settings → Sending API keys → Add Sending Key**). It can only send mail, which is all MagicMail needs. The account **Private API key** (**Account Settings → API Keys**) also works, but grants full access to your Mailgun account. Note the region the domain was created in (US or EU).
2. In MagicMail choose **Mailgun**, enter the domain (for example `mg.example.com`), pick the region and paste the key. If you paste `https://mg.example.com/`, MagicMail saves `mg.example.com`; anything else that is not a domain name is rejected when you save.
3. A sandbox domain (`sandbox….mailgun.org`) only delivers to authorized recipients. Add your test address under the sandbox domain in Mailgun before you send a test.

A Mailgun domain can only be used through the API host of its region. MagicMail stores the region as `config.region` and calls:

| `config.region` | API host                     |
| --------------- | ---------------------------- |
| `us` (default)  | `https://api.mailgun.net`    |
| `eu`            | `https://api.eu.mailgun.net` |

Any other value is rejected with a validation error when the account is created or updated. Accounts saved without a region keep using the US host.

### Provider comparison

| Provider      | Authentication        | Transport                   | DKIM                 |
| ------------- | --------------------- | --------------------------- | -------------------- |
| Gmail         | OAuth 2.0             | Gmail API                   | by Google            |
| Microsoft 365 | OAuth 2.0 (Entra ID)  | Microsoft Graph `sendMail`  | by Microsoft         |
| Yahoo Mail    | OAuth 2.0             | SMTP with XOAUTH2           | by Yahoo             |
| SMTP          | Username and password | Nodemailer, any SMTP server | optional (see above) |
| SendGrid      | API key               | HTTPS API (v3)              | by SendGrid          |
| Mailgun       | API key + domain      | HTTPS API (US or EU region) | by Mailgun           |

All providers support attachments, inline images (`cid`) and custom headers.

## Routing rules and quotas

Routing rules send an email through a specific account when it matches a condition. Manage them under **MagicMail → Routing Rules**.

| Match type     | Matches when                                                                                                |
| -------------- | ----------------------------------------------------------------------------------------------------------- |
| **Email Type** | the email type equals the value (`transactional`, `marketing`, `notification`)                              |
| **Recipient**  | any recipient matches: `@domain.com` = domain, `user@domain.com` = exact address, anything else = substring |
| **Subject**    | the subject contains the value (case-insensitive)                                                           |
| **Template**   | the template name or Reference ID equals the value                                                          |
| **Custom**     | the email's `customField` equals the value                                                                  |

Examples:

| Rule                  | Match                              | Account            | Fallback           | Priority |
| --------------------- | ---------------------------------- | ------------------ | ------------------ | -------- |
| Password resets first | Subject contains `Password Reset`  | Transactional SMTP | Gmail Support      | 1000000  |
| Marketing campaigns   | Email type `marketing`             | Marketing SendGrid |                    | 50       |
| VIP customers         | Recipient `@vip-customers.example` | Gmail Support      | Transactional SMTP | 10       |

**Order.** Rules are checked from the highest to the lowest priority (1 to 1,000,000); rules with the same priority are checked oldest first. The first match wins. The admin list and `GET /magic-mail/routing-rules` show them in this order.

**Account order for one email.** The account of the first matching rule, then that rule's fallback account, then the accounts (and fallbacks) of the next matching rules, then the primary account, then the remaining active accounts by account priority (1 to 10, higher first). Accounts over their quota are skipped.

**Failover.** MagicMail moves on to the next account only when the error proves the provider did not accept the message: a refused connection or failed DNS lookup, missing credentials, an SMTP `4xx` reply (for example `421` or `451`, also after DATA), a `5xx` reply to authentication, TLS or the envelope, a connection lost before the server answered DATA with `354`, or HTTP 401/403/408/429/503. Ambiguous errors stop the send and reach the caller: a connection lost or timed out after `354`, HTTP 500/502/504, network errors after the request was sent. That provider may have accepted the message, and a second account would deliver it twice. Inline sends and the outbox use the same rule (see [Retries and the outbox](./delivery.md#retries-and-the-outbox)).

**Account references.** Rules reference accounts by name. Creating or editing a rule with an unknown account name returns 400. Renaming an account updates its rules; deleting an account deactivates the rules that target it and clears it where it is the fallback.

**Quotas.** Each account can have an hourly and a daily limit (0 = unlimited). Quota is reserved atomically before dispatch, so concurrent sends cannot exceed it. Windows follow the clock hour and the calendar day in UTC; set `quotaTimezone` to use another IANA time zone.

## Templates and the visual editor

Everything in the designer is included, with no tiers:

| Feature                       | Included |
| ----------------------------- | -------- |
| Visual designer (Unlayer)     | Yes      |
| Plain HTML and text editing   | Yes      |
| Unlimited templates           | Yes      |
| Mustache variables            | Yes      |
| Import and export             | Yes      |
| Template versions             | Yes      |
| Users & Permissions templates | Yes      |

### Creating templates

1. Go to **MagicMail → Email Templates** and click **Create template**.
2. Build the email in the **Visual Designer** tab, or write HTML and text in the **Plain Text** tab.
3. Use Mustache variables for dynamic content:

   ```html
   <h1>Welcome {{user.firstName}}!</h1>
   <p>Thanks for joining {{company.name}}</p>
   ```

4. Save. Each template has a numeric **Reference ID** (for example `100`) that you use when sending. It cannot be changed after creation.

The server fills `{{system.date}}`, `{{system.year}}` and `{{system.unsubscribe}}` (the email's unsubscribe URL); callers cannot override them.

### Sending a template

```javascript
await strapi
  .plugin('magic-mail')
  .service('email-router')
  .send({
    to: 'user@example.com',
    templateId: 100, // Reference ID
    templateData: {
      user: { firstName: 'Ada' },
      company: { name: 'Example Shop' },
    },
  });
```

`strapi.plugin('email').service('email').send()` accepts the same `templateId` and `templateData` fields. The template list also shows a ready-made code snippet per template.

### Categories

Templates have a category: `transactional`, `marketing`, `notification` or `custom`. The first three become the email `type` when the caller passes none, so a rule _Email Type = marketing_ also catches marketing templates.

### Versions, import and export

- Version 1 is the created template. Every save that changes the content (name, subject, design, HTML, text or tags) adds a version with the saved content. Saves that only toggle `isActive` or the category add none. Restoring a version saves its content as a new version.
- Export writes JSON (all templates, or the ones you select); import accepts MagicMail exports and exports of `strapi-plugin-email-designer-5`. The `isActive` state is kept.

```javascript
const designer = strapi.plugin('magic-mail').service('email-designer');
const versions = await designer.getVersions(templateDocumentId);
await designer.restoreVersion(templateDocumentId, versionDocumentId);
const exported = await designer.exportTemplates(); // or exportTemplates([documentId, ...])
const results = await designer.importTemplates(exported);
```

### Users & Permissions templates

The **Core emails** tab edits the _Reset password_ and _Email address confirmation_ templates of Users & Permissions. This needs the _Users & Permissions → Email templates_ read/update permissions in addition to MagicMail's. Only `{{ URL }}`, `{{ SERVER_URL }}`, `{{ ADMIN_URL }}`, `{{ CODE }}`, `{{ TOKEN }}`, `{{ USER }}`, `{{ USER.email }}` and `{{ USER.username }}` are accepted; they are stored as `<%= KEY %>`, the syntax Users & Permissions fills in.

### The visual editor (Unlayer) and privacy

The visual designer embeds the [Unlayer](https://unlayer.com) editor through `react-email-editor`. What that means for you:

- The editor script loads from `https://editor.unlayer.com/embed.js?2` and the editor build is pinned (`1.524.0`). Unlayer serves the editor, so the browser of each editor user contacts Unlayer's servers.
- No Unlayer `projectId` is sent unless you configure one.
- Disabled: Unlayer image hosting, stock images, the AI assistant, the hosted image editor, "preview in browser" and third-party placeholder images. New image blocks use an inline placeholder.
- Images you add are uploaded to the **Strapi Media Library** (`POST /upload`), so editors also need _Media Library → Create (upload)_.
- If the editor cannot load (CSP, offline, blocked), the page explains why and the **Plain Text** tab keeps working. You never need Unlayer to send templates.

Optional overrides (`config/plugins.js`):

```javascript
module.exports = () => ({
  'magic-mail': {
    config: {
      designer: {
        projectId: null, // your own Unlayer project id (positive integer)
        scriptUrl: null, // https URL of a vetted, self-hosted copy of embed.js
        version: null, // exact Unlayer build, e.g. '1.524.0'
      },
    },
  },
});
```

### Content Security Policy for the visual editor

Strapi's `strapi::security` middleware blocks third-party scripts and frames. To use the visual designer, allow the Unlayer origin in `config/middlewares.js`. Do **not** add `'unsafe-inline'` or `'unsafe-eval'`.

```javascript
module.exports = [
  'strapi::logger',
  'strapi::errors',
  {
    name: 'strapi::security',
    config: {
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'script-src': ["'self'", 'https://editor.unlayer.com'],
          'frame-src': ["'self'", 'https://editor.unlayer.com'],
          // Media Library images shown in the editor and the preview:
          'img-src': ["'self'", 'data:', 'blob:', 'https://your-media-host.example'],
        },
      },
    },
  },
  'strapi::cors',
  'strapi::poweredBy',
  'strapi::query',
  'strapi::body',
  'strapi::session',
  'strapi::favicon',
  'strapi::public',
];
```

With `designer.scriptUrl` (self-hosted `embed.js`) put that origin into `script-src` instead; the editor iframe still loads from `editor.unlayer.com`, so keep it in `frame-src`. The Unlayer script runs in the admin origin. Only allow it if you accept that trust.
