# 📧 MagicMail - Email Business Suite for Strapi v5

> **Enterprise-grade multi-account email management with smart routing, OAuth 2.0 support, and complete security compliance**

[![NPM Version](https://img.shields.io/npm/v/strapi-plugin-magic-mail.svg)](https://www.npmjs.com/package/strapi-plugin-magic-mail)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Strapi Version](https://img.shields.io/badge/Strapi-v5.30.1-blue.svg)](https://strapi.io)

---

## 🌟 Why MagicMail?

**Stop fighting with .env files and email configuration!** MagicMail brings enterprise email management to Strapi v5 with:

- ✅ **6 Email Providers** - Gmail, Microsoft 365, Yahoo, SMTP, SendGrid, Mailgun
- ✅ **OAuth 2.0 Authentication** - No passwords needed for Gmail, Microsoft, Yahoo
- ✅ **Smart Routing Rules** - Route emails by type, recipient, subject, or custom conditions
- ✅ **Automatic Failover** - Never lose an email when rate limits hit
- ✅ **Beautiful Admin UI** - Manage everything from Strapi Admin Panel
- ✅ **Zero Configuration** - No .env files, everything in the database
- ✅ **Email Designer Compatible** - Works seamlessly with strapi-plugin-email-designer-5
- ✅ **GDPR/CAN-SPAM Compliant** - Built-in List-Unsubscribe headers
- ✅ **Enterprise Security** - TLS 1.2+, DKIM, SPF, DMARC validation

---

## 📸 Screenshots

### Email Accounts Dashboard
![Email Accounts](pics/email-accounts-dashboard.png)
*Manage unlimited email accounts with live stats and real-time monitoring*

### Routing Rules
![Routing Rules](pics/routing-rules.png)
*Define intelligent routing rules based on email type, recipient, subject*

### Account Setup - OAuth
![OAuth Setup](pics/oauth-setup.png)
*Connect Gmail, Microsoft 365, or Yahoo with secure OAuth 2.0*

---

## 🚀 Quick Start

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

**Benefits:**
- ✅ **Zero code changes** - Existing plugins work automatically
- ✅ **Email Designer compatible** - Works with strapi-plugin-email-designer-5
- ✅ **Fallback safe** - Falls back to original email service if MagicMail fails
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
      path: './uploads/invoice-12345.pdf',
    },
    {
      filename: 'receipt.pdf',
      content: Buffer.from(pdfData),
      contentType: 'application/pdf',
    },
  ],
});
```

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

| Feature | FREE | PREMIUM | ADVANCED | ENTERPRISE |
|---------|------|---------|----------|------------|
| **Visual Designer** | ✅ (3 templates) | ✅ (10 templates) | ✅ (Unlimited) | ✅ (Unlimited) |
| **Drag & Drop Editor** | ✅ | ✅ | ✅ | ✅ |
| **Mustache Variables** | ✅ | ✅ | ✅ | ✅ |
| **Template Versioning** | ❌ | ❌ | ✅ | ✅ |
| **Import/Export** | ❌ | ❌ | ✅ | ✅ |
| **Custom Blocks** | ❌ | ❌ | ❌ | ✅ |
| **Team Library** | ❌ | ❌ | ❌ | ✅ |
| **A/B Testing** | ❌ | ❌ | ❌ | ✅ |

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

### 🔄 Template Versioning (ADVANCED+)

Every time you save a template, a new version is created automatically:

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

### 📦 Import/Export Templates (ADVANCED+)

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
//   maxTemplates: 3,  // FREE tier limit
//   remaining: 0      // Upgrade needed!
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
// ADVANCED+: Keep version history
// Automatically enabled for ADVANCED and ENTERPRISE licenses
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

**2. Route VIP Customers via Premium SMTP:**
```
Match Type: Recipient
Match Value: @vip-customers.com
Target Account: Premium SMTP
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

