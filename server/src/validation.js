'use strict';

const { z } = require('zod');

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

// Provider enum used by both create and update.
const providerEnum = z.enum([
  'smtp', 'gmail', 'microsoft', 'yahoo', 'ses', 'sendgrid', 'mailgun', 'postmark', 'sparkpost',
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
      fromEmail: emailString.optional(),
      fromName: headerSafe.optional(),
      replyTo: emailString.optional(),
      isPrimary: z.boolean().optional(),
      priority: z.number().int().min(0).max(100).optional(),
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
      priority: z.number().int().min(0).max(100).optional(),
      dailyLimit: z.number().int().min(0).max(1_000_000).optional(),
      hourlyLimit: z.number().int().min(0).max(1_000_000).optional(),
    })
    .strict(),

  'accounts.test': z.object({
    testEmail: emailString.optional(),
    to: emailString.optional(),
    priority: z.enum(['normal', 'high', 'low']).optional(),
    type: z.enum(['transactional', 'marketing']).optional(),
    unsubscribeUrl: z.string().url().optional().nullable(),
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
          isPrimary: z.boolean().optional(),
          priority: z.number().int().min(0).max(100).optional(),
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
      templateReferenceId: safeString.optional(),
      name: safeString.optional(),
      subject: headerSafe.optional(),
      bodyHtml: safeText.optional(),
      bodyText: safeText.optional(),
      design: z.record(z.unknown()).optional().nullable(),
      category: safeString.optional(),
      isActive: z.boolean().optional(),
      tags: z.array(safeString).max(50).optional(),
    })
    .strict(),

  'emailDesigner.update': z
    .object({
      name: safeString.optional(),
      subject: headerSafe.optional(),
      bodyHtml: safeText.optional(),
      bodyText: safeText.optional(),
      design: z.record(z.unknown()).optional().nullable(),
      category: safeString.optional(),
      isActive: z.boolean().optional(),
      tags: z.array(safeString).max(50).optional(),
    })
    .strict(),

  'emailDesigner.renderTemplate': z
    .object({
      data: z.record(z.unknown()).optional(),
    })
    .strict(),

  'emailDesigner.exportTemplates': z.object({
    templateIds: z.array(z.union([z.string(), z.number()])).optional(),
  }),

  'emailDesigner.importTemplates': z.object({
    templates: z.array(z.record(z.unknown())).min(1),
  }),

  'emailDesigner.updateCoreTemplate': z
    .object({
      message: safeText,
      subject: headerSafe,
      design: z.record(z.unknown()).optional().nullable(),
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
    templateName: safeString,
    variables: z.record(z.unknown()).optional(),
  }),

  'whatsapp.checkNumber': z.object({
    phoneNumber: z.string().min(5).max(20).regex(/^[\d+\-() ]+$/),
  }),

  'whatsapp.saveTemplate': z.object({
    templateName: safeString,
    templateContent: safeText,
  }),

  'pluginSettings.update': z.object({
    enableLinkTracking: z.boolean().optional(),
    enableOpenTracking: z.boolean().optional(),
    trackingBaseUrl: z.string().url().optional().or(z.literal('')),
    defaultFromName: headerSafe.optional(),
    defaultFromEmail: emailString.optional().or(z.literal('')),
    unsubscribeUrl: z.string().url().optional().or(z.literal('')),
    enableUnsubscribeHeader: z.boolean().optional(),
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
      from: z.string().max(320).optional(),
      replyTo: z.string().max(320).optional(),
      subject: headerSafe.optional(),
      text: safeText.optional(),
      html: safeText.optional(),
      type: z.enum(['transactional', 'marketing', 'notification']).optional(),
      priority: z.enum(['high', 'normal', 'low']).optional(),
      accountName: safeString.optional(),
      templateId: z.union([z.string().max(128), z.number().int().min(0)]).optional(),
      templateReferenceId: safeString.optional(),
      templateData: z.record(z.unknown()).optional(),
      data: z.record(z.unknown()).optional(),
      skipLinkTracking: z.boolean().optional(),
      enableTracking: z.boolean().optional(),
      unsubscribeUrl: z.string().url().max(2048).optional(),
      userId: z.union([z.string(), z.number()]).optional(),
      recipientName: safeString.optional(),
      attachments: z
        .array(
          z
            .object({
              filename: safeString.optional(),
              content: z
                .union([z.string().max(25 * 1024 * 1024), z.instanceof(Buffer)])
                .optional(),
              contentType: z.string().max(128).optional(),
              encoding: z.string().max(32).optional(),
              cid: z.string().max(128).optional(),
            })
            .strict()
        )
        .max(20)
        .optional(),
      headers: z.record(z.string().max(4000)).optional(),
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
      templateData: z.record(z.unknown()).optional(),
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
      templateData: z.record(z.unknown()).optional(),
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
 * @param {string} schemaName - Key in the schemas map
 * @param {object} body - ctx.request.body
 * @returns {object} Parsed and validated data
 * @throws {import('@strapi/utils').errors.ValidationError}
 */
function validate(schemaName, body) {
  const schema = schemas[schemaName];
  if (!schema) {
    throw new Error(`Unknown validation schema: ${schemaName}`);
  }

  const result = schema.safeParse(body);
  if (!result.success) {
    const { errors: strapiErrors } = require('@strapi/utils');
    throw new strapiErrors.ValidationError(
      'Validation failed',
      result.error.flatten().fieldErrors
    );
  }

  return result.data;
}

module.exports = { validate, schemas };
