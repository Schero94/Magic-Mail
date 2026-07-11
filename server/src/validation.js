'use strict';

// NOTE: Do not destructure `z` at require-time.
// @strapi/sdk-plugin's bundler (pack-up → @rollup/plugin-commonjs) rewrites
// `const { z } = require('zod')` as an ESM-style named import, which resolves
// to `_interopDefault(require('zod')).default.z` — undefined in zod 3.25+
// because the dual ESM/CJS `.default` branch does not expose the `z`
// namespace. Plain `require('zod')` gives the same API via direct property
// access and sidesteps the rewrite.
const z = require('zod');

const emailString = z.string().email().max(254);
const safeString = z.string().max(1000);
const safeText = z.string().max(100000);

/**
 * Validates that a string contains no newlines (prevents header injection).
 */
const headerSafe = z.string().max(1000).refine(
  (v) => !/[\r\n]/.test(v),
  { message: 'Must not contain newline characters' }
);

/**
 * Bounded string that must not contain CR/LF. Used for MIME part metadata
 * (filenames) that is interpolated into raw message headers by the manual
 * Gmail/Microsoft MIME builders and by provider multipart bodies.
 */
const noNewlineString = (max) => z.string().max(max).refine(
  (v) => !/[\r\n]/.test(v),
  { message: 'Must not contain newline characters' }
);

/**
 * RFC-2045 style MIME type token, e.g. `application/pdf`. Rejects CR/LF and
 * any structural characters that could smuggle extra MIME headers.
 */
const mimeType = z.string().max(128).regex(
  /^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+$/,
  { message: 'Invalid content type' }
);

/** Allowed attachment transfer encodings understood by the providers. */
const attachmentEncoding = z.enum([
  'base64', 'hex', 'binary', 'utf-8', 'utf8', 'ascii', '7bit', '8bit',
  'quoted-printable', 'latin1',
]);

/** Content-ID for inline attachments; interpolated into a `Content-ID` header. */
const contentId = z.string().max(128).regex(
  /^[A-Za-z0-9._%+\-@]+$/,
  { message: 'Invalid content id' }
);

const httpUrl = z.string().url().max(2048).refine((value) => {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}, { message: 'URL must use http or https' });