Rules are evaluated from **highest to lowest priority** (1-10):
- Priority 10 = Evaluated first (most specific rules)
- Priority 1 = Evaluated last (catch-all rules)

If no rule matches, the **Primary Account** is used.

---

## 🔐 Provider Setup Guides

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
- ✅ **AES-256-GCM** encryption for all credentials
- ✅ **No plain text passwords** in database
- ✅ **OAuth tokens encrypted** at rest
- ✅ **Secure token refresh** mechanism

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
# Optional - Base URL for OAuth callbacks
URL=https://yourdomain.com

# Optional - Encryption key (auto-generated if not provided)
ENCRYPTION_KEY=your-32-character-secret-key
```

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
      path: './path/to/file.pdf',
      contentType: 'application/pdf',
    },
  ],
});
```

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
// Route VIP customers via premium account
// Routing Rule:
// Match Type: Recipient
// Match Value: @vip-domain.com
// Target Account: Premium SMTP
// Fallback Account: Gmail OAuth

await strapi.plugin('email').service('email').send({
  to: 'ceo@vip-domain.com',
  subject: 'Exclusive Offer',
  html: content,
  priority: 'high',
});
// ✅ Routes via Premium SMTP
// ✅ High priority headers added
// ✅ Automatic fallback if premium account unavailable
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

# Optional - Custom encryption key
ENCRYPTION_KEY=your-32-byte-secret-key-here
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
// Rule 1: VIP customers via premium account
{
  name: "VIP Customer Emails",
  matchType: "recipient",
  matchValue: "@vip-customers.com",
  accountName: "Premium SMTP",
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

## 📝 Changelog

### v1.0.0 (2025-11-13)

**Initial Release** 🎉

**Features:**
- ✅ 6 Email Providers (Gmail, Microsoft, Yahoo OAuth + SMTP, SendGrid, Mailgun)
- ✅ OAuth 2.0 Support (Gmail, Microsoft 365, Yahoo Mail)
- ✅ Smart Routing Rules Engine
- ✅ Automatic Failover & Rate Limiting
- ✅ Beautiful Admin UI with Heroicons
- ✅ Email Analytics Dashboard
- ✅ Strapi Email Service Override (Email Designer compatible)
- ✅ Comprehensive Security (TLS 1.2+, DKIM, SPF, DMARC)
- ✅ GDPR/CAN-SPAM Compliance
- ✅ Test Features (Direct & Strapi Service)
- ✅ Encrypted Credential Storage (AES-256-GCM)
- ✅ Attachment Support (all providers)
- ✅ Priority Email Headers
- ✅ List-Unsubscribe Headers
- ✅ Security Validation
- ✅ Hourly/Daily Counter Resets

---

## 📄 License

**MIT License**

Copyright © 2025 Schero D.

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

---

## 🙏 Credits

**Built with:**
- [Strapi v5](https://strapi.io) - Headless CMS
- [Nodemailer](https://nodemailer.com) - SMTP client
- [Heroicons](https://heroicons.com) - Beautiful icons
- [styled-components](https://styled-components.com) - CSS-in-JS

**Inspired by:**
- Enterprise email requirements
- Multi-tenant application needs
- Developer experience first

---

## 💬 Support

**Need help?**
- 📖 [Documentation](https://github.com/Schero94/MagicMail#readme)
- 🐛 [Report Issues](https://github.com/Schero94/MagicMail/issues)
- 💡 [Feature Requests](https://github.com/Schero94/MagicMail/discussions)
- 📧 [Email Support](mailto:support@magicmail.dev)

---

## ⭐ Show Your Support

If MagicMail helps your project, please:
- ⭐ Star the repo on [GitHub](https://github.com/Schero94/MagicMail)
- 📢 Share with your team
- 🐦 Tweet about it
- ☕ [Buy me a coffee](https://www.buymeacoffee.com/schero)

---

**Made with ❤️ for the Strapi Community**

**MagicMail - Because email management should be magical, not painful.** ✨
