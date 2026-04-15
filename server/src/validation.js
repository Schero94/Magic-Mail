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

/** @type {Record<string, z.ZodSchema>} */
const schemas = {
  'accounts.create': z.object({
    name: safeString,
    provider: z.enum(['smtp', 'gmail', 'microsoft', 'yahoo', 'ses', 'sendgrid', 'mailgun', 'postmark', 'sparkpost']),
    config: z.record(z.unknown()),
    fromEmail: emailString.optional(),
    fromName: headerSafe.optional(),
    replyTo: emailString.optional(),
    isPrimary: z.boolean().optional(),
    priority: z.number().int().min(0).max(100).optional(),
    dailyLimit: z.number().int().min(0).optional(),
    hourlyLimit: z.number().int().min(0).optional(),
  }).passthrough(),

  'accounts.update': z.object({
    name: safeString.optional(),
    provider: z.enum(['smtp', 'gmail', 'microsoft', 'yahoo', 'ses', 'sendgrid', 'mailgun', 'postmark', 'sparkpost']).optional(),
    config: z.record(z.unknown()).optional(),
    fromEmail: emailString.optional(),
    fromName: headerSafe.optional(),
    replyTo: emailString.optional(),
    isPrimary: z.boolean().optional(),
    priority: z.number().int().min(0).max(100).optional(),
    dailyLimit: z.number().int().min(0).optional(),
    hourlyLimit: z.number().int().min(0).optional(),
  }).passthrough(),

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

  'oauth.createOAuthAccount': z.object({
    provider: z.enum(['gmail', 'microsoft', 'yahoo']),
    code: z.string().min(1).max(4096),
    state: z.string().min(1).max(4096),
    accountDetails: z.object({
      name: safeString.optional(),
      config: z.object({
        clientId: z.string().min(1).max(512),
        clientSecret: z.string().min(1).max(512),
        tenantId: z.string().max(512).optional(),
      }).passthrough(),
    }).passthrough(),
  }),

  'emailDesigner.create': z.object({
    templateReferenceId: safeString.optional(),
    name: safeString.optional(),
    subject: headerSafe.optional(),
    bodyHtml: safeText.optional(),
    bodyText: safeText.optional(),
    design: z.record(z.unknown()).optional().nullable(),
    category: safeString.optional(),
    isActive: z.boolean().optional(),
    tags: z.array(safeString).optional(),
  }).passthrough(),

  'emailDesigner.update': z.object({
    name: safeString.optional(),
    subject: headerSafe.optional(),
    bodyHtml: safeText.optional(),
    bodyText: safeText.optional(),
    design: z.record(z.unknown()).optional().nullable(),
    category: safeString.optional(),
    isActive: z.boolean().optional(),
    tags: z.array(safeString).optional(),
  }).passthrough(),

  'emailDesigner.renderTemplate': z.object({
    data: z.record(z.unknown()).optional(),
  }).passthrough(),

  'emailDesigner.exportTemplates': z.object({
    templateIds: z.array(z.union([z.string(), z.number()])).optional(),
  }),

  'emailDesigner.importTemplates': z.object({
    templates: z.array(z.record(z.unknown())).min(1),
  }),

  'emailDesigner.updateCoreTemplate': z.object({
    message: safeText,
    subject: headerSafe,
    design: z.record(z.unknown()).optional().nullable(),
  }).passthrough(),

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
