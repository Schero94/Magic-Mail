/**
 * MagicMail Feature Definitions
 *
 * MagicMail is free & fully unlocked — just like Magic Link. Every tier
 * grants unlimited usage with every feature and provider enabled, and all
 * gate helpers below always resolve to "allowed".
 *
 * The per-tier objects are kept (and intentionally identical) so existing
 * callers such as `features[tier]` and the license `getLimits` endpoint keep
 * returning a complete, unlimited feature list regardless of detected tier.
 */

const ALL_PROVIDERS = [
  'smtp',
  'gmail-oauth',
  'microsoft-oauth',
  'yahoo-oauth',
  'sendgrid',
  'mailgun',
];

const ALL_FEATURES = [
  'basic-smtp',
  'basic-routing',
  'email-logging',
  'oauth-gmail',
  'oauth-microsoft',
  'oauth-yahoo',
  'sendgrid',
  'mailgun',
  'dkim-signing',
  'priority-headers',
  'list-unsubscribe',
  'security-validation',
  'analytics-basic',
  'analytics-dashboard',
  'advanced-routing',
  'multi-tenant',
  'compliance-reports',
  'custom-security-rules',
  'priority-support',
  'account-testing',
  'strapi-service-override',
  'email-designer-basic',
  'email-designer-templates',
  'email-designer-versioning',
  'email-designer-import-export',
  'email-designer-custom-blocks',
  'email-designer-team-library',
  'email-designer-a-b-testing',
];

// One unlocked tier definition reused for every tier name. `-1` = unlimited.
const UNLOCKED_TIER = {
  maxAccounts: -1,
  maxRoutingRules: -1,
  maxEmailTemplates: -1,
  providers: ALL_PROVIDERS,
  features: ALL_FEATURES,
};

module.exports = {
  free: UNLOCKED_TIER,
  premium: UNLOCKED_TIER,
  advanced: UNLOCKED_TIER,
  enterprise: UNLOCKED_TIER,

  /**
   * Whether a feature is available. Always true — MagicMail is fully unlocked.
   */
  hasFeature() {
    return true;
  },

  /**
   * Max allowed accounts. -1 = unlimited.
   */
  getMaxAccounts() {
    return -1;
  },

  /**
   * Max allowed routing rules. -1 = unlimited.
   */
  getMaxRoutingRules() {
    return -1;
  },

  /**
   * Whether an email provider is allowed. Always true.
   */
  isProviderAllowed() {
    return true;
  },

  /**
   * Max allowed email templates. -1 = unlimited.
   */
  getMaxEmailTemplates() {
    return -1;
  },
};
