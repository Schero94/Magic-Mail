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
    return crypto
      .createHash('sha256')
      .update(`${emailId}-${recipient}-${process.env.APP_KEYS || 'secret'}`)
      .digest('hex')
      .substring(0, 16);
  },

  /**
   * Create email log entry
   */
  async createEmailLog(data) {
    const emailId = this.generateEmailId();
    
    const logEntry = await strapi.documents(EMAIL_LOG_UID).create({
      data: {
        emailId,
        user: data.userId || null,
        recipient: data.to,
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
    const baseUrl = strapi.config.get('server.url') || 'http://localhost:1337';
    
    // Get the email log for storing link associations
    const emailLog = await strapi.documents(EMAIL_LOG_UID).findFirst({
      filters: { emailId },
    });

    if (!emailLog) {
      strapi.log.error(`[magic-mail] Cannot rewrite links: Email log not found for ${emailId}`);
      return html;
    }
    
    // More flexible regex to find links, including those with newlines/whitespace in attributes
    const linkRegex = /<a\s+[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gis;
    
    // Collect all link mappings to store
    const linkMappings = [];
    const replacements = [];
    
    let linkCount = 0;
    let match;
    
    // First pass: collect all links and their replacements
    while ((match = linkRegex.exec(html)) !== null) {
      const fullMatch = match[0];
      const originalUrl = match[1];
      
      // Debug: Log what we found
      strapi.log.debug(`[magic-mail] [CHECK] Found link: ${originalUrl.substring(0, 100)}${originalUrl.length > 100 ? '...' : ''}`);
      
      // Skip if already a tracking link or anchor
      if (originalUrl.startsWith('#') || originalUrl.includes('/track/click/')) {
        strapi.log.debug(`[magic-mail] [SKIP] Skipping (anchor or already tracked)`);
        continue;
      }

      // Skip relative URLs without protocol (internal anchors, relative paths)
      if (!originalUrl.match(/^https?:\/\//i) && !originalUrl.startsWith('/')) {
        strapi.log.debug(`[magic-mail] [SKIP] Skipping relative URL: ${originalUrl}`);
        continue;
      }

      // Create link hash - hash the full URL including any query params
      const linkHash = crypto.createHash('md5').update(originalUrl).digest('hex').substring(0, 8);
      
      // Store for database insert
      linkMappings.push({
        linkHash,
        originalUrl,
      });
      
      // Create tracking URL WITHOUT the url query parameter (we'll look it up in the DB instead)
      const trackingUrl = `${baseUrl}/api/magic-mail/track/click/${emailId}/${linkHash}/${recipientHash}`;
      
      linkCount++;
      strapi.log.info(`[magic-mail] [LINK] Link ${linkCount}: ${originalUrl} → ${trackingUrl}`);
      
      // Store replacement info
      replacements.push({
        from: originalUrl,
        to: trackingUrl,
      });
    }
    
    // Store all link mappings in database
    for (const mapping of linkMappings) {
      try {
        await this.storeLinkMapping(emailLog.documentId, mapping.linkHash, mapping.originalUrl);
      } catch (err) {
        strapi.log.error('[magic-mail] Error storing link mapping:', err);
      }
    }
    
    // Apply all replacements
    let result = html;
    for (const replacement of replacements) {
      result = result.replace(replacement.from, replacement.to);
    }
    
    if (linkCount > 0) {
      strapi.log.info(`[magic-mail] [SUCCESS] Rewrote ${linkCount} links for click tracking`);
    } else {
      strapi.log.warn(`[magic-mail] [WARNING]  No links found in email HTML for tracking!`);
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