const unsubscribeUrl = z.string().url().max(2048).refine((value) => {
  try {
    return ['http:', 'https:', 'mailto:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}, { message: 'Unsubscribe URL must use http, https, or mailto' });

const whatsappTemplateName = z.string()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9._-]+$/)
  .refine(
    (value) => !['__proto__', 'prototype', 'constructor'].includes(value.toLowerCase()),
    { message: 'Reserved template name' }
  );

// Provider enum used by both create and update.
const providerEnum = z.enum([
  'smtp', 'nodemailer', 'gmail-oauth', 'microsoft-oauth', 'yahoo-oauth', 'sendgrid', 'mailgun',
]);

// Bounded config record. Keys are limited to 64 chars to prevent abuse
// of JSONB column storage, values must be primitives or one level of
// nested object (for `dkim: { ... }` etc.). Arrays are rejected to avoid
// oversized attachments smuggled into provider configuration.
const configRecord = z.record(
  z.string().max(64),
  z.union([
    z.string().max(4096),
    z.number(),
    z.boolean(),
    z.null(),
    z.record(
      z.string().max(64),
      z.union([z.string().max(4096), z.number(), z.boolean(), z.null()])
    ),
  ])
);

/** @type {Record<string, z.ZodSchema>} */
const schemas = {
  'accounts.create': z
    .object({
      name: safeString,
      description: safeString.optional(),
      provider: providerEnum,
      config: configRecord,
      fromEmail: emailString,
      fromName: headerSafe.optional(),
      replyTo: emailString.optional(),
      // Was missing here even though the admin-UI wizard and accounts.update
      // both include it — strict() was rejecting every create request with
      // "Unrecognized key: isActive" which surfaced as a bare
      // "Validation failed" 500. Parity with accounts.update restored.
      isActive: z.boolean().optional(),
      isPrimary: z.boolean().optional(),
      priority: z.number().int().min(1).max(10).optional(),
      dailyLimit: z.number().int().min(0).max(1_000_000).optional(),
      hourlyLimit: z.number().int().min(0).max(1_000_000).optional(),
    })
    .strict(),

  'accounts.update': z
    .object({
      name: safeString.optional(),
      description: safeString.optional(),
      provider: providerEnum.optional(),
      config: configRecord.optional(),
      fromEmail: emailString.optional(),
      fromName: headerSafe.optional(),
      replyTo: emailString.optional(),
      isActive: z.boolean().optional(),
      isPrimary: z.boolean().optional(),
      priority: z.number().int().min(1).max(10).optional(),
      dailyLimit: z.number().int().min(0).max(1_000_000).optional(),
      hourlyLimit: z.number().int().min(0).max(1_000_000).optional(),
    })
    .strict(),

  'accounts.test': z.object({
    testEmail: emailString.optional(),
    to: emailString.optional(),
    priority: z.enum(['normal', 'high', 'low']).optional(),
    // Accept every email type the send pipeline supports, including
    // 'notification' which the admin Direct Test offers.
    type: z.enum(['transactional', 'marketing', 'notification']).optional(),
    unsubscribeUrl: unsubscribeUrl.optional().nullable(),
  }).refine((d) => d.testEmail || d.to, { message: 'testEmail or to is required' }),

  'accounts.testStrapiService': z.object({
    testEmail: emailString,
    accountName: safeString.optional().nullable(),
  }),

  'oauth.createOAuthAccount': z
    .object({
      provider: z.enum(['gmail', 'microsoft', 'yahoo']),
      code: z.string().min(1).max(4096),
      state: z.string().min(1).max(4096),
      accountDetails: z
        .object({
          name: safeString.optional(),
          description: safeString.optional(),
          fromName: headerSafe.optional(),
          fromEmail: emailString.optional(),
          replyTo: emailString.optional(),
          // Kept in sync with `accounts.create` — if the wizard ever
          // starts submitting isActive through the OAuth flow, this
          // schema accepts it without blowing up.
          isActive: z.boolean().optional(),
          isPrimary: z.boolean().optional(),
          priority: z.number().int().min(1).max(10).optional(),
          dailyLimit: z.number().int().min(0).max(1_000_000).optional(),
          hourlyLimit: z.number().int().min(0).max(1_000_000).optional(),
          config: z
            .object({
              clientId: z.string().min(1).max(512),
              clientSecret: z.string().min(1).max(512),
              tenantId: z.string().max(512).optional(),
              domain: z.string().max(253).optional(),
            })
            .strict(),
        })
        .strict(),
    })
    .strict(),

  'emailDesigner.create': z
    .object({
      // The admin UI stores the reference as a string but coerces it to
      // a number via parseInt() before POSTing. Accepting both shapes
      // keeps the wizard working either way — the service layer stores
      // the DB column as a string regardless.
      templateReferenceId: z.union([
        z.string().regex(/^[1-9]\d*$/).max(10),
        z.number().int().positive(),
      ]).optional().nullable(),
      // Optional/nullable mirrors the content-type schema: Strapi serves
      // absent DB columns as `null`, and the editor re-sends the whole
      // document on save. Accepting null avoids spurious 400s whenever a
      // template has no category/bodyText/tags yet.
      name: safeString.optional().nullable(),
      subject: headerSafe.optional().nullable(),
      bodyHtml: safeText.optional().nullable(),
      bodyText: safeText.optional().nullable(),
      design: z.record(z.string(), z.unknown()).optional().nullable(),
      category: safeString.optional().nullable(),
      isActive: z.boolean().optional().nullable(),
      tags: z.array(safeString).max(50).optional().nullable(),
    })
    .strict(),

  'emailDesigner.update': z
    .object({
      templateReferenceId: z.union([
        z.string().regex(/^[1-9]\d*$/).max(10),
        z.number().int().positive(),
      ]).optional().nullable(),
      name: safeString.optional().nullable(),
      subject: headerSafe.optional().nullable(),
      bodyHtml: safeText.optional().nullable(),
      bodyText: safeText.optional().nullable(),
      design: z.record(z.string(), z.unknown()).optional().nullable(),
      category: safeString.optional().nullable(),
      isActive: z.boolean().optional().nullable(),
      tags: z.array(safeString).max(50).optional().nullable(),
    })
    .strict(),

  'emailDesigner.renderTemplate': z
    .object({
      data: z.record(z.string(), z.unknown()).optional(),
    })
    .strict(),

  'emailDesigner.exportTemplates': z.object({
    templateIds: z.array(z.union([z.string(), z.number()])).optional(),
  }),

  'emailDesigner.importTemplates': z.object({
    templates: z.array(z.record(z.string(), z.unknown())).min(1),
  }),

  'emailDesigner.updateCoreTemplate': z
    .object({
      message: safeText,
      subject: headerSafe,
      design: z.record(z.string(), z.unknown()).optional().nullable(),
      // The editor always submits the plain-text fallback alongside the
      // rich body. Previously strict() rejected this field and every
      // "Save core template" click crashed with a 400 "Validation
      // failed" before the body ever reached the service.
      bodyText: safeText.optional(),
    })
    .strict(),

  'emailDesigner.testSend': z.object({
    to: emailString,
    accountName: safeString.optional().nullable(),
  }),

  'whatsapp.sendTest': z.object({
    phoneNumber: z.string().min(5).max(20).regex(/^[\d+\-() ]+$/),
    message: safeString.optional(),
  }),

  'whatsapp.sendTemplateMessage': z.object({
    phoneNumber: z.string().min(5).max(20).regex(/^[\d+\-() ]+$/),
    templateName: whatsappTemplateName,
    variables: z.record(
      z.string().min(1).max(100).regex(/^[A-Za-z0-9._-]+$/),
      z.union([z.string().max(10000), z.number(), z.boolean(), z.null()])
    ).optional(),
  }),

  'whatsapp.checkNumber': z.object({
    phoneNumber: z.string().min(5).max(20).regex(/^[\d+\-() ]+$/),
  }),

  'whatsapp.saveTemplate': z.object({
    templateName: whatsappTemplateName,
    templateContent: safeText,
  }),

  'whatsapp.templateParam': z.object({
    templateName: whatsappTemplateName,
  }),

  'routingRules.create': z.object({
    name: z.string().min(1).max(255),
    description: safeText.optional().nullable(),
    isActive: z.boolean().optional(),
    priority: z.number().int().min(1).max(1_000_000).optional(),
    matchType: z.enum(['emailType', 'subject', 'recipient', 'template', 'custom']),
    matchValue: z.string().min(1).max(10000),
    accountName: z.string().min(1).max(255),
    fallbackAccountName: z.string().max(255).optional().nullable(),
    whatsappFallback: z.boolean().optional(),
    whatsappPhoneField: z.string().max(255).optional().nullable(),
  }).strict(),

  'routingRules.update': z.object({
    name: z.string().min(1).max(255).optional(),
    description: safeText.optional().nullable(),
    isActive: z.boolean().optional(),
    priority: z.number().int().min(1).max(1_000_000).optional(),
    matchType: z.enum(['emailType', 'subject', 'recipient', 'template', 'custom']).optional(),
    matchValue: z.string().min(1).max(10000).optional(),
    accountName: z.string().min(1).max(255).optional(),
    fallbackAccountName: z.string().max(255).optional().nullable(),
    whatsappFallback: z.boolean().optional(),
    whatsappPhoneField: z.string().max(255).optional().nullable(),
  }).strict(),

  'analytics.statsQuery': z.object({
    userId: z.string().max(255).optional(),
    templateId: z.coerce.number().int().positive().optional(),
    accountId: z.string().max(255).optional(),
    dateFrom: z.string().max(64).refine((value) => !Number.isNaN(Date.parse(value))).optional(),
    dateTo: z.string().max(64).refine((value) => !Number.isNaN(Date.parse(value))).optional(),
  }).strict(),

  'analytics.logsQuery': z.object({
    userId: z.string().max(255).optional(),
    templateId: z.coerce.number().int().positive().optional(),
    search: z.string().max(500).optional(),
    page: z.coerce.number().int().min(1).max(1_000_000).optional(),
    pageSize: z.coerce.number().int().min(1).max(100).optional(),
  }).strict(),

  'pluginSettings.update': z.object({
    enableLinkTracking: z.boolean().optional(),
    enableOpenTracking: z.boolean().optional(),
    trackingBaseUrl: httpUrl.optional().or(z.literal('')),
    defaultFromName: headerSafe.optional(),
    defaultFromEmail: emailString.optional().or(z.literal('')),
    unsubscribeUrl: unsubscribeUrl.optional().or(z.literal('')),
    enableUnsubscribeHeader: z.boolean().optional(),
    // Where to redirect the recipient when a tracking link is no longer
    // resolvable (e.g. retention cleanup removed the row). If empty the
    // tracker renders a static HTML fallback page instead.
    trackingFallbackUrl: httpUrl.optional().or(z.literal('')),
  }),

  // ── Content-API send payloads ───────────────────────────────────────────
  // Bounded attachments to prevent OOM from huge base64 payloads.
  // Max ~25 MB per attachment, max 20 per email, hard cap on filenames.
  // Absolute file paths are deliberately NOT part of this schema — the
  // Content-API strips them before validation (controller.stripAttachmentPaths).

  'content.send': z
    .object({
      to: z.union([emailString, z.array(emailString).max(100), z.string().max(4000)]),
      cc: z.union([emailString, z.array(emailString).max(50), z.string().max(4000)]).optional(),
      bcc: z.union([emailString, z.array(emailString).max(50), z.string().max(4000)]).optional(),
      from: headerSafe.max(320).optional(),
      replyTo: headerSafe.max(320).optional(),
      subject: headerSafe.optional(),
      text: safeText.optional(),
      html: safeText.optional(),
      type: z.enum(['transactional', 'marketing', 'notification']).optional(),
      priority: z.enum(['high', 'normal', 'low']).optional(),
      accountName: safeString.optional(),
      templateId: z.union([z.string().max(128), z.number().int().min(0)]).optional(),
      templateReferenceId: safeString.optional(),
      templateData: z.record(z.string(), z.unknown()).optional(),
      data: z.record(z.string(), z.unknown()).optional(),
      skipLinkTracking: z.boolean().optional(),
      enableTracking: z.boolean().optional(),
      unsubscribeUrl: unsubscribeUrl.optional(),
      userId: z.union([z.string(), z.number()]).optional(),
      recipientName: safeString.optional(),
      attachments: z
        .array(
          z
            .object({
              filename: noNewlineString(255).optional(),
              content: z
                .union([z.string().max(25 * 1024 * 1024), z.instanceof(Buffer)])
                .optional(),
              contentType: mimeType.optional(),
              encoding: attachmentEncoding.optional(),
              cid: contentId.optional(),
            })
            .strict()
        )
        .max(20)
        .optional(),
      headers: z.record(z.string(), headerSafe.max(4000)).optional(),
      phoneNumber: z.string().min(5).max(32).regex(/^[\d+\-() ]+$/).optional(),
    })
    .strict(),

  'content.sendMessage': z
    .object({
      channel: z.enum(['email', 'whatsapp', 'auto']).optional(),
      to: z.string().max(4000).optional(),
      phoneNumber: z.string().min(5).max(32).regex(/^[\d+\-() ]+$/).optional(),
      subject: headerSafe.optional(),
      message: safeText.optional(),
      text: safeText.optional(),
      html: safeText.optional(),
      templateId: z.union([z.string().max(128), z.number().int().min(0)]).optional(),
      templateData: z.record(z.string(), z.unknown()).optional(),
    })
    .strict()
    .refine((d) => !!d.to || !!d.phoneNumber, {
      message: 'Either "to" or "phoneNumber" is required',
    }),

  'content.sendWhatsApp': z
    .object({
      phoneNumber: z.string().min(5).max(32).regex(/^[\d+\-() ]+$/),
      message: safeText.optional(),
      templateId: z.union([z.string().max(128), z.number().int().min(0)]).optional(),
      templateData: z.record(z.string(), z.unknown()).optional(),
    })
    .strict(),

  'content.phoneParam': z.object({
    phoneNumber: z.string().min(5).max(32).regex(/^[\d+\-() ]+$/),
  }),
};

/**
 * Validates request body against a named schema.
 * Returns the parsed data on success, throws ValidationError on failure.
 *
 * Logs the detailed field errors at warn-level on the server so the
 * plugin admin can see exactly which field caused the failure, even
 * without reading the client response. The thrown error still carries
 * the same fieldErrors in its `.details` so `handleControllerError`
 * can propagate them to the API consumer.
 *
 * @param {string} schemaName - Key in the schemas map
 * @param {object} body - ctx.request.body
 * @returns {object} Parsed and validated data
 * @throws {import('@strapi/utils').errors.ValidationError}
 */
/**
 * Strapi populates every read-model response with the following "system"
 * fields. They are not writable through the Document Service and must NOT
 * be part of a request body. But: any caller that loads a record and then
 * PUTs it back — which includes every admin-UI form that spreads the
 * response into the next request — ends up sending them anyway.
 *
 * Instead of forcing every caller to hand-roll a whitelist, we strip these
 * specific keys ourselves before handing the body to the schema. Business
 * fields (the ones the plugin actually cares about) remain subject to
 * `.strict()` validation — unknown business keys still error out, which
 * is what `.strict()` is there for. Typo-level bugs keep getting caught.
 */
const STRAPI_METADATA_FIELDS = Object.freeze([
  'id',
  'documentId',
  'createdAt',
  'updatedAt',
  'publishedAt',
  'locale',
  'localizations',
  'createdBy',
  'updatedBy',
  '__component',
  // Populated relations/components we never want to round-trip as a write:
  'versions',
]);

/**
 * Returns a shallow copy of `body` with Strapi system fields removed.
 * Logs at debug-level when anything was stripped so operators can diagnose
 * a misbehaving client without it becoming log-spam.
 *
 * @param {unknown} body
 * @param {string} schemaName
 * @returns {unknown}
 */
function stripStrapiMetadata(body, schemaName) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return body;
  const cleaned = { ...body };
  const removed = [];
  for (const key of STRAPI_METADATA_FIELDS) {
    if (key in cleaned) {
      delete cleaned[key];
      removed.push(key);
    }
  }
  if (removed.length > 0 && typeof strapi !== 'undefined' && strapi?.log?.debug) {
    strapi.log.debug(
      `[magic-mail] Stripped Strapi metadata from ${schemaName} payload: ${removed.join(', ')}`
    );
  }
  return cleaned;
}

function validate(schemaName, body) {
  const schema = schemas[schemaName];
  if (!schema) {
    throw new Error(`Unknown validation schema: ${schemaName}`);
  }

  const sanitized = stripStrapiMetadata(body, schemaName);
  const result = schema.safeParse(sanitized);
  if (!result.success) {
    const strapiErrors = require('@strapi/utils').errors;
    const flattened = result.error.flatten();
    // eslint-disable-next-line global-require
    const strapiLog = (typeof strapi !== 'undefined' && strapi && strapi.log) ? strapi.log : null;

    // Merge Zod's formErrors (e.g. ".strict() unrecognized keys") into the
    // details payload under a `_form` key so the admin UI can surface them
    // together with per-field errors. Without this, a request that only
    // fails ".strict()" validation would come back with an empty details
    // object — the UI would know it's a 400 but have nothing to display.
    const details = { ...flattened.fieldErrors };
    if (Array.isArray(flattened.formErrors) && flattened.formErrors.length > 0) {
      details._form = flattened.formErrors;
    }

    if (strapiLog) {
      strapiLog.warn(
        `[magic-mail] Validation failed for schema '${schemaName}': ` +
        JSON.stringify({
          fieldErrors: flattened.fieldErrors,
          formErrors: flattened.formErrors,
        })
      );
    }
    throw new strapiErrors.ValidationError('Validation failed', details);
  }

  return result.data;
}

/**
 * Uniform controller error handler for every MagicMail controller.
 *
 * Why this exists: the original per-controller pattern was
 *
 *   catch (err) {
 *     strapi.log.error('...:', err.message);
 *     ctx.throw(err.status || 500, err.message || '...');
 *   }
 *
 * …which swallowed the `.details` payload of any Strapi error class
 * (ValidationError, ApplicationError, ForbiddenError, NotFoundError).
 * A ValidationError with per-field errors became a bare 500 with the
 * generic text "Validation failed" — the UI had no way to tell the
 * user which field to fix.
 *
 * The fix is to detect the standard Strapi error shape (anything
 * exported from `@strapi/utils`.errors) and let Strapi's own
 * error-rendering middleware handle it — it knows the right HTTP
 * status and emits the `{ data: null, error: { status, name,
 * message, details } }` envelope the admin UI already understands.
 *
 * Only genuinely unexpected errors are wrapped as 500.
 *
 * @param {import('koa').Context} ctx
 * @param {Error} err
 * @param {string} logPrefix - Prefix for the server log line, e.g.
 *   '[magic-mail] Error creating account'
 * @param {string} [fallbackMessage] - Message for the 500 wrapper
 */
function handleControllerError(ctx, err, logPrefix, fallbackMessage) {
  // Strapi v5's @strapi/utils error classes do NOT set an `err.status` field
  // — the HTTP status is assigned later by the error-rendering middleware
  // based on the class name. So we identify Strapi errors by prototype
  // chain (primary) or error name (fallback, in case the class reference
  // from this bundle differs from the one thrown inside Strapi core — e.g.
  // when bundlers dedupe differently). Anything matching gets re-thrown
  // unchanged so Strapi's middleware emits the standard
  // `{ data: null, error: { status, name, message, details } }` envelope.
  // eslint-disable-next-line global-require
  const strapiErrors = require('@strapi/utils').errors;

  const knownStrapiNames = new Set([
    'ApplicationError',
    'ValidationError',
    'YupValidationError',
    'PaginationError',
    'NotFoundError',
    'ForbiddenError',
    'UnauthorizedError',
    'PayloadTooLargeError',
    'PolicyError',
    'NotImplementedError',
    'RateLimitError',
    'HttpError',
  ]);

  const isStrapiError =
    (err && typeof err === 'object' && err instanceof strapiErrors.ApplicationError) ||
    (err && typeof err.name === 'string' && knownStrapiNames.has(err.name));

  if (isStrapiError) {
    strapi.log.warn(
      `${logPrefix}: ${err.name} — ${err.message}` +
      (err.details && Object.keys(err.details).length > 0
        ? ` | details=${JSON.stringify(err.details)}`
        : '')
    );
    throw err;
  }

  strapi.log.error(`${logPrefix}:`, err);
  ctx.throw(500, fallbackMessage || err.message || 'Internal server error');
}

module.exports = { validate, schemas, handleControllerError };
