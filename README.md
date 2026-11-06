# 📧 MagicMail - Email Business Suite for Strapi v5

Project site: https://schero94.github.io/Magic-Mail/

> Manage email accounts, routing rules, OAuth setup, and delivery in Strapi. The plugin is MIT-licensed and open source.

[![NPM Version](https://img.shields.io/npm/v/strapi-plugin-magic-mail.svg)](https://www.npmjs.com/package/strapi-plugin-magic-mail)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Strapi Version](https://img.shields.io/badge/Strapi-v5.57.0-blue.svg)](https://strapi.io)

> The plugin does not require a license key or paid plan.

---

## 🌟 Why MagicMail?

**Stop fighting with .env files and email configuration!** MagicMail brings professional email management to Strapi v5 with:

- **100% Free & Open Source** - Every feature included, no license key, tiers, or limits (MIT)
- **7 Email Providers** - Gmail, Microsoft 365, Yahoo, SMTP, SendGrid, Mailgun, Nodemailer
- **OAuth 2.0 Authentication** - No passwords needed for Gmail, Microsoft, Yahoo
- **Smart Routing Rules** - Route emails by type, recipient, subject, or custom conditions
- **Automatic Failover** - Never lose an email when rate limits hit
- **Beautiful Admin UI** - Manage everything from Strapi Admin Panel
- **Zero Configuration** - No .env files, everything in the database
- **Email Designer Compatible** - Works seamlessly with strapi-plugin-email-designer-5
- **GDPR/CAN-SPAM Compliant** - Built-in List-Unsubscribe headers
- **Professional Security** - TLS 1.2+, DKIM, SPF, DMARC validation

---

## 📸 Screenshots

### Email Accounts Dashboard
![Email Accounts Dashboard](pics/EmailAccountDashboard.png)
*Manage unlimited email accounts with live stats and real-time monitoring*

### Add Email Account - Step 1
![Add Account Step 1](pics/Emailaddccount1.png)
*Choose from 6 different email providers with OAuth 2.0 support*

### Add Email Account - Step 2
![Add Account Step 2](pics/emailaddaccount2.png)
*Configure SMTP settings or connect with OAuth*

### Add Email Account - Step 3
![Add Account Step 3](pics/emailaddaccount3.png)
*Complete setup with rate limits and test connection*

### Email Templates
![Email Templates](pics/Templates.png)
*Create and manage email templates with the visual designer*

### Email Designer
![Email Designer](pics/emailDesigner.png)
*Drag-and-drop email editor with real-time preview*

### Template Version History
![Version History](pics/emailVersionHistory.png)
*Track changes and restore previous template versions*

### Template Send Test
![Send Test](pics/emailTemplateSendTest.png)
*Test your templates before sending to production*

### Routing Rules & Templates
![Routing Rules](pics/RoutingEmailTemplates.png)
*Define intelligent routing rules based on email type, recipient, subject*

### Email Analytics
![Email Analytics](pics/emailAnalytics.png)
*Track email performance with detailed analytics and statistics*

### Code Integration
![Code Snippet](pics/codesnippet.png)
*Simple API integration with your Strapi application*

---

## Upgrading to 4.0

4.0 is a major release with security fixes that change behaviour (API-token-only Content API, re-entering secrets after endpoint changes, stricter users-permissions template handling, a versioned credential format, removed legacy routing-rule columns). Read the migration steps in [CHANGELOG.md](./CHANGELOG.md) under *Unreleased* before upgrading, and back up the database first.

---

## Quick Start

### Installation

Requires Node.js `>=20.19.0 <=26.x.x`, Strapi `^5.57.0` and the Users & Permissions plugin (`@strapi/plugin-users-permissions`, included in every default Strapi app; the email log links to its users).

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

1. Navigate to **Admin Panel → MagicMail → Email Accounts**
2. Click **"Add Account"**
3. Choose your provider (Gmail OAuth, SMTP, etc.)
4. Fill in credentials
5. Click **"Test"** to verify
6. Done! 🎉

---

## 📧 Supported Email Providers

| Provider | Type | Authentication | Features |
|----------|------|----------------|----------|
| **Gmail** | OAuth 2.0 | Google OAuth | Gmail API, Attachments, Auto DKIM |
| **Microsoft 365** | OAuth 2.0 | Azure AD | Graph API, Attachments, Tenant Support |
| **Yahoo Mail** | OAuth 2.0 | Yahoo OAuth | SMTP OAuth2, Attachments |
| **SMTP** | Credentials | Username/Password | Universal, DKIM Optional, Custom Servers |
| **SendGrid** | API Key | SendGrid API | Transactional, Marketing, Templates |
| **Mailgun** | API Key | Mailgun API | Bulk Sending, Analytics |

---

## 💡 How to Send Emails

### Method 1: Strapi Native Email Service (Recommended!)

MagicMail **automatically intercepts** Strapi's email service - no code changes needed!

```javascript
// This works in ANY Strapi plugin or controller:
await strapi.plugin('email').service('email').send({
  to: 'user@example.com',
  subject: 'Welcome to Our Platform!',
  text: 'Plain text version',
  html: '<h1>Welcome!</h1><p>Thanks for signing up!</p>',
});

// ✅ MagicMail automatically:
// - Selects best account (via routing rules or priority)
// - Checks rate limits
// - Handles failover if needed
// - Logs the email
// - Updates statistics
```

MagicMail wraps the email **provider** of `@strapi/email`, so both `send()` and `sendTemplatedEmail()` are routed. That includes Strapi's admin password-reset mail and every users-permissions mail.

**Benefits:**
- ✅ **Zero code changes** - Existing plugins work automatically
- ✅ **Email Designer compatible** - Works with strapi-plugin-email-designer-5
- ✅ **Never lost** - When no active MagicMail account exists, or every eligible account is over its quota, the email goes out through the original Strapi email provider (logged as `strapi-email-provider`). Once an account has attempted delivery, errors are returned to the caller and never re-sent through the original provider, so nothing is delivered twice.
- ✅ **Drop-in replacement** - Just enable and go!

### Method 2: Direct MagicMail API

For explicit control over account selection:

```javascript
// Force a specific account
await strapi.plugin('magic-mail').service('email-router').send({
  to: 'customer@example.com',
  subject: 'Order Confirmation',
  html: '<h1>Your Order #12345</h1>',
  accountName: 'SendGrid Marketing', // Force this account
  type: 'transactional',
  priority: 'high',
});
```

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

Attachments must carry their `content` (Buffer or string with `encoding`). Since 4.0, `path` and `href` attachments are rejected for every provider, so MagicMail never reads server files or fetches URLs on a caller's behalf. Inline images use `cid` and are sent inline by every provider.

**Supported attachment formats:**
- ✅ PDF, Word, Excel, PowerPoint
- ✅ Images (PNG, JPG, GIF, WebP)
- ✅ Text files (TXT, CSV, JSON)
- ✅ Archives (ZIP, RAR)
- ✅ Any file type!

### Advanced: Priority & Marketing Emails

```javascript
// High priority email
await strapi.plugin('magic-mail').service('email-router').send({
  to: 'vip@example.com',
  subject: 'Urgent: Action Required',
  html: '<h1>Important Update</h1>',
  priority: 'high', // Adds X-Priority and Importance headers
});

// Marketing email with unsubscribe (GDPR/CAN-SPAM compliant)
await strapi.plugin('magic-mail').service('email-router').send({
  to: 'subscriber@example.com',
  subject: 'Weekly Newsletter',
  html: '<h1>This Week's Updates</h1>',
  type: 'marketing',
  unsubscribeUrl: 'https://yoursite.com/unsubscribe?id=123',
  // Automatically adds List-Unsubscribe header!
});
```

---

## 🎨 Email Designer Suite (NEW!)

**Design beautiful emails visually with the integrated email designer!**

### ✨ Features

Every Email Designer feature is included for free:

| Feature | Included |
|---------|----------|
| **Visual Designer** | ✅ |
| **Unlimited Templates** | ✅ |
| **Drag & Drop + Mustache** | ✅ |
| **Import / Export** | ✅ |
| **Template Versioning** | ✅ |
| **Email Analytics** | ✅ |

### 📧 Creating Email Templates

**1. Navigate to Email Templates Tab**

Go to **MagicMail → Email Templates** in the admin panel.

**2. Create New Template**

Click **"Create Template"** and use the visual designer to build your email.

**3. Add Variables with Mustache**

Use Mustache syntax for dynamic content:

```html
<h1>Welcome {{user.firstName}}!</h1>
<p>Thanks for joining {{company.name}}</p>
```

**4. Save & Use**

Each template gets a unique **Reference ID** (e.g., `100`) that you use when sending.

### 💌 Sending Templated Emails

**Method 1: Using Template ID**

```javascript
// Send email using template
await strapi.plugin('magic-mail').service('email-router').send({
  to: 'user@example.com',
  templateId: 100, // Your template reference ID
  templateData: {
    user: {
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
    },
    company: {
      name: 'ACME Corp',
      url: 'https://acme.com',
    },
    orderNumber: '12345',
    orderTotal: '$199.99',
  },
});

// ✅ MagicMail will:
// - Load template #100
// - Render it with your data (Mustache)
// - Route via smart routing
// - Send via best account
```

**Method 2: Via Strapi Email Service**

```javascript
// Also works with standard Strapi email service!
await strapi.plugin('email').service('email').send({
  to: 'user@example.com',
  templateId: 100,
  templateData: {
    user: { firstName: 'Jane' },
    resetUrl: 'https://yoursite.com/reset?token=xyz',
  },
});
```

### 🎯 Template Categories

Templates can be categorized for automatic routing:

- **transactional** - Order confirmations, receipts
- **marketing** - Newsletters, promotions
- **notification** - System alerts, updates
- **custom** - Anything else

**Automatic Routing by Category:**

```javascript
// Create routing rule: All marketing templates → SendGrid
// Then just send:
await strapi.plugin('magic-mail').service('email-router').send({
  to: 'subscriber@example.com',
  templateId: 200, // Marketing category template
  templateData: { offer: '50% OFF' },
});
// ✅ Automatically routes via SendGrid (based on category)
```

### 🔄 Template Versioning

Version 1 is the created template; every save that changes the content (name, subject, design, HTML, text or tags) adds one version with the saved content. Saves that only toggle `isActive` or the category add no version. Restoring a version saves its content as a new version.

```javascript
// Get all versions
const versions = await strapi
  .plugin('magic-mail')
  .service('email-designer')
  .getVersions(templateId);

// Restore old version
await strapi
  .plugin('magic-mail')
  .service('email-designer')
  .restoreVersion(templateId, versionId);
```

### 📦 Import/Export Templates

**Export all templates:**

```javascript
const templates = await strapi
  .plugin('magic-mail')
  .service('email-designer')
  .exportTemplates();

// Save to file
fs.writeFileSync('templates.json', JSON.stringify(templates, null, 2));
```

**Import templates:**

```javascript
const templates = JSON.parse(fs.readFileSync('templates.json'));

const results = await strapi
  .plugin('magic-mail')
  .service('email-designer')
  .importTemplates(templates);

console.log(`Imported ${results.filter(r => r.success).length} templates`);
```

### 🎨 Visual Designer Features

**Powered by Unlayer Email Editor:**

- ✅ Drag & Drop Interface
- ✅ Pre-built Content Blocks
- ✅ Image Upload & Management
- ✅ Custom Fonts & Colors
- ✅ Responsive Design
- ✅ Mobile Preview
- ✅ HTML/Text Editor
- ✅ Merge Tags Support
- ✅ Save/Load Designs

### 📊 Template Statistics

```javascript
const stats = await strapi
  .plugin('magic-mail')
  .service('email-designer')
  .getStats();

console.log(stats);
// {
//   total: 15,
//   active: 12,
//   inactive: 3,
//   byCategory: [
//     { category: 'transactional', count: 8 },
//     { category: 'marketing', count: 4 },
//     { category: 'notification', count: 3 }
//   ],
//   maxTemplates: -1, // unlimited (all features are free)
//   remaining: -1     // unlimited
// }
```

### 🚀 Best Practices

**1. Use Template Categories**
```javascript
// Set category when creating template
category: 'marketing' // Auto-routes to marketing account
```

**2. Test Templates Before Using**
```javascript
// Test render before sending
const rendered = await strapi
  .plugin('magic-mail')
  .service('email-designer')
  .renderTemplate(100, { user: { firstName: 'Test' } });

console.log(rendered.html); // Preview HTML
```

**3. Version Control**
```javascript
// Template version history is always enabled (free for everyone).
```

**4. Organize with Tags**
```javascript
// Add tags to templates
tags: ['onboarding', 'welcome-series', 'v2']
```

---

## 🎯 Smart Routing Rules

Create intelligent routing rules to send emails through specific accounts based on conditions.

### Example Use Cases

**1. Route Marketing Emails via SendGrid:**
```
Match Type: Email Type
Match Value: marketing
Target Account: SendGrid Marketing
Priority: 10
```

**2. Route VIP Customers via Priority SMTP:**
```
Match Type: Recipient
Match Value: @vip-customers.com
Target Account: Priority SMTP
Fallback Account: Gmail OAuth
Priority: 9
```

**3. Route Password Reset Emails:**
```
Match Type: Subject
Match Value: Password Reset
Target Account: Transactional SMTP
Priority: 8
```

### Routing Priority

Rules are evaluated from **highest to lowest priority** (1 to 1,000,000; the admin list and `GET /magic-mail/routing-rules` show them in this order):
- Higher number = evaluated first (most specific rules)
- Lower number = evaluated later (catch-all rules)

If no rule matches, the **Primary Account** is used.

Rules reference accounts by name. Creating or editing a rule with an unknown account name is rejected. Renaming an account updates the rules that use it; deleting an account deactivates rules that target it and clears it as fallback.

---

## 🔐 Provider Setup Guides

**OAuth redirect URI.** Magic Mail builds the redirect URI from the `URL` environment variable if set, otherwise from Strapi's `server.url` (`server.absoluteUrl`): `<public URL>/magic-mail/oauth/<gmail|microsoft|yahoo>/callback`. The account wizard shows the exact value the server uses. In production the URL must be public `https`; there is no `localhost` fallback. The `localhost` URIs below are for local development.

The authorization popup reports back to the admin panel origin (`admin.url`); if the admin is served from its own host, set `admin.url` to that absolute URL. To re-authorize an existing account (revoked consent, expired refresh token), start the flow with `GET /magic-mail/oauth/<provider>/auth?accountId=<documentId>` and finish it with `POST /magic-mail/oauth/reconnect/<documentId>`; the provider must return the account's own mailbox.

### Gmail OAuth Setup

**1. Google Cloud Console**
1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project or select existing
3. Enable Gmail API
4. Create OAuth 2.0 Client ID
5. Add redirect URI: `http://localhost:1337/magic-mail/oauth/gmail/callback`
6. Copy Client ID and Client Secret

**2. In MagicMail**
1. Choose "Gmail OAuth" provider
2. Paste Client ID and Client Secret
3. Click "Connect with Google"
4. Authorize in popup
5. Done! ✅

**Required Scopes:**
- `https://www.googleapis.com/auth/gmail.send`
- `https://www.googleapis.com/auth/userinfo.email`

---

### Microsoft 365 OAuth Setup

**1. Azure Portal**
1. Go to [portal.azure.com](https://portal.azure.com)
2. Navigate to **Azure Active Directory → App registrations**
3. Click **"New registration"**
4. Name: "MagicMail"
5. Account type: **"Accounts in this organizational directory only"**
6. Copy **Application (client) ID** AND **Directory (tenant) ID**

**2. Add Redirect URI**
```
http://localhost:1337/magic-mail/oauth/microsoft/callback
```

**3. API Permissions**

Add these **Delegated permissions** under Microsoft Graph:
- ✅ `Mail.Send` - Send emails as the signed-in user
- ✅ `User.Read` - Read user profile
- ✅ `offline_access` - Maintain access (refresh tokens)
- ✅ `openid` - Sign users in
- ✅ `email` - View users' email address

**4. Grant Admin Consent** (Required!)

**5. Create Client Secret**
1. **Certificates & secrets** → **New client secret**
2. Copy the **VALUE** (not the Secret ID)
3. Store it securely!

**6. In MagicMail**
1. Choose "Microsoft OAuth" provider
2. Paste **Tenant ID**, **Client ID**, and **Client Secret**
3. Click "Connect with Microsoft"
4. Authorize
5. Done! ✅

---

### Yahoo Mail OAuth Setup

**1. Yahoo Developer Console**
1. Go to [developer.yahoo.com/apps](https://developer.yahoo.com/apps)
2. Click **"Create an App"**
3. Fill in app details

**2. Add Redirect URI**
```
http://localhost:1337/magic-mail/oauth/yahoo/callback
```

**3. API Permissions**
- ✅ `Mail` - Send and manage emails
- ✅ `OpenID Connect` - User authentication

**4. In MagicMail**
1. Choose "Yahoo Mail OAuth" provider
2. Paste Client ID and Client Secret
3. Click "Connect with Yahoo"
4. Done! ✅

---

### SMTP Setup (Universal)

**Works with ANY SMTP server:**

```
Host: smtp.gmail.com (or your SMTP server)
Port: 587 (STARTTLS) or 465 (SSL/TLS)
Username: your-email@domain.com
Password: your-password (or App Password)
```

**Popular SMTP Servers:**
- **Gmail:** `smtp.gmail.com:587` (use App Password!)
- **Outlook:** `smtp-mail.outlook.com:587`
- **Office365:** `smtp.office365.com:587`
- **Custom:** Your own mail server

**Gmail App Password:**
1. Google Account → Security → 2-Step Verification
2. App passwords → Generate
3. Use the 16-character password in MagicMail

**Optional: DKIM Signing**

For custom domains, you can add DKIM:
```javascript
// In config field (advanced users):
{
  dkim: {
    domainName: 'yourdomain.com',
    keySelector: 'default',
    privateKey: '-----BEGIN PRIVATE KEY-----\n...'
  }
}
```

---

### SendGrid Setup

**1. Get API Key**
1. Go to [app.sendgrid.com](https://app.sendgrid.com)
2. Settings → API Keys → Create API Key
3. Scope: **Mail Send** (Full Access)
4. Copy the API key

**2. In MagicMail**
1. Choose "SendGrid" provider
2. Paste API Key
3. Done! ✅

---

### Mailgun Setup

**1. Get API Key & Domain**
1. Go to [app.mailgun.com](https://app.mailgun.com)
2. Settings → API Security → Copy **Private API Key**
3. Sending → Domains → Copy your verified domain

**2. In MagicMail**
1. Choose "Mailgun" provider
2. Enter **Domain** (e.g., `mg.yourdomain.com`)
3. Paste **Private API Key**
4. Done! ✅

---

## 🛡️ Security Features

### Encryption
- ✅ **AES-256-GCM** encryption for all credentials, with an HKDF-derived, purpose-bound key (format `v1:`)
- ✅ **No plain text passwords** in database
- ✅ **OAuth tokens encrypted** at rest
- ✅ **Secure token refresh** mechanism
- ✅ **Secrets never leave the server**: the edit form receives a fixed placeholder (`********`). Changing the provider, host, port, user, OAuth client/tenant, Mailgun domain or `allowInsecure` requires entering the secrets again.
- ✅ **users-permissions email templates** (reset password, email confirmation) can only be read/edited with the matching *Users & Permissions → Email templates* permissions, and only `{{ URL }}`, `{{ SERVER_URL }}`, `{{ ADMIN_URL }}`, `{{ CODE }}`, `{{ TOKEN }}`, `{{ USER }}`, `{{ USER.email }}`, `{{ USER.username }}` are accepted.

### Transport Security
- ✅ **TLS 1.2+ enforced** (SMTP)
- ✅ **Certificate verification** enabled
- ✅ **HTTPS only** for API providers

### Email Authentication
- ✅ **DKIM signing** (optional for SMTP, automatic for OAuth)
- ✅ **SPF validation** support
- ✅ **DMARC compliance** - All providers pass DMARC checks
- ✅ **Proper Message-ID** generation (RFC 5322)

### Content Security
- ✅ **XSS prevention** - No `<script>` tags allowed
- ✅ **Input validation** - Email format, subject length
- ✅ **Spam trigger detection** - Warns about suspicious patterns
- ✅ **MIME type validation**

### Compliance Headers
- ✅ **List-Unsubscribe** (RFC 8058) - GDPR/CAN-SPAM compliant
- ✅ **Auto-Submitted** (RFC 3834) - Prevents auto-responder loops
- ✅ **Precedence: bulk** for marketing emails
- ✅ **X-Priority** and **Importance** headers

---

## 📊 Features Overview

### Multi-Account Management
- Unlimited email accounts
- Provider-specific configuration
- Active/Inactive status
- Primary account designation
- Per-account priority (1-10)
- Daily and hourly rate limits

### Smart Routing Engine
- **Email Type Routing** - transactional, marketing, notification
- **Recipient Matching** - Route by email domain or address
- **Subject Matching** - Route by subject keywords
- **Template Matching** - Route by template name
- **Custom Field Matching** - Flexible custom conditions
- **Priority-based evaluation** - Higher priority rules match first
- **Fallback accounts** - Automatic failover per rule

### Rate Limiting & Failover
- Per-account daily limits
- Per-account hourly limits
- Automatic counter reset (hourly/daily)
- Smart failover to backup accounts
- Rate limit hit detection
- Account health monitoring

### Analytics & Monitoring
- Real-time statistics dashboard
- Emails sent today (per account and total)
- Total emails sent (lifetime)
- Active/Inactive account count
- Success/Failure tracking
- Last used timestamps
- Visual progress bars for rate limits

### Testing Features
- **Test Direct** - Test specific account directly
- **Test Strapi Service** - Verify Email Designer compatibility
- **Priority Testing** - Test high/normal priority headers
- **Marketing Email Testing** - Test List-Unsubscribe headers
- **Detailed test results** - Shows all security features applied

---

## 🔧 Configuration

### Basic Setup (No .env Required!)

All configuration is done via the Admin Panel. However, for production deployments, you can set:

```env
# Required outside development/test: credential encryption key (32+ bytes).
# Generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
MAGIC_MAIL_ENCRYPTION_KEY=...

# Optional - previous key during a rotation (decrypt only). Saving an account
# re-encrypts it with the new key.
MAGIC_MAIL_ENCRYPTION_KEY_PREVIOUS=...

# Optional - OAuth state signing secret (default: derived from the encryption key)
MAGIC_MAIL_OAUTH_STATE_SECRET=...

# Optional - legacy override of the OAuth callback base URL (default: server.url)
URL=https://yourdomain.com
```

Without `MAGIC_MAIL_ENCRYPTION_KEY`, a development key derived from `ADMIN_JWT_SECRET`/`APP_KEYS` is used only when `NODE_ENV` is unset, `development` or `test`; any other environment (for example `staging`) refuses to start.

### Account Configuration

Each account can have:

**Basic Settings:**
- Name (unique identifier)
- Description
- Provider type
- From Email
- From Name
- Reply-To Email

**Security:**
- OAuth credentials (encrypted)
- SMTP credentials (encrypted)
- API keys (encrypted)
- DKIM configuration (optional)

**Rate Limiting:**
- Daily email limit (0 = unlimited)
- Hourly email limit (0 = unlimited)
- Priority (1-10, higher = preferred)

**Status:**
- Active/Inactive
- Primary account designation

---

## 🎨 API Reference

### Send Email (Standard Method)

```javascript
await strapi.plugin('email').service('email').send({
  to: 'recipient@example.com',
  from: 'sender@example.com', // Optional - uses account default
  subject: 'Email Subject',
  text: 'Plain text content',
  html: '<h1>HTML content</h1>',
  
  // Optional advanced options:
  replyTo: 'reply@example.com',
  type: 'transactional', // or 'marketing', 'notification'
  priority: 'normal', // or 'high'
  accountName: 'Specific Account', // Force specific account
  unsubscribeUrl: 'https://site.com/unsubscribe', // For marketing emails
  
  attachments: [
    {
      filename: 'document.pdf',
      content: pdfBuffer, // Buffer, or a string plus `encoding: 'base64'`
      contentType: 'application/pdf',
    },
  ],
});
```

**Sender and headers:**
- `from` must be a single address equal to the sending account's address; only its display name is used. Any other value is replaced by the account address. `defaultFromName` in the plugin settings is the display name when neither the account nor the caller sets one.
- `replyTo` must contain valid addresses.
- Custom `headers` (max. 20) accept `X-*` names plus `List-Id`, `Precedence`, `Auto-Submitted`, `In-Reply-To` and `References`. MagicMail's own headers (`X-Mailer`, `X-Email-Type`, `X-Priority`, unsubscribe headers) cannot be overridden.
- The template category (`transactional`, `marketing`, `notification`) is used as the email type when the caller does not pass `type`.

**Routing and failover:** accounts are tried in this order: the matching rule's account, the rule's fallback account, the primary account, then the others by priority. Accounts over their quota are skipped. Errors that guarantee the provider did not accept the message (connection or authentication failures, missing credentials, HTTP 401/403/429/500/502/503, SMTP envelope rejection) move on to the next account. Ambiguous errors such as timeouts are returned to the caller to avoid duplicate delivery. An explicit `accountName` is never replaced by another account. Recipient rules match any recipient: `@domain.com` matches the domain, `user@domain.com` the exact address.

**Quotas** are reserved atomically before dispatch, so concurrent sends cannot exceed `hourlyLimit`/`dailyLimit`. Windows follow the clock hour and calendar day in UTC; set `quotaTimezone` (IANA name) in the plugin config to change this.

**SMTP TLS:** TLS is required and certificates are verified. For a local mail catcher (Mailpit, MailHog) add `"allowInsecure": true` to the SMTP account config. It is honoured outside `NODE_ENV=production`, or for loopback hosts.

**Content API authentication:** `/api/magic-mail/send` and `/send-message` accept API tokens only. To let users-permissions roles send as well (the pre-4.0 behaviour), enable it in `config/plugins.js`:

```javascript
module.exports = {
  'magic-mail': {
    config: {
      contentApi: { allowUserRoles: true },
    },
  },
};
```

With user roles allowed, the email log is always attributed to the authenticated user. With an API token, `userId` must reference an existing users-permissions user.

### Send Email (Direct MagicMail API)

```javascript
await strapi.plugin('magic-mail').service('email-router').send({
  to: 'user@example.com',
  subject: 'Test Email',
  html: '<p>Content</p>',
  accountName: 'Gmail OAuth', // Optional - force specific account
  type: 'transactional',
  priority: 'normal',
});
```

### Get All Accounts

```javascript
const accounts = await strapi.plugin('magic-mail').service('account-manager').getAllAccounts();
```

### Test Account

```javascript
const result = await strapi.plugin('magic-mail').service('account-manager').testAccount(
  accountId,
  'test@example.com',
  {
    priority: 'high',
    type: 'marketing',
    unsubscribeUrl: 'https://example.com/unsubscribe',
  }
);
```

---

## 🧪 Testing Your Setup

### Test via Admin UI

1. Go to **Email Accounts**
2. Click **Test** button on any account
3. Enter recipient email
4. Select test options:
   - **Priority:** Normal / High
   - **Email Type:** Transactional / Marketing / Notification
   - **Unsubscribe URL:** (for marketing emails)
5. Choose test method:
   - **Test Direct** - Direct send via account
   - **Test Strapi Service** - Via Strapi email service (tests Email Designer compatibility)

### Test via Code

```javascript
// Test email with all security features
await strapi.plugin('magic-mail').service('account-manager').testAccount(
  accountId,
  'your-email@example.com',
  {
    priority: 'high',
    type: 'marketing',
    unsubscribeUrl: 'https://yoursite.com/unsubscribe',
  }
);
```

### Verify Headers

**To verify security headers are applied:**

**In Gmail:**
1. Open email → Click ⋮ (three dots)
2. "Show original"
3. Look for:
   ```
   X-Mailer: MagicMail/1.0
   X-Priority: 1 (Highest)
   Importance: high
   List-Unsubscribe: <https://...>
   Message-ID: <...>
   DKIM-Signature: ...
   ```

**In Outlook/Microsoft:**
1. Email → File → Properties
2. View "Internet headers"
3. Should show "High Importance" with red exclamation mark

---

## 🔒 Security Compliance

### Email Authentication

| Standard | Status | Description |
|----------|--------|-------------|
| **DKIM** | ✅ | DomainKeys Identified Mail - Signature validation |
| **SPF** | ✅ | Sender Policy Framework - Sender verification |
| **DMARC** | ✅ | Domain-based Authentication - Policy enforcement |
| **TLS 1.2+** | ✅ | Transport Layer Security - Encrypted transmission |
| **AES-256-GCM** | ✅ | Credential encryption at rest |

### Regulatory Compliance

| Regulation | Status | Implementation |
|------------|--------|----------------|
| **GDPR** | ✅ | List-Unsubscribe header for marketing emails |
| **CAN-SPAM** | ✅ | One-click unsubscribe mechanism (RFC 8058) |
| **RFC 5322** | ✅ | Proper email format and headers |
| **RFC 3834** | ✅ | Auto-Submitted header prevents loops |
| **RFC 2156** | ✅ | Priority and Importance headers |

### Security Validation

**Every email is validated for:**
- ✅ Valid recipient email format
- ✅ Non-empty subject line
- ✅ Subject length (warns if > 200 chars)
- ✅ Content presence (text or html required)
- ✅ No `<script>` tags in HTML
- ✅ No `javascript:` protocol in links
- ✅ Spam trigger detection (warns only)

---

## 📈 Analytics & Monitoring

### Dashboard Stats

**Global Stats:**
- Emails sent today (all accounts)
- Total emails sent (lifetime)
- Active accounts count

**Per-Account Stats:**
- Emails sent today
- Total emails sent
- Rate limit usage (visual progress bars)
- Last used timestamp
- Success/failure rate

### Open & Click Tracking

Open tracking adds a 1x1 pixel, click tracking rewrites `<a href>` links to a
redirect. Both are on by default (Settings) and can be disabled per email with
`enableTracking: false` or `skipLinkTracking: true`.

**Public URL.** Tracking URLs are built from the *Tracking base URL* setting,
then `server.url`, then Strapi's `server.absoluteUrl`, plus your REST prefix
(`api.rest.prefix`, default `/api`), e.g.
`https://cms.example.com/api/magic-mail/track/click/...`. In production a
loopback host (`localhost`, `127.0.0.1`, `0.0.0.0`) is never used: without a
public URL, emails are sent **untracked** and one warning is logged.

**What is never tracked.** Authentication and one-time-token links (password
reset, confirmation, magic links, OAuth, any parameter such as `token`,
`loginToken`, `code`, `key`, `signature`, `session`, and long random values),
`mailto:`/`tel:` links, and links above `maxLinksPerEmail`. Emails sent through
the Content API (`/api/magic-mail/send`) get click tracking only for hosts in
`tracking.allowedLinkHosts`, so an API token cannot mint redirects on your
domain to arbitrary sites.

**Privacy and retention.** Open/click events store the IP truncated to /24
(IPv4) or /48 (IPv6) and the user agent (max. 512 characters); no location.
Only Koa's `request.ip` is used, so behind a reverse proxy enable
[`server.proxy`](https://docs.strapi.io/cms/configurations/server) or every
recipient shares the proxy's address. Expired data is deleted every 6 hours.
Your privacy notice should mention open/click tracking.

**Rate limit.** The tracking routes allow 300 requests per minute and IP.
Above that, opens and clicks are no longer recorded, but recipients still get
the pixel and are still redirected; only above 3,000 per minute is a 429
returned.

**Tracking secret.** Tracking hashes are signed with
`MAGIC_MAIL_TRACKING_SECRET`, falling back to `MAGIC_MAIL_ENCRYPTION_KEY`.
Rotating `APP_KEYS` no longer breaks links in sent mails. To rotate the
tracking secret, put the old value in `MAGIC_MAIL_TRACKING_SECRET_PREVIOUS`
(comma-separated) until old mails no longer matter.

```javascript
// config/plugins.js
module.exports = {
  'magic-mail': {
    config: {
      tracking: {
        eventRetentionDays: 90,   // raw open/click events; 0 = keep forever
        linkTtlDays: 180,         // tracked links redirect this long; 0 = forever
        logRetentionDays: 0,      // email logs (with events/links); 0 = keep forever
        maxLinksPerEmail: 100,    // further links stay untracked
        allowedLinkHosts: [],     // e.g. ['example.com'] (subdomains included)
        anonymizeIp: true,
      },
    },
  },
};
```

### Email Logging

Every email is logged with:
- Recipient
- Sender
- Subject
- Account used
- Status (sent/failed)
- Timestamp
- Email type
- Error message (if failed)

Access logs via:
```javascript
const logs = await strapi.entityService.findMany('plugin::magic-mail.email-log', {
  filters: { status: 'sent' },
  sort: { createdAt: 'desc' },
  limit: 100,
});
```

---

## 🔄 Integration with Email Designer

**MagicMail is fully compatible with [strapi-plugin-email-designer-5](https://www.npmjs.com/package/strapi-plugin-email-designer-5)!**

### How It Works

1. Install Email Designer:
   ```bash
   npm install strapi-plugin-email-designer-5
   ```

2. Create email templates in Email Designer

3. Send via template:
   ```javascript
   // Email Designer internally uses strapi.plugin('email').service('email').send()
   // MagicMail automatically intercepts it!
   ```

4. Your email is automatically:
   - ✅ Routed through MagicMail's smart routing
   - ✅ Sent via the best account (based on rules)
   - ✅ Rate limited and failover protected
   - ✅ Logged and tracked

**No configuration needed - it just works!** 🎉

---

## 🚨 Troubleshooting

### Email Not Received

**1. Check Logs**
```bash
# Look for errors in Strapi console
[magic-mail] ❌ Email send failed: ...
```

**2. Check Account Status**
- Is the account marked as "Active"?
- Test the account using the Test button
- Check rate limits haven't been exceeded

**3. Check Spam Folder**
- First emails from new accounts may land in spam
- Check spam/junk folders
- Mark as "Not Spam" to train filters

**4. Verify Credentials**
- SMTP: Username and password correct?
- Gmail: Using App Password (not regular password)?
- OAuth: Tokens may have expired - reconnect

### DMARC Failures

**For Custom Domains:**
1. Set up SPF record:
   ```
   v=spf1 include:_spf.google.com ~all
   ```

2. Set up DKIM:
   - Generate DKIM key pair
   - Add public key to DNS
   - Add private key to MagicMail SMTP config

3. Set up DMARC:
   ```
   v=DMARC1; p=quarantine; rua=mailto:dmarc@yourdomain.com
   ```

**For OAuth Providers (Gmail, Microsoft, Yahoo):**
- ✅ DKIM handled automatically
- ✅ SPF handled automatically
- ✅ DMARC should pass automatically

### Rate Limit Errors

**If you hit rate limits:**
- Increase daily/hourly limits in account settings
- Add more accounts for load balancing
- Set up routing rules to distribute load
- Check provider-specific limits:
  - Gmail: 500/day (free), 2000/day (workspace)
  - SendGrid: Varies by plan
  - Mailgun: Varies by plan

### OAuth Connection Issues

**Gmail OAuth:**
- Ensure Gmail API is enabled
- Check redirect URI matches exactly
- Clear browser cookies and try again

**Microsoft OAuth:**
- Verify all 5 permissions are granted
- **Grant admin consent** (required!)
- Use correct Tenant ID
- Check Client Secret hasn't expired

**Yahoo OAuth:**
- Verify app is approved by Yahoo
- Check API permissions are enabled

---

## 🏗️ Architecture

### Plugin Structure

```
magic-mail/
├── admin/                  # React Admin UI
│   └── src/
│       ├── components/
│       │   ├── AddAccountModal.jsx    # Multi-step account setup
│       │   └── PluginIcon.jsx         # Sidebar icon
│       └── pages/
│           ├── App.jsx                # Main app with tabs
│           ├── HomePage.jsx           # Email accounts page
│           └── RoutingRules.jsx       # Routing rules page
├── server/                # Backend
│   └── src/
│       ├── bootstrap.js              # Overrides Strapi email service
│       ├── controllers/
│       │   ├── accounts.js           # CRUD for accounts
│       │   ├── oauth.js              # OAuth flows
│       │   └── routing-rules.js      # CRUD for routing rules
│       ├── services/
│       │   ├── email-router.js       # Core routing logic
│       │   ├── account-manager.js    # Account management
│       │   └── oauth.js              # OAuth token exchange
│       ├── content-types/
│       │   ├── email-account/        # Account schema
│       │   ├── email-log/            # Email log schema
│       │   └── routing-rule/         # Routing rule schema
│       └── utils/
│           └── encryption.js         # AES-256-GCM encryption
└── package.json
```

### Data Flow

```
Email Request
    ↓
Strapi Email Service (intercepted!)
    ↓
MagicMail Email Router
    ↓
Routing Rules Engine
    ↓
Account Selection (priority/rules)
    ↓
Rate Limit Check
    ↓
Provider-Specific Sender
    ↓
Email Log & Stats Update
    ↓
Response
```

---

## 🎯 Use Cases

### Multi-Tenant SaaS

```javascript
// Each tenant gets their own email account
// Route by custom field:

// Routing Rule:
// Match Type: Custom Field
// Match Value: tenant-123
// Target Account: Tenant 123 Gmail

await strapi.plugin('email').service('email').send({
  to: 'customer@example.com',
  subject: 'Order Confirmation',
  html: '<h1>Order #456</h1>',
  customField: 'tenant-123', // Matches routing rule
});
```

### High-Volume Email Sending

```javascript
// Distribute load across multiple accounts
// Account 1: Priority 10, Limit 500/day
// Account 2: Priority 9, Limit 500/day
// Account 3: Priority 8, Limit 500/day
// → Total: 1500 emails/day with automatic load balancing!
```

### Marketing Campaigns

```javascript
// Route marketing emails via SendGrid
// Routing Rule:
// Match Type: Email Type
// Match Value: marketing
// Target Account: SendGrid Marketing

await strapi.plugin('email').service('email').send({
  to: 'subscriber@example.com',
  subject: 'Weekly Newsletter',
  html: template,
  type: 'marketing',
  unsubscribeUrl: 'https://yoursite.com/unsubscribe?id=123',
});
// ✅ Automatically routes via SendGrid
// ✅ Adds List-Unsubscribe header
// ✅ GDPR/CAN-SPAM compliant
```

### VIP Customer Emails

```javascript
// Route VIP customers via a priority account
// Routing Rule:
// Match Type: Recipient
// Match Value: @vip-domain.com
// Target Account: Priority SMTP
// Fallback Account: Gmail OAuth

await strapi.plugin('email').service('email').send({
  to: 'ceo@vip-domain.com',
  subject: 'Exclusive Offer',
  html: content,
  priority: 'high',
});
// ✅ Routes via Priority SMTP
// ✅ High priority headers added
// ✅ Automatic fallback if the priority account is unavailable
```

---

## 🔌 Email Provider Comparison

| Feature | Gmail OAuth | Microsoft OAuth | Yahoo OAuth | SMTP | SendGrid | Mailgun |
|---------|-------------|-----------------|-------------|------|----------|---------|
| **Auth Method** | OAuth 2.0 | OAuth 2.0 | OAuth 2.0 | Password | API Key | API Key |
| **Free Tier** | 500/day | Varies | Limited | Varies | 100/day | 5000/month |
| **Attachments** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **HTML Emails** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **DKIM Auto** | ✅ | ✅ | ✅ | Optional | ✅ | ✅ |
| **Custom Headers** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Priority Headers** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Security** | Excellent | Excellent | Good | Good | Excellent | Excellent |
| **Deliverability** | Excellent | Excellent | Good | Varies | Excellent | Excellent |
| **Best For** | Personal/Small | Enterprise | Personal | Custom | Marketing | Bulk/Dev |

---

## 🌍 Production Deployment

### Environment Variables

```env
# Base URL (required for OAuth callbacks in production)
URL=https://yourdomain.com

# Database (Strapi default)
DATABASE_CLIENT=postgres
DATABASE_HOST=127.0.0.1
DATABASE_PORT=5432
DATABASE_NAME=strapi
DATABASE_USERNAME=strapi
DATABASE_PASSWORD=password

# Required in production. Keep this stable across deploys and backups.
# Generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
MAGIC_MAIL_ENCRYPTION_KEY=your-generated-secret-with-at-least-32-bytes

# Optional dedicated OAuth-state signing secret. APP_KEYS is used otherwise.
MAGIC_MAIL_OAUTH_STATE_SECRET=your-generated-secret-with-at-least-32-bytes

# Optional dedicated secret for open/click tracking hashes (falls back to
# MAGIC_MAIL_ENCRYPTION_KEY). Previous values, comma-separated, stay valid.
MAGIC_MAIL_TRACKING_SECRET=your-generated-secret-with-at-least-32-bytes
MAGIC_MAIL_TRACKING_SECRET_PREVIOUS=
```

### OAuth Callback URLs

**Update redirect URIs in your OAuth apps:**

**Gmail:**
```
https://yourdomain.com/magic-mail/oauth/gmail/callback
```

**Microsoft:**
```
https://yourdomain.com/magic-mail/oauth/microsoft/callback
```

**Yahoo:**
```
https://yourdomain.com/magic-mail/oauth/yahoo/callback
```

### Recommended Provider Settings

**For Production Apps:**

| Use Case | Recommended Provider | Configuration |
|----------|---------------------|---------------|
| **Transactional** | SendGrid or Mailgun | High daily limit, dedicated IP |
| **Marketing** | SendGrid | List management, analytics |
| **Notifications** | SMTP or Gmail OAuth | Medium limits, reliable |
| **Internal** | Microsoft 365 | Company domain, OAuth |
| **Development** | Mailgun Sandbox | Free testing |

---

## 📚 Advanced Topics

### Custom Routing Logic

Create complex routing rules:

```javascript
// Rule 1: VIP customers via a priority account
{
  name: "VIP Customer Emails",
  matchType: "recipient",
  matchValue: "@vip-customers.com",
  accountName: "Priority SMTP",
  fallbackAccountName: "Gmail OAuth",
  priority: 10,
  isActive: true
}

// Rule 2: Password resets via fast account
{
  name: "Password Reset Emails",
  matchType: "subject",
  matchValue: "Password Reset",
  accountName: "Fast Gmail",
  priority: 9,
  isActive: true
}

// Rule 3: Marketing via SendGrid
{
  name: "Marketing Campaigns",
  matchType: "emailType",
  matchValue: "marketing",
  accountName: "SendGrid Marketing",
  priority: 8,
  isActive: true
}
```

### DKIM Configuration (Advanced)

For custom domains with SMTP:

**1. Generate DKIM Keys:**
```bash
openssl genrsa -out dkim_private.pem 1024
openssl rsa -in dkim_private.pem -pubout -out dkim_public.pem
```

**2. Add to DNS:**
```
default._domainkey.yourdomain.com TXT "v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA..."
```

**3. Add to MagicMail SMTP Account:**
```javascript
// In account config (edit account → credentials):
{
  host: "smtp.yourdomain.com",
  port: 587,
  user: "...",
  pass: "...",
  dkim: {
    domainName: "yourdomain.com",
    keySelector: "default",
    privateKey: "-----BEGIN PRIVATE KEY-----\n..."
  }
}
```

### Rate Limit Strategy

**Best practices for high-volume sending:**

```javascript
// Account Setup:
// Account A: Priority 10, Daily Limit: 500
// Account B: Priority 9, Daily Limit: 500  
// Account C: Priority 8, Daily Limit: 500
// → Total capacity: 1500 emails/day

// MagicMail automatically:
// 1. Uses Account A until limit hit
// 2. Switches to Account B
// 3. Switches to Account C
// 4. All transparent to your code!
```

---

## 🤝 Contributing

We welcome contributions!

**Found a bug?** [Open an issue](https://github.com/Schero94/MagicMail/issues)

**Have a feature idea?** [Start a discussion](https://github.com/Schero94/MagicMail/discussions)

**Want to contribute code?**
1. Fork the repo
2. Create a feature branch
3. Make your changes
4. Submit a pull request

---

##  License

**MIT License**

Copyright © 2025 Schero D.

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

MagicMail is fully free and open source. Every feature is available to everyone
with no license key, tier, activation, or usage limit.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

---

## 🙏 Credits

**Built with:**
- [Strapi v5](https://strapi.io) - Headless CMS
- [Nodemailer](https://nodemailer.com) - SMTP client
- [Heroicons](https://heroicons.com) - Beautiful icons
- [styled-components](https://styled-components.com) - CSS-in-JS

**Inspired by:**
- Professional email requirements
- Multi-tenant application needs
- Developer experience first

---

## 💬 Support

**Need help?**
- 📖 [Documentation](https://github.com/Schero94/Magic-Mail#readme)
- 🐛 [Report Issues](https://github.com/Schero94/Magic-Mail/issues)
- 💡 [Feature Requests](https://github.com/Schero94/Magic-Mail/discussions)


---

## ⭐ Show Your Support

If MagicMail helps your project, please:
- ⭐ Star the repo on [GitHub](https://github.com/Schero94/Magic-Mail)
- 📢 Share with your team
- 🐦 Tweet about it

---

## Dependency audits

Run `npm audit` from the Strapi project root to check the complete installed dependency tree. npm applies dependency overrides from the root project manifest, not from this plugin's manifest.

---

**Made for the Strapi Community**

**MagicMail - Because email management should be magical, not painful.**
