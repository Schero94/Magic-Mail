# Sending email, providers, routing and templates

How to send through MagicMail, how to set up each provider, how routing rules and quotas pick an account, and how templates and the visual editor work.

Part of the [MagicMail documentation](https://schero94.github.io/Magic-Mail/). Start with the [README](https://github.com/Schero94/Magic-Mail#readme) for install and quick start.

- [Sending email](#sending-email)
- [Provider setup](#provider-setup)
- [Routing rules and quotas](#routing-rules-and-quotas)
- [Templates and the visual editor](#templates-and-the-visual-editor)
- [Provider templates (SendGrid, Mailgun, Brevo, Amazon SES)](#provider-templates-sendgrid-mailgun-brevo-amazon-ses)

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

| Field                                                | Description                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `to`, `cc`, `bcc`                                    | Address, array or comma-separated list (max. 100 `to`, 50 `cc`/`bcc`). Display names allowed                                                                                                                                                                                                                                                  |
| `subject`, `text`, `html`                            | `subject` is required unless a template provides it; `text` or `html` is required. HTML is sanitised (no scripts, event handlers or `javascript:` URLs; email layout is kept)                                                                                                                                                                 |
| `from`                                               | Optional. Must be the sending account's address; only its display name is used                                                                                                                                                                                                                                                                |
| `replyTo`                                            | A valid address                                                                                                                                                                                                                                                                                                                               |
| `type`                                               | `transactional` (default), `marketing` or `notification`. Without `type`, a template's category is used                                                                                                                                                                                                                                       |
| `priority`                                           | `normal` (default), `high` or `low`. `high` adds `X-Priority` and `Importance` headers                                                                                                                                                                                                                                                        |
| `accountName`                                        | Force one account                                                                                                                                                                                                                                                                                                                             |
| `templateId` / `templateReferenceId`, `templateData` | Render a MagicMail template by its Reference ID with Mustache data (`data` is accepted as an alias of `templateData`)                                                                                                                                                                                                                         |
| `unsubscribeUrl`                                     | Per-email unsubscribe URL                                                                                                                                                                                                                                                                                                                     |
| `enableTracking: false`, `skipLinkTracking: true`    | Disable open and click tracking, or only click tracking, for this email                                                                                                                                                                                                                                                                       |
| `customField`                                        | Value matched by routing rules of type _Custom_                                                                                                                                                                                                                                                                                               |
| `headers`                                            | Up to 20 custom headers: `X-*` (except MagicMail's own and SendGrid's `X-SG-ID`/`X-SG-EID`) plus `List-Id`, `Precedence`, `Auto-Submitted`, `In-Reply-To`, `References`. Others are dropped. Mailgun: all headers and options together must stay under 16 KB, otherwise the send fails before the request with `MAGIC_MAIL_MESSAGE_TOO_LARGE` |
| `attachments`                                        | Up to 20, 25 MB each and 40 MB together, with `filename`, `content`, `contentType`, `encoding`, `cid`. SendGrid and Mailgun have lower message limits (see below)                                                                                                                                                                             |
| `userId`, `recipientName`                            | Stored on the email log                                                                                                                                                                                                                                                                                                                       |

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

1. In SendGrid go to **Settings → API Keys → Create API Key**, choose **Custom Access** and grant only **Mail Send**. A Full Access key is not needed. Add **Template Engine → Read Access** only if you want to use [provider templates](#provider-templates-sendgrid-mailgun-brevo-amazon-ses).
2. In MagicMail choose **SendGrid** and paste the key. The From address must be a verified Sender Identity in SendGrid (single sender or authenticated domain).
3. Choose the region. **Global** fits every account except EU regional subusers, which need **EU**.

| `config.region` | API host                      |
| --------------- | ----------------------------- |
| `us` (default)  | `https://api.sendgrid.com`    |
| `eu`            | `https://api.eu.sendgrid.com` |

Any other value is rejected when the account is created or updated. Accounts saved without a region keep using the global host.

What MagicMail sends to SendGrid:

- Every address once across to, cc and bcc (SendGrid rejects duplicates), with its display name.
- `custom_args`: `magicmail_version`, `email_type`, `priority` and `magicmail_id` (the email log id, used to match webhook events).
- `tracking_settings.open_tracking` / `click_tracking` with `enable: false` for the parts MagicMail tracks itself, so SendGrid does not track them a second time.
- Messages are refused before the request when the request body would be 30 MB or more (SendGrid accepts "less than 30MB" including attachments).

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

What MagicMail adds to each Mailgun message:

- `o:tracking-opens=no` / `o:tracking-clicks=no` for the parts MagicMail tracks itself (no double-wrapped links).
- The variables `v:magicmail_email_type`, `v:magicmail_priority` and `v:magicmail_id` (the email log id), and `o:tag` with the email type. Mailgun shows variables to the recipient in the `X-Mailgun-Variables` header; they contain no personal data.
- Messages are refused before the request when headers and options exceed Mailgun's 16 KB limit or the estimated message size is 25 MB or more.

### Brevo

1. In Brevo go to **SMTP & API → API keys → Generate a new API key**. Use an API key (`xkeysib-…`), not an SMTP key. If **Security → Authorised IPs** blocks unknown addresses, authorise the IP address of your Strapi server.
2. In MagicMail choose **Brevo** and paste the key. The From address must be a verified sender or belong to an authenticated domain in Brevo. Brevo has one API host for every account (`https://api.brevo.com/v3`); there is no region to choose.
3. Save, then use **Check connection**: it reads `GET /v3/account` with the stored key (no email is sent) and names the cause when it fails (invalid key, IP not authorised, account still under validation, no credits).

What MagicMail sends to Brevo (`POST /v3/smtp/email`, header `api-key`):

- `sender`, `to`, `cc`, `bcc` (every address once), one `replyTo` (several reply-to addresses are refused with a 400), `subject`, `htmlContent` and `textContent`.
- Attachments as base64 `content` with a `name`. Brevo does not support inline (`cid`) images and accepts only certain file extensions; both are refused before the request with a clear error. Brevo accepts at most 20 MB per message including attachments.
- The filtered custom headers, plus `X-Mailin-custom: magicmail_id=<log id>` (Brevo echoes it in webhooks) and the email type as a tag. Caller headers named `X-Sib-*` or `X-Mailin-*` are dropped.
- Open and click tracking is an account-wide Brevo setting; there is no per-message switch.

### Amazon SES

1. Verify the From address or its domain in Amazon SES **in the region you will use**. While the AWS account is in the SES sandbox, every recipient must be verified too (the [mailbox simulator](https://docs.aws.amazon.com/ses/latest/dg/send-an-email-from-console.html) addresses such as `success@simulator.amazonses.com` always work).
2. Create an IAM user with only these permissions and an access key for it:

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": "ses:SendEmail",
         "Resource": [
           "arn:aws:ses:<region>:<account>:identity/<domain-or-address>",
           "arn:aws:ses:<region>:<account>:configuration-set/<set>",
           "arn:aws:ses:<region>:<account>:template/*"
         ]
       },
       {
         "Effect": "Allow",
         "Action": ["ses:GetAccount", "ses:ListEmailTemplates"],
         "Resource": "*"
       },
       {
         "Effect": "Allow",
         "Action": "ses:GetEmailTemplate",
         "Resource": "arn:aws:ses:<region>:<account>:template/*"
       }
     ]
   }
   ```

3. In MagicMail choose **Amazon SES**, enter the region (for example `eu-west-1`) and the access key ID and secret access key. Instead of a key you can choose **Server environment variables**: MagicMail then reads `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` and, for temporary role credentials, `AWS_SESSION_TOKEN` from the Strapi process at every request. Use this when your platform injects role credentials as environment variables. MagicMail never calls the EC2 instance-metadata or ECS credential endpoints.
4. Optional: a **configuration set** (needed for bounce, complaint and delivery events and for open and click tracking) and the **SNS topic ARN** for the [webhook](./delivery.md#bounces-and-complaints).
   ![Account wizard, Amazon SES credentials step: region, IAM access key or server environment credentials, configuration set and Check connection](https://raw.githubusercontent.com/Schero94/Magic-Mail/main/docs/site/img/readme/ses-account.webp)

5. Save, then **Check connection**: it reads `GET /v2/email/account` (no email is sent) and shows whether the account is still in the sandbox and whether sending is enabled.

MagicMail calls the SES v2 API (`https://email.<region>.amazonaws.com`) with requests signed by AWS Signature Version 4, implemented with Node's `crypto` and tested against the official AWS SigV4 test suite (no AWS SDK is installed). China (`cn-*`) and ISO regions are rejected; GovCloud works.

What MagicMail sends to Amazon SES (`SendEmail`):

- `FromEmailAddress`, `Destination` (to, cc, bcc; at most 50 recipients in total, an SES limit), `ReplyToAddresses`, and `Content.Simple` with subject, text, HTML, the filtered headers (at most 15) and attachments.
- `EmailTags` `magicmail_id` and `magicmail_email_type`, and the configuration set when one is saved.
- `ConfigurationOverrides.Tracking` switches SES open/click tracking off for the parts MagicMail tracks itself.
- Messages are refused before the request at 40 MB (the SES v2 limit including attachments).

### Provider comparison

| Provider      | Authentication                            | Transport                                                | DKIM                      |
| ------------- | ----------------------------------------- | -------------------------------------------------------- | ------------------------- |
| Gmail         | OAuth 2.0                                 | Gmail API                                                | by Google                 |
| Microsoft 365 | OAuth 2.0 (Entra ID)                      | Microsoft Graph `sendMail`                               | by Microsoft              |
| Yahoo Mail    | OAuth 2.0                                 | SMTP with XOAUTH2                                        | by Yahoo                  |
| SMTP          | Username and password                     | Nodemailer, any SMTP server                              | optional (see above)      |
| SendGrid      | API key                                   | HTTPS API (v3)                                           | by SendGrid               |
| Mailgun       | API key + domain                          | HTTPS API (US or EU region)                              | by Mailgun                |
| Brevo         | API key                                   | HTTPS API (v3)                                           | by Brevo                  |
| Amazon SES    | IAM access key or environment credentials | HTTPS API (v2, SigV4, any commercial or GovCloud region) | by Amazon SES (Easy DKIM) |

All providers support attachments and custom headers. Inline images (`cid`) work everywhere except Brevo.

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

## Provider templates (SendGrid, Mailgun, Brevo, Amazon SES)

If your team designs emails in SendGrid, Mailgun, Brevo or Amazon SES, MagicMail can send those templates while routing, failover, quotas and the delivery log stay in MagicMail. Nothing changes until such an account exists; then a **Provider templates** section appears under your templates.

![Provider templates under the local templates: a SendGrid and a Mailgun template with provider badge, change date at the provider, the accounts that have it and the status](https://raw.githubusercontent.com/Schero94/Magic-Mail/main/docs/site/img/provider-templates.webp)

**How it works**

1. MagicMail reads the templates of every SendGrid, Mailgun, Brevo and Amazon SES account with the stored, encrypted credentials: SendGrid dynamic templates, Mailgun templates of the account's sending domain and account-level Mailgun templates, Brevo transactional templates (inactive ones are shown as **No active version**) and SES email templates of the account's region. It never writes to the provider. The list refreshes itself when it is older than 10 minutes; **Sync** refreshes it at once.
2. Each template gets a key from its provider and name, for example `sendgrid:welcome-email` or `mailgun:newsletter-digest`. The key is the same in every environment, so code and settings do not change between staging and production. If the provider id of a template changes (for example after a database copy to another environment) but a template with the same name exists, MagicMail matches it by name and shows **Matched by name**.
3. **Open** shows a sandboxed preview, the variables the template uses, a code example, **Send test** (to your own admin address unless you enter another one; it uses the same sample values as local template tests) and **Copy as Magic Mail template**.

**Send from code**

```javascript
await strapi
  .plugin('magic-mail')
  .service('email-router')
  .send({
    to: 'user@example.com',
    providerTemplate: 'sendgrid:welcome-email',
    data: {
      name: 'Ada',
      user: { email: 'user@example.com' },
      items: [{ title: 'First steps' }],
    },
  });
```

The `data` object is the one a local template gets: MagicMail sends it as SendGrid `dynamic_template_data`, Mailgun `t:variables`, Brevo `params` or SES `TemplateData`. SendGrid, Mailgun and SES use Handlebars with top-level keys, so `{{name}}`, `{{user.email}}` and `{{{html}}}` keep their names. Brevo templates read the same data under `params`: a Brevo template writes `{{ params.name }}` and you still pass `name`; the dialog lists the variables without the `params.` prefix. Before sending, the data is converted to plain JSON: dates become ISO strings, functions and `undefined` are dropped, cycles and values such as `Map` or `BigInt` are rejected with a 400 that names the field, never the value.

| Rule                            | Behaviour                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Which accounts send             | Only accounts where the sync found the template. Routing rules, the primary account and failover work as usual among those accounts. An explicit `accountName` without the template is an error.                                                                                                                                                                                                                                                                     |
| Subject                         | The template's subject. SendGrid always uses the template subject (use `{{subject}}` in it and pass `subject` in `data` for a per-mail subject). Mailgun uses `subject` when you pass one and the template's Subject header otherwise; a Mailgun template without a Subject header needs `subject`.                                                                                                                                                                  |
| Sender                          | The MagicMail account's verified From, as for every other mail.                                                                                                                                                                                                                                                                                                                                                                                                      |
| Missing or unpublished template | A clear error naming the template (`MAGIC_MAIL_PROVIDER_TEMPLATE_UNAVAILABLE`, `MAGIC_MAIL_PROVIDER_TEMPLATE_UNKNOWN`). No other body is sent.                                                                                                                                                                                                                                                                                                                       |
| Fallback                        | Optional, per template: **Fallback template** in the dialog sends a local MagicMail template with the same `data` instead, but only when no provider accepted the message (missing template, provider refusal, no account available). An ambiguous error (for example a timeout after sending) never triggers it.                                                                                                                                                    |
| Size limits                     | Mailgun accepts 16 KB for all send options (`t:variables` plus headers); SendGrid accepts messages under 30 MB. MagicMail also bounds template data to 1 MB. Larger mails fail before anything is sent with `MAGIC_MAIL_PROVIDER_TEMPLATE_TOO_LARGE`. For Mailgun the 16 KB also include the `v:magicmail_*` variables and `o:tag` that MagicMail adds to every send.                                                                                                |
| Tracking                        | The provider renders the body, so MagicMail adds no open pixel or link tracking. With **Count provider opens and clicks** (Plugin Settings, off by default) MagicMail asks SendGrid, Mailgun and SES to track the template mail and counts their open and click webhook events in Email Analytics; Brevo tracks at account level and its `opened`/`click` events are counted the same way. See [provider opens and clicks](./delivery.md#provider-opens-and-clicks). |
| Language versions               | Optional, per template: see [Language versions](#language-versions) below.                                                                                                                                                                                                                                                                                                                                                                                           |
| Log                             | The delivery log stores the template key and the variable names, never the values.                                                                                                                                                                                                                                                                                                                                                                                   |
| Not available                   | The public Content API (`/api/magic-mail/send`) does not accept `providerTemplate`; the outbox does not queue provider-template mails in this release. SMTP and OAuth accounts have no provider templates. Brevo templates can not be copied as Magic Mail templates (Brevo's own template language does not map to Mustache). SES ignores a caller `subject` for templates (SES does not allow one).                                                                |

**Password reset and email confirmation**

**Email Templates → Core emails → Design** chooses, per core email, the MagicMail designer (default) or a provider template. MagicMail then sends these variables (payload version 1; keys are only ever added):

| Variable                                                                   | Value                                                                                                                     |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `URL`, `SERVER_URL`, `ADMIN_URL`, `TOKEN` (reset) or `CODE` (confirmation) | The same values Users & Permissions uses                                                                                  |
| `USER` and `user`                                                          | `id`, `email`, `username` and, when present, `firstname` and `lastname`. Never the whole user.                            |
| `url`                                                                      | The finished link: `URL` with `code=TOKEN` (reset) or `confirmation=CODE` (confirmation), built with `URL`/`searchParams` |
| `baseUrl`, `serverUrl`, `adminUrl`, `token` or `code`                      | camelCase copies                                                                                                          |
| `meta`                                                                     | `templateKey`, `payloadVersion: 1`, `coreEmailType` and, when the user has a stored locale, `locale`                      |

The dialog lists these names and warns about variables the template uses that MagicMail does not send. By default a failing provider template is reported as an error; tick **send the Magic Mail designer version instead** to fall back. When the chosen template is deleted or unpublished at the provider, the Core emails tab and the MagicMail dashboard show a red notice.

### Language versions

![Provider template dialog for a Brevo template with the language versions de and fr, a language field and a template picker](https://raw.githubusercontent.com/Schero94/Magic-Mail/main/docs/site/img/readme/language-versions.webp)

A provider template can have one version per language. Create the translated templates at the provider (for example `Welcome`, `Welcome DE`, `Welcome FR`), sync, open the default template and add **Language versions**: type a language code (`de`, `fr`, `pt-BR`) and pick the template from the list. Changes are saved at once. You keep sending the default key; MagicMail picks the version:

```javascript
await strapi
  .plugin('magic-mail')
  .service('email-router')
  .send({
    to: 'user@example.com',
    providerTemplate: 'brevo:welcome',
    locale: 'de-AT',
    data: { name: 'Ada' },
  });
```

1. The language: `locale` passed to `send()`; otherwise the recipient's stored locale, when the Users & Permissions user content type has a `locale` attribute (string or enumeration) and the mail has exactly one recipient. Core emails (password reset, email confirmation) use the user's stored locale the same way and send it as `meta.locale`. **Send test** uses your admin interface language.
2. The version: the exact language tag (`de-AT`), then its language (`de`), then the default template. A version that is deleted or unpublished at the provider is skipped, and the next candidate is used, so a broken translation never blocks the mail.
3. Rules: versions must come from the same provider and are picked from the synced list (no ids are typed); a version can not have versions of its own. The delivery log records the requested key, the sent version and the language. An invalid `locale` is a 400.

**Convert for provider**

The code snippets dialog of a local template has **Convert for SendGrid or Mailgun**: it shows the HTML and subject with Mustache logic translated to Handlebars (`{{#list}}` becomes `{{#if list}}` with a comment to use `{{#each}}` for lists, `{{^flag}}` becomes `{{#unless flag}}`, `{{.}}` becomes `{{this}}`) for you to paste into a provider template. **Copy as Magic Mail template** does the reverse for a provider template and lists everything that does not carry over (for example `{{#equal}}` or `{{else if}}`).

**How this is verified**

- Every request MagicMail builds for these features (template list with pagination, template detail, send with `template_id` and `dynamic_template_data`, Mailgun domain and account templates, send with `template` and `t:variables`, EU hosts) is validated in CI against the providers' official OpenAPI documents ([twilio/sendgrid-oai](https://github.com/twilio/sendgrid-oai), pinned by commit, and the [Mailgun API reference](https://documentation.mailgun.com/docs/mailgun/api-reference/send/mailgun/templates)), together with the responses of the fake SendGrid and Mailgun servers the integration tests use.
- Brevo requests and fake responses are validated against Brevo's official OpenAPI documents (`email-api.json`, `accounts-and-settings.json` from developers.brevo.com, pinned by SHA-256). Amazon SES requests are validated against the official Smithy model of SES v2 ([aws/api-models-aws](https://github.com/aws/api-models-aws), pinned by commit), and the request signing against all 38 cases of the official AWS SigV4 test suite.
- `npm run test:live` runs the same flows against the real SendGrid (sandbox mode, nothing delivered) and Mailgun (test mode, nothing delivered) APIs with your own test accounts; see [Contributing](https://github.com/Schero94/Magic-Mail#contributing). Brevo runs with the sandbox header `X-Sib-Sandbox: drop` (nothing delivered) and SES only to the mailbox simulator. Live verification status: **pending** (no live run recorded yet).
