/**
 * Analytics Controller
 * Handles tracking endpoints and analytics API
 * [SUCCESS] Migrated to strapi.documents() API (Strapi v5 Best Practice)
 */

'use strict';

const { validate, handleControllerError } = require('../validation');

const EMAIL_LOG_UID = 'plugin::magic-mail.email-log';
const EMAIL_EVENT_UID = 'plugin::magic-mail.email-event';
const EMAIL_ACCOUNT_UID = 'plugin::magic-mail.email-account';

/** emailId, linkHash and recipientHash are always 32 lower-case hex characters. */
const TRACKING_ID = /^[a-f0-9]{32}$/;
const isTrackingId = (value) => typeof value === 'string' && TRACKING_ID.test(value);

const PIXEL_GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

/**
 * Writes the 1x1 GIF directly to Node's response. Strapi's Content API
 * response transformer serializes Buffers and even Readable streams as JSON,
 * so this binary endpoint bypasses it.
 *
 * @param {import('koa').Context} ctx
 */
const sendPixel = (ctx) => {
  ctx.status = 200;
  ctx.respond = false;
  ctx.res.statusCode = 200;
  ctx.res.setHeader('Content-Type', 'image/gif');
  ctx.res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  ctx.res.setHeader('Content-Length', String(PIXEL_GIF.length));
  ctx.res.end(PIXEL_GIF);
};

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
const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const normalizeHttpUrl = (value) => {
  try {
    const parsed = new URL(value);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : null;
  } catch {
    return null;
  }
};

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
  const refreshMeta = fallbackUrl ? `<meta http-equiv="refresh" content="3;url=${safeUrl}">` : '';
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
    fallbackUrl = normalizeHttpUrl(settings?.trackingFallbackUrl) || null;
  } catch {
    strapi.log.debug('[magic-mail] Could not load tracking fallback setting');
  }
  ctx.status = 410;
  ctx.type = 'text/html; charset=utf-8';
  ctx.set('Cache-Control', 'no-store');
  ctx.set('Referrer-Policy', 'no-referrer');
  ctx.set(
    'Content-Security-Policy',
    "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"
  );
  ctx.body = renderTrackingFallbackHtml(reason, fallbackUrl);
};

