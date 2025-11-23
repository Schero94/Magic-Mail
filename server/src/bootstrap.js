'use strict';

/**
 * Bootstrap: Initialize MagicMail plugin
 * Sets up email account counter resets and health checks
 * OVERRIDES Strapi's native email service with MagicMail router
 */

module.exports = async ({ strapi }) => {
  strapi.log.info('🚀 [magic-mail] Bootstrap starting...');

  try {
    // Initialize License Guard
    const licenseGuardService = strapi.plugin('magic-mail').service('license-guard');
    
    // Wait a bit for all services to be ready
    setTimeout(async () => {
      const licenseStatus = await licenseGuardService.initialize();
      
      if (!licenseStatus.valid && licenseStatus.demo) {
        strapi.log.error('╔════════════════════════════════════════════════════════════════╗');
        strapi.log.error('║  ❌ MAGICMAIL - NO VALID LICENSE                              ║');
        strapi.log.error('║                                                                ║');
        strapi.log.error('║  This plugin requires a valid license to operate.             ║');
        strapi.log.error('║  Please activate your license via Admin UI:                   ║');
        strapi.log.error('║  Go to MagicMail → License tab                                ║');
        strapi.log.error('║                                                                ║');
        strapi.log.error('║  Click "Generate Free License" to get started!                ║');
        strapi.log.error('╚════════════════════════════════════════════════════════════════╝');
      } else if (licenseStatus.gracePeriod) {
        strapi.log.warn('⚠️  Running on grace period (license server unreachable)');
      }
      // No additional log here, as initialize() already outputs the license box
    }, 2000);

    const accountManager = strapi.plugin('magic-mail').service('account-manager');
    const emailRouter = strapi.plugin('magic-mail').service('email-router');

    // ============================================================
    // OVERRIDE STRAPI'S NATIVE EMAIL SERVICE
    // ============================================================
    
    // Try to get email service (support both v4 and v5 APIs)
    const originalEmailService = strapi.plugin('email')?.service?.('email') || 
                                  strapi.plugins?.email?.services?.email;
    
    if (originalEmailService && originalEmailService.send) {
      const originalSend = originalEmailService.send.bind(originalEmailService);
      
      // Override the send method
      originalEmailService.send = async (emailData) => {
        strapi.log.info('[magic-mail] 📧 Email intercepted from native Strapi service');
        strapi.log.debug('[magic-mail] Email data:', {
          to: emailData.to,
          subject: emailData.subject,
          templateId: emailData.templateId,
          hasHtml: !!emailData.html,
          hasText: !!emailData.text,
        });
        
        try {
          // Map 'data' to 'templateData' for backward compatibility
          if (emailData.data && !emailData.templateData) {
            emailData.templateData = emailData.data;
          }
          
          // Route through MagicMail
          const result = await emailRouter.send(emailData);
          
          strapi.log.info('[magic-mail] ✅ Email routed successfully through MagicMail');
          return result;
        } catch (magicMailError) {
          strapi.log.warn('[magic-mail] ⚠️  MagicMail routing failed, falling back to original service');
          strapi.log.error('[magic-mail] Error:', magicMailError.message);
          
          // Fallback to original Strapi email service
          return await originalSend(emailData);
        }
      };
      
      strapi.log.info('[magic-mail] ✅ Native email service overridden!');
      strapi.log.info('[magic-mail] 💡 All strapi.plugins.email.services.email.send() calls will route through MagicMail');
    } else {
      strapi.log.warn('[magic-mail] ⚠️  Native email service not found - MagicMail will work standalone');
      strapi.log.warn('[magic-mail] 💡 Make sure @strapi/plugin-email is installed');
    }

    // ============================================================
    // COUNTER RESET SCHEDULES
    // ============================================================

    // Reset hourly counters every hour
    const hourlyResetInterval = setInterval(async () => {
      try {
        if (!strapi || !strapi.plugin) {
          console.warn('[magic-mail] Strapi not available for hourly reset');
          return;
        }
        const accountMgr = strapi.plugin('magic-mail').service('account-manager');
        await accountMgr.resetCounters('hourly');
        strapi.log.info('[magic-mail] ✅ Hourly counters reset');
      } catch (err) {
        console.error('[magic-mail] Hourly reset error:', err.message);
      }
    }, 60 * 60 * 1000); // Every hour
    
    // Store interval for cleanup
    if (!global.magicMailIntervals) global.magicMailIntervals = {};
    global.magicMailIntervals.hourly = hourlyResetInterval;

    // Reset daily counters at midnight
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
    const msUntilMidnight = midnight - now;

    setTimeout(async () => {
      try {
        if (!strapi || !strapi.plugin) {
          console.warn('[magic-mail] Strapi not available for daily reset');
          return;
        }
        const accountMgr = strapi.plugin('magic-mail').service('account-manager');
        await accountMgr.resetCounters('daily');
        strapi.log.info('[magic-mail] ✅ Daily counters reset');

        // Then set daily interval
        const dailyResetInterval = setInterval(async () => {
          try {
            if (!strapi || !strapi.plugin) {
              console.warn('[magic-mail] Strapi not available for daily reset');
              return;
            }
            const accountMgr = strapi.plugin('magic-mail').service('account-manager');
            await accountMgr.resetCounters('daily');
            strapi.log.info('[magic-mail] ✅ Daily counters reset');
          } catch (err) {
            console.error('[magic-mail] Daily reset error:', err.message);
          }
        }, 24 * 60 * 60 * 1000); // Every 24 hours
        
        // Store interval for cleanup
        global.magicMailIntervals.daily = dailyResetInterval;
      } catch (err) {
        console.error('[magic-mail] Initial daily reset error:', err.message);
      }
    }, msUntilMidnight);

    strapi.log.info('[magic-mail] ✅ Counter reset schedules initialized');
    strapi.log.info('[magic-mail] ✅ Bootstrap complete');
  } catch (err) {
    strapi.log.error('[magic-mail] ❌ Bootstrap error:', err);
  }
};
