'use strict';

const nodemailer = require('nodemailer');
const { decryptCredentials } = require('../utils/encryption');

/**
 * Email Router Service
 * Smart routing of emails to appropriate accounts
 * Handles failover, rate limiting, and load balancing
 */

module.exports = ({ strapi }) => ({
  /**
   * Send email with smart routing
   * @param {Object} emailData - { to, from, subject, text, html, attachments, type, priority, templateId, templateData OR data }
   * @returns {Promise<Object>} Send result
   */
  async send(emailData) {
    let {
      to,
      from,
      subject,
      text,
      html,
      replyTo,
      attachments = [],       // Array of attachment objects
      type = 'transactional', // transactional, marketing, notification
      priority = 'normal',    // high, normal, low
      accountName = null,     // Force specific account
      templateId = null,      // Template Reference ID
      templateData,           // Data for template rendering
      data,                   // Alias for templateData (for native Strapi compatibility)
      skipLinkTracking = false, // Skip link rewriting for sensitive URLs (e.g., Magic Links)
    } = emailData;

    // Support both 'data' and 'templateData' for backward compatibility
    if (!templateData && data) {
      templateData = data;
    }

    // Validate required fields
    if (!to || (typeof to === 'string' && to.trim().length === 0)) {
      throw new Error('Recipient email address (to) is required');
    }

    // Normalize email addresses (RFC 5321: domain part is case-insensitive)
    const normalizeAddr = (addr) => {
      if (!addr) return addr;
      if (typeof addr === 'string') {
        // Handle display name format: "John <john@example.com>"
        if (addr.includes('<') && addr.includes('>')) {
          return addr.replace(/<([^>]+)>/, (_, email) => `<${email.trim().toLowerCase()}>`);
        }
        return addr.trim().toLowerCase();
      }
      return addr;
    };

    const normalizeAddrs = (val) => {
      if (!val) return val;
      if (Array.isArray(val)) {
        return val.map(a => normalizeAddr(a));
      }
      if (typeof val === 'string' && val.includes(',')) {
        return val.split(',').map(a => normalizeAddr(a)).join(', ');
      }
      return normalizeAddr(val);
    };

    to = normalizeAddrs(to);
    from = normalizeAddr(from);
    replyTo = normalizeAddr(replyTo);

    // Sync back to emailData so all downstream methods get normalized values
    emailData.to = to;
    emailData.from = from;
    emailData.replyTo = replyTo;
    if (emailData.cc) emailData.cc = normalizeAddrs(emailData.cc);
    if (emailData.bcc) emailData.bcc = normalizeAddrs(emailData.bcc);

    // Debug log for skipLinkTracking
    if (skipLinkTracking) {
      strapi.log.info(`[magic-mail] [SKIP-TRACK] skipLinkTracking=true received for email to: ${to}`);
    }

    // NEW: If templateId/templateReferenceId provided, render template
    let renderedTemplate = null;
    if (templateId || emailData.templateReferenceId) {
      try {
        let resolvedTemplateReferenceId = null;
        let templateRecord = null;

        if (emailData.templateReferenceId) {
          resolvedTemplateReferenceId = String(emailData.templateReferenceId).trim();
          strapi.log.info(`[magic-mail] [TEMPLATE] Using provided templateReferenceId="${resolvedTemplateReferenceId}"`);
        }

        if (!resolvedTemplateReferenceId && templateId) {
          const numericTemplateId = Number(templateId);

          if (!Number.isNaN(numericTemplateId) && Number.isInteger(numericTemplateId)) {
            strapi.log.info(`[magic-mail] [CHECK] Looking up template by ID: ${numericTemplateId}`);
            templateRecord = await strapi
              .plugin('magic-mail')
              .service('email-designer')
              .findOne(numericTemplateId);

            if (!templateRecord) {
              strapi.log.error(`[magic-mail] [ERROR] Template with ID ${numericTemplateId} not found in database`);
              throw new Error(`Template with ID ${numericTemplateId} not found`);
            }

            if (!templateRecord.templateReferenceId) {
              throw new Error(`Template ${numericTemplateId} has no reference ID set`);
            }

            resolvedTemplateReferenceId = String(templateRecord.templateReferenceId).trim();
            strapi.log.info(
              `[magic-mail] [SUCCESS] Found template: ID=${templateRecord.id}, referenceId="${resolvedTemplateReferenceId}", name="${templateRecord.name}"`
            );
          } else {
            // templateId was provided but not numeric; treat it directly as reference ID
            resolvedTemplateReferenceId = String(templateId).trim();
            strapi.log.info(`[magic-mail] [TEMPLATE] Treating templateId value as referenceId="${resolvedTemplateReferenceId}"`);
          }
        }

        if (!resolvedTemplateReferenceId) {
          throw new Error('No template reference ID could be resolved');
        }

        // Now render using the templateReferenceId
        renderedTemplate = await strapi
          .plugin('magic-mail')
          .service('email-designer')
          .renderTemplate(resolvedTemplateReferenceId, templateData || {});

        // Override with rendered content
        html = renderedTemplate.html;
        text = renderedTemplate.text;
        subject = subject || renderedTemplate.subject; // Use provided subject or template subject
        type = type || renderedTemplate.category; // Use template category if not specified

        strapi.log.info(
          `[magic-mail] [EMAIL] Rendered template reference "${resolvedTemplateReferenceId}" (requested ID: ${templateId ?? 'n/a'}): ${renderedTemplate.templateName}`
        );

        // Ensure templateId/templateName are populated for logging/analytics
        emailData.templateReferenceId = resolvedTemplateReferenceId;
        if (!emailData.templateName) {
          emailData.templateName = templateRecord?.name || renderedTemplate.templateName;
        }
      } catch (error) {
        strapi.log.error(`[magic-mail] [ERROR] Template rendering failed: ${error.message}`);
        throw new Error(`Template rendering failed: ${error.message}`);
      }
    }

    // NEW: Email Tracking - Create log & inject tracking
    let emailLog = null;
    let recipientHash = null;
    const enableTracking = emailData.enableTracking !== false; // Enabled by default

    if (enableTracking && html) {
      try {
        const analyticsService = strapi.plugin('magic-mail').service('analytics');
        const settingsService = strapi.plugin('magic-mail').service('plugin-settings');
        
        // Get global plugin settings
        const pluginSettings = await settingsService.getSettings();
        const globalLinkTrackingEnabled = pluginSettings.enableLinkTracking !== false;
        const globalOpenTrackingEnabled = pluginSettings.enableOpenTracking !== false;
        
        // Create email log entry
        emailLog = await analyticsService.createEmailLog({
          to,
          userId: emailData.userId || null,
          recipientName: emailData.recipientName || null,
          subject,
          // Use provided templateId/Name OR from renderedTemplate (if template was rendered here)
          templateId: emailData.templateId || renderedTemplate?.templateReferenceId || null,
          templateName: emailData.templateName || renderedTemplate?.templateName || null,
          accountId: null, // Will be set after account selection
          accountName: null,
          metadata: {
            type,
            priority,
            hasAttachments: attachments.length > 0,
          },
        });

        recipientHash = analyticsService.generateRecipientHash(emailLog.emailId, to);

        // Inject tracking pixel (open tracking) - only if globally enabled
        if (globalOpenTrackingEnabled) {
          html = analyticsService.injectTrackingPixel(html, emailLog.emailId, recipientHash);
        } else {
          strapi.log.info(`[magic-mail] [STATS] Open tracking DISABLED globally`);
        }

        // Rewrite links for click tracking (unless explicitly disabled OR globally disabled)
        // skipLinkTracking is useful for sensitive URLs like Magic Links, password resets, etc.
        // where the original URL must remain intact for security/UX reasons
        // Priority: per-email skipLinkTracking > global enableLinkTracking setting
        const shouldTrackLinks = globalLinkTrackingEnabled && !skipLinkTracking;
        
        if (shouldTrackLinks) {
          html = await analyticsService.rewriteLinksForTracking(html, emailLog.emailId, recipientHash);
          strapi.log.info(`[magic-mail] [STATS] Link tracking enabled for email: ${emailLog.emailId}`);
        } else if (!globalLinkTrackingEnabled) {
          strapi.log.info(`[magic-mail] [STATS] Link tracking DISABLED globally for email: ${emailLog.emailId}`);
        } else {
          strapi.log.info(`[magic-mail] [STATS] Link tracking DISABLED per-email (skipLinkTracking=true) for email: ${emailLog.emailId}`);
        }
      } catch (error) {
        strapi.log.error(`[magic-mail] [WARNING]  Tracking setup failed (continuing without tracking):`, error.message);
        // Continue sending email even if tracking fails
      }
    }

    // Update email data with tracked HTML
    emailData.html = html;
    emailData.text = text;
    emailData.subject = subject;

    // Get the matching routing rule to check for WhatsApp fallback
    let matchedRule = null;
    try {
      const allRules = await strapi.documents('plugin::magic-mail.routing-rule').findMany({
        filters: { isActive: true },
        sort: [{ priority: 'desc' }],
      });
      
      for (const rule of allRules) {
        let matches = false;
        switch (rule.matchType) {
          case 'emailType': matches = rule.matchValue === type; break;
          case 'recipient': matches = to && to.toLowerCase().includes(rule.matchValue.toLowerCase()); break;
          case 'subject': matches = subject && subject.toLowerCase().includes(rule.matchValue.toLowerCase()); break;
          case 'template': matches = emailData.template && emailData.template === rule.matchValue; break;
          case 'custom': matches = emailData.customField && emailData.customField === rule.matchValue; break;
        }
        if (matches) {
          matchedRule = rule;
          break;
        }
      }
    } catch (ruleError) {
      strapi.log.warn('[magic-mail] [WARNING] Failed to check routing rules for WhatsApp fallback:', ruleError.message);
    }

    try {
      // License check for premium features
      const licenseGuard = strapi.plugin('magic-mail').service('license-guard');
      
      // Check if priority headers are allowed (Advanced+)
      if (priority === 'high') {
        const hasFeature = await licenseGuard.hasFeature('priority-headers');
        if (!hasFeature) {
          strapi.log.warn('[magic-mail] [WARNING]  High priority emails require Advanced license - using normal priority');
          emailData.priority = 'normal';
        }
      }

      // Get account to use
      const account = accountName
        ? await this.getAccountByName(accountName)
        : await this.selectAccount(type, priority, [], emailData);

      if (!account) {
        throw new Error('No email account available');
      }

      // Check if account's provider is allowed by license
      const providerAllowed = await licenseGuard.isProviderAllowed(account.provider);
      if (!providerAllowed) {
        throw new Error(`Provider "${account.provider}" requires a higher license tier. Please upgrade or use a different account.`);
      }

      // Check rate limits
      const canSend = await this.checkRateLimits(account);
      if (!canSend) {
        // Try failover - pass documentId to exclude current account
        const fallbackAccount = await this.selectAccount(type, priority, [account.documentId], emailData);
        if (fallbackAccount) {
          strapi.log.info(`[magic-mail] Rate limit hit on ${account.name}, using fallback: ${fallbackAccount.name}`);
          return await this.sendViaAccount(fallbackAccount, emailData);
        }
        throw new Error(`Rate limit exceeded on ${account.name} and no fallback available`);
      }

      // Send via selected account
      const result = await this.sendViaAccount(account, emailData);

      // Update email log with account info (if tracking enabled)
      if (emailLog) {
        try {
          await strapi.documents('plugin::magic-mail.email-log').update({
            documentId: emailLog.documentId,
            data: {
              accountId: account.documentId,
              accountName: account.name,
              deliveredAt: new Date(),
            },
          });
        } catch (error) {
          strapi.log.error('[magic-mail] Failed to update email log:', error.message);
        }
      }

      // Update stats
      await this.updateAccountStats(account.documentId);

      strapi.log.info(`[magic-mail] [SUCCESS] Email sent to ${to} via ${account.name}`);

      return {
        success: true,
        accountUsed: account.name,
        messageId: result.messageId,
      };
    } catch (error) {
      strapi.log.error('[magic-mail] [ERROR] Email send failed:', error);

      // Check if WhatsApp fallback is enabled for this rule
      if (matchedRule?.whatsappFallback) {
        strapi.log.info('[magic-mail] [FALLBACK] Email failed, attempting WhatsApp fallback...');
        
        try {
          const whatsapp = strapi.plugin('magic-mail').service('whatsapp');
          const whatsappStatus = whatsapp.getStatus();
          
          if (whatsappStatus.isConnected) {
            // Get phone number from email data or rule config
            const phoneNumber = emailData.phoneNumber || emailData.whatsappPhone;
            
            if (phoneNumber) {
              // Create a text-only message from the email content
              const whatsappMessage = `*${subject}*\n\n${text || 'Email delivery failed. Please check your email settings.'}`;
              
              const waResult = await whatsapp.sendMessage(phoneNumber, whatsappMessage);
              
              if (waResult.success) {
                strapi.log.info(`[magic-mail] [SUCCESS] WhatsApp fallback sent to ${phoneNumber}`);
                return {
                  success: true,
                  fallbackUsed: 'whatsapp',
                  phoneNumber: phoneNumber,
                };
              } else {
                strapi.log.warn('[magic-mail] [WARNING] WhatsApp fallback failed:', waResult.error);
              }
            } else {
              strapi.log.warn('[magic-mail] [WARNING] WhatsApp fallback enabled but no phone number provided');
            }
          } else {
            strapi.log.warn('[magic-mail] [WARNING] WhatsApp fallback enabled but WhatsApp not connected');
          }
        } catch (waError) {
          strapi.log.error('[magic-mail] [ERROR] WhatsApp fallback error:', waError.message);
        }
      }

      throw error;
    }
  },

  /**
   * Select best account based on rules
   * @param {string} type - Email type (transactional, marketing, notification)
   * @param {string} priority - Priority level (high, normal, low)
   * @param {Array<string>} excludeDocumentIds - Array of documentIds to exclude from selection
   * @param {Object} emailData - Email data for routing rule matching
   * @returns {Promise<Object|null>} Selected account or null
   */
  async selectAccount(type, priority, excludeDocumentIds = [], emailData = {}) {
    // Build filters - only add documentId exclusion if array has entries
    const filters = { isActive: true };
    if (excludeDocumentIds.length > 0) {
      filters.documentId = { $notIn: excludeDocumentIds };
    }

    // Get all active accounts using Document Service
    const accounts = await strapi.documents('plugin::magic-mail.email-account').findMany({
      filters,
      sort: [{ priority: 'desc' }],
    });

    if (!accounts || accounts.length === 0) {
      return null;
    }

    // Get all active routing rules using Document Service
    const allRules = await strapi.documents('plugin::magic-mail.routing-rule').findMany({
      filters: {
        isActive: true,
      },
      sort: [{ priority: 'desc' }],
    });

    // Check routing rules with different match types
    for (const rule of allRules) {
      let matches = false;

      switch (rule.matchType) {
        case 'emailType':
          matches = rule.matchValue === type;
          break;
        
        case 'recipient':
          // Match if recipient email contains the match value
          matches = emailData.to && emailData.to.toLowerCase().includes(rule.matchValue.toLowerCase());
          break;
        
        case 'subject':
          // Match if subject contains the match value
          matches = emailData.subject && emailData.subject.toLowerCase().includes(rule.matchValue.toLowerCase());
          break;
        
        case 'template':
          // Match if template name equals match value
          matches = emailData.template && emailData.template === rule.matchValue;
          break;
        
        case 'custom':
          // Custom matching - evaluate matchValue as a condition
          // For now, just exact match on a custom field
          matches = emailData.customField && emailData.customField === rule.matchValue;
          break;
      }

      if (matches) {
        const account = accounts.find(a => a.name.toLowerCase() === rule.accountName.toLowerCase());
        if (account) {
          strapi.log.info(`[magic-mail] [ROUTE] Routing rule matched: ${rule.name} -> ${account.name}`);
          return account;
        }
        // If primary account not found, try fallback
        if (rule.fallbackAccountName) {
          const fallbackAccount = accounts.find(a => a.name === rule.fallbackAccountName);
          if (fallbackAccount) {
            strapi.log.info(`[magic-mail] [FALLBACK] Using fallback account: ${fallbackAccount.name}`);
            return fallbackAccount;
          }
        }
      }
    }

    // Fallback: Use primary or first active account
    const primaryAccount = accounts.find(a => a.isPrimary);
    return primaryAccount || accounts[0];
  },

  /**
   * Send email via specific account
   */
  async sendViaAccount(account, emailData) {
    const { to, subject, text, html, replyTo, attachments } = emailData;

    if (account.provider === 'gmail-oauth') {
      return await this.sendViaGmailOAuth(account, emailData);
    } else if (account.provider === 'microsoft-oauth') {
      return await this.sendViaMicrosoftOAuth(account, emailData);
    } else if (account.provider === 'yahoo-oauth') {
      return await this.sendViaYahooOAuth(account, emailData);
    } else if (account.provider === 'nodemailer' || account.provider === 'smtp') {
      return await this.sendViaSMTP(account, emailData);
    } else if (account.provider === 'sendgrid') {
      return await this.sendViaSendGrid(account, emailData);
    } else if (account.provider === 'mailgun') {
      return await this.sendViaMailgun(account, emailData);
    }

    throw new Error(`Unsupported provider: ${account.provider}`);
  },

  /**
   * Send via SMTP (Nodemailer)
   * With enhanced security: DKIM, proper headers, TLS enforcement
   */
  async sendViaSMTP(account, emailData) {
    const config = decryptCredentials(account.config);

    // Enhanced SMTP configuration with security features
    const transportConfig = {
      host: config.host,
      port: config.port || 587,
      secure: config.secure || false,
      auth: {
        user: config.user,
        pass: config.pass,
      },
      // Security enhancements
      requireTLS: true, // Enforce TLS encryption
      tls: {
        rejectUnauthorized: true, // Verify server certificates
        minVersion: 'TLSv1.2', // Minimum TLS 1.2
      },
    };

    // Add DKIM signing if configured
    if (config.dkim) {
      transportConfig.dkim = {
        domainName: config.dkim.domainName,
        keySelector: config.dkim.keySelector,
        privateKey: config.dkim.privateKey,
      };
      strapi.log.info('[magic-mail] DKIM signing enabled');
    }

    const transporter = nodemailer.createTransport(transportConfig);

    // Build mail options with comprehensive security headers
    const mailOptions = {
      from: emailData.from || `${account.fromName || 'MagicMail'} <${account.fromEmail}>`,
      to: emailData.to,
      replyTo: emailData.replyTo || account.replyTo,
      subject: emailData.subject,
      text: emailData.text,
      html: emailData.html,
      attachments: emailData.attachments || [],
      
      // RFC 5322 required headers
      date: new Date(),
      messageId: `<${Date.now()}.${Math.random().toString(36).substring(7)}@${account.fromEmail.split('@')[1]}>`,
      
      // Security and deliverability headers (2025 standards)
      headers: {
        // Client identification (RFC 5321)
        'X-Mailer': 'MagicMail/1.0',
        
        // Priority headers (RFC 2156)
        'X-Priority': emailData.priority === 'high' ? '1 (Highest)' : '3 (Normal)',
        'Importance': emailData.priority === 'high' ? 'high' : 'normal',
        
        // Email type classification
        'X-Email-Type': emailData.type || 'transactional',
        
        // Auto-submitted header (RFC 3834) - prevents auto-responders from replying
        'Auto-Submitted': emailData.type === 'notification' ? 'auto-generated' : 'no',
        
        // Content security (prevents MIME sniffing attacks)
        'X-Content-Type-Options': 'nosniff',
        
        // Tracking and reference
        'X-Entity-Ref-ID': `magicmail-${Date.now()}`,
        
        // Sender policy (helps with SPF validation)
        'Sender': account.fromEmail,
        
        // Content transfer encoding recommendation
        'Content-Transfer-Encoding': '8bit',
      },
      
      // Encoding (UTF-8 for international characters)
      encoding: 'utf-8',
      
      // Text encoding for proper character handling
      textEncoding: 'base64',
    };

    // Add List-Unsubscribe header for marketing emails (RFC 8058 - GDPR/CAN-SPAM)
    if (emailData.type === 'marketing') {
      if (emailData.unsubscribeUrl) {
        mailOptions.headers['List-Unsubscribe'] = `<${emailData.unsubscribeUrl}>`;
        mailOptions.headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
        mailOptions.headers['Precedence'] = 'bulk'; // Mark as bulk mail
      } else {
        strapi.log.warn('[magic-mail] [WARNING] Marketing email without unsubscribe URL - may violate GDPR/CAN-SPAM');
      }
    }

    // Add custom headers if provided
    if (emailData.headers && typeof emailData.headers === 'object') {
      Object.assign(mailOptions.headers, emailData.headers);
    }

    if (mailOptions.attachments.length > 0) {
      strapi.log.info(`[magic-mail] Sending email with ${mailOptions.attachments.length} attachment(s)`);
    }

    return await transporter.sendMail(mailOptions);
  },

  /**
   * Send via Gmail OAuth
   * With enhanced security headers and proper formatting
   */
  async sendViaGmailOAuth(account, emailData) {
    // Check if OAuth tokens are available
    if (!account.oauth) {
      throw new Error('Gmail OAuth account not fully configured. Please complete the OAuth flow first.');
    }

    const oauth = decryptCredentials(account.oauth);
    const config = decryptCredentials(account.config);

    strapi.log.info(`[magic-mail] Sending via Gmail OAuth for account: ${account.name}`);
    strapi.log.info(`[magic-mail] Has oauth.email: ${!!oauth.email} (${oauth.email || 'none'})`);
    strapi.log.info(`[magic-mail] Has oauth.accessToken: ${!!oauth.accessToken}`);
    strapi.log.info(`[magic-mail] Has config.clientId: ${!!config.clientId}`);

    if (!oauth.email || !oauth.accessToken) {
      throw new Error('Missing OAuth credentials. Please re-authenticate this account.');
    }

    if (!config.clientId || !config.clientSecret) {
      throw new Error('Missing OAuth client credentials.');
    }

    // Validate email content for security
    this.validateEmailSecurity(emailData);

    // Check if token is expired and refresh if needed
    let currentAccessToken = oauth.accessToken;
    
    if (oauth.expiresAt && new Date(oauth.expiresAt) < new Date()) {
      strapi.log.info('[magic-mail] Access token expired, refreshing...');
      
      if (!oauth.refreshToken) {
        throw new Error('Access token expired and no refresh token available. Please re-authenticate.');
      }

      try {
        const oauthService = strapi.plugin('magic-mail').service('oauth');
        const newTokens = await oauthService.refreshGmailTokens(
          oauth.refreshToken,
          config.clientId,
          config.clientSecret
        );
        
        currentAccessToken = newTokens.accessToken;
        strapi.log.info('[magic-mail] [SUCCESS] Token refreshed successfully');
        
        // Update stored tokens
        const { encryptCredentials } = require('../utils/encryption');
        const updatedOAuth = encryptCredentials({
          ...oauth,
          accessToken: newTokens.accessToken,
          expiresAt: newTokens.expiresAt,
        });
        
        await strapi.documents('plugin::magic-mail.email-account').update({
          documentId: account.documentId,
          data: { oauth: updatedOAuth },
        });
      } catch (refreshErr) {
        strapi.log.error('[magic-mail] Token refresh failed:', refreshErr);
        throw new Error('Access token expired and refresh failed. Please re-authenticate this account.');
      }
    }

    // Use Gmail API directly instead of SMTP with OAuth
    strapi.log.info('[magic-mail] Using Gmail API to send email...');
    
    try {
      // Create email in RFC 2822 format with MIME multipart for attachments
      const boundary = `----=_Part_${Date.now()}`;
      const attachments = emailData.attachments || [];
      
      let emailContent = '';
      
      if (attachments.length > 0) {
        // Multipart email with attachments
        const emailLines = [
          `From: ${account.fromName ? `"${account.fromName}" ` : ''}<${account.fromEmail}>`,
          `To: ${emailData.to}`,
          `Subject: ${emailData.subject}`,
          `Date: ${new Date().toUTCString()}`,
          `Message-ID: <${Date.now()}.${Math.random().toString(36).substring(7)}@${account.fromEmail.split('@')[1]}>`,
          'MIME-Version: 1.0',
          `Content-Type: multipart/mixed; boundary="${boundary}"`,
          'X-Mailer: MagicMail/1.0',
        ];

        // Add priority headers if high priority
        if (emailData.priority === 'high') {
          emailLines.push('X-Priority: 1 (Highest)');
          emailLines.push('Importance: high');
        }

        // Add List-Unsubscribe for marketing emails
        if (emailData.type === 'marketing' && emailData.unsubscribeUrl) {
          emailLines.push(`List-Unsubscribe: <${emailData.unsubscribeUrl}>`);
          emailLines.push('List-Unsubscribe-Post: List-Unsubscribe=One-Click');
        }

        emailLines.push('');
        emailLines.push(`--${boundary}`);
        emailLines.push('Content-Type: text/html; charset=utf-8');
        emailLines.push('');
        emailLines.push(emailData.html || emailData.text || '');
        
        // Add each attachment
        const fs = require('fs');
        const path = require('path');
        
        for (const attachment of attachments) {
          emailLines.push(`--${boundary}`);
          
          let fileContent;
          let filename;
          let contentType = attachment.contentType || 'application/octet-stream';
          
          if (attachment.content) {
            // Content provided as buffer or string
            fileContent = Buffer.isBuffer(attachment.content) 
              ? attachment.content 
              : Buffer.from(attachment.content);
            filename = attachment.filename || 'attachment';
          } else if (attachment.path) {
            // Read from file path
            fileContent = fs.readFileSync(attachment.path);
            filename = attachment.filename || path.basename(attachment.path);
            
            // Detect content type if not provided
            if (!attachment.contentType) {
              const ext = path.extname(filename).toLowerCase();
              const types = {
                '.pdf': 'application/pdf',
                '.png': 'image/png',
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.gif': 'image/gif',
                '.txt': 'text/plain',
                '.csv': 'text/csv',
                '.doc': 'application/msword',
                '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                '.xls': 'application/vnd.ms-excel',
                '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              };
              contentType = types[ext] || 'application/octet-stream';
            }
          } else {
            continue; // Skip invalid attachment
          }
          
          emailLines.push(`Content-Type: ${contentType}; name="${filename}"`);
          emailLines.push(`Content-Disposition: attachment; filename="${filename}"`);
          emailLines.push('Content-Transfer-Encoding: base64');
          emailLines.push('');
          emailLines.push(fileContent.toString('base64'));
        }
        
        emailLines.push(`--${boundary}--`);
        emailContent = emailLines.join('\r\n');
        
        strapi.log.info(`[magic-mail] Email with ${attachments.length} attachment(s) prepared`);
      } else {
        // Simple email without attachments
        const emailLines = [
          `From: ${account.fromName ? `"${account.fromName}" ` : ''}<${account.fromEmail}>`,
          `To: ${emailData.to}`,
          `Subject: ${emailData.subject}`,
          `Date: ${new Date().toUTCString()}`,
          `Message-ID: <${Date.now()}.${Math.random().toString(36).substring(7)}@${account.fromEmail.split('@')[1]}>`,
          'MIME-Version: 1.0',
          'Content-Type: text/html; charset=utf-8',
          'X-Mailer: MagicMail/1.0',
        ];

        // Add priority headers if high priority
        if (emailData.priority === 'high') {
          emailLines.push('X-Priority: 1 (Highest)');
          emailLines.push('Importance: high');
        }

        // Add List-Unsubscribe for marketing emails
        if (emailData.type === 'marketing' && emailData.unsubscribeUrl) {
          emailLines.push(`List-Unsubscribe: <${emailData.unsubscribeUrl}>`);
          emailLines.push('List-Unsubscribe-Post: List-Unsubscribe=One-Click');
        }

        emailLines.push('');
        emailLines.push(emailData.html || emailData.text || '');
        
        emailContent = emailLines.join('\r\n');
      }
      
      const encodedEmail = Buffer.from(emailContent)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
      
      // Send via Gmail API
      const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${currentAccessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          raw: encodedEmail,
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        strapi.log.error('[magic-mail] Gmail API error:', errorData);
        throw new Error(`Gmail API error: ${errorData.error?.message || response.statusText}`);
      }
      
      const result = await response.json();
      strapi.log.info('[magic-mail] [SUCCESS] Email sent via Gmail API');
      
      return {
        messageId: result.id,
        response: 'OK',
      };
    } catch (err) {
      strapi.log.error('[magic-mail] Gmail API send failed:', err.message || err);
      strapi.log.error('[magic-mail] Error details:', {
        name: err.name,
        code: err.code,
        cause: err.cause?.message || err.cause,
        stack: err.stack?.split('\n').slice(0, 3).join('\n'),
      });
      throw err;
    }
  },

  /**
   * Send via Microsoft OAuth (Outlook/Exchange Online)
   * With enhanced security and Graph API best practices
   */
  async sendViaMicrosoftOAuth(account, emailData) {
    // Check if OAuth tokens are available
    if (!account.oauth) {
      throw new Error('Microsoft OAuth account not fully configured. Please complete the OAuth flow first.');
    }

    const oauth = decryptCredentials(account.oauth);
    const config = decryptCredentials(account.config);

    strapi.log.info(`[magic-mail] Sending via Microsoft OAuth for account: ${account.name}`);
    strapi.log.info(`[magic-mail] Has oauth.email: ${!!oauth.email} (${oauth.email || 'none'})`);
    strapi.log.info(`[magic-mail] Has oauth.accessToken: ${!!oauth.accessToken}`);
    strapi.log.info(`[magic-mail] Has config.clientId: ${!!config.clientId}`);

    if (!oauth.email || !oauth.accessToken) {
      throw new Error('Missing OAuth credentials. Please re-authenticate this account.');
    }

    if (!config.clientId || !config.clientSecret) {
      throw new Error('Missing OAuth client credentials.');
    }

    // Validate email content for security
    this.validateEmailSecurity(emailData);

    // Check if token is expired and refresh if needed
    let currentAccessToken = oauth.accessToken;
    
    if (oauth.expiresAt && new Date(oauth.expiresAt) < new Date()) {
      strapi.log.info('[magic-mail] Access token expired, refreshing...');
      
      if (!oauth.refreshToken) {
        throw new Error('Access token expired and no refresh token available. Please re-authenticate.');
      }

      try {
        if (!config.tenantId) {
          throw new Error('Tenant ID not found in config. Please re-configure this account.');
        }

        const oauthService = strapi.plugin('magic-mail').service('oauth');
        const newTokens = await oauthService.refreshMicrosoftTokens(
          oauth.refreshToken,
          config.clientId,
          config.clientSecret,
          config.tenantId
        );
        
        currentAccessToken = newTokens.accessToken;
        strapi.log.info('[magic-mail] [SUCCESS] Microsoft token refreshed successfully');
        
        // Update stored tokens
        const { encryptCredentials } = require('../utils/encryption');
        const updatedOAuth = encryptCredentials({
          ...oauth,
          accessToken: newTokens.accessToken,
          expiresAt: newTokens.expiresAt,
        });
        
        await strapi.documents('plugin::magic-mail.email-account').update({
          documentId: account.documentId,
          data: { oauth: updatedOAuth },
        });
      } catch (refreshErr) {
        strapi.log.error('[magic-mail] Token refresh failed:', refreshErr);
        throw new Error('Access token expired and refresh failed. Please re-authenticate this account.');
      }
    }

    // Use Microsoft Graph API with MIME format
    // Key: Let Microsoft add From/DKIM headers automatically for DMARC compliance
    strapi.log.info('[magic-mail] Using Microsoft Graph API with MIME format (DMARC-safe)...');
    
    try {
      // Build MIME content WITHOUT From header (Microsoft adds it with proper DKIM)
      const boundary = `----=_Part_${Date.now()}`;
      const attachments = emailData.attachments || [];
      
      let mimeContent = '';
      
      if (attachments.length > 0) {
        // Multipart MIME with attachments
        const mimeLines = [
          // DON'T include From - Microsoft adds it with DKIM!
          `To: ${emailData.to}`,
          `Subject: ${emailData.subject}`,
          `Date: ${new Date().toUTCString()}`,
          `Message-ID: <${Date.now()}.${Math.random().toString(36).substring(7)}@${account.fromEmail.split('@')[1]}>`,
          'MIME-Version: 1.0',
          `Content-Type: multipart/mixed; boundary="${boundary}"`,
          'X-Mailer: MagicMail/1.0',
        ];

        // Priority headers
        if (emailData.priority === 'high') {
          mimeLines.push('X-Priority: 1 (Highest)');
          mimeLines.push('Importance: high');
        }

        // List-Unsubscribe for marketing
        if (emailData.type === 'marketing' && emailData.unsubscribeUrl) {
          mimeLines.push(`List-Unsubscribe: <${emailData.unsubscribeUrl}>`);
          mimeLines.push('List-Unsubscribe-Post: List-Unsubscribe=One-Click');
        }

        // Reply-To
        if (emailData.replyTo || account.replyTo) {
          mimeLines.push(`Reply-To: ${emailData.replyTo || account.replyTo}`);
        }

        mimeLines.push('');
        mimeLines.push(`--${boundary}`);
        mimeLines.push('Content-Type: text/html; charset=utf-8');
        mimeLines.push('');
        mimeLines.push(emailData.html || emailData.text || '');
        
        // Add attachments
        const fs = require('fs');
        const path = require('path');
        
        for (const attachment of attachments) {
          mimeLines.push(`--${boundary}`);
          
          let fileContent;
          let filename;
          let contentType = attachment.contentType || 'application/octet-stream';
          
          if (attachment.content) {
            fileContent = Buffer.isBuffer(attachment.content) 
              ? attachment.content 
              : Buffer.from(attachment.content);
            filename = attachment.filename || 'attachment';
          } else if (attachment.path) {
            fileContent = fs.readFileSync(attachment.path);
            filename = attachment.filename || path.basename(attachment.path);
          } else {
            continue;
          }
          
          mimeLines.push(`Content-Type: ${contentType}; name="${filename}"`);
          mimeLines.push(`Content-Disposition: attachment; filename="${filename}"`);
          mimeLines.push('Content-Transfer-Encoding: base64');
          mimeLines.push('');
          mimeLines.push(fileContent.toString('base64'));
        }
        
        mimeLines.push(`--${boundary}--`);
        mimeContent = mimeLines.join('\r\n');
      } else {
        // Simple MIME email without attachments
        const mimeLines = [
          // DON'T include From - Microsoft adds it with DKIM!
          `To: ${emailData.to}`,
          `Subject: ${emailData.subject}`,
          `Date: ${new Date().toUTCString()}`,
          `Message-ID: <${Date.now()}.${Math.random().toString(36).substring(7)}@${account.fromEmail.split('@')[1]}>`,
          'MIME-Version: 1.0',
          'Content-Type: text/html; charset=utf-8',
          'X-Mailer: MagicMail/1.0',
        ];

        // Priority headers
        if (emailData.priority === 'high') {
          mimeLines.push('X-Priority: 1 (Highest)');
          mimeLines.push('Importance: high');
        }

        // List-Unsubscribe for marketing
        if (emailData.type === 'marketing' && emailData.unsubscribeUrl) {
          mimeLines.push(`List-Unsubscribe: <${emailData.unsubscribeUrl}>`);
          mimeLines.push('List-Unsubscribe-Post: List-Unsubscribe=One-Click');
        }

        // Reply-To
        if (emailData.replyTo || account.replyTo) {
          mimeLines.push(`Reply-To: ${emailData.replyTo || account.replyTo}`);
        }

        mimeLines.push('');
        mimeLines.push(emailData.html || emailData.text || '');
        
        mimeContent = mimeLines.join('\r\n');
      }
      
      // Encode MIME to base64
      const base64Mime = Buffer.from(mimeContent).toString('base64');
      
      // Send via Microsoft Graph using MIME format
      const response = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${currentAccessToken}`,
          'Content-Type': 'text/plain', // MIME format!
        },
        body: base64Mime,
      });
      
      // Microsoft Graph returns 202 Accepted on success
      if (response.status !== 202) {
        let errorData = 'Unknown error';
        try {
          errorData = await response.text();
        } catch (e) {
          // Ignore
        }
        strapi.log.error('[magic-mail] Microsoft Graph MIME error:', errorData);
        strapi.log.error('[magic-mail] Response status:', response.status);
        throw new Error(`Microsoft Graph API error: ${response.status} - ${response.statusText}`);
      }
      
      strapi.log.info('[magic-mail] [SUCCESS] Email sent via Microsoft Graph API with MIME + custom headers');
      strapi.log.info('[magic-mail] Microsoft adds From/DKIM automatically for DMARC compliance');
      
      return {
        messageId: `microsoft-${Date.now()}`,
        response: 'Accepted',
      };
    } catch (err) {
      strapi.log.error('[magic-mail] Microsoft Graph API send failed:', err);
      throw err;
    }
  },

  /**
   * Send via Yahoo OAuth
   * With enhanced security and SMTP OAuth2 best practices
   */
  async sendViaYahooOAuth(account, emailData) {
    // Check if OAuth tokens are available
    if (!account.oauth) {
      throw new Error('Yahoo OAuth account not fully configured. Please complete the OAuth flow first.');
    }

    const oauth = decryptCredentials(account.oauth);
    const config = decryptCredentials(account.config);

    strapi.log.info(`[magic-mail] Sending via Yahoo OAuth for account: ${account.name}`);
    strapi.log.info(`[magic-mail] Has oauth.email: ${!!oauth.email} (${oauth.email || 'none'})`);
    strapi.log.info(`[magic-mail] Has oauth.accessToken: ${!!oauth.accessToken}`);

    if (!oauth.email || !oauth.accessToken) {
      throw new Error('Missing OAuth credentials. Please re-authenticate this account.');
    }

    // Validate email content for security
    this.validateEmailSecurity(emailData);

    // Check if token is expired and refresh if needed
    let currentAccessToken = oauth.accessToken;
    
    if (oauth.expiresAt && new Date(oauth.expiresAt) < new Date()) {
      strapi.log.info('[magic-mail] Access token expired, refreshing...');
      
      if (!oauth.refreshToken) {
        throw new Error('Access token expired and no refresh token available. Please re-authenticate.');
      }

      try {
        const oauthService = strapi.plugin('magic-mail').service('oauth');
        const newTokens = await oauthService.refreshYahooTokens(
          oauth.refreshToken,
          config.clientId,
          config.clientSecret
        );
        
        currentAccessToken = newTokens.accessToken;
        strapi.log.info('[magic-mail] [SUCCESS] Token refreshed successfully');
        
        // Update stored tokens
        const { encryptCredentials } = require('../utils/encryption');
        const updatedOAuth = encryptCredentials({
          ...oauth,
          accessToken: newTokens.accessToken,
          expiresAt: newTokens.expiresAt,
        });
        
        await strapi.documents('plugin::magic-mail.email-account').update({
          documentId: account.documentId,
          data: { oauth: updatedOAuth },
        });
      } catch (refreshErr) {
        strapi.log.error('[magic-mail] Token refresh failed:', refreshErr);
        throw new Error('Access token expired and refresh failed. Please re-authenticate this account.');
      }
    }

    // Yahoo Mail API uses SMTP with OAuth token as password
    // We use nodemailer with XOAUTH2
    const nodemailer = require('nodemailer');
    
    strapi.log.info('[magic-mail] Using Yahoo SMTP with OAuth...');
    
    try {
      const transporter = nodemailer.createTransport({
        host: 'smtp.mail.yahoo.com',
        port: 465,
        secure: true,
        auth: {
          type: 'OAuth2',
          user: oauth.email,
          accessToken: currentAccessToken,
        },
      });

      const mailOptions = {
        from: `${account.fromName || 'Yahoo Mail'} <${account.fromEmail}>`,
        to: emailData.to,
        replyTo: emailData.replyTo || account.replyTo,
        subject: emailData.subject,
        text: emailData.text,
        html: emailData.html,
        attachments: emailData.attachments || [],
        
        // Security and deliverability headers
        headers: {
          'X-Mailer': 'MagicMail/1.0',
          'X-Priority': emailData.priority === 'high' ? '1' : '3',
        },
        
        // Generate proper Message-ID
        messageId: `<${Date.now()}.${Math.random().toString(36).substring(7)}@${account.fromEmail.split('@')[1]}>`,
        date: new Date(),
      };

      // Add List-Unsubscribe for marketing emails
      if (emailData.type === 'marketing' && emailData.unsubscribeUrl) {
        mailOptions.headers['List-Unsubscribe'] = `<${emailData.unsubscribeUrl}>`;
        mailOptions.headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
      }

      if (mailOptions.attachments.length > 0) {
        strapi.log.info(`[magic-mail] Sending email with ${mailOptions.attachments.length} attachment(s)`);
      }

      const result = await transporter.sendMail(mailOptions);
      strapi.log.info('[magic-mail] [SUCCESS] Email sent via Yahoo OAuth');
      
      return {
        messageId: result.messageId,
        response: result.response,
      };
    } catch (err) {
      strapi.log.error('[magic-mail] Yahoo OAuth send failed:', err);
      throw err;
    }
  },

  /**
   * Send via SendGrid API
   * With enhanced security and proper headers
   */
  async sendViaSendGrid(account, emailData) {
    const config = decryptCredentials(account.config);
    
    if (!config.apiKey) {
      throw new Error('SendGrid API key not configured');
    }

    // Validate email content for security
    this.validateEmailSecurity(emailData);

    strapi.log.info(`[magic-mail] Sending via SendGrid for account: ${account.name}`);

    try {
      // Build message object for SendGrid
      const msg = {
        to: emailData.to,
        from: {
          email: account.fromEmail,
          name: account.fromName || account.fromEmail,
        },
        subject: emailData.subject,
        text: emailData.text,
        html: emailData.html,
        
        // Security and tracking headers
        customArgs: {
          'magicmail_version': '1.0',
          'email_type': emailData.type || 'transactional',
          'priority': emailData.priority || 'normal',
        },
        
        // Headers object for custom headers
        headers: {
          'X-Mailer': 'MagicMail/1.0',
        },
      };

      // Add priority headers if high priority
      if (emailData.priority === 'high') {
        msg.headers['X-Priority'] = '1 (Highest)';
        msg.headers['Importance'] = 'high';
      }

      // Add ReplyTo if provided
      if (emailData.replyTo || account.replyTo) {
        msg.replyTo = {
          email: emailData.replyTo || account.replyTo,
        };
      }

      // Add List-Unsubscribe for marketing emails (GDPR/CAN-SPAM compliance)
      if (emailData.type === 'marketing' && emailData.unsubscribeUrl) {
        msg.headers['List-Unsubscribe'] = `<${emailData.unsubscribeUrl}>`;
        msg.headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
      }

      // Add attachments if provided
      const attachments = emailData.attachments || [];
      if (attachments.length > 0) {
        const fs = require('fs');
        const path = require('path');
        
        msg.attachments = [];
        
        for (const attachment of attachments) {
          let fileContent;
          let filename;
          let contentType = attachment.contentType || 'application/octet-stream';
          
          if (attachment.content) {
            // Content provided as buffer or string
            fileContent = Buffer.isBuffer(attachment.content) 
              ? attachment.content 
              : Buffer.from(attachment.content);
            filename = attachment.filename || 'attachment';
          } else if (attachment.path) {
            // Read from file path
            fileContent = fs.readFileSync(attachment.path);
            filename = attachment.filename || path.basename(attachment.path);
          } else {
            continue;
          }
          
          msg.attachments.push({
            content: fileContent.toString('base64'),
            filename: filename,
            type: contentType,
            disposition: 'attachment',
          });
        }
        
        strapi.log.info(`[magic-mail] Email with ${attachments.length} attachment(s) prepared`);
      }

      // Send via SendGrid API
      const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(msg),
      });

      if (!response.ok) {
        const errorText = await response.text();
        strapi.log.error('[magic-mail] SendGrid API error:', errorText);
        throw new Error(`SendGrid API error: ${response.statusText}`);
      }

      strapi.log.info('[magic-mail] [SUCCESS] Email sent via SendGrid API');

      // SendGrid returns 202 Accepted with no body on success
      return {
        messageId: response.headers.get('x-message-id') || `sendgrid-${Date.now()}`,
        response: 'Accepted',
      };
    } catch (err) {
      strapi.log.error('[magic-mail] SendGrid send failed:', err);
      throw err;
    }
  },

  /**
   * Send via Mailgun API
   * With enhanced security and compliance headers
   */
  async sendViaMailgun(account, emailData) {
    const config = decryptCredentials(account.config);
    
    if (!config.apiKey || !config.domain) {
      throw new Error('Mailgun API key and domain not configured');
    }

    // Validate email content for security
    this.validateEmailSecurity(emailData);

    strapi.log.info(`[magic-mail] Sending via Mailgun for account: ${account.name}`);
    strapi.log.info(`[magic-mail] Domain: ${config.domain}`);

    try {
      // Build FormData for Mailgun API
      const FormData = require('form-data');
      const form = new FormData();

      // Required fields
      form.append('from', account.fromName 
        ? `${account.fromName} <${account.fromEmail}>`
        : account.fromEmail
      );
      form.append('to', emailData.to);
      form.append('subject', emailData.subject);
      
      // Add text or html content
      if (emailData.html) {
        form.append('html', emailData.html);
      }
      if (emailData.text) {
        form.append('text', emailData.text);
      }

      // Add ReplyTo if provided
      if (emailData.replyTo || account.replyTo) {
        form.append('h:Reply-To', emailData.replyTo || account.replyTo);
      }

      // Add custom headers for tracking and security
      form.append('h:X-Mailer', 'MagicMail/1.0');
      form.append('h:X-Email-Type', emailData.type || 'transactional');

      // Add List-Unsubscribe for marketing emails (GDPR/CAN-SPAM compliance)
      if (emailData.type === 'marketing' && emailData.unsubscribeUrl) {
        form.append('h:List-Unsubscribe', `<${emailData.unsubscribeUrl}>`);
        form.append('h:List-Unsubscribe-Post', 'List-Unsubscribe=One-Click');
      }

      // Add attachments if provided
      const attachments = emailData.attachments || [];
      if (attachments.length > 0) {
        const fs = require('fs');
        const path = require('path');
        
        for (const attachment of attachments) {
          let fileContent;
          let filename;
          
          if (attachment.content) {
            // Content provided as buffer or string
            fileContent = Buffer.isBuffer(attachment.content) 
              ? attachment.content 
              : Buffer.from(attachment.content);
            filename = attachment.filename || 'attachment';
          } else if (attachment.path) {
            // Read from file path
            fileContent = fs.readFileSync(attachment.path);
            filename = attachment.filename || path.basename(attachment.path);
          } else {
            continue;
          }
          
          // Mailgun expects attachments as form data with buffer
          form.append('attachment', fileContent, {
            filename: filename,
            contentType: attachment.contentType || 'application/octet-stream',
          });
        }
        
        strapi.log.info(`[magic-mail] Email with ${attachments.length} attachment(s) prepared`);
      }

      // Send via Mailgun API
      const response = await fetch(`https://api.mailgun.net/v3/${config.domain}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${Buffer.from(`api:${config.apiKey}`).toString('base64')}`,
          ...form.getHeaders(),
        },
        body: form,
      });

      if (!response.ok) {
        const errorData = await response.text();
        strapi.log.error('[magic-mail] Mailgun API error:', errorData);
        throw new Error(`Mailgun API error: ${response.statusText}`);
      }

      const result = await response.json();
      strapi.log.info('[magic-mail] [SUCCESS] Email sent via Mailgun API');

      return {
        messageId: result.id || `mailgun-${Date.now()}`,
        response: result.message || 'Queued',
      };
    } catch (err) {
      strapi.log.error('[magic-mail] Mailgun send failed:', err);
      throw err;
    }
  },

  /**
   * Check if account is within rate limits
   */
  async checkRateLimits(account) {
    if (account.dailyLimit > 0 && account.emailsSentToday >= account.dailyLimit) {
      return false;
    }
    if (account.hourlyLimit > 0 && account.emailsSentThisHour >= account.hourlyLimit) {
      return false;
    }
    return true;
  },

  /**
   * Update account statistics
   * Note: This function now expects documentId
   */
  async updateAccountStats(documentId) {
    const account = await strapi.documents('plugin::magic-mail.email-account').findOne({
      documentId,
    });

    if (!account) return;

    await strapi.documents('plugin::magic-mail.email-account').update({
      documentId,
      data: {
        emailsSentToday: (account.emailsSentToday || 0) + 1,
        emailsSentThisHour: (account.emailsSentThisHour || 0) + 1,
        totalEmailsSent: (account.totalEmailsSent || 0) + 1,
        lastUsed: new Date(),
      },
    });
  },

  /**
   * Log email to database (DEPRECATED - now handled by Analytics)
   * This function previously created duplicate logs
   * Now it's a no-op since email-log creation is handled in the analytics service
   */
  async logEmail(logData) {
    // Email logging is now handled by the Analytics service (createEmailLog)
    // This function is kept for backward compatibility but does nothing
    // The analytics log is created earlier in the send() flow with proper tracking data
    strapi.log.debug('[magic-mail] Email already logged via Analytics service');
  },

  /**
   * Get account by name
   */
  async getAccountByName(name) {
    const accounts = await strapi.documents('plugin::magic-mail.email-account').findMany({
      filters: { name, isActive: true },
      limit: 1,
    });

    return accounts && accounts.length > 0 ? accounts[0] : null;
  },

  /**
   * Validate email content for security best practices
   * Prevents common security issues and spam triggers
   */
  validateEmailSecurity(emailData) {
    const { to, subject, html, text } = emailData;

    // 1. Validate recipient email format (supports display names and arrays)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const extractEmail = (addr) => {
      if (!addr || typeof addr !== 'string') return '';
      if (addr.includes('<')) {
        const match = addr.match(/<([^>]+)>/);
        return match ? match[1].trim() : addr.trim();
      }
      return addr.trim();
    };

    const validateAddr = (addr) => emailRegex.test(extractEmail(addr));

    if (Array.isArray(to)) {
      for (const addr of to) {
        if (!validateAddr(addr)) {
          throw new Error(`Invalid recipient email format: ${addr}`);
        }
      }
    } else if (typeof to === 'string') {
      const addresses = to.includes(',') ? to.split(',') : [to];
      for (const addr of addresses) {
        if (!validateAddr(addr.trim())) {
          throw new Error(`Invalid recipient email format: ${addr.trim()}`);
        }
      }
    }

    // 2. Prevent empty subject (spam trigger)
    if (!subject || subject.trim().length === 0) {
      throw new Error('Email subject is required for security and deliverability');
    }

    // 3. Prevent excessively long subjects (spam trigger)
    if (subject.length > 200) {
      strapi.log.warn('[magic-mail] Subject line exceeds 200 characters - may trigger spam filters');
    }

    // 4. Require either text or html content
    if (!html && !text) {
      throw new Error('Email must have either text or html content');
    }

    // 5. Check for common spam trigger patterns in subject
    const spamTriggers = [
      /\bfree\b.*\bmoney\b/i,
      /\b100%\s*free\b/i,
      /\bclaim.*\bprize\b/i,
      /\bclick\s*here\s*now\b/i,
      /\bviagra\b/i,
      /\bcasino\b/i,
    ];

    for (const pattern of spamTriggers) {
      if (pattern.test(subject)) {
        strapi.log.warn(`[magic-mail] Subject contains potential spam trigger: "${subject}"`);
        break;
      }
    }

    // 6. Validate HTML doesn't contain dangerous scripts
    if (html) {
      if (/<script[^>]*>.*?<\/script>/i.test(html)) {
        throw new Error('Email HTML must not contain <script> tags for security');
      }
      
      if (/javascript:/i.test(html)) {
        throw new Error('Email HTML must not contain javascript: protocol for security');
      }
    }

    // 7. Check for proper content balance (text vs html)
    if (html && !text) {
      strapi.log.warn('[magic-mail] Email has HTML but no text alternative - may reduce deliverability');
    }

    strapi.log.info('[magic-mail] [SUCCESS] Email security validation passed');
  },

  /**
   * Add security headers to email data
   * Returns enhanced email data with security headers
   */
  addSecurityHeaders(emailData, account) {
    const headers = {
      'X-Mailer': 'MagicMail/1.0',
      'X-Entity-Ref-ID': `magicmail-${Date.now()}`,
    };

    // Add priority headers if specified
    if (emailData.priority === 'high') {
      headers['X-Priority'] = '1';
      headers['Importance'] = 'high';
    }

    // Add List-Unsubscribe for marketing emails (RFC 8058)
    if (emailData.type === 'marketing') {
      if (emailData.unsubscribeUrl) {
        headers['List-Unsubscribe'] = `<${emailData.unsubscribeUrl}>`;
        headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
      } else {
        strapi.log.warn('[magic-mail] Marketing email without unsubscribe URL - may violate regulations');
      }
    }

    return {
      ...emailData,
      headers: {
        ...emailData.headers,
        ...headers,
      },
    };
  },

  // ============================================================================
  // UNIFIED MESSAGE API - Send via Email OR WhatsApp
  // ============================================================================

  /**
   * Send a message via WhatsApp
   * Same pattern as send() but for WhatsApp
   * @param {Object} messageData - { phoneNumber, message, templateId, templateData }
   * @returns {Promise<Object>} Send result
   */
  async sendWhatsApp(messageData) {
    const {
      phoneNumber,
      message,
      templateId = null,
      templateData = {},
    } = messageData;

    // Validate phone number
    if (!phoneNumber) {
      throw new Error('Phone number is required for WhatsApp messages');
    }

    // Clean phone number (remove + and spaces)
    const cleanPhone = phoneNumber.replace(/[^\d]/g, '');
    if (cleanPhone.length < 10) {
      throw new Error('Invalid phone number format. Use format: 491234567890 (country code + number)');
    }

    // Get WhatsApp service
    const whatsapp = strapi.plugin('magic-mail').service('whatsapp');
    const status = whatsapp.getStatus();

    if (!status.isConnected) {
      throw new Error('WhatsApp is not connected. Please connect WhatsApp first in the admin panel.');
    }

    // If template is specified, render it
    let finalMessage = message;
    if (templateId) {
      try {
        const template = await whatsapp.getTemplate(templateId);
        if (template) {
          finalMessage = template.content;
          // Replace variables in template
          Object.keys(templateData).forEach(key => {
            finalMessage = finalMessage.replace(new RegExp(`{{${key}}}`, 'g'), templateData[key]);
          });
        }
      } catch (error) {
        strapi.log.warn(`[magic-mail] WhatsApp template ${templateId} not found, using plain message`);
      }
    }

    if (!finalMessage) {
      throw new Error('Message content is required');
    }

    // Send via WhatsApp
    strapi.log.info(`[magic-mail] [WHATSAPP] Sending message to ${cleanPhone}`);
    const result = await whatsapp.sendMessage(cleanPhone, finalMessage);

    if (result.success) {
      strapi.log.info(`[magic-mail] [SUCCESS] WhatsApp message sent to ${cleanPhone}`);
      return {
        success: true,
        channel: 'whatsapp',
        phoneNumber: cleanPhone,
        jid: result.jid,
      };
    } else {
      strapi.log.error(`[magic-mail] [ERROR] WhatsApp send failed: ${result.error}`);
      throw new Error(result.error || 'Failed to send WhatsApp message');
    }
  },

  /**
   * Unified send method - automatically chooses Email or WhatsApp
   * @param {Object} messageData - Combined email and WhatsApp data
   * @param {string} messageData.channel - 'email' | 'whatsapp' | 'auto' (default: 'auto')
   * @param {string} messageData.to - Email address (for email channel)
   * @param {string} messageData.phoneNumber - Phone number (for whatsapp channel)
   * @param {string} messageData.subject - Email subject
   * @param {string} messageData.message - Plain text message (used for WhatsApp, or as email text)
   * @param {string} messageData.html - HTML content (email only)
   * @param {string} messageData.templateId - Template ID (works for both channels)
   * @param {Object} messageData.templateData - Template variables
   * @returns {Promise<Object>} Send result with channel info
   */
  async sendMessage(messageData) {
    const {
      channel = 'auto',
      to,
      phoneNumber,
      subject,
      message,
      text,
      html,
      templateId,
      templateData,
      ...rest
    } = messageData;

    // Determine which channel to use
    let useChannel = channel;
    
    if (channel === 'auto') {
      // Auto-detect: prefer email if available, fallback to WhatsApp
      if (to && to.includes('@')) {
        useChannel = 'email';
      } else if (phoneNumber) {
        useChannel = 'whatsapp';
      } else {
        throw new Error('Either email (to) or phoneNumber is required');
      }
    }

    strapi.log.info(`[magic-mail] [SEND] Channel: ${useChannel}, to: ${to || phoneNumber}`);

    if (useChannel === 'whatsapp') {
      // WhatsApp channel
      if (!phoneNumber) {
        throw new Error('Phone number is required for WhatsApp channel');
      }

      return await this.sendWhatsApp({
        phoneNumber,
        message: message || text || subject, // Use message, fallback to text or subject
        templateId,
        templateData,
      });
    } else {
      // Email channel (default)
      if (!to) {
        throw new Error('Email address (to) is required for email channel');
      }

      const result = await this.send({
        to,
        subject,
        text: text || message,
        html,
        templateId,
        templateData,
        phoneNumber, // Pass for WhatsApp fallback
        ...rest,
      });

      return {
        ...result,
        channel: 'email',
      };
    }
  },

  /**
   * Check WhatsApp connection status
   * @returns {Object} Connection status
   */
  getWhatsAppStatus() {
    try {
      const whatsapp = strapi.plugin('magic-mail').service('whatsapp');
      return whatsapp.getStatus();
    } catch (error) {
      return {
        isConnected: false,
        status: 'unavailable',
        error: error.message,
      };
    }
  },

  /**
   * Check if a phone number is registered on WhatsApp
   * @param {string} phoneNumber - Phone number to check
   * @returns {Promise<Object>} Check result
   */
  async checkWhatsAppNumber(phoneNumber) {
    try {
      const whatsapp = strapi.plugin('magic-mail').service('whatsapp');
      return await whatsapp.checkNumber(phoneNumber);
    } catch (error) {
      return {
        success: false,
        exists: false,
        error: error.message,
      };
    }
  },
});

