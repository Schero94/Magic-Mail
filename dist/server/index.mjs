import require$$0$1 from "crypto";
import require$$0$2 from "zod";
import require$$1$2 from "@strapi/utils";
import require$$0$4 from "nodemailer";
import require$$1$3 from "path";
import require$$3$1 from "url";
import require$$0$3 from "fs";
import require$$1$4 from "os";
import require$$0$5 from "mustache";
import require$$1$5 from "html-to-text";
import require$$2$2 from "decode-html";
var commonjsGlobal = typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : {};
function getDefaultExportFromCjs(x) {
  return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, "default") ? x["default"] : x;
}
function getAugmentedNamespace(n) {
  if (n.__esModule) return n;
  var f = n.default;
  if (typeof f == "function") {
    var a = function a2() {
      if (this instanceof a2) {
        return Reflect.construct(f, arguments, this.constructor);
      }
      return f.apply(this, arguments);
    };
    a.prototype = f.prototype;
  } else a = {};
  Object.defineProperty(a, "__esModule", { value: true });
  Object.keys(n).forEach(function(k) {
    var d = Object.getOwnPropertyDescriptor(n, k);
    Object.defineProperty(a, k, d.get ? d : {
      enumerable: true,
      get: function() {
        return n[k];
      }
    });
  });
  return a;
}
var register$1 = ({ strapi: strapi2 }) => {
  strapi2.admin.services.permission.actionProvider.registerMany([
    {
      section: "plugins",
      displayName: "Access the MagicMail plugin",
      uid: "access",
      // Strapi 5's role editor only renders checkboxes for actions that
      // belong to a subCategory. Without this field the permission
      // exists but is invisible in Settings → Roles → Plugins →
      // MagicMail, so admins cannot grant or revoke it.
      subCategory: "General",
      pluginName: "magic-mail"
    }
  ]);
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
var encryption;
var hasRequiredEncryption;
function requireEncryption() {
  if (hasRequiredEncryption) return encryption;
  hasRequiredEncryption = 1;
  const crypto2 = require$$0$1;
  const ALGORITHM = "aes-256-gcm";
  const IV_LENGTH = 16;
  let warnedMissingKey = false;
  const isProduction = () => process.env.NODE_ENV === "production";
  function getEncryptionKey() {
    const primary = process.env.MAGIC_MAIL_ENCRYPTION_KEY;
    if (primary && primary.length > 0) {
      return crypto2.createHash("sha256").update(primary).digest();
    }
    if (isProduction()) {
      throw new Error(
        `[magic-mail] FATAL: MAGIC_MAIL_ENCRYPTION_KEY is required in production. Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
      );
    }
    if (!warnedMissingKey) {
      warnedMissingKey = true;
      console.warn(
        "[magic-mail] MAGIC_MAIL_ENCRYPTION_KEY not set — using dev fallback derived from ADMIN_JWT_SECRET/APP_KEYS. Set this env var before deploying (it is NOT rotatable)."
      );
    }
    const fallback = process.env.ADMIN_JWT_SECRET || (Array.isArray(process.env.APP_KEYS) ? process.env.APP_KEYS[0] : process.env.APP_KEYS) || "magic-mail-dev-fallback-DO-NOT-USE-IN-PRODUCTION";
    return crypto2.createHash("sha256").update(fallback).digest();
  }
  function encryptCredentials2(data) {
    if (!data) return null;
    try {
      const key = getEncryptionKey();
      const iv = crypto2.randomBytes(IV_LENGTH);
      const cipher = crypto2.createCipheriv(ALGORITHM, key, iv);
      const jsonData = JSON.stringify(data);
      let encrypted = cipher.update(jsonData, "utf8", "hex");
      encrypted += cipher.final("hex");
      const authTag = cipher.getAuthTag();
      return { encrypted: `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}` };
    } catch (err) {
      throw new Error(`Failed to encrypt credentials: ${err.message}`);
    }
  }
  function decryptCredentials2(encryptedData) {
    if (!encryptedData) return null;
    const key = getEncryptionKey();
    const encryptedString = typeof encryptedData === "object" && encryptedData.encrypted ? encryptedData.encrypted : encryptedData;
    if (typeof encryptedString !== "string") {
      throw new Error("[magic-mail] decrypt: expected string or {encrypted: string}");
    }
    const parts = encryptedString.split(":");
    if (parts.length !== 3) {
      throw new Error("[magic-mail] decrypt: malformed ciphertext (expected iv:tag:ct)");
    }
    const [ivHex, authTagHex, encrypted] = parts;
    if (!ivHex || !authTagHex || !encrypted) {
      throw new Error("[magic-mail] decrypt: missing ciphertext components");
    }
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const decipher = crypto2.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");
    try {
      return JSON.parse(decrypted);
    } catch (err) {
      throw new Error(`[magic-mail] decrypt: decrypted payload is not valid JSON: ${err.message}`);
    }
  }
  encryption = {
    encryptCredentials: encryptCredentials2,
    decryptCredentials: decryptCredentials2
  };
  return encryption;
}
const { createLogger: createLogger$2 } = logger;
var bootstrap$1 = async ({ strapi: strapi2 }) => {
  const log = createLogger$2(strapi2);
  log.info("[BOOTSTRAP] Starting...");
  try {
    const { encryptCredentials: encryptCredentials2 } = requireEncryption();
    encryptCredentials2({ __self_test: true });
  } catch (e) {
    log.error(`[BOOTSTRAP] ${e.message}`);
    throw e;
  }
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
          const result2 = await emailRouter2.send(emailData);
          log.info("[SUCCESS] Email routed successfully through MagicMail");
          return result2;
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
const require$$1$1 = {
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
  },
  trackingFallbackUrl: {
    type: "string",
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
const routingRule = require$$1$1;
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
const z = require$$0$2;
const emailString = z.string().email().max(254);
const safeString = z.string().max(1e3);
const safeText = z.string().max(1e5);
const headerSafe = z.string().max(1e3).refine(
  (v) => !/[\r\n]/.test(v),
  { message: "Must not contain newline characters" }
);
const providerEnum = z.enum([
  "smtp",
  "gmail",
  "microsoft",
  "yahoo",
  "ses",
  "sendgrid",
  "mailgun",
  "postmark",
  "sparkpost"
]);
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
    )
  ])
);
const schemas = {
  "accounts.create": z.object({
    name: safeString,
    description: safeString.optional(),
    provider: providerEnum,
    config: configRecord,
    fromEmail: emailString.optional(),
    fromName: headerSafe.optional(),
    replyTo: emailString.optional(),
    // Was missing here even though the admin-UI wizard and accounts.update
    // both include it — strict() was rejecting every create request with
    // "Unrecognized key: isActive" which surfaced as a bare
    // "Validation failed" 500. Parity with accounts.update restored.
    isActive: z.boolean().optional(),
    isPrimary: z.boolean().optional(),
    priority: z.number().int().min(0).max(100).optional(),
    dailyLimit: z.number().int().min(0).max(1e6).optional(),
    hourlyLimit: z.number().int().min(0).max(1e6).optional()
  }).strict(),
  "accounts.update": z.object({
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
    dailyLimit: z.number().int().min(0).max(1e6).optional(),
    hourlyLimit: z.number().int().min(0).max(1e6).optional()
  }).strict(),
  "accounts.test": z.object({
    testEmail: emailString.optional(),
    to: emailString.optional(),
    priority: z.enum(["normal", "high", "low"]).optional(),
    type: z.enum(["transactional", "marketing"]).optional(),
    unsubscribeUrl: z.string().url().optional().nullable()
  }).refine((d) => d.testEmail || d.to, { message: "testEmail or to is required" }),
  "accounts.testStrapiService": z.object({
    testEmail: emailString,
    accountName: safeString.optional().nullable()
  }),
  "oauth.createOAuthAccount": z.object({
    provider: z.enum(["gmail", "microsoft", "yahoo"]),
    code: z.string().min(1).max(4096),
    state: z.string().min(1).max(4096),
    accountDetails: z.object({
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
      priority: z.number().int().min(0).max(100).optional(),
      dailyLimit: z.number().int().min(0).max(1e6).optional(),
      hourlyLimit: z.number().int().min(0).max(1e6).optional(),
      config: z.object({
        clientId: z.string().min(1).max(512),
        clientSecret: z.string().min(1).max(512),
        tenantId: z.string().max(512).optional(),
        domain: z.string().max(253).optional()
      }).strict()
    }).strict()
  }).strict(),
  "emailDesigner.create": z.object({
    // The admin UI stores the reference as a string but coerces it to
    // a number via parseInt() before POSTing. Accepting both shapes
    // keeps the wizard working either way — the service layer stores
    // the DB column as a string regardless.
    templateReferenceId: z.union([safeString, z.number().int().nonnegative()]).optional(),
    name: safeString.optional(),
    subject: headerSafe.optional(),
    bodyHtml: safeText.optional(),
    bodyText: safeText.optional(),
    design: z.record(z.unknown()).optional().nullable(),
    category: safeString.optional(),
    isActive: z.boolean().optional(),
    tags: z.array(safeString).max(50).optional()
  }).strict(),
  "emailDesigner.update": z.object({
    // Parity with emailDesigner.create. Some edit flows re-send the
    // reference id; admitting both number and string matches what the
    // wizard payload actually looks like over the wire.
    templateReferenceId: z.union([safeString, z.number().int().nonnegative()]).optional(),
    name: safeString.optional(),
    subject: headerSafe.optional(),
    bodyHtml: safeText.optional(),
    bodyText: safeText.optional(),
    design: z.record(z.unknown()).optional().nullable(),
    category: safeString.optional(),
    isActive: z.boolean().optional(),
    tags: z.array(safeString).max(50).optional()
  }).strict(),
  "emailDesigner.renderTemplate": z.object({
    data: z.record(z.unknown()).optional()
  }).strict(),
  "emailDesigner.exportTemplates": z.object({
    templateIds: z.array(z.union([z.string(), z.number()])).optional()
  }),
  "emailDesigner.importTemplates": z.object({
    templates: z.array(z.record(z.unknown())).min(1)
  }),
  "emailDesigner.updateCoreTemplate": z.object({
    message: safeText,
    subject: headerSafe,
    design: z.record(z.unknown()).optional().nullable(),
    // The editor always submits the plain-text fallback alongside the
    // rich body. Previously strict() rejected this field and every
    // "Save core template" click crashed with a 400 "Validation
    // failed" before the body ever reached the service.
    bodyText: safeText.optional()
  }).strict(),
  "emailDesigner.testSend": z.object({
    to: emailString,
    accountName: safeString.optional().nullable()
  }),
  "whatsapp.sendTest": z.object({
    phoneNumber: z.string().min(5).max(20).regex(/^[\d+\-() ]+$/),
    message: safeString.optional()
  }),
  "whatsapp.sendTemplateMessage": z.object({
    phoneNumber: z.string().min(5).max(20).regex(/^[\d+\-() ]+$/),
    templateName: safeString,
    variables: z.record(z.unknown()).optional()
  }),
  "whatsapp.checkNumber": z.object({
    phoneNumber: z.string().min(5).max(20).regex(/^[\d+\-() ]+$/)
  }),
  "whatsapp.saveTemplate": z.object({
    templateName: safeString,
    templateContent: safeText
  }),
  "pluginSettings.update": z.object({
    enableLinkTracking: z.boolean().optional(),
    enableOpenTracking: z.boolean().optional(),
    trackingBaseUrl: z.string().url().optional().or(z.literal("")),
    defaultFromName: headerSafe.optional(),
    defaultFromEmail: emailString.optional().or(z.literal("")),
    unsubscribeUrl: z.string().url().optional().or(z.literal("")),
    enableUnsubscribeHeader: z.boolean().optional(),
    // Where to redirect the recipient when a tracking link is no longer
    // resolvable (e.g. retention cleanup removed the row). If empty the
    // tracker renders a static HTML fallback page instead.
    trackingFallbackUrl: z.string().url().optional().or(z.literal(""))
  }),
  // ── Content-API send payloads ───────────────────────────────────────────
  // Bounded attachments to prevent OOM from huge base64 payloads.
  // Max ~25 MB per attachment, max 20 per email, hard cap on filenames.
  // Absolute file paths are deliberately NOT part of this schema — the
  // Content-API strips them before validation (controller.stripAttachmentPaths).
  "content.send": z.object({
    to: z.union([emailString, z.array(emailString).max(100), z.string().max(4e3)]),
    cc: z.union([emailString, z.array(emailString).max(50), z.string().max(4e3)]).optional(),
    bcc: z.union([emailString, z.array(emailString).max(50), z.string().max(4e3)]).optional(),
    from: z.string().max(320).optional(),
    replyTo: z.string().max(320).optional(),
    subject: headerSafe.optional(),
    text: safeText.optional(),
    html: safeText.optional(),
    type: z.enum(["transactional", "marketing", "notification"]).optional(),
    priority: z.enum(["high", "normal", "low"]).optional(),
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
    attachments: z.array(
      z.object({
        filename: safeString.optional(),
        content: z.union([z.string().max(25 * 1024 * 1024), z.instanceof(Buffer)]).optional(),
        contentType: z.string().max(128).optional(),
        encoding: z.string().max(32).optional(),
        cid: z.string().max(128).optional()
      }).strict()
    ).max(20).optional(),
    headers: z.record(z.string().max(4e3)).optional(),
    phoneNumber: z.string().min(5).max(32).regex(/^[\d+\-() ]+$/).optional()
  }).strict(),
  "content.sendMessage": z.object({
    channel: z.enum(["email", "whatsapp", "auto"]).optional(),
    to: z.string().max(4e3).optional(),
    phoneNumber: z.string().min(5).max(32).regex(/^[\d+\-() ]+$/).optional(),
    subject: headerSafe.optional(),
    message: safeText.optional(),
    text: safeText.optional(),
    html: safeText.optional(),
    templateId: z.union([z.string().max(128), z.number().int().min(0)]).optional(),
    templateData: z.record(z.unknown()).optional()
  }).strict().refine((d) => !!d.to || !!d.phoneNumber, {
    message: 'Either "to" or "phoneNumber" is required'
  }),
  "content.sendWhatsApp": z.object({
    phoneNumber: z.string().min(5).max(32).regex(/^[\d+\-() ]+$/),
    message: safeText.optional(),
    templateId: z.union([z.string().max(128), z.number().int().min(0)]).optional(),
    templateData: z.record(z.unknown()).optional()
  }).strict(),
  "content.phoneParam": z.object({
    phoneNumber: z.string().min(5).max(32).regex(/^[\d+\-() ]+$/)
  })
};
function validate$5(schemaName, body) {
  const schema = schemas[schemaName];
  if (!schema) {
    throw new Error(`Unknown validation schema: ${schemaName}`);
  }
  const result2 = schema.safeParse(body);
  if (!result2.success) {
    const strapiErrors = require$$1$2.errors;
    const flattened = result2.error.flatten();
    const strapiLog = typeof strapi !== "undefined" && strapi && strapi.log ? strapi.log : null;
    if (strapiLog) {
      strapiLog.warn(
        `[magic-mail] Validation failed for schema '${schemaName}': ` + JSON.stringify({
          fieldErrors: flattened.fieldErrors,
          formErrors: flattened.formErrors
        })
      );
    }
    throw new strapiErrors.ValidationError("Validation failed", flattened.fieldErrors);
  }
  return result2.data;
}
function handleControllerError$3(ctx, err, logPrefix, fallbackMessage) {
  const isStrapiError = err && typeof err.status === "number" && typeof err.name === "string";
  if (isStrapiError) {
    strapi.log.warn(
      `${logPrefix}: ${err.name} (${err.status}) — ${err.message}` + (err.details ? ` | details=${JSON.stringify(err.details)}` : "")
    );
    throw err;
  }
  strapi.log.error(`${logPrefix}:`, err);
  ctx.throw(500, fallbackMessage || err.message || "Internal server error");
}
var validation = { validate: validate$5, schemas, handleControllerError: handleControllerError$3 };
const { validate: validate$4, handleControllerError: handleControllerError$2 } = validation;
function stripAttachmentPaths(body) {
  if (body && Array.isArray(body.attachments)) {
    body.attachments = body.attachments.map(({ path: path2, ...safe }) => safe);
  }
  return body;
}
var controller$1 = {
  async send(ctx) {
    try {
      const raw = stripAttachmentPaths({ ...ctx.request.body });
      const body = validate$4("content.send", raw);
      const emailRouter2 = strapi.plugin("magic-mail").service("email-router");
      const result2 = await emailRouter2.send(body);
      ctx.body = { success: true, ...result2 };
    } catch (err) {
      handleControllerError$2(ctx, err, "[magic-mail] Error sending email", "Failed to send email");
    }
  },
  async sendMessage(ctx) {
    try {
      const raw = stripAttachmentPaths({ ...ctx.request.body });
      const body = validate$4("content.sendMessage", raw);
      const emailRouter2 = strapi.plugin("magic-mail").service("email-router");
      const result2 = await emailRouter2.sendMessage(body);
      ctx.body = { success: true, ...result2 };
    } catch (err) {
      handleControllerError$2(ctx, err, "[magic-mail] Error sending message", "Failed to send message");
    }
  },
  async sendWhatsApp(ctx) {
    try {
      const body = validate$4("content.sendWhatsApp", ctx.request.body);
      const emailRouter2 = strapi.plugin("magic-mail").service("email-router");
      const result2 = await emailRouter2.sendWhatsApp(body);
      ctx.body = { success: true, ...result2 };
    } catch (err) {
      handleControllerError$2(ctx, err, "[magic-mail] Error sending WhatsApp", "Failed to send WhatsApp message");
    }
  },
  async getWhatsAppStatus(ctx) {
    try {
      const emailRouter2 = strapi.plugin("magic-mail").service("email-router");
      const status = emailRouter2.getWhatsAppStatus();
      ctx.body = { success: true, data: status };
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
  async checkWhatsAppNumber(ctx) {
    try {
      const { phoneNumber } = validate$4("content.phoneParam", ctx.params);
      const emailRouter2 = strapi.plugin("magic-mail").service("email-router");
      const result2 = await emailRouter2.checkWhatsAppNumber(phoneNumber);
      ctx.body = { success: true, data: result2 };
    } catch (err) {
      handleControllerError$2(ctx, err, "[magic-mail] Error checking WhatsApp number", "Failed to check phone number");
    }
  }
};
const { validate: validate$3, handleControllerError: handleControllerError$1 } = validation;
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
      const accountData = validate$3("accounts.create", ctx.request.body);
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
      handleControllerError$1(ctx, err, "[magic-mail] Error creating account", "Error creating email account");
    }
  },
  /**
   * Get single account with decrypted config (for editing)
   */
  async getOne(ctx) {
    try {
      const { accountId } = ctx.params;
      const accountManager2 = strapi.plugin("magic-mail").service("account-manager");
      const account = await accountManager2.getAccountForDisplay(accountId);
      if (!account) {
        return ctx.notFound("Email account not found");
      }
      ctx.body = {
        data: account
      };
    } catch (err) {
      handleControllerError$1(ctx, err, "[magic-mail] Error getting account", "Error fetching email account");
    }
  },
  /**
   * Update email account
   */
  async update(ctx) {
    try {
      const { accountId } = ctx.params;
      const accountManager2 = strapi.plugin("magic-mail").service("account-manager");
      const data = validate$3("accounts.update", ctx.request.body);
      if (data.provider) {
        const licenseGuard2 = strapi.plugin("magic-mail").service("license-guard");
        const providerAllowed = await licenseGuard2.isProviderAllowed(data.provider);
        if (!providerAllowed) {
          ctx.throw(403, `Provider "${data.provider}" requires a higher license tier.`);
          return;
        }
      }
      const account = await accountManager2.updateAccount(accountId, data);
      if (!account) {
        return ctx.notFound("Email account not found");
      }
      ctx.body = {
        data: account,
        message: "Email account updated successfully"
      };
    } catch (err) {
      handleControllerError$1(ctx, err, "[magic-mail] Error updating account", "Error updating email account");
    }
  },
  /**
   * Test email account with validation
   */
  async test(ctx) {
    try {
      const { accountId } = ctx.params;
      const { testEmail, to, priority, type, unsubscribeUrl } = validate$3("accounts.test", ctx.request.body);
      const recipientEmail = testEmail || to;
      const testOptions = {
        priority: priority || "normal",
        type: type || "transactional",
        unsubscribeUrl: unsubscribeUrl || null
      };
      const accountManager2 = strapi.plugin("magic-mail").service("account-manager");
      const result2 = await accountManager2.testAccount(accountId, recipientEmail, testOptions);
      ctx.body = result2;
    } catch (err) {
      handleControllerError$1(ctx, err, "[magic-mail] Error testing account", "Error testing email account");
    }
  },
  /**
   * Test Strapi Email Service Integration
   * Tests if MagicMail intercepts native Strapi email service
   */
  async testStrapiService(ctx) {
    try {
      const { testEmail, accountName } = validate$3("accounts.testStrapiService", ctx.request.body);
      strapi.log.info("[magic-mail] [TEST] Testing Strapi Email Service integration...");
      strapi.log.info('[magic-mail] [EMAIL] Calling strapi.plugin("email").service("email").send()');
      if (accountName) {
        strapi.log.info(`[magic-mail] [FORCE] Forcing specific account: ${accountName}`);
      }
      const result2 = await strapi.plugin("email").service("email").send({
        to: testEmail,
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
        result: result2,
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
const crypto$2 = require$$0$1;
const STATE_TTL_MS = 10 * 60 * 1e3;
const USED_STATE_STORE_KEY = "oauth:usedStates";
const PKCE_STORE_KEY_PREFIX = "oauth:pkce:";
function getSigningSecret(strapi2) {
  const candidates = [
    process.env.MAGIC_MAIL_OAUTH_STATE_SECRET,
    process.env.APP_KEYS,
    strapi2?.config?.get?.("server.app.keys")?.[0],
    process.env.API_TOKEN_SALT,
    process.env.JWT_SECRET
  ].filter(Boolean);
  if (candidates.length === 0) {
    throw new Error("[magic-mail] No signing secret available for OAuth state. Set MAGIC_MAIL_OAUTH_STATE_SECRET or APP_KEYS.");
  }
  return crypto$2.createHash("sha256").update(String(candidates[0])).digest();
}
async function createState$1(strapi2, { clientId, provider, usePKCE = true }) {
  if (!clientId) throw new Error("clientId is required");
  const nonce = crypto$2.randomBytes(16).toString("hex");
  const timestamp = Date.now();
  const payload = { clientId, provider, timestamp, nonce };
  const payloadJson = JSON.stringify(payload);
  const payloadB64 = Buffer.from(payloadJson).toString("base64url");
  const sig = crypto$2.createHmac("sha256", getSigningSecret(strapi2)).update(payloadB64).digest("base64url");
  const state = `${payloadB64}.${sig}`;
  let codeChallenge = null;
  let codeChallengeMethod = null;
  if (usePKCE) {
    const codeVerifier = crypto$2.randomBytes(32).toString("base64url");
    codeChallenge = crypto$2.createHash("sha256").update(codeVerifier).digest("base64url");
    codeChallengeMethod = "S256";
    try {
      const store = strapi2.store({ type: "plugin", name: "magic-mail" });
      const key = `${PKCE_STORE_KEY_PREFIX}${nonce}`;
      await store.set({ key, value: { codeVerifier, createdAt: timestamp } });
    } catch (err) {
      strapi2.log.warn("[magic-mail] Could not persist PKCE verifier:", err.message);
    }
  }
  return { state, codeChallenge, codeChallengeMethod };
}
async function verifyAndConsumeState$1(strapi2, stateString, expectedClientId) {
  if (!stateString || typeof stateString !== "string") {
    throw new Error("Missing state");
  }
  const parts = stateString.split(".");
  if (parts.length !== 2) {
    throw new Error("Malformed state");
  }
  const [payloadB64, sig] = parts;
  const expectedSig = crypto$2.createHmac("sha256", getSigningSecret(strapi2)).update(payloadB64).digest("base64url");
  const sigOk = sig.length === expectedSig.length && crypto$2.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig));
  if (!sigOk) {
    throw new Error("Invalid state signature");
  }
  let payload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString());
  } catch {
    throw new Error("Malformed state payload");
  }
  if (!payload.timestamp || !payload.nonce) {
    throw new Error("Incomplete state payload");
  }
  if (Date.now() - payload.timestamp > STATE_TTL_MS) {
    throw new Error("State expired");
  }
  if (expectedClientId && payload.clientId !== expectedClientId) {
    throw new Error("State clientId mismatch");
  }
  const store = strapi2.store({ type: "plugin", name: "magic-mail" });
  const usedRaw = await store.get({ key: USED_STATE_STORE_KEY });
  const used = Array.isArray(usedRaw) ? usedRaw : [];
  if (used.some((entry) => entry.nonce === payload.nonce)) {
    throw new Error("State already used (replay protection)");
  }
  const now = Date.now();
  const pruned = used.filter((entry) => now - entry.ts < STATE_TTL_MS);
  pruned.push({ nonce: payload.nonce, ts: now });
  const capped = pruned.slice(-500);
  await store.set({ key: USED_STATE_STORE_KEY, value: capped });
  let codeVerifier = null;
  try {
    const pkceKey = `${PKCE_STORE_KEY_PREFIX}${payload.nonce}`;
    const record = await store.get({ key: pkceKey });
    if (record && record.codeVerifier) {
      codeVerifier = record.codeVerifier;
      await store.delete({ key: pkceKey });
    }
  } catch {
  }
  return { payload, codeVerifier };
}
var oauthState = {
  createState: createState$1,
  verifyAndConsumeState: verifyAndConsumeState$1
};
const { createState, verifyAndConsumeState } = oauthState;
function escapeHtml$1(str) {
  return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
function escapeJs(str) {
  return String(str || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}
function setOAuthCallbackCsp(ctx) {
  ctx.set("Content-Security-Policy", "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'");
  ctx.set("X-Frame-Options", "SAMEORIGIN");
  ctx.set("Referrer-Policy", "no-referrer");
}
var oauth$3 = {
  /**
   * Initiates the Gmail OAuth flow. Generates a signed, one-time state and a
   * PKCE challenge, then returns the upstream authorize URL.
   *
   * @route GET /magic-mail/oauth/gmail/auth
   */
  async gmailAuth(ctx) {
    try {
      const { clientId } = ctx.query;
      if (!clientId) {
        return ctx.badRequest("Client ID is required");
      }
      const oauthService = strapi.plugin("magic-mail").service("oauth");
      const { state, codeChallenge, codeChallengeMethod } = await createState(strapi, {
        clientId,
        provider: "gmail",
        usePKCE: true
      });
      const authUrl = oauthService.getGmailAuthUrl(clientId, state, { codeChallenge, codeChallengeMethod });
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
   * Handles the Gmail OAuth callback. The response is a small HTML page that
   * forwards the code + state back to the parent admin tab via postMessage.
   * State/PKCE are verified later during token exchange.
   *
   * @route GET /magic-mail/oauth/gmail/callback
   */
  async gmailCallback(ctx) {
    try {
      const { code, state, error } = ctx.query;
      setOAuthCallbackCsp(ctx);
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
            <p>Error: ${escapeHtml$1(error)}</p>
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
      const { state, codeChallenge, codeChallengeMethod } = await createState(strapi, {
        clientId,
        provider: "microsoft",
        usePKCE: true
      });
      const authUrl = oauthService.getMicrosoftAuthUrl(clientId, tenantId, state, { codeChallenge, codeChallengeMethod });
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
   * Handles the Microsoft OAuth callback.
   * @route GET /magic-mail/oauth/microsoft/callback
   */
  async microsoftCallback(ctx) {
    try {
      const { code, state, error } = ctx.query;
      setOAuthCallbackCsp(ctx);
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
            <p>Error: ${escapeHtml$1(error)}</p>
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
      const { state, codeChallenge, codeChallengeMethod } = await createState(strapi, {
        clientId,
        provider: "yahoo",
        usePKCE: true
      });
      const authUrl = oauthService.getYahooAuthUrl(clientId, state, { codeChallenge, codeChallengeMethod });
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
   * Handles the Yahoo OAuth callback.
   * @route GET /magic-mail/oauth/yahoo/callback
   */
  async yahooCallback(ctx) {
    try {
      const { code, state, error } = ctx.query;
      setOAuthCallbackCsp(ctx);
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
            <p>Error: ${escapeHtml$1(error)}</p>
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
   * Creates an email account from a completed OAuth flow.
   *
   * Verifies the signed state parameter (CSRF + TTL + one-time-use), retrieves
   * the PKCE verifier, then exchanges the code for tokens.
   *
   * @route POST /magic-mail/oauth/account
   * @throws {ForbiddenError} When the license does not permit the provider or
   *   account limit is reached
   * @throws {ValidationError} When state verification fails or inputs are missing
   */
  async createOAuthAccount(ctx) {
    try {
      const { validate: validate2 } = validation;
      const { provider, code, state, accountDetails } = validate2("oauth.createOAuthAccount", ctx.request.body);
      strapi.log.info("[magic-mail] Creating OAuth account...");
      strapi.log.info("[magic-mail] Provider:", provider);
      if (!code) {
        return ctx.badRequest("OAuth code is required");
      }
      if (!accountDetails.config?.clientId || !accountDetails.config?.clientSecret) {
        return ctx.badRequest("Client ID and Secret are required");
      }
      let stateVerification;
      try {
        stateVerification = await verifyAndConsumeState(strapi, state, accountDetails.config.clientId);
      } catch (stateErr) {
        strapi.log.warn("[magic-mail] OAuth state verification failed:", stateErr.message);
        return ctx.badRequest("Invalid or expired OAuth state. Please restart the authorization flow.");
      }
      if (stateVerification.payload.provider && stateVerification.payload.provider !== provider) {
        strapi.log.warn("[magic-mail] OAuth state/provider mismatch");
        return ctx.badRequest("OAuth state provider mismatch");
      }
      const codeVerifier = stateVerification.codeVerifier;
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
      const oauthService = strapi.plugin("magic-mail").service("oauth");
      let tokenData;
      if (provider === "gmail") {
        strapi.log.info("[magic-mail] Calling exchangeGoogleCode...");
        tokenData = await oauthService.exchangeGoogleCode(
          code,
          accountDetails.config.clientId,
          accountDetails.config.clientSecret,
          { codeVerifier }
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
          accountDetails.config.tenantId,
          { codeVerifier }
        );
      } else if (provider === "yahoo") {
        strapi.log.info("[magic-mail] Calling exchangeYahooCode...");
        tokenData = await oauthService.exchangeYahooCode(
          code,
          accountDetails.config.clientId,
          accountDetails.config.clientSecret,
          { codeVerifier }
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
const { handleControllerError } = validation;
const ROUTING_RULE_UID = "plugin::magic-mail.routing-rule";
const ALLOWED_RULE_FIELDS = [
  "name",
  "description",
  "isActive",
  "priority",
  "matchType",
  "matchValue",
  "accountName",
  "fallbackAccountName",
  "whatsappFallback",
  "whatsappPhoneField"
];
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
      handleControllerError(ctx, err, "[magic-mail] Error getting routing rules", "Error fetching routing rules");
    }
  },
  /**
   * Get single routing rule
   */
  async getOne(ctx) {
    try {
      const { ruleId } = ctx.params;
      const rule2 = await strapi.documents(ROUTING_RULE_UID).findOne({
        documentId: ruleId
      });
      if (!rule2) {
        return ctx.notFound("Routing rule not found");
      }
      ctx.body = {
        data: rule2
      };
    } catch (err) {
      handleControllerError(ctx, err, "[magic-mail] Error getting routing rule", "Error fetching routing rule");
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
      const rule2 = await strapi.documents(ROUTING_RULE_UID).create({ data });
      ctx.body = {
        data: rule2,
        message: "Routing rule created successfully"
      };
      strapi.log.info(`[magic-mail] [SUCCESS] Routing rule created: ${rule2.name}`);
    } catch (err) {
      handleControllerError(ctx, err, "[magic-mail] Error creating routing rule", "Error creating routing rule");
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
      const rule2 = await strapi.documents(ROUTING_RULE_UID).update({
        documentId: ruleId,
        data
      });
      ctx.body = {
        data: rule2,
        message: "Routing rule updated successfully"
      };
      strapi.log.info(`[magic-mail] [SUCCESS] Routing rule updated: ${rule2.name}`);
    } catch (err) {
      handleControllerError(ctx, err, "[magic-mail] Error updating routing rule", "Error updating routing rule");
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
      handleControllerError(ctx, err, "[magic-mail] Error deleting routing rule", "Error deleting routing rule");
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
      if (process.env.NODE_ENV === "production") {
        return ctx.forbidden("Debug endpoint is disabled in production");
      }
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
const { validate: validate$2 } = validation;
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
      const template = await strapi2.plugin("magic-mail").service("email-designer").create(validate$2("emailDesigner.create", ctx.request.body));
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
      const template = await strapi2.plugin("magic-mail").service("email-designer").update(id, validate$2("emailDesigner.update", ctx.request.body));
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
      const result2 = await strapi2.plugin("magic-mail").service("email-designer").deleteVersion(id, versionId);
      return ctx.send({
        success: true,
        data: result2
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
      const result2 = await strapi2.plugin("magic-mail").service("email-designer").deleteAllVersions(id);
      return ctx.send({
        success: true,
        data: result2
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
      const { data } = validate$2("emailDesigner.renderTemplate", ctx.request.body);
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
      const { templateIds } = validate$2("emailDesigner.exportTemplates", ctx.request.body);
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
      const { templates } = validate$2("emailDesigner.importTemplates", ctx.request.body);
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
      const template = await strapi2.plugin("magic-mail").service("email-designer").updateCoreTemplate(coreEmailType, validate$2("emailDesigner.updateCoreTemplate", ctx.request.body));
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
      const { to, accountName } = validate$2("emailDesigner.testSend", ctx.request.body);
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
      const result2 = await emailRouterService.send(sendOptions);
      return ctx.send({
        success: true,
        message: "Test email sent successfully",
        data: {
          recipient: to,
          template: template.name,
          result: result2
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
const escapeHtml = (value) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const renderTrackingFallbackHtml = (reason, fallbackUrl) => {
  const safeReason = escapeHtml(reason);
  const safeUrl = fallbackUrl ? escapeHtml(fallbackUrl) : "";
  const refreshMeta = fallbackUrl ? `<meta http-equiv="refresh" content="3;url=${safeUrl}">` : "";
  const manualLink = fallbackUrl ? `<p style="margin-top:24px;font-size:14px;color:#6b7280;">
         You will be redirected in a few seconds. If nothing happens,
         <a href="${safeUrl}" style="color:#4f46e5;">click here</a>.
       </p>` : `<p style="margin-top:24px;font-size:14px;color:#6b7280;">
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
const respondWithTrackingFallback = async (ctx, reason) => {
  let fallbackUrl = null;
  try {
    const settings = await strapi.plugin("magic-mail").service("plugin-settings").getSettings();
    fallbackUrl = settings?.trackingFallbackUrl || null;
  } catch (err) {
    strapi.log.debug(`[magic-mail] Could not load tracking fallback setting: ${err.message}`);
  }
  ctx.status = 410;
  ctx.type = "text/html; charset=utf-8";
  ctx.body = renderTrackingFallbackHtml(reason, fallbackUrl);
};
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
      const analyticsService = strapi2.plugin("magic-mail").service("analytics");
      url = await analyticsService.getOriginalUrlFromHash(emailId, linkHash);
    } catch (err) {
      strapi2.log.error("[magic-mail] Error getting original URL:", err.message);
    }
    if (!url) {
      return respondWithTrackingFallback(
        ctx,
        "The page behind this link is no longer tracked. It may have been removed by our retention policy."
      );
    }
    try {
      const parsed = new URL(url);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        strapi2.log.warn(`[magic-mail] Blocked non-http(s) tracking URL for email ${emailId}`);
        return respondWithTrackingFallback(
          ctx,
          "This link points to an unsupported destination and cannot be opened for your safety."
        );
      }
    } catch {
      return respondWithTrackingFallback(
        ctx,
        "This link is no longer valid."
      );
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
      const result2 = await strapi2.plugin("magic-mail").service("analytics").getEmailLogs(filters, pagination);
      return ctx.send({
        success: true,
        ...result2
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
      if (process.env.NODE_ENV === "production") {
        return ctx.forbidden("Debug endpoint is disabled in production");
      }
      if (process.env.MAGIC_MAIL_ENABLE_DEBUG_ENDPOINT !== "true") {
        return ctx.forbidden(
          "Debug endpoint requires MAGIC_MAIL_ENABLE_DEBUG_ENDPOINT=true to be set"
        );
      }
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
   * Clears email logs in bounded batches so a huge backlog cannot block the
   * event loop or OOM the heap. Each invocation deletes up to MAX_TOTAL
   * entries; the caller can re-invoke the endpoint until `deletedCount: 0`
   * is reported to drain the backlog.
   *
   * DELETE /magic-mail/analytics/emails[?olderThan=YYYY-MM-DD]
   */
  async clearAllEmailLogs(ctx) {
    const PAGE_SIZE = 200;
    const MAX_TOTAL = 1e4;
    try {
      const { olderThan } = ctx.query;
      const filters = {};
      if (olderThan) {
        const boundary = new Date(olderThan);
        if (Number.isNaN(boundary.getTime())) {
          return ctx.badRequest("Invalid olderThan date");
        }
        filters.sentAt = { $lt: boundary };
      }
      let totalDeleted = 0;
      while (totalDeleted < MAX_TOTAL) {
        const emailLogs = await strapi2.documents(EMAIL_LOG_UID$1).findMany({
          filters,
          fields: ["id", "documentId"],
          sort: [{ sentAt: "asc" }],
          limit: PAGE_SIZE
        });
        if (!emailLogs || emailLogs.length === 0) break;
        for (const log of emailLogs) {
          const events = await strapi2.documents(EMAIL_EVENT_UID$1).findMany({
            filters: { emailLog: { documentId: log.documentId } }
          });
          for (const event of events) {
            await strapi2.documents(EMAIL_EVENT_UID$1).delete({ documentId: event.documentId });
          }
          await strapi2.documents(EMAIL_LOG_UID$1).delete({ documentId: log.documentId });
          totalDeleted++;
          if (totalDeleted >= MAX_TOTAL) break;
        }
        if (emailLogs.length < PAGE_SIZE) break;
      }
      if (totalDeleted > 0) {
        strapi2.log.info(`[magic-mail] [DELETE] Cleared ${totalDeleted} email logs this run`);
      }
      return ctx.send({
        success: true,
        message: totalDeleted === 0 ? "No email logs to delete" : `Deleted ${totalDeleted} email log(s)${totalDeleted >= MAX_TOTAL ? " (more remain, re-run to continue)" : ""}`,
        deletedCount: totalDeleted,
        hasMore: totalDeleted >= MAX_TOTAL
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
const { validate: validate$1 } = validation;
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
      const result2 = await whatsappService.connect();
      ctx.body = {
        success: result2.success,
        data: result2
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
      const result2 = await whatsappService.disconnect();
      ctx.body = {
        success: result2.success,
        data: result2
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
      const { phoneNumber, message } = validate$1("whatsapp.sendTest", ctx.request.body);
      const whatsappService = strapi.plugin("magic-mail").service("whatsapp");
      const testMessage = message || `[MagicMail Test] This is a test message sent at ${(/* @__PURE__ */ new Date()).toLocaleString()}`;
      const result2 = await whatsappService.sendMessage(phoneNumber, testMessage);
      ctx.body = {
        success: result2.success,
        data: result2
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
      const { phoneNumber, templateName, variables } = validate$1("whatsapp.sendTemplateMessage", ctx.request.body);
      const whatsappService = strapi.plugin("magic-mail").service("whatsapp");
      const result2 = await whatsappService.sendTemplateMessage(phoneNumber, templateName, variables || {});
      ctx.body = {
        success: result2.success,
        data: result2
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
      const { phoneNumber } = validate$1("whatsapp.checkNumber", ctx.request.body);
      const whatsappService = strapi.plugin("magic-mail").service("whatsapp");
      const result2 = await whatsappService.checkNumber(phoneNumber);
      ctx.body = {
        success: result2.success,
        data: result2
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
      const { templateName, templateContent } = validate$1("whatsapp.saveTemplate", ctx.request.body);
      const whatsappService = strapi.plugin("magic-mail").service("whatsapp");
      const result2 = await whatsappService.saveTemplate(templateName, templateContent);
      ctx.body = {
        success: result2.success,
        data: result2
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
      const result2 = await whatsappService.deleteTemplate(templateName);
      ctx.body = {
        success: result2.success,
        data: result2
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
const { validate } = validation;
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
      const data = validate("pluginSettings.update", ctx.request.body);
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
const PLUGIN_ACCESS_ACTION = "plugin::magic-mail.access";
const adminPolicy = () => [
  "admin::isAuthenticatedAdmin",
  {
    name: "admin::hasPermissions",
    config: { actions: [PLUGIN_ACCESS_ACTION] }
  }
];
var admin$1 = {
  type: "admin",
  routes: [
    // ─────────────────────── Account Management ───────────────────────
    {
      method: "GET",
      path: "/accounts",
      handler: "accounts.getAll",
      config: {
        policies: adminPolicy(),
        description: "Get all email accounts"
      }
    },
    {
      method: "GET",
      path: "/accounts/:accountId",
      handler: "accounts.getOne",
      config: {
        policies: adminPolicy(),
        description: "Get single email account with decrypted config"
      }
    },
    {
      method: "POST",
      path: "/accounts",
      handler: "accounts.create",
      config: {
        policies: adminPolicy(),
        description: "Create email account"
      }
    },
    {
      method: "PUT",
      path: "/accounts/:accountId",
      handler: "accounts.update",
      config: {
        policies: adminPolicy(),
        description: "Update email account"
      }
    },
    {
      method: "POST",
      path: "/accounts/:accountId/test",
      handler: "accounts.test",
      config: {
        policies: adminPolicy(),
        description: "Test email account"
      }
    },
    {
      method: "POST",
      path: "/test-strapi-service",
      handler: "accounts.testStrapiService",
      config: {
        policies: adminPolicy(),
        description: "Test Strapi Email Service integration (MagicMail intercept)"
      }
    },
    {
      method: "DELETE",
      path: "/accounts/:accountId",
      handler: "accounts.delete",
      config: {
        policies: adminPolicy(),
        description: "Delete email account"
      }
    },
    // ─────────────────────── Routing Rules ───────────────────────
    {
      method: "GET",
      path: "/routing-rules",
      handler: "routingRules.getAll",
      config: {
        policies: adminPolicy(),
        description: "Get all routing rules"
      }
    },
    {
      method: "GET",
      path: "/routing-rules/:ruleId",
      handler: "routingRules.getOne",
      config: {
        policies: adminPolicy(),
        description: "Get single routing rule"
      }
    },
    {
      method: "POST",
      path: "/routing-rules",
      handler: "routingRules.create",
      config: {
        policies: adminPolicy(),
        description: "Create routing rule"
      }
    },
    {
      method: "PUT",
      path: "/routing-rules/:ruleId",
      handler: "routingRules.update",
      config: {
        policies: adminPolicy(),
        description: "Update routing rule"
      }
    },
    {
      method: "DELETE",
      path: "/routing-rules/:ruleId",
      handler: "routingRules.delete",
      config: {
        policies: adminPolicy(),
        description: "Delete routing rule"
      }
    },
    // ─────────────────────── OAuth – Gmail ───────────────────────
    // /auth endpoints are admin-only (they generate the OAuth URL for
    // the currently-authenticated admin). /callback MUST remain public
    // because Google/Microsoft/Yahoo can't send a bearer token on the
    // redirect — security is enforced by the signed single-use state.
    {
      method: "GET",
      path: "/oauth/gmail/auth",
      handler: "oauth.gmailAuth",
      config: {
        policies: adminPolicy(),
        description: "Initiate Gmail OAuth flow"
      }
    },
    {
      method: "GET",
      path: "/oauth/gmail/callback",
      handler: "oauth.gmailCallback",
      config: {
        auth: false,
        // Public callback - secured via signed state
        description: "Gmail OAuth callback"
      }
    },
    // ─────────────────────── OAuth – Microsoft ───────────────────────
    {
      method: "GET",
      path: "/oauth/microsoft/auth",
      handler: "oauth.microsoftAuth",
      config: {
        policies: adminPolicy(),
        description: "Initiate Microsoft OAuth flow"
      }
    },
    {
      method: "GET",
      path: "/oauth/microsoft/callback",
      handler: "oauth.microsoftCallback",
      config: {
        auth: false,
        // Public callback - secured via signed state
        description: "Microsoft OAuth callback"
      }
    },
    // ─────────────────────── OAuth – Yahoo ───────────────────────
    {
      method: "GET",
      path: "/oauth/yahoo/auth",
      handler: "oauth.yahooAuth",
      config: {
        policies: adminPolicy(),
        description: "Initiate Yahoo OAuth flow"
      }
    },
    {
      method: "GET",
      path: "/oauth/yahoo/callback",
      handler: "oauth.yahooCallback",
      config: {
        auth: false,
        // Public callback - secured via signed state
        description: "Yahoo OAuth callback"
      }
    },
    // ─────────────────────── OAuth – Generic ───────────────────────
    {
      method: "POST",
      path: "/oauth/create-account",
      handler: "oauth.createOAuthAccount",
      config: {
        policies: adminPolicy(),
        description: "Create account from OAuth"
      }
    },
    // ─────────────────────── License ───────────────────────
    {
      method: "GET",
      path: "/license/status",
      handler: "license.getStatus",
      config: {
        policies: adminPolicy(),
        description: "Get license status"
      }
    },
    {
      method: "POST",
      path: "/license/auto-create",
      handler: "license.autoCreate",
      config: {
        policies: adminPolicy(),
        description: "Auto-create license with admin user data"
      }
    },
    {
      method: "POST",
      path: "/license/store-key",
      handler: "license.storeKey",
      config: {
        policies: adminPolicy(),
        description: "Store and validate existing license key"
      }
    },
    {
      method: "GET",
      path: "/license/limits",
      handler: "license.getLimits",
      config: {
        policies: adminPolicy(),
        description: "Get license limits and available features"
      }
    },
    {
      method: "GET",
      path: "/license/debug",
      handler: "license.debugLicense",
      config: {
        policies: adminPolicy(),
        description: "Debug license data"
      }
    },
    // ─────────────────────── Email Designer ───────────────────────
    {
      method: "GET",
      path: "/designer/templates",
      handler: "emailDesigner.findAll",
      config: {
        policies: adminPolicy(),
        description: "Get all email templates"
      }
    },
    {
      method: "GET",
      path: "/designer/templates/:id",
      handler: "emailDesigner.findOne",
      config: {
        policies: adminPolicy(),
        description: "Get email template by ID"
      }
    },
    {
      method: "POST",
      path: "/designer/templates",
      handler: "emailDesigner.create",
      config: {
        policies: adminPolicy(),
        description: "Create email template"
      }
    },
    {
      method: "PUT",
      path: "/designer/templates/:id",
      handler: "emailDesigner.update",
      config: {
        policies: adminPolicy(),
        description: "Update email template"
      }
    },
    {
      method: "DELETE",
      path: "/designer/templates/:id",
      handler: "emailDesigner.delete",
      config: {
        policies: adminPolicy(),
        description: "Delete email template"
      }
    },
    {
      method: "GET",
      path: "/designer/templates/:id/versions",
      handler: "emailDesigner.getVersions",
      config: {
        policies: adminPolicy(),
        description: "Get template versions"
      }
    },
    {
      method: "POST",
      path: "/designer/templates/:id/versions/:versionId/restore",
      handler: "emailDesigner.restoreVersion",
      config: {
        policies: adminPolicy(),
        description: "Restore template from version"
      }
    },
    {
      method: "POST",
      path: "/designer/templates/:id/versions/:versionId/delete",
      handler: "emailDesigner.deleteVersion",
      config: {
        policies: adminPolicy(),
        description: "Delete a single version"
      }
    },
    {
      method: "POST",
      path: "/designer/templates/:id/versions/delete-all",
      handler: "emailDesigner.deleteAllVersions",
      config: {
        policies: adminPolicy(),
        description: "Delete all versions for a template"
      }
    },
    {
      method: "POST",
      path: "/designer/render/:templateReferenceId",
      handler: "emailDesigner.renderTemplate",
      config: {
        policies: adminPolicy(),
        description: "Render template with data"
      }
    },
    {
      method: "POST",
      path: "/designer/export",
      handler: "emailDesigner.exportTemplates",
      config: {
        policies: adminPolicy(),
        description: "Export templates (ADVANCED+)"
      }
    },
    {
      method: "POST",
      path: "/designer/import",
      handler: "emailDesigner.importTemplates",
      config: {
        policies: adminPolicy(),
        description: "Import templates (ADVANCED+)"
      }
    },
    {
      method: "GET",
      path: "/designer/stats",
      handler: "emailDesigner.getStats",
      config: {
        policies: adminPolicy(),
        description: "Get template statistics"
      }
    },
    {
      method: "GET",
      path: "/designer/core/:coreEmailType",
      handler: "emailDesigner.getCoreTemplate",
      config: {
        policies: adminPolicy(),
        description: "Get core email template"
      }
    },
    {
      method: "PUT",
      path: "/designer/core/:coreEmailType",
      handler: "emailDesigner.updateCoreTemplate",
      config: {
        policies: adminPolicy(),
        description: "Update core email template"
      }
    },
    {
      method: "GET",
      path: "/designer/templates/:id/download",
      handler: "emailDesigner.download",
      config: {
        policies: adminPolicy(),
        description: "Download template as HTML or JSON"
      }
    },
    {
      method: "POST",
      path: "/designer/templates/:id/duplicate",
      handler: "emailDesigner.duplicate",
      config: {
        policies: adminPolicy(),
        description: "Duplicate template"
      }
    },
    {
      method: "POST",
      path: "/designer/templates/:id/test-send",
      handler: "emailDesigner.testSend",
      config: {
        policies: adminPolicy(),
        description: "Send test email for template"
      }
    },
    // ─────────────────────── Analytics & Tracking ───────────────────────
    {
      method: "GET",
      path: "/analytics/stats",
      handler: "analytics.getStats",
      config: {
        policies: adminPolicy(),
        description: "Get analytics statistics"
      }
    },
    {
      method: "GET",
      path: "/analytics/emails",
      handler: "analytics.getEmailLogs",
      config: {
        policies: adminPolicy(),
        description: "Get email logs"
      }
    },
    {
      method: "GET",
      path: "/analytics/emails/:emailId",
      handler: "analytics.getEmailDetails",
      config: {
        policies: adminPolicy(),
        description: "Get email details"
      }
    },
    {
      method: "GET",
      path: "/analytics/users/:userId",
      handler: "analytics.getUserActivity",
      config: {
        policies: adminPolicy(),
        description: "Get user email activity"
      }
    },
    {
      method: "GET",
      path: "/analytics/debug",
      handler: "analytics.debug",
      config: {
        policies: adminPolicy(),
        description: "Debug analytics state"
      }
    },
    {
      method: "DELETE",
      path: "/analytics/emails/:emailId",
      handler: "analytics.deleteEmailLog",
      config: {
        policies: adminPolicy(),
        description: "Delete single email log"
      }
    },
    {
      method: "DELETE",
      path: "/analytics/emails",
      handler: "analytics.clearAllEmailLogs",
      config: {
        policies: adminPolicy(),
        description: "Clear all email logs"
      }
    },
    // ─────────────────────── Test (Dev) ───────────────────────
    {
      method: "POST",
      path: "/test/relations",
      handler: "test.testRelations",
      config: {
        policies: adminPolicy(),
        description: "Test template-version relations"
      }
    },
    // ─────────────────────── WhatsApp ───────────────────────
    {
      method: "GET",
      path: "/whatsapp/available",
      handler: "whatsapp.checkAvailable",
      config: {
        policies: adminPolicy(),
        description: "Check if WhatsApp/Baileys is available"
      }
    },
    {
      method: "GET",
      path: "/whatsapp/status",
      handler: "whatsapp.getStatus",
      config: {
        policies: adminPolicy(),
        description: "Get WhatsApp connection status"
      }
    },
    {
      method: "POST",
      path: "/whatsapp/connect",
      handler: "whatsapp.connect",
      config: {
        policies: adminPolicy(),
        description: "Connect to WhatsApp (generates QR if needed)"
      }
    },
    {
      method: "POST",
      path: "/whatsapp/disconnect",
      handler: "whatsapp.disconnect",
      config: {
        policies: adminPolicy(),
        description: "Disconnect from WhatsApp"
      }
    },
    {
      method: "POST",
      path: "/whatsapp/send-test",
      handler: "whatsapp.sendTest",
      config: {
        policies: adminPolicy(),
        description: "Send a test WhatsApp message"
      }
    },
    {
      method: "POST",
      path: "/whatsapp/send-template",
      handler: "whatsapp.sendTemplateMessage",
      config: {
        policies: adminPolicy(),
        description: "Send WhatsApp message using template"
      }
    },
    {
      method: "POST",
      path: "/whatsapp/check-number",
      handler: "whatsapp.checkNumber",
      config: {
        policies: adminPolicy(),
        description: "Check if phone number is on WhatsApp"
      }
    },
    {
      method: "GET",
      path: "/whatsapp/templates",
      handler: "whatsapp.getTemplates",
      config: {
        policies: adminPolicy(),
        description: "Get all WhatsApp message templates"
      }
    },
    {
      method: "POST",
      path: "/whatsapp/templates",
      handler: "whatsapp.saveTemplate",
      config: {
        policies: adminPolicy(),
        description: "Save a WhatsApp message template"
      }
    },
    {
      method: "DELETE",
      path: "/whatsapp/templates/:templateName",
      handler: "whatsapp.deleteTemplate",
      config: {
        policies: adminPolicy(),
        description: "Delete a WhatsApp message template"
      }
    },
    {
      method: "GET",
      path: "/whatsapp/session",
      handler: "whatsapp.getSession",
      config: {
        policies: adminPolicy(),
        description: "Get WhatsApp session info"
      }
    },
    // ─────────────────────── Plugin Settings ───────────────────────
    {
      method: "GET",
      path: "/settings",
      handler: "pluginSettings.getSettings",
      config: {
        policies: adminPolicy(),
        description: "Get plugin settings"
      }
    },
    {
      method: "PUT",
      path: "/settings",
      handler: "pluginSettings.updateSettings",
      config: {
        policies: adminPolicy(),
        description: "Update plugin settings"
      }
    }
  ]
};
const sendRateLimit = [
  { name: "plugin::magic-mail.rate-limit", config: { max: 60, window: 6e4 } }
];
const trackRateLimit = [
  { name: "plugin::magic-mail.rate-limit", config: { max: 300, window: 6e4 } }
];
var contentApi$1 = {
  type: "content-api",
  routes: [
    // ============= EMAIL ROUTES =============
    {
      method: "POST",
      path: "/send",
      handler: "controller.send",
      config: {
        middlewares: sendRateLimit,
        description: "Send email via MagicMail router (requires API token)"
      }
    },
    // ============= UNIFIED MESSAGE ROUTE =============
    {
      method: "POST",
      path: "/send-message",
      handler: "controller.sendMessage",
      config: {
        middlewares: sendRateLimit,
        description: "Send message via Email or WhatsApp (requires API token)"
      }
    },
    // ============= WHATSAPP ROUTES =============
    {
      method: "POST",
      path: "/send-whatsapp",
      handler: "controller.sendWhatsApp",
      config: {
        middlewares: sendRateLimit,
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
        middlewares: [
          { name: "plugin::magic-mail.rate-limit", config: { max: 30, window: 6e4 } }
        ],
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
        middlewares: trackRateLimit,
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
        middlewares: trackRateLimit,
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
const buckets = /* @__PURE__ */ new Map();
const prune = (now) => {
  for (const [key, entry] of buckets) {
    if (entry.expiresAt <= now) buckets.delete(key);
  }
};
const callerKey = (ctx) => {
  const userId = ctx.state?.user?.id;
  if (userId) return `u:${userId}`;
  const tokenId = ctx.state?.auth?.credentials?.id ?? ctx.state?.auth?.credentials?.token ?? null;
  if (tokenId) return `t:${String(tokenId).slice(-16)}`;
  return `ip:${ctx.request.ip || ctx.ip || "unknown"}`;
};
const rateLimit$1 = (cfg = {}, { strapi: strapi2 }) => {
  const max = Number.isFinite(cfg.max) ? cfg.max : 60;
  const windowMs = Number.isFinite(cfg.window) ? cfg.window : 6e4;
  return async (ctx, next) => {
    const key = `${ctx.path}::${callerKey(ctx)}`;
    const now = Date.now();
    if (buckets.size > 5e3) prune(now);
    let entry = buckets.get(key);
    if (!entry || entry.expiresAt <= now) {
      entry = { count: 0, expiresAt: now + windowMs };
      buckets.set(key, entry);
    }
    entry.count += 1;
    if (entry.count > max) {
      const retryAfterSec = Math.ceil((entry.expiresAt - now) / 1e3);
      ctx.set("Retry-After", String(retryAfterSec));
      strapi2.log.warn(
        `[magic-mail] Rate limit exceeded on ${ctx.path} for ${callerKey(ctx)} (${entry.count}/${max})`
      );
      ctx.status = 429;
      ctx.body = {
        data: null,
        error: {
          status: 429,
          name: "TooManyRequestsError",
          message: "Too many requests. Please slow down.",
          details: { retryAfter: retryAfterSec }
        }
      };
      return;
    }
    await next();
  };
};
var rateLimit_1 = rateLimit$1;
const rateLimit = rateLimit_1;
var middlewares$1 = {
  "rate-limit": rateLimit
};
var policies$1 = {};
var lib$5 = {};
var Parser = {};
var Tokenizer = {};
var decode$1 = {};
var decodeDataHtml = {};
var hasRequiredDecodeDataHtml;
function requireDecodeDataHtml() {
  if (hasRequiredDecodeDataHtml) return decodeDataHtml;
  hasRequiredDecodeDataHtml = 1;
  Object.defineProperty(decodeDataHtml, "__esModule", { value: true });
  decodeDataHtml.default = new Uint16Array(
    // prettier-ignore
    'ᵁ<Õıʊҝջאٵ۞ޢߖࠏ੊ઑඡ๭༉༦჊ረዡᐕᒝᓃᓟᔥ\0\0\0\0\0\0ᕫᛍᦍᰒᷝ὾⁠↰⊍⏀⏻⑂⠤⤒ⴈ⹈⿎〖㊺㘹㞬㣾㨨㩱㫠㬮ࠀEMabcfglmnoprstu\\bfms¦³¹ÈÏlig耻Æ䃆P耻&䀦cute耻Á䃁reve;䄂Āiyx}rc耻Â䃂;䐐r;쀀𝔄rave耻À䃀pha;䎑acr;䄀d;橓Āgp¡on;䄄f;쀀𝔸plyFunction;恡ing耻Å䃅Ācs¾Ãr;쀀𝒜ign;扔ilde耻Ã䃃ml耻Ä䃄ЀaceforsuåûþėĜĢħĪĀcrêòkslash;或Ŷöø;櫧ed;挆y;䐑ƀcrtąċĔause;戵noullis;愬a;䎒r;쀀𝔅pf;쀀𝔹eve;䋘còēmpeq;扎܀HOacdefhilorsuōőŖƀƞƢƵƷƺǜȕɳɸɾcy;䐧PY耻©䂩ƀcpyŝŢźute;䄆Ā;iŧŨ拒talDifferentialD;慅leys;愭ȀaeioƉƎƔƘron;䄌dil耻Ç䃇rc;䄈nint;戰ot;䄊ĀdnƧƭilla;䂸terDot;䂷òſi;䎧rcleȀDMPTǇǋǑǖot;抙inus;抖lus;投imes;抗oĀcsǢǸkwiseContourIntegral;戲eCurlyĀDQȃȏoubleQuote;思uote;怙ȀlnpuȞȨɇɕonĀ;eȥȦ户;橴ƀgitȯȶȺruent;扡nt;戯ourIntegral;戮ĀfrɌɎ;愂oduct;成nterClockwiseContourIntegral;戳oss;樯cr;쀀𝒞pĀ;Cʄʅ拓ap;才րDJSZacefiosʠʬʰʴʸˋ˗ˡ˦̳ҍĀ;oŹʥtrahd;椑cy;䐂cy;䐅cy;䐏ƀgrsʿ˄ˇger;怡r;憡hv;櫤Āayː˕ron;䄎;䐔lĀ;t˝˞戇a;䎔r;쀀𝔇Āaf˫̧Ācm˰̢riticalȀADGT̖̜̀̆cute;䂴oŴ̋̍;䋙bleAcute;䋝rave;䁠ilde;䋜ond;拄ferentialD;慆Ѱ̽\0\0\0͔͂\0Ѕf;쀀𝔻ƀ;DE͈͉͍䂨ot;惜qual;扐blèCDLRUVͣͲ΂ϏϢϸontourIntegraìȹoɴ͹\0\0ͻ»͉nArrow;懓Āeo·ΤftƀARTΐΖΡrrow;懐ightArrow;懔eåˊngĀLRΫτeftĀARγιrrow;柸ightArrow;柺ightArrow;柹ightĀATϘϞrrow;懒ee;抨pɁϩ\0\0ϯrrow;懑ownArrow;懕erticalBar;戥ǹABLRTaВЪаўѿͼrrowƀ;BUНОТ憓ar;椓pArrow;懵reve;䌑eft˒к\0ц\0ѐightVector;楐eeVector;楞ectorĀ;Bљњ憽ar;楖ightǔѧ\0ѱeeVector;楟ectorĀ;BѺѻ懁ar;楗eeĀ;A҆҇护rrow;憧ĀctҒҗr;쀀𝒟rok;䄐ࠀNTacdfglmopqstuxҽӀӄӋӞӢӧӮӵԡԯԶՒ՝ՠեG;䅊H耻Ð䃐cute耻É䃉ƀaiyӒӗӜron;䄚rc耻Ê䃊;䐭ot;䄖r;쀀𝔈rave耻È䃈ement;戈ĀapӺӾcr;䄒tyɓԆ\0\0ԒmallSquare;旻erySmallSquare;斫ĀgpԦԪon;䄘f;쀀𝔼silon;䎕uĀaiԼՉlĀ;TՂՃ橵ilde;扂librium;懌Āci՗՚r;愰m;橳a;䎗ml耻Ë䃋Āipժկsts;戃onentialE;慇ʀcfiosօֈ֍ֲ׌y;䐤r;쀀𝔉lledɓ֗\0\0֣mallSquare;旼erySmallSquare;斪Ͱֺ\0ֿ\0\0ׄf;쀀𝔽All;戀riertrf;愱cò׋؀JTabcdfgorstר׬ׯ׺؀ؒؖ؛؝أ٬ٲcy;䐃耻>䀾mmaĀ;d׷׸䎓;䏜reve;䄞ƀeiy؇،ؐdil;䄢rc;䄜;䐓ot;䄠r;쀀𝔊;拙pf;쀀𝔾eater̀EFGLSTصلَٖٛ٦qualĀ;Lؾؿ扥ess;招ullEqual;执reater;檢ess;扷lantEqual;橾ilde;扳cr;쀀𝒢;扫ЀAacfiosuڅڋږڛڞڪھۊRDcy;䐪Āctڐڔek;䋇;䁞irc;䄤r;愌lbertSpace;愋ǰگ\0ڲf;愍izontalLine;攀Āctۃۅòکrok;䄦mpńېۘownHumðįqual;扏܀EJOacdfgmnostuۺ۾܃܇܎ܚܞܡܨ݄ݸދޏޕcy;䐕lig;䄲cy;䐁cute耻Í䃍Āiyܓܘrc耻Î䃎;䐘ot;䄰r;愑rave耻Ì䃌ƀ;apܠܯܿĀcgܴܷr;䄪inaryI;慈lieóϝǴ݉\0ݢĀ;eݍݎ戬Āgrݓݘral;戫section;拂isibleĀCTݬݲomma;恣imes;恢ƀgptݿރވon;䄮f;쀀𝕀a;䎙cr;愐ilde;䄨ǫޚ\0ޞcy;䐆l耻Ï䃏ʀcfosuެ޷޼߂ߐĀiyޱ޵rc;䄴;䐙r;쀀𝔍pf;쀀𝕁ǣ߇\0ߌr;쀀𝒥rcy;䐈kcy;䐄΀HJacfosߤߨ߽߬߱ࠂࠈcy;䐥cy;䐌ppa;䎚Āey߶߻dil;䄶;䐚r;쀀𝔎pf;쀀𝕂cr;쀀𝒦րJTaceflmostࠥࠩࠬࡐࡣ঳সে্਷ੇcy;䐉耻<䀼ʀcmnpr࠷࠼ࡁࡄࡍute;䄹bda;䎛g;柪lacetrf;愒r;憞ƀaeyࡗ࡜ࡡron;䄽dil;䄻;䐛Āfsࡨ॰tԀACDFRTUVarࡾࢩࢱࣦ࣠ࣼयज़ΐ४Ānrࢃ࢏gleBracket;柨rowƀ;BR࢙࢚࢞憐ar;懤ightArrow;懆eiling;挈oǵࢷ\0ࣃbleBracket;柦nǔࣈ\0࣒eeVector;楡ectorĀ;Bࣛࣜ懃ar;楙loor;挊ightĀAV࣯ࣵrrow;憔ector;楎Āerँगeƀ;AVउऊऐ抣rrow;憤ector;楚iangleƀ;BEतथऩ抲ar;槏qual;抴pƀDTVषूौownVector;楑eeVector;楠ectorĀ;Bॖॗ憿ar;楘ectorĀ;B॥०憼ar;楒ightáΜs̀EFGLSTॾঋকঝঢভqualGreater;拚ullEqual;扦reater;扶ess;檡lantEqual;橽ilde;扲r;쀀𝔏Ā;eঽা拘ftarrow;懚idot;䄿ƀnpw৔ਖਛgȀLRlr৞৷ਂਐeftĀAR০৬rrow;柵ightArrow;柷ightArrow;柶eftĀarγਊightáοightáϊf;쀀𝕃erĀLRਢਬeftArrow;憙ightArrow;憘ƀchtਾੀੂòࡌ;憰rok;䅁;扪Ѐacefiosuਗ਼੝੠੷੼અઋ઎p;椅y;䐜Ādl੥੯iumSpace;恟lintrf;愳r;쀀𝔐nusPlus;戓pf;쀀𝕄cò੶;䎜ҀJacefostuણધભીଔଙඑ඗ඞcy;䐊cute;䅃ƀaey઴હાron;䅇dil;䅅;䐝ƀgswે૰଎ativeƀMTV૓૟૨ediumSpace;怋hiĀcn૦૘ë૙eryThiî૙tedĀGL૸ଆreaterGreateòٳessLesóੈLine;䀊r;쀀𝔑ȀBnptଢନଷ଺reak;恠BreakingSpace;䂠f;愕ڀ;CDEGHLNPRSTV୕ୖ୪୼஡௫ఄ౞಄ದ೘ൡඅ櫬Āou୛୤ngruent;扢pCap;扭oubleVerticalBar;戦ƀlqxஃஊ஛ement;戉ualĀ;Tஒஓ扠ilde;쀀≂̸ists;戄reater΀;EFGLSTஶஷ஽௉௓௘௥扯qual;扱ullEqual;쀀≧̸reater;쀀≫̸ess;批lantEqual;쀀⩾̸ilde;扵umpń௲௽ownHump;쀀≎̸qual;쀀≏̸eĀfsఊధtTriangleƀ;BEచఛడ拪ar;쀀⧏̸qual;括s̀;EGLSTవశ఼ౄోౘ扮qual;扰reater;扸ess;쀀≪̸lantEqual;쀀⩽̸ilde;扴estedĀGL౨౹reaterGreater;쀀⪢̸essLess;쀀⪡̸recedesƀ;ESಒಓಛ技qual;쀀⪯̸lantEqual;拠ĀeiಫಹverseElement;戌ghtTriangleƀ;BEೋೌ೒拫ar;쀀⧐̸qual;拭ĀquೝഌuareSuĀbp೨೹setĀ;E೰ೳ쀀⊏̸qual;拢ersetĀ;Eഃആ쀀⊐̸qual;拣ƀbcpഓതൎsetĀ;Eഛഞ쀀⊂⃒qual;抈ceedsȀ;ESTലള഻െ抁qual;쀀⪰̸lantEqual;拡ilde;쀀≿̸ersetĀ;E൘൛쀀⊃⃒qual;抉ildeȀ;EFT൮൯൵ൿ扁qual;扄ullEqual;扇ilde;扉erticalBar;戤cr;쀀𝒩ilde耻Ñ䃑;䎝܀Eacdfgmoprstuvලෂ෉෕ෛ෠෧෼ขภยา฿ไlig;䅒cute耻Ó䃓Āiy෎ීrc耻Ô䃔;䐞blac;䅐r;쀀𝔒rave耻Ò䃒ƀaei෮ෲ෶cr;䅌ga;䎩cron;䎟pf;쀀𝕆enCurlyĀDQฎบoubleQuote;怜uote;怘;橔Āclวฬr;쀀𝒪ash耻Ø䃘iŬื฼de耻Õ䃕es;樷ml耻Ö䃖erĀBP๋๠Āar๐๓r;怾acĀek๚๜;揞et;掴arenthesis;揜Ҁacfhilors๿ງຊຏຒດຝະ໼rtialD;戂y;䐟r;쀀𝔓i;䎦;䎠usMinus;䂱Āipຢອncareplanåڝf;愙Ȁ;eio຺ູ໠໤檻cedesȀ;EST່້໏໚扺qual;檯lantEqual;扼ilde;找me;怳Ādp໩໮uct;戏ortionĀ;aȥ໹l;戝Āci༁༆r;쀀𝒫;䎨ȀUfos༑༖༛༟OT耻"䀢r;쀀𝔔pf;愚cr;쀀𝒬؀BEacefhiorsu༾གྷཇའཱིྦྷྪྭ႖ႩႴႾarr;椐G耻®䂮ƀcnrཎནབute;䅔g;柫rĀ;tཛྷཝ憠l;椖ƀaeyཧཬཱron;䅘dil;䅖;䐠Ā;vླྀཹ愜erseĀEUྂྙĀlq྇ྎement;戋uilibrium;懋pEquilibrium;楯r»ཹo;䎡ghtЀACDFTUVa࿁࿫࿳ဢဨၛႇϘĀnr࿆࿒gleBracket;柩rowƀ;BL࿜࿝࿡憒ar;懥eftArrow;懄eiling;按oǵ࿹\0စbleBracket;柧nǔည\0နeeVector;楝ectorĀ;Bဝသ懂ar;楕loor;挋Āerိ၃eƀ;AVဵံြ抢rrow;憦ector;楛iangleƀ;BEၐၑၕ抳ar;槐qual;抵pƀDTVၣၮၸownVector;楏eeVector;楜ectorĀ;Bႂႃ憾ar;楔ectorĀ;B႑႒懀ar;楓Āpuႛ႞f;愝ndImplies;楰ightarrow;懛ĀchႹႼr;愛;憱leDelayed;槴ڀHOacfhimoqstuფჱჷჽᄙᄞᅑᅖᅡᅧᆵᆻᆿĀCcჩხHcy;䐩y;䐨FTcy;䐬cute;䅚ʀ;aeiyᄈᄉᄎᄓᄗ檼ron;䅠dil;䅞rc;䅜;䐡r;쀀𝔖ortȀDLRUᄪᄴᄾᅉownArrow»ОeftArrow»࢚ightArrow»࿝pArrow;憑gma;䎣allCircle;战pf;쀀𝕊ɲᅭ\0\0ᅰt;戚areȀ;ISUᅻᅼᆉᆯ斡ntersection;抓uĀbpᆏᆞsetĀ;Eᆗᆘ抏qual;抑ersetĀ;Eᆨᆩ抐qual;抒nion;抔cr;쀀𝒮ar;拆ȀbcmpᇈᇛሉላĀ;sᇍᇎ拐etĀ;Eᇍᇕqual;抆ĀchᇠህeedsȀ;ESTᇭᇮᇴᇿ扻qual;檰lantEqual;扽ilde;承Tháྌ;我ƀ;esሒሓሣ拑rsetĀ;Eሜም抃qual;抇et»ሓրHRSacfhiorsሾቄ቉ቕ቞ቱቶኟዂወዑORN耻Þ䃞ADE;愢ĀHc቎ቒcy;䐋y;䐦Ābuቚቜ;䀉;䎤ƀaeyብቪቯron;䅤dil;䅢;䐢r;쀀𝔗Āeiቻ኉ǲኀ\0ኇefore;戴a;䎘Ācn኎ኘkSpace;쀀  Space;怉ldeȀ;EFTካኬኲኼ戼qual;扃ullEqual;扅ilde;扈pf;쀀𝕋ipleDot;惛Āctዖዛr;쀀𝒯rok;䅦ૡዷጎጚጦ\0ጬጱ\0\0\0\0\0ጸጽ፷ᎅ\0᏿ᐄᐊᐐĀcrዻጁute耻Ú䃚rĀ;oጇገ憟cir;楉rǣጓ\0጖y;䐎ve;䅬Āiyጞጣrc耻Û䃛;䐣blac;䅰r;쀀𝔘rave耻Ù䃙acr;䅪Ādiፁ፩erĀBPፈ፝Āarፍፐr;䁟acĀekፗፙ;揟et;掵arenthesis;揝onĀ;P፰፱拃lus;抎Āgp፻፿on;䅲f;쀀𝕌ЀADETadps᎕ᎮᎸᏄϨᏒᏗᏳrrowƀ;BDᅐᎠᎤar;椒ownArrow;懅ownArrow;憕quilibrium;楮eeĀ;AᏋᏌ报rrow;憥ownáϳerĀLRᏞᏨeftArrow;憖ightArrow;憗iĀ;lᏹᏺ䏒on;䎥ing;䅮cr;쀀𝒰ilde;䅨ml耻Ü䃜ҀDbcdefosvᐧᐬᐰᐳᐾᒅᒊᒐᒖash;披ar;櫫y;䐒ashĀ;lᐻᐼ抩;櫦Āerᑃᑅ;拁ƀbtyᑌᑐᑺar;怖Ā;iᑏᑕcalȀBLSTᑡᑥᑪᑴar;戣ine;䁼eparator;杘ilde;所ThinSpace;怊r;쀀𝔙pf;쀀𝕍cr;쀀𝒱dash;抪ʀcefosᒧᒬᒱᒶᒼirc;䅴dge;拀r;쀀𝔚pf;쀀𝕎cr;쀀𝒲Ȁfiosᓋᓐᓒᓘr;쀀𝔛;䎞pf;쀀𝕏cr;쀀𝒳ҀAIUacfosuᓱᓵᓹᓽᔄᔏᔔᔚᔠcy;䐯cy;䐇cy;䐮cute耻Ý䃝Āiyᔉᔍrc;䅶;䐫r;쀀𝔜pf;쀀𝕐cr;쀀𝒴ml;䅸ЀHacdefosᔵᔹᔿᕋᕏᕝᕠᕤcy;䐖cute;䅹Āayᕄᕉron;䅽;䐗ot;䅻ǲᕔ\0ᕛoWidtè૙a;䎖r;愨pf;愤cr;쀀𝒵௡ᖃᖊᖐ\0ᖰᖶᖿ\0\0\0\0ᗆᗛᗫᙟ᙭\0ᚕ᚛ᚲᚹ\0ᚾcute耻á䃡reve;䄃̀;Ediuyᖜᖝᖡᖣᖨᖭ戾;쀀∾̳;房rc耻â䃢te肻´̆;䐰lig耻æ䃦Ā;r²ᖺ;쀀𝔞rave耻à䃠ĀepᗊᗖĀfpᗏᗔsym;愵èᗓha;䎱ĀapᗟcĀclᗤᗧr;䄁g;樿ɤᗰ\0\0ᘊʀ;adsvᗺᗻᗿᘁᘇ戧nd;橕;橜lope;橘;橚΀;elmrszᘘᘙᘛᘞᘿᙏᙙ戠;榤e»ᘙsdĀ;aᘥᘦ戡ѡᘰᘲᘴᘶᘸᘺᘼᘾ;榨;榩;榪;榫;榬;榭;榮;榯tĀ;vᙅᙆ戟bĀ;dᙌᙍ抾;榝Āptᙔᙗh;戢»¹arr;捼Āgpᙣᙧon;䄅f;쀀𝕒΀;Eaeiop዁ᙻᙽᚂᚄᚇᚊ;橰cir;橯;扊d;手s;䀧roxĀ;e዁ᚒñᚃing耻å䃥ƀctyᚡᚦᚨr;쀀𝒶;䀪mpĀ;e዁ᚯñʈilde耻ã䃣ml耻ä䃤Āciᛂᛈoninôɲnt;樑ࠀNabcdefiklnoprsu᛭ᛱᜰ᜼ᝃᝈ᝸᝽០៦ᠹᡐᜍ᤽᥈ᥰot;櫭Ācrᛶ᜞kȀcepsᜀᜅᜍᜓong;扌psilon;䏶rime;怵imĀ;e᜚᜛戽q;拍Ŷᜢᜦee;抽edĀ;gᜬᜭ挅e»ᜭrkĀ;t፜᜷brk;掶Āoyᜁᝁ;䐱quo;怞ʀcmprtᝓ᝛ᝡᝤᝨausĀ;eĊĉptyv;榰séᜌnoõēƀahwᝯ᝱ᝳ;䎲;愶een;扬r;쀀𝔟g΀costuvwឍឝឳេ៕៛៞ƀaiuបពរðݠrc;旯p»፱ƀdptឤឨឭot;樀lus;樁imes;樂ɱឹ\0\0ើcup;樆ar;昅riangleĀdu៍្own;施p;斳plus;樄eåᑄåᒭarow;植ƀako៭ᠦᠵĀcn៲ᠣkƀlst៺֫᠂ozenge;槫riangleȀ;dlr᠒᠓᠘᠝斴own;斾eft;旂ight;斸k;搣Ʊᠫ\0ᠳƲᠯ\0ᠱ;斒;斑4;斓ck;斈ĀeoᠾᡍĀ;qᡃᡆ쀀=⃥uiv;쀀≡⃥t;挐Ȁptwxᡙᡞᡧᡬf;쀀𝕓Ā;tᏋᡣom»Ꮜtie;拈؀DHUVbdhmptuvᢅᢖᢪᢻᣗᣛᣬ᣿ᤅᤊᤐᤡȀLRlrᢎᢐᢒᢔ;敗;敔;敖;敓ʀ;DUduᢡᢢᢤᢦᢨ敐;敦;敩;敤;敧ȀLRlrᢳᢵᢷᢹ;敝;敚;敜;教΀;HLRhlrᣊᣋᣍᣏᣑᣓᣕ救;敬;散;敠;敫;敢;敟ox;槉ȀLRlrᣤᣦᣨᣪ;敕;敒;攐;攌ʀ;DUduڽ᣷᣹᣻᣽;敥;敨;攬;攴inus;抟lus;択imes;抠ȀLRlrᤙᤛᤝ᤟;敛;敘;攘;攔΀;HLRhlrᤰᤱᤳᤵᤷ᤻᤹攂;敪;敡;敞;攼;攤;攜Āevģ᥂bar耻¦䂦Ȁceioᥑᥖᥚᥠr;쀀𝒷mi;恏mĀ;e᜚᜜lƀ;bhᥨᥩᥫ䁜;槅sub;柈Ŭᥴ᥾lĀ;e᥹᥺怢t»᥺pƀ;Eeįᦅᦇ;檮Ā;qۜۛೡᦧ\0᧨ᨑᨕᨲ\0ᨷᩐ\0\0᪴\0\0᫁\0\0ᬡᬮ᭍᭒\0᯽\0ᰌƀcpr᦭ᦲ᧝ute;䄇̀;abcdsᦿᧀᧄ᧊᧕᧙戩nd;橄rcup;橉Āau᧏᧒p;橋p;橇ot;橀;쀀∩︀Āeo᧢᧥t;恁îړȀaeiu᧰᧻ᨁᨅǰ᧵\0᧸s;橍on;䄍dil耻ç䃧rc;䄉psĀ;sᨌᨍ橌m;橐ot;䄋ƀdmnᨛᨠᨦil肻¸ƭptyv;榲t脀¢;eᨭᨮ䂢räƲr;쀀𝔠ƀceiᨽᩀᩍy;䑇ckĀ;mᩇᩈ朓ark»ᩈ;䏇r΀;Ecefms᩟᩠ᩢᩫ᪤᪪᪮旋;槃ƀ;elᩩᩪᩭ䋆q;扗eɡᩴ\0\0᪈rrowĀlr᩼᪁eft;憺ight;憻ʀRSacd᪒᪔᪖᪚᪟»ཇ;擈st;抛irc;抚ash;抝nint;樐id;櫯cir;槂ubsĀ;u᪻᪼晣it»᪼ˬ᫇᫔᫺\0ᬊonĀ;eᫍᫎ䀺Ā;qÇÆɭ᫙\0\0᫢aĀ;t᫞᫟䀬;䁀ƀ;fl᫨᫩᫫戁îᅠeĀmx᫱᫶ent»᫩eóɍǧ᫾\0ᬇĀ;dኻᬂot;橭nôɆƀfryᬐᬔᬗ;쀀𝕔oäɔ脀©;sŕᬝr;愗Āaoᬥᬩrr;憵ss;朗Ācuᬲᬷr;쀀𝒸Ābpᬼ᭄Ā;eᭁᭂ櫏;櫑Ā;eᭉᭊ櫐;櫒dot;拯΀delprvw᭠᭬᭷ᮂᮬᯔ᯹arrĀlr᭨᭪;椸;椵ɰ᭲\0\0᭵r;拞c;拟arrĀ;p᭿ᮀ憶;椽̀;bcdosᮏᮐᮖᮡᮥᮨ截rcap;橈Āauᮛᮞp;橆p;橊ot;抍r;橅;쀀∪︀Ȁalrv᮵ᮿᯞᯣrrĀ;mᮼᮽ憷;椼yƀevwᯇᯔᯘqɰᯎ\0\0ᯒreã᭳uã᭵ee;拎edge;拏en耻¤䂤earrowĀlrᯮ᯳eft»ᮀight»ᮽeäᯝĀciᰁᰇoninôǷnt;戱lcty;挭ঀAHabcdefhijlorstuwz᰸᰻᰿ᱝᱩᱵᲊᲞᲬᲷ᳻᳿ᴍᵻᶑᶫᶻ᷆᷍rò΁ar;楥Ȁglrs᱈ᱍ᱒᱔ger;怠eth;愸òᄳhĀ;vᱚᱛ怐»ऊūᱡᱧarow;椏aã̕Āayᱮᱳron;䄏;䐴ƀ;ao̲ᱼᲄĀgrʿᲁr;懊tseq;橷ƀglmᲑᲔᲘ耻°䂰ta;䎴ptyv;榱ĀirᲣᲨsht;楿;쀀𝔡arĀlrᲳᲵ»ࣜ»သʀaegsv᳂͸᳖᳜᳠mƀ;oș᳊᳔ndĀ;ș᳑uit;晦amma;䏝in;拲ƀ;io᳧᳨᳸䃷de脀÷;o᳧ᳰntimes;拇nø᳷cy;䑒cɯᴆ\0\0ᴊrn;挞op;挍ʀlptuwᴘᴝᴢᵉᵕlar;䀤f;쀀𝕕ʀ;emps̋ᴭᴷᴽᵂqĀ;d͒ᴳot;扑inus;戸lus;戔quare;抡blebarwedgåúnƀadhᄮᵝᵧownarrowóᲃarpoonĀlrᵲᵶefôᲴighôᲶŢᵿᶅkaro÷གɯᶊ\0\0ᶎrn;挟op;挌ƀcotᶘᶣᶦĀryᶝᶡ;쀀𝒹;䑕l;槶rok;䄑Ādrᶰᶴot;拱iĀ;fᶺ᠖斿Āah᷀᷃ròЩaòྦangle;榦Āci᷒ᷕy;䑟grarr;柿ऀDacdefglmnopqrstuxḁḉḙḸոḼṉṡṾấắẽỡἪἷὄ὎὚ĀDoḆᴴoôᲉĀcsḎḔute耻é䃩ter;橮ȀaioyḢḧḱḶron;䄛rĀ;cḭḮ扖耻ê䃪lon;払;䑍ot;䄗ĀDrṁṅot;扒;쀀𝔢ƀ;rsṐṑṗ檚ave耻è䃨Ā;dṜṝ檖ot;檘Ȁ;ilsṪṫṲṴ檙nters;揧;愓Ā;dṹṺ檕ot;檗ƀapsẅẉẗcr;䄓tyƀ;svẒẓẕ戅et»ẓpĀ1;ẝẤĳạả;怄;怅怃ĀgsẪẬ;䅋p;怂ĀgpẴẸon;䄙f;쀀𝕖ƀalsỄỎỒrĀ;sỊị拕l;槣us;橱iƀ;lvỚớở䎵on»ớ;䏵ȀcsuvỪỳἋἣĀioữḱrc»Ḯɩỹ\0\0ỻíՈantĀglἂἆtr»ṝess»Ṻƀaeiἒ἖Ἒls;䀽st;扟vĀ;DȵἠD;橸parsl;槥ĀDaἯἳot;打rr;楱ƀcdiἾὁỸr;愯oô͒ĀahὉὋ;䎷耻ð䃰Āmrὓὗl耻ë䃫o;悬ƀcipὡὤὧl;䀡sôծĀeoὬὴctatioîՙnentialåչৡᾒ\0ᾞ\0ᾡᾧ\0\0ῆῌ\0ΐ\0ῦῪ \0 ⁚llingdotseñṄy;䑄male;晀ƀilrᾭᾳ῁lig;耀ﬃɩᾹ\0\0᾽g;耀ﬀig;耀ﬄ;쀀𝔣lig;耀ﬁlig;쀀fjƀaltῙ῜ῡt;晭ig;耀ﬂns;斱of;䆒ǰ΅\0ῳf;쀀𝕗ĀakֿῷĀ;vῼ´拔;櫙artint;樍Āao‌⁕Ācs‑⁒α‚‰‸⁅⁈\0⁐β•‥‧‪‬\0‮耻½䂽;慓耻¼䂼;慕;慙;慛Ƴ‴\0‶;慔;慖ʴ‾⁁\0\0⁃耻¾䂾;慗;慜5;慘ƶ⁌\0⁎;慚;慝8;慞l;恄wn;挢cr;쀀𝒻ࢀEabcdefgijlnorstv₂₉₟₥₰₴⃰⃵⃺⃿℃ℒℸ̗ℾ⅒↞Ā;lٍ₇;檌ƀcmpₐₕ₝ute;䇵maĀ;dₜ᳚䎳;檆reve;䄟Āiy₪₮rc;䄝;䐳ot;䄡Ȁ;lqsؾق₽⃉ƀ;qsؾٌ⃄lanô٥Ȁ;cdl٥⃒⃥⃕c;檩otĀ;o⃜⃝檀Ā;l⃢⃣檂;檄Ā;e⃪⃭쀀⋛︀s;檔r;쀀𝔤Ā;gٳ؛mel;愷cy;䑓Ȁ;Eajٚℌℎℐ;檒;檥;檤ȀEaesℛℝ℩ℴ;扩pĀ;p℣ℤ檊rox»ℤĀ;q℮ℯ檈Ā;q℮ℛim;拧pf;쀀𝕘Āci⅃ⅆr;愊mƀ;el٫ⅎ⅐;檎;檐茀>;cdlqr׮ⅠⅪⅮⅳⅹĀciⅥⅧ;檧r;橺ot;拗Par;榕uest;橼ʀadelsↄⅪ←ٖ↛ǰ↉\0↎proø₞r;楸qĀlqؿ↖lesó₈ií٫Āen↣↭rtneqq;쀀≩︀Å↪ԀAabcefkosy⇄⇇⇱⇵⇺∘∝∯≨≽ròΠȀilmr⇐⇔⇗⇛rsðᒄf»․ilôکĀdr⇠⇤cy;䑊ƀ;cwࣴ⇫⇯ir;楈;憭ar;意irc;䄥ƀalr∁∎∓rtsĀ;u∉∊晥it»∊lip;怦con;抹r;쀀𝔥sĀew∣∩arow;椥arow;椦ʀamopr∺∾≃≞≣rr;懿tht;戻kĀlr≉≓eftarrow;憩ightarrow;憪f;쀀𝕙bar;怕ƀclt≯≴≸r;쀀𝒽asè⇴rok;䄧Ābp⊂⊇ull;恃hen»ᱛૡ⊣\0⊪\0⊸⋅⋎\0⋕⋳\0\0⋸⌢⍧⍢⍿\0⎆⎪⎴cute耻í䃭ƀ;iyݱ⊰⊵rc耻î䃮;䐸Ācx⊼⊿y;䐵cl耻¡䂡ĀfrΟ⋉;쀀𝔦rave耻ì䃬Ȁ;inoܾ⋝⋩⋮Āin⋢⋦nt;樌t;戭fin;槜ta;愩lig;䄳ƀaop⋾⌚⌝ƀcgt⌅⌈⌗r;䄫ƀelpܟ⌏⌓inåގarôܠh;䄱f;抷ed;䆵ʀ;cfotӴ⌬⌱⌽⍁are;愅inĀ;t⌸⌹戞ie;槝doô⌙ʀ;celpݗ⍌⍐⍛⍡al;抺Āgr⍕⍙eróᕣã⍍arhk;樗rod;樼Ȁcgpt⍯⍲⍶⍻y;䑑on;䄯f;쀀𝕚a;䎹uest耻¿䂿Āci⎊⎏r;쀀𝒾nʀ;EdsvӴ⎛⎝⎡ӳ;拹ot;拵Ā;v⎦⎧拴;拳Ā;iݷ⎮lde;䄩ǫ⎸\0⎼cy;䑖l耻ï䃯̀cfmosu⏌⏗⏜⏡⏧⏵Āiy⏑⏕rc;䄵;䐹r;쀀𝔧ath;䈷pf;쀀𝕛ǣ⏬\0⏱r;쀀𝒿rcy;䑘kcy;䑔Ѐacfghjos␋␖␢␧␭␱␵␻ppaĀ;v␓␔䎺;䏰Āey␛␠dil;䄷;䐺r;쀀𝔨reen;䄸cy;䑅cy;䑜pf;쀀𝕜cr;쀀𝓀஀ABEHabcdefghjlmnoprstuv⑰⒁⒆⒍⒑┎┽╚▀♎♞♥♹♽⚚⚲⛘❝❨➋⟀⠁⠒ƀart⑷⑺⑼rò৆òΕail;椛arr;椎Ā;gঔ⒋;檋ar;楢ॣ⒥\0⒪\0⒱\0\0\0\0\0⒵Ⓔ\0ⓆⓈⓍ\0⓹ute;䄺mptyv;榴raîࡌbda;䎻gƀ;dlࢎⓁⓃ;榑åࢎ;檅uo耻«䂫rЀ;bfhlpst࢙ⓞⓦⓩ⓫⓮⓱⓵Ā;f࢝ⓣs;椟s;椝ë≒p;憫l;椹im;楳l;憢ƀ;ae⓿─┄檫il;椙Ā;s┉┊檭;쀀⪭︀ƀabr┕┙┝rr;椌rk;杲Āak┢┬cĀek┨┪;䁻;䁛Āes┱┳;榋lĀdu┹┻;榏;榍Ȁaeuy╆╋╖╘ron;䄾Ādi═╔il;䄼ìࢰâ┩;䐻Ȁcqrs╣╦╭╽a;椶uoĀ;rนᝆĀdu╲╷har;楧shar;楋h;憲ʀ;fgqs▋▌উ◳◿扤tʀahlrt▘▤▷◂◨rrowĀ;t࢙□aé⓶arpoonĀdu▯▴own»њp»०eftarrows;懇ightƀahs◍◖◞rrowĀ;sࣴࢧarpoonó྘quigarro÷⇰hreetimes;拋ƀ;qs▋ও◺lanôবʀ;cdgsব☊☍☝☨c;檨otĀ;o☔☕橿Ā;r☚☛檁;檃Ā;e☢☥쀀⋚︀s;檓ʀadegs☳☹☽♉♋pproøⓆot;拖qĀgq♃♅ôউgtò⒌ôছiíলƀilr♕࣡♚sht;楼;쀀𝔩Ā;Eজ♣;檑š♩♶rĀdu▲♮Ā;l॥♳;楪lk;斄cy;䑙ʀ;achtੈ⚈⚋⚑⚖rò◁orneòᴈard;楫ri;旺Āio⚟⚤dot;䅀ustĀ;a⚬⚭掰che»⚭ȀEaes⚻⚽⛉⛔;扨pĀ;p⛃⛄檉rox»⛄Ā;q⛎⛏檇Ā;q⛎⚻im;拦Ѐabnoptwz⛩⛴⛷✚✯❁❇❐Ānr⛮⛱g;柬r;懽rëࣁgƀlmr⛿✍✔eftĀar০✇ightá৲apsto;柼ightá৽parrowĀlr✥✩efô⓭ight;憬ƀafl✶✹✽r;榅;쀀𝕝us;樭imes;樴š❋❏st;戗áፎƀ;ef❗❘᠀旊nge»❘arĀ;l❤❥䀨t;榓ʀachmt❳❶❼➅➇ròࢨorneòᶌarĀ;d྘➃;業;怎ri;抿̀achiqt➘➝ੀ➢➮➻quo;怹r;쀀𝓁mƀ;egল➪➬;檍;檏Ābu┪➳oĀ;rฟ➹;怚rok;䅂萀<;cdhilqrࠫ⟒☹⟜⟠⟥⟪⟰Āci⟗⟙;檦r;橹reå◲mes;拉arr;楶uest;橻ĀPi⟵⟹ar;榖ƀ;ef⠀भ᠛旃rĀdu⠇⠍shar;楊har;楦Āen⠗⠡rtneqq;쀀≨︀Å⠞܀Dacdefhilnopsu⡀⡅⢂⢎⢓⢠⢥⢨⣚⣢⣤ઃ⣳⤂Dot;戺Ȁclpr⡎⡒⡣⡽r耻¯䂯Āet⡗⡙;時Ā;e⡞⡟朠se»⡟Ā;sျ⡨toȀ;dluျ⡳⡷⡻owîҌefôएðᏑker;斮Āoy⢇⢌mma;権;䐼ash;怔asuredangle»ᘦr;쀀𝔪o;愧ƀcdn⢯⢴⣉ro耻µ䂵Ȁ;acdᑤ⢽⣀⣄sôᚧir;櫰ot肻·Ƶusƀ;bd⣒ᤃ⣓戒Ā;uᴼ⣘;横ţ⣞⣡p;櫛ò−ðઁĀdp⣩⣮els;抧f;쀀𝕞Āct⣸⣽r;쀀𝓂pos»ᖝƀ;lm⤉⤊⤍䎼timap;抸ఀGLRVabcdefghijlmoprstuvw⥂⥓⥾⦉⦘⧚⧩⨕⨚⩘⩝⪃⪕⪤⪨⬄⬇⭄⭿⮮ⰴⱧⱼ⳩Āgt⥇⥋;쀀⋙̸Ā;v⥐௏쀀≫⃒ƀelt⥚⥲⥶ftĀar⥡⥧rrow;懍ightarrow;懎;쀀⋘̸Ā;v⥻ే쀀≪⃒ightarrow;懏ĀDd⦎⦓ash;抯ash;抮ʀbcnpt⦣⦧⦬⦱⧌la»˞ute;䅄g;쀀∠⃒ʀ;Eiop඄⦼⧀⧅⧈;쀀⩰̸d;쀀≋̸s;䅉roø඄urĀ;a⧓⧔普lĀ;s⧓ସǳ⧟\0⧣p肻 ଷmpĀ;e௹ఀʀaeouy⧴⧾⨃⨐⨓ǰ⧹\0⧻;橃on;䅈dil;䅆ngĀ;dൾ⨊ot;쀀⩭̸p;橂;䐽ash;怓΀;Aadqsxஒ⨩⨭⨻⩁⩅⩐rr;懗rĀhr⨳⨶k;椤Ā;oᏲᏰot;쀀≐̸uiöୣĀei⩊⩎ar;椨í஘istĀ;s஠டr;쀀𝔫ȀEest௅⩦⩹⩼ƀ;qs஼⩭௡ƀ;qs஼௅⩴lanô௢ií௪Ā;rஶ⪁»ஷƀAap⪊⪍⪑rò⥱rr;憮ar;櫲ƀ;svྍ⪜ྌĀ;d⪡⪢拼;拺cy;䑚΀AEadest⪷⪺⪾⫂⫅⫶⫹rò⥦;쀀≦̸rr;憚r;急Ȁ;fqs఻⫎⫣⫯tĀar⫔⫙rro÷⫁ightarro÷⪐ƀ;qs఻⪺⫪lanôౕĀ;sౕ⫴»శiíౝĀ;rవ⫾iĀ;eచథiäඐĀpt⬌⬑f;쀀𝕟膀¬;in⬙⬚⬶䂬nȀ;Edvஉ⬤⬨⬮;쀀⋹̸ot;쀀⋵̸ǡஉ⬳⬵;拷;拶iĀ;vಸ⬼ǡಸ⭁⭃;拾;拽ƀaor⭋⭣⭩rȀ;ast୻⭕⭚⭟lleì୻l;쀀⫽⃥;쀀∂̸lint;樔ƀ;ceಒ⭰⭳uåಥĀ;cಘ⭸Ā;eಒ⭽ñಘȀAait⮈⮋⮝⮧rò⦈rrƀ;cw⮔⮕⮙憛;쀀⤳̸;쀀↝̸ghtarrow»⮕riĀ;eೋೖ΀chimpqu⮽⯍⯙⬄୸⯤⯯Ȁ;cerല⯆ഷ⯉uå൅;쀀𝓃ortɭ⬅\0\0⯖ará⭖mĀ;e൮⯟Ā;q൴൳suĀbp⯫⯭å೸åഋƀbcp⯶ⰑⰙȀ;Ees⯿ⰀഢⰄ抄;쀀⫅̸etĀ;eഛⰋqĀ;qണⰀcĀ;eലⰗñസȀ;EesⰢⰣൟⰧ抅;쀀⫆̸etĀ;e൘ⰮqĀ;qൠⰣȀgilrⰽⰿⱅⱇìௗlde耻ñ䃱çృiangleĀlrⱒⱜeftĀ;eచⱚñదightĀ;eೋⱥñ೗Ā;mⱬⱭ䎽ƀ;esⱴⱵⱹ䀣ro;愖p;怇ҀDHadgilrsⲏⲔⲙⲞⲣⲰⲶⳓⳣash;抭arr;椄p;쀀≍⃒ash;抬ĀetⲨⲬ;쀀≥⃒;쀀>⃒nfin;槞ƀAetⲽⳁⳅrr;椂;쀀≤⃒Ā;rⳊⳍ쀀<⃒ie;쀀⊴⃒ĀAtⳘⳜrr;椃rie;쀀⊵⃒im;쀀∼⃒ƀAan⳰⳴ⴂrr;懖rĀhr⳺⳽k;椣Ā;oᏧᏥear;椧ቓ᪕\0\0\0\0\0\0\0\0\0\0\0\0\0ⴭ\0ⴸⵈⵠⵥ⵲ⶄᬇ\0\0ⶍⶫ\0ⷈⷎ\0ⷜ⸙⸫⸾⹃Ācsⴱ᪗ute耻ó䃳ĀiyⴼⵅrĀ;c᪞ⵂ耻ô䃴;䐾ʀabios᪠ⵒⵗǈⵚlac;䅑v;樸old;榼lig;䅓Ācr⵩⵭ir;榿;쀀𝔬ͯ⵹\0\0⵼\0ⶂn;䋛ave耻ò䃲;槁Ābmⶈ෴ar;榵Ȁacitⶕ⶘ⶥⶨrò᪀Āir⶝ⶠr;榾oss;榻nå๒;槀ƀaeiⶱⶵⶹcr;䅍ga;䏉ƀcdnⷀⷅǍron;䎿;榶pf;쀀𝕠ƀaelⷔ⷗ǒr;榷rp;榹΀;adiosvⷪⷫⷮ⸈⸍⸐⸖戨rò᪆Ȁ;efmⷷⷸ⸂⸅橝rĀ;oⷾⷿ愴f»ⷿ耻ª䂪耻º䂺gof;抶r;橖lope;橗;橛ƀclo⸟⸡⸧ò⸁ash耻ø䃸l;折iŬⸯ⸴de耻õ䃵esĀ;aǛ⸺s;樶ml耻ö䃶bar;挽ૡ⹞\0⹽\0⺀⺝\0⺢⺹\0\0⻋ຜ\0⼓\0\0⼫⾼\0⿈rȀ;astЃ⹧⹲຅脀¶;l⹭⹮䂶leìЃɩ⹸\0\0⹻m;櫳;櫽y;䐿rʀcimpt⺋⺏⺓ᡥ⺗nt;䀥od;䀮il;怰enk;怱r;쀀𝔭ƀimo⺨⺰⺴Ā;v⺭⺮䏆;䏕maô੶ne;明ƀ;tv⺿⻀⻈䏀chfork»´;䏖Āau⻏⻟nĀck⻕⻝kĀ;h⇴⻛;愎ö⇴sҀ;abcdemst⻳⻴ᤈ⻹⻽⼄⼆⼊⼎䀫cir;樣ir;樢Āouᵀ⼂;樥;橲n肻±ຝim;樦wo;樧ƀipu⼙⼠⼥ntint;樕f;쀀𝕡nd耻£䂣Ԁ;Eaceinosu່⼿⽁⽄⽇⾁⾉⾒⽾⾶;檳p;檷uå໙Ā;c໎⽌̀;acens່⽙⽟⽦⽨⽾pproø⽃urlyeñ໙ñ໎ƀaes⽯⽶⽺pprox;檹qq;檵im;拨iíໟmeĀ;s⾈ຮ怲ƀEas⽸⾐⽺ð⽵ƀdfp໬⾙⾯ƀals⾠⾥⾪lar;挮ine;挒urf;挓Ā;t໻⾴ï໻rel;抰Āci⿀⿅r;쀀𝓅;䏈ncsp;怈̀fiopsu⿚⋢⿟⿥⿫⿱r;쀀𝔮pf;쀀𝕢rime;恗cr;쀀𝓆ƀaeo⿸〉〓tĀei⿾々rnionóڰnt;樖stĀ;e【】䀿ñἙô༔઀ABHabcdefhilmnoprstux぀けさすムㄎㄫㅇㅢㅲㆎ㈆㈕㈤㈩㉘㉮㉲㊐㊰㊷ƀartぇおがròႳòϝail;検aròᱥar;楤΀cdenqrtとふへみわゔヌĀeuねぱ;쀀∽̱te;䅕iãᅮmptyv;榳gȀ;del࿑らるろ;榒;榥å࿑uo耻»䂻rր;abcfhlpstw࿜ガクシスゼゾダッデナp;極Ā;f࿠ゴs;椠;椳s;椞ë≝ð✮l;楅im;楴l;憣;憝Āaiパフil;椚oĀ;nホボ戶aló༞ƀabrョリヮrò៥rk;杳ĀakンヽcĀekヹ・;䁽;䁝Āes㄂㄄;榌lĀduㄊㄌ;榎;榐Ȁaeuyㄗㄜㄧㄩron;䅙Ādiㄡㄥil;䅗ì࿲âヺ;䑀Ȁclqsㄴㄷㄽㅄa;椷dhar;楩uoĀ;rȎȍh;憳ƀacgㅎㅟངlȀ;ipsླྀㅘㅛႜnåႻarôྩt;断ƀilrㅩဣㅮsht;楽;쀀𝔯ĀaoㅷㆆrĀduㅽㅿ»ѻĀ;l႑ㆄ;楬Ā;vㆋㆌ䏁;䏱ƀgns㆕ㇹㇼht̀ahlrstㆤㆰ㇂㇘㇤㇮rrowĀ;t࿜ㆭaéトarpoonĀduㆻㆿowîㅾp»႒eftĀah㇊㇐rrowó࿪arpoonóՑightarrows;應quigarro÷ニhreetimes;拌g;䋚ingdotseñἲƀahm㈍㈐㈓rò࿪aòՑ;怏oustĀ;a㈞㈟掱che»㈟mid;櫮Ȁabpt㈲㈽㉀㉒Ānr㈷㈺g;柭r;懾rëဃƀafl㉇㉊㉎r;榆;쀀𝕣us;樮imes;樵Āap㉝㉧rĀ;g㉣㉤䀩t;榔olint;樒arò㇣Ȁachq㉻㊀Ⴜ㊅quo;怺r;쀀𝓇Ābu・㊊oĀ;rȔȓƀhir㊗㊛㊠reåㇸmes;拊iȀ;efl㊪ၙᠡ㊫方tri;槎luhar;楨;愞ൡ㋕㋛㋟㌬㌸㍱\0㍺㎤\0\0㏬㏰\0㐨㑈㑚㒭㒱㓊㓱\0㘖\0\0㘳cute;䅛quï➺Ԁ;Eaceinpsyᇭ㋳㋵㋿㌂㌋㌏㌟㌦㌩;檴ǰ㋺\0㋼;檸on;䅡uåᇾĀ;dᇳ㌇il;䅟rc;䅝ƀEas㌖㌘㌛;檶p;檺im;择olint;樓iíሄ;䑁otƀ;be㌴ᵇ㌵担;橦΀Aacmstx㍆㍊㍗㍛㍞㍣㍭rr;懘rĀhr㍐㍒ë∨Ā;oਸ਼਴t耻§䂧i;䀻war;椩mĀin㍩ðnuóñt;朶rĀ;o㍶⁕쀀𝔰Ȁacoy㎂㎆㎑㎠rp;景Āhy㎋㎏cy;䑉;䑈rtɭ㎙\0\0㎜iäᑤaraì⹯耻­䂭Āgm㎨㎴maƀ;fv㎱㎲㎲䏃;䏂Ѐ;deglnprካ㏅㏉㏎㏖㏞㏡㏦ot;橪Ā;q኱ኰĀ;E㏓㏔檞;檠Ā;E㏛㏜檝;檟e;扆lus;樤arr;楲aròᄽȀaeit㏸㐈㐏㐗Āls㏽㐄lsetmé㍪hp;樳parsl;槤Ādlᑣ㐔e;挣Ā;e㐜㐝檪Ā;s㐢㐣檬;쀀⪬︀ƀflp㐮㐳㑂tcy;䑌Ā;b㐸㐹䀯Ā;a㐾㐿槄r;挿f;쀀𝕤aĀdr㑍ЂesĀ;u㑔㑕晠it»㑕ƀcsu㑠㑹㒟Āau㑥㑯pĀ;sᆈ㑫;쀀⊓︀pĀ;sᆴ㑵;쀀⊔︀uĀbp㑿㒏ƀ;esᆗᆜ㒆etĀ;eᆗ㒍ñᆝƀ;esᆨᆭ㒖etĀ;eᆨ㒝ñᆮƀ;afᅻ㒦ְrť㒫ֱ»ᅼaròᅈȀcemt㒹㒾㓂㓅r;쀀𝓈tmîñiì㐕aræᆾĀar㓎㓕rĀ;f㓔ឿ昆Āan㓚㓭ightĀep㓣㓪psiloîỠhé⺯s»⡒ʀbcmnp㓻㕞ሉ㖋㖎Ҁ;Edemnprs㔎㔏㔑㔕㔞㔣㔬㔱㔶抂;櫅ot;檽Ā;dᇚ㔚ot;櫃ult;櫁ĀEe㔨㔪;櫋;把lus;檿arr;楹ƀeiu㔽㕒㕕tƀ;en㔎㕅㕋qĀ;qᇚ㔏eqĀ;q㔫㔨m;櫇Ābp㕚㕜;櫕;櫓c̀;acensᇭ㕬㕲㕹㕻㌦pproø㋺urlyeñᇾñᇳƀaes㖂㖈㌛pproø㌚qñ㌗g;晪ڀ123;Edehlmnps㖩㖬㖯ሜ㖲㖴㗀㗉㗕㗚㗟㗨㗭耻¹䂹耻²䂲耻³䂳;櫆Āos㖹㖼t;檾ub;櫘Ā;dሢ㗅ot;櫄sĀou㗏㗒l;柉b;櫗arr;楻ult;櫂ĀEe㗤㗦;櫌;抋lus;櫀ƀeiu㗴㘉㘌tƀ;enሜ㗼㘂qĀ;qሢ㖲eqĀ;q㗧㗤m;櫈Ābp㘑㘓;櫔;櫖ƀAan㘜㘠㘭rr;懙rĀhr㘦㘨ë∮Ā;oਫ਩war;椪lig耻ß䃟௡㙑㙝㙠ዎ㙳㙹\0㙾㛂\0\0\0\0\0㛛㜃\0㜉㝬\0\0\0㞇ɲ㙖\0\0㙛get;挖;䏄rë๟ƀaey㙦㙫㙰ron;䅥dil;䅣;䑂lrec;挕r;쀀𝔱Ȁeiko㚆㚝㚵㚼ǲ㚋\0㚑eĀ4fኄኁaƀ;sv㚘㚙㚛䎸ym;䏑Ācn㚢㚲kĀas㚨㚮pproø዁im»ኬsðኞĀas㚺㚮ð዁rn耻þ䃾Ǭ̟㛆⋧es膀×;bd㛏㛐㛘䃗Ā;aᤏ㛕r;樱;樰ƀeps㛡㛣㜀á⩍Ȁ;bcf҆㛬㛰㛴ot;挶ir;櫱Ā;o㛹㛼쀀𝕥rk;櫚á㍢rime;怴ƀaip㜏㜒㝤dåቈ΀adempst㜡㝍㝀㝑㝗㝜㝟ngleʀ;dlqr㜰㜱㜶㝀㝂斵own»ᶻeftĀ;e⠀㜾ñम;扜ightĀ;e㊪㝋ñၚot;旬inus;樺lus;樹b;槍ime;樻ezium;揢ƀcht㝲㝽㞁Āry㝷㝻;쀀𝓉;䑆cy;䑛rok;䅧Āio㞋㞎xô᝷headĀlr㞗㞠eftarro÷ࡏightarrow»ཝऀAHabcdfghlmoprstuw㟐㟓㟗㟤㟰㟼㠎㠜㠣㠴㡑㡝㡫㢩㣌㣒㣪㣶ròϭar;楣Ācr㟜㟢ute耻ú䃺òᅐrǣ㟪\0㟭y;䑞ve;䅭Āiy㟵㟺rc耻û䃻;䑃ƀabh㠃㠆㠋ròᎭlac;䅱aòᏃĀir㠓㠘sht;楾;쀀𝔲rave耻ù䃹š㠧㠱rĀlr㠬㠮»ॗ»ႃlk;斀Āct㠹㡍ɯ㠿\0\0㡊rnĀ;e㡅㡆挜r»㡆op;挏ri;旸Āal㡖㡚cr;䅫肻¨͉Āgp㡢㡦on;䅳f;쀀𝕦̀adhlsuᅋ㡸㡽፲㢑㢠ownáᎳarpoonĀlr㢈㢌efô㠭ighô㠯iƀ;hl㢙㢚㢜䏅»ᏺon»㢚parrows;懈ƀcit㢰㣄㣈ɯ㢶\0\0㣁rnĀ;e㢼㢽挝r»㢽op;挎ng;䅯ri;旹cr;쀀𝓊ƀdir㣙㣝㣢ot;拰lde;䅩iĀ;f㜰㣨»᠓Āam㣯㣲rò㢨l耻ü䃼angle;榧ހABDacdeflnoprsz㤜㤟㤩㤭㦵㦸㦽㧟㧤㧨㧳㧹㧽㨁㨠ròϷarĀ;v㤦㤧櫨;櫩asèϡĀnr㤲㤷grt;榜΀eknprst㓣㥆㥋㥒㥝㥤㦖appá␕othinçẖƀhir㓫⻈㥙opô⾵Ā;hᎷ㥢ïㆍĀiu㥩㥭gmá㎳Ābp㥲㦄setneqĀ;q㥽㦀쀀⊊︀;쀀⫋︀setneqĀ;q㦏㦒쀀⊋︀;쀀⫌︀Āhr㦛㦟etá㚜iangleĀlr㦪㦯eft»थight»ၑy;䐲ash»ံƀelr㧄㧒㧗ƀ;beⷪ㧋㧏ar;抻q;扚lip;拮Ābt㧜ᑨaòᑩr;쀀𝔳tré㦮suĀbp㧯㧱»ജ»൙pf;쀀𝕧roð໻tré㦴Ācu㨆㨋r;쀀𝓋Ābp㨐㨘nĀEe㦀㨖»㥾nĀEe㦒㨞»㦐igzag;榚΀cefoprs㨶㨻㩖㩛㩔㩡㩪irc;䅵Ādi㩀㩑Ābg㩅㩉ar;機eĀ;qᗺ㩏;扙erp;愘r;쀀𝔴pf;쀀𝕨Ā;eᑹ㩦atèᑹcr;쀀𝓌ૣណ㪇\0㪋\0㪐㪛\0\0㪝㪨㪫㪯\0\0㫃㫎\0㫘ៜ៟tré៑r;쀀𝔵ĀAa㪔㪗ròσrò৶;䎾ĀAa㪡㪤ròθrò৫að✓is;拻ƀdptឤ㪵㪾Āfl㪺ឩ;쀀𝕩imåឲĀAa㫇㫊ròώròਁĀcq㫒ីr;쀀𝓍Āpt៖㫜ré។Ѐacefiosu㫰㫽㬈㬌㬑㬕㬛㬡cĀuy㫶㫻te耻ý䃽;䑏Āiy㬂㬆rc;䅷;䑋n耻¥䂥r;쀀𝔶cy;䑗pf;쀀𝕪cr;쀀𝓎Ācm㬦㬩y;䑎l耻ÿ䃿Ԁacdefhiosw㭂㭈㭔㭘㭤㭩㭭㭴㭺㮀cute;䅺Āay㭍㭒ron;䅾;䐷ot;䅼Āet㭝㭡træᕟa;䎶r;쀀𝔷cy;䐶grarr;懝pf;쀀𝕫cr;쀀𝓏Ājn㮅㮇;怍j;怌'.split("").map(function(c) {
      return c.charCodeAt(0);
    })
  );
  return decodeDataHtml;
}
var decodeDataXml = {};
var hasRequiredDecodeDataXml;
function requireDecodeDataXml() {
  if (hasRequiredDecodeDataXml) return decodeDataXml;
  hasRequiredDecodeDataXml = 1;
  Object.defineProperty(decodeDataXml, "__esModule", { value: true });
  decodeDataXml.default = new Uint16Array(
    // prettier-ignore
    "Ȁaglq	\x1Bɭ\0\0p;䀦os;䀧t;䀾t;䀼uot;䀢".split("").map(function(c) {
      return c.charCodeAt(0);
    })
  );
  return decodeDataXml;
}
var decode_codepoint = {};
var hasRequiredDecode_codepoint;
function requireDecode_codepoint() {
  if (hasRequiredDecode_codepoint) return decode_codepoint;
  hasRequiredDecode_codepoint = 1;
  (function(exports$1) {
    var _a;
    Object.defineProperty(exports$1, "__esModule", { value: true });
    exports$1.replaceCodePoint = exports$1.fromCodePoint = void 0;
    var decodeMap = /* @__PURE__ */ new Map([
      [0, 65533],
      // C1 Unicode control character reference replacements
      [128, 8364],
      [130, 8218],
      [131, 402],
      [132, 8222],
      [133, 8230],
      [134, 8224],
      [135, 8225],
      [136, 710],
      [137, 8240],
      [138, 352],
      [139, 8249],
      [140, 338],
      [142, 381],
      [145, 8216],
      [146, 8217],
      [147, 8220],
      [148, 8221],
      [149, 8226],
      [150, 8211],
      [151, 8212],
      [152, 732],
      [153, 8482],
      [154, 353],
      [155, 8250],
      [156, 339],
      [158, 382],
      [159, 376]
    ]);
    exports$1.fromCodePoint = // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, node/no-unsupported-features/es-builtins
    (_a = String.fromCodePoint) !== null && _a !== void 0 ? _a : function(codePoint) {
      var output = "";
      if (codePoint > 65535) {
        codePoint -= 65536;
        output += String.fromCharCode(codePoint >>> 10 & 1023 | 55296);
        codePoint = 56320 | codePoint & 1023;
      }
      output += String.fromCharCode(codePoint);
      return output;
    };
    function replaceCodePoint(codePoint) {
      var _a2;
      if (codePoint >= 55296 && codePoint <= 57343 || codePoint > 1114111) {
        return 65533;
      }
      return (_a2 = decodeMap.get(codePoint)) !== null && _a2 !== void 0 ? _a2 : codePoint;
    }
    exports$1.replaceCodePoint = replaceCodePoint;
    function decodeCodePoint(codePoint) {
      return (0, exports$1.fromCodePoint)(replaceCodePoint(codePoint));
    }
    exports$1.default = decodeCodePoint;
  })(decode_codepoint);
  return decode_codepoint;
}
var hasRequiredDecode;
function requireDecode() {
  if (hasRequiredDecode) return decode$1;
  hasRequiredDecode = 1;
  (function(exports$1) {
    var __createBinding = commonjsGlobal && commonjsGlobal.__createBinding || (Object.create ? function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    } : function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    });
    var __setModuleDefault = commonjsGlobal && commonjsGlobal.__setModuleDefault || (Object.create ? function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    } : function(o, v) {
      o["default"] = v;
    });
    var __importStar = commonjsGlobal && commonjsGlobal.__importStar || function(mod) {
      if (mod && mod.__esModule) return mod;
      var result2 = {};
      if (mod != null) {
        for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result2, mod, k);
      }
      __setModuleDefault(result2, mod);
      return result2;
    };
    var __importDefault = commonjsGlobal && commonjsGlobal.__importDefault || function(mod) {
      return mod && mod.__esModule ? mod : { "default": mod };
    };
    Object.defineProperty(exports$1, "__esModule", { value: true });
    exports$1.decodeXML = exports$1.decodeHTMLStrict = exports$1.decodeHTMLAttribute = exports$1.decodeHTML = exports$1.determineBranch = exports$1.EntityDecoder = exports$1.DecodingMode = exports$1.BinTrieFlags = exports$1.fromCodePoint = exports$1.replaceCodePoint = exports$1.decodeCodePoint = exports$1.xmlDecodeTree = exports$1.htmlDecodeTree = void 0;
    var decode_data_html_js_1 = __importDefault(requireDecodeDataHtml());
    exports$1.htmlDecodeTree = decode_data_html_js_1.default;
    var decode_data_xml_js_1 = __importDefault(requireDecodeDataXml());
    exports$1.xmlDecodeTree = decode_data_xml_js_1.default;
    var decode_codepoint_js_1 = __importStar(requireDecode_codepoint());
    exports$1.decodeCodePoint = decode_codepoint_js_1.default;
    var decode_codepoint_js_2 = requireDecode_codepoint();
    Object.defineProperty(exports$1, "replaceCodePoint", { enumerable: true, get: function() {
      return decode_codepoint_js_2.replaceCodePoint;
    } });
    Object.defineProperty(exports$1, "fromCodePoint", { enumerable: true, get: function() {
      return decode_codepoint_js_2.fromCodePoint;
    } });
    var CharCodes;
    (function(CharCodes2) {
      CharCodes2[CharCodes2["NUM"] = 35] = "NUM";
      CharCodes2[CharCodes2["SEMI"] = 59] = "SEMI";
      CharCodes2[CharCodes2["EQUALS"] = 61] = "EQUALS";
      CharCodes2[CharCodes2["ZERO"] = 48] = "ZERO";
      CharCodes2[CharCodes2["NINE"] = 57] = "NINE";
      CharCodes2[CharCodes2["LOWER_A"] = 97] = "LOWER_A";
      CharCodes2[CharCodes2["LOWER_F"] = 102] = "LOWER_F";
      CharCodes2[CharCodes2["LOWER_X"] = 120] = "LOWER_X";
      CharCodes2[CharCodes2["LOWER_Z"] = 122] = "LOWER_Z";
      CharCodes2[CharCodes2["UPPER_A"] = 65] = "UPPER_A";
      CharCodes2[CharCodes2["UPPER_F"] = 70] = "UPPER_F";
      CharCodes2[CharCodes2["UPPER_Z"] = 90] = "UPPER_Z";
    })(CharCodes || (CharCodes = {}));
    var TO_LOWER_BIT = 32;
    var BinTrieFlags;
    (function(BinTrieFlags2) {
      BinTrieFlags2[BinTrieFlags2["VALUE_LENGTH"] = 49152] = "VALUE_LENGTH";
      BinTrieFlags2[BinTrieFlags2["BRANCH_LENGTH"] = 16256] = "BRANCH_LENGTH";
      BinTrieFlags2[BinTrieFlags2["JUMP_TABLE"] = 127] = "JUMP_TABLE";
    })(BinTrieFlags = exports$1.BinTrieFlags || (exports$1.BinTrieFlags = {}));
    function isNumber(code) {
      return code >= CharCodes.ZERO && code <= CharCodes.NINE;
    }
    function isHexadecimalCharacter(code) {
      return code >= CharCodes.UPPER_A && code <= CharCodes.UPPER_F || code >= CharCodes.LOWER_A && code <= CharCodes.LOWER_F;
    }
    function isAsciiAlphaNumeric(code) {
      return code >= CharCodes.UPPER_A && code <= CharCodes.UPPER_Z || code >= CharCodes.LOWER_A && code <= CharCodes.LOWER_Z || isNumber(code);
    }
    function isEntityInAttributeInvalidEnd(code) {
      return code === CharCodes.EQUALS || isAsciiAlphaNumeric(code);
    }
    var EntityDecoderState;
    (function(EntityDecoderState2) {
      EntityDecoderState2[EntityDecoderState2["EntityStart"] = 0] = "EntityStart";
      EntityDecoderState2[EntityDecoderState2["NumericStart"] = 1] = "NumericStart";
      EntityDecoderState2[EntityDecoderState2["NumericDecimal"] = 2] = "NumericDecimal";
      EntityDecoderState2[EntityDecoderState2["NumericHex"] = 3] = "NumericHex";
      EntityDecoderState2[EntityDecoderState2["NamedEntity"] = 4] = "NamedEntity";
    })(EntityDecoderState || (EntityDecoderState = {}));
    var DecodingMode;
    (function(DecodingMode2) {
      DecodingMode2[DecodingMode2["Legacy"] = 0] = "Legacy";
      DecodingMode2[DecodingMode2["Strict"] = 1] = "Strict";
      DecodingMode2[DecodingMode2["Attribute"] = 2] = "Attribute";
    })(DecodingMode = exports$1.DecodingMode || (exports$1.DecodingMode = {}));
    var EntityDecoder = (
      /** @class */
      function() {
        function EntityDecoder2(decodeTree, emitCodePoint, errors) {
          this.decodeTree = decodeTree;
          this.emitCodePoint = emitCodePoint;
          this.errors = errors;
          this.state = EntityDecoderState.EntityStart;
          this.consumed = 1;
          this.result = 0;
          this.treeIndex = 0;
          this.excess = 1;
          this.decodeMode = DecodingMode.Strict;
        }
        EntityDecoder2.prototype.startEntity = function(decodeMode) {
          this.decodeMode = decodeMode;
          this.state = EntityDecoderState.EntityStart;
          this.result = 0;
          this.treeIndex = 0;
          this.excess = 1;
          this.consumed = 1;
        };
        EntityDecoder2.prototype.write = function(str, offset) {
          switch (this.state) {
            case EntityDecoderState.EntityStart: {
              if (str.charCodeAt(offset) === CharCodes.NUM) {
                this.state = EntityDecoderState.NumericStart;
                this.consumed += 1;
                return this.stateNumericStart(str, offset + 1);
              }
              this.state = EntityDecoderState.NamedEntity;
              return this.stateNamedEntity(str, offset);
            }
            case EntityDecoderState.NumericStart: {
              return this.stateNumericStart(str, offset);
            }
            case EntityDecoderState.NumericDecimal: {
              return this.stateNumericDecimal(str, offset);
            }
            case EntityDecoderState.NumericHex: {
              return this.stateNumericHex(str, offset);
            }
            case EntityDecoderState.NamedEntity: {
              return this.stateNamedEntity(str, offset);
            }
          }
        };
        EntityDecoder2.prototype.stateNumericStart = function(str, offset) {
          if (offset >= str.length) {
            return -1;
          }
          if ((str.charCodeAt(offset) | TO_LOWER_BIT) === CharCodes.LOWER_X) {
            this.state = EntityDecoderState.NumericHex;
            this.consumed += 1;
            return this.stateNumericHex(str, offset + 1);
          }
          this.state = EntityDecoderState.NumericDecimal;
          return this.stateNumericDecimal(str, offset);
        };
        EntityDecoder2.prototype.addToNumericResult = function(str, start, end, base) {
          if (start !== end) {
            var digitCount = end - start;
            this.result = this.result * Math.pow(base, digitCount) + parseInt(str.substr(start, digitCount), base);
            this.consumed += digitCount;
          }
        };
        EntityDecoder2.prototype.stateNumericHex = function(str, offset) {
          var startIdx = offset;
          while (offset < str.length) {
            var char = str.charCodeAt(offset);
            if (isNumber(char) || isHexadecimalCharacter(char)) {
              offset += 1;
            } else {
              this.addToNumericResult(str, startIdx, offset, 16);
              return this.emitNumericEntity(char, 3);
            }
          }
          this.addToNumericResult(str, startIdx, offset, 16);
          return -1;
        };
        EntityDecoder2.prototype.stateNumericDecimal = function(str, offset) {
          var startIdx = offset;
          while (offset < str.length) {
            var char = str.charCodeAt(offset);
            if (isNumber(char)) {
              offset += 1;
            } else {
              this.addToNumericResult(str, startIdx, offset, 10);
              return this.emitNumericEntity(char, 2);
            }
          }
          this.addToNumericResult(str, startIdx, offset, 10);
          return -1;
        };
        EntityDecoder2.prototype.emitNumericEntity = function(lastCp, expectedLength) {
          var _a;
          if (this.consumed <= expectedLength) {
            (_a = this.errors) === null || _a === void 0 ? void 0 : _a.absenceOfDigitsInNumericCharacterReference(this.consumed);
            return 0;
          }
          if (lastCp === CharCodes.SEMI) {
            this.consumed += 1;
          } else if (this.decodeMode === DecodingMode.Strict) {
            return 0;
          }
          this.emitCodePoint((0, decode_codepoint_js_1.replaceCodePoint)(this.result), this.consumed);
          if (this.errors) {
            if (lastCp !== CharCodes.SEMI) {
              this.errors.missingSemicolonAfterCharacterReference();
            }
            this.errors.validateNumericCharacterReference(this.result);
          }
          return this.consumed;
        };
        EntityDecoder2.prototype.stateNamedEntity = function(str, offset) {
          var decodeTree = this.decodeTree;
          var current = decodeTree[this.treeIndex];
          var valueLength = (current & BinTrieFlags.VALUE_LENGTH) >> 14;
          for (; offset < str.length; offset++, this.excess++) {
            var char = str.charCodeAt(offset);
            this.treeIndex = determineBranch(decodeTree, current, this.treeIndex + Math.max(1, valueLength), char);
            if (this.treeIndex < 0) {
              return this.result === 0 || // If we are parsing an attribute
              this.decodeMode === DecodingMode.Attribute && // We shouldn't have consumed any characters after the entity,
              (valueLength === 0 || // And there should be no invalid characters.
              isEntityInAttributeInvalidEnd(char)) ? 0 : this.emitNotTerminatedNamedEntity();
            }
            current = decodeTree[this.treeIndex];
            valueLength = (current & BinTrieFlags.VALUE_LENGTH) >> 14;
            if (valueLength !== 0) {
              if (char === CharCodes.SEMI) {
                return this.emitNamedEntityData(this.treeIndex, valueLength, this.consumed + this.excess);
              }
              if (this.decodeMode !== DecodingMode.Strict) {
                this.result = this.treeIndex;
                this.consumed += this.excess;
                this.excess = 0;
              }
            }
          }
          return -1;
        };
        EntityDecoder2.prototype.emitNotTerminatedNamedEntity = function() {
          var _a;
          var _b = this, result2 = _b.result, decodeTree = _b.decodeTree;
          var valueLength = (decodeTree[result2] & BinTrieFlags.VALUE_LENGTH) >> 14;
          this.emitNamedEntityData(result2, valueLength, this.consumed);
          (_a = this.errors) === null || _a === void 0 ? void 0 : _a.missingSemicolonAfterCharacterReference();
          return this.consumed;
        };
        EntityDecoder2.prototype.emitNamedEntityData = function(result2, valueLength, consumed) {
          var decodeTree = this.decodeTree;
          this.emitCodePoint(valueLength === 1 ? decodeTree[result2] & ~BinTrieFlags.VALUE_LENGTH : decodeTree[result2 + 1], consumed);
          if (valueLength === 3) {
            this.emitCodePoint(decodeTree[result2 + 2], consumed);
          }
          return consumed;
        };
        EntityDecoder2.prototype.end = function() {
          var _a;
          switch (this.state) {
            case EntityDecoderState.NamedEntity: {
              return this.result !== 0 && (this.decodeMode !== DecodingMode.Attribute || this.result === this.treeIndex) ? this.emitNotTerminatedNamedEntity() : 0;
            }
            case EntityDecoderState.NumericDecimal: {
              return this.emitNumericEntity(0, 2);
            }
            case EntityDecoderState.NumericHex: {
              return this.emitNumericEntity(0, 3);
            }
            case EntityDecoderState.NumericStart: {
              (_a = this.errors) === null || _a === void 0 ? void 0 : _a.absenceOfDigitsInNumericCharacterReference(this.consumed);
              return 0;
            }
            case EntityDecoderState.EntityStart: {
              return 0;
            }
          }
        };
        return EntityDecoder2;
      }()
    );
    exports$1.EntityDecoder = EntityDecoder;
    function getDecoder(decodeTree) {
      var ret = "";
      var decoder = new EntityDecoder(decodeTree, function(str) {
        return ret += (0, decode_codepoint_js_1.fromCodePoint)(str);
      });
      return function decodeWithTrie(str, decodeMode) {
        var lastIndex = 0;
        var offset = 0;
        while ((offset = str.indexOf("&", offset)) >= 0) {
          ret += str.slice(lastIndex, offset);
          decoder.startEntity(decodeMode);
          var len = decoder.write(
            str,
            // Skip the "&"
            offset + 1
          );
          if (len < 0) {
            lastIndex = offset + decoder.end();
            break;
          }
          lastIndex = offset + len;
          offset = len === 0 ? lastIndex + 1 : lastIndex;
        }
        var result2 = ret + str.slice(lastIndex);
        ret = "";
        return result2;
      };
    }
    function determineBranch(decodeTree, current, nodeIdx, char) {
      var branchCount = (current & BinTrieFlags.BRANCH_LENGTH) >> 7;
      var jumpOffset = current & BinTrieFlags.JUMP_TABLE;
      if (branchCount === 0) {
        return jumpOffset !== 0 && char === jumpOffset ? nodeIdx : -1;
      }
      if (jumpOffset) {
        var value = char - jumpOffset;
        return value < 0 || value >= branchCount ? -1 : decodeTree[nodeIdx + value] - 1;
      }
      var lo = nodeIdx;
      var hi = lo + branchCount - 1;
      while (lo <= hi) {
        var mid = lo + hi >>> 1;
        var midVal = decodeTree[mid];
        if (midVal < char) {
          lo = mid + 1;
        } else if (midVal > char) {
          hi = mid - 1;
        } else {
          return decodeTree[mid + branchCount];
        }
      }
      return -1;
    }
    exports$1.determineBranch = determineBranch;
    var htmlDecoder = getDecoder(decode_data_html_js_1.default);
    var xmlDecoder = getDecoder(decode_data_xml_js_1.default);
    function decodeHTML(str, mode) {
      if (mode === void 0) {
        mode = DecodingMode.Legacy;
      }
      return htmlDecoder(str, mode);
    }
    exports$1.decodeHTML = decodeHTML;
    function decodeHTMLAttribute(str) {
      return htmlDecoder(str, DecodingMode.Attribute);
    }
    exports$1.decodeHTMLAttribute = decodeHTMLAttribute;
    function decodeHTMLStrict(str) {
      return htmlDecoder(str, DecodingMode.Strict);
    }
    exports$1.decodeHTMLStrict = decodeHTMLStrict;
    function decodeXML(str) {
      return xmlDecoder(str, DecodingMode.Strict);
    }
    exports$1.decodeXML = decodeXML;
  })(decode$1);
  return decode$1;
}
var hasRequiredTokenizer;
function requireTokenizer() {
  if (hasRequiredTokenizer) return Tokenizer;
  hasRequiredTokenizer = 1;
  (function(exports$1) {
    Object.defineProperty(exports$1, "__esModule", { value: true });
    exports$1.QuoteType = void 0;
    var decode_js_1 = requireDecode();
    var CharCodes;
    (function(CharCodes2) {
      CharCodes2[CharCodes2["Tab"] = 9] = "Tab";
      CharCodes2[CharCodes2["NewLine"] = 10] = "NewLine";
      CharCodes2[CharCodes2["FormFeed"] = 12] = "FormFeed";
      CharCodes2[CharCodes2["CarriageReturn"] = 13] = "CarriageReturn";
      CharCodes2[CharCodes2["Space"] = 32] = "Space";
      CharCodes2[CharCodes2["ExclamationMark"] = 33] = "ExclamationMark";
      CharCodes2[CharCodes2["Number"] = 35] = "Number";
      CharCodes2[CharCodes2["Amp"] = 38] = "Amp";
      CharCodes2[CharCodes2["SingleQuote"] = 39] = "SingleQuote";
      CharCodes2[CharCodes2["DoubleQuote"] = 34] = "DoubleQuote";
      CharCodes2[CharCodes2["Dash"] = 45] = "Dash";
      CharCodes2[CharCodes2["Slash"] = 47] = "Slash";
      CharCodes2[CharCodes2["Zero"] = 48] = "Zero";
      CharCodes2[CharCodes2["Nine"] = 57] = "Nine";
      CharCodes2[CharCodes2["Semi"] = 59] = "Semi";
      CharCodes2[CharCodes2["Lt"] = 60] = "Lt";
      CharCodes2[CharCodes2["Eq"] = 61] = "Eq";
      CharCodes2[CharCodes2["Gt"] = 62] = "Gt";
      CharCodes2[CharCodes2["Questionmark"] = 63] = "Questionmark";
      CharCodes2[CharCodes2["UpperA"] = 65] = "UpperA";
      CharCodes2[CharCodes2["LowerA"] = 97] = "LowerA";
      CharCodes2[CharCodes2["UpperF"] = 70] = "UpperF";
      CharCodes2[CharCodes2["LowerF"] = 102] = "LowerF";
      CharCodes2[CharCodes2["UpperZ"] = 90] = "UpperZ";
      CharCodes2[CharCodes2["LowerZ"] = 122] = "LowerZ";
      CharCodes2[CharCodes2["LowerX"] = 120] = "LowerX";
      CharCodes2[CharCodes2["OpeningSquareBracket"] = 91] = "OpeningSquareBracket";
    })(CharCodes || (CharCodes = {}));
    var State;
    (function(State2) {
      State2[State2["Text"] = 1] = "Text";
      State2[State2["BeforeTagName"] = 2] = "BeforeTagName";
      State2[State2["InTagName"] = 3] = "InTagName";
      State2[State2["InSelfClosingTag"] = 4] = "InSelfClosingTag";
      State2[State2["BeforeClosingTagName"] = 5] = "BeforeClosingTagName";
      State2[State2["InClosingTagName"] = 6] = "InClosingTagName";
      State2[State2["AfterClosingTagName"] = 7] = "AfterClosingTagName";
      State2[State2["BeforeAttributeName"] = 8] = "BeforeAttributeName";
      State2[State2["InAttributeName"] = 9] = "InAttributeName";
      State2[State2["AfterAttributeName"] = 10] = "AfterAttributeName";
      State2[State2["BeforeAttributeValue"] = 11] = "BeforeAttributeValue";
      State2[State2["InAttributeValueDq"] = 12] = "InAttributeValueDq";
      State2[State2["InAttributeValueSq"] = 13] = "InAttributeValueSq";
      State2[State2["InAttributeValueNq"] = 14] = "InAttributeValueNq";
      State2[State2["BeforeDeclaration"] = 15] = "BeforeDeclaration";
      State2[State2["InDeclaration"] = 16] = "InDeclaration";
      State2[State2["InProcessingInstruction"] = 17] = "InProcessingInstruction";
      State2[State2["BeforeComment"] = 18] = "BeforeComment";
      State2[State2["CDATASequence"] = 19] = "CDATASequence";
      State2[State2["InSpecialComment"] = 20] = "InSpecialComment";
      State2[State2["InCommentLike"] = 21] = "InCommentLike";
      State2[State2["BeforeSpecialS"] = 22] = "BeforeSpecialS";
      State2[State2["SpecialStartSequence"] = 23] = "SpecialStartSequence";
      State2[State2["InSpecialTag"] = 24] = "InSpecialTag";
      State2[State2["BeforeEntity"] = 25] = "BeforeEntity";
      State2[State2["BeforeNumericEntity"] = 26] = "BeforeNumericEntity";
      State2[State2["InNamedEntity"] = 27] = "InNamedEntity";
      State2[State2["InNumericEntity"] = 28] = "InNumericEntity";
      State2[State2["InHexEntity"] = 29] = "InHexEntity";
    })(State || (State = {}));
    function isWhitespace(c) {
      return c === CharCodes.Space || c === CharCodes.NewLine || c === CharCodes.Tab || c === CharCodes.FormFeed || c === CharCodes.CarriageReturn;
    }
    function isEndOfTagSection(c) {
      return c === CharCodes.Slash || c === CharCodes.Gt || isWhitespace(c);
    }
    function isNumber(c) {
      return c >= CharCodes.Zero && c <= CharCodes.Nine;
    }
    function isASCIIAlpha(c) {
      return c >= CharCodes.LowerA && c <= CharCodes.LowerZ || c >= CharCodes.UpperA && c <= CharCodes.UpperZ;
    }
    function isHexDigit(c) {
      return c >= CharCodes.UpperA && c <= CharCodes.UpperF || c >= CharCodes.LowerA && c <= CharCodes.LowerF;
    }
    var QuoteType;
    (function(QuoteType2) {
      QuoteType2[QuoteType2["NoValue"] = 0] = "NoValue";
      QuoteType2[QuoteType2["Unquoted"] = 1] = "Unquoted";
      QuoteType2[QuoteType2["Single"] = 2] = "Single";
      QuoteType2[QuoteType2["Double"] = 3] = "Double";
    })(QuoteType = exports$1.QuoteType || (exports$1.QuoteType = {}));
    var Sequences = {
      Cdata: new Uint8Array([67, 68, 65, 84, 65, 91]),
      CdataEnd: new Uint8Array([93, 93, 62]),
      CommentEnd: new Uint8Array([45, 45, 62]),
      ScriptEnd: new Uint8Array([60, 47, 115, 99, 114, 105, 112, 116]),
      StyleEnd: new Uint8Array([60, 47, 115, 116, 121, 108, 101]),
      TitleEnd: new Uint8Array([60, 47, 116, 105, 116, 108, 101])
      // `</title`
    };
    var Tokenizer2 = (
      /** @class */
      function() {
        function Tokenizer3(_a, cbs) {
          var _b = _a.xmlMode, xmlMode = _b === void 0 ? false : _b, _c = _a.decodeEntities, decodeEntities = _c === void 0 ? true : _c;
          this.cbs = cbs;
          this.state = State.Text;
          this.buffer = "";
          this.sectionStart = 0;
          this.index = 0;
          this.baseState = State.Text;
          this.isSpecial = false;
          this.running = true;
          this.offset = 0;
          this.currentSequence = void 0;
          this.sequenceIndex = 0;
          this.trieIndex = 0;
          this.trieCurrent = 0;
          this.entityResult = 0;
          this.entityExcess = 0;
          this.xmlMode = xmlMode;
          this.decodeEntities = decodeEntities;
          this.entityTrie = xmlMode ? decode_js_1.xmlDecodeTree : decode_js_1.htmlDecodeTree;
        }
        Tokenizer3.prototype.reset = function() {
          this.state = State.Text;
          this.buffer = "";
          this.sectionStart = 0;
          this.index = 0;
          this.baseState = State.Text;
          this.currentSequence = void 0;
          this.running = true;
          this.offset = 0;
        };
        Tokenizer3.prototype.write = function(chunk) {
          this.offset += this.buffer.length;
          this.buffer = chunk;
          this.parse();
        };
        Tokenizer3.prototype.end = function() {
          if (this.running)
            this.finish();
        };
        Tokenizer3.prototype.pause = function() {
          this.running = false;
        };
        Tokenizer3.prototype.resume = function() {
          this.running = true;
          if (this.index < this.buffer.length + this.offset) {
            this.parse();
          }
        };
        Tokenizer3.prototype.getIndex = function() {
          return this.index;
        };
        Tokenizer3.prototype.getSectionStart = function() {
          return this.sectionStart;
        };
        Tokenizer3.prototype.stateText = function(c) {
          if (c === CharCodes.Lt || !this.decodeEntities && this.fastForwardTo(CharCodes.Lt)) {
            if (this.index > this.sectionStart) {
              this.cbs.ontext(this.sectionStart, this.index);
            }
            this.state = State.BeforeTagName;
            this.sectionStart = this.index;
          } else if (this.decodeEntities && c === CharCodes.Amp) {
            this.state = State.BeforeEntity;
          }
        };
        Tokenizer3.prototype.stateSpecialStartSequence = function(c) {
          var isEnd = this.sequenceIndex === this.currentSequence.length;
          var isMatch = isEnd ? (
            // If we are at the end of the sequence, make sure the tag name has ended
            isEndOfTagSection(c)
          ) : (
            // Otherwise, do a case-insensitive comparison
            (c | 32) === this.currentSequence[this.sequenceIndex]
          );
          if (!isMatch) {
            this.isSpecial = false;
          } else if (!isEnd) {
            this.sequenceIndex++;
            return;
          }
          this.sequenceIndex = 0;
          this.state = State.InTagName;
          this.stateInTagName(c);
        };
        Tokenizer3.prototype.stateInSpecialTag = function(c) {
          if (this.sequenceIndex === this.currentSequence.length) {
            if (c === CharCodes.Gt || isWhitespace(c)) {
              var endOfText = this.index - this.currentSequence.length;
              if (this.sectionStart < endOfText) {
                var actualIndex = this.index;
                this.index = endOfText;
                this.cbs.ontext(this.sectionStart, endOfText);
                this.index = actualIndex;
              }
              this.isSpecial = false;
              this.sectionStart = endOfText + 2;
              this.stateInClosingTagName(c);
              return;
            }
            this.sequenceIndex = 0;
          }
          if ((c | 32) === this.currentSequence[this.sequenceIndex]) {
            this.sequenceIndex += 1;
          } else if (this.sequenceIndex === 0) {
            if (this.currentSequence === Sequences.TitleEnd) {
              if (this.decodeEntities && c === CharCodes.Amp) {
                this.state = State.BeforeEntity;
              }
            } else if (this.fastForwardTo(CharCodes.Lt)) {
              this.sequenceIndex = 1;
            }
          } else {
            this.sequenceIndex = Number(c === CharCodes.Lt);
          }
        };
        Tokenizer3.prototype.stateCDATASequence = function(c) {
          if (c === Sequences.Cdata[this.sequenceIndex]) {
            if (++this.sequenceIndex === Sequences.Cdata.length) {
              this.state = State.InCommentLike;
              this.currentSequence = Sequences.CdataEnd;
              this.sequenceIndex = 0;
              this.sectionStart = this.index + 1;
            }
          } else {
            this.sequenceIndex = 0;
            this.state = State.InDeclaration;
            this.stateInDeclaration(c);
          }
        };
        Tokenizer3.prototype.fastForwardTo = function(c) {
          while (++this.index < this.buffer.length + this.offset) {
            if (this.buffer.charCodeAt(this.index - this.offset) === c) {
              return true;
            }
          }
          this.index = this.buffer.length + this.offset - 1;
          return false;
        };
        Tokenizer3.prototype.stateInCommentLike = function(c) {
          if (c === this.currentSequence[this.sequenceIndex]) {
            if (++this.sequenceIndex === this.currentSequence.length) {
              if (this.currentSequence === Sequences.CdataEnd) {
                this.cbs.oncdata(this.sectionStart, this.index, 2);
              } else {
                this.cbs.oncomment(this.sectionStart, this.index, 2);
              }
              this.sequenceIndex = 0;
              this.sectionStart = this.index + 1;
              this.state = State.Text;
            }
          } else if (this.sequenceIndex === 0) {
            if (this.fastForwardTo(this.currentSequence[0])) {
              this.sequenceIndex = 1;
            }
          } else if (c !== this.currentSequence[this.sequenceIndex - 1]) {
            this.sequenceIndex = 0;
          }
        };
        Tokenizer3.prototype.isTagStartChar = function(c) {
          return this.xmlMode ? !isEndOfTagSection(c) : isASCIIAlpha(c);
        };
        Tokenizer3.prototype.startSpecial = function(sequence, offset) {
          this.isSpecial = true;
          this.currentSequence = sequence;
          this.sequenceIndex = offset;
          this.state = State.SpecialStartSequence;
        };
        Tokenizer3.prototype.stateBeforeTagName = function(c) {
          if (c === CharCodes.ExclamationMark) {
            this.state = State.BeforeDeclaration;
            this.sectionStart = this.index + 1;
          } else if (c === CharCodes.Questionmark) {
            this.state = State.InProcessingInstruction;
            this.sectionStart = this.index + 1;
          } else if (this.isTagStartChar(c)) {
            var lower = c | 32;
            this.sectionStart = this.index;
            if (!this.xmlMode && lower === Sequences.TitleEnd[2]) {
              this.startSpecial(Sequences.TitleEnd, 3);
            } else {
              this.state = !this.xmlMode && lower === Sequences.ScriptEnd[2] ? State.BeforeSpecialS : State.InTagName;
            }
          } else if (c === CharCodes.Slash) {
            this.state = State.BeforeClosingTagName;
          } else {
            this.state = State.Text;
            this.stateText(c);
          }
        };
        Tokenizer3.prototype.stateInTagName = function(c) {
          if (isEndOfTagSection(c)) {
            this.cbs.onopentagname(this.sectionStart, this.index);
            this.sectionStart = -1;
            this.state = State.BeforeAttributeName;
            this.stateBeforeAttributeName(c);
          }
        };
        Tokenizer3.prototype.stateBeforeClosingTagName = function(c) {
          if (isWhitespace(c)) ;
          else if (c === CharCodes.Gt) {
            this.state = State.Text;
          } else {
            this.state = this.isTagStartChar(c) ? State.InClosingTagName : State.InSpecialComment;
            this.sectionStart = this.index;
          }
        };
        Tokenizer3.prototype.stateInClosingTagName = function(c) {
          if (c === CharCodes.Gt || isWhitespace(c)) {
            this.cbs.onclosetag(this.sectionStart, this.index);
            this.sectionStart = -1;
            this.state = State.AfterClosingTagName;
            this.stateAfterClosingTagName(c);
          }
        };
        Tokenizer3.prototype.stateAfterClosingTagName = function(c) {
          if (c === CharCodes.Gt || this.fastForwardTo(CharCodes.Gt)) {
            this.state = State.Text;
            this.baseState = State.Text;
            this.sectionStart = this.index + 1;
          }
        };
        Tokenizer3.prototype.stateBeforeAttributeName = function(c) {
          if (c === CharCodes.Gt) {
            this.cbs.onopentagend(this.index);
            if (this.isSpecial) {
              this.state = State.InSpecialTag;
              this.sequenceIndex = 0;
            } else {
              this.state = State.Text;
            }
            this.baseState = this.state;
            this.sectionStart = this.index + 1;
          } else if (c === CharCodes.Slash) {
            this.state = State.InSelfClosingTag;
          } else if (!isWhitespace(c)) {
            this.state = State.InAttributeName;
            this.sectionStart = this.index;
          }
        };
        Tokenizer3.prototype.stateInSelfClosingTag = function(c) {
          if (c === CharCodes.Gt) {
            this.cbs.onselfclosingtag(this.index);
            this.state = State.Text;
            this.baseState = State.Text;
            this.sectionStart = this.index + 1;
            this.isSpecial = false;
          } else if (!isWhitespace(c)) {
            this.state = State.BeforeAttributeName;
            this.stateBeforeAttributeName(c);
          }
        };
        Tokenizer3.prototype.stateInAttributeName = function(c) {
          if (c === CharCodes.Eq || isEndOfTagSection(c)) {
            this.cbs.onattribname(this.sectionStart, this.index);
            this.sectionStart = -1;
            this.state = State.AfterAttributeName;
            this.stateAfterAttributeName(c);
          }
        };
        Tokenizer3.prototype.stateAfterAttributeName = function(c) {
          if (c === CharCodes.Eq) {
            this.state = State.BeforeAttributeValue;
          } else if (c === CharCodes.Slash || c === CharCodes.Gt) {
            this.cbs.onattribend(QuoteType.NoValue, this.index);
            this.state = State.BeforeAttributeName;
            this.stateBeforeAttributeName(c);
          } else if (!isWhitespace(c)) {
            this.cbs.onattribend(QuoteType.NoValue, this.index);
            this.state = State.InAttributeName;
            this.sectionStart = this.index;
          }
        };
        Tokenizer3.prototype.stateBeforeAttributeValue = function(c) {
          if (c === CharCodes.DoubleQuote) {
            this.state = State.InAttributeValueDq;
            this.sectionStart = this.index + 1;
          } else if (c === CharCodes.SingleQuote) {
            this.state = State.InAttributeValueSq;
            this.sectionStart = this.index + 1;
          } else if (!isWhitespace(c)) {
            this.sectionStart = this.index;
            this.state = State.InAttributeValueNq;
            this.stateInAttributeValueNoQuotes(c);
          }
        };
        Tokenizer3.prototype.handleInAttributeValue = function(c, quote) {
          if (c === quote || !this.decodeEntities && this.fastForwardTo(quote)) {
            this.cbs.onattribdata(this.sectionStart, this.index);
            this.sectionStart = -1;
            this.cbs.onattribend(quote === CharCodes.DoubleQuote ? QuoteType.Double : QuoteType.Single, this.index);
            this.state = State.BeforeAttributeName;
          } else if (this.decodeEntities && c === CharCodes.Amp) {
            this.baseState = this.state;
            this.state = State.BeforeEntity;
          }
        };
        Tokenizer3.prototype.stateInAttributeValueDoubleQuotes = function(c) {
          this.handleInAttributeValue(c, CharCodes.DoubleQuote);
        };
        Tokenizer3.prototype.stateInAttributeValueSingleQuotes = function(c) {
          this.handleInAttributeValue(c, CharCodes.SingleQuote);
        };
        Tokenizer3.prototype.stateInAttributeValueNoQuotes = function(c) {
          if (isWhitespace(c) || c === CharCodes.Gt) {
            this.cbs.onattribdata(this.sectionStart, this.index);
            this.sectionStart = -1;
            this.cbs.onattribend(QuoteType.Unquoted, this.index);
            this.state = State.BeforeAttributeName;
            this.stateBeforeAttributeName(c);
          } else if (this.decodeEntities && c === CharCodes.Amp) {
            this.baseState = this.state;
            this.state = State.BeforeEntity;
          }
        };
        Tokenizer3.prototype.stateBeforeDeclaration = function(c) {
          if (c === CharCodes.OpeningSquareBracket) {
            this.state = State.CDATASequence;
            this.sequenceIndex = 0;
          } else {
            this.state = c === CharCodes.Dash ? State.BeforeComment : State.InDeclaration;
          }
        };
        Tokenizer3.prototype.stateInDeclaration = function(c) {
          if (c === CharCodes.Gt || this.fastForwardTo(CharCodes.Gt)) {
            this.cbs.ondeclaration(this.sectionStart, this.index);
            this.state = State.Text;
            this.sectionStart = this.index + 1;
          }
        };
        Tokenizer3.prototype.stateInProcessingInstruction = function(c) {
          if (c === CharCodes.Gt || this.fastForwardTo(CharCodes.Gt)) {
            this.cbs.onprocessinginstruction(this.sectionStart, this.index);
            this.state = State.Text;
            this.sectionStart = this.index + 1;
          }
        };
        Tokenizer3.prototype.stateBeforeComment = function(c) {
          if (c === CharCodes.Dash) {
            this.state = State.InCommentLike;
            this.currentSequence = Sequences.CommentEnd;
            this.sequenceIndex = 2;
            this.sectionStart = this.index + 1;
          } else {
            this.state = State.InDeclaration;
          }
        };
        Tokenizer3.prototype.stateInSpecialComment = function(c) {
          if (c === CharCodes.Gt || this.fastForwardTo(CharCodes.Gt)) {
            this.cbs.oncomment(this.sectionStart, this.index, 0);
            this.state = State.Text;
            this.sectionStart = this.index + 1;
          }
        };
        Tokenizer3.prototype.stateBeforeSpecialS = function(c) {
          var lower = c | 32;
          if (lower === Sequences.ScriptEnd[3]) {
            this.startSpecial(Sequences.ScriptEnd, 4);
          } else if (lower === Sequences.StyleEnd[3]) {
            this.startSpecial(Sequences.StyleEnd, 4);
          } else {
            this.state = State.InTagName;
            this.stateInTagName(c);
          }
        };
        Tokenizer3.prototype.stateBeforeEntity = function(c) {
          this.entityExcess = 1;
          this.entityResult = 0;
          if (c === CharCodes.Number) {
            this.state = State.BeforeNumericEntity;
          } else if (c === CharCodes.Amp) ;
          else {
            this.trieIndex = 0;
            this.trieCurrent = this.entityTrie[0];
            this.state = State.InNamedEntity;
            this.stateInNamedEntity(c);
          }
        };
        Tokenizer3.prototype.stateInNamedEntity = function(c) {
          this.entityExcess += 1;
          this.trieIndex = (0, decode_js_1.determineBranch)(this.entityTrie, this.trieCurrent, this.trieIndex + 1, c);
          if (this.trieIndex < 0) {
            this.emitNamedEntity();
            this.index--;
            return;
          }
          this.trieCurrent = this.entityTrie[this.trieIndex];
          var masked = this.trieCurrent & decode_js_1.BinTrieFlags.VALUE_LENGTH;
          if (masked) {
            var valueLength = (masked >> 14) - 1;
            if (!this.allowLegacyEntity() && c !== CharCodes.Semi) {
              this.trieIndex += valueLength;
            } else {
              var entityStart = this.index - this.entityExcess + 1;
              if (entityStart > this.sectionStart) {
                this.emitPartial(this.sectionStart, entityStart);
              }
              this.entityResult = this.trieIndex;
              this.trieIndex += valueLength;
              this.entityExcess = 0;
              this.sectionStart = this.index + 1;
              if (valueLength === 0) {
                this.emitNamedEntity();
              }
            }
          }
        };
        Tokenizer3.prototype.emitNamedEntity = function() {
          this.state = this.baseState;
          if (this.entityResult === 0) {
            return;
          }
          var valueLength = (this.entityTrie[this.entityResult] & decode_js_1.BinTrieFlags.VALUE_LENGTH) >> 14;
          switch (valueLength) {
            case 1: {
              this.emitCodePoint(this.entityTrie[this.entityResult] & ~decode_js_1.BinTrieFlags.VALUE_LENGTH);
              break;
            }
            case 2: {
              this.emitCodePoint(this.entityTrie[this.entityResult + 1]);
              break;
            }
            case 3: {
              this.emitCodePoint(this.entityTrie[this.entityResult + 1]);
              this.emitCodePoint(this.entityTrie[this.entityResult + 2]);
            }
          }
        };
        Tokenizer3.prototype.stateBeforeNumericEntity = function(c) {
          if ((c | 32) === CharCodes.LowerX) {
            this.entityExcess++;
            this.state = State.InHexEntity;
          } else {
            this.state = State.InNumericEntity;
            this.stateInNumericEntity(c);
          }
        };
        Tokenizer3.prototype.emitNumericEntity = function(strict) {
          var entityStart = this.index - this.entityExcess - 1;
          var numberStart = entityStart + 2 + Number(this.state === State.InHexEntity);
          if (numberStart !== this.index) {
            if (entityStart > this.sectionStart) {
              this.emitPartial(this.sectionStart, entityStart);
            }
            this.sectionStart = this.index + Number(strict);
            this.emitCodePoint((0, decode_js_1.replaceCodePoint)(this.entityResult));
          }
          this.state = this.baseState;
        };
        Tokenizer3.prototype.stateInNumericEntity = function(c) {
          if (c === CharCodes.Semi) {
            this.emitNumericEntity(true);
          } else if (isNumber(c)) {
            this.entityResult = this.entityResult * 10 + (c - CharCodes.Zero);
            this.entityExcess++;
          } else {
            if (this.allowLegacyEntity()) {
              this.emitNumericEntity(false);
            } else {
              this.state = this.baseState;
            }
            this.index--;
          }
        };
        Tokenizer3.prototype.stateInHexEntity = function(c) {
          if (c === CharCodes.Semi) {
            this.emitNumericEntity(true);
          } else if (isNumber(c)) {
            this.entityResult = this.entityResult * 16 + (c - CharCodes.Zero);
            this.entityExcess++;
          } else if (isHexDigit(c)) {
            this.entityResult = this.entityResult * 16 + ((c | 32) - CharCodes.LowerA + 10);
            this.entityExcess++;
          } else {
            if (this.allowLegacyEntity()) {
              this.emitNumericEntity(false);
            } else {
              this.state = this.baseState;
            }
            this.index--;
          }
        };
        Tokenizer3.prototype.allowLegacyEntity = function() {
          return !this.xmlMode && (this.baseState === State.Text || this.baseState === State.InSpecialTag);
        };
        Tokenizer3.prototype.cleanup = function() {
          if (this.running && this.sectionStart !== this.index) {
            if (this.state === State.Text || this.state === State.InSpecialTag && this.sequenceIndex === 0) {
              this.cbs.ontext(this.sectionStart, this.index);
              this.sectionStart = this.index;
            } else if (this.state === State.InAttributeValueDq || this.state === State.InAttributeValueSq || this.state === State.InAttributeValueNq) {
              this.cbs.onattribdata(this.sectionStart, this.index);
              this.sectionStart = this.index;
            }
          }
        };
        Tokenizer3.prototype.shouldContinue = function() {
          return this.index < this.buffer.length + this.offset && this.running;
        };
        Tokenizer3.prototype.parse = function() {
          while (this.shouldContinue()) {
            var c = this.buffer.charCodeAt(this.index - this.offset);
            switch (this.state) {
              case State.Text: {
                this.stateText(c);
                break;
              }
              case State.SpecialStartSequence: {
                this.stateSpecialStartSequence(c);
                break;
              }
              case State.InSpecialTag: {
                this.stateInSpecialTag(c);
                break;
              }
              case State.CDATASequence: {
                this.stateCDATASequence(c);
                break;
              }
              case State.InAttributeValueDq: {
                this.stateInAttributeValueDoubleQuotes(c);
                break;
              }
              case State.InAttributeName: {
                this.stateInAttributeName(c);
                break;
              }
              case State.InCommentLike: {
                this.stateInCommentLike(c);
                break;
              }
              case State.InSpecialComment: {
                this.stateInSpecialComment(c);
                break;
              }
              case State.BeforeAttributeName: {
                this.stateBeforeAttributeName(c);
                break;
              }
              case State.InTagName: {
                this.stateInTagName(c);
                break;
              }
              case State.InClosingTagName: {
                this.stateInClosingTagName(c);
                break;
              }
              case State.BeforeTagName: {
                this.stateBeforeTagName(c);
                break;
              }
              case State.AfterAttributeName: {
                this.stateAfterAttributeName(c);
                break;
              }
              case State.InAttributeValueSq: {
                this.stateInAttributeValueSingleQuotes(c);
                break;
              }
              case State.BeforeAttributeValue: {
                this.stateBeforeAttributeValue(c);
                break;
              }
              case State.BeforeClosingTagName: {
                this.stateBeforeClosingTagName(c);
                break;
              }
              case State.AfterClosingTagName: {
                this.stateAfterClosingTagName(c);
                break;
              }
              case State.BeforeSpecialS: {
                this.stateBeforeSpecialS(c);
                break;
              }
              case State.InAttributeValueNq: {
                this.stateInAttributeValueNoQuotes(c);
                break;
              }
              case State.InSelfClosingTag: {
                this.stateInSelfClosingTag(c);
                break;
              }
              case State.InDeclaration: {
                this.stateInDeclaration(c);
                break;
              }
              case State.BeforeDeclaration: {
                this.stateBeforeDeclaration(c);
                break;
              }
              case State.BeforeComment: {
                this.stateBeforeComment(c);
                break;
              }
              case State.InProcessingInstruction: {
                this.stateInProcessingInstruction(c);
                break;
              }
              case State.InNamedEntity: {
                this.stateInNamedEntity(c);
                break;
              }
              case State.BeforeEntity: {
                this.stateBeforeEntity(c);
                break;
              }
              case State.InHexEntity: {
                this.stateInHexEntity(c);
                break;
              }
              case State.InNumericEntity: {
                this.stateInNumericEntity(c);
                break;
              }
              default: {
                this.stateBeforeNumericEntity(c);
              }
            }
            this.index++;
          }
          this.cleanup();
        };
        Tokenizer3.prototype.finish = function() {
          if (this.state === State.InNamedEntity) {
            this.emitNamedEntity();
          }
          if (this.sectionStart < this.index) {
            this.handleTrailingData();
          }
          this.cbs.onend();
        };
        Tokenizer3.prototype.handleTrailingData = function() {
          var endIndex = this.buffer.length + this.offset;
          if (this.state === State.InCommentLike) {
            if (this.currentSequence === Sequences.CdataEnd) {
              this.cbs.oncdata(this.sectionStart, endIndex, 0);
            } else {
              this.cbs.oncomment(this.sectionStart, endIndex, 0);
            }
          } else if (this.state === State.InNumericEntity && this.allowLegacyEntity()) {
            this.emitNumericEntity(false);
          } else if (this.state === State.InHexEntity && this.allowLegacyEntity()) {
            this.emitNumericEntity(false);
          } else if (this.state === State.InTagName || this.state === State.BeforeAttributeName || this.state === State.BeforeAttributeValue || this.state === State.AfterAttributeName || this.state === State.InAttributeName || this.state === State.InAttributeValueSq || this.state === State.InAttributeValueDq || this.state === State.InAttributeValueNq || this.state === State.InClosingTagName) ;
          else {
            this.cbs.ontext(this.sectionStart, endIndex);
          }
        };
        Tokenizer3.prototype.emitPartial = function(start, endIndex) {
          if (this.baseState !== State.Text && this.baseState !== State.InSpecialTag) {
            this.cbs.onattribdata(start, endIndex);
          } else {
            this.cbs.ontext(start, endIndex);
          }
        };
        Tokenizer3.prototype.emitCodePoint = function(cp) {
          if (this.baseState !== State.Text && this.baseState !== State.InSpecialTag) {
            this.cbs.onattribentity(cp);
          } else {
            this.cbs.ontextentity(cp);
          }
        };
        return Tokenizer3;
      }()
    );
    exports$1.default = Tokenizer2;
  })(Tokenizer);
  return Tokenizer;
}
var hasRequiredParser$1;
function requireParser$1() {
  if (hasRequiredParser$1) return Parser;
  hasRequiredParser$1 = 1;
  var __createBinding = commonjsGlobal && commonjsGlobal.__createBinding || (Object.create ? function(o, m, k, k2) {
    if (k2 === void 0) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() {
        return m[k];
      } };
    }
    Object.defineProperty(o, k2, desc);
  } : function(o, m, k, k2) {
    if (k2 === void 0) k2 = k;
    o[k2] = m[k];
  });
  var __setModuleDefault = commonjsGlobal && commonjsGlobal.__setModuleDefault || (Object.create ? function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
  } : function(o, v) {
    o["default"] = v;
  });
  var __importStar = commonjsGlobal && commonjsGlobal.__importStar || function(mod) {
    if (mod && mod.__esModule) return mod;
    var result2 = {};
    if (mod != null) {
      for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result2, mod, k);
    }
    __setModuleDefault(result2, mod);
    return result2;
  };
  Object.defineProperty(Parser, "__esModule", { value: true });
  Parser.Parser = void 0;
  var Tokenizer_js_1 = __importStar(requireTokenizer());
  var decode_js_1 = requireDecode();
  var formTags = /* @__PURE__ */ new Set([
    "input",
    "option",
    "optgroup",
    "select",
    "button",
    "datalist",
    "textarea"
  ]);
  var pTag = /* @__PURE__ */ new Set(["p"]);
  var tableSectionTags = /* @__PURE__ */ new Set(["thead", "tbody"]);
  var ddtTags = /* @__PURE__ */ new Set(["dd", "dt"]);
  var rtpTags = /* @__PURE__ */ new Set(["rt", "rp"]);
  var openImpliesClose = /* @__PURE__ */ new Map([
    ["tr", /* @__PURE__ */ new Set(["tr", "th", "td"])],
    ["th", /* @__PURE__ */ new Set(["th"])],
    ["td", /* @__PURE__ */ new Set(["thead", "th", "td"])],
    ["body", /* @__PURE__ */ new Set(["head", "link", "script"])],
    ["li", /* @__PURE__ */ new Set(["li"])],
    ["p", pTag],
    ["h1", pTag],
    ["h2", pTag],
    ["h3", pTag],
    ["h4", pTag],
    ["h5", pTag],
    ["h6", pTag],
    ["select", formTags],
    ["input", formTags],
    ["output", formTags],
    ["button", formTags],
    ["datalist", formTags],
    ["textarea", formTags],
    ["option", /* @__PURE__ */ new Set(["option"])],
    ["optgroup", /* @__PURE__ */ new Set(["optgroup", "option"])],
    ["dd", ddtTags],
    ["dt", ddtTags],
    ["address", pTag],
    ["article", pTag],
    ["aside", pTag],
    ["blockquote", pTag],
    ["details", pTag],
    ["div", pTag],
    ["dl", pTag],
    ["fieldset", pTag],
    ["figcaption", pTag],
    ["figure", pTag],
    ["footer", pTag],
    ["form", pTag],
    ["header", pTag],
    ["hr", pTag],
    ["main", pTag],
    ["nav", pTag],
    ["ol", pTag],
    ["pre", pTag],
    ["section", pTag],
    ["table", pTag],
    ["ul", pTag],
    ["rt", rtpTags],
    ["rp", rtpTags],
    ["tbody", tableSectionTags],
    ["tfoot", tableSectionTags]
  ]);
  var voidElements = /* @__PURE__ */ new Set([
    "area",
    "base",
    "basefont",
    "br",
    "col",
    "command",
    "embed",
    "frame",
    "hr",
    "img",
    "input",
    "isindex",
    "keygen",
    "link",
    "meta",
    "param",
    "source",
    "track",
    "wbr"
  ]);
  var foreignContextElements = /* @__PURE__ */ new Set(["math", "svg"]);
  var htmlIntegrationElements = /* @__PURE__ */ new Set([
    "mi",
    "mo",
    "mn",
    "ms",
    "mtext",
    "annotation-xml",
    "foreignobject",
    "desc",
    "title"
  ]);
  var reNameEnd = /\s|\//;
  var Parser$1 = (
    /** @class */
    function() {
      function Parser2(cbs, options2) {
        if (options2 === void 0) {
          options2 = {};
        }
        var _a, _b, _c, _d, _e;
        this.options = options2;
        this.startIndex = 0;
        this.endIndex = 0;
        this.openTagStart = 0;
        this.tagname = "";
        this.attribname = "";
        this.attribvalue = "";
        this.attribs = null;
        this.stack = [];
        this.foreignContext = [];
        this.buffers = [];
        this.bufferOffset = 0;
        this.writeIndex = 0;
        this.ended = false;
        this.cbs = cbs !== null && cbs !== void 0 ? cbs : {};
        this.lowerCaseTagNames = (_a = options2.lowerCaseTags) !== null && _a !== void 0 ? _a : !options2.xmlMode;
        this.lowerCaseAttributeNames = (_b = options2.lowerCaseAttributeNames) !== null && _b !== void 0 ? _b : !options2.xmlMode;
        this.tokenizer = new ((_c = options2.Tokenizer) !== null && _c !== void 0 ? _c : Tokenizer_js_1.default)(this.options, this);
        (_e = (_d = this.cbs).onparserinit) === null || _e === void 0 ? void 0 : _e.call(_d, this);
      }
      Parser2.prototype.ontext = function(start, endIndex) {
        var _a, _b;
        var data = this.getSlice(start, endIndex);
        this.endIndex = endIndex - 1;
        (_b = (_a = this.cbs).ontext) === null || _b === void 0 ? void 0 : _b.call(_a, data);
        this.startIndex = endIndex;
      };
      Parser2.prototype.ontextentity = function(cp) {
        var _a, _b;
        var index2 = this.tokenizer.getSectionStart();
        this.endIndex = index2 - 1;
        (_b = (_a = this.cbs).ontext) === null || _b === void 0 ? void 0 : _b.call(_a, (0, decode_js_1.fromCodePoint)(cp));
        this.startIndex = index2;
      };
      Parser2.prototype.isVoidElement = function(name) {
        return !this.options.xmlMode && voidElements.has(name);
      };
      Parser2.prototype.onopentagname = function(start, endIndex) {
        this.endIndex = endIndex;
        var name = this.getSlice(start, endIndex);
        if (this.lowerCaseTagNames) {
          name = name.toLowerCase();
        }
        this.emitOpenTag(name);
      };
      Parser2.prototype.emitOpenTag = function(name) {
        var _a, _b, _c, _d;
        this.openTagStart = this.startIndex;
        this.tagname = name;
        var impliesClose = !this.options.xmlMode && openImpliesClose.get(name);
        if (impliesClose) {
          while (this.stack.length > 0 && impliesClose.has(this.stack[this.stack.length - 1])) {
            var element = this.stack.pop();
            (_b = (_a = this.cbs).onclosetag) === null || _b === void 0 ? void 0 : _b.call(_a, element, true);
          }
        }
        if (!this.isVoidElement(name)) {
          this.stack.push(name);
          if (foreignContextElements.has(name)) {
            this.foreignContext.push(true);
          } else if (htmlIntegrationElements.has(name)) {
            this.foreignContext.push(false);
          }
        }
        (_d = (_c = this.cbs).onopentagname) === null || _d === void 0 ? void 0 : _d.call(_c, name);
        if (this.cbs.onopentag)
          this.attribs = {};
      };
      Parser2.prototype.endOpenTag = function(isImplied) {
        var _a, _b;
        this.startIndex = this.openTagStart;
        if (this.attribs) {
          (_b = (_a = this.cbs).onopentag) === null || _b === void 0 ? void 0 : _b.call(_a, this.tagname, this.attribs, isImplied);
          this.attribs = null;
        }
        if (this.cbs.onclosetag && this.isVoidElement(this.tagname)) {
          this.cbs.onclosetag(this.tagname, true);
        }
        this.tagname = "";
      };
      Parser2.prototype.onopentagend = function(endIndex) {
        this.endIndex = endIndex;
        this.endOpenTag(false);
        this.startIndex = endIndex + 1;
      };
      Parser2.prototype.onclosetag = function(start, endIndex) {
        var _a, _b, _c, _d, _e, _f;
        this.endIndex = endIndex;
        var name = this.getSlice(start, endIndex);
        if (this.lowerCaseTagNames) {
          name = name.toLowerCase();
        }
        if (foreignContextElements.has(name) || htmlIntegrationElements.has(name)) {
          this.foreignContext.pop();
        }
        if (!this.isVoidElement(name)) {
          var pos = this.stack.lastIndexOf(name);
          if (pos !== -1) {
            if (this.cbs.onclosetag) {
              var count = this.stack.length - pos;
              while (count--) {
                this.cbs.onclosetag(this.stack.pop(), count !== 0);
              }
            } else
              this.stack.length = pos;
          } else if (!this.options.xmlMode && name === "p") {
            this.emitOpenTag("p");
            this.closeCurrentTag(true);
          }
        } else if (!this.options.xmlMode && name === "br") {
          (_b = (_a = this.cbs).onopentagname) === null || _b === void 0 ? void 0 : _b.call(_a, "br");
          (_d = (_c = this.cbs).onopentag) === null || _d === void 0 ? void 0 : _d.call(_c, "br", {}, true);
          (_f = (_e = this.cbs).onclosetag) === null || _f === void 0 ? void 0 : _f.call(_e, "br", false);
        }
        this.startIndex = endIndex + 1;
      };
      Parser2.prototype.onselfclosingtag = function(endIndex) {
        this.endIndex = endIndex;
        if (this.options.xmlMode || this.options.recognizeSelfClosing || this.foreignContext[this.foreignContext.length - 1]) {
          this.closeCurrentTag(false);
          this.startIndex = endIndex + 1;
        } else {
          this.onopentagend(endIndex);
        }
      };
      Parser2.prototype.closeCurrentTag = function(isOpenImplied) {
        var _a, _b;
        var name = this.tagname;
        this.endOpenTag(isOpenImplied);
        if (this.stack[this.stack.length - 1] === name) {
          (_b = (_a = this.cbs).onclosetag) === null || _b === void 0 ? void 0 : _b.call(_a, name, !isOpenImplied);
          this.stack.pop();
        }
      };
      Parser2.prototype.onattribname = function(start, endIndex) {
        this.startIndex = start;
        var name = this.getSlice(start, endIndex);
        this.attribname = this.lowerCaseAttributeNames ? name.toLowerCase() : name;
      };
      Parser2.prototype.onattribdata = function(start, endIndex) {
        this.attribvalue += this.getSlice(start, endIndex);
      };
      Parser2.prototype.onattribentity = function(cp) {
        this.attribvalue += (0, decode_js_1.fromCodePoint)(cp);
      };
      Parser2.prototype.onattribend = function(quote, endIndex) {
        var _a, _b;
        this.endIndex = endIndex;
        (_b = (_a = this.cbs).onattribute) === null || _b === void 0 ? void 0 : _b.call(_a, this.attribname, this.attribvalue, quote === Tokenizer_js_1.QuoteType.Double ? '"' : quote === Tokenizer_js_1.QuoteType.Single ? "'" : quote === Tokenizer_js_1.QuoteType.NoValue ? void 0 : null);
        if (this.attribs && !Object.prototype.hasOwnProperty.call(this.attribs, this.attribname)) {
          this.attribs[this.attribname] = this.attribvalue;
        }
        this.attribvalue = "";
      };
      Parser2.prototype.getInstructionName = function(value) {
        var index2 = value.search(reNameEnd);
        var name = index2 < 0 ? value : value.substr(0, index2);
        if (this.lowerCaseTagNames) {
          name = name.toLowerCase();
        }
        return name;
      };
      Parser2.prototype.ondeclaration = function(start, endIndex) {
        this.endIndex = endIndex;
        var value = this.getSlice(start, endIndex);
        if (this.cbs.onprocessinginstruction) {
          var name = this.getInstructionName(value);
          this.cbs.onprocessinginstruction("!".concat(name), "!".concat(value));
        }
        this.startIndex = endIndex + 1;
      };
      Parser2.prototype.onprocessinginstruction = function(start, endIndex) {
        this.endIndex = endIndex;
        var value = this.getSlice(start, endIndex);
        if (this.cbs.onprocessinginstruction) {
          var name = this.getInstructionName(value);
          this.cbs.onprocessinginstruction("?".concat(name), "?".concat(value));
        }
        this.startIndex = endIndex + 1;
      };
      Parser2.prototype.oncomment = function(start, endIndex, offset) {
        var _a, _b, _c, _d;
        this.endIndex = endIndex;
        (_b = (_a = this.cbs).oncomment) === null || _b === void 0 ? void 0 : _b.call(_a, this.getSlice(start, endIndex - offset));
        (_d = (_c = this.cbs).oncommentend) === null || _d === void 0 ? void 0 : _d.call(_c);
        this.startIndex = endIndex + 1;
      };
      Parser2.prototype.oncdata = function(start, endIndex, offset) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
        this.endIndex = endIndex;
        var value = this.getSlice(start, endIndex - offset);
        if (this.options.xmlMode || this.options.recognizeCDATA) {
          (_b = (_a = this.cbs).oncdatastart) === null || _b === void 0 ? void 0 : _b.call(_a);
          (_d = (_c = this.cbs).ontext) === null || _d === void 0 ? void 0 : _d.call(_c, value);
          (_f = (_e = this.cbs).oncdataend) === null || _f === void 0 ? void 0 : _f.call(_e);
        } else {
          (_h = (_g = this.cbs).oncomment) === null || _h === void 0 ? void 0 : _h.call(_g, "[CDATA[".concat(value, "]]"));
          (_k = (_j = this.cbs).oncommentend) === null || _k === void 0 ? void 0 : _k.call(_j);
        }
        this.startIndex = endIndex + 1;
      };
      Parser2.prototype.onend = function() {
        var _a, _b;
        if (this.cbs.onclosetag) {
          this.endIndex = this.startIndex;
          for (var index2 = this.stack.length; index2 > 0; this.cbs.onclosetag(this.stack[--index2], true))
            ;
        }
        (_b = (_a = this.cbs).onend) === null || _b === void 0 ? void 0 : _b.call(_a);
      };
      Parser2.prototype.reset = function() {
        var _a, _b, _c, _d;
        (_b = (_a = this.cbs).onreset) === null || _b === void 0 ? void 0 : _b.call(_a);
        this.tokenizer.reset();
        this.tagname = "";
        this.attribname = "";
        this.attribs = null;
        this.stack.length = 0;
        this.startIndex = 0;
        this.endIndex = 0;
        (_d = (_c = this.cbs).onparserinit) === null || _d === void 0 ? void 0 : _d.call(_c, this);
        this.buffers.length = 0;
        this.bufferOffset = 0;
        this.writeIndex = 0;
        this.ended = false;
      };
      Parser2.prototype.parseComplete = function(data) {
        this.reset();
        this.end(data);
      };
      Parser2.prototype.getSlice = function(start, end) {
        while (start - this.bufferOffset >= this.buffers[0].length) {
          this.shiftBuffer();
        }
        var slice = this.buffers[0].slice(start - this.bufferOffset, end - this.bufferOffset);
        while (end - this.bufferOffset > this.buffers[0].length) {
          this.shiftBuffer();
          slice += this.buffers[0].slice(0, end - this.bufferOffset);
        }
        return slice;
      };
      Parser2.prototype.shiftBuffer = function() {
        this.bufferOffset += this.buffers[0].length;
        this.writeIndex--;
        this.buffers.shift();
      };
      Parser2.prototype.write = function(chunk) {
        var _a, _b;
        if (this.ended) {
          (_b = (_a = this.cbs).onerror) === null || _b === void 0 ? void 0 : _b.call(_a, new Error(".write() after done!"));
          return;
        }
        this.buffers.push(chunk);
        if (this.tokenizer.running) {
          this.tokenizer.write(chunk);
          this.writeIndex++;
        }
      };
      Parser2.prototype.end = function(chunk) {
        var _a, _b;
        if (this.ended) {
          (_b = (_a = this.cbs).onerror) === null || _b === void 0 ? void 0 : _b.call(_a, new Error(".end() after done!"));
          return;
        }
        if (chunk)
          this.write(chunk);
        this.ended = true;
        this.tokenizer.end();
      };
      Parser2.prototype.pause = function() {
        this.tokenizer.pause();
      };
      Parser2.prototype.resume = function() {
        this.tokenizer.resume();
        while (this.tokenizer.running && this.writeIndex < this.buffers.length) {
          this.tokenizer.write(this.buffers[this.writeIndex++]);
        }
        if (this.ended)
          this.tokenizer.end();
      };
      Parser2.prototype.parseChunk = function(chunk) {
        this.write(chunk);
      };
      Parser2.prototype.done = function(chunk) {
        this.end(chunk);
      };
      return Parser2;
    }()
  );
  Parser.Parser = Parser$1;
  return Parser;
}
var lib$4 = {};
var lib$3 = {};
var hasRequiredLib$5;
function requireLib$5() {
  if (hasRequiredLib$5) return lib$3;
  hasRequiredLib$5 = 1;
  (function(exports$1) {
    Object.defineProperty(exports$1, "__esModule", { value: true });
    exports$1.Doctype = exports$1.CDATA = exports$1.Tag = exports$1.Style = exports$1.Script = exports$1.Comment = exports$1.Directive = exports$1.Text = exports$1.Root = exports$1.isTag = exports$1.ElementType = void 0;
    var ElementType;
    (function(ElementType2) {
      ElementType2["Root"] = "root";
      ElementType2["Text"] = "text";
      ElementType2["Directive"] = "directive";
      ElementType2["Comment"] = "comment";
      ElementType2["Script"] = "script";
      ElementType2["Style"] = "style";
      ElementType2["Tag"] = "tag";
      ElementType2["CDATA"] = "cdata";
      ElementType2["Doctype"] = "doctype";
    })(ElementType = exports$1.ElementType || (exports$1.ElementType = {}));
    function isTag(elem) {
      return elem.type === ElementType.Tag || elem.type === ElementType.Script || elem.type === ElementType.Style;
    }
    exports$1.isTag = isTag;
    exports$1.Root = ElementType.Root;
    exports$1.Text = ElementType.Text;
    exports$1.Directive = ElementType.Directive;
    exports$1.Comment = ElementType.Comment;
    exports$1.Script = ElementType.Script;
    exports$1.Style = ElementType.Style;
    exports$1.Tag = ElementType.Tag;
    exports$1.CDATA = ElementType.CDATA;
    exports$1.Doctype = ElementType.Doctype;
  })(lib$3);
  return lib$3;
}
var node$1 = {};
var hasRequiredNode$1;
function requireNode$1() {
  if (hasRequiredNode$1) return node$1;
  hasRequiredNode$1 = 1;
  var __extends = commonjsGlobal && commonjsGlobal.__extends || /* @__PURE__ */ function() {
    var extendStatics = function(d, b) {
      extendStatics = Object.setPrototypeOf || { __proto__: [] } instanceof Array && function(d2, b2) {
        d2.__proto__ = b2;
      } || function(d2, b2) {
        for (var p in b2) if (Object.prototype.hasOwnProperty.call(b2, p)) d2[p] = b2[p];
      };
      return extendStatics(d, b);
    };
    return function(d, b) {
      if (typeof b !== "function" && b !== null)
        throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
      extendStatics(d, b);
      function __() {
        this.constructor = d;
      }
      d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
  }();
  var __assign = commonjsGlobal && commonjsGlobal.__assign || function() {
    __assign = Object.assign || function(t) {
      for (var s, i = 1, n = arguments.length; i < n; i++) {
        s = arguments[i];
        for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
          t[p] = s[p];
      }
      return t;
    };
    return __assign.apply(this, arguments);
  };
  Object.defineProperty(node$1, "__esModule", { value: true });
  node$1.cloneNode = node$1.hasChildren = node$1.isDocument = node$1.isDirective = node$1.isComment = node$1.isText = node$1.isCDATA = node$1.isTag = node$1.Element = node$1.Document = node$1.CDATA = node$1.NodeWithChildren = node$1.ProcessingInstruction = node$1.Comment = node$1.Text = node$1.DataNode = node$1.Node = void 0;
  var domelementtype_1 = requireLib$5();
  var Node = (
    /** @class */
    function() {
      function Node2() {
        this.parent = null;
        this.prev = null;
        this.next = null;
        this.startIndex = null;
        this.endIndex = null;
      }
      Object.defineProperty(Node2.prototype, "parentNode", {
        // Read-write aliases for properties
        /**
         * Same as {@link parent}.
         * [DOM spec](https://dom.spec.whatwg.org)-compatible alias.
         */
        get: function() {
          return this.parent;
        },
        set: function(parent) {
          this.parent = parent;
        },
        enumerable: false,
        configurable: true
      });
      Object.defineProperty(Node2.prototype, "previousSibling", {
        /**
         * Same as {@link prev}.
         * [DOM spec](https://dom.spec.whatwg.org)-compatible alias.
         */
        get: function() {
          return this.prev;
        },
        set: function(prev) {
          this.prev = prev;
        },
        enumerable: false,
        configurable: true
      });
      Object.defineProperty(Node2.prototype, "nextSibling", {
        /**
         * Same as {@link next}.
         * [DOM spec](https://dom.spec.whatwg.org)-compatible alias.
         */
        get: function() {
          return this.next;
        },
        set: function(next) {
          this.next = next;
        },
        enumerable: false,
        configurable: true
      });
      Node2.prototype.cloneNode = function(recursive) {
        if (recursive === void 0) {
          recursive = false;
        }
        return cloneNode(this, recursive);
      };
      return Node2;
    }()
  );
  node$1.Node = Node;
  var DataNode = (
    /** @class */
    function(_super) {
      __extends(DataNode2, _super);
      function DataNode2(data) {
        var _this = _super.call(this) || this;
        _this.data = data;
        return _this;
      }
      Object.defineProperty(DataNode2.prototype, "nodeValue", {
        /**
         * Same as {@link data}.
         * [DOM spec](https://dom.spec.whatwg.org)-compatible alias.
         */
        get: function() {
          return this.data;
        },
        set: function(data) {
          this.data = data;
        },
        enumerable: false,
        configurable: true
      });
      return DataNode2;
    }(Node)
  );
  node$1.DataNode = DataNode;
  var Text = (
    /** @class */
    function(_super) {
      __extends(Text2, _super);
      function Text2() {
        var _this = _super !== null && _super.apply(this, arguments) || this;
        _this.type = domelementtype_1.ElementType.Text;
        return _this;
      }
      Object.defineProperty(Text2.prototype, "nodeType", {
        get: function() {
          return 3;
        },
        enumerable: false,
        configurable: true
      });
      return Text2;
    }(DataNode)
  );
  node$1.Text = Text;
  var Comment = (
    /** @class */
    function(_super) {
      __extends(Comment2, _super);
      function Comment2() {
        var _this = _super !== null && _super.apply(this, arguments) || this;
        _this.type = domelementtype_1.ElementType.Comment;
        return _this;
      }
      Object.defineProperty(Comment2.prototype, "nodeType", {
        get: function() {
          return 8;
        },
        enumerable: false,
        configurable: true
      });
      return Comment2;
    }(DataNode)
  );
  node$1.Comment = Comment;
  var ProcessingInstruction = (
    /** @class */
    function(_super) {
      __extends(ProcessingInstruction2, _super);
      function ProcessingInstruction2(name, data) {
        var _this = _super.call(this, data) || this;
        _this.name = name;
        _this.type = domelementtype_1.ElementType.Directive;
        return _this;
      }
      Object.defineProperty(ProcessingInstruction2.prototype, "nodeType", {
        get: function() {
          return 1;
        },
        enumerable: false,
        configurable: true
      });
      return ProcessingInstruction2;
    }(DataNode)
  );
  node$1.ProcessingInstruction = ProcessingInstruction;
  var NodeWithChildren = (
    /** @class */
    function(_super) {
      __extends(NodeWithChildren2, _super);
      function NodeWithChildren2(children) {
        var _this = _super.call(this) || this;
        _this.children = children;
        return _this;
      }
      Object.defineProperty(NodeWithChildren2.prototype, "firstChild", {
        // Aliases
        /** First child of the node. */
        get: function() {
          var _a;
          return (_a = this.children[0]) !== null && _a !== void 0 ? _a : null;
        },
        enumerable: false,
        configurable: true
      });
      Object.defineProperty(NodeWithChildren2.prototype, "lastChild", {
        /** Last child of the node. */
        get: function() {
          return this.children.length > 0 ? this.children[this.children.length - 1] : null;
        },
        enumerable: false,
        configurable: true
      });
      Object.defineProperty(NodeWithChildren2.prototype, "childNodes", {
        /**
         * Same as {@link children}.
         * [DOM spec](https://dom.spec.whatwg.org)-compatible alias.
         */
        get: function() {
          return this.children;
        },
        set: function(children) {
          this.children = children;
        },
        enumerable: false,
        configurable: true
      });
      return NodeWithChildren2;
    }(Node)
  );
  node$1.NodeWithChildren = NodeWithChildren;
  var CDATA = (
    /** @class */
    function(_super) {
      __extends(CDATA2, _super);
      function CDATA2() {
        var _this = _super !== null && _super.apply(this, arguments) || this;
        _this.type = domelementtype_1.ElementType.CDATA;
        return _this;
      }
      Object.defineProperty(CDATA2.prototype, "nodeType", {
        get: function() {
          return 4;
        },
        enumerable: false,
        configurable: true
      });
      return CDATA2;
    }(NodeWithChildren)
  );
  node$1.CDATA = CDATA;
  var Document = (
    /** @class */
    function(_super) {
      __extends(Document2, _super);
      function Document2() {
        var _this = _super !== null && _super.apply(this, arguments) || this;
        _this.type = domelementtype_1.ElementType.Root;
        return _this;
      }
      Object.defineProperty(Document2.prototype, "nodeType", {
        get: function() {
          return 9;
        },
        enumerable: false,
        configurable: true
      });
      return Document2;
    }(NodeWithChildren)
  );
  node$1.Document = Document;
  var Element = (
    /** @class */
    function(_super) {
      __extends(Element2, _super);
      function Element2(name, attribs, children, type) {
        if (children === void 0) {
          children = [];
        }
        if (type === void 0) {
          type = name === "script" ? domelementtype_1.ElementType.Script : name === "style" ? domelementtype_1.ElementType.Style : domelementtype_1.ElementType.Tag;
        }
        var _this = _super.call(this, children) || this;
        _this.name = name;
        _this.attribs = attribs;
        _this.type = type;
        return _this;
      }
      Object.defineProperty(Element2.prototype, "nodeType", {
        get: function() {
          return 1;
        },
        enumerable: false,
        configurable: true
      });
      Object.defineProperty(Element2.prototype, "tagName", {
        // DOM Level 1 aliases
        /**
         * Same as {@link name}.
         * [DOM spec](https://dom.spec.whatwg.org)-compatible alias.
         */
        get: function() {
          return this.name;
        },
        set: function(name) {
          this.name = name;
        },
        enumerable: false,
        configurable: true
      });
      Object.defineProperty(Element2.prototype, "attributes", {
        get: function() {
          var _this = this;
          return Object.keys(this.attribs).map(function(name) {
            var _a, _b;
            return {
              name,
              value: _this.attribs[name],
              namespace: (_a = _this["x-attribsNamespace"]) === null || _a === void 0 ? void 0 : _a[name],
              prefix: (_b = _this["x-attribsPrefix"]) === null || _b === void 0 ? void 0 : _b[name]
            };
          });
        },
        enumerable: false,
        configurable: true
      });
      return Element2;
    }(NodeWithChildren)
  );
  node$1.Element = Element;
  function isTag(node2) {
    return (0, domelementtype_1.isTag)(node2);
  }
  node$1.isTag = isTag;
  function isCDATA(node2) {
    return node2.type === domelementtype_1.ElementType.CDATA;
  }
  node$1.isCDATA = isCDATA;
  function isText(node2) {
    return node2.type === domelementtype_1.ElementType.Text;
  }
  node$1.isText = isText;
  function isComment(node2) {
    return node2.type === domelementtype_1.ElementType.Comment;
  }
  node$1.isComment = isComment;
  function isDirective(node2) {
    return node2.type === domelementtype_1.ElementType.Directive;
  }
  node$1.isDirective = isDirective;
  function isDocument(node2) {
    return node2.type === domelementtype_1.ElementType.Root;
  }
  node$1.isDocument = isDocument;
  function hasChildren(node2) {
    return Object.prototype.hasOwnProperty.call(node2, "children");
  }
  node$1.hasChildren = hasChildren;
  function cloneNode(node2, recursive) {
    if (recursive === void 0) {
      recursive = false;
    }
    var result2;
    if (isText(node2)) {
      result2 = new Text(node2.data);
    } else if (isComment(node2)) {
      result2 = new Comment(node2.data);
    } else if (isTag(node2)) {
      var children = recursive ? cloneChildren(node2.children) : [];
      var clone_1 = new Element(node2.name, __assign({}, node2.attribs), children);
      children.forEach(function(child) {
        return child.parent = clone_1;
      });
      if (node2.namespace != null) {
        clone_1.namespace = node2.namespace;
      }
      if (node2["x-attribsNamespace"]) {
        clone_1["x-attribsNamespace"] = __assign({}, node2["x-attribsNamespace"]);
      }
      if (node2["x-attribsPrefix"]) {
        clone_1["x-attribsPrefix"] = __assign({}, node2["x-attribsPrefix"]);
      }
      result2 = clone_1;
    } else if (isCDATA(node2)) {
      var children = recursive ? cloneChildren(node2.children) : [];
      var clone_2 = new CDATA(children);
      children.forEach(function(child) {
        return child.parent = clone_2;
      });
      result2 = clone_2;
    } else if (isDocument(node2)) {
      var children = recursive ? cloneChildren(node2.children) : [];
      var clone_3 = new Document(children);
      children.forEach(function(child) {
        return child.parent = clone_3;
      });
      if (node2["x-mode"]) {
        clone_3["x-mode"] = node2["x-mode"];
      }
      result2 = clone_3;
    } else if (isDirective(node2)) {
      var instruction = new ProcessingInstruction(node2.name, node2.data);
      if (node2["x-name"] != null) {
        instruction["x-name"] = node2["x-name"];
        instruction["x-publicId"] = node2["x-publicId"];
        instruction["x-systemId"] = node2["x-systemId"];
      }
      result2 = instruction;
    } else {
      throw new Error("Not implemented yet: ".concat(node2.type));
    }
    result2.startIndex = node2.startIndex;
    result2.endIndex = node2.endIndex;
    if (node2.sourceCodeLocation != null) {
      result2.sourceCodeLocation = node2.sourceCodeLocation;
    }
    return result2;
  }
  node$1.cloneNode = cloneNode;
  function cloneChildren(childs) {
    var children = childs.map(function(child) {
      return cloneNode(child, true);
    });
    for (var i = 1; i < children.length; i++) {
      children[i].prev = children[i - 1];
      children[i - 1].next = children[i];
    }
    return children;
  }
  return node$1;
}
var hasRequiredLib$4;
function requireLib$4() {
  if (hasRequiredLib$4) return lib$4;
  hasRequiredLib$4 = 1;
  (function(exports$1) {
    var __createBinding = commonjsGlobal && commonjsGlobal.__createBinding || (Object.create ? function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    } : function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    });
    var __exportStar = commonjsGlobal && commonjsGlobal.__exportStar || function(m, exports$12) {
      for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports$12, p)) __createBinding(exports$12, m, p);
    };
    Object.defineProperty(exports$1, "__esModule", { value: true });
    exports$1.DomHandler = void 0;
    var domelementtype_1 = requireLib$5();
    var node_js_1 = requireNode$1();
    __exportStar(requireNode$1(), exports$1);
    var defaultOpts = {
      withStartIndices: false,
      withEndIndices: false,
      xmlMode: false
    };
    var DomHandler = (
      /** @class */
      function() {
        function DomHandler2(callback, options2, elementCB) {
          this.dom = [];
          this.root = new node_js_1.Document(this.dom);
          this.done = false;
          this.tagStack = [this.root];
          this.lastNode = null;
          this.parser = null;
          if (typeof options2 === "function") {
            elementCB = options2;
            options2 = defaultOpts;
          }
          if (typeof callback === "object") {
            options2 = callback;
            callback = void 0;
          }
          this.callback = callback !== null && callback !== void 0 ? callback : null;
          this.options = options2 !== null && options2 !== void 0 ? options2 : defaultOpts;
          this.elementCB = elementCB !== null && elementCB !== void 0 ? elementCB : null;
        }
        DomHandler2.prototype.onparserinit = function(parser2) {
          this.parser = parser2;
        };
        DomHandler2.prototype.onreset = function() {
          this.dom = [];
          this.root = new node_js_1.Document(this.dom);
          this.done = false;
          this.tagStack = [this.root];
          this.lastNode = null;
          this.parser = null;
        };
        DomHandler2.prototype.onend = function() {
          if (this.done)
            return;
          this.done = true;
          this.parser = null;
          this.handleCallback(null);
        };
        DomHandler2.prototype.onerror = function(error) {
          this.handleCallback(error);
        };
        DomHandler2.prototype.onclosetag = function() {
          this.lastNode = null;
          var elem = this.tagStack.pop();
          if (this.options.withEndIndices) {
            elem.endIndex = this.parser.endIndex;
          }
          if (this.elementCB)
            this.elementCB(elem);
        };
        DomHandler2.prototype.onopentag = function(name, attribs) {
          var type = this.options.xmlMode ? domelementtype_1.ElementType.Tag : void 0;
          var element = new node_js_1.Element(name, attribs, void 0, type);
          this.addNode(element);
          this.tagStack.push(element);
        };
        DomHandler2.prototype.ontext = function(data) {
          var lastNode = this.lastNode;
          if (lastNode && lastNode.type === domelementtype_1.ElementType.Text) {
            lastNode.data += data;
            if (this.options.withEndIndices) {
              lastNode.endIndex = this.parser.endIndex;
            }
          } else {
            var node2 = new node_js_1.Text(data);
            this.addNode(node2);
            this.lastNode = node2;
          }
        };
        DomHandler2.prototype.oncomment = function(data) {
          if (this.lastNode && this.lastNode.type === domelementtype_1.ElementType.Comment) {
            this.lastNode.data += data;
            return;
          }
          var node2 = new node_js_1.Comment(data);
          this.addNode(node2);
          this.lastNode = node2;
        };
        DomHandler2.prototype.oncommentend = function() {
          this.lastNode = null;
        };
        DomHandler2.prototype.oncdatastart = function() {
          var text = new node_js_1.Text("");
          var node2 = new node_js_1.CDATA([text]);
          this.addNode(node2);
          text.parent = node2;
          this.lastNode = text;
        };
        DomHandler2.prototype.oncdataend = function() {
          this.lastNode = null;
        };
        DomHandler2.prototype.onprocessinginstruction = function(name, data) {
          var node2 = new node_js_1.ProcessingInstruction(name, data);
          this.addNode(node2);
        };
        DomHandler2.prototype.handleCallback = function(error) {
          if (typeof this.callback === "function") {
            this.callback(error, this.dom);
          } else if (error) {
            throw error;
          }
        };
        DomHandler2.prototype.addNode = function(node2) {
          var parent = this.tagStack[this.tagStack.length - 1];
          var previousSibling = parent.children[parent.children.length - 1];
          if (this.options.withStartIndices) {
            node2.startIndex = this.parser.startIndex;
          }
          if (this.options.withEndIndices) {
            node2.endIndex = this.parser.endIndex;
          }
          parent.children.push(node2);
          if (previousSibling) {
            node2.prev = previousSibling;
            previousSibling.next = node2;
          }
          node2.parent = parent;
          this.lastNode = null;
        };
        return DomHandler2;
      }()
    );
    exports$1.DomHandler = DomHandler;
    exports$1.default = DomHandler;
  })(lib$4);
  return lib$4;
}
var lib$2 = {};
var stringify = {};
var lib$1 = {};
var lib = {};
var encode = {};
var encodeHtml = {};
var hasRequiredEncodeHtml;
function requireEncodeHtml() {
  if (hasRequiredEncodeHtml) return encodeHtml;
  hasRequiredEncodeHtml = 1;
  Object.defineProperty(encodeHtml, "__esModule", { value: true });
  function restoreDiff(arr) {
    for (var i = 1; i < arr.length; i++) {
      arr[i][0] += arr[i - 1][0] + 1;
    }
    return arr;
  }
  encodeHtml.default = new Map(/* @__PURE__ */ restoreDiff([[9, "&Tab;"], [0, "&NewLine;"], [22, "&excl;"], [0, "&quot;"], [0, "&num;"], [0, "&dollar;"], [0, "&percnt;"], [0, "&amp;"], [0, "&apos;"], [0, "&lpar;"], [0, "&rpar;"], [0, "&ast;"], [0, "&plus;"], [0, "&comma;"], [1, "&period;"], [0, "&sol;"], [10, "&colon;"], [0, "&semi;"], [0, { v: "&lt;", n: 8402, o: "&nvlt;" }], [0, { v: "&equals;", n: 8421, o: "&bne;" }], [0, { v: "&gt;", n: 8402, o: "&nvgt;" }], [0, "&quest;"], [0, "&commat;"], [26, "&lbrack;"], [0, "&bsol;"], [0, "&rbrack;"], [0, "&Hat;"], [0, "&lowbar;"], [0, "&DiacriticalGrave;"], [5, { n: 106, o: "&fjlig;" }], [20, "&lbrace;"], [0, "&verbar;"], [0, "&rbrace;"], [34, "&nbsp;"], [0, "&iexcl;"], [0, "&cent;"], [0, "&pound;"], [0, "&curren;"], [0, "&yen;"], [0, "&brvbar;"], [0, "&sect;"], [0, "&die;"], [0, "&copy;"], [0, "&ordf;"], [0, "&laquo;"], [0, "&not;"], [0, "&shy;"], [0, "&circledR;"], [0, "&macr;"], [0, "&deg;"], [0, "&PlusMinus;"], [0, "&sup2;"], [0, "&sup3;"], [0, "&acute;"], [0, "&micro;"], [0, "&para;"], [0, "&centerdot;"], [0, "&cedil;"], [0, "&sup1;"], [0, "&ordm;"], [0, "&raquo;"], [0, "&frac14;"], [0, "&frac12;"], [0, "&frac34;"], [0, "&iquest;"], [0, "&Agrave;"], [0, "&Aacute;"], [0, "&Acirc;"], [0, "&Atilde;"], [0, "&Auml;"], [0, "&angst;"], [0, "&AElig;"], [0, "&Ccedil;"], [0, "&Egrave;"], [0, "&Eacute;"], [0, "&Ecirc;"], [0, "&Euml;"], [0, "&Igrave;"], [0, "&Iacute;"], [0, "&Icirc;"], [0, "&Iuml;"], [0, "&ETH;"], [0, "&Ntilde;"], [0, "&Ograve;"], [0, "&Oacute;"], [0, "&Ocirc;"], [0, "&Otilde;"], [0, "&Ouml;"], [0, "&times;"], [0, "&Oslash;"], [0, "&Ugrave;"], [0, "&Uacute;"], [0, "&Ucirc;"], [0, "&Uuml;"], [0, "&Yacute;"], [0, "&THORN;"], [0, "&szlig;"], [0, "&agrave;"], [0, "&aacute;"], [0, "&acirc;"], [0, "&atilde;"], [0, "&auml;"], [0, "&aring;"], [0, "&aelig;"], [0, "&ccedil;"], [0, "&egrave;"], [0, "&eacute;"], [0, "&ecirc;"], [0, "&euml;"], [0, "&igrave;"], [0, "&iacute;"], [0, "&icirc;"], [0, "&iuml;"], [0, "&eth;"], [0, "&ntilde;"], [0, "&ograve;"], [0, "&oacute;"], [0, "&ocirc;"], [0, "&otilde;"], [0, "&ouml;"], [0, "&div;"], [0, "&oslash;"], [0, "&ugrave;"], [0, "&uacute;"], [0, "&ucirc;"], [0, "&uuml;"], [0, "&yacute;"], [0, "&thorn;"], [0, "&yuml;"], [0, "&Amacr;"], [0, "&amacr;"], [0, "&Abreve;"], [0, "&abreve;"], [0, "&Aogon;"], [0, "&aogon;"], [0, "&Cacute;"], [0, "&cacute;"], [0, "&Ccirc;"], [0, "&ccirc;"], [0, "&Cdot;"], [0, "&cdot;"], [0, "&Ccaron;"], [0, "&ccaron;"], [0, "&Dcaron;"], [0, "&dcaron;"], [0, "&Dstrok;"], [0, "&dstrok;"], [0, "&Emacr;"], [0, "&emacr;"], [2, "&Edot;"], [0, "&edot;"], [0, "&Eogon;"], [0, "&eogon;"], [0, "&Ecaron;"], [0, "&ecaron;"], [0, "&Gcirc;"], [0, "&gcirc;"], [0, "&Gbreve;"], [0, "&gbreve;"], [0, "&Gdot;"], [0, "&gdot;"], [0, "&Gcedil;"], [1, "&Hcirc;"], [0, "&hcirc;"], [0, "&Hstrok;"], [0, "&hstrok;"], [0, "&Itilde;"], [0, "&itilde;"], [0, "&Imacr;"], [0, "&imacr;"], [2, "&Iogon;"], [0, "&iogon;"], [0, "&Idot;"], [0, "&imath;"], [0, "&IJlig;"], [0, "&ijlig;"], [0, "&Jcirc;"], [0, "&jcirc;"], [0, "&Kcedil;"], [0, "&kcedil;"], [0, "&kgreen;"], [0, "&Lacute;"], [0, "&lacute;"], [0, "&Lcedil;"], [0, "&lcedil;"], [0, "&Lcaron;"], [0, "&lcaron;"], [0, "&Lmidot;"], [0, "&lmidot;"], [0, "&Lstrok;"], [0, "&lstrok;"], [0, "&Nacute;"], [0, "&nacute;"], [0, "&Ncedil;"], [0, "&ncedil;"], [0, "&Ncaron;"], [0, "&ncaron;"], [0, "&napos;"], [0, "&ENG;"], [0, "&eng;"], [0, "&Omacr;"], [0, "&omacr;"], [2, "&Odblac;"], [0, "&odblac;"], [0, "&OElig;"], [0, "&oelig;"], [0, "&Racute;"], [0, "&racute;"], [0, "&Rcedil;"], [0, "&rcedil;"], [0, "&Rcaron;"], [0, "&rcaron;"], [0, "&Sacute;"], [0, "&sacute;"], [0, "&Scirc;"], [0, "&scirc;"], [0, "&Scedil;"], [0, "&scedil;"], [0, "&Scaron;"], [0, "&scaron;"], [0, "&Tcedil;"], [0, "&tcedil;"], [0, "&Tcaron;"], [0, "&tcaron;"], [0, "&Tstrok;"], [0, "&tstrok;"], [0, "&Utilde;"], [0, "&utilde;"], [0, "&Umacr;"], [0, "&umacr;"], [0, "&Ubreve;"], [0, "&ubreve;"], [0, "&Uring;"], [0, "&uring;"], [0, "&Udblac;"], [0, "&udblac;"], [0, "&Uogon;"], [0, "&uogon;"], [0, "&Wcirc;"], [0, "&wcirc;"], [0, "&Ycirc;"], [0, "&ycirc;"], [0, "&Yuml;"], [0, "&Zacute;"], [0, "&zacute;"], [0, "&Zdot;"], [0, "&zdot;"], [0, "&Zcaron;"], [0, "&zcaron;"], [19, "&fnof;"], [34, "&imped;"], [63, "&gacute;"], [65, "&jmath;"], [142, "&circ;"], [0, "&caron;"], [16, "&breve;"], [0, "&DiacriticalDot;"], [0, "&ring;"], [0, "&ogon;"], [0, "&DiacriticalTilde;"], [0, "&dblac;"], [51, "&DownBreve;"], [127, "&Alpha;"], [0, "&Beta;"], [0, "&Gamma;"], [0, "&Delta;"], [0, "&Epsilon;"], [0, "&Zeta;"], [0, "&Eta;"], [0, "&Theta;"], [0, "&Iota;"], [0, "&Kappa;"], [0, "&Lambda;"], [0, "&Mu;"], [0, "&Nu;"], [0, "&Xi;"], [0, "&Omicron;"], [0, "&Pi;"], [0, "&Rho;"], [1, "&Sigma;"], [0, "&Tau;"], [0, "&Upsilon;"], [0, "&Phi;"], [0, "&Chi;"], [0, "&Psi;"], [0, "&ohm;"], [7, "&alpha;"], [0, "&beta;"], [0, "&gamma;"], [0, "&delta;"], [0, "&epsi;"], [0, "&zeta;"], [0, "&eta;"], [0, "&theta;"], [0, "&iota;"], [0, "&kappa;"], [0, "&lambda;"], [0, "&mu;"], [0, "&nu;"], [0, "&xi;"], [0, "&omicron;"], [0, "&pi;"], [0, "&rho;"], [0, "&sigmaf;"], [0, "&sigma;"], [0, "&tau;"], [0, "&upsi;"], [0, "&phi;"], [0, "&chi;"], [0, "&psi;"], [0, "&omega;"], [7, "&thetasym;"], [0, "&Upsi;"], [2, "&phiv;"], [0, "&piv;"], [5, "&Gammad;"], [0, "&digamma;"], [18, "&kappav;"], [0, "&rhov;"], [3, "&epsiv;"], [0, "&backepsilon;"], [10, "&IOcy;"], [0, "&DJcy;"], [0, "&GJcy;"], [0, "&Jukcy;"], [0, "&DScy;"], [0, "&Iukcy;"], [0, "&YIcy;"], [0, "&Jsercy;"], [0, "&LJcy;"], [0, "&NJcy;"], [0, "&TSHcy;"], [0, "&KJcy;"], [1, "&Ubrcy;"], [0, "&DZcy;"], [0, "&Acy;"], [0, "&Bcy;"], [0, "&Vcy;"], [0, "&Gcy;"], [0, "&Dcy;"], [0, "&IEcy;"], [0, "&ZHcy;"], [0, "&Zcy;"], [0, "&Icy;"], [0, "&Jcy;"], [0, "&Kcy;"], [0, "&Lcy;"], [0, "&Mcy;"], [0, "&Ncy;"], [0, "&Ocy;"], [0, "&Pcy;"], [0, "&Rcy;"], [0, "&Scy;"], [0, "&Tcy;"], [0, "&Ucy;"], [0, "&Fcy;"], [0, "&KHcy;"], [0, "&TScy;"], [0, "&CHcy;"], [0, "&SHcy;"], [0, "&SHCHcy;"], [0, "&HARDcy;"], [0, "&Ycy;"], [0, "&SOFTcy;"], [0, "&Ecy;"], [0, "&YUcy;"], [0, "&YAcy;"], [0, "&acy;"], [0, "&bcy;"], [0, "&vcy;"], [0, "&gcy;"], [0, "&dcy;"], [0, "&iecy;"], [0, "&zhcy;"], [0, "&zcy;"], [0, "&icy;"], [0, "&jcy;"], [0, "&kcy;"], [0, "&lcy;"], [0, "&mcy;"], [0, "&ncy;"], [0, "&ocy;"], [0, "&pcy;"], [0, "&rcy;"], [0, "&scy;"], [0, "&tcy;"], [0, "&ucy;"], [0, "&fcy;"], [0, "&khcy;"], [0, "&tscy;"], [0, "&chcy;"], [0, "&shcy;"], [0, "&shchcy;"], [0, "&hardcy;"], [0, "&ycy;"], [0, "&softcy;"], [0, "&ecy;"], [0, "&yucy;"], [0, "&yacy;"], [1, "&iocy;"], [0, "&djcy;"], [0, "&gjcy;"], [0, "&jukcy;"], [0, "&dscy;"], [0, "&iukcy;"], [0, "&yicy;"], [0, "&jsercy;"], [0, "&ljcy;"], [0, "&njcy;"], [0, "&tshcy;"], [0, "&kjcy;"], [1, "&ubrcy;"], [0, "&dzcy;"], [7074, "&ensp;"], [0, "&emsp;"], [0, "&emsp13;"], [0, "&emsp14;"], [1, "&numsp;"], [0, "&puncsp;"], [0, "&ThinSpace;"], [0, "&hairsp;"], [0, "&NegativeMediumSpace;"], [0, "&zwnj;"], [0, "&zwj;"], [0, "&lrm;"], [0, "&rlm;"], [0, "&dash;"], [2, "&ndash;"], [0, "&mdash;"], [0, "&horbar;"], [0, "&Verbar;"], [1, "&lsquo;"], [0, "&CloseCurlyQuote;"], [0, "&lsquor;"], [1, "&ldquo;"], [0, "&CloseCurlyDoubleQuote;"], [0, "&bdquo;"], [1, "&dagger;"], [0, "&Dagger;"], [0, "&bull;"], [2, "&nldr;"], [0, "&hellip;"], [9, "&permil;"], [0, "&pertenk;"], [0, "&prime;"], [0, "&Prime;"], [0, "&tprime;"], [0, "&backprime;"], [3, "&lsaquo;"], [0, "&rsaquo;"], [3, "&oline;"], [2, "&caret;"], [1, "&hybull;"], [0, "&frasl;"], [10, "&bsemi;"], [7, "&qprime;"], [7, { v: "&MediumSpace;", n: 8202, o: "&ThickSpace;" }], [0, "&NoBreak;"], [0, "&af;"], [0, "&InvisibleTimes;"], [0, "&ic;"], [72, "&euro;"], [46, "&tdot;"], [0, "&DotDot;"], [37, "&complexes;"], [2, "&incare;"], [4, "&gscr;"], [0, "&hamilt;"], [0, "&Hfr;"], [0, "&Hopf;"], [0, "&planckh;"], [0, "&hbar;"], [0, "&imagline;"], [0, "&Ifr;"], [0, "&lagran;"], [0, "&ell;"], [1, "&naturals;"], [0, "&numero;"], [0, "&copysr;"], [0, "&weierp;"], [0, "&Popf;"], [0, "&Qopf;"], [0, "&realine;"], [0, "&real;"], [0, "&reals;"], [0, "&rx;"], [3, "&trade;"], [1, "&integers;"], [2, "&mho;"], [0, "&zeetrf;"], [0, "&iiota;"], [2, "&bernou;"], [0, "&Cayleys;"], [1, "&escr;"], [0, "&Escr;"], [0, "&Fouriertrf;"], [1, "&Mellintrf;"], [0, "&order;"], [0, "&alefsym;"], [0, "&beth;"], [0, "&gimel;"], [0, "&daleth;"], [12, "&CapitalDifferentialD;"], [0, "&dd;"], [0, "&ee;"], [0, "&ii;"], [10, "&frac13;"], [0, "&frac23;"], [0, "&frac15;"], [0, "&frac25;"], [0, "&frac35;"], [0, "&frac45;"], [0, "&frac16;"], [0, "&frac56;"], [0, "&frac18;"], [0, "&frac38;"], [0, "&frac58;"], [0, "&frac78;"], [49, "&larr;"], [0, "&ShortUpArrow;"], [0, "&rarr;"], [0, "&darr;"], [0, "&harr;"], [0, "&updownarrow;"], [0, "&nwarr;"], [0, "&nearr;"], [0, "&LowerRightArrow;"], [0, "&LowerLeftArrow;"], [0, "&nlarr;"], [0, "&nrarr;"], [1, { v: "&rarrw;", n: 824, o: "&nrarrw;" }], [0, "&Larr;"], [0, "&Uarr;"], [0, "&Rarr;"], [0, "&Darr;"], [0, "&larrtl;"], [0, "&rarrtl;"], [0, "&LeftTeeArrow;"], [0, "&mapstoup;"], [0, "&map;"], [0, "&DownTeeArrow;"], [1, "&hookleftarrow;"], [0, "&hookrightarrow;"], [0, "&larrlp;"], [0, "&looparrowright;"], [0, "&harrw;"], [0, "&nharr;"], [1, "&lsh;"], [0, "&rsh;"], [0, "&ldsh;"], [0, "&rdsh;"], [1, "&crarr;"], [0, "&cularr;"], [0, "&curarr;"], [2, "&circlearrowleft;"], [0, "&circlearrowright;"], [0, "&leftharpoonup;"], [0, "&DownLeftVector;"], [0, "&RightUpVector;"], [0, "&LeftUpVector;"], [0, "&rharu;"], [0, "&DownRightVector;"], [0, "&dharr;"], [0, "&dharl;"], [0, "&RightArrowLeftArrow;"], [0, "&udarr;"], [0, "&LeftArrowRightArrow;"], [0, "&leftleftarrows;"], [0, "&upuparrows;"], [0, "&rightrightarrows;"], [0, "&ddarr;"], [0, "&leftrightharpoons;"], [0, "&Equilibrium;"], [0, "&nlArr;"], [0, "&nhArr;"], [0, "&nrArr;"], [0, "&DoubleLeftArrow;"], [0, "&DoubleUpArrow;"], [0, "&DoubleRightArrow;"], [0, "&dArr;"], [0, "&DoubleLeftRightArrow;"], [0, "&DoubleUpDownArrow;"], [0, "&nwArr;"], [0, "&neArr;"], [0, "&seArr;"], [0, "&swArr;"], [0, "&lAarr;"], [0, "&rAarr;"], [1, "&zigrarr;"], [6, "&larrb;"], [0, "&rarrb;"], [15, "&DownArrowUpArrow;"], [7, "&loarr;"], [0, "&roarr;"], [0, "&hoarr;"], [0, "&forall;"], [0, "&comp;"], [0, { v: "&part;", n: 824, o: "&npart;" }], [0, "&exist;"], [0, "&nexist;"], [0, "&empty;"], [1, "&Del;"], [0, "&Element;"], [0, "&NotElement;"], [1, "&ni;"], [0, "&notni;"], [2, "&prod;"], [0, "&coprod;"], [0, "&sum;"], [0, "&minus;"], [0, "&MinusPlus;"], [0, "&dotplus;"], [1, "&Backslash;"], [0, "&lowast;"], [0, "&compfn;"], [1, "&radic;"], [2, "&prop;"], [0, "&infin;"], [0, "&angrt;"], [0, { v: "&ang;", n: 8402, o: "&nang;" }], [0, "&angmsd;"], [0, "&angsph;"], [0, "&mid;"], [0, "&nmid;"], [0, "&DoubleVerticalBar;"], [0, "&NotDoubleVerticalBar;"], [0, "&and;"], [0, "&or;"], [0, { v: "&cap;", n: 65024, o: "&caps;" }], [0, { v: "&cup;", n: 65024, o: "&cups;" }], [0, "&int;"], [0, "&Int;"], [0, "&iiint;"], [0, "&conint;"], [0, "&Conint;"], [0, "&Cconint;"], [0, "&cwint;"], [0, "&ClockwiseContourIntegral;"], [0, "&awconint;"], [0, "&there4;"], [0, "&becaus;"], [0, "&ratio;"], [0, "&Colon;"], [0, "&dotminus;"], [1, "&mDDot;"], [0, "&homtht;"], [0, { v: "&sim;", n: 8402, o: "&nvsim;" }], [0, { v: "&backsim;", n: 817, o: "&race;" }], [0, { v: "&ac;", n: 819, o: "&acE;" }], [0, "&acd;"], [0, "&VerticalTilde;"], [0, "&NotTilde;"], [0, { v: "&eqsim;", n: 824, o: "&nesim;" }], [0, "&sime;"], [0, "&NotTildeEqual;"], [0, "&cong;"], [0, "&simne;"], [0, "&ncong;"], [0, "&ap;"], [0, "&nap;"], [0, "&ape;"], [0, { v: "&apid;", n: 824, o: "&napid;" }], [0, "&backcong;"], [0, { v: "&asympeq;", n: 8402, o: "&nvap;" }], [0, { v: "&bump;", n: 824, o: "&nbump;" }], [0, { v: "&bumpe;", n: 824, o: "&nbumpe;" }], [0, { v: "&doteq;", n: 824, o: "&nedot;" }], [0, "&doteqdot;"], [0, "&efDot;"], [0, "&erDot;"], [0, "&Assign;"], [0, "&ecolon;"], [0, "&ecir;"], [0, "&circeq;"], [1, "&wedgeq;"], [0, "&veeeq;"], [1, "&triangleq;"], [2, "&equest;"], [0, "&ne;"], [0, { v: "&Congruent;", n: 8421, o: "&bnequiv;" }], [0, "&nequiv;"], [1, { v: "&le;", n: 8402, o: "&nvle;" }], [0, { v: "&ge;", n: 8402, o: "&nvge;" }], [0, { v: "&lE;", n: 824, o: "&nlE;" }], [0, { v: "&gE;", n: 824, o: "&ngE;" }], [0, { v: "&lnE;", n: 65024, o: "&lvertneqq;" }], [0, { v: "&gnE;", n: 65024, o: "&gvertneqq;" }], [0, { v: "&ll;", n: new Map(/* @__PURE__ */ restoreDiff([[824, "&nLtv;"], [7577, "&nLt;"]])) }], [0, { v: "&gg;", n: new Map(/* @__PURE__ */ restoreDiff([[824, "&nGtv;"], [7577, "&nGt;"]])) }], [0, "&between;"], [0, "&NotCupCap;"], [0, "&nless;"], [0, "&ngt;"], [0, "&nle;"], [0, "&nge;"], [0, "&lesssim;"], [0, "&GreaterTilde;"], [0, "&nlsim;"], [0, "&ngsim;"], [0, "&LessGreater;"], [0, "&gl;"], [0, "&NotLessGreater;"], [0, "&NotGreaterLess;"], [0, "&pr;"], [0, "&sc;"], [0, "&prcue;"], [0, "&sccue;"], [0, "&PrecedesTilde;"], [0, { v: "&scsim;", n: 824, o: "&NotSucceedsTilde;" }], [0, "&NotPrecedes;"], [0, "&NotSucceeds;"], [0, { v: "&sub;", n: 8402, o: "&NotSubset;" }], [0, { v: "&sup;", n: 8402, o: "&NotSuperset;" }], [0, "&nsub;"], [0, "&nsup;"], [0, "&sube;"], [0, "&supe;"], [0, "&NotSubsetEqual;"], [0, "&NotSupersetEqual;"], [0, { v: "&subne;", n: 65024, o: "&varsubsetneq;" }], [0, { v: "&supne;", n: 65024, o: "&varsupsetneq;" }], [1, "&cupdot;"], [0, "&UnionPlus;"], [0, { v: "&sqsub;", n: 824, o: "&NotSquareSubset;" }], [0, { v: "&sqsup;", n: 824, o: "&NotSquareSuperset;" }], [0, "&sqsube;"], [0, "&sqsupe;"], [0, { v: "&sqcap;", n: 65024, o: "&sqcaps;" }], [0, { v: "&sqcup;", n: 65024, o: "&sqcups;" }], [0, "&CirclePlus;"], [0, "&CircleMinus;"], [0, "&CircleTimes;"], [0, "&osol;"], [0, "&CircleDot;"], [0, "&circledcirc;"], [0, "&circledast;"], [1, "&circleddash;"], [0, "&boxplus;"], [0, "&boxminus;"], [0, "&boxtimes;"], [0, "&dotsquare;"], [0, "&RightTee;"], [0, "&dashv;"], [0, "&DownTee;"], [0, "&bot;"], [1, "&models;"], [0, "&DoubleRightTee;"], [0, "&Vdash;"], [0, "&Vvdash;"], [0, "&VDash;"], [0, "&nvdash;"], [0, "&nvDash;"], [0, "&nVdash;"], [0, "&nVDash;"], [0, "&prurel;"], [1, "&LeftTriangle;"], [0, "&RightTriangle;"], [0, { v: "&LeftTriangleEqual;", n: 8402, o: "&nvltrie;" }], [0, { v: "&RightTriangleEqual;", n: 8402, o: "&nvrtrie;" }], [0, "&origof;"], [0, "&imof;"], [0, "&multimap;"], [0, "&hercon;"], [0, "&intcal;"], [0, "&veebar;"], [1, "&barvee;"], [0, "&angrtvb;"], [0, "&lrtri;"], [0, "&bigwedge;"], [0, "&bigvee;"], [0, "&bigcap;"], [0, "&bigcup;"], [0, "&diam;"], [0, "&sdot;"], [0, "&sstarf;"], [0, "&divideontimes;"], [0, "&bowtie;"], [0, "&ltimes;"], [0, "&rtimes;"], [0, "&leftthreetimes;"], [0, "&rightthreetimes;"], [0, "&backsimeq;"], [0, "&curlyvee;"], [0, "&curlywedge;"], [0, "&Sub;"], [0, "&Sup;"], [0, "&Cap;"], [0, "&Cup;"], [0, "&fork;"], [0, "&epar;"], [0, "&lessdot;"], [0, "&gtdot;"], [0, { v: "&Ll;", n: 824, o: "&nLl;" }], [0, { v: "&Gg;", n: 824, o: "&nGg;" }], [0, { v: "&leg;", n: 65024, o: "&lesg;" }], [0, { v: "&gel;", n: 65024, o: "&gesl;" }], [2, "&cuepr;"], [0, "&cuesc;"], [0, "&NotPrecedesSlantEqual;"], [0, "&NotSucceedsSlantEqual;"], [0, "&NotSquareSubsetEqual;"], [0, "&NotSquareSupersetEqual;"], [2, "&lnsim;"], [0, "&gnsim;"], [0, "&precnsim;"], [0, "&scnsim;"], [0, "&nltri;"], [0, "&NotRightTriangle;"], [0, "&nltrie;"], [0, "&NotRightTriangleEqual;"], [0, "&vellip;"], [0, "&ctdot;"], [0, "&utdot;"], [0, "&dtdot;"], [0, "&disin;"], [0, "&isinsv;"], [0, "&isins;"], [0, { v: "&isindot;", n: 824, o: "&notindot;" }], [0, "&notinvc;"], [0, "&notinvb;"], [1, { v: "&isinE;", n: 824, o: "&notinE;" }], [0, "&nisd;"], [0, "&xnis;"], [0, "&nis;"], [0, "&notnivc;"], [0, "&notnivb;"], [6, "&barwed;"], [0, "&Barwed;"], [1, "&lceil;"], [0, "&rceil;"], [0, "&LeftFloor;"], [0, "&rfloor;"], [0, "&drcrop;"], [0, "&dlcrop;"], [0, "&urcrop;"], [0, "&ulcrop;"], [0, "&bnot;"], [1, "&profline;"], [0, "&profsurf;"], [1, "&telrec;"], [0, "&target;"], [5, "&ulcorn;"], [0, "&urcorn;"], [0, "&dlcorn;"], [0, "&drcorn;"], [2, "&frown;"], [0, "&smile;"], [9, "&cylcty;"], [0, "&profalar;"], [7, "&topbot;"], [6, "&ovbar;"], [1, "&solbar;"], [60, "&angzarr;"], [51, "&lmoustache;"], [0, "&rmoustache;"], [2, "&OverBracket;"], [0, "&bbrk;"], [0, "&bbrktbrk;"], [37, "&OverParenthesis;"], [0, "&UnderParenthesis;"], [0, "&OverBrace;"], [0, "&UnderBrace;"], [2, "&trpezium;"], [4, "&elinters;"], [59, "&blank;"], [164, "&circledS;"], [55, "&boxh;"], [1, "&boxv;"], [9, "&boxdr;"], [3, "&boxdl;"], [3, "&boxur;"], [3, "&boxul;"], [3, "&boxvr;"], [7, "&boxvl;"], [7, "&boxhd;"], [7, "&boxhu;"], [7, "&boxvh;"], [19, "&boxH;"], [0, "&boxV;"], [0, "&boxdR;"], [0, "&boxDr;"], [0, "&boxDR;"], [0, "&boxdL;"], [0, "&boxDl;"], [0, "&boxDL;"], [0, "&boxuR;"], [0, "&boxUr;"], [0, "&boxUR;"], [0, "&boxuL;"], [0, "&boxUl;"], [0, "&boxUL;"], [0, "&boxvR;"], [0, "&boxVr;"], [0, "&boxVR;"], [0, "&boxvL;"], [0, "&boxVl;"], [0, "&boxVL;"], [0, "&boxHd;"], [0, "&boxhD;"], [0, "&boxHD;"], [0, "&boxHu;"], [0, "&boxhU;"], [0, "&boxHU;"], [0, "&boxvH;"], [0, "&boxVh;"], [0, "&boxVH;"], [19, "&uhblk;"], [3, "&lhblk;"], [3, "&block;"], [8, "&blk14;"], [0, "&blk12;"], [0, "&blk34;"], [13, "&square;"], [8, "&blacksquare;"], [0, "&EmptyVerySmallSquare;"], [1, "&rect;"], [0, "&marker;"], [2, "&fltns;"], [1, "&bigtriangleup;"], [0, "&blacktriangle;"], [0, "&triangle;"], [2, "&blacktriangleright;"], [0, "&rtri;"], [3, "&bigtriangledown;"], [0, "&blacktriangledown;"], [0, "&dtri;"], [2, "&blacktriangleleft;"], [0, "&ltri;"], [6, "&loz;"], [0, "&cir;"], [32, "&tridot;"], [2, "&bigcirc;"], [8, "&ultri;"], [0, "&urtri;"], [0, "&lltri;"], [0, "&EmptySmallSquare;"], [0, "&FilledSmallSquare;"], [8, "&bigstar;"], [0, "&star;"], [7, "&phone;"], [49, "&female;"], [1, "&male;"], [29, "&spades;"], [2, "&clubs;"], [1, "&hearts;"], [0, "&diamondsuit;"], [3, "&sung;"], [2, "&flat;"], [0, "&natural;"], [0, "&sharp;"], [163, "&check;"], [3, "&cross;"], [8, "&malt;"], [21, "&sext;"], [33, "&VerticalSeparator;"], [25, "&lbbrk;"], [0, "&rbbrk;"], [84, "&bsolhsub;"], [0, "&suphsol;"], [28, "&LeftDoubleBracket;"], [0, "&RightDoubleBracket;"], [0, "&lang;"], [0, "&rang;"], [0, "&Lang;"], [0, "&Rang;"], [0, "&loang;"], [0, "&roang;"], [7, "&longleftarrow;"], [0, "&longrightarrow;"], [0, "&longleftrightarrow;"], [0, "&DoubleLongLeftArrow;"], [0, "&DoubleLongRightArrow;"], [0, "&DoubleLongLeftRightArrow;"], [1, "&longmapsto;"], [2, "&dzigrarr;"], [258, "&nvlArr;"], [0, "&nvrArr;"], [0, "&nvHarr;"], [0, "&Map;"], [6, "&lbarr;"], [0, "&bkarow;"], [0, "&lBarr;"], [0, "&dbkarow;"], [0, "&drbkarow;"], [0, "&DDotrahd;"], [0, "&UpArrowBar;"], [0, "&DownArrowBar;"], [2, "&Rarrtl;"], [2, "&latail;"], [0, "&ratail;"], [0, "&lAtail;"], [0, "&rAtail;"], [0, "&larrfs;"], [0, "&rarrfs;"], [0, "&larrbfs;"], [0, "&rarrbfs;"], [2, "&nwarhk;"], [0, "&nearhk;"], [0, "&hksearow;"], [0, "&hkswarow;"], [0, "&nwnear;"], [0, "&nesear;"], [0, "&seswar;"], [0, "&swnwar;"], [8, { v: "&rarrc;", n: 824, o: "&nrarrc;" }], [1, "&cudarrr;"], [0, "&ldca;"], [0, "&rdca;"], [0, "&cudarrl;"], [0, "&larrpl;"], [2, "&curarrm;"], [0, "&cularrp;"], [7, "&rarrpl;"], [2, "&harrcir;"], [0, "&Uarrocir;"], [0, "&lurdshar;"], [0, "&ldrushar;"], [2, "&LeftRightVector;"], [0, "&RightUpDownVector;"], [0, "&DownLeftRightVector;"], [0, "&LeftUpDownVector;"], [0, "&LeftVectorBar;"], [0, "&RightVectorBar;"], [0, "&RightUpVectorBar;"], [0, "&RightDownVectorBar;"], [0, "&DownLeftVectorBar;"], [0, "&DownRightVectorBar;"], [0, "&LeftUpVectorBar;"], [0, "&LeftDownVectorBar;"], [0, "&LeftTeeVector;"], [0, "&RightTeeVector;"], [0, "&RightUpTeeVector;"], [0, "&RightDownTeeVector;"], [0, "&DownLeftTeeVector;"], [0, "&DownRightTeeVector;"], [0, "&LeftUpTeeVector;"], [0, "&LeftDownTeeVector;"], [0, "&lHar;"], [0, "&uHar;"], [0, "&rHar;"], [0, "&dHar;"], [0, "&luruhar;"], [0, "&ldrdhar;"], [0, "&ruluhar;"], [0, "&rdldhar;"], [0, "&lharul;"], [0, "&llhard;"], [0, "&rharul;"], [0, "&lrhard;"], [0, "&udhar;"], [0, "&duhar;"], [0, "&RoundImplies;"], [0, "&erarr;"], [0, "&simrarr;"], [0, "&larrsim;"], [0, "&rarrsim;"], [0, "&rarrap;"], [0, "&ltlarr;"], [1, "&gtrarr;"], [0, "&subrarr;"], [1, "&suplarr;"], [0, "&lfisht;"], [0, "&rfisht;"], [0, "&ufisht;"], [0, "&dfisht;"], [5, "&lopar;"], [0, "&ropar;"], [4, "&lbrke;"], [0, "&rbrke;"], [0, "&lbrkslu;"], [0, "&rbrksld;"], [0, "&lbrksld;"], [0, "&rbrkslu;"], [0, "&langd;"], [0, "&rangd;"], [0, "&lparlt;"], [0, "&rpargt;"], [0, "&gtlPar;"], [0, "&ltrPar;"], [3, "&vzigzag;"], [1, "&vangrt;"], [0, "&angrtvbd;"], [6, "&ange;"], [0, "&range;"], [0, "&dwangle;"], [0, "&uwangle;"], [0, "&angmsdaa;"], [0, "&angmsdab;"], [0, "&angmsdac;"], [0, "&angmsdad;"], [0, "&angmsdae;"], [0, "&angmsdaf;"], [0, "&angmsdag;"], [0, "&angmsdah;"], [0, "&bemptyv;"], [0, "&demptyv;"], [0, "&cemptyv;"], [0, "&raemptyv;"], [0, "&laemptyv;"], [0, "&ohbar;"], [0, "&omid;"], [0, "&opar;"], [1, "&operp;"], [1, "&olcross;"], [0, "&odsold;"], [1, "&olcir;"], [0, "&ofcir;"], [0, "&olt;"], [0, "&ogt;"], [0, "&cirscir;"], [0, "&cirE;"], [0, "&solb;"], [0, "&bsolb;"], [3, "&boxbox;"], [3, "&trisb;"], [0, "&rtriltri;"], [0, { v: "&LeftTriangleBar;", n: 824, o: "&NotLeftTriangleBar;" }], [0, { v: "&RightTriangleBar;", n: 824, o: "&NotRightTriangleBar;" }], [11, "&iinfin;"], [0, "&infintie;"], [0, "&nvinfin;"], [4, "&eparsl;"], [0, "&smeparsl;"], [0, "&eqvparsl;"], [5, "&blacklozenge;"], [8, "&RuleDelayed;"], [1, "&dsol;"], [9, "&bigodot;"], [0, "&bigoplus;"], [0, "&bigotimes;"], [1, "&biguplus;"], [1, "&bigsqcup;"], [5, "&iiiint;"], [0, "&fpartint;"], [2, "&cirfnint;"], [0, "&awint;"], [0, "&rppolint;"], [0, "&scpolint;"], [0, "&npolint;"], [0, "&pointint;"], [0, "&quatint;"], [0, "&intlarhk;"], [10, "&pluscir;"], [0, "&plusacir;"], [0, "&simplus;"], [0, "&plusdu;"], [0, "&plussim;"], [0, "&plustwo;"], [1, "&mcomma;"], [0, "&minusdu;"], [2, "&loplus;"], [0, "&roplus;"], [0, "&Cross;"], [0, "&timesd;"], [0, "&timesbar;"], [1, "&smashp;"], [0, "&lotimes;"], [0, "&rotimes;"], [0, "&otimesas;"], [0, "&Otimes;"], [0, "&odiv;"], [0, "&triplus;"], [0, "&triminus;"], [0, "&tritime;"], [0, "&intprod;"], [2, "&amalg;"], [0, "&capdot;"], [1, "&ncup;"], [0, "&ncap;"], [0, "&capand;"], [0, "&cupor;"], [0, "&cupcap;"], [0, "&capcup;"], [0, "&cupbrcap;"], [0, "&capbrcup;"], [0, "&cupcup;"], [0, "&capcap;"], [0, "&ccups;"], [0, "&ccaps;"], [2, "&ccupssm;"], [2, "&And;"], [0, "&Or;"], [0, "&andand;"], [0, "&oror;"], [0, "&orslope;"], [0, "&andslope;"], [1, "&andv;"], [0, "&orv;"], [0, "&andd;"], [0, "&ord;"], [1, "&wedbar;"], [6, "&sdote;"], [3, "&simdot;"], [2, { v: "&congdot;", n: 824, o: "&ncongdot;" }], [0, "&easter;"], [0, "&apacir;"], [0, { v: "&apE;", n: 824, o: "&napE;" }], [0, "&eplus;"], [0, "&pluse;"], [0, "&Esim;"], [0, "&Colone;"], [0, "&Equal;"], [1, "&ddotseq;"], [0, "&equivDD;"], [0, "&ltcir;"], [0, "&gtcir;"], [0, "&ltquest;"], [0, "&gtquest;"], [0, { v: "&leqslant;", n: 824, o: "&nleqslant;" }], [0, { v: "&geqslant;", n: 824, o: "&ngeqslant;" }], [0, "&lesdot;"], [0, "&gesdot;"], [0, "&lesdoto;"], [0, "&gesdoto;"], [0, "&lesdotor;"], [0, "&gesdotol;"], [0, "&lap;"], [0, "&gap;"], [0, "&lne;"], [0, "&gne;"], [0, "&lnap;"], [0, "&gnap;"], [0, "&lEg;"], [0, "&gEl;"], [0, "&lsime;"], [0, "&gsime;"], [0, "&lsimg;"], [0, "&gsiml;"], [0, "&lgE;"], [0, "&glE;"], [0, "&lesges;"], [0, "&gesles;"], [0, "&els;"], [0, "&egs;"], [0, "&elsdot;"], [0, "&egsdot;"], [0, "&el;"], [0, "&eg;"], [2, "&siml;"], [0, "&simg;"], [0, "&simlE;"], [0, "&simgE;"], [0, { v: "&LessLess;", n: 824, o: "&NotNestedLessLess;" }], [0, { v: "&GreaterGreater;", n: 824, o: "&NotNestedGreaterGreater;" }], [1, "&glj;"], [0, "&gla;"], [0, "&ltcc;"], [0, "&gtcc;"], [0, "&lescc;"], [0, "&gescc;"], [0, "&smt;"], [0, "&lat;"], [0, { v: "&smte;", n: 65024, o: "&smtes;" }], [0, { v: "&late;", n: 65024, o: "&lates;" }], [0, "&bumpE;"], [0, { v: "&PrecedesEqual;", n: 824, o: "&NotPrecedesEqual;" }], [0, { v: "&sce;", n: 824, o: "&NotSucceedsEqual;" }], [2, "&prE;"], [0, "&scE;"], [0, "&precneqq;"], [0, "&scnE;"], [0, "&prap;"], [0, "&scap;"], [0, "&precnapprox;"], [0, "&scnap;"], [0, "&Pr;"], [0, "&Sc;"], [0, "&subdot;"], [0, "&supdot;"], [0, "&subplus;"], [0, "&supplus;"], [0, "&submult;"], [0, "&supmult;"], [0, "&subedot;"], [0, "&supedot;"], [0, { v: "&subE;", n: 824, o: "&nsubE;" }], [0, { v: "&supE;", n: 824, o: "&nsupE;" }], [0, "&subsim;"], [0, "&supsim;"], [2, { v: "&subnE;", n: 65024, o: "&varsubsetneqq;" }], [0, { v: "&supnE;", n: 65024, o: "&varsupsetneqq;" }], [2, "&csub;"], [0, "&csup;"], [0, "&csube;"], [0, "&csupe;"], [0, "&subsup;"], [0, "&supsub;"], [0, "&subsub;"], [0, "&supsup;"], [0, "&suphsub;"], [0, "&supdsub;"], [0, "&forkv;"], [0, "&topfork;"], [0, "&mlcp;"], [8, "&Dashv;"], [1, "&Vdashl;"], [0, "&Barv;"], [0, "&vBar;"], [0, "&vBarv;"], [1, "&Vbar;"], [0, "&Not;"], [0, "&bNot;"], [0, "&rnmid;"], [0, "&cirmid;"], [0, "&midcir;"], [0, "&topcir;"], [0, "&nhpar;"], [0, "&parsim;"], [9, { v: "&parsl;", n: 8421, o: "&nparsl;" }], [44343, { n: new Map(/* @__PURE__ */ restoreDiff([[56476, "&Ascr;"], [1, "&Cscr;"], [0, "&Dscr;"], [2, "&Gscr;"], [2, "&Jscr;"], [0, "&Kscr;"], [2, "&Nscr;"], [0, "&Oscr;"], [0, "&Pscr;"], [0, "&Qscr;"], [1, "&Sscr;"], [0, "&Tscr;"], [0, "&Uscr;"], [0, "&Vscr;"], [0, "&Wscr;"], [0, "&Xscr;"], [0, "&Yscr;"], [0, "&Zscr;"], [0, "&ascr;"], [0, "&bscr;"], [0, "&cscr;"], [0, "&dscr;"], [1, "&fscr;"], [1, "&hscr;"], [0, "&iscr;"], [0, "&jscr;"], [0, "&kscr;"], [0, "&lscr;"], [0, "&mscr;"], [0, "&nscr;"], [1, "&pscr;"], [0, "&qscr;"], [0, "&rscr;"], [0, "&sscr;"], [0, "&tscr;"], [0, "&uscr;"], [0, "&vscr;"], [0, "&wscr;"], [0, "&xscr;"], [0, "&yscr;"], [0, "&zscr;"], [52, "&Afr;"], [0, "&Bfr;"], [1, "&Dfr;"], [0, "&Efr;"], [0, "&Ffr;"], [0, "&Gfr;"], [2, "&Jfr;"], [0, "&Kfr;"], [0, "&Lfr;"], [0, "&Mfr;"], [0, "&Nfr;"], [0, "&Ofr;"], [0, "&Pfr;"], [0, "&Qfr;"], [1, "&Sfr;"], [0, "&Tfr;"], [0, "&Ufr;"], [0, "&Vfr;"], [0, "&Wfr;"], [0, "&Xfr;"], [0, "&Yfr;"], [1, "&afr;"], [0, "&bfr;"], [0, "&cfr;"], [0, "&dfr;"], [0, "&efr;"], [0, "&ffr;"], [0, "&gfr;"], [0, "&hfr;"], [0, "&ifr;"], [0, "&jfr;"], [0, "&kfr;"], [0, "&lfr;"], [0, "&mfr;"], [0, "&nfr;"], [0, "&ofr;"], [0, "&pfr;"], [0, "&qfr;"], [0, "&rfr;"], [0, "&sfr;"], [0, "&tfr;"], [0, "&ufr;"], [0, "&vfr;"], [0, "&wfr;"], [0, "&xfr;"], [0, "&yfr;"], [0, "&zfr;"], [0, "&Aopf;"], [0, "&Bopf;"], [1, "&Dopf;"], [0, "&Eopf;"], [0, "&Fopf;"], [0, "&Gopf;"], [1, "&Iopf;"], [0, "&Jopf;"], [0, "&Kopf;"], [0, "&Lopf;"], [0, "&Mopf;"], [1, "&Oopf;"], [3, "&Sopf;"], [0, "&Topf;"], [0, "&Uopf;"], [0, "&Vopf;"], [0, "&Wopf;"], [0, "&Xopf;"], [0, "&Yopf;"], [1, "&aopf;"], [0, "&bopf;"], [0, "&copf;"], [0, "&dopf;"], [0, "&eopf;"], [0, "&fopf;"], [0, "&gopf;"], [0, "&hopf;"], [0, "&iopf;"], [0, "&jopf;"], [0, "&kopf;"], [0, "&lopf;"], [0, "&mopf;"], [0, "&nopf;"], [0, "&oopf;"], [0, "&popf;"], [0, "&qopf;"], [0, "&ropf;"], [0, "&sopf;"], [0, "&topf;"], [0, "&uopf;"], [0, "&vopf;"], [0, "&wopf;"], [0, "&xopf;"], [0, "&yopf;"], [0, "&zopf;"]])) }], [8906, "&fflig;"], [0, "&filig;"], [0, "&fllig;"], [0, "&ffilig;"], [0, "&ffllig;"]]));
  return encodeHtml;
}
var _escape = {};
var hasRequired_escape;
function require_escape() {
  if (hasRequired_escape) return _escape;
  hasRequired_escape = 1;
  (function(exports$1) {
    Object.defineProperty(exports$1, "__esModule", { value: true });
    exports$1.escapeText = exports$1.escapeAttribute = exports$1.escapeUTF8 = exports$1.escape = exports$1.encodeXML = exports$1.getCodePoint = exports$1.xmlReplacer = void 0;
    exports$1.xmlReplacer = /["&'<>$\x80-\uFFFF]/g;
    var xmlCodeMap = /* @__PURE__ */ new Map([
      [34, "&quot;"],
      [38, "&amp;"],
      [39, "&apos;"],
      [60, "&lt;"],
      [62, "&gt;"]
    ]);
    exports$1.getCodePoint = // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    String.prototype.codePointAt != null ? function(str, index2) {
      return str.codePointAt(index2);
    } : (
      // http://mathiasbynens.be/notes/javascript-encoding#surrogate-formulae
      function(c, index2) {
        return (c.charCodeAt(index2) & 64512) === 55296 ? (c.charCodeAt(index2) - 55296) * 1024 + c.charCodeAt(index2 + 1) - 56320 + 65536 : c.charCodeAt(index2);
      }
    );
    function encodeXML(str) {
      var ret = "";
      var lastIdx = 0;
      var match;
      while ((match = exports$1.xmlReplacer.exec(str)) !== null) {
        var i = match.index;
        var char = str.charCodeAt(i);
        var next = xmlCodeMap.get(char);
        if (next !== void 0) {
          ret += str.substring(lastIdx, i) + next;
          lastIdx = i + 1;
        } else {
          ret += "".concat(str.substring(lastIdx, i), "&#x").concat((0, exports$1.getCodePoint)(str, i).toString(16), ";");
          lastIdx = exports$1.xmlReplacer.lastIndex += Number((char & 64512) === 55296);
        }
      }
      return ret + str.substr(lastIdx);
    }
    exports$1.encodeXML = encodeXML;
    exports$1.escape = encodeXML;
    function getEscaper(regex, map) {
      return function escape(data) {
        var match;
        var lastIdx = 0;
        var result2 = "";
        while (match = regex.exec(data)) {
          if (lastIdx !== match.index) {
            result2 += data.substring(lastIdx, match.index);
          }
          result2 += map.get(match[0].charCodeAt(0));
          lastIdx = match.index + 1;
        }
        return result2 + data.substring(lastIdx);
      };
    }
    exports$1.escapeUTF8 = getEscaper(/[&<>'"]/g, xmlCodeMap);
    exports$1.escapeAttribute = getEscaper(/["&\u00A0]/g, /* @__PURE__ */ new Map([
      [34, "&quot;"],
      [38, "&amp;"],
      [160, "&nbsp;"]
    ]));
    exports$1.escapeText = getEscaper(/[&<>\u00A0]/g, /* @__PURE__ */ new Map([
      [38, "&amp;"],
      [60, "&lt;"],
      [62, "&gt;"],
      [160, "&nbsp;"]
    ]));
  })(_escape);
  return _escape;
}
var hasRequiredEncode;
function requireEncode() {
  if (hasRequiredEncode) return encode;
  hasRequiredEncode = 1;
  var __importDefault = commonjsGlobal && commonjsGlobal.__importDefault || function(mod) {
    return mod && mod.__esModule ? mod : { "default": mod };
  };
  Object.defineProperty(encode, "__esModule", { value: true });
  encode.encodeNonAsciiHTML = encode.encodeHTML = void 0;
  var encode_html_js_1 = __importDefault(requireEncodeHtml());
  var escape_js_1 = require_escape();
  var htmlReplacer = /[\t\n!-,./:-@[-`\f{-}$\x80-\uFFFF]/g;
  function encodeHTML(data) {
    return encodeHTMLTrieRe(htmlReplacer, data);
  }
  encode.encodeHTML = encodeHTML;
  function encodeNonAsciiHTML(data) {
    return encodeHTMLTrieRe(escape_js_1.xmlReplacer, data);
  }
  encode.encodeNonAsciiHTML = encodeNonAsciiHTML;
  function encodeHTMLTrieRe(regExp, str) {
    var ret = "";
    var lastIdx = 0;
    var match;
    while ((match = regExp.exec(str)) !== null) {
      var i = match.index;
      ret += str.substring(lastIdx, i);
      var char = str.charCodeAt(i);
      var next = encode_html_js_1.default.get(char);
      if (typeof next === "object") {
        if (i + 1 < str.length) {
          var nextChar = str.charCodeAt(i + 1);
          var value = typeof next.n === "number" ? next.n === nextChar ? next.o : void 0 : next.n.get(nextChar);
          if (value !== void 0) {
            ret += value;
            lastIdx = regExp.lastIndex += 1;
            continue;
          }
        }
        next = next.v;
      }
      if (next !== void 0) {
        ret += next;
        lastIdx = i + 1;
      } else {
        var cp = (0, escape_js_1.getCodePoint)(str, i);
        ret += "&#x".concat(cp.toString(16), ";");
        lastIdx = regExp.lastIndex += Number(cp !== char);
      }
    }
    return ret + str.substr(lastIdx);
  }
  return encode;
}
var hasRequiredLib$3;
function requireLib$3() {
  if (hasRequiredLib$3) return lib;
  hasRequiredLib$3 = 1;
  (function(exports$1) {
    Object.defineProperty(exports$1, "__esModule", { value: true });
    exports$1.decodeXMLStrict = exports$1.decodeHTML5Strict = exports$1.decodeHTML4Strict = exports$1.decodeHTML5 = exports$1.decodeHTML4 = exports$1.decodeHTMLAttribute = exports$1.decodeHTMLStrict = exports$1.decodeHTML = exports$1.decodeXML = exports$1.DecodingMode = exports$1.EntityDecoder = exports$1.encodeHTML5 = exports$1.encodeHTML4 = exports$1.encodeNonAsciiHTML = exports$1.encodeHTML = exports$1.escapeText = exports$1.escapeAttribute = exports$1.escapeUTF8 = exports$1.escape = exports$1.encodeXML = exports$1.encode = exports$1.decodeStrict = exports$1.decode = exports$1.EncodingMode = exports$1.EntityLevel = void 0;
    var decode_js_1 = requireDecode();
    var encode_js_1 = requireEncode();
    var escape_js_1 = require_escape();
    var EntityLevel;
    (function(EntityLevel2) {
      EntityLevel2[EntityLevel2["XML"] = 0] = "XML";
      EntityLevel2[EntityLevel2["HTML"] = 1] = "HTML";
    })(EntityLevel = exports$1.EntityLevel || (exports$1.EntityLevel = {}));
    var EncodingMode;
    (function(EncodingMode2) {
      EncodingMode2[EncodingMode2["UTF8"] = 0] = "UTF8";
      EncodingMode2[EncodingMode2["ASCII"] = 1] = "ASCII";
      EncodingMode2[EncodingMode2["Extensive"] = 2] = "Extensive";
      EncodingMode2[EncodingMode2["Attribute"] = 3] = "Attribute";
      EncodingMode2[EncodingMode2["Text"] = 4] = "Text";
    })(EncodingMode = exports$1.EncodingMode || (exports$1.EncodingMode = {}));
    function decode2(data, options2) {
      if (options2 === void 0) {
        options2 = EntityLevel.XML;
      }
      var level = typeof options2 === "number" ? options2 : options2.level;
      if (level === EntityLevel.HTML) {
        var mode = typeof options2 === "object" ? options2.mode : void 0;
        return (0, decode_js_1.decodeHTML)(data, mode);
      }
      return (0, decode_js_1.decodeXML)(data);
    }
    exports$1.decode = decode2;
    function decodeStrict(data, options2) {
      var _a;
      if (options2 === void 0) {
        options2 = EntityLevel.XML;
      }
      var opts = typeof options2 === "number" ? { level: options2 } : options2;
      (_a = opts.mode) !== null && _a !== void 0 ? _a : opts.mode = decode_js_1.DecodingMode.Strict;
      return decode2(data, opts);
    }
    exports$1.decodeStrict = decodeStrict;
    function encode2(data, options2) {
      if (options2 === void 0) {
        options2 = EntityLevel.XML;
      }
      var opts = typeof options2 === "number" ? { level: options2 } : options2;
      if (opts.mode === EncodingMode.UTF8)
        return (0, escape_js_1.escapeUTF8)(data);
      if (opts.mode === EncodingMode.Attribute)
        return (0, escape_js_1.escapeAttribute)(data);
      if (opts.mode === EncodingMode.Text)
        return (0, escape_js_1.escapeText)(data);
      if (opts.level === EntityLevel.HTML) {
        if (opts.mode === EncodingMode.ASCII) {
          return (0, encode_js_1.encodeNonAsciiHTML)(data);
        }
        return (0, encode_js_1.encodeHTML)(data);
      }
      return (0, escape_js_1.encodeXML)(data);
    }
    exports$1.encode = encode2;
    var escape_js_2 = require_escape();
    Object.defineProperty(exports$1, "encodeXML", { enumerable: true, get: function() {
      return escape_js_2.encodeXML;
    } });
    Object.defineProperty(exports$1, "escape", { enumerable: true, get: function() {
      return escape_js_2.escape;
    } });
    Object.defineProperty(exports$1, "escapeUTF8", { enumerable: true, get: function() {
      return escape_js_2.escapeUTF8;
    } });
    Object.defineProperty(exports$1, "escapeAttribute", { enumerable: true, get: function() {
      return escape_js_2.escapeAttribute;
    } });
    Object.defineProperty(exports$1, "escapeText", { enumerable: true, get: function() {
      return escape_js_2.escapeText;
    } });
    var encode_js_2 = requireEncode();
    Object.defineProperty(exports$1, "encodeHTML", { enumerable: true, get: function() {
      return encode_js_2.encodeHTML;
    } });
    Object.defineProperty(exports$1, "encodeNonAsciiHTML", { enumerable: true, get: function() {
      return encode_js_2.encodeNonAsciiHTML;
    } });
    Object.defineProperty(exports$1, "encodeHTML4", { enumerable: true, get: function() {
      return encode_js_2.encodeHTML;
    } });
    Object.defineProperty(exports$1, "encodeHTML5", { enumerable: true, get: function() {
      return encode_js_2.encodeHTML;
    } });
    var decode_js_2 = requireDecode();
    Object.defineProperty(exports$1, "EntityDecoder", { enumerable: true, get: function() {
      return decode_js_2.EntityDecoder;
    } });
    Object.defineProperty(exports$1, "DecodingMode", { enumerable: true, get: function() {
      return decode_js_2.DecodingMode;
    } });
    Object.defineProperty(exports$1, "decodeXML", { enumerable: true, get: function() {
      return decode_js_2.decodeXML;
    } });
    Object.defineProperty(exports$1, "decodeHTML", { enumerable: true, get: function() {
      return decode_js_2.decodeHTML;
    } });
    Object.defineProperty(exports$1, "decodeHTMLStrict", { enumerable: true, get: function() {
      return decode_js_2.decodeHTMLStrict;
    } });
    Object.defineProperty(exports$1, "decodeHTMLAttribute", { enumerable: true, get: function() {
      return decode_js_2.decodeHTMLAttribute;
    } });
    Object.defineProperty(exports$1, "decodeHTML4", { enumerable: true, get: function() {
      return decode_js_2.decodeHTML;
    } });
    Object.defineProperty(exports$1, "decodeHTML5", { enumerable: true, get: function() {
      return decode_js_2.decodeHTML;
    } });
    Object.defineProperty(exports$1, "decodeHTML4Strict", { enumerable: true, get: function() {
      return decode_js_2.decodeHTMLStrict;
    } });
    Object.defineProperty(exports$1, "decodeHTML5Strict", { enumerable: true, get: function() {
      return decode_js_2.decodeHTMLStrict;
    } });
    Object.defineProperty(exports$1, "decodeXMLStrict", { enumerable: true, get: function() {
      return decode_js_2.decodeXML;
    } });
  })(lib);
  return lib;
}
var foreignNames = {};
var hasRequiredForeignNames;
function requireForeignNames() {
  if (hasRequiredForeignNames) return foreignNames;
  hasRequiredForeignNames = 1;
  Object.defineProperty(foreignNames, "__esModule", { value: true });
  foreignNames.attributeNames = foreignNames.elementNames = void 0;
  foreignNames.elementNames = new Map([
    "altGlyph",
    "altGlyphDef",
    "altGlyphItem",
    "animateColor",
    "animateMotion",
    "animateTransform",
    "clipPath",
    "feBlend",
    "feColorMatrix",
    "feComponentTransfer",
    "feComposite",
    "feConvolveMatrix",
    "feDiffuseLighting",
    "feDisplacementMap",
    "feDistantLight",
    "feDropShadow",
    "feFlood",
    "feFuncA",
    "feFuncB",
    "feFuncG",
    "feFuncR",
    "feGaussianBlur",
    "feImage",
    "feMerge",
    "feMergeNode",
    "feMorphology",
    "feOffset",
    "fePointLight",
    "feSpecularLighting",
    "feSpotLight",
    "feTile",
    "feTurbulence",
    "foreignObject",
    "glyphRef",
    "linearGradient",
    "radialGradient",
    "textPath"
  ].map(function(val) {
    return [val.toLowerCase(), val];
  }));
  foreignNames.attributeNames = new Map([
    "definitionURL",
    "attributeName",
    "attributeType",
    "baseFrequency",
    "baseProfile",
    "calcMode",
    "clipPathUnits",
    "diffuseConstant",
    "edgeMode",
    "filterUnits",
    "glyphRef",
    "gradientTransform",
    "gradientUnits",
    "kernelMatrix",
    "kernelUnitLength",
    "keyPoints",
    "keySplines",
    "keyTimes",
    "lengthAdjust",
    "limitingConeAngle",
    "markerHeight",
    "markerUnits",
    "markerWidth",
    "maskContentUnits",
    "maskUnits",
    "numOctaves",
    "pathLength",
    "patternContentUnits",
    "patternTransform",
    "patternUnits",
    "pointsAtX",
    "pointsAtY",
    "pointsAtZ",
    "preserveAlpha",
    "preserveAspectRatio",
    "primitiveUnits",
    "refX",
    "refY",
    "repeatCount",
    "repeatDur",
    "requiredExtensions",
    "requiredFeatures",
    "specularConstant",
    "specularExponent",
    "spreadMethod",
    "startOffset",
    "stdDeviation",
    "stitchTiles",
    "surfaceScale",
    "systemLanguage",
    "tableValues",
    "targetX",
    "targetY",
    "textLength",
    "viewBox",
    "viewTarget",
    "xChannelSelector",
    "yChannelSelector",
    "zoomAndPan"
  ].map(function(val) {
    return [val.toLowerCase(), val];
  }));
  return foreignNames;
}
var hasRequiredLib$2;
function requireLib$2() {
  if (hasRequiredLib$2) return lib$1;
  hasRequiredLib$2 = 1;
  var __assign = commonjsGlobal && commonjsGlobal.__assign || function() {
    __assign = Object.assign || function(t) {
      for (var s, i = 1, n = arguments.length; i < n; i++) {
        s = arguments[i];
        for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
          t[p] = s[p];
      }
      return t;
    };
    return __assign.apply(this, arguments);
  };
  var __createBinding = commonjsGlobal && commonjsGlobal.__createBinding || (Object.create ? function(o, m, k, k2) {
    if (k2 === void 0) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() {
        return m[k];
      } };
    }
    Object.defineProperty(o, k2, desc);
  } : function(o, m, k, k2) {
    if (k2 === void 0) k2 = k;
    o[k2] = m[k];
  });
  var __setModuleDefault = commonjsGlobal && commonjsGlobal.__setModuleDefault || (Object.create ? function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
  } : function(o, v) {
    o["default"] = v;
  });
  var __importStar = commonjsGlobal && commonjsGlobal.__importStar || function(mod) {
    if (mod && mod.__esModule) return mod;
    var result2 = {};
    if (mod != null) {
      for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result2, mod, k);
    }
    __setModuleDefault(result2, mod);
    return result2;
  };
  Object.defineProperty(lib$1, "__esModule", { value: true });
  lib$1.render = void 0;
  var ElementType = __importStar(requireLib$5());
  var entities_1 = requireLib$3();
  var foreignNames_js_1 = requireForeignNames();
  var unencodedElements = /* @__PURE__ */ new Set([
    "style",
    "script",
    "xmp",
    "iframe",
    "noembed",
    "noframes",
    "plaintext",
    "noscript"
  ]);
  function replaceQuotes(value) {
    return value.replace(/"/g, "&quot;");
  }
  function formatAttributes(attributes2, opts) {
    var _a;
    if (!attributes2)
      return;
    var encode2 = ((_a = opts.encodeEntities) !== null && _a !== void 0 ? _a : opts.decodeEntities) === false ? replaceQuotes : opts.xmlMode || opts.encodeEntities !== "utf8" ? entities_1.encodeXML : entities_1.escapeAttribute;
    return Object.keys(attributes2).map(function(key) {
      var _a2, _b;
      var value = (_a2 = attributes2[key]) !== null && _a2 !== void 0 ? _a2 : "";
      if (opts.xmlMode === "foreign") {
        key = (_b = foreignNames_js_1.attributeNames.get(key)) !== null && _b !== void 0 ? _b : key;
      }
      if (!opts.emptyAttrs && !opts.xmlMode && value === "") {
        return key;
      }
      return "".concat(key, '="').concat(encode2(value), '"');
    }).join(" ");
  }
  var singleTag = /* @__PURE__ */ new Set([
    "area",
    "base",
    "basefont",
    "br",
    "col",
    "command",
    "embed",
    "frame",
    "hr",
    "img",
    "input",
    "isindex",
    "keygen",
    "link",
    "meta",
    "param",
    "source",
    "track",
    "wbr"
  ]);
  function render(node2, options2) {
    if (options2 === void 0) {
      options2 = {};
    }
    var nodes = "length" in node2 ? node2 : [node2];
    var output = "";
    for (var i = 0; i < nodes.length; i++) {
      output += renderNode(nodes[i], options2);
    }
    return output;
  }
  lib$1.render = render;
  lib$1.default = render;
  function renderNode(node2, options2) {
    switch (node2.type) {
      case ElementType.Root:
        return render(node2.children, options2);
      case ElementType.Doctype:
      case ElementType.Directive:
        return renderDirective(node2);
      case ElementType.Comment:
        return renderComment(node2);
      case ElementType.CDATA:
        return renderCdata(node2);
      case ElementType.Script:
      case ElementType.Style:
      case ElementType.Tag:
        return renderTag(node2, options2);
      case ElementType.Text:
        return renderText(node2, options2);
    }
  }
  var foreignModeIntegrationPoints = /* @__PURE__ */ new Set([
    "mi",
    "mo",
    "mn",
    "ms",
    "mtext",
    "annotation-xml",
    "foreignObject",
    "desc",
    "title"
  ]);
  var foreignElements = /* @__PURE__ */ new Set(["svg", "math"]);
  function renderTag(elem, opts) {
    var _a;
    if (opts.xmlMode === "foreign") {
      elem.name = (_a = foreignNames_js_1.elementNames.get(elem.name)) !== null && _a !== void 0 ? _a : elem.name;
      if (elem.parent && foreignModeIntegrationPoints.has(elem.parent.name)) {
        opts = __assign(__assign({}, opts), { xmlMode: false });
      }
    }
    if (!opts.xmlMode && foreignElements.has(elem.name)) {
      opts = __assign(__assign({}, opts), { xmlMode: "foreign" });
    }
    var tag = "<".concat(elem.name);
    var attribs = formatAttributes(elem.attribs, opts);
    if (attribs) {
      tag += " ".concat(attribs);
    }
    if (elem.children.length === 0 && (opts.xmlMode ? (
      // In XML mode or foreign mode, and user hasn't explicitly turned off self-closing tags
      opts.selfClosingTags !== false
    ) : (
      // User explicitly asked for self-closing tags, even in HTML mode
      opts.selfClosingTags && singleTag.has(elem.name)
    ))) {
      if (!opts.xmlMode)
        tag += " ";
      tag += "/>";
    } else {
      tag += ">";
      if (elem.children.length > 0) {
        tag += render(elem.children, opts);
      }
      if (opts.xmlMode || !singleTag.has(elem.name)) {
        tag += "</".concat(elem.name, ">");
      }
    }
    return tag;
  }
  function renderDirective(elem) {
    return "<".concat(elem.data, ">");
  }
  function renderText(elem, opts) {
    var _a;
    var data = elem.data || "";
    if (((_a = opts.encodeEntities) !== null && _a !== void 0 ? _a : opts.decodeEntities) !== false && !(!opts.xmlMode && elem.parent && unencodedElements.has(elem.parent.name))) {
      data = opts.xmlMode || opts.encodeEntities !== "utf8" ? (0, entities_1.encodeXML)(data) : (0, entities_1.escapeText)(data);
    }
    return data;
  }
  function renderCdata(elem) {
    return "<![CDATA[".concat(elem.children[0].data, "]]>");
  }
  function renderComment(elem) {
    return "<!--".concat(elem.data, "-->");
  }
  return lib$1;
}
var hasRequiredStringify$1;
function requireStringify$1() {
  if (hasRequiredStringify$1) return stringify;
  hasRequiredStringify$1 = 1;
  var __importDefault = commonjsGlobal && commonjsGlobal.__importDefault || function(mod) {
    return mod && mod.__esModule ? mod : { "default": mod };
  };
  Object.defineProperty(stringify, "__esModule", { value: true });
  stringify.getOuterHTML = getOuterHTML;
  stringify.getInnerHTML = getInnerHTML;
  stringify.getText = getText;
  stringify.textContent = textContent;
  stringify.innerText = innerText;
  var domhandler_1 = requireLib$4();
  var dom_serializer_1 = __importDefault(requireLib$2());
  var domelementtype_1 = requireLib$5();
  function getOuterHTML(node2, options2) {
    return (0, dom_serializer_1.default)(node2, options2);
  }
  function getInnerHTML(node2, options2) {
    return (0, domhandler_1.hasChildren)(node2) ? node2.children.map(function(node3) {
      return getOuterHTML(node3, options2);
    }).join("") : "";
  }
  function getText(node2) {
    if (Array.isArray(node2))
      return node2.map(getText).join("");
    if ((0, domhandler_1.isTag)(node2))
      return node2.name === "br" ? "\n" : getText(node2.children);
    if ((0, domhandler_1.isCDATA)(node2))
      return getText(node2.children);
    if ((0, domhandler_1.isText)(node2))
      return node2.data;
    return "";
  }
  function textContent(node2) {
    if (Array.isArray(node2))
      return node2.map(textContent).join("");
    if ((0, domhandler_1.hasChildren)(node2) && !(0, domhandler_1.isComment)(node2)) {
      return textContent(node2.children);
    }
    if ((0, domhandler_1.isText)(node2))
      return node2.data;
    return "";
  }
  function innerText(node2) {
    if (Array.isArray(node2))
      return node2.map(innerText).join("");
    if ((0, domhandler_1.hasChildren)(node2) && (node2.type === domelementtype_1.ElementType.Tag || (0, domhandler_1.isCDATA)(node2))) {
      return innerText(node2.children);
    }
    if ((0, domhandler_1.isText)(node2))
      return node2.data;
    return "";
  }
  return stringify;
}
var traversal = {};
var hasRequiredTraversal;
function requireTraversal() {
  if (hasRequiredTraversal) return traversal;
  hasRequiredTraversal = 1;
  Object.defineProperty(traversal, "__esModule", { value: true });
  traversal.getChildren = getChildren;
  traversal.getParent = getParent;
  traversal.getSiblings = getSiblings;
  traversal.getAttributeValue = getAttributeValue;
  traversal.hasAttrib = hasAttrib;
  traversal.getName = getName;
  traversal.nextElementSibling = nextElementSibling;
  traversal.prevElementSibling = prevElementSibling;
  var domhandler_1 = requireLib$4();
  function getChildren(elem) {
    return (0, domhandler_1.hasChildren)(elem) ? elem.children : [];
  }
  function getParent(elem) {
    return elem.parent || null;
  }
  function getSiblings(elem) {
    var _a, _b;
    var parent = getParent(elem);
    if (parent != null)
      return getChildren(parent);
    var siblings = [elem];
    var prev = elem.prev, next = elem.next;
    while (prev != null) {
      siblings.unshift(prev);
      _a = prev, prev = _a.prev;
    }
    while (next != null) {
      siblings.push(next);
      _b = next, next = _b.next;
    }
    return siblings;
  }
  function getAttributeValue(elem, name) {
    var _a;
    return (_a = elem.attribs) === null || _a === void 0 ? void 0 : _a[name];
  }
  function hasAttrib(elem, name) {
    return elem.attribs != null && Object.prototype.hasOwnProperty.call(elem.attribs, name) && elem.attribs[name] != null;
  }
  function getName(elem) {
    return elem.name;
  }
  function nextElementSibling(elem) {
    var _a;
    var next = elem.next;
    while (next !== null && !(0, domhandler_1.isTag)(next))
      _a = next, next = _a.next;
    return next;
  }
  function prevElementSibling(elem) {
    var _a;
    var prev = elem.prev;
    while (prev !== null && !(0, domhandler_1.isTag)(prev))
      _a = prev, prev = _a.prev;
    return prev;
  }
  return traversal;
}
var manipulation = {};
var hasRequiredManipulation;
function requireManipulation() {
  if (hasRequiredManipulation) return manipulation;
  hasRequiredManipulation = 1;
  Object.defineProperty(manipulation, "__esModule", { value: true });
  manipulation.removeElement = removeElement;
  manipulation.replaceElement = replaceElement;
  manipulation.appendChild = appendChild;
  manipulation.append = append;
  manipulation.prependChild = prependChild;
  manipulation.prepend = prepend;
  function removeElement(elem) {
    if (elem.prev)
      elem.prev.next = elem.next;
    if (elem.next)
      elem.next.prev = elem.prev;
    if (elem.parent) {
      var childs = elem.parent.children;
      var childsIndex = childs.lastIndexOf(elem);
      if (childsIndex >= 0) {
        childs.splice(childsIndex, 1);
      }
    }
    elem.next = null;
    elem.prev = null;
    elem.parent = null;
  }
  function replaceElement(elem, replacement) {
    var prev = replacement.prev = elem.prev;
    if (prev) {
      prev.next = replacement;
    }
    var next = replacement.next = elem.next;
    if (next) {
      next.prev = replacement;
    }
    var parent = replacement.parent = elem.parent;
    if (parent) {
      var childs = parent.children;
      childs[childs.lastIndexOf(elem)] = replacement;
      elem.parent = null;
    }
  }
  function appendChild(parent, child) {
    removeElement(child);
    child.next = null;
    child.parent = parent;
    if (parent.children.push(child) > 1) {
      var sibling = parent.children[parent.children.length - 2];
      sibling.next = child;
      child.prev = sibling;
    } else {
      child.prev = null;
    }
  }
  function append(elem, next) {
    removeElement(next);
    var parent = elem.parent;
    var currNext = elem.next;
    next.next = currNext;
    next.prev = elem;
    elem.next = next;
    next.parent = parent;
    if (currNext) {
      currNext.prev = next;
      if (parent) {
        var childs = parent.children;
        childs.splice(childs.lastIndexOf(currNext), 0, next);
      }
    } else if (parent) {
      parent.children.push(next);
    }
  }
  function prependChild(parent, child) {
    removeElement(child);
    child.parent = parent;
    child.prev = null;
    if (parent.children.unshift(child) !== 1) {
      var sibling = parent.children[1];
      sibling.prev = child;
      child.next = sibling;
    } else {
      child.next = null;
    }
  }
  function prepend(elem, prev) {
    removeElement(prev);
    var parent = elem.parent;
    if (parent) {
      var childs = parent.children;
      childs.splice(childs.indexOf(elem), 0, prev);
    }
    if (elem.prev) {
      elem.prev.next = prev;
    }
    prev.parent = parent;
    prev.prev = elem.prev;
    prev.next = elem;
    elem.prev = prev;
  }
  return manipulation;
}
var querying = {};
var hasRequiredQuerying;
function requireQuerying() {
  if (hasRequiredQuerying) return querying;
  hasRequiredQuerying = 1;
  Object.defineProperty(querying, "__esModule", { value: true });
  querying.filter = filter;
  querying.find = find;
  querying.findOneChild = findOneChild;
  querying.findOne = findOne;
  querying.existsOne = existsOne;
  querying.findAll = findAll;
  var domhandler_1 = requireLib$4();
  function filter(test2, node2, recurse, limit) {
    if (recurse === void 0) {
      recurse = true;
    }
    if (limit === void 0) {
      limit = Infinity;
    }
    return find(test2, Array.isArray(node2) ? node2 : [node2], recurse, limit);
  }
  function find(test2, nodes, recurse, limit) {
    var result2 = [];
    var nodeStack = [Array.isArray(nodes) ? nodes : [nodes]];
    var indexStack = [0];
    for (; ; ) {
      if (indexStack[0] >= nodeStack[0].length) {
        if (indexStack.length === 1) {
          return result2;
        }
        nodeStack.shift();
        indexStack.shift();
        continue;
      }
      var elem = nodeStack[0][indexStack[0]++];
      if (test2(elem)) {
        result2.push(elem);
        if (--limit <= 0)
          return result2;
      }
      if (recurse && (0, domhandler_1.hasChildren)(elem) && elem.children.length > 0) {
        indexStack.unshift(0);
        nodeStack.unshift(elem.children);
      }
    }
  }
  function findOneChild(test2, nodes) {
    return nodes.find(test2);
  }
  function findOne(test2, nodes, recurse) {
    if (recurse === void 0) {
      recurse = true;
    }
    var searchedNodes = Array.isArray(nodes) ? nodes : [nodes];
    for (var i = 0; i < searchedNodes.length; i++) {
      var node2 = searchedNodes[i];
      if ((0, domhandler_1.isTag)(node2) && test2(node2)) {
        return node2;
      }
      if (recurse && (0, domhandler_1.hasChildren)(node2) && node2.children.length > 0) {
        var found = findOne(test2, node2.children, true);
        if (found)
          return found;
      }
    }
    return null;
  }
  function existsOne(test2, nodes) {
    return (Array.isArray(nodes) ? nodes : [nodes]).some(function(node2) {
      return (0, domhandler_1.isTag)(node2) && test2(node2) || (0, domhandler_1.hasChildren)(node2) && existsOne(test2, node2.children);
    });
  }
  function findAll(test2, nodes) {
    var result2 = [];
    var nodeStack = [Array.isArray(nodes) ? nodes : [nodes]];
    var indexStack = [0];
    for (; ; ) {
      if (indexStack[0] >= nodeStack[0].length) {
        if (nodeStack.length === 1) {
          return result2;
        }
        nodeStack.shift();
        indexStack.shift();
        continue;
      }
      var elem = nodeStack[0][indexStack[0]++];
      if ((0, domhandler_1.isTag)(elem) && test2(elem))
        result2.push(elem);
      if ((0, domhandler_1.hasChildren)(elem) && elem.children.length > 0) {
        indexStack.unshift(0);
        nodeStack.unshift(elem.children);
      }
    }
  }
  return querying;
}
var legacy = {};
var hasRequiredLegacy;
function requireLegacy() {
  if (hasRequiredLegacy) return legacy;
  hasRequiredLegacy = 1;
  Object.defineProperty(legacy, "__esModule", { value: true });
  legacy.testElement = testElement;
  legacy.getElements = getElements;
  legacy.getElementById = getElementById;
  legacy.getElementsByTagName = getElementsByTagName;
  legacy.getElementsByClassName = getElementsByClassName;
  legacy.getElementsByTagType = getElementsByTagType;
  var domhandler_1 = requireLib$4();
  var querying_js_1 = requireQuerying();
  var Checks = {
    tag_name: function(name) {
      if (typeof name === "function") {
        return function(elem) {
          return (0, domhandler_1.isTag)(elem) && name(elem.name);
        };
      } else if (name === "*") {
        return domhandler_1.isTag;
      }
      return function(elem) {
        return (0, domhandler_1.isTag)(elem) && elem.name === name;
      };
    },
    tag_type: function(type) {
      if (typeof type === "function") {
        return function(elem) {
          return type(elem.type);
        };
      }
      return function(elem) {
        return elem.type === type;
      };
    },
    tag_contains: function(data) {
      if (typeof data === "function") {
        return function(elem) {
          return (0, domhandler_1.isText)(elem) && data(elem.data);
        };
      }
      return function(elem) {
        return (0, domhandler_1.isText)(elem) && elem.data === data;
      };
    }
  };
  function getAttribCheck(attrib, value) {
    if (typeof value === "function") {
      return function(elem) {
        return (0, domhandler_1.isTag)(elem) && value(elem.attribs[attrib]);
      };
    }
    return function(elem) {
      return (0, domhandler_1.isTag)(elem) && elem.attribs[attrib] === value;
    };
  }
  function combineFuncs(a, b) {
    return function(elem) {
      return a(elem) || b(elem);
    };
  }
  function compileTest(options2) {
    var funcs = Object.keys(options2).map(function(key) {
      var value = options2[key];
      return Object.prototype.hasOwnProperty.call(Checks, key) ? Checks[key](value) : getAttribCheck(key, value);
    });
    return funcs.length === 0 ? null : funcs.reduce(combineFuncs);
  }
  function testElement(options2, node2) {
    var test2 = compileTest(options2);
    return test2 ? test2(node2) : true;
  }
  function getElements(options2, nodes, recurse, limit) {
    if (limit === void 0) {
      limit = Infinity;
    }
    var test2 = compileTest(options2);
    return test2 ? (0, querying_js_1.filter)(test2, nodes, recurse, limit) : [];
  }
  function getElementById(id, nodes, recurse) {
    if (recurse === void 0) {
      recurse = true;
    }
    if (!Array.isArray(nodes))
      nodes = [nodes];
    return (0, querying_js_1.findOne)(getAttribCheck("id", id), nodes, recurse);
  }
  function getElementsByTagName(tagName, nodes, recurse, limit) {
    if (recurse === void 0) {
      recurse = true;
    }
    if (limit === void 0) {
      limit = Infinity;
    }
    return (0, querying_js_1.filter)(Checks["tag_name"](tagName), nodes, recurse, limit);
  }
  function getElementsByClassName(className, nodes, recurse, limit) {
    if (recurse === void 0) {
      recurse = true;
    }
    if (limit === void 0) {
      limit = Infinity;
    }
    return (0, querying_js_1.filter)(getAttribCheck("class", className), nodes, recurse, limit);
  }
  function getElementsByTagType(type, nodes, recurse, limit) {
    if (recurse === void 0) {
      recurse = true;
    }
    if (limit === void 0) {
      limit = Infinity;
    }
    return (0, querying_js_1.filter)(Checks["tag_type"](type), nodes, recurse, limit);
  }
  return legacy;
}
var helpers = {};
var hasRequiredHelpers;
function requireHelpers() {
  if (hasRequiredHelpers) return helpers;
  hasRequiredHelpers = 1;
  Object.defineProperty(helpers, "__esModule", { value: true });
  helpers.DocumentPosition = void 0;
  helpers.removeSubsets = removeSubsets;
  helpers.compareDocumentPosition = compareDocumentPosition;
  helpers.uniqueSort = uniqueSort;
  var domhandler_1 = requireLib$4();
  function removeSubsets(nodes) {
    var idx = nodes.length;
    while (--idx >= 0) {
      var node2 = nodes[idx];
      if (idx > 0 && nodes.lastIndexOf(node2, idx - 1) >= 0) {
        nodes.splice(idx, 1);
        continue;
      }
      for (var ancestor = node2.parent; ancestor; ancestor = ancestor.parent) {
        if (nodes.includes(ancestor)) {
          nodes.splice(idx, 1);
          break;
        }
      }
    }
    return nodes;
  }
  var DocumentPosition;
  (function(DocumentPosition2) {
    DocumentPosition2[DocumentPosition2["DISCONNECTED"] = 1] = "DISCONNECTED";
    DocumentPosition2[DocumentPosition2["PRECEDING"] = 2] = "PRECEDING";
    DocumentPosition2[DocumentPosition2["FOLLOWING"] = 4] = "FOLLOWING";
    DocumentPosition2[DocumentPosition2["CONTAINS"] = 8] = "CONTAINS";
    DocumentPosition2[DocumentPosition2["CONTAINED_BY"] = 16] = "CONTAINED_BY";
  })(DocumentPosition || (helpers.DocumentPosition = DocumentPosition = {}));
  function compareDocumentPosition(nodeA, nodeB) {
    var aParents = [];
    var bParents = [];
    if (nodeA === nodeB) {
      return 0;
    }
    var current = (0, domhandler_1.hasChildren)(nodeA) ? nodeA : nodeA.parent;
    while (current) {
      aParents.unshift(current);
      current = current.parent;
    }
    current = (0, domhandler_1.hasChildren)(nodeB) ? nodeB : nodeB.parent;
    while (current) {
      bParents.unshift(current);
      current = current.parent;
    }
    var maxIdx = Math.min(aParents.length, bParents.length);
    var idx = 0;
    while (idx < maxIdx && aParents[idx] === bParents[idx]) {
      idx++;
    }
    if (idx === 0) {
      return DocumentPosition.DISCONNECTED;
    }
    var sharedParent = aParents[idx - 1];
    var siblings = sharedParent.children;
    var aSibling = aParents[idx];
    var bSibling = bParents[idx];
    if (siblings.indexOf(aSibling) > siblings.indexOf(bSibling)) {
      if (sharedParent === nodeB) {
        return DocumentPosition.FOLLOWING | DocumentPosition.CONTAINED_BY;
      }
      return DocumentPosition.FOLLOWING;
    }
    if (sharedParent === nodeA) {
      return DocumentPosition.PRECEDING | DocumentPosition.CONTAINS;
    }
    return DocumentPosition.PRECEDING;
  }
  function uniqueSort(nodes) {
    nodes = nodes.filter(function(node2, i, arr) {
      return !arr.includes(node2, i + 1);
    });
    nodes.sort(function(a, b) {
      var relative = compareDocumentPosition(a, b);
      if (relative & DocumentPosition.PRECEDING) {
        return -1;
      } else if (relative & DocumentPosition.FOLLOWING) {
        return 1;
      }
      return 0;
    });
    return nodes;
  }
  return helpers;
}
var feeds = {};
var hasRequiredFeeds;
function requireFeeds() {
  if (hasRequiredFeeds) return feeds;
  hasRequiredFeeds = 1;
  Object.defineProperty(feeds, "__esModule", { value: true });
  feeds.getFeed = getFeed;
  var stringify_js_1 = requireStringify$1();
  var legacy_js_1 = requireLegacy();
  function getFeed(doc) {
    var feedRoot = getOneElement(isValidFeed, doc);
    return !feedRoot ? null : feedRoot.name === "feed" ? getAtomFeed(feedRoot) : getRssFeed(feedRoot);
  }
  function getAtomFeed(feedRoot) {
    var _a;
    var childs = feedRoot.children;
    var feed = {
      type: "atom",
      items: (0, legacy_js_1.getElementsByTagName)("entry", childs).map(function(item) {
        var _a2;
        var children = item.children;
        var entry = { media: getMediaElements(children) };
        addConditionally(entry, "id", "id", children);
        addConditionally(entry, "title", "title", children);
        var href2 = (_a2 = getOneElement("link", children)) === null || _a2 === void 0 ? void 0 : _a2.attribs["href"];
        if (href2) {
          entry.link = href2;
        }
        var description = fetch2("summary", children) || fetch2("content", children);
        if (description) {
          entry.description = description;
        }
        var pubDate = fetch2("updated", children);
        if (pubDate) {
          entry.pubDate = new Date(pubDate);
        }
        return entry;
      })
    };
    addConditionally(feed, "id", "id", childs);
    addConditionally(feed, "title", "title", childs);
    var href = (_a = getOneElement("link", childs)) === null || _a === void 0 ? void 0 : _a.attribs["href"];
    if (href) {
      feed.link = href;
    }
    addConditionally(feed, "description", "subtitle", childs);
    var updated = fetch2("updated", childs);
    if (updated) {
      feed.updated = new Date(updated);
    }
    addConditionally(feed, "author", "email", childs, true);
    return feed;
  }
  function getRssFeed(feedRoot) {
    var _a, _b;
    var childs = (_b = (_a = getOneElement("channel", feedRoot.children)) === null || _a === void 0 ? void 0 : _a.children) !== null && _b !== void 0 ? _b : [];
    var feed = {
      type: feedRoot.name.substr(0, 3),
      id: "",
      items: (0, legacy_js_1.getElementsByTagName)("item", feedRoot.children).map(function(item) {
        var children = item.children;
        var entry = { media: getMediaElements(children) };
        addConditionally(entry, "id", "guid", children);
        addConditionally(entry, "title", "title", children);
        addConditionally(entry, "link", "link", children);
        addConditionally(entry, "description", "description", children);
        var pubDate = fetch2("pubDate", children) || fetch2("dc:date", children);
        if (pubDate)
          entry.pubDate = new Date(pubDate);
        return entry;
      })
    };
    addConditionally(feed, "title", "title", childs);
    addConditionally(feed, "link", "link", childs);
    addConditionally(feed, "description", "description", childs);
    var updated = fetch2("lastBuildDate", childs);
    if (updated) {
      feed.updated = new Date(updated);
    }
    addConditionally(feed, "author", "managingEditor", childs, true);
    return feed;
  }
  var MEDIA_KEYS_STRING = ["url", "type", "lang"];
  var MEDIA_KEYS_INT = [
    "fileSize",
    "bitrate",
    "framerate",
    "samplingrate",
    "channels",
    "duration",
    "height",
    "width"
  ];
  function getMediaElements(where) {
    return (0, legacy_js_1.getElementsByTagName)("media:content", where).map(function(elem) {
      var attribs = elem.attribs;
      var media = {
        medium: attribs["medium"],
        isDefault: !!attribs["isDefault"]
      };
      for (var _i = 0, MEDIA_KEYS_STRING_1 = MEDIA_KEYS_STRING; _i < MEDIA_KEYS_STRING_1.length; _i++) {
        var attrib = MEDIA_KEYS_STRING_1[_i];
        if (attribs[attrib]) {
          media[attrib] = attribs[attrib];
        }
      }
      for (var _a = 0, MEDIA_KEYS_INT_1 = MEDIA_KEYS_INT; _a < MEDIA_KEYS_INT_1.length; _a++) {
        var attrib = MEDIA_KEYS_INT_1[_a];
        if (attribs[attrib]) {
          media[attrib] = parseInt(attribs[attrib], 10);
        }
      }
      if (attribs["expression"]) {
        media.expression = attribs["expression"];
      }
      return media;
    });
  }
  function getOneElement(tagName, node2) {
    return (0, legacy_js_1.getElementsByTagName)(tagName, node2, true, 1)[0];
  }
  function fetch2(tagName, where, recurse) {
    if (recurse === void 0) {
      recurse = false;
    }
    return (0, stringify_js_1.textContent)((0, legacy_js_1.getElementsByTagName)(tagName, where, recurse, 1)).trim();
  }
  function addConditionally(obj, prop, tagName, where, recurse) {
    if (recurse === void 0) {
      recurse = false;
    }
    var val = fetch2(tagName, where, recurse);
    if (val)
      obj[prop] = val;
  }
  function isValidFeed(value) {
    return value === "rss" || value === "feed" || value === "rdf:RDF";
  }
  return feeds;
}
var hasRequiredLib$1;
function requireLib$1() {
  if (hasRequiredLib$1) return lib$2;
  hasRequiredLib$1 = 1;
  (function(exports$1) {
    var __createBinding = commonjsGlobal && commonjsGlobal.__createBinding || (Object.create ? function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    } : function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    });
    var __exportStar = commonjsGlobal && commonjsGlobal.__exportStar || function(m, exports$12) {
      for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports$12, p)) __createBinding(exports$12, m, p);
    };
    Object.defineProperty(exports$1, "__esModule", { value: true });
    exports$1.hasChildren = exports$1.isDocument = exports$1.isComment = exports$1.isText = exports$1.isCDATA = exports$1.isTag = void 0;
    __exportStar(requireStringify$1(), exports$1);
    __exportStar(requireTraversal(), exports$1);
    __exportStar(requireManipulation(), exports$1);
    __exportStar(requireQuerying(), exports$1);
    __exportStar(requireLegacy(), exports$1);
    __exportStar(requireHelpers(), exports$1);
    __exportStar(requireFeeds(), exports$1);
    var domhandler_1 = requireLib$4();
    Object.defineProperty(exports$1, "isTag", { enumerable: true, get: function() {
      return domhandler_1.isTag;
    } });
    Object.defineProperty(exports$1, "isCDATA", { enumerable: true, get: function() {
      return domhandler_1.isCDATA;
    } });
    Object.defineProperty(exports$1, "isText", { enumerable: true, get: function() {
      return domhandler_1.isText;
    } });
    Object.defineProperty(exports$1, "isComment", { enumerable: true, get: function() {
      return domhandler_1.isComment;
    } });
    Object.defineProperty(exports$1, "isDocument", { enumerable: true, get: function() {
      return domhandler_1.isDocument;
    } });
    Object.defineProperty(exports$1, "hasChildren", { enumerable: true, get: function() {
      return domhandler_1.hasChildren;
    } });
  })(lib$2);
  return lib$2;
}
var hasRequiredLib;
function requireLib() {
  if (hasRequiredLib) return lib$5;
  hasRequiredLib = 1;
  (function(exports$1) {
    var __createBinding = commonjsGlobal && commonjsGlobal.__createBinding || (Object.create ? function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    } : function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    });
    var __setModuleDefault = commonjsGlobal && commonjsGlobal.__setModuleDefault || (Object.create ? function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    } : function(o, v) {
      o["default"] = v;
    });
    var __importStar = commonjsGlobal && commonjsGlobal.__importStar || function(mod) {
      if (mod && mod.__esModule) return mod;
      var result2 = {};
      if (mod != null) {
        for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result2, mod, k);
      }
      __setModuleDefault(result2, mod);
      return result2;
    };
    var __importDefault = commonjsGlobal && commonjsGlobal.__importDefault || function(mod) {
      return mod && mod.__esModule ? mod : { "default": mod };
    };
    Object.defineProperty(exports$1, "__esModule", { value: true });
    exports$1.DomUtils = exports$1.parseFeed = exports$1.getFeed = exports$1.ElementType = exports$1.Tokenizer = exports$1.createDomStream = exports$1.parseDOM = exports$1.parseDocument = exports$1.DefaultHandler = exports$1.DomHandler = exports$1.Parser = void 0;
    var Parser_js_1 = requireParser$1();
    var Parser_js_2 = requireParser$1();
    Object.defineProperty(exports$1, "Parser", { enumerable: true, get: function() {
      return Parser_js_2.Parser;
    } });
    var domhandler_1 = requireLib$4();
    var domhandler_2 = requireLib$4();
    Object.defineProperty(exports$1, "DomHandler", { enumerable: true, get: function() {
      return domhandler_2.DomHandler;
    } });
    Object.defineProperty(exports$1, "DefaultHandler", { enumerable: true, get: function() {
      return domhandler_2.DomHandler;
    } });
    function parseDocument(data, options2) {
      var handler = new domhandler_1.DomHandler(void 0, options2);
      new Parser_js_1.Parser(handler, options2).end(data);
      return handler.root;
    }
    exports$1.parseDocument = parseDocument;
    function parseDOM(data, options2) {
      return parseDocument(data, options2).children;
    }
    exports$1.parseDOM = parseDOM;
    function createDomStream(callback, options2, elementCallback) {
      var handler = new domhandler_1.DomHandler(callback, options2, elementCallback);
      return new Parser_js_1.Parser(handler, options2);
    }
    exports$1.createDomStream = createDomStream;
    var Tokenizer_js_1 = requireTokenizer();
    Object.defineProperty(exports$1, "Tokenizer", { enumerable: true, get: function() {
      return __importDefault(Tokenizer_js_1).default;
    } });
    exports$1.ElementType = __importStar(requireLib$5());
    var domutils_1 = requireLib$1();
    var domutils_2 = requireLib$1();
    Object.defineProperty(exports$1, "getFeed", { enumerable: true, get: function() {
      return domutils_2.getFeed;
    } });
    var parseFeedDefaultOptions = { xmlMode: true };
    function parseFeed(feed, options2) {
      if (options2 === void 0) {
        options2 = parseFeedDefaultOptions;
      }
      return (0, domutils_1.getFeed)(parseDOM(feed, options2));
    }
    exports$1.parseFeed = parseFeed;
    exports$1.DomUtils = __importStar(requireLib$1());
  })(lib$5);
  return lib$5;
}
var escapeStringRegexp;
var hasRequiredEscapeStringRegexp;
function requireEscapeStringRegexp() {
  if (hasRequiredEscapeStringRegexp) return escapeStringRegexp;
  hasRequiredEscapeStringRegexp = 1;
  escapeStringRegexp = (string) => {
    if (typeof string !== "string") {
      throw new TypeError("Expected a string");
    }
    return string.replace(/[|\\{}()[\]^$+*?.]/g, "\\$&").replace(/-/g, "\\x2d");
  };
  return escapeStringRegexp;
}
var isPlainObject = {};
var hasRequiredIsPlainObject;
function requireIsPlainObject() {
  if (hasRequiredIsPlainObject) return isPlainObject;
  hasRequiredIsPlainObject = 1;
  Object.defineProperty(isPlainObject, "__esModule", { value: true });
  /*!
   * is-plain-object <https://github.com/jonschlinkert/is-plain-object>
   *
   * Copyright (c) 2014-2017, Jon Schlinkert.
   * Released under the MIT License.
   */
  function isObject(o) {
    return Object.prototype.toString.call(o) === "[object Object]";
  }
  function isPlainObject$1(o) {
    var ctor, prot;
    if (isObject(o) === false) return false;
    ctor = o.constructor;
    if (ctor === void 0) return true;
    prot = ctor.prototype;
    if (isObject(prot) === false) return false;
    if (prot.hasOwnProperty("isPrototypeOf") === false) {
      return false;
    }
    return true;
  }
  isPlainObject.isPlainObject = isPlainObject$1;
  return isPlainObject;
}
var cjs;
var hasRequiredCjs;
function requireCjs() {
  if (hasRequiredCjs) return cjs;
  hasRequiredCjs = 1;
  var isMergeableObject = function isMergeableObject2(value) {
    return isNonNullObject(value) && !isSpecial(value);
  };
  function isNonNullObject(value) {
    return !!value && typeof value === "object";
  }
  function isSpecial(value) {
    var stringValue = Object.prototype.toString.call(value);
    return stringValue === "[object RegExp]" || stringValue === "[object Date]" || isReactElement(value);
  }
  var canUseSymbol = typeof Symbol === "function" && Symbol.for;
  var REACT_ELEMENT_TYPE = canUseSymbol ? Symbol.for("react.element") : 60103;
  function isReactElement(value) {
    return value.$$typeof === REACT_ELEMENT_TYPE;
  }
  function emptyTarget(val) {
    return Array.isArray(val) ? [] : {};
  }
  function cloneUnlessOtherwiseSpecified(value, options2) {
    return options2.clone !== false && options2.isMergeableObject(value) ? deepmerge(emptyTarget(value), value, options2) : value;
  }
  function defaultArrayMerge(target, source, options2) {
    return target.concat(source).map(function(element) {
      return cloneUnlessOtherwiseSpecified(element, options2);
    });
  }
  function getMergeFunction(key, options2) {
    if (!options2.customMerge) {
      return deepmerge;
    }
    var customMerge = options2.customMerge(key);
    return typeof customMerge === "function" ? customMerge : deepmerge;
  }
  function getEnumerableOwnPropertySymbols(target) {
    return Object.getOwnPropertySymbols ? Object.getOwnPropertySymbols(target).filter(function(symbol) {
      return Object.propertyIsEnumerable.call(target, symbol);
    }) : [];
  }
  function getKeys(target) {
    return Object.keys(target).concat(getEnumerableOwnPropertySymbols(target));
  }
  function propertyIsOnObject(object, property) {
    try {
      return property in object;
    } catch (_) {
      return false;
    }
  }
  function propertyIsUnsafe(target, key) {
    return propertyIsOnObject(target, key) && !(Object.hasOwnProperty.call(target, key) && Object.propertyIsEnumerable.call(target, key));
  }
  function mergeObject(target, source, options2) {
    var destination = {};
    if (options2.isMergeableObject(target)) {
      getKeys(target).forEach(function(key) {
        destination[key] = cloneUnlessOtherwiseSpecified(target[key], options2);
      });
    }
    getKeys(source).forEach(function(key) {
      if (propertyIsUnsafe(target, key)) {
        return;
      }
      if (propertyIsOnObject(target, key) && options2.isMergeableObject(source[key])) {
        destination[key] = getMergeFunction(key, options2)(target[key], source[key], options2);
      } else {
        destination[key] = cloneUnlessOtherwiseSpecified(source[key], options2);
      }
    });
    return destination;
  }
  function deepmerge(target, source, options2) {
    options2 = options2 || {};
    options2.arrayMerge = options2.arrayMerge || defaultArrayMerge;
    options2.isMergeableObject = options2.isMergeableObject || isMergeableObject;
    options2.cloneUnlessOtherwiseSpecified = cloneUnlessOtherwiseSpecified;
    var sourceIsArray = Array.isArray(source);
    var targetIsArray = Array.isArray(target);
    var sourceAndTargetTypesMatch = sourceIsArray === targetIsArray;
    if (!sourceAndTargetTypesMatch) {
      return cloneUnlessOtherwiseSpecified(source, options2);
    } else if (sourceIsArray) {
      return options2.arrayMerge(target, source, options2);
    } else {
      return mergeObject(target, source, options2);
    }
  }
  deepmerge.all = function deepmergeAll(array, options2) {
    if (!Array.isArray(array)) {
      throw new Error("first argument should be an array");
    }
    return array.reduce(function(prev, next) {
      return deepmerge(prev, next, options2);
    }, {});
  };
  var deepmerge_1 = deepmerge;
  cjs = deepmerge_1;
  return cjs;
}
var parseSrcset = { exports: {} };
var hasRequiredParseSrcset;
function requireParseSrcset() {
  if (hasRequiredParseSrcset) return parseSrcset.exports;
  hasRequiredParseSrcset = 1;
  (function(module) {
    (function(root2, factory) {
      if (module.exports) {
        module.exports = factory();
      } else {
        root2.parseSrcset = factory();
      }
    })(commonjsGlobal, function() {
      return function(input2) {
        function isSpace(c2) {
          return c2 === " " || // space
          c2 === "	" || // horizontal tab
          c2 === "\n" || // new line
          c2 === "\f" || // form feed
          c2 === "\r";
        }
        function collectCharacters(regEx) {
          var chars, match = regEx.exec(input2.substring(pos));
          if (match) {
            chars = match[0];
            pos += chars.length;
            return chars;
          }
        }
        var inputLength = input2.length, regexLeadingSpaces = /^[ \t\n\r\u000c]+/, regexLeadingCommasOrSpaces = /^[, \t\n\r\u000c]+/, regexLeadingNotSpaces = /^[^ \t\n\r\u000c]+/, regexTrailingCommas = /[,]+$/, regexNonNegativeInteger = /^\d+$/, regexFloatingPoint = /^-?(?:[0-9]+|[0-9]*\.[0-9]+)(?:[eE][+-]?[0-9]+)?$/, url, descriptors, currentDescriptor, state, c, pos = 0, candidates = [];
        while (true) {
          collectCharacters(regexLeadingCommasOrSpaces);
          if (pos >= inputLength) {
            return candidates;
          }
          url = collectCharacters(regexLeadingNotSpaces);
          descriptors = [];
          if (url.slice(-1) === ",") {
            url = url.replace(regexTrailingCommas, "");
            parseDescriptors();
          } else {
            tokenize2();
          }
        }
        function tokenize2() {
          collectCharacters(regexLeadingSpaces);
          currentDescriptor = "";
          state = "in descriptor";
          while (true) {
            c = input2.charAt(pos);
            if (state === "in descriptor") {
              if (isSpace(c)) {
                if (currentDescriptor) {
                  descriptors.push(currentDescriptor);
                  currentDescriptor = "";
                  state = "after descriptor";
                }
              } else if (c === ",") {
                pos += 1;
                if (currentDescriptor) {
                  descriptors.push(currentDescriptor);
                }
                parseDescriptors();
                return;
              } else if (c === "(") {
                currentDescriptor = currentDescriptor + c;
                state = "in parens";
              } else if (c === "") {
                if (currentDescriptor) {
                  descriptors.push(currentDescriptor);
                }
                parseDescriptors();
                return;
              } else {
                currentDescriptor = currentDescriptor + c;
              }
            } else if (state === "in parens") {
              if (c === ")") {
                currentDescriptor = currentDescriptor + c;
                state = "in descriptor";
              } else if (c === "") {
                descriptors.push(currentDescriptor);
                parseDescriptors();
                return;
              } else {
                currentDescriptor = currentDescriptor + c;
              }
            } else if (state === "after descriptor") {
              if (isSpace(c)) ;
              else if (c === "") {
                parseDescriptors();
                return;
              } else {
                state = "in descriptor";
                pos -= 1;
              }
            }
            pos += 1;
          }
        }
        function parseDescriptors() {
          var pError = false, w, d, h, i, candidate = {}, desc, lastChar, value, intVal, floatVal;
          for (i = 0; i < descriptors.length; i++) {
            desc = descriptors[i];
            lastChar = desc[desc.length - 1];
            value = desc.substring(0, desc.length - 1);
            intVal = parseInt(value, 10);
            floatVal = parseFloat(value);
            if (regexNonNegativeInteger.test(value) && lastChar === "w") {
              if (w || d) {
                pError = true;
              }
              if (intVal === 0) {
                pError = true;
              } else {
                w = intVal;
              }
            } else if (regexFloatingPoint.test(value) && lastChar === "x") {
              if (w || d || h) {
                pError = true;
              }
              if (floatVal < 0) {
                pError = true;
              } else {
                d = floatVal;
              }
            } else if (regexNonNegativeInteger.test(value) && lastChar === "h") {
              if (h || d) {
                pError = true;
              }
              if (intVal === 0) {
                pError = true;
              } else {
                h = intVal;
              }
            } else {
              pError = true;
            }
          }
          if (!pError) {
            candidate.url = url;
            if (w) {
              candidate.w = w;
            }
            if (d) {
              candidate.d = d;
            }
            if (h) {
              candidate.h = h;
            }
            candidates.push(candidate);
          } else if (console && console.log) {
            console.log("Invalid srcset descriptor found in '" + input2 + "' at '" + desc + "'.");
          }
        }
      };
    });
  })(parseSrcset);
  return parseSrcset.exports;
}
var picocolors_browser = { exports: {} };
var hasRequiredPicocolors_browser;
function requirePicocolors_browser() {
  if (hasRequiredPicocolors_browser) return picocolors_browser.exports;
  hasRequiredPicocolors_browser = 1;
  var x = String;
  var create = function() {
    return { isColorSupported: false, reset: x, bold: x, dim: x, italic: x, underline: x, inverse: x, hidden: x, strikethrough: x, black: x, red: x, green: x, yellow: x, blue: x, magenta: x, cyan: x, white: x, gray: x, bgBlack: x, bgRed: x, bgGreen: x, bgYellow: x, bgBlue: x, bgMagenta: x, bgCyan: x, bgWhite: x, blackBright: x, redBright: x, greenBright: x, yellowBright: x, blueBright: x, magentaBright: x, cyanBright: x, whiteBright: x, bgBlackBright: x, bgRedBright: x, bgGreenBright: x, bgYellowBright: x, bgBlueBright: x, bgMagentaBright: x, bgCyanBright: x, bgWhiteBright: x };
  };
  picocolors_browser.exports = create();
  picocolors_browser.exports.createColors = create;
  return picocolors_browser.exports;
}
const __viteBrowserExternal = {};
const __viteBrowserExternal$1 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: __viteBrowserExternal
}, Symbol.toStringTag, { value: "Module" }));
const require$$1 = /* @__PURE__ */ getAugmentedNamespace(__viteBrowserExternal$1);
var cssSyntaxError;
var hasRequiredCssSyntaxError;
function requireCssSyntaxError() {
  if (hasRequiredCssSyntaxError) return cssSyntaxError;
  hasRequiredCssSyntaxError = 1;
  let pico = requirePicocolors_browser();
  let terminalHighlight = require$$1;
  class CssSyntaxError extends Error {
    constructor(message, line, column, source, file, plugin) {
      super(message);
      this.name = "CssSyntaxError";
      this.reason = message;
      if (file) {
        this.file = file;
      }
      if (source) {
        this.source = source;
      }
      if (plugin) {
        this.plugin = plugin;
      }
      if (typeof line !== "undefined" && typeof column !== "undefined") {
        if (typeof line === "number") {
          this.line = line;
          this.column = column;
        } else {
          this.line = line.line;
          this.column = line.column;
          this.endLine = column.line;
          this.endColumn = column.column;
        }
      }
      this.setMessage();
      if (Error.captureStackTrace) {
        Error.captureStackTrace(this, CssSyntaxError);
      }
    }
    setMessage() {
      this.message = this.plugin ? this.plugin + ": " : "";
      this.message += this.file ? this.file : "<css input>";
      if (typeof this.line !== "undefined") {
        this.message += ":" + this.line + ":" + this.column;
      }
      this.message += ": " + this.reason;
    }
    showSourceCode(color) {
      if (!this.source) return "";
      let css = this.source;
      if (color == null) color = pico.isColorSupported;
      let aside = (text) => text;
      let mark = (text) => text;
      let highlight = (text) => text;
      if (color) {
        let { bold, gray, red } = pico.createColors(true);
        mark = (text) => bold(red(text));
        aside = (text) => gray(text);
        if (terminalHighlight) {
          highlight = (text) => terminalHighlight(text);
        }
      }
      let lines = css.split(/\r?\n/);
      let start = Math.max(this.line - 3, 0);
      let end = Math.min(this.line + 2, lines.length);
      let maxWidth = String(end).length;
      return lines.slice(start, end).map((line, index2) => {
        let number = start + 1 + index2;
        let gutter = " " + (" " + number).slice(-maxWidth) + " | ";
        if (number === this.line) {
          if (line.length > 160) {
            let padding = 20;
            let subLineStart = Math.max(0, this.column - padding);
            let subLineEnd = Math.max(
              this.column + padding,
              this.endColumn + padding
            );
            let subLine = line.slice(subLineStart, subLineEnd);
            let spacing2 = aside(gutter.replace(/\d/g, " ")) + line.slice(0, Math.min(this.column - 1, padding - 1)).replace(/[^\t]/g, " ");
            return mark(">") + aside(gutter) + highlight(subLine) + "\n " + spacing2 + mark("^");
          }
          let spacing = aside(gutter.replace(/\d/g, " ")) + line.slice(0, this.column - 1).replace(/[^\t]/g, " ");
          return mark(">") + aside(gutter) + highlight(line) + "\n " + spacing + mark("^");
        }
        return " " + aside(gutter) + highlight(line);
      }).join("\n");
    }
    toString() {
      let code = this.showSourceCode();
      if (code) {
        code = "\n\n" + code + "\n";
      }
      return this.name + ": " + this.message + code;
    }
  }
  cssSyntaxError = CssSyntaxError;
  CssSyntaxError.default = CssSyntaxError;
  return cssSyntaxError;
}
var stringifier;
var hasRequiredStringifier;
function requireStringifier() {
  if (hasRequiredStringifier) return stringifier;
  hasRequiredStringifier = 1;
  const STYLE_TAG = /(<)(\/?style\b)/gi;
  const COMMENT_OPEN = /(<)(!--)/g;
  function escapeHTMLInCSS(str) {
    if (typeof str !== "string") return str;
    if (!str.includes("<")) return str;
    return str.replace(STYLE_TAG, "\\3c $2").replace(COMMENT_OPEN, "\\3c $2");
  }
  const DEFAULT_RAW = {
    after: "\n",
    beforeClose: "\n",
    beforeComment: "\n",
    beforeDecl: "\n",
    beforeOpen: " ",
    beforeRule: "\n",
    colon: ": ",
    commentLeft: " ",
    commentRight: " ",
    emptyBody: "",
    indent: "    ",
    semicolon: false
  };
  function capitalize(str) {
    return str[0].toUpperCase() + str.slice(1);
  }
  class Stringifier {
    constructor(builder) {
      this.builder = builder;
    }
    atrule(node2, semicolon) {
      let name = "@" + node2.name;
      let params = node2.params ? this.rawValue(node2, "params") : "";
      if (typeof node2.raws.afterName !== "undefined") {
        name += node2.raws.afterName;
      } else if (params) {
        name += " ";
      }
      if (node2.nodes) {
        this.block(node2, name + params);
      } else {
        let end = (node2.raws.between || "") + (semicolon ? ";" : "");
        this.builder(escapeHTMLInCSS(name + params + end), node2);
      }
    }
    beforeAfter(node2, detect) {
      let value;
      if (node2.type === "decl") {
        value = this.raw(node2, null, "beforeDecl");
      } else if (node2.type === "comment") {
        value = this.raw(node2, null, "beforeComment");
      } else if (detect === "before") {
        value = this.raw(node2, null, "beforeRule");
      } else {
        value = this.raw(node2, null, "beforeClose");
      }
      let buf = node2.parent;
      let depth = 0;
      while (buf && buf.type !== "root") {
        depth += 1;
        buf = buf.parent;
      }
      if (value.includes("\n")) {
        let indent = this.raw(node2, null, "indent");
        if (indent.length) {
          for (let step = 0; step < depth; step++) value += indent;
        }
      }
      return value;
    }
    block(node2, start) {
      let between = this.raw(node2, "between", "beforeOpen");
      this.builder(escapeHTMLInCSS(start + between) + "{", node2, "start");
      let after;
      if (node2.nodes && node2.nodes.length) {
        this.body(node2);
        after = this.raw(node2, "after");
      } else {
        after = this.raw(node2, "after", "emptyBody");
      }
      if (after) this.builder(escapeHTMLInCSS(after));
      this.builder("}", node2, "end");
    }
    body(node2) {
      let last = node2.nodes.length - 1;
      while (last > 0) {
        if (node2.nodes[last].type !== "comment") break;
        last -= 1;
      }
      let semicolon = this.raw(node2, "semicolon");
      let isDocument = node2.type === "document";
      for (let i = 0; i < node2.nodes.length; i++) {
        let child = node2.nodes[i];
        let before = this.raw(child, "before");
        if (before) this.builder(isDocument ? before : escapeHTMLInCSS(before));
        this.stringify(child, last !== i || semicolon);
      }
    }
    comment(node2) {
      let left = this.raw(node2, "left", "commentLeft");
      let right = this.raw(node2, "right", "commentRight");
      this.builder(escapeHTMLInCSS("/*" + left + node2.text + right + "*/"), node2);
    }
    decl(node2, semicolon) {
      let between = this.raw(node2, "between", "colon");
      let string = node2.prop + between + this.rawValue(node2, "value");
      if (node2.important) {
        string += node2.raws.important || " !important";
      }
      if (semicolon) string += ";";
      this.builder(escapeHTMLInCSS(string), node2);
    }
    document(node2) {
      this.body(node2);
    }
    raw(node2, own, detect) {
      let value;
      if (!detect) detect = own;
      if (own) {
        value = node2.raws[own];
        if (typeof value !== "undefined") return value;
      }
      let parent = node2.parent;
      if (detect === "before") {
        if (!parent || parent.type === "root" && parent.first === node2) {
          return "";
        }
        if (parent && parent.type === "document") {
          return "";
        }
      }
      if (!parent) return DEFAULT_RAW[detect];
      let root2 = node2.root();
      if (!root2.rawCache) root2.rawCache = {};
      if (typeof root2.rawCache[detect] !== "undefined") {
        return root2.rawCache[detect];
      }
      if (detect === "before" || detect === "after") {
        return this.beforeAfter(node2, detect);
      } else {
        let method = "raw" + capitalize(detect);
        if (this[method]) {
          value = this[method](root2, node2);
        } else {
          root2.walk((i) => {
            value = i.raws[own];
            if (typeof value !== "undefined") return false;
          });
        }
      }
      if (typeof value === "undefined") value = DEFAULT_RAW[detect];
      root2.rawCache[detect] = value;
      return value;
    }
    rawBeforeClose(root2) {
      let value;
      root2.walk((i) => {
        if (i.nodes && i.nodes.length > 0) {
          if (typeof i.raws.after !== "undefined") {
            value = i.raws.after;
            if (value.includes("\n")) {
              value = value.replace(/[^\n]+$/, "");
            }
            return false;
          }
        }
      });
      if (value) value = value.replace(/\S/g, "");
      return value;
    }
    rawBeforeComment(root2, node2) {
      let value;
      root2.walkComments((i) => {
        if (typeof i.raws.before !== "undefined") {
          value = i.raws.before;
          if (value.includes("\n")) {
            value = value.replace(/[^\n]+$/, "");
          }
          return false;
        }
      });
      if (typeof value === "undefined") {
        value = this.raw(node2, null, "beforeDecl");
      } else if (value) {
        value = value.replace(/\S/g, "");
      }
      return value;
    }
    rawBeforeDecl(root2, node2) {
      let value;
      root2.walkDecls((i) => {
        if (typeof i.raws.before !== "undefined") {
          value = i.raws.before;
          if (value.includes("\n")) {
            value = value.replace(/[^\n]+$/, "");
          }
          return false;
        }
      });
      if (typeof value === "undefined") {
        value = this.raw(node2, null, "beforeRule");
      } else if (value) {
        value = value.replace(/\S/g, "");
      }
      return value;
    }
    rawBeforeOpen(root2) {
      let value;
      root2.walk((i) => {
        if (i.type !== "decl") {
          value = i.raws.between;
          if (typeof value !== "undefined") return false;
        }
      });
      return value;
    }
    rawBeforeRule(root2) {
      let value;
      root2.walk((i) => {
        if (i.nodes && (i.parent !== root2 || root2.first !== i)) {
          if (typeof i.raws.before !== "undefined") {
            value = i.raws.before;
            if (value.includes("\n")) {
              value = value.replace(/[^\n]+$/, "");
            }
            return false;
          }
        }
      });
      if (value) value = value.replace(/\S/g, "");
      return value;
    }
    rawColon(root2) {
      let value;
      root2.walkDecls((i) => {
        if (typeof i.raws.between !== "undefined") {
          value = i.raws.between.replace(/[^\s:]/g, "");
          return false;
        }
      });
      return value;
    }
    rawEmptyBody(root2) {
      let value;
      root2.walk((i) => {
        if (i.nodes && i.nodes.length === 0) {
          value = i.raws.after;
          if (typeof value !== "undefined") return false;
        }
      });
      return value;
    }
    rawIndent(root2) {
      if (root2.raws.indent) return root2.raws.indent;
      let value;
      root2.walk((i) => {
        let p = i.parent;
        if (p && p !== root2 && p.parent && p.parent === root2) {
          if (typeof i.raws.before !== "undefined") {
            let parts = i.raws.before.split("\n");
            value = parts[parts.length - 1];
            value = value.replace(/\S/g, "");
            return false;
          }
        }
      });
      return value;
    }
    rawSemicolon(root2) {
      let value;
      root2.walk((i) => {
        if (i.nodes && i.nodes.length && i.last.type === "decl") {
          value = i.raws.semicolon;
          if (typeof value !== "undefined") return false;
        }
      });
      return value;
    }
    rawValue(node2, prop) {
      let value = node2[prop];
      let raw = node2.raws[prop];
      if (raw && raw.value === value) {
        return raw.raw;
      }
      return value;
    }
    root(node2) {
      this.body(node2);
      if (node2.raws.after) {
        let after = node2.raws.after;
        let isDocument = node2.parent && node2.parent.type === "document";
        this.builder(isDocument ? after : escapeHTMLInCSS(after));
      }
    }
    rule(node2) {
      this.block(node2, this.rawValue(node2, "selector"));
      if (node2.raws.ownSemicolon) {
        this.builder(escapeHTMLInCSS(node2.raws.ownSemicolon), node2, "end");
      }
    }
    stringify(node2, semicolon) {
      if (!this[node2.type]) {
        throw new Error(
          "Unknown AST node type " + node2.type + ". Maybe you need to change PostCSS stringifier."
        );
      }
      this[node2.type](node2, semicolon);
    }
  }
  stringifier = Stringifier;
  Stringifier.default = Stringifier;
  return stringifier;
}
var stringify_1;
var hasRequiredStringify;
function requireStringify() {
  if (hasRequiredStringify) return stringify_1;
  hasRequiredStringify = 1;
  let Stringifier = requireStringifier();
  function stringify2(node2, builder) {
    let str = new Stringifier(builder);
    str.stringify(node2);
  }
  stringify_1 = stringify2;
  stringify2.default = stringify2;
  return stringify_1;
}
var symbols = {};
var hasRequiredSymbols;
function requireSymbols() {
  if (hasRequiredSymbols) return symbols;
  hasRequiredSymbols = 1;
  symbols.isClean = Symbol("isClean");
  symbols.my = Symbol("my");
  return symbols;
}
var node;
var hasRequiredNode;
function requireNode() {
  if (hasRequiredNode) return node;
  hasRequiredNode = 1;
  let CssSyntaxError = requireCssSyntaxError();
  let Stringifier = requireStringifier();
  let stringify2 = requireStringify();
  let { isClean, my } = requireSymbols();
  function cloneNode(obj, parent) {
    let cloned = new obj.constructor();
    for (let i in obj) {
      if (!Object.prototype.hasOwnProperty.call(obj, i)) {
        continue;
      }
      if (i === "proxyCache") continue;
      let value = obj[i];
      let type = typeof value;
      if (i === "parent" && type === "object") {
        if (parent) cloned[i] = parent;
      } else if (i === "source") {
        cloned[i] = value;
      } else if (Array.isArray(value)) {
        cloned[i] = value.map((j) => cloneNode(j, cloned));
      } else {
        if (type === "object" && value !== null) value = cloneNode(value);
        cloned[i] = value;
      }
    }
    return cloned;
  }
  function sourceOffset(inputCSS, position) {
    if (position && typeof position.offset !== "undefined") {
      return position.offset;
    }
    let column = 1;
    let line = 1;
    let offset = 0;
    for (let i = 0; i < inputCSS.length; i++) {
      if (line === position.line && column === position.column) {
        offset = i;
        break;
      }
      if (inputCSS[i] === "\n") {
        column = 1;
        line += 1;
      } else {
        column += 1;
      }
    }
    return offset;
  }
  class Node {
    get proxyOf() {
      return this;
    }
    constructor(defaults = {}) {
      this.raws = {};
      this[isClean] = false;
      this[my] = true;
      for (let name in defaults) {
        if (name === "nodes") {
          this.nodes = [];
          for (let node2 of defaults[name]) {
            if (typeof node2.clone === "function") {
              this.append(node2.clone());
            } else {
              this.append(node2);
            }
          }
        } else {
          this[name] = defaults[name];
        }
      }
    }
    addToError(error) {
      error.postcssNode = this;
      if (error.stack && this.source && /\n\s{4}at /.test(error.stack)) {
        let s = this.source;
        error.stack = error.stack.replace(
          /\n\s{4}at /,
          `$&${s.input.from}:${s.start.line}:${s.start.column}$&`
        );
      }
      return error;
    }
    after(add) {
      this.parent.insertAfter(this, add);
      return this;
    }
    assign(overrides = {}) {
      for (let name in overrides) {
        this[name] = overrides[name];
      }
      return this;
    }
    before(add) {
      this.parent.insertBefore(this, add);
      return this;
    }
    cleanRaws(keepBetween) {
      delete this.raws.before;
      delete this.raws.after;
      if (!keepBetween) delete this.raws.between;
    }
    clone(overrides = {}) {
      let cloned = cloneNode(this);
      for (let name in overrides) {
        cloned[name] = overrides[name];
      }
      return cloned;
    }
    cloneAfter(overrides = {}) {
      let cloned = this.clone(overrides);
      this.parent.insertAfter(this, cloned);
      return cloned;
    }
    cloneBefore(overrides = {}) {
      let cloned = this.clone(overrides);
      this.parent.insertBefore(this, cloned);
      return cloned;
    }
    error(message, opts = {}) {
      if (this.source) {
        let { end, start } = this.rangeBy(opts);
        return this.source.input.error(
          message,
          { column: start.column, line: start.line },
          { column: end.column, line: end.line },
          opts
        );
      }
      return new CssSyntaxError(message);
    }
    getProxyProcessor() {
      return {
        get(node2, prop) {
          if (prop === "proxyOf") {
            return node2;
          } else if (prop === "root") {
            return () => node2.root().toProxy();
          } else {
            return node2[prop];
          }
        },
        set(node2, prop, value) {
          if (node2[prop] === value) return true;
          node2[prop] = value;
          if (prop === "prop" || prop === "value" || prop === "name" || prop === "params" || prop === "important" || /* c8 ignore next */
          prop === "text") {
            node2.markDirty();
          }
          return true;
        }
      };
    }
    /* c8 ignore next 3 */
    markClean() {
      this[isClean] = true;
    }
    markDirty() {
      if (this[isClean]) {
        this[isClean] = false;
        let next = this;
        while (next = next.parent) {
          next[isClean] = false;
        }
      }
    }
    next() {
      if (!this.parent) return void 0;
      let index2 = this.parent.index(this);
      return this.parent.nodes[index2 + 1];
    }
    positionBy(opts = {}) {
      let pos = this.source.start;
      if (opts.index) {
        pos = this.positionInside(opts.index);
      } else if (opts.word) {
        let inputString = "document" in this.source.input ? this.source.input.document : this.source.input.css;
        let stringRepresentation = inputString.slice(
          sourceOffset(inputString, this.source.start),
          sourceOffset(inputString, this.source.end)
        );
        let index2 = stringRepresentation.indexOf(opts.word);
        if (index2 !== -1) pos = this.positionInside(index2);
      }
      return pos;
    }
    positionInside(index2) {
      let column = this.source.start.column;
      let line = this.source.start.line;
      let inputString = "document" in this.source.input ? this.source.input.document : this.source.input.css;
      let offset = sourceOffset(inputString, this.source.start);
      let end = offset + index2;
      for (let i = offset; i < end; i++) {
        if (inputString[i] === "\n") {
          column = 1;
          line += 1;
        } else {
          column += 1;
        }
      }
      return { column, line, offset: end };
    }
    prev() {
      if (!this.parent) return void 0;
      let index2 = this.parent.index(this);
      return this.parent.nodes[index2 - 1];
    }
    rangeBy(opts = {}) {
      let inputString = "document" in this.source.input ? this.source.input.document : this.source.input.css;
      let start = {
        column: this.source.start.column,
        line: this.source.start.line,
        offset: sourceOffset(inputString, this.source.start)
      };
      let end = this.source.end ? {
        column: this.source.end.column + 1,
        line: this.source.end.line,
        offset: typeof this.source.end.offset === "number" ? (
          // `source.end.offset` is exclusive, so we don't need to add 1
          this.source.end.offset
        ) : (
          // Since line/column in this.source.end is inclusive,
          // the `sourceOffset(... , this.source.end)` returns an inclusive offset.
          // So, we add 1 to convert it to exclusive.
          sourceOffset(inputString, this.source.end) + 1
        )
      } : {
        column: start.column + 1,
        line: start.line,
        offset: start.offset + 1
      };
      if (opts.word) {
        let stringRepresentation = inputString.slice(
          sourceOffset(inputString, this.source.start),
          sourceOffset(inputString, this.source.end)
        );
        let index2 = stringRepresentation.indexOf(opts.word);
        if (index2 !== -1) {
          start = this.positionInside(index2);
          end = this.positionInside(index2 + opts.word.length);
        }
      } else {
        if (opts.start) {
          start = {
            column: opts.start.column,
            line: opts.start.line,
            offset: sourceOffset(inputString, opts.start)
          };
        } else if (opts.index) {
          start = this.positionInside(opts.index);
        }
        if (opts.end) {
          end = {
            column: opts.end.column,
            line: opts.end.line,
            offset: sourceOffset(inputString, opts.end)
          };
        } else if (typeof opts.endIndex === "number") {
          end = this.positionInside(opts.endIndex);
        } else if (opts.index) {
          end = this.positionInside(opts.index + 1);
        }
      }
      if (end.line < start.line || end.line === start.line && end.column <= start.column) {
        end = {
          column: start.column + 1,
          line: start.line,
          offset: start.offset + 1
        };
      }
      return { end, start };
    }
    raw(prop, defaultType) {
      let str = new Stringifier();
      return str.raw(this, prop, defaultType);
    }
    remove() {
      if (this.parent) {
        this.parent.removeChild(this);
      }
      this.parent = void 0;
      return this;
    }
    replaceWith(...nodes) {
      if (this.parent) {
        let bookmark = this;
        let foundSelf = false;
        for (let node2 of nodes) {
          if (node2 === this) {
            foundSelf = true;
          } else if (foundSelf) {
            this.parent.insertAfter(bookmark, node2);
            bookmark = node2;
          } else {
            this.parent.insertBefore(bookmark, node2);
          }
        }
        if (!foundSelf) {
          this.remove();
        }
      }
      return this;
    }
    root() {
      let result2 = this;
      while (result2.parent && result2.parent.type !== "document") {
        result2 = result2.parent;
      }
      return result2;
    }
    toJSON(_, inputs) {
      let fixed = {};
      let emitInputs = inputs == null;
      inputs = inputs || /* @__PURE__ */ new Map();
      let inputsNextIndex = 0;
      for (let name in this) {
        if (!Object.prototype.hasOwnProperty.call(this, name)) {
          continue;
        }
        if (name === "parent" || name === "proxyCache") continue;
        let value = this[name];
        if (Array.isArray(value)) {
          fixed[name] = value.map((i) => {
            if (typeof i === "object" && i.toJSON) {
              return i.toJSON(null, inputs);
            } else {
              return i;
            }
          });
        } else if (typeof value === "object" && value.toJSON) {
          fixed[name] = value.toJSON(null, inputs);
        } else if (name === "source") {
          if (value == null) continue;
          let inputId = inputs.get(value.input);
          if (inputId == null) {
            inputId = inputsNextIndex;
            inputs.set(value.input, inputsNextIndex);
            inputsNextIndex++;
          }
          fixed[name] = {
            end: value.end,
            inputId,
            start: value.start
          };
        } else {
          fixed[name] = value;
        }
      }
      if (emitInputs) {
        fixed.inputs = [...inputs.keys()].map((input2) => input2.toJSON());
      }
      return fixed;
    }
    toProxy() {
      if (!this.proxyCache) {
        this.proxyCache = new Proxy(this, this.getProxyProcessor());
      }
      return this.proxyCache;
    }
    toString(stringifier2 = stringify2) {
      if (stringifier2.stringify) stringifier2 = stringifier2.stringify;
      let result2 = "";
      stringifier2(this, (i) => {
        result2 += i;
      });
      return result2;
    }
    warn(result2, text, opts = {}) {
      let data = { node: this };
      for (let i in opts) data[i] = opts[i];
      return result2.warn(text, data);
    }
  }
  node = Node;
  Node.default = Node;
  return node;
}
var comment;
var hasRequiredComment;
function requireComment() {
  if (hasRequiredComment) return comment;
  hasRequiredComment = 1;
  let Node = requireNode();
  class Comment extends Node {
    constructor(defaults) {
      super(defaults);
      this.type = "comment";
    }
  }
  comment = Comment;
  Comment.default = Comment;
  return comment;
}
var declaration;
var hasRequiredDeclaration;
function requireDeclaration() {
  if (hasRequiredDeclaration) return declaration;
  hasRequiredDeclaration = 1;
  let Node = requireNode();
  class Declaration extends Node {
    get variable() {
      return this.prop.startsWith("--") || this.prop[0] === "$";
    }
    constructor(defaults) {
      if (defaults && typeof defaults.value !== "undefined" && typeof defaults.value !== "string") {
        defaults = { ...defaults, value: String(defaults.value) };
      }
      super(defaults);
      this.type = "decl";
    }
  }
  declaration = Declaration;
  Declaration.default = Declaration;
  return declaration;
}
var container;
var hasRequiredContainer;
function requireContainer() {
  if (hasRequiredContainer) return container;
  hasRequiredContainer = 1;
  let Comment = requireComment();
  let Declaration = requireDeclaration();
  let Node = requireNode();
  let { isClean, my } = requireSymbols();
  let AtRule, parse, Root, Rule;
  function cleanSource(nodes) {
    return nodes.map((i) => {
      if (i.nodes) i.nodes = cleanSource(i.nodes);
      delete i.source;
      return i;
    });
  }
  function markTreeDirty(node2) {
    node2[isClean] = false;
    if (node2.proxyOf.nodes) {
      for (let i of node2.proxyOf.nodes) {
        markTreeDirty(i);
      }
    }
  }
  class Container extends Node {
    get first() {
      if (!this.proxyOf.nodes) return void 0;
      return this.proxyOf.nodes[0];
    }
    get last() {
      if (!this.proxyOf.nodes) return void 0;
      return this.proxyOf.nodes[this.proxyOf.nodes.length - 1];
    }
    append(...children) {
      for (let child of children) {
        let nodes = this.normalize(child, this.last);
        for (let node2 of nodes) this.proxyOf.nodes.push(node2);
      }
      this.markDirty();
      return this;
    }
    cleanRaws(keepBetween) {
      super.cleanRaws(keepBetween);
      if (this.nodes) {
        for (let node2 of this.nodes) node2.cleanRaws(keepBetween);
      }
    }
    each(callback) {
      if (!this.proxyOf.nodes) return void 0;
      let iterator = this.getIterator();
      let index2, result2;
      while (this.indexes[iterator] < this.proxyOf.nodes.length) {
        index2 = this.indexes[iterator];
        result2 = callback(this.proxyOf.nodes[index2], index2);
        if (result2 === false) break;
        this.indexes[iterator] += 1;
      }
      delete this.indexes[iterator];
      return result2;
    }
    every(condition) {
      return this.nodes.every(condition);
    }
    getIterator() {
      if (!this.lastEach) this.lastEach = 0;
      if (!this.indexes) this.indexes = {};
      this.lastEach += 1;
      let iterator = this.lastEach;
      this.indexes[iterator] = 0;
      return iterator;
    }
    getProxyProcessor() {
      return {
        get(node2, prop) {
          if (prop === "proxyOf") {
            return node2;
          } else if (!node2[prop]) {
            return node2[prop];
          } else if (prop === "each" || typeof prop === "string" && prop.startsWith("walk")) {
            return (...args) => {
              return node2[prop](
                ...args.map((i) => {
                  if (typeof i === "function") {
                    return (child, index2) => i(child.toProxy(), index2);
                  } else {
                    return i;
                  }
                })
              );
            };
          } else if (prop === "every" || prop === "some") {
            return (cb) => {
              return node2[prop](
                (child, ...other) => cb(child.toProxy(), ...other)
              );
            };
          } else if (prop === "root") {
            return () => node2.root().toProxy();
          } else if (prop === "nodes") {
            return node2.nodes.map((i) => i.toProxy());
          } else if (prop === "first" || prop === "last") {
            return node2[prop].toProxy();
          } else {
            return node2[prop];
          }
        },
        set(node2, prop, value) {
          if (node2[prop] === value) return true;
          node2[prop] = value;
          if (prop === "name" || prop === "params" || prop === "selector") {
            node2.markDirty();
          }
          return true;
        }
      };
    }
    index(child) {
      if (typeof child === "number") return child;
      if (child.proxyOf) child = child.proxyOf;
      return this.proxyOf.nodes.indexOf(child);
    }
    insertAfter(exist, add) {
      let existIndex = this.index(exist);
      let nodes = this.normalize(add, this.proxyOf.nodes[existIndex]).reverse();
      existIndex = this.index(exist);
      for (let node2 of nodes) this.proxyOf.nodes.splice(existIndex + 1, 0, node2);
      let index2;
      for (let id in this.indexes) {
        index2 = this.indexes[id];
        if (existIndex < index2) {
          this.indexes[id] = index2 + nodes.length;
        }
      }
      this.markDirty();
      return this;
    }
    insertBefore(exist, add) {
      let existIndex = this.index(exist);
      let type = existIndex === 0 ? "prepend" : false;
      let nodes = this.normalize(
        add,
        this.proxyOf.nodes[existIndex],
        type
      ).reverse();
      existIndex = this.index(exist);
      for (let node2 of nodes) this.proxyOf.nodes.splice(existIndex, 0, node2);
      let index2;
      for (let id in this.indexes) {
        index2 = this.indexes[id];
        if (existIndex <= index2) {
          this.indexes[id] = index2 + nodes.length;
        }
      }
      this.markDirty();
      return this;
    }
    normalize(nodes, sample) {
      if (typeof nodes === "string") {
        nodes = cleanSource(parse(nodes).nodes);
      } else if (typeof nodes === "undefined") {
        nodes = [];
      } else if (Array.isArray(nodes)) {
        nodes = nodes.slice(0);
        for (let i of nodes) {
          if (i.parent) i.parent.removeChild(i, "ignore");
        }
      } else if (nodes.type === "root" && this.type !== "document") {
        nodes = nodes.nodes.slice(0);
        for (let i of nodes) {
          if (i.parent) i.parent.removeChild(i, "ignore");
        }
      } else if (nodes.type) {
        nodes = [nodes];
      } else if (nodes.prop) {
        if (typeof nodes.value === "undefined") {
          throw new Error("Value field is missed in node creation");
        } else if (typeof nodes.value !== "string") {
          nodes.value = String(nodes.value);
        }
        nodes = [new Declaration(nodes)];
      } else if (nodes.selector || nodes.selectors) {
        nodes = [new Rule(nodes)];
      } else if (nodes.name) {
        nodes = [new AtRule(nodes)];
      } else if (nodes.text) {
        nodes = [new Comment(nodes)];
      } else {
        throw new Error("Unknown node type in node creation");
      }
      let processed = nodes.map((i) => {
        if (!i[my]) Container.rebuild(i);
        i = i.proxyOf;
        if (i.parent) i.parent.removeChild(i);
        if (i[isClean]) markTreeDirty(i);
        if (!i.raws) i.raws = {};
        if (typeof i.raws.before === "undefined") {
          if (sample && typeof sample.raws.before !== "undefined") {
            i.raws.before = sample.raws.before.replace(/\S/g, "");
          }
        }
        i.parent = this.proxyOf;
        return i;
      });
      return processed;
    }
    prepend(...children) {
      children = children.reverse();
      for (let child of children) {
        let nodes = this.normalize(child, this.first, "prepend").reverse();
        for (let node2 of nodes) this.proxyOf.nodes.unshift(node2);
        for (let id in this.indexes) {
          this.indexes[id] = this.indexes[id] + nodes.length;
        }
      }
      this.markDirty();
      return this;
    }
    push(child) {
      child.parent = this;
      this.proxyOf.nodes.push(child);
      return this;
    }
    removeAll() {
      for (let node2 of this.proxyOf.nodes) node2.parent = void 0;
      this.proxyOf.nodes = [];
      this.markDirty();
      return this;
    }
    removeChild(child) {
      child = this.index(child);
      this.proxyOf.nodes[child].parent = void 0;
      this.proxyOf.nodes.splice(child, 1);
      let index2;
      for (let id in this.indexes) {
        index2 = this.indexes[id];
        if (index2 >= child) {
          this.indexes[id] = index2 - 1;
        }
      }
      this.markDirty();
      return this;
    }
    replaceValues(pattern, opts, callback) {
      if (!callback) {
        callback = opts;
        opts = {};
      }
      this.walkDecls((decl) => {
        if (opts.props && !opts.props.includes(decl.prop)) return;
        if (opts.fast && !decl.value.includes(opts.fast)) return;
        decl.value = decl.value.replace(pattern, callback);
      });
      this.markDirty();
      return this;
    }
    some(condition) {
      return this.nodes.some(condition);
    }
    walk(callback) {
      return this.each((child, i) => {
        let result2;
        try {
          result2 = callback(child, i);
        } catch (e) {
          throw child.addToError(e);
        }
        if (result2 !== false && child.walk) {
          result2 = child.walk(callback);
        }
        return result2;
      });
    }
    walkAtRules(name, callback) {
      if (!callback) {
        callback = name;
        return this.walk((child, i) => {
          if (child.type === "atrule") {
            return callback(child, i);
          }
        });
      }
      if (name instanceof RegExp) {
        return this.walk((child, i) => {
          if (child.type === "atrule" && name.test(child.name)) {
            return callback(child, i);
          }
        });
      }
      return this.walk((child, i) => {
        if (child.type === "atrule" && child.name === name) {
          return callback(child, i);
        }
      });
    }
    walkComments(callback) {
      return this.walk((child, i) => {
        if (child.type === "comment") {
          return callback(child, i);
        }
      });
    }
    walkDecls(prop, callback) {
      if (!callback) {
        callback = prop;
        return this.walk((child, i) => {
          if (child.type === "decl") {
            return callback(child, i);
          }
        });
      }
      if (prop instanceof RegExp) {
        return this.walk((child, i) => {
          if (child.type === "decl" && prop.test(child.prop)) {
            return callback(child, i);
          }
        });
      }
      return this.walk((child, i) => {
        if (child.type === "decl" && child.prop === prop) {
          return callback(child, i);
        }
      });
    }
    walkRules(selector, callback) {
      if (!callback) {
        callback = selector;
        return this.walk((child, i) => {
          if (child.type === "rule") {
            return callback(child, i);
          }
        });
      }
      if (selector instanceof RegExp) {
        return this.walk((child, i) => {
          if (child.type === "rule" && selector.test(child.selector)) {
            return callback(child, i);
          }
        });
      }
      return this.walk((child, i) => {
        if (child.type === "rule" && child.selector === selector) {
          return callback(child, i);
        }
      });
    }
  }
  Container.registerParse = (dependant) => {
    parse = dependant;
  };
  Container.registerRule = (dependant) => {
    Rule = dependant;
  };
  Container.registerAtRule = (dependant) => {
    AtRule = dependant;
  };
  Container.registerRoot = (dependant) => {
    Root = dependant;
  };
  container = Container;
  Container.default = Container;
  Container.rebuild = (node2) => {
    if (node2.type === "atrule") {
      Object.setPrototypeOf(node2, AtRule.prototype);
    } else if (node2.type === "rule") {
      Object.setPrototypeOf(node2, Rule.prototype);
    } else if (node2.type === "decl") {
      Object.setPrototypeOf(node2, Declaration.prototype);
    } else if (node2.type === "comment") {
      Object.setPrototypeOf(node2, Comment.prototype);
    } else if (node2.type === "root") {
      Object.setPrototypeOf(node2, Root.prototype);
    }
    node2[my] = true;
    if (node2.nodes) {
      node2.nodes.forEach((child) => {
        Container.rebuild(child);
      });
    }
  };
  return container;
}
var atRule;
var hasRequiredAtRule;
function requireAtRule() {
  if (hasRequiredAtRule) return atRule;
  hasRequiredAtRule = 1;
  let Container = requireContainer();
  class AtRule extends Container {
    constructor(defaults) {
      super(defaults);
      this.type = "atrule";
    }
    append(...children) {
      if (!this.proxyOf.nodes) this.nodes = [];
      return super.append(...children);
    }
    prepend(...children) {
      if (!this.proxyOf.nodes) this.nodes = [];
      return super.prepend(...children);
    }
  }
  atRule = AtRule;
  AtRule.default = AtRule;
  Container.registerAtRule(AtRule);
  return atRule;
}
var document;
var hasRequiredDocument;
function requireDocument() {
  if (hasRequiredDocument) return document;
  hasRequiredDocument = 1;
  let Container = requireContainer();
  let LazyResult, Processor;
  class Document extends Container {
    constructor(defaults) {
      super({ type: "document", ...defaults });
      if (!this.nodes) {
        this.nodes = [];
      }
    }
    toResult(opts = {}) {
      let lazy = new LazyResult(new Processor(), this, opts);
      return lazy.stringify();
    }
  }
  Document.registerLazyResult = (dependant) => {
    LazyResult = dependant;
  };
  Document.registerProcessor = (dependant) => {
    Processor = dependant;
  };
  document = Document;
  Document.default = Document;
  return document;
}
var nonSecure;
var hasRequiredNonSecure;
function requireNonSecure() {
  if (hasRequiredNonSecure) return nonSecure;
  hasRequiredNonSecure = 1;
  let urlAlphabet = "useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict";
  let customAlphabet = (alphabet, defaultSize = 21) => {
    return (size = defaultSize) => {
      let id = "";
      let i = size | 0;
      while (i--) {
        id += alphabet[Math.random() * alphabet.length | 0];
      }
      return id;
    };
  };
  let nanoid = (size = 21) => {
    let id = "";
    let i = size | 0;
    while (i--) {
      id += urlAlphabet[Math.random() * 64 | 0];
    }
    return id;
  };
  nonSecure = { nanoid, customAlphabet };
  return nonSecure;
}
var previousMap;
var hasRequiredPreviousMap;
function requirePreviousMap() {
  if (hasRequiredPreviousMap) return previousMap;
  hasRequiredPreviousMap = 1;
  let { existsSync, readFileSync } = require$$0$3;
  let { dirname, join } = require$$1$3;
  let { SourceMapConsumer, SourceMapGenerator } = require$$1;
  function fromBase64(str) {
    if (Buffer) {
      return Buffer.from(str, "base64").toString();
    } else {
      return window.atob(str);
    }
  }
  class PreviousMap {
    constructor(css, opts) {
      if (opts.map === false) return;
      this.loadAnnotation(css);
      this.inline = this.startWith(this.annotation, "data:");
      let prev = opts.map ? opts.map.prev : void 0;
      let text = this.loadMap(opts.from, prev);
      if (!this.mapFile && opts.from) {
        this.mapFile = opts.from;
      }
      if (this.mapFile) this.root = dirname(this.mapFile);
      if (text) this.text = text;
    }
    consumer() {
      if (!this.consumerCache) {
        this.consumerCache = new SourceMapConsumer(this.text);
      }
      return this.consumerCache;
    }
    decodeInline(text) {
      let baseCharsetUri = /^data:application\/json;charset=utf-?8;base64,/;
      let baseUri = /^data:application\/json;base64,/;
      let charsetUri = /^data:application\/json;charset=utf-?8,/;
      let uri = /^data:application\/json,/;
      let uriMatch = text.match(charsetUri) || text.match(uri);
      if (uriMatch) {
        return decodeURIComponent(text.substr(uriMatch[0].length));
      }
      let baseUriMatch = text.match(baseCharsetUri) || text.match(baseUri);
      if (baseUriMatch) {
        return fromBase64(text.substr(baseUriMatch[0].length));
      }
      let encoding = text.slice("data:application/json;".length);
      encoding = encoding.slice(0, encoding.indexOf(","));
      throw new Error("Unsupported source map encoding " + encoding);
    }
    getAnnotationURL(sourceMapString) {
      return sourceMapString.replace(/^\/\*\s*# sourceMappingURL=/, "").trim();
    }
    isMap(map) {
      if (typeof map !== "object") return false;
      return typeof map.mappings === "string" || typeof map._mappings === "string" || Array.isArray(map.sections);
    }
    loadAnnotation(css) {
      let comments = css.match(/\/\*\s*# sourceMappingURL=/g);
      if (!comments) return;
      let start = css.lastIndexOf(comments.pop());
      let end = css.indexOf("*/", start);
      if (start > -1 && end > -1) {
        this.annotation = this.getAnnotationURL(css.substring(start, end));
      }
    }
    loadFile(path2) {
      this.root = dirname(path2);
      if (existsSync(path2)) {
        this.mapFile = path2;
        return readFileSync(path2, "utf-8").toString().trim();
      }
    }
    loadMap(file, prev) {
      if (prev === false) return false;
      if (prev) {
        if (typeof prev === "string") {
          return prev;
        } else if (typeof prev === "function") {
          let prevPath = prev(file);
          if (prevPath) {
            let map = this.loadFile(prevPath);
            if (!map) {
              throw new Error(
                "Unable to load previous source map: " + prevPath.toString()
              );
            }
            return map;
          }
        } else if (prev instanceof SourceMapConsumer) {
          return SourceMapGenerator.fromSourceMap(prev).toString();
        } else if (prev instanceof SourceMapGenerator) {
          return prev.toString();
        } else if (this.isMap(prev)) {
          return JSON.stringify(prev);
        } else {
          throw new Error(
            "Unsupported previous source map format: " + prev.toString()
          );
        }
      } else if (this.inline) {
        return this.decodeInline(this.annotation);
      } else if (this.annotation) {
        let map = this.annotation;
        if (file) map = join(dirname(file), map);
        return this.loadFile(map);
      }
    }
    startWith(string, start) {
      if (!string) return false;
      return string.substr(0, start.length) === start;
    }
    withContent() {
      return !!(this.consumer().sourcesContent && this.consumer().sourcesContent.length > 0);
    }
  }
  previousMap = PreviousMap;
  PreviousMap.default = PreviousMap;
  return previousMap;
}
var input;
var hasRequiredInput;
function requireInput() {
  if (hasRequiredInput) return input;
  hasRequiredInput = 1;
  let { nanoid } = requireNonSecure();
  let { isAbsolute, resolve } = require$$1$3;
  let { SourceMapConsumer, SourceMapGenerator } = require$$1;
  let { fileURLToPath, pathToFileURL } = require$$3$1;
  let CssSyntaxError = requireCssSyntaxError();
  let PreviousMap = requirePreviousMap();
  let terminalHighlight = require$$1;
  let lineToIndexCache = Symbol("lineToIndexCache");
  let sourceMapAvailable = Boolean(SourceMapConsumer && SourceMapGenerator);
  let pathAvailable = Boolean(resolve && isAbsolute);
  function getLineToIndex(input2) {
    if (input2[lineToIndexCache]) return input2[lineToIndexCache];
    let lines = input2.css.split("\n");
    let lineToIndex = new Array(lines.length);
    let prevIndex = 0;
    for (let i = 0, l = lines.length; i < l; i++) {
      lineToIndex[i] = prevIndex;
      prevIndex += lines[i].length + 1;
    }
    input2[lineToIndexCache] = lineToIndex;
    return lineToIndex;
  }
  class Input {
    get from() {
      return this.file || this.id;
    }
    constructor(css, opts = {}) {
      if (css === null || typeof css === "undefined" || typeof css === "object" && !css.toString) {
        throw new Error(`PostCSS received ${css} instead of CSS string`);
      }
      this.css = css.toString();
      if (this.css[0] === "\uFEFF" || this.css[0] === "￾") {
        this.hasBOM = true;
        this.css = this.css.slice(1);
      } else {
        this.hasBOM = false;
      }
      this.document = this.css;
      if (opts.document) this.document = opts.document.toString();
      if (opts.from) {
        if (!pathAvailable || /^\w+:\/\//.test(opts.from) || isAbsolute(opts.from)) {
          this.file = opts.from;
        } else {
          this.file = resolve(opts.from);
        }
      }
      if (pathAvailable && sourceMapAvailable) {
        let map = new PreviousMap(this.css, opts);
        if (map.text) {
          this.map = map;
          let file = map.consumer().file;
          if (!this.file && file) this.file = this.mapResolve(file);
        }
      }
      if (!this.file) {
        this.id = "<input css " + nanoid(6) + ">";
      }
      if (this.map) this.map.file = this.from;
    }
    error(message, line, column, opts = {}) {
      let endColumn, endLine, endOffset, offset, result2;
      if (line && typeof line === "object") {
        let start = line;
        let end = column;
        if (typeof start.offset === "number") {
          offset = start.offset;
          let pos = this.fromOffset(offset);
          line = pos.line;
          column = pos.col;
        } else {
          line = start.line;
          column = start.column;
          offset = this.fromLineAndColumn(line, column);
        }
        if (typeof end.offset === "number") {
          endOffset = end.offset;
          let pos = this.fromOffset(endOffset);
          endLine = pos.line;
          endColumn = pos.col;
        } else {
          endLine = end.line;
          endColumn = end.column;
          endOffset = this.fromLineAndColumn(end.line, end.column);
        }
      } else if (!column) {
        offset = line;
        let pos = this.fromOffset(offset);
        line = pos.line;
        column = pos.col;
      } else {
        offset = this.fromLineAndColumn(line, column);
      }
      let origin = this.origin(line, column, endLine, endColumn);
      if (origin) {
        result2 = new CssSyntaxError(
          message,
          origin.endLine === void 0 ? origin.line : { column: origin.column, line: origin.line },
          origin.endLine === void 0 ? origin.column : { column: origin.endColumn, line: origin.endLine },
          origin.source,
          origin.file,
          opts.plugin
        );
      } else {
        result2 = new CssSyntaxError(
          message,
          endLine === void 0 ? line : { column, line },
          endLine === void 0 ? column : { column: endColumn, line: endLine },
          this.css,
          this.file,
          opts.plugin
        );
      }
      result2.input = {
        column,
        endColumn,
        endLine,
        endOffset,
        line,
        offset,
        source: this.css
      };
      if (this.file) {
        if (pathToFileURL) {
          result2.input.url = pathToFileURL(this.file).toString();
        }
        result2.input.file = this.file;
      }
      return result2;
    }
    fromLineAndColumn(line, column) {
      let lineToIndex = getLineToIndex(this);
      let index2 = lineToIndex[line - 1];
      return index2 + column - 1;
    }
    fromOffset(offset) {
      let lineToIndex = getLineToIndex(this);
      let lastLine = lineToIndex[lineToIndex.length - 1];
      let min = 0;
      if (offset >= lastLine) {
        min = lineToIndex.length - 1;
      } else {
        let max = lineToIndex.length - 2;
        let mid;
        while (min < max) {
          mid = min + (max - min >> 1);
          if (offset < lineToIndex[mid]) {
            max = mid - 1;
          } else if (offset >= lineToIndex[mid + 1]) {
            min = mid + 1;
          } else {
            min = mid;
            break;
          }
        }
      }
      return {
        col: offset - lineToIndex[min] + 1,
        line: min + 1
      };
    }
    mapResolve(file) {
      if (/^\w+:\/\//.test(file)) {
        return file;
      }
      return resolve(this.map.consumer().sourceRoot || this.map.root || ".", file);
    }
    origin(line, column, endLine, endColumn) {
      if (!this.map) return false;
      let consumer = this.map.consumer();
      let from = consumer.originalPositionFor({ column, line });
      if (!from.source) return false;
      let to;
      if (typeof endLine === "number") {
        to = consumer.originalPositionFor({ column: endColumn, line: endLine });
      }
      let fromUrl;
      if (isAbsolute(from.source)) {
        fromUrl = pathToFileURL(from.source);
      } else {
        fromUrl = new URL(
          from.source,
          this.map.consumer().sourceRoot || pathToFileURL(this.map.mapFile)
        );
      }
      let result2 = {
        column: from.column,
        endColumn: to && to.column,
        endLine: to && to.line,
        line: from.line,
        url: fromUrl.toString()
      };
      if (fromUrl.protocol === "file:") {
        if (fileURLToPath) {
          result2.file = fileURLToPath(fromUrl);
        } else {
          throw new Error(`file: protocol is not available in this PostCSS build`);
        }
      }
      let source = consumer.sourceContentFor(from.source);
      if (source) result2.source = source;
      return result2;
    }
    toJSON() {
      let json = {};
      for (let name of ["hasBOM", "css", "file", "id"]) {
        if (this[name] != null) {
          json[name] = this[name];
        }
      }
      if (this.map) {
        json.map = { ...this.map };
        if (json.map.consumerCache) {
          json.map.consumerCache = void 0;
        }
      }
      return json;
    }
  }
  input = Input;
  Input.default = Input;
  if (terminalHighlight && terminalHighlight.registerInput) {
    terminalHighlight.registerInput(Input);
  }
  return input;
}
var root;
var hasRequiredRoot;
function requireRoot() {
  if (hasRequiredRoot) return root;
  hasRequiredRoot = 1;
  let Container = requireContainer();
  let LazyResult, Processor;
  class Root extends Container {
    constructor(defaults) {
      super(defaults);
      this.type = "root";
      if (!this.nodes) this.nodes = [];
    }
    normalize(child, sample, type) {
      let nodes = super.normalize(child);
      if (sample) {
        if (type === "prepend") {
          if (this.nodes.length > 1) {
            sample.raws.before = this.nodes[1].raws.before;
          } else {
            delete sample.raws.before;
          }
        } else if (this.first !== sample) {
          for (let node2 of nodes) {
            node2.raws.before = sample.raws.before;
          }
        }
      }
      return nodes;
    }
    removeChild(child, ignore) {
      let index2 = this.index(child);
      if (!ignore && index2 === 0 && this.nodes.length > 1) {
        this.nodes[1].raws.before = this.nodes[index2].raws.before;
      }
      return super.removeChild(child);
    }
    toResult(opts = {}) {
      let lazy = new LazyResult(new Processor(), this, opts);
      return lazy.stringify();
    }
  }
  Root.registerLazyResult = (dependant) => {
    LazyResult = dependant;
  };
  Root.registerProcessor = (dependant) => {
    Processor = dependant;
  };
  root = Root;
  Root.default = Root;
  Container.registerRoot(Root);
  return root;
}
var list_1;
var hasRequiredList;
function requireList() {
  if (hasRequiredList) return list_1;
  hasRequiredList = 1;
  let list = {
    comma(string) {
      return list.split(string, [","], true);
    },
    space(string) {
      let spaces = [" ", "\n", "	"];
      return list.split(string, spaces);
    },
    split(string, separators, last) {
      let array = [];
      let current = "";
      let split = false;
      let func = 0;
      let inQuote = false;
      let prevQuote = "";
      let escape = false;
      for (let letter of string) {
        if (escape) {
          escape = false;
        } else if (letter === "\\") {
          escape = true;
        } else if (inQuote) {
          if (letter === prevQuote) {
            inQuote = false;
          }
        } else if (letter === '"' || letter === "'") {
          inQuote = true;
          prevQuote = letter;
        } else if (letter === "(") {
          func += 1;
        } else if (letter === ")") {
          if (func > 0) func -= 1;
        } else if (func === 0) {
          if (separators.includes(letter)) split = true;
        }
        if (split) {
          if (current !== "") array.push(current.trim());
          current = "";
          split = false;
        } else {
          current += letter;
        }
      }
      if (last || current !== "") array.push(current.trim());
      return array;
    }
  };
  list_1 = list;
  list.default = list;
  return list_1;
}
var rule;
var hasRequiredRule;
function requireRule() {
  if (hasRequiredRule) return rule;
  hasRequiredRule = 1;
  let Container = requireContainer();
  let list = requireList();
  class Rule extends Container {
    get selectors() {
      return list.comma(this.selector);
    }
    set selectors(values) {
      let match = this.selector ? this.selector.match(/,\s*/) : null;
      let sep = match ? match[0] : "," + this.raw("between", "beforeOpen");
      this.selector = values.join(sep);
    }
    constructor(defaults) {
      super(defaults);
      this.type = "rule";
      if (!this.nodes) this.nodes = [];
    }
  }
  rule = Rule;
  Rule.default = Rule;
  Container.registerRule(Rule);
  return rule;
}
var fromJSON_1;
var hasRequiredFromJSON;
function requireFromJSON() {
  if (hasRequiredFromJSON) return fromJSON_1;
  hasRequiredFromJSON = 1;
  let AtRule = requireAtRule();
  let Comment = requireComment();
  let Declaration = requireDeclaration();
  let Input = requireInput();
  let PreviousMap = requirePreviousMap();
  let Root = requireRoot();
  let Rule = requireRule();
  function fromJSON(json, inputs) {
    if (Array.isArray(json)) return json.map((n) => fromJSON(n));
    let { inputs: ownInputs, ...defaults } = json;
    if (ownInputs) {
      inputs = [];
      for (let input2 of ownInputs) {
        let inputHydrated = { ...input2, __proto__: Input.prototype };
        if (inputHydrated.map) {
          inputHydrated.map = {
            ...inputHydrated.map,
            __proto__: PreviousMap.prototype
          };
        }
        inputs.push(inputHydrated);
      }
    }
    if (defaults.nodes) {
      defaults.nodes = json.nodes.map((n) => fromJSON(n, inputs));
    }
    if (defaults.source) {
      let { inputId, ...source } = defaults.source;
      defaults.source = source;
      if (inputId != null) {
        defaults.source.input = inputs[inputId];
      }
    }
    if (defaults.type === "root") {
      return new Root(defaults);
    } else if (defaults.type === "decl") {
      return new Declaration(defaults);
    } else if (defaults.type === "rule") {
      return new Rule(defaults);
    } else if (defaults.type === "comment") {
      return new Comment(defaults);
    } else if (defaults.type === "atrule") {
      return new AtRule(defaults);
    } else {
      throw new Error("Unknown node type: " + json.type);
    }
  }
  fromJSON_1 = fromJSON;
  fromJSON.default = fromJSON;
  return fromJSON_1;
}
var mapGenerator;
var hasRequiredMapGenerator;
function requireMapGenerator() {
  if (hasRequiredMapGenerator) return mapGenerator;
  hasRequiredMapGenerator = 1;
  let { dirname, relative, resolve, sep } = require$$1$3;
  let { SourceMapConsumer, SourceMapGenerator } = require$$1;
  let { pathToFileURL } = require$$3$1;
  let Input = requireInput();
  let sourceMapAvailable = Boolean(SourceMapConsumer && SourceMapGenerator);
  let pathAvailable = Boolean(dirname && resolve && relative && sep);
  class MapGenerator {
    constructor(stringify2, root2, opts, cssString) {
      this.stringify = stringify2;
      this.mapOpts = opts.map || {};
      this.root = root2;
      this.opts = opts;
      this.css = cssString;
      this.originalCSS = cssString;
      this.usesFileUrls = !this.mapOpts.from && this.mapOpts.absolute;
      this.memoizedFileURLs = /* @__PURE__ */ new Map();
      this.memoizedPaths = /* @__PURE__ */ new Map();
      this.memoizedURLs = /* @__PURE__ */ new Map();
    }
    addAnnotation() {
      let content;
      if (this.isInline()) {
        content = "data:application/json;base64," + this.toBase64(this.map.toString());
      } else if (typeof this.mapOpts.annotation === "string") {
        content = this.mapOpts.annotation;
      } else if (typeof this.mapOpts.annotation === "function") {
        content = this.mapOpts.annotation(this.opts.to, this.root);
      } else {
        content = this.outputFile() + ".map";
      }
      let eol = "\n";
      if (this.css.includes("\r\n")) eol = "\r\n";
      this.css += eol + "/*# sourceMappingURL=" + content + " */";
    }
    applyPrevMaps() {
      for (let prev of this.previous()) {
        let from = this.toUrl(this.path(prev.file));
        let root2 = prev.root || dirname(prev.file);
        let map;
        if (this.mapOpts.sourcesContent === false) {
          map = new SourceMapConsumer(prev.text);
          if (map.sourcesContent) {
            map.sourcesContent = null;
          }
        } else {
          map = prev.consumer();
        }
        this.map.applySourceMap(map, from, this.toUrl(this.path(root2)));
      }
    }
    clearAnnotation() {
      if (this.mapOpts.annotation === false) return;
      if (this.root) {
        let node2;
        for (let i = this.root.nodes.length - 1; i >= 0; i--) {
          node2 = this.root.nodes[i];
          if (node2.type !== "comment") continue;
          if (node2.text.startsWith("# sourceMappingURL=")) {
            this.root.removeChild(i);
          }
        }
      } else if (this.css) {
        let startIndex;
        while ((startIndex = this.css.lastIndexOf("/*#")) !== -1) {
          let endIndex = this.css.indexOf("*/", startIndex + 3);
          if (endIndex === -1) break;
          while (startIndex > 0 && this.css[startIndex - 1] === "\n") {
            startIndex--;
          }
          this.css = this.css.slice(0, startIndex) + this.css.slice(endIndex + 2);
        }
      }
    }
    generate() {
      this.clearAnnotation();
      if (pathAvailable && sourceMapAvailable && this.isMap()) {
        return this.generateMap();
      } else {
        let result2 = "";
        this.stringify(this.root, (i) => {
          result2 += i;
        });
        return [result2];
      }
    }
    generateMap() {
      if (this.root) {
        this.generateString();
      } else if (this.previous().length === 1) {
        let prev = this.previous()[0].consumer();
        prev.file = this.outputFile();
        this.map = SourceMapGenerator.fromSourceMap(prev, {
          ignoreInvalidMapping: true
        });
      } else {
        this.map = new SourceMapGenerator({
          file: this.outputFile(),
          ignoreInvalidMapping: true
        });
        this.map.addMapping({
          generated: { column: 0, line: 1 },
          original: { column: 0, line: 1 },
          source: this.opts.from ? this.toUrl(this.path(this.opts.from)) : "<no source>"
        });
      }
      if (this.isSourcesContent()) this.setSourcesContent();
      if (this.root && this.previous().length > 0) this.applyPrevMaps();
      if (this.isAnnotation()) this.addAnnotation();
      if (this.isInline()) {
        return [this.css];
      } else {
        return [this.css, this.map];
      }
    }
    generateString() {
      this.css = "";
      this.map = new SourceMapGenerator({
        file: this.outputFile(),
        ignoreInvalidMapping: true
      });
      let line = 1;
      let column = 1;
      let noSource = "<no source>";
      let mapping = {
        generated: { column: 0, line: 0 },
        original: { column: 0, line: 0 },
        source: ""
      };
      let last, lines;
      this.stringify(this.root, (str, node2, type) => {
        this.css += str;
        if (node2 && type !== "end") {
          mapping.generated.line = line;
          mapping.generated.column = column - 1;
          if (node2.source && node2.source.start) {
            mapping.source = this.sourcePath(node2);
            mapping.original.line = node2.source.start.line;
            mapping.original.column = node2.source.start.column - 1;
            this.map.addMapping(mapping);
          } else {
            mapping.source = noSource;
            mapping.original.line = 1;
            mapping.original.column = 0;
            this.map.addMapping(mapping);
          }
        }
        lines = str.match(/\n/g);
        if (lines) {
          line += lines.length;
          last = str.lastIndexOf("\n");
          column = str.length - last;
        } else {
          column += str.length;
        }
        if (node2 && type !== "start") {
          let p = node2.parent || { raws: {} };
          let childless = node2.type === "decl" || node2.type === "atrule" && !node2.nodes;
          if (!childless || node2 !== p.last || p.raws.semicolon) {
            if (node2.source && node2.source.end) {
              mapping.source = this.sourcePath(node2);
              mapping.original.line = node2.source.end.line;
              mapping.original.column = node2.source.end.column - 1;
              mapping.generated.line = line;
              mapping.generated.column = column - 2;
              this.map.addMapping(mapping);
            } else {
              mapping.source = noSource;
              mapping.original.line = 1;
              mapping.original.column = 0;
              mapping.generated.line = line;
              mapping.generated.column = column - 1;
              this.map.addMapping(mapping);
            }
          }
        }
      });
    }
    isAnnotation() {
      if (this.isInline()) {
        return true;
      }
      if (typeof this.mapOpts.annotation !== "undefined") {
        return this.mapOpts.annotation;
      }
      if (this.previous().length) {
        return this.previous().some((i) => i.annotation);
      }
      return true;
    }
    isInline() {
      if (typeof this.mapOpts.inline !== "undefined") {
        return this.mapOpts.inline;
      }
      let annotation = this.mapOpts.annotation;
      if (typeof annotation !== "undefined" && annotation !== true) {
        return false;
      }
      if (this.previous().length) {
        return this.previous().some((i) => i.inline);
      }
      return true;
    }
    isMap() {
      if (typeof this.opts.map !== "undefined") {
        return !!this.opts.map;
      }
      return this.previous().length > 0;
    }
    isSourcesContent() {
      if (typeof this.mapOpts.sourcesContent !== "undefined") {
        return this.mapOpts.sourcesContent;
      }
      if (this.previous().length) {
        return this.previous().some((i) => i.withContent());
      }
      return true;
    }
    outputFile() {
      if (this.opts.to) {
        return this.path(this.opts.to);
      } else if (this.opts.from) {
        return this.path(this.opts.from);
      } else {
        return "to.css";
      }
    }
    path(file) {
      if (this.mapOpts.absolute) return file;
      if (file.charCodeAt(0) === 60) return file;
      if (/^\w+:\/\//.test(file)) return file;
      let cached = this.memoizedPaths.get(file);
      if (cached) return cached;
      let from = this.opts.to ? dirname(this.opts.to) : ".";
      if (typeof this.mapOpts.annotation === "string") {
        from = dirname(resolve(from, this.mapOpts.annotation));
      }
      let path2 = relative(from, file);
      this.memoizedPaths.set(file, path2);
      return path2;
    }
    previous() {
      if (!this.previousMaps) {
        this.previousMaps = [];
        if (this.root) {
          this.root.walk((node2) => {
            if (node2.source && node2.source.input.map) {
              let map = node2.source.input.map;
              if (!this.previousMaps.includes(map)) {
                this.previousMaps.push(map);
              }
            }
          });
        } else {
          let input2 = new Input(this.originalCSS, this.opts);
          if (input2.map) this.previousMaps.push(input2.map);
        }
      }
      return this.previousMaps;
    }
    setSourcesContent() {
      let already = {};
      if (this.root) {
        this.root.walk((node2) => {
          if (node2.source) {
            let from = node2.source.input.from;
            if (from && !already[from]) {
              already[from] = true;
              let fromUrl = this.usesFileUrls ? this.toFileUrl(from) : this.toUrl(this.path(from));
              this.map.setSourceContent(fromUrl, node2.source.input.css);
            }
          }
        });
      } else if (this.css) {
        let from = this.opts.from ? this.toUrl(this.path(this.opts.from)) : "<no source>";
        this.map.setSourceContent(from, this.css);
      }
    }
    sourcePath(node2) {
      if (this.mapOpts.from) {
        return this.toUrl(this.mapOpts.from);
      } else if (this.usesFileUrls) {
        return this.toFileUrl(node2.source.input.from);
      } else {
        return this.toUrl(this.path(node2.source.input.from));
      }
    }
    toBase64(str) {
      if (Buffer) {
        return Buffer.from(str).toString("base64");
      } else {
        return window.btoa(unescape(encodeURIComponent(str)));
      }
    }
    toFileUrl(path2) {
      let cached = this.memoizedFileURLs.get(path2);
      if (cached) return cached;
      if (pathToFileURL) {
        let fileURL = pathToFileURL(path2).toString();
        this.memoizedFileURLs.set(path2, fileURL);
        return fileURL;
      } else {
        throw new Error(
          "`map.absolute` option is not available in this PostCSS build"
        );
      }
    }
    toUrl(path2) {
      let cached = this.memoizedURLs.get(path2);
      if (cached) return cached;
      if (sep === "\\") {
        path2 = path2.replace(/\\/g, "/");
      }
      let url = encodeURI(path2).replace(/[#?]/g, encodeURIComponent);
      this.memoizedURLs.set(path2, url);
      return url;
    }
  }
  mapGenerator = MapGenerator;
  return mapGenerator;
}
var tokenize;
var hasRequiredTokenize;
function requireTokenize() {
  if (hasRequiredTokenize) return tokenize;
  hasRequiredTokenize = 1;
  const SINGLE_QUOTE = "'".charCodeAt(0);
  const DOUBLE_QUOTE = '"'.charCodeAt(0);
  const BACKSLASH = "\\".charCodeAt(0);
  const SLASH = "/".charCodeAt(0);
  const NEWLINE = "\n".charCodeAt(0);
  const SPACE = " ".charCodeAt(0);
  const FEED = "\f".charCodeAt(0);
  const TAB = "	".charCodeAt(0);
  const CR = "\r".charCodeAt(0);
  const OPEN_SQUARE = "[".charCodeAt(0);
  const CLOSE_SQUARE = "]".charCodeAt(0);
  const OPEN_PARENTHESES = "(".charCodeAt(0);
  const CLOSE_PARENTHESES = ")".charCodeAt(0);
  const OPEN_CURLY = "{".charCodeAt(0);
  const CLOSE_CURLY = "}".charCodeAt(0);
  const SEMICOLON = ";".charCodeAt(0);
  const ASTERISK = "*".charCodeAt(0);
  const COLON = ":".charCodeAt(0);
  const AT = "@".charCodeAt(0);
  const RE_AT_END = /[\t\n\f\r "#'()/;[\\\]{}]/g;
  const RE_WORD_END = /[\t\n\f\r !"#'():;@[\\\]{}]|\/(?=\*)/g;
  const RE_BAD_BRACKET = /.[\r\n"'(/\\]/;
  const RE_HEX_ESCAPE = /[\da-f]/i;
  tokenize = function tokenizer(input2, options2 = {}) {
    let css = input2.css.valueOf();
    let ignore = options2.ignoreErrors;
    let code, content, escape, next, quote;
    let currentToken, escaped, escapePos, n, prev;
    let length = css.length;
    let pos = 0;
    let buffer = [];
    let returned = [];
    function position() {
      return pos;
    }
    function unclosed(what) {
      throw input2.error("Unclosed " + what, pos);
    }
    function endOfFile() {
      return returned.length === 0 && pos >= length;
    }
    function nextToken(opts) {
      if (returned.length) return returned.pop();
      if (pos >= length) return;
      let ignoreUnclosed = opts ? opts.ignoreUnclosed : false;
      code = css.charCodeAt(pos);
      switch (code) {
        case NEWLINE:
        case SPACE:
        case TAB:
        case CR:
        case FEED: {
          next = pos;
          do {
            next += 1;
            code = css.charCodeAt(next);
          } while (code === SPACE || code === NEWLINE || code === TAB || code === CR || code === FEED);
          currentToken = ["space", css.slice(pos, next)];
          pos = next - 1;
          break;
        }
        case OPEN_SQUARE:
        case CLOSE_SQUARE:
        case OPEN_CURLY:
        case CLOSE_CURLY:
        case COLON:
        case SEMICOLON:
        case CLOSE_PARENTHESES: {
          let controlChar = String.fromCharCode(code);
          currentToken = [controlChar, controlChar, pos];
          break;
        }
        case OPEN_PARENTHESES: {
          prev = buffer.length ? buffer.pop()[1] : "";
          n = css.charCodeAt(pos + 1);
          if (prev === "url" && n !== SINGLE_QUOTE && n !== DOUBLE_QUOTE && n !== SPACE && n !== NEWLINE && n !== TAB && n !== FEED && n !== CR) {
            next = pos;
            do {
              escaped = false;
              next = css.indexOf(")", next + 1);
              if (next === -1) {
                if (ignore || ignoreUnclosed) {
                  next = pos;
                  break;
                } else {
                  unclosed("bracket");
                }
              }
              escapePos = next;
              while (css.charCodeAt(escapePos - 1) === BACKSLASH) {
                escapePos -= 1;
                escaped = !escaped;
              }
            } while (escaped);
            currentToken = ["brackets", css.slice(pos, next + 1), pos, next];
            pos = next;
          } else {
            next = css.indexOf(")", pos + 1);
            content = css.slice(pos, next + 1);
            if (next === -1 || RE_BAD_BRACKET.test(content)) {
              currentToken = ["(", "(", pos];
            } else {
              currentToken = ["brackets", content, pos, next];
              pos = next;
            }
          }
          break;
        }
        case SINGLE_QUOTE:
        case DOUBLE_QUOTE: {
          quote = code === SINGLE_QUOTE ? "'" : '"';
          next = pos;
          do {
            escaped = false;
            next = css.indexOf(quote, next + 1);
            if (next === -1) {
              if (ignore || ignoreUnclosed) {
                next = pos + 1;
                break;
              } else {
                unclosed("string");
              }
            }
            escapePos = next;
            while (css.charCodeAt(escapePos - 1) === BACKSLASH) {
              escapePos -= 1;
              escaped = !escaped;
            }
          } while (escaped);
          currentToken = ["string", css.slice(pos, next + 1), pos, next];
          pos = next;
          break;
        }
        case AT: {
          RE_AT_END.lastIndex = pos + 1;
          RE_AT_END.test(css);
          if (RE_AT_END.lastIndex === 0) {
            next = css.length - 1;
          } else {
            next = RE_AT_END.lastIndex - 2;
          }
          currentToken = ["at-word", css.slice(pos, next + 1), pos, next];
          pos = next;
          break;
        }
        case BACKSLASH: {
          next = pos;
          escape = true;
          while (css.charCodeAt(next + 1) === BACKSLASH) {
            next += 1;
            escape = !escape;
          }
          code = css.charCodeAt(next + 1);
          if (escape && code !== SLASH && code !== SPACE && code !== NEWLINE && code !== TAB && code !== CR && code !== FEED) {
            next += 1;
            if (RE_HEX_ESCAPE.test(css.charAt(next))) {
              while (RE_HEX_ESCAPE.test(css.charAt(next + 1))) {
                next += 1;
              }
              if (css.charCodeAt(next + 1) === SPACE) {
                next += 1;
              }
            }
          }
          currentToken = ["word", css.slice(pos, next + 1), pos, next];
          pos = next;
          break;
        }
        default: {
          if (code === SLASH && css.charCodeAt(pos + 1) === ASTERISK) {
            next = css.indexOf("*/", pos + 2) + 1;
            if (next === 0) {
              if (ignore || ignoreUnclosed) {
                next = css.length;
              } else {
                unclosed("comment");
              }
            }
            currentToken = ["comment", css.slice(pos, next + 1), pos, next];
            pos = next;
          } else {
            RE_WORD_END.lastIndex = pos + 1;
            RE_WORD_END.test(css);
            if (RE_WORD_END.lastIndex === 0) {
              next = css.length - 1;
            } else {
              next = RE_WORD_END.lastIndex - 2;
            }
            currentToken = ["word", css.slice(pos, next + 1), pos, next];
            buffer.push(currentToken);
            pos = next;
          }
          break;
        }
      }
      pos++;
      return currentToken;
    }
    function back(token) {
      returned.push(token);
    }
    return {
      back,
      endOfFile,
      nextToken,
      position
    };
  };
  return tokenize;
}
var parser;
var hasRequiredParser;
function requireParser() {
  if (hasRequiredParser) return parser;
  hasRequiredParser = 1;
  let AtRule = requireAtRule();
  let Comment = requireComment();
  let Declaration = requireDeclaration();
  let Root = requireRoot();
  let Rule = requireRule();
  let tokenizer = requireTokenize();
  const SAFE_COMMENT_NEIGHBOR = {
    empty: true,
    space: true
  };
  function findLastWithPosition(tokens) {
    for (let i = tokens.length - 1; i >= 0; i--) {
      let token = tokens[i];
      let pos = token[3] || token[2];
      if (pos) return pos;
    }
  }
  class Parser2 {
    constructor(input2) {
      this.input = input2;
      this.root = new Root();
      this.current = this.root;
      this.spaces = "";
      this.semicolon = false;
      this.createTokenizer();
      this.root.source = { input: input2, start: { column: 1, line: 1, offset: 0 } };
    }
    atrule(token) {
      let node2 = new AtRule();
      node2.name = token[1].slice(1);
      if (node2.name === "") {
        this.unnamedAtrule(node2, token);
      }
      this.init(node2, token[2]);
      let type;
      let prev;
      let shift;
      let last = false;
      let open = false;
      let params = [];
      let brackets = [];
      while (!this.tokenizer.endOfFile()) {
        token = this.tokenizer.nextToken();
        type = token[0];
        if (type === "(" || type === "[") {
          brackets.push(type === "(" ? ")" : "]");
        } else if (type === "{" && brackets.length > 0) {
          brackets.push("}");
        } else if (type === brackets[brackets.length - 1]) {
          brackets.pop();
        }
        if (brackets.length === 0) {
          if (type === ";") {
            node2.source.end = this.getPosition(token[2]);
            node2.source.end.offset++;
            this.semicolon = true;
            break;
          } else if (type === "{") {
            open = true;
            break;
          } else if (type === "}") {
            if (params.length > 0) {
              shift = params.length - 1;
              prev = params[shift];
              while (prev && prev[0] === "space") {
                prev = params[--shift];
              }
              if (prev) {
                node2.source.end = this.getPosition(prev[3] || prev[2]);
                node2.source.end.offset++;
              }
            }
            this.end(token);
            break;
          } else {
            params.push(token);
          }
        } else {
          params.push(token);
        }
        if (this.tokenizer.endOfFile()) {
          last = true;
          break;
        }
      }
      node2.raws.between = this.spacesAndCommentsFromEnd(params);
      if (params.length) {
        node2.raws.afterName = this.spacesAndCommentsFromStart(params);
        this.raw(node2, "params", params);
        if (last) {
          token = params[params.length - 1];
          node2.source.end = this.getPosition(token[3] || token[2]);
          node2.source.end.offset++;
          this.spaces = node2.raws.between;
          node2.raws.between = "";
        }
      } else {
        node2.raws.afterName = "";
        node2.params = "";
      }
      if (open) {
        node2.nodes = [];
        this.current = node2;
      }
    }
    checkMissedSemicolon(tokens) {
      let colon = this.colon(tokens);
      if (colon === false) return;
      let founded = 0;
      let token;
      for (let j = colon - 1; j >= 0; j--) {
        token = tokens[j];
        if (token[0] !== "space") {
          founded += 1;
          if (founded === 2) break;
        }
      }
      throw this.input.error(
        "Missed semicolon",
        token[0] === "word" ? token[3] + 1 : token[2]
      );
    }
    colon(tokens) {
      let brackets = 0;
      let prev, token, type;
      for (let [i, element] of tokens.entries()) {
        token = element;
        type = token[0];
        if (type === "(") {
          brackets += 1;
        }
        if (type === ")") {
          brackets -= 1;
        }
        if (brackets === 0 && type === ":") {
          if (!prev) {
            this.doubleColon(token);
          } else if (prev[0] === "word" && prev[1] === "progid") {
            continue;
          } else {
            return i;
          }
        }
        prev = token;
      }
      return false;
    }
    comment(token) {
      let node2 = new Comment();
      this.init(node2, token[2]);
      node2.source.end = this.getPosition(token[3] || token[2]);
      node2.source.end.offset++;
      let text = token[1].slice(2, -2);
      if (!text.trim()) {
        node2.text = "";
        node2.raws.left = text;
        node2.raws.right = "";
      } else {
        let match = text.match(/^(\s*)([^]*\S)(\s*)$/);
        node2.text = match[2];
        node2.raws.left = match[1];
        node2.raws.right = match[3];
      }
    }
    createTokenizer() {
      this.tokenizer = tokenizer(this.input);
    }
    decl(tokens, customProperty) {
      let node2 = new Declaration();
      this.init(node2, tokens[0][2]);
      let last = tokens[tokens.length - 1];
      if (last[0] === ";") {
        this.semicolon = true;
        tokens.pop();
      }
      node2.source.end = this.getPosition(
        last[3] || last[2] || findLastWithPosition(tokens)
      );
      node2.source.end.offset++;
      while (tokens[0][0] !== "word") {
        if (tokens.length === 1) this.unknownWord(tokens);
        node2.raws.before += tokens.shift()[1];
      }
      node2.source.start = this.getPosition(tokens[0][2]);
      node2.prop = "";
      while (tokens.length) {
        let type = tokens[0][0];
        if (type === ":" || type === "space" || type === "comment") {
          break;
        }
        node2.prop += tokens.shift()[1];
      }
      node2.raws.between = "";
      let token;
      while (tokens.length) {
        token = tokens.shift();
        if (token[0] === ":") {
          node2.raws.between += token[1];
          break;
        } else {
          if (token[0] === "word" && /\w/.test(token[1])) {
            this.unknownWord([token]);
          }
          node2.raws.between += token[1];
        }
      }
      if (node2.prop[0] === "_" || node2.prop[0] === "*") {
        node2.raws.before += node2.prop[0];
        node2.prop = node2.prop.slice(1);
      }
      let firstSpaces = [];
      let next;
      while (tokens.length) {
        next = tokens[0][0];
        if (next !== "space" && next !== "comment") break;
        firstSpaces.push(tokens.shift());
      }
      this.precheckMissedSemicolon(tokens);
      for (let i = tokens.length - 1; i >= 0; i--) {
        token = tokens[i];
        if (token[1].toLowerCase() === "!important") {
          node2.important = true;
          let string = this.stringFrom(tokens, i);
          string = this.spacesFromEnd(tokens) + string;
          if (string !== " !important") node2.raws.important = string;
          break;
        } else if (token[1].toLowerCase() === "important") {
          let cache = tokens.slice(0);
          let str = "";
          for (let j = i; j > 0; j--) {
            let type = cache[j][0];
            if (str.trim().startsWith("!") && type !== "space") {
              break;
            }
            str = cache.pop()[1] + str;
          }
          if (str.trim().startsWith("!")) {
            node2.important = true;
            node2.raws.important = str;
            tokens = cache;
          }
        }
        if (token[0] !== "space" && token[0] !== "comment") {
          break;
        }
      }
      let hasWord = tokens.some((i) => i[0] !== "space" && i[0] !== "comment");
      if (hasWord) {
        node2.raws.between += firstSpaces.map((i) => i[1]).join("");
        firstSpaces = [];
      }
      this.raw(node2, "value", firstSpaces.concat(tokens), customProperty);
      if (node2.value.includes(":") && !customProperty) {
        this.checkMissedSemicolon(tokens);
      }
    }
    doubleColon(token) {
      throw this.input.error(
        "Double colon",
        { offset: token[2] },
        { offset: token[2] + token[1].length }
      );
    }
    emptyRule(token) {
      let node2 = new Rule();
      this.init(node2, token[2]);
      node2.selector = "";
      node2.raws.between = "";
      this.current = node2;
    }
    end(token) {
      if (this.current.nodes && this.current.nodes.length) {
        this.current.raws.semicolon = this.semicolon;
      }
      this.semicolon = false;
      this.current.raws.after = (this.current.raws.after || "") + this.spaces;
      this.spaces = "";
      if (this.current.parent) {
        this.current.source.end = this.getPosition(token[2]);
        this.current.source.end.offset++;
        this.current = this.current.parent;
      } else {
        this.unexpectedClose(token);
      }
    }
    endFile() {
      if (this.current.parent) this.unclosedBlock();
      if (this.current.nodes && this.current.nodes.length) {
        this.current.raws.semicolon = this.semicolon;
      }
      this.current.raws.after = (this.current.raws.after || "") + this.spaces;
      this.root.source.end = this.getPosition(this.tokenizer.position());
    }
    freeSemicolon(token) {
      this.spaces += token[1];
      if (this.current.nodes) {
        let prev = this.current.nodes[this.current.nodes.length - 1];
        if (prev && prev.type === "rule" && !prev.raws.ownSemicolon) {
          prev.raws.ownSemicolon = this.spaces;
          this.spaces = "";
          prev.source.end = this.getPosition(token[2]);
          prev.source.end.offset += prev.raws.ownSemicolon.length;
        }
      }
    }
    // Helpers
    getPosition(offset) {
      let pos = this.input.fromOffset(offset);
      return {
        column: pos.col,
        line: pos.line,
        offset
      };
    }
    init(node2, offset) {
      this.current.push(node2);
      node2.source = {
        input: this.input,
        start: this.getPosition(offset)
      };
      node2.raws.before = this.spaces;
      this.spaces = "";
      if (node2.type !== "comment") this.semicolon = false;
    }
    other(start) {
      let end = false;
      let type = null;
      let colon = false;
      let bracket = null;
      let brackets = [];
      let customProperty = start[1].startsWith("--");
      let tokens = [];
      let token = start;
      while (token) {
        type = token[0];
        tokens.push(token);
        if (type === "(" || type === "[") {
          if (!bracket) bracket = token;
          brackets.push(type === "(" ? ")" : "]");
        } else if (customProperty && colon && type === "{") {
          if (!bracket) bracket = token;
          brackets.push("}");
        } else if (brackets.length === 0) {
          if (type === ";") {
            if (colon) {
              this.decl(tokens, customProperty);
              return;
            } else {
              break;
            }
          } else if (type === "{") {
            this.rule(tokens);
            return;
          } else if (type === "}") {
            this.tokenizer.back(tokens.pop());
            end = true;
            break;
          } else if (type === ":") {
            colon = true;
          }
        } else if (type === brackets[brackets.length - 1]) {
          brackets.pop();
          if (brackets.length === 0) bracket = null;
        }
        token = this.tokenizer.nextToken();
      }
      if (this.tokenizer.endOfFile()) end = true;
      if (brackets.length > 0) this.unclosedBracket(bracket);
      if (end && colon) {
        if (!customProperty) {
          while (tokens.length) {
            token = tokens[tokens.length - 1][0];
            if (token !== "space" && token !== "comment") break;
            this.tokenizer.back(tokens.pop());
          }
        }
        this.decl(tokens, customProperty);
      } else {
        this.unknownWord(tokens);
      }
    }
    parse() {
      let token;
      while (!this.tokenizer.endOfFile()) {
        token = this.tokenizer.nextToken();
        switch (token[0]) {
          case "space":
            this.spaces += token[1];
            break;
          case ";":
            this.freeSemicolon(token);
            break;
          case "}":
            this.end(token);
            break;
          case "comment":
            this.comment(token);
            break;
          case "at-word":
            this.atrule(token);
            break;
          case "{":
            this.emptyRule(token);
            break;
          default:
            this.other(token);
            break;
        }
      }
      this.endFile();
    }
    precheckMissedSemicolon() {
    }
    raw(node2, prop, tokens, customProperty) {
      let token, type;
      let length = tokens.length;
      let value = "";
      let clean = true;
      let next, prev;
      for (let i = 0; i < length; i += 1) {
        token = tokens[i];
        type = token[0];
        if (type === "space" && i === length - 1 && !customProperty) {
          clean = false;
        } else if (type === "comment") {
          prev = tokens[i - 1] ? tokens[i - 1][0] : "empty";
          next = tokens[i + 1] ? tokens[i + 1][0] : "empty";
          if (!SAFE_COMMENT_NEIGHBOR[prev] && !SAFE_COMMENT_NEIGHBOR[next]) {
            if (value.slice(-1) === ",") {
              clean = false;
            } else {
              value += token[1];
            }
          } else {
            clean = false;
          }
        } else {
          value += token[1];
        }
      }
      if (!clean) {
        let raw = tokens.reduce((all, i) => all + i[1], "");
        node2.raws[prop] = { raw, value };
      }
      node2[prop] = value;
    }
    rule(tokens) {
      tokens.pop();
      let node2 = new Rule();
      this.init(node2, tokens[0][2]);
      node2.raws.between = this.spacesAndCommentsFromEnd(tokens);
      this.raw(node2, "selector", tokens);
      this.current = node2;
    }
    spacesAndCommentsFromEnd(tokens) {
      let lastTokenType;
      let spaces = "";
      while (tokens.length) {
        lastTokenType = tokens[tokens.length - 1][0];
        if (lastTokenType !== "space" && lastTokenType !== "comment") break;
        spaces = tokens.pop()[1] + spaces;
      }
      return spaces;
    }
    // Errors
    spacesAndCommentsFromStart(tokens) {
      let next;
      let spaces = "";
      while (tokens.length) {
        next = tokens[0][0];
        if (next !== "space" && next !== "comment") break;
        spaces += tokens.shift()[1];
      }
      return spaces;
    }
    spacesFromEnd(tokens) {
      let lastTokenType;
      let spaces = "";
      while (tokens.length) {
        lastTokenType = tokens[tokens.length - 1][0];
        if (lastTokenType !== "space") break;
        spaces = tokens.pop()[1] + spaces;
      }
      return spaces;
    }
    stringFrom(tokens, from) {
      let result2 = "";
      for (let i = from; i < tokens.length; i++) {
        result2 += tokens[i][1];
      }
      tokens.splice(from, tokens.length - from);
      return result2;
    }
    unclosedBlock() {
      let pos = this.current.source.start;
      throw this.input.error("Unclosed block", pos.line, pos.column);
    }
    unclosedBracket(bracket) {
      throw this.input.error(
        "Unclosed bracket",
        { offset: bracket[2] },
        { offset: bracket[2] + 1 }
      );
    }
    unexpectedClose(token) {
      throw this.input.error(
        "Unexpected }",
        { offset: token[2] },
        { offset: token[2] + 1 }
      );
    }
    unknownWord(tokens) {
      throw this.input.error(
        "Unknown word " + tokens[0][1],
        { offset: tokens[0][2] },
        { offset: tokens[0][2] + tokens[0][1].length }
      );
    }
    unnamedAtrule(node2, token) {
      throw this.input.error(
        "At-rule without name",
        { offset: token[2] },
        { offset: token[2] + token[1].length }
      );
    }
  }
  parser = Parser2;
  return parser;
}
var parse_1;
var hasRequiredParse;
function requireParse() {
  if (hasRequiredParse) return parse_1;
  hasRequiredParse = 1;
  let Container = requireContainer();
  let Input = requireInput();
  let Parser2 = requireParser();
  function parse(css, opts) {
    let input2 = new Input(css, opts);
    let parser2 = new Parser2(input2);
    try {
      parser2.parse();
    } catch (e) {
      if (process.env.NODE_ENV !== "production") {
        if (e.name === "CssSyntaxError" && opts && opts.from) {
          if (/\.scss$/i.test(opts.from)) {
            e.message += "\nYou tried to parse SCSS with the standard CSS parser; try again with the postcss-scss parser";
          } else if (/\.sass/i.test(opts.from)) {
            e.message += "\nYou tried to parse Sass with the standard CSS parser; try again with the postcss-sass parser";
          } else if (/\.less$/i.test(opts.from)) {
            e.message += "\nYou tried to parse Less with the standard CSS parser; try again with the postcss-less parser";
          }
        }
      }
      throw e;
    }
    return parser2.root;
  }
  parse_1 = parse;
  parse.default = parse;
  Container.registerParse(parse);
  return parse_1;
}
var warning;
var hasRequiredWarning;
function requireWarning() {
  if (hasRequiredWarning) return warning;
  hasRequiredWarning = 1;
  class Warning {
    constructor(text, opts = {}) {
      this.type = "warning";
      this.text = text;
      if (opts.node && opts.node.source) {
        let range = opts.node.rangeBy(opts);
        this.line = range.start.line;
        this.column = range.start.column;
        this.endLine = range.end.line;
        this.endColumn = range.end.column;
      }
      for (let opt in opts) this[opt] = opts[opt];
    }
    toString() {
      if (this.node) {
        return this.node.error(this.text, {
          index: this.index,
          plugin: this.plugin,
          word: this.word
        }).message;
      }
      if (this.plugin) {
        return this.plugin + ": " + this.text;
      }
      return this.text;
    }
  }
  warning = Warning;
  Warning.default = Warning;
  return warning;
}
var result;
var hasRequiredResult;
function requireResult() {
  if (hasRequiredResult) return result;
  hasRequiredResult = 1;
  let Warning = requireWarning();
  class Result {
    get content() {
      return this.css;
    }
    constructor(processor2, root2, opts) {
      this.processor = processor2;
      this.messages = [];
      this.root = root2;
      this.opts = opts;
      this.css = "";
      this.map = void 0;
    }
    toString() {
      return this.css;
    }
    warn(text, opts = {}) {
      if (!opts.plugin) {
        if (this.lastPlugin && this.lastPlugin.postcssPlugin) {
          opts.plugin = this.lastPlugin.postcssPlugin;
        }
      }
      let warning2 = new Warning(text, opts);
      this.messages.push(warning2);
      return warning2;
    }
    warnings() {
      return this.messages.filter((i) => i.type === "warning");
    }
  }
  result = Result;
  Result.default = Result;
  return result;
}
var warnOnce;
var hasRequiredWarnOnce;
function requireWarnOnce() {
  if (hasRequiredWarnOnce) return warnOnce;
  hasRequiredWarnOnce = 1;
  let printed = {};
  warnOnce = function warnOnce2(message) {
    if (printed[message]) return;
    printed[message] = true;
    if (typeof console !== "undefined" && console.warn) {
      console.warn(message);
    }
  };
  return warnOnce;
}
var lazyResult;
var hasRequiredLazyResult;
function requireLazyResult() {
  if (hasRequiredLazyResult) return lazyResult;
  hasRequiredLazyResult = 1;
  let Container = requireContainer();
  let Document = requireDocument();
  let MapGenerator = requireMapGenerator();
  let parse = requireParse();
  let Result = requireResult();
  let Root = requireRoot();
  let stringify2 = requireStringify();
  let { isClean, my } = requireSymbols();
  let warnOnce2 = requireWarnOnce();
  const TYPE_TO_CLASS_NAME = {
    atrule: "AtRule",
    comment: "Comment",
    decl: "Declaration",
    document: "Document",
    root: "Root",
    rule: "Rule"
  };
  const PLUGIN_PROPS = {
    AtRule: true,
    AtRuleExit: true,
    Comment: true,
    CommentExit: true,
    Declaration: true,
    DeclarationExit: true,
    Document: true,
    DocumentExit: true,
    Once: true,
    OnceExit: true,
    postcssPlugin: true,
    prepare: true,
    Root: true,
    RootExit: true,
    Rule: true,
    RuleExit: true
  };
  const NOT_VISITORS = {
    Once: true,
    postcssPlugin: true,
    prepare: true
  };
  const CHILDREN = 0;
  function isPromise(obj) {
    return typeof obj === "object" && typeof obj.then === "function";
  }
  function getEvents(node2) {
    let key = false;
    let type = TYPE_TO_CLASS_NAME[node2.type];
    if (node2.type === "decl") {
      key = node2.prop.toLowerCase();
    } else if (node2.type === "atrule") {
      key = node2.name.toLowerCase();
    }
    if (key && node2.append) {
      return [
        type,
        type + "-" + key,
        CHILDREN,
        type + "Exit",
        type + "Exit-" + key
      ];
    } else if (key) {
      return [type, type + "-" + key, type + "Exit", type + "Exit-" + key];
    } else if (node2.append) {
      return [type, CHILDREN, type + "Exit"];
    } else {
      return [type, type + "Exit"];
    }
  }
  function toStack(node2) {
    let events;
    if (node2.type === "document") {
      events = ["Document", CHILDREN, "DocumentExit"];
    } else if (node2.type === "root") {
      events = ["Root", CHILDREN, "RootExit"];
    } else {
      events = getEvents(node2);
    }
    return {
      eventIndex: 0,
      events,
      iterator: 0,
      node: node2,
      visitorIndex: 0,
      visitors: []
    };
  }
  function cleanMarks(node2) {
    node2[isClean] = false;
    if (node2.nodes) node2.nodes.forEach((i) => cleanMarks(i));
    return node2;
  }
  let postcss = {};
  class LazyResult {
    get content() {
      return this.stringify().content;
    }
    get css() {
      return this.stringify().css;
    }
    get map() {
      return this.stringify().map;
    }
    get messages() {
      return this.sync().messages;
    }
    get opts() {
      return this.result.opts;
    }
    get processor() {
      return this.result.processor;
    }
    get root() {
      return this.sync().root;
    }
    get [Symbol.toStringTag]() {
      return "LazyResult";
    }
    constructor(processor2, css, opts) {
      this.stringified = false;
      this.processed = false;
      let root2;
      if (typeof css === "object" && css !== null && (css.type === "root" || css.type === "document")) {
        root2 = cleanMarks(css);
      } else if (css instanceof LazyResult || css instanceof Result) {
        root2 = cleanMarks(css.root);
        if (css.map) {
          if (typeof opts.map === "undefined") opts.map = {};
          if (!opts.map.inline) opts.map.inline = false;
          opts.map.prev = css.map;
        }
      } else {
        let parser2 = parse;
        if (opts.syntax) parser2 = opts.syntax.parse;
        if (opts.parser) parser2 = opts.parser;
        if (parser2.parse) parser2 = parser2.parse;
        try {
          root2 = parser2(css, opts);
        } catch (error) {
          this.processed = true;
          this.error = error;
        }
        if (root2 && !root2[my]) {
          Container.rebuild(root2);
        }
      }
      this.result = new Result(processor2, root2, opts);
      this.helpers = { ...postcss, postcss, result: this.result };
      this.plugins = this.processor.plugins.map((plugin) => {
        if (typeof plugin === "object" && plugin.prepare) {
          return { ...plugin, ...plugin.prepare(this.result) };
        } else {
          return plugin;
        }
      });
    }
    async() {
      if (this.error) return Promise.reject(this.error);
      if (this.processed) return Promise.resolve(this.result);
      if (!this.processing) {
        this.processing = this.runAsync();
      }
      return this.processing;
    }
    catch(onRejected) {
      return this.async().catch(onRejected);
    }
    finally(onFinally) {
      return this.async().then(onFinally, onFinally);
    }
    getAsyncError() {
      throw new Error("Use process(css).then(cb) to work with async plugins");
    }
    handleError(error, node2) {
      let plugin = this.result.lastPlugin;
      try {
        if (node2) node2.addToError(error);
        this.error = error;
        if (error.name === "CssSyntaxError" && !error.plugin) {
          error.plugin = plugin.postcssPlugin;
          error.setMessage();
        } else if (plugin.postcssVersion) {
          if (process.env.NODE_ENV !== "production") {
            let pluginName = plugin.postcssPlugin;
            let pluginVer = plugin.postcssVersion;
            let runtimeVer = this.result.processor.version;
            let a = pluginVer.split(".");
            let b = runtimeVer.split(".");
            if (a[0] !== b[0] || parseInt(a[1]) > parseInt(b[1])) {
              console.error(
                "Unknown error from PostCSS plugin. Your current PostCSS version is " + runtimeVer + ", but " + pluginName + " uses " + pluginVer + ". Perhaps this is the source of the error below."
              );
            }
          }
        }
      } catch (err) {
        if (console && console.error) console.error(err);
      }
      return error;
    }
    prepareVisitors() {
      this.listeners = {};
      let add = (plugin, type, cb) => {
        if (!this.listeners[type]) this.listeners[type] = [];
        this.listeners[type].push([plugin, cb]);
      };
      for (let plugin of this.plugins) {
        if (typeof plugin === "object") {
          for (let event in plugin) {
            if (!PLUGIN_PROPS[event] && /^[A-Z]/.test(event)) {
              throw new Error(
                `Unknown event ${event} in ${plugin.postcssPlugin}. Try to update PostCSS (${this.processor.version} now).`
              );
            }
            if (!NOT_VISITORS[event]) {
              if (typeof plugin[event] === "object") {
                for (let filter in plugin[event]) {
                  if (filter === "*") {
                    add(plugin, event, plugin[event][filter]);
                  } else {
                    add(
                      plugin,
                      event + "-" + filter.toLowerCase(),
                      plugin[event][filter]
                    );
                  }
                }
              } else if (typeof plugin[event] === "function") {
                add(plugin, event, plugin[event]);
              }
            }
          }
        }
      }
      this.hasListener = Object.keys(this.listeners).length > 0;
    }
    async runAsync() {
      this.plugin = 0;
      for (let i = 0; i < this.plugins.length; i++) {
        let plugin = this.plugins[i];
        let promise = this.runOnRoot(plugin);
        if (isPromise(promise)) {
          try {
            await promise;
          } catch (error) {
            throw this.handleError(error);
          }
        }
      }
      this.prepareVisitors();
      if (this.hasListener) {
        let root2 = this.result.root;
        while (!root2[isClean]) {
          root2[isClean] = true;
          let stack = [toStack(root2)];
          while (stack.length > 0) {
            let promise = this.visitTick(stack);
            if (isPromise(promise)) {
              try {
                await promise;
              } catch (e) {
                let node2 = stack[stack.length - 1].node;
                throw this.handleError(e, node2);
              }
            }
          }
        }
        if (this.listeners.OnceExit) {
          for (let [plugin, visitor] of this.listeners.OnceExit) {
            this.result.lastPlugin = plugin;
            try {
              if (root2.type === "document") {
                let roots = root2.nodes.map(
                  (subRoot) => visitor(subRoot, this.helpers)
                );
                await Promise.all(roots);
              } else {
                await visitor(root2, this.helpers);
              }
            } catch (e) {
              throw this.handleError(e);
            }
          }
        }
      }
      this.processed = true;
      return this.stringify();
    }
    runOnRoot(plugin) {
      this.result.lastPlugin = plugin;
      try {
        if (typeof plugin === "object" && plugin.Once) {
          if (this.result.root.type === "document") {
            let roots = this.result.root.nodes.map(
              (root2) => plugin.Once(root2, this.helpers)
            );
            if (isPromise(roots[0])) {
              return Promise.all(roots);
            }
            return roots;
          }
          return plugin.Once(this.result.root, this.helpers);
        } else if (typeof plugin === "function") {
          return plugin(this.result.root, this.result);
        }
      } catch (error) {
        throw this.handleError(error);
      }
    }
    stringify() {
      if (this.error) throw this.error;
      if (this.stringified) return this.result;
      this.stringified = true;
      this.sync();
      let opts = this.result.opts;
      let str = stringify2;
      if (opts.syntax) str = opts.syntax.stringify;
      if (opts.stringifier) str = opts.stringifier;
      if (str.stringify) str = str.stringify;
      let map = new MapGenerator(str, this.result.root, this.result.opts);
      let data = map.generate();
      this.result.css = data[0];
      this.result.map = data[1];
      return this.result;
    }
    sync() {
      if (this.error) throw this.error;
      if (this.processed) return this.result;
      this.processed = true;
      if (this.processing) {
        throw this.getAsyncError();
      }
      for (let plugin of this.plugins) {
        let promise = this.runOnRoot(plugin);
        if (isPromise(promise)) {
          throw this.getAsyncError();
        }
      }
      this.prepareVisitors();
      if (this.hasListener) {
        let root2 = this.result.root;
        while (!root2[isClean]) {
          root2[isClean] = true;
          this.walkSync(root2);
        }
        if (this.listeners.OnceExit) {
          if (root2.type === "document") {
            for (let subRoot of root2.nodes) {
              this.visitSync(this.listeners.OnceExit, subRoot);
            }
          } else {
            this.visitSync(this.listeners.OnceExit, root2);
          }
        }
      }
      return this.result;
    }
    then(onFulfilled, onRejected) {
      if (process.env.NODE_ENV !== "production") {
        if (!("from" in this.opts)) {
          warnOnce2(
            "Without `from` option PostCSS could generate wrong source map and will not find Browserslist config. Set it to CSS file path or to `undefined` to prevent this warning."
          );
        }
      }
      return this.async().then(onFulfilled, onRejected);
    }
    toString() {
      return this.css;
    }
    visitSync(visitors, node2) {
      for (let [plugin, visitor] of visitors) {
        this.result.lastPlugin = plugin;
        let promise;
        try {
          promise = visitor(node2, this.helpers);
        } catch (e) {
          throw this.handleError(e, node2.proxyOf);
        }
        if (node2.type !== "root" && node2.type !== "document" && !node2.parent) {
          return true;
        }
        if (isPromise(promise)) {
          throw this.getAsyncError();
        }
      }
    }
    visitTick(stack) {
      let visit = stack[stack.length - 1];
      let { node: node2, visitors } = visit;
      if (node2.type !== "root" && node2.type !== "document" && !node2.parent) {
        stack.pop();
        return;
      }
      if (visitors.length > 0 && visit.visitorIndex < visitors.length) {
        let [plugin, visitor] = visitors[visit.visitorIndex];
        visit.visitorIndex += 1;
        if (visit.visitorIndex === visitors.length) {
          visit.visitors = [];
          visit.visitorIndex = 0;
        }
        this.result.lastPlugin = plugin;
        try {
          return visitor(node2.toProxy(), this.helpers);
        } catch (e) {
          throw this.handleError(e, node2);
        }
      }
      if (visit.iterator !== 0) {
        let iterator = visit.iterator;
        let child;
        while (child = node2.nodes[node2.indexes[iterator]]) {
          node2.indexes[iterator] += 1;
          if (!child[isClean]) {
            child[isClean] = true;
            stack.push(toStack(child));
            return;
          }
        }
        visit.iterator = 0;
        delete node2.indexes[iterator];
      }
      let events = visit.events;
      while (visit.eventIndex < events.length) {
        let event = events[visit.eventIndex];
        visit.eventIndex += 1;
        if (event === CHILDREN) {
          if (node2.nodes && node2.nodes.length) {
            node2[isClean] = true;
            visit.iterator = node2.getIterator();
          }
          return;
        } else if (this.listeners[event]) {
          visit.visitors = this.listeners[event];
          return;
        }
      }
      stack.pop();
    }
    walkSync(node2) {
      node2[isClean] = true;
      let events = getEvents(node2);
      for (let event of events) {
        if (event === CHILDREN) {
          if (node2.nodes) {
            node2.each((child) => {
              if (!child[isClean]) this.walkSync(child);
            });
          }
        } else {
          let visitors = this.listeners[event];
          if (visitors) {
            if (this.visitSync(visitors, node2.toProxy())) return;
          }
        }
      }
    }
    warnings() {
      return this.sync().warnings();
    }
  }
  LazyResult.registerPostcss = (dependant) => {
    postcss = dependant;
  };
  lazyResult = LazyResult;
  LazyResult.default = LazyResult;
  Root.registerLazyResult(LazyResult);
  Document.registerLazyResult(LazyResult);
  return lazyResult;
}
var noWorkResult;
var hasRequiredNoWorkResult;
function requireNoWorkResult() {
  if (hasRequiredNoWorkResult) return noWorkResult;
  hasRequiredNoWorkResult = 1;
  let MapGenerator = requireMapGenerator();
  let parse = requireParse();
  let Result = requireResult();
  let stringify2 = requireStringify();
  let warnOnce2 = requireWarnOnce();
  class NoWorkResult {
    get content() {
      return this.result.css;
    }
    get css() {
      return this.result.css;
    }
    get map() {
      return this.result.map;
    }
    get messages() {
      return [];
    }
    get opts() {
      return this.result.opts;
    }
    get processor() {
      return this.result.processor;
    }
    get root() {
      if (this._root) {
        return this._root;
      }
      let root2;
      let parser2 = parse;
      try {
        root2 = parser2(this._css, this._opts);
      } catch (error) {
        this.error = error;
      }
      if (this.error) {
        throw this.error;
      } else {
        this._root = root2;
        return root2;
      }
    }
    get [Symbol.toStringTag]() {
      return "NoWorkResult";
    }
    constructor(processor2, css, opts) {
      css = css.toString();
      this.stringified = false;
      this._processor = processor2;
      this._css = css;
      this._opts = opts;
      this._map = void 0;
      let str = stringify2;
      this.result = new Result(this._processor, void 0, this._opts);
      this.result.css = css;
      let self2 = this;
      Object.defineProperty(this.result, "root", {
        get() {
          return self2.root;
        }
      });
      let map = new MapGenerator(str, void 0, this._opts, css);
      if (map.isMap()) {
        let [generatedCSS, generatedMap] = map.generate();
        if (generatedCSS) {
          this.result.css = generatedCSS;
        }
        if (generatedMap) {
          this.result.map = generatedMap;
        }
      } else {
        map.clearAnnotation();
        this.result.css = map.css;
      }
    }
    async() {
      if (this.error) return Promise.reject(this.error);
      return Promise.resolve(this.result);
    }
    catch(onRejected) {
      return this.async().catch(onRejected);
    }
    finally(onFinally) {
      return this.async().then(onFinally, onFinally);
    }
    sync() {
      if (this.error) throw this.error;
      return this.result;
    }
    then(onFulfilled, onRejected) {
      if (process.env.NODE_ENV !== "production") {
        if (!("from" in this._opts)) {
          warnOnce2(
            "Without `from` option PostCSS could generate wrong source map and will not find Browserslist config. Set it to CSS file path or to `undefined` to prevent this warning."
          );
        }
      }
      return this.async().then(onFulfilled, onRejected);
    }
    toString() {
      return this._css;
    }
    warnings() {
      return [];
    }
  }
  noWorkResult = NoWorkResult;
  NoWorkResult.default = NoWorkResult;
  return noWorkResult;
}
var processor;
var hasRequiredProcessor;
function requireProcessor() {
  if (hasRequiredProcessor) return processor;
  hasRequiredProcessor = 1;
  let Document = requireDocument();
  let LazyResult = requireLazyResult();
  let NoWorkResult = requireNoWorkResult();
  let Root = requireRoot();
  class Processor {
    constructor(plugins = []) {
      this.version = "8.5.10";
      this.plugins = this.normalize(plugins);
    }
    normalize(plugins) {
      let normalized = [];
      for (let i of plugins) {
        if (i.postcss === true) {
          i = i();
        } else if (i.postcss) {
          i = i.postcss;
        }
        if (typeof i === "object" && Array.isArray(i.plugins)) {
          normalized = normalized.concat(i.plugins);
        } else if (typeof i === "object" && i.postcssPlugin) {
          normalized.push(i);
        } else if (typeof i === "function") {
          normalized.push(i);
        } else if (typeof i === "object" && (i.parse || i.stringify)) {
          if (process.env.NODE_ENV !== "production") {
            throw new Error(
              "PostCSS syntaxes cannot be used as plugins. Instead, please use one of the syntax/parser/stringifier options as outlined in your PostCSS runner documentation."
            );
          }
        } else {
          throw new Error(i + " is not a PostCSS plugin");
        }
      }
      return normalized;
    }
    process(css, opts = {}) {
      if (!this.plugins.length && !opts.parser && !opts.stringifier && !opts.syntax) {
        return new NoWorkResult(this, css, opts);
      } else {
        return new LazyResult(this, css, opts);
      }
    }
    use(plugin) {
      this.plugins = this.plugins.concat(this.normalize([plugin]));
      return this;
    }
  }
  processor = Processor;
  Processor.default = Processor;
  Root.registerProcessor(Processor);
  Document.registerProcessor(Processor);
  return processor;
}
var postcss_1;
var hasRequiredPostcss;
function requirePostcss() {
  if (hasRequiredPostcss) return postcss_1;
  hasRequiredPostcss = 1;
  let AtRule = requireAtRule();
  let Comment = requireComment();
  let Container = requireContainer();
  let CssSyntaxError = requireCssSyntaxError();
  let Declaration = requireDeclaration();
  let Document = requireDocument();
  let fromJSON = requireFromJSON();
  let Input = requireInput();
  let LazyResult = requireLazyResult();
  let list = requireList();
  let Node = requireNode();
  let parse = requireParse();
  let Processor = requireProcessor();
  let Result = requireResult();
  let Root = requireRoot();
  let Rule = requireRule();
  let stringify2 = requireStringify();
  let Warning = requireWarning();
  function postcss(...plugins) {
    if (plugins.length === 1 && Array.isArray(plugins[0])) {
      plugins = plugins[0];
    }
    return new Processor(plugins);
  }
  postcss.plugin = function plugin(name, initializer) {
    let warningPrinted = false;
    function creator(...args) {
      if (console && console.warn && !warningPrinted) {
        warningPrinted = true;
        console.warn(
          name + ": postcss.plugin was deprecated. Migration guide:\nhttps://evilmartians.com/chronicles/postcss-8-plugin-migration"
        );
        if (process.env.LANG && process.env.LANG.startsWith("cn")) {
          console.warn(
            name + ": 里面 postcss.plugin 被弃用. 迁移指南:\nhttps://www.w3ctech.com/topic/2226"
          );
        }
      }
      let transformer = initializer(...args);
      transformer.postcssPlugin = name;
      transformer.postcssVersion = new Processor().version;
      return transformer;
    }
    let cache;
    Object.defineProperty(creator, "postcss", {
      get() {
        if (!cache) cache = creator();
        return cache;
      }
    });
    creator.process = function(css, processOpts, pluginOpts) {
      return postcss([creator(pluginOpts)]).process(css, processOpts);
    };
    return creator;
  };
  postcss.stringify = stringify2;
  postcss.parse = parse;
  postcss.fromJSON = fromJSON;
  postcss.list = list;
  postcss.comment = (defaults) => new Comment(defaults);
  postcss.atRule = (defaults) => new AtRule(defaults);
  postcss.decl = (defaults) => new Declaration(defaults);
  postcss.rule = (defaults) => new Rule(defaults);
  postcss.root = (defaults) => new Root(defaults);
  postcss.document = (defaults) => new Document(defaults);
  postcss.CssSyntaxError = CssSyntaxError;
  postcss.Declaration = Declaration;
  postcss.Container = Container;
  postcss.Processor = Processor;
  postcss.Document = Document;
  postcss.Comment = Comment;
  postcss.Warning = Warning;
  postcss.AtRule = AtRule;
  postcss.Result = Result;
  postcss.Input = Input;
  postcss.Rule = Rule;
  postcss.Root = Root;
  postcss.Node = Node;
  LazyResult.registerPostcss(postcss);
  postcss_1 = postcss;
  postcss.default = postcss;
  return postcss_1;
}
var sanitizeHtml_1;
var hasRequiredSanitizeHtml;
function requireSanitizeHtml() {
  if (hasRequiredSanitizeHtml) return sanitizeHtml_1;
  hasRequiredSanitizeHtml = 1;
  const htmlparser = requireLib();
  const escapeStringRegexp2 = requireEscapeStringRegexp();
  const { isPlainObject: isPlainObject2 } = requireIsPlainObject();
  const deepmerge = requireCjs();
  const parseSrcset2 = requireParseSrcset();
  const { parse: postcssParse } = requirePostcss();
  const mediaTags = [
    "img",
    "audio",
    "video",
    "picture",
    "svg",
    "object",
    "map",
    "iframe",
    "embed"
  ];
  const vulnerableTags = ["script", "style"];
  function each(obj, cb) {
    if (obj) {
      Object.keys(obj).forEach(function(key) {
        cb(obj[key], key);
      });
    }
  }
  function has(obj, key) {
    return {}.hasOwnProperty.call(obj, key);
  }
  function filter(a, cb) {
    const n = [];
    each(a, function(v) {
      if (cb(v)) {
        n.push(v);
      }
    });
    return n;
  }
  function isEmptyObject(obj) {
    for (const key in obj) {
      if (has(obj, key)) {
        return false;
      }
    }
    return true;
  }
  function stringifySrcset(parsedSrcset) {
    return parsedSrcset.map(function(part) {
      if (!part.url) {
        throw new Error("URL missing");
      }
      return part.url + (part.w ? ` ${part.w}w` : "") + (part.h ? ` ${part.h}h` : "") + (part.d ? ` ${part.d}x` : "");
    }).join(", ");
  }
  sanitizeHtml_1 = sanitizeHtml;
  const VALID_HTML_ATTRIBUTE_NAME = /^[^\0\t\n\f\r /<=>]+$/;
  function sanitizeHtml(html, options2, _recursing) {
    if (html == null) {
      return "";
    }
    if (typeof html === "number") {
      html = html.toString();
    }
    let result2 = "";
    let tempResult = "";
    function Frame(tag, attribs) {
      const that = this;
      this.tag = tag;
      this.attribs = attribs || {};
      this.tagPosition = result2.length;
      this.text = "";
      this.mediaChildren = [];
      this.updateParentNodeText = function() {
        if (stack.length) {
          const parentFrame = stack[stack.length - 1];
          parentFrame.text += that.text;
        }
      };
      this.updateParentNodeMediaChildren = function() {
        if (stack.length && mediaTags.includes(this.tag)) {
          const parentFrame = stack[stack.length - 1];
          parentFrame.mediaChildren.push(this.tag);
        }
      };
    }
    options2 = Object.assign({}, sanitizeHtml.defaults, options2);
    options2.parser = Object.assign({}, htmlParserDefaults, options2.parser);
    const tagAllowed = function(name) {
      return options2.allowedTags === false || (options2.allowedTags || []).indexOf(name) > -1;
    };
    vulnerableTags.forEach(function(tag) {
      if (tagAllowed(tag) && !options2.allowVulnerableTags) {
        console.warn(`

⚠️ Your \`allowedTags\` option includes, \`${tag}\`, which is inherently
vulnerable to XSS attacks. Please remove it from \`allowedTags\`.
Or, to disable this warning, add the \`allowVulnerableTags\` option
and ensure you are accounting for this risk.

`);
      }
    });
    const nonTextTagsArray = options2.nonTextTags || [
      "script",
      "style",
      "textarea",
      "option"
    ];
    let allowedAttributesMap;
    let allowedAttributesGlobMap;
    if (options2.allowedAttributes) {
      allowedAttributesMap = {};
      allowedAttributesGlobMap = {};
      each(options2.allowedAttributes, function(attributes2, tag) {
        allowedAttributesMap[tag] = [];
        const globRegex = [];
        attributes2.forEach(function(obj) {
          if (typeof obj === "string" && obj.indexOf("*") >= 0) {
            globRegex.push(escapeStringRegexp2(obj).replace(/\\\*/g, ".*"));
          } else {
            allowedAttributesMap[tag].push(obj);
          }
        });
        if (globRegex.length) {
          allowedAttributesGlobMap[tag] = new RegExp("^(" + globRegex.join("|") + ")$");
        }
      });
    }
    const allowedClassesMap = {};
    const allowedClassesGlobMap = {};
    const allowedClassesRegexMap = {};
    each(options2.allowedClasses, function(classes, tag) {
      if (allowedAttributesMap) {
        if (!has(allowedAttributesMap, tag)) {
          allowedAttributesMap[tag] = [];
        }
        allowedAttributesMap[tag].push("class");
      }
      allowedClassesMap[tag] = classes;
      if (Array.isArray(classes)) {
        const globRegex = [];
        allowedClassesMap[tag] = [];
        allowedClassesRegexMap[tag] = [];
        classes.forEach(function(obj) {
          if (typeof obj === "string" && obj.indexOf("*") >= 0) {
            globRegex.push(escapeStringRegexp2(obj).replace(/\\\*/g, ".*"));
          } else if (obj instanceof RegExp) {
            allowedClassesRegexMap[tag].push(obj);
          } else {
            allowedClassesMap[tag].push(obj);
          }
        });
        if (globRegex.length) {
          allowedClassesGlobMap[tag] = new RegExp("^(" + globRegex.join("|") + ")$");
        }
      }
    });
    const transformTagsMap = {};
    let transformTagsAll;
    each(options2.transformTags, function(transform, tag) {
      let transFun;
      if (typeof transform === "function") {
        transFun = transform;
      } else if (typeof transform === "string") {
        transFun = sanitizeHtml.simpleTransform(transform);
      }
      if (tag === "*") {
        transformTagsAll = transFun;
      } else {
        transformTagsMap[tag] = transFun;
      }
    });
    let depth;
    let stack;
    let skipMap;
    let transformMap;
    let skipText;
    let skipTextDepth;
    let addedText = false;
    initializeState();
    const parser2 = new htmlparser.Parser({
      onopentag: function(name, attribs) {
        if (options2.enforceHtmlBoundary && name === "html") {
          initializeState();
        }
        if (skipText) {
          skipTextDepth++;
          return;
        }
        const frame = new Frame(name, attribs);
        stack.push(frame);
        let skip = false;
        const hasText = !!frame.text;
        let transformedTag;
        if (has(transformTagsMap, name)) {
          transformedTag = transformTagsMap[name](name, attribs);
          frame.attribs = attribs = transformedTag.attribs;
          if (transformedTag.text !== void 0) {
            frame.innerText = transformedTag.text;
          }
          if (name !== transformedTag.tagName) {
            frame.name = name = transformedTag.tagName;
            transformMap[depth] = transformedTag.tagName;
          }
        }
        if (transformTagsAll) {
          transformedTag = transformTagsAll(name, attribs);
          frame.attribs = attribs = transformedTag.attribs;
          if (name !== transformedTag.tagName) {
            frame.name = name = transformedTag.tagName;
            transformMap[depth] = transformedTag.tagName;
          }
        }
        if (!tagAllowed(name) || options2.disallowedTagsMode === "recursiveEscape" && !isEmptyObject(skipMap) || options2.nestingLimit != null && depth >= options2.nestingLimit) {
          skip = true;
          skipMap[depth] = true;
          if (options2.disallowedTagsMode === "discard" || options2.disallowedTagsMode === "completelyDiscard") {
            if (nonTextTagsArray.indexOf(name) !== -1) {
              skipText = true;
              skipTextDepth = 1;
            }
          }
          skipMap[depth] = true;
        }
        depth++;
        if (skip) {
          if (options2.disallowedTagsMode === "discard" || options2.disallowedTagsMode === "completelyDiscard") {
            return;
          }
          tempResult = result2;
          result2 = "";
        }
        result2 += "<" + name;
        if (name === "script") {
          if (options2.allowedScriptHostnames || options2.allowedScriptDomains) {
            frame.innerText = "";
          }
        }
        if (!allowedAttributesMap || has(allowedAttributesMap, name) || allowedAttributesMap["*"]) {
          each(attribs, function(value, a) {
            if (!VALID_HTML_ATTRIBUTE_NAME.test(a)) {
              delete frame.attribs[a];
              return;
            }
            if (value === "" && !options2.allowedEmptyAttributes.includes(a) && (options2.nonBooleanAttributes.includes(a) || options2.nonBooleanAttributes.includes("*"))) {
              delete frame.attribs[a];
              return;
            }
            let passedAllowedAttributesMapCheck = false;
            if (!allowedAttributesMap || has(allowedAttributesMap, name) && allowedAttributesMap[name].indexOf(a) !== -1 || allowedAttributesMap["*"] && allowedAttributesMap["*"].indexOf(a) !== -1 || has(allowedAttributesGlobMap, name) && allowedAttributesGlobMap[name].test(a) || allowedAttributesGlobMap["*"] && allowedAttributesGlobMap["*"].test(a)) {
              passedAllowedAttributesMapCheck = true;
            } else if (allowedAttributesMap && allowedAttributesMap[name]) {
              for (const o of allowedAttributesMap[name]) {
                if (isPlainObject2(o) && o.name && o.name === a) {
                  passedAllowedAttributesMapCheck = true;
                  let newValue = "";
                  if (o.multiple === true) {
                    const splitStrArray = value.split(" ");
                    for (const s of splitStrArray) {
                      if (o.values.indexOf(s) !== -1) {
                        if (newValue === "") {
                          newValue = s;
                        } else {
                          newValue += " " + s;
                        }
                      }
                    }
                  } else if (o.values.indexOf(value) >= 0) {
                    newValue = value;
                  }
                  value = newValue;
                }
              }
            }
            if (passedAllowedAttributesMapCheck) {
              if (options2.allowedSchemesAppliedToAttributes.indexOf(a) !== -1) {
                if (naughtyHref(name, value)) {
                  delete frame.attribs[a];
                  return;
                }
              }
              if (name === "script" && a === "src") {
                let allowed = true;
                try {
                  const parsed = parseUrl(value);
                  if (options2.allowedScriptHostnames || options2.allowedScriptDomains) {
                    const allowedHostname = (options2.allowedScriptHostnames || []).find(function(hostname) {
                      return hostname === parsed.url.hostname;
                    });
                    const allowedDomain = (options2.allowedScriptDomains || []).find(function(domain) {
                      return parsed.url.hostname === domain || parsed.url.hostname.endsWith(`.${domain}`);
                    });
                    allowed = allowedHostname || allowedDomain;
                  }
                } catch (e) {
                  allowed = false;
                }
                if (!allowed) {
                  delete frame.attribs[a];
                  return;
                }
              }
              if (name === "iframe" && a === "src") {
                let allowed = true;
                try {
                  const parsed = parseUrl(value);
                  if (parsed.isRelativeUrl) {
                    allowed = has(options2, "allowIframeRelativeUrls") ? options2.allowIframeRelativeUrls : !options2.allowedIframeHostnames && !options2.allowedIframeDomains;
                  } else if (options2.allowedIframeHostnames || options2.allowedIframeDomains) {
                    const allowedHostname = (options2.allowedIframeHostnames || []).find(function(hostname) {
                      return hostname === parsed.url.hostname;
                    });
                    const allowedDomain = (options2.allowedIframeDomains || []).find(function(domain) {
                      return parsed.url.hostname === domain || parsed.url.hostname.endsWith(`.${domain}`);
                    });
                    allowed = allowedHostname || allowedDomain;
                  }
                } catch (e) {
                  allowed = false;
                }
                if (!allowed) {
                  delete frame.attribs[a];
                  return;
                }
              }
              if (a === "srcset") {
                try {
                  let parsed = parseSrcset2(value);
                  parsed.forEach(function(value2) {
                    if (naughtyHref("srcset", value2.url)) {
                      value2.evil = true;
                    }
                  });
                  parsed = filter(parsed, function(v) {
                    return !v.evil;
                  });
                  if (!parsed.length) {
                    delete frame.attribs[a];
                    return;
                  } else {
                    value = stringifySrcset(filter(parsed, function(v) {
                      return !v.evil;
                    }));
                    frame.attribs[a] = value;
                  }
                } catch (e) {
                  delete frame.attribs[a];
                  return;
                }
              }
              if (a === "class") {
                const allowedSpecificClasses = allowedClassesMap[name];
                const allowedWildcardClasses = allowedClassesMap["*"];
                const allowedSpecificClassesGlob = allowedClassesGlobMap[name];
                const allowedSpecificClassesRegex = allowedClassesRegexMap[name];
                const allowedWildcardClassesGlob = allowedClassesGlobMap["*"];
                const allowedClassesGlobs = [
                  allowedSpecificClassesGlob,
                  allowedWildcardClassesGlob
                ].concat(allowedSpecificClassesRegex).filter(function(t) {
                  return t;
                });
                if (allowedSpecificClasses && allowedWildcardClasses) {
                  value = filterClasses(value, deepmerge(allowedSpecificClasses, allowedWildcardClasses), allowedClassesGlobs);
                } else {
                  value = filterClasses(value, allowedSpecificClasses || allowedWildcardClasses, allowedClassesGlobs);
                }
                if (!value.length) {
                  delete frame.attribs[a];
                  return;
                }
              }
              if (a === "style") {
                if (options2.parseStyleAttributes) {
                  try {
                    const abstractSyntaxTree = postcssParse(name + " {" + value + "}", { map: false });
                    const filteredAST = filterCss(abstractSyntaxTree, options2.allowedStyles);
                    value = stringifyStyleAttributes(filteredAST);
                    if (value.length === 0) {
                      delete frame.attribs[a];
                      return;
                    }
                  } catch (e) {
                    if (typeof window !== "undefined") {
                      console.warn('Failed to parse "' + name + " {" + value + `}", If you're running this in a browser, we recommend to disable style parsing: options.parseStyleAttributes: false, since this only works in a node environment due to a postcss dependency, More info: https://github.com/apostrophecms/sanitize-html/issues/547`);
                    }
                    delete frame.attribs[a];
                    return;
                  }
                } else if (options2.allowedStyles) {
                  throw new Error("allowedStyles option cannot be used together with parseStyleAttributes: false.");
                }
              }
              result2 += " " + a;
              if (value && value.length) {
                result2 += '="' + escapeHtml2(value, true) + '"';
              } else if (options2.allowedEmptyAttributes.includes(a)) {
                result2 += '=""';
              }
            } else {
              delete frame.attribs[a];
            }
          });
        }
        if (options2.selfClosing.indexOf(name) !== -1) {
          result2 += " />";
        } else {
          result2 += ">";
          if (frame.innerText && !hasText && !options2.textFilter) {
            result2 += escapeHtml2(frame.innerText);
            addedText = true;
          }
        }
        if (skip) {
          result2 = tempResult + escapeHtml2(result2);
          tempResult = "";
        }
      },
      ontext: function(text) {
        if (skipText) {
          return;
        }
        const lastFrame = stack[stack.length - 1];
        let tag;
        if (lastFrame) {
          tag = lastFrame.tag;
          text = lastFrame.innerText !== void 0 ? lastFrame.innerText : text;
        }
        if (options2.disallowedTagsMode === "completelyDiscard" && !tagAllowed(tag)) {
          text = "";
        } else if ((options2.disallowedTagsMode === "discard" || options2.disallowedTagsMode === "completelyDiscard") && (tag === "script" || tag === "style")) {
          result2 += text;
        } else {
          const escaped = escapeHtml2(text, false);
          if (options2.textFilter && !addedText) {
            result2 += options2.textFilter(escaped, tag);
          } else if (!addedText) {
            result2 += escaped;
          }
        }
        if (stack.length) {
          const frame = stack[stack.length - 1];
          frame.text += text;
        }
      },
      onclosetag: function(name, isImplied) {
        if (skipText) {
          skipTextDepth--;
          if (!skipTextDepth) {
            skipText = false;
          } else {
            return;
          }
        }
        const frame = stack.pop();
        if (!frame) {
          return;
        }
        if (frame.tag !== name) {
          stack.push(frame);
          return;
        }
        skipText = options2.enforceHtmlBoundary ? name === "html" : false;
        depth--;
        const skip = skipMap[depth];
        if (skip) {
          delete skipMap[depth];
          if (options2.disallowedTagsMode === "discard" || options2.disallowedTagsMode === "completelyDiscard") {
            frame.updateParentNodeText();
            return;
          }
          tempResult = result2;
          result2 = "";
        }
        if (transformMap[depth]) {
          name = transformMap[depth];
          delete transformMap[depth];
        }
        if (options2.exclusiveFilter && options2.exclusiveFilter(frame)) {
          result2 = result2.substr(0, frame.tagPosition);
          return;
        }
        frame.updateParentNodeMediaChildren();
        frame.updateParentNodeText();
        if (
          // Already output />
          options2.selfClosing.indexOf(name) !== -1 || // Escaped tag, closing tag is implied
          isImplied && !tagAllowed(name) && ["escape", "recursiveEscape"].indexOf(options2.disallowedTagsMode) >= 0
        ) {
          if (skip) {
            result2 = tempResult;
            tempResult = "";
          }
          return;
        }
        result2 += "</" + name + ">";
        if (skip) {
          result2 = tempResult + escapeHtml2(result2);
          tempResult = "";
        }
        addedText = false;
      }
    }, options2.parser);
    parser2.write(html);
    parser2.end();
    return result2;
    function initializeState() {
      result2 = "";
      depth = 0;
      stack = [];
      skipMap = {};
      transformMap = {};
      skipText = false;
      skipTextDepth = 0;
    }
    function escapeHtml2(s, quote) {
      if (typeof s !== "string") {
        s = s + "";
      }
      if (options2.parser.decodeEntities) {
        s = s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        if (quote) {
          s = s.replace(/"/g, "&quot;");
        }
      }
      s = s.replace(/&(?![a-zA-Z0-9#]{1,20};)/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      if (quote) {
        s = s.replace(/"/g, "&quot;");
      }
      return s;
    }
    function naughtyHref(name, href) {
      href = href.replace(/[\x00-\x20]+/g, "");
      while (true) {
        const firstIndex = href.indexOf("<!--");
        if (firstIndex === -1) {
          break;
        }
        const lastIndex = href.indexOf("-->", firstIndex + 4);
        if (lastIndex === -1) {
          break;
        }
        href = href.substring(0, firstIndex) + href.substring(lastIndex + 3);
      }
      const matches = href.match(/^([a-zA-Z][a-zA-Z0-9.\-+]*):/);
      if (!matches) {
        if (href.match(/^[/\\]{2}/)) {
          return !options2.allowProtocolRelative;
        }
        return false;
      }
      const scheme = matches[1].toLowerCase();
      if (has(options2.allowedSchemesByTag, name)) {
        return options2.allowedSchemesByTag[name].indexOf(scheme) === -1;
      }
      return !options2.allowedSchemes || options2.allowedSchemes.indexOf(scheme) === -1;
    }
    function parseUrl(value) {
      value = value.replace(/^(\w+:)?\s*[\\/]\s*[\\/]/, "$1//");
      if (value.startsWith("relative:")) {
        throw new Error("relative: exploit attempt");
      }
      let base = "relative://relative-site";
      for (let i = 0; i < 100; i++) {
        base += `/${i}`;
      }
      const parsed = new URL(value, base);
      const isRelativeUrl = parsed && parsed.hostname === "relative-site" && parsed.protocol === "relative:";
      return {
        isRelativeUrl,
        url: parsed
      };
    }
    function filterCss(abstractSyntaxTree, allowedStyles) {
      if (!allowedStyles) {
        return abstractSyntaxTree;
      }
      const astRules = abstractSyntaxTree.nodes[0];
      let selectedRule;
      if (allowedStyles[astRules.selector] && allowedStyles["*"]) {
        selectedRule = deepmerge(
          allowedStyles[astRules.selector],
          allowedStyles["*"]
        );
      } else {
        selectedRule = allowedStyles[astRules.selector] || allowedStyles["*"];
      }
      if (selectedRule) {
        abstractSyntaxTree.nodes[0].nodes = astRules.nodes.reduce(filterDeclarations(selectedRule), []);
      }
      return abstractSyntaxTree;
    }
    function stringifyStyleAttributes(filteredAST) {
      return filteredAST.nodes[0].nodes.reduce(function(extractedAttributes, attrObject) {
        extractedAttributes.push(
          `${attrObject.prop}:${attrObject.value}${attrObject.important ? " !important" : ""}`
        );
        return extractedAttributes;
      }, []).join(";");
    }
    function filterDeclarations(selectedRule) {
      return function(allowedDeclarationsList, attributeObject) {
        if (has(selectedRule, attributeObject.prop)) {
          const matchesRegex = selectedRule[attributeObject.prop].some(function(regularExpression) {
            return regularExpression.test(attributeObject.value);
          });
          if (matchesRegex) {
            allowedDeclarationsList.push(attributeObject);
          }
        }
        return allowedDeclarationsList;
      };
    }
    function filterClasses(classes, allowed, allowedGlobs) {
      if (!allowed) {
        return classes;
      }
      classes = classes.split(/\s+/);
      return classes.filter(function(clss) {
        return allowed.indexOf(clss) !== -1 || allowedGlobs.some(function(glob) {
          return glob.test(clss);
        });
      }).join(" ");
    }
  }
  const htmlParserDefaults = {
    decodeEntities: true
  };
  sanitizeHtml.defaults = {
    allowedTags: [
      // Sections derived from MDN element categories and limited to the more
      // benign categories.
      // https://developer.mozilla.org/en-US/docs/Web/HTML/Element
      // Content sectioning
      "address",
      "article",
      "aside",
      "footer",
      "header",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "hgroup",
      "main",
      "nav",
      "section",
      // Text content
      "blockquote",
      "dd",
      "div",
      "dl",
      "dt",
      "figcaption",
      "figure",
      "hr",
      "li",
      "main",
      "ol",
      "p",
      "pre",
      "ul",
      // Inline text semantics
      "a",
      "abbr",
      "b",
      "bdi",
      "bdo",
      "br",
      "cite",
      "code",
      "data",
      "dfn",
      "em",
      "i",
      "kbd",
      "mark",
      "q",
      "rb",
      "rp",
      "rt",
      "rtc",
      "ruby",
      "s",
      "samp",
      "small",
      "span",
      "strong",
      "sub",
      "sup",
      "time",
      "u",
      "var",
      "wbr",
      // Table content
      "caption",
      "col",
      "colgroup",
      "table",
      "tbody",
      "td",
      "tfoot",
      "th",
      "thead",
      "tr"
    ],
    // Tags that cannot be boolean
    nonBooleanAttributes: [
      "abbr",
      "accept",
      "accept-charset",
      "accesskey",
      "action",
      "allow",
      "alt",
      "as",
      "autocapitalize",
      "autocomplete",
      "blocking",
      "charset",
      "cite",
      "class",
      "color",
      "cols",
      "colspan",
      "content",
      "contenteditable",
      "coords",
      "crossorigin",
      "data",
      "datetime",
      "decoding",
      "dir",
      "dirname",
      "download",
      "draggable",
      "enctype",
      "enterkeyhint",
      "fetchpriority",
      "for",
      "form",
      "formaction",
      "formenctype",
      "formmethod",
      "formtarget",
      "headers",
      "height",
      "hidden",
      "high",
      "href",
      "hreflang",
      "http-equiv",
      "id",
      "imagesizes",
      "imagesrcset",
      "inputmode",
      "integrity",
      "is",
      "itemid",
      "itemprop",
      "itemref",
      "itemtype",
      "kind",
      "label",
      "lang",
      "list",
      "loading",
      "low",
      "max",
      "maxlength",
      "media",
      "method",
      "min",
      "minlength",
      "name",
      "nonce",
      "optimum",
      "pattern",
      "ping",
      "placeholder",
      "popover",
      "popovertarget",
      "popovertargetaction",
      "poster",
      "preload",
      "referrerpolicy",
      "rel",
      "rows",
      "rowspan",
      "sandbox",
      "scope",
      "shape",
      "size",
      "sizes",
      "slot",
      "span",
      "spellcheck",
      "src",
      "srcdoc",
      "srclang",
      "srcset",
      "start",
      "step",
      "style",
      "tabindex",
      "target",
      "title",
      "translate",
      "type",
      "usemap",
      "value",
      "width",
      "wrap",
      // Event handlers
      "onauxclick",
      "onafterprint",
      "onbeforematch",
      "onbeforeprint",
      "onbeforeunload",
      "onbeforetoggle",
      "onblur",
      "oncancel",
      "oncanplay",
      "oncanplaythrough",
      "onchange",
      "onclick",
      "onclose",
      "oncontextlost",
      "oncontextmenu",
      "oncontextrestored",
      "oncopy",
      "oncuechange",
      "oncut",
      "ondblclick",
      "ondrag",
      "ondragend",
      "ondragenter",
      "ondragleave",
      "ondragover",
      "ondragstart",
      "ondrop",
      "ondurationchange",
      "onemptied",
      "onended",
      "onerror",
      "onfocus",
      "onformdata",
      "onhashchange",
      "oninput",
      "oninvalid",
      "onkeydown",
      "onkeypress",
      "onkeyup",
      "onlanguagechange",
      "onload",
      "onloadeddata",
      "onloadedmetadata",
      "onloadstart",
      "onmessage",
      "onmessageerror",
      "onmousedown",
      "onmouseenter",
      "onmouseleave",
      "onmousemove",
      "onmouseout",
      "onmouseover",
      "onmouseup",
      "onoffline",
      "ononline",
      "onpagehide",
      "onpageshow",
      "onpaste",
      "onpause",
      "onplay",
      "onplaying",
      "onpopstate",
      "onprogress",
      "onratechange",
      "onreset",
      "onresize",
      "onrejectionhandled",
      "onscroll",
      "onscrollend",
      "onsecuritypolicyviolation",
      "onseeked",
      "onseeking",
      "onselect",
      "onslotchange",
      "onstalled",
      "onstorage",
      "onsubmit",
      "onsuspend",
      "ontimeupdate",
      "ontoggle",
      "onunhandledrejection",
      "onunload",
      "onvolumechange",
      "onwaiting",
      "onwheel"
    ],
    disallowedTagsMode: "discard",
    allowedAttributes: {
      a: ["href", "name", "target"],
      // We don't currently allow img itself by default, but
      // these attributes would make sense if we did.
      img: ["src", "srcset", "alt", "title", "width", "height", "loading"]
    },
    allowedEmptyAttributes: [
      "alt"
    ],
    // Lots of these won't come up by default because we don't allow them
    selfClosing: ["img", "br", "hr", "area", "base", "basefont", "input", "link", "meta"],
    // URL schemes we permit
    allowedSchemes: ["http", "https", "ftp", "mailto", "tel"],
    allowedSchemesByTag: {},
    allowedSchemesAppliedToAttributes: ["href", "src", "cite"],
    allowProtocolRelative: true,
    enforceHtmlBoundary: false,
    parseStyleAttributes: true
  };
  sanitizeHtml.simpleTransform = function(newTagName, newAttribs, merge) {
    merge = merge === void 0 ? true : merge;
    newAttribs = newAttribs || {};
    return function(tagName, attribs) {
      let attrib;
      if (merge) {
        for (attrib in newAttribs) {
          attribs[attrib] = newAttribs[attrib];
        }
      } else {
        attribs = newAttribs;
      }
      return {
        tagName: newTagName,
        attribs
      };
    };
  };
  return sanitizeHtml_1;
}
const nodemailer = require$$0$4;
const { decryptCredentials: decryptCredentials$1 } = requireEncryption();
function stripHeaderInjection(value) {
  if (typeof value !== "string") return "";
  return value.replace(/[\r\n]/g, "").trim();
}
function shouldEmitUnsubscribe(emailData) {
  if (!emailData || !emailData.unsubscribeUrl) return false;
  if (emailData.type === "marketing") return true;
  return emailData.__forceUnsubscribe === true;
}
function extractEmailAddress(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (trimmed.includes("<")) {
    const match = trimmed.match(/<([^>]+)>/);
    return match ? match[1].trim() : trimmed;
  }
  return trimmed;
}
function isFromAllowed(candidate, accountFrom) {
  if (!candidate) return true;
  const c = extractEmailAddress(candidate).toLowerCase();
  const a = (accountFrom || "").toLowerCase().trim();
  return c.length > 0 && a.length > 0 && c === a;
}
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
    const settingsService = strapi2.plugin("magic-mail").service("plugin-settings");
    const pluginSettings2 = await settingsService.getSettings() || {};
    if (!emailData.from) {
      const nameCandidate = pluginSettings2.defaultFromName || null;
      const emailCandidate = pluginSettings2.defaultFromEmail || null;
      if (emailCandidate) {
        emailData.from = nameCandidate ? `${stripHeaderInjection(nameCandidate)} <${emailCandidate}>` : emailCandidate;
      }
    }
    if (!emailData.fromName && pluginSettings2.defaultFromName) {
      emailData.fromName = pluginSettings2.defaultFromName;
    }
    if (!emailData.unsubscribeUrl && pluginSettings2.unsubscribeUrl) {
      emailData.unsubscribeUrl = pluginSettings2.unsubscribeUrl;
    }
    const alwaysEmitUnsubscribe = pluginSettings2.enableUnsubscribeHeader === true;
    if (alwaysEmitUnsubscribe) {
      emailData.__forceUnsubscribe = true;
    }
    let emailLog2 = null;
    let recipientHash = null;
    const enableTracking = emailData.enableTracking !== false;
    if (enableTracking && html) {
      try {
        const analyticsService = strapi2.plugin("magic-mail").service("analytics");
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
      for (const rule2 of allRules) {
        let matches = false;
        switch (rule2.matchType) {
          case "emailType":
            matches = rule2.matchValue === type;
            break;
          case "recipient":
            matches = to && to.toLowerCase().includes(rule2.matchValue.toLowerCase());
            break;
          case "subject":
            matches = subject && subject.toLowerCase().includes(rule2.matchValue.toLowerCase());
            break;
          case "template":
            matches = emailData.template && emailData.template === rule2.matchValue;
            break;
          case "custom":
            matches = emailData.customField && emailData.customField === rule2.matchValue;
            break;
        }
        if (matches) {
          matchedRule = rule2;
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
      if (!isFromAllowed(emailData.from, account.fromEmail)) {
        strapi2.log.warn(
          `[magic-mail] Rejected from-override "${emailData.from}" != account.fromEmail "${account.fromEmail}" — using account address`
        );
        emailData.from = account.fromName ? `${stripHeaderInjection(account.fromName)} <${account.fromEmail}>` : account.fromEmail;
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
      const result2 = await this.sendViaAccount(account, emailData);
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
        messageId: result2.messageId
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
    for (const rule2 of allRules) {
      let matches = false;
      switch (rule2.matchType) {
        case "emailType":
          matches = rule2.matchValue === type;
          break;
        case "recipient":
          matches = emailData.to && emailData.to.toLowerCase().includes(rule2.matchValue.toLowerCase());
          break;
        case "subject":
          matches = emailData.subject && emailData.subject.toLowerCase().includes(rule2.matchValue.toLowerCase());
          break;
        case "template":
          matches = emailData.template && emailData.template === rule2.matchValue;
          break;
        case "custom":
          matches = emailData.customField && emailData.customField === rule2.matchValue;
          break;
      }
      if (matches) {
        const account = accounts2.find((a) => a.name.toLowerCase() === rule2.accountName.toLowerCase());
        if (account) {
          strapi2.log.info(`[magic-mail] [ROUTE] Routing rule matched: ${rule2.name} -> ${account.name}`);
          return account;
        }
        if (rule2.fallbackAccountName) {
          const fallbackAccount = accounts2.find((a) => a.name === rule2.fallbackAccountName);
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
   * With enhanced security: DKIM, proper headers, TLS enforcement.
   *
   * Runs the same validateEmailSecurity() pass as every other provider so
   * HTML sanitization, header-injection guards, and recipient-format checks
   * apply uniformly to SMTP too.
   */
  async sendViaSMTP(account, emailData) {
    this.validateEmailSecurity(emailData);
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
    const safeSubject = stripHeaderInjection(emailData.subject);
    const safeFromName = stripHeaderInjection(account.fromName || "MagicMail");
    const safeReplyTo = stripHeaderInjection(emailData.replyTo || account.replyTo || "");
    const mailOptions = {
      from: emailData.from || `${safeFromName} <${account.fromEmail}>`,
      to: emailData.to,
      ...emailData.cc && { cc: emailData.cc },
      ...emailData.bcc && { bcc: emailData.bcc },
      ...safeReplyTo && { replyTo: safeReplyTo },
      subject: safeSubject,
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
    if (shouldEmitUnsubscribe(emailData)) {
      mailOptions.headers["List-Unsubscribe"] = `<${emailData.unsubscribeUrl}>`;
      mailOptions.headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
      if (emailData.type === "marketing") {
        mailOptions.headers["Precedence"] = "bulk";
      }
    } else if (emailData.type === "marketing") {
      strapi2.log.warn(
        "[magic-mail] Marketing email without unsubscribe URL — may violate GDPR/CAN-SPAM. Set emailData.unsubscribeUrl or configure pluginSettings.unsubscribeUrl."
      );
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
        const { encryptCredentials: encryptCredentials2 } = requireEncryption();
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
    const safeSubject = stripHeaderInjection(emailData.subject);
    const safeFromName = stripHeaderInjection(account.fromName || "MagicMail");
    try {
      const boundary = `----=_Part_${Date.now()}`;
      const attachments = emailData.attachments || [];
      let emailContent = "";
      if (attachments.length > 0) {
        const emailLines = [
          `From: ${safeFromName ? `"${safeFromName}" ` : ""}<${account.fromEmail}>`,
          `To: ${emailData.to}`,
          `Subject: ${safeSubject}`,
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
        if (shouldEmitUnsubscribe(emailData)) {
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
          `From: ${safeFromName ? `"${safeFromName}" ` : ""}<${account.fromEmail}>`,
          `To: ${emailData.to}`,
          `Subject: ${safeSubject}`,
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
        if (shouldEmitUnsubscribe(emailData)) {
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
      const result2 = await response.json();
      strapi2.log.info("[magic-mail] [SUCCESS] Email sent via Gmail API");
      return {
        messageId: result2.id,
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
        const { encryptCredentials: encryptCredentials2 } = requireEncryption();
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
        if (shouldEmitUnsubscribe(emailData)) {
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
        if (shouldEmitUnsubscribe(emailData)) {
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
        const { encryptCredentials: encryptCredentials2 } = requireEncryption();
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
    const nodemailer2 = require$$0$4;
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
      if (shouldEmitUnsubscribe(emailData)) {
        mailOptions.headers["List-Unsubscribe"] = `<${emailData.unsubscribeUrl}>`;
        mailOptions.headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
      }
      if (mailOptions.attachments.length > 0) {
        strapi2.log.info(`[magic-mail] Sending email with ${mailOptions.attachments.length} attachment(s)`);
      }
      const result2 = await transporter.sendMail(mailOptions);
      strapi2.log.info("[magic-mail] [SUCCESS] Email sent via Yahoo OAuth");
      return {
        messageId: result2.messageId,
        response: result2.response
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
      if (shouldEmitUnsubscribe(emailData)) {
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
      if (shouldEmitUnsubscribe(emailData)) {
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
      const result2 = await response.json();
      strapi2.log.info("[magic-mail] [SUCCESS] Email sent via Mailgun API");
      return {
        messageId: result2.id || `mailgun-${Date.now()}`,
        response: result2.message || "Queued"
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
   * Validates and sanitizes email content against common attack classes:
   * - Header injection (CR/LF in subject, recipients, replyTo, from)
   * - Dangerous HTML (`<script>`, `<iframe>`, `javascript:`, inline event handlers)
   * - Missing subject / missing content
   *
   * Mutates `emailData` in place by stripping CR/LF from string header fields.
   * Uses `sanitize-html` when available for deep HTML cleaning; otherwise
   * falls back to conservative regex-based checks that BLOCK unsafe content.
   *
   * @param {object} emailData - Email data to validate (mutated)
   * @throws {Error} When validation fails
   */
  validateEmailSecurity(emailData) {
    const headerFields = ["subject", "from", "replyTo"];
    for (const field of headerFields) {
      if (typeof emailData[field] === "string") {
        emailData[field] = stripHeaderInjection(emailData[field]);
      }
    }
    const sanitizeAddrList = (value) => {
      if (Array.isArray(value)) {
        return value.map((v) => typeof v === "string" ? stripHeaderInjection(v) : v).filter((v) => typeof v === "string" && v.length > 0);
      }
      if (typeof value === "string") {
        return stripHeaderInjection(value);
      }
      return value;
    };
    emailData.to = sanitizeAddrList(emailData.to);
    emailData.cc = sanitizeAddrList(emailData.cc);
    emailData.bcc = sanitizeAddrList(emailData.bcc);
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
      let sanitizeHtml = null;
      try {
        sanitizeHtml = requireSanitizeHtml();
      } catch {
        sanitizeHtml = null;
      }
      if (sanitizeHtml) {
        emailData.html = sanitizeHtml(html, {
          allowedTags: [
            "html",
            "body",
            "head",
            "title",
            "meta",
            "div",
            "span",
            "p",
            "br",
            "hr",
            "a",
            "img",
            "h1",
            "h2",
            "h3",
            "h4",
            "h5",
            "h6",
            "strong",
            "em",
            "b",
            "i",
            "u",
            "ul",
            "ol",
            "li",
            "table",
            "thead",
            "tbody",
            "tr",
            "td",
            "th",
            "blockquote",
            "code",
            "pre"
          ],
          allowedAttributes: {
            "*": ["style", "class", "id"],
            a: ["href", "title", "target", "rel"],
            img: ["src", "alt", "width", "height"],
            table: ["border", "cellspacing", "cellpadding", "width"],
            td: ["colspan", "rowspan", "align", "valign", "width"],
            th: ["colspan", "rowspan", "align", "valign", "width"],
            meta: ["name", "content", "http-equiv", "charset"]
          },
          allowedSchemes: ["http", "https", "mailto", "cid"],
          allowedSchemesAppliedToAttributes: ["href", "src", "cite"],
          allowProtocolRelative: false,
          disallowedTagsMode: "discard"
        });
      } else {
        const dangerousPatterns = [
          { pattern: /<script\b[^>]*>[\s\S]*?<\/script>/gi, name: "<script> tag" },
          { pattern: /<iframe\b[^>]*>/gi, name: "<iframe> tag" },
          { pattern: /<object\b[^>]*>/gi, name: "<object> tag" },
          { pattern: /<embed\b[^>]*>/gi, name: "<embed> tag" },
          { pattern: /<form\b[^>]*>/gi, name: "<form> tag" },
          { pattern: /\son[a-z]+\s*=/gi, name: "inline event handler" },
          { pattern: /javascript\s*:/gi, name: "javascript: URI" },
          { pattern: /vbscript\s*:/gi, name: "vbscript: URI" },
          { pattern: /data\s*:\s*text\/html/gi, name: "data:text/html URI" }
        ];
        for (const { pattern, name } of dangerousPatterns) {
          if (pattern.test(html)) {
            throw new Error(`Email HTML contains a dangerous ${name}. Install 'sanitize-html' to accept richer HTML content.`);
          }
        }
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
    if (shouldEmitUnsubscribe(emailData)) {
      headers["List-Unsubscribe"] = `<${emailData.unsubscribeUrl}>`;
      headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
    } else if (emailData.type === "marketing") {
      strapi2.log.warn("[magic-mail] Marketing email without unsubscribe URL - may violate regulations");
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
    const result2 = await whatsapp2.sendMessage(cleanPhone, finalMessage);
    if (result2.success) {
      strapi2.log.info(`[magic-mail] [SUCCESS] WhatsApp message sent to ${cleanPhone}`);
      return {
        success: true,
        channel: "whatsapp",
        phoneNumber: cleanPhone,
        jid: result2.jid
      };
    } else {
      strapi2.log.error(`[magic-mail] [ERROR] WhatsApp send failed: ${result2.error}`);
      throw new Error(result2.error || "Failed to send WhatsApp message");
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
      const result2 = await this.send({
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
        ...result2,
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
const { encryptCredentials: encryptCredentials$1, decryptCredentials } = requireEncryption();
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
    let encryptedConfig = existingAccount.config;
    if (config2) {
      let existingPlain = {};
      if (existingAccount.config) {
        try {
          existingPlain = decryptCredentials(existingAccount.config) || {};
        } catch (err) {
          strapi2.log.warn(
            `[magic-mail] updateAccount: existing credentials for account "${existingAccount.accountName || existingAccount.id}" could not be decrypted (${err.message}). Treating as empty — admin must re-enter all secrets in this PUT.`
          );
          existingPlain = {};
        }
      }
      const merged = this._mergeMaskedConfig(existingPlain, config2);
      encryptedConfig = encryptCredentials$1(merged);
    }
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
   * Get a single account with its config prepared for the edit UI.
   *
   * Secret fields (clientSecret, apiKey, SMTP pass, etc.) are returned in
   * a masked form like `****5bf3`. This lets the edit form render placeholders
   * indicating "a secret is stored" without ever shipping the plaintext to
   * the browser. To rotate a secret the admin supplies a new value; if they
   * leave the field as the mask, the server preserves the existing ciphertext
   * (handled in updateAccount).
   *
   * Non-secret fields (host, port, user, clientId, tenantId, domain, region…)
   * are returned in clear so the form is useful.
   *
   * @param {string|number} idOrDocumentId
   * @returns {Promise<object>}
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
    const maskedConfig = this._maskSecrets(decryptedConfig || {});
    return {
      ...account,
      config: maskedConfig
    };
  },
  /**
   * Returns an account record in a shape suitable for the edit-form UI.
   *
   * SECURITY NOTE: This helper is the ONLY place where a decrypt failure
   * is turned into a soft result instead of an exception. The strict
   * `getAccountWithDecryptedConfig` stays untouched — the email-router
   * must NEVER be allowed to send mail with partial/empty credentials,
   * because a DB-write attacker could otherwise corrupt ciphertext and
   * force the router into a `if (!config) ... ` branch. The admin UI
   * doesn't have that problem: we only paint the form, and the user
   * decides whether to re-enter the credentials.
   *
   * Returns the account with:
   *   - `config`: the masked decrypted config on success, `{}` otherwise;
   *   - `credentialsUnreadable`: `true` iff decryption threw (usually
   *     because the MAGIC_MAIL_ENCRYPTION_KEY env var changed since the
   *     account was stored).
   *
   * @param {string|number} idOrDocumentId
   * @returns {Promise<object>}
   */
  async getAccountForDisplay(idOrDocumentId) {
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
    let maskedConfig = {};
    let credentialsUnreadable = false;
    let credentialsUnreadableReason = null;
    if (account.config) {
      try {
        const decryptedConfig = decryptCredentials(account.config);
        maskedConfig = this._maskSecrets(decryptedConfig || {});
      } catch (err) {
        credentialsUnreadable = true;
        credentialsUnreadableReason = err.message;
        strapi2.log.warn(
          `[magic-mail] Credentials for account "${account.accountName || account.id}" could not be decrypted: ${err.message}. The encryption key likely changed since the account was saved — the admin must re-enter the secrets to restore it.`
        );
      }
    }
    return {
      ...account,
      config: maskedConfig,
      credentialsUnreadable,
      credentialsUnreadableReason
    };
  },
  /**
   * Known secret field names across all supported providers. Matching is
   * case-insensitive so we also catch `ClientSecret`, `API_KEY`, etc.
   */
  _SECRET_FIELDS: [
    "clientSecret",
    "client_secret",
    "apiKey",
    "api_key",
    "pass",
    "password",
    "privateKey",
    "private_key",
    "secret",
    "dkim",
    "refreshToken",
    "refresh_token",
    "accessToken",
    "access_token"
  ],
  /**
   * Produces a short, non-reversible tag for a secret so the UI can
   * display a placeholder without the plaintext. Format: ****<last 4>.
   * Returns a generic placeholder if the value is shorter than 6 chars.
   *
   * @param {string} value
   * @returns {string}
   */
  _maskSecret(value) {
    if (typeof value !== "string") return "****";
    const trimmed = value.trim();
    if (trimmed.length < 6) return "****";
    return `****${trimmed.slice(-4)}`;
  },
  /**
   * Returns a shallow copy of `config` where every known secret field is
   * replaced with its masked form. Handles nested `dkim` object specially.
   *
   * @param {object} config
   * @returns {object}
   */
  _maskSecrets(config2) {
    const out = { ...config2 };
    for (const key of Object.keys(out)) {
      const lower = key.toLowerCase();
      const isSecret = this._SECRET_FIELDS.some((f) => f.toLowerCase() === lower);
      if (isSecret && out[key]) {
        if (typeof out[key] === "string") {
          out[key] = this._maskSecret(out[key]);
        } else if (typeof out[key] === "object") {
          out[key] = this._maskSecrets(out[key]);
        }
      }
    }
    return out;
  },
  /**
   * Detects whether a string looks like the mask produced by _maskSecret.
   * Safe against ambiguity — the mask is always `****<4 hex-ish chars>`,
   * a pattern that real secrets almost never start with.
   *
   * @param {string} value
   * @returns {boolean}
   */
  _looksMasked(value) {
    return typeof value === "string" && /^\*{4,}/.test(value);
  },
  /**
   * Returns a merged config for updateAccount: every field from `incoming`
   * wins EXCEPT when its value is the mask placeholder (`****…`), in which
   * case the original `existingPlain` value is kept. This lets the edit
   * form round-trip without the admin re-typing every secret.
   *
   * @param {object} existingPlain - The decrypted config currently stored
   * @param {object} incoming - The config payload from the PUT request
   * @returns {object} Merged config ready for encryptCredentials()
   */
  _mergeMaskedConfig(existingPlain, incoming) {
    const out = { ...existingPlain, ...incoming };
    for (const [key, value] of Object.entries(incoming)) {
      const lower = key.toLowerCase();
      const isSecret = this._SECRET_FIELDS.some((f) => f.toLowerCase() === lower);
      if (isSecret && this._looksMasked(value)) {
        out[key] = existingPlain[key];
      } else if (isSecret && value && typeof value === "object" && typeof existingPlain[key] === "object") {
        out[key] = this._mergeMaskedConfig(existingPlain[key] || {}, value);
      }
    }
    return out;
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
const { encryptCredentials } = requireEncryption();
var oauth$1 = ({ strapi: strapi2 }) => ({
  /**
   * Builds the Gmail OAuth2 authorize URL.
   *
   * @param {string} clientId - OAuth Client ID (from UI, not .env!)
   * @param {string} state - State parameter for CSRF protection
   * @param {object} [options]
   * @param {string} [options.codeChallenge] - PKCE S256 challenge
   * @param {string} [options.codeChallengeMethod] - 'S256'
   * @returns {string}
   */
  getGmailAuthUrl(clientId, state, options2 = {}) {
    const redirectUri = `${process.env.URL || "http://localhost:1337"}/magic-mail/oauth/gmail/callback`;
    if (!clientId) {
      throw new Error("Client ID is required for OAuth");
    }
    const scopes = [
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/userinfo.email",
      "openid"
    ].join(" ");
    let authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scopes)}&access_type=offline&prompt=consent&state=${encodeURIComponent(state)}`;
    if (options2.codeChallenge) {
      authUrl += `&code_challenge=${encodeURIComponent(options2.codeChallenge)}`;
      authUrl += `&code_challenge_method=${encodeURIComponent(options2.codeChallengeMethod || "S256")}`;
    }
    return authUrl;
  },
  /**
   * Exchanges a Gmail OAuth authorization code for tokens.
   *
   * @param {string} code
   * @param {string} clientId
   * @param {string} clientSecret
   * @param {object} [options]
   * @param {string} [options.codeVerifier] - PKCE code_verifier (required when PKCE was used)
   * @returns {Promise<{email: string, accessToken: string, refreshToken?: string, expiresAt: Date}>}
   * @throws {Error} When the token exchange fails or userinfo is missing
   */
  async exchangeGoogleCode(code, clientId, clientSecret, options2 = {}) {
    const redirectUri = `${process.env.URL || "http://localhost:1337"}/magic-mail/oauth/gmail/callback`;
    strapi2.log.info("[magic-mail] Exchanging OAuth code for tokens...");
    strapi2.log.info(`[magic-mail] Client ID: ${clientId.substring(0, 20)}...`);
    strapi2.log.info(`[magic-mail] Redirect URI: ${redirectUri}`);
    const bodyParams = {
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code"
    };
    if (options2.codeVerifier) {
      bodyParams.code_verifier = options2.codeVerifier;
    }
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(bodyParams)
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
  /**
   * Builds the Microsoft Identity Platform authorize URL.
   *
   * @param {string} clientId
   * @param {string} tenantId
   * @param {string} state
   * @param {object} [options]
   * @param {string} [options.codeChallenge]
   * @param {string} [options.codeChallengeMethod]
   * @returns {string}
   */
  getMicrosoftAuthUrl(clientId, tenantId, state, options2 = {}) {
    const redirectUri = `${process.env.URL || "http://localhost:1337"}/magic-mail/oauth/microsoft/callback`;
    if (!clientId) {
      throw new Error("Client ID is required for Microsoft OAuth");
    }
    if (!tenantId) {
      throw new Error("Tenant ID is required for Microsoft OAuth");
    }
    const scopes = [
      "https://graph.microsoft.com/Mail.Send",
      "https://graph.microsoft.com/User.Read",
      "offline_access",
      "openid",
      "email"
    ].join(" ");
    let authUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scopes)}&response_mode=query&prompt=consent&state=${encodeURIComponent(state)}`;
    if (options2.codeChallenge) {
      authUrl += `&code_challenge=${encodeURIComponent(options2.codeChallenge)}`;
      authUrl += `&code_challenge_method=${encodeURIComponent(options2.codeChallengeMethod || "S256")}`;
    }
    strapi2.log.info(`[magic-mail] Microsoft OAuth URL: Using tenant ${tenantId}`);
    return authUrl;
  },
  /**
   * Exchanges a Microsoft OAuth authorization code for tokens.
   *
   * @param {string} code
   * @param {string} clientId
   * @param {string} clientSecret
   * @param {string} tenantId
   * @param {object} [options]
   * @param {string} [options.codeVerifier] - PKCE verifier (required when PKCE was used)
   * @returns {Promise<object>}
   */
  async exchangeMicrosoftCode(code, clientId, clientSecret, tenantId, options2 = {}) {
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
    const bodyParams = {
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      scope: "https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/User.Read offline_access"
    };
    if (options2.codeVerifier) {
      bodyParams.code_verifier = options2.codeVerifier;
    }
    const response = await fetch(tokenEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(bodyParams)
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
   * Builds the Yahoo OAuth2 authorize URL.
   *
   * @param {string} clientId
   * @param {string} state
   * @param {object} [options]
   * @param {string} [options.codeChallenge]
   * @param {string} [options.codeChallengeMethod]
   * @returns {string}
   */
  getYahooAuthUrl(clientId, state, options2 = {}) {
    const redirectUri = `${process.env.URL || "http://localhost:1337"}/magic-mail/oauth/yahoo/callback`;
    if (!clientId) {
      throw new Error("Client ID is required for Yahoo OAuth");
    }
    const scopes = [
      "mail-w",
      "sdps-r"
    ].join(" ");
    let authUrl = `https://api.login.yahoo.com/oauth2/request_auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scopes)}&state=${encodeURIComponent(state)}`;
    if (options2.codeChallenge) {
      authUrl += `&code_challenge=${encodeURIComponent(options2.codeChallenge)}`;
      authUrl += `&code_challenge_method=${encodeURIComponent(options2.codeChallengeMethod || "S256")}`;
    }
    return authUrl;
  },
  /**
   * Exchanges a Yahoo OAuth authorization code for tokens.
   *
   * @param {string} code
   * @param {string} clientId
   * @param {string} clientSecret
   * @param {object} [options]
   * @param {string} [options.codeVerifier] - PKCE verifier (optional)
   * @returns {Promise<object>}
   */
  async exchangeYahooCode(code, clientId, clientSecret, options2 = {}) {
    const redirectUri = `${process.env.URL || "http://localhost:1337"}/magic-mail/oauth/yahoo/callback`;
    strapi2.log.info("[magic-mail] Exchanging Yahoo OAuth code for tokens...");
    strapi2.log.info(`[magic-mail] Client ID: ${clientId.substring(0, 20)}...`);
    strapi2.log.info(`[magic-mail] Redirect URI: ${redirectUri}`);
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const bodyParams = {
      code,
      redirect_uri: redirectUri,
      grant_type: "authorization_code"
    };
    if (options2.codeVerifier) {
      bodyParams.code_verifier = options2.codeVerifier;
    }
    const response = await fetch("https://api.login.yahoo.com/oauth2/get_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `Basic ${basicAuth}`
      },
      body: new URLSearchParams(bodyParams)
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
const version = "2.10.6";
const require$$2 = {
  version
};
const crypto$1 = require$$0$1;
const os = require$$1$4;
const pluginPkg = require$$2;
const { createLogger } = logger;
const LICENSE_SERVER_URL = "https://magicapi.fitlex.me";
const envTimeout = Number(process.env.MAGIC_LICENSE_TIMEOUT_MS);
const DEFAULT_FETCH_TIMEOUT_MS = Number.isFinite(envTimeout) && envTimeout > 0 ? envTimeout : 12e3;
const FETCH_RETRIES = 1;
const FETCH_RETRY_BACKOFF_MS = 750;
async function fetchWithTimeout(url, options2 = {}, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS) {
  let lastError;
  for (let attempt = 0; attempt <= FETCH_RETRIES; attempt++) {
    const controller2 = new AbortController();
    const timer = setTimeout(() => controller2.abort(), timeoutMs);
    try {
      return await fetch(url, { ...options2, signal: controller2.signal });
    } catch (err) {
      lastError = err;
      if (attempt < FETCH_RETRIES) {
        await new Promise((r) => setTimeout(r, FETCH_RETRY_BACKOFF_MS));
        continue;
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}
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
        const response = await fetchWithTimeout(`${licenseServerUrl}/api/licenses/create`, {
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
        const licenseServerUrl = this.getLicenseServerUrl();
        const response = await fetchWithTimeout(`${licenseServerUrl}/api/licenses/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            licenseKey,
            pluginName: "magic-mail",
            productName: "MagicMail - Email Business Suite"
          })
        });
        const data = await response.json();
        if (data.success && data.data) {
          return { valid: true, data: data.data, gracePeriod: false };
        }
        return { valid: false, data: null };
      } catch (error) {
        if (allowGracePeriod) {
          log.info(
            `License server unreachable after retry, continuing on grace period (${error.message})`
          );
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
        const response = await fetchWithTimeout(url, {
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
        const response = await fetchWithTimeout(`${licenseServerUrl}/api/licenses/ping`, {
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
const Mustache = require$$0$5;
const htmlToTextLib = require$$1$5;
const decode = require$$2$2;
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
   * Get template by ID (numeric id or documentId) with populated versions.
   *
   * Numeric IDs are interpreted as `templateReferenceId` first (this is the
   * app-wide convention — see findById() below), then as legacy DB id.
   * Non-numeric strings are treated as Strapi v5 `documentId`s.
   */
  async findOne(idOrDocumentId) {
    const isNumericId = /^\d+$/.test(String(idOrDocumentId));
    if (isNumericId) {
      const result2 = await this.findById(Number(idOrDocumentId));
      if (result2) return result2;
    }
    return strapi2.documents(EMAIL_TEMPLATE_UID).findOne({
      documentId: String(idOrDocumentId),
      populate: { versions: true }
    });
  },
  /**
   * Get template by numeric ID.
   *
   * CONTRACT — every HTTP route that carries `:id` (admin UI, REST callers,
   * magic-link's `magic_mail_template_id`, Strapi's own test-send) refers to
   * the user-visible `templateReferenceId`. That is what `TemplateList`
   * navigates with, what `EditorPage` reads from `useParams()`, and what the
   * `findAll()` response surfaces as `templateReferenceId` (alongside `.id`).
   *
   * So: we resolve the reference id FIRST. The DB id is only kept as a
   * best-effort fallback for very old installs that might have persisted
   * the Strapi primary key as their template key before the reference id
   * was introduced. Collisions between the two ID spaces are prevented on
   * create() (refId uniqueness is enforced there).
   *
   * We intentionally do NOT spam warn-logs in the success path: the
   * reference-id lookup IS the primary path.
   */
  async findById(id) {
    const numericId = Number(id);
    strapi2.log.info(`[magic-mail] [LOOKUP] Finding template by ID: ${numericId}`);
    const byRefId = await strapi2.documents(EMAIL_TEMPLATE_UID).findMany({
      filters: { templateReferenceId: numericId },
      limit: 1,
      populate: { versions: true }
    });
    if (byRefId.length > 0) {
      strapi2.log.info(
        `[magic-mail] [SUCCESS] Found template by templateReferenceId ${numericId}: documentId=${byRefId[0].documentId}, name="${byRefId[0].name}"`
      );
      return byRefId[0];
    }
    let byInternalId = null;
    try {
      byInternalId = await strapi2.entityService.findOne(EMAIL_TEMPLATE_UID, numericId, {
        populate: { versions: true }
      });
    } catch (err) {
      strapi2.log.debug(`[magic-mail] [LOOKUP] entityService.findOne(${numericId}) threw: ${err.message}`);
    }
    if (byInternalId) {
      strapi2.log.info(
        `[magic-mail] [LEGACY-LOOKUP] No templateReferenceId=${numericId}; resolved via internal DB id=${numericId} → "${byInternalId.name}" (documentId=${byInternalId.documentId}). Consider storing the template's templateReferenceId (${byInternalId.templateReferenceId ?? "none set"}) instead of its DB id to keep callers stable across migrations.`
      );
      return byInternalId;
    }
    strapi2.log.warn(`[magic-mail] [WARNING] Template with ID ${numericId} not found (tried templateReferenceId and internal DB id)`);
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
    const result2 = await strapi2.documents(EMAIL_TEMPLATE_UID).delete({
      documentId: actualDocumentId
    });
    strapi2.log.info(`[magic-mail] [SUCCESS] Template "${template.name}" and ${allVersions.length} versions deleted`);
    return result2;
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
const crypto = require$$0$1;
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
    let result2 = html;
    for (const replacement of replacements) {
      const escapedFrom = replacement.from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const escapedFromEncoded = replacement.from.replace(/&/g, "&amp;").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const hrefRegex = new RegExp(`(href\\s*=\\s*["'])${escapedFrom}(["'])`, "gi");
      const hrefRegexEncoded = new RegExp(`(href\\s*=\\s*["'])${escapedFromEncoded}(["'])`, "gi");
      result2 = result2.replace(hrefRegex, `$1${replacement.to}$2`);
      result2 = result2.replace(hrefRegexEncoded, `$1${replacement.to}$2`);
    }
    if (linkCount > 0) {
      strapi2.log.info(`[magic-mail] [SUCCESS] Rewrote ${linkCount} links for click tracking`);
    } else {
      strapi2.log.warn(`[magic-mail] [WARNING] No links found in email HTML for tracking!`);
      strapi2.log.debug(`[magic-mail] [DEBUG] HTML preview: ${html.substring(0, 500)}...`);
    }
    return result2;
  },
  /**
   * Persists a link mapping used for click tracking. Validates the URL
   * protocol at storage time so nothing unsafe can be persisted even when a
   * future caller bypasses the rewrite helper.
   *
   * @param {string} emailLogDocId
   * @param {string} linkHash
   * @param {string} originalUrl
   * @returns {Promise<object>}
   * @throws {Error} When the URL is not an http(s) absolute URL
   */
  async storeLinkMapping(emailLogDocId, linkHash, originalUrl) {
    try {
      if (typeof originalUrl !== "string" || originalUrl.trim().length === 0) {
        throw new Error("originalUrl is required");
      }
      let parsed;
      try {
        parsed = new URL(originalUrl);
      } catch {
        throw new Error(`Invalid originalUrl (not a valid absolute URL): ${originalUrl.substring(0, 200)}`);
      }
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error(`Disallowed URL protocol "${parsed.protocol}" for tracking link`);
      }
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
const path = require$$1$3;
const fs = require$$0$3;
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
          const resolveOnce = (result2) => {
            if (!resolved) {
              resolved = true;
              resolve(result2);
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
        const [result2] = await sock.onWhatsApp(formattedNumber);
        return {
          success: true,
          exists: result2?.exists || false,
          jid: result2?.jid
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
            enableUnsubscribeHeader: true,
            trackingFallbackUrl: null
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
        enableUnsubscribeHeader: true,
        trackingFallbackUrl: null
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
        unsubscribeUrl: data.unsubscribeUrl?.trim() || null,
        trackingFallbackUrl: data.trackingFallbackUrl?.trim() || null
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
            enableUnsubscribeHeader: sanitizedData.enableUnsubscribeHeader ?? true,
            trackingFallbackUrl: sanitizedData.trackingFallbackUrl
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
export {
  index as default
};
