/**
 * Analytics Controller
 * Handles tracking endpoints and analytics API
 * [SUCCESS] Migrated to strapi.documents() API (Strapi v5 Best Practice)
 */

'use strict';

const EMAIL_LOG_UID = 'plugin::magic-mail.email-log';
const EMAIL_EVENT_UID = 'plugin::magic-mail.email-event';
const EMAIL_ACCOUNT_UID = 'plugin::magic-mail.email-account';

module.exports = ({ strapi }) => ({
  /**
   * Tracking pixel endpoint
   * GET /magic-mail/track/open/:emailId/:recipientHash
   */
  async trackOpen(ctx) {
    const { emailId, recipientHash } = ctx.params;

    try {
      await strapi.plugin('magic-mail').service('analytics').recordOpen(emailId, recipientHash, ctx.request);
    } catch (err) {
      strapi.log.error('[magic-mail] Error recording open event:', err.message);
    }

    // Always return tracking pixel regardless of errors
    const pixel = Buffer.from(
      'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
      'base64'
    );

    ctx.type = 'image/gif';
    ctx.body = pixel;
  },

  /**
   * Click tracking endpoint with open-redirect protection
   * GET /magic-mail/track/click/:emailId/:linkHash/:recipientHash
   */
  async trackClick(ctx) {
    const { emailId, linkHash, recipientHash } = ctx.params;

    // Always resolve URL from database only (never from query params) to prevent open redirect
    let url;
    try {
      const analyticsService = strapi.plugin('magic-mail').service('analytics');
      url = await analyticsService.getOriginalUrlFromHash(emailId, linkHash);
    } catch (err) {
      strapi.log.error('[magic-mail] Error getting original URL:', err.message);
    }

    if (!url) {
      return ctx.badRequest('Invalid or expired tracking link');
    }

    // Validate URL protocol
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return ctx.badRequest('Invalid URL protocol');
      }
    } catch {
      return ctx.badRequest('Invalid URL format');
    }

    try {
      await strapi
        .plugin('magic-mail')
        .service('analytics')
        .recordClick(emailId, linkHash, recipientHash, url, ctx.request);
    } catch (err) {
      strapi.log.error('[magic-mail] Error recording click event:', err.message);
    }

    ctx.redirect(url);
  },

  /**
   * Get analytics statistics
   * GET /magic-mail/analytics/stats
   */
  async getStats(ctx) {
    try {
      const filters = {
        // userId is documentId (string) in Strapi v5, NOT parseInt!
        userId: ctx.query.userId || null,
        templateId: ctx.query.templateId ? parseInt(ctx.query.templateId) : null,
        accountId: ctx.query.accountId ? parseInt(ctx.query.accountId) : null,
        dateFrom: ctx.query.dateFrom || null,
        dateTo: ctx.query.dateTo || null,
      };

      // Remove null values
      Object.keys(filters).forEach(key => filters[key] === null && delete filters[key]);

      const stats = await strapi.plugin('magic-mail').service('analytics').getStats(filters);

      return ctx.send({
        success: true,
        data: stats,
      });
    } catch (error) {
      ctx.throw(500, error.message);
    }
  },

  /**
   * Get email logs
   * GET /magic-mail/analytics/emails
   */
  async getEmailLogs(ctx) {
    try {
      const filters = {
        // userId is documentId (string) in Strapi v5, NOT parseInt!
        userId: ctx.query.userId || null,
        templateId: ctx.query.templateId ? parseInt(ctx.query.templateId) : null,
        search: ctx.query.search || null,
      };

      const pagination = {
        page: ctx.query.page ? parseInt(ctx.query.page) : 1,
        pageSize: ctx.query.pageSize ? parseInt(ctx.query.pageSize) : 25,
      };

      // Remove null values
      Object.keys(filters).forEach(key => filters[key] === null && delete filters[key]);

      const result = await strapi
        .plugin('magic-mail')
        .service('analytics')
        .getEmailLogs(filters, pagination);

      return ctx.send({
        success: true,
        ...result,
      });
    } catch (error) {
      ctx.throw(500, error.message);
    }
  },

  /**
   * Get email log details
   * GET /magic-mail/analytics/emails/:emailId
   */
  async getEmailDetails(ctx) {
    try {
      const { emailId } = ctx.params;

      const emailLog = await strapi
        .plugin('magic-mail')
        .service('analytics')
        .getEmailLogDetails(emailId);

      if (!emailLog) {
        return ctx.notFound('Email log not found');
      }

      return ctx.send({
        success: true,
        data: emailLog,
      });
    } catch (error) {
      ctx.throw(500, error.message);
    }
  },

  /**
   * Get user email activity
   * GET /magic-mail/analytics/users/:userId
   * Note: userId is documentId (string) in Strapi v5
   */
  async getUserActivity(ctx) {
    try {
      const { userId } = ctx.params;

      // userId is documentId (string) in Strapi v5, NOT parseInt!
      const activity = await strapi
        .plugin('magic-mail')
        .service('analytics')
        .getUserActivity(userId);

      return ctx.send({
        success: true,
        data: activity,
      });
    } catch (error) {
      ctx.throw(500, error.message);
    }
  },

  /**
   * Debug Analytics - Check database state
   * GET /magic-mail/analytics/debug
   */
  async debug(ctx) {
    try {
      strapi.log.info('[magic-mail] [CHECK] Running Analytics Debug...');

      // Get email logs using Document Service
      const emailLogs = await strapi.documents(EMAIL_LOG_UID).findMany({
        limit: 10,
        sort: [{ sentAt: 'desc' }],
      });

      // Get email events using Document Service
      const emailEvents = await strapi.documents(EMAIL_EVENT_UID).findMany({
        limit: 20,
        sort: [{ timestamp: 'desc' }],
        populate: ['emailLog'],
      });

      // Get stats
      const analyticsService = strapi.plugin('magic-mail').service('analytics');
      const stats = await analyticsService.getStats();

      // Get active accounts using Document Service
      const accounts = await strapi.documents(EMAIL_ACCOUNT_UID).findMany({
        filters: { isActive: true },
        fields: ['id', 'name', 'provider', 'fromEmail', 'emailsSentToday', 'totalEmailsSent'],
      });

      // Generate sample tracking URLs
      let sampleTrackingUrls = null;
      if (emailLogs.length > 0) {
        const testLog = emailLogs[0];
        const testHash = analyticsService.generateRecipientHash(testLog.emailId, testLog.recipient);
        
        const baseUrl = strapi.config.get('server.url') || 'http://localhost:1337';
        sampleTrackingUrls = {
          trackingPixel: `${baseUrl}/api/magic-mail/track/open/${testLog.emailId}/${testHash}`,
          clickTracking: `${baseUrl}/api/magic-mail/track/click/${testLog.emailId}/test/${testHash}?url=https://example.com`,
          emailId: testLog.emailId,
          recipient: testLog.recipient,
        };
      }

      return ctx.send({
        success: true,
        debug: {
          timestamp: new Date().toISOString(),
          stats,
          emailLogsCount: emailLogs.length,
          emailEventsCount: emailEvents.length,
          activeAccountsCount: accounts.length,
          recentEmailLogs: emailLogs.map(log => ({
            emailId: log.emailId,
            recipient: log.recipient,
            subject: log.subject,
            sentAt: log.sentAt,
            openCount: log.openCount,
            clickCount: log.clickCount,
            firstOpenedAt: log.firstOpenedAt,
            accountName: log.accountName,
            templateName: log.templateName,
          })),
          recentEvents: emailEvents.map(event => ({
            type: event.type,
            timestamp: event.timestamp,
            emailId: event.emailLog?.emailId,
            ipAddress: event.ipAddress,
            linkUrl: event.linkUrl,
          })),
          accounts,
          sampleTrackingUrls,
          notes: [
            'If emailLogsCount is 0: Emails are not being tracked (check if enableTracking=true)',
            'If openCount is 0: Tracking pixel not being loaded (check email HTML source)',
            'Test tracking URLs should be publicly accessible without authentication',
            'Check Strapi console logs for tracking events when opening emails',
          ],
        },
      });
    } catch (error) {
      strapi.log.error('[magic-mail] Debug error:', error.message);
      ctx.throw(500, error.message);
    }
  },

  /**
   * Delete single email log
   * DELETE /magic-mail/analytics/emails/:emailId
   */
  async deleteEmailLog(ctx) {
    try {
      const { emailId } = ctx.params;

      // Find email log using Document Service
      const emailLog = await strapi.documents(EMAIL_LOG_UID).findFirst({
        filters: { emailId },
      });

      if (!emailLog) {
        return ctx.notFound('Email log not found');
      }

      // Delete associated events - filter relation with documentId object (Strapi v5)
      const events = await strapi.documents(EMAIL_EVENT_UID).findMany({
        filters: { emailLog: { documentId: emailLog.documentId } },
      });

      for (const event of events) {
        await strapi.documents(EMAIL_EVENT_UID).delete({ documentId: event.documentId });
      }

      // Delete email log
      await strapi.documents(EMAIL_LOG_UID).delete({ documentId: emailLog.documentId });

      strapi.log.info(`[magic-mail] [DELETE]  Deleted email log: ${emailId}`);

      return ctx.send({
        success: true,
        message: 'Email log deleted successfully',
      });
    } catch (error) {
      strapi.log.error('[magic-mail] Error deleting email log:', error.message);
      ctx.throw(500, error.message);
    }
  },

  /**
   * Clear all email logs
   * DELETE /magic-mail/analytics/emails
   */
  async clearAllEmailLogs(ctx) {
    try {
      // Optional: Add query params for filtered deletion
      const { olderThan } = ctx.query; // e.g., ?olderThan=2024-01-01

      const filters = {};
      if (olderThan) {
        filters.sentAt = { $lt: new Date(olderThan) };
      }

      // Get all email logs to delete using Document Service
      const emailLogs = await strapi.documents(EMAIL_LOG_UID).findMany({
        filters,
        fields: ['id', 'documentId'],
        limit: 100000,
      });

      if (emailLogs.length === 0) {
        return ctx.send({
          success: true,
          message: 'No email logs to delete',
          deletedCount: 0,
        });
      }

      // Delete all associated events and logs
      for (const log of emailLogs) {
        // Delete events for this log - filter relation with documentId object (Strapi v5)
        const events = await strapi.documents(EMAIL_EVENT_UID).findMany({
          filters: { emailLog: { documentId: log.documentId } },
      });

        for (const event of events) {
          await strapi.documents(EMAIL_EVENT_UID).delete({ documentId: event.documentId });
        }

        // Delete the log itself
        await strapi.documents(EMAIL_LOG_UID).delete({ documentId: log.documentId });
      }

      strapi.log.info(`[magic-mail] [DELETE]  Cleared ${emailLogs.length} email logs`);

      return ctx.send({
        success: true,
        message: `Successfully deleted ${emailLogs.length} email log(s)`,
        deletedCount: emailLogs.length,
      });
    } catch (error) {
      strapi.log.error('[magic-mail] Error clearing email logs:', error.message);
      ctx.throw(500, error.message);
    }
  },
});
