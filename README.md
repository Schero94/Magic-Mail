# 📧 MagicMail - Email Business Suite for Strapi v5

Project site: https://schero94.github.io/Magic-Mail/

> Manage email accounts, routing rules, templates, OAuth setup, delivery and analytics in Strapi. The plugin is MIT-licensed and open source.

[![NPM Version](https://img.shields.io/npm/v/strapi-plugin-magic-mail.svg)](https://www.npmjs.com/package/strapi-plugin-magic-mail)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Strapi Version](https://img.shields.io/badge/Strapi-5.57%2B%20(tested%205.61)-blue.svg)](https://strapi.io)

> The plugin does not require a license key or paid plan.

---

## 🌟 Why MagicMail?

MagicMail brings multi-account email management to Strapi v5:

- **100% Free & Open Source** - Every feature included, no license key, tiers or limits (MIT)
- **6 Email Providers** - Gmail, Microsoft 365, Yahoo (OAuth 2.0), SMTP (any Nodemailer-compatible server), SendGrid, Mailgun
- **OAuth 2.0 Authentication** - No mailbox passwords for Gmail, Microsoft and Yahoo
- **Smart Routing Rules** - Route emails by type, recipient, subject, template or a custom value
- **Automatic Failover** - Quotas and safe failover across accounts
- **Admin UI** - Accounts, routing, templates, analytics and settings in the Strapi admin panel (light and dark mode, 5 languages)
- **Configured in the admin** - Accounts and credentials live encrypted in the database; production only needs one encryption key
- **Drop-in for the Strapi email service** - `strapi.plugin('email')` and `sendTemplatedEmail()` are routed through MagicMail
- **Compliance headers** - `List-Unsubscribe` (RFC 8058 One-Click for https URLs), `Auto-Submitted`, `Precedence: bulk`
- **Hardened by default** - TLS 1.2+ for SMTP, AES-256-GCM credential encryption, HTML sanitising, privacy-friendly tracking

---

## 📸 Screenshots

### Email Accounts Dashboard
![Email Accounts Dashboard](https://raw.githubusercontent.com/Schero94/Magic-Mail/main/pics/EmailAccountDashboard.png)
*Manage email accounts with live stats and quota usage*

### Add Email Account - Step 1
![Add Account Step 1](https://raw.githubusercontent.com/Schero94/Magic-Mail/main/pics/Emailaddccount1.png)
*Choose from 6 email providers, three of them with OAuth 2.0*

### Add Email Account - Step 2
![Add Account Step 2](https://raw.githubusercontent.com/Schero94/Magic-Mail/main/pics/emailaddaccount2.png)
*Configure SMTP settings or connect with OAuth*

### Add Email Account - Step 3
![Add Account Step 3](https://raw.githubusercontent.com/Schero94/Magic-Mail/main/pics/emailaddaccount3.png)
*Complete setup with rate limits and test the connection*

### Email Templates
![Email Templates](https://raw.githubusercontent.com/Schero94/Magic-Mail/main/pics/Templates.png)
*Create and manage email templates with the visual designer*

### Email Designer
![Email Designer](https://raw.githubusercontent.com/Schero94/Magic-Mail/main/pics/emailDesigner.png)
*Drag-and-drop email editor with preview*

### Template Version History
![Version History](https://raw.githubusercontent.com/Schero94/Magic-Mail/main/pics/emailVersionHistory.png)
*Track changes and restore previous template versions*

### Template Send Test
![Send Test](https://raw.githubusercontent.com/Schero94/Magic-Mail/main/pics/emailTemplateSendTest.png)
*Test your templates before sending to production*

### Routing Rules & Templates
![Routing Rules](https://raw.githubusercontent.com/Schero94/Magic-Mail/main/pics/RoutingEmailTemplates.png)
*Define routing rules based on email type, recipient, subject, template or a custom value*

### Email Analytics
![Email Analytics](https://raw.githubusercontent.com/Schero94/Magic-Mail/main/pics/emailAnalytics.png)
*Delivery logs, opens and clicks*

### Code Integration
![Code Snippet](https://raw.githubusercontent.com/Schero94/Magic-Mail/main/pics/codesnippet.png)
*Copy-ready code snippets for every template*

---

## Quick Start

### Requirements

- Node.js `>=22.12.0 <=26.x.x` (the same range as Strapi 5.61)
- Strapi `^5.57.0` (developed and tested against 5.61)
- `@strapi/plugin-users-permissions` `^5.57.0` (present in every default Strapi app; the email log links to its users)
- In every environment other than development/test: `MAGIC_MAIL_ENCRYPTION_KEY` (see [Configuration](#-configuration))

### Installation

```bash
npm install strapi-plugin-magic-mail
# or
yarn add strapi-plugin-magic-mail
```

### Enable Plugin

Create or update `config/plugins.ts`:

```typescript
export default () => ({
  'magic-mail': {
    enabled: true,
  },
});
```

### Build & Start

```bash
npm run build
npm run develop
```

### Add Your First Email Account

1. Open **Admin Panel → MagicMail → Email Accounts**
2. Click **Add Account**
3. Choose your provider (Gmail OAuth, SMTP, ...)
4. Enter the credentials
5. Click **Test** to verify the account

Upgrading from 3.x? Read [Upgrading to 4.0](#-upgrading-to-40) first.

---

## 📧 Supported Email Providers

| Provider | Type | Authentication | Transport |
|----------|------|----------------|-----------|
| **Gmail** | OAuth 2.0 | Google OAuth | Gmail API |
| **Microsoft 365** | OAuth 2.0 | Microsoft Entra ID | Microsoft Graph `sendMail` |
| **Yahoo Mail** | OAuth 2.0 | Yahoo OAuth | SMTP with XOAUTH2 |
| **SMTP** | Credentials | Username/Password | Nodemailer, any SMTP server, optional DKIM |
| **SendGrid** | API Key | SendGrid v3 API | HTTPS API |
| **Mailgun** | API Key | Mailgun API | HTTPS API |

The `nodemailer` provider value is an alias of `smtp`.

---

## 💡 How to Send Emails

### Method 1: Strapi Native Email Service (Recommended)

MagicMail wraps the **provider** of `@strapi/email`, so existing code needs no changes:

```javascript
// Works in any Strapi plugin or controller:
await strapi.plugin('email').service('email').send({
  to: 'user@example.com',
  subject: 'Welcome to Our Platform!',
  text: 'Plain text version',
  html: '<h1>Welcome!</h1><p>Thanks for signing up!</p>',
});
```

Both `send()` and `sendTemplatedEmail()` are routed, including Strapi's admin password-reset mail and every users-permissions mail. MagicMail selects the account (routing rules, then priority), reserves quota, fails over when it is safe, logs the email and updates the statistics.

**Never lost:** when no active MagicMail account exists, or every eligible account is over its quota, the email goes out through the original Strapi email provider (logged as `strapi-email-provider`). Once a MagicMail account has attempted delivery, errors are returned to the caller and never re-sent through the original provider, so nothing is delivered twice. Direct `email-router` callers (Method 2) get the error instead of the fallback.

### Method 2: Direct MagicMail Service

For explicit control over account selection:

```javascript
await strapi.plugin('magic-mail').service('email-router').send({
  to: 'customer@example.com',
  subject: 'Order Confirmation',
  html: '<h1>Your Order #12345</h1>',
  accountName: 'SendGrid Marketing', // force this account (case-insensitive)
  type: 'transactional',
  priority: 'high',
});
```

An explicit `accountName` is never replaced by another account: if it is over quota or fails, the send fails.

### Method 3: Content API (HTTP)

See [Content API](#content-api) for `POST /api/magic-mail/send` and `/send-message`.

### Sending with Attachments

```javascript
await strapi.plugin('email').service('email').send({
  to: 'customer@example.com',
  subject: 'Invoice #12345',
  html: '<h1>Invoice Attached</h1>',
  attachments: [
    {
      filename: 'invoice.pdf',
      content: await fs.promises.readFile(invoicePath), // read the file yourself
      contentType: 'application/pdf',
    },
    {
      filename: 'receipt.pdf',
      content: pdfBase64,
      encoding: 'base64',
      contentType: 'application/pdf',
    },
  ],
});
```

Attachments must carry their `content` (Buffer, or a string with `encoding`). `path` and `href` attachments are rejected for every provider, so MagicMail never reads server files or fetches URLs on a caller's behalf. Inline images use `cid` and are sent inline by every provider. Limits: 20 attachments, 25 MB each.

### Priority & Marketing Emails

```javascript
// High priority email (adds X-Priority and Importance headers)
await strapi.plugin('magic-mail').service('email-router').send({
  to: 'vip@example.com',
  subject: 'Urgent: Action Required',
  html: '<h1>Important Update</h1>',
  priority: 'high',
});

// Marketing email with unsubscribe link
await strapi.plugin('magic-mail').service('email-router').send({
  to: 'subscriber@example.com',
  subject: 'Weekly Newsletter',
  html: '<h1>This Week</h1>',
  type: 'marketing',
  unsubscribeUrl: 'https://yoursite.com/unsubscribe?id=123',
});
```

`List-Unsubscribe` is sent for marketing emails that have an unsubscribe URL, and for every email type when **Settings → Unsubscribe header** is on and a URL is available. A per-email `unsubscribeUrl` wins; the plugin-wide URL from the settings is only used while the toggle is on. `{{email}}` in the plugin-wide URL is replaced with the (URL-encoded) recipient for single-recipient emails. `List-Unsubscribe-Post: List-Unsubscribe=One-Click` is only added for `https` URLs. Marketing emails also get `Precedence: bulk`; notification emails get `Auto-Submitted: auto-generated`.

### Send options

| Field | Description |
|-------|-------------|
| `to`, `cc`, `bcc` | Address, array or comma-separated list (max. 100 `to`, 50 `cc`/`bcc`); display names allowed |
| `subject`, `text`, `html` | `subject` is required unless a template provides it; `text` or `html` is required. HTML is sanitised (scripts, event handlers and `javascript:` URLs are removed; email layout markup is kept) |
| `from` | Optional. Must be the sending account's address; only its display name is used. Any other address is replaced by the account address |
| `replyTo` | Valid address(es) |
| `type` | `transactional` (default), `marketing` or `notification`. A template's category is used when `type` is omitted |
| `priority` | `normal` (default), `high` or `low` |
| `accountName` | Force one account |
| `templateId` / `templateReferenceId`, `templateData` | Render a MagicMail template with Mustache data |
| `unsubscribeUrl` | Per-email unsubscribe URL |
| `enableTracking: false`, `skipLinkTracking: true` | Disable open+click or only click tracking for this email |
| `customField` | Value matched by routing rules of type *Custom* |
| `headers` | Up to 20 custom headers: `X-*` (except MagicMail's own) plus `List-Id`, `Precedence`, `Auto-Submitted`, `In-Reply-To`, `References`. Others are dropped |
| `userId`, `recipientName` | Stored on the email log |

---

## 🎨 Email Designer Suite

**Design emails visually with the integrated email designer.**

### ✨ Features

| Feature | Included |
|---------|----------|
| **Visual Designer (Unlayer)** | ✅ |
| **Plain HTML/Text editing** | ✅ |
| **Unlimited Templates** | ✅ |
| **Mustache Variables** | ✅ |
| **Import / Export** | ✅ |
| **Template Versioning** | ✅ |
| **Users & Permissions templates** (reset password, email confirmation) | ✅ |
| **Email Analytics** | ✅ |

### 📧 Creating Email Templates

1. Go to **MagicMail → Email Templates**.
2. Click **Create Template** and build the email in the visual designer (or the plain HTML/text tab).
3. Use Mustache variables for dynamic content:

   ```html
   <h1>Welcome {{user.firstName}}!</h1>
   <p>Thanks for joining {{company.name}}</p>
   ```

4. Save. Each template gets a unique numeric **Reference ID** (e.g. `100`) that you use when sending. The editor locks the Reference ID once the template exists.

The server fills `{{system.date}}`, `{{system.year}}` and `{{system.unsubscribe}}` (the email's unsubscribe URL); callers cannot override them.

### 💌 Sending Templated Emails

```javascript
await strapi.plugin('magic-mail').service('email-router').send({
  to: 'user@example.com',
  templateId: 100, // Reference ID
  templateData: {
    user: { firstName: 'John', lastName: 'Doe' },
    company: { name: 'ACME Corp', url: 'https://acme.example' },
  },
});

// The Strapi email service accepts the same fields:
await strapi.plugin('email').service('email').send({
  to: 'user@example.com',
  templateId: 100,
  templateData: { user: { firstName: 'Jane' } },
});
```

### 🎯 Template Categories

Templates have a category: `transactional`, `marketing`, `notification` or `custom`. The first three become the email `type` when the caller does not pass one, so a routing rule *Email Type = marketing* also catches marketing templates.

### 🔄 Template Versioning

Version 1 is the created template; every save that changes the content (name, subject, design, HTML, text or tags) adds one version with the saved content. Saves that only toggle `isActive` or the category add no version. Restoring a version saves its content as a new version.

```javascript
const designer = strapi.plugin('magic-mail').service('email-designer');
const versions = await designer.getVersions(templateDocumentId);
await designer.restoreVersion(templateDocumentId, versionDocumentId);
```

### 📦 Import/Export Templates

```javascript
const designer = strapi.plugin('magic-mail').service('email-designer');

// Export all templates (or pass an array of documentIds)
const templates = await designer.exportTemplates();
fs.writeFileSync('templates.json', JSON.stringify(templates, null, 2));

// Import (MagicMail and strapi-plugin-email-designer-5 export formats)
const results = await designer.importTemplates(JSON.parse(fs.readFileSync('templates.json', 'utf8')));
console.log(`Imported ${results.filter((r) => r.success).length} templates`);
```

### 🎨 Visual Designer (Unlayer)

The visual designer embeds the [Unlayer](https://unlayer.com) editor through `react-email-editor`. It runs hardened by default:

- The loader URL is explicit (`https://editor.unlayer.com/embed.js?2`) and the editor build is pinned to an exact version (`1.524.0`).
- No Unlayer `projectId` is sent unless you configure one.
- No Unlayer image hosting, stock images, AI assistant, hosted image editor, "preview in browser" or third-party placeholder images. Images you add are uploaded to the **Strapi Media Library** (`POST /upload`), so editors also need the *Media Library → Create (upload)* permission.
- If the editor cannot load (blocked by CSP, offline), the page falls back to the plain HTML/text editor and explains why.

Optional settings (`config/plugins.js`):

```javascript
module.exports = {
  'magic-mail': {
    config: {
      designer: {
        projectId: null,   // your own Unlayer project id (positive integer)
        scriptUrl: null,   // https URL of a vetted, self-hosted copy of embed.js
        version: null,     // exact Unlayer build, e.g. '1.524.0'
      },
    },
  },
};
```

#### Content Security Policy for the visual designer

Strapi's default `strapi::security` middleware blocks third-party scripts and frames. To use the visual designer, allow the Unlayer origin in `config/middlewares.js` (do **not** add `'unsafe-inline'` or `'unsafe-eval'`):

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
          // Media Library images shown inside the editor and the preview:
          'img-src': ["'self'", 'data:', 'blob:', 'https://your-media-host.example'],
        },
      },
    },
  },
  // ...the remaining default middlewares
];
```

If you self-host `embed.js` via `designer.scriptUrl`, use that origin instead of `https://editor.unlayer.com` in `script-src` (the editor iframe still loads from `editor.unlayer.com`). The Unlayer script runs in the admin origin, so only allow it if you accept that trust; without these directives the plain HTML/text editor keeps working.

### 📊 Template Statistics

```javascript
const stats = await strapi.plugin('magic-mail').service('email-designer').getStats();
// { total, active, inactive, byCategory: [{ category, count }], maxTemplates: -1, remaining: -1 }
```

### Users & Permissions email templates

The *Reset password* and *Email address confirmation* templates of Users & Permissions can be edited in MagicMail. This needs the *Users & Permissions → Email templates* read/update permissions in addition to MagicMail's. Only `{{ URL }}`, `{{ SERVER_URL }}`, `{{ ADMIN_URL }}`, `{{ CODE }}`, `{{ TOKEN }}`, `{{ USER }}`, `{{ USER.email }}` and `{{ USER.username }}` are accepted; they are stored as `<%= KEY %>` for users-permissions.

---

## 🎯 Smart Routing Rules

Routing rules send emails through specific accounts based on conditions.

| Match type | Matches when |
|------------|--------------|
| **Email Type** | the email type equals the value (`transactional`, `marketing`, `notification`) |
| **Recipient** | any recipient matches: `@domain.com` = domain, `user@domain.com` = exact address, anything else = substring |
| **Subject** | the subject contains the value (case-insensitive) |
| **Template** | the template name or Reference ID equals the value |
| **Custom** | the email's `customField` equals the value (service calls and the Content API `/send`) |

### Examples

```
Match Type: Email Type      Match Value: marketing         Target: SendGrid Marketing   Priority: 10
Match Type: Recipient       Match Value: @vip-customers.com Target: Priority SMTP  Fallback: Gmail OAuth  Priority: 9
Match Type: Subject         Match Value: Password Reset    Target: Transactional SMTP   Priority: 8
```

### Rule priority and failover

Rules are evaluated from **highest to lowest priority** (1 to 1,000,000; the admin list and `GET /magic-mail/routing-rules` show them in this order). Accounts are tried in this order: the matching rule's account, the rule's fallback account, the primary account, then the remaining active accounts by account priority (1-10, higher first). Accounts over their quota are skipped.

Errors that guarantee the provider did not accept the message (connection or authentication failures, missing credentials, HTTP 401/403/429/500/502/503, SMTP envelope rejection) move on to the next account. Ambiguous errors such as timeouts are returned to the caller to avoid duplicate delivery.

Rules reference accounts by name. Creating or editing a rule with an unknown account name is rejected. Renaming an account updates the rules that use it; deleting an account deactivates rules that target it and clears it as fallback.

### Quotas

Each account can have an hourly and a daily limit (0 = unlimited). Quota is reserved atomically before dispatch, so concurrent sends cannot exceed it. Windows follow the clock hour and calendar day in UTC; set `quotaTimezone` (IANA name) in the plugin config to change this.

---

## 🔐 Provider Setup Guides

**OAuth redirect URI.** MagicMail builds the redirect URI from the `URL` environment variable if set (legacy override), otherwise from Strapi's `server.url` (`server.absoluteUrl`): `<public URL>/magic-mail/oauth/<gmail|microsoft|yahoo>/callback`. The account wizard shows the exact value the server uses. In production the URL must be public `https`; there is no `localhost` fallback. The `localhost` URIs below are for local development.

The authorization popup reports back to the admin panel origin (`admin.url`); if the admin is served from its own host, set `admin.url` to that absolute URL. OAuth flows are bound to the admin who started them and kept in process memory, so horizontally scaled deployments need sticky admin sessions.

**Re-authorizing an account** (revoked consent, expired refresh token): start the flow with `GET /magic-mail/oauth/<provider>/auth?accountId=<documentId>` and finish it with `POST /magic-mail/oauth/reconnect/<documentId>`; the provider must return the account's own mailbox. Access tokens are refreshed automatically 60 seconds before they expire and once more if the provider rejects them; rotated refresh tokens are stored.

### Gmail OAuth Setup

**1. Google Cloud Console**
1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project or select an existing one
3. Enable the Gmail API
4. Create an OAuth 2.0 Client ID (Web application)
5. Add the redirect URI: `http://localhost:1337/magic-mail/oauth/gmail/callback`
6. Copy the Client ID and Client Secret

**2. In MagicMail**
1. Choose "Gmail OAuth"
2. Paste Client ID and Client Secret
3. Click "Connect with Google" and authorize in the popup

**Scopes requested:** `https://www.googleapis.com/auth/gmail.send`, `https://www.googleapis.com/auth/userinfo.email`, `openid`

### Microsoft 365 OAuth Setup

**1. Azure Portal**
1. Go to [portal.azure.com](https://portal.azure.com) → **Microsoft Entra ID → App registrations → New registration**
2. Account type: **Accounts in this organizational directory only**
3. Copy the **Application (client) ID** and the **Directory (tenant) ID**

**2. Add the redirect URI** (platform *Web*)
```
http://localhost:1337/magic-mail/oauth/microsoft/callback
```

**3. API permissions** (Microsoft Graph, *Delegated*): `Mail.Send`, `User.Read`, `offline_access`, `openid`, `email`. Grant admin consent.

**4. Client secret:** *Certificates & secrets → New client secret*, copy the **Value** (not the Secret ID).

**5. In MagicMail:** choose "Microsoft OAuth", enter Tenant ID, Client ID and Client Secret, click "Connect with Microsoft". Tenant IDs must be a GUID, a domain, `common`, `organizations` or `consumers`.

### Yahoo Mail OAuth Setup

1. Go to [developer.yahoo.com/apps](https://developer.yahoo.com/apps) and create an app
2. Redirect URI: `http://localhost:1337/magic-mail/oauth/yahoo/callback`
3. API permissions: **Mail (read/write)** and **OpenID Connect** (scopes `openid email mail-w`)
4. In MagicMail choose "Yahoo Mail OAuth", paste Client ID and Client Secret and click "Connect with Yahoo"

### SMTP Setup (Universal)

```
Host: smtp.example.com
Port: 587 (STARTTLS) or 465 (implicit TLS)
Username: your-email@domain.com
Password: your-password (or an app password)
```

- **Gmail:** `smtp.gmail.com:587` (use an App Password)
- **Outlook.com:** `smtp-mail.outlook.com:587`
- **Microsoft 365:** `smtp.office365.com:587`

TLS 1.2 or newer is required and certificates are verified. For a local mail catcher (Mailpit, MailHog) set `"allowInsecure": true` in the SMTP account config; it is honoured outside `NODE_ENV=production`, or for loopback hosts.

**Optional DKIM signing** (account config):

```json
{
  "dkim": {
    "domainName": "yourdomain.com",
    "keySelector": "default",
    "privateKey": "-----BEGIN PRIVATE KEY-----\n..."
  }
}
```

Generate a 2048-bit key (`openssl genrsa -out dkim_private.pem 2048`) and publish the public key as `default._domainkey.yourdomain.com` TXT.

### SendGrid Setup

1. [app.sendgrid.com](https://app.sendgrid.com) → Settings → API Keys → Create API Key with the **Mail Send** scope
2. In MagicMail choose "SendGrid" and paste the API key

### Mailgun Setup

1. [app.mailgun.com](https://app.mailgun.com) → API Security → copy the **Private API Key**; Sending → Domains → copy your verified domain
2. In MagicMail choose "Mailgun", enter the domain (e.g. `mg.yourdomain.com`) and the API key

---

## 🛡️ Security

### Credentials
- **AES-256-GCM** encryption for all account credentials and OAuth tokens, with an HKDF-derived, purpose-bound key (format `v1:`)
- **Secrets never leave the server**: the edit form receives a fixed placeholder (`********`). Changing the provider, host, port, user, OAuth client/tenant, Mailgun domain or `allowInsecure` requires entering the secrets again.
- Key rotation with `MAGIC_MAIL_ENCRYPTION_KEY_PREVIOUS` (decrypt only; saving an account re-encrypts it)

### Transport
- TLS 1.2+ and certificate verification for SMTP
- HTTPS for every API provider
- Message-ID generated per email (RFC 5322)

### Content
- HTML is sanitised before sending (no scripts, event handlers or `javascript:` URLs)
- Recipients, sender, reply-to and headers are validated; header injection is stripped
- No file-path or URL attachments
- A warning is logged for subjects longer than 200 characters

### Deliverability
MagicMail does not validate SPF, DKIM or DMARC for you; they depend on your DNS and provider. OAuth providers, SendGrid and Mailgun sign mail themselves; for SMTP add DKIM as shown above. `from` is always aligned with the sending account to keep DMARC alignment.

---

## 🔑 Permissions

MagicMail registers four admin actions (Settings → Administration Panel → Roles → Plugins → MagicMail):

| Action | Grants |
|--------|--------|
| `plugin::magic-mail.access` | The MagicMail menu entry and page. No API access by itself. |
| `plugin::magic-mail.read` | Read accounts, routing rules, templates, analytics and settings; render and export templates; the settings link. |
| `plugin::magic-mail.manage` | Create, update and delete accounts, rules, templates, logs and settings; OAuth setup. |
| `plugin::magic-mail.test-send` | Send test emails (account test, Strapi-service test, template test). Rate limited to 10 per minute per admin. |

Typical roles: read-only = `access` + `read`; editor = `access` + `read` + `manage`; tester = `access` + `read` + `test-send`. Editing the users-permissions templates also needs the users-permissions email-template permissions. Details: [docs/permission-migration.md](./docs/permission-migration.md).

---

## Content API

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `POST` | `/api/magic-mail/send` | API token | Send an email through the router (all [send options](#send-options)) |
| `POST` | `/api/magic-mail/send-message` | API token | Simple email: `to`, `cc`, `bcc`, `subject`, `message`/`text`/`html`, `templateId`, `templateData` |
| `GET` | `/api/magic-mail/track/open/:emailId/:recipientHash` | public | Open-tracking pixel |
| `GET` | `/api/magic-mail/track/click/:emailId/:linkHash/:recipientHash` | public | Click tracking redirect |

**Authentication.** The send routes accept **API tokens only** by default. Create a *Custom* API token (Settings → API Tokens) that allows only `magic-mail` → `send` / `sendMessage`. Never enable them for the *Public* or *Authenticated* role. To let users-permissions roles send as well (the pre-4.0 behaviour):

```javascript
// config/plugins.js
module.exports = {
  'magic-mail': {
    config: {
      contentApi: { allowUserRoles: true },
    },
  },
};
```

With user roles allowed, the email log is always attributed to the authenticated user. With an API token, `userId` must reference an existing users-permissions user. The request body is validated strictly: unknown fields return 400.

**Rate limit.** Both send routes share a budget of 60 requests per minute per caller. Counters live in process memory, so each Strapi instance counts separately.

**Click tracking** of Content-API emails is limited to the hosts in `tracking.allowedLinkHosts` (none by default).

### Admin API

All admin routes live under `/magic-mail` and require an authenticated administrator plus the action shown. Routes: `accounts` (CRUD, `/:id/test`, `/test-strapi-service`), `routing-rules` (CRUD), `oauth/<provider>/auth`, `oauth/create-account`, `oauth/reconnect/:accountId`, `designer/*` (templates, versions, render, export, import, stats, `editor-config`, users-permissions templates, download, duplicate, test-send), `analytics/*` (stats, email logs, user activity, delete) and `settings`. `GET` routes need `read`, changes need `manage`, test sends need `test-send`. The OAuth callbacks are public and protected by a signed, single-use state bound to the admin who started the flow.

---

## 🔧 Configuration

### Environment variables

```env
# Required outside development/test: credential encryption key (32+ bytes).
# Keep it stable across deploys and backups.
# Generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
MAGIC_MAIL_ENCRYPTION_KEY=...

# Optional - previous key during a rotation (decrypt only).
MAGIC_MAIL_ENCRYPTION_KEY_PREVIOUS=...

# Optional - OAuth state signing secret (default: derived from the encryption key)
MAGIC_MAIL_OAUTH_STATE_SECRET=...

# Optional - open/click tracking hash secret (default: derived from the encryption key);
# previous values, comma-separated, stay valid during a rotation.
MAGIC_MAIL_TRACKING_SECRET=...
MAGIC_MAIL_TRACKING_SECRET_PREVIOUS=

# Optional - legacy override of the OAuth callback base URL (default: server.url)
URL=https://cms.example.com

# Optional - enables GET /magic-mail/analytics/debug outside production
MAGIC_MAIL_ENABLE_DEBUG_ENDPOINT=false
```

Without `MAGIC_MAIL_ENCRYPTION_KEY`, a development key derived from `ADMIN_JWT_SECRET`/`APP_KEYS` is used only when `NODE_ENV` is unset, `development` or `test`; rotating those secrets then makes stored credentials unreadable. Any other environment (for example `staging`) refuses to start without the key.

Set Strapi's `server.url` to your public URL (used for OAuth redirects and tracking links), and enable `server.proxy` behind a reverse proxy.

### Plugin config

All keys are optional and validated at startup:

```javascript
// config/plugins.js
module.exports = {
  'magic-mail': {
    enabled: true,
    config: {
      debug: false,                       // info/debug logs (warnings and errors are always logged)
      contentApi: {
        allowUserRoles: false,            // true = users-permissions roles may use the send routes
      },
      quotaTimezone: 'UTC',               // IANA zone for hourly/daily quota windows
      tracking: {
        eventRetentionDays: 90,           // raw open/click events; 0 = keep forever
        linkTtlDays: 180,                 // tracked links redirect this long; 0 = forever
        logRetentionDays: 0,              // email logs (with events/links); 0 = keep forever
        maxLinksPerEmail: 100,            // further links stay untracked
        allowedLinkHosts: [],             // e.g. ['example.com'] (subdomains included)
        anonymizeIp: true,                // store /24 (IPv4) or /48 (IPv6) only
      },
      designer: {
        projectId: null,                  // optional Unlayer project id
        scriptUrl: null,                  // optional https URL of the Unlayer loader
        version: null,                    // optional exact Unlayer build
      },
    },
  },
};
```

### Admin settings (MagicMail → Settings)

| Setting | Default | Effect |
|---------|---------|--------|
| Link tracking / Open tracking | on | Rewrite links / add the open pixel |
| Tracking base URL | empty | Public base for tracking URLs (else `server.url`) |
| Default from name | empty | Display name when neither the account nor the caller sets one |
| Default from email | empty | Reference only; emails are always sent from the selected account's address |
| Unsubscribe header | on | Send `List-Unsubscribe` for every email type and use the plugin-wide URL |
| Unsubscribe URL | empty | Plugin-wide unsubscribe URL; `{{email}}` is replaced per recipient |

`trackingFallbackUrl` (where expired or unknown tracking links redirect) can be set through `PUT /magic-mail/settings`.

### Account settings

Each account has: name (unique), description, provider, from email/name, reply-to, encrypted credentials (SMTP password, API key, OAuth tokens, optional DKIM), daily and hourly limit (0 = unlimited), priority (1-10, higher preferred), active flag and primary flag.

---

## 🎨 Service API Reference

```javascript
// Send (see "Send options")
await strapi.plugin('magic-mail').service('email-router').send({ to, subject, html });

// Accounts
const accounts = await strapi.plugin('magic-mail').service('account-manager').getAllAccounts();

// Test one account (also works for inactive accounts)
await strapi.plugin('magic-mail').service('account-manager').testAccount(
  accountDocumentId,
  'test@example.com',
  { priority: 'high', type: 'marketing', unsubscribeUrl: 'https://example.com/unsubscribe' }
);

// Templates
const designer = strapi.plugin('magic-mail').service('email-designer');
const rendered = await designer.renderTemplate(100, { user: { firstName: 'Test' } });
```

---

## 🧪 Testing Your Setup

### Test via Admin UI

1. Go to **Email Accounts** and click **Test** on an account
2. Enter a recipient and optional CC, priority, email type and unsubscribe URL
3. Choose **Test Direct** (send through this account) or **Test Strapi Service** (send through `strapi.plugin('email')`, which verifies the interception; only for active accounts)

### Verify headers

Open the received email's source ("Show original" in Gmail, "View source" elsewhere) and look for:

```
X-Mailer: MagicMail/1.0
X-Priority: 1 (Highest)
Importance: high
List-Unsubscribe: <https://...>
Message-ID: <...>
```

---

## 📈 Analytics & Monitoring

### Dashboard

- Emails sent today and in total, active accounts, quota usage per account
- Delivery log with server-side search (recipient, subject, template), delivery status filter and paging
- Opens and clicks per email

### Open & Click Tracking

Open tracking adds a 1x1 pixel, click tracking rewrites `<a href>` links to a redirect. Both are on by default (Settings) and can be disabled per email with `enableTracking: false` or `skipLinkTracking: true`.

**Public URL.** Tracking URLs are built from the *Tracking base URL* setting, then `server.url`, then `server.absoluteUrl`, plus your REST prefix (`api.rest.prefix`, default `/api`), e.g. `https://cms.example.com/api/magic-mail/track/click/...`. In production a loopback host (`localhost`, `127.0.0.1`, `0.0.0.0`) is never used: without a public URL, emails are sent **untracked** and one warning is logged.

**What is never tracked.** Authentication and one-time-token links (password reset, confirmation, magic links, OAuth, parameters such as `token`, `loginToken`, `code`, `key`, `signature`, `session`, long random values), `mailto:`/`tel:` links, and links above `maxLinksPerEmail`. Content-API emails are click-tracked only for hosts in `tracking.allowedLinkHosts`.

**Privacy and retention.** Open/click events store the IP truncated to /24 (IPv4) or /48 (IPv6) and the user agent (max. 512 characters); no location. Only Koa's `request.ip` is used, so behind a reverse proxy enable [`server.proxy`](https://docs.strapi.io/cms/configurations/server) or every recipient shares the proxy's address. Events older than `eventRetentionDays` and links older than `linkTtlDays` are deleted every 6 hours; `logRetentionDays` optionally deletes old email logs. Your privacy notice should mention open/click tracking.

**Rate limit.** The tracking routes allow 300 requests per minute and IP. Above that, opens and clicks are no longer recorded, but recipients still get the pixel and are still redirected; only above 3,000 per minute is a 429 returned.

**Tracking secret.** Tracking hashes are signed with `MAGIC_MAIL_TRACKING_SECRET`, falling back to `MAGIC_MAIL_ENCRYPTION_KEY`. To rotate it, put the old value in `MAGIC_MAIL_TRACKING_SECRET_PREVIOUS` until old mails no longer matter.

### Email Logging

Every email gets a log entry with recipient, subject, account, template, type, status (`pending`, `sent`, `failed`), timestamps, the attempted accounts and, for failures, the error. Logs contain personal data (recipient addresses); delete them with `DELETE /magic-mail/analytics/emails[?olderThan=ISO-date]` or `tracking.logRetentionDays`.

```javascript
const logs = await strapi.documents('plugin::magic-mail.email-log').findMany({
  filters: { status: 'sent' },
  sort: [{ createdAt: 'desc' }],
  limit: 100,
});
```

---

## 🔄 Integration with Email Designer 5

MagicMail works with [strapi-plugin-email-designer-5](https://www.npmjs.com/package/strapi-plugin-email-designer-5): that plugin sends through `strapi.plugin('email').service('email')`, which MagicMail intercepts, so its emails are routed, quota-checked and logged like any other. MagicMail can also import its template exports.

---

## 🚨 Troubleshooting

### Email not received
1. Check the Strapi log for `[magic-mail]` warnings and errors (always logged; set `debug: true` for details).
2. Check the account: active, test button, quota not exhausted.
3. Check the spam folder; new senders often land there.
4. OAuth accounts: re-authorize if the refresh token was revoked.

### DMARC failures (custom domains)
1. SPF record, e.g. `v=spf1 include:_spf.google.com ~all`
2. DKIM: add the private key to the SMTP account config and the public key to DNS
3. DMARC record, e.g. `v=DMARC1; p=quarantine; rua=mailto:dmarc@yourdomain.com`

### Rate limit errors
- Raise the account's daily/hourly limits, add accounts, or route load with rules
- Check provider limits (e.g. Gmail 500/day for free accounts, 2,000/day for Workspace)

### OAuth connection issues
- Redirect URI must match exactly (see the account wizard)
- Microsoft: all five delegated permissions granted with admin consent, correct tenant ID, client secret not expired
- Behind a separate admin host: set `admin.url`
- Production: `server.url` must be public `https`

### Visual designer does not load
Allow `https://editor.unlayer.com` in `script-src` and `frame-src` (see [Content Security Policy](#content-security-policy-for-the-visual-designer)). The plain HTML/text editor works without it.

---

## 🏗️ Architecture

```
magic-mail/
├── admin/src/
│   ├── index.js                     # menu, settings link, permissions, translations
│   ├── components/                  # AddAccountModal, AccountWizard/*, shared/* (dialogs, search, headings)
│   ├── hooks/                       # RBAC, i18n, formatters, unsaved-changes guard, clipboard
│   ├── pages/
│   │   ├── App.jsx                  # tabs: accounts, routing, templates, analytics
│   │   ├── HomePage.jsx, Accounts/  # email accounts
│   │   ├── RoutingRules.jsx, Routing/
│   │   ├── EmailDesigner/           # template list, editor (Unlayer + plain), versions, test send
│   │   ├── Analytics.jsx
│   │   └── PluginSettings.jsx
│   ├── translations/                # en, de, fr, es, pt
│   └── utils/                       # theme tokens, validation helpers
└── server/src/
    ├── bootstrap.js                 # wraps the @strapi/email provider, maintenance timers
    ├── config/                      # plugin config defaults + validator
    ├── content-types/               # email-account, email-log, email-event, email-link,
    │                                # email-template, email-template-version, routing-rule, plugin-settings
    ├── controllers/, routes/        # admin + content API
    ├── middlewares/rate-limit.js
    ├── policies/                    # api-token-only
    ├── services/                    # email-router, account-manager, oauth, email-designer,
    │                                # analytics, plugin-settings
    ├── utils/                       # encryption, oauth-state, tracking-url-policy, logger, DTOs
    └── validation.js                # zod schemas for every request
```

### Data flow

```
strapi.plugin('email').send / sendTemplatedEmail / email-router.send / Content API
  → validation + template rendering
  → routing rules → candidate accounts → atomic quota reservation
  → provider adapter (SMTP / Gmail / Graph / Yahoo / SendGrid / Mailgun)
  → safe failover on non-delivery errors
  → email log, statistics, tracking
  (native mail with no usable account → original Strapi email provider)
```

---

## 🔌 Email Provider Comparison

| Feature | Gmail OAuth | Microsoft OAuth | Yahoo OAuth | SMTP | SendGrid | Mailgun |
|---------|-------------|-----------------|-------------|------|----------|---------|
| **Auth Method** | OAuth 2.0 | OAuth 2.0 | OAuth 2.0 | Password | API Key | API Key |
| **Attachments** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Inline images (cid)** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Custom Headers** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **DKIM** | Provider | Provider | Provider | Optional | Provider | Provider |
| **Best For** | Personal/Small | Enterprise | Personal | Custom | Transactional/Marketing | Bulk/Dev |

---

## 🌍 Production Deployment

1. Set `MAGIC_MAIL_ENCRYPTION_KEY` (and keep a backup of it).
2. Set `server.url` to the public `https` URL; behind a proxy also `server.proxy: true`.
3. Register the production redirect URIs with your OAuth apps:
   ```
   https://cms.example.com/magic-mail/oauth/gmail/callback
   https://cms.example.com/magic-mail/oauth/microsoft/callback
   https://cms.example.com/magic-mail/oauth/yahoo/callback
   ```
4. Add the CSP directives if you use the visual designer.
5. Grant admin roles only the MagicMail actions they need, and use scoped API tokens for the Content API.
6. Review tracking retention and mention open/click tracking in your privacy notice.

---

## 🚀 Upgrading to 4.0

4.0 is a major release with security and correctness fixes that change behaviour. **Back up the database first**: credentials are re-encrypted in a format 3.x cannot read, and two legacy routing-rule columns are dropped.

Main steps (full list with migration notes in [CHANGELOG.md](./CHANGELOG.md) under *Unreleased*):

1. Use Node.js 22.12+ and make sure `@strapi/plugin-users-permissions` is installed.
2. Set `MAGIC_MAIL_ENCRYPTION_KEY` in every non-development environment (staging too).
3. Content API: switch callers to API tokens, or set `contentApi.allowUserRoles: true`. `/send-message` no longer accepts `channel`, and `/send` no longer accepts `phoneNumber` (unknown fields return 400). The non-email messaging routes were removed.
4. Attachments: replace `path`/`href` with `content`.
5. Set `server.url` (or the *Tracking base URL*) to your public URL, otherwise emails are sent untracked; review `tracking.*` retention and `allowedLinkHosts`.
6. Admin roles: grant `read`/`manage`/`test-send` in addition to `access` ([permission guide](./docs/permission-migration.md)).
7. Users & Permissions templates: grant the users-permissions email-template permissions to editors.
8. After changing an account's host, user, provider or OAuth client, enter its secret again.
9. Visual designer: add the CSP directives and the Media Library upload permission.

---

## 🤝 Contributing

- **Found a bug?** [Open an issue](https://github.com/Schero94/Magic-Mail/issues)
- **Have an idea?** [Start a discussion](https://github.com/Schero94/Magic-Mail/discussions)
- **Code:** fork, create a branch, run `npm test`, `npm run build`, `npm run verify` and `npm run verify:runtime`, then open a pull request (CI runs the same checks).

For local development, `npm run watch` (or `npm run watch:link` with yalc) rebuilds the admin and the server bundle on change.

---

## Dependency audits

Run `npm audit` from the Strapi project root to check the complete installed dependency tree. npm applies dependency overrides from the root project manifest, not from this plugin's manifest.

Known host-side advisory: `npm audit --omit=dev` in this repository reports GHSA-mrhx-c7xc-m3w5 (zod < 4.6.6) inside `@strapi/utils`, which the Strapi host provides. MagicMail validates every request with its own patched zod (`^4.6.7`) and bounds all collections, so the advisory is not reachable through MagicMail inputs. It disappears once your Strapi version ships a fixed zod.

---

## License

**MIT License** - Copyright © 2025 Schero D. See [LICENSE](./LICENSE).

MagicMail is fully free and open source. Every feature is available to everyone with no license key, tier, activation or usage limit.

---

## 🙏 Credits

- [Strapi v5](https://strapi.io) - Headless CMS
- [Nodemailer](https://nodemailer.com) - SMTP client
- [Unlayer](https://unlayer.com) / [react-email-editor](https://github.com/unlayer/react-email-editor) - Visual email editor
- [Heroicons](https://heroicons.com) - Icons
- [styled-components](https://styled-components.com) - CSS-in-JS

---

## 💬 Support

- 📖 [Documentation](https://github.com/Schero94/Magic-Mail#readme)
- 🐛 [Report Issues](https://github.com/Schero94/Magic-Mail/issues)
- 💡 [Feature Requests](https://github.com/Schero94/Magic-Mail/discussions)

---

**Made for the Strapi Community**
