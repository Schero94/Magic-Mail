'use strict';

/**
 * Event hub events for provider-template sends:
 * - `magic-mail.provider-template.failed`: a provider-template send failed
 *   (template not synced or unusable, provider refused it, no account took it);
 * - `magic-mail.provider-template.fallback`: another body was sent instead
 *   (the configured local fallback template, or the designer version of a
 *   core email).
 *
 * Payload: `{ key, code, coreEmailType, fallback? }`. Template key, error
 * code and labels only; never addresses, subjects or template data.
 */

/**
 * Emits `magic-mail.provider-template.<name>` on the event hub (best effort).
 * The payload carries the template key, an error code and non-personal
 * labels only: never addresses, subjects or template data.
 *
 * @param {object} strapi
 * @param {'failed'|'fallback'} name
 * @param {{key: string, code: string|null, coreEmailType?: string|null, fallback?: string}} payload
 * @returns {Promise<void>}
 */
async function emitProviderTemplateEvent(strapi, name, payload) {
  try {
    if (!strapi.eventHub || typeof strapi.eventHub.emit !== 'function') return;
    await strapi.eventHub.emit(`magic-mail.provider-template.${name}`, {
      key: payload.key,
      code: payload.code ?? null,
      coreEmailType: payload.coreEmailType ?? null,
      ...(payload.fallback ? { fallback: payload.fallback } : {}),
    });
  } catch (error) {
    strapi.log?.warn?.(
      `[magic-mail] Provider template event listener failed: ${error?.name || 'Error'}`
    );
  }
}

module.exports = { emitProviderTemplateEvent };
