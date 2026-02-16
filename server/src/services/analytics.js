/**
 * Analytics Service
 * Handles email tracking, statistics, and user activity
 * 
 * [SUCCESS] Migrated to strapi.documents() API (Strapi v5 Best Practice)
 */

'use strict';

const crypto = require('crypto');

// Content Type UIDs
const EMAIL_LOG_UID = 'plugin::magic-mail.email-log';
const EMAIL_EVENT_UID = 'plugin::magic-mail.email-event';
const EMAIL_LINK_UID = 'plugin::magic-mail.email-link';

module.exports = ({ strapi }) => ({
  /**
   * Generate unique email ID for tracking
   */
  generateEmailId() {
    return crypto.randomBytes(16).toString('hex');
  },

  /**
   * Generate secure hash for recipient (for tracking URLs)
   */
  generateRecipientHash(emailId, recipient) {
    const normalized = (recipient || '').trim().toLowerCase();
    return crypto
      .createHash('sha256')
      .update(`${emailId}-${normalized}-${process.env.APP_KEYS || 'secret'}`)
      .digest('hex')
      .substring(0, 16);
  },

  /**
   * Create email log entry
   */
  async createEmailLog(data) {
    const emailId = this.generateEmailId();
    const normalizedRecipient = data.to ? String(data.to).trim().toLowerCase() : data.to;
    
    const logEntry = await strapi.documents(EMAIL_LOG_UID).create({
      data: {
        emailId,
        user: data.userId || null,
        recipient: normalizedRecipient,
        recipientName: data.recipientName || null,
        subject: data.subject,
        templateId: data.templateId || null,
        templateName: data.templateName || null,
        accountId: data.accountId || null,
        accountName: data.accountName || null,
        sentAt: new Date(),
        metadata: data.metadata || {},
      },
    });

    strapi.log.info(`[magic-mail] [SUCCESS] Email log created: ${emailId}`);
    if (data.templateId) {
      strapi.log.info(`[magic-mail] [INFO] Template tracked: ${data.templateName || 'Unknown'} (ID: ${data.templateId})`);
    }
    return logEntry;
  },

  /**
   * Record email open event
   */
  async recordOpen(emailId, recipientHash, req) {
    try {
      // Find email log using Document Service
      const emailLog = await strapi.documents(EMAIL_LOG_UID).findFirst({
        filters: { emailId },
      });

      if (!emailLog) {
        strapi.log.warn(`[magic-mail] Email log not found: ${emailId}`);
        return null;
      }

      // Verify recipient hash
      const validHash = this.generateRecipientHash(emailId, emailLog.recipient);
      if (recipientHash !== validHash) {
        strapi.log.warn(`[magic-mail] Invalid recipient hash for: ${emailId}`);
        return null;
      }

      const now = new Date();

      // Update email log counters using Document Service
      await strapi.documents(EMAIL_LOG_UID).update({
        documentId: emailLog.documentId,
        data: {
          openCount: (emailLog.openCount || 0) + 1,
          firstOpenedAt: emailLog.firstOpenedAt || now,
          lastOpenedAt: now,
        },
      });

      // Create event record
      const event = await strapi.documents(EMAIL_EVENT_UID).create({
        data: {
          emailLog: emailLog.documentId,
          type: 'open',
          timestamp: now,
          ipAddress: req.ip || req.headers['x-forwarded-for'] || null,
          userAgent: req.headers['user-agent'] || null,
          location: this.parseLocation(req),
        },
      });

      strapi.log.info(`[magic-mail] [EMAIL] Email opened: ${emailId} (count: ${(emailLog.openCount || 0) + 1})`);
      return event;
    } catch (error) {
      strapi.log.error('[magic-mail] Error recording open:', error);
      return null;
    }
  },

  /**
   * Record email click event
   */
  async recordClick(emailId, linkHash, recipientHash, targetUrl, req) {
    try {
      // Find email log using Document Service
      const emailLog = await strapi.documents(EMAIL_LOG_UID).findFirst({
        filters: { emailId },
      });

      if (!emailLog) {
        return null;
      }

      // Verify recipient hash
      const validHash = this.generateRecipientHash(emailId, emailLog.recipient);
      if (recipientHash !== validHash) {
        return null;
      }

      const now = new Date();

      // Update click count
      await strapi.documents(EMAIL_LOG_UID).update({
        documentId: emailLog.documentId,
        data: {
          clickCount: (emailLog.clickCount || 0) + 1,
        },
      });

      // Create event record
      const event = await strapi.documents(EMAIL_EVENT_UID).create({
        data: {
          emailLog: emailLog.documentId,
          type: 'click',
          timestamp: now,
          ipAddress: req.ip || req.headers['x-forwarded-for'] || null,
          userAgent: req.headers['user-agent'] || null,
          location: this.parseLocation(req),
          linkUrl: targetUrl,
        },
      });

      strapi.log.info(`[magic-mail] [CLICK] Link clicked: ${emailId} -> ${targetUrl}`);
      return event;
    } catch (error) {
      strapi.log.error('[magic-mail] Error recording click:', error);
      return null;
    }
  },

  /**
   * Get analytics statistics
   * Note: Document Service doesn't have count() - using findMany for counting
   */
  async getStats(filters = {}) {
    const baseFilters = {};
    
    // Filter by user relation - use documentId for Strapi v5
    if (filters.userId) {
      baseFilters.user = { documentId: filters.userId };
    }
    if (filters.templateId) {
      baseFilters.templateId = filters.templateId;
    }
    if (filters.accountId) {
      baseFilters.accountId = filters.accountId;
    }
    if (filters.dateFrom) {
      baseFilters.sentAt = { $gte: new Date(filters.dateFrom) };
    }
    if (filters.dateTo) {
      baseFilters.sentAt = { ...baseFilters.sentAt, $lte: new Date(filters.dateTo) };
    }

    // Use native count() method for efficient counting with filters
    const [totalSent, totalOpened, totalClicked, totalBounced] = await Promise.all([
      strapi.documents(EMAIL_LOG_UID).count({
        filters: baseFilters,
      }),
      strapi.documents(EMAIL_LOG_UID).count({
        filters: { ...baseFilters, openCount: { $gt: 0 } },
      }),
      strapi.documents(EMAIL_LOG_UID).count({
        filters: { ...baseFilters, clickCount: { $gt: 0 } },
      }),
      strapi.documents(EMAIL_LOG_UID).count({
        filters: { ...baseFilters, bounced: true },
      }),
    ]);

    const openRate = totalSent > 0 ? (totalOpened / totalSent) * 100 : 0;
    const clickRate = totalOpened > 0 ? (totalClicked / totalOpened) * 100 : 0;
    const bounceRate = totalSent > 0 ? (totalBounced / totalSent) * 100 : 0;

    return {
      totalSent,
      totalOpened,
      totalClicked,
      totalBounced,
      openRate: Math.round(openRate * 10) / 10,
      clickRate: Math.round(clickRate * 10) / 10,
      bounceRate: Math.round(bounceRate * 10) / 10,
    };
  },

  /**
   * Get email logs with pagination
   */
  async getEmailLogs(filters = {}, pagination = {}) {
    const where = {};
    
    // Filter by user relation - use documentId for Strapi v5
    if (filters.userId) {
      where.user = { documentId: filters.userId };
    }
    if (filters.templateId) {
      where.templateId = filters.templateId;
    }
    if (filters.search) {
      where.$or = [
        { recipient: { $containsi: filters.search } },
        { subject: { $containsi: filters.search } },
        { recipientName: { $containsi: filters.search } },
      ];
    }

    const page = pagination.page || 1;
    const pageSize = pagination.pageSize || 25;

    const [logs, total] = await Promise.all([
      strapi.documents(EMAIL_LOG_UID).findMany({
        filters: where,
        sort: [{ sentAt: 'desc' }],
        limit: pageSize,
        offset: (page - 1) * pageSize,
        populate: ['user'],
      }),
      // Get total count using native count() method
      strapi.documents(EMAIL_LOG_UID).count({
        filters: where,
      }),
    ]);

    return {
      data: logs,
      pagination: {
        page,
        pageSize,
        pageCount: Math.ceil(total / pageSize),
        total,
      },
    };
  },

  /**
   * Get email log details with events
   */
  async getEmailLogDetails(emailId) {
    const emailLog = await strapi.documents(EMAIL_LOG_UID).findFirst({
      filters: { emailId },
      populate: ['user', 'events'],
    });

    return emailLog;
  },

  /**
   * Get user email activity
   */
  async getUserActivity(userId) {
    // Filter by user relation - use documentId for Strapi v5
    const emailLogs = await strapi.documents(EMAIL_LOG_UID).findMany({
      filters: { user: { documentId: userId } },
      sort: [{ sentAt: 'desc' }],
      limit: 50,
    });

    const stats = await this.getStats({ userId });

    return {
      stats,
      recentEmails: emailLogs,
    };
  },

  /**
   * Parse location from request (basic implementation)
   */
  parseLocation(req) {
    // You can integrate with a GeoIP service here
    return {
      ip: req.ip || req.headers['x-forwarded-for'] || null,
      // country: null,
      // city: null,
    };
  },

  /**
   * Inject tracking pixel into HTML
   */
  injectTrackingPixel(html, emailId, recipientHash) {
    // Use /api/ path for content-api routes (publicly accessible)
    const baseUrl = strapi.config.get('server.url') || 'http://localhost:1337';
    
    // Add random parameter to prevent email client caching
    // This ensures each email open loads the pixel fresh
    const randomToken = crypto.randomBytes(8).toString('hex');
    const trackingUrl = `${baseUrl}/api/magic-mail/track/open/${emailId}/${recipientHash}?r=${randomToken}`;
    const trackingPixel = `<img src="${trackingUrl}" width="1" height="1" style="display:none;" alt="" />`;
    
    strapi.log.info(`[magic-mail] [PIXEL] Tracking pixel URL: ${trackingUrl}`);
    
    // Try to inject before </body>, otherwise append at the end
    if (html.includes('</body>')) {
      return html.replace('</body>', `${trackingPixel}</body>`);
    }
    return `${html}${trackingPixel}`;
  },

  /**
   * Rewrite links for click tracking
   */
  async rewriteLinksForTracking(html, emailId, recipientHash) {
    // Get base URL - prefer plugin settings, then server config, then default
    const settingsService = strapi.plugin('magic-mail').service('plugin-settings');
    const pluginSettings = await settingsService.getSettings();
    const baseUrl = pluginSettings.trackingBaseUrl || strapi.config.get('server.url') || 'http://localhost:1337';
    
    strapi.log.debug(`[magic-mail] [LINK-TRACK] Using base URL: ${baseUrl}`);
    
    // Get the email log for storing link associations
    const emailLog = await strapi.documents(EMAIL_LOG_UID).findFirst({
      filters: { emailId },
    });

    if (!emailLog) {
      strapi.log.error(`[magic-mail] Cannot rewrite links: Email log not found for ${emailId}`);
      return html;
    }
    
    // Decode HTML entities first (e.g., &amp; -> &)
    let processedHtml = html
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"');
    
    // More flexible regex to find href attributes in anchor tags
    // Handles: href="url", href='url', href = "url", multiline attributes
    const linkRegex = /<a\s+(?:[^>]*?\s+)?href\s*=\s*["']([^"']+)["'][^>]*>/gis;
    
    // Also try a simpler pattern if the first one fails
    const simpleLinkRegex = /href\s*=\s*["'](https?:\/\/[^"']+)["']/gi;
    
    // Collect all link mappings to store
    const linkMappings = [];
    const replacements = [];
    const processedUrls = new Set(); // Avoid duplicates
    
    let linkCount = 0;
    let match;
    
    // First pass: collect all links with primary regex
    while ((match = linkRegex.exec(processedHtml)) !== null) {
      const originalUrl = match[1].trim();
      
      // Skip if already processed
      if (processedUrls.has(originalUrl)) continue;
      
      // Debug: Log what we found
      strapi.log.debug(`[magic-mail] [CHECK] Found link: ${originalUrl.substring(0, 100)}${originalUrl.length > 100 ? '...' : ''}`);
      
      // Skip if already a tracking link, anchor, or mailto/tel
      if (
        originalUrl.startsWith('#') || 
        originalUrl.includes('/track/click/') ||
        originalUrl.startsWith('mailto:') ||
        originalUrl.startsWith('tel:') ||
        originalUrl.startsWith('javascript:')
      ) {
        strapi.log.debug(`[magic-mail] [SKIP] Skipping special URL: ${originalUrl.substring(0, 50)}`);
        continue;
      }

      // Must be an absolute URL with protocol
      if (!originalUrl.match(/^https?:\/\//i)) {
        strapi.log.debug(`[magic-mail] [SKIP] Skipping non-http URL: ${originalUrl.substring(0, 50)}`);
        continue;
      }

      processedUrls.add(originalUrl);

      // Create link hash - hash the full URL including any query params
      const linkHash = crypto.createHash('md5').update(originalUrl).digest('hex').substring(0, 8);
      
      // Store for database insert
      linkMappings.push({
        linkHash,
        originalUrl,
      });
      
      // Create tracking URL
      const trackingUrl = `${baseUrl}/api/magic-mail/track/click/${emailId}/${linkHash}/${recipientHash}`;
      
      linkCount++;
      strapi.log.info(`[magic-mail] [LINK] Link ${linkCount}: ${originalUrl.substring(0, 80)}${originalUrl.length > 80 ? '...' : ''}`);
      
      // Store replacement info
      replacements.push({
        from: originalUrl,
        to: trackingUrl,
      });
    }
    
    // If no links found with primary regex, try simple pattern
    if (linkCount === 0) {
      strapi.log.debug(`[magic-mail] [LINK-TRACK] Primary regex found no links, trying simple pattern...`);
      while ((match = simpleLinkRegex.exec(processedHtml)) !== null) {
        const originalUrl = match[1].trim();
        
        if (processedUrls.has(originalUrl)) continue;
        if (originalUrl.includes('/track/click/')) continue;
        
        processedUrls.add(originalUrl);
        
        const linkHash = crypto.createHash('md5').update(originalUrl).digest('hex').substring(0, 8);
        linkMappings.push({ linkHash, originalUrl });
        
        const trackingUrl = `${baseUrl}/api/magic-mail/track/click/${emailId}/${linkHash}/${recipientHash}`;
        linkCount++;
        strapi.log.info(`[magic-mail] [LINK] Link ${linkCount} (simple): ${originalUrl.substring(0, 80)}`);
        
        replacements.push({ from: originalUrl, to: trackingUrl });
      }
    }
    
    // Store all link mappings in database
    for (const mapping of linkMappings) {
      try {
        await this.storeLinkMapping(emailLog.documentId, mapping.linkHash, mapping.originalUrl);
      } catch (err) {
        strapi.log.error('[magic-mail] Error storing link mapping:', err);
      }
    }
    
    // Apply all replacements - ONLY in href attributes, not in link text!
    let result = html; // Use original HTML for replacement to preserve entities
    for (const replacement of replacements) {
      // Escape special regex characters in the URL
      const escapedFrom = replacement.from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Also handle HTML-encoded version of the URL
      const escapedFromEncoded = replacement.from
        .replace(/&/g, '&amp;')
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      
      // Replace both plain and HTML-encoded URLs within href attributes
      const hrefRegex = new RegExp(`(href\\s*=\\s*["'])${escapedFrom}(["'])`, 'gi');
      const hrefRegexEncoded = new RegExp(`(href\\s*=\\s*["'])${escapedFromEncoded}(["'])`, 'gi');
      
      result = result.replace(hrefRegex, `$1${replacement.to}$2`);
      result = result.replace(hrefRegexEncoded, `$1${replacement.to}$2`);
    }
    
    if (linkCount > 0) {
      strapi.log.info(`[magic-mail] [SUCCESS] Rewrote ${linkCount} links for click tracking`);
    } else {
      strapi.log.warn(`[magic-mail] [WARNING] No links found in email HTML for tracking!`);
      // Debug: Show first 500 chars of HTML to help diagnose
      strapi.log.debug(`[magic-mail] [DEBUG] HTML preview: ${html.substring(0, 500)}...`);
    }
    
    return result;
  },

  /**
   * Store link mapping in database
   */
  async storeLinkMapping(emailLogDocId, linkHash, originalUrl) {
    try {
      // Check if link already exists - filter relation with documentId object
      const existing = await strapi.documents(EMAIL_LINK_UID).findFirst({
        filters: {
          emailLog: { documentId: emailLogDocId },
          linkHash,
        },
      });

      if (existing) {
        strapi.log.debug(`[magic-mail] Link mapping already exists for ${linkHash}`);
        return existing;
      }

      // Create new link mapping
      const linkMapping = await strapi.documents(EMAIL_LINK_UID).create({
        data: {
          emailLog: emailLogDocId,
          linkHash,
          originalUrl,
          clickCount: 0,
        },
      });

      strapi.log.debug(`[magic-mail] [SAVE] Stored link mapping: ${linkHash} → ${originalUrl}`);
      return linkMapping;
    } catch (error) {
      strapi.log.error('[magic-mail] Error storing link mapping:', error);
      throw error;
    }
  },

  /**
   * Get original URL from link hash
   */
  async getOriginalUrlFromHash(emailId, linkHash) {
    try {
      // Find the email log
      const emailLog = await strapi.documents(EMAIL_LOG_UID).findFirst({
        filters: { emailId },
      });

      if (!emailLog) {
        strapi.log.warn(`[magic-mail] Email log not found: ${emailId}`);
        return null;
      }

      // Find the link mapping - filter relation with documentId object (Strapi v5)
      const linkMapping = await strapi.documents(EMAIL_LINK_UID).findFirst({
        filters: {
          emailLog: { documentId: emailLog.documentId },
          linkHash,
        },
      });

      if (!linkMapping) {
        strapi.log.warn(`[magic-mail] Link mapping not found: ${emailId}/${linkHash}`);
        return null;
      }

      // Update click tracking on the link itself
      const now = new Date();
      await strapi.documents(EMAIL_LINK_UID).update({
        documentId: linkMapping.documentId,
        data: {
          clickCount: (linkMapping.clickCount || 0) + 1,
          firstClickedAt: linkMapping.firstClickedAt || now,
          lastClickedAt: now,
        },
      });

      return linkMapping.originalUrl;
    } catch (error) {
      strapi.log.error('[magic-mail] Error getting original URL:', error);
      return null;
    }
  },
});
