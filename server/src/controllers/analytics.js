/**
 * Analytics Controller
 * Handles tracking endpoints and analytics API
 */

'use strict';

module.exports = ({ strapi }) => ({
  /**
   * Tracking pixel endpoint
   * GET /magic-mail/track/open/:emailId/:recipientHash
   */
  async trackOpen(ctx) {
    const { emailId, recipientHash } = ctx.params;

    // Record the open event
    await strapi.plugin('magic-mail').service('analytics').recordOpen(emailId, recipientHash, ctx.request);

    // Return 1x1 transparent GIF
    const pixel = Buffer.from(
      'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
      'base64'
    );

    ctx.type = 'image/gif';
    ctx.body = pixel;
  },

  /**
   * Click tracking endpoint
   * GET /magic-mail/track/click/:emailId/:linkHash/:recipientHash
   */
  async trackClick(ctx) {
    const { emailId, linkHash, recipientHash } = ctx.params;
    let { url } = ctx.query;

    // Try to get URL from database if not in query string
    if (!url) {
      const analyticsService = strapi.plugin('magic-mail').service('analytics');
      url = await analyticsService.getOriginalUrlFromHash(emailId, linkHash);
    }

    if (!url) {
      return ctx.badRequest('Missing target URL');
    }

    // Record the click event
    await strapi
      .plugin('magic-mail')
      .service('analytics')
      .recordClick(emailId, linkHash, recipientHash, url, ctx.request);

    // Redirect to the original URL
    ctx.redirect(url);
  },

  /**
   * Get analytics statistics
   * GET /magic-mail/analytics/stats
   */
  async getStats(ctx) {
    try {
      const filters = {
        userId: ctx.query.userId ? parseInt(ctx.query.userId) : null,
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
      ctx.throw(500, error);
    }
  },

  /**
   * Get email logs
   * GET /magic-mail/analytics/emails
   */
  async getEmailLogs(ctx) {
    try {
      const filters = {
        userId: ctx.query.userId ? parseInt(ctx.query.userId) : null,
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
      ctx.throw(500, error);
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
      ctx.throw(500, error);
    }
  },

  /**
   * Get user email activity
   * GET /magic-mail/analytics/users/:userId
   */
  async getUserActivity(ctx) {
    try {
      const { userId } = ctx.params;

      const activity = await strapi
        .plugin('magic-mail')
        .service('analytics')
        .getUserActivity(parseInt(userId));

      return ctx.send({
        success: true,
        data: activity,
      });
    } catch (error) {
      ctx.throw(500, error);
    }
  },

  /**
   * Debug Analytics - Check database state
   * GET /magic-mail/analytics/debug
   */
  async debug(ctx) {
    try {
      strapi.log.info('[magic-mail] 🔍 Running Analytics Debug...');

      // Get email logs
      const emailLogs = await strapi.db.query('plugin::magic-mail.email-log').findMany({
        limit: 10,
        orderBy: { sentAt: 'DESC' },
      });

      // Get email events
      const emailEvents = await strapi.db.query('plugin::magic-mail.email-event').findMany({
        limit: 20,
        orderBy: { timestamp: 'DESC' },
        populate: ['emailLog'],
      });

      // Get stats
      const analyticsService = strapi.plugin('magic-mail').service('analytics');
      const stats = await analyticsService.getStats();

      // Get active accounts
      const accounts = await strapi.entityService.findMany('plugin::magic-mail.email-account', {
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
      strapi.log.error('[magic-mail] Debug error:', error);
      ctx.throw(500, error);
    }
  },

  /**
   * Delete single email log
   * DELETE /magic-mail/analytics/emails/:emailId
   */
  async deleteEmailLog(ctx) {
    try {
      const { emailId } = ctx.params;

      // Find email log
      const emailLog = await strapi.db.query('plugin::magic-mail.email-log').findOne({
        where: { emailId },
      });

      if (!emailLog) {
        return ctx.notFound('Email log not found');
      }

      // Delete associated events first
      await strapi.db.query('plugin::magic-mail.email-event').deleteMany({
        where: { emailLog: emailLog.id },
      });

      // Delete email log
      await strapi.db.query('plugin::magic-mail.email-log').delete({
        where: { id: emailLog.id },
      });

      strapi.log.info(`[magic-mail] 🗑️  Deleted email log: ${emailId}`);

      return ctx.send({
        success: true,
        message: 'Email log deleted successfully',
      });
    } catch (error) {
      strapi.log.error('[magic-mail] Error deleting email log:', error);
      ctx.throw(500, error);
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

      const where = {};
      if (olderThan) {
        where.sentAt = { $lt: new Date(olderThan) };
      }

      // Get all email logs to delete
      const emailLogs = await strapi.db.query('plugin::magic-mail.email-log').findMany({
        where,
        select: ['id'],
      });

      const emailLogIds = emailLogs.map(log => log.id);

      if (emailLogIds.length === 0) {
        return ctx.send({
          success: true,
          message: 'No email logs to delete',
          deletedCount: 0,
        });
      }

      // Delete all associated events
      await strapi.db.query('plugin::magic-mail.email-event').deleteMany({
        where: { emailLog: { $in: emailLogIds } },
      });

      // Delete all email logs
      await strapi.db.query('plugin::magic-mail.email-log').deleteMany({
        where: { id: { $in: emailLogIds } },
      });

      strapi.log.info(`[magic-mail] 🗑️  Cleared ${emailLogIds.length} email logs`);

      return ctx.send({
        success: true,
        message: `Successfully deleted ${emailLogIds.length} email log(s)`,
        deletedCount: emailLogIds.length,
      });
    } catch (error) {
      strapi.log.error('[magic-mail] Error clearing email logs:', error);
      ctx.throw(500, error);
    }
  },
});