module.exports = ({ strapi }) => ({
  /**
   * Tracking pixel endpoint
   * GET /magic-mail/track/open/:emailId/:recipientHash
   */
  async trackOpen(ctx) {
    const { emailId, recipientHash } = ctx.params || {};
    // Malformed ids and rate-limited requests (ctx.state.magicMailRateLimited)
    // still get the pixel; they are just not recorded.
    if (isTrackingId(emailId) && isTrackingId(recipientHash) && !ctx.state?.magicMailRateLimited) {
      try {
        await strapi
          .plugin('magic-mail')
          .service('analytics')
          .recordOpen(emailId, recipientHash, ctx.request);
      } catch (err) {
        strapi.log.error('[magic-mail] Error recording open event:', err?.name || 'Error');
      }
    }
    sendPixel(ctx);
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
    const { emailId, linkHash, recipientHash } = ctx.params || {};
    // Over the tracking rate limit the recipient is still redirected; only
    // the click is not counted.
    const record = !ctx.state?.magicMailRateLimited;

    let url = null;
    try {
      if (isTrackingId(emailId) && isTrackingId(linkHash) && isTrackingId(recipientHash)) {
        const analyticsService = strapi.plugin('magic-mail').service('analytics');
        url = await analyticsService.getOriginalUrlFromHash(emailId, linkHash, recipientHash, {
          count: record,
        });
      }
    } catch (err) {
      strapi.log.error('[magic-mail] Error getting original URL:', err?.name || 'Error');
    }

    if (!url) {
      return respondWithTrackingFallback(ctx, 'This link has expired or is no longer available.');
    }

    // Validate URL protocol — only http(s) redirects are allowed.
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        strapi.log.warn('[magic-mail] Blocked non-http(s) tracking URL');
        return respondWithTrackingFallback(
          ctx,
          'This link points to an unsupported destination and cannot be opened for your safety.'
        );
      }
    } catch {
      return respondWithTrackingFallback(ctx, 'This link is no longer valid.');
    }

    if (record) {
      try {
        await strapi
          .plugin('magic-mail')
          .service('analytics')
          .recordClick(emailId, linkHash, recipientHash, url, ctx.request);
      } catch (err) {
        // The recipient still reaches the page when the analytics write fails.
        strapi.log.error('[magic-mail] Error recording click event:', err?.name || 'Error');
      }
    }

    ctx.set('Cache-Control', 'no-store');
    ctx.set('Referrer-Policy', 'no-referrer');
    ctx.redirect(url);
  },

  /**
   * Get analytics statistics
   * GET /magic-mail/analytics/stats
   */
  async getStats(ctx) {
    try {
      const query = validate('analytics.statsQuery', ctx.query);
      const filters = {
        // userId is documentId (string) in Strapi v5, NOT parseInt!
        userId: query.userId || null,
        templateId: query.templateId || null,
        accountId: query.accountId || null,
        dateFrom: query.dateFrom || null,
        dateTo: query.dateTo || null,
      };

      // Remove null values
      Object.keys(filters).forEach((key) => filters[key] === null && delete filters[key]);

      const stats = await strapi.plugin('magic-mail').service('analytics').getStats(filters);

      return ctx.send({
        success: true,
        data: stats,
      });
    } catch (error) {
      handleControllerError(
        ctx,
        error,
        '[magic-mail] Error getting analytics stats',
        'Error fetching analytics stats'
      );
    }
  },

  /**
   * Get email logs
   * GET /magic-mail/analytics/emails
   */
  async getEmailLogs(ctx) {
    try {
      const query = validate('analytics.logsQuery', ctx.query);
      const filters = {
        // userId is documentId (string) in Strapi v5, NOT parseInt!
        userId: query.userId || null,
        templateId: query.templateId || null,
        search: query.search || null,
        deliveryStatus: query.deliveryStatus || null,
      };

      const pagination = {
        page: query.page || 1,
        pageSize: query.pageSize || 25,
      };

      // Remove null values
      Object.keys(filters).forEach((key) => filters[key] === null && delete filters[key]);

      const result = await strapi
        .plugin('magic-mail')
        .service('analytics')
        .getEmailLogs(filters, pagination);

      return ctx.send({
        success: true,
        ...result,
      });
    } catch (error) {
      handleControllerError(
        ctx,
        error,
        '[magic-mail] Error getting email logs',
        'Error fetching email logs'
      );
    }
  },

  /**
   * Get email log details
   * GET /magic-mail/analytics/emails/:emailId
   */
  async getEmailDetails(ctx) {
    try {
      const { emailId } = ctx.params;
      if (!isTrackingId(emailId)) {
        return ctx.notFound('Email log not found');
      }

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
      handleControllerError(
        ctx,
        error,
        '[magic-mail] Error getting email log',
        'Error fetching email log'
      );
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
      handleControllerError(
        ctx,
        error,
        '[magic-mail] Error getting user activity',
        'Error fetching user activity'
      );
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
        let settings = {};
        try {
          settings = await strapi.plugin('magic-mail').service('plugin-settings').getSettings();
        } catch {
          settings = {};
        }
        const endpoint = analyticsService.getTrackingEndpoint(settings);
        sampleTrackingUrls = endpoint
          ? {
              trackingPixel: `${endpoint}/open/${testLog.emailId}/${testHash}`,
              emailId: testLog.emailId,
            }
          : { trackingPixel: null, note: 'No public tracking URL configured' };
      }

      return ctx.send({
        success: true,
        debug: {
          timestamp: new Date().toISOString(),
          stats,
          emailLogsCount: emailLogs.length,
          emailEventsCount: emailEvents.length,
          activeAccountsCount: accounts.length,
          recentEmailLogs: emailLogs.map((log) => ({
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
          recentEvents: emailEvents.map((event) => ({
            type: event.type,
            timestamp: event.timestamp,
            emailId: event.emailLog?.emailId,
            ipAddress: event.ipAddress,
            hasLinkUrl: Boolean(event.linkUrl),
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
      handleControllerError(
        ctx,
        error,
        '[magic-mail] Analytics debug failed',
        'Analytics debug failed'
      );
    }
  },

  /**
   * Delete single email log
   * DELETE /magic-mail/analytics/emails/:emailId
   */
  async deleteEmailLog(ctx) {
    try {
      const { emailId } = ctx.params;
      if (!isTrackingId(emailId)) {
        return ctx.notFound('Email log not found');
      }

      const emailLog = await strapi.db.query(EMAIL_LOG_UID).findOne({
        select: ['id'],
        where: { emailId },
      });

      if (!emailLog) {
        return ctx.notFound('Email log not found');
      }

      // Removes the log together with its events and stored link mappings.
      await strapi.plugin('magic-mail').service('analytics').deleteEmailLogsByIds([emailLog.id]);

      strapi.log.info('[magic-mail] [DELETE] Deleted one email log');

      return ctx.send({
        success: true,
        message: 'Email log deleted successfully',
      });
    } catch (error) {
      handleControllerError(
        ctx,
        error,
        '[magic-mail] Error deleting email log',
        'Error deleting email log'
      );
    }
  },

  /**
   * Clears email logs (with their events and link mappings) oldest first, at
   * most 10,000 per request. `hasMore: true` means logs remain and the
   * caller should call again.
   *
   * DELETE /magic-mail/analytics/emails[?olderThan=YYYY-MM-DD]
   * Response: { success, message, deletedCount, hasMore }
   */
  async clearAllEmailLogs(ctx) {
    const MAX_TOTAL = 10_000;

    try {
      const { olderThan } = ctx.query || {};

      const where = {};
      if (olderThan !== undefined && olderThan !== '') {
        const boundary =
          typeof olderThan === 'string' && olderThan.length <= 64 ? new Date(olderThan) : null;
        if (!boundary || Number.isNaN(boundary.getTime())) {
          return ctx.badRequest('Invalid olderThan date');
        }
        where.sentAt = { $lt: boundary };
      }

      const { deletedCount, hasMore } = await strapi
        .plugin('magic-mail')
        .service('analytics')
        .deleteEmailLogs(where, { max: MAX_TOTAL });

      if (deletedCount > 0) {
        strapi.log.info(`[magic-mail] [DELETE] Cleared ${deletedCount} email logs this run`);
      }

      return ctx.send({
        success: true,
        message:
          deletedCount === 0
            ? 'No email logs to delete'
            : `Deleted ${deletedCount} email log(s)${hasMore ? ' (more remain, re-run to continue)' : ''}`,
        deletedCount,
        hasMore,
      });
    } catch (error) {
      handleControllerError(
        ctx,
        error,
        '[magic-mail] Error clearing email logs',
        'Error clearing email logs'
      );
    }
  },
});
