'use strict';

const { validate, handleControllerError } = require('../validation');

/**
 * Strips file-path attachments from API requests.
 *
 * Internal service calls can still use `attachment.path` because they
 * originate from trusted code that has already vetted the path. Public
 * Content-API callers must never be able to make the server read from
 * arbitrary disk locations (would be a direct LFI → file exfiltration).
 */
function stripAttachmentPaths(body) {
  if (body && Array.isArray(body.attachments)) {
    body.attachments = body.attachments.map(({ path, ...safe }) => safe);
  }
  return body;
}

/**
 * Main Controller
 * Handles email sending requests.
 *
 * Every public endpoint validates its payload with Zod BEFORE any service
 * call. Attachments are bounded both in count (20) and per-entry size
 * (25 MB) to protect against OOM from large base64 payloads.
 */

module.exports = {
  async send(ctx) {
    try {
      const raw = stripAttachmentPaths({ ...ctx.request.body });
      const body = validate('content.send', raw);

      const emailRouter = strapi.plugin('magic-mail').service('email-router');
      const result = await emailRouter.send(body);

      ctx.body = { success: true, ...result };
    } catch (err) {
      handleControllerError(ctx, err, '[magic-mail] Error sending email', 'Failed to send email');
    }
  },

  async sendMessage(ctx) {
    try {
      const raw = stripAttachmentPaths({ ...ctx.request.body });
      const body = validate('content.sendMessage', raw);

      const emailRouter = strapi.plugin('magic-mail').service('email-router');
      const result = await emailRouter.sendMessage(body);

      ctx.body = { success: true, ...result };
    } catch (err) {
      handleControllerError(ctx, err, '[magic-mail] Error sending message', 'Failed to send message');
    }
  },

};
