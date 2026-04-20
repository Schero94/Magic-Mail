/**
 * Analytics Controller
 * Handles tracking endpoints and analytics API
 * [SUCCESS] Migrated to strapi.documents() API (Strapi v5 Best Practice)
 */

'use strict';

const EMAIL_LOG_UID = 'plugin::magic-mail.email-log';
const EMAIL_EVENT_UID = 'plugin::magic-mail.email-event';
const EMAIL_ACCOUNT_UID = 'plugin::magic-mail.email-account';

/**
 * HTML-escape a string so we can safely drop it into the fallback page
 * without opening an XSS vector. We only ever echo server-side values
 * (the configured fallback URL, a static message) but this belt-and-
 * braces escaping keeps the helper safe if someone later inlines user
 * input.
 *
 * @param {string} value
 * @returns {string}
 */
const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

/**
 * Builds a minimal, self-contained HTML fallback page that the end-user
 * sees when a tracking link can no longer be resolved (retention
 * cleanup, invalid hash, malformed URL, …).
 *
 * Behaviour:
 *  - If `fallbackUrl` is provided, the page meta-refreshes to it after
 *    3 seconds AND offers a manual link. We use meta refresh instead of
 *    ctx.redirect so the user still sees an explanation first — many
 *    marketing recipients report "the link went nowhere" when they hit a
 *    silent 302 after a long delay.
 *  - Without a fallback URL, the page is a static expired-link
 *    apology.
 *
 * @param {string} reason - Short human message used as the page subtitle.
 * @param {string|null} fallbackUrl - Optional URL to redirect to.
 * @returns {string} HTML document ready to return as ctx.body.
 */
