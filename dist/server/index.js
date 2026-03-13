"use strict";
const require$$0$2 = require("nodemailer");
const require$$0$1 = require("crypto");
const require$$1$1 = require("os");
const require$$0$3 = require("mustache");
const require$$1$2 = require("html-to-text");
const require$$2$2 = require("decode-html");
const require$$0$4 = require("path");
const require$$1$3 = require("fs");
const _interopDefault = (e) => e && e.__esModule ? e : { default: e };
const require$$0__default$1 = /* @__PURE__ */ _interopDefault(require$$0$2);
const require$$0__default = /* @__PURE__ */ _interopDefault(require$$0$1);
const require$$1__default = /* @__PURE__ */ _interopDefault(require$$1$1);
const require$$0__default$2 = /* @__PURE__ */ _interopDefault(require$$0$3);
const require$$1__default$1 = /* @__PURE__ */ _interopDefault(require$$1$2);
const require$$2__default = /* @__PURE__ */ _interopDefault(require$$2$2);
const require$$0__default$3 = /* @__PURE__ */ _interopDefault(require$$0$4);
const require$$1__default$2 = /* @__PURE__ */ _interopDefault(require$$1$3);
var commonjsGlobal = typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : {};
function getDefaultExportFromCjs(x) {
  return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, "default") ? x["default"] : x;
}
var register$1 = ({ strapi: strapi2 }) => {
};
const PLUGIN_NAME = "magic-mail";
const PREFIX = "[magic-mail]";
function formatMessage(prefix, args) {
  if (args.length === 0) return prefix;
  const parts = args.map(
    (arg) => typeof arg === "string" ? arg : JSON.stringify(arg)
  );
  return `${prefix} ${parts.join(" ")}`;
}
function createLogger$3(strapi2) {
  const getDebugMode = () => {
    try {
      const config2 = strapi2.config.get(`plugin::${PLUGIN_NAME}`) || {};
      return config2.debug === true;
    } catch {
      return false;
    }
  };
  return {
    /**
     * Log info - only when debug: true
     */
    info: (...args) => {
      if (getDebugMode()) {
        strapi2.log.info(formatMessage(PREFIX, args));
      }
    },
    /**
     * Log debug - only when debug: true
     */
    debug: (...args) => {
      if (getDebugMode()) {
        strapi2.log.debug(formatMessage(PREFIX, args));
      }
    },
    /**
     * Log warning - only when debug: true
     */
    warn: (...args) => {
      if (getDebugMode()) {
        strapi2.log.warn(formatMessage(PREFIX, args));
      }
    },
    /**
     * Log error - only when debug: true
     */
    error: (...args) => {
      if (getDebugMode()) {
        strapi2.log.error(formatMessage(PREFIX, args));
      }
    },
    /**
     * Force log - always logged (for critical errors only)
     */
    forceError: (...args) => {
      strapi2.log.error(formatMessage(PREFIX, args));
    }
  };
}
var logger = { createLogger: createLogger$3 };
const { createLogger: createLogger$2 } = logger;
var bootstrap$1 = async ({ strapi: strapi2 }) => {
  const log = createLogger$2(strapi2);
  log.info("[BOOTSTRAP] Starting...");
  try {
    const licenseGuardService = strapi2.plugin("magic-mail").service("license-guard");
    setTimeout(async () => {
      try {
        const licenseStatus = await licenseGuardService.initialize();
        if (!licenseStatus.valid && licenseStatus.demo) {
          log.error("╔════════════════════════════════════════════════════════════════╗");
          log.error("║  [ERROR] MAGICMAIL - NO VALID LICENSE                         ║");
          log.error("║                                                                ║");
          log.error("║  This plugin requires a valid license to operate.             ║");
          log.error("║  Please activate your license via Admin UI:                   ║");
          log.error("║  Go to MagicMail -> License tab                               ║");
          log.error("║                                                                ║");
          log.error('║  Click "Generate Free License" to get started!                ║');
          log.error("╚════════════════════════════════════════════════════════════════╝");
        } else if (licenseStatus.gracePeriod) {
          log.warn("[WARNING] Running on grace period (license server unreachable)");
        }
      } catch (err) {
        log.error("[ERROR] License initialization failed:", err.message);
      }
    }, 2e3);
    const accountManager2 = strapi2.plugin("magic-mail").service("account-manager");
    const emailRouter2 = strapi2.plugin("magic-mail").service("email-router");
    const originalEmailService = strapi2.plugin("email")?.service?.("email") || strapi2.plugins?.email?.services?.email;
    if (originalEmailService && originalEmailService.send) {
      const originalSend = originalEmailService.send.bind(originalEmailService);
      originalEmailService.send = async (emailData) => {
        log.info("[EMAIL] Intercepted from native Strapi service");
        log.debug("Email data:", {
          to: emailData.to,
          subject: emailData.subject,
          templateId: emailData.templateId,
          hasHtml: !!emailData.html,
          hasText: !!emailData.text
        });
        try {
          if (emailData.data && !emailData.templateData) {
            emailData.templateData = emailData.data;
          }
          const result = await emailRouter2.send(emailData);
          log.info("[SUCCESS] Email routed successfully through MagicMail");
          return result;
        } catch (magicMailError) {
          log.warn("[WARNING] MagicMail routing failed, falling back to original service");
          log.error("Error:", magicMailError.message);
          return await originalSend(emailData);
        }
      };
      log.info("[SUCCESS] Native email service overridden!");
      log.info("[INFO] All strapi.plugins.email.services.email.send() calls will route through MagicMail");
    } else {
      log.warn("[WARNING] Native email service not found - MagicMail will work standalone");
      log.warn("[INFO] Make sure @strapi/plugin-email is installed");
    }
    const hourlyResetInterval = setInterval(async () => {
      try {
        if (!strapi2 || !strapi2.plugin) {
          strapi2.log.warn("[magic-mail] Strapi not available for hourly reset");
          return;
        }
        const accountMgr = strapi2.plugin("magic-mail").service("account-manager");
        await accountMgr.resetCounters("hourly");
        log.info("[RESET] Hourly counters reset");
      } catch (err) {
        strapi2.log.error("[magic-mail] Hourly reset error:", err.message);
      }
    }, 60 * 60 * 1e3);
    if (!commonjsGlobal.magicMailIntervals) commonjsGlobal.magicMailIntervals = {};
    commonjsGlobal.magicMailIntervals.hourly = hourlyResetInterval;
    const now = /* @__PURE__ */ new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
    const msUntilMidnight = midnight - now;
    setTimeout(async () => {
      try {
        if (!strapi2 || !strapi2.plugin) {
          strapi2.log.warn("[magic-mail] Strapi not available for daily reset");
          return;
        }
        const accountMgr = strapi2.plugin("magic-mail").service("account-manager");
        await accountMgr.resetCounters("daily");
        log.info("[RESET] Daily counters reset");
        const dailyResetInterval = setInterval(async () => {
          try {
            if (!strapi2 || !strapi2.plugin) {
              strapi2.log.warn("[magic-mail] Strapi not available for daily reset");
              return;
            }
            const accountMgr2 = strapi2.plugin("magic-mail").service("account-manager");
            await accountMgr2.resetCounters("daily");
            log.info("[RESET] Daily counters reset");
          } catch (err) {
            strapi2.log.error("[magic-mail] Daily reset error:", err.message);
          }
        }, 24 * 60 * 60 * 1e3);
        commonjsGlobal.magicMailIntervals.daily = dailyResetInterval;
      } catch (err) {
        strapi2.log.error("[magic-mail] Initial daily reset error:", err.message);
      }
    }, msUntilMidnight);
    log.info("[SUCCESS] Counter reset schedules initialized");
    log.info("[SUCCESS] Bootstrap complete");
  } catch (err) {
    log.error("[ERROR] Bootstrap error:", err);
  }
};
const { createLogger: createLogger$1 } = logger;
var destroy$1 = ({ strapi: strapi2 }) => {
  const log = createLogger$1(strapi2);
  if (commonjsGlobal.magicMailIntervals) {
    if (commonjsGlobal.magicMailIntervals.hourly) {
      clearInterval(commonjsGlobal.magicMailIntervals.hourly);
      log.info("Cleared hourly reset interval");
    }
    if (commonjsGlobal.magicMailIntervals.daily) {
      clearInterval(commonjsGlobal.magicMailIntervals.daily);
      log.info("Cleared daily reset interval");
    }
  }
  if (strapi2.licenseGuardMagicMail && strapi2.licenseGuardMagicMail.pingInterval) {
    clearInterval(strapi2.licenseGuardMagicMail.pingInterval);
    log.info("Cleared license ping interval");
  }
  log.info("👋 Plugin destroyed gracefully");
};
var config$1 = {
  default: {
    // Enable debug logging (set to true to see all plugin logs)
    debug: false
  },
  validator() {
  }
};
const kind$7 = "collectionType";
const collectionName$7 = "magic_mail_accounts";
const info$7 = {
  singularName: "email-account",
  pluralName: "email-accounts",
  displayName: "Email Account",
  description: "Email provider accounts for multi-account email sending"
};
const options$7 = {
  draftAndPublish: false
};
const pluginOptions$7 = {
  "content-manager": {
    visible: false
  },
  "content-type-builder": {
    visible: false
  }
};
const attributes$7 = {
  name: {
    type: "string",
    required: true,
    unique: true
  },
  description: {
    type: "text"
  },
  provider: {
    type: "enumeration",
    "enum": [
      "smtp",
      "gmail-oauth",
      "microsoft-oauth",
      "yahoo-oauth",
      "sendgrid",
      "mailgun",
      "ses",
      "nodemailer"
    ],
    required: true,
    "default": "smtp"
  },
  config: {
    type: "json",
    required: true
  },
  oauth: {
    type: "json"
  },
  fromEmail: {
    type: "email",
    required: true
  },
  fromName: {
    type: "string"
  },
  replyTo: {
    type: "email"
  },
  isActive: {
    type: "boolean",
    "default": true,
    required: true
  },
  isPrimary: {
    type: "boolean",
    "default": false
  },
  priority: {
    type: "integer",
    "default": 1,
    min: 1,
    max: 10
  },
  dailyLimit: {
    type: "integer",
    "default": 0
  },
  hourlyLimit: {
    type: "integer",
    "default": 0
  },
  emailsSentToday: {
    type: "integer",
    "default": 0
  },
  emailsSentThisHour: {
    type: "integer",
    "default": 0
  },
  totalEmailsSent: {
    type: "integer",
    "default": 0
  },
  lastUsed: {
    type: "datetime"
  }
};
const require$$0 = {
  kind: kind$7,
  collectionName: collectionName$7,
  info: info$7,
  options: options$7,
  pluginOptions: pluginOptions$7,
  attributes: attributes$7
};
const kind$6 = "collectionType";
const collectionName$6 = "magic_mail_routing_rules";
const info$6 = {
  singularName: "routing-rule",
  pluralName: "routing-rules",
  displayName: "Email Routing Rule",
  description: "Rules for routing emails to specific accounts"
};
const options$6 = {
  draftAndPublish: false
};
const pluginOptions$6 = {
  "content-manager": {
    visible: false
  },
  "content-type-builder": {
    visible: false
  }
};
const attributes$6 = {
  name: {
    type: "string",
    required: true,
    unique: true
  },
  description: {
    type: "text"
  },
  isActive: {
    type: "boolean",
    "default": true,
    required: true
  },
  priority: {
    type: "integer",
    "default": 1,
    min: 1
  },
  matchType: {
    type: "enumeration",
    "enum": [
      "emailType",
      "subject",
      "recipient",
      "template",
      "custom"
    ],
    required: true,
    "default": "emailType"
  },
  matchValue: {
    type: "text",
    required: true
  },
  accountName: {
    type: "string",
    required: true
  },
  fallbackAccountName: {
    type: "string"
  },
  whatsappFallback: {
    type: "boolean",
    "default": false
  },
  whatsappPhoneField: {
    type: "string"
  }
};
const require$$1 = {
  kind: kind$6,
  collectionName: collectionName$6,
  info: info$6,
  options: options$6,
  pluginOptions: pluginOptions$6,
  attributes: attributes$6
};
const kind$5 = "collectionType";
const collectionName$5 = "magic_mail_email_logs";
const info$5 = {
  singularName: "email-log",
  pluralName: "email-logs",
  displayName: "Email Log",
  description: "Tracks all sent emails with user association"
};
const options$5 = {
  draftAndPublish: false
};
const pluginOptions$5 = {
  "content-manager": {
    visible: false
  },
  "content-type-builder": {
    visible: false
  }
};
const attributes$5 = {
  emailId: {
    type: "string",
    required: true,
    unique: true
  },
  user: {
    type: "relation",
    relation: "manyToOne",
    target: "plugin::users-permissions.user"
  },
  recipient: {
    type: "email",
    required: true
  },
  recipientName: {
    type: "string"
  },
  subject: {
    type: "string",
    required: true
  },
  templateId: {
    type: "integer"
  },
  templateName: {
    type: "string"
  },
  accountId: {
    type: "string"
  },
  accountName: {
    type: "string"
  },
  sentAt: {
    type: "datetime",
    required: true
  },
  deliveredAt: {
    type: "datetime"
  },
  firstOpenedAt: {
    type: "datetime"
  },
  lastOpenedAt: {
    type: "datetime"
  },
  openCount: {
    type: "integer",
    "default": 0
  },
  clickCount: {
    type: "integer",
    "default": 0
  },
  bounced: {
    type: "boolean",
    "default": false
  },
  bounceReason: {
    type: "text"
  },
  unsubscribed: {
    type: "boolean",
    "default": false
  },
  unsubscribedAt: {
    type: "datetime"
  },
  metadata: {
    type: "json"
  },
  events: {
    type: "relation",
    relation: "oneToMany",
    target: "plugin::magic-mail.email-event",
    mappedBy: "emailLog"
  },
  links: {
    type: "relation",
    relation: "oneToMany",
    target: "plugin::magic-mail.email-link",
    mappedBy: "emailLog"
  }
};
const require$$2$1 = {
  kind: kind$5,
  collectionName: collectionName$5,
  info: info$5,
  options: options$5,
  pluginOptions: pluginOptions$5,
  attributes: attributes$5
};
const kind$4 = "collectionType";
const collectionName$4 = "magic_mail_email_events";
const info$4 = {
  singularName: "email-event",
  pluralName: "email-events",
  displayName: "Email Event",
  description: "Individual email tracking events (opens, clicks, bounces)"
};
const options$4 = {
  draftAndPublish: false
};
const pluginOptions$4 = {
  "content-manager": {
    visible: false
  },
  "content-type-builder": {
    visible: false
  }
};
const attributes$4 = {
  emailLog: {
    type: "relation",
    relation: "manyToOne",
    target: "plugin::magic-mail.email-log",
    inversedBy: "events"
  },
  type: {
    type: "enumeration",
    "enum": [
      "open",
      "click",
      "bounce",
      "complaint",
      "unsubscribe"
    ],
    required: true
  },
  timestamp: {
    type: "datetime",
    required: true
  },
  ipAddress: {
    type: "string"
  },
  userAgent: {
    type: "text"
  },
  location: {
    type: "json"
  },
  linkUrl: {
    type: "text"
  },
  linkText: {
    type: "string"
  },
  metadata: {
    type: "json"
  }
};
const require$$3 = {
  kind: kind$4,
  collectionName: collectionName$4,
  info: info$4,
  options: options$4,
  pluginOptions: pluginOptions$4,
  attributes: attributes$4
};
const kind$3 = "collectionType";
const collectionName$3 = "magic_mail_email_links";
const info$3 = {
  singularName: "email-link",
  pluralName: "email-links",
  displayName: "Email Link",
  description: "Stores click tracking links for emails"
};
const options$3 = {
  draftAndPublish: false
};
const pluginOptions$3 = {
  "content-manager": {
    visible: false
  },
  "content-type-builder": {
    visible: false
  }
};
const attributes$3 = {
  emailLog: {
    type: "relation",
    relation: "manyToOne",
    target: "plugin::magic-mail.email-log",
    inversedBy: "links"
  },
  linkHash: {
    type: "string",
    required: true,
    unique: false
  },
  originalUrl: {
    type: "text",
    required: true
  },
  clickCount: {
    type: "integer",
    "default": 0
  },
  firstClickedAt: {
    type: "datetime"
  },
  lastClickedAt: {
    type: "datetime"
  }
};
const require$$4 = {
  kind: kind$3,
  collectionName: collectionName$3,
  info: info$3,
  options: options$3,
  pluginOptions: pluginOptions$3,
  attributes: attributes$3
};
const kind$2 = "collectionType";
const collectionName$2 = "magic_mail_email_templates";
const info$2 = {
  singularName: "email-template",
  pluralName: "email-templates",
  displayName: "Email Template",
  description: "Email templates created with the visual designer"
};
const options$2 = {
  draftAndPublish: false,
  timestamps: true
};
const pluginOptions$2 = {
  "content-manager": {
    visible: false
  },
  "content-type-builder": {
    visible: false
  }
};
const attributes$2 = {
  templateReferenceId: {
    type: "integer",
    required: true,
    unique: true,
    configurable: false
  },
  name: {
    type: "string",
    required: true,
    configurable: false
  },
  subject: {
    type: "string",
    required: true,
    configurable: false
  },
  design: {
    type: "json",
    configurable: false
  },
  bodyHtml: {
    type: "text",
    configurable: false
  },
  bodyText: {
    type: "text",
    configurable: false
  },
  category: {
    type: "enumeration",
    "enum": [
      "transactional",
      "marketing",
      "notification",
      "custom"
    ],
    "default": "custom",
    configurable: false
  },
  isActive: {
    type: "boolean",
    "default": true,
    configurable: false
  },
  tags: {
    type: "json",
    configurable: false
  },
  versions: {
    type: "relation",
    relation: "oneToMany",
    target: "plugin::magic-mail.email-template-version",
    mappedBy: "template"
  }
};
const require$$5 = {
  kind: kind$2,
  collectionName: collectionName$2,
  info: info$2,
  options: options$2,
  pluginOptions: pluginOptions$2,
  attributes: attributes$2
};
const kind$1 = "collectionType";
const collectionName$1 = "magic_mail_email_template_versions";
const info$1 = {
  singularName: "email-template-version",
  pluralName: "email-template-versions",
  displayName: "Email Template Version",
  description: "Version history for email templates"
};
const options$1 = {
  draftAndPublish: false,
  timestamps: true
};
const pluginOptions$1 = {
  "content-manager": {
    visible: false
  },
  "content-type-builder": {
    visible: false
  }
};
const attributes$1 = {
  template: {
    type: "relation",
    relation: "manyToOne",
    target: "plugin::magic-mail.email-template",
    inversedBy: "versions"
  },
  versionNumber: {
    type: "integer",
    required: true,
    configurable: false
  },
  name: {
    type: "string",
    configurable: false
  },
  subject: {
    type: "string",
    configurable: false
  },
  design: {
    type: "json",
    configurable: false
  },
  bodyHtml: {
    type: "text",
    configurable: false
  },
  bodyText: {
    type: "text",
    configurable: false
  },
  tags: {
    type: "json",
    configurable: false
  }
};
const require$$6 = {
  kind: kind$1,
  collectionName: collectionName$1,
  info: info$1,
  options: options$1,
  pluginOptions: pluginOptions$1,
  attributes: attributes$1
};
const kind = "singleType";
const collectionName = "magic_mail_settings";
const info = {
  singularName: "plugin-settings",
  pluralName: "plugin-settings",
  displayName: "MagicMail Settings"
};
const options = {
  draftAndPublish: false,
  comment: "Global settings for MagicMail plugin"
};
const pluginOptions = {
  "content-manager": {
    visible: false
  },
  "content-type-builder": {
    visible: false
  }
};
const attributes = {
  enableLinkTracking: {
    type: "boolean",
    "default": true,
    configurable: false
  },
  enableOpenTracking: {
    type: "boolean",
    "default": true,
    configurable: false
  },
  trackingBaseUrl: {
    type: "string",
    configurable: false
  },
  defaultFromName: {
    type: "string",
    configurable: false
  },
  defaultFromEmail: {
    type: "string",
    configurable: false
  },
  unsubscribeUrl: {
    type: "string",
    configurable: false
  },
  enableUnsubscribeHeader: {
    type: "boolean",
    "default": true,
    configurable: false
  }
};
const require$$7 = {
  kind,
  collectionName,
  info,
  options,
  pluginOptions,
  attributes
};
const emailAccount = require$$0;
const routingRule = require$$1;
const emailLog = require$$2$1;
const emailEvent = require$$3;
const emailLink = require$$4;
const emailTemplate = require$$5;
const emailTemplateVersion = require$$6;
const pluginSettings$4 = require$$7;
var contentTypes$1 = {
  "email-account": {
    schema: emailAccount
  },
  "routing-rule": {
    schema: routingRule
  },
  "email-log": {
    schema: emailLog
  },
  "email-event": {
    schema: emailEvent
  },
  "email-link": {
    schema: emailLink
  },
  "email-template": {
    schema: emailTemplate
  },
  "email-template-version": {
    schema: emailTemplateVersion
  },
  "plugin-settings": {
    schema: pluginSettings$4
  }
};
function stripAttachmentPaths(body) {
  if (body.attachments && Array.isArray(body.attachments)) {
    body.attachments = body.attachments.map(({ path: path2, ...safe }) => safe);
  }
  return body;
}
var controller$1 = {
  /**
   * Send email via MagicMail router
   */
  async send(ctx) {
    try {
      const body = stripAttachmentPaths({ ...ctx.request.body });
      if (!body || !body.to) {
        return ctx.badRequest("Recipient (to) is required");
      }
      const emailRouter2 = strapi.plugin("magic-mail").service("email-router");
      const result = await emailRouter2.send(body);
      ctx.body = {
        success: true,
        ...result
      };
    } catch (err) {
      strapi.log.error("[magic-mail] Error sending email:", err.message);
      ctx.throw(err.status || 500, err.message || "Failed to send email");
    }
  },
  /**
   * Send message via Email or WhatsApp (unified API)
   */
  async sendMessage(ctx) {
    try {
      const body = stripAttachmentPaths({ ...ctx.request.body });
      if (!body || !body.to && !body.phoneNumber) {
        return ctx.badRequest("Recipient (to or phoneNumber) is required");
      }
      const emailRouter2 = strapi.plugin("magic-mail").service("email-router");
      const result = await emailRouter2.sendMessage(body);
      ctx.body = {
        success: true,
        ...result
      };
    } catch (err) {
      strapi.log.error("[magic-mail] Error sending message:", err.message);
      ctx.throw(err.status || 500, err.message || "Failed to send message");
    }
  },
  /**
   * Send WhatsApp message
   */
  async sendWhatsApp(ctx) {
    try {
      const body = stripAttachmentPaths({ ...ctx.request.body });
      if (!body || !body.phoneNumber) {
        return ctx.badRequest("Phone number is required");
      }
      const emailRouter2 = strapi.plugin("magic-mail").service("email-router");
      const result = await emailRouter2.sendWhatsApp(body);
      ctx.body = {
        success: true,
        ...result
      };
    } catch (err) {
      strapi.log.error("[magic-mail] Error sending WhatsApp:", err.message);
      ctx.throw(err.status || 500, err.message || "Failed to send WhatsApp message");
    }
  },
  /**
   * Get WhatsApp connection status
   */
  async getWhatsAppStatus(ctx) {
    try {
      const emailRouter2 = strapi.plugin("magic-mail").service("email-router");
      const status = emailRouter2.getWhatsAppStatus();
      ctx.body = {
        success: true,
        data: status
      };
    } catch (err) {
      strapi.log.error("[magic-mail] Error getting WhatsApp status:", err.message);
      ctx.status = 503;
      ctx.body = {
        success: false,
        data: {
          isConnected: false,
          status: "error",
          error: err.message
        }
      };
    }
  },
  /**
   * Check if phone number is on WhatsApp
   */
  async checkWhatsAppNumber(ctx) {
    try {
      const { phoneNumber } = ctx.params;
      if (!phoneNumber) {
        return ctx.badRequest("Phone number is required");
      }
      const emailRouter2 = strapi.plugin("magic-mail").service("email-router");
      const result = await emailRouter2.checkWhatsAppNumber(phoneNumber);
      ctx.body = {
        success: true,
        data: result
      };
    } catch (err) {
      strapi.log.error("[magic-mail] Error checking WhatsApp number:", err.message);
      ctx.throw(err.status || 500, err.message || "Failed to check phone number");
    }
  }
};
var accounts$1 = {
  /**
   * Get all email accounts
   */
  async getAll(ctx) {
    try {
      const accountManager2 = strapi.plugin("magic-mail").service("account-manager");
      const accounts2 = await accountManager2.getAllAccounts();
      ctx.body = {
        data: accounts2,
        meta: { count: accounts2.length }
      };
    } catch (err) {
      strapi.log.error("[magic-mail] Error getting accounts:", err);
      ctx.throw(500, "Error fetching email accounts");
    }
  },
  /**
   * Create new email account
   */
  async create(ctx) {
    try {
      const licenseGuard2 = strapi.plugin("magic-mail").service("license-guard");
      const accountData = ctx.request.body;
      const providerAllowed = await licenseGuard2.isProviderAllowed(accountData.provider);
      if (!providerAllowed) {
        ctx.throw(403, `Provider "${accountData.provider}" requires a Premium license or higher. Please upgrade your license.`);
        return;
      }
      const currentAccounts = await strapi.documents("plugin::magic-mail.email-account").count();
      const maxAccounts = await licenseGuard2.getMaxAccounts();
      if (maxAccounts !== -1 && currentAccounts >= maxAccounts) {
        ctx.throw(403, `Account limit reached (${maxAccounts}). Upgrade your license to add more accounts.`);
        return;
      }
      const accountManager2 = strapi.plugin("magic-mail").service("account-manager");
      const account = await accountManager2.createAccount(accountData);
      ctx.body = {
        data: account,
        message: "Email account created successfully"
      };
    } catch (err) {
      strapi.log.error("[magic-mail] Error creating account:", err);
      ctx.throw(err.status || 500, err.message || "Error creating email account");
    }
  },
  /**
   * Get single account with decrypted config (for editing)
   */
  async getOne(ctx) {
    try {
      const { accountId } = ctx.params;
      const accountManager2 = strapi.plugin("magic-mail").service("account-manager");
      const account = await accountManager2.getAccountWithDecryptedConfig(accountId);
      if (!account) {
        return ctx.notFound("Email account not found");
      }
      ctx.body = {
        data: account
      };
    } catch (err) {
      strapi.log.error("[magic-mail] Error getting account:", err.message);
      ctx.throw(err.status || 500, err.message || "Error fetching email account");
    }
  },
  /**
   * Update email account
   */
  async update(ctx) {
    try {
      const { accountId } = ctx.params;
      const accountManager2 = strapi.plugin("magic-mail").service("account-manager");
      const account = await accountManager2.updateAccount(accountId, ctx.request.body);
      if (!account) {
        return ctx.notFound("Email account not found");
      }
      ctx.body = {
        data: account,
        message: "Email account updated successfully"
      };
    } catch (err) {
      strapi.log.error("[magic-mail] Error updating account:", err.message);
      ctx.throw(err.status || 500, err.message || "Error updating email account");
    }
  },
  /**
   * Test email account with validation
   */
  async test(ctx) {
    try {
      const { accountId } = ctx.params;
      const { testEmail, to, priority, type, unsubscribeUrl } = ctx.request.body;
      const recipientEmail = testEmail || to;
      if (!recipientEmail) {
        return ctx.badRequest("testEmail is required");
      }
      const testOptions = {
        priority: priority || "normal",
        type: type || "transactional",
        unsubscribeUrl: unsubscribeUrl || null
      };
      const accountManager2 = strapi.plugin("magic-mail").service("account-manager");
      const result = await accountManager2.testAccount(accountId, recipientEmail, testOptions);
      ctx.body = result;
    } catch (err) {
      strapi.log.error("[magic-mail] Error testing account:", err.message);
      ctx.throw(err.status || 500, err.message || "Error testing email account");
    }
  },
  /**
   * Test Strapi Email Service Integration
   * Tests if MagicMail intercepts native Strapi email service
   */
  async testStrapiService(ctx) {
    try {
      const { testEmail, accountName } = ctx.request.body;
      if (!testEmail) {
        ctx.throw(400, "testEmail is required");
      }
      strapi.log.info("[magic-mail] [TEST] Testing Strapi Email Service integration...");
      strapi.log.info('[magic-mail] [EMAIL] Calling strapi.plugin("email").service("email").send()');
      if (accountName) {
        strapi.log.info(`[magic-mail] [FORCE] Forcing specific account: ${accountName}`);
      }
      const result = await strapi.plugin("email").service("email").send({
        to: testEmail,
        from: "test@magicmail.com",
        subject: "MagicMail Integration Test",
        text: "This email was sent using Strapi's native email service but routed through MagicMail!",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h1 style="color: #0EA5E9;">MagicMail Integration Test</h1>
            <p style="font-size: 16px; color: #374151;">
              This email was sent using <strong>Strapi's native email service</strong> 
              but <strong>routed through MagicMail's smart routing</strong>!
            </p>
            <div style="background: #F0F9FF; border-left: 4px solid #0EA5E9; padding: 15px; margin: 20px 0;">
              <h3 style="margin-top: 0; color: #0369A1;">Integration Working</h3>
              <p style="margin: 0;">
                MagicMail successfully intercepted the email and applied:
              </p>
              <ul style="margin: 10px 0;">
                <li>Smart routing rules</li>
                <li>Account selection (${accountName ? "Forced: " + accountName : "Primary or by routing rules"})</li>
                <li>Rate limiting</li>
                <li>Email logging</li>
                <li>Statistics tracking</li>
              </ul>
            </div>
            <div style="background: #DCFCE7; border: 1px solid #22C55E; border-radius: 8px; padding: 15px; margin: 20px 0;">
              <h3 style="margin-top: 0; color: #15803D;">Security Features Active</h3>
              <ul style="margin: 10px 0; padding-left: 20px;">
                <li>TLS/SSL Encryption enforced</li>
                <li>Email content validated</li>
                <li>Proper headers included</li>
                <li>Message-ID generated</li>
              </ul>
            </div>
            <p style="color: #6B7280; font-size: 14px; margin-top: 30px;">
              Sent at: ${(/* @__PURE__ */ new Date()).toLocaleString()}<br>
              Via: MagicMail Email Router
            </p>
          </div>
        `,
        type: "transactional",
        accountName: accountName || null
        // Force specific account if provided
      });
      strapi.log.info("[magic-mail] [SUCCESS] Strapi Email Service test completed");
      ctx.body = {
        success: true,
        message: "Email sent via Strapi Email Service (intercepted by MagicMail)",
        result,
        info: {
          method: 'strapi.plugin("email").service("email").send()',
          intercepted: true,
          routedThrough: "MagicMail"
        }
      };
    } catch (err) {
      strapi.log.error("[magic-mail] [ERROR] Strapi Email Service test failed:", err);
      ctx.body = {
        success: false,
        message: "Failed to send test email",
        error: err.message
      };
      ctx.status = 500;
    }
  },
  /**
   * Delete email account
   */
  async delete(ctx) {
    try {
      const { accountId } = ctx.params;
      const accountManager2 = strapi.plugin("magic-mail").service("account-manager");
      await accountManager2.deleteAccount(accountId);
      ctx.body = {
        message: "Email account deleted successfully"
      };
    } catch (err) {
      strapi.log.error("[magic-mail] Error deleting account:", err);
      ctx.throw(500, "Error deleting email account");
    }
  }
};
function escapeHtml(str) {
  return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
function escapeJs(str) {
  return String(str || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "\\r");
}
var oauth$3 = {
  /**
   * Initiate Gmail OAuth flow
   */
  async gmailAuth(ctx) {
    try {
      const { clientId } = ctx.query;
      if (!clientId) {
        return ctx.badRequest("Client ID is required");
      }
      const oauthService = strapi.plugin("magic-mail").service("oauth");
      const state = Buffer.from(JSON.stringify({
        timestamp: Date.now(),
        clientId
      })).toString("base64");
      const authUrl = oauthService.getGmailAuthUrl(clientId, state);
      ctx.body = {
        authUrl,
        message: "Redirect user to this URL to authorize"
      };
    } catch (err) {
      strapi.log.error("[magic-mail] Gmail OAuth init error:", err);
      ctx.throw(500, err.message);
    }
  },
  /**
   * Handle Gmail OAuth callback
   */
  async gmailCallback(ctx) {
    try {
      const { code, state, error } = ctx.query;
      if (error) {
        ctx.type = "html";
        ctx.body = `
          <!DOCTYPE html>
          <html>
          <head>
            <title>OAuth Failed</title>
            <style>
              body { font-family: system-ui; text-align: center; padding: 50px; }
              .error { color: #ef4444; font-size: 24px; margin: 20px 0; }
            </style>
          </head>
          <body>
            <div class="error">[ERROR] OAuth Authorization Failed</div>
            <p>Error: ${escapeHtml(error)}</p>
            <p>You can close this window and try again.</p>
            <script>
              setTimeout(() => window.close(), 3000);
            <\/script>
          </body>
          </html>
        `;
        return;
      }
      if (!code) {
        return ctx.badRequest("No authorization code received");
      }
      ctx.type = "html";
      ctx.body = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>OAuth Success</title>
          <style>
            body { 
              font-family: system-ui; 
              text-align: center; 
              padding: 50px;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
            }
            .success { font-size: 72px; margin: 20px 0; }
            .message { font-size: 24px; font-weight: 600; }
            .note { font-size: 14px; opacity: 0.9; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="success">[SUCCESS]</div>
          <div class="message">Gmail OAuth Authorized!</div>
          <div class="note">Closing window...</div>
          <script>
            if (window.opener) {
              // Send data to parent window
              window.opener.postMessage({
                type: 'gmail-oauth-success',
                code: '${escapeJs(code)}',
                state: '${escapeJs(state)}'
              }, window.location.origin);
              
              setTimeout(() => window.close(), 1500);
            } else {
              // Fallback: redirect to admin panel
              setTimeout(() => {
                window.location.href = '/admin/plugins/magic-mail?oauth_code=' + encodeURIComponent('${escapeJs(code)}') + '&oauth_state=' + encodeURIComponent('${escapeJs(state)}');
              }, 2000);
            }
          <\/script>
        </body>
        </html>
      `;
    } catch (err) {
      strapi.log.error("[magic-mail] Gmail OAuth callback error:", err);
      ctx.throw(500, err.message);
    }
  },
  /**
   * Initiate Microsoft OAuth flow
   */
  async microsoftAuth(ctx) {
    try {
      const { clientId, tenantId } = ctx.query;
      if (!clientId) {
        return ctx.badRequest("Client ID is required");
      }
      if (!tenantId) {
        return ctx.badRequest("Tenant ID is required");
      }
      const oauthService = strapi.plugin("magic-mail").service("oauth");
      const state = Buffer.from(JSON.stringify({
        timestamp: Date.now(),
        clientId,
        tenantId
      })).toString("base64");
      const authUrl = oauthService.getMicrosoftAuthUrl(clientId, tenantId, state);
      ctx.body = {
        authUrl,
        message: "Redirect user to this URL to authorize"
      };
    } catch (err) {
      strapi.log.error("[magic-mail] Microsoft OAuth init error:", err);
      ctx.throw(500, err.message);
    }
  },
  /**
   * Handle Microsoft OAuth callback
   */
  async microsoftCallback(ctx) {
    try {
      const { code, state, error } = ctx.query;
      if (error) {
        ctx.type = "html";
        ctx.body = `
          <!DOCTYPE html>
          <html>
          <head>
            <title>OAuth Failed</title>
            <style>
              body { font-family: system-ui; text-align: center; padding: 50px; }
              .error { color: #ef4444; font-size: 24px; margin: 20px 0; }
            </style>
          </head>
          <body>
            <div class="error">[ERROR] OAuth Authorization Failed</div>
            <p>Error: ${escapeHtml(error)}</p>
            <p>You can close this window and try again.</p>
            <script>
              setTimeout(() => window.close(), 3000);
            <\/script>
          </body>
          </html>
        `;
        return;
      }
      if (!code) {
        return ctx.badRequest("No authorization code received");
      }
      ctx.type = "html";
      ctx.body = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>OAuth Success</title>
          <style>
            body { 
              font-family: system-ui; 
              text-align: center; 
              padding: 50px;
              background: linear-gradient(135deg, #00A4EF 0%, #0078D4 100%);
              color: white;
            }
            .success { font-size: 72px; margin: 20px 0; }
            .message { font-size: 24px; font-weight: 600; }
            .note { font-size: 14px; opacity: 0.9; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="success">[SUCCESS]</div>
          <div class="message">Microsoft OAuth Authorized!</div>
          <div class="note">Closing window...</div>
          <script>
            if (window.opener) {
              // Send data to parent window
              window.opener.postMessage({
                type: 'microsoft-oauth-success',
                code: '${escapeJs(code)}',
                state: '${escapeJs(state)}'
              }, window.location.origin);
              
              setTimeout(() => window.close(), 1500);
            } else {
              // Fallback: redirect to admin panel
              setTimeout(() => {
                window.location.href = '/admin/plugins/magic-mail?oauth_code=' + encodeURIComponent('${escapeJs(code)}') + '&oauth_state=' + encodeURIComponent('${escapeJs(state)}');
              }, 2000);
            }
          <\/script>
        </body>
        </html>
      `;
    } catch (err) {
      strapi.log.error("[magic-mail] Microsoft OAuth callback error:", err);
      ctx.throw(500, err.message);
    }
  },
  /**
   * Initiate Yahoo OAuth flow
   */
  async yahooAuth(ctx) {
    try {
      const { clientId } = ctx.query;
      if (!clientId) {
        return ctx.badRequest("Client ID is required");
      }
      const oauthService = strapi.plugin("magic-mail").service("oauth");
      const state = Buffer.from(JSON.stringify({
        timestamp: Date.now(),
        clientId
      })).toString("base64");
      const authUrl = oauthService.getYahooAuthUrl(clientId, state);
      ctx.body = {
        authUrl,
        message: "Redirect user to this URL to authorize"
      };
    } catch (err) {
      strapi.log.error("[magic-mail] Yahoo OAuth init error:", err);
      ctx.throw(500, err.message);
    }
  },
  /**
   * Handle Yahoo OAuth callback
   */
  async yahooCallback(ctx) {
    try {
      const { code, state, error } = ctx.query;
      if (error) {
        ctx.type = "html";
        ctx.body = `
          <!DOCTYPE html>
          <html>
          <head>
            <title>OAuth Failed</title>
            <style>
              body { font-family: system-ui; text-align: center; padding: 50px; }
              .error { color: #ef4444; font-size: 24px; margin: 20px 0; }
            </style>
          </head>
          <body>
            <div class="error">[ERROR] OAuth Authorization Failed</div>
            <p>Error: ${escapeHtml(error)}</p>
            <p>You can close this window and try again.</p>
            <script>
              setTimeout(() => window.close(), 3000);
            <\/script>
          </body>
          </html>
        `;
        return;
      }
      if (!code) {
        return ctx.badRequest("No authorization code received");
      }
      ctx.type = "html";
      ctx.body = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>OAuth Success</title>
          <style>
            body { 
              font-family: system-ui; 
              text-align: center; 
              padding: 50px;
              background: linear-gradient(135deg, #6001D2 0%, #410096 100%);
              color: white;
            }
            .success { font-size: 72px; margin: 20px 0; }
            .message { font-size: 24px; font-weight: 600; }
            .note { font-size: 14px; opacity: 0.9; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="success">[SUCCESS]</div>
          <div class="message">Yahoo Mail OAuth Authorized!</div>
          <div class="note">Closing window...</div>
          <script>
            if (window.opener) {
              // Send data to parent window
              window.opener.postMessage({
                type: 'yahoo-oauth-success',
                code: '${escapeJs(code)}',
                state: '${escapeJs(state)}'
              }, window.location.origin);
              
              setTimeout(() => window.close(), 1500);
            } else {
              // Fallback: redirect to admin panel
              setTimeout(() => {
                window.location.href = '/admin/plugins/magic-mail?oauth_code=' + encodeURIComponent('${escapeJs(code)}') + '&oauth_state=' + encodeURIComponent('${escapeJs(state)}');
              }, 2000);
            }
          <\/script>
        </body>
        </html>
      `;
    } catch (err) {
      strapi.log.error("[magic-mail] Yahoo OAuth callback error:", err);
      ctx.throw(500, err.message);
    }
  },
  /**
   * Create account from OAuth tokens
   */
  async createOAuthAccount(ctx) {
    try {
      const { provider, code, state, accountDetails } = ctx.request.body;
      strapi.log.info("[magic-mail] Creating OAuth account...");
      strapi.log.info("[magic-mail] Provider:", provider);
      strapi.log.info("[magic-mail] Account name:", accountDetails?.name);
      if (provider !== "gmail" && provider !== "microsoft" && provider !== "yahoo") {
        return ctx.badRequest("Only Gmail, Microsoft and Yahoo OAuth supported");
      }
      if (!code) {
        return ctx.badRequest("OAuth code is required");
      }
      const licenseGuard2 = strapi.plugin("magic-mail").service("license-guard");
      const providerKey = `${provider}-oauth`;
      const providerAllowed = await licenseGuard2.isProviderAllowed(providerKey);
      if (!providerAllowed) {
        ctx.throw(403, `OAuth provider "${provider}" requires a Premium license or higher. Please upgrade your license.`);
        return;
      }
      const currentAccounts = await strapi.documents("plugin::magic-mail.email-account").count();
      const maxAccounts = await licenseGuard2.getMaxAccounts();
      if (maxAccounts !== -1 && currentAccounts >= maxAccounts) {
        ctx.throw(403, `Account limit reached (${maxAccounts}). Upgrade your license to add more accounts.`);
        return;
      }
      const stateData = JSON.parse(Buffer.from(state, "base64").toString());
      if (!accountDetails.config?.clientId || !accountDetails.config?.clientSecret) {
        return ctx.badRequest("Client ID and Secret are required");
      }
      const oauthService = strapi.plugin("magic-mail").service("oauth");
      let tokenData;
      if (provider === "gmail") {
        strapi.log.info("[magic-mail] Calling exchangeGoogleCode...");
        tokenData = await oauthService.exchangeGoogleCode(
          code,
          accountDetails.config.clientId,
          accountDetails.config.clientSecret
        );
      } else if (provider === "microsoft") {
        strapi.log.info("[magic-mail] Calling exchangeMicrosoftCode...");
        if (!accountDetails.config.tenantId) {
          throw new Error("Tenant ID is required for Microsoft OAuth");
        }
        tokenData = await oauthService.exchangeMicrosoftCode(
          code,
          accountDetails.config.clientId,
          accountDetails.config.clientSecret,
          accountDetails.config.tenantId
        );
      } else if (provider === "yahoo") {
        strapi.log.info("[magic-mail] Calling exchangeYahooCode...");
        tokenData = await oauthService.exchangeYahooCode(
          code,
          accountDetails.config.clientId,
          accountDetails.config.clientSecret
        );
      }
      strapi.log.info("[magic-mail] Token data received:", {
        email: tokenData.email,
        hasAccessToken: !!tokenData.accessToken,
        hasRefreshToken: !!tokenData.refreshToken
      });
      if (!tokenData.email) {
        strapi.log.error("[magic-mail] No email in tokenData!");
        throw new Error(`Failed to get email from ${provider} OAuth`);
      }
      strapi.log.info("[magic-mail] Calling storeOAuthAccount...");
      const account = await oauthService.storeOAuthAccount(
        provider,
        tokenData,
        accountDetails,
        accountDetails.config
        // contains clientId and clientSecret
      );
      strapi.log.info("[magic-mail] [SUCCESS] OAuth account created successfully");
      ctx.body = {
        success: true,
        data: account,
        message: "OAuth account created successfully"
      };
    } catch (err) {
      strapi.log.error("[magic-mail] Create OAuth account error:", err);
      strapi.log.error("[magic-mail] Error stack:", err.stack);
      ctx.throw(500, err.message);
    }
  }
};
const ROUTING_RULE_UID = "plugin::magic-mail.routing-rule";
const ALLOWED_RULE_FIELDS = ["name", "conditions", "accountName", "priority", "isActive", "matchType", "matchField", "matchValue", "description"];
function sanitizeRuleData(body) {
  const data = {};
  for (const field of ALLOWED_RULE_FIELDS) {
    if (body[field] !== void 0) {
      data[field] = body[field];
    }
  }
  return data;
}
var routingRules$1 = {
  /**
   * Get all routing rules
   */
  async getAll(ctx) {
    try {
      const rules = await strapi.documents(ROUTING_RULE_UID).findMany({
        sort: [{ priority: "asc" }]
      });
      ctx.body = {
        data: rules
      };
    } catch (err) {
      strapi.log.error("[magic-mail] Error getting routing rules:", err.message);
      ctx.throw(err.status || 500, err.message || "Error fetching routing rules");
    }
  },
  /**
   * Get single routing rule
   */
  async getOne(ctx) {
    try {
      const { ruleId } = ctx.params;
      const rule = await strapi.documents(ROUTING_RULE_UID).findOne({
        documentId: ruleId
      });
      if (!rule) {
        return ctx.notFound("Routing rule not found");
      }
      ctx.body = {
        data: rule
      };
    } catch (err) {
      strapi.log.error("[magic-mail] Error getting routing rule:", err.message);
      ctx.throw(err.status || 500, err.message || "Error fetching routing rule");
    }
  },
  /**
   * Create new routing rule with input sanitization
   */
  async create(ctx) {
    try {
      const licenseGuard2 = strapi.plugin("magic-mail").service("license-guard");
      const currentRules = await strapi.documents(ROUTING_RULE_UID).count();
      const maxRules = await licenseGuard2.getMaxRoutingRules();
      if (maxRules !== -1 && currentRules >= maxRules) {
        return ctx.forbidden(`Routing rule limit reached (${maxRules}). Upgrade to Advanced license for unlimited rules.`);
      }
      const data = sanitizeRuleData(ctx.request.body);
      const rule = await strapi.documents(ROUTING_RULE_UID).create({ data });
      ctx.body = {
        data: rule,
        message: "Routing rule created successfully"
      };
      strapi.log.info(`[magic-mail] [SUCCESS] Routing rule created: ${rule.name}`);
    } catch (err) {
      strapi.log.error("[magic-mail] Error creating routing rule:", err.message);
      ctx.throw(err.status || 500, err.message || "Error creating routing rule");
    }
  },
  /**
   * Update routing rule with existence check and input sanitization
   */
  async update(ctx) {
    try {
      const { ruleId } = ctx.params;
      const existing = await strapi.documents(ROUTING_RULE_UID).findOne({ documentId: ruleId });
      if (!existing) {
        return ctx.notFound("Routing rule not found");
      }
      const data = sanitizeRuleData(ctx.request.body);
      const rule = await strapi.documents(ROUTING_RULE_UID).update({
        documentId: ruleId,
        data
      });
      ctx.body = {
        data: rule,
        message: "Routing rule updated successfully"
      };
      strapi.log.info(`[magic-mail] [SUCCESS] Routing rule updated: ${rule.name}`);
    } catch (err) {
      strapi.log.error("[magic-mail] Error updating routing rule:", err.message);
      ctx.throw(err.status || 500, err.message || "Error updating routing rule");
    }
  },
  /**
   * Delete routing rule with existence check
   */
  async delete(ctx) {
    try {
      const { ruleId } = ctx.params;
      const existing = await strapi.documents(ROUTING_RULE_UID).findOne({ documentId: ruleId });
      if (!existing) {
        return ctx.notFound("Routing rule not found");
      }
      await strapi.documents(ROUTING_RULE_UID).delete({
        documentId: ruleId
      });
      ctx.body = {
        message: "Routing rule deleted successfully"
      };
      strapi.log.info(`[magic-mail] Routing rule deleted: ${ruleId}`);
    } catch (err) {
      strapi.log.error("[magic-mail] Error deleting routing rule:", err.message);
      ctx.throw(err.status || 500, err.message || "Error deleting routing rule");
    }
  }
};
var features;
var hasRequiredFeatures;
function requireFeatures() {
  if (hasRequiredFeatures) return features;
  hasRequiredFeatures = 1;
  features = {
    // FREE/DEMO Features
    free: {
      maxAccounts: 3,
      // 3 Accounts (can be OAuth!)
      maxRoutingRules: 5,
      maxEmailTemplates: 25,
      // 25 Templates - Genug zum Testen & kleine Projekte!
      providers: ["smtp", "gmail-oauth", "microsoft-oauth", "yahoo-oauth"],
      // Alle Provider erlaubt!
      features: [
        "basic-smtp",
        "oauth-gmail",
        "oauth-microsoft",
        "oauth-yahoo",
        "basic-routing",
        "email-logging",
        "account-testing",
        "strapi-service-override",
        "email-designer-basic",
        // Basic Email Designer
        "email-designer-import-export"
        // Import/Export auch in Free! (Community-freundlich)
      ]
    },
    // PREMIUM Features
    premium: {
      maxAccounts: 10,
      // 10 Accounts - Perfekt für kleine Teams
      maxRoutingRules: 20,
      maxEmailTemplates: 100,
      // 100 Templates - Mehr als genug für die meisten Projekte
      providers: ["smtp", "gmail-oauth", "microsoft-oauth", "yahoo-oauth"],
      features: [
        "basic-smtp",
        "basic-routing",
        "email-logging",
        "oauth-gmail",
        "oauth-microsoft",
        "oauth-yahoo",
        "account-testing",
        "strapi-service-override",
        "email-designer-basic",
        "email-designer-templates",
        "email-designer-import-export",
        "email-designer-versioning",
        // NEU in Premium: Versionierung!
        "analytics-basic"
        // Basic Analytics
      ]
    },
    // ADVANCED Features
    advanced: {
      maxAccounts: -1,
      // Unlimited
      maxRoutingRules: -1,
      // Unlimited
      maxEmailTemplates: 500,
      // 500 Templates - Für größere Projekte
      providers: ["smtp", "gmail-oauth", "microsoft-oauth", "yahoo-oauth", "sendgrid", "mailgun"],
      features: [
        "basic-smtp",
        "basic-routing",
        "email-logging",
        "oauth-gmail",
        "oauth-microsoft",
        "oauth-yahoo",
        "sendgrid",
        "mailgun",
        "dkim-signing",
        "priority-headers",
        "list-unsubscribe",
        "security-validation",
        "analytics-dashboard",
        "advanced-routing",
        "account-testing",
        "strapi-service-override",
        "email-designer-basic",
        // NEW
        "email-designer-templates",
        // NEW
        "email-designer-versioning",
        // NEW: Template Versioning
        "email-designer-import-export"
        // NEW: Import/Export
      ]
    },
    // ENTERPRISE Features
    enterprise: {
      maxAccounts: -1,
      // Unlimited
      maxRoutingRules: -1,
      // Unlimited
      maxEmailTemplates: -1,
      // Unlimited Templates - Keine Limits!
      providers: ["smtp", "gmail-oauth", "microsoft-oauth", "yahoo-oauth", "sendgrid", "mailgun"],
      features: [
        "basic-smtp",
        "basic-routing",
        "email-logging",
        "oauth-gmail",
        "oauth-microsoft",
        "oauth-yahoo",
        "sendgrid",
        "mailgun",
        "dkim-signing",
        "priority-headers",
        "list-unsubscribe",
        "security-validation",
        "analytics-dashboard",
        "advanced-routing",
        "multi-tenant",
        "compliance-reports",
        "custom-security-rules",
        "priority-support",
        "account-testing",
        "strapi-service-override",
        "email-designer-basic",
        // NEW
        "email-designer-templates",
        // NEW
        "email-designer-versioning",
        // NEW
        "email-designer-import-export",
        // NEW
        "email-designer-custom-blocks",
        // NEW: Custom Blocks
        "email-designer-team-library",
        // NEW: Team Library
        "email-designer-a-b-testing"
        // NEW: A/B Testing
      ]
    },
    /**
     * Check if a feature is available for given license tier
     */
    hasFeature(licenseData, featureName) {
      if (!licenseData) {
        return this.free.features.includes(featureName);
      }
      let isEnterprise = false;
      let isAdvanced = false;
      let isPremium = false;
      if (licenseData.tier) {
        isEnterprise = licenseData.tier === "enterprise";
        isAdvanced = licenseData.tier === "advanced";
        isPremium = licenseData.tier === "premium";
      }
      if (licenseData.features) {
        isEnterprise = isEnterprise || licenseData.features.enterprise === true;
        isAdvanced = isAdvanced || licenseData.features.advanced === true;
        isPremium = isPremium || licenseData.features.premium === true;
      }
      if (licenseData.featureEnterprise === true) {
        isEnterprise = true;
      }
      if (licenseData.featureAdvanced === true) {
        isAdvanced = true;
      }
      if (licenseData.featurePremium === true) {
        isPremium = true;
      }
      if (isEnterprise && this.enterprise.features.includes(featureName)) {
        return true;
      }
      if (isAdvanced && this.advanced.features.includes(featureName)) {
        return true;
      }
      if (isPremium && this.premium.features.includes(featureName)) {
        return true;
      }
      return this.free.features.includes(featureName);
    },
    /**
     * Get max allowed accounts for license tier
     */
    getMaxAccounts(licenseData) {
      if (!licenseData) return this.free.maxAccounts;
      if (licenseData.featureEnterprise === true || licenseData.features?.enterprise === true) return this.enterprise.maxAccounts;
      if (licenseData.featureAdvanced === true || licenseData.features?.advanced === true) return this.advanced.maxAccounts;
      if (licenseData.featurePremium === true || licenseData.features?.premium === true) return this.premium.maxAccounts;
      return this.free.maxAccounts;
    },
    /**
     * Get max allowed routing rules for license tier
     */
    getMaxRoutingRules(licenseData) {
      if (!licenseData) return this.free.maxRoutingRules;
      if (licenseData.featureEnterprise === true || licenseData.features?.enterprise === true) return this.enterprise.maxRoutingRules;
      if (licenseData.featureAdvanced === true || licenseData.features?.advanced === true) return this.advanced.maxRoutingRules;
      if (licenseData.featurePremium === true || licenseData.features?.premium === true) return this.premium.maxRoutingRules;
      return this.free.maxRoutingRules;
    },
    /**
     * Check if provider is allowed for license tier
     */
    isProviderAllowed(licenseData, provider) {
      if (!licenseData) {
        return this.free.providers.includes(provider);
      }
      if (licenseData.featureEnterprise === true || licenseData.features?.enterprise === true) return this.enterprise.providers.includes(provider);
      if (licenseData.featureAdvanced === true || licenseData.features?.advanced === true) return this.advanced.providers.includes(provider);
      if (licenseData.featurePremium === true || licenseData.features?.premium === true) return this.premium.providers.includes(provider);
      return this.free.providers.includes(provider);
    },
    /**
     * Get max allowed email templates for license tier
     */
    getMaxEmailTemplates(licenseData) {
      if (!licenseData) return this.free.maxEmailTemplates;
      if (licenseData.featureEnterprise === true || licenseData.features?.enterprise === true) return this.enterprise.maxEmailTemplates;
      if (licenseData.featureAdvanced === true || licenseData.features?.advanced === true) return this.advanced.maxEmailTemplates;
      if (licenseData.featurePremium === true || licenseData.features?.premium === true) return this.premium.maxEmailTemplates;
      return this.free.maxEmailTemplates;
    }
  };
  return features;
}
var license$1 = ({ strapi: strapi2 }) => ({
  /**
   * Auto-create license with logged-in admin user data
   */
  async autoCreate(ctx) {
    try {
      const adminUser = ctx.state.user;
      if (!adminUser) {
        return ctx.unauthorized("No admin user logged in");
      }
      const licenseGuard2 = strapi2.plugin("magic-mail").service("license-guard");
      const license2 = await licenseGuard2.createLicense({
        email: adminUser.email,
        firstName: adminUser.firstname || "Admin",
        lastName: adminUser.lastname || "User"
      });
      if (!license2) {
        return ctx.badRequest("Failed to create license");
      }
      await licenseGuard2.storeLicenseKey(license2.licenseKey);
      const pingInterval = licenseGuard2.startPinging(license2.licenseKey, 15);
      strapi2.licenseGuardMagicMail = {
        licenseKey: license2.licenseKey,
        pingInterval,
        data: license2
      };
      return ctx.send({
        success: true,
        message: "License automatically created and activated",
        data: license2
      });
    } catch (error) {
      strapi2.log.error("[magic-mail] Error auto-creating license:", error);
      return ctx.badRequest("Error creating license");
    }
  },
  /**
   * Get current license status
   */
  async getStatus(ctx) {
    try {
      const licenseGuard2 = strapi2.plugin("magic-mail").service("license-guard");
      const pluginStore = strapi2.store({
        type: "plugin",
        name: "magic-mail"
      });
      const licenseKey = await pluginStore.get({ key: "licenseKey" });
      if (!licenseKey) {
        return ctx.send({
          success: false,
          demo: true,
          valid: false,
          message: "No license found. Running in demo mode."
        });
      }
      const verification = await licenseGuard2.verifyLicense(licenseKey);
      const license2 = await licenseGuard2.getLicenseByKey(licenseKey);
      return ctx.send({
        success: true,
        valid: verification.valid,
        demo: false,
        data: {
          licenseKey,
          email: license2?.email || null,
          firstName: license2?.firstName || null,
          lastName: license2?.lastName || null,
          isActive: license2?.isActive || false,
          isExpired: license2?.isExpired || false,
          isOnline: license2?.isOnline || false,
          expiresAt: license2?.expiresAt,
          lastPingAt: license2?.lastPingAt,
          deviceName: license2?.deviceName,
          deviceId: license2?.deviceId,
          ipAddress: license2?.ipAddress,
          features: {
            premium: license2?.featurePremium || false,
            advanced: license2?.featureAdvanced || false,
            enterprise: license2?.featureEnterprise || false
          },
          maxDevices: license2?.maxDevices || 1,
          currentDevices: license2?.currentDevices || 0
        }
      });
    } catch (error) {
      strapi2.log.error("[magic-mail] Error getting license status:", error);
      return ctx.badRequest("Error getting license status");
    }
  },
  /**
   * Store and validate an existing license key
   */
  async storeKey(ctx) {
    try {
      const { licenseKey, email } = ctx.request.body;
      if (!licenseKey || !licenseKey.trim()) {
        return ctx.badRequest("License key is required");
      }
      if (!email || !email.trim()) {
        return ctx.badRequest("Email address is required");
      }
      const trimmedKey = licenseKey.trim();
      const trimmedEmail = email.trim().toLowerCase();
      const licenseGuard2 = strapi2.plugin("magic-mail").service("license-guard");
      const verification = await licenseGuard2.verifyLicense(trimmedKey);
      if (!verification.valid) {
        strapi2.log.warn(`[magic-mail] [WARNING]  Invalid license key attempted: ${trimmedKey.substring(0, 8)}...`);
        return ctx.badRequest("Invalid or expired license key");
      }
      const license2 = await licenseGuard2.getLicenseByKey(trimmedKey);
      if (!license2) {
        return ctx.badRequest("License not found");
      }
      if (license2.email.toLowerCase() !== trimmedEmail) {
        strapi2.log.warn(`[magic-mail] [WARNING]  Email mismatch for license key`);
        return ctx.badRequest("Email address does not match this license key");
      }
      await licenseGuard2.storeLicenseKey(trimmedKey);
      const pingInterval = licenseGuard2.startPinging(trimmedKey, 15);
      strapi2.licenseGuardMagicMail = {
        licenseKey: trimmedKey,
        pingInterval,
        data: verification.data
      };
      strapi2.log.info(`[magic-mail] [SUCCESS] License validated and stored`);
      return ctx.send({
        success: true,
        message: "License activated successfully",
        data: verification.data
      });
    } catch (error) {
      strapi2.log.error("[magic-mail] Error storing license key:", error);
      return ctx.badRequest("Error storing license key");
    }
  },
  /**
   * Debug endpoint to check license data
   */
  async debugLicense(ctx) {
    try {
      const licenseGuard2 = strapi2.plugin("magic-mail").service("license-guard");
      const license2 = await licenseGuard2.getCurrentLicense();
      ctx.body = {
        success: true,
        detectedFlags: {
          featurePremium: license2?.featurePremium,
          featureAdvanced: license2?.featureAdvanced,
          featureEnterprise: license2?.featureEnterprise
        },
        detectedTier: license2?.featureEnterprise ? "enterprise" : license2?.featureAdvanced ? "advanced" : license2?.featurePremium ? "premium" : "free"
      };
    } catch (error) {
      strapi2.log.error("[magic-mail] Error in debugLicense:", error);
      ctx.throw(500, "Error debugging license");
    }
  },
  /**
   * Get license limits and available features
   */
  async getLimits(ctx) {
    try {
      const licenseGuard2 = strapi2.plugin("magic-mail").service("license-guard");
      const features2 = requireFeatures();
      const license2 = await licenseGuard2.getCurrentLicense();
      const maxAccounts = await licenseGuard2.getMaxAccounts();
      const maxRules = await licenseGuard2.getMaxRoutingRules();
      const maxTemplates = await licenseGuard2.getMaxEmailTemplates();
      const [currentAccounts, currentRules, currentTemplates] = await Promise.all([
        strapi2.documents("plugin::magic-mail.email-account").count(),
        strapi2.documents("plugin::magic-mail.routing-rule").count(),
        strapi2.documents("plugin::magic-mail.email-template").count()
      ]);
      let tier = "free";
      if (license2?.featureEnterprise === true || license2?.features?.enterprise === true) tier = "enterprise";
      else if (license2?.featureAdvanced === true || license2?.features?.advanced === true) tier = "advanced";
      else if (license2?.featurePremium === true || license2?.features?.premium === true) tier = "premium";
      const tierConfig = features2[tier] || features2.free;
      if (process.env.NODE_ENV === "development") {
        strapi2.log.debug("[magic-mail] License tier:", tier);
      }
      ctx.body = {
        success: true,
        tier,
        limits: {
          accounts: {
            current: currentAccounts,
            max: maxAccounts,
            unlimited: maxAccounts === -1,
            canCreate: maxAccounts === -1 || currentAccounts < maxAccounts
          },
          routingRules: {
            current: currentRules,
            max: maxRules,
            unlimited: maxRules === -1,
            canCreate: maxRules === -1 || currentRules < maxRules
          },
          emailTemplates: {
            current: currentTemplates,
            max: maxTemplates,
            unlimited: maxTemplates === -1,
            canCreate: maxTemplates === -1 || currentTemplates < maxTemplates
          }
        },
        allowedProviders: tierConfig.providers,
        features: tierConfig.features
      };
    } catch (error) {
      strapi2.log.error("[magic-mail] Error getting license limits:", error);
      ctx.throw(500, "Error getting license limits");
    }
  }
});
var emailDesigner$3 = ({ strapi: strapi2 }) => ({
  /**
   * Get all templates
   */
  async findAll(ctx) {
    try {
      const templates = await strapi2.plugin("magic-mail").service("email-designer").findAll(ctx.query.filters);
      return ctx.send({
        success: true,
        data: templates
      });
    } catch (error) {
      ctx.throw(500, error.message);
    }
  },
  /**
   * Get template by ID
   */
  async findOne(ctx) {
    try {
      const { id } = ctx.params;
      const template = await strapi2.plugin("magic-mail").service("email-designer").findOne(id);
      if (!template) {
        return ctx.notFound("Template not found");
      }
      return ctx.send({
        success: true,
        data: template
      });
    } catch (error) {
      ctx.throw(500, error.message);
    }
  },
  /**
   * Create template
   */
  async create(ctx) {
    try {
      const template = await strapi2.plugin("magic-mail").service("email-designer").create(ctx.request.body);
      return ctx.send({
        success: true,
        data: template
      });
    } catch (error) {
      if (error.message.includes("limit reached") || error.message.includes("already exists")) {
        return ctx.badRequest(error.message);
      }
      ctx.throw(500, error.message);
    }
  },
  /**
   * Update template
   */
  async update(ctx) {
    try {
      const { id } = ctx.params;
      const template = await strapi2.plugin("magic-mail").service("email-designer").update(id, ctx.request.body);
      return ctx.send({
        success: true,
        data: template
      });
    } catch (error) {
      if (error.message.includes("not found")) {
        return ctx.notFound(error.message);
      }
      ctx.throw(500, error.message);
    }
  },
  /**
   * Delete template
   */
  async delete(ctx) {
    try {
      const { id } = ctx.params;
      await strapi2.plugin("magic-mail").service("email-designer").delete(id);
      return ctx.send({
        success: true,
        message: "Template deleted successfully"
      });
    } catch (error) {
      ctx.throw(500, error.message);
    }
  },
  /**
   * Get template versions
   */
  async getVersions(ctx) {
    try {
      const { id } = ctx.params;
      const versions = await strapi2.plugin("magic-mail").service("email-designer").getVersions(id);
      return ctx.send({
        success: true,
        data: versions
      });
    } catch (error) {
      ctx.throw(500, error.message);
    }
  },
  /**
   * Restore version
   */
  async restoreVersion(ctx) {
    try {
      const { id, versionId } = ctx.params;
      const template = await strapi2.plugin("magic-mail").service("email-designer").restoreVersion(id, versionId);
      return ctx.send({
        success: true,
        data: template
      });
    } catch (error) {
      if (error.message.includes("not found")) {
        return ctx.notFound(error.message);
      }
      ctx.throw(500, error.message);
    }
  },
  /**
   * Delete a single version
   */
  async deleteVersion(ctx) {
    try {
      const { id, versionId } = ctx.params;
      const result = await strapi2.plugin("magic-mail").service("email-designer").deleteVersion(id, versionId);
      return ctx.send({
        success: true,
        data: result
      });
    } catch (error) {
      if (error.message.includes("not found")) {
        return ctx.notFound(error.message);
      }
      if (error.message.includes("does not belong")) {
        return ctx.badRequest(error.message);
      }
      ctx.throw(500, error.message);
    }
  },
  /**
   * Delete all versions for a template
   */
  async deleteAllVersions(ctx) {
    try {
      const { id } = ctx.params;
      const result = await strapi2.plugin("magic-mail").service("email-designer").deleteAllVersions(id);
      return ctx.send({
        success: true,
        data: result
      });
    } catch (error) {
      if (error.message.includes("not found")) {
        return ctx.notFound(error.message);
      }
      ctx.throw(500, error.message);
    }
  },
  /**
   * Render template with data
   */
  async renderTemplate(ctx) {
    try {
      const { templateReferenceId } = ctx.params;
      const { data } = ctx.request.body;
      const rendered = await strapi2.plugin("magic-mail").service("email-designer").renderTemplate(parseInt(templateReferenceId), data);
      return ctx.send({
        success: true,
        data: rendered
      });
    } catch (error) {
      if (error.message.includes("not found")) {
        return ctx.notFound(error.message);
      }
      ctx.throw(500, error.message);
    }
  },
  /**
   * Export templates
   */
  async exportTemplates(ctx) {
    try {
      const { templateIds } = ctx.request.body;
      const templates = await strapi2.plugin("magic-mail").service("email-designer").exportTemplates(templateIds || []);
      return ctx.send({
        success: true,
        data: templates
      });
    } catch (error) {
      if (error.message.includes("requires")) {
        return ctx.forbidden(error.message);
      }
      ctx.throw(500, error.message);
    }
  },
  /**
   * Import templates
   */
  async importTemplates(ctx) {
    try {
      const { templates } = ctx.request.body;
      if (!Array.isArray(templates)) {
        return ctx.badRequest("Templates must be an array");
      }
      const results = await strapi2.plugin("magic-mail").service("email-designer").importTemplates(templates);
      return ctx.send({
        success: true,
        data: results
      });
    } catch (error) {
      if (error.message.includes("requires")) {
        return ctx.forbidden(error.message);
      }
      ctx.throw(500, error.message);
    }
  },
  /**
   * Get template statistics
   */
  async getStats(ctx) {
    try {
      const stats = await strapi2.plugin("magic-mail").service("email-designer").getStats();
      return ctx.send({
        success: true,
        data: stats
      });
    } catch (error) {
      ctx.throw(500, error.message);
    }
  },
  /**
   * Get core email template
   */
  async getCoreTemplate(ctx) {
    try {
      const { coreEmailType } = ctx.params;
      const template = await strapi2.plugin("magic-mail").service("email-designer").getCoreTemplate(coreEmailType);
      return ctx.send({
        success: true,
        data: template
      });
    } catch (error) {
      ctx.throw(500, error.message);
    }
  },
  /**
   * Update core email template
   */
  async updateCoreTemplate(ctx) {
    try {
      const { coreEmailType } = ctx.params;
      const template = await strapi2.plugin("magic-mail").service("email-designer").updateCoreTemplate(coreEmailType, ctx.request.body);
      return ctx.send({
        success: true,
        data: template
      });
    } catch (error) {
      ctx.throw(500, error.message);
    }
  },
  /**
   * Download template as HTML or JSON
   */
  async download(ctx) {
    try {
      const { id } = ctx.params;
      const { type = "json" } = ctx.query;
      const template = await strapi2.plugin("magic-mail").service("email-designer").findOne(id);
      if (!template) {
        return ctx.notFound("Template not found");
      }
      let fileContent, fileName;
      if (type === "json") {
        fileContent = JSON.stringify(template.design, null, 2);
        fileName = `template-${id}.json`;
        ctx.set("Content-Type", "application/json");
      } else if (type === "html") {
        fileContent = template.bodyHtml;
        fileName = `template-${id}.html`;
        ctx.set("Content-Type", "text/html");
      } else {
        return ctx.badRequest('Invalid type, must be either "json" or "html".');
      }
      ctx.set("Content-Disposition", `attachment; filename="${fileName}"`);
      ctx.send(fileContent);
    } catch (error) {
      strapi2.log.error("[magic-mail] Error downloading template:", error.message);
      ctx.throw(500, error.message);
    }
  },
  /**
   * Duplicate template
   */
  async duplicate(ctx) {
    try {
      const { id } = ctx.params;
      const duplicated = await strapi2.plugin("magic-mail").service("email-designer").duplicate(id);
      return ctx.send({
        success: true,
        data: duplicated
      });
    } catch (error) {
      if (error.message.includes("not found")) {
        return ctx.notFound(error.message);
      }
      ctx.throw(500, error.message);
    }
  },
  /**
   * Send test email for template
   */
  async testSend(ctx) {
    try {
      const { id } = ctx.params;
      const { to, accountName } = ctx.request.body;
      if (!to) {
        return ctx.badRequest("Recipient email (to) is required");
      }
      const template = await strapi2.plugin("magic-mail").service("email-designer").findOne(id);
      if (!template) {
        return ctx.notFound("Template not found");
      }
      const rendered = await strapi2.plugin("magic-mail").service("email-designer").renderTemplate(template.templateReferenceId, {
        name: "Test User",
        email: to
        // Add more default test variables as needed
      });
      const emailRouterService = strapi2.plugin("magic-mail").service("email-router");
      const sendOptions = {
        to,
        subject: rendered.subject || template.subject,
        html: rendered.html,
        text: rendered.text,
        // Add template tracking info
        templateId: template.templateReferenceId,
        templateName: template.name
      };
      if (accountName) {
        sendOptions.accountName = accountName;
      }
      const result = await emailRouterService.send(sendOptions);
      return ctx.send({
        success: true,
        message: "Test email sent successfully",
        data: {
          recipient: to,
          template: template.name,
          result
        }
      });
    } catch (error) {
      strapi2.log.error("[magic-mail] Error sending test email:", error);
      return ctx.badRequest(error.message || "Failed to send test email");
    }
  }
});
const EMAIL_LOG_UID$1 = "plugin::magic-mail.email-log";
const EMAIL_EVENT_UID$1 = "plugin::magic-mail.email-event";
const EMAIL_ACCOUNT_UID$1 = "plugin::magic-mail.email-account";
var analytics$3 = ({ strapi: strapi2 }) => ({
  /**
   * Tracking pixel endpoint
   * GET /magic-mail/track/open/:emailId/:recipientHash
   */
  async trackOpen(ctx) {
    const { emailId, recipientHash } = ctx.params;
    try {
      await strapi2.plugin("magic-mail").service("analytics").recordOpen(emailId, recipientHash, ctx.request);
    } catch (err) {
      strapi2.log.error("[magic-mail] Error recording open event:", err.message);
    }
    const pixel = Buffer.from(
      "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
      "base64"
    );
    ctx.type = "image/gif";
    ctx.body = pixel;
  },
  /**
   * Click tracking endpoint with open-redirect protection
   * GET /magic-mail/track/click/:emailId/:linkHash/:recipientHash
   */
  async trackClick(ctx) {
    const { emailId, linkHash, recipientHash } = ctx.params;
    let url;
    try {
      const analyticsService = strapi2.plugin("magic-mail").service("analytics");
      url = await analyticsService.getOriginalUrlFromHash(emailId, linkHash);
    } catch (err) {
      strapi2.log.error("[magic-mail] Error getting original URL:", err.message);
    }
    if (!url) {
      return ctx.badRequest("Invalid or expired tracking link");
    }
    try {
      const parsed = new URL(url);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        return ctx.badRequest("Invalid URL protocol");
      }
    } catch {
      return ctx.badRequest("Invalid URL format");
    }
    try {
      await strapi2.plugin("magic-mail").service("analytics").recordClick(emailId, linkHash, recipientHash, url, ctx.request);
    } catch (err) {
      strapi2.log.error("[magic-mail] Error recording click event:", err.message);
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
        dateTo: ctx.query.dateTo || null
      };
      Object.keys(filters).forEach((key) => filters[key] === null && delete filters[key]);
      const stats = await strapi2.plugin("magic-mail").service("analytics").getStats(filters);
      return ctx.send({
        success: true,
        data: stats
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
        search: ctx.query.search || null
      };
      const pagination = {
        page: ctx.query.page ? parseInt(ctx.query.page) : 1,
        pageSize: ctx.query.pageSize ? parseInt(ctx.query.pageSize) : 25
      };
      Object.keys(filters).forEach((key) => filters[key] === null && delete filters[key]);
      const result = await strapi2.plugin("magic-mail").service("analytics").getEmailLogs(filters, pagination);
      return ctx.send({
        success: true,
        ...result
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
      const emailLog2 = await strapi2.plugin("magic-mail").service("analytics").getEmailLogDetails(emailId);
      if (!emailLog2) {
        return ctx.notFound("Email log not found");
      }
      return ctx.send({
        success: true,
        data: emailLog2
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
      const activity = await strapi2.plugin("magic-mail").service("analytics").getUserActivity(userId);
      return ctx.send({
        success: true,
        data: activity
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
      strapi2.log.info("[magic-mail] [CHECK] Running Analytics Debug...");
      const emailLogs = await strapi2.documents(EMAIL_LOG_UID$1).findMany({
        limit: 10,
        sort: [{ sentAt: "desc" }]
      });
      const emailEvents = await strapi2.documents(EMAIL_EVENT_UID$1).findMany({
        limit: 20,
        sort: [{ timestamp: "desc" }],
        populate: ["emailLog"]
      });
      const analyticsService = strapi2.plugin("magic-mail").service("analytics");
      const stats = await analyticsService.getStats();
      const accounts2 = await strapi2.documents(EMAIL_ACCOUNT_UID$1).findMany({
        filters: { isActive: true },
        fields: ["id", "name", "provider", "fromEmail", "emailsSentToday", "totalEmailsSent"]
      });
      let sampleTrackingUrls = null;
      if (emailLogs.length > 0) {
        const testLog = emailLogs[0];
        const testHash = analyticsService.generateRecipientHash(testLog.emailId, testLog.recipient);
        const baseUrl = strapi2.config.get("server.url") || "http://localhost:1337";
        sampleTrackingUrls = {
          trackingPixel: `${baseUrl}/api/magic-mail/track/open/${testLog.emailId}/${testHash}`,
          clickTracking: `${baseUrl}/api/magic-mail/track/click/${testLog.emailId}/test/${testHash}?url=https://example.com`,
          emailId: testLog.emailId,
          recipient: testLog.recipient
        };
      }
      return ctx.send({
        success: true,
        debug: {
          timestamp: (/* @__PURE__ */ new Date()).toISOString(),
          stats,
          emailLogsCount: emailLogs.length,
          emailEventsCount: emailEvents.length,
          activeAccountsCount: accounts2.length,
          recentEmailLogs: emailLogs.map((log) => ({
            emailId: log.emailId,
            recipient: log.recipient,
            subject: log.subject,
            sentAt: log.sentAt,
            openCount: log.openCount,
            clickCount: log.clickCount,
            firstOpenedAt: log.firstOpenedAt,
            accountName: log.accountName,
            templateName: log.templateName
          })),
          recentEvents: emailEvents.map((event) => ({
            type: event.type,
            timestamp: event.timestamp,
            emailId: event.emailLog?.emailId,
            ipAddress: event.ipAddress,
            linkUrl: event.linkUrl
          })),
          accounts: accounts2,
          sampleTrackingUrls,
          notes: [
            "If emailLogsCount is 0: Emails are not being tracked (check if enableTracking=true)",
            "If openCount is 0: Tracking pixel not being loaded (check email HTML source)",
            "Test tracking URLs should be publicly accessible without authentication",
            "Check Strapi console logs for tracking events when opening emails"
          ]
        }
      });
    } catch (error) {
      strapi2.log.error("[magic-mail] Debug error:", error.message);
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
      const emailLog2 = await strapi2.documents(EMAIL_LOG_UID$1).findFirst({
        filters: { emailId }
      });
      if (!emailLog2) {
        return ctx.notFound("Email log not found");
      }
      const events = await strapi2.documents(EMAIL_EVENT_UID$1).findMany({
        filters: { emailLog: { documentId: emailLog2.documentId } }
      });
      for (const event of events) {
        await strapi2.documents(EMAIL_EVENT_UID$1).delete({ documentId: event.documentId });
      }
      await strapi2.documents(EMAIL_LOG_UID$1).delete({ documentId: emailLog2.documentId });
      strapi2.log.info(`[magic-mail] [DELETE]  Deleted email log: ${emailId}`);
      return ctx.send({
        success: true,
        message: "Email log deleted successfully"
      });
    } catch (error) {
      strapi2.log.error("[magic-mail] Error deleting email log:", error.message);
      ctx.throw(500, error.message);
    }
  },
  /**
   * Clear all email logs
   * DELETE /magic-mail/analytics/emails
   */
  async clearAllEmailLogs(ctx) {
    try {
      const { olderThan } = ctx.query;
      const filters = {};
      if (olderThan) {
        filters.sentAt = { $lt: new Date(olderThan) };
      }
      const emailLogs = await strapi2.documents(EMAIL_LOG_UID$1).findMany({
        filters,
        fields: ["id", "documentId"],
        limit: 1e5
      });
      if (emailLogs.length === 0) {
        return ctx.send({
          success: true,
          message: "No email logs to delete",
          deletedCount: 0
        });
      }
      for (const log of emailLogs) {
        const events = await strapi2.documents(EMAIL_EVENT_UID$1).findMany({
          filters: { emailLog: { documentId: log.documentId } }
        });
        for (const event of events) {
          await strapi2.documents(EMAIL_EVENT_UID$1).delete({ documentId: event.documentId });
        }
        await strapi2.documents(EMAIL_LOG_UID$1).delete({ documentId: log.documentId });
      }
      strapi2.log.info(`[magic-mail] [DELETE]  Cleared ${emailLogs.length} email logs`);
      return ctx.send({
        success: true,
        message: `Successfully deleted ${emailLogs.length} email log(s)`,
        deletedCount: emailLogs.length
      });
    } catch (error) {
      strapi2.log.error("[magic-mail] Error clearing email logs:", error.message);
      ctx.throw(500, error.message);
    }
  }
});
const EMAIL_TEMPLATE_UID$1 = "plugin::magic-mail.email-template";
const EMAIL_TEMPLATE_VERSION_UID$1 = "plugin::magic-mail.email-template-version";
var test$1 = {
  /**
   * Test Template-Version Relations
   */
  async testRelations(ctx) {
    try {
      console.log("\n" + "=".repeat(60));
      console.log("[TEST] Template - Version Relations (Document Service API)");
      console.log("=".repeat(60));
      let test1Success = false;
      let test1ReverseSuccess = false;
      let test2Success = false;
      let test2ReverseSuccess = false;
      let test3a_versionCreated = false;
      let test3a_hasTemplate = false;
      let test3b_twoVersions = false;
      let test3b_allHaveTemplate = false;
      console.log("\n[TEST] TEST 1: Version → Template Verbindung\n");
      const testTemplate = await strapi.documents(EMAIL_TEMPLATE_UID$1).create({
        data: {
          templateReferenceId: Math.floor(Math.random() * 1e6),
          name: "Test Template Relations",
          subject: "Test Subject",
          bodyHtml: "<p>Test HTML</p>",
          bodyText: "Test Text",
          category: "custom",
          isActive: true
        }
      });
      console.log(`[SUCCESS] Template erstellt: documentId ${testTemplate.documentId}`);
      const version1 = await strapi.documents(EMAIL_TEMPLATE_VERSION_UID$1).create({
        data: {
          template: testTemplate.documentId,
          versionNumber: 1,
          name: "Version 1 von Test",
          subject: "Test Subject V1",
          bodyHtml: "<p>Version 1 HTML</p>",
          bodyText: "Version 1 Text"
        }
      });
      console.log(`[SUCCESS] Version erstellt: documentId ${version1.documentId}, versionNumber: ${version1.versionNumber}`);
      const versionCheck = await strapi.documents(EMAIL_TEMPLATE_VERSION_UID$1).findOne({
        documentId: version1.documentId,
        populate: ["template"]
      });
      console.log("\n[CHECK] Prüfung Version → Template:");
      test1Success = !!versionCheck.template;
      if (test1Success) {
        console.log(`   [SUCCESS] SUCCESS: Version → Template ${versionCheck.template.documentId}`);
      } else {
        console.log(`   [ERROR] FEHLER: Version hat KEINE Template-Verbindung!`);
      }
      const templateCheck1 = await strapi.documents(EMAIL_TEMPLATE_UID$1).findOne({
        documentId: testTemplate.documentId,
        populate: ["versions"]
      });
      console.log("\n[CHECK] Prüfung Template → Versions:");
      test1ReverseSuccess = templateCheck1.versions && templateCheck1.versions.length > 0;
      if (test1ReverseSuccess) {
        console.log(`   [SUCCESS] SUCCESS: Template hat ${templateCheck1.versions.length} Version(en)`);
      } else {
        console.log(`   [ERROR] FEHLER: Template hat KEINE Versionen!`);
      }
      console.log("\n\n[TEST] TEST 2: Nachträgliche Verbindung\n");
      const version2 = await strapi.documents(EMAIL_TEMPLATE_VERSION_UID$1).create({
        data: {
          versionNumber: 2,
          name: "Version 2 ohne Template",
          subject: "Test Subject V2",
          bodyHtml: "<p>Version 2 HTML</p>",
          bodyText: "Version 2 Text"
        }
      });
      console.log(`[SUCCESS] Version 2 erstellt: documentId ${version2.documentId} (ohne Template)`);
      await strapi.documents(EMAIL_TEMPLATE_VERSION_UID$1).update({
        documentId: version2.documentId,
        data: {
          template: testTemplate.documentId
        }
      });
      console.log(`[SUCCESS] Version 2 mit Template verbunden`);
      const templateCheck2 = await strapi.documents(EMAIL_TEMPLATE_UID$1).findOne({
        documentId: testTemplate.documentId,
        populate: ["versions"]
      });
      console.log("\n[CHECK] Prüfung nach Update:");
      test2Success = templateCheck2.versions && templateCheck2.versions.length >= 2;
      if (test2Success) {
        console.log(`   [SUCCESS] SUCCESS: Template hat jetzt ${templateCheck2.versions.length} Versionen`);
      } else {
        console.log(`   [ERROR] FEHLER: Template hat nur ${templateCheck2.versions?.length || 0} Version(en)!`);
      }
      const version2Check = await strapi.documents(EMAIL_TEMPLATE_VERSION_UID$1).findOne({
        documentId: version2.documentId,
        populate: ["template"]
      });
      test2ReverseSuccess = !!version2Check.template;
      if (test2ReverseSuccess) {
        console.log(`   [SUCCESS] SUCCESS: Version 2 → Template verbunden`);
      } else {
        console.log(`   [ERROR] FEHLER: Version 2 hat KEINE Template-Verbindung!`);
      }
      console.log("\n\n[TEST] TEST 3: Template Update (Auto-Versionierung)\n");
      const autoTemplate = await strapi.documents(EMAIL_TEMPLATE_UID$1).create({
        data: {
          templateReferenceId: Math.floor(Math.random() * 1e6),
          name: "Auto Version Test",
          subject: "Original Subject",
          bodyHtml: "<p>Original HTML</p>",
          bodyText: "Original Text",
          category: "custom",
          isActive: true
        }
      });
      console.log(`[SUCCESS] Template erstellt: documentId ${autoTemplate.documentId}`);
      const emailDesignerService = strapi.plugin("magic-mail").service("email-designer");
      await emailDesignerService.update(autoTemplate.documentId, {
        subject: "Updated Subject V1",
        bodyHtml: "<p>Updated HTML V1</p>",
        bodyText: "Updated Text V1"
      });
      console.log("[SUCCESS] Template updated");
      const afterFirstUpdate = await strapi.documents(EMAIL_TEMPLATE_UID$1).findOne({
        documentId: autoTemplate.documentId,
        populate: ["versions"]
      });
      console.log("\n[CHECK] Prüfung nach 1. Update:");
      test3a_versionCreated = afterFirstUpdate.versions && afterFirstUpdate.versions.length === 1;
      if (test3a_versionCreated) {
        console.log(`   [SUCCESS] SUCCESS: Automatisch 1 Version erstellt`);
        const autoVersion1 = await strapi.documents(EMAIL_TEMPLATE_VERSION_UID$1).findOne({
          documentId: afterFirstUpdate.versions[0].documentId,
          populate: ["template"]
        });
        test3a_hasTemplate = !!autoVersion1.template;
        if (test3a_hasTemplate) {
          console.log(`   [SUCCESS] SUCCESS: Version hat Template-Verbindung`);
        } else {
          console.log(`   [ERROR] FEHLER: Version hat KEINE Template-Verbindung!`);
        }
      } else {
        console.log(`   [ERROR] FEHLER: Keine Version erstellt!`);
      }
      await emailDesignerService.update(autoTemplate.documentId, {
        subject: "Updated Subject V2",
        bodyHtml: "<p>Updated HTML V2</p>",
        bodyText: "Updated Text V2"
      });
      const afterSecondUpdate = await strapi.documents(EMAIL_TEMPLATE_UID$1).findOne({
        documentId: autoTemplate.documentId,
        populate: ["versions"]
      });
      console.log("\n[CHECK] Prüfung nach 2. Update:");
      test3b_twoVersions = afterSecondUpdate.versions && afterSecondUpdate.versions.length === 2;
      if (test3b_twoVersions) {
        console.log(`   [SUCCESS] SUCCESS: Jetzt 2 Versionen vorhanden`);
        let allVersionsHaveTemplate = true;
        for (const version3 of afterSecondUpdate.versions) {
          const fullVersion = await strapi.documents(EMAIL_TEMPLATE_VERSION_UID$1).findOne({
            documentId: version3.documentId,
            populate: ["template"]
          });
          if (!fullVersion.template) {
            allVersionsHaveTemplate = false;
          }
        }
        test3b_allHaveTemplate = allVersionsHaveTemplate;
        if (allVersionsHaveTemplate) {
          console.log(`   [SUCCESS] SUCCESS: Alle Versionen haben Template-Verbindung!`);
        } else {
          console.log(`   [ERROR] FEHLER: Nicht alle Versionen haben Template-Verbindung!`);
        }
      } else {
        console.log(`   [ERROR] FEHLER: Falsche Anzahl Versionen!`);
      }
      console.log("\n[CLEANUP] Cleanup Test 3...");
      if (afterSecondUpdate.versions) {
        for (const version3 of afterSecondUpdate.versions) {
          await strapi.documents(EMAIL_TEMPLATE_VERSION_UID$1).delete({ documentId: version3.documentId });
        }
      }
      await strapi.documents(EMAIL_TEMPLATE_UID$1).delete({ documentId: autoTemplate.documentId });
      console.log("   [SUCCESS] Test 3 Daten gelöscht");
      console.log("\n\n" + "=".repeat(60));
      console.log("[STATS] ZUSAMMENFASSUNG");
      console.log("=".repeat(60));
      const finalTemplate = await strapi.documents(EMAIL_TEMPLATE_UID$1).findOne({
        documentId: testTemplate.documentId,
        populate: ["versions"]
      });
      console.log(`
[INFO] Template: "${finalTemplate.name}" (documentId: ${finalTemplate.documentId})`);
      console.log(`   Anzahl Versionen: ${finalTemplate.versions?.length || 0}`);
      console.log("\n[CLEANUP] Aufraumen...");
      await strapi.documents(EMAIL_TEMPLATE_VERSION_UID$1).delete({ documentId: version1.documentId });
      await strapi.documents(EMAIL_TEMPLATE_VERSION_UID$1).delete({ documentId: version2.documentId });
      await strapi.documents(EMAIL_TEMPLATE_UID$1).delete({ documentId: testTemplate.documentId });
      console.log("   [SUCCESS] Alle Test-Daten gelöscht");
      console.log("\n[SUCCESS] Test abgeschlossen!\n");
      const allSuccess = test1Success && test1ReverseSuccess && test2Success && test2ReverseSuccess && test3a_versionCreated && test3a_hasTemplate && test3b_twoVersions && test3b_allHaveTemplate;
      ctx.body = {
        success: allSuccess,
        message: allSuccess ? "Alle Tests erfolgreich! [SUCCESS]" : "Einige Tests fehlgeschlagen [ERROR]",
        tests: {
          test1_version_to_template: test1Success,
          test1_template_to_version: test1ReverseSuccess,
          test2_template_connect: test2Success,
          test2_version_to_template: test2ReverseSuccess,
          test3_auto_version_created: test3a_versionCreated,
          test3_auto_version_has_template: test3a_hasTemplate,
          test3_two_auto_versions: test3b_twoVersions,
          test3_all_auto_versions_have_template: test3b_allHaveTemplate
        }
      };
    } catch (error) {
      console.error("\n[ERROR] FEHLER:", error.message);
      console.error(error.stack);
      ctx.throw(500, error.message);
    }
  }
};
var whatsapp$3 = {
  /**
   * Check if WhatsApp/Baileys is available
   * GET /magic-mail/whatsapp/available
   */
  async checkAvailable(ctx) {
    try {
      const whatsappService = strapi.plugin("magic-mail").service("whatsapp");
      const available = await whatsappService.isAvailable();
      ctx.body = {
        success: true,
        data: {
          available,
          message: available ? "WhatsApp integration is available" : "Baileys not installed. Run: npm install baileys pino qrcode"
        }
      };
    } catch (error) {
      ctx.throw(500, error.message);
    }
  },
  /**
   * Get WhatsApp connection status
   * GET /magic-mail/whatsapp/status
   */
  async getStatus(ctx) {
    try {
      const whatsappService = strapi.plugin("magic-mail").service("whatsapp");
      const status = whatsappService.getStatus();
      const sessionInfo = await whatsappService.getSessionInfo();
      ctx.body = {
        success: true,
        data: {
          ...status,
          session: sessionInfo
        }
      };
    } catch (error) {
      ctx.throw(500, error.message);
    }
  },
  /**
   * Connect to WhatsApp (generates QR code if needed)
   * POST /magic-mail/whatsapp/connect
   */
  async connect(ctx) {
    try {
      const whatsappService = strapi.plugin("magic-mail").service("whatsapp");
      const result = await whatsappService.connect();
      ctx.body = {
        success: result.success,
        data: result
      };
    } catch (error) {
      ctx.throw(500, error.message);
    }
  },
  /**
   * Disconnect from WhatsApp
   * POST /magic-mail/whatsapp/disconnect
   */
  async disconnect(ctx) {
    try {
      const whatsappService = strapi.plugin("magic-mail").service("whatsapp");
      const result = await whatsappService.disconnect();
      ctx.body = {
        success: result.success,
        data: result
      };
    } catch (error) {
      ctx.throw(500, error.message);
    }
  },
  /**
   * Send a test message
   * POST /magic-mail/whatsapp/send-test
   */
  async sendTest(ctx) {
    try {
      const { phoneNumber, message } = ctx.request.body;
      if (!phoneNumber) {
        return ctx.badRequest("Phone number is required");
      }
      const whatsappService = strapi.plugin("magic-mail").service("whatsapp");
      const testMessage = message || `[MagicMail Test] This is a test message sent at ${(/* @__PURE__ */ new Date()).toLocaleString()}`;
      const result = await whatsappService.sendMessage(phoneNumber, testMessage);
      ctx.body = {
        success: result.success,
        data: result
      };
    } catch (error) {
      ctx.throw(500, error.message);
    }
  },
  /**
   * Send a message using a template
   * POST /magic-mail/whatsapp/send-template
   */
  async sendTemplateMessage(ctx) {
    try {
      const { phoneNumber, templateName, variables } = ctx.request.body;
      if (!phoneNumber || !templateName) {
        return ctx.badRequest("Phone number and template name are required");
      }
      const whatsappService = strapi.plugin("magic-mail").service("whatsapp");
      const result = await whatsappService.sendTemplateMessage(phoneNumber, templateName, variables || {});
      ctx.body = {
        success: result.success,
        data: result
      };
    } catch (error) {
      ctx.throw(500, error.message);
    }
  },
  /**
   * Check if a phone number is on WhatsApp
   * POST /magic-mail/whatsapp/check-number
   */
  async checkNumber(ctx) {
    try {
      const { phoneNumber } = ctx.request.body;
      if (!phoneNumber) {
        return ctx.badRequest("Phone number is required");
      }
      const whatsappService = strapi.plugin("magic-mail").service("whatsapp");
      const result = await whatsappService.checkNumber(phoneNumber);
      ctx.body = {
        success: result.success,
        data: result
      };
    } catch (error) {
      ctx.throw(500, error.message);
    }
  },
  /**
   * Get all WhatsApp templates
   * GET /magic-mail/whatsapp/templates
   */
  async getTemplates(ctx) {
    try {
      const whatsappService = strapi.plugin("magic-mail").service("whatsapp");
      const templates = await whatsappService.getTemplates();
      ctx.body = {
        success: true,
        data: templates
      };
    } catch (error) {
      ctx.throw(500, error.message);
    }
  },
  /**
   * Save a WhatsApp template
   * POST /magic-mail/whatsapp/templates
   */
  async saveTemplate(ctx) {
    try {
      const { templateName, templateContent } = ctx.request.body;
      if (!templateName || !templateContent) {
        return ctx.badRequest("Template name and content are required");
      }
      const whatsappService = strapi.plugin("magic-mail").service("whatsapp");
      const result = await whatsappService.saveTemplate(templateName, templateContent);
      ctx.body = {
        success: result.success,
        data: result
      };
    } catch (error) {
      ctx.throw(500, error.message);
    }
  },
  /**
   * Delete a WhatsApp template
   * DELETE /magic-mail/whatsapp/templates/:templateName
   */
  async deleteTemplate(ctx) {
    try {
      const { templateName } = ctx.params;
      if (!templateName) {
        return ctx.badRequest("Template name is required");
      }
      const whatsappService = strapi.plugin("magic-mail").service("whatsapp");
      const result = await whatsappService.deleteTemplate(templateName);
      ctx.body = {
        success: result.success,
        data: result
      };
    } catch (error) {
      ctx.throw(500, error.message);
    }
  },
  /**
   * Get session info
   * GET /magic-mail/whatsapp/session
   */
  async getSession(ctx) {
    try {
      const whatsappService = strapi.plugin("magic-mail").service("whatsapp");
      const sessionInfo = await whatsappService.getSessionInfo();
      ctx.body = {
        success: true,
        data: sessionInfo
      };
    } catch (error) {
      ctx.throw(500, error.message);
    }
  }
};
var pluginSettings$3 = ({ strapi: strapi2 }) => ({
  /**
   * GET /magic-mail/settings
   * Get current plugin settings
   */
  async getSettings(ctx) {
    try {
      const settings = await strapi2.plugin("magic-mail").service("plugin-settings").getSettings();
      ctx.body = {
        data: settings
      };
    } catch (error) {
      strapi2.log.error("[magic-mail] [SETTINGS] Error getting settings:", error);
      ctx.throw(500, "Failed to get settings");
    }
  },
  /**
   * PUT /magic-mail/settings
   * Update plugin settings
   */
  async updateSettings(ctx) {
    try {
      const { body } = ctx.request;
      const allowedFields = [
        "enableLinkTracking",
        "enableOpenTracking",
        "trackingBaseUrl",
        "defaultFromName",
        "defaultFromEmail",
        "unsubscribeUrl",
        "enableUnsubscribeHeader"
      ];
      const data = {};
      for (const field of allowedFields) {
        if (body[field] !== void 0) {
          data[field] = body[field];
        }
      }
      const settings = await strapi2.plugin("magic-mail").service("plugin-settings").updateSettings(data);
      ctx.body = {
        data: settings,
        message: "Settings updated successfully"
      };
    } catch (error) {
      strapi2.log.error("[magic-mail] [SETTINGS] Error updating settings:", error);
      ctx.throw(500, "Failed to update settings");
    }
  }
});
const controller = controller$1;
const accounts = accounts$1;
const oauth$2 = oauth$3;
const routingRules = routingRules$1;
const license = license$1;
const emailDesigner$2 = emailDesigner$3;
const analytics$2 = analytics$3;
const test = test$1;
const whatsapp$2 = whatsapp$3;
const pluginSettings$2 = pluginSettings$3;
var controllers$1 = {
  controller,
  accounts,
  oauth: oauth$2,
  routingRules,
  license,
  emailDesigner: emailDesigner$2,
  analytics: analytics$2,
  test,
  whatsapp: whatsapp$2,
  pluginSettings: pluginSettings$2
};
var admin$1 = {
  type: "admin",
  routes: [
    // Account Management
    {
      method: "GET",
      path: "/accounts",
      handler: "accounts.getAll",
      config: {
        policies: ["admin::isAuthenticatedAdmin"],
        description: "Get all email accounts"
      }
    },
    {
      method: "GET",
      path: "/accounts/:accountId",
      handler: "accounts.getOne",
      config: {
        policies: ["admin::isAuthenticatedAdmin"],
        description: "Get single email account with decrypted config"
      }
    },
    {
      method: "POST",
      path: "/accounts",
      handler: "accounts.create",
      config: {
        policies: ["admin::isAuthenticatedAdmin"],
        description: "Create email account"
      }
    },
    {
      method: "PUT",
      path: "/accounts/:accountId",
      handler: "accounts.update",
      config: {
        policies: ["admin::isAuthenticatedAdmin"],
        description: "Update email account"
      }
    },
    {
      method: "POST",
      path: "/accounts/:accountId/test",
      handler: "accounts.test",
      config: {
        policies: ["admin::isAuthenticatedAdmin"],
        description: "Test email account"
      }
    },
    {
      method: "POST",
      path: "/test-strapi-service",
      handler: "accounts.testStrapiService",
      config: {
        policies: ["admin::isAuthenticatedAdmin"],
        description: "Test Strapi Email Service integration (MagicMail intercept)"
      }
    },
    {
      method: "DELETE",
      path: "/accounts/:accountId",
      handler: "accounts.delete",
      config: {
        policies: ["admin::isAuthenticatedAdmin"],
        description: "Delete email account"
      }
    },
    // Routing Rules
    {
      method: "GET",
      path: "/routing-rules",
      handler: "routingRules.getAll",
      config: {
        policies: ["admin::isAuthenticatedAdmin"],
        description: "Get all routing rules"
      }
    },
    {
      method: "GET",
      path: "/routing-rules/:ruleId",
      handler: "routingRules.getOne",
      config: {
        policies: ["admin::isAuthenticatedAdmin"],
        description: "Get single routing rule"
      }
    },
    {
      method: "POST",
      path: "/routing-rules",
      handler: "routingRules.create",
      config: {
        policies: ["admin::isAuthenticatedAdmin"],
        description: "Create routing rule"
      }
    },
    {
      method: "PUT",
      path: "/routing-rules/:ruleId",
      handler: "routingRules.update",
      config: {
        policies: ["admin::isAuthenticatedAdmin"],
        description: "Update routing rule"
      }
    },
    {
      method: "DELETE",
      path: "/routing-rules/:ruleId",
      handler: "routingRules.delete",
      config: {
        policies: ["admin::isAuthenticatedAdmin"],
        description: "Delete routing rule"
      }
    },
    // OAuth Routes - Gmail
    {
      method: "GET",
      path: "/oauth/gmail/auth",
      handler: "oauth.gmailAuth",
      config: {
        policies: [],
        description: "Initiate Gmail OAuth flow"
      }
    },
    {
      method: "GET",
      path: "/oauth/gmail/callback",
      handler: "oauth.gmailCallback",
      config: {
        auth: false,
        // Public callback
        description: "Gmail OAuth callback"
      }
    },
    // OAuth Routes - Microsoft
    {
      method: "GET",
      path: "/oauth/microsoft/auth",
      handler: "oauth.microsoftAuth",
      config: {
        policies: [],
        description: "Initiate Microsoft OAuth flow"
      }
    },
    {
      method: "GET",
      path: "/oauth/microsoft/callback",
      handler: "oauth.microsoftCallback",
      config: {
        auth: false,
        // Public callback
        description: "Microsoft OAuth callback"
      }
    },
    // OAuth Routes - Yahoo
    {
      method: "GET",
      path: "/oauth/yahoo/auth",
      handler: "oauth.yahooAuth",
      config: {
        policies: [],
        description: "Initiate Yahoo OAuth flow"
      }
    },
    {
      method: "GET",
      path: "/oauth/yahoo/callback",
      handler: "oauth.yahooCallback",
      config: {
        auth: false,
        // Public callback
        description: "Yahoo OAuth callback"
      }
    },
    // OAuth Routes - Generic
    {
      method: "POST",
      path: "/oauth/create-account",
      handler: "oauth.createOAuthAccount",
      config: {
        policies: ["admin::isAuthenticatedAdmin"],
        description: "Create account from OAuth"
      }
    },
    // License Routes
    {
      method: "GET",
      path: "/license/status",
      handler: "license.getStatus",
      config: {
        policies: ["admin::isAuthenticatedAdmin"],
        description: "Get license status"
      }
    },
    {
      method: "POST",
      path: "/license/auto-create",
      handler: "license.autoCreate",
      config: {
        policies: ["admin::isAuthenticatedAdmin"],
        description: "Auto-create license with admin user data"
      }
    },
    {
      method: "POST",
      path: "/license/store-key",
      handler: "license.storeKey",
      config: {
        policies: ["admin::isAuthenticatedAdmin"],
        description: "Store and validate existing license key"
      }
    },
    {
      method: "GET",
      path: "/license/limits",
      handler: "license.getLimits",
      config: {
        policies: ["admin::isAuthenticatedAdmin"],
        description: "Get license limits and available features"
      }
    },
    {
      method: "GET",
      path: "/license/debug",
      handler: "license.debugLicense",
      config: {
        policies: ["admin::isAuthenticatedAdmin"],
        description: "Debug license data"
      }
    },
    // Email Designer Routes
    {
      method: "GET",
      path: "/designer/templates",
      handler: "emailDesigner.findAll",
      config: {
        policies: ["admin::isAuthenticatedAdmin"],
        description: "Get all email templates"
      }
    },
    {
      method: "GET",
      path: "/designer/templates/:id",
      handler: "emailDesigner.findOne",
      config: {
        policies: ["admin::isAuthenticatedAdmin"],
        description: "Get email template by ID"
      }
    },
    {
      method: "POST",
      path: "/designer/templates",
      handler: "emailDesigner.create",
      config: {
        policies: ["admin::isAuthenticatedAdmin"],
        description: "Create email template"
      }
    },
    {
      method: "PUT",
      path: "/designer/templates/:id",
      handler: "emailDesigner.update",
      config: {
        policies: ["admin::isAuthenticatedAdmin"],
        description: "Update email template"
      }
    },
    {
      method: "DELETE",
      path: "/designer/templates/:id",
      handler: "emailDesigner.delete",
      config: {
        policies: ["admin::isAuthenticatedAdmin"],
        description: "Delete email template"
      }
    },
    {
      method: "GET",
      path: "/designer/templates/:id/versions",
      handler: "emailDesigner.getVersions",
      config: {
        policies: ["admin::isAuthenticatedAdmin"],
        description: "Get template versions"
      }
    },
    {
      method: "POST",
      path: "/designer/templates/:id/versions/:versionId/restore",
      handler: "emailDesigner.restoreVersion",
      config: {
        policies: ["admin::isAuthenticatedAdmin"],
        description: "Restore template from version"
      }
    },
    {
      method: "POST",
      path: "/designer/templates/:id/versions/:versionId/delete",
      handler: "emailDesigner.deleteVersion",
      config: {
        policies: ["admin::isAuthenticatedAdmin"],
        description: "Delete a single version"
      }
    },
    {
      method: "POST",
      path: "/designer/templates/:id/versions/delete-all",
      handler: "emailDesigner.deleteAllVersions",
      config: {
        policies: ["admin::isAuthenticatedAdmin"],
        description: "Delete all versions for a template"
      }
    },
    {
      method: "POST",
      path: "/designer/render/:templateReferenceId",
      handler: "emailDesigner.renderTemplate",
      config: {
        policies: ["admin::isAuthenticatedAdmin"],
        description: "Render template with data"
      }
    },
    {
      method: "POST",
      path: "/designer/export",
      handler: "emailDesigner.exportTemplates",
      config: {
        policies: ["admin::isAuthenticatedAdmin"],
        description: "Export templates (ADVANCED+)"
      }
    },
    {
      method: "POST",
      path: "/designer/import",
      handler: "emailDesigner.importTemplates",
      config: {
        policies: ["admin::isAuthenticatedAdmin"],
        description: "Import templates (ADVANCED+)"
      }
    },
    {
      method: "GET",
      path: "/designer/stats",
      handler: "emailDesigner.getStats",
      config: {
        policies: ["admin::isAuthenticatedAdmin"],
        description: "Get template statistics"
      }
    },
    {
      method: "GET",
      path: "/designer/core/:coreEmailType",
      handler: "emailDesigner.getCoreTemplate",
      config: {
        policies: ["admin::isAuthenticatedAdmin"],
        description: "Get core email template"
      }
    },
    {
      method: "PUT",
      path: "/designer/core/:coreEmailType",
      handler: "emailDesigner.updateCoreTemplate",
      config: {
        policies: ["admin::isAuthenticatedAdmin"],
        description: "Update core email template"
      }
    },
    {
      method: "GET",
      path: "/designer/templates/:id/download",
      handler: "emailDesigner.download",
      config: {
        policies: ["admin::isAuthenticatedAdmin"],
        description: "Download template as HTML or JSON"
      }
    },
    {
      method: "POST",
      path: "/designer/templates/:id/duplicate",
      handler: "emailDesigner.duplicate",
      config: {
        policies: ["admin::isAuthenticatedAdmin"],
        description: "Duplicate template"
      }
    },
    {
      method: "POST",
      path: "/designer/templates/:id/test-send",
      handler: "emailDesigner.testSend",
      config: {
        policies: ["admin::isAuthenticatedAdmin"],
        description: "Send test email for template"
      }
    },
    // Analytics & Tracking
    {
      method: "GET",
      path: "/analytics/stats",
      handler: "analytics.getStats",
      config: {
        policies: ["admin::isAuthenticatedAdmin"],
        description: "Get analytics statistics"
      }
    },
    {
      method: "GET",
      path: "/analytics/emails",
      handler: "analytics.getEmailLogs",
      config: {
        policies: ["admin::isAuthenticatedAdmin"],
        description: "Get email logs"
      }
    },
    {
      method: "GET",
      path: "/analytics/emails/:emailId",
      handler: "analytics.getEmailDetails",
      config: {
        policies: ["admin::isAuthenticatedAdmin"],
        description: "Get email details"
      }
    },
    {
      method: "GET",
      path: "/analytics/users/:userId",
      handler: "analytics.getUserActivity",
      config: {
        policies: ["admin::isAuthenticatedAdmin"],
        description: "Get user email activity"
      }
    },
    {
      method: "GET",
      path: "/analytics/debug",
      handler: "analytics.debug",
      config: {
        policies: ["admin::isAuthenticatedAdmin"],
        description: "Debug analytics state"
      }
    },
    {
      method: "DELETE",
      path: "/analytics/emails/:emailId",
      handler: "analytics.deleteEmailLog",
      config: {
        policies: ["admin::isAuthenticatedAdmin"],
        description: "Delete single email log"
      }
    },
    {
      method: "DELETE",
      path: "/analytics/emails",
      handler: "analytics.clearAllEmailLogs",
      config: {
        policies: ["admin::isAuthenticatedAdmin"],
        description: "Clear all email logs"
      }
    },
    // Test Routes (Development)
    {
      method: "POST",
      path: "/test/relations",
      handler: "test.testRelations",
      config: {
        policies: ["admin::isAuthenticatedAdmin"],
        description: "Test template-version relations"
      }
    },
    // WhatsApp Routes
    {
      method: "GET",
      path: "/whatsapp/available",
      handler: "whatsapp.checkAvailable",
      config: {
        policies: ["admin::isAuthenticatedAdmin"],
        description: "Check if WhatsApp/Baileys is available"
      }
    },
    {
      method: "GET",
      path: "/whatsapp/status",
      handler: "whatsapp.getStatus",
      config: {
        policies: ["admin::isAuthenticatedAdmin"],
        description: "Get WhatsApp connection status"
      }
    },
    {
      method: "POST",
      path: "/whatsapp/connect",
      handler: "whatsapp.connect",
      config: {
        policies: ["admin::isAuthenticatedAdmin"],
        description: "Connect to WhatsApp (generates QR if needed)"
      }
    },
    {
      method: "POST",
      path: "/whatsapp/disconnect",
      handler: "whatsapp.disconnect",
      config: {
        policies: ["admin::isAuthenticatedAdmin"],
        description: "Disconnect from WhatsApp"
      }
    },
    {
      method: "POST",
      path: "/whatsapp/send-test",
      handler: "whatsapp.sendTest",
      config: {
        policies: ["admin::isAuthenticatedAdmin"],
        description: "Send a test WhatsApp message"
      }
    },
    {
      method: "POST",
      path: "/whatsapp/send-template",
      handler: "whatsapp.sendTemplateMessage",
      config: {
        policies: ["admin::isAuthenticatedAdmin"],
        description: "Send WhatsApp message using template"
      }
    },
    {
      method: "POST",
      path: "/whatsapp/check-number",
      handler: "whatsapp.checkNumber",
      config: {
        policies: ["admin::isAuthenticatedAdmin"],
        description: "Check if phone number is on WhatsApp"
      }
    },
    {
      method: "GET",
      path: "/whatsapp/templates",
      handler: "whatsapp.getTemplates",
      config: {
        policies: ["admin::isAuthenticatedAdmin"],
        description: "Get all WhatsApp message templates"
      }
    },
    {
      method: "POST",
      path: "/whatsapp/templates",
      handler: "whatsapp.saveTemplate",
      config: {
        policies: ["admin::isAuthenticatedAdmin"],
        description: "Save a WhatsApp message template"
      }
    },
    {
      method: "DELETE",
      path: "/whatsapp/templates/:templateName",
      handler: "whatsapp.deleteTemplate",
      config: {
        policies: ["admin::isAuthenticatedAdmin"],
        description: "Delete a WhatsApp message template"
      }
    },
    {
      method: "GET",
      path: "/whatsapp/session",
      handler: "whatsapp.getSession",
      config: {
        policies: ["admin::isAuthenticatedAdmin"],
        description: "Get WhatsApp session info"
      }
    },
    // Plugin Settings Routes
    {
      method: "GET",
      path: "/settings",
      handler: "pluginSettings.getSettings",
      config: {
        policies: ["admin::isAuthenticatedAdmin"],
        description: "Get plugin settings"
      }
    },
    {
      method: "PUT",
      path: "/settings",
      handler: "pluginSettings.updateSettings",
      config: {
        policies: ["admin::isAuthenticatedAdmin"],
        description: "Update plugin settings"
      }
    }
  ]
};
var contentApi$1 = {
  type: "content-api",
  routes: [
    // ============= EMAIL ROUTES =============
    {
      method: "POST",
      path: "/send",
      handler: "controller.send",
      config: {
        description: "Send email via MagicMail router (requires API token)"
      }
    },
    // ============= UNIFIED MESSAGE ROUTE =============
    {
      method: "POST",
      path: "/send-message",
      handler: "controller.sendMessage",
      config: {
        description: "Send message via Email or WhatsApp (requires API token)"
      }
    },
    // ============= WHATSAPP ROUTES =============
    {
      method: "POST",
      path: "/send-whatsapp",
      handler: "controller.sendWhatsApp",
      config: {
        description: "Send WhatsApp message (requires API token)"
      }
    },
    {
      method: "GET",
      path: "/whatsapp/status",
      handler: "controller.getWhatsAppStatus",
      config: {
        description: "Get WhatsApp connection status (requires API token)"
      }
    },
    {
      method: "GET",
      path: "/whatsapp/check/:phoneNumber",
      handler: "controller.checkWhatsAppNumber",
      config: {
        description: "Check if phone number is on WhatsApp (requires API token)"
      }
    },
    // ============= TRACKING ROUTES =============
    {
      method: "GET",
      path: "/track/open/:emailId/:recipientHash",
      handler: "analytics.trackOpen",
      config: {
        policies: [],
        auth: false,
        description: "Track email open (tracking pixel)"
      }
    },
    {
      method: "GET",
      path: "/track/click/:emailId/:linkHash/:recipientHash",
      handler: "analytics.trackClick",
      config: {
        policies: [],
        auth: false,
        description: "Track link click and redirect"
      }
    }
  ]
};
const admin = admin$1;
const contentApi = contentApi$1;
var routes$1 = {
  admin,
  "content-api": contentApi
};
var middlewares$1 = {};
var policies$1 = {};
const crypto$2 = require$$0__default.default;
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
function getEncryptionKey() {
  const envKey = process.env.MAGIC_MAIL_ENCRYPTION_KEY || process.env.APP_KEYS;
  if (!envKey) {
    throw new Error(
      "[magic-mail] FATAL: No encryption key configured. Set MAGIC_MAIL_ENCRYPTION_KEY or APP_KEYS in your environment variables. Email account credentials cannot be stored securely without a proper key."
    );
  }
  return crypto$2.createHash("sha256").update(envKey).digest();
}
function encryptCredentials$2(data) {
  if (!data) return null;
  try {
    const key = getEncryptionKey();
    const iv = crypto$2.randomBytes(IV_LENGTH);
    const cipher = crypto$2.createCipheriv(ALGORITHM, key, iv);
    const jsonData = JSON.stringify(data);
    let encrypted = cipher.update(jsonData, "utf8", "hex");
    encrypted += cipher.final("hex");
    const authTag = cipher.getAuthTag();
    return { encrypted: `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}` };
  } catch (err) {
    throw new Error(`Failed to encrypt credentials: ${err.message}`);
  }
}
function decryptCredentials$2(encryptedData) {
  if (!encryptedData) return null;
  try {
    const key = getEncryptionKey();
    const encryptedString = typeof encryptedData === "object" && encryptedData.encrypted ? encryptedData.encrypted : encryptedData;
    const parts = encryptedString.split(":");
    if (parts.length !== 3) {
      throw new Error("Invalid encrypted data format");
    }
    const iv = Buffer.from(parts[0], "hex");
    const authTag = Buffer.from(parts[1], "hex");
    const encrypted = parts[2];
    const decipher = crypto$2.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return JSON.parse(decrypted);
  } catch (err) {
    if (typeof strapi !== "undefined" && strapi.log) {
      strapi.log.error("[magic-mail] Decryption failed:", err.message);
    }
    return null;
  }
}
var encryption = {
  encryptCredentials: encryptCredentials$2,
  decryptCredentials: decryptCredentials$2
};
const nodemailer = require$$0__default$1.default;
const { decryptCredentials: decryptCredentials$1 } = encryption;
var emailRouter$1 = ({ strapi: strapi2 }) => ({
  /**
   * Send email with smart routing
   * @param {Object} emailData - { to, from, cc, bcc, subject, text, html, replyTo, attachments, type, priority, templateId, templateData OR data }
   * @returns {Promise<Object>} Send result
   */
  async send(emailData) {
    let {
      to,
      from,
      cc,
      bcc,
      subject,
      text,
      html,
      replyTo,
      attachments = [],
      // Array of attachment objects
      type = "transactional",
      // transactional, marketing, notification
      priority = "normal",
      // high, normal, low
      accountName = null,
      // Force specific account
      templateId = null,
      // Template Reference ID
      templateData,
      // Data for template rendering
      data,
      // Alias for templateData (for native Strapi compatibility)
      skipLinkTracking = false
      // Skip link rewriting for sensitive URLs (e.g., Magic Links)
    } = emailData;
    if (!templateData && data) {
      templateData = data;
    }
    if (!to || typeof to === "string" && to.trim().length === 0) {
      throw new Error("Recipient email address (to) is required");
    }
    const normalizeAddr = (addr) => {
      if (!addr) return addr;
      if (typeof addr === "string") {
        if (addr.includes("<") && addr.includes(">")) {
          return addr.replace(/<([^>]+)>/, (_, email) => `<${email.trim().toLowerCase()}>`);
        }
        return addr.trim().toLowerCase();
      }
      return addr;
    };
    const normalizeAddrs = (val) => {
      if (!val) return val;
      if (Array.isArray(val)) {
        return val.map((a) => normalizeAddr(a));
      }
      if (typeof val === "string" && val.includes(",")) {
        return val.split(",").map((a) => normalizeAddr(a)).join(", ");
      }
      return normalizeAddr(val);
    };
    to = normalizeAddrs(to);
    from = normalizeAddr(from);
    replyTo = normalizeAddr(replyTo);
    if (cc) cc = normalizeAddrs(cc);
    if (bcc) bcc = normalizeAddrs(bcc);
    emailData.to = to;
    emailData.from = from;
    emailData.replyTo = replyTo;
    emailData.cc = cc;
    emailData.bcc = bcc;
    if (skipLinkTracking) {
      strapi2.log.info(`[magic-mail] [SKIP-TRACK] skipLinkTracking=true received for email to: ${to}`);
    }
    let renderedTemplate = null;
    if (templateId || emailData.templateReferenceId) {
      try {
        let resolvedTemplateReferenceId = null;
        let templateRecord = null;
        if (emailData.templateReferenceId) {
          resolvedTemplateReferenceId = String(emailData.templateReferenceId).trim();
          strapi2.log.info(`[magic-mail] [TEMPLATE] Using provided templateReferenceId="${resolvedTemplateReferenceId}"`);
        }
        if (!resolvedTemplateReferenceId && templateId) {
          const numericTemplateId = Number(templateId);
          if (!Number.isNaN(numericTemplateId) && Number.isInteger(numericTemplateId)) {
            strapi2.log.info(`[magic-mail] [CHECK] Looking up template by ID: ${numericTemplateId}`);
            templateRecord = await strapi2.plugin("magic-mail").service("email-designer").findOne(numericTemplateId);
            if (!templateRecord) {
              strapi2.log.error(`[magic-mail] [ERROR] Template with ID ${numericTemplateId} not found in database`);
              throw new Error(`Template with ID ${numericTemplateId} not found`);
            }
            if (!templateRecord.templateReferenceId) {
              throw new Error(`Template ${numericTemplateId} has no reference ID set`);
            }
            resolvedTemplateReferenceId = String(templateRecord.templateReferenceId).trim();
            strapi2.log.info(
              `[magic-mail] [SUCCESS] Found template: ID=${templateRecord.id}, referenceId="${resolvedTemplateReferenceId}", name="${templateRecord.name}"`
            );
          } else {
            resolvedTemplateReferenceId = String(templateId).trim();
            strapi2.log.info(`[magic-mail] [TEMPLATE] Treating templateId value as referenceId="${resolvedTemplateReferenceId}"`);
          }
        }
        if (!resolvedTemplateReferenceId) {
          throw new Error("No template reference ID could be resolved");
        }
        renderedTemplate = await strapi2.plugin("magic-mail").service("email-designer").renderTemplate(resolvedTemplateReferenceId, templateData || {});
        html = renderedTemplate.html;
        text = renderedTemplate.text;
        subject = subject || renderedTemplate.subject;
        type = type || renderedTemplate.category;
        strapi2.log.info(
          `[magic-mail] [EMAIL] Rendered template reference "${resolvedTemplateReferenceId}" (requested ID: ${templateId ?? "n/a"}): ${renderedTemplate.templateName}`
        );
        emailData.templateReferenceId = resolvedTemplateReferenceId;
        if (!emailData.templateName) {
          emailData.templateName = templateRecord?.name || renderedTemplate.templateName;
        }
      } catch (error) {
        strapi2.log.error(`[magic-mail] [ERROR] Template rendering failed: ${error.message}`);
        throw new Error(`Template rendering failed: ${error.message}`);
      }
    }
    let emailLog2 = null;
    let recipientHash = null;
    const enableTracking = emailData.enableTracking !== false;
    if (enableTracking && html) {
      try {
        const analyticsService = strapi2.plugin("magic-mail").service("analytics");
        const settingsService = strapi2.plugin("magic-mail").service("plugin-settings");
        const pluginSettings2 = await settingsService.getSettings();
        const globalLinkTrackingEnabled = pluginSettings2.enableLinkTracking !== false;
        const globalOpenTrackingEnabled = pluginSettings2.enableOpenTracking !== false;
        emailLog2 = await analyticsService.createEmailLog({
          to,
          userId: emailData.userId || null,
          recipientName: emailData.recipientName || null,
          subject,
          // Use provided templateId/Name OR from renderedTemplate (if template was rendered here)
          templateId: emailData.templateId || renderedTemplate?.templateReferenceId || null,
          templateName: emailData.templateName || renderedTemplate?.templateName || null,
          accountId: null,
          // Will be set after account selection
          accountName: null,
          metadata: {
            type,
            priority,
            hasAttachments: attachments.length > 0
          }
        });
        recipientHash = analyticsService.generateRecipientHash(emailLog2.emailId, to);
        if (globalOpenTrackingEnabled) {
          html = analyticsService.injectTrackingPixel(html, emailLog2.emailId, recipientHash);
        } else {
          strapi2.log.info(`[magic-mail] [STATS] Open tracking DISABLED globally`);
        }
        const shouldTrackLinks = globalLinkTrackingEnabled && !skipLinkTracking;
        if (shouldTrackLinks) {
          html = await analyticsService.rewriteLinksForTracking(html, emailLog2.emailId, recipientHash);
          strapi2.log.info(`[magic-mail] [STATS] Link tracking enabled for email: ${emailLog2.emailId}`);
        } else if (!globalLinkTrackingEnabled) {
          strapi2.log.info(`[magic-mail] [STATS] Link tracking DISABLED globally for email: ${emailLog2.emailId}`);
        } else {
          strapi2.log.info(`[magic-mail] [STATS] Link tracking DISABLED per-email (skipLinkTracking=true) for email: ${emailLog2.emailId}`);
        }
      } catch (error) {
        strapi2.log.error(`[magic-mail] [WARNING]  Tracking setup failed (continuing without tracking):`, error.message);
      }
    }
    emailData.html = html;
    emailData.text = text;
    emailData.subject = subject;
    let matchedRule = null;
    try {
      const allRules = await strapi2.documents("plugin::magic-mail.routing-rule").findMany({
        filters: { isActive: true },
        sort: [{ priority: "desc" }]
      });
      for (const rule of allRules) {
        let matches = false;
        switch (rule.matchType) {
          case "emailType":
            matches = rule.matchValue === type;
            break;
          case "recipient":
            matches = to && to.toLowerCase().includes(rule.matchValue.toLowerCase());
            break;
          case "subject":
            matches = subject && subject.toLowerCase().includes(rule.matchValue.toLowerCase());
            break;
          case "template":
            matches = emailData.template && emailData.template === rule.matchValue;
            break;
          case "custom":
            matches = emailData.customField && emailData.customField === rule.matchValue;
            break;
        }
        if (matches) {
          matchedRule = rule;
          break;
        }
      }
    } catch (ruleError) {
      strapi2.log.warn("[magic-mail] [WARNING] Failed to check routing rules for WhatsApp fallback:", ruleError.message);
    }
    try {
      const licenseGuard2 = strapi2.plugin("magic-mail").service("license-guard");
      if (priority === "high") {
        const hasFeature = await licenseGuard2.hasFeature("priority-headers");
        if (!hasFeature) {
          strapi2.log.warn("[magic-mail] [WARNING]  High priority emails require Advanced license - using normal priority");
          emailData.priority = "normal";
        }
      }
      const account = accountName ? await this.getAccountByName(accountName) : await this.selectAccount(type, priority, [], emailData);
      if (!account) {
        throw new Error("No email account available");
      }
      const providerAllowed = await licenseGuard2.isProviderAllowed(account.provider);
      if (!providerAllowed) {
        throw new Error(`Provider "${account.provider}" requires a higher license tier. Please upgrade or use a different account.`);
      }
      const canSend = await this.checkRateLimits(account);
      if (!canSend) {
        const fallbackAccount = await this.selectAccount(type, priority, [account.documentId], emailData);
        if (fallbackAccount) {
          strapi2.log.info(`[magic-mail] Rate limit hit on ${account.name}, using fallback: ${fallbackAccount.name}`);
          return await this.sendViaAccount(fallbackAccount, emailData);
        }
        throw new Error(`Rate limit exceeded on ${account.name} and no fallback available`);
      }
      const result = await this.sendViaAccount(account, emailData);
      if (emailLog2) {
        try {
          await strapi2.documents("plugin::magic-mail.email-log").update({
            documentId: emailLog2.documentId,
            data: {
              accountId: account.documentId,
              accountName: account.name,
              deliveredAt: /* @__PURE__ */ new Date()
            }
          });
        } catch (error) {
          strapi2.log.error("[magic-mail] Failed to update email log:", error.message);
        }
      }
      await this.updateAccountStats(account.documentId);
      strapi2.log.info(`[magic-mail] [SUCCESS] Email sent to ${to} via ${account.name}`);
      return {
        success: true,
        accountUsed: account.name,
        messageId: result.messageId
      };
    } catch (error) {
      strapi2.log.error("[magic-mail] [ERROR] Email send failed:", error);
      if (matchedRule?.whatsappFallback) {
        strapi2.log.info("[magic-mail] [FALLBACK] Email failed, attempting WhatsApp fallback...");
        try {
          const whatsapp2 = strapi2.plugin("magic-mail").service("whatsapp");
          const whatsappStatus = whatsapp2.getStatus();
          if (whatsappStatus.isConnected) {
            const phoneNumber = emailData.phoneNumber || emailData.whatsappPhone;
            if (phoneNumber) {
              const whatsappMessage = `*${subject}*

${text || "Email delivery failed. Please check your email settings."}`;
              const waResult = await whatsapp2.sendMessage(phoneNumber, whatsappMessage);
              if (waResult.success) {
                strapi2.log.info(`[magic-mail] [SUCCESS] WhatsApp fallback sent to ${phoneNumber}`);
                return {
                  success: true,
                  fallbackUsed: "whatsapp",
                  phoneNumber
                };
              } else {
                strapi2.log.warn("[magic-mail] [WARNING] WhatsApp fallback failed:", waResult.error);
              }
            } else {
              strapi2.log.warn("[magic-mail] [WARNING] WhatsApp fallback enabled but no phone number provided");
            }
          } else {
            strapi2.log.warn("[magic-mail] [WARNING] WhatsApp fallback enabled but WhatsApp not connected");
          }
        } catch (waError) {
          strapi2.log.error("[magic-mail] [ERROR] WhatsApp fallback error:", waError.message);
        }
      }
      throw error;
    }
  },
  /**
   * Select best account based on rules
   * @param {string} type - Email type (transactional, marketing, notification)
   * @param {string} priority - Priority level (high, normal, low)
   * @param {Array<string>} excludeDocumentIds - Array of documentIds to exclude from selection
   * @param {Object} emailData - Email data for routing rule matching
   * @returns {Promise<Object|null>} Selected account or null
   */
  async selectAccount(type, priority, excludeDocumentIds = [], emailData = {}) {
    const filters = { isActive: true };
    if (excludeDocumentIds.length > 0) {
      filters.documentId = { $notIn: excludeDocumentIds };
    }
    const accounts2 = await strapi2.documents("plugin::magic-mail.email-account").findMany({
      filters,
      sort: [{ priority: "desc" }]
    });
    if (!accounts2 || accounts2.length === 0) {
      return null;
    }
    const allRules = await strapi2.documents("plugin::magic-mail.routing-rule").findMany({
      filters: {
        isActive: true
      },
      sort: [{ priority: "desc" }]
    });
    for (const rule of allRules) {
      let matches = false;
      switch (rule.matchType) {
        case "emailType":
          matches = rule.matchValue === type;
          break;
        case "recipient":
          matches = emailData.to && emailData.to.toLowerCase().includes(rule.matchValue.toLowerCase());
          break;
        case "subject":
          matches = emailData.subject && emailData.subject.toLowerCase().includes(rule.matchValue.toLowerCase());
          break;
        case "template":
          matches = emailData.template && emailData.template === rule.matchValue;
          break;
        case "custom":
          matches = emailData.customField && emailData.customField === rule.matchValue;
          break;
      }
      if (matches) {
        const account = accounts2.find((a) => a.name.toLowerCase() === rule.accountName.toLowerCase());
        if (account) {
          strapi2.log.info(`[magic-mail] [ROUTE] Routing rule matched: ${rule.name} -> ${account.name}`);
          return account;
        }
        if (rule.fallbackAccountName) {
          const fallbackAccount = accounts2.find((a) => a.name === rule.fallbackAccountName);
          if (fallbackAccount) {
            strapi2.log.info(`[magic-mail] [FALLBACK] Using fallback account: ${fallbackAccount.name}`);
            return fallbackAccount;
          }
        }
      }
    }
    const primaryAccount = accounts2.find((a) => a.isPrimary);
    return primaryAccount || accounts2[0];
  },
  /**
   * Send email via specific account
   */
  async sendViaAccount(account, emailData) {
    const { to, subject, text, html, replyTo, attachments } = emailData;
    if (account.provider === "gmail-oauth") {
      return await this.sendViaGmailOAuth(account, emailData);
    } else if (account.provider === "microsoft-oauth") {
      return await this.sendViaMicrosoftOAuth(account, emailData);
    } else if (account.provider === "yahoo-oauth") {
      return await this.sendViaYahooOAuth(account, emailData);
    } else if (account.provider === "nodemailer" || account.provider === "smtp") {
      return await this.sendViaSMTP(account, emailData);
    } else if (account.provider === "sendgrid") {
      return await this.sendViaSendGrid(account, emailData);
    } else if (account.provider === "mailgun") {
      return await this.sendViaMailgun(account, emailData);
    }
    throw new Error(`Unsupported provider: ${account.provider}`);
  },
  /**
   * Send via SMTP (Nodemailer)
   * With enhanced security: DKIM, proper headers, TLS enforcement
   */
  async sendViaSMTP(account, emailData) {
    const config2 = decryptCredentials$1(account.config);
    const transportConfig = {
      host: config2.host,
      port: config2.port || 587,
      secure: config2.secure || false,
      auth: {
        user: config2.user,
        pass: config2.pass
      },
      // Security enhancements
      requireTLS: true,
      // Enforce TLS encryption
      tls: {
        rejectUnauthorized: true,
        // Verify server certificates
        minVersion: "TLSv1.2"
        // Minimum TLS 1.2
      }
    };
    if (config2.dkim) {
      transportConfig.dkim = {
        domainName: config2.dkim.domainName,
        keySelector: config2.dkim.keySelector,
        privateKey: config2.dkim.privateKey
      };
      strapi2.log.info("[magic-mail] DKIM signing enabled");
    }
    const transporter = nodemailer.createTransport(transportConfig);
    const mailOptions = {
      from: emailData.from || `${account.fromName || "MagicMail"} <${account.fromEmail}>`,
      to: emailData.to,
      ...emailData.cc && { cc: emailData.cc },
      ...emailData.bcc && { bcc: emailData.bcc },
      replyTo: emailData.replyTo || account.replyTo,
      subject: emailData.subject,
      text: emailData.text,
      html: emailData.html,
      attachments: emailData.attachments || [],
      // RFC 5322 required headers
      date: /* @__PURE__ */ new Date(),
      messageId: `<${Date.now()}.${Math.random().toString(36).substring(7)}@${account.fromEmail.split("@")[1]}>`,
      // Security and deliverability headers (2025 standards)
      headers: {
        // Client identification (RFC 5321)
        "X-Mailer": "MagicMail/1.0",
        // Priority headers (RFC 2156)
        "X-Priority": emailData.priority === "high" ? "1 (Highest)" : "3 (Normal)",
        "Importance": emailData.priority === "high" ? "high" : "normal",
        // Email type classification
        "X-Email-Type": emailData.type || "transactional",
        // Auto-submitted header (RFC 3834) - prevents auto-responders from replying
        "Auto-Submitted": emailData.type === "notification" ? "auto-generated" : "no",
        // Content security (prevents MIME sniffing attacks)
        "X-Content-Type-Options": "nosniff",
        // Tracking and reference
        "X-Entity-Ref-ID": `magicmail-${Date.now()}`,
        // Sender policy (helps with SPF validation)
        "Sender": account.fromEmail,
        // Content transfer encoding recommendation
        "Content-Transfer-Encoding": "8bit"
      },
      // Encoding (UTF-8 for international characters)
      encoding: "utf-8",
      // Text encoding for proper character handling
      textEncoding: "base64"
    };
    if (emailData.type === "marketing") {
      if (emailData.unsubscribeUrl) {
        mailOptions.headers["List-Unsubscribe"] = `<${emailData.unsubscribeUrl}>`;
        mailOptions.headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
        mailOptions.headers["Precedence"] = "bulk";
      } else {
        strapi2.log.warn("[magic-mail] [WARNING] Marketing email without unsubscribe URL - may violate GDPR/CAN-SPAM");
      }
    }
    if (emailData.headers && typeof emailData.headers === "object") {
      Object.assign(mailOptions.headers, emailData.headers);
    }
    if (mailOptions.attachments.length > 0) {
      strapi2.log.info(`[magic-mail] Sending email with ${mailOptions.attachments.length} attachment(s)`);
    }
    return await transporter.sendMail(mailOptions);
  },
  /**
   * Send via Gmail OAuth
   * With enhanced security headers and proper formatting
   */
  async sendViaGmailOAuth(account, emailData) {
    if (!account.oauth) {
      throw new Error("Gmail OAuth account not fully configured. Please complete the OAuth flow first.");
    }
    const oauth2 = decryptCredentials$1(account.oauth);
    const config2 = decryptCredentials$1(account.config);
    strapi2.log.info(`[magic-mail] Sending via Gmail OAuth for account: ${account.name}`);
    strapi2.log.info(`[magic-mail] Has oauth.email: ${!!oauth2.email} (${oauth2.email || "none"})`);
    strapi2.log.info(`[magic-mail] Has oauth.accessToken: ${!!oauth2.accessToken}`);
    strapi2.log.info(`[magic-mail] Has config.clientId: ${!!config2.clientId}`);
    if (!oauth2.email || !oauth2.accessToken) {
      throw new Error("Missing OAuth credentials. Please re-authenticate this account.");
    }
    if (!config2.clientId || !config2.clientSecret) {
      throw new Error("Missing OAuth client credentials.");
    }
    this.validateEmailSecurity(emailData);
    let currentAccessToken = oauth2.accessToken;
    if (oauth2.expiresAt && new Date(oauth2.expiresAt) < /* @__PURE__ */ new Date()) {
      strapi2.log.info("[magic-mail] Access token expired, refreshing...");
      if (!oauth2.refreshToken) {
        throw new Error("Access token expired and no refresh token available. Please re-authenticate.");
      }
      try {
        const oauthService = strapi2.plugin("magic-mail").service("oauth");
        const newTokens = await oauthService.refreshGmailTokens(
          oauth2.refreshToken,
          config2.clientId,
          config2.clientSecret
        );
        currentAccessToken = newTokens.accessToken;
        strapi2.log.info("[magic-mail] [SUCCESS] Token refreshed successfully");
        const { encryptCredentials: encryptCredentials2 } = encryption;
        const updatedOAuth = encryptCredentials2({
          ...oauth2,
          accessToken: newTokens.accessToken,
          expiresAt: newTokens.expiresAt
        });
        await strapi2.documents("plugin::magic-mail.email-account").update({
          documentId: account.documentId,
          data: { oauth: updatedOAuth }
        });
      } catch (refreshErr) {
        strapi2.log.error("[magic-mail] Token refresh failed:", refreshErr);
        throw new Error("Access token expired and refresh failed. Please re-authenticate this account.");
      }
    }
    strapi2.log.info("[magic-mail] Using Gmail API to send email...");
    try {
      const boundary = `----=_Part_${Date.now()}`;
      const attachments = emailData.attachments || [];
      let emailContent = "";
      if (attachments.length > 0) {
        const emailLines = [
          `From: ${account.fromName ? `"${account.fromName}" ` : ""}<${account.fromEmail}>`,
          `To: ${emailData.to}`,
          `Subject: ${emailData.subject}`,
          `Date: ${(/* @__PURE__ */ new Date()).toUTCString()}`,
          `Message-ID: <${Date.now()}.${Math.random().toString(36).substring(7)}@${account.fromEmail.split("@")[1]}>`,
          "MIME-Version: 1.0",
          `Content-Type: multipart/mixed; boundary="${boundary}"`,
          "X-Mailer: MagicMail/1.0"
        ];
        if (emailData.cc) emailLines.push(`Cc: ${emailData.cc}`);
        if (emailData.bcc) emailLines.push(`Bcc: ${emailData.bcc}`);
        if (emailData.priority === "high") {
          emailLines.push("X-Priority: 1 (Highest)");
          emailLines.push("Importance: high");
        }
        if (emailData.type === "marketing" && emailData.unsubscribeUrl) {
          emailLines.push(`List-Unsubscribe: <${emailData.unsubscribeUrl}>`);
          emailLines.push("List-Unsubscribe-Post: List-Unsubscribe=One-Click");
        }
        emailLines.push("");
        emailLines.push(`--${boundary}`);
        emailLines.push("Content-Type: text/html; charset=utf-8");
        emailLines.push("");
        emailLines.push(emailData.html || emailData.text || "");
        const fs2 = require("fs");
        const path2 = require("path");
        for (const attachment of attachments) {
          emailLines.push(`--${boundary}`);
          let fileContent;
          let filename;
          let contentType = attachment.contentType || "application/octet-stream";
          if (attachment.content) {
            fileContent = Buffer.isBuffer(attachment.content) ? attachment.content : Buffer.from(attachment.content);
            filename = attachment.filename || "attachment";
          } else if (attachment.path) {
            fileContent = fs2.readFileSync(attachment.path);
            filename = attachment.filename || path2.basename(attachment.path);
            if (!attachment.contentType) {
              const ext = path2.extname(filename).toLowerCase();
              const types = {
                ".pdf": "application/pdf",
                ".png": "image/png",
                ".jpg": "image/jpeg",
                ".jpeg": "image/jpeg",
                ".gif": "image/gif",
                ".txt": "text/plain",
                ".csv": "text/csv",
                ".doc": "application/msword",
                ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                ".xls": "application/vnd.ms-excel",
                ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              };
              contentType = types[ext] || "application/octet-stream";
            }
          } else {
            continue;
          }
          emailLines.push(`Content-Type: ${contentType}; name="${filename}"`);
          emailLines.push(`Content-Disposition: attachment; filename="${filename}"`);
          emailLines.push("Content-Transfer-Encoding: base64");
          emailLines.push("");
          emailLines.push(fileContent.toString("base64"));
        }
        emailLines.push(`--${boundary}--`);
        emailContent = emailLines.join("\r\n");
        strapi2.log.info(`[magic-mail] Email with ${attachments.length} attachment(s) prepared`);
      } else {
        const emailLines = [
          `From: ${account.fromName ? `"${account.fromName}" ` : ""}<${account.fromEmail}>`,
          `To: ${emailData.to}`,
          `Subject: ${emailData.subject}`,
          `Date: ${(/* @__PURE__ */ new Date()).toUTCString()}`,
          `Message-ID: <${Date.now()}.${Math.random().toString(36).substring(7)}@${account.fromEmail.split("@")[1]}>`,
          "MIME-Version: 1.0",
          "Content-Type: text/html; charset=utf-8",
          "X-Mailer: MagicMail/1.0"
        ];
        if (emailData.cc) emailLines.push(`Cc: ${emailData.cc}`);
        if (emailData.bcc) emailLines.push(`Bcc: ${emailData.bcc}`);
        if (emailData.priority === "high") {
          emailLines.push("X-Priority: 1 (Highest)");
          emailLines.push("Importance: high");
        }
        if (emailData.type === "marketing" && emailData.unsubscribeUrl) {
          emailLines.push(`List-Unsubscribe: <${emailData.unsubscribeUrl}>`);
          emailLines.push("List-Unsubscribe-Post: List-Unsubscribe=One-Click");
        }
        emailLines.push("");
        emailLines.push(emailData.html || emailData.text || "");
        emailContent = emailLines.join("\r\n");
      }
      const encodedEmail = Buffer.from(emailContent).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${currentAccessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          raw: encodedEmail
        })
      });
      if (!response.ok) {
        const errorData = await response.json();
        strapi2.log.error("[magic-mail] Gmail API error:", errorData);
        throw new Error(`Gmail API error: ${errorData.error?.message || response.statusText}`);
      }
      const result = await response.json();
      strapi2.log.info("[magic-mail] [SUCCESS] Email sent via Gmail API");
      return {
        messageId: result.id,
        response: "OK"
      };
    } catch (err) {
      strapi2.log.error("[magic-mail] Gmail API send failed:", err.message || err);
      strapi2.log.error("[magic-mail] Error details:", {
        name: err.name,
        code: err.code,
        cause: err.cause?.message || err.cause,
        stack: err.stack?.split("\n").slice(0, 3).join("\n")
      });
      throw err;
    }
  },
  /**
   * Send via Microsoft OAuth (Outlook/Exchange Online)
   * With enhanced security and Graph API best practices
   */
  async sendViaMicrosoftOAuth(account, emailData) {
    if (!account.oauth) {
      throw new Error("Microsoft OAuth account not fully configured. Please complete the OAuth flow first.");
    }
    const oauth2 = decryptCredentials$1(account.oauth);
    const config2 = decryptCredentials$1(account.config);
    strapi2.log.info(`[magic-mail] Sending via Microsoft OAuth for account: ${account.name}`);
    strapi2.log.info(`[magic-mail] Has oauth.email: ${!!oauth2.email} (${oauth2.email || "none"})`);
    strapi2.log.info(`[magic-mail] Has oauth.accessToken: ${!!oauth2.accessToken}`);
    strapi2.log.info(`[magic-mail] Has config.clientId: ${!!config2.clientId}`);
    if (!oauth2.email || !oauth2.accessToken) {
      throw new Error("Missing OAuth credentials. Please re-authenticate this account.");
    }
    if (!config2.clientId || !config2.clientSecret) {
      throw new Error("Missing OAuth client credentials.");
    }
    this.validateEmailSecurity(emailData);
    let currentAccessToken = oauth2.accessToken;
    if (oauth2.expiresAt && new Date(oauth2.expiresAt) < /* @__PURE__ */ new Date()) {
      strapi2.log.info("[magic-mail] Access token expired, refreshing...");
      if (!oauth2.refreshToken) {
        throw new Error("Access token expired and no refresh token available. Please re-authenticate.");
      }
      try {
        if (!config2.tenantId) {
          throw new Error("Tenant ID not found in config. Please re-configure this account.");
        }
        const oauthService = strapi2.plugin("magic-mail").service("oauth");
        const newTokens = await oauthService.refreshMicrosoftTokens(
          oauth2.refreshToken,
          config2.clientId,
          config2.clientSecret,
          config2.tenantId
        );
        currentAccessToken = newTokens.accessToken;
        strapi2.log.info("[magic-mail] [SUCCESS] Microsoft token refreshed successfully");
        const { encryptCredentials: encryptCredentials2 } = encryption;
        const updatedOAuth = encryptCredentials2({
          ...oauth2,
          accessToken: newTokens.accessToken,
          expiresAt: newTokens.expiresAt
        });
        await strapi2.documents("plugin::magic-mail.email-account").update({
          documentId: account.documentId,
          data: { oauth: updatedOAuth }
        });
      } catch (refreshErr) {
        strapi2.log.error("[magic-mail] Token refresh failed:", refreshErr);
        throw new Error("Access token expired and refresh failed. Please re-authenticate this account.");
      }
    }
    strapi2.log.info("[magic-mail] Using Microsoft Graph API with MIME format (DMARC-safe)...");
    try {
      const boundary = `----=_Part_${Date.now()}`;
      const attachments = emailData.attachments || [];
      let mimeContent = "";
      if (attachments.length > 0) {
        const mimeLines = [
          // DON'T include From - Microsoft adds it with DKIM!
          `To: ${emailData.to}`,
          `Subject: ${emailData.subject}`,
          `Date: ${(/* @__PURE__ */ new Date()).toUTCString()}`,
          `Message-ID: <${Date.now()}.${Math.random().toString(36).substring(7)}@${account.fromEmail.split("@")[1]}>`,
          "MIME-Version: 1.0",
          `Content-Type: multipart/mixed; boundary="${boundary}"`,
          "X-Mailer: MagicMail/1.0"
        ];
        if (emailData.cc) mimeLines.push(`Cc: ${emailData.cc}`);
        if (emailData.bcc) mimeLines.push(`Bcc: ${emailData.bcc}`);
        if (emailData.priority === "high") {
          mimeLines.push("X-Priority: 1 (Highest)");
          mimeLines.push("Importance: high");
        }
        if (emailData.type === "marketing" && emailData.unsubscribeUrl) {
          mimeLines.push(`List-Unsubscribe: <${emailData.unsubscribeUrl}>`);
          mimeLines.push("List-Unsubscribe-Post: List-Unsubscribe=One-Click");
        }
        if (emailData.replyTo || account.replyTo) {
          mimeLines.push(`Reply-To: ${emailData.replyTo || account.replyTo}`);
        }
        mimeLines.push("");
        mimeLines.push(`--${boundary}`);
        mimeLines.push("Content-Type: text/html; charset=utf-8");
        mimeLines.push("");
        mimeLines.push(emailData.html || emailData.text || "");
        const fs2 = require("fs");
        const path2 = require("path");
        for (const attachment of attachments) {
          mimeLines.push(`--${boundary}`);
          let fileContent;
          let filename;
          let contentType = attachment.contentType || "application/octet-stream";
          if (attachment.content) {
            fileContent = Buffer.isBuffer(attachment.content) ? attachment.content : Buffer.from(attachment.content);
            filename = attachment.filename || "attachment";
          } else if (attachment.path) {
            fileContent = fs2.readFileSync(attachment.path);
            filename = attachment.filename || path2.basename(attachment.path);
          } else {
            continue;
          }
          mimeLines.push(`Content-Type: ${contentType}; name="${filename}"`);
          mimeLines.push(`Content-Disposition: attachment; filename="${filename}"`);
          mimeLines.push("Content-Transfer-Encoding: base64");
          mimeLines.push("");
          mimeLines.push(fileContent.toString("base64"));
        }
        mimeLines.push(`--${boundary}--`);
        mimeContent = mimeLines.join("\r\n");
      } else {
        const mimeLines = [
          // DON'T include From - Microsoft adds it with DKIM!
          `To: ${emailData.to}`,
          `Subject: ${emailData.subject}`,
          `Date: ${(/* @__PURE__ */ new Date()).toUTCString()}`,
          `Message-ID: <${Date.now()}.${Math.random().toString(36).substring(7)}@${account.fromEmail.split("@")[1]}>`,
          "MIME-Version: 1.0",
          "Content-Type: text/html; charset=utf-8",
          "X-Mailer: MagicMail/1.0"
        ];
        if (emailData.cc) mimeLines.push(`Cc: ${emailData.cc}`);
        if (emailData.bcc) mimeLines.push(`Bcc: ${emailData.bcc}`);
        if (emailData.priority === "high") {
          mimeLines.push("X-Priority: 1 (Highest)");
          mimeLines.push("Importance: high");
        }
        if (emailData.type === "marketing" && emailData.unsubscribeUrl) {
          mimeLines.push(`List-Unsubscribe: <${emailData.unsubscribeUrl}>`);
          mimeLines.push("List-Unsubscribe-Post: List-Unsubscribe=One-Click");
        }
        if (emailData.replyTo || account.replyTo) {
          mimeLines.push(`Reply-To: ${emailData.replyTo || account.replyTo}`);
        }
        mimeLines.push("");
        mimeLines.push(emailData.html || emailData.text || "");
        mimeContent = mimeLines.join("\r\n");
      }
      const base64Mime = Buffer.from(mimeContent).toString("base64");
      const response = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${currentAccessToken}`,
          "Content-Type": "text/plain"
          // MIME format!
        },
        body: base64Mime
      });
      if (response.status !== 202) {
        let errorData = "Unknown error";
        try {
          errorData = await response.text();
        } catch (e) {
        }
        strapi2.log.error("[magic-mail] Microsoft Graph MIME error:", errorData);
        strapi2.log.error("[magic-mail] Response status:", response.status);
        throw new Error(`Microsoft Graph API error: ${response.status} - ${response.statusText}`);
      }
      strapi2.log.info("[magic-mail] [SUCCESS] Email sent via Microsoft Graph API with MIME + custom headers");
      strapi2.log.info("[magic-mail] Microsoft adds From/DKIM automatically for DMARC compliance");
      return {
        messageId: `microsoft-${Date.now()}`,
        response: "Accepted"
      };
    } catch (err) {
      strapi2.log.error("[magic-mail] Microsoft Graph API send failed:", err);
      throw err;
    }
  },
  /**
   * Send via Yahoo OAuth
   * With enhanced security and SMTP OAuth2 best practices
   */
  async sendViaYahooOAuth(account, emailData) {
    if (!account.oauth) {
      throw new Error("Yahoo OAuth account not fully configured. Please complete the OAuth flow first.");
    }
    const oauth2 = decryptCredentials$1(account.oauth);
    const config2 = decryptCredentials$1(account.config);
    strapi2.log.info(`[magic-mail] Sending via Yahoo OAuth for account: ${account.name}`);
    strapi2.log.info(`[magic-mail] Has oauth.email: ${!!oauth2.email} (${oauth2.email || "none"})`);
    strapi2.log.info(`[magic-mail] Has oauth.accessToken: ${!!oauth2.accessToken}`);
    if (!oauth2.email || !oauth2.accessToken) {
      throw new Error("Missing OAuth credentials. Please re-authenticate this account.");
    }
    this.validateEmailSecurity(emailData);
    let currentAccessToken = oauth2.accessToken;
    if (oauth2.expiresAt && new Date(oauth2.expiresAt) < /* @__PURE__ */ new Date()) {
      strapi2.log.info("[magic-mail] Access token expired, refreshing...");
      if (!oauth2.refreshToken) {
        throw new Error("Access token expired and no refresh token available. Please re-authenticate.");
      }
      try {
        const oauthService = strapi2.plugin("magic-mail").service("oauth");
        const newTokens = await oauthService.refreshYahooTokens(
          oauth2.refreshToken,
          config2.clientId,
          config2.clientSecret
        );
        currentAccessToken = newTokens.accessToken;
        strapi2.log.info("[magic-mail] [SUCCESS] Token refreshed successfully");
        const { encryptCredentials: encryptCredentials2 } = encryption;
        const updatedOAuth = encryptCredentials2({
          ...oauth2,
          accessToken: newTokens.accessToken,
          expiresAt: newTokens.expiresAt
        });
        await strapi2.documents("plugin::magic-mail.email-account").update({
          documentId: account.documentId,
          data: { oauth: updatedOAuth }
        });
      } catch (refreshErr) {
        strapi2.log.error("[magic-mail] Token refresh failed:", refreshErr);
        throw new Error("Access token expired and refresh failed. Please re-authenticate this account.");
      }
    }
    const nodemailer2 = require$$0__default$1.default;
    strapi2.log.info("[magic-mail] Using Yahoo SMTP with OAuth...");
    try {
      const transporter = nodemailer2.createTransport({
        host: "smtp.mail.yahoo.com",
        port: 465,
        secure: true,
        auth: {
          type: "OAuth2",
          user: oauth2.email,
          accessToken: currentAccessToken
        }
      });
      const mailOptions = {
        from: `${account.fromName || "Yahoo Mail"} <${account.fromEmail}>`,
        to: emailData.to,
        ...emailData.cc && { cc: emailData.cc },
        ...emailData.bcc && { bcc: emailData.bcc },
        replyTo: emailData.replyTo || account.replyTo,
        subject: emailData.subject,
        text: emailData.text,
        html: emailData.html,
        attachments: emailData.attachments || [],
        // Security and deliverability headers
        headers: {
          "X-Mailer": "MagicMail/1.0",
          "X-Priority": emailData.priority === "high" ? "1" : "3"
        },
        // Generate proper Message-ID
        messageId: `<${Date.now()}.${Math.random().toString(36).substring(7)}@${account.fromEmail.split("@")[1]}>`,
        date: /* @__PURE__ */ new Date()
      };
      if (emailData.type === "marketing" && emailData.unsubscribeUrl) {
        mailOptions.headers["List-Unsubscribe"] = `<${emailData.unsubscribeUrl}>`;
        mailOptions.headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
      }
      if (mailOptions.attachments.length > 0) {
        strapi2.log.info(`[magic-mail] Sending email with ${mailOptions.attachments.length} attachment(s)`);
      }
      const result = await transporter.sendMail(mailOptions);
      strapi2.log.info("[magic-mail] [SUCCESS] Email sent via Yahoo OAuth");
      return {
        messageId: result.messageId,
        response: result.response
      };
    } catch (err) {
      strapi2.log.error("[magic-mail] Yahoo OAuth send failed:", err);
      throw err;
    }
  },
  /**
   * Send via SendGrid API
   * With enhanced security and proper headers
   */
  async sendViaSendGrid(account, emailData) {
    const config2 = decryptCredentials$1(account.config);
    if (!config2.apiKey) {
      throw new Error("SendGrid API key not configured");
    }
    this.validateEmailSecurity(emailData);
    strapi2.log.info(`[magic-mail] Sending via SendGrid for account: ${account.name}`);
    try {
      const personalization = { to: [{ email: emailData.to }] };
      if (emailData.cc) {
        const ccList = Array.isArray(emailData.cc) ? emailData.cc : emailData.cc.split(",").map((e) => e.trim());
        personalization.cc = ccList.map((email) => ({ email }));
      }
      if (emailData.bcc) {
        const bccList = Array.isArray(emailData.bcc) ? emailData.bcc : emailData.bcc.split(",").map((e) => e.trim());
        personalization.bcc = bccList.map((email) => ({ email }));
      }
      const msg = {
        personalizations: [personalization],
        from: {
          email: account.fromEmail,
          name: account.fromName || account.fromEmail
        },
        subject: emailData.subject,
        content: [
          ...emailData.text ? [{ type: "text/plain", value: emailData.text }] : [],
          ...emailData.html ? [{ type: "text/html", value: emailData.html }] : []
        ],
        // Security and tracking headers
        customArgs: {
          "magicmail_version": "1.0",
          "email_type": emailData.type || "transactional",
          "priority": emailData.priority || "normal"
        },
        // Headers object for custom headers
        headers: {
          "X-Mailer": "MagicMail/1.0"
        }
      };
      if (emailData.priority === "high") {
        msg.headers["X-Priority"] = "1 (Highest)";
        msg.headers["Importance"] = "high";
      }
      if (emailData.replyTo || account.replyTo) {
        msg.replyTo = {
          email: emailData.replyTo || account.replyTo
        };
      }
      if (emailData.type === "marketing" && emailData.unsubscribeUrl) {
        msg.headers["List-Unsubscribe"] = `<${emailData.unsubscribeUrl}>`;
        msg.headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
      }
      const attachments = emailData.attachments || [];
      if (attachments.length > 0) {
        const fs2 = require("fs");
        const path2 = require("path");
        msg.attachments = [];
        for (const attachment of attachments) {
          let fileContent;
          let filename;
          let contentType = attachment.contentType || "application/octet-stream";
          if (attachment.content) {
            fileContent = Buffer.isBuffer(attachment.content) ? attachment.content : Buffer.from(attachment.content);
            filename = attachment.filename || "attachment";
          } else if (attachment.path) {
            fileContent = fs2.readFileSync(attachment.path);
            filename = attachment.filename || path2.basename(attachment.path);
          } else {
            continue;
          }
          msg.attachments.push({
            content: fileContent.toString("base64"),
            filename,
            type: contentType,
            disposition: "attachment"
          });
        }
        strapi2.log.info(`[magic-mail] Email with ${attachments.length} attachment(s) prepared`);
      }
      const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${config2.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(msg)
      });
      if (!response.ok) {
        const errorText = await response.text();
        strapi2.log.error("[magic-mail] SendGrid API error:", errorText);
        throw new Error(`SendGrid API error: ${response.statusText}`);
      }
      strapi2.log.info("[magic-mail] [SUCCESS] Email sent via SendGrid API");
      return {
        messageId: response.headers.get("x-message-id") || `sendgrid-${Date.now()}`,
        response: "Accepted"
      };
    } catch (err) {
      strapi2.log.error("[magic-mail] SendGrid send failed:", err);
      throw err;
    }
  },
  /**
   * Send via Mailgun API
   * With enhanced security and compliance headers
   */
  async sendViaMailgun(account, emailData) {
    const config2 = decryptCredentials$1(account.config);
    if (!config2.apiKey || !config2.domain) {
      throw new Error("Mailgun API key and domain not configured");
    }
    this.validateEmailSecurity(emailData);
    strapi2.log.info(`[magic-mail] Sending via Mailgun for account: ${account.name}`);
    strapi2.log.info(`[magic-mail] Domain: ${config2.domain}`);
    try {
      const FormData = require("form-data");
      const form = new FormData();
      form.append(
        "from",
        account.fromName ? `${account.fromName} <${account.fromEmail}>` : account.fromEmail
      );
      form.append("to", emailData.to);
      if (emailData.cc) form.append("cc", emailData.cc);
      if (emailData.bcc) form.append("bcc", emailData.bcc);
      form.append("subject", emailData.subject);
      if (emailData.html) {
        form.append("html", emailData.html);
      }
      if (emailData.text) {
        form.append("text", emailData.text);
      }
      if (emailData.replyTo || account.replyTo) {
        form.append("h:Reply-To", emailData.replyTo || account.replyTo);
      }
      form.append("h:X-Mailer", "MagicMail/1.0");
      form.append("h:X-Email-Type", emailData.type || "transactional");
      if (emailData.type === "marketing" && emailData.unsubscribeUrl) {
        form.append("h:List-Unsubscribe", `<${emailData.unsubscribeUrl}>`);
        form.append("h:List-Unsubscribe-Post", "List-Unsubscribe=One-Click");
      }
      const attachments = emailData.attachments || [];
      if (attachments.length > 0) {
        const fs2 = require("fs");
        const path2 = require("path");
        for (const attachment of attachments) {
          let fileContent;
          let filename;
          if (attachment.content) {
            fileContent = Buffer.isBuffer(attachment.content) ? attachment.content : Buffer.from(attachment.content);
            filename = attachment.filename || "attachment";
          } else if (attachment.path) {
            fileContent = fs2.readFileSync(attachment.path);
            filename = attachment.filename || path2.basename(attachment.path);
          } else {
            continue;
          }
          form.append("attachment", fileContent, {
            filename,
            contentType: attachment.contentType || "application/octet-stream"
          });
        }
        strapi2.log.info(`[magic-mail] Email with ${attachments.length} attachment(s) prepared`);
      }
      const response = await fetch(`https://api.mailgun.net/v3/${config2.domain}/messages`, {
        method: "POST",
        headers: {
          "Authorization": `Basic ${Buffer.from(`api:${config2.apiKey}`).toString("base64")}`,
          ...form.getHeaders()
        },
        body: form
      });
      if (!response.ok) {
        const errorData = await response.text();
        strapi2.log.error("[magic-mail] Mailgun API error:", errorData);
        throw new Error(`Mailgun API error: ${response.statusText}`);
      }
      const result = await response.json();
      strapi2.log.info("[magic-mail] [SUCCESS] Email sent via Mailgun API");
      return {
        messageId: result.id || `mailgun-${Date.now()}`,
        response: result.message || "Queued"
      };
    } catch (err) {
      strapi2.log.error("[magic-mail] Mailgun send failed:", err);
      throw err;
    }
  },
  /**
   * Check if account is within rate limits
   */
  async checkRateLimits(account) {
    if (account.dailyLimit > 0 && account.emailsSentToday >= account.dailyLimit) {
      return false;
    }
    if (account.hourlyLimit > 0 && account.emailsSentThisHour >= account.hourlyLimit) {
      return false;
    }
    return true;
  },
  /**
   * Update account statistics
   * Note: This function now expects documentId
   */
  async updateAccountStats(documentId) {
    const account = await strapi2.documents("plugin::magic-mail.email-account").findOne({
      documentId
    });
    if (!account) return;
    await strapi2.documents("plugin::magic-mail.email-account").update({
      documentId,
      data: {
        emailsSentToday: (account.emailsSentToday || 0) + 1,
        emailsSentThisHour: (account.emailsSentThisHour || 0) + 1,
        totalEmailsSent: (account.totalEmailsSent || 0) + 1,
        lastUsed: /* @__PURE__ */ new Date()
      }
    });
  },
  /**
   * Log email to database (DEPRECATED - now handled by Analytics)
   * This function previously created duplicate logs
   * Now it's a no-op since email-log creation is handled in the analytics service
   */
  async logEmail(logData) {
    strapi2.log.debug("[magic-mail] Email already logged via Analytics service");
  },
  /**
   * Get account by name
   */
  async getAccountByName(name) {
    const accounts2 = await strapi2.documents("plugin::magic-mail.email-account").findMany({
      filters: { name, isActive: true },
      limit: 1
    });
    return accounts2 && accounts2.length > 0 ? accounts2[0] : null;
  },
  /**
   * Validate email content for security best practices
   * Prevents common security issues and spam triggers
   */
  validateEmailSecurity(emailData) {
    const { to, subject, html, text } = emailData;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const extractEmail = (addr) => {
      if (!addr || typeof addr !== "string") return "";
      if (addr.includes("<")) {
        const match = addr.match(/<([^>]+)>/);
        return match ? match[1].trim() : addr.trim();
      }
      return addr.trim();
    };
    const validateAddr = (addr) => emailRegex.test(extractEmail(addr));
    if (Array.isArray(to)) {
      for (const addr of to) {
        if (!validateAddr(addr)) {
          throw new Error(`Invalid recipient email format: ${addr}`);
        }
      }
    } else if (typeof to === "string") {
      const addresses = to.includes(",") ? to.split(",") : [to];
      for (const addr of addresses) {
        if (!validateAddr(addr.trim())) {
          throw new Error(`Invalid recipient email format: ${addr.trim()}`);
        }
      }
    }
    if (!subject || subject.trim().length === 0) {
      throw new Error("Email subject is required for security and deliverability");
    }
    if (subject.length > 200) {
      strapi2.log.warn("[magic-mail] Subject line exceeds 200 characters - may trigger spam filters");
    }
    if (!html && !text) {
      throw new Error("Email must have either text or html content");
    }
    const spamTriggers = [
      /\bfree\b.*\bmoney\b/i,
      /\b100%\s*free\b/i,
      /\bclaim.*\bprize\b/i,
      /\bclick\s*here\s*now\b/i,
      /\bviagra\b/i,
      /\bcasino\b/i
    ];
    for (const pattern of spamTriggers) {
      if (pattern.test(subject)) {
        strapi2.log.warn(`[magic-mail] Subject contains potential spam trigger: "${subject}"`);
        break;
      }
    }
    if (html) {
      if (/<script[^>]*>.*?<\/script>/i.test(html)) {
        throw new Error("Email HTML must not contain <script> tags for security");
      }
      if (/javascript:/i.test(html)) {
        throw new Error("Email HTML must not contain javascript: protocol for security");
      }
    }
    if (html && !text) {
      strapi2.log.warn("[magic-mail] Email has HTML but no text alternative - may reduce deliverability");
    }
    strapi2.log.info("[magic-mail] [SUCCESS] Email security validation passed");
  },
  /**
   * Add security headers to email data
   * Returns enhanced email data with security headers
   */
  addSecurityHeaders(emailData, account) {
    const headers = {
      "X-Mailer": "MagicMail/1.0",
      "X-Entity-Ref-ID": `magicmail-${Date.now()}`
    };
    if (emailData.priority === "high") {
      headers["X-Priority"] = "1";
      headers["Importance"] = "high";
    }
    if (emailData.type === "marketing") {
      if (emailData.unsubscribeUrl) {
        headers["List-Unsubscribe"] = `<${emailData.unsubscribeUrl}>`;
        headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
      } else {
        strapi2.log.warn("[magic-mail] Marketing email without unsubscribe URL - may violate regulations");
      }
    }
    return {
      ...emailData,
      headers: {
        ...emailData.headers,
        ...headers
      }
    };
  },
  // ============================================================================
  // UNIFIED MESSAGE API - Send via Email OR WhatsApp
  // ============================================================================
  /**
   * Send a message via WhatsApp
   * Same pattern as send() but for WhatsApp
   * @param {Object} messageData - { phoneNumber, message, templateId, templateData }
   * @returns {Promise<Object>} Send result
   */
  async sendWhatsApp(messageData) {
    const {
      phoneNumber,
      message,
      templateId = null,
      templateData = {}
    } = messageData;
    if (!phoneNumber) {
      throw new Error("Phone number is required for WhatsApp messages");
    }
    const cleanPhone = phoneNumber.replace(/[^\d]/g, "");
    if (cleanPhone.length < 10) {
      throw new Error("Invalid phone number format. Use format: 491234567890 (country code + number)");
    }
    const whatsapp2 = strapi2.plugin("magic-mail").service("whatsapp");
    const status = whatsapp2.getStatus();
    if (!status.isConnected) {
      throw new Error("WhatsApp is not connected. Please connect WhatsApp first in the admin panel.");
    }
    let finalMessage = message;
    if (templateId) {
      try {
        const template = await whatsapp2.getTemplate(templateId);
        if (template) {
          finalMessage = template.content;
          Object.keys(templateData).forEach((key) => {
            finalMessage = finalMessage.replace(new RegExp(`{{${key}}}`, "g"), templateData[key]);
          });
        }
      } catch (error) {
        strapi2.log.warn(`[magic-mail] WhatsApp template ${templateId} not found, using plain message`);
      }
    }
    if (!finalMessage) {
      throw new Error("Message content is required");
    }
    strapi2.log.info(`[magic-mail] [WHATSAPP] Sending message to ${cleanPhone}`);
    const result = await whatsapp2.sendMessage(cleanPhone, finalMessage);
    if (result.success) {
      strapi2.log.info(`[magic-mail] [SUCCESS] WhatsApp message sent to ${cleanPhone}`);
      return {
        success: true,
        channel: "whatsapp",
        phoneNumber: cleanPhone,
        jid: result.jid
      };
    } else {
      strapi2.log.error(`[magic-mail] [ERROR] WhatsApp send failed: ${result.error}`);
      throw new Error(result.error || "Failed to send WhatsApp message");
    }
  },
  /**
   * Unified send method - automatically chooses Email or WhatsApp
   * @param {Object} messageData - Combined email and WhatsApp data
   * @param {string} messageData.channel - 'email' | 'whatsapp' | 'auto' (default: 'auto')
   * @param {string} messageData.to - Email address (for email channel)
   * @param {string} messageData.phoneNumber - Phone number (for whatsapp channel)
   * @param {string} messageData.subject - Email subject
   * @param {string} messageData.message - Plain text message (used for WhatsApp, or as email text)
   * @param {string} messageData.html - HTML content (email only)
   * @param {string} messageData.templateId - Template ID (works for both channels)
   * @param {Object} messageData.templateData - Template variables
   * @returns {Promise<Object>} Send result with channel info
   */
  async sendMessage(messageData) {
    const {
      channel = "auto",
      to,
      phoneNumber,
      subject,
      message,
      text,
      html,
      templateId,
      templateData,
      ...rest
    } = messageData;
    let useChannel = channel;
    if (channel === "auto") {
      if (to && to.includes("@")) {
        useChannel = "email";
      } else if (phoneNumber) {
        useChannel = "whatsapp";
      } else {
        throw new Error("Either email (to) or phoneNumber is required");
      }
    }
    strapi2.log.info(`[magic-mail] [SEND] Channel: ${useChannel}, to: ${to || phoneNumber}`);
    if (useChannel === "whatsapp") {
      if (!phoneNumber) {
        throw new Error("Phone number is required for WhatsApp channel");
      }
      return await this.sendWhatsApp({
        phoneNumber,
        message: message || text || subject,
        // Use message, fallback to text or subject
        templateId,
        templateData
      });
    } else {
      if (!to) {
        throw new Error("Email address (to) is required for email channel");
      }
      const result = await this.send({
        to,
        subject,
        text: text || message,
        html,
        templateId,
        templateData,
        phoneNumber,
        // Pass for WhatsApp fallback
        ...rest
      });
      return {
        ...result,
        channel: "email"
      };
    }
  },
  /**
   * Check WhatsApp connection status
   * @returns {Object} Connection status
   */
  getWhatsAppStatus() {
    try {
      const whatsapp2 = strapi2.plugin("magic-mail").service("whatsapp");
      return whatsapp2.getStatus();
    } catch (error) {
      return {
        isConnected: false,
        status: "unavailable",
        error: error.message
      };
    }
  },
  /**
   * Check if a phone number is registered on WhatsApp
   * @param {string} phoneNumber - Phone number to check
   * @returns {Promise<Object>} Check result
   */
  async checkWhatsAppNumber(phoneNumber) {
    try {
      const whatsapp2 = strapi2.plugin("magic-mail").service("whatsapp");
      return await whatsapp2.checkNumber(phoneNumber);
    } catch (error) {
      return {
        success: false,
        exists: false,
        error: error.message
      };
    }
  }
});
const { encryptCredentials: encryptCredentials$1, decryptCredentials } = encryption;
const EMAIL_ACCOUNT_UID = "plugin::magic-mail.email-account";
var accountManager$1 = ({ strapi: strapi2 }) => ({
  /**
   * Resolves account ID to documentId (handles both numeric id and documentId)
   * @param {string|number} idOrDocumentId - Either numeric id or documentId
   * @returns {Promise<string|null>} The documentId or null if not found
   */
  async resolveDocumentId(idOrDocumentId) {
    if (idOrDocumentId && !/^\d+$/.test(String(idOrDocumentId))) {
      return String(idOrDocumentId);
    }
    const accounts2 = await strapi2.documents(EMAIL_ACCOUNT_UID).findMany({
      filters: { id: Number(idOrDocumentId) },
      fields: ["documentId"],
      limit: 1
    });
    return accounts2.length > 0 ? accounts2[0].documentId : null;
  },
  /**
   * Create new email account
   */
  async createAccount(accountData) {
    const {
      name,
      provider,
      config: config2,
      fromEmail,
      fromName,
      replyTo,
      isPrimary = false,
      priority = 1,
      dailyLimit = 0,
      hourlyLimit = 0
    } = accountData;
    strapi2.log.info(`[magic-mail] Creating account: ${name} (${provider})`);
    const encryptedConfig = config2 ? encryptCredentials$1(config2) : null;
    if (isPrimary) {
      await this.unsetAllPrimary();
    }
    const account = await strapi2.documents(EMAIL_ACCOUNT_UID).create({
      data: {
        name,
        provider,
        config: encryptedConfig,
        fromEmail,
        fromName,
        replyTo,
        isPrimary,
        priority,
        dailyLimit,
        hourlyLimit,
        isActive: true,
        emailsSentToday: 0,
        emailsSentThisHour: 0,
        totalEmailsSent: 0
      }
    });
    strapi2.log.info(`[magic-mail] [SUCCESS] Email account created: ${name}`);
    return account;
  },
  /**
   * Update email account
   */
  async updateAccount(idOrDocumentId, accountData) {
    const documentId = await this.resolveDocumentId(idOrDocumentId);
    if (!documentId) {
      throw new Error("Account not found");
    }
    const existingAccount = await strapi2.documents(EMAIL_ACCOUNT_UID).findOne({
      documentId
    });
    if (!existingAccount) {
      throw new Error("Account not found");
    }
    const {
      name,
      description,
      provider,
      config: config2,
      fromEmail,
      fromName,
      replyTo,
      isActive,
      isPrimary,
      priority,
      dailyLimit,
      hourlyLimit
    } = accountData;
    const encryptedConfig = config2 ? encryptCredentials$1(config2) : existingAccount.config;
    if (isPrimary && !existingAccount.isPrimary) {
      await this.unsetAllPrimary();
    }
    const updatedAccount = await strapi2.documents(EMAIL_ACCOUNT_UID).update({
      documentId,
      data: {
        name,
        description,
        provider,
        config: encryptedConfig,
        fromEmail,
        fromName,
        replyTo,
        isActive,
        isPrimary,
        priority,
        dailyLimit,
        hourlyLimit
      }
    });
    strapi2.log.info(`[magic-mail] [SUCCESS] Email account updated: ${name} (Active: ${isActive})`);
    return updatedAccount;
  },
  /**
   * Test email account
   */
  async testAccount(idOrDocumentId, testEmail, testOptions = {}) {
    const documentId = await this.resolveDocumentId(idOrDocumentId);
    if (!documentId) {
      throw new Error("Account not found");
    }
    const account = await strapi2.documents(EMAIL_ACCOUNT_UID).findOne({
      documentId
    });
    if (!account) {
      throw new Error("Account not found");
    }
    const recipient = testEmail || account.fromEmail;
    const emailRouter2 = strapi2.plugin("magic-mail").service("email-router");
    const {
      priority = "normal",
      type = "transactional",
      unsubscribeUrl = null
    } = testOptions;
    try {
      await emailRouter2.send({
        to: recipient,
        from: account.fromEmail,
        subject: "MagicMail Test Email",
        text: `This is a test email from MagicMail account: ${account.name}

Priority: ${priority}
Type: ${type}

Provider: ${account.provider}
From: ${account.fromEmail}

If you receive this, your email account is configured correctly!`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #0EA5E9;">MagicMail Test Email</h2>
            <p>This is a test email from account: <strong>${account.name}</strong></p>
            
            <div style="background: #F0F9FF; border: 1px solid #0EA5E9; border-radius: 8px; padding: 15px; margin: 20px 0;">
              <h3 style="margin-top: 0; color: #0369A1;">Test Configuration</h3>
              <ul style="margin: 10px 0; padding-left: 20px;">
                <li><strong>Priority:</strong> ${priority}</li>
                <li><strong>Type:</strong> ${type}</li>
                <li><strong>Provider:</strong> ${account.provider}</li>
                <li><strong>From:</strong> ${account.fromEmail}</li>
                ${unsubscribeUrl ? `<li><strong>Unsubscribe URL:</strong> ${unsubscribeUrl}</li>` : ""}
              </ul>
            </div>

            <div style="background: #DCFCE7; border: 1px solid #22C55E; border-radius: 8px; padding: 15px; margin: 20px 0;">
              <h3 style="margin-top: 0; color: #15803D;">Security Features Active</h3>
              <ul style="margin: 10px 0; padding-left: 20px;">
                <li>TLS/SSL Encryption enforced</li>
                <li>Email content validated</li>
                <li>Proper headers included</li>
                <li>Message-ID generated</li>
                ${type === "marketing" && unsubscribeUrl ? "<li>List-Unsubscribe header added (GDPR/CAN-SPAM)</li>" : ""}
              </ul>
            </div>

            <p style="color: #6B7280; font-size: 14px; margin-top: 30px;">
              Sent at: ${(/* @__PURE__ */ new Date()).toLocaleString()}<br>
              Via: MagicMail Email Router<br>
              Version: 1.0
            </p>
            
            ${unsubscribeUrl ? `<p style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #E5E7EB;"><a href="${unsubscribeUrl}" style="color: #6B7280; font-size: 12px;">Unsubscribe</a></p>` : ""}
          </div>
        `,
        accountName: account.name,
        priority,
        type,
        unsubscribeUrl
      });
      return {
        success: true,
        message: `Test email sent successfully to ${recipient}`,
        testConfig: { priority, type, unsubscribeUrl: !!unsubscribeUrl }
      };
    } catch (error) {
      return { success: false, message: error.message };
    }
  },
  /**
   * Get all accounts
   */
  async getAllAccounts() {
    const accounts2 = await strapi2.documents(EMAIL_ACCOUNT_UID).findMany({
      sort: [{ priority: "desc" }]
    });
    return accounts2.map((account) => ({
      ...account,
      config: account.config ? "***encrypted***" : null
    }));
  },
  /**
   * Get single account with decrypted config (for editing)
   */
  async getAccountWithDecryptedConfig(idOrDocumentId) {
    const documentId = await this.resolveDocumentId(idOrDocumentId);
    if (!documentId) {
      throw new Error("Account not found");
    }
    const account = await strapi2.documents(EMAIL_ACCOUNT_UID).findOne({
      documentId
    });
    if (!account) {
      throw new Error("Account not found");
    }
    const decryptedConfig = account.config ? decryptCredentials(account.config) : {};
    return {
      ...account,
      config: decryptedConfig
    };
  },
  /**
   * Delete account
   */
  async deleteAccount(idOrDocumentId) {
    const documentId = await this.resolveDocumentId(idOrDocumentId);
    if (!documentId) {
      throw new Error("Account not found");
    }
    await strapi2.documents(EMAIL_ACCOUNT_UID).delete({ documentId });
    strapi2.log.info(`[magic-mail] Account deleted: ${documentId}`);
  },
  /**
   * Unset all primary flags
   */
  async unsetAllPrimary() {
    const accounts2 = await strapi2.documents(EMAIL_ACCOUNT_UID).findMany({
      filters: { isPrimary: true }
    });
    for (const account of accounts2) {
      await strapi2.documents(EMAIL_ACCOUNT_UID).update({
        documentId: account.documentId,
        data: { isPrimary: false }
      });
    }
  },
  /**
   * Reset daily/hourly counters (called by cron)
   */
  async resetCounters(type = "daily") {
    const accounts2 = await strapi2.documents(EMAIL_ACCOUNT_UID).findMany({});
    for (const account of accounts2) {
      const updateData = {};
      if (type === "daily") {
        updateData.emailsSentToday = 0;
      } else if (type === "hourly") {
        updateData.emailsSentThisHour = 0;
      }
      await strapi2.documents(EMAIL_ACCOUNT_UID).update({
        documentId: account.documentId,
        data: updateData
      });
    }
    strapi2.log.info(`[magic-mail] [SUCCESS] ${type} counters reset`);
  }
});
const { encryptCredentials } = encryption;
var oauth$1 = ({ strapi: strapi2 }) => ({
  /**
   * Get Gmail OAuth URL
   * @param {string} clientId - OAuth Client ID (from UI, not .env!)
   * @param {string} state - State parameter for security
   */
  getGmailAuthUrl(clientId, state) {
    const redirectUri = `${process.env.URL || "http://localhost:1337"}/magic-mail/oauth/gmail/callback`;
    if (!clientId) {
      throw new Error("Client ID is required for OAuth");
    }
    const scopes = [
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/userinfo.email",
      "openid"
    ].join(" ");
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scopes)}&access_type=offline&prompt=consent&state=${encodeURIComponent(state)}`;
    return authUrl;
  },
  /**
   * Exchange Google OAuth code for tokens
   * @param {string} code - OAuth authorization code
   * @param {string} clientId - OAuth Client ID (from UI!)
   * @param {string} clientSecret - OAuth Client Secret (from UI!)
   */
  async exchangeGoogleCode(code, clientId, clientSecret) {
    const redirectUri = `${process.env.URL || "http://localhost:1337"}/magic-mail/oauth/gmail/callback`;
    strapi2.log.info("[magic-mail] Exchanging OAuth code for tokens...");
    strapi2.log.info(`[magic-mail] Client ID: ${clientId.substring(0, 20)}...`);
    strapi2.log.info(`[magic-mail] Redirect URI: ${redirectUri}`);
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code"
      })
    });
    if (!response.ok) {
      const errorData = await response.text();
      strapi2.log.error("[magic-mail] Token exchange failed:", errorData);
      throw new Error(`Failed to exchange code for tokens: ${response.status}`);
    }
    const tokens = await response.json();
    strapi2.log.info("[magic-mail] [SUCCESS] Tokens received from Google");
    if (!tokens.access_token) {
      throw new Error("No access token received from Google");
    }
    strapi2.log.info("[magic-mail] Fetching user info from Google...");
    const userInfoResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` }
    });
    if (!userInfoResponse.ok) {
      const errorData = await userInfoResponse.text();
      strapi2.log.error("[magic-mail] User info fetch failed:", errorData);
      throw new Error("Failed to get user email from Google");
    }
    const userInfo = await userInfoResponse.json();
    strapi2.log.info(`[magic-mail] [SUCCESS] Got user email from Google: ${userInfo.email}`);
    if (!userInfo.email) {
      strapi2.log.error("[magic-mail] userInfo:", userInfo);
      throw new Error("Google did not provide email address");
    }
    return {
      email: userInfo.email,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: new Date(Date.now() + (tokens.expires_in || 3600) * 1e3)
    };
  },
  /**
   * Refresh Gmail OAuth tokens
   * @param {string} refreshToken - Refresh token
   * @param {string} clientId - OAuth Client ID (from DB!)
   * @param {string} clientSecret - OAuth Client Secret (from DB!)
   */
  async refreshGmailTokens(refreshToken, clientId, clientSecret) {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token"
      })
    });
    if (!response.ok) {
      throw new Error("Failed to refresh Gmail tokens");
    }
    const tokens = await response.json();
    return {
      accessToken: tokens.access_token,
      expiresAt: new Date(Date.now() + (tokens.expires_in || 3600) * 1e3)
    };
  },
  /**
   * Get Microsoft OAuth URL
   * @param {string} clientId - Application (Client) ID
   * @param {string} tenantId - Tenant (Directory) ID
   * @param {string} state - State parameter for security
   */
  getMicrosoftAuthUrl(clientId, tenantId, state) {
    const redirectUri = `${process.env.URL || "http://localhost:1337"}/magic-mail/oauth/microsoft/callback`;
    if (!clientId) {
      throw new Error("Client ID is required for Microsoft OAuth");
    }
    if (!tenantId) {
      throw new Error("Tenant ID is required for Microsoft OAuth");
    }
    const scopes = [
      "https://graph.microsoft.com/Mail.Send",
      // Send emails
      "https://graph.microsoft.com/User.Read",
      // Read user profile
      "offline_access",
      // Refresh tokens
      "openid",
      // OpenID Connect
      "email"
      // Email address
    ].join(" ");
    const authUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scopes)}&response_mode=query&prompt=consent&state=${encodeURIComponent(state)}`;
    strapi2.log.info(`[magic-mail] Microsoft OAuth URL: Using tenant ${tenantId}`);
    return authUrl;
  },
  /**
   * Exchange Microsoft OAuth code for tokens
   * @param {string} code - OAuth authorization code
   * @param {string} clientId - Application (Client) ID
   * @param {string} clientSecret - Client Secret Value
   * @param {string} tenantId - Tenant (Directory) ID
   */
  async exchangeMicrosoftCode(code, clientId, clientSecret, tenantId) {
    const redirectUri = `${process.env.URL || "http://localhost:1337"}/magic-mail/oauth/microsoft/callback`;
    if (!tenantId) {
      throw new Error("Tenant ID is required for Microsoft OAuth token exchange");
    }
    strapi2.log.info("[magic-mail] Exchanging Microsoft OAuth code for tokens...");
    strapi2.log.info(`[magic-mail] Tenant ID: ${tenantId.substring(0, 20)}...`);
    strapi2.log.info(`[magic-mail] Client ID: ${clientId.substring(0, 20)}...`);
    strapi2.log.info(`[magic-mail] Redirect URI: ${redirectUri}`);
    const tokenEndpoint = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
    strapi2.log.info(`[magic-mail] Token endpoint: ${tokenEndpoint}`);
    const response = await fetch(tokenEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
        scope: "https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/User.Read offline_access"
      })
    });
    if (!response.ok) {
      const errorData = await response.text();
      strapi2.log.error("[magic-mail] Microsoft token exchange failed:", errorData);
      throw new Error(`Failed to exchange code for tokens: ${response.status} - ${errorData}`);
    }
    const tokens = await response.json();
    strapi2.log.info("[magic-mail] [SUCCESS] Tokens received from Microsoft");
    strapi2.log.info("[magic-mail] Has access_token:", !!tokens.access_token);
    strapi2.log.info("[magic-mail] Has refresh_token:", !!tokens.refresh_token);
    strapi2.log.info("[magic-mail] Has id_token:", !!tokens.id_token);
    if (!tokens.access_token) {
      throw new Error("No access token received from Microsoft");
    }
    let email = null;
    if (tokens.id_token) {
      try {
        const payloadBase64 = tokens.id_token.split(".")[1];
        const payload = JSON.parse(Buffer.from(payloadBase64, "base64").toString());
        email = payload.email || payload.preferred_username || payload.upn;
        strapi2.log.info(`[magic-mail] [SUCCESS] Got email from Microsoft ID token: ${email}`);
      } catch (jwtErr) {
        strapi2.log.warn("[magic-mail] Could not decode ID token:", jwtErr.message);
      }
    }
    if (!email) {
      strapi2.log.info("[magic-mail] Fetching user info from Microsoft Graph API /me endpoint...");
      const userInfoResponse = await fetch("https://graph.microsoft.com/v1.0/me", {
        headers: {
          "Authorization": `Bearer ${tokens.access_token}`,
          "Content-Type": "application/json"
        }
      });
      if (!userInfoResponse.ok) {
        const errorData = await userInfoResponse.text();
        strapi2.log.error("[magic-mail] User info fetch failed:", errorData);
        strapi2.log.error("[magic-mail] Status:", userInfoResponse.status);
        throw new Error(`Failed to get user email from Microsoft Graph: ${userInfoResponse.status}`);
      }
      const userInfo = await userInfoResponse.json();
      strapi2.log.info("[magic-mail] User info from Graph:", JSON.stringify(userInfo, null, 2));
      email = userInfo.mail || userInfo.userPrincipalName;
      strapi2.log.info(`[magic-mail] [SUCCESS] Got email from Microsoft Graph: ${email}`);
    }
    if (!email) {
      strapi2.log.error("[magic-mail] Microsoft did not provide email - ID token and Graph API both failed");
      throw new Error("Microsoft did not provide email address");
    }
    return {
      email,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: new Date(Date.now() + (tokens.expires_in || 3600) * 1e3)
    };
  },
  /**
   * Refresh Microsoft OAuth tokens
   * @param {string} refreshToken - Refresh token
   * @param {string} clientId - Application (Client) ID
   * @param {string} clientSecret - Client Secret Value
   * @param {string} tenantId - Tenant (Directory) ID
   */
  async refreshMicrosoftTokens(refreshToken, clientId, clientSecret, tenantId) {
    if (!tenantId) {
      throw new Error("Tenant ID is required for Microsoft OAuth token refresh");
    }
    strapi2.log.info("[magic-mail] Refreshing Microsoft OAuth tokens...");
    strapi2.log.info(`[magic-mail] Tenant ID: ${tenantId.substring(0, 20)}...`);
    const tokenEndpoint = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
    const response = await fetch(tokenEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
        scope: "https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/User.Read offline_access"
      })
    });
    if (!response.ok) {
      const errorData = await response.text();
      strapi2.log.error("[magic-mail] Microsoft token refresh failed:", errorData);
      throw new Error(`Failed to refresh Microsoft tokens: ${response.status}`);
    }
    const tokens = await response.json();
    strapi2.log.info("[magic-mail] [SUCCESS] Microsoft tokens refreshed successfully");
    return {
      accessToken: tokens.access_token,
      expiresAt: new Date(Date.now() + (tokens.expires_in || 3600) * 1e3)
    };
  },
  /**
   * Get Yahoo OAuth URL
   * @param {string} clientId - Yahoo Client ID
   * @param {string} state - State parameter for security
   */
  getYahooAuthUrl(clientId, state) {
    const redirectUri = `${process.env.URL || "http://localhost:1337"}/magic-mail/oauth/yahoo/callback`;
    if (!clientId) {
      throw new Error("Client ID is required for Yahoo OAuth");
    }
    const scopes = [
      "mail-w",
      // Write/send emails
      "sdps-r"
      // Read profile
    ].join(" ");
    const authUrl = `https://api.login.yahoo.com/oauth2/request_auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scopes)}&state=${encodeURIComponent(state)}`;
    return authUrl;
  },
  /**
   * Exchange Yahoo OAuth code for tokens
   * @param {string} code - OAuth authorization code
   * @param {string} clientId - Yahoo Client ID
   * @param {string} clientSecret - Yahoo Client Secret
   */
  async exchangeYahooCode(code, clientId, clientSecret) {
    const redirectUri = `${process.env.URL || "http://localhost:1337"}/magic-mail/oauth/yahoo/callback`;
    strapi2.log.info("[magic-mail] Exchanging Yahoo OAuth code for tokens...");
    strapi2.log.info(`[magic-mail] Client ID: ${clientId.substring(0, 20)}...`);
    strapi2.log.info(`[magic-mail] Redirect URI: ${redirectUri}`);
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const response = await fetch("https://api.login.yahoo.com/oauth2/get_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `Basic ${basicAuth}`
      },
      body: new URLSearchParams({
        code,
        redirect_uri: redirectUri,
        grant_type: "authorization_code"
      })
    });
    if (!response.ok) {
      const errorData = await response.text();
      strapi2.log.error("[magic-mail] Yahoo token exchange failed:", errorData);
      throw new Error(`Failed to exchange code for tokens: ${response.status}`);
    }
    const tokens = await response.json();
    strapi2.log.info("[magic-mail] [SUCCESS] Tokens received from Yahoo");
    if (!tokens.access_token) {
      throw new Error("No access token received from Yahoo");
    }
    strapi2.log.info("[magic-mail] Fetching user info from Yahoo API...");
    const userInfoResponse = await fetch("https://api.login.yahoo.com/openid/v1/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` }
    });
    if (!userInfoResponse.ok) {
      const errorData = await userInfoResponse.text();
      strapi2.log.error("[magic-mail] User info fetch failed:", errorData);
      throw new Error("Failed to get user email from Yahoo");
    }
    const userInfo = await userInfoResponse.json();
    const email = userInfo.email;
    strapi2.log.info(`[magic-mail] [SUCCESS] Got email from Yahoo: ${email}`);
    if (!email) {
      throw new Error("Yahoo did not provide email address");
    }
    return {
      email,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: new Date(Date.now() + (tokens.expires_in || 3600) * 1e3)
    };
  },
  /**
   * Refresh Yahoo OAuth tokens
   * @param {string} refreshToken - Refresh token
   * @param {string} clientId - Yahoo Client ID
   * @param {string} clientSecret - Yahoo Client Secret
   */
  async refreshYahooTokens(refreshToken, clientId, clientSecret) {
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const response = await fetch("https://api.login.yahoo.com/oauth2/get_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `Basic ${basicAuth}`
      },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        grant_type: "refresh_token"
      })
    });
    if (!response.ok) {
      throw new Error("Failed to refresh Yahoo tokens");
    }
    const tokens = await response.json();
    return {
      accessToken: tokens.access_token,
      expiresAt: new Date(Date.now() + (tokens.expires_in || 3600) * 1e3)
    };
  },
  /**
   * Store OAuth account
   */
  async storeOAuthAccount(provider, tokenData, accountDetails, oauthCredentials) {
    const configToStore = {
      clientId: oauthCredentials.clientId,
      clientSecret: oauthCredentials.clientSecret
    };
    if (oauthCredentials.tenantId) {
      configToStore.tenantId = oauthCredentials.tenantId;
      strapi2.log.info(`[magic-mail] Storing tenantId: ${oauthCredentials.tenantId.substring(0, 20)}...`);
    }
    if (oauthCredentials.domain) {
      configToStore.domain = oauthCredentials.domain;
    }
    const encryptedConfig = encryptCredentials(configToStore);
    const encryptedOAuth = encryptCredentials({
      email: tokenData.email,
      accessToken: tokenData.accessToken,
      refreshToken: tokenData.refreshToken,
      expiresAt: tokenData.expiresAt
    });
    const account = await strapi2.documents("plugin::magic-mail.email-account").create({
      data: {
        name: accountDetails.name,
        description: accountDetails.description || "",
        provider: `${provider}-oauth`,
        config: encryptedConfig,
        // OAuth app credentials
        oauth: encryptedOAuth,
        // OAuth tokens
        fromEmail: tokenData.email ? tokenData.email.trim().toLowerCase() : tokenData.email,
        fromName: accountDetails.fromName || tokenData.email.split("@")[0],
        replyTo: (accountDetails.replyTo || tokenData.email || "").trim().toLowerCase(),
        isActive: true,
        isPrimary: accountDetails.isPrimary || false,
        priority: accountDetails.priority || 1,
        dailyLimit: accountDetails.dailyLimit || 0,
        hourlyLimit: accountDetails.hourlyLimit || 0,
        emailsSentToday: 0,
        emailsSentThisHour: 0,
        totalEmailsSent: 0
      }
    });
    strapi2.log.info(`[magic-mail] [SUCCESS] OAuth account created: ${accountDetails.name} (${tokenData.email})`);
    return account;
  }
});
const version = "2.8.1";
const require$$2 = {
  version
};
const crypto$1 = require$$0__default.default;
const os = require$$1__default.default;
const pluginPkg = require$$2;
const { createLogger } = logger;
const LICENSE_SERVER_URL = "https://magicapi.fitlex.me";
var licenseGuard$1 = ({ strapi: strapi2 }) => {
  const log = createLogger(strapi2);
  return {
    /**
     * Get license server URL
     */
    getLicenseServerUrl() {
      return LICENSE_SERVER_URL;
    },
    /**
     * Generate device ID
     */
    generateDeviceId() {
      try {
        const networkInterfaces = os.networkInterfaces();
        const macAddresses = [];
        Object.values(networkInterfaces).forEach((interfaces) => {
          interfaces?.forEach((iface) => {
            if (iface.mac && iface.mac !== "00:00:00:00:00:00") {
              macAddresses.push(iface.mac);
            }
          });
        });
        const identifier = `${macAddresses.join("-")}-${os.hostname()}`;
        return crypto$1.createHash("sha256").update(identifier).digest("hex").substring(0, 32);
      } catch (error) {
        return crypto$1.randomBytes(16).toString("hex");
      }
    },
    getDeviceName() {
      try {
        return os.hostname() || "Unknown Device";
      } catch (error) {
        return "Unknown Device";
      }
    },
    getIpAddress() {
      try {
        const networkInterfaces = os.networkInterfaces();
        for (const name of Object.keys(networkInterfaces)) {
          const interfaces = networkInterfaces[name];
          if (interfaces) {
            for (const iface of interfaces) {
              if (iface.family === "IPv4" && !iface.internal) {
                return iface.address;
              }
            }
          }
        }
        return "127.0.0.1";
      } catch (error) {
        return "127.0.0.1";
      }
    },
    getUserAgent() {
      const pluginVersion = pluginPkg.version;
      const strapiVersion = strapi2.config.get("info.strapi") || "5.0.0";
      return `MagicMail/${pluginVersion} Strapi/${strapiVersion} Node/${process.version} ${os.platform()}/${os.release()}`;
    },
    async createLicense({ email, firstName, lastName }) {
      try {
        const deviceId = this.generateDeviceId();
        const deviceName = this.getDeviceName();
        const ipAddress = this.getIpAddress();
        const userAgent = this.getUserAgent();
        const licenseServerUrl = this.getLicenseServerUrl();
        const response = await fetch(`${licenseServerUrl}/api/licenses/create`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            firstName,
            lastName,
            deviceName,
            deviceId,
            ipAddress,
            userAgent,
            pluginName: "magic-mail",
            productName: "MagicMail - Email Business Suite"
          })
        });
        const data = await response.json();
        if (data.success) {
          log.info("[SUCCESS] License created:", data.data.licenseKey);
          return data.data;
        } else {
          log.error("[ERROR] License creation failed:", data);
          return null;
        }
      } catch (error) {
        log.error("[ERROR] Error creating license:", error);
        return null;
      }
    },
    async verifyLicense(licenseKey, allowGracePeriod = false) {
      try {
        const controller2 = new AbortController();
        const timeoutId = setTimeout(() => controller2.abort(), 5e3);
        const licenseServerUrl = this.getLicenseServerUrl();
        const response = await fetch(`${licenseServerUrl}/api/licenses/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            licenseKey,
            pluginName: "magic-mail",
            productName: "MagicMail - Email Business Suite"
          }),
          signal: controller2.signal
        });
        clearTimeout(timeoutId);
        const data = await response.json();
        if (data.success && data.data) {
          return { valid: true, data: data.data, gracePeriod: false };
        } else {
          return { valid: false, data: null };
        }
      } catch (error) {
        if (allowGracePeriod) {
          log.warn("[WARNING] License verification timeout - grace period active");
          return { valid: true, data: null, gracePeriod: true };
        }
        log.error("[ERROR] License verification error:", error.message);
        return { valid: false, data: null };
      }
    },
    async getLicenseByKey(licenseKey) {
      try {
        const licenseServerUrl = this.getLicenseServerUrl();
        const url = `${licenseServerUrl}/api/licenses/key/${licenseKey}`;
        const response = await fetch(url, {
          method: "GET",
          headers: { "Content-Type": "application/json" }
        });
        const data = await response.json();
        if (data.success && data.data) {
          return data.data;
        }
        return null;
      } catch (error) {
        log.error("Error fetching license by key:", error);
        return null;
      }
    },
    async pingLicense(licenseKey) {
      try {
        const deviceId = this.generateDeviceId();
        const deviceName = this.getDeviceName();
        const ipAddress = this.getIpAddress();
        const userAgent = this.getUserAgent();
        const licenseServerUrl = this.getLicenseServerUrl();
        const response = await fetch(`${licenseServerUrl}/api/licenses/ping`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            licenseKey,
            deviceId,
            deviceName,
            ipAddress,
            userAgent,
            pluginName: "magic-mail"
          })
        });
        const data = await response.json();
        return data.success ? data.data : null;
      } catch (error) {
        return null;
      }
    },
    async storeLicenseKey(licenseKey) {
      const pluginStore = strapi2.store({
        type: "plugin",
        name: "magic-mail"
      });
      await pluginStore.set({ key: "licenseKey", value: licenseKey });
      log.info(`[SUCCESS] License key stored: ${licenseKey.substring(0, 8)}...`);
    },
    startPinging(licenseKey, intervalMinutes = 15) {
      this.pingLicense(licenseKey);
      const interval = setInterval(async () => {
        try {
          await this.pingLicense(licenseKey);
        } catch (error) {
          console.error("Ping error:", error);
        }
      }, intervalMinutes * 60 * 1e3);
      return interval;
    },
    /**
     * Get current license data from store
     */
    async getCurrentLicense() {
      try {
        const pluginStore = strapi2.store({
          type: "plugin",
          name: "magic-mail"
        });
        const licenseKey = await pluginStore.get({ key: "licenseKey" });
        if (!licenseKey) {
          return null;
        }
        const license2 = await this.getLicenseByKey(licenseKey);
        return license2;
      } catch (error) {
        log.error(`[ERROR] Error loading license:`, error);
        return null;
      }
    },
    /**
     * Check if license has specific feature
     */
    async hasFeature(featureName) {
      const license2 = await this.getCurrentLicense();
      const features2 = requireFeatures();
      return features2.hasFeature(license2, featureName);
    },
    /**
     * Check if provider is allowed
     */
    async isProviderAllowed(provider) {
      const license2 = await this.getCurrentLicense();
      const features2 = requireFeatures();
      return features2.isProviderAllowed(license2, provider);
    },
    /**
     * Get max allowed accounts
     */
    async getMaxAccounts() {
      const license2 = await this.getCurrentLicense();
      const features2 = requireFeatures();
      return features2.getMaxAccounts(license2);
    },
    /**
     * Get max allowed routing rules
     */
    async getMaxRoutingRules() {
      const license2 = await this.getCurrentLicense();
      const features2 = requireFeatures();
      return features2.getMaxRoutingRules(license2);
    },
    /**
     * Get max allowed email templates
     */
    async getMaxEmailTemplates() {
      const license2 = await this.getCurrentLicense();
      const features2 = requireFeatures();
      return features2.getMaxEmailTemplates(license2);
    },
    /**
     * Initialize license guard
     * Checks for existing license and starts pinging
     */
    async initialize() {
      try {
        log.info("[INIT] Initializing License Guard...");
        const pluginStore = strapi2.store({
          type: "plugin",
          name: "magic-mail"
        });
        const licenseKey = await pluginStore.get({ key: "licenseKey" });
        const lastValidated = await pluginStore.get({ key: "lastValidated" });
        const now = /* @__PURE__ */ new Date();
        const gracePeriodHours = 24;
        let withinGracePeriod = false;
        if (lastValidated) {
          const lastValidatedDate = new Date(lastValidated);
          const hoursSinceValidation = (now.getTime() - lastValidatedDate.getTime()) / (1e3 * 60 * 60);
          withinGracePeriod = hoursSinceValidation < gracePeriodHours;
        }
        log.info("──────────────────────────────────────────────────────────");
        log.info(`📦 Plugin Store Check:`);
        if (licenseKey) {
          const maskedKey = licenseKey.substring(0, 8) + "..." + licenseKey.substring(licenseKey.length - 4);
          log.info(`   [SUCCESS] License Key found: ${maskedKey}`);
          if (lastValidated) {
            const lastValidatedDate = new Date(lastValidated);
            const hoursAgo = Math.floor((now.getTime() - lastValidatedDate.getTime()) / (1e3 * 60 * 60));
            log.info(`   [TIME] Last validated: ${hoursAgo}h ago (Grace: ${withinGracePeriod ? "ACTIVE" : "EXPIRED"})`);
          } else {
            log.info(`   [TIME] Last validated: Never (Grace: ACTIVE for first ${gracePeriodHours}h)`);
          }
        } else {
          log.info(`   [ERROR] No license key stored`);
        }
        log.info("──────────────────────────────────────────────────────────");
        if (!licenseKey) {
          log.info("[DEMO] No license found - Running in demo mode");
          log.info("[INFO] Create a license in the admin panel to activate full features");
          return {
            valid: false,
            demo: true,
            data: null
          };
        }
        log.info("[VERIFY] Verifying stored license key...");
        const verification = await this.verifyLicense(licenseKey, withinGracePeriod);
        if (verification.valid) {
          const license2 = await this.getLicenseByKey(licenseKey);
          log.info(`[SUCCESS] License verified online: ACTIVE (Key: ${licenseKey.substring(0, 10)}...)`);
          await pluginStore.set({
            key: "lastValidated",
            value: now.toISOString()
          });
          log.info("[SUCCESS] License is valid and active");
          const pingInterval = this.startPinging(licenseKey, 15);
          log.info("[PING] Started pinging license every 15 minutes");
          strapi2.licenseGuardMagicMail = {
            licenseKey,
            pingInterval,
            data: verification.data
          };
          log.info("╔════════════════════════════════════════════════════════════════╗");
          log.info("║  [SUCCESS] MAGIC MAIL PLUGIN LICENSE ACTIVE                           ║");
          log.info("║                                                                ║");
          log.info(`║  License: ${licenseKey.padEnd(38, " ")}║`);
          log.info(`║  User: ${(license2?.firstName + " " + license2?.lastName).padEnd(41, " ")}║`);
          log.info(`║  Email: ${(license2?.email || "N/A").padEnd(40, " ")}║`);
          log.info("║                                                                ║");
          log.info("║  [AUTO] Pinging every 15 minutes                               ║");
          log.info("╚════════════════════════════════════════════════════════════════╝");
          return {
            valid: true,
            demo: false,
            data: verification.data,
            gracePeriod: verification.gracePeriod || false
          };
        } else {
          log.error(`[ERROR] License validation failed (Key: ${licenseKey.substring(0, 10)}...)`);
          log.info("──────────────────────────────────────────────────────────");
          log.info("[WARNING]  Running in demo mode with limited features");
          return {
            valid: false,
            demo: true,
            error: "Invalid or expired license",
            data: null
          };
        }
      } catch (error) {
        log.error("[ERROR] Error initializing License Guard:", error);
        return {
          valid: false,
          demo: true,
          error: error.message,
          data: null
        };
      }
    }
  };
};
const Mustache = require$$0__default$2.default;
const htmlToTextLib = require$$1__default$1.default;
const decode = require$$2__default.default;
const EMAIL_TEMPLATE_UID = "plugin::magic-mail.email-template";
const EMAIL_TEMPLATE_VERSION_UID = "plugin::magic-mail.email-template-version";
const convertHtmlToText = (html, options2 = { wordwrap: 130 }) => {
  try {
    if (!html || typeof html !== "string") {
      return "";
    }
    if (!htmlToTextLib) {
      return html.replace(/<[^>]*>/g, "");
    }
    if (htmlToTextLib.htmlToText && typeof htmlToTextLib.htmlToText === "function") {
      return htmlToTextLib.htmlToText(html, options2);
    } else if (htmlToTextLib.convert && typeof htmlToTextLib.convert === "function") {
      return htmlToTextLib.convert(html, options2);
    } else if (typeof htmlToTextLib === "function") {
      return htmlToTextLib(html, options2);
    } else if (htmlToTextLib.default) {
      if (typeof htmlToTextLib.default.htmlToText === "function") {
        return htmlToTextLib.default.htmlToText(html, options2);
      } else if (typeof htmlToTextLib.default.convert === "function") {
        return htmlToTextLib.default.convert(html, options2);
      } else if (typeof htmlToTextLib.default === "function") {
        return htmlToTextLib.default(html, options2);
      }
    }
    return html.replace(/<[^>]*>/g, "");
  } catch (error) {
    console.error("[magic-mail] Error converting HTML to text:", error.message);
    return (html || "").replace(/<[^>]*>/g, "");
  }
};
var emailDesigner$1 = ({ strapi: strapi2 }) => ({
  // ============================================================
  // TEMPLATE CRUD OPERATIONS
  // ============================================================
  /**
   * Get all templates
   */
  async findAll(filters = {}) {
    return strapi2.documents(EMAIL_TEMPLATE_UID).findMany({
      filters,
      sort: [{ createdAt: "desc" }]
    });
  },
  /**
   * Get template by ID (documentId or numeric id) with populated versions
   * Supports both documentId (string) and numeric id for backward compatibility
   */
  async findOne(idOrDocumentId) {
    const isNumericId = /^\d+$/.test(String(idOrDocumentId));
    if (isNumericId) {
      const result = await this.findById(Number(idOrDocumentId));
      if (result) return result;
    }
    return strapi2.documents(EMAIL_TEMPLATE_UID).findOne({
      documentId: String(idOrDocumentId),
      populate: { versions: true }
    });
  },
  /**
   * Get template by numeric ID (supports both templateReferenceId and internal db id)
   * First tries templateReferenceId, then falls back to internal database id via entityService
   */
  async findById(id) {
    const numericId = Number(id);
    strapi2.log.info(`[magic-mail] [LOOKUP] Finding template by numeric ID: ${numericId}`);
    const byRefId = await strapi2.documents(EMAIL_TEMPLATE_UID).findMany({
      filters: { templateReferenceId: numericId },
      limit: 1,
      populate: { versions: true }
    });
    if (byRefId.length > 0) {
      strapi2.log.info(`[magic-mail] [SUCCESS] Found template by templateReferenceId ${numericId}: documentId=${byRefId[0].documentId}, name="${byRefId[0].name}"`);
      return byRefId[0];
    }
    strapi2.log.info(`[magic-mail] [FALLBACK] templateReferenceId not found, trying internal db id: ${numericId}`);
    const byInternalId = await strapi2.entityService.findOne(EMAIL_TEMPLATE_UID, numericId, {
      populate: { versions: true }
    });
    if (byInternalId) {
      strapi2.log.info(`[magic-mail] [SUCCESS] Found template by internal id ${numericId}: documentId=${byInternalId.documentId}, name="${byInternalId.name}"`);
      return byInternalId;
    }
    strapi2.log.warn(`[magic-mail] [WARNING] Template with ID ${numericId} not found (tried templateReferenceId and internal id)`);
    return null;
  },
  /**
   * Get template by reference ID
   */
  async findByReferenceId(templateReferenceId) {
    const results = await strapi2.documents(EMAIL_TEMPLATE_UID).findMany({
      filters: { templateReferenceId },
      limit: 1
    });
    return results.length > 0 ? results[0] : null;
  },
  /**
   * Get version by numeric ID or documentId
   * First tries documentId, then falls back to internal database id via entityService
   */
  async findVersionById(idOrDocumentId) {
    strapi2.log.info(`[magic-mail] [LOOKUP] Finding version by ID: ${idOrDocumentId}`);
    const isNumericId = /^\d+$/.test(String(idOrDocumentId));
    if (!isNumericId) {
      const version2 = await strapi2.documents(EMAIL_TEMPLATE_VERSION_UID).findOne({
        documentId: String(idOrDocumentId),
        populate: { template: true }
      });
      if (version2) {
        strapi2.log.info(`[magic-mail] [SUCCESS] Found version by documentId: ${version2.documentId}`);
        return version2;
      }
    }
    const numericId = Number(idOrDocumentId);
    if (!isNaN(numericId)) {
      strapi2.log.info(`[magic-mail] [FALLBACK] Trying internal db id for version: ${numericId}`);
      const version2 = await strapi2.entityService.findOne(EMAIL_TEMPLATE_VERSION_UID, numericId, {
        populate: { template: true }
      });
      if (version2) {
        strapi2.log.info(`[magic-mail] [SUCCESS] Found version by internal id ${numericId}: documentId=${version2.documentId}`);
        return version2;
      }
    }
    strapi2.log.warn(`[magic-mail] [WARNING] Version with ID ${idOrDocumentId} not found`);
    return null;
  },
  /**
   * Create new template with automatic initial version
   */
  async create(data) {
    strapi2.log.info("[magic-mail] [TEST] Creating new template...");
    const maxTemplates = await strapi2.plugin("magic-mail").service("license-guard").getMaxEmailTemplates();
    const currentCount = await strapi2.documents(EMAIL_TEMPLATE_UID).count();
    if (maxTemplates !== -1 && currentCount >= maxTemplates) {
      throw new Error(
        `Template limit reached (${maxTemplates}). Upgrade your license to create more templates.`
      );
    }
    if (data.templateReferenceId) {
      const existing = await this.findByReferenceId(data.templateReferenceId);
      if (existing) {
        throw new Error(`Template with reference ID ${data.templateReferenceId} already exists`);
      }
    }
    const template = await strapi2.documents(EMAIL_TEMPLATE_UID).create({
      data: {
        ...data,
        isActive: data.isActive !== void 0 ? data.isActive : true
      }
    });
    strapi2.log.info(`[magic-mail] [SUCCESS] Template created: documentId=${template.documentId}, name="${template.name}"`);
    const hasVersioning = await strapi2.plugin("magic-mail").service("license-guard").hasFeature("email-designer-versioning");
    if (hasVersioning) {
      strapi2.log.info("[magic-mail] [SAVE] Creating initial version...");
      await this.createVersion(template.documentId, {
        name: data.name,
        subject: data.subject,
        design: data.design,
        bodyHtml: data.bodyHtml,
        bodyText: data.bodyText,
        tags: data.tags
      });
      strapi2.log.info("[magic-mail] [SUCCESS] Initial version created");
    } else {
      strapi2.log.info("[magic-mail] [SKIP] Versioning not enabled, skipping initial version");
    }
    return template;
  },
  /**
   * Update template with automatic version snapshot
   * @param {string|number} idOrDocumentId - Either numeric id or documentId
   * @param {Object} data - Update data
   */
  async update(idOrDocumentId, data) {
    strapi2.log.info(`[magic-mail] [UPDATE] Updating template: ${idOrDocumentId}`);
    const template = await this.findOne(idOrDocumentId);
    if (!template) {
      throw new Error("Template not found");
    }
    const actualDocumentId = template.documentId;
    strapi2.log.info(`[magic-mail] [INFO] Found template: documentId=${actualDocumentId}, name="${template.name}"`);
    const hasVersioning = await strapi2.plugin("magic-mail").service("license-guard").hasFeature("email-designer-versioning");
    if (hasVersioning) {
      strapi2.log.info("[magic-mail] [SAVE] Creating version snapshot before update...");
      await this.createVersion(actualDocumentId, {
        name: template.name,
        subject: template.subject,
        design: template.design,
        bodyHtml: template.bodyHtml,
        bodyText: template.bodyText,
        tags: template.tags
      });
      strapi2.log.info("[magic-mail] [SUCCESS] Version snapshot created");
    }
    const updateData = { ...data };
    if ("versions" in updateData) {
      delete updateData.versions;
      strapi2.log.warn("[magic-mail] [WARNING]  Removed versions field from update data");
    }
    const updated = await strapi2.documents(EMAIL_TEMPLATE_UID).update({
      documentId: actualDocumentId,
      data: updateData
    });
    strapi2.log.info(`[magic-mail] [SUCCESS] Template updated: documentId=${updated.documentId}`);
    return updated;
  },
  /**
   * Delete template and all its versions
   * @param {string|number} idOrDocumentId - Either numeric id or documentId
   */
  async delete(idOrDocumentId) {
    strapi2.log.info(`[magic-mail] [DELETE] Deleting template: ${idOrDocumentId}`);
    const template = await this.findOne(idOrDocumentId);
    if (!template) {
      throw new Error("Template not found");
    }
    const actualDocumentId = template.documentId;
    strapi2.log.info(`[magic-mail] [DELETE] Template: documentId=${actualDocumentId}, name="${template.name}"`);
    const allVersions = await strapi2.documents(EMAIL_TEMPLATE_VERSION_UID).findMany({
      filters: {
        template: {
          documentId: actualDocumentId
        }
      }
    });
    strapi2.log.info(`[magic-mail] [DELETE] Found ${allVersions.length} versions to delete`);
    for (const version2 of allVersions) {
      try {
        await strapi2.documents(EMAIL_TEMPLATE_VERSION_UID).delete({
          documentId: version2.documentId
        });
        strapi2.log.info(`[magic-mail] [DELETE] Deleted version #${version2.versionNumber}`);
      } catch (versionError) {
        strapi2.log.warn(`[magic-mail] [WARNING] Failed to delete version: ${versionError.message}`);
      }
    }
    const result = await strapi2.documents(EMAIL_TEMPLATE_UID).delete({
      documentId: actualDocumentId
    });
    strapi2.log.info(`[magic-mail] [SUCCESS] Template "${template.name}" and ${allVersions.length} versions deleted`);
    return result;
  },
  /**
   * Duplicate template
   * @param {string|number} idOrDocumentId - Either numeric id or documentId
   */
  async duplicate(idOrDocumentId) {
    strapi2.log.info(`[magic-mail] [INFO] Duplicating template: ${idOrDocumentId}`);
    const original = await this.findOne(idOrDocumentId);
    if (!original) {
      throw new Error("Template not found");
    }
    strapi2.log.info(`[magic-mail] [PACKAGE] Original template: documentId=${original.documentId}, name="${original.name}"`);
    const duplicateData = {
      name: `${original.name} copy`,
      subject: original.subject,
      design: original.design,
      bodyHtml: original.bodyHtml,
      bodyText: original.bodyText,
      category: original.category,
      tags: original.tags,
      isActive: original.isActive,
      templateReferenceId: Date.now() + Math.floor(Math.random() * 1e3)
    };
    const duplicated = await this.create(duplicateData);
    strapi2.log.info(`[magic-mail] [SUCCESS] Template duplicated: documentId=${duplicated.documentId}`);
    return duplicated;
  },
  // ============================================================
  // VERSIONING OPERATIONS
  // ============================================================
  /**
   * Create a new version for a template
   */
  async createVersion(templateDocumentId, data) {
    strapi2.log.info(`[magic-mail] [SNAPSHOT] Creating version for template documentId: ${templateDocumentId}`);
    const template = await strapi2.documents(EMAIL_TEMPLATE_UID).findOne({
      documentId: templateDocumentId
    });
    if (!template) {
      throw new Error(`Template ${templateDocumentId} not found`);
    }
    strapi2.log.info(`[magic-mail] [PACKAGE] Template found: documentId=${template.documentId}, name="${template.name}"`);
    const existingVersions = await strapi2.documents(EMAIL_TEMPLATE_VERSION_UID).findMany({
      filters: {
        template: {
          documentId: templateDocumentId
        }
      },
      sort: [{ versionNumber: "desc" }]
    });
    const versionNumber = existingVersions.length > 0 ? Math.max(...existingVersions.map((v) => v.versionNumber || 0)) + 1 : 1;
    strapi2.log.info(`[magic-mail] [STATS] Existing versions: ${existingVersions.length} → Next version: #${versionNumber}`);
    const createdVersion = await strapi2.documents(EMAIL_TEMPLATE_VERSION_UID).create({
      data: {
        versionNumber,
        ...data,
        template: templateDocumentId
        // Document Service handles relations with documentId
      }
    });
    strapi2.log.info(`[magic-mail] [SUCCESS] Version created: documentId=${createdVersion.documentId}, v${versionNumber}`);
    return createdVersion;
  },
  /**
   * Get all versions for a template
   * @param {string|number} idOrDocumentId - Either numeric id or documentId
   */
  async getVersions(idOrDocumentId) {
    strapi2.log.info(`[magic-mail] [VERSION] Fetching versions for template: ${idOrDocumentId}`);
    const template = await this.findOne(idOrDocumentId);
    if (!template) {
      throw new Error("Template not found");
    }
    const actualDocumentId = template.documentId;
    strapi2.log.info(`[magic-mail] [PACKAGE] Template has ${template.versions?.length || 0} versions`);
    if (template.versions && template.versions.length > 0) {
      const sortedVersions = [...template.versions].sort((a, b) => b.versionNumber - a.versionNumber);
      return sortedVersions;
    }
    const versions = await strapi2.documents(EMAIL_TEMPLATE_VERSION_UID).findMany({
      filters: {
        template: {
          documentId: actualDocumentId
        }
      },
      sort: [{ versionNumber: "desc" }]
    });
    strapi2.log.info(`[magic-mail] [SUCCESS] Found ${versions.length} versions`);
    return versions;
  },
  /**
   * Restore template from a specific version
   * @param {string|number} templateIdOrDocumentId - Either numeric id or documentId of template
   * @param {string|number} versionIdOrDocumentId - Either numeric id or documentId of version
   */
  async restoreVersion(templateIdOrDocumentId, versionIdOrDocumentId) {
    strapi2.log.info(`[magic-mail] [RESTORE] Restoring template ${templateIdOrDocumentId} from version ${versionIdOrDocumentId}`);
    const template = await this.findOne(templateIdOrDocumentId);
    if (!template) {
      throw new Error("Template not found");
    }
    const actualTemplateDocumentId = template.documentId;
    const version2 = await this.findVersionById(versionIdOrDocumentId);
    if (!version2) {
      throw new Error("Version not found");
    }
    if (version2.template?.documentId !== actualTemplateDocumentId) {
      throw new Error("Version does not belong to this template");
    }
    const restored = await this.update(actualTemplateDocumentId, {
      name: version2.name,
      subject: version2.subject,
      design: version2.design,
      bodyHtml: version2.bodyHtml,
      bodyText: version2.bodyText,
      tags: version2.tags
    });
    strapi2.log.info(`[magic-mail] [SUCCESS] Template restored from version #${version2.versionNumber}`);
    return restored;
  },
  /**
   * Delete a single version
   * @param {string|number} templateIdOrDocumentId - Either numeric id or documentId of template
   * @param {string|number} versionIdOrDocumentId - Either numeric id or documentId of version
   */
  async deleteVersion(templateIdOrDocumentId, versionIdOrDocumentId) {
    strapi2.log.info(`[magic-mail] [DELETE] Deleting version ${versionIdOrDocumentId}`);
    const template = await this.findOne(templateIdOrDocumentId);
    if (!template) {
      throw new Error("Template not found");
    }
    const actualTemplateDocumentId = template.documentId;
    const version2 = await this.findVersionById(versionIdOrDocumentId);
    if (!version2) {
      throw new Error("Version not found");
    }
    if (version2.template?.documentId !== actualTemplateDocumentId) {
      throw new Error("Version does not belong to this template");
    }
    await strapi2.documents(EMAIL_TEMPLATE_VERSION_UID).delete({
      documentId: version2.documentId
    });
    strapi2.log.info(`[magic-mail] [SUCCESS] Version v${version2.versionNumber} deleted`);
    return { success: true, message: "Version deleted" };
  },
  /**
   * Delete all versions for a template
   * @param {string|number} idOrDocumentId - Either numeric id or documentId
   */
  async deleteAllVersions(idOrDocumentId) {
    strapi2.log.info(`[magic-mail] [DELETE] Deleting all versions for template ${idOrDocumentId}`);
    const template = await this.findOne(idOrDocumentId);
    if (!template) {
      throw new Error("Template not found");
    }
    const versionCount = template.versions?.length || 0;
    if (versionCount === 0) {
      return { success: true, message: "No versions to delete", deletedCount: 0 };
    }
    let deletedCount = 0;
    for (const version2 of template.versions) {
      try {
        await strapi2.documents(EMAIL_TEMPLATE_VERSION_UID).delete({
          documentId: version2.documentId
        });
        deletedCount++;
      } catch (error) {
        strapi2.log.error(`[magic-mail] [ERROR] Failed to delete version: ${error.message}`);
      }
    }
    strapi2.log.info(`[magic-mail] [SUCCESS] Deleted ${deletedCount}/${versionCount} versions`);
    return { success: true, deletedCount };
  },
  // ============================================================
  // RENDERING
  // ============================================================
  /**
   * Render template with dynamic data using Mustache
   */
  async renderTemplate(templateReferenceId, data = {}) {
    const template = await this.findByReferenceId(templateReferenceId);
    if (!template) {
      throw new Error(`Template with reference ID ${templateReferenceId} not found`);
    }
    if (!template.isActive) {
      throw new Error(`Template ${template.name} is inactive`);
    }
    let { bodyHtml = "", bodyText = "", subject = "" } = template;
    bodyHtml = bodyHtml.replace(/<%/g, "{{").replace(/%>/g, "}}");
    bodyText = bodyText.replace(/<%/g, "{{").replace(/%>/g, "}}");
    subject = subject.replace(/<%/g, "{{").replace(/%>/g, "}}");
    if ((!bodyText || !bodyText.length) && bodyHtml && bodyHtml.length) {
      bodyText = convertHtmlToText(bodyHtml, { wordwrap: 130 });
    }
    const decodedHtml = decode(bodyHtml);
    const decodedText = decode(bodyText);
    const decodedSubject = decode(subject);
    const renderedHtml = Mustache.render(decodedHtml, data);
    const renderedText = Mustache.render(decodedText, data);
    const renderedSubject = Mustache.render(decodedSubject, data);
    return {
      html: renderedHtml,
      text: renderedText,
      subject: renderedSubject,
      templateName: template.name,
      category: template.category
    };
  },
  // ============================================================
  // IMPORT/EXPORT
  // ============================================================
  /**
   * Export templates as JSON
   */
  async exportTemplates(templateDocumentIds = []) {
    strapi2.log.info("[magic-mail] [EXPORT] Exporting templates...");
    let templates;
    if (templateDocumentIds.length > 0) {
      templates = await strapi2.documents(EMAIL_TEMPLATE_UID).findMany({
        filters: { documentId: { $in: templateDocumentIds } }
      });
    } else {
      templates = await this.findAll();
    }
    const exported = templates.map((template) => ({
      templateReferenceId: template.templateReferenceId,
      name: template.name,
      subject: template.subject,
      design: template.design,
      bodyHtml: template.bodyHtml,
      bodyText: template.bodyText,
      category: template.category,
      tags: template.tags
    }));
    strapi2.log.info(`[magic-mail] [SUCCESS] Exported ${exported.length} templates`);
    return exported;
  },
  /**
   * Import templates from JSON
   * Supports both magic-mail export format and strapi-plugin-email-designer-5 format
   */
  async importTemplates(templates) {
    strapi2.log.info(`[magic-mail] [IMPORT] Importing ${templates.length} templates...`);
    const results = [];
    for (const rawData of templates) {
      try {
        const templateData = this.normalizeImportData(rawData);
        strapi2.log.info(`[magic-mail] [IMPORT] Processing: "${templateData.name}" (ref: ${templateData.templateReferenceId})`);
        const existing = await this.findByReferenceId(templateData.templateReferenceId);
        if (existing) {
          const updated = await this.update(existing.documentId, templateData);
          results.push({ success: true, action: "updated", template: updated });
          strapi2.log.info(`[magic-mail] [SUCCESS] Updated: "${templateData.name}"`);
        } else {
          const created = await this.create(templateData);
          results.push({ success: true, action: "created", template: created });
          strapi2.log.info(`[magic-mail] [SUCCESS] Created: "${templateData.name}"`);
        }
      } catch (error) {
        strapi2.log.error(`[magic-mail] [ERROR] Import failed for "${rawData.name}": ${error.message}`);
        results.push({
          success: false,
          action: "failed",
          error: error.message,
          templateName: rawData.name
        });
      }
    }
    const successful = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;
    strapi2.log.info(`[magic-mail] [IMPORT] Complete: ${successful} successful, ${failed} failed`);
    return results;
  },
  /**
   * Normalize import data from different export formats
   * Supports: magic-mail, strapi-plugin-email-designer-5, and generic formats
   */
  normalizeImportData(rawData) {
    const isActive = rawData.isActive !== void 0 ? rawData.isActive : rawData.enabled !== void 0 ? rawData.enabled : true;
    const templateReferenceId = rawData.templateReferenceId || rawData.referenceId || Date.now() + Math.floor(Math.random() * 1e3);
    const category = rawData.category || "custom";
    let tags = rawData.tags;
    if (typeof tags === "string") {
      try {
        tags = JSON.parse(tags);
      } catch (e) {
        tags = tags.split(",").map((t) => t.trim()).filter(Boolean);
      }
    }
    if (!Array.isArray(tags)) {
      tags = [];
    }
    return {
      templateReferenceId,
      name: rawData.name || "Imported Template",
      subject: rawData.subject || "",
      design: rawData.design || null,
      bodyHtml: rawData.bodyHtml || rawData.message || "",
      bodyText: rawData.bodyText || "",
      category,
      tags,
      isActive
    };
  },
  // ============================================================
  // STATISTICS
  // ============================================================
  /**
   * Get template statistics
   */
  async getStats() {
    const allTemplates = await strapi2.documents(EMAIL_TEMPLATE_UID).findMany({
      fields: ["isActive", "category"]
    });
    const total = allTemplates.length;
    const active = allTemplates.filter((t) => t.isActive === true).length;
    const categoryMap = allTemplates.reduce((acc, template) => {
      const category = template.category || "custom";
      acc[category] = (acc[category] || 0) + 1;
      return acc;
    }, {});
    const byCategory = Object.entries(categoryMap).map(([category, count]) => ({ category, count }));
    const maxTemplates = await strapi2.plugin("magic-mail").service("license-guard").getMaxEmailTemplates();
    return {
      total,
      active,
      inactive: total - active,
      byCategory,
      maxTemplates,
      remaining: maxTemplates === -1 ? -1 : Math.max(0, maxTemplates - total)
    };
  },
  // ============================================================
  // STRAPI CORE EMAIL TEMPLATES
  // ============================================================
  /**
   * Get Strapi core email template
   */
  async getCoreTemplate(coreEmailType) {
    if (!["reset-password", "email-confirmation"].includes(coreEmailType)) {
      throw new Error("Invalid core email type");
    }
    const pluginStoreEmailKey = coreEmailType === "email-confirmation" ? "email_confirmation" : "reset_password";
    const pluginStore = await strapi2.store({
      environment: "",
      type: "plugin",
      name: "users-permissions"
    });
    const emailConfig = await pluginStore.get({ key: "email" });
    let data = null;
    if (emailConfig && emailConfig[pluginStoreEmailKey]) {
      data = emailConfig[pluginStoreEmailKey];
    }
    const messageConverted = data?.options?.message ? data.options.message.replace(/<%|&#x3C;%/g, "{{").replace(/%>|%&#x3E;/g, "}}") : "";
    const subjectConverted = data?.options?.object ? data.options.object.replace(/<%|&#x3C;%/g, "{{").replace(/%>|%&#x3E;/g, "}}") : "";
    return {
      from: data?.options?.from || null,
      message: messageConverted || "",
      subject: subjectConverted || "",
      bodyHtml: messageConverted || "",
      bodyText: messageConverted ? convertHtmlToText(messageConverted, { wordwrap: 130 }) : "",
      coreEmailType,
      design: data?.design || null
    };
  },
  /**
   * Update Strapi core email template
   */
  async updateCoreTemplate(coreEmailType, data) {
    if (!["reset-password", "email-confirmation"].includes(coreEmailType)) {
      throw new Error("Invalid core email type");
    }
    const pluginStoreEmailKey = coreEmailType === "email-confirmation" ? "email_confirmation" : "reset_password";
    const pluginStore = await strapi2.store({
      environment: "",
      type: "plugin",
      name: "users-permissions"
    });
    const emailsConfig = await pluginStore.get({ key: "email" });
    emailsConfig[pluginStoreEmailKey] = {
      ...emailsConfig[pluginStoreEmailKey],
      options: {
        ...emailsConfig[pluginStoreEmailKey]?.options || {},
        message: data.message.replace(/{{/g, "<%").replace(/}}/g, "%>"),
        object: data.subject.replace(/{{/g, "<%").replace(/}}/g, "%>")
      },
      design: data.design
    };
    await pluginStore.set({ key: "email", value: emailsConfig });
    strapi2.log.info(`[magic-mail] [SUCCESS] Core email template updated: ${pluginStoreEmailKey}`);
    return { message: "Saved" };
  }
});
const crypto = require$$0__default.default;
const EMAIL_LOG_UID = "plugin::magic-mail.email-log";
const EMAIL_EVENT_UID = "plugin::magic-mail.email-event";
const EMAIL_LINK_UID = "plugin::magic-mail.email-link";
var analytics$1 = ({ strapi: strapi2 }) => ({
  /**
   * Generate unique email ID for tracking
   */
  generateEmailId() {
    return crypto.randomBytes(16).toString("hex");
  },
  /**
   * Generate secure hash for recipient (for tracking URLs)
   */
  generateRecipientHash(emailId, recipient) {
    const secret = process.env.APP_KEYS || process.env.MAGIC_MAIL_ENCRYPTION_KEY;
    if (!secret) {
      throw new Error(
        "[magic-mail] FATAL: No HMAC secret configured. Set APP_KEYS or MAGIC_MAIL_ENCRYPTION_KEY in your environment variables. Tracking hashes cannot be generated securely without a proper key."
      );
    }
    const normalized = (recipient || "").trim().toLowerCase();
    return crypto.createHmac("sha256", secret).update(`${emailId}-${normalized}`).digest("hex").substring(0, 32);
  },
  /**
   * Create email log entry
   */
  async createEmailLog(data) {
    const emailId = this.generateEmailId();
    const normalizedRecipient = data.to ? String(data.to).trim().toLowerCase() : data.to;
    const logEntry = await strapi2.documents(EMAIL_LOG_UID).create({
      data: {
        emailId,
        user: data.userId || null,
        recipient: normalizedRecipient,
        recipientName: data.recipientName || null,
        subject: data.subject,
        templateId: data.templateId || null,
        templateName: data.templateName || null,
        accountId: data.accountId || null,
        accountName: data.accountName || null,
        sentAt: /* @__PURE__ */ new Date(),
        metadata: data.metadata || {}
      }
    });
    strapi2.log.info(`[magic-mail] [SUCCESS] Email log created: ${emailId}`);
    if (data.templateId) {
      strapi2.log.info(`[magic-mail] [INFO] Template tracked: ${data.templateName || "Unknown"} (ID: ${data.templateId})`);
    }
    return logEntry;
  },
  /**
   * Record email open event
   */
  async recordOpen(emailId, recipientHash, req) {
    try {
      const emailLog2 = await strapi2.documents(EMAIL_LOG_UID).findFirst({
        filters: { emailId }
      });
      if (!emailLog2) {
        strapi2.log.warn(`[magic-mail] Email log not found: ${emailId}`);
        return null;
      }
      const validHash = this.generateRecipientHash(emailId, emailLog2.recipient);
      if (recipientHash !== validHash) {
        strapi2.log.warn(`[magic-mail] Invalid recipient hash for: ${emailId}`);
        return null;
      }
      const now = /* @__PURE__ */ new Date();
      await strapi2.documents(EMAIL_LOG_UID).update({
        documentId: emailLog2.documentId,
        data: {
          openCount: (emailLog2.openCount || 0) + 1,
          firstOpenedAt: emailLog2.firstOpenedAt || now,
          lastOpenedAt: now
        }
      });
      const event = await strapi2.documents(EMAIL_EVENT_UID).create({
        data: {
          emailLog: emailLog2.documentId,
          type: "open",
          timestamp: now,
          ipAddress: req.ip || req.headers["x-forwarded-for"] || null,
          userAgent: req.headers["user-agent"] || null,
          location: this.parseLocation(req)
        }
      });
      strapi2.log.info(`[magic-mail] [EMAIL] Email opened: ${emailId} (count: ${(emailLog2.openCount || 0) + 1})`);
      return event;
    } catch (error) {
      strapi2.log.error("[magic-mail] Error recording open:", error);
      return null;
    }
  },
  /**
   * Record email click event
   */
  async recordClick(emailId, linkHash, recipientHash, targetUrl, req) {
    try {
      const emailLog2 = await strapi2.documents(EMAIL_LOG_UID).findFirst({
        filters: { emailId }
      });
      if (!emailLog2) {
        return null;
      }
      const validHash = this.generateRecipientHash(emailId, emailLog2.recipient);
      if (recipientHash !== validHash) {
        return null;
      }
      const now = /* @__PURE__ */ new Date();
      await strapi2.documents(EMAIL_LOG_UID).update({
        documentId: emailLog2.documentId,
        data: {
          clickCount: (emailLog2.clickCount || 0) + 1
        }
      });
      const event = await strapi2.documents(EMAIL_EVENT_UID).create({
        data: {
          emailLog: emailLog2.documentId,
          type: "click",
          timestamp: now,
          ipAddress: req.ip || req.headers["x-forwarded-for"] || null,
          userAgent: req.headers["user-agent"] || null,
          location: this.parseLocation(req),
          linkUrl: targetUrl
        }
      });
      strapi2.log.info(`[magic-mail] [CLICK] Link clicked: ${emailId} -> ${targetUrl}`);
      return event;
    } catch (error) {
      strapi2.log.error("[magic-mail] Error recording click:", error);
      return null;
    }
  },
  /**
   * Get analytics statistics
   * Note: Document Service doesn't have count() - using findMany for counting
   */
  async getStats(filters = {}) {
    const baseFilters = {};
    if (filters.userId) {
      baseFilters.user = { documentId: filters.userId };
    }
    if (filters.templateId) {
      baseFilters.templateId = filters.templateId;
    }
    if (filters.accountId) {
      baseFilters.accountId = filters.accountId;
    }
    if (filters.dateFrom) {
      baseFilters.sentAt = { $gte: new Date(filters.dateFrom) };
    }
    if (filters.dateTo) {
      baseFilters.sentAt = { ...baseFilters.sentAt, $lte: new Date(filters.dateTo) };
    }
    const [totalSent, totalOpened, totalClicked, totalBounced] = await Promise.all([
      strapi2.documents(EMAIL_LOG_UID).count({
        filters: baseFilters
      }),
      strapi2.documents(EMAIL_LOG_UID).count({
        filters: { ...baseFilters, openCount: { $gt: 0 } }
      }),
      strapi2.documents(EMAIL_LOG_UID).count({
        filters: { ...baseFilters, clickCount: { $gt: 0 } }
      }),
      strapi2.documents(EMAIL_LOG_UID).count({
        filters: { ...baseFilters, bounced: true }
      })
    ]);
    const openRate = totalSent > 0 ? totalOpened / totalSent * 100 : 0;
    const clickRate = totalOpened > 0 ? totalClicked / totalOpened * 100 : 0;
    const bounceRate = totalSent > 0 ? totalBounced / totalSent * 100 : 0;
    return {
      totalSent,
      totalOpened,
      totalClicked,
      totalBounced,
      openRate: Math.round(openRate * 10) / 10,
      clickRate: Math.round(clickRate * 10) / 10,
      bounceRate: Math.round(bounceRate * 10) / 10
    };
  },
  /**
   * Get email logs with pagination
   */
  async getEmailLogs(filters = {}, pagination = {}) {
    const where = {};
    if (filters.userId) {
      where.user = { documentId: filters.userId };
    }
    if (filters.templateId) {
      where.templateId = filters.templateId;
    }
    if (filters.search) {
      where.$or = [
        { recipient: { $containsi: filters.search } },
        { subject: { $containsi: filters.search } },
        { recipientName: { $containsi: filters.search } }
      ];
    }
    const page = pagination.page || 1;
    const pageSize = pagination.pageSize || 25;
    const [logs, total] = await Promise.all([
      strapi2.documents(EMAIL_LOG_UID).findMany({
        filters: where,
        sort: [{ sentAt: "desc" }],
        limit: pageSize,
        offset: (page - 1) * pageSize,
        populate: ["user"]
      }),
      // Get total count using native count() method
      strapi2.documents(EMAIL_LOG_UID).count({
        filters: where
      })
    ]);
    return {
      data: logs,
      pagination: {
        page,
        pageSize,
        pageCount: Math.ceil(total / pageSize),
        total
      }
    };
  },
  /**
   * Get email log details with events
   */
  async getEmailLogDetails(emailId) {
    const emailLog2 = await strapi2.documents(EMAIL_LOG_UID).findFirst({
      filters: { emailId },
      populate: ["user", "events"]
    });
    return emailLog2;
  },
  /**
   * Get user email activity
   */
  async getUserActivity(userId) {
    const emailLogs = await strapi2.documents(EMAIL_LOG_UID).findMany({
      filters: { user: { documentId: userId } },
      sort: [{ sentAt: "desc" }],
      limit: 50
    });
    const stats = await this.getStats({ userId });
    return {
      stats,
      recentEmails: emailLogs
    };
  },
  /**
   * Parse location from request (basic implementation)
   */
  parseLocation(req) {
    return {
      ip: req.ip || req.headers["x-forwarded-for"] || null
      // country: null,
      // city: null,
    };
  },
  /**
   * Inject tracking pixel into HTML
   */
  injectTrackingPixel(html, emailId, recipientHash) {
    const baseUrl = strapi2.config.get("server.url") || "http://localhost:1337";
    const randomToken = crypto.randomBytes(8).toString("hex");
    const trackingUrl = `${baseUrl}/api/magic-mail/track/open/${emailId}/${recipientHash}?r=${randomToken}`;
    const trackingPixel = `<img src="${trackingUrl}" width="1" height="1" style="display:none;" alt="" />`;
    strapi2.log.info(`[magic-mail] [PIXEL] Tracking pixel URL: ${trackingUrl}`);
    if (html.includes("</body>")) {
      return html.replace("</body>", `${trackingPixel}</body>`);
    }
    return `${html}${trackingPixel}`;
  },
  /**
   * Rewrite links for click tracking
   */
  async rewriteLinksForTracking(html, emailId, recipientHash) {
    const settingsService = strapi2.plugin("magic-mail").service("plugin-settings");
    const pluginSettings2 = await settingsService.getSettings();
    const baseUrl = pluginSettings2.trackingBaseUrl || strapi2.config.get("server.url") || "http://localhost:1337";
    strapi2.log.debug(`[magic-mail] [LINK-TRACK] Using base URL: ${baseUrl}`);
    const emailLog2 = await strapi2.documents(EMAIL_LOG_UID).findFirst({
      filters: { emailId }
    });
    if (!emailLog2) {
      strapi2.log.error(`[magic-mail] Cannot rewrite links: Email log not found for ${emailId}`);
      return html;
    }
    let processedHtml = html.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
    const linkRegex = /<a\s+(?:[^>]*?\s+)?href\s*=\s*["']([^"']+)["'][^>]*>/gis;
    const simpleLinkRegex = /href\s*=\s*["'](https?:\/\/[^"']+)["']/gi;
    const linkMappings = [];
    const replacements = [];
    const processedUrls = /* @__PURE__ */ new Set();
    let linkCount = 0;
    let match;
    while ((match = linkRegex.exec(processedHtml)) !== null) {
      const originalUrl = match[1].trim();
      if (processedUrls.has(originalUrl)) continue;
      strapi2.log.debug(`[magic-mail] [CHECK] Found link: ${originalUrl.substring(0, 100)}${originalUrl.length > 100 ? "..." : ""}`);
      if (originalUrl.startsWith("#") || originalUrl.includes("/track/click/") || originalUrl.startsWith("mailto:") || originalUrl.startsWith("tel:") || originalUrl.startsWith("javascript:")) {
        strapi2.log.debug(`[magic-mail] [SKIP] Skipping special URL: ${originalUrl.substring(0, 50)}`);
        continue;
      }
      if (!originalUrl.match(/^https?:\/\//i)) {
        strapi2.log.debug(`[magic-mail] [SKIP] Skipping non-http URL: ${originalUrl.substring(0, 50)}`);
        continue;
      }
      processedUrls.add(originalUrl);
      const linkHash = crypto.createHash("md5").update(originalUrl).digest("hex").substring(0, 8);
      linkMappings.push({
        linkHash,
        originalUrl
      });
      const trackingUrl = `${baseUrl}/api/magic-mail/track/click/${emailId}/${linkHash}/${recipientHash}`;
      linkCount++;
      strapi2.log.info(`[magic-mail] [LINK] Link ${linkCount}: ${originalUrl.substring(0, 80)}${originalUrl.length > 80 ? "..." : ""}`);
      replacements.push({
        from: originalUrl,
        to: trackingUrl
      });
    }
    if (linkCount === 0) {
      strapi2.log.debug(`[magic-mail] [LINK-TRACK] Primary regex found no links, trying simple pattern...`);
      while ((match = simpleLinkRegex.exec(processedHtml)) !== null) {
        const originalUrl = match[1].trim();
        if (processedUrls.has(originalUrl)) continue;
        if (originalUrl.includes("/track/click/")) continue;
        processedUrls.add(originalUrl);
        const linkHash = crypto.createHash("md5").update(originalUrl).digest("hex").substring(0, 8);
        linkMappings.push({ linkHash, originalUrl });
        const trackingUrl = `${baseUrl}/api/magic-mail/track/click/${emailId}/${linkHash}/${recipientHash}`;
        linkCount++;
        strapi2.log.info(`[magic-mail] [LINK] Link ${linkCount} (simple): ${originalUrl.substring(0, 80)}`);
        replacements.push({ from: originalUrl, to: trackingUrl });
      }
    }
    for (const mapping of linkMappings) {
      try {
        await this.storeLinkMapping(emailLog2.documentId, mapping.linkHash, mapping.originalUrl);
      } catch (err) {
        strapi2.log.error("[magic-mail] Error storing link mapping:", err);
      }
    }
    let result = html;
    for (const replacement of replacements) {
      const escapedFrom = replacement.from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const escapedFromEncoded = replacement.from.replace(/&/g, "&amp;").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const hrefRegex = new RegExp(`(href\\s*=\\s*["'])${escapedFrom}(["'])`, "gi");
      const hrefRegexEncoded = new RegExp(`(href\\s*=\\s*["'])${escapedFromEncoded}(["'])`, "gi");
      result = result.replace(hrefRegex, `$1${replacement.to}$2`);
      result = result.replace(hrefRegexEncoded, `$1${replacement.to}$2`);
    }
    if (linkCount > 0) {
      strapi2.log.info(`[magic-mail] [SUCCESS] Rewrote ${linkCount} links for click tracking`);
    } else {
      strapi2.log.warn(`[magic-mail] [WARNING] No links found in email HTML for tracking!`);
      strapi2.log.debug(`[magic-mail] [DEBUG] HTML preview: ${html.substring(0, 500)}...`);
    }
    return result;
  },
  /**
   * Store link mapping in database
   */
  async storeLinkMapping(emailLogDocId, linkHash, originalUrl) {
    try {
      const existing = await strapi2.documents(EMAIL_LINK_UID).findFirst({
        filters: {
          emailLog: { documentId: emailLogDocId },
          linkHash
        }
      });
      if (existing) {
        strapi2.log.debug(`[magic-mail] Link mapping already exists for ${linkHash}`);
        return existing;
      }
      const linkMapping = await strapi2.documents(EMAIL_LINK_UID).create({
        data: {
          emailLog: emailLogDocId,
          linkHash,
          originalUrl,
          clickCount: 0
        }
      });
      strapi2.log.debug(`[magic-mail] [SAVE] Stored link mapping: ${linkHash} → ${originalUrl}`);
      return linkMapping;
    } catch (error) {
      strapi2.log.error("[magic-mail] Error storing link mapping:", error);
      throw error;
    }
  },
  /**
   * Get original URL from link hash
   */
  async getOriginalUrlFromHash(emailId, linkHash) {
    try {
      const emailLog2 = await strapi2.documents(EMAIL_LOG_UID).findFirst({
        filters: { emailId }
      });
      if (!emailLog2) {
        strapi2.log.warn(`[magic-mail] Email log not found: ${emailId}`);
        return null;
      }
      const linkMapping = await strapi2.documents(EMAIL_LINK_UID).findFirst({
        filters: {
          emailLog: { documentId: emailLog2.documentId },
          linkHash
        }
      });
      if (!linkMapping) {
        strapi2.log.warn(`[magic-mail] Link mapping not found: ${emailId}/${linkHash}`);
        return null;
      }
      const now = /* @__PURE__ */ new Date();
      await strapi2.documents(EMAIL_LINK_UID).update({
        documentId: linkMapping.documentId,
        data: {
          clickCount: (linkMapping.clickCount || 0) + 1,
          firstClickedAt: linkMapping.firstClickedAt || now,
          lastClickedAt: now
        }
      });
      return linkMapping.originalUrl;
    } catch (error) {
      strapi2.log.error("[magic-mail] Error getting original URL:", error);
      return null;
    }
  }
});
const path = require$$0__default$3.default;
const fs = require$$1__default$2.default;
let baileys = null;
const loadBaileys = async () => {
  if (!baileys) {
    try {
      baileys = require("baileys");
      if (process.env.DEBUG) {
        console.log("[MagicMail WhatsApp] Baileys loaded successfully");
      }
      return true;
    } catch (error) {
      console.warn("[MagicMail WhatsApp] Baileys not installed. WhatsApp features disabled.");
      console.warn("[MagicMail WhatsApp] Install with: npm install baileys pino qrcode");
      return false;
    }
  }
  return true;
};
var whatsapp$1 = ({ strapi: strapi2 }) => {
  let sock = null;
  let qrCode = null;
  let connectionStatus = "disconnected";
  let lastError = null;
  let eventListeners = [];
  let wasConnectedBefore = false;
  let reconnectAttempts = 0;
  const MAX_RECONNECT_ATTEMPTS = 3;
  const isDebugEnabled = async () => {
    try {
      const pluginStore = strapi2.store({ type: "plugin", name: "magic-mail" });
      const settings = await pluginStore.get({ key: "settings" });
      return settings?.whatsapp_debug === true;
    } catch {
      return false;
    }
  };
  const debugLog = async (message) => {
    if (await isDebugEnabled()) {
      strapi2.log.info(message);
    }
  };
  const getAuthPath = () => {
    const strapiRoot = strapi2.dirs?.app?.root || process.cwd();
    return path.join(strapiRoot, ".magicmail-whatsapp-auth");
  };
  const emit = (event, data) => {
    eventListeners.forEach((listener) => {
      try {
        listener(event, data);
      } catch (e) {
        console.error("[MagicMail WhatsApp] Event listener error:", e);
      }
    });
  };
  const service = {
    /**
     * Check if Baileys is available
     * @returns {Promise<boolean>} True if Baileys is installed
     */
    async isAvailable() {
      return await loadBaileys();
    },
    /**
     * Get current connection status
     * @returns {object} Status object with status, qrCode, lastError, isConnected
     */
    getStatus() {
      return {
        status: connectionStatus,
        qrCode,
        lastError,
        isConnected: connectionStatus === "connected"
      };
    },
    /**
     * Add event listener for WhatsApp events
     * @param {function} callback - Callback function(event, data)
     * @returns {function} Unsubscribe function
     */
    on(callback) {
      eventListeners.push(callback);
      return () => {
        eventListeners = eventListeners.filter((l) => l !== callback);
      };
    },
    /**
     * Initialize WhatsApp connection
     * @returns {Promise<object>} Connection result with success status
     */
    async connect() {
      const available = await loadBaileys();
      if (!available) {
        lastError = "Baileys not installed. Run: npm install baileys pino qrcode";
        strapi2.log.error("[MagicMail WhatsApp] [ERROR] Baileys library not available");
        return { success: false, error: lastError };
      }
      if (sock && connectionStatus === "connected") {
        await debugLog("[MagicMail WhatsApp] Already connected");
        return { success: true, status: "already_connected" };
      }
      if (sock) {
        try {
          sock.end();
        } catch (e) {
        }
        sock = null;
      }
      return new Promise(async (resolve) => {
        try {
          connectionStatus = "connecting";
          emit("status", { status: connectionStatus });
          await debugLog("[MagicMail WhatsApp] Starting connection...");
          const authPath = getAuthPath();
          if (!fs.existsSync(authPath)) {
            fs.mkdirSync(authPath, { recursive: true });
          }
          await debugLog(`[MagicMail WhatsApp] Auth path: ${authPath}`);
          const { state, saveCreds } = await baileys.useMultiFileAuthState(authPath);
          await debugLog("[MagicMail WhatsApp] Auth state loaded");
          const pino = require("pino");
          const logger2 = pino({ level: "silent" });
          await debugLog("[MagicMail WhatsApp] Creating WhatsApp socket...");
          const makeSocket = baileys.default || baileys.makeWASocket;
          const browserConfig = baileys.Browsers.ubuntu("Chrome");
          await debugLog(`[MagicMail WhatsApp] Browser config: ${JSON.stringify(browserConfig)}`);
          sock = makeSocket({
            auth: state,
            logger: logger2,
            browser: browserConfig,
            syncFullHistory: false,
            markOnlineOnConnect: false,
            generateHighQualityLinkPreview: false,
            getMessage: async (key) => {
              return { conversation: "" };
            }
          });
          await debugLog("[MagicMail WhatsApp] Socket created, registering event handlers...");
          let resolved = false;
          const resolveOnce = (result) => {
            if (!resolved) {
              resolved = true;
              resolve(result);
            }
          };
          setTimeout(() => {
            if (!resolved) {
              strapi2.log.warn("[MagicMail WhatsApp] Connection timeout - no QR or connection");
              resolveOnce({ success: true, status: connectionStatus, qrCode });
            }
          }, 3e4);
          sock.ev.on("connection.update", async (update) => {
            await debugLog(`[MagicMail WhatsApp] connection.update: ${JSON.stringify(update)}`);
            const { connection, lastDisconnect, qr } = update;
            if (qr) {
              await debugLog("[MagicMail WhatsApp] QR code received");
              try {
                const QRCode = require("qrcode");
                qrCode = await QRCode.toDataURL(qr);
                connectionStatus = "qr_pending";
                emit("qr", { qrCode });
                emit("status", { status: connectionStatus });
                strapi2.log.info("[MagicMail WhatsApp] [SUCCESS] QR Code generated - scan with WhatsApp");
                resolveOnce({ success: true, status: connectionStatus, qrCode });
              } catch (qrError) {
                strapi2.log.error("[MagicMail WhatsApp] QR generation error:", qrError.message);
              }
            }
            if (connection === "close") {
              const statusCode = lastDisconnect?.error?.output?.statusCode;
              const isLoggedOut = statusCode === baileys.DisconnectReason.loggedOut;
              const isRestartRequired = statusCode === baileys.DisconnectReason.restartRequired;
              const isConnectionFailure = statusCode === 405;
              await debugLog(`[MagicMail WhatsApp] Connection closed - statusCode: ${statusCode}`);
              if (isLoggedOut) {
                connectionStatus = "disconnected";
                lastError = "Logged out from WhatsApp";
                qrCode = null;
                wasConnectedBefore = false;
                reconnectAttempts = 0;
                try {
                  fs.rmSync(authPath, { recursive: true, force: true });
                } catch (e) {
                }
                strapi2.log.warn("[MagicMail WhatsApp] Logged out - auth cleared");
              } else if (isRestartRequired) {
                await debugLog("[MagicMail WhatsApp] Restart required - reconnecting...");
                connectionStatus = "connecting";
                setTimeout(() => {
                  service.connect();
                }, 1e3);
              } else if (isConnectionFailure && reconnectAttempts < 2) {
                reconnectAttempts++;
                await debugLog(`[MagicMail WhatsApp] Connection rejected (405) - retrying (${reconnectAttempts}/2)`);
                try {
                  fs.rmSync(authPath, { recursive: true, force: true });
                } catch (e) {
                }
                connectionStatus = "disconnected";
                qrCode = null;
                setTimeout(() => {
                  service.connect();
                }, 3e3);
              } else if (isConnectionFailure) {
                connectionStatus = "disconnected";
                lastError = "WhatsApp connection rejected (405). Please try again later.";
                strapi2.log.error("[MagicMail WhatsApp] [ERROR] Connection rejected after retries.");
                resolveOnce({ success: false, status: connectionStatus, error: lastError });
              } else if (wasConnectedBefore && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                reconnectAttempts++;
                connectionStatus = "connecting";
                await debugLog(`[MagicMail WhatsApp] Reconnecting (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
                setTimeout(() => {
                  service.connect();
                }, 3e3 * reconnectAttempts);
              } else if (!wasConnectedBefore) {
                connectionStatus = "disconnected";
                qrCode = null;
                await debugLog("[MagicMail WhatsApp] Connection closed - waiting for QR scan");
              } else {
                connectionStatus = "disconnected";
                lastError = "Max reconnect attempts reached";
                strapi2.log.warn("[MagicMail WhatsApp] Max reconnect attempts reached");
              }
              emit("status", { status: connectionStatus, error: lastError });
            }
            if (connection === "open") {
              connectionStatus = "connected";
              qrCode = null;
              lastError = null;
              wasConnectedBefore = true;
              reconnectAttempts = 0;
              emit("status", { status: connectionStatus });
              strapi2.log.info("[MagicMail WhatsApp] [SUCCESS] Connected successfully!");
              resolveOnce({ success: true, status: connectionStatus });
            }
          });
          sock.ev.on("creds.update", saveCreds);
        } catch (error) {
          lastError = error.message;
          connectionStatus = "disconnected";
          strapi2.log.error("[MagicMail WhatsApp] Connection error:", error);
          resolve({ success: false, error: error.message });
        }
      });
    },
    /**
     * Disconnect WhatsApp and clear session
     * @returns {Promise<object>} Result with success status
     */
    async disconnect() {
      if (sock) {
        try {
          await sock.logout();
        } catch (e) {
        }
        sock = null;
      }
      connectionStatus = "disconnected";
      qrCode = null;
      emit("status", { status: connectionStatus });
      strapi2.log.info("[MagicMail WhatsApp] Disconnected");
      return { success: true };
    },
    /**
     * Send a text message to a phone number
     * @param {string} phoneNumber - Phone number with country code (e.g., "491234567890")
     * @param {string} message - Message text
     * @returns {Promise<object>} Result with success status
     */
    async sendMessage(phoneNumber, message) {
      if (connectionStatus !== "connected" || !sock) {
        return {
          success: false,
          error: "WhatsApp not connected. Please connect first."
        };
      }
      try {
        const formattedNumber = phoneNumber.replace(/[^\d]/g, "");
        const jid = `${formattedNumber}@s.whatsapp.net`;
        const [exists] = await sock.onWhatsApp(formattedNumber);
        if (!exists?.exists) {
          return {
            success: false,
            error: `Phone number ${phoneNumber} is not registered on WhatsApp`
          };
        }
        await sock.sendMessage(jid, { text: message });
        await debugLog(`[MagicMail WhatsApp] Message sent to ${formattedNumber}`);
        return { success: true, jid };
      } catch (error) {
        strapi2.log.error("[MagicMail WhatsApp] Send error:", error);
        return { success: false, error: error.message };
      }
    },
    /**
     * Send message using a template
     * @param {string} phoneNumber - Phone number
     * @param {string} templateName - Template identifier
     * @param {object} variables - Template variables to replace
     * @returns {Promise<object>} Result with success status
     */
    async sendTemplateMessage(phoneNumber, templateName, variables = {}) {
      try {
        const pluginStore = strapi2.store({ type: "plugin", name: "magic-mail" });
        const templates = await pluginStore.get({ key: "whatsapp_templates" }) || {};
        let template = templates[templateName];
        if (!template) {
          template = `*{{subject}}*

{{body}}`;
        }
        let message = template;
        for (const [key, value] of Object.entries(variables)) {
          message = message.replace(new RegExp(`{{${key}}}`, "g"), value);
        }
        return this.sendMessage(phoneNumber, message);
      } catch (error) {
        return { success: false, error: error.message };
      }
    },
    /**
     * Check if a phone number is on WhatsApp
     * @param {string} phoneNumber - Phone number to check
     * @returns {Promise<object>} Result with exists boolean
     */
    async checkNumber(phoneNumber) {
      if (connectionStatus !== "connected" || !sock) {
        return { success: false, error: "WhatsApp not connected" };
      }
      try {
        const formattedNumber = phoneNumber.replace(/[^\d]/g, "");
        const [result] = await sock.onWhatsApp(formattedNumber);
        return {
          success: true,
          exists: result?.exists || false,
          jid: result?.jid
        };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },
    /**
     * Get session info
     * @returns {Promise<object|null>} Session info or null if not connected
     */
    async getSessionInfo() {
      if (connectionStatus !== "connected" || !sock) {
        return null;
      }
      try {
        const user = sock.user;
        return {
          phoneNumber: user?.id?.split(":")[0] || user?.id?.split("@")[0],
          name: user?.name,
          platform: "WhatsApp Web"
        };
      } catch (error) {
        return null;
      }
    },
    /**
     * Reset connection state (for manual cleanup)
     */
    reset() {
      sock = null;
      qrCode = null;
      connectionStatus = "disconnected";
      lastError = null;
      wasConnectedBefore = false;
      reconnectAttempts = 0;
    },
    /**
     * Save WhatsApp template
     * @param {string} templateName - Template identifier
     * @param {string} templateContent - Template content with {{variables}}
     * @returns {Promise<object>} Result with success status
     */
    async saveTemplate(templateName, templateContent) {
      try {
        const pluginStore = strapi2.store({ type: "plugin", name: "magic-mail" });
        const templates = await pluginStore.get({ key: "whatsapp_templates" }) || {};
        templates[templateName] = templateContent;
        await pluginStore.set({ key: "whatsapp_templates", value: templates });
        return { success: true };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },
    /**
     * Get all WhatsApp templates
     * @returns {Promise<object>} Templates object
     */
    async getTemplates() {
      try {
        const pluginStore = strapi2.store({ type: "plugin", name: "magic-mail" });
        const templates = await pluginStore.get({ key: "whatsapp_templates" }) || {};
        return templates;
      } catch (error) {
        return {};
      }
    },
    /**
     * Delete a WhatsApp template
     * @param {string} templateName - Template identifier
     * @returns {Promise<object>} Result with success status
     */
    async deleteTemplate(templateName) {
      try {
        const pluginStore = strapi2.store({ type: "plugin", name: "magic-mail" });
        const templates = await pluginStore.get({ key: "whatsapp_templates" }) || {};
        delete templates[templateName];
        await pluginStore.set({ key: "whatsapp_templates", value: templates });
        return { success: true };
      } catch (error) {
        return { success: false, error: error.message };
      }
    }
  };
  return service;
};
const SETTINGS_UID = "plugin::magic-mail.plugin-settings";
var pluginSettings$1 = ({ strapi: strapi2 }) => ({
  /**
   * Get plugin settings (creates default if not exists)
   * @returns {Promise<Object>} Plugin settings
   */
  async getSettings() {
    try {
      let settings = await strapi2.documents(SETTINGS_UID).findFirst({});
      if (!settings) {
        settings = await strapi2.documents(SETTINGS_UID).create({
          data: {
            enableLinkTracking: true,
            enableOpenTracking: true,
            trackingBaseUrl: null,
            defaultFromName: null,
            defaultFromEmail: null,
            unsubscribeUrl: null,
            enableUnsubscribeHeader: true
          }
        });
        strapi2.log.info("[magic-mail] [SETTINGS] Created default plugin settings");
      }
      return settings;
    } catch (error) {
      strapi2.log.error("[magic-mail] [SETTINGS] Error getting settings:", error);
      return {
        enableLinkTracking: true,
        enableOpenTracking: true,
        trackingBaseUrl: null,
        defaultFromName: null,
        defaultFromEmail: null,
        unsubscribeUrl: null,
        enableUnsubscribeHeader: true
      };
    }
  },
  /**
   * Update plugin settings
   * @param {Object} data - Settings to update
   * @returns {Promise<Object>} Updated settings
   */
  async updateSettings(data) {
    try {
      const sanitizedData = {
        ...data,
        trackingBaseUrl: data.trackingBaseUrl?.trim() || null,
        defaultFromName: data.defaultFromName?.trim() || null,
        defaultFromEmail: data.defaultFromEmail?.trim()?.toLowerCase() || null,
        unsubscribeUrl: data.unsubscribeUrl?.trim() || null
      };
      let settings = await strapi2.documents(SETTINGS_UID).findFirst({});
      if (settings) {
        settings = await strapi2.documents(SETTINGS_UID).update({
          documentId: settings.documentId,
          data: sanitizedData
        });
        strapi2.log.info("[magic-mail] [SETTINGS] Updated plugin settings");
      } else {
        settings = await strapi2.documents(SETTINGS_UID).create({
          data: {
            enableLinkTracking: sanitizedData.enableLinkTracking ?? true,
            enableOpenTracking: sanitizedData.enableOpenTracking ?? true,
            trackingBaseUrl: sanitizedData.trackingBaseUrl,
            defaultFromName: sanitizedData.defaultFromName,
            defaultFromEmail: sanitizedData.defaultFromEmail,
            unsubscribeUrl: sanitizedData.unsubscribeUrl,
            enableUnsubscribeHeader: sanitizedData.enableUnsubscribeHeader ?? true
          }
        });
        strapi2.log.info("[magic-mail] [SETTINGS] Created plugin settings");
      }
      return settings;
    } catch (error) {
      strapi2.log.error("[magic-mail] [SETTINGS] Error updating settings:", error);
      throw error;
    }
  },
  /**
   * Check if link tracking is enabled
   * @returns {Promise<boolean>}
   */
  async isLinkTrackingEnabled() {
    const settings = await this.getSettings();
    return settings.enableLinkTracking !== false;
  },
  /**
   * Check if open tracking is enabled
   * @returns {Promise<boolean>}
   */
  async isOpenTrackingEnabled() {
    const settings = await this.getSettings();
    return settings.enableOpenTracking !== false;
  },
  /**
   * Get tracking base URL
   * @returns {Promise<string|null>}
   */
  async getTrackingBaseUrl() {
    const settings = await this.getSettings();
    return settings.trackingBaseUrl || null;
  }
});
const emailRouter = emailRouter$1;
const accountManager = accountManager$1;
const oauth = oauth$1;
const licenseGuard = licenseGuard$1;
const emailDesigner = emailDesigner$1;
const analytics = analytics$1;
const whatsapp = whatsapp$1;
const pluginSettings = pluginSettings$1;
var services$1 = {
  "email-router": emailRouter,
  "account-manager": accountManager,
  oauth,
  "license-guard": licenseGuard,
  "email-designer": emailDesigner,
  analytics,
  whatsapp,
  "plugin-settings": pluginSettings
};
const register = register$1;
const bootstrap = bootstrap$1;
const destroy = destroy$1;
const config = config$1;
const contentTypes = contentTypes$1;
const controllers = controllers$1;
const routes = routes$1;
const middlewares = middlewares$1;
const policies = policies$1;
const services = services$1;
var src = {
  register,
  bootstrap,
  destroy,
  config,
  contentTypes,
  controllers,
  routes,
  middlewares,
  policies,
  services
};
const index = /* @__PURE__ */ getDefaultExportFromCjs(src);
module.exports = index;
