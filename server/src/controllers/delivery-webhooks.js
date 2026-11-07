'use strict';

/**
 * Public, signed delivery webhooks (bounces and complaints).
 * POST /api/magic-mail/webhooks/sendgrid/:accountId
 * POST /api/magic-mail/webhooks/mailgun/:accountId
 *
 * Responses carry no detail: 200 for processed or ignored events, 401 for an
 * unknown account, a missing secret or a bad signature, 400 for a malformed
 * body. The raw body is captured by utils/webhook-raw-body.js.
 */

const UNPARSED_BODY = Symbol.for('unparsedBody');

/** @param {any} ctx @returns {Buffer|undefined} */
const rawBodyOf = (ctx) => {
  if (Buffer.isBuffer(ctx.state?.magicMailWebhookRaw)) return ctx.state.magicMailWebhookRaw;
  const unparsed = ctx.request?.body?.[UNPARSED_BODY];
  if (typeof unparsed === 'string') return Buffer.from(unparsed, 'utf8');
  return undefined;
};

const handle = (provider) => async (ctx) => {
  let status;
  try {
    const result = await strapi
      .plugin('magic-mail')
      .service('delivery-webhooks')
      .handleWebhook({
        provider,
        accountId: ctx.params.accountId,
        rawBody: rawBodyOf(ctx),
        headers: ctx.request.headers || {},
      });
    status = result.status;
  } catch (error) {
    strapi.log.error(`[magic-mail] Delivery webhook failed: ${error?.name || 'Error'}`);
    status = 500;
  }
  ctx.status = status;
  ctx.body = status === 200 ? { received: true } : { received: false };
};

module.exports = {
  sendgrid: handle('sendgrid'),
  mailgun: handle('mailgun'),
};