const renderTrackingFallbackHtml = (reason, fallbackUrl) => {
  const safeReason = escapeHtml(reason);
  const safeUrl = fallbackUrl ? escapeHtml(fallbackUrl) : '';
  const refreshMeta = fallbackUrl
    ? `<meta http-equiv="refresh" content="3;url=${safeUrl}">`
    : '';
  const manualLink = fallbackUrl
    ? `<p style="margin-top:24px;font-size:14px;color:#6b7280;">
         You will be redirected in a few seconds. If nothing happens,
         <a href="${safeUrl}" style="color:#4f46e5;">click here</a>.
       </p>`
    : `<p style="margin-top:24px;font-size:14px;color:#6b7280;">
         You can safely close this tab.
       </p>`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    ${refreshMeta}
    <title>Link unavailable</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background:#f9fafb; margin:0; padding:40px 20px; color:#111827; }
      .card { max-width: 480px; margin: 60px auto; background:#fff; border-radius: 12px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); text-align:center; }
      h1 { font-size: 22px; margin: 0 0 12px; }
      p  { font-size: 15px; line-height: 1.5; color:#374151; }
    </style>
  </head>
  <body>
    <main class="card">
      <h1>This link is no longer available</h1>
      <p>${safeReason}</p>
      ${manualLink}
    </main>
  </body>
</html>`;
};

/**
 * Serves a tracking-failure HTML page with the correct Content-Type.
 * Returns a soft 410 Gone (not 400) so search engines and mail clients
 * mark the URL as stale rather than treating it as a client error.
 *
 * @param {import('koa').Context} ctx
 * @param {string} reason
 */
const respondWithTrackingFallback = async (ctx, reason) => {
  let fallbackUrl = null;
  try {
    const settings = await strapi.plugin('magic-mail').service('plugin-settings').getSettings();
    fallbackUrl = settings?.trackingFallbackUrl || null;
  } catch (err) {
    strapi.log.debug(`[magic-mail] Could not load tracking fallback setting: ${err.message}`);
  }
  ctx.status = 410;
  ctx.type = 'text/html; charset=utf-8';
  ctx.body = renderTrackingFallbackHtml(reason, fallbackUrl);
};

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
   * Click tracking endpoint with open-redirect protection.
   *
   * Resolves the destination URL exclusively from the database — never
   * from query parameters — so the endpoint cannot be used as an open
   * redirect. When the URL is no longer resolvable (retention cleanup
   * deleted the row, the hash is wrong, the stored URL is malformed),
   * the end-user used to receive a Strapi JSON error envelope, which is
   * the single biggest UX regression in any tracking setup. Now the
   * user sees a branded HTML fallback page that either redirects to the
   * admin-configured `trackingFallbackUrl` or apologises and invites
   * them to close the tab.
   *
   * GET /magic-mail/track/click/:emailId/:linkHash/:recipientHash
   */
  async trackClick(ctx) {
    const { emailId, linkHash, recipientHash } = ctx.params;

    let url;
    try {
      const analyticsService = strapi.plugin('magic-mail').service('analytics');
      url = await analyticsService.getOriginalUrlFromHash(emailId, linkHash);
    } catch (err) {
      strapi.log.error('[magic-mail] Error getting original URL:', err.message);
    }

    if (!url) {
      return respondWithTrackingFallback(
        ctx,
        'The page behind this link is no longer tracked. It may have been removed by our retention policy.'
      );
    }

    // Validate URL protocol — only http(s) redirects are allowed.
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        strapi.log.warn(`[magic-mail] Blocked non-http(s) tracking URL for email ${emailId}`);
        return respondWithTrackingFallback(
          ctx,
          'This link points to an unsupported destination and cannot be opened for your safety.'
        );
      }
    } catch {
      return respondWithTrackingFallback(
        ctx,
        'This link is no longer valid.'
      );
    }

    try {
      await strapi
        .plugin('magic-mail')
        .service('analytics')
        .recordClick(emailId, linkHash, recipientHash, url, ctx.request);
    } catch (err) {
      // Log and keep going — we don't want to penalise the user just
      // because our analytics write failed. They still reach their page.
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
      // Two guards: the obvious prod check plus an opt-in env var that must
      // be enabled even in non-production. Many staging environments run
      // without NODE_ENV=production but should not expose internal state.
      if (process.env.NODE_ENV === 'production') {
        return ctx.forbidden('Debug endpoint is disabled in production');
      }
      if (process.env.MAGIC_MAIL_ENABLE_DEBUG_ENDPOINT !== 'true') {
        return ctx.forbidden(
          'Debug endpoint requires MAGIC_MAIL_ENABLE_DEBUG_ENDPOINT=true to be set'
        );
      }
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
   * Clears email logs in bounded batches so a huge backlog cannot block the
   * event loop or OOM the heap. Each invocation deletes up to MAX_TOTAL
   * entries; the caller can re-invoke the endpoint until `deletedCount: 0`
   * is reported to drain the backlog.
   *
   * DELETE /magic-mail/analytics/emails[?olderThan=YYYY-MM-DD]
   */
  async clearAllEmailLogs(ctx) {
    const PAGE_SIZE = 200;
    const MAX_TOTAL = 10_000;

    try {
      const { olderThan } = ctx.query;

      const filters = {};
      if (olderThan) {
        const boundary = new Date(olderThan);
        if (Number.isNaN(boundary.getTime())) {
          return ctx.badRequest('Invalid olderThan date');
        }
        filters.sentAt = { $lt: boundary };
      }

      let totalDeleted = 0;

      while (totalDeleted < MAX_TOTAL) {
        const emailLogs = await strapi.documents(EMAIL_LOG_UID).findMany({
          filters,
          fields: ['id', 'documentId'],
          sort: [{ sentAt: 'asc' }],
          limit: PAGE_SIZE,
        });

        if (!emailLogs || emailLogs.length === 0) break;

        for (const log of emailLogs) {
          const events = await strapi.documents(EMAIL_EVENT_UID).findMany({
            filters: { emailLog: { documentId: log.documentId } },
          });

          for (const event of events) {
            await strapi.documents(EMAIL_EVENT_UID).delete({ documentId: event.documentId });
          }

          await strapi.documents(EMAIL_LOG_UID).delete({ documentId: log.documentId });
          totalDeleted++;
          if (totalDeleted >= MAX_TOTAL) break;
        }

        if (emailLogs.length < PAGE_SIZE) break;
      }

      if (totalDeleted > 0) {
        strapi.log.info(`[magic-mail] [DELETE] Cleared ${totalDeleted} email logs this run`);
      }

      return ctx.send({
        success: true,
        message:
          totalDeleted === 0
            ? 'No email logs to delete'
            : `Deleted ${totalDeleted} email log(s)${totalDeleted >= MAX_TOTAL ? ' (more remain, re-run to continue)' : ''}`,
        deletedCount: totalDeleted,
        hasMore: totalDeleted >= MAX_TOTAL,
      });
    } catch (error) {
      strapi.log.error('[magic-mail] Error clearing email logs:', error.message);
      ctx.throw(500, error.message);
    }
  },
});
