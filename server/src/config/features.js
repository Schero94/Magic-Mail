/**
 * MagicMail Feature Definitions
 * Defines which features are available for each license tier
 */

module.exports = {
  // FREE/DEMO Features
  free: {
    maxAccounts: 3, // 3 Accounts (can be OAuth!)
    maxRoutingRules: 5,
    maxEmailTemplates: 25, // 25 Templates - Genug zum Testen & kleine Projekte!
    providers: ['smtp', 'gmail-oauth', 'microsoft-oauth', 'yahoo-oauth'], // Alle Provider erlaubt!
    features: [
      'basic-smtp',
      'oauth-gmail',
      'oauth-microsoft',
      'oauth-yahoo',
      'basic-routing',
      'email-logging',
      'account-testing',
      'strapi-service-override',
      'email-designer-basic', // Basic Email Designer
      'email-designer-import-export', // Import/Export auch in Free! (Community-freundlich)
    ],
  },

  // PREMIUM Features
  premium: {
    maxAccounts: 10, // 10 Accounts - Perfekt für kleine Teams
    maxRoutingRules: 20,
    maxEmailTemplates: 100, // 100 Templates - Mehr als genug für die meisten Projekte
    providers: ['smtp', 'gmail-oauth', 'microsoft-oauth', 'yahoo-oauth'],
    features: [
      'basic-smtp',
      'basic-routing',
      'email-logging',
      'oauth-gmail',
      'oauth-microsoft',
      'oauth-yahoo',
      'account-testing',
      'strapi-service-override',
      'email-designer-basic',
      'email-designer-templates',
      'email-designer-import-export',
      'email-designer-versioning', // NEU in Premium: Versionierung!
      'analytics-basic', // Basic Analytics
    ],
  },

  // ADVANCED Features
  advanced: {
    maxAccounts: -1, // Unlimited
    maxRoutingRules: -1, // Unlimited
    maxEmailTemplates: 500, // 500 Templates - Für größere Projekte
    providers: ['smtp', 'gmail-oauth', 'microsoft-oauth', 'yahoo-oauth', 'sendgrid', 'mailgun'],
    features: [
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
      'analytics-dashboard',
      'advanced-routing',
      'account-testing',
      'strapi-service-override',
      'email-designer-basic', // NEW
      'email-designer-templates', // NEW
      'email-designer-versioning', // NEW: Template Versioning
      'email-designer-import-export', // NEW: Import/Export
    ],
  },

  // ENTERPRISE Features
  enterprise: {
    maxAccounts: -1, // Unlimited
    maxRoutingRules: -1, // Unlimited
    maxEmailTemplates: -1, // Unlimited Templates - Keine Limits!
    providers: ['smtp', 'gmail-oauth', 'microsoft-oauth', 'yahoo-oauth', 'sendgrid', 'mailgun'],
    features: [
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
      'analytics-dashboard',
      'advanced-routing',
      'multi-tenant',
      'compliance-reports',
      'custom-security-rules',
      'priority-support',
      'account-testing',
      'strapi-service-override',
      'email-designer-basic', // NEW
      'email-designer-templates', // NEW
      'email-designer-versioning', // NEW
      'email-designer-import-export', // NEW
      'email-designer-custom-blocks', // NEW: Custom Blocks
      'email-designer-team-library', // NEW: Team Library
      'email-designer-a-b-testing', // NEW: A/B Testing
    ],
  },

  /**
   * Check if a feature is available for given license tier
   */
  hasFeature(licenseData, featureName) {
   /** console.log(`[features.js] [CHECK] hasFeature called with:`, { 
      featureName, 
      hasLicenseData: !!licenseData,
      licenseDataKeys: licenseData ? Object.keys(licenseData) : [],
      featuresObject: licenseData?.features,
      tier: licenseData?.tier,
      // Show actual feature flag values
      featureAdvanced: licenseData?.featureAdvanced,
      featureEnterprise: licenseData?.featureEnterprise,
      featurePremium: licenseData?.featurePremium,
    });
 */
    if (!licenseData) {
      // Demo mode - only free features
      return this.free.features.includes(featureName);
    }

    // Determine tier: check multiple possible formats
    let isEnterprise = false;
    let isAdvanced = false;
    let isPremium = false;

    // Check tier field directly
    if (licenseData.tier) {
      isEnterprise = licenseData.tier === 'enterprise';
      isAdvanced = licenseData.tier === 'advanced';
      isPremium = licenseData.tier === 'premium';
    }

    // Check features object (for backward compatibility)
    if (licenseData.features) {
      isEnterprise = isEnterprise || licenseData.features.enterprise === true;
      isAdvanced = isAdvanced || licenseData.features.advanced === true;
      isPremium = isPremium || licenseData.features.premium === true;
    }

    // Check feature flags directly on licenseData (magicapi format)
    // These are boolean fields from the API
    if (licenseData.featureEnterprise === true) {
      isEnterprise = true;
    }
    if (licenseData.featureAdvanced === true) {
      isAdvanced = true;
    }
    if (licenseData.featurePremium === true) {
      isPremium = true;
    }

/*    console.log(`[features.js] [CHECK] Tier detection:`, {
      isEnterprise,
      isAdvanced,
      isPremium,
      tierField: licenseData.tier,
      featureAdvanced: licenseData.featureAdvanced,
      featureEnterprise: licenseData.featureEnterprise,
      featurePremium: licenseData.featurePremium,
      featuresAdvanced: licenseData.features?.advanced,
      featuresEnterprise: licenseData.features?.enterprise,
      featuresPremium: licenseData.features?.premium,
    });
 */
    // Check tiers in order: enterprise > advanced > premium > free
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
    
    // Check both formats: features object and direct feature flags
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
    
    // Check both formats: features object and direct feature flags
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
    
    // Check both formats: features object and direct feature flags
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
    
    // Check both formats: features object and direct feature flags
    if (licenseData.featureEnterprise === true || licenseData.features?.enterprise === true) return this.enterprise.maxEmailTemplates;
    if (licenseData.featureAdvanced === true || licenseData.features?.advanced === true) return this.advanced.maxEmailTemplates;
    if (licenseData.featurePremium === true || licenseData.features?.premium === true) return this.premium.maxEmailTemplates;
    
    return this.free.maxEmailTemplates;
  },
};

